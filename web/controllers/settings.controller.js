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
    const session = res.locals.shopify.session;
    const shop = session.shop;

    const settings = await getSettings(shop);
    return res.status(200).json(settings);
  } catch (error) {
    console.error("Error fetching settings:", error);
    return res.status(500).json({ error: "Failed to fetch settings" });
  }
};

/**
 * Save settings for the current shop
 */
export const saveShopSettings = async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const shop = session.shop;
    const settings = req.body;

    await saveSettings(shop, settings);
    return res.status(200).json({ message: "Settings saved successfully" });
  } catch (error) {
    console.error("Error saving settings:", error);
    return res.status(500).json({ error: "Failed to save settings" });
  }
};

export default {
  getShopSettings,
  saveShopSettings
};
