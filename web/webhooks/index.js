/**
 * Webhook Handlers
 *
 * Aggregates every webhook the app subscribes to. Handler keys are the topic
 * uppercased with "/" replaced by "_" — that is how the SDK looks them up
 * (see topicForStorage in @shopify/shopify-api), so "app_subscriptions/update"
 * must be spelled APP_SUBSCRIPTIONS_UPDATE and nothing else, or the payload
 * arrives and is silently dropped as "no handler registered".
 *
 * Keep the callbacks fast and never throw: Shopify retries a webhook that does
 * not return 200, and a handler that reliably fails will eventually get the
 * subscription removed.
 */

import { DeliveryMethod } from "@shopify/shopify-api";

import PrivacyWebhookHandlers from "../privacy.js";
import { invalidateSubscription } from "../services/billing.service.js";

const BillingWebhookHandlers = {
  /**
   * Fires on every subscription transition: a merchant subscribing, a trial
   * converting, a cancellation, a failed payment freezing the plan.
   *
   * The cached state is now wrong in both directions, so it is dropped rather
   * than updated from the payload. A merchant who just subscribed must not wait
   * out the cache TTL before they can upload, and one who cancelled must not keep
   * access for it. The next request re-reads the truth from Shopify.
   */
  APP_SUBSCRIPTIONS_UPDATE: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body) => {
      try {
        const { app_subscription: subscription } = JSON.parse(body);
        invalidateSubscription(shop);
        console.log(
          `[billing] ${shop}: plan "${subscription?.name}" -> ${subscription?.status}`
        );
      } catch (err) {
        // Still drop the cache — a payload we could not read is no reason to keep
        // serving a stale subscription state.
        invalidateSubscription(shop);
        console.error(`[billing] could not parse ${topic} for ${shop}:`, err.message);
      }
    }
  },

  /**
   * Uninstalling cancels the subscription, so the cached "active" state has to go
   * with it — otherwise a shop that reinstalls within the TTL would be let
   * straight in without a plan.
   *
   * Sessions are deliberately NOT deleted here. shopify-app-express registers its
   * own APP_UNINSTALLED handler that already does it (deleteAppInstallationHandler),
   * and processWebhooks merges the two — the boot log says as much: "Detected
   * multiple handlers for 'APP_UNINSTALLED', webhooks.process will call them
   * sequentially". Both run, so doing it again here would be duplicate work
   * against the session store for no gain.
   */
  APP_UNINSTALLED: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop) => {
      invalidateSubscription(shop);
      console.log(`[billing] ${shop} uninstalled, dropped cached subscription state`);
    }
  }
};

export default {
  ...PrivacyWebhookHandlers,
  ...BillingWebhookHandlers
};
