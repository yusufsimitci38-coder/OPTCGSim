import type { CardData } from "./cardData.ts";

export type PlayerId = 0 | 1;

// ---------------------------------------------------------------------------
// Effect DSL. Card behaviour is data built from these primitives so that the
// engine (and later the AI) can reason about every card the same way.
// ---------------------------------------------------------------------------

export type Timing =
  | "static" // continuous: keywords and power auras
  | "onPlay"
  | "whenAttacking"
  | "onBlock"
  | "onKO"
  | "endOfYourTurn"
  | "battlesCharacter" // "if this Character battles your opponent's Character"
  | "activateMain"
  | "main" // Event [Main]
  | "counter" // Event [Counter]
  | "trigger"; // Life [Trigger]

export type Keyword = "rush" | "blocker" | "doubleAttack" | "banish";

export type Condition =
  | { kind: "donAttached"; n: number } // [DON!! xN]
  | { kind: "yourTurn" }
  | { kind: "opponentTurn" }
  | { kind: "selfRested" }
  | { kind: "minCharacters"; n: number }; // you have N or more Characters

/** Selects cards on the field. Leader/Character only for now. */
export interface Filter {
  owner: "self" | "opponent";
  zone: "leader" | "character" | "leaderOrCharacter";
  maxCost?: number;
  maxPower?: number;
  rested?: boolean;
  /** Matches if the card has any of these types. */
  types?: string[];
  /** Exclude the card that owns the ability. */
  notSelf?: boolean;
  keyword?: Keyword;
}

export type TargetSpec = "self" | Filter;

export type Duration = "turn" | "battle";

export type Effect =
  | { kind: "power"; target: TargetSpec; amount: number; duration: Duration; upTo?: number }
  | { kind: "ko"; target: Filter; upTo: number }
  | { kind: "rest"; target: Filter; upTo: number }
  | { kind: "setActive"; target: TargetSpec; upTo?: number }
  | { kind: "giveRestedDon"; target: Filter; amount: number }
  | { kind: "restOpponentDon"; upTo: number }
  | { kind: "setDonActive"; upTo: number }
  | { kind: "draw"; n: number }
  | { kind: "searchTop"; look: number; types?: string[]; upTo: number }
  | { kind: "battleRestriction"; noBlockers?: boolean; blockerMaxPower?: number }
  | { kind: "status"; target: TargetSpec; status: Status; duration: Duration; upTo?: number }
  | { kind: "playSelf" } // e.g. "[Trigger] Play this card."
  | { kind: "playFromHand"; upTo: number; maxCost?: number; types?: string[] };

export type Status = "unblockable";

/** Continuous effects used by `static` abilities. */
export type StaticEffect =
  | { kind: "keyword"; keyword: Keyword }
  | { kind: "aura"; target: TargetSpec; amount: number };

export type Cost =
  | { kind: "restDon"; n: number } // ①②③...
  | { kind: "restSelf" }
  | { kind: "trashFromHand"; n: number };

export interface Ability {
  timing: Timing;
  conditions?: Condition[];
  oncePerTurn?: boolean;
  costs?: Cost[];
  effects?: Effect[];
  statics?: StaticEffect[];
}

export interface CardDef extends CardData {
  abilities: Ability[];
  /** False when the printed text has effects the engine does not model yet. */
  implemented: boolean;
}

// ---------------------------------------------------------------------------
// Game state. Plain JSON so it can be cloned, serialized and searched by an AI.
// ---------------------------------------------------------------------------

export interface Permanent {
  iid: string;
  rested: boolean;
  attachedDon: number;
  /** Turn number on which it entered the field. */
  enteredTurn: number;
}

export interface PlayerState {
  id: PlayerId;
  leader: Permanent;
  characters: Permanent[];
  stage: Permanent | null;
  /** Index 0 is the top of the deck / life. */
  deck: string[];
  hand: string[];
  trash: string[];
  life: string[];
  /** Cards being resolved (revealed trigger cards). */
  limbo: string[];
  donDeck: number;
  donActive: number;
  donRested: number;
}

export interface Modifier {
  target: string;
  amount: number;
  duration: Duration;
}

export interface StatusEffect {
  target: string;
  status: Status;
  duration: Duration;
}

export interface Battle {
  attacker: string;
  target: string;
  attackingPlayer: PlayerId;
  noBlockers: boolean;
  blockerMaxPower: number | null;
  blocked: boolean;
}

export interface EffectCtx {
  source: string;
  controller: PlayerId;
  choice?: string[];
  /** Cards looked at by searchTop. */
  looked?: string[];
  /** Target picked in a previous step (giveRestedDon). */
  picked?: string;
}

export type Task =
  | { kind: "effect"; effect: Effect; ctx: EffectCtx }
  | { kind: "payTrashCost"; n: number; ctx: EffectCtx }
  | { kind: "blockStep" }
  | { kind: "counterStep" }
  | { kind: "damageStep" }
  | { kind: "lifeDamage"; banish: boolean }
  | { kind: "endBattle" }
  | { kind: "cleanupLimbo"; player: PlayerId; iid: string }
  | { kind: "finishEvent"; player: PlayerId; iid: string }
  | { kind: "endTurn" };

export type Pending =
  | { type: "mulligan"; player: PlayerId }
  | { type: "block"; player: PlayerId; options: string[] }
  | { type: "counter"; player: PlayerId }
  | { type: "trigger"; player: PlayerId; iid: string }
  | { type: "choose"; player: PlayerId; prompt: string; options: string[]; min: number; max: number };

export type Phase = "setup" | "main" | "gameOver";

export interface GameState {
  rngState: number;
  instances: Record<string, { cardId: string; owner: PlayerId }>;
  players: [PlayerState, PlayerState];
  firstPlayer: PlayerId;
  activePlayer: PlayerId;
  /** Global turn counter, starting at 1. */
  turn: number;
  phase: Phase;
  battle: Battle | null;
  queue: Task[];
  pending: Pending | null;
  modifiers: Modifier[];
  statuses: StatusEffect[];
  /** Keys `${iid}:${abilityIndex}` of once-per-turn abilities used this turn. */
  usedThisTurn: string[];
  /** 0/1 = winner, "draw" if both lost simultaneously. */
  winner: PlayerId | "draw" | null;
  log: string[];
}

export type Action =
  | { type: "mulligan"; redraw: boolean }
  | { type: "playCard"; iid: string; replace?: string }
  | { type: "attachDon"; target: string }
  | { type: "activate"; iid: string; ability: number }
  | { type: "attack"; attacker: string; target: string }
  | { type: "endTurn" }
  | { type: "block"; blocker: string | null }
  | { type: "counterCard"; iid: string; target: string }
  | { type: "counterEvent"; iid: string }
  | { type: "passCounter" }
  | { type: "trigger"; activate: boolean }
  | { type: "choose"; selection: string[] };

export interface DeckList {
  leader: string;
  /** 50 card ids (duplicates allowed). */
  cards: string[];
}
