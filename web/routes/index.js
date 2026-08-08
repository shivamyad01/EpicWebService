/**
 * Route Index
 * Aggregates all routes
 */

import orderRoutes from "./order.routes.js";
import settingsRoutes from "./settings.routes.js";
import billingRoutes from "./billing.routes.js";

export { orderRoutes, settingsRoutes, billingRoutes };

export default {
  orderRoutes,
  settingsRoutes,
  billingRoutes
};
