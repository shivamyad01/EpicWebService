/**
 * Fulfillment Service
 * Business logic for order fulfillment operations
 */

import axios from "axios";
import xlsx from "xlsx";
import fs from "fs";
import path from "path";
import { GET_FULFILLMENT_ORDERS, CREATE_FULFILLMENT, SEARCH_ORDER_BY_NAME } from "../utils/graphql.queries.js";
import config from "../config/index.js";

// In-memory store for fulfillment summaries (per shop)
// In production, consider using Redis or database
const fulfillmentSummaries = new Map();

// Rate limiting configuration
const RATE_LIMIT_DELAY = 250; // ms between API calls
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms

/**
 * Sleep utility for rate limiting
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry wrapper for API calls
 */
const withRetry = async (fn, retries = MAX_RETRIES) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRetryable = error.response?.status === 429 || 
                          error.response?.status >= 500 ||
                          error.code === 'ECONNRESET';
      
      if (attempt === retries || !isRetryable) {
        throw error;
      }
      
      // Exponential backoff for rate limits
      const delay = error.response?.status === 429 
        ? RETRY_DELAY * Math.pow(2, attempt) 
        : RETRY_DELAY;
      
      console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
};

/**
 * Where a shop's last report is kept on disk. Shop domains are the only untrusted
 * part of the path, so anything outside a myshopify hostname is stripped.
 */
const reportPath = (shop) =>
  path.join(config.reportDir, `${String(shop).replace(/[^a-zA-Z0-9.-]/g, "_")}.json`);

/**
 * Get the last fulfillment summary for a shop.
 *
 * Falls back to the file on disk: the in-memory copy is gone after any restart or
 * redeploy, which used to leave merchants with "No fulfillment report available"
 * for a run that had actually completed.
 */
export const getLastFulfillmentSummary = (shop) => {
  const cached = fulfillmentSummaries.get(shop);
  if (cached) return cached;

  try {
    const stored = JSON.parse(fs.readFileSync(reportPath(shop), "utf8"));
    if (Array.isArray(stored)) {
      fulfillmentSummaries.set(shop, stored);
      return stored;
    }
  } catch {
    // No saved report for this shop yet
  }

  return [];
};

/**
 * Set the fulfillment summary for a shop, in memory and on disk.
 * A failed write must never fail the fulfillment run that produced the report.
 */
export const setFulfillmentSummary = (shop, summary) => {
  fulfillmentSummaries.set(shop, summary);

  try {
    fs.mkdirSync(config.reportDir, { recursive: true });
    fs.writeFileSync(reportPath(shop), JSON.stringify(summary), "utf8");
  } catch (e) {
    console.warn(`Could not save fulfillment report for ${shop}:`, e.message);
  }
};

/**
 * Turn a spreadsheet cell into the text the merchant meant to type.
 *
 * Digits typed into a General-formatted cell arrive as a JavaScript number, which
 * needs care:
 *  - Never use the cell's *formatted* text (`raw: false`). Excel displays large
 *    numbers in exponent form, so a 13-digit AWB comes back as "1.49123E+12".
 *  - Past 15-16 significant digits the value is already a rounded double, both in
 *    the file and here, so the digits cannot be recovered. Reject rather than ship
 *    a corrupted tracking number.
 *  - A non-integer means the column was formatted as a number and the value is not
 *    an identifier at all.
 */
const cellToText = (value) => {
  if (value === null || value === undefined) return { text: '', error: null };

  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      return { text: String(value), error: `"${value}" is not a whole number` };
    }
    if (!Number.isSafeInteger(value)) {
      return {
        text: '',
        error: `"${value}" has too many digits to read reliably — format the column as Text in Excel and re-enter it`
      };
    }
    return { text: String(value), error: null };
  }

  return { text: String(value).trim(), error: null };
};

/**
 * Pick a column by any of its accepted header spellings, tolerating stray
 * whitespace in the header cell.
 */
