/**
 * Offline Token Middleware
 *
 * Keeps the stored offline token rotated so that expiring tokens are invisible to
 * the rest of the app. See services/token.service.js for why the app has to do this
 * itself rather than let @shopify/shopify-app-express handle it.
 */

import shopify from "../shopify.js";
import { ensureValidSession } from "../services/token.service.js";

/**
 * Rotate the shop's offline token before the session check reads it.
 *
 * Order matters: validateAuthenticatedSession calls session.isActive(), which is
 * false for an expired token and redirects the merchant into OAuth. With 60-minute
 * tokens that would bounce every merchant through a re-install screen once an hour,
 * so the refresh has to land before it, not after.
 *
 * The refreshed session is written to storage, and validateAuthenticatedSession
 * re-reads from storage, so nothing needs to be handed across on res.locals.
 *
 * Failure is deliberately not fatal. A refresh token past its 90 days cannot be
 * rescued here, and the correct recovery — send the merchant through OAuth — is
 * exactly what validateAuthenticatedSession does with the stale session on its own.
 */
export const refreshOfflineToken = async (req, res, next) => {
  // An embedded app's API calls always carry the App Bridge session token, and
  // getCurrentId logs an error of its own when it is missing. Without this guard
  // every unauthenticated probe would produce that error twice — once here and
  // once from the session check that follows — for a request neither can rescue.
  if (!req.headers.authorization) return next();

  try {
    const sessionId = await shopify.api.session.getCurrentId({
      isOnline: shopify.config.useOnlineTokens,
      rawRequest: req,
      rawResponse: res
    });

    if (sessionId) {
      const session = await shopify.config.sessionStorage.loadSession(sessionId);
      if (session) await ensureValidSession(session);
    }
  } catch (err) {
    // Includes the ordinary case of a request carrying no usable session token at
    // all, which is not an error here — it is the next middleware's decision.
    console.warn(`[token] could not rotate before session check: ${err.message}`);
  }

  return next();
};

/**
 * Convert the token OAuth just minted into an expiring one.
 *
 * shopify.auth.callback() still asks for a non-expiring token — the library's
 * `expiring` option exists in @shopify/shopify-api but the Express package does not
 * pass it yet. Rather than reimplement the callback to get one flag in, the fresh
 * token is exchanged immediately after it is stored. The merchant is mid-redirect,
 * so the extra round trip costs nothing visible, and it means every install and
 * every re-auth lands on an expiring token from the first request.
 *
 * A failure here leaves the shop on the non-expiring token it just received, which
 * still works today. The request-path middleware will retry the exchange on the very
 * next call, so this is worth a log and nothing more.
 */
export const upgradeTokenAfterOAuth = async (req, res, next) => {
  const session = res.locals.shopify?.session;

  try {
    if (session) {
      const upgraded = await ensureValidSession(session);
      res.locals.shopify.session = upgraded;
    }
  } catch (err) {
    console.error(
      `[token] post-OAuth exchange failed for ${session?.shop}:`,
      err.message
    );
  }

  return next();
};

export default { refreshOfflineToken, upgradeTokenAfterOAuth };
