/**
 * Embedded app authentication, by token exchange.
 *
 * The app declares its scopes in shopify.app.toml, which puts it on Shopify
 * managed install: Shopify installs the app and grants the scopes itself, and
 * never calls this server's /api/auth. So after an install there is no offline
 * token here, and the only thing @shopify/shopify-app-express knows to do about
 * a missing session is start the OAuth authorization-code flow — leave the
 * iframe, set a state cookie, read it back on the callback.
 *
 * Browsers no longer allow that cookie in an embedded cross-site context, so the
 * callback failed and Shopify bounced the merchant to their apps page with
 * ?oauth_error=same_site_cookies. Every newly installing shop hit it.
 *
 * Token exchange is what Shopify built to replace that flow. The frontend
 * already sends an App Bridge session token on every API call; this trades that
 * token for an offline access token and stores it. No redirects, no cookies, and
 * nothing for a browser to block.
 *
 * @see https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/token-exchange
 */

import { RequestedTokenType } from "@shopify/shopify-api";

import shopify from "../shopify.js";
import { ensureValidSession } from "../services/token.service.js";

const sessionTokenFrom = (req) => {
  const [, token] = (req.headers.authorization || "").match(/^Bearer (.+)$/i) || [];
  return token;
};

/**
 * App Bridge watches for this header: it fetches a fresh session token and
 * replays the request, so an expired token costs a retry rather than an error in
 * front of the merchant.
 */
const retryWithNewToken = (res, reason) => {
  res.setHeader("X-Shopify-Retry-Invalid-Session-Request", "1");
  return res.status(401).json({ error: reason });
};

/**
 * Trade a session token for an offline access token and store it.
 *
 * `expiring: true` asks for a token that comes with a refresh token. The OAuth
 * callback could not request that — the Express package has no option for it,
 * which is why upgradeTokenAfterOAuth exists — but token exchange takes it
 * directly, so every shop lands on an expiring token from its first request.
 */
const exchangeForOfflineToken = async (shop, sessionToken) => {
  const { session } = await shopify.api.auth.tokenExchange({
    shop,
    sessionToken,
    requestedTokenType: RequestedTokenType.OfflineAccessToken,
    expiring: true,
  });

  await shopify.config.sessionStorage.storeSession(session);
  console.log(`[auth] stored an offline session for ${shop} by token exchange`);

  return session;
};

/**
 * Authenticate an API request, minting the shop's access token if it is missing.
 *
 * Replaces shopify.validateAuthenticatedSession(), which redirects to OAuth when
 * it finds no session, and refreshOfflineToken, whose token rotation now happens
 * here against the session this already has in hand.
 */
export const authenticateApiRequest = async (req, res, next) => {
  const sessionToken = sessionTokenFrom(req);

  if (!sessionToken) {
    return retryWithNewToken(res, "Missing session token");
  }

  let shop;
  try {
    const payload = await shopify.api.session.decodeSessionToken(sessionToken);
    shop = new URL(payload.dest).hostname;
  } catch (err) {
    // Expired or malformed. Worth a retry rather than a failure: App Bridge
    // tokens are short-lived and a tab left open outlives them routinely.
    return retryWithNewToken(res, "Invalid session token");
  }

  try {
    const sessionId = shopify.api.session.getOfflineId(shop);
    let session = await shopify.config.sessionStorage.loadSession(sessionId);

    // Rotate before use: an expiring token near its end is refreshed in place,
    // and a legacy non-expiring one is migrated. Failure is not fatal — the
    // exchange below can always mint a fresh token.
    if (session) {
      try {
        session = await ensureValidSession(session);
      } catch (err) {
        console.warn(`[auth] could not rotate ${shop}'s token: ${err.message}`);
      }
    }

    // Exchange when there is nothing stored, when what is stored has expired
    // past rescue, or when its grant no longer covers the scopes the app asks
    // for. isScopeChanged tests inclusion, so a session granted more than the
    // app now needs stays valid.
    if (!session?.isActive(shopify.api.config.scopes)) {
      session = await exchangeForOfflineToken(shop, sessionToken);
    }

    res.locals.shopify = { ...res.locals.shopify, session };
    return next();
  } catch (err) {
    // A session token Shopify will not exchange means this shop no longer has
    // the app installed, or the token was not really ours. Neither is fixable
    // by retrying with a fresher token.
    console.error(`[auth] token exchange failed for ${shop}:`, err.message);

    return res.status(401).json({
      error: "Could not authenticate this shop. Try reloading the app.",
    });
  }
};

/**
 * Where to send a merchant who reached the app outside the admin iframe.
 *
 * Shopify's own post-install redirect carries `host`, which is what
 * getEmbeddedAppUrl decodes. A bookmark or a typed URL will not, so fall back to
 * the shop's admin, which resolves to the same place.
 */
const embeddedAppUrl = async (req, res, shop) => {
  try {
    // Async, and it throws rather than returning null when `host` is absent —
    // both of which have to be handled here or the rejection escapes the
    // request and takes the process with it.
    return await shopify.api.auth.getEmbeddedAppUrl({
      rawRequest: req,
      rawResponse: res,
    });
  } catch {
    return `https://${shop}/admin/apps/${shopify.api.config.apiKey}`;
  }
};

/**
 * Guard the document request.
 *
 * Replaces shopify.ensureInstalledOnShop(), which sent any shop without a stored
 * session into OAuth — under managed install that is every shop that has just
 * installed the app, since nothing has minted a token yet.
 *
 * There is deliberately no session check here. The document is a shell; the
 * token is established by the first API call it makes, which arrives with a
 * session token this server can exchange.
 */
export const ensureEmbedded = async (req, res, next) => {
  const shop = shopify.api.utils.sanitizeShop(req.query.shop);

  if (!shop) {
    return res.status(400).send("Missing shop parameter");
  }

  // Outside the iframe there is no App Bridge and so no session token. Send the
  // merchant into the admin, which loads the app embedded and supplies one.
  if (req.query.embedded !== "1") {
    return res.redirect(await embeddedAppUrl(req, res, shop));
  }

  return next();
};

export default { authenticateApiRequest, ensureEmbedded };
