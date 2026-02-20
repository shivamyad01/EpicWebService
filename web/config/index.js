/**
 * Application Configuration
 * Centralized configuration management
 */

export const config = {
  port: parseInt(process.env.BACKEND_PORT || process.env.PORT || "3000", 10),
  
  staticPath: process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`,
  
  upload: {
    dest: "uploads/",
    maxFileSize: 10 * 1024 * 1024, // 10MB for larger files
    allowedMimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv"
    ],
    allowedExtensions: [".xlsx", ".xls", ".csv"]
  },
  
  shopify: {
    apiVersion: "2024-10"
  },
  
  // Fulfillment settings
  fulfillment: {
    maxOrdersPerRequest: 500,
    batchSize: 10,
    batchDelayMs: 500,
    rateLimitDelayMs: 250,
    maxRetries: 3,
    retryDelayMs: 1000
  },
  
  defaultTrackingCompany: "India Post",
  defaultTrackingUrlTemplate: "https://www.indiapost.gov.in/VAS/Pages/trackconsignment.aspx?tn=",
  
  // Common tracking URL templates by company
  trackingUrlTemplates: {
    "India Post": "https://www.indiapost.gov.in/VAS/Pages/trackconsignment.aspx?tn=",
    "BlueDart": "https://www.bluedart.com/tracking?ref=",
    "Delhivery": "https://www.delhivery.com/track/package/",
    "DTDC": "https://www.dtdc.in/tracking.asp?strCnno=",
    "FedEx": "https://www.fedex.com/fedextrack/?tracknumbers=",
    "DHL": "https://www.dhl.com/en/express/tracking.html?AWB="
  }
};

export default config;
