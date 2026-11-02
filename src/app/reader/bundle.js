/* Where the bundled reader assets live.

   The phone answers root-relative requests from its own asset server, but the app surface
   also sets <base href> to the website so that the API calls reach production. A reader
   worker, a cmap or a font must never follow that base — they ship inside the app — so
   every bundled path is pinned to the document's own origin instead of the base. */

export function bundleRoot() {
  return `${window.location.protocol}//${window.location.host}/`;
}

export function bundleUrl(pathOrUrl) {
  if (/^(https?:|blob:|data:)/i.test(pathOrUrl)) return pathOrUrl;
  return new URL(pathOrUrl.replace(/^\//, ""), bundleRoot()).href;
}
