/** Normalized, printed card data (stats + effect text). Behaviour lives in src/cards. */
export type Category = "Leader" | "Character" | "Event" | "Stage";

export interface CardData {
  id: string;
  name: string;
  category: Category;
  colors: string[];
  /** Play cost. For Leaders this is 0; see `life`. */
  cost: number;
  /** Leaders only: number of Life cards. */
  life: number | null;
  power: number;
  /** Counter value printed on the card (0 if none). */
  counter: number;
  attributes: string[];
  types: string[];
  rarity: string;
  effect: string;
  set: string;
  image: string;
}
