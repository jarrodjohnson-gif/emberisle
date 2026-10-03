// #160: three headless tabs at 1280x720 chat through server/host.mjs. Lobby chat and presets, a floating reaction,
// the unread badge and the remembered open/minimized state, a minimized dock that covers no board target, the player action
// menu in the rail and under the phone seat strip (#161), the game log in the dock with its Chat/All filter and Copy log (#305),
// zero console errors.
// Design: docs/design/chat.md "Test plan". Screenshots go to test-results/.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = 8094;
const SHOTS = fileURLToPath(new URL("../test-results/", import.meta.url));
mkdirSync(SHOTS, { recursive: true });

// Rooms go to a temp folder, dropped on exit, so the real host never restores this proof's tables (#207).
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR },
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

const T0 = Date.now();
const errors = [];
let code = 0;
const url = `http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`;

function watch(name, page) {
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${name}: ${r.status()} ${r.url()}`));
}

// `phone` is a 390x844 touch phone (#178), the same device as scripts/mobile-shots.mjs.
async function tab(name, phone = false) {
  const ctx = await browser.newContext(
    phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 } },
  );
  const page = await ctx.newPage();
  watch(name, page);
  await page.addInitScript((n) => localStorage.setItem("emberisle-name", n), name);
  // The phone remembers an open chat, and Play must still start with the sheet closed.
  if (phone) await page.addInitScript(() => localStorage.setItem("emberisle-chat-open", "1"));
  // Three software-rendered 1280x720 scenes starve the machine, and the proof reads the DOM. Skip GL draws except while a screenshot is taken.
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

async function until(check, what, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const got = await check();
    if (got) return got;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out: ${what}`);
}

const store = (t, fn) => t.page.evaluate(fn);
// Let the scene draw a few frames, then capture.
async function shot(t, file) {
  await t.page.evaluate(() => (window.__draw = true));
  await new Promise((r) => setTimeout(r, 1500));
  await t.page.screenshot({ path: `${SHOTS}${file}`, type: "jpeg", quality: 70 });
  await t.page.evaluate(() => (window.__draw = false));
}
const check = (ok, what) => {
  if (!ok) throw new Error(what);
  console.log(`ok ${what}`, `+${((Date.now() - T0) / 1000).toFixed(1)}s`);
};

