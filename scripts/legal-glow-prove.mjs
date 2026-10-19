// #590: ivory legal markers reach 3:1 on grain and waste; other seats keep the cream lean and no outline.
// No browser: contrast is against the mark colour the renderer uses (seat fill, or RIM.dark outline when pale).
import { PLAYER_COLORS } from "../src/lib/game/types.ts";
import { PAINT, RIM } from "../src/lib/scene/palette.ts";
import {
  LEGAL_MARK_CREAM_LEAN,
  PALE_SEAT_LUM,
  legalMarkStyle,
  relativeLuminance,
} from "../src/lib/scene/legal-mark-style.ts";

const lum = relativeLuminance;
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

const lerpHex = (a, b, t) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((x, i) => Math.round(x + (pb[i] - x) * t).toString(16).padStart(2, "0")).join("")}`;
};

const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${detail}`);
  if (!ok) fails.push(name);
};

const cream = "#fff6e8";
const grounds = {
  // Current board paints (palette.ts) and the review hexes named in #590.
  grain: PAINT.grain[0],
  grainShade: PAINT.grain[1],
  waste: PAINT.waste[0],
  wasteShade: PAINT.waste[1],
  issueGrain: "#b8862a",
  issueWaste: "#b89b6a",
};

const [ember, tide, dune, pine] = PLAYER_COLORS;
check("Dune is the pale ivory seat", relativeLuminance(dune) > PALE_SEAT_LUM, `lum ${relativeLuminance(dune).toFixed(3)}`);

for (const [name, hex] of [
  ["Ember", ember],
  ["Tide", tide],
  ["Dune", dune],
  ["Pine", pine],
]) {
  const style = legalMarkStyle(hex);
  const pale = relativeLuminance(hex) > PALE_SEAT_LUM;
  check(`${name}: creamLean matches pale rule`, style.creamLean === (pale ? 0 : LEGAL_MARK_CREAM_LEAN), `creamLean=${style.creamLean}`);
  check(`${name}: outline only when pale`, style.outline === pale, `outline=${style.outline}`);
  check(`${name}: outline colour is RIM.dark`, !style.outline || style.outlineColor === RIM.dark, style.outlineColor);

  // Readable colour: outline when present, else the cream-leaned emissive (what the eye tracks at the pulse trough).
  const readable = style.outline ? style.outlineColor : lerpHex(hex, cream, style.creamLean);
  for (const [gName, gHex] of Object.entries(grounds)) {
    const ratio = contrast(readable, gHex);
    if (name === "Dune" && (gName === "grain" || gName === "waste" || gName === "grainShade" || gName === "wasteShade" || gName === "issueGrain" || gName === "issueWaste")) {
      check(`Dune marker >= 3:1 on ${gName}`, ratio >= 3, ratio.toFixed(2));
    }
  }
}

// Other three seats: cream lean unchanged, no outline (so the prior look is preserved).
for (const [name, hex] of [
  ["Ember", ember],
  ["Tide", tide],
  ["Pine", pine],
]) {
  const style = legalMarkStyle(hex);
  check(`${name}: still cream-leans ${LEGAL_MARK_CREAM_LEAN}`, style.creamLean === LEGAL_MARK_CREAM_LEAN, String(style.creamLean));
  check(`${name}: no outline`, style.outline === false, String(style.outline));
}

// Reduced motion: outline is static (no baseGlow) and the seat fill remains; pale seats still have a readable colour.
const duneStyle = legalMarkStyle(dune);
check("reduced-motion: pale seat still has fill + outline", duneStyle.outline && duneStyle.color === dune, JSON.stringify(duneStyle));

if (fails.length) {
  console.log("FAIL: " + fails.join(", "));
  process.exit(1);
}
console.log("legal-glow-prove ok");
