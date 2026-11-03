// The jelly block's size (docs/design/hex-jelly-prompt.md "THE BLOCK"), shared by the board, which loads the scenes later, and
// the scenes themselves: corner radius (the board's hex size) and the block's height to its flat pad and rim.
export const CORNER_R = 1.12;
export const TILE_Y = 0.04;
export const BLOCK_H = 0.3;

// #826: blocked-hex dimming amount (0.75 = 75% blend to black, per owner decision 2026-10-31).
export const ROBBER_HEX_DIM = 0.75;
export let robberHexDim = ROBBER_HEX_DIM;
export function setRobberHexDim(dim: number) {
  robberHexDim = dim;
}
