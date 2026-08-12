/**
 * Order Controller
 * Handles order-related HTTP requests
 */

import shopify from "../shopify.js";
import config from "../config/index.js";
import {
  parseExcelFile,
  cleanupTempFile,
  processOrderFulfillment,
  getLastFulfillmentSummary,
  getLastFulfillmentSavedAt,
  setFulfillmentSummary,
  generateFulfillmentReport
} from "../services/fulfillment.service.js";
import { generateSampleWorkbook } from "../services/sample.service.js";
import {
  beginRun,
  advanceRun,
  finishRun,
  getRun,
  readRunRecord,
} from "../services/run.service.js";
import { ensureValidOfflineSession } from "../services/token.service.js";
import {
  countOrdersByStatus,
  fetchOrdersForStatus,
  validateRange,
  STATUS_FILTERS,
} from "../services/pendingOrders.service.js";

// Batch processing configuration. Taken from config rather than declared again
// here — config.fulfillment already carries these numbers, and a second copy is
// only ever discovered when someone tunes one of them and nothing changes.
const BATCH_SIZE = config.fulfillment.batchSize;
const BATCH_DELAY = config.fulfillment.batchDelayMs;

/**
 * Sleep utility
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Group sheet rows by the order they target.
 *
 * A merchant can legitimately list one order twice — two parcels, two AWBs — but
 * running those rows concurrently races them against each other: both read the same
 * open fulfillment order and both try to fulfil it. Rows for one order therefore run
 * in sequence, while different orders still run in parallel.
 */
