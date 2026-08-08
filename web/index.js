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
app.use(serveStatic(config.staticPath, { index: false }));

// =============================================================================
// FRONTEND SERVING
// =============================================================================
app.use("/", async (req, res) => {
  const shop = req.query.shop || res.locals.shopify?.session?.shop;
  if (!shop) {
    return res.status(400).send("Missing shop parameter");
  }

  return shopify.ensureInstalledOnShop()(req, res, () => {
    res
      .status(200)
      .set("Content-Type", "text/html")
      .send(
        readFileSync(join(config.staticPath, "index.html"))
          .toString()
          .replace("%VITE_SHOPIFY_API_KEY%", process.env.SHOPIFY_API_KEY || "")
      );
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
