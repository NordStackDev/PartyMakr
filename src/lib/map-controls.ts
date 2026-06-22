/**
 * Tiny cross-tree registry so the bottom-nav pull-up sheet can drive the
 * discovery map (they live in different React subtrees). PartyMap publishes its
 * actions on mount and clears them on unmount; the sheet subscribes via
 * useSyncExternalStore and only shows the map controls while a map is present
 * (i.e. on the dashboard).
 */
export type MapApi = {
  zoomIn: () => void;
  zoomOut: () => void;
  toggleBase: () => void;
  admin: boolean;
};

let current: MapApi | null = null;
const listeners = new Set<() => void>();

export function setMapApi(api: MapApi | null) {
  current = api;
  listeners.forEach((l) => l());
}

export function getMapApi(): MapApi | null {
  return current;
}

export function subscribeMapApi(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