const columnPicker = (row) => {
  const byTrimmedKey = new Map(
    Object.keys(row).map((key) => [key.trim().toLowerCase(), key])
  );

  return (...names) => {
    for (const name of names) {
      const key = byTrimmedKey.get(name.trim().toLowerCase());
      if (key !== undefined && row[key] !== '') {
        return row[key];
      }
    }
    return '';
  };
};

const ORDER_HEADERS = ['OrderNumber', 'Name', 'Order Number', 'order_number'];
const NUMBER_HEADERS = ['TrackingNumber', 'Tracking Number', 'tracking_number'];
const COMPANY_HEADERS = ['TrackingCompany', 'Tracking Company', 'tracking_company'];
const URL_HEADERS = ['TrackingUrl', 'Tracking Url', 'Tracking URL', 'tracking_url'];

/**
 * Parse Excel/CSV file and extract order data
 */
export const parseExcelFile = (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // `raw: true` (the default) is deliberate — see cellToText
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

  if (rows.length === 0) {
    throw new Error('Excel file is empty or has no data rows');
  }

  const headers = new Set(
    Object.keys(rows[0]).map((key) => key.trim().toLowerCase())
  );
  const hasColumn = (names) =>
    names.some((name) => headers.has(name.trim().toLowerCase()));

  if (!hasColumn(ORDER_HEADERS)) {
    throw new Error('Missing required column: OrderNumber (or Name, Order Number)');
  }

  if (!hasColumn(NUMBER_HEADERS)) {
    throw new Error('Missing required column: TrackingNumber (or Tracking Number)');
  }

  return rows
    .map((row) => {
      const pick = columnPicker(row);

      const order = cellToText(pick(...ORDER_HEADERS));
      const number = cellToText(pick(...NUMBER_HEADERS));
      const company = cellToText(pick(...COMPANY_HEADERS));
      const url = cellToText(pick(...URL_HEADERS));

      return {
        OrderNumber: order.text,
        // Couriers never use spaces inside an AWB, but merchants paste them in.
        // Left alone they would be percent-encoded into the tracking URL.
        TrackingNumber: number.text.replace(/\s+/g, ''),
        TrackingCompany: company.text || config.defaultTrackingCompany,
        TrackingUrl: url.text,
        parseError:
          (order.error && `Order Number ${order.error}`) ||
          (number.error && `Tracking Number ${number.error}`) ||
          null
      };
    })
    // A row with neither an order nor a tracking number is spreadsheet filler,
    // not a failed fulfillment — reporting it as an error is just noise
    .filter((row) => row.OrderNumber || row.TrackingNumber);
};

/**
 * Extract the Shopify order_number from a sheet value.
 *
 * Only a value that is an optional non-digit prefix followed by a single run of
 * digits ("#1025", "FSL1001", "V-304797") yields a number. Anything with a suffix
 * or a second digit run is ambiguous and returns NaN so that matching falls back
 * to the order name: stripping every non-digit and concatenating turned "#1025-A"
 * into 1025, which could fulfil a different order, and "#1025.0" into 10250.
 */
export const parseOrderNumber = (raw) => {
  const match = /^\D*(\d+)$/.exec(String(raw ?? '').trim());
  return match ? parseInt(match[1], 10) : NaN;
};

/**
 * Clean up temporary file
 */
export const cleanupTempFile = (filePath) => {
  try {
    fs.unlinkSync(filePath);
  } catch (e) {
    console.warn("Failed to delete temp file:", e.message);
  }
};

/**
 * Search for an order using GraphQL, then fetch full details via REST.
 * Tries multiple search strategies to reliably locate orders by name.
 */
