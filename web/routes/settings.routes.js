/**
 * Settings Routes
 * Routes for application settings
 */

import { Router } from "express";
import { validateSettings } from "../middleware/validation.middleware.js";
import {
  getShopSettings,
  saveShopSettings
} from "../controllers/settings.controller.js";

const router = Router();

/**
 * GET /api/settings
 * Get settings for the current shop
 */
router.get("/", getShopSettings);

/**
 * POST /api/settings
 * Save settings for the current shop
 */
router.post("/", validateSettings, saveShopSettings);

export default router;
