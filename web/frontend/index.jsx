import App from "./App";
import { createRoot } from "react-dom/client";
import { loadPolarisTranslations } from "./utils/i18nUtils";

const render = () => {
  createRoot(document.getElementById("app")).render(<App />);
};

// English — every merchant on the default locale — renders on the spot. Booting
// used to go through initI18n() first, which meant an await, and behind it two
// requests for locale files, before React drew anything at all.
//
// Only a non-English Polaris needs fetching, and only then does the first render
// wait: rendering ahead of it would show the merchant a screen of English
// Polaris strings and then swap them.
const pending = loadPolarisTranslations();

if (pending) {
  pending.then(render);
} else {
  render();
}