export const fetchOrder = async (shop, accessToken, orderName, client) => {
  // Strip the merchant's "#" before rebuilding it. Prefixing unconditionally
  // produced "name:##FSL1001" whenever the sheet already carried a "#", which
  // matches nothing — a wasted search on every single row.
  const bareName = String(orderName || "").trim().replace(/^#+/, "");

  // Extract the numeric portion for fallback search
  const numericPart = bareName.replace(/[^\d]/g, "");

  // Build search queries to try — order matters (most specific first), and
  // duplicates are dropped so no row spends an API call on the same query twice
  const searchQueries = [...new Set([
    `name:#${bareName}`,        // e.g. name:#V-193855
    `name:${bareName}`,         // e.g. name:V-193855
    `#${bareName}`,             // general search: #V-193855
    numericPart,                // general search: 193855
  ].filter(Boolean))];

  let edges = [];

  for (const q of searchQueries) {
    try {
      console.log(`[fetchOrder] Trying GraphQL search: "${q}"`);
      const searchResult = await withRetry(async () => {
        return await client.query({
          data: {
            query: SEARCH_ORDER_BY_NAME,
            variables: { query: q }
          }
        });
      });

      const resultEdges = searchResult.body?.data?.orders?.edges || [];
      console.log(`[fetchOrder] Query "${q}" returned ${resultEdges.length} result(s):`,
        resultEdges.map(e => `${e.node.name} (ID: ${e.node.legacyResourceId})`));

      if (resultEdges.length > 0) {
        edges = resultEdges;
        break; // Found results, stop trying
      }
    } catch (err) {
      console.warn(`[fetchOrder] Search query "${q}" failed:`, err.message);
    }
  }

  if (edges.length === 0) {
    console.warn(`[fetchOrder] No orders found for "${orderName}" after all search strategies`);
    return [];
  }

  // Fetch the full order details via REST API using the discovered order IDs
  const orders = [];
  for (const edge of edges) {
    const orderId = edge.node.legacyResourceId;
    try {
      const restResponse = await withRetry(async () => {
        return await axios.get(
          `https://${shop}/admin/api/${config.shopify.apiVersion}/orders/${orderId}.json`,
          {
            headers: { "X-Shopify-Access-Token": accessToken },
            timeout: 30000
          }
        );
      });
      if (restResponse.data.order) {
        console.log(`[fetchOrder] REST fetch OK for order ${orderId}, name: ${restResponse.data.order.name}, status: ${restResponse.data.order.fulfillment_status}`);
        orders.push(restResponse.data.order);
      }
    } catch (e) {
      console.warn(`[fetchOrder] Failed to fetch order ${orderId}:`, e.message);
    }
  }

  return orders;
};

/**
 * Update tracking information for an existing fulfillment with retry logic
 */
export const updateFulfillmentTracking = async (shop, accessToken, fulfillmentId, trackingInfo, notifyCustomer = false) => {
  return await withRetry(async () => {
    const response = await axios.post(
      `https://${shop}/admin/api/${config.shopify.apiVersion}/fulfillments/${fulfillmentId}/update_tracking.json`,
      {
        fulfillment: {
          tracking_info: trackingInfoPayload(trackingInfo),
          notify_customer: notifyCustomer
        }
      },
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );
    return response.data;
  });
};

/**
 * Get open fulfillment orders for an order with retry logic
 */
export const getFulfillmentOrders = async (client, orderId) => {
  const gid = `gid://shopify/Order/${orderId}`;

  return await withRetry(async () => {
    const response = await client.query({
      data: {
        query: GET_FULFILLMENT_ORDERS,
        variables: { id: gid }
      }
    });

    const connection = response.body?.data?.order?.fulfillmentOrders;

    if (connection?.pageInfo?.hasNextPage) {
      throw new Error(
        "Order has more fulfillment locations than this app reads in one request — fulfil it from the Shopify admin"
      );
    }

    const edges = connection?.edges || [];

    const truncated = edges.find((edge) => edge?.node?.lineItems?.pageInfo?.hasNextPage);
    if (truncated) {
      throw new Error(
        "Order has more line items than this app reads in one request — fulfilling it here would ship only part of the order"
      );
    }

    return edges;
  });
};

/**
 * Create a fulfillment covering every fulfillment order passed in.
 *
 * An order split across locations has one fulfillment order per location, and
 * lineItemsByFulfillmentOrder takes them all in one mutation. Fulfilling only the
 * first would leave the rest unshipped while still reporting success.
 */
export const createFulfillment = async (client, fulfillmentOrders, trackingInfo, notifyCustomer = false) => {
  const targets = (Array.isArray(fulfillmentOrders) ? fulfillmentOrders : [fulfillmentOrders])
    .map((fulfillmentOrder) => ({
      fulfillmentOrderId: fulfillmentOrder.id,
      fulfillmentOrderLineItems: fulfillmentOrder.lineItems.edges
        .filter((item) => item.node.remainingQuantity > 0)
        .map((item) => ({
          id: item.node.id,
          quantity: item.node.remainingQuantity
        }))
    }))
    .filter((target) => target.fulfillmentOrderLineItems.length > 0);

  return await withRetry(async () => {
    const response = await client.query({
      data: {
        query: CREATE_FULFILLMENT,
        variables: {
          fulfillment: {
            lineItemsByFulfillmentOrder: targets,
            trackingInfo: trackingInfoPayload(trackingInfo),
            notifyCustomer
          }
        }
      }
    });

    // Top-level GraphQL errors (a malformed tracking URL rejected by the URL
    // scalar, for example) never reach userErrors. Surface them instead of
    // returning an empty result that reads as "no response".
    const queryErrors = response.body?.errors;
    if (queryErrors?.length) {
      throw new Error(queryErrors.map(e => e.message).join("; "));
    }

    return response.body?.data?.fulfillmentCreate;
  });
};

/**
 * Match a carrier name from the sheet against the names Shopify recognizes.
 * Matching is case-insensitive, with an alias table for spellings merchants
 * habitually type, but we always return Shopify's exact spelling: Shopify only
 * selects the carrier, builds the tracking URL, and updates shipment_status
 * when the name matches its list character for character.
 */
export const resolveCarrierName = (
  trackingCompany,
  defaultCompany = config.defaultTrackingCompany
) => {
  const value = String(trackingCompany || "").trim();
  if (!value) {
    // The shop's own default, when it has set one. The app-wide fallback is
    // India Post, which is the wrong guess for most merchants and used to be
    // unreachable from the settings page.
    return { name: defaultCompany || config.defaultTrackingCompany, isKnown: true };
  }

  const lower = value.toLowerCase();

  const known = config.shopifyTrackingCompanies.find(
    (name) => name.toLowerCase() === lower
  );
  if (known) {
    return { name: known, isKnown: true };
  }

  const alias = config.trackingCompanyAliases?.[lower];
  if (alias) {
    return { name: alias, isKnown: config.shopifyTrackingCompanies.includes(alias) };
  }

  // A carrier Shopify does not know but we hold a link for still gets a canonical
  // spelling, so the override lookup and the customer-facing name agree
  const overridden = Object.keys(config.trackingUrlOverrides || {}).find(
    (name) => name.toLowerCase() === lower
  );
  if (overridden) {
    return { name: overridden, isKnown: false };
  }

  return { name: value, isKnown: false };
};

/**
 * Validate and normalize a tracking URL supplied in the sheet.
 * Shopify's `url` field is a URL scalar that rejects anything without a scheme
 * and host. Those rejections surface as top-level GraphQL errors rather than
 * userErrors, so a bare "www.foo.com/track" has to be repaired or rejected
 * here — otherwise the row fails with an unexplained error.
 */
export const normalizeTrackingUrl = (rawUrl) => {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return { url: null, error: null };
  }

  const withScheme = /^[a-z][a-z\d+\-.]*:\/\//i.test(value) ? value : `https://${value}`;

  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { url: null, error: `Invalid TrackingUrl "${value}" — not a valid link` };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { url: null, error: `Invalid TrackingUrl "${value}" — must be an http or https link` };
  }

  if (!parsed.hostname.includes(".")) {
    return { url: null, error: `Invalid TrackingUrl "${value}" — missing a valid domain` };
  }

  return { url: parsed.toString(), error: null };
};

