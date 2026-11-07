// Design capture for #1304: chat and Table menu controls, drawn into a real online table. Not a CI proof.
// Run from the repo root: node docs/design/chat-menu-1274/capture.mjs [--save]
// It writes to a temp folder by default; --save writes the pictures and measurements.json into this folder.
// A real host, Jarrod hosting at each size, a guest with a long name and a bot. chat-menu.css is added to the running
// page; the Table menu gets the accepted Sound row from #1276. No src/ file changes.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";
import { entryRow } from "../sound-sheet-1276/sheet.mjs";

const dir = "docs/design/chat-menu-1274";
const out = process.argv.includes("--save") ? dir : mkdtempSync(path.join(tmpdir(), "emberisle-1304-"));
mkdirSync(out, { recursive: true });
const css = readFileSync(`${dir}/chat-menu.css`, "utf8");
const SIZES = [[320, 568], [390, 844], [844, 390], [1280, 720]];
const GUEST = "Bartholomew Lee";
const LONG = "Anyone want two wheat for one ore? I need ore for a stronghold this turn and I have plenty of wheat to spare.";

const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1304-rooms-"));
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
  }, name);
  await page.goto(url);
  await page.waitForFunction(() => !!window.__emberisle);
  return page;
}

// Every number the README quotes comes from here. `which` is "chat" or "menu".
function measure(which) {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" && el.getBoundingClientRect().width > 1;
  const name = (el) => (el.getAttribute("aria-label") || el.textContent.trim() || el.placeholder || el.tagName).replace(/\s+/g, " ").slice(0, 32);
  const root = which === "menu" ? document.querySelector('[data-testid="table-menu"]') : document.querySelector('section[aria-label="Table chat"]');
  if (!root) return { which, open: false };
  // Mark scrollers with more below, so the fade cue shows (chat-menu.css).
  for (const el of [root, ...root.querySelectorAll('[data-testid="sounds-tab"]')]) el.dataset.more = String(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
  const box = r(root);
  const viewport = { w: innerWidth, h: innerHeight };
  const controls = [...root.querySelectorAll("button, input, [role=tab]")].filter(shown);
  // The emoji row scrolls sideways on a 320 px phone: its hidden emoji are not on screen, so they are not counted.
  const onScreen = controls.filter((el) => { const b = el.getBoundingClientRect(); const s = el.closest('[data-testid="emoji-row"]')?.getBoundingClientRect(); return !s || (b.left >= s.left - 0.5 && b.right <= s.right + 0.5); });
  const boxes = onScreen.map((el) => ({ el, b: el.getBoundingClientRect() }));
  let minGap = Infinity;
  let pair = null;
  for (let i = 0; i < boxes.length; i++) for (const o of boxes.slice(i + 1)) {
    const a = boxes[i].b, b = o.b;
    // Inner buttons of a menu row sit inside the row, so they are not neighbours of it.
    if (boxes[i].el.contains(o.el) || o.el.contains(boxes[i].el)) continue;
    const gap = Math.max(b.x - a.right, a.x - b.right, b.y - a.bottom, a.y - b.bottom);
    if (gap < minGap) { minGap = gap; pair = `${name(boxes[i].el)} / ${name(o.el)}`; }
  }
  const tabs = [...root.querySelectorAll("[role=tab]")].filter(shown);
  const input = root.querySelector("#chat-input");
  const sounds = root.querySelector('[data-testid="sounds-tab"]');
  const fonts = [...new Set([...root.querySelectorAll("*")].filter(shown).filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((el) => parseFloat(getComputedStyle(el).fontSize)))].sort((a, b) => a - b);
  const badge = document.querySelector('[data-testid="chat-unread"]');
  return {
    which, open: true, viewport: `${viewport.w}x${viewport.h}`, box,
    inside: box.x >= -0.5 && box.y >= -0.5 && box.x + box.w <= viewport.w + 0.5 && box.y + box.h <= viewport.h + 0.5,
    controls: onScreen.length,
    under44: boxes.filter(({ b }) => b.width < 43.5 || b.height < 43.5).map(({ el, b }) => `${name(el)} ${b.width | 0}x${b.height | 0}`),
    minGap: +minGap.toFixed(1), minGapPair: pair,
    tabs: tabs.map((t) => ({ name: name(t), selected: t.getAttribute("aria-selected"), ...r(t), lines: Math.round(t.querySelector("span")?.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)) || 1, cut: t.scrollWidth > t.clientWidth + 1 })),
    inputEdge: input ? getComputedStyle(input).borderTopColor : null,
    moreBelow: root.dataset.more === "true" || sounds?.dataset.more === "true",
    fontSizes: fonts,
    unread: badge && shown(badge) ? { text: badge.textContent, ...r(badge) } : null,
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
    const code = (await page.getByTestId("table-code").textContent()).trim();
    const guest = await client(GUEST, { width: 390, height: 844 }, true);
    await guest.evaluate((c) => window.__emberisle.getState().joinTable(c), code);
    await guest.getByTestId("lobby-card").waitFor();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
    await page.getByTestId("add-bot").first().click();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 3);
    for (const p of [page, guest]) await p.getByRole("button", { name: "Ready", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle.getState().screen === "play" && !!window.__isle, null, { timeout: 90_000 });
    await guest.waitForFunction(() => window.__emberisle.getState().screen === "play");
    await page.waitForTimeout(3000);
    await page.evaluate(() => document.fonts.ready);
    const say = async (text) => {
      await guest.evaluate((t) => window.__emberisle.getState().sendChat(t), text);
      await page.waitForFunction((t) => window.__emberisle.getState().chat.some((l) => l.text === t), text);
    };
    await say(LONG);
    await say("@Jarrod nice roll");

    const openChat = async () => {
      if (!(await page.evaluate(() => window.__emberisle.getState().chatOpen))) await page.getByRole("button", { name: /^Open chat/ }).click();
      await page.locator('section[aria-label="Table chat"]').waitFor();
      await page.locator("#chat-tab-chat").click();
    };
    const shot = async (picture, which, extra = {}) => {
      await page.waitForTimeout(300);
      await page.mouse.move(0, 0);
      const m = await page.evaluate(measure, which);
      results.push({ picture: `${picture}-${tag}.png`, ...extra, ...m });
      await page.screenshot({ path: `${out}/${picture}-${tag}.png` });
      console.log(`${picture} ${tag}: ${m.open ? `${m.box.w}x${m.box.h} at ${m.box.x},${m.box.y}; inside ${m.inside}; ${m.controls} controls; under 44 ${m.under44.join(", ") || "none"}; min gap ${m.minGap} (${m.minGapPair}); tabs ${m.tabs.map((t) => `${t.name} ${t.w}x${t.h}${t.lines > 1 ? ` ${t.lines} lines` : ""}${t.cut ? " CUT" : ""}`).join(", ") || "-"}; more below ${m.moreBelow}; fonts ${m.fontSizes.join("/")}` : "closed"}${m.unread ? `; unread "${m.unread.text}"` : ""}`);
    };

    // Today's chat, then the same with the proposal on.
    await openChat();
    await shot("today-chat", "chat");
    await page.evaluate((c) => {
      const s = document.createElement("style");
      s.textContent = c;
      document.head.append(s);
      document.documentElement.dataset.mockChat = "";
    }, css);
    await shot("chat", "chat");
    if (!phone) {
      await page.evaluate(() => { document.documentElement.dataset.mockChat = "300"; });
      await shot("chat-300", "chat");
      await page.evaluate(() => { document.documentElement.dataset.mockChat = ""; });
    }
    await page.locator("#chat-tab-sounds").click();
    await shot("sounds", "chat");

    // A send that failed: the words stay, one red line under the field (proposed; today the field clears).
    await page.locator("#chat-tab-chat").click();
    await page.locator("#chat-input").fill("Two wheat for one ore?");
    await page.evaluate(() => {
      const row = document.querySelector("#chat-input").parentElement;
      row.insertAdjacentHTML("afterend", '<p class="cm-failed" role="status" data-testid="chat-failed">Not sent. The table did not answer. Press Send to try again.</p>');
    });
    await shot("failed", "chat");
    await page.evaluate(() => document.querySelector('[data-testid="chat-failed"]')?.remove());
    await page.locator("#chat-input").fill("");

    // Nothing said yet: a fresh log.
    await page.evaluate(() => window.__emberisle.setState({ chat: [], gameLog: [] }));
    await shot("empty", "chat");

    // Closed, with three unread lines.
    await page.evaluate(() => window.__emberisle.getState().setChatOpen(false));
    await page.locator('section[aria-label="Table chat"]').waitFor({ state: "detached" }).catch(() => {});
    for (const t of ["Wood for sheep?", "Anyone?", "I'll take the bank then"]) await say(t);
    await page.getByTestId("chat-unread").waitFor();
    await shot("unread", "chat");

    // The Table menu, with the Sound row the owner accepted in #1276 in place of the two sound rows.
    await page.getByRole("button", { name: "Table menu", exact: true }).click();
    await page.getByTestId("table-menu").waitFor();
    await page.evaluate((html) => {
      const menu = document.querySelector('[data-testid="table-menu"]');
      menu.querySelector('[data-testid="music-toggle"]')?.remove();
      menu.querySelector('[data-testid="sound-toggle"]').outerHTML = html;
    }, entryRow());
    await shot("menu", "menu");
    await page.keyboard.press("Escape");

    // Layers today: the chat open, then a tap where the menu button is. On a phone the chat's backdrop takes that tap.
    // Then the keyboard: Enter on the focused menu button. Which closes on the first Escape?
    await openChat();
    const at = await page.getByRole("button", { name: "Table menu", exact: true }).boundingBox();
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
    await page.waitForTimeout(300);
    const tap = await page.evaluate(() => ({ menuOpen: !!document.querySelector('[data-testid="table-menu"]'), chatOpen: !!document.querySelector('section[aria-label="Table chat"]') }));
    if (!tap.menuOpen) {
      await openChat();
      await page.getByRole("button", { name: "Table menu", exact: true }).focus();
      await page.keyboard.press("Enter");
      await page.getByTestId("table-menu").waitFor();
    }
    const layers = await page.evaluate(() => {
      const a = document.querySelector('[data-testid="table-menu"]')?.getBoundingClientRect();
      const b = document.querySelector('section[aria-label="Table chat"]')?.getBoundingClientRect();
      const overlap = a && b ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0;
      return { menuOpen: !!a, chatOpen: !!b, overlap: Math.round(overlap) };
    });
    await page.keyboard.press("Escape");
    layers.afterEscape = await page.evaluate(() => ({ menuOpen: !!document.querySelector('[data-testid="table-menu"]'), chatOpen: !!document.querySelector('section[aria-label="Table chat"]'), focus: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName }));
    layers.tap = tap;
    results.push({ which: "layers (today)", viewport: tag, ...layers });
    console.log(`layers ${tag}: a tap on the menu button opens the menu ${tap.menuOpen}, leaves the chat open ${tap.chatOpen}`);
    console.log(`layers ${tag}: menu over chat ${layers.menuOpen && layers.chatOpen}, overlap ${layers.overlap} px²; after Escape menu ${layers.afterEscape.menuOpen}, chat ${layers.afterEscape.chatOpen}, focus ${layers.afterEscape.focus}`);

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