try {
  const tabs = [await tab("Ember"), await tab("Tide"), await tab("Pine")];
  const [a, b, c] = tabs;
  const phone = await tab("Moss", true);

  await a.page.getByRole("button", { name: "Host a table" }).click();
  const tableCode = (await a.page.getByTestId("table-code").textContent()).trim();
  for (const t of [b, c]) {
    await t.page.getByPlaceholder(/code/i).fill(tableCode);
    await t.page.getByRole("button", { name: "Join" }).click();
    await t.page.getByTestId("table-code").waitFor();
  }
  for (const t of tabs) {
    await until(async () => (await t.page.locator("li", { hasText: "Pine" }).count()) === 1, `${t.name} sees 3 seats`);
  }

  // Phone title card (#178): full width minus 12 px, at most 55% of the viewport, pinned to the bottom.
  const box = (t, sel) => t.page.evaluate((q) => {
    const r = document.querySelector(q).getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, vw: innerWidth, vh: innerHeight };
  }, sel);
  await phone.page.getByTestId("title-card").waitFor();
  let r = await box(phone, '[data-testid="title-card"]');
  check(r.height <= 0.55 * r.vh + 0.5, `phone title card is ${r.height.toFixed(0)} px tall, at most 55% of ${r.vh}`);
  check(Math.abs(r.width - (r.vw - 24)) < 1 && r.left >= 11 && r.bottom > r.vh - 20, "phone title card is full width minus 12 px, at the bottom");
  await shot(phone, "chat-phone-title.jpg");
  await phone.page.getByPlaceholder(/code/i).fill(tableCode);
  await phone.page.getByRole("button", { name: "Join" }).click();
  await phone.page.getByTestId("table-code").waitFor();
  r = await box(phone, '[data-testid="lobby-card"]');
  check(r.height <= 0.55 * r.vh + 0.5 && Math.abs(r.width - (r.vw - 24)) < 1, `phone lobby card is ${r.width.toFixed(0)}x${r.height.toFixed(0)}, within 55vh and full width`);
  await shot(phone, "chat-phone-lobby.jpg");
  for (const t of [...tabs, phone]) {
    await until(async () => (await t.page.locator("li", { hasText: "Moss" }).count()) >= 1, `${t.name} sees 4 seats`);
  }

  // 1. Lobby: typed line with Enter, then a preset click, on every tab.
  await a.page.getByPlaceholder("Say something…").fill("hello");
  await a.page.getByPlaceholder("Say something…").press("Enter");
  for (const t of tabs) {
    await t.page.getByTestId("chat-log").getByText("hello").waitFor({ timeout: 5000 });
    const line = await t.page.getByTestId("chat-log").locator("li", { hasText: "hello" }).textContent();
    check(line.includes("Ember"), `lobby: ${t.name} shows "hello" from Ember`);
  }
  await b.page.getByRole("button", { name: "gg", exact: true }).click();
  for (const t of tabs) {
    await t.page.getByTestId("chat-log").locator("li", { hasText: "gg" }).waitFor({ timeout: 5000 });
  }
  check(true, 'lobby: preset "gg" from Tide shows on all 3 tabs');
  check((await a.page.getByPlaceholder("Say something…").inputValue()) === "", "lobby: input cleared after Enter");

  for (const t of [...tabs, phone]) await t.page.getByRole("button", { name: "Ready", exact: true }).click();
  await a.page.getByRole("button", { name: "Start" }).click();
  for (const t of tabs) await t.page.getByRole("button", { name: "Open chat" }).waitFor();
  check(true, "game: every tab shows the minimized dock, and the lobby lines did not count as unread");
  for (const t of tabs) check((await t.page.getByTestId("chat-unread").count()) === 0, `game: ${t.name} has no unread badge`);

  // 5. Minimized dock covers no target. A line from another seat is showing under the button, and it must not catch clicks either.
  const cur = await until(async () => {
    for (const t of tabs) {
      const own = await t.page.evaluate(() => {
        const s = window.__emberisle.getState();
        return s.state?.current === s.localId && s.legal?.outpost?.length ? s.localId : null;
      });
      if (own) return t;
    }
    return null;
  }, "someone has legal corners");
  const other = tabs.find((t) => t !== cur);
  await other.page.getByRole("button", { name: "Open chat" }).click();
  await other.page.getByPlaceholder("Say something…").fill("preview line");
  await other.page.getByPlaceholder("Say something…").press("Enter");
  await cur.page.getByTestId("chat-preview").getByText("preview line").waitFor({ timeout: 5000 });
  const hits = await cur.page.evaluate(() => {
    const s = window.__emberisle.getState();
    const ids = [...s.legal.outpost, ...s.legal.path, ...s.legal.wayfarer, ...s.state.hexes.map((h) => h.id)];
    const out = { checked: 0, canvas: 0, chat: [] };
    for (const id of ids) {
      const p = window.__isle.screenOf(id);
      if (!p || p.x < 0 || p.y < 0 || p.x >= innerWidth || p.y >= innerHeight) continue;
      out.checked++;
      const el = document.elementFromPoint(p.x, p.y);
      if (el?.tagName === "CANVAS") out.canvas++;
      if (el?.closest('[aria-label="Open chat"], [data-testid="chat-preview"], [aria-label="Table chat"]')) out.chat.push(id);
    }
    return out;
  });
  check(hits.checked > 20, `minimized dock: ${hits.checked} legal corners, edges, and hexes are on screen`);
  check(hits.chat.length === 0, `minimized dock: no target is covered by chat (${hits.canvas} reach the canvas, the rest sit under the HUD)`);
  await shot(cur, "chat-minimized.jpg");

  // 2. A reaction floats over the sender's rail card on the other tabs, and is gone after 3 s.
  await c.page.getByRole("button", { name: "Open chat" }).click();
  await c.page.getByRole("button", { name: "Emotes" }).click();
  await c.page.getByRole("button", { name: "React ben-10" }).click();
  for (const t of [a, b]) {
    const float = t.page.locator("aside [data-testid=reaction][data-emote=ben-10]");
    await float.waitFor({ timeout: 5000 });
    const owner = await float.locator("xpath=ancestor::div[contains(@class,'relative')][1]").textContent();
    check(owner.includes("Pine"), `reaction: ${t.name} shows ben-10 over Pine's card`);
    const box = await float.locator("img").boundingBox();
    check(Math.round(box.width) === 48, `reaction: ${t.name} image is 48 px wide`);
  }
  await new Promise((r) => setTimeout(r, 3000));
  for (const t of tabs) check((await t.page.locator("[data-testid=reaction]").count()) === 0, `reaction: gone after 3 s on ${t.name}`);

  // 3. Tab 1 clicks tab 2's card (#161): an accordion menu in the rail with the card's 4 facts, a reaction aimed at Tide,
  // Mention fills the input, and Esc, the same card, and a click outside all close it.
  const bId = await store(b, () => window.__emberisle.getState().localId);
  const card = a.page.getByTestId(`rail-${bId}`).getByRole("button");
  const menu = a.page.getByTestId("player-menu");
  await card.click();
  await menu.waitFor();
  check((await card.getAttribute("aria-expanded")) === "true", "menu: Tide's card is a button with aria-expanded");
  const cardText = await a.page.getByTestId(`rail-${bId}`).textContent();
  const fromCard = [
    Number(cardText.match(/(\d+) goods/)[1]),
    Number(cardText.match(/(\d+) fortunes/)[1]),
    Number(cardText.match(/(\d+) vp/)[1]),
    await a.page.evaluate((id) => window.__emberisle.getState().state.players.find((p) => p.id === id).knightsPlayed, bId),
  ];
  const facts = (await menu.getByTestId("menu-facts").locator("dd").allTextContents()).map(Number);
  check(facts.length === 4 && facts.every((n, i) => n === fromCard[i]), `menu: 4 facts ${JSON.stringify(facts)} equal the card's numbers`);
  const geo = await a.page.evaluate((id) => {
    const r = (el) => el.getBoundingClientRect();
    const aside = r(document.querySelector("aside"));
    const card = r(document.querySelector(`[data-testid="rail-${id}"]`));
    const menu = r(document.querySelector('[data-testid="player-menu"]'));
    const cards = [...document.querySelectorAll('[data-testid^="rail-"]')].map(r);
    const below = cards.find((c) => c.top > card.top);
    return { inRail: menu.left >= aside.left - 1 && menu.right <= aside.right + 1, under: menu.top >= card.bottom, pushed: !below || below.top >= menu.bottom };
  }, bId);
  check(geo.inRail && geo.under && geo.pushed, "menu: sits in the rail column under the card and pushes the cards below it down");
  check((await menu.getByRole("button", { name: /Offer a trade/ }).count()) === 0, "menu: no Offer a trade row outside your main phase");
  await shot(a, "menu-open.jpg");
  await menu.getByRole("button", { name: "React ben-10" }).click();
  await menu.waitFor({ state: "detached" });
  for (const t of [b, c]) {
    const float = t.page.locator("aside [data-testid=reaction][data-emote=ben-10]");
    await float.waitFor({ timeout: 5000 });
    const owner = await float.locator("xpath=ancestor::div[contains(@class,'relative')][1]").textContent();
    check(owner.includes("Ember") && (await float.textContent()).includes("→ Tide"), `menu: ${t.name} shows Ember's ben-10 tagged → Tide`);
  }
  await card.click();
  await menu.waitFor();
  await a.page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  check(await card.evaluate((el) => document.activeElement === el), "menu: Esc closes it and the focus returns to the card");
  await card.click();
  await menu.waitFor();
  await card.click();
  await menu.waitFor({ state: "detached" });
  check(true, "menu: the same card closes it");
  await card.click();
  await menu.waitFor();
  await a.page.getByText("Emberisle", { exact: true }).click();
  await menu.waitFor({ state: "detached" });
  check(true, "menu: a click outside closes it");
  await card.click();
  await menu.getByRole("button", { name: "Mention @Tide in chat" }).click();
  await menu.waitFor({ state: "detached" });
  await a.page.getByPlaceholder("Say something…").waitFor();
  check((await a.page.getByPlaceholder("Say something…").inputValue()) === "@Tide ", 'menu: Mention puts "@Tide " in the input');
  // focusChat focuses on the next animation frame, and a software-GL frame can take seconds.
  const focused = await a.page
    .waitForFunction(() => document.activeElement?.id === "chat-input", null, { timeout: 5000 })
    .then(() => true, () => false);
  check(focused, "menu: Mention focuses the input");
  await a.page.getByPlaceholder("Say something…").fill("");
  await a.page.getByPlaceholder("Say something…").press("Escape");
  await a.page.getByRole("button", { name: "Open chat" }).waitFor();

  // 4. Minimize and unread, and the remembered state.
  const stored = (t) => t.page.evaluate(() => localStorage.getItem("emberisle-chat-open"));
  await a.page.getByRole("button", { name: "Open chat" }).click();
  await a.page.getByRole("button", { name: "Minimize chat" }).click();
  check((await stored(a)) === "0", 'minimize: localStorage["emberisle-chat-open"] is "0"');
  await c.page.getByPlaceholder("Say something…").fill("ping");
  await c.page.getByPlaceholder("Say something…").press("Enter");
  await a.page.getByTestId("chat-unread").waitFor({ timeout: 5000 });
  check((await a.page.getByTestId("chat-unread").textContent()) === "1", "unread: tab 1's badge shows 1");
  await a.page.getByRole("button", { name: "Open chat" }).click();
  await a.page.getByTestId("chat-unread").waitFor({ state: "detached" });
  check((await stored(a)) === "1", 'open: badge cleared and the value is "1"');
  await shot(a, "chat-open.jpg");
  const fresh = await a.page.context().newPage();
  watch("Ember2", fresh);
  await fresh.goto(url);
  check(await fresh.evaluate(() => window.__emberisle.getState().chatOpen === true), "a new page in the same browser context starts with chatOpen true");
  await fresh.close();
  await a.page.getByPlaceholder("Say something…").press("Escape");
  await a.page.getByRole("button", { name: "Open chat" }).waitFor();
  check((await stored(a)) === "0", "Esc in the input minimizes the dock");

  // 5. Phone: the open dock is a bottom sheet, and the tap that closes it does not reach the board.
  await phone.page.getByRole("button", { name: "Open chat" }).waitFor();
  check((await phone.page.getByTestId("chat-sheet").count()) === 0, "phone: Play starts with the sheet closed although chat was remembered open");
  check((await phone.page.evaluate(() => localStorage.getItem("emberisle-chat-open"))) === "1", "phone: the remembered open state is left in storage");
  r = await box(phone, '[aria-label="Open chat"]');
  check(r.right > r.vw - 20 && r.bottom < r.vh - 150, "phone: the minimized button sits bottom-right above the hand bar");
  await phone.page.getByRole("button", { name: "Open chat" }).click();
  await phone.page.getByTestId("chat-sheet").waitFor({ timeout: 5000 });
  r = await box(phone, '[aria-label="Table chat"]');
  const cap = Math.min(0.48 * r.vh, 320);
  check(Math.abs(r.bottom - r.vh) < 1 && r.left === 0 && Math.abs(r.width - r.vw) < 1, `phone: chat is a sheet at the bottom, ${r.width.toFixed(0)} px wide of ${r.vw}`);
  check(r.height > 100 && r.height <= cap + 0.5, `phone: the sheet is ${r.height.toFixed(0)} px tall, at most min(48vh, 320px) = ${cap.toFixed(0)}`);
  const lay = await phone.page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="chat-sheet"]').getBoundingClientRect();
    const head = document.querySelector('[data-testid="chat-sheet-header"]').getBoundingClientRect();
    const log = document.querySelector('[data-testid="chat-log"]');
    const input = document.getElementById("chat-input").getBoundingClientRect();
    return { sheetBottom: sheet.bottom, headBottom: head.bottom, logTop: log.getBoundingClientRect().top, inputBottom: input.bottom, atEnd: log.scrollHeight - log.scrollTop - log.clientHeight < 2 };
  });
  check(lay.sheetBottom - lay.inputBottom <= 24, `phone: the input row ends ${(lay.sheetBottom - lay.inputBottom).toFixed(0)} px above the sheet bottom, no dead space`);
  check(lay.logTop >= lay.headBottom && lay.atEnd, "phone: the log starts below the header and shows the newest line");
  await shot(phone, "chat-phone-open.jpg");
  const before = await phone.page.evaluate(() => {
    const s = window.__emberisle.getState();
    const v = s.state.current === s.localId ? s.legal?.outpost?.[0] : null;
    const at = v ? window.__isle.screenOf(v) : null;
    return { seq: s.state.seq, at: at ?? { x: 195, y: 200 } };
  });
  await phone.page.touchscreen.tap(before.at.x, before.at.y);
  await phone.page.getByTestId("chat-sheet").waitFor({ state: "detached", timeout: 5000 });
  const after = await phone.page.evaluate(() => ({ seq: window.__emberisle.getState().state.seq, pending: window.__emberisle.getState().pendingPlace }));
  check(after.seq === before.seq && !after.pending, "phone: tapping the board with the sheet open only closes it, no piece or selection");

  // Phone menu (#161): a strip chip opens it under the strip with 44 px items, and Mention opens the sheet with the draft.
  const aId = await store(a, () => window.__emberisle.getState().localId);
  await phone.page.getByTestId(`seat-${aId}`).getByRole("button").tap();
  const pMenu = phone.page.getByTestId("player-menu");
  await pMenu.waitFor({ timeout: 5000 });
  const pGeo = await phone.page.evaluate(() => {
    const strip = document.querySelector('[data-testid="seat-strip"]').getBoundingClientRect();
    const menu = document.querySelector('[data-testid="player-menu"]').getBoundingClientRect();
    const items = [...document.querySelectorAll('[data-testid="player-menu"] button')].map((b) => b.getBoundingClientRect());
    return { under: menu.top >= strip.bottom, onScreen: menu.left >= 0 && menu.right <= innerWidth && menu.bottom <= innerHeight, items: items.length, small: items.filter((r) => r.width < 44 || r.height < 44).length };
  });
  check(pGeo.under && pGeo.onScreen, "phone: the menu opens downward from the strip, on screen");
  check(pGeo.items > 0 && pGeo.small === 0, `phone: all ${pGeo.items} menu items are at least 44 px on both axes`);
  await shot(phone, "chat-phone-menu.jpg");
  await pMenu.getByRole("button", { name: "Mention @Ember in chat" }).tap();
  await pMenu.waitFor({ state: "detached" });
  await phone.page.getByTestId("chat-sheet").waitFor({ timeout: 5000 });
  check((await phone.page.getByPlaceholder("Say something…").inputValue()) === "@Ember ", 'phone: Mention opens the sheet with "@Ember "');
  await phone.page.getByRole("button", { name: "Minimize chat" }).tap();

  // 7. The game log (#305): setup and the first roll through the store, then every dock lists the game's lines as muted
  // rows in with the chat, the Chat chip hides them, and Copy log puts the whole log on the clipboard.
  const all = [...tabs, phone];
  const act = (t, fn, arg) => t.page.evaluate(([f, a]) => window.__emberisle.getState()[f](...[].concat(a)), [fn, arg]);
  const seen = (t) =>
    store(t, () => {
      const s = window.__emberisle.getState();
      return { you: s.localId, current: s.state.current, phase: s.state.phase, seq: s.state.seq, dice: s.state.dice, outpost: s.legal?.outpost ?? [], path: s.legal?.path ?? [] };
    });
  const byId = {};
  for (const t of all) byId[(await seen(t)).you] = t;
  for (let step = 0; step < 16; step++) {
    const v = await seen(a);
    if (v.phase === "roll") break;
    const t = byId[v.current];
    const mine = await until(async () => {
      const m = await seen(t);
      return m.seq === v.seq && (m.phase === "setupSettle" ? m.outpost.length : m.path.length) ? m : null;
    }, `${t.name} has its glow for setup step ${step}`);
    if (mine.phase === "setupSettle") await act(t, "pickVertex", mine.outpost[0]);
    else await act(t, "pickEdge", mine.path[0]);
    await until(async () => ((await seen(a)).seq > v.seq ? true : null), `setup step ${step} reaches Ember`);
  }
  const atRoll = await seen(a);
  check(atRoll.phase === "roll", `game log: setup is done, phase ${atRoll.phase}`);
  await act(byId[atRoll.current], "dispatch", [{ type: "roll" }]);
  await until(async () => ((await seen(a)).dice ? true : null), "the first roll reaches Ember");
  const rowsOf = (t) => t.page.getByTestId("chat-log").getByTestId("log-row").allTextContents();
  for (const t of all) {
    if (await t.page.getByRole("button", { name: "Open chat" }).count()) await t.page.getByRole("button", { name: "Open chat" }).click();
    const rows = await until(async () => {
      const r = await rowsOf(t);
      return r.length >= 3 && r.some((x) => /rolls \d\+\d = \d+/.test(x)) && r.some((x) => /raises an outpost|founds an outpost/.test(x)) ? r : null;
    }, `${t.name} lists the roll and an outpost in the game log`);
    check(true, `game log: ${t.name} shows ${rows.length} rows, with the roll and an outpost${t === phone ? ", in the phone sheet" : ""}`);
  }
  const logKey = () => a.page.evaluate(() => localStorage.getItem("emberisle-log-filter"));
  await a.page.getByRole("button", { name: "Chat", exact: true }).click();
  await until(async () => ((await rowsOf(a)).length === 0 ? true : null), "the Chat chip hides the game rows");
  check((await a.page.getByTestId("chat-log").locator("li", { hasText: "hello" }).count()) === 1 && (await logKey()) === "chat", 'game log: the Chat chip keeps the chat lines and stores "chat"');
  await a.page.getByRole("button", { name: "All", exact: true }).click();
  const shown = await until(async () => {
    const r = await rowsOf(a);
    return r.length >= 3 ? r : null;
  }, "the All chip shows the game rows again");
  check((await logKey()) === "all", 'game log: the All chip stores "all"');
  await a.page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await a.page.getByRole("button", { name: "Copy log" }).click();
  await a.page.getByRole("button", { name: "Copied" }).waitFor({ timeout: 5000 });
  const copied = await a.page.evaluate(() => navigator.clipboard.readText());
  const wanted = await store(a, () => window.__emberisle.getState().gameLog.map((l) => l.text).join("\n"));
  check(copied === wanted && copied.split("\n").length === shown.length, `game log: ${shown.length} rows, copy ok`);
  await shot(a, "chat-game-log.jpg");
  // #343: with no clipboard (a LAN address over plain http) Copy log shows the log in a read-only field, focused and selected.
  await a.page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }));
  await a.page.getByRole("button", { name: "Copy log" }).click();
  const fallback = await a.page
    .waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="copy-fallback"]');
        if (!el || document.activeElement !== el) return null;
        return { value: el.value, readOnly: el.readOnly, selected: el.selectionStart === 0 && el.selectionEnd === el.value.length, live: document.querySelector('[data-testid="copy-status"]')?.textContent };
      },
      null,
      { timeout: 5000 },
    )
    .then((h) => h.jsonValue());
  check(fallback.value === wanted && fallback.readOnly && fallback.selected && fallback.live === "Select and copy", "game log: without a clipboard, Copy log shows the log in a focused, selected read-only field and says so");

  // Versus bots the menu shows only the facts (and the bank trade on your main turn, not during setup).
  const solo = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  watch("Solo", solo);
  await solo.goto(`http://127.0.0.1:${PORT}/`);
  await solo.getByRole("button", { name: "Play versus the isle" }).click();
  await solo.waitForFunction(() => window.__emberisle.getState().state?.phase === "setupSettle");
  await solo.getByTestId("rail-p1").getByRole("button").click();
  await solo.getByTestId("player-menu").waitFor();
  check(
    (await solo.getByTestId("player-menu").locator("dd").count()) === 4 && (await solo.getByTestId("player-menu").locator("button").count()) === 0,
    "bots: the menu shows the 4 facts and nothing else",
  );
  await solo.context().close();

  // 6.
  check(errors.length === 0, "zero console errors in all tabs");
  console.log("chat prove ok");
} catch (e) {
  console.log("FAIL", e.message);
  if (errors.length) console.log(errors.join("\n"));
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
process.exit(code);
