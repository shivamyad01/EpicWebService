/**
 * Orders in a date range, bucketed by whether they have shipped.
 *
 * Two jobs. Counting, so the Orders page can say what is in a range before the
 * merchant commits to anything; and listing, so the rows can be shown and
 * written into a spreadsheet with the order numbers already filled in. Typos in
 * hand-typed order numbers are the most common failed row there is, and this is
 * what removes the typing.
 */

import {
  SEARCH_PENDING_ORDERS,
  SEARCH_ORDERS_WITH_TRACKING,
  COUNT_ORDERS_BY_STATUS,
} from "../utils/graphql.queries.js";
import { isDeadFulfillment } from "./fulfillment.service.js";
import config from "../config/index.js";

/**
 * How far back the date picker may reach.
 *
 * Not a preference: read_orders only reaches 60 days. Older orders need the
 * read_all_orders scope, which Shopify grants by review rather than by asking,
 * so a wider range here would return an empty sheet and look like a bug.
 *
 * @see https://shopify.dev/changelog/apps-now-need-shopify-approval-to-read-orders-older-than-60-days
 */
export const MAX_DAYS_BACK = 60;

/** What the caller may ask for. */
export const STATUS_FILTERS = ["unfulfilled", "fulfilled", "untracked", "all"];

/**
 * Buckets that are resolved by reading fulfillments rather than by search alone.
 * The caller needs to know because these are scan-limited — see
 * fetchUntrackedOrders.
 */
export const SCANNED_FILTERS = ["untracked"];

/**
 * Shopify's search fragment for each bucket.
 *
 * Partially fulfilled orders sit in both worlds — something shipped, something
 * did not — so they count as unfulfilled work. A merchant looking for "what
 * still needs shipping" means to see them.
 *
 * `untracked` casts the same net as fulfilled plus partial: a partly shipped
 * order's parcel can be missing tracking just as easily as a fully shipped
 * one's. Which of those orders actually qualifies is decided in
 * fetchUntrackedOrders, because no search filter can answer it.
 */
const STATUS_QUERY = {
  unfulfilled: "(fulfillment_status:unfulfilled OR fulfillment_status:partial)",
  fulfilled: "fulfillment_status:fulfilled",
  untracked: "(fulfillment_status:fulfilled OR fulfillment_status:partial)",
  all: "",
};

/**
 * How each bucket treats archived orders.
 *
 * Shopify archives an order the moment it is fulfilled if the shop has that
 * checkout setting on, which most do — so `status:open` and "fulfilled" are very
 * nearly contradictory. Scoping the shipped buckets that way reported zero
 * fulfilled orders on stores that had fulfilled every one of them, and it would
 * hide exactly the orders this filter exists to surface. Archived orders can
 * still have tracking attached, so they belong here.
 *
 * Outstanding work keeps `status:open`: an archived unfulfilled order has been
 * deliberately set aside, and counting it would overstate what is waiting.
 * Cancelled orders are excluded everywhere — nothing can be shipped or tracked.
 */
const ARCHIVE_SCOPE = {
  unfulfilled: "status:open",
  fulfilled: "-status:cancelled",
  untracked: "-status:cancelled",
  all: "-status:cancelled",
};

const buildQuery = ({ from, to, status }) =>
  [
    `created_at:>='${from}'`,
    `created_at:<='${to}'`,
    ARCHIVE_SCOPE[status] || "-status:cancelled",
    STATUS_QUERY[status] || "",
  ]
    .filter(Boolean)
    .join(" ");

/**
 * How many orders are in the range, split by bucket.
 *
 * One request rather than paging everything: the page only needs numbers to
 * show a summary, and a busy store's month could be thousands of orders.
 *
 * `precision` comes back as EXACT below a threshold and AT_LEAST above it, so a
 * very large count is reported honestly as "1000+" rather than as a number that
 * is quietly wrong.
 *
 * @returns {Promise<{total: object, unfulfilled: object, partial: object, fulfilled: object}>}
 */
