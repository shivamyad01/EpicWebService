import { BrowserRouter } from "react-router-dom";
import { t } from "./utils/i18nUtils";
import { NavMenu } from "@shopify/app-bridge-react";
import Routes from "./Routes";

import { PolarisProvider, ErrorBoundary } from "./components";


export default function App() {
  // Any .tsx or .jsx files in /pages will become a route
  // See documentation for <Routes /> for more info
  //
  // Deliberately not eager. Eager loading pulled every page — including the 866-line
  // fulfill screen and the whole xlsx library it imports — into the entry bundle, so
  // opening the app downloaded and parsed all of them before rendering any one.
  const pages = import.meta.glob("./pages/**/!(*.test.[jt]sx)*.([jt]sx)");

  return (
    <PolarisProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <NavMenu>
            <a href="/" rel="home" />
            <a href="/fulfillorder">{t("NavigationMenu.fulfillOrder")}</a>
            <a href="/orders">Orders to fulfill</a>
            {/* Hardcoded like Settings below — the locale files only carry the two
                keys that were translated, and a half-translated key reads worse
                than an untranslated one. */}
            <a href="/plan">Plan</a>
            <a href="/feedback">{t("NavigationMenu.feedback")}</a>
            <a href="/settings">Settings</a>
          </NavMenu>
          <Routes pages={pages} />
        </ErrorBoundary>
      </BrowserRouter>
    </PolarisProvider>
  );
}
