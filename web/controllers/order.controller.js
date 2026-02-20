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

// Batch processing configuration
const BATCH_SIZE = 10; // Process orders in batches
const BATCH_DELAY = 500; // ms delay between batches

/**
 * Sleep utility
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
    
    // Limit maximum orders per request
    const MAX_ORDERS = 500;
    if (orders.length > MAX_ORDERS) {
      cleanupTempFile(req.file.path);
      return res.status(400).json({ 
        error: `Too many orders. Maximum ${MAX_ORDERS} orders per file.`,
        count: orders.length 
      });
    }
    
    const results = [];
    const totalOrders = orders.length;
    
    // Process orders in batches
    for (let i = 0; i < totalOrders; i += BATCH_SIZE) {
      const batch = orders.slice(i, i + BATCH_SIZE);
      
      // Process batch concurrently but with controlled parallelism
      const batchResults = await Promise.all(
        batch.map(order => processOrderFulfillment(order, session, client))
      );
      
      results.push(...batchResults);
      
      // Delay between batches to avoid rate limits
      if (i + BATCH_SIZE < totalOrders) {
        await sleep(BATCH_DELAY);
      }
    }

    // Store results for later retrieval
    setFulfillmentSummary(shop, results);

    // Clean up temp file
    cleanupTempFile(req.file.path);

    // Calculate summary stats
    const successCount = results.filter(r => !r.error).length;
    const failedCount = results.filter(r => r.error).length;

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
