import { readFile } from "node:fs/promises";
import path from "node:path";

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error("Supabase URL and service-role key are required.");
}

const dataPath = path.join(
  process.cwd(),
  "src",
  "data",
  "danish-postcodes.json",
);
const postcodes = JSON.parse(await readFile(dataPath, "utf8"));
const nonGeographicPostcodes = new Set(["5100", "8100", "9100"]);
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function parsePoint(value) {
  if (typeof value !== "string") return null;
  const textMatch = value.match(/^POINT\(([-\d.]+) ([-\d.]+)\)$/i);
  if (textMatch) return { lng: Number(textMatch[1]), lat: Number(textMatch[2]) };

  if (!/^[0-9a-f]+$/i.test(value)) return null;
  const buffer = Buffer.from(value, "hex");
  if (buffer.length < 21) return null;
  const littleEndian = buffer.readUInt8(0) === 1;
  const readUInt32 = littleEndian
    ? (offset) => buffer.readUInt32LE(offset)
    : (offset) => buffer.readUInt32BE(offset);
  const readDouble = littleEndian
    ? (offset) => buffer.readDoubleLE(offset)
    : (offset) => buffer.readDoubleBE(offset);
  const geometryType = readUInt32(1);
  const coordinateOffset = geometryType & 0x20000000 ? 9 : 5;
  if ((geometryType & 0xff) !== 1 || buffer.length < coordinateOffset + 16) {
    return null;
  }
  return {
    lng: readDouble(coordinateOffset),
    lat: readDouble(coordinateOffset + 8),
  };
}

function nearestPostcode(point) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  const longitudeScale = Math.cos((point.lat * Math.PI) / 180);
  for (const postcode of postcodes) {
    if (nonGeographicPostcodes.has(postcode.nr)) continue;
    const latitudeDelta = point.lat - postcode.lat;
    const longitudeDelta = (point.lng - postcode.lng) * longitudeScale;
    const distance = latitudeDelta ** 2 + longitudeDelta ** 2;
    if (distance < nearestDistance) {
      nearest = postcode;
      nearestDistance = distance;
    }
  }
  return nearest;
}

const { data: parties, error } = await supabase
  .from("parties")
  .select("id,location,postcode");
if (error) throw error;

const candidates = parties.filter(
  (party) => !party.postcode || nonGeographicPostcodes.has(party.postcode),
);
const updates = candidates.flatMap((party) => {
  const point = parsePoint(party.location);
  const postcode = point ? nearestPostcode(point) : null;
  return postcode ? [{ id: party.id, postcode }] : [];
});

if (!process.argv.includes("--apply")) {
  console.log(
    `Dry run: ${updates.length} of ${candidates.length} parties can be backfilled. Add --apply to update them.`,
  );
} else {
  for (const { id, postcode } of updates) {
    const { error: updateError } = await supabase
      .from("parties")
      .update({
        postcode: postcode.nr,
        postcode_name: postcode.navn,
        postcode_lat: postcode.lat,
        postcode_lng: postcode.lng,
      })
      .eq("id", id);
    if (updateError) throw updateError;
  }

  console.log(`Backfilled ${updates.length} parties.`);
}
