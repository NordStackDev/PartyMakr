// Danish postcode lookup via DAWA (Danmarks Adressers Web API) —
// official public data, free, CORS-enabled, no API key.
// https://dawadocs.dataforsyningen.dk/dok/api/postnummer

export type PostcodeHit = {
  nr: string;
  navn: string;
  lat: number;
  lng: number;
};

export type PostcodeRef = { nr: string; navn: string };

// Module-level caches: the map does one lookup per party / per postcode on
// every load, and these answers never change within a session.
const lookupCache = new Map<string, PostcodeHit | null>();
const reverseCache = new Map<string, PostcodeRef | null>();

/** Which postcode does this point lie in? (~100 m cache grid.) */
export async function reversePostcode(
  lat: number,
  lng: number,
): Promise<PostcodeRef | null> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = reverseCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(
      `https://api.dataforsyningen.dk/postnumre/reverse?x=${lng}&y=${lat}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) {
      reverseCache.set(key, null);
      return null;
    }
    const data = (await res.json()) as { nr: string; navn: string };
    const hit = { nr: data.nr, navn: data.navn };
    reverseCache.set(key, hit);
    return hit;
  } catch {
    return null; // network hiccup — don't cache, retry next load
  }
}

export async function lookupPostcode(raw: string): Promise<PostcodeHit | null> {
  const nr = raw.trim();
  if (!/^\d{4}$/.test(nr)) return null;
  const cached = lookupCache.get(nr);
  if (cached !== undefined) return cached;
  try {
    // `landpostnumre` clips the district to the coastline — several West
    // Jutland postcodes stretch far into the North Sea, so the plain
    // visueltcenter would otherwise land in open water.
    const res = await fetch(
      `https://api.dataforsyningen.dk/postnumre/${nr}?landpostnumre`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      nr: string;
      navn: string;
      // DAWA coordinates are [lon, lat].
      visueltcenter?: [number, number];
    };
    if (!data.visueltcenter) return null;
    const [lng, lat] = data.visueltcenter;
    return { nr: data.nr, navn: data.navn, lat, lng };
  } catch {
    return null;
  }
}
