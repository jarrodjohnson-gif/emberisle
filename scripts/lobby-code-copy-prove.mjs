// #1430: the lobby code is the copy button. A tap copies the join link (never a share sheet), and the code fades to a small
// "Copied" in the same spot and back, so nothing moves and no room is added. Copy, Copy link and Invite are gone. Table and
// Play games are two tab boxes 8 px apart, and on a phone held sideways the chat runs from the top of the card.
// Real host, two real clients, through the Vite dev server.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1430-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR: rooms, RESULTS_DIR: `${rooms}/results` },
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
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];

async function client(name, viewport, { touch = viewport.width < 1000, motion = "reduce" } = {}) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, reducedMotion: motion });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  await page.addInitScript((n) => {
    localStorage.setItem("emberisle-name", n);
    localStorage.setItem("emberisle-jelly", "lite");
    window.__copies = [];
    window.__shares = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { if (window.__blocked) throw new Error("blocked"); window.__copies.push(t); } } });
    Object.defineProperty(navigator, "share", { configurable: true, value: async (d) => { window.__shares.push(d); } });
  }, name);
  await page.goto(url);
  await page.waitForFunction(() => !!window.__emberisle);
  return page;
}

const box = (page, selector) => page.locator(selector).first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
});
const near = (a, b, label) => assert.ok(Math.abs(a - b) <= 0.5, `${label} (${a} vs ${b})`);

// The header holds one control, the code. A tap copies the join link, fades the code to "Copied" in place, and fades back.
async function copies(page, tag, code) {
  for (const gone of ["Copy", "Copy link", "Invite", "Share"]) assert.equal(await page.getByRole("button", { name: gone, exact: true }).count(), 0, `${tag}: no ${gone} button`);
  assert.equal(await page.locator(".lobby-header button").count(), 1, `${tag}: the header holds only the code`);
  const button = page.getByRole("button", { name: `Table code ${[...code].join(" ")}. Copy link`, exact: true });
  await button.waitFor();
  const want = new URL(url);
  want.search = "";
  want.searchParams.set("code", code);
  want.searchParams.set("host", `ws://127.0.0.1:${hostPort}`);

  const rest = await box(page, ".lobby-code");
  const header = await box(page, ".lobby-header");
  assert.ok(rest.h >= 44 && rest.w >= 44, `${tag}: the code is a 44 px target (${rest.w}x${rest.h})`);
  assert.ok(rest.x >= header.x - 0.5 && rest.right <= header.right + 0.5, `${tag}: the code stays inside its header`);
  await button.click();
  await page.locator(".lobby-code[data-copied]").waitFor();
  assert.equal(await page.evaluate(() => window.__copies.at(-1)), want.href, `${tag}: a tap copies the join link`);
  assert.deepEqual(await page.evaluate(() => window.__shares), [], `${tag}: a tap never opens a share sheet`);
  const on = await page.locator(".lobby-code").evaluate((el) => {
    const code = el.querySelector('[data-testid="table-code"]');
    const said = el.querySelector("span:last-child");
    const rg = document.createRange();
    rg.selectNodeContents(said);
    const t = rg.getBoundingClientRect(), b = el.getBoundingClientRect();
    return {
      code: code.textContent, codeOpacity: getComputedStyle(code).opacity, codeFont: parseFloat(getComputedStyle(code).fontSize),
      said: said.textContent, saidOpacity: getComputedStyle(said).opacity, saidFont: parseFloat(getComputedStyle(said).fontSize),
      inside: t.left >= b.left && t.right <= b.right && t.top >= b.top && t.bottom <= b.bottom,
      live: document.querySelector('[data-testid="copy-status"]').textContent,
    };
  });
  assert.deepEqual([on.code, on.codeOpacity, on.said, on.saidOpacity, on.live], [code, "0", "Copied", "1", "Copied"], `${tag}: the code fades to "Copied" and the live line says so ${JSON.stringify(on)}`);
  assert.ok(on.saidFont <= 13 && on.saidFont < on.codeFont, `${tag}: "Copied" is small (${on.saidFont} px, code ${on.codeFont} px)`);
  assert.ok(on.inside, `${tag}: "Copied" sits inside the code's own box`);
  const held = await box(page, ".lobby-code");
  for (const k of ["x", "y", "w", "h"]) near(held[k], rest[k], `${tag}: the code button keeps its ${k} while "Copied" shows`);
  await page.locator(".lobby-code:not([data-copied])").waitFor({ timeout: 2500 });
  assert.equal(await page.getByTestId("table-code").evaluate((el) => getComputedStyle(el).opacity), "1", `${tag}: the code fades back`);

  // Keyboard: Enter and Space copy too.
  for (const key of ["Enter", " "]) {
    const n = await page.evaluate(() => window.__copies.length);
    await button.focus();
    await page.keyboard.press(key);
    await page.waitForFunction((n) => window.__copies.length > n, n);
    await page.locator(".lobby-code:not([data-copied])").waitFor({ timeout: 2500 });
  }

  // A blocked clipboard keeps today's fallback, now with the join link: a field, focused and selected.
  await page.evaluate(() => { window.__blocked = true; });
  await button.click();
  const field = page.getByRole("textbox", { name: "Join link" });
  await field.waitFor();
  const fb = await field.evaluate((el) => ({ value: el.value, focused: document.activeElement === el, selected: el.selectionStart === 0 && el.selectionEnd === el.value.length, live: document.querySelector('[data-testid="copy-status"]').textContent }));
  assert.deepEqual(fb, { value: want.href, focused: true, selected: true, live: "Select and copy" }, `${tag}: blocked clipboard shows the join link to copy by hand`);
  assert.equal(await page.locator(".lobby-code[data-copied]").count(), 0, `${tag}: no "Copied" when the copy failed`);
  await page.evaluate(() => { window.__blocked = false; });
  await button.click();
  await page.locator(".lobby-code[data-copied]").waitFor();
  assert.equal(await field.count(), 0, `${tag}: a working copy closes the fallback`);
  await page.locator(".lobby-code:not([data-copied])").waitFor({ timeout: 2500 });
}

