// #899 (Chat C): one chat button, a panel with two tabs (Chat with the six emoji, Sounds & stickers with ten chips and the
// sticker), seat bubbles beside the card and never on the name (lobby, rail and strip), closed-chat line bubbles, the #895
// lobby hit test at 1280x720, a phone sheet that leaves the strip and its bubbles clear, and reduced motion.
// #160: three headless tabs at 1280x720 chat through server/host.mjs. Lobby chat, a floating reaction,
// the unread badge and the remembered open/minimized state, a minimized dock that covers no board target, the player action
// menu in the rail and under the phone seat strip (#161), the game log in the dock and Copy log in the Table menu (#305, #899),
// the lobby status line as seats join and ready up (#418), Start and Leave inside the 1280x720 lobby card (#417),
// #460: computed glass surfaces, 12 px controls, one primary and >= 4.5:1 text contrast over black, on desktop and phone,
// including the emoji, the sound chips, copy fallback and read-only chat. Zero console errors.
// #467: board reactions, all six emoji, image delivery, keyboard/cooldown, coalescing, reduced motion and host rejection.
// #477, #899: Open chat (the one chat button) sits in the top row beside the Table menu: at 390x844, 360x640 and 844x390 with notch insets, on
// an own Roll turn and another seat's turn, it is whole, in the safe area, clear of the menu and status, 12 px from every board target.
// Design: docs/design/chat.md "Test plan". Screenshots go to test-results/.
import { spawn } from "node:child_process";
import { hostPort as waitForHostPort } from "./proof-host-port.mjs";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8094;
const SHOTS = fileURLToPath(new URL("../test-results/", import.meta.url));
const HUD_STACK = ".pointer-events-none.absolute.bottom-0.inset-x-0.z-10 > .relative > .overflow-y-auto";
mkdirSync(SHOTS, { recursive: true });

// Rooms go to a temp folder, dropped on exit, so the real host never restores this proof's tables (#207).
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
  let failed = false, failure, baseline;
  try {
    baseline = await t.page.evaluate(() => {
      const isle = window.__isle, draw = isle.draw;
      if (typeof draw !== "function") throw new Error("chat capture: scene draw hook missing");
      const capture = window.__chatShot = { isle, draw, own: Object.hasOwn(isle, "draw"), attempts: 0, completed: 0 };
      // Retain the two actual frames required below, then let the compositor capture them without
      // competing with further scene draws. DOM RAFs, clocks and reaction expiry keep running.
      let remaining = 2;
      isle.draw = function (...args) {
        capture.attempts++;
        if (!remaining) return;
        remaining--;
        const result = draw.apply(this, args);
        capture.completed++;
        return result;
      };
      window.__draw = true;
      return { renders: isle.renders, origin: performance.timeOrigin };
    });
    await t.page.waitForFunction((n) => window.__isle.renders >= n + 2, baseline.renders, { timeout: 15_000 });
    await t.page.screenshot({ path: `${SHOTS}${file}`, type: "jpeg", quality: 70 });
  } catch (error) {
    failed = true;
    failure = error;
    // Reporting happens after the original guard failed; it cannot make that failed check pass.
    let reportTimer;
    try {
      const context = await Promise.race([
        t.page.evaluate(() => {
          const capture = window.__chatShot, saved = capture?.isle, current = window.__isle;
          const gl = saved?.renderer?.getContext();
          return {
            origin: performance.timeOrigin, sameRenderer: saved === current,
            savedRenders: saved?.renders, currentRenders: current?.renders,
            attempts: capture?.attempts, completed: capture?.completed,
            hidden: document.hidden, motionReduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
            rendererCalm: saved?.calm(), stopped: saved?.stopped, connected: saved?.renderer?.domElement?.isConnected,
            busyUntil: saved?.busyUntil, lastFrame: saved?.lastFrame, now: performance.now(),
            contextLost: gl?.isContextLost(), fence: saved?.fence && !gl.isContextLost() ? gl.getSyncParameter(saved.fence, gl.SYNC_STATUS) : null,
          };
        }),
        new Promise((resolve) => { reportTimer = setTimeout(() => resolve({ reportTimedOut: true }), 3000); }),
      ]);
      console.log("capture failure context", file, { baseline, ...context });
    } catch (reportError) {
      console.log("capture failure context unavailable", file, reportError.message);
    } finally {
      clearTimeout(reportTimer);
    }
  }
  try {
    await t.page.evaluate(() => {
      const saved = window.__chatShot;
      if (saved) {
        if (saved.own) saved.isle.draw = saved.draw;
        else delete saved.isle.draw;
        delete window.__chatShot;
      }
      window.__draw = false;
    });
  } catch (error) {
    if (failed) console.log("FAIL capture cleanup", error.stack ?? error.message);
    else { failed = true; failure = error; }
  }
  if (failed) throw failure;
}
const check = (ok, what) => {
  if (!ok) throw new Error(what);
  console.log(`ok ${what}`, `+${((Date.now() - T0) / 1000).toFixed(1)}s`);
};

