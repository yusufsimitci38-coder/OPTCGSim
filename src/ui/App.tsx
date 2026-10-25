import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
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
import { cardBack, donArt, DON_ARTS, donBack } from "./cardArt.ts";
import { cardImage } from "./images.ts";
import { donSource, draggableSources, edgeOf, fieldTarget, targetsFrom } from "./interaction.ts";

type Controller = "human" | "random";
const DECK_NAMES = Object.keys(STARTER_DECKS);
const KEYWORD_LABELS: [Keyword, string][] = [
  ["rush", "Rush"],
  ["blocker", "Blocker"],
  ["doubleAttack", "Double Attack"],
  ["banish", "Banish"],
];
/** Pointer travel before a press becomes a drag. */
const DRAG_THRESHOLD = 8;

function newGame(decks: [string, string], seed: number): GameState {
  return createGame([STARTER_DECKS[decks[0]], STARTER_DECKS[decks[1]]], { seed });
}

interface Drag {
  source: string;
  pointerId: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  moved: boolean;
}

/** Everything the board components need to render and report gestures. */
interface BoardCtx {
  state: GameState;
  showArt: boolean;
  selected: string | null;
  /** Valid drop/tap targets for the selected or dragged source. */
  targets: Set<string>;
  /** Cards (and DON!!) that can start a move right now. */
  movable: Set<string>;
  hover: string | null;
  press: (source: string, e: ReactPointerEvent) => void;
  tap: (target: string) => void;
}

