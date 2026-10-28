// The premium landing page keeps its own scroll helper because the app router
// treats "#/..." as a route — a plain anchor would navigate away from the page.
export function scrollToId(id) {
  const node = document.getElementById(id);
  if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
}
