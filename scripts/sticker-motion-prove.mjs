// #1363: animated stickers play while on screen; with reduced motion they show their first frame only; the Sounds & stickers
// tray's copy stops after one loop. A host alone in the lobby opens the tray. `ben-10` is served as a two-frame APNG (red for
// 1000 ms, then blue for 1000 ms, so one loop is 2000 ms) for both the image and the fetch that reads its frames, so the check
// never depends on which art is on main. Every sticker that animates on main is checked too.
// - Reduced motion, at 430x932, 390x844, 375x812, 820x1180 and 844x390: every animated sticker in the tray is a still whose
//   pixels equal the browser's own decode of frame 0 (ImageDecoder), and that frame differs from a later one; static stickers
//   keep their file. A sent ben-10 is a red still in the seat bubble and the chat log line. No <img> ever loads an animated file.
// - Normal motion (390x844): the tray's ben-10 shows blue after its first second, then rests on its first frame after one
//   loop (2000 ms, within 600 ms), and stays there. The seat bubble and the chat log keep playing past one loop; turning
//   reduced motion on while the log is open makes its line a still.
// - The client's loop length (Sticker.tsx loopMs) equals ImageDecoder's frame durations for ben-10 and each animated sticker.
// Screenshots go to test-results/, or to $PROOF_SHOTS if set. Run: npm run sticker-motion-prove
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8138;
const SHOTS = process.env.PROOF_SHOTS ? path.resolve(process.env.PROOF_SHOTS) : fileURLToPath(new URL("../test-results/", import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results` },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const hostPort = await new Promise((resolve) =>
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  }),
);
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
});
const url = `http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`;
const errors = [];
const check = (ok, what) => {
  if (!ok) throw new Error(what);
  console.log(`ok ${what}`);
};

// A 64x64 APNG: frame 0 red, frame 1 blue, 1000 ms each, looping forever.
function apng() {
  const chunk = (kind, data) => {
    const body = Buffer.concat([Buffer.from(kind, "latin1"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const W = 64;
  const pixels = (rgb) => {
    const rows = Buffer.alloc((W * 4 + 1) * W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) rows.set([...rgb, 255], y * (W * 4 + 1) + 1 + x * 4);
    return deflateSync(rows);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(W, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(2, 0);
  const fctl = (seq) => {
    const b = Buffer.alloc(26);
    b.writeUInt32BE(seq, 0);
    b.writeUInt32BE(W, 4);
    b.writeUInt32BE(W, 8);
    b.writeUInt16BE(1000, 20);
    b.writeUInt16BE(1000, 22);
    return b;
  };
  const seq = Buffer.alloc(4);
  seq.writeUInt32BE(2);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("acTL", actl),
    chunk("fcTL", fctl(0)),
    chunk("IDAT", pixels([220, 30, 30])),
    chunk("fcTL", fctl(1)),
    chunk("fdAT", Buffer.concat([seq, pixels([30, 30, 220])])),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const TEST = "ben-10";
const TEST_LOOP = 2000;
const TEST_PNG = apng();

// In the page: every animated sticker by the browser's own decoder (frame count, loop as played, frame 0 pixels, whether a
// later frame differs), and the client's loopMs on the same bytes.
async function decodeAll() {
  const { EMOTES } = await import("/src/components/game/emotes.ts");
  const { loopMs } = await import("/src/components/game/Sticker.tsx");
  const out = {};
  for (const [id, src] of Object.entries(EMOTES)) {
    const blob = await (await fetch(src)).blob();
    const decoder = new ImageDecoder({ data: blob.stream(), type: blob.type });
    await decoder.tracks.ready;
    await decoder.completed;
    const count = decoder.tracks.selectedTrack.frameCount;
    if (count < 2) continue;
    let loop = 0;
    let first;
    let differs = false;
    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      const ms = image.duration / 1000;
      loop += ms <= 10 ? 100 : ms;
      const canvas = new OffscreenCanvas(image.displayWidth, image.displayHeight);
      const g = canvas.getContext("2d");
      g.drawImage(image, 0, 0);
      const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
      if (i === 0) first = data;
      else differs ||= data.some((v, k) => Math.abs(v - first[k]) > 8);
      image.close();
    }
    window.__frame0 = { ...window.__frame0, [id]: first };
    out[id] = { count, loop: Math.round(loop), client: loopMs(new Uint8Array(await blob.arrayBuffer())), differs };
  }
  return out;
}

// In the page: how far the pixels an <img> shows now are from the decoder's frame 0 (largest channel difference).
async function offFrame0([selector, id]) {
  const img = document.querySelector(selector);
  if (!img?.complete || !img.naturalWidth) return 255;
  const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
  const g = canvas.getContext("2d");
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
  const first = window.__frame0[id];
  if (!first || first.length !== data.length) return 255;
  let worst = 0;
  for (let k = 0; k < data.length; k++) worst = Math.max(worst, Math.abs(data[k] - first[k]));
  return worst;
}

async function lobby(viewport, name, calm) {
  const phone = viewport.width < 1000;
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion: calm ? "reduce" : "no-preference", ...(phone ? { hasTouch: true, isMobile: true } : {}) });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  // The image and the fetch that reads its frames; in dev the `?url` import of the same path is a JS module.
  await page.route(
    (u) => u.pathname.endsWith(`/emotes/${TEST}.webp`),
    (r) => (["image", "fetch"].includes(r.request().resourceType()) ? r.fulfill({ contentType: "image/png", body: TEST_PNG }) : r.continue()),
  );
  // Every src any <img> is given, with the time, so a reduced-motion run can show no animated file was ever drawn.
  await page.addInitScript(() => {
    window.__srcs = [];
    window.__stillAt = {};
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target;
        if (el.tagName !== "IMG") continue;
        if (r.attributeName === "src" && el.getAttribute("src")) window.__srcs.push({ src: el.getAttribute("src"), at: performance.now(), alt: el.alt });
        if (r.attributeName === "data-still" && el.hasAttribute("data-still")) (window.__stillAt[el.alt] ??= []).push(performance.now());
      }
      for (const r of records)
        for (const n of r.addedNodes)
          for (const el of n.querySelectorAll ? [n, ...n.querySelectorAll("img")] : [])
            if (el.tagName === "IMG" && el.getAttribute("src")) window.__srcs.push({ src: el.getAttribute("src"), at: performance.now(), alt: el.alt });
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "data-still"] });
  });
  await page.addInitScript((n) => localStorage.setItem("emberisle-name", n), name);
  await page.goto(url);
  await page.getByRole("button", { name: "Host a table" }).click();
  await page.getByTestId("table-code").waitFor();
  await page.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
  const tray = page.getByTestId("stickers");
  await tray.waitFor();
  return { ctx, page, tray };
}

const trayImg = (id) => `[data-testid="stickers"] button[aria-label="React ${id}"] img`;

// Reduced motion, five sizes.
let animated;
const SIZES = [
  { width: 430, height: 932 },
  { width: 390, height: 844 },
  { width: 375, height: 812 },
  { width: 820, height: 1180 },
  { width: 844, height: 390 },
];
for (const viewport of SIZES) {
  const size = `${viewport.width}x${viewport.height}`;
  const { ctx, page, tray } = await lobby(viewport, "Hana", true);
  const decoded = await page.evaluate(decodeAll);
  if (!animated) {
    animated = Object.keys(decoded);
    check(animated.includes(TEST), `${size}: the served ${TEST} decodes as ${decoded[TEST].count} frames, one loop ${decoded[TEST].loop} ms`);
    check(decoded[TEST].loop === TEST_LOOP, `${size}: ${TEST} loops in ${TEST_LOOP} ms by ImageDecoder`);
    for (const [id, d] of Object.entries(decoded)) {
      check(d.client === d.loop, `the client's loopMs reads ${id} as ${d.client} ms, ImageDecoder plays ${d.count} frames in ${d.loop} ms`);
      check(d.differs, `${id}: a later frame differs from frame 0, so a still is a real difference`);
    }
    console.log(`animated stickers: ${animated.join(", ")}`);
  }
  for (const id of animated) {
    const img = page.locator(trayImg(id));
    await img.scrollIntoViewIfNeeded();
    await page.waitForFunction((sel) => document.querySelector(sel)?.hasAttribute("data-still"), trayImg(id));
    await page.waitForFunction((sel) => { const i = document.querySelector(sel); return i?.complete && i.naturalWidth > 0; }, trayImg(id));
    const off = await page.evaluate(offFrame0, [trayImg(id), id]);
    check(off <= 2, `${size}: reduced motion, the tray's ${id} is a still of frame 0 (largest pixel difference ${off})`);
  }
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="stickers"] img')].every((i) => i.getAttribute("src")));
  const statics = await tray.locator("img").evaluateAll((els, moving) => els.filter((i) => !moving.includes(i.alt)).map((i) => ({ id: i.alt, still: i.hasAttribute("data-still"), src: i.getAttribute("src") ?? "" })), animated);
  check(statics.length > 0 && statics.every((s) => !s.still && !s.src.startsWith("data:")), `${size}: reduced motion, the ${statics.length} static stickers keep their own file`);
  await tray.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, `calm-tray-${size}.png`) });
  if (size === "390x844") {
    await tray.getByRole("button", { name: `React ${TEST}`, exact: true }).click();
    const bubble = `[data-testid="reaction"][data-emote="${TEST}"] img`;
    await page.waitForFunction((sel) => { const i = document.querySelector(sel); return i?.hasAttribute("data-still") && i.complete && i.naturalWidth > 0; }, bubble, { polling: "raf" });
    const offBubble = await page.evaluate(offFrame0, [bubble, TEST]);
    check(offBubble <= 2, `${size}: reduced motion, the seat bubble shows ${TEST} as a still of frame 0 (difference ${offBubble})`);
    await page.getByRole("tab", { name: "Chat", exact: true }).click();
    const line = `[data-testid="react-line"][data-emote="${TEST}"] img`;
    await page.waitForFunction((sel) => { const i = document.querySelector(sel); return i?.hasAttribute("data-still") && i.complete && i.naturalWidth > 0; }, line);
    const offLine = await page.evaluate(offFrame0, [line, TEST]);
    check(offLine <= 2, `${size}: reduced motion, the chat log line shows ${TEST} as a still of frame 0 (difference ${offLine})`);
  }
  const drawnFiles = await page.evaluate((moving) => window.__srcs.filter((s) => moving.includes(s.alt) && !s.src.startsWith("data:")).map((s) => s.src), animated);
  check(drawnFiles.length === 0, `${size}: reduced motion, no <img> was ever given an animated file${drawnFiles.length ? `: ${drawnFiles.join(", ")}` : ""}`);
  await ctx.close();
}

