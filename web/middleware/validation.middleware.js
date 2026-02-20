/**
 * Validation Middleware
 * Input validation for API requests
 */

/**
 * Validate that a file was uploaded
 */
export const validateFileUpload = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  next();
};

/**
 * Validate settings request body
 */
export const validateSettings = (req, res, next) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: "No settings provided" });
  }
  next();
};

/**
 * Validate order data from Excel
 */
export const validateOrderData = (order) => {
  const errors = [];
  
  const orderNumber = String(order.OrderNumber || order.Name || "").trim();
  const trackingNumber = (order.TrackingNumber || "").toString().trim();
  
  if (!orderNumber) {
    errors.push("Missing Order Number");
  }
  
  if (!trackingNumber) {
    errors.push("Missing Tracking Number");
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    data: {
      orderNumber,
      trackingNumber,
      trackingCompany: (order.TrackingCompany || "India Post").trim(),
      trackingUrl: order.TrackingUrl || null
    }
  };
};

export default {
  validateFileUpload,
  validateSettings,
  validateOrderData
};
