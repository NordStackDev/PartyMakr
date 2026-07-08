// Shared presentation helpers for party lists and map markers.

// Party fullness → colour. Green = room to spare, orange = almost full,
// red = full. Parties without a capacity count as open (green).
export type Fill = { color: string; label: string };

export const FILL_OPEN: Fill = { color: "#34d399", label: "Ledige pladser" };
export const FILL_ALMOST: Fill = { color: "#f97316", label: "Næsten fuld" };
export const FILL_FULL: Fill = { color: "#ef4444", label: "Fuld" };

export function fillFor(going: number, capacity: number | null): Fill {
  if (!capacity || capacity <= 0) return FILL_OPEN;
  const ratio = going / capacity;
  if (ratio >= 1) return FILL_FULL;
  if (ratio >= 0.7) return FILL_ALMOST;
  return FILL_OPEN;
}

export function fmtDateTime(value: string): string {
  return new Date(value).toLocaleString("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
