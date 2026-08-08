/**
 * Settings Controller
 * Handles settings-related HTTP requests
 */

import { getSettings, saveSettings } from "../services/settings.service.js";

/**
 * Get settings for the current shop
 */
export const getShopSettings = async (req, res) => {
  try {
    const { shop } = res.locals.shopify.session;
    return res.status(200).json(await getSettings(shop));
  } catch (error) {
    console.error("Error fetching settings:", error);
    return res.status(500).json({ error: "Failed to fetch settings" });
  }
};

/**
 * Save settings for the current shop. Returns what was stored, not what was sent.
 */
export const saveShopSettings = async (req, res) => {
  try {
    const { shop } = res.locals.shopify.session;
    const settings = await saveSettings(shop, req.body);

    return res.status(200).json({ message: "Settings saved successfully", settings });
  } catch (error) {
    console.error("Error saving settings:", error);
    return res.status(500).json({ error: "Failed to save settings" });
  }
};

export default {
  getShopSettings,
  saveShopSettings
};
