// #736 (docs/design/quick-react-tray.md, owner answer A on #1370): the chat panel is the one quick-react tray, and this proves
// the three changes the design asked of it, through a real host and three seated tabs.
//   P2A: every control in the open panel is at least 44x44, inside the screen, with no sideways scroll, at 1280x720 (the 300 px
//        desktop panel, where Mute players and Minimize were 40 px and the Chat tab 43 px), 440x956, 956x440 and 320x640.
//   P3A: the 1 s emoji/sticker wait and the 3 s sound wait each hold on their own, survive close and reopen, and both clear
//        when the table changes. (GG! on the shared sound wait is #738.)
//   P4A: Escape from anywhere in the panel (input, tab, sticker, sound chip, mute list) closes only the panel: an armed build
//        stays armed and a second Escape disarms it. Escape, Minimize and Close give the focus back to Open chat. Only the
//        selected tab is in the Tab order and Left/Right switch tabs. There is no focus trap: Tab leaves the panel.
// Run: npm run quick-react-prove. Screenshots go to test-results/.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "./proof-browser.mjs";
import { hostPort as waitForHostPort } from "./proof-host-port.mjs";

const PORT = Number(process.env.VITE_PORT) || 8131;
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

async function tab(name, viewport, phone) {
  const ctx = await browser.newContext(phone ? { viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : { viewport });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${name}: ${r.status()} ${r.url()}`));
  await page.addInitScript((n) => {
    localStorage.setItem("emberisle-name", n);
    window.__emberisleSkipIntro = true;
  }, name);
  // The proof reads the DOM. Skip GL draws except while a screenshot is taken, so three scenes don't starve the machine.
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
  return { name, page, phone };
}
const get = (t, fn, arg) => t.page.evaluate(fn, arg);
const talk = (t) => get(t, () => import("/src/components/game/talk.tsx").then((m) => ({ cooling: m.useTalk.getState().cooling, resting: m.useTalk.getState().resting })));
const buildMode = (t) => get(t, () => window.__emberisle.getState().buildMode);
const panelOpen = (t) => get(t, () => window.__emberisle.getState().chatOpen);
const focusName = (t) => get(t, () => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.id ?? document.activeElement?.tagName);
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

const a = await tab("Ember", { width: 1280, height: 720 }, false);
const b = await tab("Moss", { width: 440, height: 956 }, true);
const c = await tab("Pine", { width: 956, height: 440 }, true);
const tabs = [a, b, c];

// P3A, table change: a sound and an emoji in one lobby set both waits; leaving and hosting a new table clears them at once,
// well inside the 3 s rest, and the chips are enabled again.
await a.page.getByRole("button", { name: "Host a table" }).click();
const firstCode = (await a.page.getByTestId("table-code").textContent()).trim();
await a.page.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
await a.page.getByTestId("soundboard").getByRole("button").first().click();
await a.page.getByRole("tab", { name: "Chat", exact: true }).click();
await a.page.getByRole("button", { name: "React happy" }).click();
let w = await talk(a);
check(w.cooling && w.resting, `table change: a sound and an emoji in the lobby set both waits ${JSON.stringify(w)}`);
const left = Date.now();
await a.page.getByRole("button", { name: "Leave table" }).click();
await a.page.getByRole("button", { name: "Host a table" }).click();
const code = (await until(async () => {
  const text = (await a.page.getByTestId("table-code").textContent().catch(() => ""))?.trim();
  return text && text !== firstCode ? text : "";
}, "a new table code")).trim();
w = await talk(a);
const after = Date.now() - left;
check(!w.cooling && !w.resting && after < 3000, `table change: on the new table ${code} both waits are clear ${after} ms after leaving ${firstCode} (under the 3 s rest) ${JSON.stringify(w)}`);
await a.page.getByRole("tab", { name: "Sounds & stickers", exact: true }).click();
check(await a.page.getByTestId("soundboard").getByRole("button").first().isEnabled(), "table change: the first sound chip is enabled on the new table");
await a.page.getByRole("tab", { name: "Chat", exact: true }).click();

for (const t of [b, c]) {
  await t.page.getByPlaceholder(/code/i).fill(code);
  await t.page.getByRole("button", { name: "Join" }).click();
  await t.page.getByTestId("table-code").waitFor();
}
for (const t of tabs) await t.page.getByRole("button", { name: "Ready", exact: true }).click();
await a.page.getByRole("button", { name: "Start", exact: true }).and(a.page.locator(":enabled")).waitFor();
await a.page.getByRole("button", { name: "Start", exact: true }).click();
for (const t of tabs) await t.page.getByRole("button", { name: "Open chat" }).waitFor();
check(true, "game: three seats are at the table with the chat closed");

const openPanel = async (t) => {
  if (!(await panelOpen(t))) await t.page.getByRole("button", { name: /^Open chat/ }).click();
  await t.page.locator('section[aria-label="Table chat"]').waitFor();
};
const setTabTo = async (t, name) => {
  await t.page.getByRole("tab", { name, exact: true }).click();
  await until(async () => (await t.page.getByRole("tab", { name, exact: true }).getAttribute("aria-selected")) === "true", `${t.name}: ${name} tab selected`);
};

// P2A: every control in the open panel, on both tabs, is whole, at least 44x44, inside the screen, and nothing scrolls sideways.
async function sizes(t, label) {
  for (const name of ["Chat", "Sounds & stickers"]) {
    await openPanel(t);
    await setTabTo(t, name);
    if (name === "Sounds & stickers") await t.page.getByTestId("soundboard").waitFor();
    const m = await get(t, () => {
      const panel = document.querySelector('section[aria-label="Table chat"]');
      const p = panel.getBoundingClientRect();
      const small = [];
      const outside = [];
      for (const el of panel.querySelectorAll("button, input, [role=tab]")) {
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        const what = el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20) || el.id;
        if (r.width < 44 - 0.5 || r.height < 44 - 0.5) small.push(`${what} ${Math.round(r.width)}x${Math.round(r.height)}`);
        if (r.left < p.left - 0.5 || r.right > p.right + 0.5) outside.push(what);
      }
      // A label cut short with an ellipsis (the tab's `truncate`) is listed apart: it is not a sideways scroll.
      const wide = [...panel.querySelectorAll("*")].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible");
      const ellipsis = wide.filter((el) => getComputedStyle(el).textOverflow === "ellipsis").map((el) => el.textContent.trim());
      const sideways = wide.filter((el) => getComputedStyle(el).textOverflow !== "ellipsis").map((el) => el.dataset.testid || el.tagName);
      return {
        small,
        outside,
        sideways,
        ellipsis,
        page: document.documentElement.scrollWidth > innerWidth,
        inside: p.left >= 0 && p.top >= 0 && p.right <= innerWidth + 0.5 && p.bottom <= innerHeight + 0.5,
        box: [p.left, p.top, p.width, p.height].map(Math.round),
      };
    });
    check(!m.small.length && !m.outside.length && !m.sideways.length && !m.page && m.inside, `${label}, ${name} tab: panel ${m.box.join(",")} inside the screen, every control at least 44x44, none outside the panel, no sideways scroll ${JSON.stringify(m)}`);
  }
  // The two dock controls that were 40 px wide on desktop, by name.
  const dock = await get(t, () => ["Mute players", "Close chat"].map((n) => {
    const r = document.querySelector(`section[aria-label="Table chat"] button[aria-label="${n}"]`)?.getBoundingClientRect();
    return r ? `${n} ${Math.round(r.width)}x${Math.round(r.height)}` : `${n} missing`;
  }));
  check(dock.every((d) => /\b(4[4-9]|[5-9]\d|\d{3})x(4[4-9]|[5-9]\d)$/.test(d)), `${label}: ${dock.join(", ")}`);
}
await sizes(a, "1280x720 desktop panel");
await shot(a, "quick-react-1280x720.jpg");
await sizes(b, "440x956 phone sheet");
await shot(b, "quick-react-440x956.jpg");
await sizes(c, "956x440 phone sheet");
await shot(c, "quick-react-956x440.jpg");

// P4A, tabs: only the selected tab is in the Tab order; Left and Right switch and move the focus; they wrap.
async function tabKeys(t) {
  await openPanel(t);
  await setTabTo(t, "Chat");
  const order = () => get(t, () => ["chat", "sounds"].map((id) => document.getElementById(`chat-tab-${id}`).tabIndex));
  check(JSON.stringify(await order()) === "[0,-1]", `${t.name}: with Chat selected only the Chat tab is in the Tab order`);
  await t.page.locator("#chat-tab-chat").focus();
  await t.page.keyboard.press("ArrowRight");
  await until(async () => (await focusName(t)) === "chat-tab-sounds", `${t.name}: Right moves the focus to Sounds & stickers`);
  check((await t.page.locator("#chat-tab-sounds").getAttribute("aria-selected")) === "true" && JSON.stringify(await order()) === "[-1,0]", `${t.name}: Right selects Sounds & stickers, which alone is now in the Tab order`);
  await t.page.keyboard.press("ArrowRight");
  await until(async () => (await focusName(t)) === "chat-tab-chat", `${t.name}: Right wraps to Chat`);
  await t.page.keyboard.press("ArrowLeft");
  await until(async () => (await focusName(t)) === "chat-tab-sounds", `${t.name}: Left wraps to Sounds & stickers`);
  await t.page.keyboard.press("ArrowLeft");
  await until(async () => (await focusName(t)) === "chat-tab-chat" && (await t.page.locator("#chat-tab-chat").getAttribute("aria-selected")) === "true", `${t.name}: Left goes back to Chat`);
  check(true, `${t.name}: Left and Right switch the tabs both ways and wrap`);
}
await tabKeys(a);
await tabKeys(b);

// P4A, no focus trap: Tab from the panel's last control leaves the panel (desktop panel and phone sheet).
async function noTrap(t) {
  await openPanel(t);
  await setTabTo(t, "Chat");
  await t.page.getByRole("button", { name: "Send", exact: true }).focus();
  let out = false;
  for (let i = 0; i < 8 && !out; i++) {
    await t.page.keyboard.press("Tab");
    out = await get(t, () => !document.activeElement?.closest('section[aria-label="Table chat"]'));
  }
  check(out && (await panelOpen(t)), `${t.name}: Tab leaves the open panel (no focus trap) and the panel stays open`);
}
await noTrap(a);
await noTrap(b);

// P4A, Escape: from each part of the panel, one press closes only the panel, the armed path stays armed and the focus is on
// Open chat; then a second press disarms the path, as from the input before.
const ESCAPE_FROM = [
  ["the input", "Chat", (t) => t.page.locator("#chat-input")],
  ["the Chat tab", "Chat", (t) => t.page.locator("#chat-tab-chat")],
  ["an emoji", "Chat", (t) => t.page.getByRole("button", { name: "React clap" })],
  ["a sound chip", "Sounds & stickers", (t) => t.page.getByTestId("soundboard").getByRole("button").nth(2)],
  ["a sticker", "Sounds & stickers", (t) => t.page.getByTestId("stickers").getByRole("button").first()],
  ["the mute list", "Chat", async (t) => {
    await t.page.getByRole("button", { name: "Mute players", exact: true }).click();
    return t.page.getByTestId("chat-mute-panel").getByRole("button").first();
  }],
];
async function escapes(t) {
  for (const [where, tabName, target] of ESCAPE_FROM) {
    await openPanel(t);
    await setTabTo(t, tabName);
    const el = await target(t);
    await el.focus();
    await get(t, () => window.__emberisle.getState().setBuildMode("path"));
    await t.page.keyboard.press("Escape");
    await until(async () => !(await panelOpen(t)), `${t.name}: Escape from ${where} closes the panel`);
    await until(async () => /^Open chat/.test(await focusName(t)), `${t.name}: focus back on Open chat after Escape from ${where}`);
    check((await buildMode(t)) === "path", `${t.name}: Escape from ${where} closes only the panel; the path stays armed and the focus is on Open chat`);
    await t.page.keyboard.press("Escape");
    await until(async () => (await buildMode(t)) === "none", `${t.name}: a second Escape disarms the path`);
    check(!(await panelOpen(t)), `${t.name}: the second Escape (from Open chat) disarms the path and leaves the panel closed`);
  }
}
await escapes(a);
await escapes(c);

// P4A, Minimize (desktop) and Close (phone) also put the focus back on Open chat; a phone backdrop tap closes without it.
async function closeButton(t, label) {
  await openPanel(t);
  await t.page.getByRole("button", { name: "Close chat", exact: true }).click();
  await until(async () => !(await panelOpen(t)), `${t.name}: ${label} closes the panel`);
  await until(async () => /^Open chat/.test(await focusName(t)), `${t.name}: ${label} gives the focus to Open chat`);
  check(true, `${t.name}: ${label} closes the panel and the focus is on Open chat`);
}
await closeButton(a, "Minimize");
await closeButton(b, "Close");
await openPanel(b);
await b.page.getByTestId("chat-backdrop").click({ position: { x: 20, y: 20 } });
await until(async () => !(await panelOpen(b)), "Moss: the backdrop closes the sheet");
await get(b, () => document.activeElement?.blur());
await openPanel(b);
await b.page.getByTestId("chat-backdrop").click({ position: { x: 20, y: 20 } });
await until(async () => !(await panelOpen(b)), "Moss: the backdrop closes the sheet again");
check(!/^Open chat/.test(await focusName(b)), "Moss: a backdrop tap closes the sheet without moving the focus to Open chat");

// P3A, the waits: the 1 s emoji/sticker wait and the 3 s sound wait are independent and survive closing and reopening.
await openPanel(a);
await setTabTo(a, "Chat");
const sentAt = Date.now();
await a.page.getByRole("button", { name: "React fire" }).click();
w = await talk(a);
check(w.cooling && !w.resting, `waits: an emoji starts the 1 s wait and not the sound wait ${JSON.stringify(w)}`);
await setTabTo(a, "Sounds & stickers");
const chip = a.page.getByTestId("soundboard").getByRole("button").nth(1);
check(await chip.isEnabled(), "waits: during the emoji wait the sound chips stay enabled");
await chip.click();
w = await talk(a);
check(w.cooling && w.resting, `waits: a sound chip then starts its own 3 s wait ${JSON.stringify(w)}`);
await a.page.getByRole("button", { name: "Close chat", exact: true }).click();
await openPanel(a);
await setTabTo(a, "Sounds & stickers");
check(!(await a.page.getByTestId("soundboard").getByRole("button").nth(1).isEnabled()), "waits: after closing and reopening the panel the sound wait still holds");
await until(async () => !(await talk(a)).cooling, "the emoji wait ends", 3000);
const coolMs = Date.now() - sentAt;
w = await talk(a);
check(w.resting && coolMs < 2500, `waits: the emoji wait ended after about 1 s (${coolMs} ms) while the sound wait still holds ${JSON.stringify(w)}`);
check(await a.page.getByTestId("stickers").getByRole("button").first().isEnabled(), "waits: stickers are enabled again while sounds still rest");
await until(async () => !(await talk(a)).resting, "the sound wait ends", 5000);
check(await a.page.getByTestId("soundboard").getByRole("button").nth(1).isEnabled(), "waits: the sound chips are enabled again after the 3 s rest");

// P2A at the narrowest width the design names: Moss's phone turned to 320x640.
await b.page.setViewportSize({ width: 320, height: 640 });
await sizes(b, "320x640 phone sheet");
await shot(b, "quick-react-320x640.jpg");

check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
await vite.close();
console.log(`quick-react-prove: all checks passed in ${((Date.now() - T0) / 1000).toFixed(1)}s`);
process.exit(0);
