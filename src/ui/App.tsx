import { useEffect, useMemo, useState } from "react";
import {
  actingPlayer,
  applyAction,
  cardOf,
  createGame,
  describeAction,
  getLegalActions,
  hasKeyword,
  power,
  randomAgent,
  STARTER_DECKS,
} from "../engine/index.ts";
import type { Action, GameState, Keyword, Permanent, PlayerId } from "../engine/index.ts";

type Controller = "human" | "random";
const DECK_NAMES = Object.keys(STARTER_DECKS);
const KEYWORD_LABELS: [Keyword, string][] = [
  ["rush", "Rush"],
  ["blocker", "Blocker"],
  ["doubleAttack", "Double Attack"],
  ["banish", "Banish"],
];

/** Card ids an action is "about", used to filter the action list when a card is selected. */
function actionCards(a: Action): string[] {
  switch (a.type) {
    case "playCard":
      return [a.iid, ...(a.replace ? [a.replace] : [])];
    case "attachDon":
      return [a.target];
    case "activate":
      return [a.iid];
    case "attack":
      return [a.attacker, a.target];
    case "block":
      return a.blocker ? [a.blocker] : [];
    case "counterCard":
      return [a.iid, a.target];
    case "counterEvent":
      return [a.iid];
    case "choose":
      return a.selection;
    default:
      return [];
  }
}

function newGame(decks: [string, string], seed: number): GameState {
  return createGame([STARTER_DECKS[decks[0]], STARTER_DECKS[decks[1]]], { seed });
}