// Table and Play games: a tablist of two boxes 8 px apart; the picked one is white with an ink bar.
async function tabs(page, tag) {
  const list = page.getByRole("tablist", { name: "Lobby" });
  const table = list.getByRole("tab", { name: "Table", exact: true });
  const games = list.getByRole("tab", { name: "Play games" });
  assert.equal(await list.getByRole("tab").count(), 2, `${tag}: two lobby tabs`);
  const look = await list.evaluate((el) => [...el.children].map((t) => {
    const s = getComputedStyle(t), r = t.getBoundingClientRect();
    return { selected: t.getAttribute("aria-selected"), tabIndex: t.tabIndex, x: r.x, right: r.right, h: r.height, border: s.borderTopWidth, radius: s.borderTopLeftRadius, bg: s.backgroundColor, bar: s.boxShadow };
  }));
  assert.deepEqual(look.map((t) => [t.selected, t.tabIndex]), [["true", 0], ["false", -1]], `${tag}: Table is picked and only it is in the Tab order`);
  near(look[1].x - look[0].right, 8, `${tag}: the two tabs are 8 px apart`);
  for (const t of look) assert.ok(t.border === "1px" && t.radius === "8px" && t.h >= 44, `${tag}: each tab is a 44 px box with a 1 px edge and 8 px corners ${JSON.stringify(t)}`);
  assert.equal(look[0].bg, "rgb(255, 255, 255)", `${tag}: the picked tab is white`);
  assert.ok(/inset/.test(look[0].bar) && /-3px/.test(look[0].bar), `${tag}: the picked tab has a 3 px bar (${look[0].bar})`);
  assert.ok(look[1].bg === "rgba(0, 0, 0, 0)" && look[1].bar === "none", `${tag}: the other tab has no fill and no bar`);

  const picked = () => list.evaluate((el) => [...el.children].map((t) => t.getAttribute("aria-selected") === "true" && document.activeElement === t && t.tabIndex === 0));
  await table.focus();
  await page.keyboard.press("ArrowRight");
  assert.deepEqual(await picked(), [false, true], `${tag}: Right picks and focuses Play games`);
  await page.locator(".ly").waitFor();
  await page.keyboard.press("ArrowRight");
  assert.deepEqual(await picked(), [true, false], `${tag}: Right from Play games comes back to Table`);
  await page.getByTestId("lobby-players").waitFor();
  await page.keyboard.press("ArrowLeft");
  assert.deepEqual(await picked(), [false, true], `${tag}: Left from Table goes round to Play games`);
  await page.keyboard.press("ArrowLeft");
  assert.deepEqual(await picked(), [true, false], `${tag}: Left picks Table`);
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Rules", `${tag}: Tab leaves the tabs for Rules`);
  await games.click();
  await page.locator(".ly").waitFor();
  await table.click();
  await page.getByTestId("lobby-players").waitFor();
}

