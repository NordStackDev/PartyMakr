import type { NextRequest } from "next/server";

import {
  lookupPostcodeLocal,
  reversePostcodeLocal,
} from "@/lib/postcode-data.server";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
};

export function GET(request: NextRequest) {
  const postcode = request.nextUrl.searchParams.get("postcode");
  const latRaw = request.nextUrl.searchParams.get("lat");
  const lngRaw = request.nextUrl.searchParams.get("lng");

  const hit = postcode
    ? lookupPostcodeLocal(postcode)
    : latRaw !== null && lngRaw !== null
      ? reversePostcodeLocal(Number(latRaw), Number(lngRaw))
      : null;

  if (!hit) {
    return Response.json(
      { error: "Postnummeret blev ikke fundet." },
      { status: 404, headers: CACHE_HEADERS },
    );
  }

  return Response.json(hit, { headers: CACHE_HEADERS });
}
