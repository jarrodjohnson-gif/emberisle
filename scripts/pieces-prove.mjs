// #238: pieces read in every seat colour. The five checks in docs/design/pieces.md; no browser.
import { PLAYER_COLORS } from "../src/lib/game/types.ts";
import { PAINT, RIM } from "../src/lib/scene/palette.ts";
import { HEX_SIZE } from "../src/lib/game/hex.ts";

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${detail}`);
  if (!ok) fails.push(name);
};

const grounds = [...Object.entries(PAINT).map(([k, v]) => [k, v[0]]), ["beach", "#e8d7b0"]];
const f = (n) => n.toFixed(2);

console.log("Rim contrast against each ground (WCAG 2)");
console.log(["rim", ...grounds.map((g) => g[0]), "min"].join("\t"));
for (const [name, hex] of Object.entries(RIM)) {
  const r = grounds.map(([, g]) => contrast(hex, g));
  console.log([name, ...r.map(f), f(Math.min(...r))].join("\t"));
}
const best = grounds.map(([, g]) => Math.max(contrast(RIM.light, g), contrast(RIM.dark, g)));
console.log(["max", ...best.map(f), f(Math.min(...best))].join("\t"));

console.log("\nSeat against its rims");
console.log("seat\tvs light\tvs dark\tbetter");
const seatBest = PLAYER_COLORS.map((c) => {
  const l = contrast(c, RIM.light);
  const d = contrast(c, RIM.dark);
  console.log([c, f(l), f(d), f(Math.max(l, d))].join("\t"));
  return Math.max(l, d);
});
console.log("");

check("1 rims against every ground >= 3.0", Math.min(...best) >= 3, `min ${f(Math.min(...best))}`);
const rr = contrast(RIM.light, RIM.dark);
check("2 rims against each other >= 7", rr >= 7, f(rr));
check("3 every seat against a rim >= 3.0", Math.min(...seatBest) >= 3, `min ${f(Math.min(...seatBest))}`);
check("4 table printed", true, "above");
const len = HEX_SIZE * 0.9;
check("5 footprint 0.54 < HEX_SIZE / 2", 0.54 < HEX_SIZE / 2, `${0.54} < ${f(HEX_SIZE / 2)}`);
check("5 plank len - 0.12 > 0.8", len - 0.12 > 0.8, f(len - 0.12));

if (fails.length) {
  console.log("FAIL: " + fails.join(", "));
  process.exit(1);
}
console.log("ok");
