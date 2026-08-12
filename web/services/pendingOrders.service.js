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
  COUNT_ORDERS_BY_STATUS,
} from "../utils/graphql.queries.js";
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
export const STATUS_FILTERS = ["unfulfilled", "fulfilled", "all"];

/**
 * Shopify's search fragment for each bucket.
 *
 * Partially fulfilled orders sit in both worlds — something shipped, something
 * did not — so they count as unfulfilled work. A merchant looking for "what
 * still needs shipping" means to see them.
 */
const STATUS_QUERY = {
  unfulfilled: "(fulfillment_status:unfulfilled OR fulfillment_status:partial)",
  fulfilled: "fulfillment_status:fulfilled",
  all: "",
};

/** Shopify's per-page maximum for the orders connection. */
const PAGE_SIZE = 250;

/**
 * status:open leaves out cancelled and archived orders. Neither can be
 * fulfilled, and counting them would overstate the work waiting.
 */
const buildQuery = ({ from, to, status }) =>
  [
    `created_at:>='${from}'`,
    `created_at:<='${to}'`,
    "status:open",
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
      partial: [
        `created_at:>='${from}'`,
        `created_at:<='${to}'`,
        "status:open",
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
  };
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
  validateRange,
  STATUS_FILTERS,
  MAX_DAYS_BACK,
};
