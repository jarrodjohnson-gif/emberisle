// Design capture for #1303: lobby controls, drawn over the real lobby on a real local host. Not a CI proof.
// Run from the repo root: node docs/design/lobby-controls-1274/capture.mjs [--save]
// It writes to a temp folder by default; --save writes the pictures and measurements.json into this folder.
// Every "after" picture also carries the accepted #1220 type and spacing (docs/design/lobby-hig/after.css), which is not
// built yet, so the pictures show where the lobby is going. No src/ file changes.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const dir = "docs/design/lobby-controls-1274";
const out = process.argv.includes("--save") ? dir : mkdtempSync(path.join(tmpdir(), "emberisle-1303-"));
mkdirSync(out, { recursive: true });
const css = readFileSync(`${dir}/controls.css`, "utf8");
const hig = readFileSync("docs/design/lobby-hig/after.css", "utf8");
const SIZES = [[320, 568], [390, 844], [844, 390], [1280, 720]];
// The chat-share floors from #1103, as lobby-layout-prove checks them.
const FLOOR = { "390x844": 0.52, "844x390": 0.39, "1280x720": 0.4 };

const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1303-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../../../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR: rooms },
});
const hostPort = await new Promise((resolve, reject) => {
  host.on("error", reject);
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  });
  host.on("exit", (code) => reject(new Error(`host exited ${code}`)));
});
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${hostPort}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];

async function client(name, viewport, touch) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  await page.addInitScript((n) => {
    localStorage.setItem("emberisle-name", n);
    localStorage.setItem("emberisle-jelly", "lite");
    // A clipboard that works until the capture blocks it.
    window.__copies = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => { if (window.__blocked) throw new Error("blocked"); window.__copies.push(t); } } });
  }, name);
  await page.goto(url);
  await page.waitForFunction(() => !!window.__emberisle);
  return page;
}

