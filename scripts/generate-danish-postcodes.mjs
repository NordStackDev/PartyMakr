import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_PATH = path.join(
  process.cwd(),
  "src",
  "data",
  "danish-postcodes.json",
);

// Node has no built-in ZIP reader. The generated file is committed, so this
// script intentionally accepts the already extracted DK.txt path when the
// dataset needs to be refreshed.
const sourcePath = process.argv[2];
if (!sourcePath) {
  throw new Error(
    "Extract DK.txt from https://download.geonames.org/export/zip/DK.zip and pass its path as the first argument.",
  );
}

const { readFile } = await import("node:fs/promises");
const source = await readFile(sourcePath, "utf8");
const postcodes = source
  .trim()
  .split(/\r?\n/)
  .flatMap((line) => {
    const columns = line.split("\t");
    const nr = columns[1];
    const navn = columns[2];
    const lat = Number(columns[9]);
    const lng = Number(columns[10]);
    return /^\d{4}$/.test(nr) &&
      Number(nr) >= 1000 &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
      ? [{ nr, navn, lat, lng }]
      : [];
  })
  .sort((a, b) => a.nr.localeCompare(b.nr));

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(postcodes)}\n`, "utf8");
console.log(`Wrote ${postcodes.length} Danish postcodes to ${OUTPUT_PATH}`);
