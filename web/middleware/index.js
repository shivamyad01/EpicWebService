/**
 * Middleware Index
 * Exports all middleware functions
 */

export { upload, handleUploadError } from "./upload.middleware.js";
export { validateFileUpload, validateSettings, validateOrderData } from "./validation.middleware.js";

export default {
  upload: () => import("./upload.middleware.js"),
  validation: () => import("./validation.middleware.js")
};
