/**
 * Order Routes
 * Routes for order fulfillment operations
 */

import { Router } from "express";
import { upload } from "../middleware/upload.middleware.js";
import { validateFileUpload } from "../middleware/validation.middleware.js";
import {
  bulkFulfillOrders,
  getFulfillmentReport,
  downloadFulfillmentReport
} from "../controllers/order.controller.js";

const router = Router();

/**
 * Wrapper to handle multer errors properly
 */
const handleFileUpload = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          error: "File too large. Maximum size is 10MB"
        });
      }
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};

/**
 * POST /api/orders/bulk-fulfill
 * Bulk fulfill orders from uploaded Excel file
 */
router.post(
  "/bulk-fulfill",
  handleFileUpload,
  validateFileUpload,
  bulkFulfillOrders
);

/**
 * GET /api/orders/fulfillment-report
 * Get the last fulfillment report
 */
router.get("/fulfillment-report", getFulfillmentReport);

/**
 * GET /api/orders/fulfillment-report/download
 * Download fulfillment report as Excel file
 */
router.get("/fulfillment-report/download", downloadFulfillmentReport);

export default router;