const groupRowsByOrder = (rows) => {
  const groups = new Map();

  for (const row of rows) {
    const key = String(row.OrderNumber || "").trim().replace(/^#/, "").toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  return [...groups.values()];
};

/**
 * Bulk fulfill orders from uploaded Excel file
 */
export const bulkFulfillOrders = async (req, res) => {
  const session = res.locals.shopify.session;
  const { shop } = session;
  const client = new shopify.api.clients.Graphql({ session });

  try {
    // Parse Excel file with validation
    let orders;
    try {
      orders = parseExcelFile(req.file.path);
    } catch (parseError) {
      cleanupTempFile(req.file.path);
      return res.status(400).json({ 
        error: "Failed to parse file",
        message: parseError.message 
      });
    }
    
    // Validate order count
    if (orders.length === 0) {
      cleanupTempFile(req.file.path);
      return res.status(400).json({ 
        error: "No orders found in file" 
      });
    }
    
    // Limit maximum orders per request. Read from config rather than repeated
    // here: config.fulfillment already declares the number, and two copies of a
    // limit is one copy too many for the day someone raises it in one place.
    const maxOrders = config.fulfillment.maxOrdersPerRequest;
    if (orders.length > maxOrders) {
      cleanupTempFile(req.file.path);
      return res.status(400).json({
        error: `Too many orders. Maximum ${maxOrders} orders per file.`,
        count: orders.length
      });
    }
    
    // Notifying customers is opt-in per upload. It used to be forced on, so a
    // single bad sheet emailed every customer in it with no way to prevent that.
    const notifyCustomer = req.body?.notifyCustomer === "true";

    const totalOrders = orders.length;

    // One run per shop, and this is the line that makes running in the background
    // safe at all. A merchant who closes the app, comes back and uploads the same
    // sheet again is turned away here instead of starting a second pass over orders
    // the first run is still working through — which fulfils them twice and emails
    // the customer twice, neither of which can be undone.
    const claim = beginRun(shop, totalOrders);
    if (!claim.ok) {
      cleanupTempFile(req.file.path);
      return res.status(409).json({
        error: "A fulfillment run is already in progress",
        message:
          `${claim.run.processed} of ${claim.run.total} rows are done. Wait for it to ` +
          `finish — closing the app does not stop it.`,
        progress: {
          total: claim.run.total,
          processed: claim.run.processed,
          startedAt: new Date(claim.run.startedAt).toISOString(),
        },
      });
    }

    // The run does not stop when the browser does. nginx cuts the request at 300s and
    // the merchant may have closed the app long before, but the sheet is parsed and
    // the token can be rotated without a request, so there is nothing to gain by
    // abandoning half of it. This flag only records that there is no socket left to
    // answer on.
    let clientGone = false;
    res.on("close", () => {
      if (!res.writableEnded) {
        clientGone = true;
        console.warn(`[bulkFulfill] ${shop}: client left, continuing in the background`);
      }
    });

    const results = [];
    const groups = groupRowsByOrder(orders);
    let runSession = session;
    let runClient = client;

    try {
      // Batch over groups, not rows, so no two rows for the same order run at once
      for (let i = 0; i < groups.length; i += BATCH_SIZE) {
        // Offline tokens now expire after an hour and are normally rotated by the
        // middleware on each request. A background run has no requests, so a sheet
        // that takes longer than the token lives would start failing every row on an
        // expired token. Re-reading the session per batch keeps it valid; the helper
        // is a no-op until the token is actually near expiry.
        try {
          const fresh = await ensureValidOfflineSession(shop);
          if (fresh?.accessToken && fresh.accessToken !== runSession.accessToken) {
            runSession = fresh;
            runClient = new shopify.api.clients.Graphql({ session: fresh });
            console.log(`[bulkFulfill] ${shop}: rotated the access token mid-run`);
          }
        } catch (tokenErr) {
          // Carry on with the token in hand — it may still have minutes left, and
          // failing the whole run over a refresh hiccup would be worse.
          console.warn(`[bulkFulfill] ${shop}: token refresh failed:`, tokenErr.message);
        }

        const batch = groups.slice(i, i + BATCH_SIZE);

        // Groups run concurrently; rows inside a group run one after another
        const batchResults = await Promise.all(
          batch.map(async (group) => {
            const groupResults = [];
            for (const order of group) {
              groupResults.push(
                await processOrderFulfillment(order, runSession, runClient, notifyCustomer)
              );
            }
            return groupResults;
          })
        );

        results.push(...batchResults.flat());
        advanceRun(shop, results.length);

        // Saved every batch, not only at the end. A redeploy mid-run used to lose the
        // entire report including the orders that had already shipped, leaving no
        // record of what went out. A few KB per batch buys a survivable report.
        setFulfillmentSummary(shop, results);

        // Delay between batches to avoid rate limits
        if (i + BATCH_SIZE < groups.length) {
          await sleep(BATCH_DELAY);
        }
      }
    } finally {
      // Release the slot whether the sheet finished or a row threw, or this shop
      // could never start another run.
      finishRun(shop);
    }

    setFulfillmentSummary(shop, results);
    cleanupTempFile(req.file.path);

    const successCount = results.filter(r => !r.error).length;
    const failedCount = results.filter(r => r.error).length;

    // Nothing to answer on if the browser gave up; the report is saved and the page
    // picks it up next time it opens.
    if (clientGone) {
      console.log(
        `[bulkFulfill] ${shop}: finished in the background — ${successCount} fulfilled, ${failedCount} failed`
      );
      return;
    }

    return res.status(200).json({
      summary: results,
      stats: {
        total: totalOrders,
        success: successCount,
        failed: failedCount
      }
    });
  } catch (err) {
    console.error("Bulk fulfillment error:", err);

    // Belt and braces around the slot. The inner finally covers everything once the
    // loop starts; this covers a throw before it. Wrapped because an error handler
    // that throws is how a real failure turns into an empty 500 with no message.
    try {
      finishRun(res.locals.shopify?.session?.shop, { interrupted: true });
    } catch (releaseErr) {
      console.error("Could not release the run slot:", releaseErr.message);
    }

    // Clean up temp file on error
    if (req.file?.path) {
      cleanupTempFile(req.file.path);
    }

    if (res.headersSent || !res.writable) {
      return;
    }

    return res.status(500).json({
      error: "Internal error during fulfillment",
      message: err.message
    });
  }
};

/**
 * What the shop's fulfillment is doing right now.
 *
 * Polled by the upload page, which cannot otherwise tell the difference between "no
 * run" and "a run you started before you closed the app is still going". Also
 * reports the last run when it was cut short by a restart, so a report that stops
 * partway is not presented as a complete one.
 *
 * Outside the subscription gate, like the report itself: this describes work the
 * merchant has already paid for.
 */
export const getFulfillmentProgress = (req, res) => {
  const { shop } = res.locals.shopify.session;
  const run = getRun(shop);

  if (run) {
    return res.status(200).json({
      running: true,
      total: run.total,
      processed: run.processed,
      startedAt: new Date(run.startedAt).toISOString(),
    });
  }

  // Not running. If the last one never finished, the process it belonged to died —
  // say so, because the saved report stops wherever it got to.
  const last = readRunRecord(shop);
  if (last?.interrupted) {
    return res.status(200).json({
      running: false,
      interrupted: true,
      total: last.total,
      processed: last.processed,
      finishedAt: last.finishedAt,
    });
  }

  return res.status(200).json({ running: false });
};

/**
 * Get the last fulfillment report.
 *
 * Read by the upload page on load so a merchant who reloads — or whose plan has
 * lapsed — still sees the run they already paid for. Both the paywall banner and
 * the Plan page promise that reports "stay available", and until this was wired up
 * nothing on the page fetched it, so the promise held only for as long as the tab
 * stayed open.
 *
 * `savedAt` lets the page date a restored report instead of stamping it with the
 * current time, which would read as though the run had just finished.
 */
export const getFulfillmentReport = (req, res) => {
  const session = res.locals.shopify.session;
  const shop = session.shop;
  const summary = getLastFulfillmentSummary(shop);

  if (!summary || summary.length === 0) {
    return res.status(404).json({ message: "No fulfillment report available." });
  }

  return res.status(200).json({
    report: summary,
    savedAt: getLastFulfillmentSavedAt(shop),
  });
};

/**
 * What is in a date range: how many orders sit in each bucket, and the rows of
 * whichever bucket was asked for.
 *
 * The counts come from ordersCount, so the summary is cheap even for a month of
 * a busy store; only the chosen bucket is paged through.
 */
export const listPendingOrders = async (req, res) => {
  const session = res.locals.shopify.session;

  const range = validateRange(req.query.from, req.query.to);
  if (range.error) {
    return res.status(400).json({ error: range.error });
  }

  const status = STATUS_FILTERS.includes(req.query.status)
    ? req.query.status
    : "unfulfilled";

  try {
    const client = new shopify.api.clients.Graphql({ session });

    const [counts, listing] = await Promise.all([
      countOrdersByStatus(client, range),
      fetchOrdersForStatus(client, { ...range, status }),
    ]);

    // The missing-tracking count cannot come from ordersCount — no search filter
    // expresses it — so it is whatever the scan turned up, and it is only honest
    // to call it exact when the scan reached the end of the range. It is absent
    // from the other buckets' responses rather than zero: "none found" and "not
    // looked for" must not read the same.
    if (status === "untracked") {
      counts.untracked = {
        count: listing.orders.length,
        exact: !listing.truncated,
      };
    }

    return res.status(200).json({
      counts,
      status,
      orders: listing.orders,
      truncated: listing.truncated,
      scanned: listing.scanned,
      limit: config.fulfillment.maxOrdersPerRequest,
    });
  } catch (err) {
    console.error("[orders] could not list orders:", err.message);
    return res.status(502).json({
      error: "Could not read your orders from Shopify. Try again in a moment.",
    });
  }
};

/**
 * Download a sheet of the orders still waiting to be fulfilled.
 *
 * The same workbook as the sample — same columns, same carrier dropdown — with
 * the OrderNumber column already filled in from the shop. A merchant pastes in
 * tracking numbers, picks carriers from the dropdown, and uploads it back, never
 * having typed an order number. Mistyped order names are the most common failed
 * row there is, and this removes the step that produces them.
 */
export const downloadPendingOrdersSheet = async (req, res) => {
  const session = res.locals.shopify.session;

  const range = validateRange(req.query.from, req.query.to);
  if (range.error) {
    return res.status(400).json({ error: range.error });
  }

  try {
    const status = STATUS_FILTERS.includes(req.query.status)
      ? req.query.status
      : "unfulfilled";

    const client = new shopify.api.clients.Graphql({ session });
    const fetched = await fetchOrdersForStatus(client, {
      from: range.from,
      to: range.to,
      status,
    });

    // `only` narrows the sheet to the rows the merchant ticked. The orders are
    // still read from Shopify rather than taken from the request, so the sheet
    // reflects what is actually pending now, not what the page showed a few
    // minutes ago.
    const wanted = req.body?.only;
    const orders = Array.isArray(wanted) && wanted.length
      ? fetched.orders.filter((order) => wanted.includes(order.name))
      : fetched.orders;
    const truncated = fetched.truncated && orders === fetched.orders;

    if (orders.length === 0) {
      return res.status(404).json({
        message: "No orders match that range. Try a wider one, or a different status.",
      });
    }

    // Date only, no time: it is there to help the merchant recognise a row, and
    // a timestamp would just be noise in a column they never edit.
    const rows = orders.map((order) => [
      order.name,
      "",
      "",
      "",
      order.createdAt.slice(0, 10),
    ]);

    const buffer = await generateSampleWorkbook({
      rows,
      extraHeader: "Order Date",
    });

    // Named for what the rows are, since these two sheets are worked on
    // differently: one gets tracking for orders that have not shipped, the other
    // supplies tracking for orders that already did.
    const basename =
      status === "untracked" ? "orders_missing_tracking" : "orders_to_fulfill";

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${basename}_${range.from.slice(0, 10)}_to_${range.to.slice(0, 10)}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    // Read by the frontend so it can tell the merchant the list was cut short.
    res.setHeader("X-Order-Count", String(orders.length));
    res.setHeader("X-Order-Truncated", truncated ? "1" : "0");

    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("[pendingOrders] could not build the sheet:", err.message);
    return res.status(502).json({
      error: "Could not read your orders from Shopify. Try again in a moment.",
    });
  }
};

/**
 * Download the sample spreadsheet.
 *
 * Built on the server so its carrier dropdown is filled from the same config the
 * fulfillment service matches names against, and so it can carry a real in-cell
 * dropdown at all — see services/sample.service.js.
 *
 * Not behind the subscription gate, like the report below: a merchant deciding
 * whether to subscribe should be able to see the format the app expects first.
 */
export const downloadSampleFile = async (req, res) => {
  try {
    const buffer = await generateSampleWorkbook();

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=sample_bulk_fulfillment.xlsx"
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("[sample] could not build the sample workbook:", err.message);
    return res.status(500).json({ error: "Could not build the sample file." });
  }
};

/**
 * Download fulfillment report as Excel file
 *
 * ?status=failed narrows the sheet to the rows that still need action. Anything
 * else — including no query at all — returns the whole run, so the existing
 * download link behaves exactly as before.
 */
export const downloadFulfillmentReport = (req, res) => {
  const session = res.locals.shopify.session;
  const shop = session.shop;
  const summary = getLastFulfillmentSummary(shop);

  if (!summary || summary.length === 0) {
    return res.status(404).json({ message: "No fulfillment report available." });
  }

  // Failed means a row that was not fulfilled. Warnings are fulfillments that
  // went through with something worth noting, so they stay out of the fix-list.
  const failedOnly = req.query.status === "failed";
  const rows = failedOnly ? summary.filter((r) => r.error) : summary;

  if (rows.length === 0) {
    return res.status(404).json({
      message: "Every order in the last run was fulfilled. There is nothing to download."
    });
  }

  const buffer = generateFulfillmentReport(summary, {
    rows,
    rowsLabel: failedOnly ? "Failed rows only" : null
  });

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${
      failedOnly ? "failed_fulfillments" : "fulfillment_report"
    }_${Date.now()}.xlsx`
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  
  return res.send(buffer);
};

export default {
  bulkFulfillOrders,
  getFulfillmentReport,
  getFulfillmentProgress,
  downloadFulfillmentReport,
  downloadSampleFile,
  downloadPendingOrdersSheet,
  listPendingOrders
};
