import type { Ability } from "../engine/types.ts";

const strawHat = ["Straw Hat Crew"];

/** ST-01 Straw Hat Crew. */
export const ST01: Record<string, Ability[]> = {
  // [Activate: Main] [Once Per Turn] Give this Leader or 1 of your Characters up to 1 rested DON!! card.
  "ST01-001": [
    {
      timing: "activateMain",
      oncePerTurn: true,
      effects: [{ kind: "giveRestedDon", target: { owner: "self", zone: "leaderOrCharacter" }, amount: 1 }],
    },
  ],
  // [DON!! x2] [When Attacking] Your opponent cannot activate a [Blocker] Character that has 5000 or more power during this battle.
  "ST01-002": [
    {
      timing: "whenAttacking",
      conditions: [{ kind: "donAttached", n: 2 }],
      effects: [{ kind: "battleRestriction", blockerMaxPower: 4999 }],
    },
  ],
  "ST01-003": [],
  // [DON!! x2] This Character gains [Rush].
  "ST01-004": [
    { timing: "static", conditions: [{ kind: "donAttached", n: 2 }], statics: [{ kind: "keyword", keyword: "rush" }] },
  ],
  // [DON!! x1] [When Attacking] Up to 1 of your Leader or Character cards other than this card gains +1000 power during this turn.
  "ST01-005": [
    {
      timing: "whenAttacking",
      conditions: [{ kind: "donAttached", n: 1 }],
      effects: [
        {
          kind: "power",
          target: { owner: "self", zone: "leaderOrCharacter", notSelf: true },
          amount: 1000,
          duration: "turn",
          upTo: 1,
        },
      ],
    },
  ],
  "ST01-006": [{ timing: "static", statics: [{ kind: "keyword", keyword: "blocker" }] }],
  // [Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to your Leader or 1 of your Characters.
  "ST01-007": [
    {
      timing: "activateMain",
      oncePerTurn: true,
      effects: [{ kind: "giveRestedDon", target: { owner: "self", zone: "leaderOrCharacter" }, amount: 1 }],
    },
  ],
  "ST01-008": [],
  "ST01-009": [],
  "ST01-010": [],
  // [On Play] Give up to 2 rested DON!! cards to your Leader or 1 of your Characters.
  "ST01-011": [
    {
      timing: "onPlay",
      effects: [{ kind: "giveRestedDon", target: { owner: "self", zone: "leaderOrCharacter" }, amount: 2 }],
    },
  ],
  // [Rush] [DON!! x2] [When Attacking] Your opponent cannot activate [Blocker] during this battle.
  "ST01-012": [
    { timing: "static", statics: [{ kind: "keyword", keyword: "rush" }] },
    {
      timing: "whenAttacking",
      conditions: [{ kind: "donAttached", n: 2 }],
      effects: [{ kind: "battleRestriction", noBlockers: true }],
    },
  ],
  // [DON!! x1] This Character gains +1000 power.
  "ST01-013": [
    { timing: "static", conditions: [{ kind: "donAttached", n: 1 }], statics: [{ kind: "aura", target: "self", amount: 1000 }] },
  ],
  // [Counter] Up to 1 of your Leader or Character cards gains +3000 power during this battle.
  "ST01-014": [
    {
      timing: "counter",
      effects: [
        { kind: "power", target: { owner: "self", zone: "leaderOrCharacter" }, amount: 3000, duration: "battle", upTo: 1 },
      ],
    },
  ],
  // [Main] K.O. up to 1 of your opponent's Characters with 6000 power or less.
  "ST01-015": [
    { timing: "main", effects: [{ kind: "ko", target: { owner: "opponent", zone: "character", maxPower: 6000 }, upTo: 1 }] },
  ],
  // [Main] Select up to 1 of your {Straw Hat Crew} type Leader or Character cards. Your opponent cannot
  // activate [Blocker] if that Leader or Character attacks during this turn.
  "ST01-016": [
    {
      timing: "main",
      effects: [
        {
          kind: "status",
          target: { owner: "self", zone: "leaderOrCharacter", types: strawHat },
          status: "unblockable",
          duration: "turn",
          upTo: 1,
        },
      ],
    },
  ],
  // [Activate: Main] You may rest this Stage: Up to 1 {Straw Hat Crew} type Leader or Character card on your
  // field gains +1000 power during this turn.
  "ST01-017": [
    {
      timing: "activateMain",
      costs: [{ kind: "restSelf" }],
      effects: [
        {
          kind: "power",
          target: { owner: "self", zone: "leaderOrCharacter", types: strawHat },
          amount: 1000,
          duration: "turn",
          upTo: 1,
        },
      ],
    },
  ],
};
