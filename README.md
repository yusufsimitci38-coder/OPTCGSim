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
| `src/data/cards.json` | Printed card data for 2,850 cards (stats + effect text). |
| `src/ui/` | React UI (hot-seat or vs a bot). |
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

Starter decks are 50-card lists built from the ST-01/ST-02 card pools; the copy counts are not the
retail product's.

## Card data

`src/data/cards.json` comes from [nemesis312/OnePieceTCGEngCardList](https://github.com/nemesis312/OnePieceTCGEngCardList)
(MIT). Known gaps: it ends around OP09/EB01, and most cards' **[Trigger]** text is missing from it, so
triggers will need a second source or manual entry. The card text and images are © Eiichiro Oda /
Shueisha / Bandai; this is a non-commercial fan project.

To refresh: `node scripts/import-cards.ts path/to/CardDb3.json`.
