import { useEffect, useState } from "react";
import { getCard, validateDeck } from "../engine/index.ts";
import { cardBack, DON_ARTS } from "./cardArt.ts";
import { DeckBuilder } from "./DeckBuilder.tsx";
import { Game } from "./Game.tsx";
import { cardImage as leaderImage } from "./images.ts";
import type { Controller, GameSetup } from "./Game.tsx";
import { BUILT_IN_DECKS, loadDecks, loadSettings, saveDecks, saveSettings } from "./storage.ts";
import type { SavedDeck, Settings } from "./storage.ts";

type Screen = "menu" | "play" | "decks" | "settings" | "game";

export function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [userDecks, setUserDecks] = useState<SavedDeck[]>(loadDecks);
  const [setup, setSetup] = useState<GameSetup | null>(null);
  const decks = [...BUILT_IN_DECKS, ...userDecks];

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  const changeDecks = (all: SavedDeck[]) => {
    const mine = all.filter((d) => !d.builtIn);
    setUserDecks(mine);
    saveDecks(mine);
  };
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  switch (screen) {
    case "game":
      return setup ? <Game setup={setup} settings={settings} onExit={() => setScreen("play")} /> : null;
    case "play":
      return (
        <PlaySetup
          decks={decks}
          onBack={() => setScreen("menu")}
          onStart={(s) => {
            setSetup(s);
            setScreen("game");
          }}
        />
      );
    case "decks":
      return <DeckBuilder decks={decks} onChange={changeDecks} onBack={() => setScreen("menu")} />;
    case "settings":
      return <SettingsScreen settings={settings} onChange={setSettings} onBack={() => setScreen("menu")} />;
    default:
      return <Menu onGo={setScreen} deckCount={userDecks.length} />;
  }
}

function Menu({ onGo, deckCount }: { onGo: (s: Screen) => void; deckCount: number }) {
  return (
    <div className="screen menu">
      <div className="menu-inner">
        <div className="menu-cards" aria-hidden="true">
          <img src={cardBack} alt="" />
          <img src={cardBack} alt="" />
          <img src={cardBack} alt="" />
        </div>
        <h1>OPTCG Sim</h1>
        <p className="muted">One Piece Card Game simulator</p>
        <nav className="menu-buttons">
          <button className="primary big" onClick={() => onGo("play")}>
            Play
          </button>
          <button className="big" onClick={() => onGo("decks")}>
            Deck Builder
            <span className="muted"> · {deckCount} saved</span>
          </button>
          <button className="big" onClick={() => onGo("settings")}>
            Settings
          </button>
        </nav>
        <p className="muted small">
          Card data and images © Eiichiro Oda / Shueisha / Bandai. Non-commercial fan project.
        </p>
      </div>
    </div>
  );
}

function PlaySetup({ decks, onBack, onStart }: { decks: SavedDeck[]; onBack: () => void; onStart: (s: GameSetup) => void }) {
  const playable = decks.filter((d) => validateDeck(d.deck).length === 0);
  const [mine, setMine] = useState(playable[0]?.id ?? "");
  const [theirs, setTheirs] = useState(playable[1]?.id ?? playable[0]?.id ?? "");
  const [opponent, setOpponent] = useState<Controller>("random");
  const a = playable.find((d) => d.id === mine);
  const b = playable.find((d) => d.id === theirs);
  const notReady = decks.length - playable.length;

  return (
    <div className="screen">
      <header className="topbar">
        <button onClick={onBack}>Menu</button>
        <strong>Play</strong>
      </header>
      <main className="screen-body narrow">
        <DeckPick label="Your deck" id="deck-mine" decks={playable} value={mine} onChange={setMine} />
        <DeckPick label="Opponent's deck" id="deck-theirs" decks={playable} value={theirs} onChange={setTheirs} />
        <fieldset className="opponent">
          <legend>Opponent</legend>
          <label>
            <input id="opp-bot" type="radio" name="opp" checked={opponent === "random"} onChange={() => setOpponent("random")} /> Bot (plays random
            legal moves)
          </label>
          <label>
            <input id="opp-human" type="radio" name="opp" checked={opponent === "human"} onChange={() => setOpponent("human")} /> Human on this device
          </label>
        </fieldset>
        {notReady > 0 && (
          <p className="muted">
            {notReady} saved deck{notReady > 1 ? "s aren't" : " isn't"} complete yet and can't be picked. Finish {notReady > 1 ? "them" : "it"} in the
            Deck Builder.
          </p>
        )}
        <button
          className="primary big"
          disabled={!a || !b}
          onClick={() => a && b && onStart({ decks: [a.deck, b.deck], names: [a.name, b.name], controllers: ["human", opponent] })}
        >
          Start game
        </button>
      </main>
    </div>
  );
}

function DeckPick({ label, id, decks, value, onChange }: { label: string; id: string; decks: SavedDeck[]; value: string; onChange: (v: string) => void }) {
  const current = decks.find((d) => d.id === value);
  const leader = current ? getCard(current.deck.leader) : null;
  return (
    <div className="deck-pick">
      {leader && <img src={leaderImage(leader.id)} alt="" className="pick-art" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />}
      <label htmlFor={id}>
        <span className="muted">{label}</span>
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {leader && (
          <span className="muted">
            {leader.name} · {leader.colors.join("/")}
          </span>
        )}
      </label>
    </div>
  );
}

function SettingsScreen({ settings, onChange, onBack }: { settings: Settings; onChange: (s: Settings) => void; onBack: () => void }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  return (
    <div className="screen">
      <header className="topbar">
        <button onClick={onBack}>Menu</button>
        <strong>Settings</strong>
      </header>
      <main className="screen-body narrow settings-list">
        <label className="setting">
          <span>
            <b>Card art</b>
            <span className="muted">Show card pictures. Off shows text cards.</span>
          </span>
          <input id="set-art" type="checkbox" checked={settings.showArt} onChange={(e) => set("showArt", e.target.checked)} />
        </label>
        <label className="setting">
          <span>
            <b>Hide the other player's hand</b>
            <span className="muted">With two players on one device, only the player to act sees their hand.</span>
          </span>
          <input id="set-hide" type="checkbox" checked={settings.hideHands} onChange={(e) => set("hideHands", e.target.checked)} />
        </label>
        <label className="setting">
          <span>
            <b>Bot speed</b>
            <span className="muted">Pause before each bot move.</span>
          </span>
          <select id="set-speed" value={settings.botDelay} onChange={(e) => set("botDelay", Number(e.target.value))}>
            <option value={150}>Fast</option>
            <option value={450}>Normal</option>
            <option value={900}>Slow</option>
          </select>
        </label>
        <label className="setting">
          <span>
            <b>DON!! card art</b>
            <span className="muted">{DON_ARTS.length > 1 ? "Design used for your DON!! cards." : "More DON!! designs are coming."}</span>
          </span>
          <select id="set-don" value={settings.donArt} disabled={DON_ARTS.length < 2} onChange={(e) => set("donArt", e.target.value)}>
            {DON_ARTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">Settings and decks are saved in this browser.</p>
      </main>
    </div>
  );
}
