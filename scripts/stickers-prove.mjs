// #663: the sticker size gate. Every file in the sticker folder (default src/assets/emotes/, the folder emotes.ts globs and
// server/chat.mjs loadEmotes reads) must be:
// - named lowercase kebab-case (`good-trade.webp` is the sticker `good-trade`), as .png or .webp, the only types both loaders read;
// - really that format (PNG signature and IHDR; RIFF WEBP with a VP8, VP8L or VP8X first chunk and a RIFF size that matches the file);
// - at most 256 px on each side. Non-square is fine (owner decision on #663, 2026-11-06: dark-smile is 196x256): the tray
//   draws every sticker with object-fit contain inside its square cell, which sticker-tray-prove checks in a browser;
// - at most 50,000 bytes if static, or 300,000 bytes if animated (an animated PNG with acTL, or a VP8X WebP with the animation flag);
// - one of at most 24 stickers (4 rows of 6 in the tray).
// It also checks that the host's loadEmotes reads exactly the stickers that pass. Then it proves the gate on generated files in a
// temp folder: good square, non-square and animated files pass, and oversize, over-bytes, bad names, wrong formats and a 25th
// sticker each fail, and the script exits non-zero on a bad folder.
// Limits: docs/design/emotes.md "Stickers" and the spec updates on issue #663. Run: npm run stickers-prove [-- <folder>]
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { loadEmotes } from "../server/chat.mjs";

export const MAX_SIDE = 256;
export const STATIC_BYTES = 50_000;
export const ANIMATED_BYTES = 300_000;
export const MAX_STICKERS = 24;
const NAME = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.(png|webp)$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Width, height and whether it animates, read from the header; throws with the reason if the bytes are not that format.
export function readImage(bytes, type) {
  if (type === "png") {
    if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString("latin1", 12, 16) !== "IHDR") throw new Error("not a PNG");
    let animated = false;
    for (let at = 8; at + 8 <= bytes.length; ) {
      const kind = bytes.toString("latin1", at + 4, at + 8);
      if (kind === "acTL") animated = true;
      if (kind === "IDAT" || kind === "IEND") break;
      at += 12 + bytes.readUInt32BE(at);
    }
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), animated };
  }
  if (bytes.length < 30 || bytes.toString("latin1", 0, 4) !== "RIFF" || bytes.toString("latin1", 8, 12) !== "WEBP") throw new Error("not a WebP");
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error(`WebP RIFF size ${bytes.readUInt32LE(4) + 8} does not match the file's ${bytes.length} bytes`);
  const kind = bytes.toString("latin1", 12, 16);
  if (kind === "VP8 ") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff, animated: false };
  if (kind === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, animated: false };
  }
  if (kind === "VP8X") return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1, animated: Boolean(bytes[20] & 0x02) };
  throw new Error(`unknown WebP chunk "${kind}"`);
}

// Every sticker in the folder and every problem found, one line each.
export function checkFolder(dir) {
  const stickers = [];
  const problems = [];
  for (const file of readdirSync(dir).sort()) {
    const m = NAME.exec(file);
    if (!m) {
      problems.push(`${file}: a sticker must be a lowercase kebab-case name ending .png or .webp`);
      continue;
    }
    const bytes = readFileSync(path.join(dir, file));
    let image;
    try {
      image = readImage(bytes, m[2]);
    } catch (e) {
      problems.push(`${file}: ${e.message}`);
      continue;
    }
    const { width, height, animated } = image;
    const limit = animated ? ANIMATED_BYTES : STATIC_BYTES;
    if (!width || !height || width > MAX_SIDE || height > MAX_SIDE) problems.push(`${file}: ${width}x${height} px, each side must be 1 to ${MAX_SIDE} px`);
    if (bytes.length > limit) problems.push(`${file}: ${bytes.length} bytes, over the ${limit} byte limit for ${animated ? "animated" : "static"} stickers`);
    stickers.push({ id: m[1], file, width, height, animated, bytes: bytes.length });
  }
  if (stickers.length > MAX_STICKERS) problems.push(`${stickers.length} stickers, the tray holds at most ${MAX_STICKERS}`);
  return { stickers, problems };
}

const DEFAULT_DIR = fileURLToPath(new URL("../src/assets/emotes/", import.meta.url));
const dir = path.resolve(process.argv[2] ?? DEFAULT_DIR);
const { stickers, problems } = checkFolder(dir);
for (const s of stickers) {
  const shape = s.width === s.height ? "square" : "non-square, drawn contained in its square cell";
  console.log(`${s.file}: ${s.width}x${s.height} px, ${s.bytes} bytes, ${s.animated ? "animated" : "static"}, ${shape}`);
}
if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
const loaded = [...loadEmotes(dir)].sort();
assert.deepEqual(loaded, stickers.map((s) => s.id), "the host's loadEmotes reads exactly the stickers that pass");
console.log(`ok ${stickers.length} stickers in ${path.relative(process.cwd(), dir) || "."}: names, formats, at most ${MAX_SIDE} px a side, at most ${STATIC_BYTES} bytes static and ${ANIMATED_BYTES} animated, ${MAX_STICKERS} at most; loadEmotes reads all ${loaded.length}`);
if (process.env.STICKERS_PROVE_CHILD) process.exit(0);

