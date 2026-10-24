import { RIM } from "./palette";

// #590: ivory (#f3ecd9, relative luminance ~0.84) cream-lerped toward #fff6e8 is near-white, so legal
// markers fall below 3:1 on grain and waste. Pale seats skip the cream lean and wear a dark outline.
export const PALE_SEAT_LUM = 0.8;
/** Cream lean applied for non-pale seats (matches the prior buildMarks constant). */
export const LEGAL_MARK_CREAM_LEAN = 0.35;

export function relativeLuminance(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

export type LegalMarkStyle = {
  /** Seat fill on the mark mesh. */
  color: string;
  /** Cream lerp toward #fff6e8; 0 for pale seats so the seat colour stays as-is. */
  creamLean: number;
  /** Thin RIM.dark under the mark so pale seats hold 3:1 on grain and waste. */
  outline: boolean;
  outlineColor: string;
};

/** Mark style for the acting seat. Other seats keep cream lean 0.35 and no outline. */
export function legalMarkStyle(seatHex: string): LegalMarkStyle {
  const pale = relativeLuminance(seatHex) > PALE_SEAT_LUM;
  return {
    color: seatHex,
    creamLean: pale ? 0 : LEGAL_MARK_CREAM_LEAN,
    outline: pale,
    outlineColor: RIM.dark,
  };
}