export const countOrdersByStatus = async (client, { from, to }) => {
  const response = await client.request(COUNT_ORDERS_BY_STATUS, {
    variables: {
      all: buildQuery({ from, to, status: "all" }),
      unfulfilled: buildQuery({ from, to, status: "unfulfilled" }),
      // A sub-count of unfulfilled ("includes N partly shipped"), so it shares
      // that bucket's scope rather than declaring one of its own.
      partial: [
        `created_at:>='${from}'`,
        `created_at:<='${to}'`,
        ARCHIVE_SCOPE.unfulfilled,
        "fulfillment_status:partial",
      ].join(" "),
      fulfilled: buildQuery({ from, to, status: "fulfilled" }),
    },
  });

  const read = (bucket) => ({
    count: response?.data?.[bucket]?.count ?? 0,
    exact: (response?.data?.[bucket]?.precision ?? "EXACT") === "EXACT",
  });

  return {
    total: read("total"),
    unfulfilled: read("unfulfilled"),
    partial: read("partial"),
    fulfilled: read("fulfilled"),
  };
};

/**
 * The orders themselves, oldest first.
 *
 * Capped at config.fulfillment.maxOrdersPerRequest: a sheet longer than the
 * upload limit could not be sent back, so handing one over would only waste the
 * merchant's time. `truncated` tells the caller to say so.
 *
 * @param {object} client   an Admin GraphQL client
 * @param {string} from     ISO timestamp, start of the range
 * @param {string} to       ISO timestamp, end of the range
 * @param {string} status   one of STATUS_FILTERS
 * @returns {Promise<{orders: Array, truncated: boolean}>}
 */
export const fetchOrdersInRange = async (
  client,
  { from, to, status = "unfulfilled" }
) => {
  const limit = config.fulfillment.maxOrdersPerRequest;
  const query = buildQuery({
    from,
    to,
    status: STATUS_FILTERS.includes(status) ? status : "unfulfilled",
  });

  const orders = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage && orders.length < limit) {
    const response = await client.request(SEARCH_PENDING_ORDERS, {
      variables: { query, cursor },
    });

    const connection = response?.data?.orders;
    if (!connection) break;

    for (const edge of connection.edges || []) {
      const node = edge?.node;
      if (!node) continue;

      orders.push({
        name: node.name,
        createdAt: node.createdAt,
        fulfillmentStatus: node.displayFulfillmentStatus,
      });
    }

    hasNextPage = Boolean(connection.pageInfo?.hasNextPage);
    cursor = connection.pageInfo?.endCursor || null;

    // A page that returns nothing but claims another page would spin forever.
    if (!connection.edges?.length) break;
  }

  return {
    orders: orders.slice(0, limit),
    truncated: hasNextPage && orders.length >= limit,
    scanned: orders.length,
  };
};

/**
 * Shipped orders whose tracking never got added.
 *
 * The gap this closes: an order fulfilled without a tracking number is invisible
 * everywhere else in the app. It is not in "still to fulfil" — it shipped — and
 * in "already fulfilled" it sits among orders that are genuinely finished. The
 * customer has no link to click and nothing says so.
 *
 * These are fixable rather than merely reportable. The sheet download and the
 * bulk upload already handle them end to end: a fulfilled order whose live
 * fulfillment carries no tracking number gets that tracking attached rather than
 * a second fulfillment created (fulfillment.service.js, handleFulfilledOrder).
 * The predicate below is deliberately the same one that path uses — an order is
 * listed only when uploading a row for it would actually do something.
 *
 * Cancelled fulfillments are discarded first. They keep appearing on the order
 * and Shopify will even accept a tracking update on one, which is why the upload
 * path ignores them too: writing to a cancelled fulfillment reports success while
 * the customer still sees nothing.
 *
 * Scan-limited, unavoidably. Shopify's search cannot express "has no tracking",
 * so qualifying orders are found by reading fulfillments a page at a time and the
 * work is proportional to shipped orders in the range, not to matches. It stops
 * at the same limit as the other buckets and reports `truncated` so the caller
 * can say the range was only partly read instead of implying it came up clean.
 *
 * @param {object} client an Admin GraphQL client
 * @param {string} from   ISO timestamp, start of the range
 * @param {string} to     ISO timestamp, end of the range
 * @returns {Promise<{orders: Array, truncated: boolean, scanned: number}>}
 */
