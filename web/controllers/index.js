/**
 * Controllers Index
 * Exports all controllers
 */

export * from "./order.controller.js";
export * from "./settings.controller.js";
export * from "./billing.controller.js";

export default {
  order: () => import("./order.controller.js"),
  settings: () => import("./settings.controller.js"),
  billing: () => import("./billing.controller.js")
};
