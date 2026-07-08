// Straight-line distance in metres between two WGS84 points.
export function haversineM(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Privacy: never show sub-kilometre precision — a metre-accurate distance
// (or "0 km") would let someone pinpoint the party. Whole km, floor of 1.
export function formatDistance(m: number): string {
  const km = Math.max(1, Math.round(m / 1000));
  return `ca. ${km} km væk`;
}
