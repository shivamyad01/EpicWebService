import { useCallback, useEffect, useState } from "react";
import { safeFetchJson } from "../utils/api.js";

/**
 * Send the merchant to Shopify's hosted pricing page.
 *
 * That page lives in the Shopify admin, which refuses to render inside this app's
 * iframe. App Bridge patches window.open so the "_top" target breaks out of the
 * frame — assigning window.location instead would leave the merchant looking at a
 * blocked frame, which is the usual way this goes wrong.
 */
export const openPricingPage = (pricingUrl) => {
  if (!pricingUrl) return;
  window.open(pricingUrl, "_top");
};

/**
 * "US$5.00 every 30 days" from the price Shopify reports.
 *
 * The amount is never written down in the app: under Managed Pricing it is edited
 * in the Partner Dashboard, and a hardcoded number would start lying the first time
 * it changed there. An unrecognised currency code makes Intl throw, which is not
 * worth taking a page down for.
 */
export const formatPrice = (price) => {
  if (!price || price.amount == null) return null;

  let amount;
  try {
    amount = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: price.currencyCode,
    }).format(price.amount);
  } catch {
    amount = `${price.amount} ${price.currencyCode}`;
  }

  return `${amount} ${price.interval === "ANNUAL" ? "per year" : "every 30 days"}`;
};

/**
 * Whole days left in the trial, or null when not in one. Rounded up so the last
 * partial day still reads as "1 day left" rather than "0".
 */
export const trialDaysLeft = (trialEndsAt) => {
  if (!trialEndsAt) return null;
  const remainingMs = new Date(trialEndsAt).getTime() - Date.now();
  if (Number.isNaN(remainingMs) || remainingMs <= 0) return null;
  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
};

/**
 * Subscription state for the embedded app.
 *
 * Starts optimistic (`active: true`) so the paywall never flashes on a normal load
 * for a subscribed merchant while the request is still in flight — `loading`
 * distinguishes the two for anything that needs to wait.
 *
 * A failed request also resolves to active. The server applies the same fail-open
 * policy to the upload route, so showing a paywall for uploads it would still
 * accept would just confuse the merchant.
 */
export function useBilling() {
  const [state, setState] = useState({ loading: true, active: true });

  /**
   * `force` asks the server to skip its cache — used by the Plan page's refresh
   * button, where the whole point is to not be served the stale answer again.
   */
  const refresh = useCallback(async (force = false) => {
    try {
      const data = await safeFetchJson(
        force ? "/api/billing/status?refresh=1" : "/api/billing/status"
      );
      setState({ loading: false, ...data });
      return data;
    } catch (err) {
      console.error("Could not load billing status:", err.message);
      const fallback = { loading: false, active: true, unknown: true };
      setState(fallback);
      return fallback;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Fold a 402 from any API call into this state.
   *
   * The status request can succeed and the upload still be refused minutes later,
   * if the plan lapsed in between. Rather than leave the merchant with a bare error
   * message, the gate's own response becomes the paywall.
   */
  const applySubscriptionError = useCallback((err) => {
    if (err?.status !== 402) return false;
    setState((prev) => ({
      ...prev,
      loading: false,
      active: false,
      unknown: false,
      pricingUrl: err.data?.pricingUrl || prev.pricingUrl
    }));
    return true;
  }, []);

  /**
   * Cancel the current plan.
   *
   * The server returns the post-cancel state, so it is applied directly rather
   * than firing a second status request that could race Shopify's propagation.
   * Errors are left to propagate — the caller has the surface to explain them.
   */
  const cancel = useCallback(async () => {
    const data = await safeFetchJson("/api/billing/cancel", { method: "POST" });
    if (data?.state) {
      setState({ loading: false, ...data.state });
    }
    return data;
  }, []);

  return { ...state, refresh, cancel, applySubscriptionError };
}

export default useBilling;
