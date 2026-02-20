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
import PrivacyWebhookHandlers from "./privacy.js";
import config from "./config/index.js";
import { orderRoutes, settingsRoutes } from "./routes/index.js";

const app = express();

// =============================================================================
// AUTHENTICATION ROUTES (Public)
// =============================================================================
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);

// =============================================================================
// WEBHOOKS (Public)
// =============================================================================
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: PrivacyWebhookHandlers })
);

// =============================================================================
// API MIDDLEWARE
// =============================================================================
app.use("/api/*", shopify.validateAuthenticatedSession());
app.use(express.json());

// =============================================================================
// API ROUTES
// =============================================================================
app.use("/api/orders", orderRoutes);
app.use("/api/settings", settingsRoutes);

// =============================================================================
// STATIC FILES & CSP
// =============================================================================
app.use(shopify.cspHeaders());
app.use(serveStatic(config.staticPath, { index: false }));

// =============================================================================
// FRONTEND SERVING
// =============================================================================
app.use("/*", async (req, res) => {
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
// SERVER STARTUP
// =============================================================================
app.listen(config.port, () => {
  console.log(`🚀 Server is running on port ${config.port}`);
});
