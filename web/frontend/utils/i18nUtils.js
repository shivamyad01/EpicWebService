import {
  DEFAULT_LOCALE as DEFAULT_POLARIS_LOCALE,
  SUPPORTED_LOCALES as SUPPORTED_POLARIS_LOCALES,
} from "@shopify/polaris";

import en from "../locales/en.json";
import de from "../locales/de.json";
import fr from "../locales/fr.json";

/**
 * App translations.
 *
 * This used to be i18next, react-i18next, @shopify/i18next-shopify,
 * i18next-resources-to-backend and @formatjs/intl-localematcher, plus Intl
 * polyfills for Intl.Locale and Intl.PluralRules that the plural handling
 * needed. Around 60KB of the entry bundle, two more polyfill chunks in the
 * build, and an await in front of the app's first render.
 *
 * What the app asks of it is seven strings, none of them plural or
 * interpolated, and only NotFound's two are actually translated — de.json and
 * fr.json carry no NavigationMenu or Feedback keys at all, so those already
 * fell back to English. A lookup with a fallback does the same job.
 *
 * Polaris' own translations are a separate thing and still worth loading: they
 * are its built-in UI strings. English is bundled; other locales are fetched,
 * which is the one case where boot still waits on a request.
 */
const RESOURCES = { en, de, fr };

const DEFAULT_APP_LOCALE = "en";

let _userLocale;
let _polarisTranslations = null;

/**
 * The user's locale, from the `locale` request parameter Shopify sends, matched
 * to a locale the app has strings for. Region is dropped — "de-AT" reads de.
 *
 * @see https://shopify.dev/docs/apps/best-practices/internationalization/getting-started
 * @returns {string} User locale
 */
export function getUserLocale() {
  if (_userLocale) {
    return _userLocale;
  }

  const requested =
    new URL(window.location.href).searchParams.get("locale") ||
    DEFAULT_APP_LOCALE;
  const base = requested.toLowerCase().split("-")[0];

  _userLocale = RESOURCES[base] ? base : DEFAULT_APP_LOCALE;
  return _userLocale;
}

const lookup = (locale, key) =>
  key.split(".").reduce((value, part) => value?.[part], RESOURCES[locale]);

/**
 * Translate a dotted key, e.g. t("NotFound.heading").
 *
 * Falls back to English, then to the key itself — the same thing i18next
 * returned for a missing key, so callers that write `t(key) || "Default"` keep
 * behaving exactly as they did.
 */
export function t(key) {
  const value = lookup(getUserLocale(), key) ?? lookup(DEFAULT_APP_LOCALE, key);
  return typeof value === "string" ? value : key;
}

/**
 * The Polaris locale to render in, which is not always the app's: Polaris ships
 * strings for far more locales than this app does.
 */
function getPolarisLocale() {
  const requested =
    new URL(window.location.href).searchParams.get("locale") ||
    DEFAULT_POLARIS_LOCALE;

  if (SUPPORTED_POLARIS_LOCALES.includes(requested)) return requested;

  const base = requested.split("-")[0];
  return SUPPORTED_POLARIS_LOCALES.includes(base)
    ? base
    : DEFAULT_POLARIS_LOCALE;
}

/**
 * @returns {TranslationDictionary|null} Polaris translations, or null while a
 * non-English set is still loading — Polaris treats that as English.
 */
export function getPolarisTranslations() {
  return _polarisTranslations;
}

/**
 * Loads Polaris' translations if the merchant is not on English.
 *
 * English needs nothing: Polaris' AppProvider defaults to it, so bundling a
 * second copy would only add weight. Returns null when there is nothing to
 * wait for, which is how index.jsx knows it can render on the spot.
 *
 * @returns {Promise|null}
 */
export function loadPolarisTranslations() {
  const locale = getPolarisLocale();

  if (locale === DEFAULT_POLARIS_LOCALE) {
    return null;
  }

  return POLARIS_LOCALE_DATA[locale]()
    .then((module) => {
      _polarisTranslations = module.default;
    })
    .catch(() => {
      // Polaris falls back to English on its own. A missing translation file is
      // not a reason to leave the merchant on a spinner.
    });
}

/**
 * Polaris imports are declared explicitly because
 * dynamic imports with variables are only supported
 * for files with relative paths, not packages.
 * @see https://github.com/rollup/plugins/tree/master/packages/dynamic-import-vars#limitations
 */
const POLARIS_LOCALE_DATA = {
  cs: () => import("@shopify/polaris/locales/cs.json"),
  da: () => import("@shopify/polaris/locales/da.json"),
  de: () => import("@shopify/polaris/locales/de.json"),
  es: () => import("@shopify/polaris/locales/es.json"),
  fi: () => import("@shopify/polaris/locales/fi.json"),
  fr: () => import("@shopify/polaris/locales/fr.json"),
  it: () => import("@shopify/polaris/locales/it.json"),
  ja: () => import("@shopify/polaris/locales/ja.json"),
  ko: () => import("@shopify/polaris/locales/ko.json"),
  nb: () => import("@shopify/polaris/locales/nb.json"),
  nl: () => import("@shopify/polaris/locales/nl.json"),
  pl: () => import("@shopify/polaris/locales/pl.json"),
  "pt-BR": () => import("@shopify/polaris/locales/pt-BR.json"),
  "pt-PT": () => import("@shopify/polaris/locales/pt-PT.json"),
  sv: () => import("@shopify/polaris/locales/sv.json"),
  th: () => import("@shopify/polaris/locales/th.json"),
  tr: () => import("@shopify/polaris/locales/tr.json"),
  vi: () => import("@shopify/polaris/locales/vi.json"),
  "zh-CN": () => import("@shopify/polaris/locales/zh-CN.json"),
  "zh-TW": () => import("@shopify/polaris/locales/zh-TW.json"),
};
