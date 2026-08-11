/**
 * Validation Middleware
 * Input validation for API requests
 */

/**
 * Validate that a file was uploaded
 */
export const validateFileUpload = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  next();
};

/**
 * Validate settings request body
 */
export const validateSettings = (req, res, next) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: "No settings provided" });
  }
  next();
};

export default {
  validateFileUpload,
  validateSettings
};
