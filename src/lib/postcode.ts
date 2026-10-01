// Browser-side access to PartyMakr's bundled Danish postcode directory. The
// API route keeps the full dataset out of the client bundle.

export type PostcodeHit = {
  nr: string;
  navn: string;
  lat: number;
  lng: number;
};

export type PostcodeRef = { nr: string; navn: string };

// Module-level caches avoid repeated route calls during a browser session.
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
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    const res = await fetch(`/api/postcodes?${params}`);
    if (!res.ok) {
      reverseCache.set(key, null);
      return null;
    }
    const data = (await res.json()) as PostcodeHit;
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
    const params = new URLSearchParams({ postcode: nr });
    const res = await fetch(`/api/postcodes?${params}`);
    if (!res.ok) return null;
    const data = (await res.json()) as PostcodeHit;
    lookupCache.set(nr, data);
    return data;
  } catch {
    return null;
  }
}
