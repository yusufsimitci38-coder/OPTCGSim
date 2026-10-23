import { getCard, hasCard } from "../cards/index.ts";
import type { DeckList } from "./types.ts";

const expand = (counts: Record<string, number>) => Object.entries(counts).flatMap(([id, n]) => Array<string>(n).fill(id));

/**
 * Starter-deck style lists built from the ST-01 / ST-02 card pools (50 cards each).
 * Copy counts are chosen to make legal 50-card decks, not copied from the retail product.
 */
export const STARTER_DECKS: Record<string, DeckList> = {
  "ST-01 Straw Hat Crew (Luffy)": {
    leader: "ST01-001",
    cards: expand({
      "ST01-002": 4, "ST01-003": 4, "ST01-004": 4, "ST01-005": 4, "ST01-006": 4, "ST01-007": 4,
      "ST01-008": 3, "ST01-009": 3, "ST01-010": 4, "ST01-011": 4, "ST01-012": 2, "ST01-013": 2,
      "ST01-014": 2, "ST01-015": 2, "ST01-016": 2, "ST01-017": 2,
    }),
  },
  "ST-02 Worst Generation (Kid)": {
    leader: "ST02-001",
    cards: expand({
      "ST02-002": 4, "ST02-003": 3, "ST02-004": 4, "ST02-005": 3, "ST02-006": 4, "ST02-007": 4,
      "ST02-008": 3, "ST02-009": 2, "ST02-010": 3, "ST02-011": 3, "ST02-012": 4, "ST02-013": 2,
      "ST02-014": 3, "ST02-015": 3, "ST02-016": 3, "ST02-017": 2,
    }),
  },
};

export const DECK_SIZE = 50;
export const MAX_COPIES = 4;

/** Deck construction rules. Returns a list of problems (empty if legal). */
export function validateDeck(deck: DeckList): string[] {
  const errors: string[] = [];
  if (!hasCard(deck.leader)) return [`Unknown leader ${deck.leader}`];
  const leader = getCard(deck.leader);
  if (leader.category !== "Leader") errors.push(`${deck.leader} is not a Leader`);
  if (deck.cards.length !== DECK_SIZE) errors.push(`Deck has ${deck.cards.length} cards, needs ${DECK_SIZE}`);
  const counts = new Map<string, number>();
  for (const id of deck.cards) {
    if (!hasCard(id)) {
      errors.push(`Unknown card ${id}`);
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
    const c = getCard(id);
    if (c.category === "Leader") errors.push(`${id} is a Leader and cannot be in the deck`);
    if (!c.colors.some((col) => leader.colors.includes(col))) errors.push(`${id} (${c.colors.join("/")}) doesn't match the Leader's colors`);
  }
  for (const [id, n] of counts) if (n > MAX_COPIES) errors.push(`${id}: ${n} copies (max ${MAX_COPIES})`);
  return [...new Set(errors)];
}
