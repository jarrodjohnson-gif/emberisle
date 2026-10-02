// #160: three headless tabs at 1280x720 chat through server/host.mjs. Lobby chat and presets, a floating reaction,
// the unread badge and the remembered open/minimized state, a minimized dock that covers no board target, zero console errors.
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

async function tab(name) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  watch(name, page);
  await page.addInitScript((n) => localStorage.setItem("emberisle-name", n), name);
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

  for (const t of tabs) await t.page.getByRole("button", { name: "Ready", exact: true }).click();
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
