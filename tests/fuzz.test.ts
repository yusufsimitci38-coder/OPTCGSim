import { describe, expect, it } from "vitest";
import { applyAction, createGame, randomAgent } from "../src/engine/index.ts";
import type { GameState } from "../src/engine/index.ts";
import { KID_DECK, LUFFY_DECK } from "./helpers.ts";

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkInvariants(s: GameState) {
  for (const pl of s.players) {
    const cards =
      pl.deck.length + pl.hand.length + pl.trash.length + pl.life.length + pl.limbo.length + pl.characters.length + (pl.stage ? 1 : 0);
    expect(cards).toBe(50);
    const attached = [pl.leader, ...pl.characters, ...(pl.stage ? [pl.stage] : [])].reduce((n, p) => n + p.attachedDon, 0);
    expect(pl.donDeck + pl.donActive + pl.donRested + attached).toBe(10);
    expect(pl.donActive).toBeGreaterThanOrEqual(0);
    expect(pl.characters.length).toBeLessThanOrEqual(5);
  }
}

function playOut(seed: number): GameState {
  const random = mulberry(seed);
  let s = createGame([LUFFY_DECK, KID_DECK], { seed });
  for (let i = 0; i < 5000 && s.phase !== "gameOver"; i++) {
    s = applyAction(s, randomAgent.chooseAction(s, random));
    checkInvariants(s);
  }
  return s;
}

describe("random games", () => {
  it("200 random games all finish with consistent state", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = playOut(seed);
      expect(s.phase, `seed ${seed}`).toBe("gameOver");
    }
  }, 60_000);

  it("games are deterministic for a given seed", () => {
    expect(playOut(42).log).toEqual(playOut(42).log);
  });
});
