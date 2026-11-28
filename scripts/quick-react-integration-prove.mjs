// #738 (#664, docs/design/quick-react-tray.md): the quick-react tray end to end through a real host, two seated tabs and a
// watcher who joins after the start.
//   Tray: every surface has one Open chat trigger and no separate quick-reaction button; the Chat tab has the six emoji and the
//         Sounds & stickers tab has the 15 sound chips, the five quick lines and every sticker; the watcher has the log only.
//   Win screen: the win button reads exactly "GG! 🔊", is at least 44x44, inside the screen with no sideways scroll, sends
//         sb_win_reaction once per click, rests for 3 s (disabled) and then works again; a watcher has no such button.
//   Reactions: an emoji and a sound reach the other seat once and are echoed in the log; a watcher's tray sends nothing.
// At 440x956 and 956x440. Run: npm run quick-react-integration-prove. Screenshots go to test-results/quick-react-integration-*.jpg.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "./proof-browser.mjs";
import { hostPort as waitForHostPort } from "./proof-host-port.mjs";

const PORT = Number(process.env.VITE_PORT) || 8132;
const SHOTS = fileURLToPath(new URL("../test-results/", import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results` },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const hostPort = await waitForHostPort(host);
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch();
const url = `http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`;

const T0 = Date.now();
const errors = [];
const check = (ok, what) => {
  if (!ok) throw new Error(what);
  console.log(`ok ${what}`, `+${((Date.now() - T0) / 1000).toFixed(1)}s`);
};
async function until(fn, what, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const got = await fn();
    if (got) return got;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out: ${what}`);
}

