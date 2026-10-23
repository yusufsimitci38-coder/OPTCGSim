import type { Ability } from "../engine/types.ts";

const supernovas = ["Supernovas"];

/** ST-02 Worst Generation. */
export const ST02: Record<string, Ability[]> = {
  // [Activate: Main] [Once Per Turn] ③ You may trash 1 card from your hand: Set this Leader as active.
  "ST02-001": [
    {
      timing: "activateMain",
      oncePerTurn: true,
      costs: [
        { kind: "restDon", n: 3 },
        { kind: "trashFromHand", n: 1 },
      ],
      effects: [{ kind: "setActive", target: "self" }],
    },
  ],
  "ST02-002": [],
  // [DON!! x1] If you have 3 or more Characters, this card gains +2000 power.
  "ST02-003": [
    {
      timing: "static",
      conditions: [
        { kind: "donAttached", n: 1 },
        { kind: "minCharacters", n: 3 },
      ],
      statics: [{ kind: "aura", target: "self", amount: 2000 }],
    },
  ],
  "ST02-004": [{ timing: "static", statics: [{ kind: "keyword", keyword: "blocker" }] }],
  // [On Play] K.O. up to 1 of your opponent's rested Characters with a cost of 3 or less.
  "ST02-005": [
    {
      timing: "onPlay",
      effects: [{ kind: "ko", target: { owner: "opponent", zone: "character", rested: true, maxCost: 3 }, upTo: 1 }],
    },
  ],
  "ST02-006": [],
  // [Activate: Main] You may rest 1 of your DON!! cards and this Character: Look at 5 cards from the top of
  // your deck; reveal up to 1 {Supernovas} type card and add it to your hand. Then, place the rest at the
  // bottom of your deck in any order.
  "ST02-007": [
    {
      timing: "activateMain",
      costs: [{ kind: "restDon", n: 1 }, { kind: "restSelf" }],
      effects: [{ kind: "searchTop", look: 5, types: supernovas, upTo: 1 }],
    },
  ],
  // [DON!! x1] [When Attacking] Rest up to 1 of your opponent's DON!! cards.
  "ST02-008": [
    {
      timing: "whenAttacking",
      conditions: [{ kind: "donAttached", n: 1 }],
      effects: [{ kind: "restOpponentDon", upTo: 1 }],
    },
  ],
  // [On Play] Set up to 1 of your {Supernovas} or {Heart Pirates} type rested Characters with a cost of 5 or less as active.
  "ST02-009": [
    {
      timing: "onPlay",
      effects: [
        {
          kind: "setActive",
          target: { owner: "self", zone: "character", rested: true, maxCost: 5, types: ["Supernovas", "Heart Pirates"] },
          upTo: 1,
        },
      ],
    },
  ],
  // [DON!! x1] [Once Per Turn] [Your Turn] If this Character battles your opponent's Character, set this card as active.
  "ST02-010": [
    {
      timing: "battlesCharacter",
      oncePerTurn: true,
      conditions: [{ kind: "donAttached", n: 1 }, { kind: "yourTurn" }],
      effects: [{ kind: "setActive", target: "self" }],
    },
  ],
  "ST02-011": [],
  "ST02-012": [],
  // [Blocker] [DON!! x1] [End of Your Turn] Set this Character as active.
  "ST02-013": [
    { timing: "static", statics: [{ kind: "keyword", keyword: "blocker" }] },
    {
      timing: "endOfYourTurn",
      conditions: [{ kind: "donAttached", n: 1 }],
      effects: [{ kind: "setActive", target: "self" }],
    },
  ],
  // [DON!! x1] [Your Turn] If this Character is rested, your {Supernovas} or {Navy} type Leaders and Characters gain +1000 power.
  "ST02-014": [
    {
      timing: "static",
      conditions: [{ kind: "donAttached", n: 1 }, { kind: "yourTurn" }, { kind: "selfRested" }],
      statics: [
        { kind: "aura", target: { owner: "self", zone: "leaderOrCharacter", types: ["Supernovas", "Navy"] }, amount: 1000 },
      ],
    },
  ],
  // [Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, set up to 1 of your DON!! cards as active.
  "ST02-015": [
    {
      timing: "counter",
      effects: [
        { kind: "power", target: { owner: "self", zone: "leaderOrCharacter" }, amount: 2000, duration: "battle", upTo: 1 },
        { kind: "setDonActive", upTo: 1 },
      ],
    },
  ],
  // [Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, set up to 1 of your DON!! cards as active.
  "ST02-016": [
    {
      timing: "counter",
      effects: [
        { kind: "power", target: { owner: "self", zone: "leaderOrCharacter" }, amount: 4000, duration: "battle", upTo: 1 },
        { kind: "setDonActive", upTo: 1 },
      ],
    },
  ],
  // [Main] Rest up to 1 of your opponent's Characters.
  "ST02-017": [{ timing: "main", effects: [{ kind: "rest", target: { owner: "opponent", zone: "character" }, upTo: 1 }] }],
};