// #1129: the five newest stickers and the two newest soundboard chips are all on the open Sounds & stickers tab at this size: each
// sticker's image has loaded, each button scrolls fully into the viewport, and no sticker or chip is under 32 px (the existing sticker size on a mouse; the touch sizes are checked by the chip lines above).
// With PROOF_SHOTS set, a screenshot of the tab goes to that folder.
const NEW_STICKERS = ["monkey-pet", "side-eye", "banana-guy", "glasses-glance", "dark-smile"];
const NEW_CHIPS = ["Play sound Real badman", "Play sound Gong"];
async function newContent(t, size) {
  for (const id of NEW_STICKERS) {
    const button = t.page.getByTestId("stickers").getByRole("button", { name: `React ${id}`, exact: true });
    await button.scrollIntoViewIfNeeded();
    const m = await button.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const img = el.querySelector("img");
      return { loaded: Boolean(img && img.complete && img.naturalWidth > 0), inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, w: r.width, h: r.height };
    });
    check(m.loaded && m.inView && m.w >= 32 - 0.5 && m.h >= 32 - 0.5, `${size}: sticker ${id} is in the Sounds & stickers tab, loaded, on screen, ${m.w.toFixed(0)}x${m.h.toFixed(0)}`);
  }
  for (const name of NEW_CHIPS) {
    const chip = t.page.getByTestId("soundboard").getByRole("button", { name, exact: true });
    await chip.scrollIntoViewIfNeeded();
    const m = await chip.evaluate((el) => { const r = el.getBoundingClientRect(); return { inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, h: r.height }; });
    check(m.inView && m.h >= 32 - 0.5, `${size}: chip "${name}" is on screen at ${m.h.toFixed(0)} px tall`);
  }
  if (process.env.PROOF_SHOTS) {
    await t.page.getByTestId("stickers").scrollIntoViewIfNeeded();
    await t.page.screenshot({ path: `${process.env.PROOF_SHOTS}/stickers-${size}.png` });
  }
}

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
      if (!radii.every((r) => Math.abs(r - 8) <= 0.01)) {
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

// The chat log as a person sees it: how many whole lines are on screen (not clipped by the card or covered by the sticky row),
// whether the newest is one of them, and the text size.
const logView = (t) => t.page.evaluate(() => {
  const log = document.querySelector('[data-testid="chat-log"]');
  const box = log.getBoundingClientRect();
  const lines = [...log.querySelectorAll("li")];
  const shown = (li) => {
    const r = li.getBoundingClientRect();
    if (r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5 || r.top < 0 || r.bottom > innerHeight) return false;
    const hit = document.elementFromPoint(r.left + Math.min(12, r.width / 2), r.top + r.height / 2);
    return Boolean(hit && li.contains(hit));
  };
  const last = lines.at(-1);
  return {
    total: lines.length,
    whole: lines.filter(shown).length,
    newest: Boolean(last && shown(last)),
    newestText: last?.textContent ?? "",
    font: last ? parseFloat(getComputedStyle(last).fontSize) : 0,
    size: `${innerWidth}x${innerHeight}`,
  };
});
// The rect the map is fitted to: if opening the chat refit the map, these change.
const hole = (t) => t.page.evaluate(() => {
  const el = document.querySelector("canvas")?.parentElement;
  return ["top", "right", "bottom", "left"].map((k) => el?.style.getPropertyValue(`--hole-${k}`)).join();
});
// The host allows a burst of five chat lines, then one a second, so lines are sent 700 ms apart.
const SAY = async (t, text) => {
  await t.page.evaluate((x) => window.__emberisle.getState().sendChat(x), text);
  await new Promise((r) => setTimeout(r, 700));
};

// #899 (Chat C): the one chat button opens the panel, whose Chat tab has the six emoji right above the input.
const openChat = async (t) => {
  if (!(await store(t, () => window.__emberisle.getState().chatOpen))) await t.page.getByRole("button", { name: /^Open chat/ }).click();
  await t.page.getByTestId("emoji-row").waitFor();
  await t.page.waitForFunction(() => !document.querySelector('[data-testid="emoji-row"] button')?.disabled);
};
const closeChat = async (t) => {
  if (await store(t, () => window.__emberisle.getState().chatOpen)) await t.page.getByRole("button", { name: "Close chat" }).click();
  await t.page.getByRole("button", { name: /^Open chat/ }).waitFor();
};
const showTab = async (t, name) => {
  await t.page.getByRole("tab", { name, exact: true }).click();
  await t.page.getByRole("tab", { name, exact: true, selected: true }).waitFor();
};

// ---- repro harness (temporary, local only) ----
const RATE = Number(process.env.THROTTLE || 1);
const WHO = process.env.WHO || "a";
const ORDER = process.env.ORDER || "pr";
const diag = [];
try {
  const tabs = [await tab("Ember"), await tab("Tide"), await tab("Pine")];
  const [a, b, c] = tabs;
  const phone = await tab("Moss", true);
  await a.page.getByRole("button", { name: "Host a table" }).click();
  const tableCode = (await a.page.getByTestId("table-code").textContent()).trim();
  for (const t of [b, c, phone]) {
    await t.page.getByPlaceholder(/code/i).fill(tableCode);
    await t.page.getByRole("button", { name: "Join", exact: true }).click();
    await t.page.getByTestId("table-code").waitFor();
  }
  for (const t of [...tabs, phone]) await t.page.getByRole("button", { name: "Ready", exact: true }).click();
  await a.page.getByRole("button", { name: "Start", exact: true }).and(a.page.locator(":enabled")).waitFor();
  await a.page.getByRole("button", { name: "Start", exact: true }).click();
  for (const t of [...tabs, phone]) await t.page.getByRole("button", { name: /^Open chat/ }).waitFor();
  a.page.on("console", (m) => { if (m.text().startsWith("DIAG ")) diag.push(m.text().slice(5)); });
  await a.page.evaluate(() => {
    const emit = (name, d) => console.log("DIAG " + JSON.stringify({ t: Math.round(Date.now() % 100000), name, d }));
    document.addEventListener("click", (e) => { const b = e.target.closest?.("button"); if (b && /mute/i.test(b.getAttribute("aria-label") || "")) emit("page-click", b.getAttribute("aria-label")); }, true);
    let prev = 0;
    window.__emberisle.subscribe((s) => { if (s.reactions.length !== prev) { prev = s.reactions.length; emit("store-reactions", s.reactions.map((r) => r.emote)); } });
    new MutationObserver(() => { const n = document.querySelectorAll('[data-testid="reaction"][data-emote="🔥"]').length; if (n !== window.__dl) { window.__dl = n; emit("fire-dom", n); } }).observe(document.body, { childList: true, subtree: true });
  });
  const node = (name) => diag.push(JSON.stringify({ t: Math.round(Date.now() % 100000), name, node: true }));

  const mutedSeat = await store(c, () => window.__emberisle.getState().seatId);
  const mutedPlayer = await store(c, () => window.__emberisle.getState().localId);
  await a.page.getByRole("button", { name: /^Open chat/ }).click();
  await a.page.getByRole("button", { name: "Mute players", exact: true }).click();
  await a.page.getByTestId(`chat-mute-seat-${mutedSeat}`).click();
  if (process.env.METRICS) {
    for (const [n, t] of Object.entries({ a, b, c, phone })) {
      const cdp = await t.page.context().newCDPSession(t.page);
      await cdp.send("Performance.enable");
      const m0 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
      await new Promise((r) => setTimeout(r, 3000));
      const m1 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
      const frames = await t.page.evaluate(() => new Promise((res) => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
      console.log(n, "busy over 3s:", JSON.stringify({ task: +(m1.TaskDuration - m0.TaskDuration).toFixed(3), script: +(m1.ScriptDuration - m0.ScriptDuration).toFixed(3), layout: +(m1.LayoutDuration - m0.LayoutDuration).toFixed(3), recalc: +(m1.RecalcStyleDuration - m0.RecalcStyleDuration).toFixed(3) }), "rAF/s:", frames);
    }
  }
  if (RATE > 1) {
    for (const t of WHO.split(",").map((w) => ({ a, b, c, phone })[w])) {
      const cdp = await t.page.context().newCDPSession(t.page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: RATE });
    }
    console.log(`injected: CPU throttling rate ${RATE} on ${WHO}`);
  }
  const tStart = Date.now();
  if (ORDER === "fixed") {
    console.log("running the committed proof section verbatim");
  await openChat(c);
  // #1495: the reaction's 2 s lifetime runs in real time from Ember's receipt. Waits that need Ember's frames (store polling,
  // the Unmute click's actionability) took longer than that on a starved runner, so the reaction left before Unmute.
  // Do them before Pine sends: check Unmute is actionable, and arm an in-page watch that reads the muted view on receipt.
  const unmute = a.page.getByRole("button", { name: "Unmute player Pine", exact: true });
  await unmute.click({ trial: true });
  const unmuteBox = await unmute.boundingBox();
  const unmuteAt = { x: unmuteBox.x + unmuteBox.width / 2, y: unmuteBox.y + unmuteBox.height / 2 };
  const mutedView = a.page.evaluate(
    ({ seat, player, emote, at }) =>
      new Promise((resolve, reject) => {
        const read = () => ({
          float: document.querySelectorAll(`[data-testid="rail-${player}"] [data-testid="reaction"][data-emote="${emote}"]`).length,
          line: [...document.querySelectorAll(`[data-testid="chat-log"] [data-testid="react-line"][data-emote="${emote}"]`)].filter((el) => el.textContent.includes("Pine")).length,
          hit: document.elementFromPoint(at.x, at.y)?.closest("button")?.getAttribute("aria-label") ?? null,
        });
        const landed = (s) => s.reactions.some((r) => r.seat === seat && r.emote === emote);
        const timer = setTimeout(() => (off(), reject(new Error("Timeout 30000ms exceeded waiting for Pine's reaction in Ember's store"))), 30_000);
        // After the store update's render has committed.
        const done = () => (clearTimeout(timer), off(), setTimeout(() => resolve(read())));
        const off = window.__emberisle.subscribe((s) => landed(s) && done());
        if (landed(window.__emberisle.getState())) done();
      }),
    { seat: mutedSeat, player: mutedPlayer, emote: "🔥", at: unmuteAt },
  );
  await c.page.getByTestId("emoji-row").getByRole("button", { name: "React fire", exact: true }).click();
  const hidden = await mutedView;
  const mutedFloat = a.page.locator(`[data-testid="rail-${mutedPlayer}"] [data-testid="reaction"][data-emote="🔥"]`);
  const mutedReactLine = a.page.getByTestId("chat-log").locator('[data-testid="react-line"][data-emote="🔥"]').filter({ hasText: "Pine" });
  check(hidden.float === 0 && hidden.line === 0, "mute: Pine's reaction bubble and its log line are hidden only in Ember's view");
  if (hidden.hit !== "Unmute player Pine") throw new Error(`mute: Unmute moved before the click (${hidden.hit} at its centre)`);
  await a.page.mouse.click(unmuteAt.x, unmuteAt.y);
  await mutedFloat.waitFor({ timeout: 1500 });
  await mutedReactLine.first().waitFor({ timeout: 1500 });
  check(true, "mute: unmuting Pine restores the active reaction and its log line");
    node("fixed-section-done");
    throw Object.assign(new Error("fixed"), { ok: true });
  }
  await openChat(c);
  node("react-click-start");
  let box;
  if (ORDER === "armed") { const unmute = a.page.getByRole("button", { name: "Unmute player Pine", exact: true }); await unmute.click({ trial: true }); box = await unmute.boundingBox(); node("trial-done"); }
  const armed = ORDER === "armed" ? a.page.evaluate(({ seat, player }) => new Promise((res) => {
    const look = (s) => s.reactions.some((r) => r.seat === seat && r.emote === "🔥");
    const done = () => queueMicrotask(() => res({
      float: document.querySelectorAll(`[data-testid="rail-${player}"] [data-testid="reaction"][data-emote="🔥"]`).length,
      line: [...document.querySelectorAll('[data-testid="chat-log"] [data-testid="react-line"][data-emote="🔥"]')].filter((e) => e.textContent.includes("Pine")).length,
    }));
    if (look(window.__emberisle.getState())) return done();
    const off = window.__emberisle.subscribe((s) => { if (look(s)) { off(); done(); } });
  }), { seat: mutedSeat, player: mutedPlayer }) : null;
  await c.page.getByTestId("emoji-row").getByRole("button", { name: "React fire", exact: true }).click();
  node("react-click-done");
  if (armed) {
    const h = await armed;
    node("armed-done");
    check(h.float === 0 && h.line === 0, "mute: Pine's reaction bubble and its log line are hidden only in Ember's view");
    await a.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    node("unmute-click-done");
    const mutedFloat = a.page.locator(`[data-testid="rail-${mutedPlayer}"] [data-testid="reaction"][data-emote="🔥"]`);
    await mutedFloat.waitFor({ timeout: 1500 });
    node("float-visible");
    await a.page.getByTestId("chat-log").locator('[data-testid="react-line"][data-emote="🔥"]').filter({ hasText: "Pine" }).first().waitFor({ timeout: 1500 });
    check(true, "mute: unmuting Pine restores the active reaction and its log line");
    throw Object.assign(new Error("armed variant passed"), { ok: true });
  }
  if (ORDER === "orig") { await closeChat(c); node("closeChat-done"); }
  await a.page.waitForFunction(({ seat, emote }) => window.__emberisle.getState().reactions.some((r) => r.seat === seat && r.emote === emote), { seat: mutedSeat, emote: "🔥" });
  node("store-wait-done");
  const mutedFloat = a.page.locator(`[data-testid="rail-${mutedPlayer}"] [data-testid="reaction"][data-emote="🔥"]`);
  const mutedReactLine = a.page.getByTestId("chat-log").locator('[data-testid="react-line"][data-emote="🔥"]').filter({ hasText: "Pine" });
  check((await mutedFloat.count()) === 0 && (await mutedReactLine.count()) === 0, "mute: Pine's reaction bubble and its log line are hidden only in Ember's view");
  node("hidden-check-done");
  await a.page.getByRole("button", { name: "Unmute player Pine", exact: true }).click();
  node("unmute-click-done");
  await mutedFloat.waitFor({ timeout: 1500 });
  node("float-visible");
  await mutedReactLine.first().waitFor({ timeout: 1500 });
  check(true, "mute: unmuting Pine restores the active reaction and its log line");
  if (ORDER !== "orig") await closeChat(c);
  console.log("repro ok", Date.now() - tStart, "ms");
} catch (e) {
  if (e.ok) console.log("repro ok (" + ORDER + ")"); else { console.log("FAIL", e.message); code = 1; }
} finally {
  await new Promise((r) => setTimeout(r, 2500));
  console.log("timeline:\n" + diag.sort((x, y) => JSON.parse(x).t - JSON.parse(y).t).join("\n"));
  await browser.close();
  await vite.close();
  host.kill();
  await Promise.race([once(host, "exit"), new Promise((r) => setTimeout(r, 3000).unref())]);
}
process.exit(code);
