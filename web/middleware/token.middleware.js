/**
 * Offline Token Middleware
 *
 * Keeps the stored offline token rotated so that expiring tokens are invisible to
 * the rest of the app. See services/token.service.js for why the app has to do this
 * itself rather than let @shopify/shopify-app-express handle it.
 *
 * The request-path rotation that used to live here is now part of
 * middleware/auth.middleware.js, which already holds the loaded session and can
 * mint a new token outright when rotation is not enough. Two middlewares loading
 * the same session to do the same job was one more than it needed.
 */

import { ensureValidSession } from "../services/token.service.js";

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

export default { upgradeTokenAfterOAuth };