/**
 * Put a tracking number into a URL that the merchant supplied as a template.
 *
 * Merchants naturally paste a base link once and copy it down the column —
 * "https://jcwexpress.com/tracking?codes=" — expecting each row's number to land
 * on the end. Taken verbatim that is a link to an empty tracking form: nothing
 * about it is invalid, so it cannot be reported as an error, and the customer
 * simply gets a dead link. Two shapes are filled in:
 *
 *   - an explicit {tracking} placeholder anywhere in the URL, for carriers whose
 *     number sits in the middle of the path
 *   - a URL ending on a separator, where the number is appended
 *
 * A URL that already carries its number ends on neither, and is left untouched.
 */
export const applyTrackingNumberToUrl = (rawUrl, trackingNumber) => {
  const value = String(rawUrl || "").trim();
  const number = String(trackingNumber || "").trim();
  if (!value || !number) return value;

  const encoded = encodeURIComponent(number);
  const placeholder = /\{\s*(tracking|tracking_number|trackingnumber|awb)\s*\}/gi;

  if (placeholder.test(value)) {
    return value.replace(placeholder, encoded);
  }

  // "?codes=", "&awb=", "/track/" — a link that stops on a separator is a template
  if (/[=/?&:]$/.test(value)) {
    return `${value}${encoded}`;
  }

  return value;
};