// The self-test. A PNG of width x height RGBA pixels: random pixels make it incompressible, so its size is about 4 x width x height.
function png(width, height, { noise = false, animated = false, pad = 0 } = {}) {
  const chunk = (kind, data) => {
    const body = Buffer.concat([Buffer.from(kind, "latin1"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 4 + 1) * height);
  if (noise) for (let y = 0; y < height; y++) randomBytes(width * 4).copy(rows, y * (width * 4 + 1) + 1);
  const parts = [PNG_SIGNATURE, chunk("IHDR", ihdr)];
  if (animated) {
    const actl = Buffer.alloc(8);
    actl.writeUInt32BE(1, 0);
    const fctl = Buffer.alloc(26);
    fctl.writeUInt32BE(width, 4);
    fctl.writeUInt32BE(height, 8);
    fctl.writeUInt16BE(1, 20);
    fctl.writeUInt16BE(10, 22);
    parts.push(chunk("acTL", actl), chunk("fcTL", fctl));
  }
  if (pad) parts.push(chunk("tEXt", Buffer.concat([Buffer.from("Comment\0"), randomBytes(pad)])));
  parts.push(chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}
// A header-only VP8X WebP: enough for the gate, which reads headers, not pixels.
function webpX(width, height, { animated = false } = {}) {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(22, 4);
  b.write("WEBPVP8X", 8, "latin1");
  b.writeUInt32LE(10, 16);
  b[20] = 0x10 | (animated ? 0x02 : 0);
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return b;
}

const tmp = mkdtempSync(path.join(tmpdir(), "emberisle-stickers-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
function folder(files) {
  const d = path.join(tmp, String(n++));
  mkdirSync(d);
  for (const [name, bytes] of Object.entries(files)) writeFileSync(path.join(d, name), bytes);
  return d;
}
const ok = (what) => console.log(`ok ${what}`);
function passes(files, what) {
  const got = checkFolder(folder(files));
  assert.deepEqual(got.problems, [], what);
  ok(what);
  return got.stickers;
}
function fails(files, pattern, what) {
  const got = checkFolder(folder(files));
  assert.ok(got.problems.some((p) => pattern.test(p)), `${what}: expected a problem matching ${pattern}, got ${JSON.stringify(got.problems)}`);
  ok(`${what} fails: ${got.problems.find((p) => pattern.test(p))}`);
}

const good = passes(
  { "good-trade.png": png(128, 128), "tall-one.png": png(196, 256), "wide-one.png": png(256, 64), "max-side.webp": webpX(256, 256), "a1.webp": webpX(249, 256) },
  "square, non-square (196x256, 256x64, 249x256) and 256x256 stickers pass",
);
assert.deepEqual(good.map((s) => `${s.id} ${s.width}x${s.height}`), ["a1 249x256", "good-trade 128x128", "max-side 256x256", "tall-one 196x256", "wide-one 256x64"]);
ok("the gate reads PNG and VP8X WebP sizes from the header");
const animated = passes({ "moving-png.png": png(256, 256, { noise: true, animated: true }) }, "an animated PNG over 50,000 bytes but under 300,000 passes");
assert.ok(animated[0].animated && animated[0].bytes > STATIC_BYTES && animated[0].bytes <= ANIMATED_BYTES, JSON.stringify(animated[0]));
fails({ "too-wide.png": png(257, 128) }, /257x128 px/, "a 257x128 PNG");
fails({ "too-tall.png": png(200, 300) }, /200x300 px/, "a 200x300 PNG");
fails({ "big-webp.webp": webpX(300, 300) }, /300x300 px/, "a 300x300 WebP");
fails({ "heavy.png": png(128, 128, { noise: true }) }, /over the 50000 byte limit for static/, "a 128x128 static PNG of about 65 kB");
fails({ "heavy-moving.png": png(256, 256, { noise: true, animated: true, pad: 60_000 }) }, /over the 300000 byte limit for animated/, "an animated PNG over 300,000 bytes");
fails({ "Good_Trade.png": png(64, 64) }, /lowercase kebab-case/, "a name with capitals and an underscore");
fails({ "double--dash.png": png(64, 64) }, /lowercase kebab-case/, "a name with a double dash");
fails({ "moving.gif": Buffer.from("GIF89a") }, /lowercase kebab-case name ending \.png or \.webp/, "a GIF, which neither loader reads");
fails({ "fake.png": webpX(64, 64) }, /not a PNG/, "a WebP named .png");
fails({ "fake.webp": png(64, 64) }, /not a WebP/, "a PNG named .webp");
fails({ "cut-short.webp": webpX(64, 64).subarray(0, 29) }, /not a WebP|does not match/, "a truncated WebP");
const many = Object.fromEntries(Array.from({ length: MAX_STICKERS + 1 }, (_, i) => [`s${i}.png`, png(32, 32)]));
fails(many, /25 stickers, the tray holds at most 24/, "a 25th sticker");
passes(Object.fromEntries(Object.entries(many).slice(0, MAX_STICKERS)), "24 stickers pass");

const bad = folder({ "ok-one.png": png(96, 96), "huge.png": png(300, 300) });
const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), bad], { env: { ...process.env, STICKERS_PROVE_CHILD: "1" }, encoding: "utf8" });
assert.equal(run.status, 1, run.stdout + run.stderr);
assert.match(run.stderr, /FAIL huge\.png: 300x300 px/);
ok(`npm run stickers-prove -- <folder with a 300x300 PNG> exits ${run.status}: ${run.stderr.trim()}`);
const fine = spawnSync(process.execPath, [fileURLToPath(import.meta.url), folder({ "ok-one.png": png(96, 96), "ok-two.png": png(96, 96) })], { env: { ...process.env, STICKERS_PROVE_CHILD: "1" }, encoding: "utf8" });
assert.equal(fine.status, 0, fine.stdout + fine.stderr);
ok("npm run stickers-prove -- <folder with two 96x96 PNGs> exits 0");
console.log("stickers-prove: all checks passed");
