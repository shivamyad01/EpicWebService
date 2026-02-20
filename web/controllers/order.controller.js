/**
 * Order Controller
 * Handles order-related HTTP requests
 */

import shopify from "../shopify.js";
import {
  parseExcelFile,
  cleanupTempFile,
  processOrderFulfillment,
  getLastFulfillmentSummary,
  setFulfillmentSummary,
  generateFulfillmentReport
} from "../services/fulfillment.service.js";

/**
 * Bulk fulfill orders from uploaded Excel file
 */
export const bulkFulfillOrders = async (req, res) => {
  const session = res.locals.shopify.session;
  const { shop } = session;
  const client = new shopify.api.clients.Graphql({ session });

  try {
    // Parse Excel file
    const orders = parseExcelFile(req.file.path);
    const results = [];

    // Process each order
    for (const order of orders) {
      const result = await processOrderFulfillment(order, session, client);
      results.push(result);
    }

    // Store results for later retrieval
    setFulfillmentSummary(shop, results);

    // Clean up temp file
    cleanupTempFile(req.file.path);

    return res.status(200).json({ summary: results });
  } catch (err) {
    console.error("Bulk fulfillment error:", err);
    
    // Clean up temp file on error
    if (req.file?.path) {
      cleanupTempFile(req.file.path);
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
 * Download fulfillment report as Excel file
 */
export const downloadFulfillmentReport = (req, res) => {
  const session = res.locals.shopify.session;
  const shop = session.shop;
  const summary = getLastFulfillmentSummary(shop);

  if (!summary || summary.length === 0) {
    return res.status(404).json({ message: "No fulfillment report available." });
  }

  const buffer = generateFulfillmentReport(summary);

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=fulfillment_report_${Date.now()}.xlsx`
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
  downloadFulfillmentReport
};
