/**
 * Route Index
 * Aggregates all routes
 */

import orderRoutes from "./order.routes.js";
import settingsRoutes from "./settings.routes.js";

export { orderRoutes, settingsRoutes };

/**
 * Register all routes with the Express app
 */
export const registerRoutes = (app, shopify) => {
  // Public routes (auth)
  app.get(shopify.config.auth.path, shopify.auth.begin());
  app.get(
    shopify.config.auth.callbackPath,
    shopify.auth.callback(),
    shopify.redirectToShopifyOrAppRoot()
  );

  // API routes (authenticated)
  app.use("/api/orders", orderRoutes);
  app.use("/api/settings", settingsRoutes);
};

export default {
  orderRoutes,
  settingsRoutes,
  registerRoutes
};
