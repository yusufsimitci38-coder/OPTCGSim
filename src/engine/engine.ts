import { getCard } from "../cards/index.ts";
import { nextRandom, shuffle } from "./rng.ts";
import {
  canBattleThisTurn,
  candidates,
  cardName,
  cardOf,
  checkConditions,
  findPermanent,
  hasKeyword,
  hasStatus,
  opponent,
  ownerOf,
  permanentsOf,
  power,
} from "./query.ts";
import type {
  Action,
  DeckList,
  Effect,
  EffectCtx,
  Filter,
  GameState,
  Permanent,
  PlayerId,
  PlayerState,
  Task,
  Timing,
} from "./types.ts";

export const MAX_CHARACTERS = 5;
export const DON_DECK_SIZE = 10;
export const HAND_SIZE = 5;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export interface GameOptions {
  seed: number;
  /** Who goes first; random when omitted. */
  firstPlayer?: PlayerId;
}

export function createGame(decks: [DeckList, DeckList], options: GameOptions): GameState {
  const instances: GameState["instances"] = {};
  const players = decks.map((deck, i) => {
    const p = i as PlayerId;
    const leaderIid = `p${p}-L`;
    instances[leaderIid] = { cardId: deck.leader, owner: p };
    const cards = deck.cards.map((cardId, n) => {
      const iid = `p${p}-${n}`;
      instances[iid] = { cardId, owner: p };
      return iid;
    });
    const pl: PlayerState = {
      id: p,
      leader: { iid: leaderIid, rested: false, attachedDon: 0, enteredTurn: 0 },
      characters: [],
      stage: null,
      deck: cards,
      hand: [],
      trash: [],
      life: [],
      limbo: [],
      donDeck: DON_DECK_SIZE,
      donActive: 0,
      donRested: 0,
    };
    return pl;
  }) as [PlayerState, PlayerState];

  const state: GameState = {
    rngState: options.seed | 0,
    instances,
    players,
    firstPlayer: 0,
    activePlayer: 0,
    turn: 0,
    phase: "setup",
    battle: null,
    queue: [],
    pending: null,
    modifiers: [],
    statuses: [],
    usedThisTurn: [],
    winner: null,
    log: [],
  };
  state.firstPlayer = options.firstPlayer ?? (nextRandom(state) < 0.5 ? 0 : 1);
  state.activePlayer = state.firstPlayer;
  for (const pl of players) {
    shuffle(state, pl.deck);
    draw(state, pl.id, HAND_SIZE);
  }
  log(state, `Player ${state.firstPlayer + 1} goes first.`);
  state.pending = { type: "mulligan", player: state.firstPlayer };
  return state;
}

function log(state: GameState, msg: string) {
  state.log.push(msg);
}

function draw(state: GameState, p: PlayerId, n: number) {
  const pl = state.players[p];
  for (let i = 0; i < n && pl.deck.length; i++) pl.hand.push(pl.deck.shift()!);
}

function startGame(state: GameState) {
  for (const pl of state.players) {
    // The top card of the deck ends up at the bottom of the Life area.
    const life = getCard(state.instances[pl.leader.iid].cardId).life ?? 0;
    pl.life = pl.deck.splice(0, life).reverse();
  }
  state.turn = 1;
  state.activePlayer = state.firstPlayer;
  startTurn(state);
}

function startTurn(state: GameState) {
  const p = state.activePlayer;
  const pl = state.players[p];
  log(state, `— Turn ${state.turn}: Player ${p + 1} —`);
  // Refresh phase: attached DON!! return rested, then everything is set active.
  for (const perm of permanentsOf(state, p)) {
    pl.donRested += perm.attachedDon;
    perm.attachedDon = 0;
    perm.rested = false;
  }
  pl.donActive += pl.donRested;
  pl.donRested = 0;
  // Draw phase: the first player skips it on the first turn.
  if (state.turn !== 1) draw(state, p, 1);
  // DON!! phase.
  const don = Math.min(state.turn === 1 ? 1 : 2, pl.donDeck);
  pl.donDeck -= don;
  pl.donActive += don;
  state.phase = "main";
  checkDefeat(state);
}

