/**
 * Services Index
 * Exports all services
 */

export * from "./fulfillment.service.js";
export * from "./settings.service.js";

export default {
  fulfillment: () => import("./fulfillment.service.js"),
  settings: () => import("./settings.service.js")
};
