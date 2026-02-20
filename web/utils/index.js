/**
 * Utils Index
 * Exports all utility functions
 */

export * from "./graphql.queries.js";

export default {
  graphql: () => import("./graphql.queries.js")
};
