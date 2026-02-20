/**
 * Settings Service
 * Business logic for application settings
 */

// In-memory store for settings (per shop)
// In production, use a database
const settingsStore = new Map();

/**
 * Get default settings
 */
export const getDefaultSettings = () => ({
  general: {
    storeName: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    currency: "USD",
    dateFormat: "MM/DD/YYYY",
    timeFormat: "12h"
  },
  orders: {
    autoFulfill: true,
    defaultCarrier: "UPS",
    notifyCustomers: true,
    lowStockThreshold: 10
  },
  notifications: {
    email: {
      orderUpdates: true,
      lowStock: true,
      systemAlerts: true,
      emailAddress: ""
    },
    desktop: {
      newOrders: true,
      fulfillmentUpdates: true,
      systemAlerts: true
    }
  },
  integrations: {
    shopify: {
      enabled: true,
      apiKey: "",
      webhookUrl: ""
    },
    googleAnalytics: {
      enabled: false,
      trackingId: ""
    }
  },
  shipping: {
    defaultOrigin: {
      name: "",
      street: "",
      city: "",
      state: "",
      zip: "",
      country: "United States"
    },
    carriers: [
      { id: "ups", name: "UPS", enabled: true },
      { id: "fedex", name: "FedEx", enabled: true },
      { id: "usps", name: "USPS", enabled: false },
      { id: "dhl", name: "DHL", enabled: false }
    ]
  },
  advanced: {
    debugMode: false,
    apiLogging: false,
    cacheEnabled: true
  }
});

/**
 * Get settings for a shop
 */
export const getSettings = async (shop) => {
  // In production, fetch from database
  // const settings = await db.settings.findOne({ shop });
  
  const storedSettings = settingsStore.get(shop);
  return storedSettings || getDefaultSettings();
};

/**
 * Save settings for a shop
 */
export const saveSettings = async (shop, settings) => {
  // In production, save to database
  // await db.settings.upsert({ shop }, settings);
  
  // Merge with existing settings
  const existingSettings = settingsStore.get(shop) || getDefaultSettings();
  const mergedSettings = deepMerge(existingSettings, settings);
  
  settingsStore.set(shop, mergedSettings);
  
  console.log(`Settings saved for ${shop}:`, JSON.stringify(mergedSettings, null, 2));
  
  return mergedSettings;
};

/**
 * Deep merge two objects
 */
const deepMerge = (target, source) => {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
};

export default {
  getDefaultSettings,
  getSettings,
  saveSettings
};
