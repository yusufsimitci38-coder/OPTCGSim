// Official card back and DON!! art from the play guide (en.onepiece-cardgame.com/play-guide/).
// Imported inline so single-file builds don't need to load them from anywhere.
import cardBack from "./assets/card-back.webp?inline";
import donBack from "./assets/don-back.webp?inline";
import donStandard from "./assets/don-standard.webp?inline";

export { cardBack, donBack };

export interface DonArt {
  id: string;
  name: string;
  src: string;
}

/** DON!! card fronts players can pick from. Alternate arts get added here. */
export const DON_ARTS: DonArt[] = [{ id: "standard", name: "Standard", src: donStandard }];

export function donArt(id: string): DonArt {
  return DON_ARTS.find((d) => d.id === id) ?? DON_ARTS[0];
}
