/**
 * Billing Routes
 * Routes for subscription state
 *
 * There is no "subscribe" route by design. With Managed Pricing the merchant is
 * sent to Shopify's hosted pricing page (see pricingPageUrl), which is the only
 * place a plan may be *started*. Cancelling is the one lifecycle step the app
 * performs itself, because there is a single plan and therefore nothing to switch
 * between on the hosted page.
 */

import { Router } from "express";
import { getBillingStatus, cancelPlan } from "../controllers/billing.controller.js";

const router = Router();

/**
 * GET /api/billing/status
 * Current plan, trial end, and where to subscribe
 */
router.get("/status", getBillingStatus);

/**
 * POST /api/billing/cancel
 * Cancel the active subscription. No body — the subscription comes from the session.
 */
router.post("/cancel", cancelPlan);

export default router;
