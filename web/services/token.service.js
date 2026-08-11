/**
 * Offline Access Token Service
 *
 * Shopify is retiring non-expiring offline tokens. Public apps that still send one
 * to the Admin API start receiving authentication errors on 2027-01-01. An expiring
 * token lives 60 minutes and carries a refresh token good for 90 days, so the app
 * has to rotate it rather than store it once and forget it.
 *
 * @shopify/shopify-app-express does not do this yet: the `expiringOfflineAccessTokens`
 * future flag is merged upstream but unreleased as of 7.0.1, and its OAuth callback
 * still mints a non-expiring token. The rotation therefore lives here, built on the
 * primitives @shopify/shopify-api 13 does ship — `auth.migrateToExpiringToken` and
 * `auth.refreshToken`. When the flag ships, this module is what it replaces.
 *
 * Every path into the Admin API goes through authenticateApiRequest, so the
 * middleware that calls this (see middleware/token.middleware.js) is enough to keep
 * the whole app on rotated tokens.
 */

import shopify from "../shopify.js";

/**
 * Refresh this long before the token actually dies.
 *
 * Shopify hands out a 60-minute token. Waiting for it to lapse would mean the first
 * request after the hour pays the refresh latency and, worse, races anything already
 * in flight with the old token. Five minutes is the same margin the upstream library
 * uses in its unreleased implementation.
 */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/**
 * One refresh per shop at a time.
 *
 * A merchant opening the app fires several API calls at once. Without this they
 * would each notice the same expired token and each start their own exchange.
 * Shopify does return the same response to a repeated refresh for up to an hour,
 * so the duplicates would not corrupt anything — they would just be wasted round
 * trips, and every one of them a chance to interleave a write to the same row.
 */
const inFlight = new Map();

/**
 * A token minted before expiring tokens existed.
 *
 * Those carry neither an expiry nor a refresh token, which is exactly what makes
 * them impossible to rotate and is why Shopify is retiring them. The pair has to be
 * checked rather than just `expires`: an expiring token whose refresh already failed
 * would otherwise be mistaken for a legacy one and sent through migration, which
 * only accepts a *valid* non-expiring token and would fail.
 */
const isLegacyNonExpiring = (session) =>
  Boolean(session.accessToken) && !session.expires && !session.refreshToken;

/**
 * Trade a legacy non-expiring token for an expiring one.
 *
 * This is irreversible: Shopify revokes the old token the moment the exchange
 * succeeds. If storing the result then failed, the shop would be left holding a
 * revoked token and the merchant would have to reinstall, so the store happens
 * immediately and a failure is logged loudly rather than swallowed.
 */
const migrate = async (session) => {
  const { session: migrated } = await shopify.api.auth.migrateToExpiringToken({
    shop: session.shop,
    nonExpiringOfflineAccessToken: session.accessToken
  });

  await shopify.config.sessionStorage.storeSession(migrated);
  console.log(`[token] ${session.shop}: migrated to an expiring offline token`);

  return migrated;
};

/**
 * Rotate an expiring token that is spent or nearly so.
 *
 * Shopify invalidates a refresh token once it is used, so the new one returned here
 * is the only way to rotate again — losing it costs the merchant a reinstall once
 * the current access token lapses.
 */
const refresh = async (session) => {
  const { session: refreshed } = await shopify.api.auth.refreshToken({
    shop: session.shop,
    refreshToken: session.refreshToken
  });

  await shopify.config.sessionStorage.storeSession(refreshed);
  console.log(`[token] ${session.shop}: refreshed offline token`);

  return refreshed;
};

/**
 * Return a session whose access token is safe to use right now.
 *
 * Throws if the token could not be rotated. Callers on the request path swallow
 * that: authenticateApiRequest then finds the session inactive and mints a new
 * token by exchange, which is the right recovery for both failures that get this
 * far — a refresh token past its 90 days, and an app whose access was revoked.
 * Neither used to be recoverable without sending the merchant back through OAuth.
 */
export const ensureValidSession = async (session) => {
  // Online tokens carry their own expiry and the library already re-auths on it.
  if (!session || session.isOnline || !session.accessToken) return session;

  const needsMigration = isLegacyNonExpiring(session);
  const needsRefresh = Boolean(session.refreshToken) && session.isExpired(REFRESH_SKEW_MS);

  if (!needsMigration && !needsRefresh) return session;

  const pending = inFlight.get(session.shop);
  if (pending) return pending;

  const work = (needsMigration ? migrate(session) : refresh(session)).finally(() =>
    inFlight.delete(session.shop)
  );

  inFlight.set(session.shop, work);
  return work;
};

/**
 * Load a shop's offline session and rotate its token if needed.
 *
 * For work that never sees a request — webhook handlers, cron jobs, scripts — where
 * there is no res.locals to read the session off. Returns null for a shop with no
 * stored session, which is the normal state after an uninstall.
 */
export const ensureValidOfflineSession = async (shop) => {
  const sessionId = shopify.api.session.getOfflineId(shop);
  const session = await shopify.config.sessionStorage.loadSession(sessionId);

  if (!session) return null;

  return ensureValidSession(session);
};

export default { ensureValidSession, ensureValidOfflineSession };
