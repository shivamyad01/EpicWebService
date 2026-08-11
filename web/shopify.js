import { ApiVersion } from "@shopify/shopify-api";
import { shopifyApp } from "@shopify/shopify-app-express";
import { SQLiteSessionStorage } from "@shopify/shopify-app-session-storage-sqlite";

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
    // Pinned rather than tracked, so a library upgrade cannot move the app to a
    // version its queries were never checked against.
    //
    // Shopify supports each version for 12 months and then falls forward: a
    // request naming a retired version is served by the oldest one still
    // accessible. This was pinned to 2024-10, retired in 2025, so every call was
    // already being answered by a version nobody here had tested. Keep it inside
    // the support window, and in step with shopify.app.toml's `api_version` and
    // config.shopify.apiVersion, which builds the REST URLs.
    //
    // restResources is deliberately not passed: nothing in the app uses the REST
    // resource classes (the two REST calls it does make are hand-rolled through
    // axios), and importing them would pin a second, separate version here.
    apiVersion: ApiVersion.July26,
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