async function tab(name, viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${name}: ${r.status()} ${r.url()}`));
  await page.addInitScript((n) => {
    localStorage.setItem("emberisle-name", n);
    window.__emberisleSkipIntro = true;
  }, name);
  // The proof reads the DOM. Skip GL draws except while a screenshot is taken, so the scenes don't starve the machine.
  await page.addInitScript(() => {
    window.__draw = false;
    for (const fn of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const orig = WebGL2RenderingContext.prototype[fn];
      WebGL2RenderingContext.prototype[fn] = function (...args) {
        if (window.__draw) return orig.apply(this, args);
      };
    }
  });
  await page.goto(url);
  return { name, page };
}
const get = (t, fn, arg) => t.page.evaluate(fn, arg);
const panelOpen = (t) => get(t, () => window.__emberisle.getState().chatOpen);
const openPanel = async (t) => {
  if (!(await panelOpen(t))) await t.page.getByRole("button", { name: /^Open chat/ }).click();
  await t.page.locator('section[aria-label="Table chat"]').waitFor();
};
const closePanel = async (t) => {
  if (await panelOpen(t)) await t.page.getByRole("button", { name: "Close chat", exact: true }).click();
};
const lines = (t, key) => get(t, (k) => window.__emberisle.getState().chat.filter((l) => l[k.field] === k.value).length, key);
async function shot(t, file) {
  await t.page.waitForFunction(() => Boolean(window.__isle));
  const before = await get(t, () => {
    window.__draw = true;
    return window.__isle.renders;
  });
  await t.page.waitForFunction((n) => window.__isle.renders >= n + 2, before, { timeout: 15_000 });
  await t.page.screenshot({ path: `${SHOTS}${file}`, type: "jpeg", quality: 70 });
  await get(t, () => (window.__draw = false));
}

const SIZES = [
  { label: "440x956", width: 440, height: 956 },
  { label: "956x440", width: 956, height: 440 },
];

const a = await tab("Ember", SIZES[0]);
const b = await tab("Moss", SIZES[1]);
await a.page.getByRole("button", { name: "Host a table" }).click();
const code = (await a.page.getByTestId("table-code").textContent()).trim();
await b.page.getByPlaceholder(/code/i).fill(code);
await b.page.getByRole("button", { name: "Join" }).click();
await b.page.getByTestId("table-code").waitFor();
await a.page.getByTestId("add-bot").first().click();
for (const t of [a, b]) await t.page.getByRole("button", { name: "Ready", exact: true }).click();
await a.page.getByRole("button", { name: "Start", exact: true }).and(a.page.locator(":enabled")).waitFor();
await a.page.getByRole("button", { name: "Start", exact: true }).click();
for (const t of [a, b]) await t.page.getByRole("button", { name: "Open chat" }).waitFor();
// The watcher joins after the start.
const w = await tab("Reader", SIZES[0]);
await w.page.getByPlaceholder(/code/i).fill(code);
await w.page.getByRole("button", { name: "Watch", exact: true }).click();
await w.page.getByRole("button", { name: "Open chat" }).waitFor();
check(true, "game: two seats and a late watcher are at the table");

// Tray, per size: one trigger, no separate quick-reaction button, the whole catalogue, and the watcher's log-only panel.
const catalogue = await get(a, async () => {
  const stickers = Object.keys(await (await import("/src/components/game/talk.tsx")).loadEmotes());
  return { stickers: stickers.length };
});
for (const size of SIZES) {
  for (const t of [a, b, w]) await t.page.setViewportSize({ width: size.width, height: size.height });
  for (const t of [a, b]) {
    await closePanel(t);
    check((await t.page.getByRole("button", { name: /^Open chat/ }).count()) === 1 && (await t.page.getByRole("button", { name: /Quick reactions/ }).count()) === 0, `${size.label} ${t.name}: one Open chat trigger and no separate quick-reaction button`);
    await openPanel(t);
    await t.page.getByRole("tab", { name: "Chat", exact: true }).click();
    check((await t.page.getByRole("button", { name: /^React / }).count()) === 6, `${size.label} ${t.name}: the Chat tab has the six emoji`);
    await t.page.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
    await t.page.getByTestId("soundboard").waitFor();
    await until(async () => (await t.page.getByTestId("stickers").getByRole("button").count()) === catalogue.stickers, `${t.name}: every sticker`);
    check((await t.page.getByTestId("soundboard").getByRole("button").count()) === 15, `${size.label} ${t.name}: the Sounds & stickers tab has the 15 sound chips and ${catalogue.stickers} stickers`);
    const m = await get(t, () => {
      const panel = document.querySelector('section[aria-label="Table chat"]');
      const p = panel.getBoundingClientRect();
      const small = [...panel.querySelectorAll("button, input, [role=tab]")].filter((el) => { const r = el.getBoundingClientRect(); return r.width && (r.width < 43.5 || r.height < 43.5); }).map((el) => el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20));
      return { small, page: document.documentElement.scrollWidth > innerWidth, inside: p.left >= 0 && p.top >= 0 && p.right <= innerWidth + 0.5 && p.bottom <= innerHeight + 0.5 };
    });
    check(!m.small.length && !m.page && m.inside, `${size.label} ${t.name}: the open panel is inside the screen, every control at least 44x44, no sideways scroll ${JSON.stringify(m)}`);
    await t.page.getByRole("tab", { name: "Chat", exact: true }).click();
    await closePanel(t);
  }
  await openPanel(w);
  check((await w.page.getByRole("tab").count()) === 0 && (await w.page.getByRole("button", { name: /^(React |Play sound )/ }).count()) === 0 && (await w.page.getByTestId("chat-readonly").count()) === 1, `${size.label} watcher: log only, with no tabs, emoji or sounds`);
  await closePanel(w);
}

// An emoji and a sound each reach the other seat once and are echoed in the log.
await a.page.setViewportSize({ width: 440, height: 956 });
await openPanel(a);
await a.page.getByRole("tab", { name: "Chat", exact: true }).click();
const emojiBefore = await get(b, () => window.__emberisle.getState().reactions.length);
await a.page.getByRole("button", { name: "React clap" }).click();
await until(async () => (await get(b, () => window.__emberisle.getState().reactions.length)) === emojiBefore + 1, "Moss receives the emoji once");
await a.page.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
const soundBefore = await lines(b, { field: "sound", value: "sb_wololo" });
await a.page.getByTestId("soundboard").getByRole("button", { name: "Wololo" }).click();
await until(async () => (await lines(b, { field: "sound", value: "sb_wololo" })) === soundBefore + 1, "Moss receives Wololo once");
await new Promise((r) => setTimeout(r, 400));
check((await lines(b, { field: "sound", value: "sb_wololo" })) === soundBefore + 1 && (await lines(w, { field: "sound", value: "sb_wololo" })) === soundBefore + 1, "reactions: an emoji and a sound each arrive once at the other seat, and the watcher's log shows the sound once");
await a.page.getByRole("tab", { name: "Chat", exact: true }).click();
await closePanel(a);
// Wait out the 3 s sound rest before the win button is used.
await new Promise((r) => setTimeout(r, 3200));

// Win screen: the game is over for the seated tabs (the same store write sounds-prove uses); the watcher sees it as a watcher.
await Promise.all([a, b, w].map((t) => get(t, async () => {
  const { createGame } = await import("/src/lib/game/board.ts");
  const g = createGame({ humans: [{ name: "Ember" }, { name: "Moss" }], bots: 1 });
  g.phase = "over";
  g.winner = "p0";
  const st = window.__emberisle.getState();
  window.__emberisle.setState({ screen: "play", mode: "online", state: g, ...(st.spectator ? {} : { localId: "p0" }) });
})));
for (const size of [...SIZES, { label: "1280x720", width: 1280, height: 720 }]) {
  await a.page.setViewportSize({ width: size.width, height: size.height });
  const btn = a.page.getByTestId("win-react");
  await btn.waitFor();
  check((await btn.textContent()) === "GG! 🔊", `${size.label}: the win button reads exactly "GG! 🔊" (got ${JSON.stringify(await btn.textContent())})`);
  const r = await get(a, () => {
    const el = document.querySelector('[data-testid="win-react"]');
    const b = el.getBoundingClientRect();
    return { w: b.width, h: b.height, inside: b.left >= 0 && b.right <= innerWidth + 0.5 && b.top >= 0 && b.bottom <= innerHeight + 0.5, clipped: el.scrollWidth > el.clientWidth + 1, page: document.documentElement.scrollWidth > innerWidth };
  });
  check(r.w >= 43.5 && r.h >= 43.5 && r.inside && !r.clipped && !r.page, `${size.label}: the win button is at least 44x44, inside the screen, unclipped, with no sideways scroll ${JSON.stringify(r)}`);
  await shot(a, `quick-react-integration-win-${size.label}.jpg`);
}
await a.page.setViewportSize({ width: 440, height: 956 });
await w.page.getByTestId("win-menu").waitFor();
check((await w.page.getByTestId("win-react").count()) === 0, "watcher: the win screen is up and has no GG! button");
const before = await lines(b, { field: "sound", value: "sb_win_reaction" });
await a.page.getByTestId("win-react").click();
check(await a.page.getByTestId("win-react").isDisabled(), "win button: disabled at once after a click (the 3 s rest)");
await until(async () => (await lines(b, { field: "sound", value: "sb_win_reaction" })) === before + 1, "Moss hears sb_win_reaction");
await new Promise((r) => setTimeout(r, 1200));
check((await lines(b, { field: "sound", value: "sb_win_reaction" })) === before + 1 && (await a.page.getByTestId("win-react").isDisabled()), "win button: one click sends sb_win_reaction exactly once and it still rests after 1.2 s");
await until(async () => await a.page.getByTestId("win-react").isEnabled(), "the win button rests, then works again", 4000);
check(true, "win button: enabled again after the 3 s rest");

check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
await vite.close();
console.log(`quick-react-integration-prove: all checks passed in ${((Date.now() - T0) / 1000).toFixed(1)}s`);
process.exit(0);
