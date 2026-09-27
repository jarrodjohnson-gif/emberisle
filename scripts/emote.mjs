// #120: crop a reaction image to its visible pixels, pad it square, and write a 128 px WebP with transparency.
// Usage: node scripts/emote.mjs <input image> <name>   ->   src/assets/emotes/<name>.webp
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const [src, name] = process.argv.slice(2);
if (!src || !/^[a-z0-9-]+$/.test(name ?? "")) throw new Error("usage: node scripts/emote.mjs <image> <name: a-z 0-9 ->");
const out = `src/assets/emotes/${name}.webp`;
const size = 128;
const b64 = readFileSync(src).toString("base64");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) });
const page = await browser.newPage();
const res = await page.evaluate(async ({ b64, size }) => {
  const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
  const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext("2d"); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, img.width, img.height).data;
  let l = img.width, t = img.height, r = 0, bt = 0;
  for (let y = 0; y < img.height; y++) for (let i = 0; i < img.width; i++) if (d[(y * img.width + i) * 4 + 3] > 16) { l = Math.min(l, i); r = Math.max(r, i); t = Math.min(t, y); bt = Math.max(bt, y); }
  const w = r - l + 1, h = bt - t + 1, side = Math.max(w, h), pad = Math.round(side * 0.04), S = side + 2 * pad;
  const o = new OffscreenCanvas(size, size); const ox = o.getContext("2d"); ox.imageSmoothingQuality = "high";
  const k = size / S; ox.drawImage(img, l, t, w, h, (pad + (side - w) / 2) * k, (pad + (side - h) / 2) * k, w * k, h * k);
  const blob = await o.convertToBlob({ type: "image/webp", quality: 0.9 });
  const bytes = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (const v of bytes) s += String.fromCharCode(v);
  return { bbox: [l, t, w, h], b64: btoa(s) };
}, { b64, size: Number(size) });
writeFileSync(out, Buffer.from(res.b64, "base64"));
console.log("bbox", res.bbox, "->", out, Buffer.from(res.b64, "base64").length, "bytes");
await browser.close();
