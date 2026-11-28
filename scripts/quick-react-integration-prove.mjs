// #738 (#664, docs/design/quick-react-tray.md): the quick-react tray end to end through a real host, two seated tabs and a
// watcher who joins after the start.
//   Tray: every surface has one Open chat trigger and no separate quick-reaction button; the Chat tab has the six emoji and the
//         Sounds & stickers tab has the 15 sound chips, the five quick lines and every sticker; the watcher has the log only.
//   Win screen: the win button reads exactly "GG! 🔊", is at least 44x44, inside the screen with no sideways scroll, sends
//         sb_win_reaction once per click, rests for 3 s (disabled) and then works again; a watcher has no such button.
//   Reactions: an emoji and a sound reach the other seat once and are echoed in the log; a watcher's tray sends nothing.
//   Stress: 320 px width; enlarged text (root font size 150%, and 200% at 440 px); a 24-sticker fixture; a 60-character sound label; rotation with the
//         panel open; camera re-measure with the panel open (the island hole, `__isle.insets()`, does not move); IME and typing
//         are excluded from the 1-6 keys, which still send with the focus off a field.
// At 440x956 and 956x440. Run: npm run quick-react-integration-prove. Screenshots go to test-results/quick-react-integration-*.jpg.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readdirSync } from "node:fs";
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