// Every number the README quotes comes from here.
function measure(floor) {
  const card = document.querySelector(".lobby-cover");
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const name = (el) => (el.getAttribute("aria-label") || el.textContent.trim() || el.placeholder || el.tagName).slice(0, 40);
  const controls = [...card.querySelectorAll("button, input, textarea, [role=tab]")].filter(shown).filter((el, i, a) => a.indexOf(el) === i);
  const boxes = controls.map((el) => ({ el, b: el.getBoundingClientRect() }));
  let minGap = Infinity;
  let pair = null;
  for (let i = 0; i < boxes.length; i++) for (const o of boxes.slice(i + 1)) {
    const a = boxes[i].b, b = o.b;
    if (boxes[i].el.closest("[data-emote]") || o.el.closest("[data-emote]")) continue;
    const gap = Math.max(b.x - a.right, a.x - b.right, b.y - a.bottom, a.y - b.bottom);
    if (gap < minGap) { minGap = gap; pair = `${name(boxes[i].el)} / ${name(o.el)}`; }
  }
  // Text cut short anywhere in the two rows this issue owns.
  const rows = [...card.querySelectorAll(".lobby-header, .lobby-rules")];
  const clipped = rows.flatMap((row) => [...row.querySelectorAll("*")].filter(shown).filter((el) => el.getBoundingClientRect().width > 1 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible").map(name));
  const head = card.querySelector(".lobby-header");
  const chat = card.querySelector('[data-testid="lobby-chat"]');
  const cb = card.getBoundingClientRect();
  const share = chat && shown(chat) ? (chat.getBoundingClientRect().width * chat.getBoundingClientRect().height) / (cb.width * cb.height) : null;
  const log = card.querySelector('[data-testid="chat-log"]');
  const fallback = document.querySelector(".lobby-copy-fallback");
  return {
    viewport: `${innerWidth}x${innerHeight}`,
    rootFont: getComputedStyle(document.documentElement).fontSize,
    code: window.__emberisle.getState().code,
    header: [...head.querySelectorAll(".lc-code, .lc-btn")].filter(shown).map((el) => ({ name: name(el), ...r(el), font: parseFloat(getComputedStyle(el).fontSize) })),
    views: [...card.querySelectorAll(".lc-seg [role=tab], .lc-rules")].filter(shown).map((el) => ({ name: name(el), role: el.getAttribute("role") ?? "button", selected: el.getAttribute("aria-selected"), ...r(el) })),
    status: (() => { const s = card.querySelector(".lobby-rule-status"); return s ? r(s) : null; })(),
    // Fits: inside the header, and no control's own content spills past its edges (a cut-off code).
    headerFits: head.scrollWidth <= head.clientWidth + 0.5 && [...head.querySelectorAll(".lc-code, .lc-btn")].filter(shown).every((el) => el.getBoundingClientRect().right <= head.getBoundingClientRect().right + 0.5 && el.scrollWidth <= el.clientWidth + 1),
    // The same for Table, Play games and Rules, and the three stay inside their row.
    rulesFit: [...card.querySelectorAll(".lc-seg [role=tab], .lc-rules")].filter(shown).every((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1 && el.getBoundingClientRect().right <= card.querySelector(".lobby-rules").getBoundingClientRect().right + 0.5),
    clipped,
    under44: boxes.filter(({ b }) => b.width < 43.5 || b.height < 43.5).map(({ el, b }) => `${name(el)} ${b.width | 0}x${b.height | 0}`),
    minGap: +minGap.toFixed(1), minGapPair: pair,
    cardScroll: [card.scrollWidth - card.clientWidth, card.scrollHeight - card.clientHeight],
    chatShare: share === null ? null : +share.toFixed(4), chatFloor: floor ?? null, chatLog: log && shown(log) ? +log.getBoundingClientRect().height.toFixed(1) : null,
    fallback: fallback ? { ...r(fallback), focused: document.activeElement?.dataset.testid ?? null } : null,
    live: document.querySelector('.lc-header [data-testid="copy-status"]')?.textContent ?? null,
    copies: window.__copies.slice(-1)[0] ?? null,
  };
}

const results = [];
try {
  for (const [width, height] of SIZES) {
    const tag = `${width}x${height}`;
    const phone = width < 1000;
    const page = await client("Jarrod", { width, height }, phone);
    await page.evaluate(() => window.__emberisle.getState().hostTable());
    await page.getByTestId("lobby-card").waitFor();
    await page.evaluate(() => document.fonts.ready);
    const real = await page.evaluate(() => window.__emberisle.getState().code);
    await page.evaluate(([hig, css]) => {
      for (const [id, text] of [["mock-hig", hig], ["mock-controls", css]]) {
        const s = document.createElement("style");
        s.id = id;
        s.textContent = text;
        document.head.append(s);
      }
    }, [hig, css]);
    const mount = (option, tabs) => page.evaluate(async ([o, t]) => (await import("/docs/design/lobby-controls-1274/controls.tsx")).mount(o, t), [option, tabs]);
    const after = (on) => page.evaluate((on) => {
      for (const id of ["mock-hig", "mock-controls"]) document.getElementById(id).disabled = !on;
      for (const el of document.querySelectorAll(".lc-header, .lc-views")) el.style.display = on ? "" : "none";
      if (!on) delete document.documentElement.dataset.mockLobby;
    }, on);
    const shot = async (name, extra = {}) => {
      await page.waitForTimeout(250);
      await page.mouse.move(0, 0);
      const m = await page.evaluate(measure, FLOOR[tag]);
      // Wide screens get pictures of the states that look different there; the rest are measured only.
      const pictured = phone || !["empty", "a-full", "a-text125"].includes(name);
      results.push({ picture: pictured ? `${name}-${tag}.png` : null, state: name, ...extra, ...m });
      if (pictured) await page.screenshot({ path: `${out}/${name}-${tag}.png` });
      console.log(`${name} ${tag}: header ${m.header.map((h) => `${h.name.split(".")[0]} ${h.w}x${h.h}`).join(", ") || "today's"}; fits ${m.headerFits}; tabs fit ${m.rulesFit}; clipped ${m.clipped.join(",") || "none"}; under 44 ${m.under44.join(",") || "none"}; min gap ${m.minGap} (${m.minGapPair}); chat ${m.chatShare ?? "-"}${m.chatFloor ? ` floor ${m.chatFloor}` : ""}; log ${m.chatLog ?? "-"}`);
      return m;
    };

    // The host alone: nobody to start with yet.
    await mount("a");
    await shot("empty");

    // A guest, a bot and one chat line.
    const guest = await client("Josh", { width: 390, height: 844 }, true);
    await guest.evaluate((c) => window.__emberisle.getState().joinTable(c), real);
    await guest.getByTestId("lobby-card").waitFor();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
    await page.getByTestId("add-bot").first().click();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 3);
    await guest.getByRole("button", { name: "Ready", exact: true }).click();
    await guest.locator("#chat-input").fill("Ready when you are!");
    await guest.keyboard.press("Enter");
    await page.getByTestId("chat-log").getByText("Ready when you are!").waitFor();

    await after(false);
    await shot("before");
    await after(true);
    await mount("b");
    await shot("b-table");
    await mount("a", "joined");
    await shot("joined-table");
    await mount("a");
    await shot("a-table");

    // Tap the code: the widest code, then the copy, then "Copied".
    await page.evaluate(() => window.__emberisle.setState({ code: "MMMM" }));
    const mmmm = await page.evaluate(measure, FLOOR[tag]);
    results.push({ state: "MMMM (measured only)", ...mmmm });
    console.log(`MMMM ${tag}: header fits ${mmmm.headerFits}; clipped ${mmmm.clipped.join(",") || "none"}`);
    await page.evaluate(() => window.__emberisle.setState({ code: "WWWW" }));
    await page.getByTestId("mock-code").focus();
    await page.keyboard.press("Enter");
    await page.getByTestId("mock-code").getByText("Copied").waitFor();
    await shot("a-copied");
    await page.waitForTimeout(1700);

    // A blocked clipboard: the game's own fallback, a field with the code selected.
    await page.evaluate(() => { window.__blocked = true; });
    await page.getByTestId("mock-code").click();
    await page.getByTestId("copy-fallback").waitFor();
    await shot("a-blocked");
    await page.evaluate(() => { window.__blocked = false; });
    await page.getByTestId("mock-code").click();
    await page.getByTestId("mock-code").getByText("Copied").waitFor();
    await page.waitForTimeout(1700);
    await page.evaluate((c) => window.__emberisle.setState({ code: c }), real);

    // The other tab, then back, by keyboard.
    await page.locator("#lc-tab-table").focus();
    await page.keyboard.press("ArrowRight");
    await page.getByText("Play while you wait").or(page.locator(".ly")).first().waitFor();
    await shot("a-games", { focus: await page.evaluate(() => document.activeElement?.id) });
    await page.keyboard.press("ArrowLeft");
    await page.getByTestId("lobby-players").waitFor();

    // Text studies: the new controls follow the root size; the rest of the lobby is still in px until #1235.
    for (const [pct, px] of [[125, 20], [150, 24]]) {
      await page.evaluate((px) => { document.documentElement.style.fontSize = `${px}px`; }, px);
      await shot(`a-text${pct}`);
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });

    // A full table: four seats, everyone ready, Start showing.
    await page.getByTestId("add-bot").first().click();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 4);
    await page.getByRole("button", { name: "Ready", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).waitFor();
    await shot("a-full");

    await guest.context().close();
    await page.context().close();
  }
  writeFileSync(`${out}/measurements.json`, JSON.stringify({ chromium: browser.version(), results }, null, 2) + "\n");
  console.log(`chromium ${browser.version()}; ${results.length} measurements; written to ${out}; browser errors ${errors.length}`);
  if (errors.length) console.log(errors.join("\n"));
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
