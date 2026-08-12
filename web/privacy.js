import { DeliveryMethod } from "@shopify/shopify-api";

import { deleteFulfillmentSummary } from "./services/fulfillment.service.js";
import { invalidateSubscription } from "./services/billing.service.js";

/**
 * Shopify's mandatory privacy webhooks.
 *
 * These arrived as the template's stubs: parse the payload, do nothing. That is
 * only defensible for an app that stores nothing, and this one stores the last
 * fulfillment run per shop under config.reportDir — order names, tracking
 * numbers and carriers — which shop/redact is required to erase.
 *
 * What the app holds, and where:
 *   - reports/{shop}.json   the last run's report. Shop data. Deleted below.
 *   - the session store     access token per shop. Deleted by the SDK's own
 *                           app/uninstalled handler, before redaction is due.
 *   - an in-memory cache    subscription state and the last report, dropped here
 *                           too so a restart cannot resurrect either.
 *
 * No customer names, emails, phone numbers or addresses are ever read or kept —
 * the app works from order names and tracking numbers a merchant types into a
 * spreadsheet, and never queries a customer.
 *
 * @type {{[key: string]: import("@shopify/shopify-api").WebhookHandler}}
 */
export default {
  /**
   * Customers can request their data from a store owner. When this happens,
   * Shopify invokes this privacy webhook.
   *
   * The app holds no customer-identifying data to hand back — see above — so
   * there is nothing to assemble. The log line is the audit trail showing the
   * request was received and considered.
   *
   * https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks#customers-data_request
   */
  CUSTOMERS_DATA_REQUEST: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (_topic, shop) => {
      console.log(
        `[privacy] customers/data_request for ${shop}: the app stores no customer data`
      );
    },
  },

  /**
   * Store owners can request that data is deleted on behalf of a customer. When
   * this happens, Shopify invokes this privacy webhook.
   *
   * Nothing to erase for the same reason: the stored report is keyed by order
   * name and carries no customer identifiers, and it is overwritten by the next
   * upload. shop/redact below removes it outright.
   *
   * https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks#customers-redact
   */
  CUSTOMERS_REDACT: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (_topic, shop) => {
      console.log(
        `[privacy] customers/redact for ${shop}: the app stores no customer data`
      );
    },
  },

  /**
   * 48 hours after a store owner uninstalls your app, Shopify invokes this
   * privacy webhook.
   *
   * This is the one that has work to do. Never throws: Shopify retries a webhook
   * that does not return 200, and a redaction that fails loudly every time is
   * worse than one that reports what it could not remove.
   *
   * https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks#shop-redact
   */
  SHOP_REDACT: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (_topic, shop) => {
      try {
        const had = deleteFulfillmentSummary(shop);
        invalidateSubscription(shop);
        console.log(
          `[privacy] shop/redact for ${shop}: ${
            had ? "fulfillment report deleted" : "no stored report"
          }, cached state dropped`
        );
      } catch (err) {
        console.error(`[privacy] shop/redact failed for ${shop}:`, err.message);
      }
    },
  },
};