/**
 * Decide what tracking information to send to Shopify for a sheet row.
 *
 * Precedence, highest first:
 *   1. a URL from the sheet — the merchant's explicit choice. A base link or a
 *      {tracking} placeholder has this row's number filled in first
 *   2. a configured override — for carriers whose Shopify link is not a deep link
 *   3. no URL at all — Shopify builds and maintains the link from the carrier name,
 *      which is what picking a carrier from the admin dropdown does
 *
 * A `url` of null therefore means "let Shopify build the link".
 */
export const resolveTracking = (
  trackingNumber,
  trackingCompany,
  sheetUrl,
  defaultCompany
) => {
  const { name, isKnown } = resolveCarrierName(trackingCompany, defaultCompany);

  const custom = normalizeTrackingUrl(applyTrackingNumberToUrl(sheetUrl, trackingNumber));
  if (custom.error) {
    return { company: name, url: null, isKnown, error: custom.error };
  }
  if (custom.url) {
    return { company: name, url: custom.url, isKnown, error: null };
  }

  const override = config.trackingUrlOverrides?.[name];
  if (override && trackingNumber) {
    const built = normalizeTrackingUrl(`${override}${encodeURIComponent(trackingNumber)}`);
    if (built.url) {
      return { company: name, url: built.url, isKnown, error: null };
    }
    // A malformed override is a config mistake, not a reason to fail the row —
    // warn and fall through to whatever Shopify can produce
    console.warn(`[tracking] Ignoring invalid trackingUrlOverrides entry for "${name}": ${built.error}`);
  }

  if (isKnown) {
    return { company: name, url: null, isKnown, error: null };
  }

  // Never let an unrecognized carrier through without a URL. Shopify does not
  // simply leave the link empty — it guesses the carrier from the tracking
  // number's format and builds a link from that guess. Verified against a live
  // shop: company "Trackon" with number "TC123456789IN" and no URL came back
  // as https://www.indiapost.gov.in/. The customer would be sent to the wrong
  // carrier's site, which is worse than refusing the row.
  return {
    company: name,
    url: null,
    isKnown,
    error: `Shopify does not recognize the carrier "${name}" — use a name from the Carriers sheet, or fill the TrackingUrl column for this row`
  };
};

/**
 * Carriers a merchant can use with the TrackingUrl column left blank: the ones
 * Shopify recognizes, plus any we hold our own tracking link for.
 */
export const carriersNeedingNoUrl = () => [
  ...new Set([
    ...config.shopifyTrackingCompanies,
    ...Object.keys(config.trackingUrlOverrides || {})
  ])
].sort((a, b) => a.localeCompare(b));

/**
 * Shape the trackingInfo payload. `url` is left out entirely rather than sent as
 * null, so that Shopify falls back to generating the link from the carrier name.
 */
const trackingInfoPayload = ({ number, company, url }) => ({
  number,
  company,
  ...(url ? { url } : {})
});

/**
 * Process a single order for fulfillment.
 *
 * `notifyCustomer` defaults to false so that no code path can email a shop's
 * customers unless the merchant explicitly asked for it on the upload. This used
 * to be hardcoded true, which meant one bad sheet mailed every customer in it and
 * the notification toggle in Settings had no effect at all.
 */
