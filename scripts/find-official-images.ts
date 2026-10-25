/**
 * Crawls the official English site for images that aren't in the card list (DON!! cards, card backs)
 * and saves candidates so they can be reviewed and picked for the UI.
 *
 *   node scripts/find-official-images.ts <outDir> [maxPages]
 *
 * Writes <outDir>/<file name> for every image whose URL looks like a DON!! card or a card back, and
 * <outDir>/index.json listing each saved image with the page it was found on.
 * Used by .github/workflows/official-extras.yml.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const SITE = "https://en.onepiece-cardgame.com";
const START = ["/", "/rules/", "/play-guide/", "/products/", "/howtoplay/", "/cardlist/", "/feature/"];
/** Image URLs worth saving. */
const INTERESTING = /don|back|ura|sleeve|reverse/i;
/** Pages whose images are all saved (rules diagrams show card backs under arbitrary names). */
const SAVE_ALL_FROM = /\/(play-guide|rules)\//;
const HEADERS = { "User-Agent": "OPTCGSim image discovery", Referer: `${SITE}/` };

const [outDir, maxArg] = process.argv.slice(2);
if (!outDir) throw new Error("usage: node scripts/find-official-images.ts <outDir> [maxPages]");
const maxPages = Number(maxArg ?? 150);

const absolute = (href: string, base: string) => {
  try {
    return new URL(href, base).toString().replace(/#.*$/, "");
  } catch {
    return null;
  }
};

const queue = START.map((p) => SITE + p);
const seen = new Set<string>();
const images = new Map<string, string>(); // image url -> first page it appeared on
while (queue.length && seen.size < maxPages) {
  const page = queue.shift()!;
  if (seen.has(page)) continue;
  seen.add(page);
  let html: string;
  try {
    const res = await fetch(page, { headers: HEADERS });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) continue;
    html = await res.text();
  } catch {
    continue;
  }
  for (const m of html.matchAll(/(?:src|href|data-src|srcset)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const raw = (m[1] ?? m[2]).split(/\s+/)[0];
    const url = absolute(raw, page);
    if (!url || !url.startsWith(SITE)) continue;
    if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)) {
      if (!images.has(url)) images.set(url, page);
    } else if (!/\.(css|js|pdf|zip|ico|svg)(\?|$)/i.test(url) && !seen.has(url) && !url.includes("/cardlist/?")) {
      queue.push(url);
    }
  }
}

const candidates = [...images].filter(([url, page]) => INTERESTING.test(url.replace(SITE, "")) || SAVE_ALL_FROM.test(page));
console.log(`crawled ${seen.size} pages, found ${images.size} images, ${candidates.length} candidates:`);
mkdirSync(outDir, { recursive: true });
const index: { file: string; url: string; page: string }[] = [];
for (const [url, page] of candidates) {
  console.log(`  ${url}  (on ${page})`);
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) continue;
    let file = basename(new URL(url).pathname);
    if (index.some((i) => i.file === file)) file = `${index.length}-${file}`;
    writeFileSync(join(outDir, file), Buffer.from(await res.arrayBuffer()));
    index.push({ file, url, page });
  } catch {
    // skip
  }
}
writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`saved ${index.length} images`);
