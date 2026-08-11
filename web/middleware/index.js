/**
 * Middleware Index
 * Exports all middleware functions
 */

export { upload, handleUploadError } from "./upload.middleware.js";
export { validateFileUpload, validateSettings, validateOrderData } from "./validation.middleware.js";
export { requireActiveSubscription } from "./billing.middleware.js";
export { upgradeTokenAfterOAuth } from "./token.middleware.js";
export { authenticateApiRequest, ensureEmbedded } from "./auth.middleware.js";

export default {
  upload: () => import("./upload.middleware.js"),
  validation: () => import("./validation.middleware.js"),
  billing: () => import("./billing.middleware.js"),
  token: () => import("./token.middleware.js"),
  auth: () => import("./auth.middleware.js")
};
