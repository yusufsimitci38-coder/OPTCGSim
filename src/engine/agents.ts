import { getLegalActions } from "./engine.ts";
import type { Action, GameState } from "./types.ts";

export interface Agent {
  name: string;
  chooseAction(state: GameState, random: () => number): Action;
}

/** Plays uniformly random legal moves, ending the turn less often so games progress. */
export const randomAgent: Agent = {
  name: "Random",
  chooseAction(state, random) {
    const actions = getLegalActions(state);
    const nonEnd = actions.filter((a) => a.type !== "endTurn");
    const pool = nonEnd.length && random() < 0.85 ? nonEnd : actions;
    return pool[Math.floor(random() * pool.length)];
  },
};
