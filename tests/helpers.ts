import { applyAction, createGame, getLegalActions, STARTER_DECKS } from "../src/engine/index.ts";
import type { Action, GameState, Permanent, PlayerId } from "../src/engine/index.ts";

export const LUFFY_DECK = STARTER_DECKS["ST-01 Straw Hat Crew (Luffy)"];
export const KID_DECK = STARTER_DECKS["ST-02 Worst Generation (Kid)"];

/** New game, both players keep, Player 1 (id 0) on turn 1 main phase. */
export function newGame(seed = 1): GameState {
  let s = createGame([LUFFY_DECK, KID_DECK], { seed, firstPlayer: 0 });
  s = applyAction(s, { type: "mulligan", redraw: false });
  s = applyAction(s, { type: "mulligan", redraw: false });
  return s;
}

let counter = 0;
/** Creates a fresh card instance owned by `p` (not placed anywhere). */
export function make(s: GameState, p: PlayerId, cardId: string): string {
  const iid = `t${p}-${counter++}`;
  s.instances[iid] = { cardId, owner: p };
  return iid;
}

export function toHand(s: GameState, p: PlayerId, cardId: string): string {
  const iid = make(s, p, cardId);
  s.players[p].hand.push(iid);
  return iid;
}

/** Puts a Character on the field that can attack this turn (entered on turn 0). */
export function toField(s: GameState, p: PlayerId, cardId: string, extra: Partial<Permanent> = {}): string {
  const iid = make(s, p, cardId);
  s.players[p].characters.push({ iid, rested: false, attachedDon: 0, enteredTurn: 0, ...extra });
  return iid;
}

/** Jumps to a turn where battling is allowed with `p` active and `don` active DON!!. */
export function battleTurn(s: GameState, p: PlayerId, don = 10): GameState {
  s.turn = 3;
  s.activePlayer = p;
  s.players[p].donActive = don;
  s.players[p].donDeck = 10 - don;
  return s;
}

export function act(s: GameState, a: Action): GameState {
  return applyAction(s, a);
}

export function has(s: GameState, pred: (a: Action) => boolean): boolean {
  return getLegalActions(s).some(pred);
}

export const leader = (s: GameState, p: PlayerId) => s.players[p].leader.iid;