export function App() {
  const [decks, setDecks] = useState<[string, string]>([DECK_NAMES[0], DECK_NAMES[1]]);
  const [controllers, setControllers] = useState<[Controller, Controller]>(["human", "random"]);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [history, setHistory] = useState<GameState[]>(() => [newGame(decks, seed)]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hideHands, setHideHands] = useState(true);
  const state = history[history.length - 1];
  const actor = actingPlayer(state);
  const actions = useMemo(() => getLegalActions(state), [state]);

  const play = (a: Action) => {
    setHistory((h) => [...h, applyAction(h[h.length - 1], a)]);
    setSelected(null);
  };

  // Bot moves.
  useEffect(() => {
    if (state.phase === "gameOver" || controllers[actor] === "human") return;
    const t = setTimeout(() => play(randomAgent.chooseAction(state, Math.random)), 350);
    return () => clearTimeout(t);
  }, [state, controllers, actor]);

  const restart = () => {
    const s = Math.floor(Math.random() * 1e9);
    setSeed(s);
    setHistory([newGame(decks, s)]);
    setSelected(null);
  };

  const undo = () => {
    // Step back to the last state where a human had to act.
    setHistory((h) => {
      let i = h.length - 2;
      while (i > 0 && controllers[actingPlayer(h[i])] !== "human") i--;
      return i >= 0 ? h.slice(0, i + 1) : h;
    });
    setSelected(null);
  };

  const humanTurn = controllers[actor] === "human" && state.phase !== "gameOver";
  const highlighted = new Set(humanTurn ? actions.flatMap(actionCards) : []);
  const shown = selected ? actions.filter((a) => actionCards(a).includes(selected)) : actions;
  const ctx: BoardCtx = { state, selected, highlighted, onSelect: (iid) => setSelected(iid === selected ? null : iid) };
  const handVisible = (p: PlayerId) => !hideHands || (controllers[p] === "human" && (actor === p || controllers[actor] !== "human"));

  return (
    <div className="app">
      <header className="toolbar">
        <strong>OPTCG Sim</strong>
        {[0, 1].map((i) => (
          <span key={i} className="setup">
            P{i + 1}:
            <select value={decks[i]} onChange={(e) => setDecks((d) => (i === 0 ? [e.target.value, d[1]] : [d[0], e.target.value]))}>
              {DECK_NAMES.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <select
              value={controllers[i]}
              onChange={(e) => setControllers((c) => (i === 0 ? [e.target.value as Controller, c[1]] : [c[0], e.target.value as Controller]))}
            >
              <option value="human">Human</option>
              <option value="random">Random bot</option>
            </select>
          </span>
        ))}
        <button onClick={restart}>New game</button>
        <button onClick={undo} disabled={history.length < 2}>
          Undo
        </button>
        <label>
          <input type="checkbox" checked={hideHands} onChange={(e) => setHideHands(e.target.checked)} /> Hide hands
        </label>
        <span className="muted">seed {seed}</span>
      </header>

      <main className="layout">
        <section className="board">
          <PlayerArea ctx={ctx} p={1} handVisible={handVisible(1)} flipped />
          <div className="turnbar">
            {state.phase === "gameOver"
              ? state.winner === "draw"
                ? "Draw!"
                : `Player ${Number(state.winner) + 1} wins!`
              : `Turn ${state.turn} · Player ${state.activePlayer + 1}'s turn${state.battle ? " · Battle" : ""}`}
          </div>
          <PlayerArea ctx={ctx} p={0} handVisible={handVisible(0)} />
        </section>

        <aside className="panel actionsPanel">
          <h3>
            {state.phase === "gameOver" ? "Game over" : `Player ${actor + 1} to act`}
            {!humanTurn && state.phase !== "gameOver" && <span className="muted"> (bot thinking…)</span>}
          </h3>
          <PendingPrompt state={state} />
          {selected && (
            <div className="selected">
              <CardDetail state={state} iid={selected} />
              <button onClick={() => setSelected(null)}>Show all actions</button>
            </div>
          )}
          {humanTurn && (
            <div className="actions">
              {shown.map((a, i) => (
                <button key={i} className={`action ${a.type}`} onClick={() => play(a)}>
                  {describeAction(state, a)}
                </button>
              ))}
              {shown.length === 0 && <p className="muted">No actions for this card.</p>}
            </div>
          )}
        </aside>

        <section className="panel log">
          <h3>Log</h3>
          {[...state.log].reverse().slice(0, 80).map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </section>
      </main>
    </div>
  );
}

function PendingPrompt({ state }: { state: GameState }) {
  const p = state.pending;
  if (!p) return state.phase === "main" ? <p>Main phase.</p> : null;
  switch (p.type) {
    case "mulligan":
      return <p>Keep your opening hand or redraw once?</p>;
    case "block":
      return <p>You're being attacked. Block with a [Blocker]?</p>;
    case "counter":
      return <p>Counter step: trash Counter cards or play [Counter] events, then pass.</p>;
    case "trigger":
      return <p>{cardOf(state, p.iid).name} has a [Trigger]. Activate it or add it to your hand?</p>;
    case "choose":
      return (
        <p>
          {p.prompt} ({p.min === p.max ? p.max : `${p.min}–${p.max}`})
        </p>
      );
  }
}

interface BoardCtx {
  state: GameState;
  selected: string | null;
  highlighted: Set<string>;
  onSelect: (iid: string) => void;
}

function PlayerArea({ ctx, p, handVisible, flipped }: { ctx: BoardCtx; p: PlayerId; handVisible: boolean; flipped?: boolean }) {
  const pl = ctx.state.players[p];
  const active = ctx.state.activePlayer === p;
  const field = (
    <div className="field">
      <div className="row">
        <div className="slot">
          <div className="label">Leader</div>
          <FieldCard ctx={ctx} perm={pl.leader} />
        </div>
        <div className="slot">
          <div className="label">Stage</div>
          {pl.stage ? <FieldCard ctx={ctx} perm={pl.stage} /> : <div className="empty" />}
        </div>
        <div className="stats">
          <div>❤️ Life {pl.life.length}</div>
          <div>📚 Deck {pl.deck.length}</div>
          <div>🗑️ Trash {pl.trash.length}</div>
          <div>
            DON!! <b>{pl.donActive}</b> active · {pl.donRested} rested · {pl.donDeck} left
          </div>
        </div>
      </div>
      <div className="label">Characters ({pl.characters.length}/5)</div>
      <div className="row chars">
        {pl.characters.map((c) => (
          <FieldCard key={c.iid} ctx={ctx} perm={c} />
        ))}
      </div>
    </div>
  );
  const hand = (
    <div className="hand">
      <div className="label">Hand ({pl.hand.length})</div>
      <div className="row">
        {pl.hand.map((iid) =>
          handVisible ? <CardView key={iid} ctx={ctx} iid={iid} /> : <div key={iid} className="card back" />,
        )}
      </div>
    </div>
  );
  return (
    <div className={`player ${active ? "active" : ""}`}>
      <div className="pname">
        Player {p + 1} — {cardOf(ctx.state, pl.leader.iid).name}
      </div>
      {flipped ? (
        <>
          {hand}
          {field}
        </>
      ) : (
        <>
          {field}
          {hand}
        </>
      )}
    </div>
  );
}

function FieldCard({ ctx, perm }: { ctx: BoardCtx; perm: Permanent }) {
  return <CardView ctx={ctx} iid={perm.iid} perm={perm} />;
}

function CardView({ ctx, iid, perm }: { ctx: BoardCtx; iid: string; perm?: Permanent }) {
  const { state } = ctx;
  const card = cardOf(state, iid);
  const onField = !!perm && card.category !== "Stage";
  const pw = onField ? power(state, iid) : card.power;
  const keywords = onField ? KEYWORD_LABELS.filter(([k]) => hasKeyword(state, iid, k)).map(([, l]) => l) : [];
  const classes = [
    "card",
    card.colors.map((c) => c.toLowerCase()).join(" "),
    perm?.rested ? "rested" : "",
    ctx.selected === iid ? "selected" : "",
    ctx.highlighted.has(iid) ? "hl" : "",
  ];
  return (
    <div className={classes.join(" ")} onClick={() => ctx.onSelect(iid)} title={`${card.name} (${card.id})\n${card.effect}`}>
      <div className="top">
        {card.category !== "Leader" && <span className="cost">{card.cost}</span>}
        {card.category === "Leader" && <span className="cost life">{card.life}</span>}
        <span className="cat">{card.category}</span>
      </div>
      <div className="name">{card.name}</div>
      {(card.category === "Leader" || card.category === "Character") && (
        <div className={`power ${pw !== card.power ? "mod" : ""}`}>{pw}</div>
      )}
      {card.counter > 0 && <div className="counter">+{card.counter}</div>}
      {keywords.length > 0 && <div className="kw">{keywords.join(" · ")}</div>}
      {perm && perm.attachedDon > 0 && <div className="don">DON×{perm.attachedDon}</div>}
      {!card.implemented && <div className="warn" title="Effect not implemented yet">⚠</div>}
    </div>
  );
}

function CardDetail({ state, iid }: { state: GameState; iid: string }) {
  const c = cardOf(state, iid);
  return (
    <div className="detail">
      <b>
        {c.name} <span className="muted">{c.id}</span>
      </b>
      <div className="muted">
        {c.category} · {c.colors.join("/")} · {c.types.join(" / ")}
      </div>
      <div>
        {c.category === "Leader" ? `Life ${c.life}` : `Cost ${c.cost}`}
        {c.power ? ` · Power ${c.power}` : ""}
        {c.counter ? ` · Counter +${c.counter}` : ""}
      </div>
      {c.effect && <p className="effect">{c.effect}</p>}
      {!c.implemented && <p className="warn-text">⚠ This card's effect isn't implemented in the engine yet.</p>}
    </div>
  );
}
