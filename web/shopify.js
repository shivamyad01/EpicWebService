import { ApiVersion } from "@shopify/shopify-api";
import { shopifyApp } from "@shopify/shopify-app-express";
import { SQLiteSessionStorage } from "@shopify/shopify-app-session-storage-sqlite";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-10";

// Sessions must live on the mounted volume. docker-compose mounts app_data at
// /app/data, so writing to the working directory instead put the database on the
// container's own filesystem: every image update wiped it and forced all merchants
// to reinstall the app. SESSION_DB_PATH overrides it for local development.
export const DB_PATH =
  process.env.SESSION_DB_PATH ||
  (process.env.NODE_ENV === "production"
    ? "/app/data/database.sqlite"
    : `${process.cwd()}/database.sqlite`);

/**
 * The adapter's default table name. Exported so the token backfill script can
 * enumerate shops — the storage interface can look sessions up by shop but has no
 * way to list them, and duplicating this string in the script would leave two
 * places to change if the table is ever renamed.
 */
export const SESSION_TABLE_NAME = "shopify_sessions";

const shopify = shopifyApp({
  api: {
    // Pinned rather than tracked. LATEST_API_VERSION used to supply this, but it
    // silently moved the app to whatever version the library shipped with — the
    // boot log warned about exactly that, since the REST resources below are
    // 2024-10. shopify-app-express v6 removed the constant and made this required.
    // Keep in step with shopify.app.toml's `api_version`.
    apiVersion: ApiVersion.October24,
    restResources,
    future: {
      customerAddressDefaultFix: true,
      lineItemBilling: true,
      // Required for Managed Pricing: it is what lets billing.check() run with
      // no `billing` config and return the full subscription object rather than
      // a bare boolean. See services/billing.service.js.
      unstable_managedPricingSupport: true,
    },
    // Left undefined on purpose. Plans are defined in the Partner Dashboard under
    // Managed Pricing, so the app must not declare its own — an app that has both
    // can charge a merchant twice for the same plan.
    billing: undefined,
  },
  auth: {
    path: "/api/auth",
    callbackPath: "/api/auth/callback",
  },
  webhooks: {
    path: "/api/webhooks",
  },
  // This should be replaced with your preferred storage strategy
  sessionStorage: new SQLiteSessionStorage(DB_PATH),
});

export default shopify;
