import { getCard } from "../cards/index.ts";
import type { Ability, CardDef, Condition, Filter, GameState, Keyword, Permanent, PlayerId, Status } from "./types.ts";

export const opponent = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export function cardOf(state: GameState, iid: string): CardDef {
  return getCard(state.instances[iid].cardId);
}

export function ownerOf(state: GameState, iid: string): PlayerId {
  return state.instances[iid].owner;
}

export function cardName(state: GameState, iid: string): string {
  const c = cardOf(state, iid);
  return `${c.name} (${c.id})`;
}

export type FieldZone = "leader" | "character" | "stage";

/** Finds a card on the field (Leader, Character or Stage area). */
export function findPermanent(state: GameState, iid: string): { perm: Permanent; player: PlayerId; zone: FieldZone } | null {
  for (const pl of state.players) {
    if (pl.leader.iid === iid) return { perm: pl.leader, player: pl.id, zone: "leader" };
    const ch = pl.characters.find((c) => c.iid === iid);
    if (ch) return { perm: ch, player: pl.id, zone: "character" };
    if (pl.stage?.iid === iid) return { perm: pl.stage, player: pl.id, zone: "stage" };
  }
  return null;
}

export function permanentsOf(state: GameState, p: PlayerId): Permanent[] {
  const pl = state.players[p];
  return [pl.leader, ...pl.characters, ...(pl.stage ? [pl.stage] : [])];
}

export function checkConditions(state: GameState, conditions: Condition[] | undefined, source: string, controller: PlayerId): boolean {
  if (!conditions) return true;
  const found = findPermanent(state, source);
  return conditions.every((c) => {
    switch (c.kind) {
      case "donAttached":
        return !!found && found.perm.attachedDon >= c.n;
      case "yourTurn":
        return state.activePlayer === controller;
      case "opponentTurn":
        return state.activePlayer !== controller;
      case "selfRested":
        return !!found && found.perm.rested;
      case "minCharacters":
        return state.players[controller].characters.length >= c.n;
    }
  });
}

function activeStatics(state: GameState): { source: string; controller: PlayerId; ability: Ability }[] {
  const out: { source: string; controller: PlayerId; ability: Ability }[] = [];
  for (const p of [0, 1] as PlayerId[]) {
    for (const perm of permanentsOf(state, p)) {
      for (const ability of cardOf(state, perm.iid).abilities) {
        if (ability.timing === "static" && checkConditions(state, ability.conditions, perm.iid, p)) {
          out.push({ source: perm.iid, controller: p, ability });
        }
      }
    }
  }
  return out;
}

export function hasKeyword(state: GameState, iid: string, keyword: Keyword): boolean {
  const found = findPermanent(state, iid);
  if (!found) return false;
  return cardOf(state, iid).abilities.some(
    (a) =>
      a.timing === "static" &&
      a.statics?.some((s) => s.kind === "keyword" && s.keyword === keyword) &&
      checkConditions(state, a.conditions, iid, found.player),
  );
}

export function hasStatus(state: GameState, iid: string, status: Status): boolean {
  return state.statuses.some((s) => s.target === iid && s.status === status);
}

/** Matches a field card against a filter, relative to the ability's controller. */
export function matchesFilter(state: GameState, iid: string, filter: Filter, controller: PlayerId, source: string): boolean {
  const found = findPermanent(state, iid);
  if (!found) return false;
  const wantOwner = filter.owner === "self" ? controller : opponent(controller);
  if (found.player !== wantOwner) return false;
  if (found.zone === "stage") return false;
  if (filter.zone !== "leaderOrCharacter" && filter.zone !== found.zone) return false;
  if (filter.notSelf && iid === source) return false;
  const card = cardOf(state, iid);
  if (filter.maxCost !== undefined && (found.zone !== "character" || card.cost > filter.maxCost)) return false;
  if (filter.maxPower !== undefined && power(state, iid) > filter.maxPower) return false;
  if (filter.rested !== undefined && found.perm.rested !== filter.rested) return false;
  if (filter.types && !filter.types.some((t) => card.types.includes(t))) return false;
  if (filter.keyword && !hasKeyword(state, iid, filter.keyword)) return false;
  return true;
}

export function candidates(state: GameState, filter: Filter, controller: PlayerId, source: string): string[] {
  const p = filter.owner === "self" ? controller : opponent(controller);
  const pl = state.players[p];
  return [pl.leader, ...pl.characters].map((x) => x.iid).filter((iid) => matchesFilter(state, iid, filter, controller, source));
}

/** Current power of a Leader or Character on the field. */
export function power(state: GameState, iid: string): number {
  const found = findPermanent(state, iid);
  const card = cardOf(state, iid);
  let total = card.power;
  if (!found) return total;
  if (state.activePlayer === found.player) total += found.perm.attachedDon * 1000;
  for (const { source, controller, ability } of activeStatics(state)) {
    for (const s of ability.statics ?? []) {
      if (s.kind !== "aura") continue;
      if (s.target === "self" ? source === iid : matchesAuraFilter(state, iid, s.target, controller)) total += s.amount;
    }
  }
  for (const m of state.modifiers) if (m.target === iid) total += m.amount;
  return total;
}

// Aura filters never use power (avoids recursion through power()).
function matchesAuraFilter(state: GameState, iid: string, filter: Filter, controller: PlayerId): boolean {
  const { maxPower: _ignored, ...rest } = filter;
  return matchesFilter(state, iid, rest, controller, "");
}

export function canBattleThisTurn(state: GameState): boolean {
  // Neither player may battle on their own first turn.
  return state.turn > 2;
}
