/** Card art published by .github/workflows/card-images.yml on the card-images branch. */
const IMAGE_BASE = "https://raw.githubusercontent.com/yusufsimitci38-coder/OPTCGSim/card-images/en/";

declare global {
  interface Window {
    /** Embedded images (data: URIs) for builds that can't load remote images, e.g. the Artifact page. */
    __CARD_IMAGES__?: Record<string, string>;
  }
}

export function cardImage(cardId: string): string {
  return window.__CARD_IMAGES__?.[cardId] ?? `${IMAGE_BASE}${cardId}.webp`;
}
