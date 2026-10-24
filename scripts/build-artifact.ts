/**
 * Bundles the built app (dist/) into one self-contained HTML file with the starter decks' card
 * images embedded as data: URIs, for hosts that block remote scripts and images.
 *
 *   npm run build && npx vite-node scripts/build-artifact.ts <out.html>
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { STARTER_DECKS } from "../src/engine/decks.ts";

const IMAGE_BASE = "https://raw.githubusercontent.com/yusufsimitci38-coder/OPTCGSim/card-images/en/";

const out = process.argv[2];
if (!out) throw new Error("usage: npx vite-node scripts/build-artifact.ts <out.html>");

const ids = [...new Set(Object.values(STARTER_DECKS).flatMap((d) => [d.leader, ...d.cards]))].sort();
const images: Record<string, string> = {};
for (const id of ids) {
  const res = await fetch(`${IMAGE_BASE}${id}.webp`);
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  images[id] = `data:image/webp;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
}

const assets = new URL("../dist/assets/", import.meta.url);
const files = readdirSync(assets);
const read = (ext: string) => readFileSync(new URL(files.find((f) => f.endsWith(ext))!, assets), "utf8");
const js = read(".js");
const css = read(".css");
if (/<\/script/i.test(js)) throw new Error("bundle contains </script>");

const html = `<title>OPTCG Sim</title>
<style>${css}</style>
<div id="root"></div>
<script>window.__CARD_IMAGES__=${JSON.stringify(images)}</script>
<script type="module">${js}</script>
`;
writeFileSync(out, html);
console.log(`${out}: ${ids.length} images, ${(html.length / 1e6).toFixed(1)} MB`);
