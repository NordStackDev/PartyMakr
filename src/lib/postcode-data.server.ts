import "server-only";

import postcodesJson from "@/data/danish-postcodes.json";

export type PostcodeHit = {
  nr: string;
  navn: string;
  lat: number;
  lng: number;
};

const postcodes = postcodesJson as PostcodeHit[];
const byNumber = new Map(postcodes.map((postcode) => [postcode.nr, postcode]));
// These are post-box/service codes, not geographic delivery districts.
const nonGeographicPostcodes = new Set(["5100", "8100", "9100"]);

export function lookupPostcodeLocal(raw: string): PostcodeHit | null {
  return byNumber.get(raw.trim()) ?? null;
}

function distanceSquared(
  firstLat: number,
  firstLng: number,
  secondLat: number,
  secondLng: number,
) {
  const latitudeDelta = firstLat - secondLat;
  const longitudeScale = Math.cos((firstLat * Math.PI) / 180);
  const longitudeDelta = (firstLng - secondLng) * longitudeScale;
  return latitudeDelta ** 2 + longitudeDelta ** 2;
}

export function reversePostcodeLocal(
  lat: number,
  lng: number,
): PostcodeHit | null {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < 54.4 ||
    lat > 58 ||
    lng < 7.5 ||
    lng > 15.5
  ) {
    return null;
  }

  let nearest: PostcodeHit | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const postcode of postcodes) {
    if (nonGeographicPostcodes.has(postcode.nr)) continue;
    const distance = distanceSquared(lat, lng, postcode.lat, postcode.lng);
    if (distance < nearestDistance) {
      nearest = postcode;
      nearestDistance = distance;
    }
  }
  return nearest;
}
