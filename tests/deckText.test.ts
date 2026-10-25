import { describe, expect, it } from "vitest";
import { deckToText, parseDeckText, STARTER_DECKS } from "../src/engine/index.ts";

describe("deck text", () => {
  it("round-trips a deck", () => {
    const deck = STARTER_DECKS["ST-01 Straw Hat Crew (Luffy)"];
    const text = deckToText(deck);
    expect(text.split("\n")[0]).toBe("1xST01-001");
    const parsed = parseDeckText(text);
    expect(parsed.problems).toEqual([]);
    expect(parsed.deck.leader).toBe(deck.leader);
    expect([...parsed.deck.cards].sort()).toEqual([...deck.cards].sort());
  });

  it("accepts other common formats and reports problems", () => {
    const parsed = parseDeckText("# my deck\n1 x ST01-001\n4 ST01-004 Sanji\nst01-005 x3\nST01-006\nnonsense\n2xOP99-999");
    expect(parsed.deck.leader).toBe("ST01-001");
    expect(parsed.deck.cards.filter((c) => c === "ST01-004")).toHaveLength(4);
    expect(parsed.deck.cards.filter((c) => c === "ST01-005")).toHaveLength(3);
    expect(parsed.deck.cards.filter((c) => c === "ST01-006")).toHaveLength(1);
    expect(parsed.problems).toEqual(['Can\'t read "nonsense"', "Unknown card OP99-999"]);
  });
});
