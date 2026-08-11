/**
 * Main Application Entry Point
 * Bulk Order Fulfillment App for Shopify
 */

import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";

// Internal imports
import shopify from "./shopify.js";
import WebhookHandlers from "./webhooks/index.js";
import config from "./config/index.js";
import { orderRoutes, settingsRoutes, billingRoutes } from "./routes/index.js";
import { refreshOfflineToken, upgradeTokenAfterOAuth } from "./middleware/token.middleware.js";
import { preloadTagsFor } from "./utils/assetPreload.js";

const app = express();

// =============================================================================
// HEALTH CHECK (Public)
// =============================================================================
// Registered first, and deliberately not under /api, so it escapes both the session
// check and the catch-all frontend handler below — the latter answers 400 to
// anything without a ?shop=, which is why the container healthcheck used to point
// at /api/auth and never got a 200 out of it.
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", port: config.port });
});

// =============================================================================
// AUTHENTICATION ROUTES (Public)
// =============================================================================
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  // OAuth still hands back a non-expiring token; swap it before the merchant lands.
  upgradeTokenAfterOAuth,
  shopify.redirectToShopifyOrAppRoot()
);

// =============================================================================
// WEBHOOKS (Public)
// =============================================================================
// Registered before the /api session check below, so Express matches this route
// first. Webhooks carry an HMAC instead of a session and would be rejected by it.
// It must also stay ahead of express.json(), which would consume the raw body the
// HMAC is computed over.
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: WebhookHandlers })
);

// =============================================================================
// API MIDDLEWARE
// =============================================================================
// Express 5 matches all subpaths from a plain prefix, so the "/*" suffix these
// used to carry is both unnecessary and no longer valid syntax.
app.use("/api", refreshOfflineToken, shopify.validateAuthenticatedSession());
app.use(express.json());

// =============================================================================
// API ROUTES
// =============================================================================
app.use("/api/orders", orderRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/billing", billingRoutes);

// =============================================================================
// STATIC FILES & CSP
// =============================================================================
app.use(shopify.cspHeaders());

// Vite fingerprints everything it writes into assets/, so a cached hit there can
// never be stale — the filename changes whenever the contents do. Without this
// serve-static sends no Cache-Control at all, and the browser revalidates every
// script, stylesheet and image on each load. Clicking a nav item reloads this
// whole document, so that was a round trip per asset before anything appeared.
//
// Only in production: outside it staticPath points at the frontend source, where
// the filenames carry no hash and freezing them for a year would be a trap.
const IS_PRODUCTION = process.env.NODE_ENV === "production";

app.use(
  serveStatic(config.staticPath, {
    index: false,
    setHeaders: (res, filePath) => {
      if (IS_PRODUCTION && /[\\/]assets[\\/]/.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  })
);

// =============================================================================
// FRONTEND SERVING
// =============================================================================
// Read once and kept. This used to be a synchronous readFileSync plus a string
// replace on every page load, and a nav click is a page load.
//
// Not cached outside production, where the file on disk is the source template
// and is expected to change under a running server.
let cachedIndexHtml = null;

const indexHtml = () => {
  if (cachedIndexHtml && IS_PRODUCTION) {
    return cachedIndexHtml;
  }

  cachedIndexHtml = readFileSync(join(config.staticPath, "index.html"))
    .toString()
    .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || "");

  return cachedIndexHtml;
};

/**
 * The document, with the incoming page's chunk named in the head so the browser
 * fetches it next to the entry bundle rather than a round trip later.
 */
const documentFor = (pathname) => {
  const preloads = preloadTagsFor(config.staticPath, pathname);
  const html = indexHtml();

  return preloads ? html.replace("</head>", `  ${preloads}\n  </head>`) : html;
};

app.use("/", async (req, res) => {
  const shop = req.query.shop || res.locals.shopify?.session?.shop;
  if (!shop) {
    return res.status(400).send("Missing shop parameter");
  }

  return shopify.ensureInstalledOnShop()(req, res, () => {
    res
      .status(200)
      .set("Content-Type", "text/html")
      // The document names the fingerprinted assets, so it is the one thing that
      // must never be served from cache — a stale copy would point at bundles
      // that no longer exist. no-cache still allows a 304, so it costs one small
      // conditional request rather than a download.
      .set("Cache-Control", "no-cache")
      .send(documentFor(req.path));
  });
});

// =============================================================================
// GLOBAL ERROR HANDLER
// =============================================================================
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  
  // Don't expose internal errors to clients
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === "production" 
    ? "An unexpected error occurred" 
    : err.message;
  
  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack })
  });
});


// =============================================================================
// SERVER STARTUP
// =============================================================================
const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`🚀 Server is running on port ${config.port}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Listening on: 0.0.0.0:${config.port}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
