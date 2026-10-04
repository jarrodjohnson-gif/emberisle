// #160: three headless tabs at 1280x720 chat through server/host.mjs. Lobby chat and presets, a floating reaction,
// the unread badge and the remembered open/minimized state, a minimized dock that covers no board target, the player action
// menu in the rail and under the phone seat strip (#161), the game log in the dock with its Chat/All filter and Copy log (#305),
// the lobby status line as seats join and ready up (#418), Start and Leave inside the 1280x720 lobby card (#417),
// #460: computed glass surfaces, 12 px controls, one primary and >= 4.5:1 text contrast over black, on desktop and phone,
// including emotes, previews, copy fallback and read-only chat. Zero console errors.
// Design: docs/design/chat.md "Test plan". Screenshots go to test-results/.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8094;
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
// Capture after actual rendered frames, including the lazy island's first mount.
async function shot(t, file) {
  await t.page.waitForFunction(() => Boolean(window.__isle));
  const before = await t.page.evaluate(() => {
    window.__draw = true;
    return window.__isle.renders;
  });
  await t.page.waitForFunction((n) => window.__isle.renders >= n + 2, before, { timeout: 15_000 });
  await t.page.screenshot({ path: `${SHOTS}${file}`, type: "jpeg", quality: 70 });
  await t.page.evaluate(() => (window.__draw = false));
}
const check = (ok, what) => {
  if (!ok) throw new Error(what);
  console.log(`ok ${what}`, `+${((Date.now() - T0) / 1000).toFixed(1)}s`);
};

// Accumulate the style failures so a main run reports both viewports, rather than stopping at the first 8 px corner.
const polishFailures = [];
async function polish(t, state, selector = 'section[aria-label="Table chat"]', minControls = 1) {
  await t.page.locator(selector).first().waitFor();
  const result = await t.page.evaluate(({ selector, minControls }) => {
    const roots = [...document.querySelectorAll(selector)];
    const canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const px = (css, under = "#000") => {
      canvas.fillStyle = under;
      canvas.fillRect(0, 0, 1, 1);
      canvas.fillStyle = css;
      canvas.fillRect(0, 0, 1, 1);
      return [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const theme = getComputedStyle(document.documentElement);
    const glassCSS = theme.getPropertyValue("--color-glass").trim();
    if (!glassCSS) throw new Error("the glass token is missing");
    const glass = px(glassCSS);
    // Comparing over both black and white detects alpha differences as well as different RGB colours.
    const same = (a, b) => ["#000", "#fff"].every((under) => px(a, under).every((n, i) => Math.abs(n - px(b, under)[i]) <= 1));
    const lum = (rgb) => rgb.map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const visible = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden" && !el.closest(".sr-only");
    const name = (el) => el.getAttribute("aria-label") || el.textContent.trim().slice(0, 35) || el.tagName.toLowerCase();
    const bad = { corners: [], glass: [], contrast: [], primary: [] };
    const controls = roots.flatMap((root) => [
      ...(root.matches("button,input,textarea") ? [root] : []),
      ...root.querySelectorAll("button,input,textarea"),
    ]).filter(visible);
    if (controls.length < minControls) bad.corners.push(`expected at least ${minControls} controls, found ${controls.length}`);
    const pills = new Set(["Chat", "All", "Copy log", "Copied", "gg", "nice roll", "your turn", "one sec", "ty"]);
    const fg = theme.getPropertyValue("--color-fg").trim();
    const filled = [];
    for (const el of controls) {
      const css = getComputedStyle(el);
      const label = name(el);
      const radii = ["TopLeft", "TopRight", "BottomLeft", "BottomRight"].map((corner) => parseFloat(css[`border${corner}Radius`]));
      const pill = pills.has(el.textContent.trim());
      if (!radii.every((r) => pill ? r >= el.getBoundingClientRect().height / 2 : Math.abs(r - 12) <= 0.01)) {
        bad.corners.push(`${label}: ${radii.join("/")} px${pill ? " (pill)" : ", want 12"}`);
      }
      const send = el.tagName === "BUTTON" && el.textContent.trim() === "Send";
      if (!same(css.backgroundColor, send ? fg : glassCSS)) bad.glass.push(`${label}: ${css.backgroundColor}`);
      if (["Top", "Right", "Bottom", "Left"].some((edge) => parseFloat(css[`border${edge}Width`]) !== 0)) bad.glass.push(`${label}: has a border`);
      if (el.tagName === "BUTTON" && same(css.backgroundColor, fg)) filled.push(label);
    }
    // Send is the deliberate primary exception to the glass controls. Spectators and minimized chat have no primary.
    const sends = controls.filter((el) => el.tagName === "BUTTON" && el.textContent.trim() === "Send").length;
    if (filled.length !== sends || filled.some((label) => label !== "Send")) bad.primary.push(`filled buttons: ${JSON.stringify(filled)}`);
    for (const root of roots) {
      if (!same(getComputedStyle(root).backgroundColor, glassCSS)) bad.glass.push(`${name(root)} surface: ${getComputedStyle(root).backgroundColor}`);
    }
    const texts = [];
    const measure = (el, text, css = getComputedStyle(el)) => {
      if (!text.trim() || !visible(el)) return;
      // Use one glass over black even inside the layered dock. Primary text, the unread badge and mentions have their
      // own backing; checking white badge/Send text against glass would report a false failure.
      const send = el.closest("button")?.textContent.trim() === "Send";
      const badge = el.closest('[data-testid="chat-unread"]');
      const mark = el.closest("mark");
      const backing = send ? fg : badge ? getComputedStyle(badge).backgroundColor : mark ? getComputedStyle(mark).backgroundColor : null;
      const bg = backing ? px(backing, `rgb(${glass.join(" ")})`) : glass;
      let ink = px(css.color, `rgb(${bg.join(" ")})`);
      const opacity = Number(css.opacity);
      ink = ink.map((n, i) => n * opacity + bg[i] * (1 - opacity));
      const contrast = ratio(ink, bg);
      texts.push(contrast);
      if (contrast < 4.5) bad.contrast.push(`${text.trim().slice(0, 30)}: ${contrast.toFixed(2)}:1`);
    };
    for (const root of roots) {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) measure(walk.currentNode.parentElement, walk.currentNode.textContent);
    }
    for (const el of controls) {
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        measure(el, el.value || el.placeholder, el.value ? getComputedStyle(el) : getComputedStyle(el, "::placeholder"));
      }
    }
    return { bad, controls: controls.length, texts: texts.length, min: texts.length ? Math.min(...texts).toFixed(2) : "n/a", glass, viewport: `${innerWidth}x${innerHeight}` };
  }, { selector, minControls });
  for (const [kind, failures] of Object.entries(result.bad)) {
    if (failures.length) polishFailures.push(`${result.viewport} ${state} ${kind}: ${failures.join("; ")}`);
  }
  console.log(`${Object.values(result.bad).some((failures) => failures.length) ? "FAIL" : "ok"} chat polish ${result.viewport} ${state}: ${result.controls} controls, ${result.texts} texts, minimum ${result.min}:1, glass over black rgb(${result.glass})`);
}

