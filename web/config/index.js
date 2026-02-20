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
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv"
    ],
    allowedExtensions: [".xlsx", ".xls", ".csv"]
  },
  
  shopify: {
    apiVersion: "2024-10"
  },
  
  defaultTrackingCompany: "India Post",
  defaultTrackingUrlTemplate: "https://www.indiapost.gov.in/VAS/Pages/trackconsignment.aspx?tn="
};

export default config;
