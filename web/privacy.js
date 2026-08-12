import { DeliveryMethod } from "@shopify/shopify-api";

import { deleteFulfillmentSummary } from "./services/fulfillment.service.js";
import { deleteRunRecord } from "./services/run.service.js";
import { deleteSettings } from "./services/settings.service.js";
import { invalidateSubscription } from "./services/billing.service.js";

/**
 * Shopify's mandatory privacy webhooks.
 *
 * These arrived as the template's stubs: parse the payload, do nothing. That is
 * only defensible for an app that stores nothing, and this one stores the last
 * fulfillment run per shop under config.reportDir — order names, tracking
 * numbers and carriers — which shop/redact is required to erase.
 *
 * What the app holds, and where. This list is the redaction checklist — anything
 * added to it that is not deleted below is data left behind after a merchant asked
 * for it to be gone:
 *   - reports/{shop}.json      the last run's report. Shop data. Deleted below.
 *   - reports/{shop}.run.json  that run's status and counts. Deleted below.
 *   - shop_settings (sqlite)   the notification preference. Deleted below.
 *   - the session store        access token per shop. Deleted by the SDK's own
 *                              app/uninstalled handler, before redaction is due.
 *   - an in-memory cache       subscription state, the last report and any live
 *                              run, dropped here too so a restart cannot
 *                              resurrect them.
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
      // Each one is attempted independently. A failure part-way through must not
      // leave the rest of the shop's data behind.
      const removed = [];

      try {
        if (deleteFulfillmentSummary(shop)) removed.push("report");
      } catch (err) {
        console.error(`[privacy] ${shop}: could not delete the report:`, err.message);
      }

      try {
        if (deleteRunRecord(shop)) removed.push("run record");
      } catch (err) {
        console.error(`[privacy] ${shop}: could not delete the run record:`, err.message);
      }

      try {
        if (await deleteSettings(shop)) removed.push("settings");
      } catch (err) {
        console.error(`[privacy] ${shop}: could not delete settings:`, err.message);
      }

      try {
        invalidateSubscription(shop);
      } catch (err) {
        console.error(`[privacy] ${shop}: could not drop cached billing state:`, err.message);
      }

      console.log(
        `[privacy] shop/redact for ${shop}: ${
          removed.length ? `deleted ${removed.join(", ")}` : "nothing stored"
        }`
      );
    },
  },
};