try {
  const tabs = [await tab("Ember"), await tab("Tide"), await tab("Pine")];
  const [a, b, c] = tabs;
  const phone = await tab("Moss", true);

  // #418: the host's status line says what is still missing, from the seat list alone, as seats join and ready up.
  const statusIs = (t, text) =>
    until(async () => (await t.page.getByTestId("lobby-status").textContent()).trim() === text, `${t.name} lobby status "${text}"`).then(() =>
      check(true, `lobby status on ${t.name}: "${text}"`),
    );
  await a.page.getByRole("button", { name: "Host a table" }).click();
  const tableCode = (await a.page.getByTestId("table-code").textContent()).trim();
  await statusIs(a, "Need 2 more players");
  for (const [i, t] of [b, c].entries()) {
    await t.page.getByPlaceholder(/code/i).fill(tableCode);
    await t.page.getByRole("button", { name: "Join" }).click();
    await t.page.getByTestId("table-code").waitFor();
    await statusIs(a, i === 0 ? "Need 1 more player" : "0 of 3 ready");
    // A guest tab reads the same status off the same seat list.
    await statusIs(b, i === 0 ? "Need 1 more player" : "0 of 3 ready");
  }
  // The host tag sits on the host's row only, on every tab.
  for (const t of tabs) {
    await until(
      async () => (await t.page.getByTestId("host-tag").count()) === 1 && (await t.page.locator("li", { hasText: "Ember" }).getByTestId("host-tag").count()) === 1,
      `${t.name} sees one host tag, on Ember's row`,
    );
    check(true, `host tag on Ember's row only, seen by ${t.name}`);
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
  // Four seats, scrolled to the bottom, at 844 and 640 tall: the sticky actions row reaches the card's bottom edge, so no
  // scroll content (chat chips, input, seat rows) renders below it, and Leave lives inside it.
  for (const h of [844, 640]) {
    await phone.page.setViewportSize({ width: 390, height: h });
    await phone.page.evaluate(() => { const s = document.querySelector('[data-testid="lobby-card"] > div'); s.scrollTop = s.scrollHeight; });
    await shot(phone, `chat-phone-lobby-bottom-${h}.jpg`);
    const m = await phone.page.evaluate(() => {
      const scroller = document.querySelector('[data-testid="lobby-card"] > div');
      const row = document.querySelector('[data-testid="lobby-actions"]');
      const rb = row.getBoundingClientRect().bottom;
      const below = [...scroller.querySelectorAll("*")].filter((el) => !row.contains(el) && el !== row && el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().bottom > rb + 0.5 && !el.contains(row)).map((el) => el.tagName);
      const leave = [...row.querySelectorAll("button")].some((b) => b.textContent.trim() === "Leave the table");
      return { gap: Math.round((scroller.getBoundingClientRect().bottom - 1 - rb) * 10) / 10, below, leave };
    });
    check(m.gap <= 1 && m.below.length === 0 && m.leave, `phone lobby 390x${h}, 4 seats scrolled down: sticky row ends at the card's bottom edge (gap ${m.gap}), nothing below it, Leave inside it`);
  }
  await phone.page.setViewportSize({ width: 390, height: 844 });
  await phone.page.evaluate(() => { document.querySelector('[data-testid="lobby-card"] > div').scrollTop = 0; });
  // #389: Ready and Start are in the first screenful of the phone lobby, with no scrolling.
  const inView = (t, sel) => t.page.evaluate((q) => {
    const r = document.querySelector(q).getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
  }, sel);
  check((await phone.page.evaluate(() => document.querySelector('[data-testid="lobby-card"] > div').scrollTop)) === 0, "phone lobby: the card starts unscrolled");
  const readyBtn = phone.page.getByRole("button", { name: "Ready", exact: true });
  check(await readyBtn.evaluate((el) => { const r = el.getBoundingClientRect(); const c = document.querySelector('[data-testid="lobby-card"]').getBoundingClientRect(); return r.top >= c.top && r.bottom <= c.bottom && r.bottom <= innerHeight; }), "phone lobby: Ready is inside the card and the 390x844 viewport without scrolling");
  // The host's phone: once three seats are ready, Start joins Ready and is in view too.
  const hp = await tab("Hana", true);
  await hp.page.getByRole("button", { name: "Host a table" }).click();
  const hCode = (await hp.page.getByTestId("table-code").textContent()).trim();
  const guests = [await tab("Gus"), await tab("Ivy")];
  for (const g of guests) {
    await g.page.getByPlaceholder(/code/i).fill(hCode);
    await g.page.getByRole("button", { name: "Join" }).click();
    await g.page.getByTestId("table-code").waitFor();
  }
  for (const t of [hp, ...guests]) await t.page.getByRole("button", { name: "Ready", exact: true }).click();
  const startBtn = hp.page.getByRole("button", { name: "Start", exact: true });
  await startBtn.waitFor({ timeout: 10_000 });
  check(await startBtn.evaluate((el) => { const r = el.getBoundingClientRect(); const c = document.querySelector('[data-testid="lobby-card"]').getBoundingClientRect(); return r.top >= c.top && r.bottom <= c.bottom && r.bottom <= innerHeight; }), "phone lobby: Start is inside the card and the 390x844 viewport without scrolling");
  check(await inView(hp, '[data-testid="lobby-actions"]'), "phone lobby: the Ready/Start row is wholly on screen");
  await shot(hp, "chat-phone-lobby-host.jpg");
  // #449: held sideways, the lobby is a two-column card, so with four seats and everyone ready the status line, Ready, Start
  // and Leave are all on screen with no scrolling (the card's own scroller stays at 0).
  const fourth = await tab("Fay");
  await fourth.page.getByPlaceholder(/code/i).fill(hCode);
  await fourth.page.getByRole("button", { name: "Join" }).click();
  await fourth.page.getByTestId("table-code").waitFor();
  await fourth.page.getByRole("button", { name: "Ready", exact: true }).click();
  await until(async () => (await hp.page.locator("li", { hasText: "Fay" }).count()) === 1, "Hana sees four seats");
  await until(async () => (await hp.page.getByTestId("lobby-status").textContent()).trim() === "Everyone is ready", "Hana sees Everyone is ready");
  for (const [w, h] of [[844, 390], [667, 375]]) {
    await hp.page.setViewportSize({ width: w, height: h });
    await shot(hp, `chat-phone-lobby-landscape-${w}x${h}.jpg`);
    await until(
      () => hp.page.evaluate(() => document.querySelector('[data-testid="lobby-card"]').getBoundingClientRect().width > innerWidth * 0.8),
      `${w}x${h}: the lobby card is the wide landscape card`,
    );
    const m = await hp.page.evaluate(() => {
      const card = document.querySelector('[data-testid="lobby-card"]');
      const inside = (el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; };
      const btn = (t) => [...card.querySelectorAll("button")].find((b) => b.textContent.trim() === t);
      const scrollers = [card, ...card.querySelectorAll("*")].filter((el) => getComputedStyle(el).overflowY === "auto" && el.getAttribute("data-testid") !== "chat-log");
      return {
        status: inside(document.querySelector('[data-testid="lobby-status"]')),
        ready: !!btn("Not ready") && inside(btn("Not ready")),
        start: !!btn("Start") && inside(btn("Start")),
        leave: !!btn("Leave the table") && inside(btn("Leave the table")),
        seats: [...card.querySelectorAll("li")].filter((li) => li.querySelector("span.rounded-full") && inside(li)).length,
        scroll: scrollers.map((el) => el.scrollHeight - el.clientHeight),
        top: card.getBoundingClientRect().top,
      };
    });
    check(m.status && m.ready && m.start && m.leave, `phone landscape ${w}x${h}, 4 seats all ready: status, Ready, Start and Leave are on screen without scrolling`);
    check(m.seats === 4, `phone landscape ${w}x${h}: all four seat rows are on screen`);
    check(m.scroll.every((n) => n <= 1), `phone landscape ${w}x${h}: nothing in the card scrolls (${m.scroll})`);
  }
  await fourth.page.context().close();
  for (const t of [hp, ...guests]) await t.page.context().close();
  for (const t of [...tabs, phone]) {
    await until(async () => (await t.page.locator("li", { hasText: "Moss" }).count()) >= 1, `${t.name} sees 4 seats`);
  }
  await statusIs(a, "0 of 4 ready");

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

  for (const [i, t] of [...tabs, phone].entries()) {
    await t.page.getByRole("button", { name: "Ready", exact: true }).click();
    await statusIs(a, i < 3 ? `${i + 1} of 4 ready` : "Everyone is ready");
  }
  // #417: on the 1280x720 desktop card every seat ready means code, four rows, the chat box and Ready/Start/Leave; Start and
  // Leave must still sit inside the card's visible box without scrolling.
  await a.page.getByRole("button", { name: "Start", exact: true }).waitFor();
  check((await a.page.evaluate(() => document.querySelector('[data-testid="lobby-card"] > div').scrollTop)) === 0, "desktop lobby: the card starts unscrolled");
  const insideCard = (name) =>
    a.page.getByRole("button", { name, exact: true }).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const c = document.querySelector('[data-testid="lobby-card"]').getBoundingClientRect();
      return { ok: r.top >= c.top && r.bottom <= c.bottom && r.bottom <= innerHeight, bottom: Math.round(r.bottom), card: Math.round(c.bottom) };
    });
  for (const name of ["Start", "Leave the table"]) {
    const r = await insideCard(name);
    check(r.ok, `desktop lobby at 1280x720: ${name} is inside the card (bottom ${r.bottom} <= card ${r.card}) without scrolling`);
  }
  await a.page.getByRole("button", { name: "Start" }).click();
  for (const t of tabs) await t.page.getByRole("button", { name: "Open chat" }).waitFor();
  check(true, "game: every tab shows the minimized dock, and the lobby lines did not count as unread");
  for (const t of tabs) check((await t.page.getByTestId("chat-unread").count()) === 0, `game: ${t.name} has no unread badge`);

  // #232: roll off for first place; whichever seat is up rolls, until setup starts.
  await until(async () => {
    for (const t of [...tabs, phone]) {
      const phase = await t.page.evaluate(() => {
        const s = window.__emberisle.getState();
        if (s.state?.phase === "rollOff" && s.state.current === s.localId && s.legal?.actions.includes("roll")) s.dispatch({ type: "roll" });
        return s.state?.phase;
      });
      if (phase === "setupSettle") return true;
    }
    return null;
  }, "the roll-off ends");

  // 5. Minimized dock covers no target. A line from another seat is showing under the button, and it must not catch clicks either.
  // If the phone won the roll-off, it places its first outpost and path so a desktop tab is up.
  const cur = await until(async () => {
    await phone.page.evaluate(() => {
      const s = window.__emberisle.getState();
      if (s.state?.current !== s.localId) return;
      if (s.legal?.outpost?.length) s.pickVertex(s.legal.outpost[0]);
      else if (s.state.phase === "setupRoad" && s.legal?.path?.length) s.pickEdge(s.legal.path[0]);
    });
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
  await polish(cur, "minimized", '[aria-label^="Open chat"]');
  await polish(cur, "preview", '[data-testid="chat-preview"] li', 0);
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
      if (el?.closest('[aria-label^="Open chat"], [data-testid="chat-preview"], [aria-label="Table chat"]')) out.chat.push(id);
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
  for (const t of tabs) {
    await t.page.locator("[data-testid=reaction]").waitFor({ state: "detached", timeout: 6000 });
    check((await t.page.locator("[data-testid=reaction]").count()) === 0, `reaction: gone after its lifetime on ${t.name}`);
  }

  // 3. Tab 1 clicks tab 2's card (#161): an accordion menu in the rail with the card's 4 facts, a reaction aimed at Tide,
  // Mention fills the input, and Esc, the same card, and a click outside all close it.
  const bId = await store(b, () => window.__emberisle.getState().localId);
  const card = a.page.getByTestId(`rail-${bId}`).getByRole("button");
  const menu = a.page.getByTestId("player-menu");
  await card.click();
  await menu.waitFor();
  check((await card.getAttribute("aria-expanded")) === "true", "menu: Tide's card is a button with aria-expanded");
  // The roll-off die tile (#232) sits next to the vp in setup; read the card without it so its face does not run into a number.
  const cardText = await a.page.getByTestId(`rail-${bId}`).evaluate((el) => {
    const copy = el.cloneNode(true);
    for (const d of copy.querySelectorAll('[data-testid="rolloff-die"]')) d.remove();
    return copy.textContent;
  });
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
    await polish(t, "reaction target", '[data-testid="reaction"] span', 0);
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
  // #377: the badge is part of the button's name.
  await a.page.getByRole("button", { name: "Open chat, 1 unread", exact: true }).waitFor({ timeout: 5000 });
  check(true, 'unread: the minimized button is named "Open chat, 1 unread"');
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

  // #377: Enter on a focused button presses it; the chat shortcut is only for focus on the page itself.
  const chatOpen = () => a.page.evaluate(() => window.__emberisle.getState().chatOpen);
  const how = a.page.getByRole("button", { name: "How to play" });
  await how.focus();
  await a.page.keyboard.press("Enter");
  await a.page.getByRole("dialog", { name: "How to play" }).waitFor({ timeout: 5000 });
  check((await chatOpen()) === false, "Enter on How to play opens its dialog and leaves the chat closed");
  await a.page.keyboard.press("Escape");
  await a.page.getByRole("dialog", { name: "How to play" }).waitFor({ state: "detached" });
  await a.page.getByRole("button", { name: "Open chat" }).click();
  const log = a.page.getByTestId("chat-log");
  await log.waitFor();
  check((await log.getAttribute("tabindex")) === "0" && (await log.getAttribute("role")) === "log", "the chat log is a focusable role=log");
  const min = a.page.getByRole("button", { name: "Minimize chat" });
  await min.focus();
  await a.page.keyboard.press("Enter");
  await a.page.getByRole("button", { name: "Open chat" }).waitFor({ timeout: 5000 });
  check((await chatOpen()) === false, "Enter on Minimize chat minimizes the dock");
  await a.page.evaluate(() => document.activeElement?.blur());
  await a.page.keyboard.press("Enter");
  await a.page.waitForFunction(() => document.activeElement?.id === "chat-input", null, { timeout: 5000 });
  check(await chatOpen(), "Enter with focus on the page still opens the chat and focuses the input");
  await a.page.getByPlaceholder("Say something…").press("Escape");
  await a.page.getByRole("button", { name: "Open chat" }).waitFor();

  // 5. Phone: the open dock is a bottom sheet, and the tap that closes it does not reach the board.
  await phone.page.getByRole("button", { name: "Open chat" }).waitFor();
  check((await phone.page.getByTestId("chat-sheet").count()) === 0, "phone: Play starts with the sheet closed although chat was remembered open");
  check((await phone.page.evaluate(() => localStorage.getItem("emberisle-chat-open"))) === "1", "phone: the remembered open state is left in storage");
  r = await box(phone, '[aria-label^="Open chat"]');
  check(r.right > r.vw - 20 && r.bottom < r.vh - 150, "phone: the minimized button sits bottom-right above the hand bar");
  await polish(phone, "minimized", '[aria-label^="Open chat"]');
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
  await phone.page.getByRole("button", { name: "Emotes", exact: true }).click();
  await phone.page.getByTestId("emote-tray").waitFor();
  await polish(phone, "open with emotes", undefined, 13);
  await phone.page.getByRole("button", { name: "Emotes", exact: true }).click();
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
  await b.page.getByPlaceholder("Say something…").fill("@Ember polish");
  await b.page.getByPlaceholder("Say something…").press("Enter");
  await a.page.getByTestId("chat-log").locator("mark").getByText("@Ember", { exact: true }).waitFor();
  await a.page.getByRole("button", { name: "Emotes", exact: true }).click();
  await a.page.getByTestId("emote-tray").waitFor();
  await polish(a, "open with emotes and mention", undefined, 13);
  await a.page.getByRole("button", { name: "Emotes", exact: true }).click();
  const logKey = () => a.page.evaluate(() => localStorage.getItem("emberisle-log-filter"));
  await a.page.getByRole("button", { name: "Chat", exact: true }).click();
  await until(async () => ((await rowsOf(a)).length === 0 ? true : null), "the Chat chip hides the game rows");
  check((await a.page.getByTestId("chat-log").locator("li", { hasText: "hello" }).count()) === 1 && (await logKey()) === "chat", 'game log: the Chat chip keeps the chat lines and stores "chat"');
  await polish(a, "Chat filter selected", undefined, 12);
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
  await polish(a, "copy fallback", undefined, 13);
  await phone.page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }));
  await phone.page.getByRole("button", { name: "Copy log" }).click();
  await phone.page.getByTestId("copy-fallback").waitFor();
  await polish(phone, "copy fallback", undefined, 13);

  // A real watcher exposes the muted read-only note, as well as the filters and copy fallback, at both sizes.
  for (const isPhone of [false, true]) {
    const reader = await tab("Reader", isPhone);
    await reader.page.getByPlaceholder(/code/i).fill(tableCode);
    await reader.page.getByRole("button", { name: "Watch", exact: true }).click();
    await reader.page.getByRole("button", { name: "Open chat" }).click();
    await reader.page.getByTestId("chat-readonly").waitFor();
    await polish(reader, "read-only", undefined, 4);
    await reader.page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }));
    await reader.page.getByRole("button", { name: "Copy log" }).click();
    await reader.page.getByTestId("copy-fallback").waitFor();
    await polish(reader, "read-only copy fallback", undefined, 5);
    await reader.page.context().close();
  }

  // Versus bots the menu shows only the facts (and the bank trade on your main turn, not during setup).
  const solo = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  watch("Solo", solo);
  await solo.goto(`http://127.0.0.1:${PORT}/`);
  await solo.getByRole("button", { name: "Play", exact: true }).click();
  // The human rolls off (#232) when it is up; the bots roll on the app's timer.
  await solo.waitForFunction(() => {
    const s = window.__emberisle.getState();
    if (s.state?.phase === "rollOff" && s.state.current === s.localId) s.dispatch({ type: "roll" });
    return s.state?.phase === "setupSettle";
  }, null, { polling: 100 });
  await solo.getByTestId("rail-p1").getByRole("button").click();
  await solo.getByTestId("player-menu").waitFor();
  check(
    (await solo.getByTestId("player-menu").locator("dd").count()) === 4 && (await solo.getByTestId("player-menu").locator("button").count()) === 0,
    "bots: the menu shows the 4 facts and nothing else",
  );
  await solo.context().close();

  // 6.
  check(polishFailures.length === 0, `chat polish at both sizes${polishFailures.length ? `\n${polishFailures.join("\n")}` : ""}`);
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
