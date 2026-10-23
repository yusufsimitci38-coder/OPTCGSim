import raw from "../data/cards.json";
import type { CardData } from "../engine/cardData.ts";
import type { Ability, CardDef, Keyword } from "../engine/types.ts";
import { ST01 } from "./ST01.ts";
import { ST02 } from "./ST02.ts";

/** Hand-written ability definitions, keyed by card id. */
const DEFINITIONS: Record<string, Ability[]> = { ...ST01, ...ST02 };

const KEYWORDS: Record<string, Keyword> = {
  Rush: "rush",
  Blocker: "blocker",
  "Double Attack": "doubleAttack",
  Banish: "banish",
};

/**
 * Cards without a hand-written definition: vanilla cards and cards whose text is only
 * unconditional keywords ([Blocker], [Rush], ...) are fully understood. Anything else is
 * flagged as not implemented (keywords are still applied).
 */
export function parseKeywordsOnly(text: string, trigger = ""): { abilities: Ability[]; implemented: boolean } {
  let rest = text.replace(/\([^)]*\)/g, " ").trim();
  const keywords: Keyword[] = [];
  for (;;) {
    const m = /^\[(Rush|Blocker|Double Attack|Banish)\]\s*/.exec(rest);
    if (!m) break;
    keywords.push(KEYWORDS[m[1]]);
    rest = rest.slice(m[0].length);
  }
  const abilities: Ability[] = keywords.length
    ? [{ timing: "static", statics: keywords.map((keyword) => ({ kind: "keyword" as const, keyword })) }]
    : [];
  return { abilities, implemented: rest === "" && trigger === "" };
}

const DATA = raw as Record<string, CardData>;
const cache = new Map<string, CardDef>();

export function getCard(id: string): CardDef {
  let def = cache.get(id);
  if (!def) {
    const data = DATA[id];
    if (!data) throw new Error(`Unknown card ${id}`);
    const custom = DEFINITIONS[id];
    def = custom ? { ...data, abilities: custom, implemented: true } : { ...data, ...parseKeywordsOnly(data.effect, data.trigger) };
    cache.set(id, def);
  }
  return def;
}

export function hasCard(id: string): boolean {
  return id in DATA;
}

export function allCardIds(): string[] {
  return Object.keys(DATA);
}
