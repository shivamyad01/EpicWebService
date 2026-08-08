/**
 * One-time backfill: non-expiring offline tokens -> expiring ones.
 *
 * The request-path middleware already converts a shop's token the next time the
 * merchant opens the app, which covers every shop that is actually being used. This
 * script exists for the ones that are not: an install nobody has opened since the
 * deadline was announced still holds a non-expiring token, and on 2027-01-01 its
 * Admin API calls start failing with no merchant present to trigger a re-auth.
 *
 * Safe to run repeatedly. A shop already on an expiring token is skipped, so this
 * is a backfill rather than a rotation — it is not a substitute for the refresh
 * that happens on the request path.
 *
 * Lives under web/ so that it ships inside the container image — the Dockerfile
 * copies web/ and nothing else, so a script at the repo root would not be there to
 * run against the real session database.
 *
 * Usage, on the host running the container:
 *
 *   docker compose exec app node scripts/migrate-offline-tokens.js --dry-run
 *   docker compose exec app node scripts/migrate-offline-tokens.js
 *
 * Note the migration is irreversible per shop: Shopify revokes the old token as
 * soon as the exchange succeeds. Back up the session database first — on the VPS
 * that is the app_data volume, /app/data/database.sqlite.
 */

import sqlite3 from "sqlite3";

import shopify, { DB_PATH, SESSION_TABLE_NAME } from "../shopify.js";
import { ensureValidSession } from "../services/token.service.js";

const dryRun = process.argv.includes("--dry-run");

/**
 * Every shop the app holds an offline session for.
 *
 * The storage interface can load a session by id and find them by shop, but it has
 * no way to list the shops in the first place — which is what this needs. So the
 * one column it cannot get through the adapter is read directly, and everything
 * after that goes back through the normal session APIs. Read-only, so it cannot
 * disagree with the adapter about the schema.
 */
const listShops = async () => {
  await shopify.config.sessionStorage.ready; // lets the adapter apply its migrations first

  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);

  try {
    return await new Promise((resolve, reject) => {
      db.all(
        `SELECT DISTINCT shop FROM ${SESSION_TABLE_NAME} WHERE isOnline = 0`,
        (err, rows) => (err ? reject(err) : resolve(rows.map((row) => row.shop)))
      );
    });
  } finally {
    db.close();
  }
};

const main = async () => {
  const shops = await listShops();
  console.log(`Found ${shops.length} shop(s) with an offline session${dryRun ? " (dry run)" : ""}`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const shop of shops) {
    const sessionId = shopify.api.session.getOfflineId(shop);
    const session = await shopify.config.sessionStorage.loadSession(sessionId);

    if (!session?.accessToken) {
      console.log(`  ${shop}: no access token, skipping`);
      skipped += 1;
      continue;
    }

    if (session.refreshToken || session.expires) {
      console.log(`  ${shop}: already on an expiring token`);
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`  ${shop}: would migrate`);
      migrated += 1;
      continue;
    }

    try {
      await ensureValidSession(session);
      migrated += 1;
    } catch (err) {
      // Most likely an uninstalled shop whose token Shopify already revoked. The
      // row is left alone: deleting sessions is the uninstall webhook's job, and
      // guessing wrong here would log a merchant out for a transient network error.
      console.error(`  ${shop}: FAILED - ${err.message}`);
      failed += 1;
    }
  }

  console.log(`\nmigrated: ${migrated}  skipped: ${skipped}  failed: ${failed}`);

  if (failed > 0) process.exitCode = 1;
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
