// #1593: the dock marks, painted on each pier's T-head (harbor-jelly) and on the lite board's plain piers (isle-renderer).
// Its own small chunk with no imports, so the lite board loads the atlas without the harbour shore (and three.js and the
// palette stay where they are): the caller passes the hex palette and wraps the canvas in its own texture.
import type { HarborKind } from "@/lib/game/types";
import type { PAINT } from "@/lib/scene/palette";

// One atlas, a row per kind, read from above.
export const PLATE_KINDS: HarborKind[] = ["any", "timber", "clay", "wool", "grain", "ore"];
// The goods' own symbols from the HUD (ResourceSymbols.tsx), drawn on a 24 box: [fill, stroke?].
const ICON: Record<Exclude<HarborKind, "any">, [string, string?]> = {
  timber: ["m9 2-4 6h2l-4 6h3l-3 5h12l-3-5h3l-4-6h2L9 2Z", "M9 18v4m9-17-3 5h2l-3 5h8l-3-5h2l-3-5ZM18 15v5"],
  clay: ["M7.7 3h8.6a.7.7 0 0 1 .7.7v4.6a.7.7 0 0 1-.7.7H7.7a.7.7 0 0 1-.7-.7V3.7a.7.7 0 0 1 .7-.7ZM1.7 11h8.6a.7.7 0 0 1 .7.7v5.6a.7.7 0 0 1-.7.7H1.7a.7.7 0 0 1-.7-.7v-5.6a.7.7 0 0 1 .7-.7ZM13.7 11h8.6a.7.7 0 0 1 .7.7v5.6a.7.7 0 0 1-.7.7h-8.6a.7.7 0 0 1-.7-.7v-5.6a.7.7 0 0 1 .7-.7Z"],
  wool: ["M6 17.6C3.1 17.6 2.3 13.9 4.5 12.7 3.4 10.4 5.9 8.2 8 9.3 8.6 6.5 12.5 6.2 13.5 8.6 15.9 7.4 18.8 9.5 17.9 12 20.3 13.2 19.6 16.9 16.9 17.6ZM22.2 12.4a3.3 2.35 -12 1 1-6.6 0 3.3 2.35 -12 1 1 6.6 0Z", "M8.6 17.6v3.6M14.4 17.6v3.6"],
  grain: ["M13 7c-3 0-5-3-4-5 3 0 5 3 4 5Zm2 3c0-3 3-5 6-5 0 3-3 5-6 5Zm-5 2c-3 0-5-3-4-5 3 0 5 3 4 5Zm2 3c0-3 3-5 6-5 0 3-3 5-6 5Zm-5 2c-3 0-5-3-4-5 3 0 5 3 4 5Zm2 3c0-3 3-5 6-5 0 3-3 5-6 5Z", "M7 22 17 2"],
  ore: ["m2 20 7-14 7 14H2Zm11 0-3-6 5-12 8 18H13Z"],
};
const W = "#fff";
function glyph(x: CanvasRenderingContext2D, k: Exclude<HarborKind, "any">, ox: number, oy: number, s: number, ink: string) {
  x.save();
  x.translate(ox, oy);
  x.scale(s, s);
  x.fillStyle = x.strokeStyle = ink;
  x.lineWidth = 2;
  x.lineCap = x.lineJoin = "round";
  const [f, st] = ICON[k];
  x.fill(new Path2D(f));
  if (st) x.stroke(new Path2D(st));
  x.restore();
}
function dot(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string) {
  x.fillStyle = fill;
  x.beginPath();
  x.arc(cx, cy, r, 0, 7);
  x.fill();
}
// #1593 (q1602-dock-fix, fix 3): one atlas factory. With no palette, returns the full board's 256x192 transparent white
// symbol/pip rows for the painted pier-head boards; with a palette, returns the lite board's 256x128 painted-plank rows.
let paintOnly: HTMLCanvasElement | null = null;
let marks: HTMLCanvasElement | null = null;
export function markCanvas(paint?: typeof PAINT) {
  const hit = paint ? marks : paintOnly;
  if (hit) return hit;
  const h = paint ? 128 : 192;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = h * PLATE_KINDS.length;
  const x = c.getContext("2d")!;
  const good = (k: HarborKind) => (k === "any" ? "#2f4f7a" : paint![k][0]);
  PLATE_KINDS.forEach((k, i) => {
    const y = i * h;
    if (!paint) {
      if (k === "any") for (let j = -1; j <= 1; j++) dot(x, 128 + j * 62, y + 96, 22, W);
      else {
        glyph(x, k, 6, y + 12, 7, W);
        for (const s of [-28, 28]) dot(x, 222, y + 96 + s, 19, W);
      }
      return;
    }
    for (const [p, r, f] of [[2, 40, W], [10, 32, good(k)]] as const) {
      x.fillStyle = f;
      x.beginPath();
      x.roundRect(p, y + p, 256 - p * 2, 128 - p * 2, r);
      x.fill();
    }
    const ink = k === "wool" || k === "grain" ? "#263d3c" : W;
    if (k === "any") {
      (PLATE_KINDS.slice(1) as Exclude<HarborKind, "any">[]).forEach((g, j) => {
        const a = -1.5708 + j * 1.2566;
        const cx = 78 + Math.cos(a) * 26, cy = y + 64 + Math.sin(a) * 26;
        dot(x, cx, cy, 15, W);
        dot(x, cx, cy, 11, good(g));
      });
    } else glyph(x, k, 30, y + 16, 4, ink);
    const n = k === "any" ? 3 : 2;
    for (let j = 0; j < n; j++) dot(x, (n === 3 ? 158 : 172) + j * (n === 3 ? 30 : 34), y + 64, 12, ink);
  });
  return paint ? (marks = c) : (paintOnly = c);
}
