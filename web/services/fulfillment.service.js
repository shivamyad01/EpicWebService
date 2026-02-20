/**
 * Fulfillment Service
 * Business logic for order fulfillment operations
 */

import axios from "axios";
import xlsx from "xlsx";
import fs from "fs";
import path from "path";
import { GET_FULFILLMENT_ORDERS, CREATE_FULFILLMENT } from "../utils/graphql.queries.js";
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
 * Get the last fulfillment summary for a shop
 */
export const getLastFulfillmentSummary = (shop) => {
  return fulfillmentSummaries.get(shop) || [];
};

/**
 * Set the fulfillment summary for a shop
 */
export const setFulfillmentSummary = (shop, summary) => {
  fulfillmentSummaries.set(shop, summary);
};

/**
 * Parse Excel/CSV file and extract order data
 */
export const parseExcelFile = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  let orders;
  
  if (ext === '.csv') {
    // For CSV, read with specific options to handle commas properly
    const workbook = xlsx.readFile(filePath, { type: 'file', raw: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    orders = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  } else {
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    orders = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  }
  
  // Validate required columns exist
  if (orders.length === 0) {
    throw new Error('Excel file is empty or has no data rows');
  }
  
  const firstRow = orders[0];
  const hasOrderColumn = 'OrderNumber' in firstRow || 'Name' in firstRow || 'Order Number' in firstRow || 'order_number' in firstRow;
  const hasTrackingColumn = 'TrackingNumber' in firstRow || 'Tracking Number' in firstRow || 'tracking_number' in firstRow;
  
  if (!hasOrderColumn) {
    throw new Error('Missing required column: OrderNumber (or Name, Order Number)');
  }
  
  if (!hasTrackingColumn) {
    throw new Error('Missing required column: TrackingNumber (or Tracking Number)');
  }
  
  // Normalize column names
  return orders.map(row => ({
    OrderNumber: row.OrderNumber || row.Name || row['Order Number'] || row.order_number || '',
    TrackingNumber: row.TrackingNumber || row['Tracking Number'] || row.tracking_number || '',
    TrackingCompany: row.TrackingCompany || row['Tracking Company'] || row.tracking_company || config.defaultTrackingCompany,
    TrackingUrl: row.TrackingUrl || row['Tracking URL'] || row.tracking_url || null
  }));
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
 * Fetch order from Shopify REST API with retry logic
 */
export const fetchOrder = async (shop, accessToken, orderNumber) => {
  return await withRetry(async () => {
    const response = await axios.get(
      `https://${shop}/admin/api/${config.shopify.apiVersion}/orders.json?status=any&order_number=${orderNumber}`,
      { 
        headers: { "X-Shopify-Access-Token": accessToken },
        timeout: 30000 // 30 second timeout
      }
    );
    return response.data.orders || [];
  });
};

/**
 * Update tracking information for an existing fulfillment with retry logic
 */
export const updateFulfillmentTracking = async (shop, accessToken, fulfillmentId, trackingInfo) => {
  return await withRetry(async () => {
    const response = await axios.post(
      `https://${shop}/admin/api/${config.shopify.apiVersion}/fulfillments/${fulfillmentId}/update_tracking.json`,
      {
        fulfillment: {
          tracking_info: {
            number: trackingInfo.number,
            company: trackingInfo.company,
            url: trackingInfo.url
          },
          notify_customer: true
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
    
    return response.body?.data?.order?.fulfillmentOrders?.edges || [];
  });
};

/**
 * Create a fulfillment for an order with retry logic
 */
export const createFulfillment = async (client, fulfillmentOrder, trackingInfo) => {
  return await withRetry(async () => {
    const response = await client.query({
      data: {
        query: CREATE_FULFILLMENT,
        variables: {
          fulfillment: {
            lineItemsByFulfillmentOrder: [
              {
                fulfillmentOrderId: fulfillmentOrder.id,
                fulfillmentOrderLineItems: fulfillmentOrder.lineItems.edges
                  .filter(item => item.node.remainingQuantity > 0)
                  .map((item) => ({
                    id: item.node.id,
                    quantity: item.node.remainingQuantity
                  }))
              }
            ],
            trackingInfo: {
              number: trackingInfo.number,
              company: trackingInfo.company,
              url: trackingInfo.url
            },
            notifyCustomer: true
          }
        }
      }
    });
    
    return response.body?.data?.fulfillmentCreateV2;
  });
};

/**
 * Build tracking URL from tracking number and company
 */
export const buildTrackingUrl = (trackingNumber, trackingCompany = null, customUrl = null) => {
  if (customUrl && customUrl.trim()) return customUrl.trim();
  
  // Check if we have a template for this carrier
  const company = trackingCompany || config.defaultTrackingCompany;
  const template = config.trackingUrlTemplates?.[company] || config.defaultTrackingUrlTemplate;
  
  return `${template}${trackingNumber}`;
};

/**
 * Process a single order for fulfillment
 */
export const processOrderFulfillment = async (order, session, client) => {
  const { shop, accessToken } = session;
  
  // Parse order data
  const orderNumberRaw = String(order.OrderNumber || order.Name || "").trim();
  const orderNumber = parseInt(orderNumberRaw.replace(/[^\d]/g, ""));
  const trackingNumber = (order.TrackingNumber || "").toString().trim();
  const trackingCompany = (order.TrackingCompany || config.defaultTrackingCompany).trim();
  const trackingUrl = buildTrackingUrl(trackingNumber, trackingCompany, order.TrackingUrl);
  
  // Validate required fields
  if (!orderNumber || !trackingNumber) {
    return {
      orderNumber: orderNumberRaw,
      trackingNumber,
      trackingCompany,
      error: "Missing Order Number or Tracking Number"
    };
  }
  
  try {
    // Fetch order from Shopify
    const matchingOrders = await fetchOrder(shop, accessToken, orderNumber);
    
    if (matchingOrders.length === 0) {
      return {
        orderNumber: orderNumberRaw,
        trackingNumber,
        trackingCompany,
        error: "Order not found"
      };
    }
    
    const orderData = matchingOrders.find(
      (o) => parseInt(o.order_number) === orderNumber
    );
    
    if (!orderData) {
      return {
        orderNumber: orderNumberRaw,
        trackingNumber,
        trackingCompany,
        error: "Order not found"
      };
    }
    
    // Handle already fulfilled orders
    if (orderData.fulfillment_status === "fulfilled") {
      return await handleFulfilledOrder(shop, accessToken, orderData, {
        orderNumberRaw,
        trackingNumber,
        trackingCompany,
        trackingUrl
      });
    }
    
    // Rate limiting between API calls
    await sleep(RATE_LIMIT_DELAY);
    
    // Get fulfillment orders
    const orderId = parseInt(orderData.id);
    const fulfillmentOrders = await getFulfillmentOrders(client, orderId);
    
    // Find fulfillable orders - OPEN, SCHEDULED, or IN_PROGRESS are valid
    const fulfillableStatuses = ["OPEN", "SCHEDULED", "IN_PROGRESS"];
    const fulfillableOrder = fulfillmentOrders.find(
      (edge) => fulfillableStatuses.includes(edge?.node?.status)
    )?.node;
    
    if (!fulfillableOrder) {
      // Check what statuses exist to give better error message
      const statuses = fulfillmentOrders.map(edge => edge?.node?.status).filter(Boolean);
      const statusList = [...new Set(statuses)].join(", ");
      
      return {
        orderNumber: orderNumberRaw,
        trackingNumber,
        trackingCompany,
        error: statuses.length > 0 
          ? `Cannot fulfill - order status: ${statusList}` 
          : "No fulfillment orders found for this order"
      };
    }
    
    // Check if there are items to fulfill
    const itemsToFulfill = fulfillableOrder.lineItems.edges.filter(
      item => item.node.remainingQuantity > 0
    );
    
    if (itemsToFulfill.length === 0) {
      return {
        orderNumber: orderNumberRaw,
        trackingNumber,
        trackingCompany,
        error: "All items in this order are already fulfilled"
      };
    }
    
    // Create fulfillment
    const result = await createFulfillment(client, fulfillableOrder, {
      number: trackingNumber,
      company: trackingCompany,
      url: trackingUrl
    });
    
    // Handle null result
    if (!result) {
      return {
        orderNumber: orderNumberRaw,
        trackingNumber,
        trackingCompany,
        error: "Fulfillment API returned no response"
      };
    }
    
    if (result.userErrors?.length) {
      return {
        orderNumber: orderNumberRaw,
        trackingNumber,
        trackingCompany,
        error: result.userErrors.map(e => e.message).join("; ") || "Fulfillment failed"
      };
    }
    
    // Check if fulfillment was created
    if (!result.fulfillment) {
      return {
        orderNumber: orderNumberRaw,
        trackingNumber,
        trackingCompany,
        error: "Fulfillment was not created - unknown reason"
      };
    }
    
    return {
      orderNumber: orderNumberRaw,
      trackingNumber,
      trackingCompany,
      status: result.fulfillment.status || "FULFILLED",
      fulfillmentId: result.fulfillment.id,
      error: null
    };
    
  } catch (err) {
    return {
      orderNumber: orderNumberRaw,
      trackingNumber,
      trackingCompany,
      error: err.message || "Unknown error"
    };
  }
};

/**
 * Handle already fulfilled orders - update tracking if needed
 */
const handleFulfilledOrder = async (shop, accessToken, orderData, trackingInfo) => {
  const { orderNumberRaw, trackingNumber, trackingCompany, trackingUrl } = trackingInfo;
  let trackingUpdated = false;
  let lastError = null;
  
  if (orderData.fulfillments && orderData.fulfillments.length > 0) {
    for (const fulfillment of orderData.fulfillments) {
      // Check if fulfillment has no tracking but we have one
      if ((!fulfillment.tracking_number || fulfillment.tracking_number === "") && trackingNumber) {
        try {
          // Rate limit between tracking updates
          await sleep(RATE_LIMIT_DELAY);
          
          await updateFulfillmentTracking(shop, accessToken, fulfillment.id, {
            number: trackingNumber,
            company: trackingCompany,
            url: trackingUrl
          });
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
        status: "Tracking updated",
        error: null
      };
    }
  }
  
  // Determine appropriate error message
  const hasAnyTracking = orderData.fulfillments?.some(
    (f) => f.tracking_number && f.tracking_number !== ""
  );
  
  let error;
  if (hasAnyTracking) {
    error = "Order already has tracking";
  } else if (!trackingNumber) {
    error = "No tracking provided in sheet";
  } else if (lastError) {
    error = `Failed to update tracking: ${typeof lastError === 'string' ? lastError : JSON.stringify(lastError)}`;
  } else {
    error = "Failed to update tracking - no eligible fulfillment found";
  }
  
  return {
    orderNumber: orderNumberRaw,
    trackingNumber: trackingNumber || "",
    trackingCompany,
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
    ["Order Number", "Tracking Number", "Tracking Company", "Status", "Details", "Fulfillment ID", "Processed At"],
    ...summary.map((r) => [
      r.orderNumber,
      r.trackingNumber || "",
      r.trackingCompany || "",
      r.error ? "Failed" : "Success",
      r.error || r.status || "Fulfilled successfully",
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
  buildTrackingUrl
};