// Normal motion: the tray plays one loop and rests; the bubble and the log keep playing.
{
  const size = "390x844";
  const { ctx, page, tray } = await lobby({ width: 390, height: 844 }, "Hana", false);
  await page.evaluate(decodeAll);
  // Reading every file took a while and the tray may have rested meanwhile: open it afresh, which plays one loop again.
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  const mark = await page.evaluate(() => performance.now());
  await page.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
  const img = page.locator(trayImg(TEST));
  await img.scrollIntoViewIfNeeded();
  await page.waitForFunction((sel) => { const i = document.querySelector(sel); return i?.complete && i.naturalWidth > 0; }, trayImg(TEST));
  const start = await page.evaluate(([id, t]) => window.__srcs.find((s) => s.alt === id && s.at > t && !s.src.startsWith("data:"))?.at, [TEST, mark]);
  check(start !== undefined, `${size}: the reopened tray's ${TEST} first draws its animated file`);
  await page.evaluate(() => (window.__stillAt = {}));
  // Frame 1 (blue) shows during the loop's second second.
  await page.waitForFunction((t) => performance.now() > t + 1300, start);
  const mid = await img.screenshot();
  const playing = await page.evaluate((sel) => !document.querySelector(sel).hasAttribute("data-still"), trayImg(TEST));
  check(playing, `${size}: 1.3 s in, the tray's ${TEST} is still playing its file`);
  await page.waitForFunction((id) => window.__stillAt[id]?.length, TEST, { timeout: 5000 });
  const restedAfter = await page.evaluate(([id, t]) => Math.round(window.__stillAt[id][0] - t), [TEST, start]);
  check(restedAfter >= TEST_LOOP - 50 && restedAfter <= TEST_LOOP + 600, `${size}: the tray's ${TEST} rests ${restedAfter} ms after it first drew (one loop is ${TEST_LOOP} ms)`);
  await page.waitForFunction((sel) => { const i = document.querySelector(sel); return i?.complete && i.naturalWidth > 0 && i.src.startsWith("data:"); }, trayImg(TEST));
  const rest = await img.screenshot();
  const off = await page.evaluate(offFrame0, [trayImg(TEST), TEST]);
  check(off <= 2, `${size}: the tray's ${TEST} rests on frame 0 (difference ${off})`);
  check(!rest.equals(mid), `${size}: the resting picture differs from the one shown 1.3 s in, so the sticker really played`);
  await page.waitForTimeout(1200);
  check((await img.screenshot()).equals(rest), `${size}: 1.2 s later the tray's ${TEST} has not moved`);
  for (const id of animated.filter((x) => x !== TEST)) {
    await page.waitForFunction((sel) => document.querySelector(sel)?.hasAttribute("data-still"), trayImg(id), { timeout: 5000 });
    check(true, `${size}: the tray's ${id} rests after its loop`);
  }
  await tray.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, `rested-tray-${size}.png`) });

  await tray.getByRole("button", { name: `React ${TEST}`, exact: true }).click();
  const bubble = `[data-testid="reaction"][data-emote="${TEST}"] img`;
  await page.waitForFunction((sel) => { const i = document.querySelector(sel); return i?.complete && i.naturalWidth > 0; }, bubble, { polling: "raf" });
  const bubbleFile = await page.evaluate((sel) => { const i = document.querySelector(sel); return !i.hasAttribute("data-still") && !i.src.startsWith("data:"); }, bubble);
  check(bubbleFile, `${size}: the seat bubble plays ${TEST}'s file`);
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  const line = `[data-testid="react-line"][data-emote="${TEST}"] img`;
  await page.waitForSelector(line);
  await page.waitForTimeout(TEST_LOOP + 600);
  const linePlaying = await page.evaluate((sel) => { const i = document.querySelector(sel); return !i.hasAttribute("data-still") && !i.src.startsWith("data:"); }, line);
  check(linePlaying, `${size}: ${TEST_LOOP + 600} ms on, the chat log line still plays ${TEST}'s file (only the tray stops after one loop)`);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction((sel) => { const i = document.querySelector(sel); return i?.hasAttribute("data-still") && i.complete && i.naturalWidth > 0; }, line);
  const offLine = await page.evaluate(offFrame0, [line, TEST]);
  check(offLine <= 2, `${size}: turning reduced motion on makes the open chat log line a still of frame 0 (difference ${offLine})`);
  await ctx.close();
}

check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
await browser.close();
await vite.close();
console.log("sticker-motion-prove: all checks passed");
process.exit(0);
