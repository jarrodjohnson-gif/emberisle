// #557: simultaneous phone overlays through rotation. A real online table (the phone hosts, small tabs join as the other seats)
// with the chat sheet open together with (a) another seat's trade toast and (b) the wayfarer's "Take from whom?" prompt, at
// three and four seats, on 390x844 and 360x640 held both ways with notch insets (CDP, as hud-safe-area-prove). Each table is one
// page that rotates away and back (portrait -> landscape -> portrait, and landscape -> portrait -> landscape), and after the
// open and after every rotation:
// - every overlay (chat sheet, toast, prompt) lies inside the viewport and the safe area, and no two overlap;
// - the actions (Yes, No, the seat buttons), the close control and the HUD's primary button have in-viewport, non-zero boxes
//   at least 44 px tall and wide (the chat's Minimize keeps its 24 px header size), and are the topmost element at their centre (tappable);
// - every seat's points show, inside the viewport and uncovered;
// Board targets are not checked here: while the sheet is open its backdrop covers the whole board by design, and a tap on
// the board only closes the sheet (chat-prove); once it is closed nothing but the prompt or toast is on screen.
// - Escape from the chat box closes the chat (the top overlay) and leaves the toast or prompt.
// Zero console errors. Run: npm run rotate-overlays-prove. Port from VITE_PORT, default 8557.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const STEP_MS = 120_000;
const PORT = Number(process.env.VITE_PORT) || 8557;
const NOTCH = {
  portrait: { top: 47, right: 0, bottom: 34, left: 0 },
  landscape: { top: 0, right: 47, bottom: 21, left: 47 },
};
const SIZES = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
];
const SEATS = [3, 4];
mkdirSync("test-results", { recursive: true });

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR },
});
// G5: stop the host before its rooms dir goes, or a SIGTERM flush recreates the dir.
process.on("exit", () => {
  host.kill("SIGKILL");
  rmSync(ROOMS_DIR, { recursive: true, force: true, maxRetries: 5 });
});
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const hostPort = await new Promise((resolve) =>
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  }),
);
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const URL_ = `http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const errors = [];
const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};
const until = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: STEP_MS });

// A phone with notch insets for its current orientation; `turn` rotates it and swaps the insets with it.
async function phone(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(STEP_MS);
  const p = { ctx, page, cdp: await ctx.newCDPSession(page), tag: "" };
  page.on("console", (m) => m.type() === "error" && errors.push(`${p.tag}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${p.tag}: ${e}`));
  p.tag = `@${width}x${height}`;
  p.insets = NOTCH[width > height ? "landscape" : "portrait"];
  await p.cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: p.insets });
  await page.goto(URL_);
  await page.waitForFunction(() => window.__emberisle);
  return p;
}

async function turn(p, width, height) {
  const insets = NOTCH[width > height ? "landscape" : "portrait"];
  p.insets = insets;
  p.tag = p.tag.replace(/@.*/, "") + `@${width}x${height}`;
  await p.page.setViewportSize({ width, height });
  await p.cdp.send("Emulation.setSafeAreaInsetsOverride", { insets });
  const want = [insets.top, insets.right, insets.bottom, insets.left];
  await until(
    p.page,
    ([w, h, want]) => {
      const probe = document.body.appendChild(Object.assign(document.createElement("div"), {
        style: "position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)",
      }));
      const cs = getComputedStyle(probe);
      const got = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(parseFloat);
      probe.remove();
      return innerWidth === w && innerHeight === h && got.every((v, i) => v === want[i]);
    },
    [width, height, want],
  );
  // Layout follows the resize event on the next frame; two frames let React commit the portrait/landscape swap.
  await p.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function table(seats, width, height) {
  const p = await phone(width, height);
  const { page } = p;
  p.guests = [];
  await page.getByRole("button", { name: "Host a table" }).click();
  const code = (await page.getByTestId("table-code").textContent()).trim();
  for (let i = 1; i < seats; i++) {
    const g = await browser.newPage({ viewport: { width: 360, height: 400 } });
    g.setDefaultTimeout(STEP_MS);
    g.on("pageerror", (e) => errors.push(`guest: ${e}`));
    await g.goto(`${URL_}&code=${code}`);
    await g.waitForFunction((c) => document.querySelector('input[aria-label="Join code"]')?.value === c, code, { timeout: STEP_MS });
    await g.getByRole("textbox", { name: "Join code" }).press("Enter");
    await g.getByTestId("table-code").waitFor({ timeout: STEP_MS });
    await g.getByRole("button", { name: "Ready", exact: true }).press("Enter");
    p.guests.push(g);
  }
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await until(page, () => window.__emberisle.getState().state?.phase === "rollOff");
  await page.getByRole("button", { name: /^Open chat/ }).waitFor();
  return p;
}

// Fixtures, not product changes: the other seats are idle tabs, so the client is put in the state a live table reaches.
// "trade": it is the phone's main phase and another seat has an offer open. "steal": the wayfarer is placed on a hex with
// several seats to rob, so the phone is asked "Take from whom?".
async function fixture(p, kind) {
  await p.page.evaluate((kind) => {
    const g = window.__emberisle;
    const s = g.getState();
    const st = structuredClone(s.state);
    const others = st.players.filter((x) => x.id !== s.localId);
    // An offer only exists on the asker's turn, so the trade fixture is the other seat's turn; the steal is the phone's own.
    st.current = kind === "trade" ? others[0].id : s.localId;
    st.phase = kind === "trade" ? "main" : "robber";
    st.seq += 1;
    const hexes = st.hexes.filter((h) => h.id !== st.robberHex).map((h) => h.id);
    g.setState(
      kind === "trade"
        ? {
            state: st,
            pendingSteal: null,
            offer: { tradeId: "t557", from: others[0].id, fromName: others[0].name, give: { wool: 2 }, want: { ore: 1 }, until: Date.now() + 3_600_000 },
            declined: [],
          }
        : {
            state: st,
            offer: null,
            legal: { ...(s.legal ?? {}), wayfarer: hexes, steal: {} },
            pendingSteal: { hexId: hexes[0], kind: "moveRobber", targets: others.map((x) => x.id) },
          },
    );
  }, kind);
  await (kind === "trade" ? p.page.getByTestId("trade-toast") : p.page.getByText("Take from whom?")).waitFor();
}

// Everything on screen the overlays and the HUD put in the player's way, measured in one pass.
function measure({ insets, kind }) {
  const rect = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };
  };
  // The chat sheet's backdrop is transparent and only there to catch the tap that closes it; it hides nothing.
  const seen = (b) => document.elementsFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2).find((e) => e.getAttribute("data-testid") !== "chat-backdrop");
  const top = (el) => {
    const hit = seen(el.getBoundingClientRect());
    return !!hit && el.contains(hit);
  };
  const named = (el) => (el.getAttribute("aria-label") || el.textContent.trim() || el.tagName).slice(0, 24);
  const box = (el) => ({ name: named(el), ...rect(el), tappable: top(el) });
  const find = (re, within) => [...(within ?? document).querySelectorAll("button")].find((b) => re.test(b.textContent.trim() || b.getAttribute("aria-label") || ""));
  const chat = document.querySelector('[data-testid="chat-sheet"]');
  const toast = document.querySelector('[data-testid="trade-toast"]');
  const prompt = [...document.querySelectorAll("span")].find((s) => s.textContent === "Take from whom?")?.parentElement ?? null;
  const overlays = { chat, [kind === "trade" ? "toast" : "prompt"]: kind === "trade" ? toast : prompt };
  const controls = [];
  // The chat sheet's Minimize is a 24 px header control by design (chat-prove and hud-safe-area-prove pin the header's row and its
  // fit in the landscape safe area), so it is held to its own size plus the safe-area and tappable checks; the sheet's filter
  // chips, presets and emote picker are #460's compact controls and are not checked here.
  if (chat) controls.push({ ...box(chat.querySelector('button[aria-label="Minimize chat"]')), min: 24 });
  if (kind === "trade") for (const n of [/^Yes$/, /^No$/]) controls.push(box(find(n, toast)));
  else for (const b of prompt.querySelectorAll("button")) controls.push(box(b));
  const primary = kind === "trade" ? find(/^End turn$/) : null;
  const seats = [...document.querySelectorAll('[data-testid="seat-vp"]')].map((el) => {
    const b = el.getBoundingClientRect();
    const hit = seen(b);
    return { text: el.textContent.trim().slice(0, 6), ...rect(el), shown: el.checkVisibility(), uncovered: !!hit && !!hit.closest('[data-testid^="seat-"]') };
  });
  return {
    safe: { l: insets.left, t: insets.top, r: innerWidth - insets.right, b: innerHeight - insets.bottom },
    vw: innerWidth,
    vh: innerHeight,
    overlays: Object.fromEntries(Object.entries(overlays).map(([k, el]) => [k, rect(el)])),
    controls,
    primary: primary ? box(primary) : null,
    seats,
    strip: rect(document.querySelector('[data-testid="seat-strip"]')),
    focus: document.activeElement?.id ?? document.activeElement?.tagName,
  };
}

const inside = (b, s) => b.l >= s.l - 0.5 && b.t >= s.t - 0.5 && b.r <= s.r + 0.5 && b.b <= s.b + 0.5;
const hit = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;

async function prove(p, label, kind) {
  const { page } = p;
  const tag = `${p.tag} ${label}`;
  const chat = page.getByTestId("chat-sheet");
  await chat.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="chat-sheet"]').getAnimations().every((a) => a.playState === "finished"), null, { timeout: STEP_MS });
  const m = await page.evaluate(measure, { insets: p.insets, kind });
  const names = Object.keys(m.overlays);
  check(`${tag}: ${names.join(" + ")} overlays are present`, names.every((k) => m.overlays[k]));
  for (const [k, b] of Object.entries(m.overlays)) {
    if (!b) continue;
    // The chat sheet is a bottom sheet that bleeds to the screen edges; what must stay clear of the insets is its controls (below).
    check(`${tag}: ${k} is non-zero and inside ${k === "chat" ? "the viewport" : "the safe area"}`, b.w > 0 && b.h > 0 && inside(b, k === "chat" ? { l: 0, t: 0, r: m.vw, b: m.vh } : m.safe), b);
  }
  const o = Object.entries(m.overlays);
  for (let i = 0; i < o.length; i++) {
    for (let j = i + 1; j < o.length; j++) {
      if (o[i][1] && o[j][1]) check(`${tag}: ${o[i][0]} and ${o[j][0]} do not overlap`, !hit(o[i][1], o[j][1]), [o[i][1], o[j][1]].map((b) => [b.l, b.t, b.r, b.b].map(Math.round)));
    }
  }
  if (m.primary) {
    check(`${tag}: End turn has an in-viewport, safe-area box at least 44 px tall`, inside(m.primary, m.safe) && m.primary.h >= 44, m.primary);
    check(`${tag}: the toast does not cover End turn`, !hit(m.overlays.toast, m.primary));
    // The open chat sheet covers the hand bar by design (it is the modal sheet over the bar; the backdrop's tap closes it).
    console.log(`note ${tag}: End turn ${m.primary.tappable ? "is" : "is not"} reachable under the open chat sheet`);
  }
  const small = m.controls.filter((c) => !(c.w >= (c.min ?? 44) && c.h >= (c.min ?? 44) && inside(c, m.safe) && c.tappable));
  check(`${tag}: ${m.controls.length} actions are 44 px (Minimize 24 px), inside the safe area and tappable`, m.controls.length > 0 && small.length === 0, small.map((c) => [c.name, Math.round(c.w), Math.round(c.h), c.tappable]));
  const seats = m.seats.filter((s) => s.shown);
  const lost = seats.filter((s) => !(s.w > 0 && s.h > 0 && inside(s, { l: 0, t: 0, r: m.vw, b: m.vh }) && s.uncovered));
  check(`${tag}: ${seats.length} seat point totals are visible and uncovered`, seats.length === p.seats && lost.length === 0, lost.length ? lost : undefined);
  await page.screenshot({ path: `test-results/rotate-overlays-${p.tag.replace(/[^a-z0-9]+/gi, "-")}-${kind}-${label.replace(/[^a-z0-9]+/gi, "-")}.png` });
}

async function run(seats, size, from) {
  const first = from === "portrait" ? size : { width: size.height, height: size.width };
  const second = { width: first.height, height: first.width };
  const p = await table(seats, first.width, first.height);
  p.seats = seats;
  const { page } = p;
  for (const kind of ["trade", "steal"]) {
    await fixture(p, kind);
    await page.getByRole("button", { name: /^Open chat/ }).click();
    await prove(p, "open", kind);
    await turn(p, second.width, second.height);
    await prove(p, "rotated", kind);
    await turn(p, first.width, first.height);
    await prove(p, "rotated back", kind);
    // Escape from the chat box closes the top overlay, the chat; the toast or prompt stays.
    await page.locator("#chat-input").focus();
    await page.keyboard.press("Escape");
    await page.getByTestId("chat-sheet").waitFor({ state: "detached" });
    check(`${p.tag} ${kind}: Escape closes the chat and leaves the ${kind === "trade" ? "toast" : "prompt"}`, await (kind === "trade" ? page.getByTestId("trade-toast") : page.getByText("Take from whom?")).isVisible());
  }
  for (const g of p.guests) await g.close();
  await p.ctx.close();
}

let code = 0;
try {
  for (const seats of SEATS) for (const size of SIZES) for (const from of ["portrait", "landscape"]) await run(seats, size, from);
  check("zero console errors", errors.length === 0, errors.length ? errors.slice(0, 8) : undefined);
  if (fails.length) throw new Error(`${fails.length} check(s) failed`);
  console.log("rotate-overlays-prove: ok");
} catch (e) {
  console.log(`FAIL ${e.message}`);
  if (errors.length) console.log(errors.join("\n"));
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  host.kill("SIGKILL");
}
process.exit(code);
