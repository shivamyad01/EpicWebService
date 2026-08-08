import { Suspense, lazy } from "react";
import { Routes as ReactRouterRoutes, Route } from "react-router-dom";

import { PageSkeleton } from "./components";

/**
 * File-based routing.
 * @desc File-based routing that uses React Router under the hood.
 * To create a new route create a new .jsx file in `/pages` with a default export.
 *
 * Some examples:
 * * `/pages/index.jsx` matches `/`
 * * `/pages/blog/[id].jsx` matches `/blog/123`
 * * `/pages/[...catchAll].jsx` matches any URL not explicitly matched
 *
 * @param {object} pages value of import.meta.glob(). See https://vitejs.dev/guide/features.html#glob-import
 *
 * @return {Routes} `<Routes/>` from React Router, with a `<Route/>` for each file in `pages`
 */
export default function Routes({ pages }) {
  const routes = useRoutes(pages);
  const routeComponents = routes.map(({ path, component: Component }) => (
    <Route key={path} path={path} element={<Component />} />
  ));

  const NotFound = routes.find(({ path }) => path === "/notFound").component;

  // One Suspense around the whole switch rather than one per route: only a single
  // route renders at a time, so the boundary can only ever be waiting on one chunk.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReactRouterRoutes>
        {routeComponents}
        <Route path="*" element={<NotFound />} />
      </ReactRouterRoutes>
    </Suspense>
  );
}

function useRoutes(pages) {
  const routes = Object.keys(pages)
    .map((key) => {
      let path = key
        .replace("./pages", "")
        .replace(/\.(t|j)sx?$/, "")
        /**
         * Replace /index with /
         */
        .replace(/\/index$/i, "/")
        /**
         * Only lowercase the first letter. This allows the developer to use camelCase
         * dynamic paths while ensuring their standard routes are normalized to lowercase.
         */
        .replace(/\b[A-Z]/, (firstLetter) => firstLetter.toLowerCase())
        /**
         * Convert /[handle].jsx and /[...handle].jsx to /:handle.jsx for react-router-dom
         */
        .replace(/\[(?:[.]{3})?(\w+?)\]/g, (_match, param) => `:${param}`);

      if (path.endsWith("/") && path !== "/") {
        path = path.substring(0, path.length - 1);
      }

      // pages[key] is now an import function, not the module: the glob in App.jsx
      // is lazy so each page becomes its own chunk instead of being welded into the
      // entry bundle. Whether it has a default export can only be found out once it
      // has loaded, so React.lazy raises that rather than the old console warning.
      return {
        path,
        component: lazy(pages[key]),
      };
    })
    .filter((route) => route.component);

  return routes;
}
