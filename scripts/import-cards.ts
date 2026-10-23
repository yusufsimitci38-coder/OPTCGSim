/**
 * Converts the community card list (https://github.com/nemesis312/OnePieceTCGEngCardList,
 * MIT licensed, file CardDb3.json) into src/data/cards.json.
 *
 *   node scripts/import-cards.ts path/to/CardDb3.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { CardData, Category } from "../src/engine/cardData.ts";

interface SourceCard {
  CardNum: string;
  Rarity: string;
  CardType: string;
  Name: string;
  Img: string;
  Cost: string;
  Attribute: string;
  Power: string;
  Counter: string;
  Color: string;
  Type: string;
  Effect: string;
  CardSets: string;
}

const CATEGORIES: Record<string, Category> = {
  LEADER: "Leader",
  CHARACTER: "Character",
  EVENT: "Event",
  STAGE: "Stage",
};

const num = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : 0);
const list = (s: string) =>
  s.trim() === "" || s.trim() === "-" ? [] : s.split("/").map((x) => x.trim()).filter(Boolean);

const src = process.argv[2];
if (!src) throw new Error("usage: node scripts/import-cards.ts <CardDb3.json>");
const raw = JSON.parse(readFileSync(src, "utf8")) as { Cards: SourceCard[] };

const out: Record<string, CardData> = {};
const skipped: string[] = [];
for (const c of raw.Cards) {
  const id = c.CardNum.replace(/^#/, "").trim();
  const category = CATEGORIES[c.CardType.trim().toUpperCase()];
  if (!category) {
    skipped.push(`${id} (${c.CardType})`);
    continue;
  }
  if (out[id]) continue; // keep the first printing
  const isLeader = category === "Leader";
  out[id] = {
    id,
    name: c.Name.trim(),
    category,
    colors: list(c.Color),
    cost: isLeader ? 0 : num(c.Cost),
    life: isLeader ? num(c.Cost) : null,
    power: num(c.Power),
    counter: num(c.Counter),
    attributes: list(c.Attribute),
    types: list(c.Type),
    rarity: c.Rarity.trim(),
    effect: c.Effect.trim() === "-" ? "" : c.Effect.replace(/\s+/g, " ").trim(),
    set: c.CardSets.replace(/^Card Set\(s\)/, "").trim(),
    image: c.Img,
  };
}

const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
writeFileSync(new URL("../src/data/cards.json", import.meta.url), JSON.stringify(sorted) + "\n");
console.log(`wrote ${Object.keys(sorted).length} cards; skipped ${skipped.length}: ${skipped.slice(0, 10).join(", ")}`);