async function tab(name, viewport, stickerFixture = 0) {
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
  if (stickerFixture) {
    // A fixture, not a catalogue change: the same module with N sticker ids over the real images. Its stickers are never sent.
    await page.route((u) => /\/src\/components\/game\/emotes\.ts(\?.*)?$/.test(u.pathname + u.search), (route) => route.fulfill({
      contentType: "text/javascript",
      body: `const files = ${JSON.stringify(["banana-guy", "ben-10", "daffy-shock", "dark-smile", "glasses-glance", "goggles-guy", "leo-laugh", "memoji-scheme", "mike-sully", "monkey-pet", "old-grump", "shrek-smirk", "side-eye", "sponge-thumbs", "wide-eyes"])};
export const EMOTES = Object.fromEntries(Array.from({ length: ${stickerFixture} }, (_, i) => ["fixture-" + String(i + 1).padStart(2, "0"), "/src/assets/emotes/" + files[i % files.length] + ".webp"]));`,
    }));
  }
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

const a = await tab("Ember", SIZES[0], 24);
const b = await tab("Moss", SIZES[1]);
await a.page.getByRole("button", { name: "Host a table" }).click();
const code = (await a.page.getByTestId("table-code").textContent()).trim();
await b.page.getByPlaceholder(/code/i).fill(code);
await b.page.getByRole("button", { name: "Join" }).click();
await b.page.getByTestId("table-code").waitFor();
await a.page.getByTestId("add-bot").first().click();

// #738 (the rest): the lobby panel, with the table not yet ready and the lobby scrolled to its bottom.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SOUND_LABELS = ["Fah", "Wololo", "GG!", "Airhorn", "Quit touchin' me", "Wood please", "Plump sheep", "Nice sheep", "Sheep please", "Grain please", "Brick please", "Perfect", "Real badman", "Gong", "Bong"];
const EMOJI_LABELS = ["angry", "happy", "clap", "laugh", "fire", "sheep"];
const REPO_STICKERS = readdirSync(new URL("../src/assets/emotes/", import.meta.url)).map((f) => f.replace(/\.\w+$/, "")).sort();
const readyOf = (t) => get(t, () => window.__emberisle.getState().seats.map((s) => `${s.id}:${s.ready}`).join());
const plainOf = (t) => get(t, () => window.__emberisle.getState().chat.filter((l) => !l.sound).length);
const readyBefore = await readyOf(b);
const plainBefore = await plainOf(b);
const lobbyEmoji = await get(b, () => window.__emberisle.getState().reactions.length);
const lobbySound = await lines(b, { field: "sound", value: "sb_airhorn" });
for (const t of [a, b]) {
  const panel = t.page.getByTestId("lobby-chat");
  await panel.getByRole("tab", { name: "Chat", exact: true }).click();
  check((await panel.getByRole("button", { name: /^React / }).count()) === 6, `lobby ${t.name}: the Chat tab has the six emoji`);
}
await a.page.getByTestId("lobby-chat").getByRole("button", { name: "React clap" }).click();
await until(async () => (await get(b, () => window.__emberisle.getState().reactions.length)) > lobbyEmoji, "Moss receives the lobby emoji");
await a.page.getByTestId("lobby-chat").getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
await a.page.getByTestId("lobby-chat").getByRole("button", { name: "Play sound Airhorn" }).click();
await until(async () => (await lines(b, { field: "sound", value: "sb_airhorn" })) === lobbySound + 1, "Moss receives the lobby Airhorn");
check((await readyOf(b)) === readyBefore && (await readyOf(a)) === readyBefore && (await plainOf(b)) === plainBefore, `lobby: an emoji and a sound change no seat's readiness and add no chat line of text ${readyBefore}`);
for (const t of [a, b]) {
  const panel = t.page.getByTestId("lobby-chat");
  await panel.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
  await until(async () => (await t.page.getByTestId("stickers").getByRole("button").count()) === (t === a ? 24 : 15), `${t.name}: lobby stickers`);
  const m = await get(t, () => {
    const scroller = document.querySelector('[data-testid="lobby-card"] > div');
    scroller.scrollTop = scroller.scrollHeight;
    const scrolled = scroller.scrollTop;
    const box = document.querySelector('[data-testid="lobby-chat"]');
    const card = document.querySelector('[data-testid="lobby-card"]').getBoundingClientRect();
    const small = [];
    const outside = [];
    for (const el of box.querySelectorAll("button, input, [role=tab]")) {
      el.scrollIntoView({ block: "nearest" });
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const what = el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20);
      if (r.width < 43.5 || r.height < 43.5) small.push(`${what} ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (r.left < card.left - 0.5 || r.right > card.right + 0.5 || r.top < -0.5 || r.bottom > innerHeight + 0.5) outside.push(what);
    }
    return { scrolled: scrolled > 0, small, outside, sideways: box.scrollWidth > box.clientWidth + 1, page: document.documentElement.scrollWidth > innerWidth };
  });
  check(m.scrolled && !m.small.length && !m.outside.length && !m.sideways && !m.page, `lobby ${t.name}: scrolled to the bottom, every panel control is at least 44x44, reachable inside the card and the screen, no sideways scroll ${JSON.stringify(m)}`);
  await get(t, () => { document.querySelector('[data-testid="lobby-card"] > div').scrollTop = 0; });
}
for (const t of [a, b]) await t.page.getByRole("button", { name: "Ready", exact: true }).click();
await a.page.getByRole("button", { name: "Start", exact: true }).and(a.page.locator(":enabled")).waitFor();
await a.page.getByRole("button", { name: "Start", exact: true }).click();
for (const t of [a, b]) await t.page.getByRole("button", { name: "Open chat" }).waitFor();
// Start transition: the lobby's panel is remounted as the game's. The remembered tab carries over and the panel starts closed.
for (const t of [a, b]) {
  check(!(await panelOpen(t)), `start: ${t.name}'s game panel starts closed`);
  await openPanel(t);
  check((await t.page.getByRole("tab", { name: "Sounds & stickers", exact: true, selected: true }).count()) === 1, `start: ${t.name}'s panel opens on the tab the lobby left (Sounds & stickers)`);
  await closePanel(t);
}
// The watcher joins after the start.
const w = await tab("Reader", SIZES[0]);
await w.page.getByPlaceholder(/code/i).fill(code);
await w.page.getByRole("button", { name: "Watch", exact: true }).click();
await w.page.getByRole("button", { name: "Open chat" }).waitFor();
check(true, "game: two seats and a late watcher are at the table");

// Tray, per size: one trigger, no separate quick-reaction button, the whole catalogue, and the watcher's log-only panel.
const catalogueOf = (t) => get(t, async () => ({ stickers: Object.keys(await (await import("/src/components/game/talk.tsx")).loadEmotes()).length }));
const catalogues = { Ember: await catalogueOf(a), Moss: await catalogueOf(b) };
check(catalogues.Ember.stickers === 24 && catalogues.Moss.stickers === 15, `catalogue: Moss has the real 15 stickers, Ember the 24-sticker fixture ${JSON.stringify(catalogues)}`);
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
    await until(async () => (await t.page.getByTestId("stickers").getByRole("button").count()) === catalogues[t.name].stickers, `${t.name}: every sticker`);
    check((await t.page.getByTestId("soundboard").getByRole("button").count()) === 15, `${size.label} ${t.name}: the Sounds & stickers tab has the 15 sound chips and ${catalogues[t.name].stickers} stickers`);
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

// Stress: the open panel, both tabs, must stay whole, reachable and unclipped under the conditions the design names.
async function whole(t, label) {
  for (const name of ["Chat", "Sounds & stickers"]) {
    await openPanel(t);
    await t.page.getByRole("tab", { name, exact: true }).click();
    if (name === "Sounds & stickers") await t.page.getByTestId("soundboard").waitFor();
    const m = await get(t, () => {
      const panel = document.querySelector('section[aria-label="Table chat"]');
      const p = panel.getBoundingClientRect();
      const small = [];
      const unreachable = [];
      const outside = [];
      for (const el of panel.querySelectorAll("button, input, [role=tab]")) {
        el.scrollIntoView({ block: "nearest" });
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        const what = el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20) || el.id;
        if (r.width < 43.5 || r.height < 43.5) small.push(`${what} ${Math.round(r.width)}x${Math.round(r.height)}`);
        if (r.left < p.left - 0.5 || r.right > p.right + 0.5) outside.push(what);
        if (r.top < p.top - 0.5 || r.bottom > p.bottom + 0.5 || r.top < -0.5 || r.bottom > innerHeight + 0.5) unreachable.push(what);
      }
      const sideways = [...panel.querySelectorAll("*")].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible" && getComputedStyle(el).textOverflow !== "ellipsis").map((el) => el.dataset.testid || el.tagName);
      return { small, outside, unreachable, sideways, page: document.documentElement.scrollWidth > innerWidth, inside: p.left >= -0.5 && p.top >= -0.5 && p.right <= innerWidth + 0.5 && p.bottom <= innerHeight + 0.5 };
    });
    check(!m.small.length && !m.outside.length && !m.unreachable.length && !m.sideways.length && !m.page && m.inside, `${label}, ${name} tab: every control at least 44x44, reachable and inside the panel, nothing clipped, no sideways scroll ${JSON.stringify(m)}`);
  }
  await t.page.getByRole("tab", { name: "Chat", exact: true }).click();
}

// 320 px, 24 stickers (Ember carries the fixture), phone sheet.
await a.page.setViewportSize({ width: 320, height: 640 });
await openPanel(a);
await a.page.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
await until(async () => (await a.page.getByTestId("stickers").getByRole("button").count()) === 24, "Ember shows the 24 fixture stickers");
check(true, "fixture: Ember's Sounds & stickers tab shows 24 stickers");
await whole(a, "320x640, 24 stickers");
await whole(b, "956x440 (real catalogue)");
await b.page.setViewportSize({ width: 320, height: 640 });
await whole(b, "320x640");
for (const size of SIZES) {
  await a.page.setViewportSize({ width: size.width, height: size.height });
  await whole(a, `${size.label}, 24 stickers`);
}

// Enlarged text: the root font size (the browser's text-size setting scales rem the same way). 440x956 and 956x440 at 150%,
// 320x640 at 150%, and 440x956 at 200%.
for (const size of [{ label: "440x956", width: 440, height: 956, pct: "150" }, { label: "956x440", width: 956, height: 440, pct: "150" }, { label: "320x640", width: 320, height: 640, pct: "150" }, { label: "440x956", width: 440, height: 956, pct: "200" }]) {
  await a.page.setViewportSize({ width: size.width, height: size.height });
  await get(a, (pct) => { document.documentElement.style.fontSize = pct + "%"; }, size.pct);
  await whole(a, `${size.label}, text at ${size.pct}%, 24 stickers`);
  await get(a, () => { document.documentElement.style.fontSize = ""; });
}

// A long sound label wraps inside its chip: no sideways scroll and the chip stays whole.
await a.page.setViewportSize({ width: 320, height: 640 });
await openPanel(a);
await a.page.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
await get(a, () => {
  const chip = document.querySelector('[data-testid="soundboard"] button');
  const label = [...chip.querySelectorAll("*")].reverse().find((el) => el.children.length === 0 && el.textContent.trim()) ?? chip;
  label.textContent = "A very long sound label that goes on and on and on past any chip";
});
await whole(a, "320x640, a 62-character sound label");
await closePanel(a);

// Rotation with the panel open: it stays open on the same tab with its draft, and is inside the screen both ways.
await openPanel(b);
await b.page.getByRole("tab", { name: "Chat", exact: true }).click();
await b.page.locator("#chat-input").fill("rotate me");
for (const size of [{ width: 440, height: 956 }, { width: 956, height: 440 }, { width: 440, height: 956 }]) {
  await b.page.setViewportSize(size);
  await new Promise((r) => setTimeout(r, 300));
  const st = await get(b, () => {
    const p = document.querySelector('section[aria-label="Table chat"]')?.getBoundingClientRect();
    return { open: Boolean(p), draft: document.getElementById("chat-input")?.value, tab: document.getElementById("chat-tab-chat")?.getAttribute("aria-selected"), inside: Boolean(p) && p.left >= -0.5 && p.top >= -0.5 && p.right <= innerWidth + 0.5 && p.bottom <= innerHeight + 0.5 };
  });
  check(st.open && st.draft === "rotate me" && st.tab === "true" && st.inside, `rotation: at ${size.width}x${size.height} the panel is still open on Chat with its draft, inside the screen ${JSON.stringify(st)}`);
}
await b.page.locator("#chat-input").fill("");

// Camera re-measure with the panel open: the island hole the camera fits does not change because the panel is open.
await closePanel(b);
const holeClosed = await get(b, () => window.__isle.insets());
await openPanel(b);
await get(b, () => window.dispatchEvent(new Event("resize")));
const framesAt = await get(b, () => window.__isle.renders);
await b.page.setViewportSize({ width: 441, height: 956 });
await b.page.setViewportSize({ width: 440, height: 956 });
await get(b, () => { window.__draw = true; });
await b.page.waitForFunction((n) => window.__isle.renders > n, framesAt, { timeout: 15_000 });
await get(b, () => { window.__draw = false; });
const holeOpen = await get(b, () => window.__isle.insets());
check(JSON.stringify(holeClosed) === JSON.stringify(holeOpen), `camera: after a forced re-measure with the panel open the island hole is unchanged ${JSON.stringify({ closed: holeClosed, open: holeOpen })}`);
await closePanel(b);

// Typing and IME: digits typed in the input, or during a composition, send no reaction; with the focus off a field the keys
// 1 to 6 still send one.
await openPanel(b);
await b.page.getByRole("tab", { name: "Chat", exact: true }).click();
const input = b.page.locator("#chat-input");
await input.focus();
const reactsBefore = await get(w, () => window.__emberisle.getState().reactions.length);
await b.page.keyboard.press("1");
await input.evaluate((el) => {
  el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
  el.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: "に" }));
});
await b.page.keyboard.press("2");
await input.evaluate((el) => el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "に" })));
await new Promise((r) => setTimeout(r, 600));
check((await input.inputValue()).includes("1") && (await get(w, () => window.__emberisle.getState().reactions.length)) === reactsBefore, "typing and IME: 1 typed in the input and 2 pressed during a composition send no reaction");
await input.fill("");
await get(b, () => document.activeElement?.blur());
await b.page.keyboard.press("3");
await until(async () => (await get(w, () => window.__emberisle.getState().reactions.length)) === reactsBefore + 1, "the 3 key sends a reaction from off a field");
check(true, "typing and IME: with the focus off a field, the 3 key sends one reaction");
await closePanel(b);