export const fetchUntrackedOrders = async (client, { from, to }) => {
  const limit = config.fulfillment.maxOrdersPerRequest;
  const query = buildQuery({ from, to, status: "untracked" });

  const orders = [];
  let scanned = 0;
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage && orders.length < limit && scanned < limit) {
    const response = await client.request(SEARCH_ORDERS_WITH_TRACKING, {
      variables: { query, cursor },
    });

    const connection = response?.data?.orders;
    if (!connection) break;

    for (const edge of connection.edges || []) {
      const node = edge?.node;
      if (!node) continue;

      scanned += 1;

      const live = (node.fulfillments || []).filter((f) => !isDeadFulfillment(f));
      // `some`, not trackingInfo[0]: a shipment can carry several numbers, and one
      // recorded in a later slot still means the customer has something to track.
      const untracked = live.filter(
        (f) => !(f.trackingInfo || []).some((t) => t?.number)
      );

      // Nothing to attach tracking to, or every parcel already has it.
      if (untracked.length === 0) continue;

      // When it shipped, not when it was ordered. A parcel that went out a week
      // ago with no tracking is the urgent one, and its order date may be older
      // still. Falls back to the order date if a fulfillment reports no time.
      const shippedAt = live
        .map((f) => f.createdAt)
        .filter(Boolean)
        .sort()[0];

      orders.push({
        name: node.name,
        createdAt: node.createdAt,
        fulfillmentStatus: node.displayFulfillmentStatus,
        fulfilledAt: shippedAt || node.createdAt,
        // Surfaced so a multi-parcel order reads as more than one missing number.
        untrackedCount: untracked.length,
        fulfillmentCount: live.length,
      });
    }

    hasNextPage = Boolean(connection.pageInfo?.hasNextPage);
    cursor = connection.pageInfo?.endCursor || null;

    // A page that returns nothing but claims another page would spin forever.
    if (!connection.edges?.length) break;
  }

  return {
    orders: orders.slice(0, limit),
    truncated: hasNextPage && (orders.length >= limit || scanned >= limit),
    scanned,
  };
};

/**
 * Fetch whichever bucket was asked for.
 *
 * One entry point so the listing endpoint and the sheet download cannot drift
 * apart about what a status means — the page and the spreadsheet it produces have
 * to hold the same orders.
 */
export const fetchOrdersForStatus = async (client, { from, to, status }) => {
  const wanted = STATUS_FILTERS.includes(status) ? status : "unfulfilled";

  return wanted === "untracked"
    ? fetchUntrackedOrders(client, { from, to })
    : fetchOrdersInRange(client, { from, to, status: wanted });
};

/**
 * Validate the requested range, and say plainly what is wrong with it.
 *
 * Timestamps arrive from the browser, already resolved to the merchant's own
 * timezone — "10 August" means their 10 August, not UTC's. Reading day
 * boundaries off the shop's timezone instead would be one more API call for a
 * distinction almost no merchant would notice.
 *
 * @returns {{from: string, to: string} | {error: string}}
 */
export const validateRange = (fromInput, toInput) => {
  const from = new Date(fromInput);
  const to = new Date(toInput);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { error: "Pick a valid date range." };
  }

  if (from > to) {
    return { error: "The start date is after the end date." };
  }

  const earliest = new Date(Date.now() - MAX_DAYS_BACK * 24 * 60 * 60 * 1000);
  if (from < earliest) {
    return {
      error: `Orders older than ${MAX_DAYS_BACK} days cannot be read. Pick a start date on or after ${earliest.toISOString().slice(0, 10)}.`,
    };
  }

  return { from: from.toISOString(), to: to.toISOString() };
};

export default {
  countOrdersByStatus,
  fetchOrdersInRange,
  fetchUntrackedOrders,
  fetchOrdersForStatus,
  validateRange,
  STATUS_FILTERS,
  SCANNED_FILTERS,
  MAX_DAYS_BACK,
};