// ---------------------------------------------------------------------------
// Rule processing
// ---------------------------------------------------------------------------

function lose(state: GameState, losers: PlayerId[]) {
  if (state.phase === "gameOver" || losers.length === 0) return;
  state.winner = losers.length === 2 ? "draw" : opponent(losers[0]);
  state.phase = "gameOver";
  state.pending = null;
  state.queue = [];
  log(state, state.winner === "draw" ? "The game is a draw." : `Player ${state.winner + 1} wins!`);
}

function checkDefeat(state: GameState) {
  if (state.phase === "setup") return;
  lose(
    state,
    state.players.filter((pl) => pl.deck.length === 0).map((pl) => pl.id),
  );
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

/** Removes a Character/Stage from the field; attached DON!! return to the cost area rested. */
function removeFromField(state: GameState, iid: string, to: "trash" | "hand" | "deckBottom") {
  const found = findPermanent(state, iid);
  if (!found || found.zone === "leader") return;
  const pl = state.players[found.player];
  pl.donRested += found.perm.attachedDon;
  if (found.zone === "character") pl.characters = pl.characters.filter((c) => c.iid !== iid);
  else pl.stage = null;
  state.modifiers = state.modifiers.filter((m) => m.target !== iid);
  state.statuses = state.statuses.filter((s) => s.target !== iid);
  const owner = state.players[ownerOf(state, iid)];
  if (to === "trash") owner.trash.push(iid);
  else if (to === "hand") owner.hand.push(iid);
  else owner.deck.push(iid);
}

/** K.O.s a Character and returns its [On K.O.] effects for the caller to queue. */
function ko(state: GameState, iid: string): Task[] {
  const found = findPermanent(state, iid);
  if (!found || found.zone !== "character") return [];
  // [On K.O.] conditions are checked while the card is still on the field.
  const tasks = triggeredTasks(state, iid, "onKO");
  log(state, `${cardName(state, iid)} is K.O.'d.`);
  removeFromField(state, iid, "trash");
  return tasks;
}

function newPermanent(state: GameState, iid: string): Permanent {
  return { iid, rested: false, attachedDon: 0, enteredTurn: state.turn };
}

function restDon(state: GameState, p: PlayerId, n: number) {
  const pl = state.players[p];
  pl.donActive -= n;
  pl.donRested += n;
}

// ---------------------------------------------------------------------------
// Task queue: effects and battle steps resolve in order and may pause for a decision.
// ---------------------------------------------------------------------------

function pushFront(state: GameState, tasks: Task[]) {
  state.queue.unshift(...tasks);
}

function abilityTasks(effects: Effect[] | undefined, source: string, controller: PlayerId): Task[] {
  return (effects ?? []).map((effect) => ({ kind: "effect", effect, ctx: { source, controller } }));
}

/** Effects of a card's abilities with the given timing whose conditions currently hold. */
function triggeredTasks(state: GameState, iid: string, timing: Timing): Task[] {
  const controller = ownerOf(state, iid);
  const tasks: Task[] = [];
  cardOf(state, iid).abilities.forEach((a, idx) => {
    if (a.timing !== timing) return;
    const key = `${iid}:${idx}`;
    if (a.oncePerTurn && state.usedThisTurn.includes(key)) return;
    if (!checkConditions(state, a.conditions, iid, controller)) return;
    if (a.oncePerTurn) state.usedThisTurn.push(key);
    tasks.push(...abilityTasks(a.effects, iid, controller));
  });
  return tasks;
}

function process(state: GameState) {
  while (!state.pending && state.queue.length && state.phase !== "gameOver") {
    const task = state.queue.shift()!;
    runTask(state, task);
    checkDefeat(state);
  }
}

/** Ask the controller to pick targets. Returns the choice, or null after pausing. */
function choose(
  state: GameState,
  task: Task & { ctx: EffectCtx },
  options: string[],
  min: number,
  max: number,
  prompt: string,
): string[] | null {
  if (task.ctx.choice) return task.ctx.choice;
  max = Math.min(max, options.length);
  min = Math.min(min, max);
  if (max === 0) return [];
  state.pending = { type: "choose", player: task.ctx.controller, prompt, options, min, max };
  state.queue.unshift(task);
  return null;
}

function targetsOf(state: GameState, task: Task & { kind: "effect" }, target: "self" | Filter, upTo: number, prompt: string) {
  if (target === "self") return findPermanent(state, task.ctx.source) ? [task.ctx.source] : [];
  return choose(state, task, candidates(state, target, task.ctx.controller, task.ctx.source), 0, upTo, prompt);
}

function runTask(state: GameState, task: Task) {
  switch (task.kind) {
    case "effect":
      return runEffect(state, task);
    case "payTrashCost": {
      const pl = state.players[task.ctx.controller];
      const picked = choose(state, task, [...pl.hand], task.n, task.n, `Trash ${task.n} card(s) from your hand`);
      if (!picked) return;
      for (const iid of picked) {
        pl.hand = pl.hand.filter((h) => h !== iid);
        pl.trash.push(iid);
        log(state, `Player ${pl.id + 1} trashes ${cardName(state, iid)}.`);
      }
      return;
    }
    case "blockStep":
      return blockStep(state);
    case "counterStep":
      return counterStep(state);
    case "damageStep":
      return damageStep(state);
    case "lifeDamage":
      return lifeDamage(state, task.banish);
    case "endBattle":
      state.modifiers = state.modifiers.filter((m) => m.duration !== "battle");
      state.statuses = state.statuses.filter((s) => s.duration !== "battle");
      state.battle = null;
      return;
    case "cleanupLimbo":
    case "finishEvent": {
      const pl = state.players[task.player];
      if (pl.limbo.includes(task.iid)) {
        pl.limbo = pl.limbo.filter((x) => x !== task.iid);
        pl.trash.push(task.iid);
      }
      return;
    }
    case "endTurn": {
      state.modifiers = state.modifiers.filter((m) => m.duration !== "turn");
      state.statuses = state.statuses.filter((s) => s.duration !== "turn");
      state.usedThisTurn = [];
      state.activePlayer = opponent(state.activePlayer);
      state.turn++;
      startTurn(state);
      return;
    }
  }
}

function runEffect(state: GameState, task: Task & { kind: "effect" }) {
  const { effect, ctx } = task;
  const me = state.players[ctx.controller];
  const them = state.players[opponent(ctx.controller)];
  const src = cardName(state, ctx.source);
  switch (effect.kind) {
    case "power": {
      const targets = targetsOf(state, task, effect.target, effect.upTo ?? 1, `${src}: choose who gets ${signed(effect.amount)} power`);
      if (!targets) return;
      for (const t of targets) {
        state.modifiers.push({ target: t, amount: effect.amount, duration: effect.duration });
        log(state, `${cardName(state, t)} gets ${signed(effect.amount)} power.`);
      }
      return;
    }
    case "ko": {
      const targets = choose(state, task, candidates(state, effect.target, ctx.controller, ctx.source), 0, effect.upTo, `${src}: choose a Character to K.O.`);
      if (!targets) return;
      pushFront(state, targets.flatMap((t) => ko(state, t)));
      return;
    }
    case "rest": {
      const targets = choose(state, task, candidates(state, effect.target, ctx.controller, ctx.source), 0, effect.upTo, `${src}: choose a card to rest`);
      if (!targets) return;
      for (const t of targets) {
        findPermanent(state, t)!.perm.rested = true;
        log(state, `${cardName(state, t)} is rested.`);
      }
      return;
    }
    case "setActive": {
      const targets = targetsOf(state, task, effect.target, effect.upTo ?? 1, `${src}: choose a card to set active`);
      if (!targets) return;
      for (const t of targets) {
        findPermanent(state, t)!.perm.rested = false;
        log(state, `${cardName(state, t)} is set active.`);
      }
      return;
    }
    case "giveRestedDon": {
      if (me.donRested === 0) return;
      const targets = choose(state, task, candidates(state, effect.target, ctx.controller, ctx.source), 0, 1, `${src}: choose who receives rested DON!!`);
      if (!targets) return;
      for (const t of targets) {
        const n = Math.min(effect.amount, me.donRested);
        me.donRested -= n;
        findPermanent(state, t)!.perm.attachedDon += n;
        log(state, `${cardName(state, t)} is given ${n} rested DON!!.`);
      }
      return;
    }
    case "restOpponentDon": {
      const n = Math.min(effect.upTo, them.donActive);
      them.donActive -= n;
      them.donRested += n;
      if (n) log(state, `${src} rests ${n} of Player ${them.id + 1}'s DON!!.`);
      return;
    }
    case "setDonActive": {
      const n = Math.min(effect.upTo, me.donRested);
      me.donRested -= n;
      me.donActive += n;
      if (n) log(state, `Player ${me.id + 1} sets ${n} DON!! active.`);
      return;
    }
    case "draw":
      draw(state, ctx.controller, effect.n);
      log(state, `Player ${me.id + 1} draws ${effect.n}.`);
      return;
    case "searchTop": {
      ctx.looked ??= me.deck.slice(0, effect.look);
      const looked = ctx.looked;
      const options = looked.filter((iid) => !effect.types || effect.types.some((t) => cardOf(state, iid).types.includes(t)));
      const picked = choose(state, task, options, 0, effect.upTo, `${src}: choose a card to add to your hand`);
      if (!picked) return;
      me.deck = me.deck.filter((iid) => !looked.includes(iid));
      for (const iid of picked) {
        me.hand.push(iid);
        log(state, `Player ${me.id + 1} reveals ${cardName(state, iid)} and adds it to hand.`);
      }
      me.deck.push(...looked.filter((iid) => !picked.includes(iid)));
      return;
    }
    case "battleRestriction": {
      if (!state.battle) return;
      if (effect.noBlockers) state.battle.noBlockers = true;
      if (effect.blockerMaxPower !== undefined) {
        const cur = state.battle.blockerMaxPower;
        state.battle.blockerMaxPower = cur === null ? effect.blockerMaxPower : Math.min(cur, effect.blockerMaxPower);
      }
      log(state, `${src}: blockers are restricted this battle.`);
      return;
    }
    case "status": {
      const targets = targetsOf(state, task, effect.target, effect.upTo ?? 1, `${src}: choose a target`);
      if (!targets) return;
      for (const t of targets) {
        state.statuses.push({ target: t, status: effect.status, duration: effect.duration });
        log(state, `${cardName(state, t)} cannot be blocked this ${effect.duration}.`);
      }
      return;
    }
    case "playSelf": {
      const iid = ctx.source;
      if (!me.limbo.includes(iid)) return;
      const card = cardOf(state, iid);
      if (card.category === "Character" && me.characters.length < MAX_CHARACTERS) {
        me.limbo = me.limbo.filter((x) => x !== iid);
        me.characters.push(newPermanent(state, iid));
      } else if (card.category === "Stage") {
        me.limbo = me.limbo.filter((x) => x !== iid);
        if (me.stage) removeFromField(state, me.stage.iid, "trash");
        me.stage = newPermanent(state, iid);
      } else return;
      log(state, `Player ${me.id + 1} plays ${src}.`);
      pushFront(state, triggeredTasks(state, iid, "onPlay"));
      return;
    }
  }
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

// ---------------------------------------------------------------------------
// Battle
// ---------------------------------------------------------------------------

function battleIntact(state: GameState): boolean {
  const b = state.battle;
  return !!b && !!findPermanent(state, b.attacker) && !!findPermanent(state, b.target);
}

function blockerOptions(state: GameState): string[] {
  const b = state.battle!;
  if (b.noBlockers || b.blocked || hasStatus(state, b.attacker, "unblockable")) return [];
  return state.players[opponent(b.attackingPlayer)].characters
    .filter((c) => !c.rested && c.iid !== b.target && hasKeyword(state, c.iid, "blocker"))
    .filter((c) => b.blockerMaxPower === null || power(state, c.iid) <= b.blockerMaxPower)
    .map((c) => c.iid);
}

function blockStep(state: GameState) {
  if (!battleIntact(state)) return;
  const options = blockerOptions(state);
  if (options.length) state.pending = { type: "block", player: opponent(state.battle!.attackingPlayer), options };
}

function counterOptionsExist(state: GameState, p: PlayerId): boolean {
  const pl = state.players[p];
  return pl.hand.some((iid) => {
    const c = cardOf(state, iid);
    return c.counter > 0 || (isCounterEvent(state, iid) && c.cost <= pl.donActive);
  });
}

function isCounterEvent(state: GameState, iid: string) {
  const c = cardOf(state, iid);
  return c.category === "Event" && c.abilities.some((a) => a.timing === "counter");
}

function counterStep(state: GameState) {
  if (!battleIntact(state)) return;
  const defender = opponent(state.battle!.attackingPlayer);
  if (counterOptionsExist(state, defender)) state.pending = { type: "counter", player: defender };
}

function damageStep(state: GameState) {
  if (!battleIntact(state)) return;
  const b = state.battle!;
  const atk = power(state, b.attacker);
  const def = power(state, b.target);
  const target = findPermanent(state, b.target)!;
  log(state, `${cardName(state, b.attacker)} (${atk}) vs ${cardName(state, b.target)} (${def}).`);
  const tasks: Task[] = [];
  if (atk >= def) {
    if (target.zone === "leader") {
      const defender = state.players[target.player];
      if (defender.life.length === 0) {
        log(state, `Player ${defender.id + 1} takes damage with no Life left.`);
        lose(state, [defender.id]);
        return;
      }
      const hits = hasKeyword(state, b.attacker, "doubleAttack") ? 2 : 1;
      const banish = hasKeyword(state, b.attacker, "banish");
      for (let i = 0; i < hits; i++) tasks.push({ kind: "lifeDamage", banish });
    } else {
      tasks.push(...ko(state, b.target));
    }
  } else {
    log(state, "The attack fails.");
  }
  if (target.zone === "character") {
    for (const iid of [b.attacker, b.target]) {
      if (findPermanent(state, iid)) tasks.push(...triggeredTasks(state, iid, "battlesCharacter"));
    }
  }
  pushFront(state, tasks);
}

function lifeDamage(state: GameState, banish: boolean) {
  const defender = state.players[opponent(state.battle!.attackingPlayer)];
  // A second hit after the last Life card was taken does nothing.
  if (defender.life.length === 0) return;
  const iid = defender.life.shift()!;
  if (banish) {
    defender.trash.push(iid);
    log(state, `Player ${defender.id + 1} loses a Life card (trashed by [Banish]).`);
    return;
  }
  const hasTrigger = cardOf(state, iid).abilities.some((a) => a.timing === "trigger");
  if (hasTrigger) {
    defender.limbo.push(iid);
    state.pending = { type: "trigger", player: defender.id, iid };
    log(state, `Player ${defender.id + 1} takes 1 damage: ${cardName(state, iid)} has a [Trigger].`);
  } else {
    defender.hand.push(iid);
    log(state, `Player ${defender.id + 1} takes 1 damage.`);
  }
}

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------

/** The player who must act next. */
export function actingPlayer(state: GameState): PlayerId {
  return state.pending ? state.pending.player : state.activePlayer;
}

function combinations<T>(items: T[], min: number, max: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, cur: T[]) => {
    if (cur.length >= min) out.push([...cur]);
    if (cur.length === max) return;
    for (let i = start; i < items.length; i++) rec(i + 1, [...cur, items[i]]);
  };
  rec(0, []);
  return out;
}

function canActivate(state: GameState, p: PlayerId, perm: Permanent, idx: number): boolean {
  const a = cardOf(state, perm.iid).abilities[idx];
  if (a.timing !== "activateMain") return false;
  if (a.oncePerTurn && state.usedThisTurn.includes(`${perm.iid}:${idx}`)) return false;
  if (!checkConditions(state, a.conditions, perm.iid, p)) return false;
  const pl = state.players[p];
  return (a.costs ?? []).every((c) => {
    switch (c.kind) {
      case "restDon":
        return pl.donActive >= c.n;
      case "restSelf":
        return !perm.rested;
      case "trashFromHand":
        return pl.hand.length >= c.n;
    }
  });
}

/** One instance per card id: copies in hand are interchangeable, so offer each move once. */
function distinctByCard(state: GameState, iids: string[]): string[] {
  const seen = new Set<string>();
  return iids.filter((iid) => {
    const id = state.instances[iid].cardId;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function getLegalActions(state: GameState): Action[] {
  if (state.phase === "gameOver") return [];
  const pending = state.pending;
  if (pending) {
    switch (pending.type) {
      case "mulligan":
        return [
          { type: "mulligan", redraw: false },
          { type: "mulligan", redraw: true },
        ];
      case "block":
        return [{ type: "block", blocker: null }, ...pending.options.map((blocker) => ({ type: "block" as const, blocker }))];
      case "trigger":
        return [
          { type: "trigger", activate: true },
          { type: "trigger", activate: false },
        ];
      case "choose":
        return combinations(pending.options, pending.min, pending.max).map((selection) => ({ type: "choose", selection }));
      case "counter": {
        const pl = state.players[pending.player];
        const targets = [pl.leader, ...pl.characters].map((c) => c.iid);
        const actions: Action[] = [{ type: "passCounter" }];
        for (const iid of distinctByCard(state, pl.hand)) {
          const c = cardOf(state, iid);
          if (c.counter > 0) for (const target of targets) actions.push({ type: "counterCard", iid, target });
          if (isCounterEvent(state, iid) && c.cost <= pl.donActive) actions.push({ type: "counterEvent", iid });
        }
        return actions;
      }
    }
  }
  if (state.phase !== "main") return [];
  const p = state.activePlayer;
  const pl = state.players[p];
  const actions: Action[] = [];
  for (const iid of distinctByCard(state, pl.hand)) {
    const c = cardOf(state, iid);
    if (c.cost > pl.donActive) continue;
    if (c.category === "Character") {
      if (pl.characters.length < MAX_CHARACTERS) actions.push({ type: "playCard", iid });
      else for (const ch of pl.characters) actions.push({ type: "playCard", iid, replace: ch.iid });
    } else if (c.category === "Stage") {
      actions.push({ type: "playCard", iid });
    } else if (c.category === "Event" && c.abilities.some((a) => a.timing === "main")) {
      actions.push({ type: "playCard", iid });
    }
  }
  if (pl.donActive > 0) for (const perm of [pl.leader, ...pl.characters]) actions.push({ type: "attachDon", target: perm.iid });
  for (const perm of permanentsOf(state, p)) {
    cardOf(state, perm.iid).abilities.forEach((_, idx) => {
      if (canActivate(state, p, perm, idx)) actions.push({ type: "activate", iid: perm.iid, ability: idx });
    });
  }
  if (canBattleThisTurn(state)) {
    const foe = state.players[opponent(p)];
    const targets = [foe.leader.iid, ...foe.characters.filter((c) => c.rested).map((c) => c.iid)];
    for (const perm of [pl.leader, ...pl.characters]) {
      if (perm.rested) continue;
      const summoningSick = perm !== pl.leader && perm.enteredTurn === state.turn && !hasKeyword(state, perm.iid, "rush");
      if (summoningSick) continue;
      for (const target of targets) actions.push({ type: "attack", attacker: perm.iid, target });
    }
  }
  actions.push({ type: "endTurn" });
  return actions;
}

/** Canonical form for comparing actions: sorted keys, undefined keys dropped. */
function actionKey(a: Action): string {
  const entries = Object.entries(a).filter(([, v]) => v !== undefined);
  return JSON.stringify(entries.sort(([x], [y]) => x.localeCompare(y)));
}

export function isLegal(state: GameState, action: Action): boolean {
  const key = actionKey(action);
  return getLegalActions(state).some((a) => actionKey(a) === key);
}

// ---------------------------------------------------------------------------
// Applying actions
// ---------------------------------------------------------------------------

/** Returns a new state; the input is not modified. Throws on illegal actions. */
export function applyAction(prev: GameState, action: Action): GameState {
  if (!isLegal(prev, action)) throw new Error(`Illegal action: ${JSON.stringify(action)}`);
  const state = structuredClone(prev);
  dispatch(state, action);
  process(state);
  checkDefeat(state);
  return state;
}

function dispatch(state: GameState, action: Action) {
  const actor = actingPlayer(state);
  const pl = state.players[actor];
  switch (action.type) {
    case "mulligan": {
      state.pending = null;
      if (action.redraw) {
        pl.deck.push(...pl.hand);
        pl.hand = [];
        shuffle(state, pl.deck);
        draw(state, actor, HAND_SIZE);
        log(state, `Player ${actor + 1} redraws their hand.`);
      } else log(state, `Player ${actor + 1} keeps their hand.`);
      if (actor === state.firstPlayer) state.pending = { type: "mulligan", player: opponent(actor) };
      else startGame(state);
      return;
    }
    case "playCard": {
      const c = cardOf(state, action.iid);
      pl.hand = pl.hand.filter((h) => h !== action.iid);
      restDon(state, actor, c.cost);
      log(state, `Player ${actor + 1} plays ${cardName(state, action.iid)}.`);
      if (c.category === "Character") {
        if (action.replace) {
          log(state, `${cardName(state, action.replace)} is trashed to make room.`);
          removeFromField(state, action.replace, "trash");
        }
        pl.characters.push(newPermanent(state, action.iid));
        pushFront(state, triggeredTasks(state, action.iid, "onPlay"));
      } else if (c.category === "Stage") {
        if (pl.stage) removeFromField(state, pl.stage.iid, "trash");
        pl.stage = newPermanent(state, action.iid);
        pushFront(state, triggeredTasks(state, action.iid, "onPlay"));
      } else {
        pl.limbo.push(action.iid);
        const main = c.abilities.filter((a) => a.timing === "main").flatMap((a) => abilityTasks(a.effects, action.iid, actor));
        pushFront(state, [...main, { kind: "finishEvent", player: actor, iid: action.iid }]);
      }
      return;
    }
    case "attachDon": {
      pl.donActive--;
      findPermanent(state, action.target)!.perm.attachedDon++;
      return;
    }
    case "activate": {
      const found = findPermanent(state, action.iid)!;
      const a = cardOf(state, action.iid).abilities[action.ability];
      if (a.oncePerTurn) state.usedThisTurn.push(`${action.iid}:${action.ability}`);
      const tasks: Task[] = [];
      for (const cost of a.costs ?? []) {
        if (cost.kind === "restDon") restDon(state, actor, cost.n);
        else if (cost.kind === "restSelf") found.perm.rested = true;
        else tasks.push({ kind: "payTrashCost", n: cost.n, ctx: { source: action.iid, controller: actor } });
      }
      log(state, `Player ${actor + 1} activates ${cardName(state, action.iid)}.`);
      pushFront(state, [...tasks, ...abilityTasks(a.effects, action.iid, actor)]);
      return;
    }
    case "attack": {
      findPermanent(state, action.attacker)!.perm.rested = true;
      state.battle = {
        attacker: action.attacker,
        target: action.target,
        attackingPlayer: actor,
        noBlockers: false,
        blockerMaxPower: null,
        blocked: false,
      };
      log(state, `${cardName(state, action.attacker)} attacks ${cardName(state, action.target)}.`);
      pushFront(state, [
        ...triggeredTasks(state, action.attacker, "whenAttacking"),
        { kind: "blockStep" },
        { kind: "counterStep" },
        { kind: "damageStep" },
        { kind: "endBattle" },
      ]);
      return;
    }
    case "endTurn": {
      const tasks = permanentsOf(state, actor).flatMap((perm) => triggeredTasks(state, perm.iid, "endOfYourTurn"));
      log(state, `Player ${actor + 1} ends their turn.`);
      pushFront(state, [...tasks, { kind: "endTurn" }]);
      return;
    }
    case "block": {
      state.pending = null;
      if (action.blocker) {
        const b = state.battle!;
        findPermanent(state, action.blocker)!.perm.rested = true;
        b.target = action.blocker;
        b.blocked = true;
        log(state, `${cardName(state, action.blocker)} blocks!`);
        pushFront(state, triggeredTasks(state, action.blocker, "onBlock"));
      }
      return;
    }
    case "counterCard": {
      state.pending = null;
      const c = cardOf(state, action.iid);
      pl.hand = pl.hand.filter((h) => h !== action.iid);
      pl.trash.push(action.iid);
      state.modifiers.push({ target: action.target, amount: c.counter, duration: "battle" });
      log(state, `Player ${actor + 1} counters with ${cardName(state, action.iid)}: ${cardName(state, action.target)} +${c.counter}.`);
      pushFront(state, [{ kind: "counterStep" }]);
      return;
    }
    case "counterEvent": {
      state.pending = null;
      const c = cardOf(state, action.iid);
      pl.hand = pl.hand.filter((h) => h !== action.iid);
      restDon(state, actor, c.cost);
      pl.limbo.push(action.iid);
      log(state, `Player ${actor + 1} plays counter event ${cardName(state, action.iid)}.`);
      const tasks = c.abilities.filter((a) => a.timing === "counter").flatMap((a) => abilityTasks(a.effects, action.iid, actor));
      pushFront(state, [...tasks, { kind: "finishEvent", player: actor, iid: action.iid }, { kind: "counterStep" }]);
      return;
    }
    case "passCounter":
      state.pending = null;
      return;
    case "trigger": {
      const pending = state.pending as Extract<NonNullable<GameState["pending"]>, { type: "trigger" }>;
      state.pending = null;
      const iid = pending.iid;
      if (action.activate) {
        log(state, `Player ${actor + 1} activates the [Trigger] of ${cardName(state, iid)}.`);
        const tasks = cardOf(state, iid).abilities.filter((a) => a.timing === "trigger").flatMap((a) => abilityTasks(a.effects, iid, actor));
        pushFront(state, [...tasks, { kind: "cleanupLimbo", player: actor, iid }]);
      } else {
        pl.limbo = pl.limbo.filter((x) => x !== iid);
        pl.hand.push(iid);
      }
      return;
    }
    case "choose": {
      state.pending = null;
      const task = state.queue[0];
      if (task && "ctx" in task) task.ctx.choice = action.selection;
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Descriptions (UI / logs)
// ---------------------------------------------------------------------------

export function describeAction(state: GameState, a: Action): string {
  const n = (iid: string) => cardOf(state, iid).name;
  switch (a.type) {
    case "mulligan":
      return a.redraw ? "Mulligan (redraw 5)" : "Keep hand";
    case "playCard":
      return `Play ${n(a.iid)} (cost ${cardOf(state, a.iid).cost})` + (a.replace ? `, trashing ${n(a.replace)}` : "");
    case "attachDon":
      return `Give 1 DON!! to ${n(a.target)}`;
    case "activate":
      return `Activate ${n(a.iid)}`;
    case "attack":
      return `${n(a.attacker)} attacks ${n(a.target)}`;
    case "endTurn":
      return "End turn";
    case "block":
      return a.blocker ? `Block with ${n(a.blocker)}` : "Don't block";
    case "counterCard":
      return `Counter: trash ${n(a.iid)} → ${n(a.target)} +${cardOf(state, a.iid).counter}`;
    case "counterEvent":
      return `Play counter event ${n(a.iid)} (cost ${cardOf(state, a.iid).cost})`;
    case "passCounter":
      return "No more counters";
    case "trigger":
      return a.activate ? "Activate [Trigger]" : "Add to hand";
    case "choose":
      return a.selection.length ? a.selection.map(n).join(", ") : "Choose nothing";
  }
}
