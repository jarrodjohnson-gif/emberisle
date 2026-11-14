// #1593: the dock marks, painted on each pier's T-head (harbor-jelly) and on the lite board's plain piers (isle-renderer).
// Its own small chunk with no imports, so the lite board loads the atlas without the harbour shore (and three.js and the
// palette stay where they are): the caller passes the hex palette and wraps the canvas in its own texture.
import type { HarborKind } from "@/lib/game/types";
import type { PAINT } from "@/lib/scene/palette";

// One atlas, a row per kind, read from above.
export const PLATE_KINDS: HarborKind[] = ["any", "timber", "clay", "wool", "grain", "ore"];
// The goods' own symbols from the HUD (ResourceSymbols.tsx), drawn on a 24 box.
const ICON: Record<Exclude<HarborKind, "any">, { fill: string[]; stroke: string[] }> = {
  timber: { fill: ["m9 2-4 6h2l-4 6h3l-3 5h12l-3-5h3l-4-6h2L9 2Z"], stroke: ["M9 18v4m9-17-3 5h2l-3 5h8l-3-5h2l-3-5Z", "M18 15v5"] },
  clay: { fill: ["M7.7 3h8.6a.7.7 0 0 1 .7.7v4.6a.7.7 0 0 1-.7.7H7.7a.7.7 0 0 1-.7-.7V3.7a.7.7 0 0 1 .7-.7Z", "M1.7 11h8.6a.7.7 0 0 1 .7.7v5.6a.7.7 0 0 1-.7.7H1.7a.7.7 0 0 1-.7-.7v-5.6a.7.7 0 0 1 .7-.7Z", "M13.7 11h8.6a.7.7 0 0 1 .7.7v5.6a.7.7 0 0 1-.7.7h-8.6a.7.7 0 0 1-.7-.7v-5.6a.7.7 0 0 1 .7-.7Z"], stroke: [] },
  wool: { fill: ["M6 17.6C3.1 17.6 2.3 13.9 4.5 12.7 3.4 10.4 5.9 8.2 8 9.3 8.6 6.5 12.5 6.2 13.5 8.6 15.9 7.4 18.8 9.5 17.9 12 20.3 13.2 19.6 16.9 16.9 17.6Z", "M22.2 12.4a3.3 2.35 -12 1 1-6.6 0 3.3 2.35 -12 1 1 6.6 0Z"], stroke: ["M8.6 17.6v3.6M14.4 17.6v3.6"] },
  grain: { fill: ["M13 7c-3 0-5-3-4-5 3 0 5 3 4 5Zm2 3c0-3 3-5 6-5 0 3-3 5-6 5Zm-5 2c-3 0-5-3-4-5 3 0 5 3 4 5Zm2 3c0-3 3-5 6-5 0 3-3 5-6 5Zm-5 2c-3 0-5-3-4-5 3 0 5 3 4 5Zm2 3c0-3 3-5 6-5 0 3-3 5-6 5Z"], stroke: ["M7 22 17 2"] },
  ore: { fill: ["m2 20 7-14 7 14H2Zm11 0-3-6 5-12 8 18H13Z"], stroke: [] },
};
// One atlas, a row per kind: a white rim, the good's colour, its symbol in white on the left and the rate as white pips on the
// right (two for 2:1, three for 3:1). A 3:1 dock's symbol is the five goods' colours in a ring: any good. No text, no cream.
let marks: HTMLCanvasElement | null = null;
export function markCanvas(paint: typeof PAINT) {
  if (marks) return marks;
  const good = (k: HarborKind) => (k === "any" ? "#2f4f7a" : paint[k][0]);
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128 * PLATE_KINDS.length;
  const x = c.getContext("2d")!;
  PLATE_KINDS.forEach((k, i) => {
    const y = i * 128;
    x.fillStyle = "#ffffff";
    x.beginPath();
    x.roundRect(2, y + 2, 252, 124, 40);
    x.fill();
    x.fillStyle = good(k);
    x.beginPath();
    x.roundRect(10, y + 10, 236, 108, 32);
    x.fill();
    const ink = k === "wool" || k === "grain" ? "#263d3c" : "#ffffff";
    if (k === "any") {
      (["timber", "clay", "wool", "grain", "ore"] as const).forEach((g, j) => {
        const a = -Math.PI / 2 + (j * 2 * Math.PI) / 5;
        x.fillStyle = "#ffffff";
        x.beginPath();
        x.arc(78 + Math.cos(a) * 26, y + 64 + Math.sin(a) * 26, 15, 0, 7);
        x.fill();
        x.fillStyle = good(g);
        x.beginPath();
        x.arc(78 + Math.cos(a) * 26, y + 64 + Math.sin(a) * 26, 11, 0, 7);
        x.fill();
      });
    } else {
      x.save();
      x.translate(30, y + 16);
      x.scale(4, 4);
      x.fillStyle = x.strokeStyle = ink;
      x.lineWidth = 2;
      x.lineCap = x.lineJoin = "round";
      for (const d of ICON[k].fill) x.fill(new Path2D(d));
      for (const d of ICON[k].stroke) x.stroke(new Path2D(d));
      x.restore();
    }
    const n = k === "any" ? 3 : 2;
    x.fillStyle = ink;
    for (let j = 0; j < n; j++) {
      x.beginPath();
      x.arc(n === 3 ? 158 + j * 30 : 172 + j * 34, y + 64, 12, 0, 7);
      x.fill();
    }
  });
  return (marks = c);
}