export const processOrderFulfillment = async (
  order,
  session,
  client,
  notifyCustomer = false,
  defaultCarrier
) => {
  const { shop, accessToken } = session;
  
  // Parse order data. orderNumber may be NaN for an ambiguous name like "#1025-A";
  // that is not fatal, matching then relies on the order name alone.
  const orderNumberRaw = String(order.OrderNumber || order.Name || "").trim();
  const orderNumber = parseOrderNumber(orderNumberRaw);
  const trackingNumber = (order.TrackingNumber || "").toString().trim();
  const tracking = resolveTracking(
    trackingNumber,
    order.TrackingCompany,
    order.TrackingUrl,
    defaultCarrier
  );
  const trackingCompany = tracking.company;
  let trackingUrl = tracking.url || "";

  // Every result row reports the same identity fields
  const row = (extra) => ({
    orderNumber: orderNumberRaw,
    trackingNumber,
    trackingCompany,
    trackingUrl,
    ...extra
  });

  // A cell the spreadsheet mangled beyond recovery — never guess at it
  if (order.parseError) {
    return row({ error: order.parseError });
  }

  // Validate required fields. The raw name is what matters; a numeric order_number
  // is optional because names like "#1025-A" have none we can trust.
  if (!orderNumberRaw || !trackingNumber) {
    return row({ error: "Missing Order Number or Tracking Number" });
  }

  // Reject bad tracking input before touching Shopify. A carrier Shopify cannot
  // resolve to a link is a problem with the sheet, and must fail loudly rather
  // than fulfilling an order whose tracking number leads nowhere.
  if (tracking.error) {
    return row({ error: tracking.error });
  }

  try {
    // Fetch order from Shopify by name (uses GraphQL search + REST details)
    const matchingOrders = await fetchOrder(shop, accessToken, orderNumberRaw, client);
    
    console.log(`[processOrder] "${orderNumberRaw}" => found ${matchingOrders.length} order(s), looking for order_number=${orderNumber}`);
    if (matchingOrders.length > 0) {
      console.log(`[processOrder] Candidate orders:`, matchingOrders.map(o => 
        `name=${o.name}, order_number=${o.order_number}, fulfillment_status=${o.fulfillment_status}`
      ));
    }

    if (matchingOrders.length === 0) {
      return row({ error: "Order not found" });
    }

    // Match on the order name first — it is the only unambiguous signal. Matching
    // on order_number first meant a sheet value of "#1025-A" resolved to 1025 and
    // could fulfil order #1025 instead, shipping someone else's tracking number.
    const sameName = (a, b) =>
      String(a || "").trim().replace(/^#/, "").toLowerCase() ===
      String(b || "").trim().replace(/^#/, "").toLowerCase();

    let orderData = matchingOrders.find((o) => sameName(o.name, orderNumberRaw));

    // Fall back to order_number only for sheet values whose digits are unambiguous
    // (parseOrderNumber returns NaN otherwise), e.g. "FSL1001" -> 1001
    if (!orderData && !Number.isNaN(orderNumber)) {
      orderData = matchingOrders.find(
        (o) => parseInt(o.order_number) === orderNumber
      );
    }

    if (!orderData) {
      return row({ error: "Order not found" });
    }

    // Handle already fulfilled orders
    if (orderData.fulfillment_status === "fulfilled") {
      return await handleFulfilledOrder(shop, accessToken, orderData, {
        orderNumberRaw,
        trackingNumber,
        trackingCompany,
        trackingUrl
      }, notifyCustomer);
    }
    
    // Rate limiting between API calls
    await sleep(RATE_LIMIT_DELAY);
    
    // Get fulfillment orders
    const orderId = parseInt(orderData.id);
    const fulfillmentOrders = await getFulfillmentOrders(client, orderId);
    
    // Take every fulfillable location, not just the first. ON_HOLD and CLOSED are
    // excluded; taking only the first left the other locations unshipped while the
    // row still reported success.
    const fulfillableStatuses = ["OPEN", "SCHEDULED", "IN_PROGRESS"];
    const fulfillableOrders = fulfillmentOrders
      .map((edge) => edge?.node)
      .filter((node) => fulfillableStatuses.includes(node?.status));

    if (fulfillableOrders.length === 0) {
      // Check what statuses exist to give better error message
      const statuses = fulfillmentOrders.map(edge => edge?.node?.status).filter(Boolean);
      const statusList = [...new Set(statuses)].join(", ");

      return row({
        error: statuses.length > 0
          ? `Cannot fulfill - order status: ${statusList}`
          : "No fulfillment orders found for this order"
      });
    }

    // Check if there are items to fulfill anywhere
    const itemsToFulfill = fulfillableOrders.flatMap((node) =>
      node.lineItems.edges.filter((item) => item.node.remainingQuantity > 0)
    );

    if (itemsToFulfill.length === 0) {
      return row({ error: "All items in this order are already fulfilled" });
    }

    // Create fulfillment
    const result = await createFulfillment(client, fulfillableOrders, {
      number: trackingNumber,
      company: trackingCompany,
      url: trackingUrl
    }, notifyCustomer);
    
    // Handle null result
    if (!result) {
      return row({ error: "Fulfillment API returned no response" });
    }

    if (result.userErrors?.length) {
      return row({
        error: result.userErrors.map(e => e.message).join("; ") || "Fulfillment failed"
      });
    }

    // Check if fulfillment was created
    if (!result.fulfillment) {
      return row({ error: "Fulfillment was not created - unknown reason" });
    }

    // For a recognized carrier we sent no URL, so pick up the one Shopify built
    const generatedUrl = result.fulfillment.trackingInfo?.[0]?.url || "";
    trackingUrl = trackingUrl || generatedUrl;

    return row({
      status: result.fulfillment.status || "FULFILLED",
      fulfillmentId: result.fulfillment.id,
      error: null,
      // No link from either side means Shopify did not recognize the carrier.
      // The order is fulfilled, but the customer has nothing to click.
      warning: trackingUrl
        ? null
        : `Fulfilled, but Shopify generated no tracking link for "${trackingCompany}" — add a TrackingUrl for this carrier`
    });

  } catch (err) {
    return row({ error: err.message || "Unknown error" });
  }
};

/**
 * A fulfillment that can no longer carry tracking a customer will see.
 *
 * Deliberately spelling-agnostic: this data comes from the REST order payload
 * (lowercase "cancelled"), while the GraphQL API reports "CANCELLED" for status
 * and "CANCELED" for displayStatus. Pinning one exact string would let the filter
 * silently stop working.
 */
export const isDeadFulfillment = (fulfillment) => {
  const status = String(fulfillment?.status || "").toLowerCase();
  return ["cancelled", "canceled", "error", "failure"].includes(status);
};

/**
 * Handle already fulfilled orders - update tracking if needed
 */
const handleFulfilledOrder = async (shop, accessToken, orderData, trackingInfo, notifyCustomer = false) => {
  const { orderNumberRaw, trackingNumber, trackingCompany, trackingUrl } = trackingInfo;
  let trackingUpdated = false;
  let lastError = null;

  // A cancelled fulfillment still appears in orderData.fulfillments, and Shopify
  // accepts a tracking update on it without complaint — verified against a live
  // shop, userErrors came back empty. Writing to one would report "Tracking
  // updated" while the customer sees nothing, so only live fulfillments count.
  const liveFulfillments = (orderData.fulfillments || []).filter((f) => !isDeadFulfillment(f));

  if (liveFulfillments.length > 0) {
    for (const fulfillment of liveFulfillments) {
      // Check if fulfillment has no tracking but we have one
      if ((!fulfillment.tracking_number || fulfillment.tracking_number === "") && trackingNumber) {
        try {
          // Rate limit between tracking updates
          await sleep(RATE_LIMIT_DELAY);
          
          await updateFulfillmentTracking(shop, accessToken, fulfillment.id, {
            number: trackingNumber,
            company: trackingCompany,
            url: trackingUrl
          }, notifyCustomer);
          trackingUpdated = true;
          break; // Stop after first successful update
        } catch (updateError) {
          lastError = updateError.response?.data?.errors?.[0] || 
                      updateError.response?.data?.error ||
                      updateError.message;
          console.error(
            "Error updating tracking for fulfillment",
            fulfillment.id,
            ":",
            lastError
          );
        }
      }
    }
    
    if (trackingUpdated) {
      return {
        orderNumber: orderNumberRaw,
        trackingNumber,
        trackingCompany,
        trackingUrl,
        status: "Tracking updated",
        error: null
      };
    }
  }
  
  // Determine appropriate error message. Only live fulfillments count here too —
  // tracking on a cancelled one must not read as "already has tracking".
  const hasAnyTracking = liveFulfillments.some(
    (f) => f.tracking_number && f.tracking_number !== ""
  );

  let error;
  if (hasAnyTracking) {
    error = "Order already has tracking";
  } else if (!trackingNumber) {
    error = "No tracking provided in sheet";
  } else if (lastError) {
    error = `Failed to update tracking: ${typeof lastError === 'string' ? lastError : JSON.stringify(lastError)}`;
  } else if (liveFulfillments.length === 0) {
    error = "Order is marked fulfilled but has no active fulfillment to attach tracking to";
  } else {
    error = "Failed to update tracking - no eligible fulfillment found";
  }
  
  return {
    orderNumber: orderNumberRaw,
    trackingNumber: trackingNumber || "",
    trackingCompany,
    trackingUrl,
    error
  };
};

/**
 * Generate fulfillment report as Excel buffer
 */
export const generateFulfillmentReport = (summary) => {
  const workbook = xlsx.utils.book_new();
  
  // Main data sheet
  const sheetData = [
    ["Order Number", "Tracking Number", "Tracking Company", "Tracking URL", "Status", "Details", "Fulfillment ID", "Processed At"],
    ...summary.map((r) => [
      r.orderNumber,
      r.trackingNumber || "",
      r.trackingCompany || "",
      r.trackingUrl || "",
      r.error ? "Failed" : r.warning ? "Warning" : "Success",
      r.error || r.warning || r.status || "Fulfilled successfully",
      r.fulfillmentId || "",
      new Date().toISOString()
    ])
  ];

  const worksheet = xlsx.utils.aoa_to_sheet(sheetData);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 15 },  // Order Number
    { wch: 25 },  // Tracking Number
    { wch: 15 },  // Tracking Company
    { wch: 45 },  // Tracking URL
    { wch: 10 },  // Status
    { wch: 40 },  // Details
    { wch: 35 },  // Fulfillment ID
    { wch: 25 }   // Processed At
  ];
  
  xlsx.utils.book_append_sheet(workbook, worksheet, "Fulfillment Report");
  
  // Add summary sheet
  const successCount = summary.filter(r => !r.error).length;
  const failedCount = summary.filter(r => r.error).length;
  
  const summarySheetData = [
    ["Fulfillment Report Summary"],
    [""],
    ["Total Orders", summary.length],
    ["Successful", successCount],
    ["Failed", failedCount],
    ["Success Rate", `${((successCount / summary.length) * 100).toFixed(1)}%`],
    [""],
    ["Generated At", new Date().toLocaleString()]
  ];
  
  const summaryWorksheet = xlsx.utils.aoa_to_sheet(summarySheetData);
  summaryWorksheet['!cols'] = [{ wch: 20 }, { wch: 30 }];
  xlsx.utils.book_append_sheet(workbook, summaryWorksheet, "Summary");
  
  return xlsx.write(workbook, { bookType: "xlsx", type: "buffer" });
};

export default {
  getLastFulfillmentSummary,
  setFulfillmentSummary,
  parseExcelFile,
  cleanupTempFile,
  processOrderFulfillment,
  generateFulfillmentReport,
  parseOrderNumber,
  isDeadFulfillment,
  resolveCarrierName,
  normalizeTrackingUrl,
  applyTrackingNumberToUrl,
  resolveTracking,
  carriersNeedingNoUrl
};
