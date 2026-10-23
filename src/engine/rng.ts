/** Deterministic RNG (mulberry32). The state lives in GameState so games replay exactly. */
export function nextRandom(state: { rngState: number }): number {
  let t = (state.rngState = (state.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle<T>(state: { rngState: number }, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}
