import { STARTER_DECKS } from "../engine/index.ts";
import type { DeckList } from "../engine/index.ts";

/**
 * Decks and settings are kept in this browser's localStorage. Storage can be unavailable (private
 * windows, blocked site data), so every access is guarded and the app works without it; deck lists
 * can always be exported as text from the deck builder.
 */

export interface SavedDeck {
  id: string;
  name: string;
  deck: DeckList;
  /** Built-in decks can be copied but not edited or deleted. */
  builtIn?: boolean;
  updatedAt: number;
}

export interface Settings {
  hideHands: boolean;
  showArt: boolean;
  donArt: string;
  /** Delay before each bot move, in ms. */
  botDelay: number;
}

export const DEFAULT_SETTINGS: Settings = { hideHands: true, showArt: true, donArt: "standard", botDelay: 450 };

const DECKS_KEY = "optcgsim.decks.v1";
const SETTINGS_KEY = "optcgsim.settings.v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: changes last for this visit only.
  }
}

export const BUILT_IN_DECKS: SavedDeck[] = Object.entries(STARTER_DECKS).map(([name, deck]) => ({
  id: `builtin:${name}`,
  name,
  deck,
  builtIn: true,
  updatedAt: 0,
}));

export function loadDecks(): SavedDeck[] {
  return read<SavedDeck[]>(DECKS_KEY, []);
}

export function saveDecks(decks: SavedDeck[]) {
  write(
    DECKS_KEY,
    decks.filter((d) => !d.builtIn),
  );
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(SETTINGS_KEY, {}) };
}

export function saveSettings(s: Settings) {
  write(SETTINGS_KEY, s);
}

export const newDeckId = () => `deck-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
