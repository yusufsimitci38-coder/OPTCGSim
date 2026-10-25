import type { Action, PlayerId } from "../engine/index.ts";

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

/** target id -> actions, for every action that starts from `source`. */
export function targetsFrom(actions: Action[], actor: PlayerId, source: string | null): Map<string, Action> {
  const out = new Map<string, Action>();
  if (!source) return out;
  for (const a of actions) {
    const e = edgeOf(a, actor);
    if (e && e.source === source && !out.has(e.target)) out.set(e.target, a);
  }
  return out;
}

export function draggableSources(actions: Action[], actor: PlayerId): Set<string> {
  const out = new Set<string>();
  for (const a of actions) {
    const e = edgeOf(a, actor);
    if (e) out.add(e.source);
  }
  return out;
}
