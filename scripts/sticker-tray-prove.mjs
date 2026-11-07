// #663: non-square stickers (owner decision on #663, 2026-11-06: up to 256x256, any aspect) show in the Sounds & stickers tray
// without distortion or clipping. A host alone in the lobby opens the tray at 390x844, 844x390 (phone, touch) and 1280x720,
// at deviceScaleFactor 2. For every sticker the image has loaded, is drawn with object-fit contain in a square box, and its
// drawn picture (the natural aspect scaled to fit) lies wholly inside its button, the tray's scroll box and the viewport.
// A sent non-square sticker shows the same way in the seat bubble and in the chat log line. Then two stickers are served as
// extreme 256x64 and 64x256 pictures, so the check never depends on which art is on main.
// Screenshots go to test-results/, or to $PROOF_SHOTS if set. Run: npm run sticker-tray-prove
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8137;
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

// The picture an <img> really draws: its natural size scaled by object-fit contain and centred in its content box.
// Returns that rect, the box, and whether it lies inside the button, every clipping ancestor and the viewport.
function drawn(img) {
  const style = getComputedStyle(img);
  const box = img.getBoundingClientRect();
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const scale = Math.min(box.width / nw, box.height / nh);
  const w = nw * scale;
  const h = nh * scale;
  const pic = { left: box.left + (box.width - w) / 2, top: box.top + (box.height - h) / 2, right: box.left + (box.width + w) / 2, bottom: box.top + (box.height + h) / 2 };
  const inside = (r) => pic.left >= r.left - 0.5 && pic.right <= r.right + 0.5 && pic.top >= r.top - 0.5 && pic.bottom <= r.bottom + 0.5;
  const clippedBy = [];
  for (let el = img.parentElement; el; el = el.parentElement) {
    const s = getComputedStyle(el);
    if (/(hidden|auto|scroll|clip)/.test(s.overflowX + s.overflowY) && !inside(el.getBoundingClientRect())) clippedBy.push(el.dataset.testid || el.tagName);
  }
  const button = img.closest("button");
  return {
    loaded: img.complete && nw > 0 && nh > 0,
    fit: style.objectFit,
    natural: `${nw}x${nh}`,
    square: Math.abs(box.width - box.height) < 0.5,
    box: `${box.width.toFixed(0)}x${box.height.toFixed(0)}`,
    pic: `${w.toFixed(1)}x${h.toFixed(1)}`,
    aspectKept: Math.abs(w / h - nw / nh) < 0.01,
    inButton: button ? inside(button.getBoundingClientRect()) : true,
    inViewport: inside({ left: 0, top: 0, right: innerWidth, bottom: innerHeight }),
    clippedBy,
  };
}
const whole = (m) => m.loaded && m.fit === "contain" && m.square && m.aspectKept && m.inButton && m.inViewport && m.clippedBy.length === 0;
const describe = (m) => `${m.natural} drawn ${m.pic} in a ${m.box} box${m.clippedBy.length ? `, clipped by ${m.clippedBy.join(", ")}` : ""}`;

async function lobby(viewport, name, serve) {
  const phone = viewport.width < 1000;
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, ...(phone ? { hasTouch: true, isMobile: true } : {}) });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  // Only the image request itself: in dev the `?url` import of the same path is a JS module.
  if (serve) for (const [id, svg] of Object.entries(serve)) await page.route((u) => u.pathname.endsWith(`/emotes/${id}.webp`), (r) => (r.request().resourceType() === "image" ? r.fulfill({ contentType: "image/svg+xml", body: svg }) : r.continue()));
  await page.addInitScript((n) => localStorage.setItem("emberisle-name", n), name);
  await page.addInitScript(`window.__drawn = ${drawn}`);
  await page.goto(url);
  await page.getByRole("button", { name: "Host a table" }).click();
  await page.getByTestId("table-code").waitFor();
  await page.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
  const tray = page.getByTestId("stickers");
  await tray.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="stickers"] img')].every((i) => i.complete && i.naturalWidth > 0));
  return { ctx, page, tray };
}

