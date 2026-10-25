import { useMemo, useState } from "react";
import { allCardIds, deckToText, getCard, MAX_COPIES, DECK_SIZE, parseDeckText, validateDeck } from "../engine/index.ts";
import type { CardDef, DeckList } from "../engine/index.ts";
import { cardImage } from "./images.ts";
import { newDeckId } from "./storage.ts";
import type { SavedDeck } from "./storage.ts";

const COLORS = ["Red", "Green", "Blue", "Purple", "Black", "Yellow"];
const CATEGORIES = ["Leader", "Character", "Event", "Stage"] as const;
const PAGE = 60;

let allCards: CardDef[] | null = null;
/** Every card, in card-number order (built on first use). */
function cards(): CardDef[] {
  return (allCards ??= allCardIds().map(getCard));
}

/** Set code from a card id: OP01-001 -> OP01, P-028 -> P. */
const setOf = (id: string) => id.split("-")[0];

function setOrder(code: string): string {
  // Boosters, then extra boosters, starters, premium boosters, promos.
  const rank = { OP: 0, EB: 1, ST: 2, PRB: 3, P: 4 }[code.replace(/\d+$/, "")] ?? 5;
  return `${rank}${code}`;
}

// ---------------------------------------------------------------------------
// Deck list screen
// ---------------------------------------------------------------------------

