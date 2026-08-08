import { BrowserRouter } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NavMenu } from "@shopify/app-bridge-react";
import Routes from "./Routes";

import { QueryProvider, PolarisProvider } from "./components";


export default function App() {
  // Any .tsx or .jsx files in /pages will become a route
  // See documentation for <Routes /> for more info
  const pages = import.meta.glob("./pages/**/!(*.test.[jt]sx)*.([jt]sx)", {
    eager: true,
  });
  const { t } = useTranslation();

  return (
    <PolarisProvider>
      <BrowserRouter>
        <QueryProvider>
          <NavMenu>
            <a href="/" rel="home" />
            <a href="/fulfillorder">{t("NavigationMenu.fulfillOrder")}</a>
            {/* Hardcoded like Settings below — the locale files only carry the two
                keys that were translated, and a half-translated key reads worse
                than an untranslated one. */}
            <a href="/plan">Plan</a>
            <a href="/feedback">{t("NavigationMenu.feedback")}</a>
            <a href="/settings">Settings</a>
          </NavMenu>
          <Routes pages={pages} />
        </QueryProvider>
      </BrowserRouter>
    </PolarisProvider>
  );
}