// Escape: with the focus on a tab, it closes the panel and the Open chat trigger takes the focus back.
await openPanel(b);
await b.page.getByRole("tab", { name: "Sounds & stickers", exact: true }).focus();
await b.page.keyboard.press("Escape");
await b.page.locator('section[aria-label="Table chat"]').waitFor({ state: "detached" });
await until(() => get(b, () => /^Open chat/.test(document.activeElement?.getAttribute("aria-label") ?? "")), "Escape: the Open chat trigger takes the focus back", 3000);
check(true, "escape: closes the panel and the focus returns to the Open chat trigger");

// #738 (the rest), in the game, with two seats and the late watcher: order and exact catalogue, no Chat pickers, independent
// waits, reopen, focus order, Escape, echo-only sound, the three mutes, and readiness and chat left alone.
const FIXTURE_STICKERS = Array.from({ length: 24 }, (_, i) => `fixture-${String(i + 1).padStart(2, "0")}`);
const inOrder = (t, selectors) => get(t, (sels) => {
  const els = sels.map((s) => document.querySelector(s));
  const missing = sels.filter((_, i) => !els[i]);
  return missing.length ? `missing ${missing}` : els.every((el, i) => i === 0 || els[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) ? "ok" : "out of order";
}, selectors);
const labelsOf = (t, selector) => get(t, (s) => [...document.querySelectorAll(s)].map((el) => el.getAttribute("aria-label") ?? el.textContent.trim()), selector);
const PANEL = 'section[aria-label="Table chat"]';
for (const size of SIZES) {
  for (const t of [a, b]) {
    await t.page.setViewportSize({ width: size.width, height: size.height });
    await openPanel(t);
    await t.page.getByRole("tab", { name: "Chat", exact: true }).click();
    const where = `${size.label} ${t.name}`;
    check((await inOrder(t, [`${PANEL} [role=tablist]`, '[data-testid="chat-log"]', '[data-testid="emoji-row"]', "#chat-input"])) === "ok", `${where}: the Chat tab runs tabs, log, emoji, input in that order`);
    check(JSON.stringify(await labelsOf(t, '[data-testid="emoji-row"] button')) === JSON.stringify(EMOJI_LABELS.map((l) => `React ${l}`)) && (await get(t, () => [...document.querySelectorAll('[data-testid="emoji-row"] button')].map((el) => el.textContent).join(""))) === "😠😊👏😂🔥🐑", `${where}: the Chat tab has exactly the six emoji, in order`);
    check((await get(t, (p) => document.querySelectorAll(`${p} button[aria-label="Soundboard"], ${p} button[aria-label="Emotes"], ${p} button[aria-label="Quick reactions"], ${p} [data-testid="soundboard"], ${p} [data-testid="stickers"], ${p} [data-testid="presets"]`).length, PANEL)) === 0 && (await t.page.getByRole("button", { name: /Quick reactions|^Soundboard$|^Emotes$/ }).count()) === 0, `${where}: the Chat tab has no speaker, smile or sound or sticker picker, and the page no quick-reaction button`);
    await t.page.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
    await t.page.getByTestId("soundboard").waitFor();
    await until(async () => (await t.page.getByTestId("stickers").getByRole("button").count()) === (t === a ? 24 : 15), `${where}: stickers`);
    check((await inOrder(t, [`${PANEL} [role=tablist]`, '[data-testid="soundboard"]', '[data-testid="presets"]', '[data-testid="stickers"]'])) === "ok", `${where}: the Sounds & stickers tab runs tabs, sounds, quick lines, stickers in that order`);
    const ids = (await labelsOf(t, '[data-testid="stickers"] button')).map((l) => l.replace(/^React /, ""));
    const catalogue = await get(t, async () => Object.keys(await (await import("/src/components/game/talk.tsx")).loadEmotes()));
    const want = t === a ? FIXTURE_STICKERS : REPO_STICKERS;
    check(JSON.stringify(ids) === JSON.stringify(catalogue) && JSON.stringify([...ids].sort()) === JSON.stringify(want) && new Set(ids).size === ids.length, `${where}: the stickers are exactly the catalogue by id, each once, in catalogue order (${ids.length}: ${ids.slice(0, 3)}...)`);
    check(JSON.stringify(await labelsOf(t, '[data-testid="soundboard"] button')) === JSON.stringify(SOUND_LABELS.map((l) => `Play sound ${l}`)), `${where}: the sounds are exactly the 15 chips, in order`);
    check(JSON.stringify(await labelsOf(t, '[data-testid="presets"] button')) === JSON.stringify(["gg", "nice roll", "your turn", "one sec", "ty"]) && (await t.page.getByTestId("emoji-row").count()) === 0, `${where}: the quick lines are exactly the five, and the six emoji are not repeated here`);
    await t.page.getByRole("tab", { name: "Chat", exact: true }).click();
    await closePanel(t);
  }
}

// Focus: a pointer opens the panel (focus goes to the input), then Tab and Shift+Tab walk the panel's own controls in page
// order and both leave it, so there is no trap. Only the selected tab is in the order.
for (const t of [a, b]) await get(t, () => { window.__nameOf = (el) => (el ? el.getAttribute("aria-label") || el.id || el.textContent.trim().slice(0, 20) || el.tagName : ""); });
const here = (t) => get(t, () => ({ inPanel: Boolean(document.activeElement?.closest('section[aria-label="Table chat"]')), name: window.__nameOf(document.activeElement) }));
const tabOrder = (t) => get(t, () => [...document.querySelector('section[aria-label="Table chat"]').querySelectorAll("button, input, [tabindex]")].filter((el) => !el.disabled && el.tabIndex === 0 && el.getBoundingClientRect().width).map(window.__nameOf));
async function walk(t, key) {
  const forward = [];
  const backward = [];
  for (const [list, press] of [[forward, "Tab"], [backward, "Shift+Tab"]]) {
    await t.page.locator(`${PANEL} ${key}`).first().focus();
    for (let i = 0; i < 60; i++) {
      await t.page.keyboard.press(press);
      const at = await here(t);
      if (!at.inPanel) break;
      list.push(at.name);
    }
  }
  return { forward, backward, start: await get(t, (k) => window.__nameOf(document.querySelector(`section[aria-label="Table chat"] ${k}`)), key) };
}
await b.page.setViewportSize({ width: 440, height: 956 });
await closePanel(b);
await b.page.getByRole("button", { name: /^Open chat/ }).click();
await b.page.locator(PANEL).waitFor();
await until(() => get(b, () => document.activeElement?.id === "chat-input"), "a pointer open puts the focus in the input", 3000);
for (const [label, tabName, key] of [["Chat", "Chat", "#chat-input"], ["Sounds & stickers", "Sounds & stickers", '[role=tab][aria-selected="true"]']]) {
  await b.page.getByRole("tab", { name: tabName, exact: true }).click();
  const order = await tabOrder(b);
  const w2 = await walk(b, key);
  const seen = [...w2.backward.reverse(), w2.start, ...w2.forward];
  check(JSON.stringify(seen) === JSON.stringify(order) && w2.forward.length < 60 && w2.backward.length < 60 && (await b.page.getByRole("tab", { selected: false }).evaluate((el) => el.tabIndex)) === -1, `focus: on the ${label} tab Tab and Shift+Tab visit exactly the panel's controls in page order and leave it both ways, with only the selected tab in the order ${JSON.stringify(order.length)} stops`);
}
// A tap on the backdrop closes the sheet without taking the focus to Open chat.
await b.page.getByTestId("chat-backdrop").click({ position: { x: 5, y: 5 } });
await b.page.locator(PANEL).waitFor({ state: "detached" });
check(!(await get(b, () => /^Open chat/.test(document.activeElement?.getAttribute("aria-label") ?? ""))), "focus: a backdrop tap closes the sheet and does not move the focus to Open chat");

// Escape from a sound chip or a sticker closes the panel only: the armed build stays armed and a second Escape disarms it.
await a.page.setViewportSize({ width: 956, height: 440 });
for (const which of ["soundboard", "stickers"]) {
  await get(a, () => window.__emberisle.getState().setBuildMode("path"));
  check((await get(a, () => window.__emberisle.getState().buildMode)) === "path", `escape from a ${which} button: Path is armed`);
  await a.page.getByRole("button", { name: /^Open chat/ }).click();
  await a.page.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
  await a.page.getByTestId(which).getByRole("button").first().focus();
  await a.page.keyboard.press("Escape");
  await a.page.locator(PANEL).waitFor({ state: "detached" });
  check((await get(a, () => window.__emberisle.getState().buildMode)) === "path" && (await get(a, () => /^Open chat/.test(document.activeElement?.getAttribute("aria-label") ?? ""))), `escape from a ${which} button: the panel closes, Path stays armed and Open chat has the focus`);
  await a.page.keyboard.press("Escape");
  check((await get(a, () => window.__emberisle.getState().buildMode)) === "none", `escape from a ${which} button: a second Escape disarms Path`);
}

// The two waits are independent: 1 s for an emoji or sticker, 3 s for a sound, each ignoring the other, and both survive a reopen.
await a.page.setViewportSize({ width: 440, height: 956 });
await get(a, () => { window.__heard = []; HTMLMediaElement.prototype.play = function () { window.__heard.push(new URL(this.src).pathname.split("/").pop()); return Promise.resolve(); }; });
await get(b, () => { window.__heard = []; HTMLMediaElement.prototype.play = function () { window.__heard.push(new URL(this.src).pathname.split("/").pop()); return Promise.resolve(); }; });
const heard = (t, re) => get(t, (s) => window.__heard.filter((f) => new RegExp(s).test(f)).length, re);
const allDisabled = (t, selector) => get(t, (s) => { const els = [...document.querySelectorAll(s)]; return els.length > 0 && els.every((el) => el.disabled); }, selector);
const allEnabled = (t, selector) => get(t, (s) => { const els = [...document.querySelectorAll(s)]; return els.length > 0 && els.every((el) => !el.disabled); }, selector);
await openPanel(a);
await a.page.getByRole("tab", { name: "Chat", exact: true }).click();
await a.page.getByRole("button", { name: "React fire" }).click();
const tEmoji = Date.now();
await a.page.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
await a.page.getByTestId("stickers").waitFor();
check((await allDisabled(a, '[data-testid="stickers"] button')) && (await allEnabled(a, '[data-testid="soundboard"] button')), "waits: just after an emoji the stickers rest and the sound chips do not");
await a.page.getByRole("button", { name: "Play sound Gong" }).click();
const tSound = Date.now();
check(await allDisabled(a, '[data-testid="soundboard"] button'), "waits: a sound rests all the sound chips");
await until(() => allEnabled(a, '[data-testid="stickers"] button'), "the sticker wait ends", 3000);
const emojiWait = Date.now() - tEmoji;
check(emojiWait >= 900 && emojiWait <= 1900 && (await allDisabled(a, '[data-testid="soundboard"] button')), `waits: the emoji and sticker wait ends after about 1 s (${emojiWait} ms) while the sound chips still rest`);
await closePanel(a);
await openPanel(a);
await a.page.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
check(await allDisabled(a, '[data-testid="soundboard"] button'), "reopen: the sound wait survives closing and reopening the panel");
check(await allEnabled(a, '[data-testid="stickers"] button'), "waits: a sticker can be sent while the sound still rests");
await until(() => allEnabled(a, '[data-testid="soundboard"] button'), "the sound wait ends", 4500);
const soundWait = Date.now() - tSound;
check(soundWait >= 2800 && soundWait <= 4300, `waits: the sound wait ends after about 3 s (${soundWait} ms)`);

// Echo-only: the tap itself plays nothing; the host's echo plays the clip once on the sender and once on the other seat.
await get(a, () => (window.__heard = []));
await get(b, () => (window.__heard = []));
const tapped = await get(a, () => {
  [...document.querySelectorAll('[data-testid="soundboard"] button')].find((el) => el.getAttribute("aria-label") === "Play sound Perfect").click();
  return window.__heard.length;
});
check(tapped === 0, "echo only: the tap plays nothing on the sender before the host answers");
await until(async () => (await heard(a, "sb_perfect")) === 1 && (await heard(b, "sb_perfect")) === 1, "both seats hear Perfect");
await sleep(500);
check((await heard(a, "sb_perfect")) === 1 && (await heard(b, "sb_perfect")) === 1 && (await get(a, () => { const s = window.__emberisle.getState(); return s.chat.filter((l) => l.sound === "sb_perfect" && l.seat === s.seatId).length; })) === 1, "echo only: the sender and the other seat each hear Perfect exactly once, from one echoed line");
await a.page.getByRole("tab", { name: "Chat", exact: true }).click();
await closePanel(a);

// Mute: master volume, a category and a player each silence the sound for this listener only. The line still arrives, and the
// sender still hears it. Each step restores before the next, and the last proves the sound plays again.
let lastSound = Date.now() - 600;
const soundFrom = async (id) => {
  const wait = lastSound + 3500 - Date.now();
  if (wait > 0) await sleep(wait);
  lastSound = Date.now();
  await get(b, () => (window.__heard = []));
  await get(a, () => (window.__heard = []));
  const before = await lines(b, { field: "sound", value: id });
  await get(a, (i) => window.__emberisle.getState().sendSound(i), id);
  await until(async () => (await lines(b, { field: "sound", value: id })) === before + 1, `${id} reaches Moss`);
  await sleep(500);
};
const mix = (t, op, ...args) => get(t, async ([o, rest]) => (await import("/src/lib/sound-settings.ts"))[o](...rest), [op, args]);
const aSeat = await get(a, () => window.__emberisle.getState().seatId);
await soundFrom("sb_gong");
check((await heard(b, "sb_gong")) === 1 && (await heard(a, "sb_gong")) === 1, "mute: with nothing muted both seats hear Gong once");
await mix(b, "setMasterVolume", 0);
await soundFrom("sb_airhorn");
check((await heard(b, "sb_airhorn")) === 0 && (await heard(a, "sb_airhorn")) === 1, "mute: master volume 0 silences the sound here only, the line still arrives");
await mix(b, "setMasterVolume", 1);
await mix(b, "setCategoryMuted", "memes", true);
await soundFrom("sb_wololo");
check((await heard(b, "sb_wololo")) === 0 && (await heard(a, "sb_wololo")) === 1, "mute: the memes category muted silences the sound here only, the line still arrives");
await mix(b, "setCategoryMuted", "memes", false);
await openPanel(b);
await b.page.getByRole("tab", { name: "Chat", exact: true }).click();
await b.page.getByRole("button", { name: "Mute players", exact: true }).click();
await b.page.getByTestId(`chat-mute-seat-${aSeat}`).click();
await b.page.getByRole("button", { name: "Mute players", exact: true }).click();
await soundFrom("sb_plump_sheep");
check((await heard(b, "sb_plump_sheep")) === 0 && (await heard(a, "sb_plump_sheep")) === 1 && (await b.page.getByTestId("chat-log").getByTestId("sound-line").filter({ hasText: "Plump sheep" }).count()) === 0, "mute: a muted player's sound is silent and hidden here, and the sender still hears it");
await b.page.getByRole("button", { name: "Mute players", exact: true }).click();
await b.page.getByTestId(`chat-mute-seat-${aSeat}`).click();
await b.page.getByRole("button", { name: "Mute players", exact: true }).click();
await soundFrom("sb_nice_sheep");
check((await heard(b, "sb_nice_sheep")) === 1 && (await b.page.getByTestId("chat-log").getByTestId("sound-line").filter({ hasText: "Nice sheep" }).count()) === 1, "mute: unmuting the player, the master and the category brings the sound and its line back");

// Readiness and chat are left alone: emoji and stickers add no chat line and change no readiness; a quick line is one plain
// chat line at the other seat.
const snap = (t) => get(t, () => { const s = window.__emberisle.getState(); return { plain: s.chat.filter((l) => !l.sound).length, sounds: s.chat.filter((l) => l.sound).length, ready: s.seats.map((x) => `${x.id}:${x.ready}`).join() }; });
await closePanel(b);
await openPanel(a);
await a.page.getByRole("tab", { name: "Chat", exact: true }).click();
await sleep(1100);
const snapBefore = await snap(w);
const reacts2 = await get(w, () => window.__emberisle.getState().reactions.length);
await a.page.getByRole("button", { name: "React sheep" }).click();
await until(async () => (await get(w, () => window.__emberisle.getState().reactions.length)) > reacts2, "the watcher sees the emoji");
await openPanel(b);
await b.page.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
await b.page.getByTestId("stickers").waitFor();
const reacts3 = await get(w, () => window.__emberisle.getState().reactions.length);
await b.page.getByTestId("stickers").getByRole("button").nth(2).click();
await until(async () => (await get(w, () => window.__emberisle.getState().reactions.length)) > reacts3, "the watcher sees the sticker");
await sleep(500);
const snapAfter = await snap(w);
check(JSON.stringify(snapBefore) === JSON.stringify(snapAfter), `readiness and chat: an emoji and a sticker add no chat line and change no seat's readiness ${JSON.stringify(snapAfter)}`);
await a.page.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
await a.page.getByTestId("presets").getByRole("button", { name: "gg", exact: true }).click();
await until(async () => (await snap(w)).plain === snapBefore.plain + 1, "the quick line reaches the watcher");
await sleep(400);
const snapLine = await snap(w);
check(snapLine.plain === snapBefore.plain + 1 && snapLine.sounds === snapBefore.sounds && snapLine.ready === snapBefore.ready && (await get(w, () => window.__emberisle.getState().chat.at(-1).text)) === "gg", `readiness and chat: a quick line is one plain chat line "gg" at the watcher ${JSON.stringify(snapLine)}`);
await a.page.getByRole("tab", { name: "Chat", exact: true }).click();
await closePanel(a);
await closePanel(b);
await b.page.setViewportSize({ width: 956, height: 440 });

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


// Cleanup: the two waits and the reaction log belong to the table. Changing the table's code clears them, so a new table starts
// fresh with nothing left to carry over from the old one.
const cleaned = await get(a, async () => {
  const talk = await import("/src/components/game/talk.tsx");
  const store = window.__emberisle;
  const code = store.getState().code;
  talk.useTalk.setState({ cooling: true, resting: true, reactLog: [{ id: 9999, seat: "x", name: "x", color: "red", emote: "🔥", at: Date.now() }] });
  const held = talk.useTalk.getState();
  store.setState({ code: "ZZZZ" });
  const after = talk.useTalk.getState();
  store.setState({ code });
  return { held: held.cooling && held.resting && held.reactLog.length === 1, cooling: after.cooling, resting: after.resting, log: after.reactLog.length };
});
check(cleaned.held && !cleaned.cooling && !cleaned.resting && cleaned.log === 0, `cleanup: a new table code clears both waits and the reaction log ${JSON.stringify(cleaned)}`);

check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
await vite.close();
console.log(`quick-react-integration-prove: all checks passed in ${((Date.now() - T0) / 1000).toFixed(1)}s`);
process.exit(0);
