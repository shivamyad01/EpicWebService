/**
 * Shop Settings
 *
 * Two settings, both of which change what a fulfillment run does. The page used to
 * offer about twenty-five — store name, timezone, currency, low-stock threshold,
 * desktop notifications, a Google Analytics id, a default origin address — none of
 * which anything read. They were also held in a plain Map, so a redeploy erased
 * whatever a merchant had entered. Saving input that is then discarded is worse
 * than not collecting it, so the schema is now only what the app acts on.
 *
 * Storage is the same SQLite file the sessions live in, which sits on the mounted
 * volume. That is the one place in this container already guaranteed to survive an
 * image update.
 */

import sqlite3 from "sqlite3";

import config from "../config/index.js";
import { DB_PATH } from "../shopify.js";

const TABLE = "shop_settings";

/**
 * Defaults for a shop that has never opened the page.
 *
 * `defaultCarrier` is what a sheet row falls back to when its carrier column is
 * blank, and it starts from the app-wide default so behaviour is unchanged until a
 * merchant chooses otherwise. `notifyCustomers` starts false because notification
 * emails cannot be recalled — an opt-in default is the only safe one.
 */
export const getDefaultSettings = () => ({
  defaultCarrier: config.defaultTrackingCompany,
  notifyCustomers: false
});

/**
 * Keep only known keys, coerced to the right type.
 *
 * The settings body arrives from the browser, so an unknown key must not be able
 * to reach storage and an unknown carrier must not reach Shopify — resolveTracking
 * treats a name Shopify does not recognise as a custom carrier, which silently
 * changes how the tracking link is built.
 */
const sanitize = (input) => {
  const defaults = getDefaultSettings();
  const incoming = input && typeof input === "object" ? input : {};

  const carrier = String(incoming.defaultCarrier ?? "").trim();
  const carrierIsKnown = config.shopifyTrackingCompanies.includes(carrier);

  return {
    defaultCarrier: carrierIsKnown ? carrier : defaults.defaultCarrier,
    notifyCustomers: Boolean(incoming.notifyCustomers)
  };
};

let dbPromise = null;

const getDb = () => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) return reject(err);

      db.run(
        `CREATE TABLE IF NOT EXISTS ${TABLE} (
           shop TEXT NOT NULL PRIMARY KEY,
           data TEXT NOT NULL,
           updated_at INTEGER NOT NULL
         )`,
        (createErr) => (createErr ? reject(createErr) : resolve(db))
      );
    });
  });

  return dbPromise;
};

/**
 * A shop's settings, falling back to the defaults.
 *
 * Reads never throw. A settings lookup failing should not take down an upload that
 * would otherwise work — the defaults are the app's previous hardcoded behaviour,
 * so falling back to them is the same as not having the feature.
 */
export const getSettings = async (shop) => {
  try {
    const db = await getDb();

    const row = await new Promise((resolve, reject) => {
      db.get(`SELECT data FROM ${TABLE} WHERE shop = ?`, [shop], (err, result) =>
        err ? reject(err) : resolve(result)
      );
    });

    if (!row) return getDefaultSettings();

    return { ...getDefaultSettings(), ...sanitize(JSON.parse(row.data)) };
  } catch (err) {
    console.error(`[settings] read failed for ${shop}:`, err.message);
    return getDefaultSettings();
  }
};

/**
 * Replace a shop's settings and return what was stored.
 *
 * A whole-object write rather than a merge: with two fields the page always sends
 * both, and merging would make it impossible to ever clear one.
 */
export const saveSettings = async (shop, settings) => {
  const clean = sanitize(settings);
  const db = await getDb();

  await new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO ${TABLE} (shop, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(shop) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [shop, JSON.stringify(clean), Date.now()],
      (err) => (err ? reject(err) : resolve())
    );
  });

  console.log(
    `[settings] ${shop}: carrier=${clean.defaultCarrier} notify=${clean.notifyCustomers}`
  );

  return clean;
};

export default { getDefaultSettings, getSettings, saveSettings };
