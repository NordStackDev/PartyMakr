/**
 * Tiny cross-tree signal so the bottom-nav "Hjælp" button can open the help
 * guide, which lives in a different React subtree (mounted in the root layout).
 * Mirrors the map-controls pattern: the button publishes an "open" request and
 * the guide subscribes to it.
 */
const listeners = new Set<() => void>();

export function requestOpenHelp() {
  listeners.forEach((l) => l());
}

export function subscribeOpenHelp(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
