/**
 * Tiny cross-tree signals between the bottom-nav and the help guide (they live
 * in different React subtrees, both mounted in the root layout). Mirrors the
 * map-controls pattern.
 *
 *   requestOpenHelp / subscribeOpenHelp — the "Hjælp" button asks the guide to
 *     open.
 *   helpOpened / subscribeHelpOpened   — the guide announces it has opened (for
 *     any reason, incl. the first-time auto-open) so the nav can close its
 *     pull-up menu underneath it.
 */
const openListeners = new Set<() => void>();
const openedListeners = new Set<() => void>();

export function requestOpenHelp() {
  openListeners.forEach((l) => l());
}

export function subscribeOpenHelp(listener: () => void): () => void {
  openListeners.add(listener);
  return () => openListeners.delete(listener);
}

export function helpOpened() {
  openedListeners.forEach((l) => l());
}

export function subscribeHelpOpened(listener: () => void): () => void {
  openedListeners.add(listener);
  return () => openedListeners.delete(listener);
}
