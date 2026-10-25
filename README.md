# OPTCG Sim

A One Piece Card Game simulator: a headless rules engine plus a browser UI.

```bash
npm install
npm run dev        # play in the browser (http://localhost:5173)
npm test           # rules tests + 200 random full games
npm run build      # static build in dist/
```

## Layout

| Path | What it is |
| --- | --- |
| `src/engine/` | Headless rules engine. No UI code; pure `GameState` in, `GameState` out. |
| `src/cards/` | Card behaviour, written in the effect DSL (`ST01.ts`, `ST02.ts`, ...). |
| `src/data/cards.json` | Printed card data for every English card through OP-17 / EB-05 / ST-36 (stats, effect and [Trigger] text, image links). |
| `src/ui/` | React UI: main menu, Play setup, Deck Builder, Settings, and the playmat-style game board. |
| `scripts/import-cards.ts` | Rebuilds `cards.json` from the source card list. |
| `tests/` | Vitest rule tests and a random-game fuzz test. |

## Engine API

```ts
import { createGame, getLegalActions, applyAction, STARTER_DECKS } from "./src/engine";

let s = createGame([deckA, deckB], { seed: 123 });
while (s.phase !== "gameOver") {
  const actions = getLegalActions(s);  // every legal move for the player who must act
  s = applyAction(s, actions[0]);      // returns a new state, input untouched
}
```

* State is plain JSON, so it can be cloned, saved and searched by an AI.
* Randomness (shuffles, who goes first) comes from a seed stored in the state, so a game replays exactly.
* Every decision is an `Action`: main-phase moves, blocks, counters, triggers, mulligans and effect targets
  (`choose`). An AI only has to pick from `getLegalActions`.

## Rules implemented

Setup (5-card hand, one mulligan, Life from the Leader), refresh / draw / DON!! / main / end phases,
first player skips the draw and gets 1 DON!!, no battles on either player's first turn, DON!! cost
payment and attaching (+1000 on your turn only), the 5-Character limit (trash one to play a 6th),
Stages, Events, attacking active-only with Leader/Characters, attacking rested Characters only,
Rush, Blocker, Counter cards and [Counter] events, Double Attack (a second hit after the last Life
card does nothing), Banish, Life → hand or [Trigger], K.O., [On Play], [When Attacking], [On Block],
[On K.O.], [End of Your Turn], [Activate: Main], [Once Per Turn], [DON!! xN], [Your Turn],
losing at 0 Life and on an empty deck, and deck construction checks (50 cards, max 4 copies, Leader colors).

## Card effects

Effects are data built from a small set of building blocks (`Effect`, `Condition`, `Cost` in
`src/engine/types.ts`). For example Gum-Gum Jet Pistol:

```ts
"ST01-015": [
  { timing: "main", effects: [{ kind: "ko", target: { owner: "opponent", zone: "character", maxPower: 6000 }, upTo: 1 }] },
],
```

Status:

* **ST-01 and ST-02:** every card is hand-written in the DSL.
* **Vanilla cards and keyword-only cards** (e.g. just `[Blocker]`) work automatically for every set.
* **Everything else** is marked as not implemented (⚠ in the UI). The next step is a parser that turns
  standard effect wording into DSL drafts in bulk, with manual fixes for unusual cards.

Not modelled yet: when a [Trigger] or effect plays a Character while you already have 5, the card
is not played (the real rule lets you trash one to make room).

Starter decks are 50-card lists built from the ST-01/ST-02 card pools; the copy counts are not the
retail product's.

## Card data

`src/data/cards.json` is generated from [punk-records](https://github.com/buhbbl/punk-records), which
exports the official English card list ([onepiece-cardgame.com](https://en.onepiece-cardgame.com/cardlist/))
to JSON and updates daily. Alternate arts are merged into their base card (`images` lists every printing).
The card text and images are © Eiichiro Oda / Shueisha / Bandai; this is a non-commercial fan project.

To refresh:

```bash
git clone --depth 1 https://github.com/buhbbl/punk-records /tmp/punk-records
node scripts/import-cards.ts /tmp/punk-records/english
```

## Card images

The **Card images** GitHub Action (`.github/workflows/card-images.yml`) downloads every English card
image from the official site, converts it to 400px-wide WebP and publishes it on the `card-images`
branch as `en/<card id>.webp` (alternate arts keep their suffix, e.g. `OP01-016_p3.webp`). It runs
every Monday and can be started by hand from the Actions tab; reruns only fetch new cards.

Direct link pattern:
`https://raw.githubusercontent.com/yusufsimitci38-coder/OPTCGSim/card-images/en/ST01-001.webp`

The UI shows this art on every card (toggle **Card art** in the toolbar); if an image can't load the
card falls back to the text layout. `npm run build:artifact` builds a single self-contained HTML file
with the starter decks' images embedded, for hosts that block remote images.

## The app

* **Main menu:** Play, Deck Builder, Settings.
* **Play:** pick your deck and the opponent's (starter decks or your saved decks that pass the deck
  rules), and a bot or a second human on the same device.
* **Deck Builder:** every card, searchable by name, type, effect or [Trigger] text and filterable by
  color, card type, cost and set (Leader's colors only by default). Tap a card to add it (or set it as
  Leader), tap **i** for details. The deck panel shows the deck rules live (50 cards, max 4 copies,
  Leader colors), a cost curve and Counter count. Decks can be saved, copied, deleted, and exported or
  imported as text (`4xOP01-016` per line, the format other simulators use). Starter decks are
  read-only; copy one to edit it.
* **Settings:** card art, hiding the other player's hand, bot speed, DON!! art.

Decks and settings are saved in the browser's local storage; export a deck as text to keep a copy.

### Hosted version

`.github/workflows/pages.yml` builds the app and publishes it on GitHub Pages on every push, where all
card images load. One-time setup in the repository: **Settings → Pages → Build and deployment →
Source: GitHub Actions**. The site is then at `https://yusufsimitci38-coder.github.io/OPTCGSim/`.

## Playing in the browser

The board follows the official playmat: Characters face the opponent, then Life / Leader / Stage /
Deck, then the DON!! deck, cost area and trash, with your hand at the bottom.

* **Play a card:** drag it from your hand onto your Character area (or onto a Character to replace it
  when you already have 5).
* **Give DON!!:** drag from your cost area onto your Leader or a Character. Given DON!! peek out from
  under the card.
* **Attack:** drag an active Leader/Character onto an opposing Leader or rested Character.
* **Counter:** during the counter step, drag Counter cards from your hand onto the card being attacked.
* **Phones:** tap a card (or the cost area), then tap where it goes. Valid targets light up green.
* Everything else (End turn, Activate, Block, Trigger, ...) is a button in the panel; **All moves**
  lists every legal move.

The card back and DON!! art (`src/ui/assets/`) are the official images from the play guide. DON!!
fronts are listed in `src/ui/cardArt.ts` (`DON_ARTS`); adding an entry there makes a DON!! art picker
appear in Settings. The **Official extras** Action (`.github/workflows/official-extras.yml`, run by
hand) crawls the official site for DON!! and card-back images and saves candidates on the
`card-images` branch under `extras/candidates/` (alternate DON!! arts appear on event pages).

