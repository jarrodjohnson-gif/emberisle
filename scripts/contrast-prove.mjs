// #381: UI text meets WCAG 1.4.3 (4.5:1). Reads computed colours of the title's Play (primary), Host a table and Join (secondary)
// buttons, the quiet row (Four seats, one table, How to play; #454) and the 12 px "3 bots, no network" line, and checks white on the `sea-ink` and `accent-ink` fills that Start,
// End turn and the 7 use (#444 took them off the title).
// #424: text chips over the island, sampled from screenshots. With the chip's text made transparent, its box (inside the
// border and in from the rounded corners) is screenshotted; the computed text colour is measured against the mean and the darkest 5 % of those background pixels (both >= 4.5:1).
// Chips: another seat's turn banner over the setup board (hotseat) at 1280x720 and 390x844, your own turn banner (versus the
// isle), and the log line at 1280x720. Worst case, computed: the banner's and the log line's text against the glass token
// composited over black (the darkest board the blur can show).
// Run: npm run contrast-prove
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8093;
const MIN = 4.5;
const lum = ([r, g, b]) => {
  const [R, G, B] = [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "Join", exact: true }).waitFor();
  // Computed colours can be oklch or color-mix, so resolve each to sRGB through a canvas pixel.
  const read = await page.evaluate(() => {
    const px = (css) => {
      const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      c.fillStyle = "#000";
      c.fillStyle = css;
      c.fillRect(0, 0, 1, 1);
      return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const btn = (name) => {
      const el = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === name);
      const s = getComputedStyle(el);
      return { fg: px(s.color), bg: px(s.backgroundColor) };
    };
    const caption = getComputedStyle([...document.querySelectorAll("p")].find((p) => p.textContent === "3 bots, no network"));
    const root = getComputedStyle(document.documentElement);
    return {
      play: btn("Play"),
      join: btn("Join"),
      host: btn("Host a table"),
      quietSeats: btn("Four seats, one table"),
      quietHow: btn("How to play"),
      caption: px(caption.color),
      seaInk: px(root.getPropertyValue("--color-sea-ink").trim()),
      surface: px(root.getPropertyValue("--color-surface").trim()),
      bg: px(root.getPropertyValue("--color-bg").trim()),
      accentInk: px(root.getPropertyValue("--color-accent-ink").trim()),
      accent: px(root.getPropertyValue("--color-accent").trim()),
    };
  });
  // The error line only appears after a failed join, so take its colour from the token the source names.
  const errorInk = /text-accent-ink/.test(readFileSync("src/components/game/EmberisleApp.tsx", "utf8")) ? read.accentInk : read.accent;
  await page.screenshot({ path: "test-results/contrast-prove.png" });
  const checks = [
    ["Play (primary) on fill", ratio(read.play.fg, read.play.bg)],
    ["Join (secondary) on fill", ratio(read.join.fg, read.join.bg)],
    ["Host a table (secondary) on fill", ratio(read.host.fg, read.host.bg)],
    ["Four seats, one table (quiet) on surface", ratio(read.quietSeats.fg, read.surface)],
    ["Four seats, one table (quiet) on bg", ratio(read.quietSeats.fg, read.bg)],
    ["How to play (quiet) on surface", ratio(read.quietHow.fg, read.surface)],
    ["How to play (quiet) on bg", ratio(read.quietHow.fg, read.bg)],
    ["white on sea-ink (Start, End turn)", ratio([255, 255, 255], read.seaInk)],
    ["white on accent-ink", ratio([255, 255, 255], read.accentInk)],
    ["caption 12 px on surface", ratio(read.caption, read.surface)],
    ["caption 12 px on bg", ratio(read.caption, read.bg)],
    ["error line 14 px on surface", ratio(errorInk, read.surface)],
    ["error line 14 px on bg", ratio(errorInk, read.bg)],
  ];
  const bad = [];
  for (const [name, r] of checks) {
    console.log(`${r.toFixed(2)}:1  ${name}`);
    if (r < MIN) bad.push(`${name} is ${r.toFixed(2)}:1`);
  }
  // The source must use the ink tokens where the error line and eyebrows are drawn.
  const app = readFileSync("src/components/game/EmberisleApp.tsx", "utf8");
  if (/text-accent"/.test(app)) bad.push("EmberisleApp.tsx still uses text-accent for text");
  if (/text-sea"/.test(app)) bad.push("EmberisleApp.tsx still uses text-sea for text");

  // #424: resolve the chip's text colour, hide the text, screenshot the box inside its border, and decode it in the page.
  const sample = async (pg, testid, label) => {
    const el = pg.getByTestId(testid);
    await el.waitFor();
    const info = await el.evaluate(async (node) => {
      await Promise.all(node.getAnimations({ subtree: true }).map((a) => a.finished));
      const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      c.fillStyle = getComputedStyle(node).color;
      c.fillRect(0, 0, 1, 1);
      const fg = [...c.getImageData(0, 0, 1, 1).data].slice(0, 3);
      node.style.setProperty("color", "transparent", "important");
      for (const d of node.querySelectorAll("*")) d.style.setProperty("color", "transparent", "important");
      const s = getComputedStyle(node);
      const r = node.getBoundingClientRect();
      // Inside the border, and in from the rounded corners, where the bare board shows past the chip.
      const radius = parseFloat(s.borderTopLeftRadius) || 0;
      const [t, rt, b, l] = ["Top", "Right", "Bottom", "Left"].map((k, i) => parseFloat(s[`border${k}Width`]) + (i % 2 ? radius : 2));
      return { fg, text: node.textContent, clip: { x: r.left + l, y: r.top + t, width: r.width - l - rt, height: r.height - t - b } };
    });
    await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const png = (await pg.screenshot({ clip: info.clip })).toString("base64");
    const lums = await pg.evaluate(async (png) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const out = [];
      for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
      return out;
    }, png);
    await el.evaluate((node) => {
      node.style.removeProperty("color");
      for (const d of node.querySelectorAll("*")) d.style.removeProperty("color");
    });
    const L = lums.map(lum).sort((a, b) => a - b);
    const mean = L.reduce((a, b) => a + b, 0) / L.length;
    const p5 = L[Math.floor(L.length * 0.05)];
    const fgL = lum(info.fg);
    const r = (bgL) => (Math.max(fgL, bgL) + 0.05) / (Math.min(fgL, bgL) + 0.05);
    const out = [[`${label}: text on mean background`, r(mean)], [`${label}: text on darkest 5 % of background`, r(p5)]];
    console.log(`  ${label}: "${info.text}" text rgb(${info.fg}) over ${L.length} px`);
    return out;
  };
  const sampled = [];
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const tag = `${viewport.width}x${viewport.height}`;
    const pg = await browser.newPage({ viewport });
    pg.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    pg.on("pageerror", (e) => errors.push(String(e)));
    await pg.goto(`http://127.0.0.1:${PORT}/`);
    await pg.getByRole("button", { name: "Join", exact: true }).waitFor();
    // Hotseat names every seat, so the banner is another seat's: roll off, then the first seat places on the setup board.
    await pg.evaluate(() => {
      const g = window.__emberisle.getState();
      g.startHotseat(4);
      while (window.__emberisle.getState().state.phase === "rollOff") window.__emberisle.getState().dispatch({ type: "roll" });
    });
    await pg.waitForFunction(() => window.__isle && window.__emberisle.getState().state.phase === "setupSettle");
    sampled.push(...(await sample(pg, "turn-banner", `${tag} another seat's turn banner`)));
    if (viewport.width >= 640) {
      sampled.push(...(await sample(pg, "log-line", `${tag} log line`)));
      const worst = await pg.evaluate(() => {
        const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
        const px = (css, under) => {
          c.fillStyle = under;
          c.fillRect(0, 0, 1, 1);
          c.fillStyle = css;
          c.fillRect(0, 0, 1, 1);
          return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        const glass = px(getComputedStyle(document.documentElement).getPropertyValue("--color-glass").trim(), "#000");
        const ink = (id) => px(getComputedStyle(document.querySelector(`[data-testid="${id}"]`)).color, "#fff");
        return { glass, banner: ink("turn-banner"), log: ink("log-line") };
      });
      console.log(`  glass over black rgb(${worst.glass}); banner ink rgb(${worst.banner}), log ink rgb(${worst.log})`);
      sampled.push([`banner text on glass over black`, ratio(worst.banner, worst.glass)], [`log line text on glass over black`, ratio(worst.log, worst.glass)]);
    }
    // Versus the isle: the human rolls off when up, then waits on its own first corner (the bots act on the app's timer).
    await pg.evaluate(() => window.__emberisle.getState().goTitle());
    await pg.getByRole("button", { name: "Play", exact: true }).click();
    await pg.waitForFunction(() => {
      const s = window.__emberisle.getState();
      if (s.state?.phase === "rollOff" && s.state.current === s.localId) s.dispatch({ type: "roll" });
      return s.state?.phase === "setupSettle" && s.state.current === s.localId;
    }, null, { polling: 100, timeout: 60_000 });
    sampled.push(...(await sample(pg, "turn-banner", `${tag} your turn banner`)));
    await pg.screenshot({ path: `test-results/contrast-prove-${tag}.png` });
    await pg.close();
  }
  for (const [name, r] of sampled) {
    console.log(`${r.toFixed(2)}:1  ${name}`);
    if (r < MIN) bad.push(`${name} is ${r.toFixed(2)}:1`);
  }
  assert.deepEqual(bad, [], `below ${MIN}:1`);
  assert.deepEqual(errors, [], "console errors");
  console.log("contrast-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
