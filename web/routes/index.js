/**
 * Route Index
 * Aggregates all routes
 */

import orderRoutes from "./order.routes.js";
import settingsRoutes from "./settings.routes.js";

export { orderRoutes, settingsRoutes };

export default {
  orderRoutes,
  settingsRoutes
};
