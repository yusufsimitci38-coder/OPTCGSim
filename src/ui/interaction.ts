import type { Action, GameState, PlayerId } from "../engine/index.ts";

/**
 * Board interaction model: most moves are "drag (or tap) this onto that". Sources and targets are
 * card instance ids, plus these pseudo-ids for areas that aren't a single card.
 */
export const donSource = (p: PlayerId) => `don:${p}`;
export const fieldTarget = (p: PlayerId) => `field:${p}`;

export interface Edge {
  source: string;
  target: string;
}

/** The drag gesture that performs an action, or null if it's done with a button. */
export function edgeOf(a: Action, actor: PlayerId): Edge | null {
  switch (a.type) {
    case "attachDon":
      return { source: donSource(actor), target: a.target };
    case "playCard":
      // With 5 Characters out, a new one is dropped onto the Character it replaces.
      return { source: a.iid, target: a.replace ?? fieldTarget(actor) };
    case "attack":
      return { source: a.attacker, target: a.target };
    case "counterCard":
      return { source: a.iid, target: a.target };
    default:
      return null;
  }
}

/** Hand cards with the same card id as `iid` (legal actions only list the first copy). */
function copiesInHand(state: GameState, actor: PlayerId, iid: string): string[] {
  const hand = state.players[actor].hand;
  if (!hand.includes(iid)) return [iid];
  const cardId = state.instances[iid].cardId;
  return hand.filter((h) => state.instances[h].cardId === cardId);
}

/** Rewrites an action listed for one copy so it uses the copy actually being moved. */
function forCopy(a: Action, iid: string): Action {
  return a.type === "playCard" || a.type === "counterCard" ? { ...a, iid } : a;
}

/** target id -> action, for every action that starts from `source` (any copy of a hand card). */
export function targetsFrom(state: GameState, actions: Action[], actor: PlayerId, source: string | null): Map<string, Action> {
  const out = new Map<string, Action>();
  if (!source) return out;
  const listed = copiesInHand(state, actor, source)[0];
  for (const a of actions) {
    const e = edgeOf(a, actor);
    if (e && e.source === listed && !out.has(e.target)) out.set(e.target, forCopy(a, source));
  }
  return out;
}

export function draggableSources(state: GameState, actions: Action[], actor: PlayerId): Set<string> {
  const out = new Set<string>();
  for (const a of actions) {
    const e = edgeOf(a, actor);
    if (e) for (const iid of copiesInHand(state, actor, e.source)) out.add(iid);
  }
  return out;
}