// Every sticker in the tray, each scrolled into view first; returns the non-square ids.
async function trayCheck(page, tray, size) {
  const ids = await tray.getByRole("button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label").replace(/^React /, "")));
  check(ids.length > 0, `${size}: the tray shows ${ids.length} stickers`);
  const nonSquare = [];
  for (const id of ids) {
    const button = tray.getByRole("button", { name: `React ${id}`, exact: true });
    await button.scrollIntoViewIfNeeded();
    const m = await button.locator("img").evaluate(drawn);
    const [nw, nh] = m.natural.split("x").map(Number);
    if (nw !== nh) nonSquare.push(id);
    check(whole(m), `${size}: sticker ${id} ${describe(m)}, object-fit ${m.fit}, whole inside its button, the tray and the screen`);
  }
  return nonSquare;
}

const SIZES = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 720 },
];
for (const viewport of SIZES) {
  const size = `${viewport.width}x${viewport.height}`;
  const { ctx, page, tray } = await lobby(viewport, "Hana");
  const nonSquare = await trayCheck(page, tray, size);
  console.log(`${size}: non-square stickers on main: ${nonSquare.join(", ") || "none"}`);
  await tray.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, `tray-${size}.png`) });
  // A sent non-square sticker in the seat bubble and the chat log line.
  if (nonSquare.length) {
    const id = nonSquare[0];
    await tray.getByRole("button", { name: `React ${id}`, exact: true }).click();
    // The bubble lives 2 s, so measure it in the page as soon as its image has loaded.
    const b = await (
      await page.waitForFunction(
        (sel) => {
          const img = document.querySelector(sel);
          return img && img.isConnected && img.complete && img.naturalWidth > 0 && window.__drawn(img);
        },
        `[data-testid="reaction"][data-emote="${id}"] img`,
        { polling: "raf" },
      )
    ).jsonValue();
    check(b.loaded && b.fit === "contain" && b.square && b.aspectKept && b.clippedBy.length === 0, `${size}: the seat bubble shows ${id} ${describe(b)}, object-fit ${b.fit}`);
    await page.screenshot({ path: path.join(SHOTS, `bubble-${size}.png`) });
    await page.getByRole("tab", { name: "Chat", exact: true }).click();
    const line = page.locator(`[data-testid="react-line"][data-emote="${id}"] img`).last();
    await line.waitFor();
    await line.scrollIntoViewIfNeeded();
    const l = await line.evaluate(drawn);
    check(l.loaded && l.fit === "contain" && l.square && l.aspectKept && l.inViewport && l.clippedBy.length === 0, `${size}: the chat log line shows ${id} ${describe(l)}, object-fit ${l.fit}`);
  }
  await ctx.close();
}

// Extreme aspects, whatever art is on main: ben-10 is served as 256x64 and side-eye as 64x256.
const svg = (w, h, fill) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2}" fill="#fff"/></svg>`;
for (const viewport of SIZES) {
  const size = `${viewport.width}x${viewport.height}`;
  const { ctx, page, tray } = await lobby(viewport, "Hana", { "ben-10": svg(256, 64, "#d9480f"), "side-eye": svg(64, 256, "#1971c2") });
  for (const [id, natural] of [["ben-10", "256x64"], ["side-eye", "64x256"]]) {
    const button = tray.getByRole("button", { name: `React ${id}`, exact: true });
    await button.scrollIntoViewIfNeeded();
    const m = await button.locator("img").evaluate(drawn);
    check(m.natural === natural && whole(m), `${size}: a ${natural} sticker (${id} served as a test picture) ${describe(m)}, object-fit ${m.fit}, whole inside its button`);
  }
  await tray.getByRole("button", { name: "React ben-10", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, `tray-extreme-${size}.png`) });
  await ctx.close();
}

check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
await browser.close();
await vite.close();
console.log("sticker-tray-prove: all checks passed");
process.exit(0);
