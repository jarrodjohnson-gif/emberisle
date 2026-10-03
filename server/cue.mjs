import { readFileSync, existsSync } from "node:fs";

const map = {
  ui_hover: "click_002.wav",
  ui_click: "click_001.wav",
  ui_back: "back_001.wav",
  ui_confirm: "confirmation_001.wav",
  ui_error: "error_001.wav",
  dice_shake: "drop_004.wav",
  dice_land: "drop_001.wav",
  path_place: "drop_002.wav",
  outpost_place: "drop_003.wav",
  stronghold_place: "bong_001.wav",
  card_buy: "open_001.wav",
  card_play: "scratch_001.wav",
  chip_gain: "click_005.wav",
  trade_yes: "confirmation_001.wav",
  trade_no: "error_002.wav",
  win: "pluck_001.wav",
};

export function cue(name) {
  const file = map[name];
  if (!file) return null;
  const path = new URL(`../public/audio/${file}`, import.meta.url);
  if (!existsSync(path)) return null;
  return readFileSync(path);
}