export function DeckBuilder({
  decks,
  onChange,
  onBack,
}: {
  decks: SavedDeck[];
  onChange: (decks: SavedDeck[]) => void;
  onBack: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const deck = decks.find((d) => d.id === editing);
  if (deck) {
    return (
      <DeckEditor
        key={deck.id}
        saved={deck}
        onSave={(updated) => {
          onChange(decks.map((d) => (d.id === updated.id ? updated : d)));
        }}
        onDuplicate={(copy) => {
          onChange([...decks, copy]);
          setEditing(copy.id);
        }}
        onBack={() => setEditing(null)}
      />
    );
  }

  const create = (d: DeckList, name: string) => {
    const saved: SavedDeck = { id: newDeckId(), name, deck: d, updatedAt: Date.now() };
    onChange([...decks, saved]);
    setEditing(saved.id);
  };
  const duplicate = (d: SavedDeck) => create(structuredClone(d.deck), `${d.name} (copy)`);

  return (
    <div className="screen">
      <header className="topbar">
        <button onClick={onBack}>Menu</button>
        <strong>Deck Builder</strong>
        <span className="grow" />
        <button onClick={() => setImporting((v) => !v)}>Import</button>
        <button className="primary" onClick={() => create({ leader: "", cards: [] }, "New deck")}>
          New deck
        </button>
      </header>
      <main className="screen-body">
        {importing && <ImportBox onImport={(d, name) => (setImporting(false), create(d, name))} onCancel={() => setImporting(false)} />}
        <div className="deck-grid">
          {decks.map((d) => {
            const errors = validateDeck(d.deck);
            const leader = d.deck.leader ? getCard(d.deck.leader) : null;
            return (
              <article key={d.id} className="deck-tile">
                <div className="deck-tile-art" onClick={() => setEditing(d.id)}>
                  {leader ? <CardImage card={leader} /> : <div className="no-leader">No Leader</div>}
                </div>
                <div className="deck-tile-body">
                  <h3>{d.name}</h3>
                  <div className="muted">
                    {leader ? `${leader.name} · ${leader.colors.join("/")}` : "Pick a Leader"} · {d.deck.cards.length}/{DECK_SIZE}
                  </div>
                  <div className={errors.length ? "status bad" : "status ok"}>
                    {errors.length ? `${errors.length} problem${errors.length > 1 ? "s" : ""}` : "Ready to play"}
                    {d.builtIn && " · Starter deck"}
                  </div>
                  <div className="row-buttons">
                    <button onClick={() => setEditing(d.id)}>{d.builtIn ? "View" : "Edit"}</button>
                    <button onClick={() => duplicate(d)}>Copy</button>
                    <button onClick={() => setExporting(exporting === d.id ? null : d.id)}>Export</button>
                    {!d.builtIn &&
                      (confirmDelete === d.id ? (
                        <button className="danger" onClick={() => onChange(decks.filter((x) => x.id !== d.id))}>
                          Delete?
                        </button>
                      ) : (
                        <button onClick={() => setConfirmDelete(d.id)}>Delete</button>
                      ))}
                  </div>
                  {exporting === d.id && <ExportBox text={deckToText(d.deck)} />}
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function ImportBox({ onImport, onCancel }: { onImport: (d: DeckList, name: string) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [name, setName] = useState("Imported deck");
  const parsed = useMemo(() => parseDeckText(text), [text]);
  return (
    <section className="panel import">
      <h3>Import a deck list</h3>
      <p className="muted">Paste one card per line, like 4xOP01-016. The Leader line is picked out automatically.</p>
      <input id="import-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Deck name" />
      <textarea id="import-text" value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={"1xST01-001\n4xST01-004\n..."} />
      {parsed.problems.length > 0 && <div className="status bad">{parsed.problems.slice(0, 5).join(" · ")}</div>}
      <div className="row-buttons">
        <button className="primary" disabled={!parsed.deck.leader && parsed.deck.cards.length === 0} onClick={() => onImport(parsed.deck, name)}>
          Import {parsed.deck.cards.length} cards
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

function ExportBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="export">
      <textarea readOnly value={text} rows={6} onFocus={(e) => e.currentTarget.select()} aria-label="Deck list" />
      <button
        onClick={(e) => {
          const box = e.currentTarget.previousElementSibling as HTMLTextAreaElement;
          navigator.clipboard?.writeText(text).then(
            () => setCopied(true),
            () => box.select(),
          ) ?? box.select();
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function DeckEditor({
  saved,
  onSave,
  onDuplicate,
  onBack,
}: {
  saved: SavedDeck;
  onSave: (d: SavedDeck) => void;
  onDuplicate: (d: SavedDeck) => void;
  onBack: () => void;
}) {
  const readOnly = !!saved.builtIn;
  const [name, setName] = useState(saved.name);
  const [deck, setDeck] = useState<DeckList>(saved.deck);
  const [tab, setTab] = useState<"cards" | "deck">("cards");
  const [detail, setDetail] = useState<CardDef | null>(null);
  const [message, setMessage] = useState("");
  const dirty = name !== saved.name || JSON.stringify(deck) !== JSON.stringify(saved.deck);
  const errors = validateDeck(deck);
  const leader = deck.leader ? getCard(deck.leader) : null;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of deck.cards) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [deck]);

  const add = (card: CardDef) => {
    if (readOnly) return setMessage("Starter decks can't be changed. Copy it to make your own version.");
    if (card.category === "Leader") {
      setDeck((d) => ({ ...d, leader: card.id }));
      return setMessage(`${card.name} is now your Leader.`);
    }
    if ((counts.get(card.id) ?? 0) >= MAX_COPIES) return setMessage(`You already have ${MAX_COPIES} copies of ${card.name}.`);
    if (deck.cards.length >= DECK_SIZE) return setMessage(`The deck already has ${DECK_SIZE} cards.`);
    if (leader && !card.colors.some((c) => leader.colors.includes(c)))
      return setMessage(`${card.name} isn't ${leader.colors.join(" or ")}, your Leader's color${leader.colors.length > 1 ? "s" : ""}.`);
    setDeck((d) => ({ ...d, cards: [...d.cards, card.id] }));
    setMessage("");
  };
  const remove = (id: string) => {
    if (readOnly) return;
    setDeck((d) => {
      const i = d.cards.lastIndexOf(id);
      return i < 0 ? d : { ...d, cards: d.cards.filter((_, j) => j !== i) };
    });
  };

  return (
    <div className="screen editor">
      <header className="topbar">
        <button onClick={onBack}>{dirty ? "Discard" : "Back"}</button>
        <input
          id="deck-name"
          className="deck-name"
          value={name}
          disabled={readOnly}
          onChange={(e) => setName(e.target.value)}
          aria-label="Deck name"
        />
        <span className="grow" />
        {readOnly ? (
          <button className="primary" onClick={() => onDuplicate({ ...saved, id: newDeckId(), name: `${saved.name} (copy)`, builtIn: false, updatedAt: Date.now() })}>
            Copy to edit
          </button>
        ) : (
          <button className="primary" disabled={!dirty} onClick={() => onSave({ ...saved, name, deck, updatedAt: Date.now() })}>
            {dirty ? "Save" : "Saved"}
          </button>
        )}
      </header>
      <div className="tabs">
        <button className={tab === "cards" ? "on" : ""} onClick={() => setTab("cards")}>
          Cards
        </button>
        <button className={tab === "deck" ? "on" : ""} onClick={() => setTab("deck")}>
          Deck {deck.cards.length}/{DECK_SIZE}
          {errors.length > 0 && " ⚠"}
        </button>
      </div>
      {message && (
        <div className="toast" role="status" onClick={() => setMessage("")}>
          {message}
        </div>
      )}
      <main className="editor-body" data-tab={tab}>
        <CardBrowser leader={leader} counts={counts} onAdd={add} onInfo={setDetail} />
        <DeckPanel deck={deck} leader={leader} counts={counts} errors={errors} readOnly={readOnly} onAdd={add} onRemove={remove} onInfo={setDetail} />
      </main>
      {detail && (
        <CardModal
          card={detail}
          count={detail.category === "Leader" ? (deck.leader === detail.id ? 1 : 0) : (counts.get(detail.id) ?? 0)}
          readOnly={readOnly}
          onAdd={() => add(detail)}
          onRemove={() => (detail.category === "Leader" ? setDeck((d) => ({ ...d, leader: "" })) : remove(detail.id))}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function CardBrowser({
  leader,
  counts,
  onAdd,
  onInfo,
}: {
  leader: CardDef | null;
  counts: Map<string, number>;
  onAdd: (c: CardDef) => void;
  onInfo: (c: CardDef) => void;
}) {
  const [query, setQuery] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [category, setCategory] = useState<string>(leader ? "" : "Leader");
  const [cost, setCost] = useState("");
  const [set, setSet] = useState("");
  const [leaderColors, setLeaderColors] = useState(true);
  const [workingOnly, setWorkingOnly] = useState(false);
  const [sort, setSort] = useState<"number" | "cost" | "name">("number");
  const [shown, setShown] = useState(PAGE);
  const sets = useMemo(() => [...new Set(cards().map((c) => setOf(c.id)))].sort((a, b) => setOrder(a).localeCompare(setOrder(b))), []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = cards().filter((c) => {
      if (category && c.category !== category) return false;
      if (colors.length && !c.colors.some((x) => colors.includes(x))) return false;
      if (leader && leaderColors && c.category !== "Leader" && !c.colors.some((x) => leader.colors.includes(x))) return false;
      if (cost !== "" && (cost === "10" ? c.cost < 10 : c.cost !== Number(cost))) return false;
      if (cost !== "" && c.category === "Leader") return false;
      if (set && setOf(c.id) !== set) return false;
      if (workingOnly && !c.implemented) return false;
      if (q && !`${c.name} ${c.id} ${c.types.join(" ")} ${c.effect} ${c.trigger}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const byNumber = (a: CardDef, b: CardDef) => setOrder(setOf(a.id)).localeCompare(setOrder(setOf(b.id))) || a.id.localeCompare(b.id);
    if (sort === "number") out.sort(byNumber);
    if (sort === "cost") out.sort((a, b) => a.cost - b.cost || byNumber(a, b));
    if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return out;
  }, [query, colors, category, cost, set, leader, leaderColors, workingOnly, sort]);

  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setShown(PAGE);
  };

  return (
    <section className="browser">
      <div className="filters">
        <input
          id="card-search"
          type="search"
          placeholder="Search name, type or text"
          value={query}
          onChange={(e) => reset(setQuery)(e.target.value)}
          aria-label="Search cards"
        />
        <div className="chips">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`chip ${c.toLowerCase()} ${colors.includes(c) ? "on" : ""}`}
              onClick={() => reset(setColors)(colors.includes(c) ? colors.filter((x) => x !== c) : [...colors, c])}
              aria-pressed={colors.includes(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="filter-row">
          <select id="filter-category" value={category} onChange={(e) => reset(setCategory)(e.target.value)} aria-label="Card type">
            <option value="">All types</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select id="filter-cost" value={cost} onChange={(e) => reset(setCost)(e.target.value)} aria-label="Cost">
            <option value="">Any cost</option>
            {Array.from({ length: 11 }, (_, i) => (
              <option key={i} value={i}>
                {i === 10 ? "Cost 10+" : `Cost ${i}`}
              </option>
            ))}
          </select>
          <select id="filter-set" value={set} onChange={(e) => reset(setSet)(e.target.value)} aria-label="Set">
            <option value="">All sets</option>
            {sets.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
            <option value="number">By number</option>
            <option value="cost">By cost</option>
            <option value="name">By name</option>
          </select>
        </div>
        <div className="filter-row">
          {leader && (
            <label>
              <input id="leader-colors" type="checkbox" checked={leaderColors} onChange={(e) => reset(setLeaderColors)(e.target.checked)} /> Leader's
              colors only
            </label>
          )}
          <label>
            <input id="working-only" type="checkbox" checked={workingOnly} onChange={(e) => reset(setWorkingOnly)(e.target.checked)} /> Fully working
            effects only
          </label>
          <span className="muted">{results.length} cards</span>
        </div>
      </div>
      <div className="card-grid">
        {results.slice(0, shown).map((c) => {
          const n = c.category === "Leader" ? 0 : (counts.get(c.id) ?? 0);
          return (
            <div key={c.id} className="grid-card" title={`${c.name} (${c.id})`}>
              <button className="grid-card-face" onClick={() => onAdd(c)} aria-label={`Add ${c.name}`}>
                <CardImage card={c} />
                {n > 0 && <span className="count-badge">{n}</span>}
                {leader?.id === c.id && <span className="count-badge leader">L</span>}
                {!c.implemented && <span className="warn">⚠</span>}
              </button>
              <button className="info" onClick={() => onInfo(c)} aria-label={`Details for ${c.name}`}>
                i
              </button>
            </div>
          );
        })}
      </div>
      {results.length > shown && (
        <button className="show-more" onClick={() => setShown((n) => n + PAGE * 2)}>
          Show more ({results.length - shown} left)
        </button>
      )}
      {results.length === 0 && <p className="muted">No cards match these filters.</p>}
    </section>
  );
}

function DeckPanel({
  deck,
  leader,
  counts,
  errors,
  readOnly,
  onAdd,
  onRemove,
  onInfo,
}: {
  deck: DeckList;
  leader: CardDef | null;
  counts: Map<string, number>;
  errors: string[];
  readOnly: boolean;
  onAdd: (c: CardDef) => void;
  onRemove: (id: string) => void;
  onInfo: (c: CardDef) => void;
}) {
  const entries = [...counts].map(([id, n]) => ({ card: getCard(id), n }));
  entries.sort((a, b) => a.card.cost - b.card.cost || a.card.id.localeCompare(b.card.id));
  const curve = Array.from({ length: 11 }, (_, i) => entries.filter((e) => Math.min(e.card.cost, 10) === i).reduce((s, e) => s + e.n, 0));
  const max = Math.max(1, ...curve);
  const byCategory = (cat: string) => entries.filter((e) => e.card.category === cat).reduce((s, e) => s + e.n, 0);
  const counters = entries.filter((e) => e.card.counter > 0).reduce((s, e) => s + e.n, 0);
  const groups = (["Character", "Event", "Stage"] as const).map((cat) => ({ cat, items: entries.filter((e) => e.card.category === cat) }));

  return (
    <section className="deck-panel">
      <div className="leader-slot">
        {leader ? (
          <button className="leader-card" onClick={() => onInfo(leader)} aria-label={`Leader ${leader.name}`}>
            <CardImage card={leader} />
          </button>
        ) : (
          <div className="no-leader">Pick a Leader from the Cards tab</div>
        )}
        <div className="deck-stats">
          <div className={deck.cards.length === DECK_SIZE ? "big ok" : "big"}>
            {deck.cards.length}/{DECK_SIZE}
          </div>
          <div className="muted">
            {byCategory("Character")} Characters · {byCategory("Event")} Events · {byCategory("Stage")} Stages
          </div>
          <div className="muted">{counters} cards with Counter</div>
          <div className="curve" aria-label="Cost curve">
            {curve.map((n, i) => (
              <div key={i} className="bar" title={`Cost ${i === 10 ? "10+" : i}: ${n}`}>
                <span style={{ height: `${(n / max) * 100}%` }} />
                <i>{i === 10 ? "10+" : i}</i>
              </div>
            ))}
          </div>
        </div>
      </div>
      {errors.length > 0 && (
        <ul className="problems">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {groups.map(
        ({ cat, items }) =>
          items.length > 0 && (
            <div key={cat} className="deck-group">
              <h4>
                {cat}s ({items.reduce((s, e) => s + e.n, 0)})
              </h4>
              {items.map(({ card, n }) => (
                <div key={card.id} className="deck-row">
                  <button className="deck-row-name" onClick={() => onInfo(card)}>
                    <span className={`cost-dot ${card.colors[0]?.toLowerCase()}`}>{card.cost}</span>
                    <span className="nm">{card.name}</span>
                    <span className="muted">{card.id}</span>
                    {!card.implemented && <span className="warn-inline">⚠</span>}
                  </button>
                  <span className="qty">{n}×</span>
                  {!readOnly && (
                    <>
                      <button className="qty-btn" onClick={() => onRemove(card.id)} aria-label={`Remove ${card.name}`}>
                        −
                      </button>
                      <button className="qty-btn" onClick={() => onAdd(card)} aria-label={`Add ${card.name}`}>
                        +
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ),
      )}
      {entries.length === 0 && <p className="muted">Tap cards in the Cards tab to add them.</p>}
    </section>
  );
}

function CardModal({
  card,
  count,
  readOnly,
  onAdd,
  onRemove,
  onClose,
}: {
  card: CardDef;
  count: number;
  readOnly: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={card.name} onClick={(e) => e.stopPropagation()}>
        <div className="modal-art">
          <CardImage card={card} />
        </div>
        <div className="modal-body">
          <div className="detail-head">
            <b>
              {card.name} <span className="muted">{card.id}</span>
            </b>
            <button className="close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          <div className="muted">
            {card.category} · {card.colors.join("/")} · {card.types.join(" / ")}
          </div>
          <div>
            {card.category === "Leader" ? `Life ${card.life}` : `Cost ${card.cost}`}
            {card.power ? ` · Power ${card.power}` : ""}
            {card.counter ? ` · Counter +${card.counter}` : ""}
          </div>
          {card.effect && <p className="effect">{card.effect}</p>}
          {card.trigger && <p className="effect trigger">{card.trigger}</p>}
          {!card.implemented && <p className="warn-text">⚠ This card's effect isn't implemented in the engine yet. It can be played, but its effect won't happen.</p>}
          {!readOnly && (
            <div className="row-buttons">
              {card.category === "Leader" ? (
                <button className="primary" onClick={onAdd} disabled={count > 0}>
                  {count > 0 ? "Your Leader" : "Set as Leader"}
                </button>
              ) : (
                <>
                  <button onClick={onRemove} disabled={count === 0}>
                    −
                  </button>
                  <span className="qty">{count} in deck</span>
                  <button className="primary" onClick={onAdd}>
                    +
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Card art with a text fallback when the image isn't available. */
function CardImage({ card }: { card: CardDef }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`text-card ${card.colors.map((c) => c.toLowerCase()).join(" ")}`}>
        <span className="tc-cost">{card.category === "Leader" ? card.life : card.cost}</span>
        <span className="tc-name">{card.name}</span>
        <span className="tc-meta">{card.category}</span>
        {card.power > 0 && <span className="tc-power">{card.power}</span>}
      </div>
    );
  }
  return <img src={cardImage(card.id)} alt={card.name} loading="lazy" draggable={false} onError={() => setFailed(true)} />;
}
