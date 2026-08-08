/**
 * Services Index
 * Exports all services
 */

export * from "./fulfillment.service.js";
export * from "./settings.service.js";
export * from "./billing.service.js";
export * from "./token.service.js";

export default {
  fulfillment: () => import("./fulfillment.service.js"),
  settings: () => import("./settings.service.js"),
  billing: () => import("./billing.service.js"),
  token: () => import("./token.service.js")
};
