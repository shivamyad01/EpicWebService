/**
 * Order Routes
 * Routes for order fulfillment operations
 */

import { Router } from "express";
import { upload, handleUploadError } from "../middleware/upload.middleware.js";
import { validateFileUpload } from "../middleware/validation.middleware.js";
import {
  bulkFulfillOrders,
  getFulfillmentReport,
  downloadFulfillmentReport
} from "../controllers/order.controller.js";

const router = Router();

/**
 * POST /api/orders/bulk-fulfill
 * Bulk fulfill orders from uploaded Excel file
 */
router.post(
  "/bulk-fulfill",
  upload.single("file"),
  handleUploadError,
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
