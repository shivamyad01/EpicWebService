/**
 * Controllers Index
 * Exports all controllers
 */

export * from "./order.controller.js";
export * from "./settings.controller.js";

export default {
  order: () => import("./order.controller.js"),
  settings: () => import("./settings.controller.js")
};
