/**
 * Order Routes
 * Routes for order fulfillment operations
 */

import { Router } from "express";
import { upload } from "../middleware/upload.middleware.js";
import { validateFileUpload } from "../middleware/validation.middleware.js";
import { requireActiveSubscription } from "../middleware/billing.middleware.js";
import {
  bulkFulfillOrders,
  getFulfillmentReport,
  downloadFulfillmentReport,
  downloadSampleFile,
  downloadPendingOrdersSheet,
  listPendingOrders
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
 *
 * The subscription check runs ahead of the upload handler on purpose: a rejected
 * request should not spend a 10MB write to the uploads volume first, and skipping
 * multer means there is no temp file left to clean up.
 */
router.post(
  "/bulk-fulfill",
  requireActiveSubscription,
  handleFileUpload,
  validateFileUpload,
  bulkFulfillOrders
);

/**
 * GET /api/orders/fulfillment-report
 * Get the last fulfillment report
 *
 * Deliberately not behind requireActiveSubscription. This report covers work the
 * merchant has already paid for, and a cancelled or lapsed plan should not lock
 * them out of their own fulfillment record.
 */
router.get("/fulfillment-report", getFulfillmentReport);

/**
 * GET /api/orders/fulfillment-report/download
 * Download fulfillment report as Excel file — ungated, as above.
 */
router.get("/fulfillment-report/download", downloadFulfillmentReport);

/**
 * GET /api/orders/sample-file
 * The example spreadsheet, with the carrier dropdown — ungated, so a merchant
 * can see the expected format before choosing a plan.
 */
router.get("/sample-file", downloadSampleFile);

/**
 * GET /api/orders/pending-sheet?from=&to=&status=
 * The same workbook as the sample, with OrderNumber already filled in from the
 * orders in the requested bucket. Ungated, like the two downloads above.
 *
 * `status` is one of STATUS_FILTERS: unfulfilled | fulfilled | untracked | all.
 * `untracked` is the shipped-but-no-tracking-number bucket, whose rows the bulk
 * upload resolves by attaching tracking to the existing fulfillment rather than
 * creating a new one.
 */
router.get("/pending-sheet", downloadPendingOrdersSheet);

/**
 * POST /api/orders/pending-sheet
 * As above, but the body may carry `only: ["V-305596", ...]` to narrow the
 * sheet to the orders the merchant selected on the Orders page.
 */
router.post("/pending-sheet", downloadPendingOrdersSheet);

/**
 * GET /api/orders/pending?from=&to=&status=
 * The same orders as JSON, for the Orders page to list before downloading, plus
 * per-bucket counts for the range.
 *
 * `counts.untracked` is present only when status=untracked was asked for: it is
 * produced by the scan itself, since no count query can express "has no tracking".
 */
router.get("/pending", listPendingOrders);

export default router;
