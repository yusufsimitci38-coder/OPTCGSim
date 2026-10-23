/**
 * Downloads every English card image listed in punk-records and stores it as WebP.
 * Images already in the output folder are skipped, so reruns only fetch new cards.
 *
 *   node scripts/download-card-images.ts <punk-records/english> <outDir> [--limit N]
 *
 * Output: <outDir>/<printing id>.webp, 400px wide (e.g. OP01-016_p3.webp), and <outDir>/manifest.json.
 * Used by .github/workflows/card-images.yml; needs `sharp` installed.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const CONCURRENCY = 6;
/** Card art is 600px wide; 400px is plenty for the board and keeps the set around 150 MB. */
const WIDTH = 400;
const RETRIES = 3;
/** Fail the run if more than this share of downloads fail (e.g. the site blocks us). */
const MAX_FAILURE_RATE = 0.05;

interface SourceCard {
  id: string;
  img_full_url: string;
}

const [dir, outDir] = process.argv.slice(2);
if (!dir || !outDir) throw new Error("usage: node scripts/download-card-images.ts <punk-records/english> <outDir> [--limit N]");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;

const byId = new Map<string, string>();
for (const f of readdirSync(join(dir, "data")).filter((f) => f.endsWith(".json")).sort()) {
  for (const c of JSON.parse(readFileSync(join(dir, "data", f), "utf8")) as SourceCard[]) {
    if (c.img_full_url && !byId.has(c.id)) byId.set(c.id, c.img_full_url);
  }
}
mkdirSync(outDir, { recursive: true });
const file = (id: string) => join(outDir, `${id}.webp`);
const todo = [...byId].filter(([id]) => !existsSync(file(id))).slice(0, limit);
console.log(`${byId.size} printings, ${byId.size - todo.length} already downloaded, fetching ${todo.length}`);

async function fetchImage(url: string): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "OPTCGSim card image sync", Referer: "https://en.onepiece-cardgame.com/cardlist/" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastError;
}

const failed: string[] = [];
let done = 0;
async function worker(queue: [string, string][]) {
  for (let item = queue.shift(); item; item = queue.shift()) {
    const [id, url] = item;
    try {
      await sharp(await fetchImage(url)).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toFile(file(id));
    } catch (e) {
      failed.push(`${id}: ${(e as Error).message}`);
    }
    if (++done % 250 === 0) console.log(`${done}/${todo.length}`);
  }
}
const queue = [...todo];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

const stored = readdirSync(outDir).filter((f) => f.endsWith(".webp")).map((f) => f.replace(/\.webp$/, "")).sort();
writeFileSync(join(outDir, "manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), count: stored.length, ids: stored }) + "\n");
console.log(`stored ${stored.length} images; ${failed.length} failed`);
if (failed.length) console.log(failed.slice(0, 20).join("\n"));
if (todo.length && failed.length / todo.length > MAX_FAILURE_RATE) process.exit(1);