export function App() {
  const [decks, setDecks] = useState<[string, string]>([DECK_NAMES[0], DECK_NAMES[1]]);
  const [controllers, setControllers] = useState<[Controller, Controller]>(["human", "random"]);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [history, setHistory] = useState<GameState[]>(() => [newGame(decks, seed)]);
  const [selected, setSelected] = useState<string | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [hideHands, setHideHands] = useState(true);
  const [showArt, setShowArt] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [donArtId, setDonArtId] = useState(DON_ARTS[0].id);
  const state = history[history.length - 1];
  const actor = actingPlayer(state);
  const humanTurn = controllers[actor] === "human" && state.phase !== "gameOver";
  const actions = useMemo(() => (humanTurn ? getLegalActions(state) : []), [state, humanTurn]);

  // The human sits at the bottom; with two humans Player 1 does.
  const bottom: PlayerId = controllers[0] === "human" || controllers[1] !== "human" ? 0 : 1;
  const top: PlayerId = bottom === 0 ? 1 : 0;

  const play = (a: Action) => {
    setHistory((h) => [...h, applyAction(h[h.length - 1], a)]);
    setSelected(null);
    setInspect(null);
  };

  // On phones the table is a little taller than the screen: start scrolled to your own side.
  useEffect(() => {
    if (window.innerWidth < 900) window.scrollTo(0, document.documentElement.scrollHeight);
  }, []);

  useEffect(() => {
    if (state.phase === "gameOver" || controllers[actor] === "human") return;
    const t = setTimeout(() => play(randomAgent.chooseAction(state, Math.random)), 450);
    return () => clearTimeout(t);
  }, [state, controllers, actor]);

  const movable = useMemo(() => draggableSources(state, actions, actor), [state, actions, actor]);
  const activeSource = drag?.moved ? drag.source : selected;
  const targetMap = useMemo(() => targetsFrom(state, actions, actor, activeSource), [state, actions, actor, activeSource]);
  const chooseTargets = new Map(
    actions.flatMap((a) => (a.type === "choose" && a.selection.length === 1 ? [[a.selection[0], a] as const] : [])),
  );
  const targets = new Set([...targetMap.keys(), ...chooseTargets.keys()]);

  const tap = (target: string) => {
    if (!humanTurn) {
      if (!target.includes(":")) setInspect(target);
      return;
    }
    const viaSelection = targetMap.get(target);
    if (selected && viaSelection) return play(viaSelection);
    const choice = chooseTargets.get(target);
    if (choice) return play(choice);
    if (target.startsWith("field:")) return setSelected(null);
    setSelected(target === selected ? null : target);
    if (!target.includes(":")) setInspect(target);
  };

  const press = (source: string, e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    setDrag({ source, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false });
  };

  // Pointer tracking for drags. A press that never moves is a tap.
  const dragRef = useRef(drag);
  dragRef.current = drag;
  useEffect(() => {
    if (!drag) return;
    const targetAt = (x: number, y: number) =>
      (document.elementFromPoint(x, y)?.closest("[data-target]") as HTMLElement | null)?.dataset.target ?? null;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const moved = d.moved || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > DRAG_THRESHOLD;
      if (moved && !movable.has(d.source)) return; // only legal sources drag
      setDrag({ ...d, x: e.clientX, y: e.clientY, moved });
      setHover(moved ? targetAt(e.clientX, e.clientY) : null);
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      setDrag(null);
      setHover(null);
      if (!d.moved) return tap(d.source);
      const target = targetAt(e.clientX, e.clientY);
      const a = target ? targetsFrom(state, actions, actor, d.source).get(target) : undefined;
      if (a) play(a);
    };
    const cancel = () => {
      setDrag(null);
      setHover(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [drag !== null, state, actions, actor, movable, selected]);

  const restart = () => {
    const s = Math.floor(Math.random() * 1e9);
    setSeed(s);
    setHistory([newGame(decks, s)]);
    setSelected(null);
    setInspect(null);
  };

  const undo = () => {
    setHistory((h) => {
      let i = h.length - 2;
      while (i > 0 && controllers[actingPlayer(h[i])] !== "human") i--;
      return i >= 0 ? h.slice(0, i + 1) : h;
    });
    setSelected(null);
  };

  const handVisible = (p: PlayerId) => !hideHands || (controllers[p] === "human" && (actor === p || controllers[actor] !== "human"));
  const ctx: BoardCtx = { state, showArt, selected, targets, movable, hover, press, tap };

  return (
    <div
      className="app"
      style={
        {
          "--card-back": `url(${cardBack})`,
          "--don-back": `url(${donBack})`,
          "--don-front": `url(${donArt(donArtId).src})`,
        } as CSSProperties
      }
    >
      <header className="topbar">
        <strong>OPTCG Sim</strong>
        <span className="turninfo">
          {state.phase === "gameOver"
            ? state.winner === "draw"
              ? "Draw"
              : `Player ${Number(state.winner) + 1} wins!`
            : state.turn === 0
              ? "Opening hands"
              : `Turn ${state.turn} · P${state.activePlayer + 1}`}
        </span>
        <span className="grow" />
        <button onClick={undo} disabled={history.length < 2}>
          Undo
        </button>
        <button onClick={restart}>New game</button>
        <button onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen}>
          Settings
        </button>
      </header>
      {settingsOpen && (
        <div className="settings">
          {[0, 1].map((i) => (
            <span key={i} className="setup">
              P{i + 1}
              <select
                id={`deck-${i}`}
                value={decks[i]}
                onChange={(e) => setDecks((d) => (i === 0 ? [e.target.value, d[1]] : [d[0], e.target.value]))}
              >
                {DECK_NAMES.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
              <select
                id={`controller-${i}`}
                value={controllers[i]}
                onChange={(e) =>
                  setControllers((c) => (i === 0 ? [e.target.value as Controller, c[1]] : [c[0], e.target.value as Controller]))
                }
              >
                <option value="human">Human</option>
                <option value="random">Random bot</option>
              </select>
            </span>
          ))}
          <label>
            <input id="hide-hands" type="checkbox" checked={hideHands} onChange={(e) => setHideHands(e.target.checked)} /> Hide hands
          </label>
          {DON_ARTS.length > 1 && (
            <label>
              DON!!{" "}
              <select id="don-art" value={donArtId} onChange={(e) => setDonArtId(e.target.value)}>
                {DON_ARTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <input id="card-art" type="checkbox" checked={showArt} onChange={(e) => setShowArt(e.target.checked)} /> Card art
          </label>
          <span className="muted">Deck changes apply on New game · seed {seed}</span>
        </div>
      )}

      <main className="table">
        <section className="board">
          <PlayerSide ctx={ctx} p={top} flipped handVisible={handVisible(top)} />
          <div className="midline">
            {state.battle && state.phase !== "gameOver"
              ? `${cardOf(state, state.battle.attacker).name} attacks ${cardOf(state, state.battle.target).name}`
              : state.phase === "gameOver"
                ? "Game over"
                : `Player ${state.activePlayer + 1}'s turn`}
          </div>
          <PlayerSide ctx={ctx} p={bottom} handVisible={handVisible(bottom)} />
        </section>

        <aside className="panel">
          <Prompt state={state} actions={actions} humanTurn={humanTurn} actor={actor} play={play} />
          {inspect && state.instances[inspect] && (
            <CardDetail state={state} iid={inspect} showArt={showArt} onClose={() => setInspect(null)} />
          )}
          {humanTurn && (
            <details className="more">
              <summary>All moves ({actions.length})</summary>
              <div className="actions">
                {actions.map((a, i) => (
                  <button key={i} className={`action ${a.type}`} onClick={() => play(a)}>
                    {describeAction(state, a)}
                  </button>
                ))}
              </div>
            </details>
          )}
          <details className="more log">
            <summary>Game log</summary>
            {[...state.log].reverse().slice(0, 100).map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </details>
        </aside>
      </main>

      <Arrows state={state} drag={drag} movable={movable} />
      {drag?.moved && movable.has(drag.source) && <Ghost state={state} drag={drag} showArt={showArt} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompt: what to do now, and the moves that aren't drags.
// ---------------------------------------------------------------------------

function Prompt({
  state,
  actions,
  humanTurn,
  actor,
  play,
}: {
  state: GameState;
  actions: Action[];
  humanTurn: boolean;
  actor: PlayerId;
  play: (a: Action) => void;
}) {
  if (state.phase === "gameOver") {
    return (
      <div className="prompt">
        <h3>{state.winner === "draw" ? "Draw" : `Player ${Number(state.winner) + 1} wins!`}</h3>
        <p className="muted">Start a new game from the top bar.</p>
      </div>
    );
  }
  if (!humanTurn) {
    return (
      <div className="prompt">
        <h3>Player {actor + 1} is thinking…</h3>
      </div>
    );
  }
  const p = state.pending;
  const buttons = actions.filter((a) => edgeOf(a, actor) === null && a.type !== "choose");
  const chooseButtons = actions.filter((a) => a.type === "choose");
  let title = `Player ${actor + 1}: your move`;
  let hint: ReactNode = (
    <>
      Drag a card from your hand onto the board to play it. Drag <b>DON!!</b> from your cost area onto your Leader or a
      Character. Drag an active card onto an opposing card to attack. On a phone, tap a card and then tap where it goes.
    </>
  );
  if (p?.type === "mulligan") {
    title = "Opening hand";
    hint = "Keep these 5 cards, or shuffle them back and draw 5 new ones (once).";
  } else if (p?.type === "block") {
    title = "You're being attacked";
    hint = "Block with a [Blocker] to make it the new target, or let the attack through.";
  } else if (p?.type === "counter") {
    title = "Counter step";
    hint = "Drag Counter cards from your hand onto the card being attacked, or play a [Counter] event. Then finish.";
  } else if (p?.type === "trigger") {
    title = `[Trigger]: ${cardOf(state, p.iid).name}`;
    hint = cardOf(state, p.iid).trigger;
  } else if (p?.type === "choose") {
    title = p.prompt;
    hint = "Tap a highlighted card, or pick below.";
  }
  return (
    <div className="prompt">
      <h3>{title}</h3>
      <p className="hint">{hint}</p>
      <div className="buttons">
        {[...buttons, ...(p?.type === "choose" ? chooseButtons : [])].map((a, i) => (
          <button key={i} className={`action ${a.type}`} onClick={() => play(a)}>
            {describeAction(state, a)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Playmat
// ---------------------------------------------------------------------------

function PlayerSide({ ctx, p, flipped, handVisible }: { ctx: BoardCtx; p: PlayerId; flipped?: boolean; handVisible: boolean }) {
  const pl = ctx.state.players[p];
  const active = ctx.state.activePlayer === p && ctx.state.phase !== "gameOver";
  const field = fieldTarget(p);
  const don = donSource(p);

  const characters = (
    <div
      className={`zone characters ${ctx.targets.has(field) ? "drop-ok" : ""} ${ctx.hover === field ? "hovered" : ""}`}
      data-target={field}
      onClick={(e) => e.target === e.currentTarget && ctx.tap(field)}
    >
      {pl.characters.map((c) => (
        <FieldCard key={c.iid} ctx={ctx} perm={c} />
      ))}
      {Array.from({ length: 5 - pl.characters.length }, (_, i) => (
        <div key={i} className="slot-empty" />
      ))}
    </div>
  );

  const middle = (
    <div className="row middle" data-target={field}>
      <Zone label={`Life ${pl.life.length}`}>
        <div className="life">
          {pl.life.map((iid, i) => (
            <div
              key={iid}
              className="card back life-card"
              style={{ top: `calc(${pl.life.length > 1 ? i / (pl.life.length - 1) : 0} * var(--ch) * 0.3)` }}
            />
          ))}
          {pl.life.length === 0 && <div className="slot-empty" />}
        </div>
      </Zone>
      <Zone label="Leader">
        <FieldCard ctx={ctx} perm={pl.leader} />
      </Zone>
      <Zone label="Stage">{pl.stage ? <FieldCard ctx={ctx} perm={pl.stage} /> : <div className="slot-empty" />}</Zone>
      <span className="grow" />
      <Zone label={`Deck ${pl.deck.length}`}>{pl.deck.length ? <div className="card back" /> : <div className="slot-empty" />}</Zone>
    </div>
  );

  const donRow = (
    <div className="row costrow">
      <Zone label={`DON!! deck ${pl.donDeck}`}>
        {pl.donDeck > 0 ? <div className="don-card deck" /> : <div className="don-slot" />}
      </Zone>
      <Zone label={`Cost area · ${pl.donActive} active · ${pl.donRested} rested`} grow>
        <div
          className={`cost-area ${ctx.movable.has(don) ? "movable" : ""} ${ctx.selected === don ? "selected" : ""}`}
          data-target={don}
          onPointerDown={(e) => ctx.press(don, e)}
          style={{ touchAction: ctx.movable.has(don) ? "none" : undefined }}
        >
          {Array.from({ length: pl.donActive }, (_, i) => (
            <div key={`a${i}`} className="don-spot">
              <div className="don-card" />
            </div>
          ))}
          {Array.from({ length: pl.donRested }, (_, i) => (
            <div key={`r${i}`} className="don-spot rested">
              <div className="don-card rested" />
            </div>
          ))}
          {pl.donActive + pl.donRested === 0 && <span className="muted">No DON!!</span>}
        </div>
      </Zone>
      <Zone label={`Trash ${pl.trash.length}`}>
        {pl.trash.length ? (
          <CardFace ctx={ctx} iid={pl.trash[pl.trash.length - 1]} />
        ) : (
          <div className="slot-empty" />
        )}
      </Zone>
    </div>
  );

  const hand = (
    <div className={`hand ${flipped ? "opponent" : ""}`}>
      {pl.hand.map((iid) => (
        <div key={iid} className="hand-spot">
          {handVisible ? <CardFace ctx={ctx} iid={iid} /> : <div className="card back" />}
        </div>
      ))}
    </div>
  );

  const rows = [characters, middle, donRow, hand];
  return (
    <div className={`side ${active ? "active" : ""} ${flipped ? "flipped" : ""}`}>
      <div className="side-name">
        Player {p + 1} · {cardOf(ctx.state, pl.leader.iid).name} · Hand {pl.hand.length}
      </div>
      {(flipped ? [...rows].reverse() : rows).map((r, i) => (
        <div key={i} className="row-wrap">
          {r}
        </div>
      ))}
    </div>
  );
}

function Zone({ label, children, grow }: { label: string; children: ReactNode; grow?: boolean }) {
  return (
    <div className={`zonebox ${grow ? "grow" : ""}`}>
      {children}
      <div className="zlabel">{label}</div>
    </div>
  );
}

function FieldCard({ ctx, perm }: { ctx: BoardCtx; perm: Permanent }) {
  return <CardFace ctx={ctx} iid={perm.iid} perm={perm} />;
}

/** Card ids whose image failed to load; those fall back to the text layout. */
const brokenArt = new Set<string>();

function CardFace({ ctx, iid, perm, className = "" }: { ctx: BoardCtx; iid: string; perm?: Permanent; className?: string }) {
  const { state } = ctx;
  const card = cardOf(state, iid);
  const [, rerender] = useState(0);
  const onField = !!perm && card.category !== "Stage";
  const pw = onField ? power(state, iid) : card.power;
  const keywords = onField ? KEYWORD_LABELS.filter(([k]) => hasKeyword(state, iid, k)).map(([, l]) => l) : [];
  const art = ctx.showArt && !brokenArt.has(card.id);
  const movable = ctx.movable.has(iid);
  const classes = [
    "card",
    art ? "art" : `text ${card.colors.map((c) => c.toLowerCase()).join(" ")}`,
    perm?.rested ? "rested" : "",
    ctx.selected === iid ? "selected" : "",
    movable ? "movable" : "",
    ctx.targets.has(iid) ? "drop-ok" : "",
    ctx.hover === iid ? "hovered" : "",
    className,
  ];
  return (
    <div
      className={classes.join(" ")}
      data-target={iid}
      data-iid={iid}
      onPointerDown={(e) => ctx.press(iid, e)}
      style={{ touchAction: movable ? "none" : undefined }}
      title={[`${card.name} (${card.id})`, card.effect, card.trigger].filter(Boolean).join("\n")}
    >
      {perm && perm.attachedDon > 0 && (
        <div className="attached">
          {Array.from({ length: Math.min(perm.attachedDon, 4) }, (_, i) => (
            <div key={i} className="don-card tucked" style={{ bottom: `calc(${-(i + 1)} * var(--ch) * 0.07)` }} />
          ))}
        </div>
      )}
      {art ? (
        <img
          src={cardImage(card.id)}
          alt={card.name}
          loading="lazy"
          draggable={false}
          onError={() => {
            brokenArt.add(card.id);
            rerender((n) => n + 1);
          }}
        />
      ) : (
        <div className="textface">
          <div className="top">
            <span className="cost">{card.category === "Leader" ? card.life : card.cost}</span>
            <span className="cat">{card.category}</span>
          </div>
          <div className="name">{card.name}</div>
          {(card.category === "Leader" || card.category === "Character") && <div className="power">{card.power}</div>}
          {card.counter > 0 && <div className="counter">+{card.counter}</div>}
        </div>
      )}
      {onField && (pw !== card.power || (perm?.attachedDon ?? 0) > 0) && (
        <div className={`power-badge ${pw > card.power ? "up" : pw < card.power ? "down" : ""}`}>{pw}</div>
      )}
      {keywords.length > 0 && <div className="kw">{keywords.join(" · ")}</div>}
      {!card.implemented && <div className="warn" title="Effect not implemented yet">⚠</div>}
    </div>
  );
}

function CardDetail({ state, iid, showArt, onClose }: { state: GameState; iid: string; showArt: boolean; onClose: () => void }) {
  const c = cardOf(state, iid);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className="detail">
      {showArt && failed !== c.id && <img className="detail-art" src={cardImage(c.id)} alt={c.name} onError={() => setFailed(c.id)} />}
      <div className="detail-head">
        <b>
          {c.name} <span className="muted">{c.id}</span>
        </b>
        <button className="close" onClick={onClose} aria-label="Close card details">
          ×
        </button>
      </div>
      <div className="muted">
        {c.category} · {c.colors.join("/")} · {c.types.join(" / ")}
      </div>
      <div>
        {c.category === "Leader" ? `Life ${c.life}` : `Cost ${c.cost}`}
        {c.power ? ` · Power ${c.power}` : ""}
        {c.counter ? ` · Counter +${c.counter}` : ""}
      </div>
      {c.effect && <p className="effect">{c.effect}</p>}
      {c.trigger && <p className="effect trigger">{c.trigger}</p>}
      {!c.implemented && <p className="warn-text">⚠ This card's effect isn't implemented in the engine yet.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overlays: attack arrows and the card following the pointer while dragging.
// ---------------------------------------------------------------------------

function centerOf(iid: string): { x: number; y: number } | null {
  const el = document.querySelector(`[data-iid="${CSS.escape(iid)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const isOnField = (state: GameState, iid: string) =>
  state.players.some((pl) => [pl.leader, ...pl.characters].some((c) => c.iid === iid));

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: string;
}

function Arrows({ state, drag, movable }: { state: GameState; drag: Drag | null; movable: Set<string> }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const redraw = () => setTick((n) => n + 1);
    window.addEventListener("resize", redraw);
    window.addEventListener("scroll", redraw, true);
    return () => {
      window.removeEventListener("resize", redraw);
      window.removeEventListener("scroll", redraw, true);
    };
  }, []);
  useLayoutEffect(() => {
    const out: Line[] = [];
    if (state.battle && state.phase !== "gameOver") {
      const a = centerOf(state.battle.attacker);
      const b = centerOf(state.battle.target);
      if (a && b) out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, kind: "battle" });
    }
    // Attacks are drawn as an arrow from the attacker; other drags show the card itself.
    if (drag?.moved && movable.has(drag.source) && isOnField(state, drag.source)) {
      const a = centerOf(drag.source);
      if (a) out.push({ x1: a.x, y1: a.y, x2: drag.x, y2: drag.y, kind: "aim" });
    }
    setLines((prev) => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out));
  }, [state, drag, movable, tick]);
  if (!lines.length) return null;
  return (
    <svg className="arrows" aria-hidden="true">
      <defs>
        <marker id="head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--attack)" />
        </marker>
      </defs>
      {lines.map((l, i) => (
        <line key={i} className={l.kind} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} markerEnd="url(#head)" />
      ))}
    </svg>
  );
}

function Ghost({ state, drag, showArt }: { state: GameState; drag: Drag; showArt: boolean }) {
  if (drag.source.startsWith("don:")) {
    return <div className="ghost don-card" style={{ left: drag.x, top: drag.y }} />;
  }
  if (isOnField(state, drag.source)) return null;
  const card = cardOf(state, drag.source);
  return (
    <div className="ghost card art" style={{ left: drag.x, top: drag.y }}>
      {showArt && !brokenArt.has(card.id) ? <img src={cardImage(card.id)} alt="" /> : <div className="textface">{card.name}</div>}
    </div>
  );
}
