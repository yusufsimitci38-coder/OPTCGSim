/**
 * Converts punk-records (https://github.com/buhbbl/punk-records), a daily-updated JSON export of the
 * official English card list, into src/data/cards.json.
 *
 *   git clone --depth 1 https://github.com/buhbbl/punk-records
 *   node scripts/import-cards.ts punk-records/english
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CardData, Category } from "../src/engine/cardData.ts";

interface SourceCard {
  id: string;
  pack_id: string;
  name: string;
  rarity: string;
  category: string;
  img_full_url: string;
  colors: string[];
  cost: number | null;
  attributes: string[];
  power: number | null;
  counter: number | null;
  types: string[];
  effect: string;
  trigger: string | null;
}

interface SourcePack {
  raw_title: string;
  title_parts: { label?: string };
}

const CATEGORIES = new Set<Category>(["Leader", "Character", "Event", "Stage"]);
const clean = (s: string | null | undefined) => (!s || s.trim() === "-" ? "" : s.replace(/\s+/g, " ").trim());

const dir = process.argv[2];
if (!dir) throw new Error("usage: node scripts/import-cards.ts <punk-records/english>");
const packs = JSON.parse(readFileSync(join(dir, "packs.json"), "utf8")) as Record<string, SourcePack>;
const source: SourceCard[] = readdirSync(join(dir, "data"))
  .filter((f) => f.endsWith(".json"))
  .sort()
  .flatMap((f) => JSON.parse(readFileSync(join(dir, "data", f), "utf8")) as SourceCard[]);

// Alternate arts share the base id with a suffix (OP01-016_p3, ST01-014_r1).
const baseId = (id: string) => id.replace(/_[a-z]\d+$/i, "");
const out: Record<string, CardData> = {};
const isBase = (c: SourceCard) => c.id === baseId(c.id);
// Base printings first so they define the card; variants only add images.
for (const c of [...source].sort((a, b) => Number(isBase(b)) - Number(isBase(a)))) {
  const id = baseId(c.id);
  if (!CATEGORIES.has(c.category as Category)) continue;
  const existing = out[id];
  if (existing) {
    if (!existing.images.includes(c.img_full_url)) existing.images.push(c.img_full_url);
    continue;
  }
  const isLeader = c.category === "Leader";
  const pack = packs[c.pack_id];
  out[id] = {
    id,
    name: c.name.trim(),
    category: c.category as Category,
    colors: c.colors,
    cost: isLeader ? 0 : (c.cost ?? 0),
    life: isLeader ? (c.cost ?? 0) : null,
    power: c.power ?? 0,
    counter: c.counter ?? 0,
    attributes: c.attributes,
    types: c.types,
    rarity: c.rarity,
    effect: clean(c.effect),
    trigger: clean(c.trigger),
    set: pack?.title_parts.label ?? pack?.raw_title ?? c.pack_id,
    image: c.img_full_url,
    images: [c.img_full_url],
  };
}

const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
writeFileSync(new URL("../src/data/cards.json", import.meta.url), JSON.stringify(sorted) + "\n");
console.log(`wrote ${Object.keys(sorted).length} cards from ${source.length} printings`);
