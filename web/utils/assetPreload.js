/**
 * Route-aware asset preloading.
 *
 * Pages are lazy, so the browser only discovers which page chunk it needs after
 * the entry bundle has downloaded and parsed — a full round trip spent staring
 * at the loading spinner, on every cold load.
 *
 * The server already knows which page was asked for. Vite's build manifest maps
 * that back to a chunk filename, so the document can name the chunk up front and
 * the browser fetches it alongside the entry instead of after it.
 *
 * Everything here fails soft: no manifest, an unrecognized path or a malformed
 * file just means no preload tags, which is exactly how the app behaved before.
 */

import { readFileSync } from "fs";
import { join } from "path";

let routeAssets;

/**
 * Turn a manifest key into the route it serves, the same way the frontend's
 * router derives paths from the pages glob — lowercased first letter, /index
 * collapsed to /, no trailing slash. Keep in step with Routes.jsx.
 */
const routeForKey = (key) => {
  let path = key
    .replace(/^pages/, "")
    .replace(/\.(t|j)sx?$/, "")
    .replace(/\/index$/i, "/")
    .replace(/\b[A-Z]/, (firstLetter) => firstLetter.toLowerCase());

  if (path.endsWith("/") && path !== "/") {
    path = path.slice(0, -1);
  }

  return path;
};

/** Every chunk reachable from a manifest key, following its import graph. */
const chunksFor = (manifest, key, seen) => {
  if (seen.has(key)) return [];
  seen.add(key);

  const chunk = manifest[key];
  if (!chunk) return [];

  return [
    chunk.file,
    ...(chunk.imports || []).flatMap((imported) =>
      chunksFor(manifest, imported, seen)
    ),
  ];
};

const buildRouteAssets = (staticPath) => {
  const manifest = JSON.parse(
    readFileSync(join(staticPath, ".vite", "manifest.json")).toString()
  );

  const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry);

  // Whatever the entry already pulls in needs no tag from us: the document
  // loads the entry with a script tag, and Vite wrote modulepreload tags for
  // everything under it at build time.
  const alreadyLoaded = new Set(
    entryKey ? chunksFor(manifest, entryKey, new Set()) : []
  );

  const assets = new Map();

  for (const key of Object.keys(manifest)) {
    if (!/^pages\/.+\.(t|j)sx?$/.test(key)) continue;

    const files = chunksFor(manifest, key, new Set()).filter(
      (file) => !alreadyLoaded.has(file)
    );
    assets.set(routeForKey(key), files);
  }

  return assets;
};

/**
 * <link rel="modulepreload"> tags for the page the given URL will render, as a
 * string ready to splice into the document head.
 *
 * @param {string} staticPath directory the built frontend was read from
 * @param {string} pathname   request path, e.g. "/fulfillorder"
 * @returns {string}
 */
export const preloadTagsFor = (staticPath, pathname) => {
  if (routeAssets === undefined) {
    try {
      routeAssets = buildRouteAssets(staticPath);
    } catch {
      // No manifest — a dev server, or a build made before this existed.
      routeAssets = null;
    }
  }

  if (!routeAssets) return "";

  const route = pathname.replace(/\/+$/, "").toLowerCase() || "/";

  return (routeAssets.get(route) || [])
    .map((file) => `<link rel="modulepreload" crossorigin href="/${file}">`)
    .join("\n    ");
};

export default preloadTagsFor;