// Sideways phones: the header keeps to the left column and the chat (or Play games) runs from the top of the card.
async function sideways(page, tag) {
  const header = await box(page, ".lobby-header");
  const rules = await box(page, ".lobby-rules");
  const chat = await box(page, '[data-testid="lobby-chat"]');
  const players = await box(page, '[data-testid="lobby-players"]');
  near(header.x, rules.x, `${tag}: the header starts at the left column`);
  near(header.right, rules.right, `${tag}: the header keeps to the left column`);
  near(chat.y, header.y, `${tag}: the chat starts at the top of the card`);
  assert.ok(chat.x >= header.right + 8, `${tag}: the chat sits right of the header`);
  near(chat.bottom, rules.bottom, `${tag}: the chat runs down to the end of the view row`);
  await page.getByRole("tab", { name: "Play games" }).click();
  near((await box(page, ".ly")).y, header.y, `${tag}: Play games also starts at the top of the card`);
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  await page.getByTestId("lobby-players").waitFor();
  return { chat: `${chat.w.toFixed(0)}x${chat.h.toFixed(0)} at y ${chat.y.toFixed(0)}`, log: (await box(page, '[data-testid="chat-log"]')).h };
}

try {
  for (const [width, height] of [[390, 844], [320, 568], [844, 390], [667, 375], [1280, 720]]) {
    const tag = `${width}x${height}`;
    const page = await client("Jarrod", { width, height });
    await page.evaluate(() => window.__emberisle.getState().hostTable());
    await page.getByTestId("lobby-card").waitFor();
    const code = await page.evaluate(() => window.__emberisle.getState().code);
    const guest = await client("Josh", { width: 390, height: 844 });
    await guest.evaluate((c) => window.__emberisle.getState().joinTable(c), code);
    await guest.getByTestId("lobby-card").waitFor();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
    await page.evaluate(() => document.fonts.ready);
    await copies(page, tag, code);
    await tabs(page, tag);
    if (height < 600 && width > height) {
      const m = await sideways(page, tag);
      console.log(`ok  ${tag}: chat ${m.chat}, log ${m.log} px; header in the left column`);
    } else {
      const header = await box(page, ".lobby-header");
      const rules = await box(page, ".lobby-rules");
      near(header.w, rules.w, `${tag}: upright and wide, the header row keeps the full width`);
    }
    // The guest's code copies the same way.
    await guest.locator(".lobby-code").click();
    await guest.locator(".lobby-code[data-copied]").waitFor();
    assert.ok((await guest.evaluate(() => window.__copies.at(-1))).includes(`?code=${code}`), `${tag}: the guest copies the join link too`);
    console.log(`ok  ${tag}: one code button, join link copied, "Copied" in place, fallback, tabs and keys`);
    await guest.context().close();
    await page.context().close();
  }

  // With motion on, the swap is a fade; with reduced motion it is instant.
  const moving = await client("Jarrod", { width: 390, height: 844 }, { motion: "no-preference" });
  await moving.evaluate(() => window.__emberisle.getState().hostTable());
  await moving.getByTestId("lobby-card").waitFor();
  const fade = await moving.locator(".lobby-code > span").evaluateAll((spans) => spans.map((s) => [getComputedStyle(s).transitionProperty, getComputedStyle(s).transitionDuration]));
  assert.deepEqual(fade, [["opacity", "0.2s"], ["opacity", "0.2s"]], "motion on: the code and \"Copied\" cross-fade over 200 ms");
  // The tap starts a real opacity transition on both halves, read the moment "Copied" is set (frame timing in headless
  // Chromium is too coarse to sample a 200 ms fade).
  const running = await moving.locator(".lobby-code").evaluate((button) => new Promise((resolve) => {
    new MutationObserver((_, observer) => {
      if (!button.hasAttribute("data-copied")) return;
      observer.disconnect();
      resolve([...button.children].map((span) => { getComputedStyle(span).opacity; return span.getAnimations().map((a) => [a.transitionProperty, a.effect.getTiming().duration]); }));
    }).observe(button, { attributes: true });
    button.click();
  }));
  assert.deepEqual(running, [[["opacity", 200]], [["opacity", 200]]], `motion on: the code and "Copied" each start a 200 ms opacity fade ${JSON.stringify(running)}`);
  await moving.waitForFunction(() => [...document.querySelector(".lobby-code").children].every((s) => s.getAnimations().length === 0));
  assert.deepEqual(await moving.locator(".lobby-code > span").evaluateAll((spans) => spans.map((s) => getComputedStyle(s).opacity)), ["0", "1"], "motion on: the fade ends on \"Copied\"");
  await moving.context().close();
  const still = await client("Jarrod", { width: 390, height: 844 });
  await still.evaluate(() => window.__emberisle.getState().hostTable());
  await still.getByTestId("lobby-card").waitFor();
  assert.deepEqual(await still.locator(".lobby-code > span").evaluateAll((spans) => spans.map((s) => getComputedStyle(s).transitionDuration)), ["0s", "0s"], "reduced motion: no fade");
  await still.context().close();
  console.log("ok  motion: a 200 ms cross-fade, none with reduced motion");

  assert.deepEqual(errors, [], "zero browser errors");
  console.log("lobby-code-copy-prove: ok; real host, two clients, five viewports; zero browser errors");
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
