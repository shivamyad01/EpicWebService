/**
 * Billing Middleware
 * Gates the paid actions behind an active subscription.
 */

import config from "../config/index.js";
import { getSubscriptionState } from "../services/billing.service.js";

/**
 * Require an active subscription for this route.
 *
 * Runs after shopify.validateAuthenticatedSession(), so the session is already on
 * res.locals. Responds 402 with the pricing page URL when there is no plan, which
 * is what lets the frontend tell "you need to subscribe" apart from a genuine
 * failure — a 403 would look identical to an auth problem.
 *
 * Gate the actions that cost money to run, not the ones that read back work the
 * merchant already paid for. Downloading a past report stays open on purpose.
 */
export const requireActiveSubscription = async (req, res, next) => {
  const session = res.locals.shopify?.session;

  if (!session) {
    return res.status(401).json({ error: "No authenticated session" });
  }

  let state;
  try {
    state = await getSubscriptionState(session);
  } catch (err) {
    console.error(`[billing] check failed for ${session.shop}:`, err.message);

    if (config.billing.failOpen) {
      // Let the run through, but leave a trail. An upload that should have been
      // blocked can be reconciled later; a shipping day lost to our outage cannot.
      console.warn(`[billing] failing open for ${session.shop}`);
      return next();
    }

    return res.status(503).json({
      error: "billing_check_failed",
      message: "Could not verify your subscription just now. Please try again."
    });
  }

  if (state.active) {
    // Downstream handlers can read the plan without repeating the lookup
    res.locals.subscription = state;
    return next();
  }

  return res.status(402).json({
    error: "subscription_required",
    // Kept neutral on purpose. A FROZEN or EXPIRED subscription is absent from
    // activeSubscriptions and lands here too, so "you never subscribed" would be
    // wrong for a merchant whose payment simply failed.
    message: "An active plan is required to fulfill orders in bulk.",
    pricingUrl: state.pricingUrl
  });
};

export default { requireActiveSubscription };
