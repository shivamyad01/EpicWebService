/**
 * Billing Controller
 * Handles billing-related HTTP requests
 */

import {
  getSubscriptionState,
  cancelSubscription,
  unknownSubscriptionState
} from "../services/billing.service.js";

/**
 * Subscription state for the current shop.
 *
 * Always answers 200, even when the lookup failed: the app shell calls this on
 * every load, and a 500 here would break the page for a merchant whose
 * subscription is perfectly fine. A failed lookup returns the `unknown` state
 * instead, which follows the same fail-open policy as the upload gate so the two
 * cannot contradict each other.
 */
export const getBillingStatus = async (req, res) => {
  const session = res.locals.shopify.session;

  // ?refresh=1 bypasses the cache, for the "Refresh status" button on the Plan
  // page. Safe to expose: the route already requires an authenticated merchant
  // session, and the cost is one GraphQL call against their own shop.
  const force = req.query.refresh === "1" || req.query.refresh === "true";

  try {
    const state = await getSubscriptionState(session, { force });
    return res.status(200).json(state);
  } catch (error) {
    console.error(`[billing] status lookup failed for ${session.shop}:`, error.message);
    return res.status(200).json(unknownSubscriptionState(session.shop));
  }
};

/**
 * Cancel the current plan.
 *
 * Takes no body on purpose — the subscription is resolved from the session, so
 * there is nothing for a caller to pass or spoof.
 *
 * The fresh state is returned alongside the result so the page can re-render from
 * one round trip instead of cancelling and then racing a status request against
 * Shopify's own propagation.
 */
export const cancelPlan = async (req, res) => {
  const session = res.locals.shopify.session;

  try {
    const result = await cancelSubscription(session);
    const state = await getSubscriptionState(session, { force: true });
    return res.status(200).json({ ...result, state });
  } catch (error) {
    console.error(`[billing] cancel failed for ${session.shop}:`, error.message);
    // 502 rather than 500: the failure is Shopify refusing or being unreachable,
    // and the merchant's plan is untouched either way.
    return res.status(502).json({
      error: "cancel_failed",
      message:
        "We couldn't cancel your plan just now. Please try again, or cancel from Settings → Apps and sales channels in your Shopify admin."
    });
  }
};

export default { getBillingStatus, cancelPlan };
