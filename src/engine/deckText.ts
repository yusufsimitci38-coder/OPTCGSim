import { getCard, hasCard } from "../cards/index.ts";
import type { DeckList } from "./types.ts";

/**
 * Deck lists as text, one card per line: `4xOP01-016` (the format other simulators use).
 * The Leader is the line whose card is a Leader. Parsing also accepts `4 OP01-016`, `OP01-016 x4`
 * and a bare `OP01-016` (one copy); anything after the id (like a card name) is ignored.
 */
export function deckToText(deck: DeckList): string {
  const counts = new Map<string, number>();
  for (const id of deck.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  const lines = deck.leader ? [`1x${deck.leader}`] : [];
  for (const [id, n] of [...counts].sort(([a], [b]) => a.localeCompare(b))) lines.push(`${n}x${id}`);
  return lines.join("\n");
}

export interface ParsedDeck {
  deck: DeckList;
  /** Lines that couldn't be read or name unknown cards. */
  problems: string[];
}

const ID = /((?:OP|ST|EB|PRB|P)\d{0,2}-\d{3})/i;

export function parseDeckText(text: string): ParsedDeck {
  const deck: DeckList = { leader: "", cards: [] };
  const problems: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const idMatch = ID.exec(line);
    if (!idMatch) {
      problems.push(`Can't read "${line}"`);
      continue;
    }
    const id = idMatch[1].toUpperCase();
    const before = line.slice(0, idMatch.index);
    const after = line.slice(idMatch.index + idMatch[0].length);
    const count = Number(/(\d+)\s*x?\s*$/i.exec(before)?.[1] ?? /^\s*x\s*(\d+)/i.exec(after)?.[1] ?? 1);
    if (!hasCard(id)) {
      problems.push(`Unknown card ${id}`);
      continue;
    }
    if (getCard(id).category === "Leader") {
      if (deck.leader && deck.leader !== id) problems.push(`More than one Leader (${deck.leader}, ${id})`);
      else deck.leader = id;
      continue;
    }
    for (let i = 0; i < count; i++) deck.cards.push(id);
  }
  return { deck, problems };
}
