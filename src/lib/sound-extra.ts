export const EXTRA_FILES = {
  sheep_for_wood: "sheep_for_wood.mp3",
  stone_for_wood: "stone_for_wood.mp3",
  three_wood: "three_wood.mp3",
  daking_wood: "daking_wood.mp3",
  lucke_diggler: "lucke_diggler.mp3",
  corn_no: "corn_no.mp3",
  isaac_win: "isaac_win.mp3",
  sb_nice_sheep: "sb_nice_sheep.mp3",
  sb_sheep_please: "sb_sheep_please.mp3",
  sb_grain_please: "sb_grain_please.mp3",
  sb_brick_please: "sb_brick_please.mp3",
  sb_real_badman: "sb_real_badman.mp3",
  sb_gong: "sb_gong.mp3",
  tap_pasture: "tap_pasture.mp3",
} as const;

export type ExtraSoundName = keyof typeof EXTRA_FILES;
