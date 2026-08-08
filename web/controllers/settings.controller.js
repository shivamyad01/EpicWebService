/**
 * Settings Controller
 * Handles settings-related HTTP requests
 */

import config from "../config/index.js";
import { getSettings, saveSettings } from "../services/settings.service.js";

/**
 * Get settings for the current shop.
 *
 * The carrier list rides along with the settings rather than being hardcoded in
 * the page. Shopify only selects a carrier and builds its tracking link when the
 * name matches its own spelling exactly, so that list has to have a single home —
 * and the settings form and the fulfillment path must be reading the same one.
 */
export const getShopSettings = async (req, res) => {
  try {
    const { shop } = res.locals.shopify.session;
    const settings = await getSettings(shop);

    return res.status(200).json({
      ...settings,
      carriers: config.shopifyTrackingCompanies
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return res.status(500).json({ error: "Failed to fetch settings" });
  }
};

/**
 * Save settings for the current shop.
 *
 * Returns what was stored, not what was sent: the service drops a carrier Shopify
 * does not recognise back to the default, and the merchant needs to see that
 * rather than be told "saved" while the form shows something else.
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
