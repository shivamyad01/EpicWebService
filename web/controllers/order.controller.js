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
  setFulfillmentSummary,
  generateFulfillmentReport
} from "../services/fulfillment.service.js";
import { generateSampleWorkbook } from "../services/sample.service.js";

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

    // A long run can outlive the request: nginx gives up at 300s and the browser
    // sees a 504, but Node keeps the handler alive. Without this the app carried on
    // fulfilling orders and emailing customers for an upload the merchant already
    // saw fail, and they would re-upload on top of it.
    let clientGone = false;
    res.on("close", () => {
      if (!res.writableEnded) {
        clientGone = true;
        console.warn(`[bulkFulfill] client disconnected for ${shop}, stopping after the current batch`);
      }
    });

    const results = [];
    const totalOrders = orders.length;
    const groups = groupRowsByOrder(orders);
    let stoppedEarly = false;

    // Batch over groups, not rows, so no two rows for the same order run at once
    for (let i = 0; i < groups.length; i += BATCH_SIZE) {
      if (clientGone) {
        stoppedEarly = true;
        break;
      }

      const batch = groups.slice(i, i + BATCH_SIZE);

      // Groups run concurrently; rows inside a group run one after another
      const batchResults = await Promise.all(
        batch.map(async (group) => {
          const groupResults = [];
          for (const order of group) {
            groupResults.push(
              await processOrderFulfillment(order, session, client, notifyCustomer)
            );
          }
          return groupResults;
        })
      );

      results.push(...batchResults.flat());

      // Delay between batches to avoid rate limits
      if (i + BATCH_SIZE < groups.length) {
        await sleep(BATCH_DELAY);
      }
    }

    // Rows never reached must show up in the report, or a merchant reading it would
    // believe those orders were considered and found fine
    if (stoppedEarly) {
      const processed = results.length;
      for (const order of orders.slice(processed)) {
        results.push({
          orderNumber: String(order.OrderNumber || ""),
          trackingNumber: String(order.TrackingNumber || ""),
          trackingCompany: order.TrackingCompany || "",
          trackingUrl: "",
          error: "Not processed - the upload was interrupted. Re-upload these rows."
        });
      }
      console.warn(`[bulkFulfill] ${shop}: stopped after ${processed}/${totalOrders} rows`);
    }

    // Store results for later retrieval
    setFulfillmentSummary(shop, results);

    // Clean up temp file
    cleanupTempFile(req.file.path);

    // Calculate summary stats
    const successCount = results.filter(r => !r.error).length;
    const failedCount = results.filter(r => r.error).length;

    // Nothing to write to if the browser already gave up; the report is saved, so
    // the merchant can still download it
    if (clientGone) {
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
 * Get the last fulfillment report
 */
export const getFulfillmentReport = (req, res) => {
  const session = res.locals.shopify.session;
  const shop = session.shop;
  const summary = getLastFulfillmentSummary(shop);

  if (!summary || summary.length === 0) {
    return res.status(404).json({ message: "No fulfillment report available." });
  }

  return res.status(200).json({ report: summary });
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
  downloadFulfillmentReport,
  downloadSampleFile
};
