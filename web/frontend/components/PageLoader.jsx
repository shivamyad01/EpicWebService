import { Spinner } from "@shopify/polaris";

/**
 * The app's one loading state.
 *
 * Used for the route chunk downloading, and for the two in-page waits (the
 * billing lookup on Plan, the saved defaults on Settings) via `minHeight` and
 * `size`. A single spinner replaced a set of per-page skeletons: those had to be
 * kept in step with five layouts to be worth anything, and a skeleton that no
 * longer matches its page is just a slower way to flash.
 *
 * The same spinner is drawn in CSS in index.html so it can appear before any
 * JavaScript has run — keep the geometry below in step with `.preboot` there.
 */
export default function PageLoader({ minHeight = "60vh", size = "large" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight,
      }}
    >
      <Spinner accessibilityLabel="Loading" size={size} />
    </div>
  );
}
