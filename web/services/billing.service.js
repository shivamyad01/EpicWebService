/**
 * Billing Service — Shopify Managed Pricing
 *
 * Plans live in the Partner Dashboard, so this app never creates a charge. It
 * answers two questions only: does this shop have an active subscription, and
 * where do I send the merchant if it does not.
 */

import shopify from "../shopify.js";
import config from "../config/index.js";

// shop -> { checkedAt, state }. Every miss is a GraphQL call against the shop, and
// a single upload triggers several requests, so the result is held briefly.
const cache = new Map();

/**
 * Drop a shop's cached subscription state.
 *
 * Called from the app_subscriptions/update webhook: the cached answer is wrong in
 * both directions after a plan change. A merchant who just subscribed must not
 * wait out the TTL to use the app, and one who cancelled must not keep access for
 * it.
 */
export const invalidateSubscription = (shop) => {
  cache.delete(shop);
};

/**
 * Shopify's hosted plan-selection page — the page in the merchant's admin, not
 * one we render. With Managed Pricing every plan change happens there, so this URL
 * is the only route the app offers to subscribing.
 *
 * The store handle is the myshopify subdomain, and the app handle comes from
 * shopify.app.toml.
 */
export const pricingPageUrl = (shop) => {
  const storeHandle = String(shop || "").replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${storeHandle}/charges/${config.billing.appHandle}/pricing_plans`;
};

/**
 * When the free trial ends, derived.
 *
 * AppSubscription carries `trialDays` and `createdAt` but no end date, so it has
 * to be computed. Returns null when the trial has already elapsed or the plan
 * never had one, so callers can treat a non-null value as "still in trial".
 */
const trialEndsAt = (subscription) => {
  if (!subscription?.trialDays || !subscription.createdAt) return null;

  const end = new Date(subscription.createdAt);
  if (Number.isNaN(end.getTime())) return null;

  end.setDate(end.getDate() + subscription.trialDays);
  return end > new Date() ? end.toISOString() : null;
};

/**
 * The recurring price Shopify holds for this subscription.
 *
 * Read from the API rather than written down here. With Managed Pricing the amount
 * is edited in the Partner Dashboard, so a number duplicated in the app would
 * start lying the first time it changes there — and a wrong price shown to a
 * merchant is worse than showing none. Returns null when there is nothing
 * recurring to report.
 */
const recurringPrice = (subscription) => {
  for (const item of subscription?.lineItems || []) {
    const details = item?.plan?.pricingDetails;
    if (details?.price?.amount != null && details?.interval) {
      const amount = Number(details.price.amount);
      if (Number.isNaN(amount)) continue;
      return {
        amount,
        currencyCode: details.price.currencyCode || "USD",
        interval: details.interval
      };
    }
  }
  return null;
};

/**
 * Current subscription state for a shop.
 *
 * `plans` is deliberately NOT passed to billing.check. That option filters on the
 * plan *name*, so naming "Basic" here would deny access to every merchant the day
 * a second plan is added in the Partner Dashboard. Any active subscription counts,
 * and the plan name is reported back so tier checks can be added later without
 * changing the gate.
 *
 * `force` skips the cache. It exists for the "Refresh status" button on the Plan
 * page: a merchant who has just subscribed and is looking straight at a stale
 * "no plan" answer needs a way out that does not involve waiting, and the webhook
 * cannot be relied on for that — it may not be deployed yet, or may be late.
 */
export const getSubscriptionState = async (session, { force = false } = {}) => {
  const cached = cache.get(session.shop);
  if (!force && cached && Date.now() - cached.checkedAt < config.billing.cacheTtlMs) {
    return cached.state;
  }

  // isTest defaults to TRUE in the SDK. Left implicit, a test charge would unlock
  // the app on a real merchant's shop, so it is always passed explicitly.
  const { hasActivePayment, appSubscriptions } = await shopify.api.billing.check({
    session,
    isTest: config.billing.acceptTestCharges
  });

  // An app holds at most one active subscription per shop, so there is nothing to
  // choose between here.
  const subscription = appSubscriptions?.[0] || null;

  const state = {
    active: Boolean(hasActivePayment),
    planName: subscription?.name || null,
    test: subscription?.test ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd || null,
    trialEndsAt: trialEndsAt(subscription),
    price: recurringPrice(subscription),
    pricingUrl: pricingPageUrl(session.shop)
  };

  cache.set(session.shop, { checkedAt: Date.now(), state });
  return state;
};

/**
 * The raw active subscription, for the operations that need its id.
 *
 * Deliberately not folded into the client-facing state: the browser has no use for
 * a subscription id, and a cancel endpoint that read one from the request body
 * would be trusting a parameter it never needed.
 */
const fetchActiveSubscription = async (session) => {
  const { appSubscriptions } = await shopify.api.billing.check({
    session,
    isTest: config.billing.acceptTestCharges
  });
  return appSubscriptions?.[0] || null;
};

/**
 * Cancel the shop's active subscription.
 *
 * The subscription is looked up server-side rather than passed in, so there is no
 * id for a caller to get wrong. Cancelling is idempotent from the merchant's point
 * of view: with nothing active, this reports success rather than failing, because
 * "cancel" and "already cancelled" want the same outcome on screen.
 *
 * Note that access ends immediately — Shopify removes a cancelled subscription
 * from activeSubscriptions at once, so the gate closes on the next request. That
 * is why prorateOnCancel exists.
 */
export const cancelSubscription = async (session) => {
  const subscription = await fetchActiveSubscription(session);

  if (!subscription) {
    invalidateSubscription(session.shop);
    return { cancelled: false, reason: "no_active_subscription", planName: null };
  }

  await shopify.api.billing.cancel({
    session,
    subscriptionId: subscription.id,
    prorate: config.billing.prorateOnCancel
  });

  // The cached state still says "active" and is now wrong. Dropping it here means
  // the answer does not depend on the webhook arriving first.
  invalidateSubscription(session.shop);

  console.log(`[billing] ${session.shop}: cancelled "${subscription.name}"`);

  return { cancelled: true, reason: null, planName: subscription.name };
};

/**
 * State to report when the lookup itself failed.
 *
 * It mirrors config.billing.failOpen so the banner in the UI and the gate on the
 * upload route never disagree: with failOpen on, an outage must not show a paywall
 * for uploads that are still being accepted.
 */
export const unknownSubscriptionState = (shop) => ({
  active: config.billing.failOpen,
  unknown: true,
  planName: null,
  test: null,
  currentPeriodEnd: null,
  trialEndsAt: null,
  price: null,
  pricingUrl: pricingPageUrl(shop)
});

export default {
  getSubscriptionState,
  cancelSubscription,
  invalidateSubscription,
  unknownSubscriptionState,
  pricingPageUrl
};
