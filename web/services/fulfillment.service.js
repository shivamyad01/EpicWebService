/**
 * Fulfillment Service
 * Business logic for order fulfillment operations
 */

import axios from "axios";
import xlsx from "xlsx";
import fs from "fs";
import { GET_FULFILLMENT_ORDERS, CREATE_FULFILLMENT } from "../utils/graphql.queries.js";
import config from "../config/index.js";

// In-memory store for fulfillment summaries (per shop)
// In production, consider using Redis or database
const fulfillmentSummaries = new Map();

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
 * Parse Excel file and extract order data
 */
export const parseExcelFile = (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet);
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
 * Fetch order from Shopify REST API
 */
export const fetchOrder = async (shop, accessToken, orderNumber) => {
  const response = await axios.get(
    `https://${shop}/admin/api/${config.shopify.apiVersion}/orders.json?status=any&order_number=${orderNumber}`,
    { headers: { "X-Shopify-Access-Token": accessToken } }
  );
  return response.data.orders || [];
};

/**
 * Update tracking information for an existing fulfillment
 */
export const updateFulfillmentTracking = async (shop, accessToken, fulfillmentId, trackingInfo) => {
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
      }
    }
  );
  return response.data;
};

/**
 * Get open fulfillment orders for an order
 */
export const getFulfillmentOrders = async (client, orderId) => {
  const gid = `gid://shopify/Order/${orderId}`;
  
  const response = await client.query({
    data: {
      query: GET_FULFILLMENT_ORDERS,
      variables: { id: gid }
    }
  });
  
  return response.body?.data?.order?.fulfillmentOrders?.edges || [];
};

/**
 * Create a fulfillment for an order
 */
export const createFulfillment = async (client, fulfillmentOrder, trackingInfo) => {
  const response = await client.query({
    data: {
      query: CREATE_FULFILLMENT,
      variables: {
        fulfillment: {
          lineItemsByFulfillmentOrder: [
            {
              fulfillmentOrderId: fulfillmentOrder.id,
              fulfillmentOrderLineItems: fulfillmentOrder.lineItems.edges.map((item) => ({
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
};

/**
 * Build tracking URL from tracking number
 */
export const buildTrackingUrl = (trackingNumber, customUrl = null) => {
  if (customUrl) return customUrl;
  return `${config.defaultTrackingUrlTemplate}${trackingNumber}`;
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
  const trackingCompany = order.TrackingCompany || config.defaultTrackingCompany;
  const trackingUrl = buildTrackingUrl(trackingNumber, order.TrackingUrl);
  
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
    
    // Get fulfillment orders
    const orderId = parseInt(orderData.id);
    const fulfillmentOrders = await getFulfillmentOrders(client, orderId);
    
    const openFulfillmentOrder = fulfillmentOrders.find(
      (edge) => edge?.node?.status === "OPEN"
    )?.node;
    
    if (!openFulfillmentOrder) {
      return {
        orderNumber: orderNumberRaw,
        trackingNumber,
        trackingCompany,
        error: "No OPEN fulfillment order found. All are in unfulfillable state."
      };
    }
    
    // Create fulfillment
    const result = await createFulfillment(client, openFulfillmentOrder, {
      number: trackingNumber,
      company: trackingCompany,
      url: trackingUrl
    });
    
    if (result.userErrors?.length) {
      return {
        orderNumber: orderNumberRaw,
        trackingNumber,
        trackingCompany,
        error: result.userErrors[0].message || "Fulfillment failed"
      };
    }
    
    return {
      orderNumber: orderNumberRaw,
      trackingNumber,
      trackingCompany,
      status: result.fulfillment.status,
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
  
  if (orderData.fulfillments && orderData.fulfillments.length > 0) {
    for (const fulfillment of orderData.fulfillments) {
      // Check if fulfillment has no tracking but we have one
      if ((!fulfillment.tracking_number || fulfillment.tracking_number === "") && trackingNumber) {
        try {
          await updateFulfillmentTracking(shop, accessToken, fulfillment.id, {
            number: trackingNumber,
            company: trackingCompany,
            url: trackingUrl
          });
          trackingUpdated = true;
        } catch (updateError) {
          console.error(
            "Error updating tracking for fulfillment",
            fulfillment.id,
            ":",
            updateError.response?.data || updateError.message
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
  
  return {
    orderNumber: orderNumberRaw,
    trackingNumber: trackingNumber || "",
    trackingCompany,
    error: hasAnyTracking
      ? "Order already has tracking"
      : trackingNumber
        ? "Failed to update tracking"
        : "No tracking provided in sheet"
  };
};

/**
 * Generate fulfillment report as Excel buffer
 */
export const generateFulfillmentReport = (summary) => {
  const workbook = xlsx.utils.book_new();
  const sheetData = [
    ["Order Number", "Tracking Number", "Tracking Company", "Status", "Reason"],
    ...summary.map((r) => [
      r.orderNumber,
      r.trackingNumber || "",
      r.trackingCompany || "",
      r.error ? "Failed" : "Success",
      r.error || "Fulfilled successfully"
    ])
  ];
  
  const worksheet = xlsx.utils.aoa_to_sheet(sheetData);
  xlsx.utils.book_append_sheet(workbook, worksheet, "Fulfillment Report");
  
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
