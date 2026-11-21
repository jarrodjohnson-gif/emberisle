// #1235 design utility: measure and picture the lobby at 100%, 125% and 150% text size.
// Not a CI proof. Run from the repo root: node docs/design/lobby-text-size/capture.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { createServer } from "vite";

const here = new URL(".", import.meta.url).pathname;
const pictures = new Set((process.env.PICTURES ?? "").split(",").filter(Boolean));
const rooms = mkdtempSync(join(tmpdir(), "emberisle-lobby-text-size-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../../../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR: rooms, RESULTS_DIR: join(rooms, "results"), PROFILES_DIR: join(rooms, "profiles") },
});
const errors = [];
let vite, browser;
try {
  const port = await new Promise((resolve, reject) => {
    host.on("error", reject);
    host.stdout.on("data", d => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
    host.on("exit", code => reject(new Error(`host exited ${code}`)));
  });
  vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
  await vite.listen();
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${port}`;
  browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  console.log(`browser ${browser.version()}, node ${process.version}`);
  async function client(name) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await context.addInitScript(n => { localStorage.setItem("emberisle-name", n); localStorage.setItem("emberisle-water", "simple"); }, name);
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(String(e)));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => window.__emberisle, null, { timeout: 60_000 });
    return page;
  }
  const page = await client("Jarrod");
  await page.evaluate(() => window.__emberisle.getState().hostTable());
  await page.getByTestId("lobby-card").waitFor({ timeout: 60_000 });
  const code = (await page.getByTestId("table-code").textContent()).trim();
  const guest = await client("Josh");
  await guest.evaluate(c => window.__emberisle.getState().joinTable(c), code);
  await guest.getByTestId("lobby-card").waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
  await page.getByTestId("add-bot").first().click();
  await page.waitForFunction(() => window.__emberisle.getState().seats.length === 3);
  await guest.locator("#chat-input").fill("Ready when you are!");
  await guest.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByTestId("chat-log").getByText("Ready when you are!").waitFor();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.waitForFunction(() => { const g = window.__emberisle.getState(); return g.seats.find(s => s.id === g.seatId)?.ready; });
  console.log(`room ${code}: host Jarrod (ready), guest Josh, one bot, one empty seat, one chat line`);

  const settle = () => page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cover = document.querySelector(".lobby-cover");
    cover.scrollTop = 0;
    cover.toggleAttribute("data-scrolls", !!document.getElementById("mock1235") && !document.getElementById("mock1235").disabled && cover.scrollHeight > cover.clientHeight + 1);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  // Every box that a person reads or presses, for the "nothing moved at 100%" check.
  const boxes = () => page.evaluate(process_debug => [...document.querySelectorAll(".lobby-cover button, .lobby-cover input, .lobby-cover [role=tab], .lobby-cover p, .lobby-cover li, .lobby-cover [data-testid]")]
    .map(e => { const r = e.getBoundingClientRect(); return (process_debug ? (e.getAttribute("data-testid") || e.className || e.textContent).toString().slice(0, 18) + ":" : "") + [r.x, r.y, r.width, r.height].map(n => Math.round(n * 100) / 100).join(","); }), !!process.env.LTS_DEBUG);
  const measure = () => page.evaluate(async () => {
    const cover = document.querySelector(".lobby-cover"), bar = document.querySelector(".lobby-actions");
    const shown = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
    const controls = [...cover.querySelectorAll("button, input, [role=tab]")].filter(shown);
    const label = e => (e.getAttribute("data-testid") || e.textContent.trim() || e.getAttribute("aria-label") || e.tagName).slice(0, 24);
    // A text is clipped when its box hides overflow and its laid-out text is wider than the box's content area.
    // The text width comes from a Range, in fractions of a px: scrollWidth rounds, and misses an ellipsis that cuts under 1 px.
    const cut = e => {
      const c = getComputedStyle(e);
      if (!["hidden", "clip"].includes(c.overflowX) || !e.textContent.trim()) return false;
      const range = document.createRange(); range.selectNodeContents(e);
      const text = Math.max(...[...range.getClientRects()].map(r => r.width), 0);
      const room = e.getBoundingClientRect().width - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight) - parseFloat(c.borderLeftWidth) - parseFloat(c.borderRightWidth);
      return text > room + 0.05 || e.scrollWidth > e.clientWidth;
    };
    const clipped = [...cover.querySelectorAll("*")].filter(e => shown(e) && !e.classList.contains("sr-only") && e.getAttribute("data-testid") !== "chat-log" && e !== cover
      && cut(e) && ![...e.querySelectorAll("*")].some(cut)).map(label);
    const small = controls.filter(e => { const r = e.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; }).map(label);
    const overlaps = [];
    for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i], b = controls[j];
      if (a.contains(b) || b.contains(a) || bar.contains(a) !== bar.contains(b)) continue;
      const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
      if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 1 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 1) overlaps.push(`${label(a)}+${label(b)}`);
    }
    const scrollY = cover.scrollHeight - cover.clientHeight;
    const frame = cover.getBoundingClientRect();
    const unreachable = [];
    for (const e of controls) {
      e.scrollIntoView({ block: "center", inline: "nearest" });
      const r = e.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!(hit && (e.contains(hit) || hit.contains(e))) || r.top < frame.top - 1 || r.bottom > frame.bottom + 1) unreachable.push(label(e));
    }
    const barAt = () => { const r = bar.getBoundingClientRect(); return r.top >= frame.top - 1 && r.bottom <= frame.bottom + 1; };
    cover.scrollTop = 0; const barTop = barAt();
    cover.scrollTop = scrollY; const barEnd = barAt();
    cover.scrollTop = 0;
    const px = s => parseFloat(getComputedStyle(document.querySelector(s)).fontSize);
    const cols = getComputedStyle(document.querySelector(".lobby-players")).gridTemplateColumns.split(" ").length;
    const codeEl = document.querySelector('[data-testid="table-code"]');
    return { scrollX: cover.scrollWidth - cover.clientWidth, scrollY, page: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      clipped, small, overlaps, unreachable, bar: barTop && barEnd, cols, log: Math.round(document.querySelector('[data-testid="chat-log"]').getBoundingClientRect().height),
      code: codeEl.scrollWidth <= codeEl.clientWidth + 1, name: px('[data-testid="lobby-name"] button'), ready: px(".lobby-action-buttons > button") };
  });
  const shot = async (tag, bottom) => {
    if (!pictures.has(tag)) return;
    await page.screenshot({ path: join(here, "pictures", `${tag}.png`) });
    if (bottom) {
      await page.evaluate(() => { const c = document.querySelector(".lobby-cover"); c.scrollTop = c.scrollHeight; });
      await page.screenshot({ path: join(here, "pictures", `${tag}-end.png`) });
      await page.evaluate(() => { document.querySelector(".lobby-cover").scrollTop = 0; });
    }
  };
  const views = [[320, 568], [375, 667], [390, 844], [844, 390], [1280, 720]];
  const base = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));

  // Pass 1: today's lobby at 100%, untouched.
  const today = {};
  for (const [w, h] of views) { await page.setViewportSize({ width: w, height: h }); await settle(); today[`${w}x${h}`] = await boxes(); await shot(`today-${w}x${h}-100`); }

  // Stand-in for #1750's rem conversion: every px font size and line height in the loaded styles becomes rem.
  const converted = await page.evaluate(() => {
    let n = 0;
    const walk = rules => { for (const r of rules) {
      if (r.cssRules) walk(r.cssRules);
      if (!r.style) continue;
      for (const prop of ["font-size", "line-height"]) {
        const m = r.style.getPropertyValue(prop).match(/^([\d.]+)px$/);
        if (m) { r.style.setProperty(prop, `${m[1] / 16}rem`, r.style.getPropertyPriority(prop)); n++; }
      }
    } };
    for (const s of document.styleSheets) { try { walk(s.cssRules); } catch { /* cross-origin: none here */ } }
    return n;
  });
  console.log(`rem only: converted ${converted} px font-size and line-height declarations`);
  await page.addStyleTag({ content: readFileSync(join(here, "mock.css"), "utf8") });
  await page.evaluate(() => { const s = [...document.querySelectorAll("style")].at(-1); s.id = "mock1235"; s.disabled = true; });
  const layer = on => page.evaluate(on => { document.getElementById("mock1235").disabled = !on; }, on);
  const caption = inHeader => page.evaluate(inHeader => {
    const s = document.querySelector(".lobby-rule-status");
    document.querySelector(inHeader ? ".lobby-header" : ".lobby-rules").appendChild(s);
  }, inHeader);

  // Pass 2: does the layer move anything at 100%? (Caption left where it is today.)
  for (const [w, h] of views) {
    await page.setViewportSize({ width: w, height: h });
    await layer(false); await settle(); const rem = await boxes();
    await layer(true); await settle(); const mock = await boxes();
    const diff = (a, b) => a.length !== b.length ? "count differs" : a.filter((v, i) => v !== b[i]).length;
    if (process.env.LTS_DEBUG) console.log(today[`${w}x${h}`].map((v, i) => v !== mock[i] ? `${v} -> ${mock[i]}` : "").filter(Boolean).slice(0, 6).join("\n"));
    console.log(`identity ${w}x${h}@100: rem only vs today ${diff(today[`${w}x${h}`], rem)} of ${rem.length} boxes moved; rem only plus mock layer vs today ${diff(today[`${w}x${h}`], mock)} moved`);
  }

  // Pass 3: the fifteen cases, rem only against the proposal.
  const line = (tag, m) => console.log(`${tag}: scroll x/y ${m.scrollX}/${m.scrollY}, page x ${m.page}, bar pinned ${m.bar}, seat columns ${m.cols}, chat log ${m.log} px, code fits ${m.code}, `
    + `name ${m.name} px, Ready ${m.ready} px, clipped ${m.clipped.length}${m.clipped.length ? ` [${m.clipped.join("; ")}]` : ""}, under 44 px ${m.small.length}${m.small.length ? ` [${m.small.join("; ")}]` : ""}, `
    + `overlaps ${m.overlaps.length}${m.overlaps.length ? ` [${m.overlaps.join("; ")}]` : ""}, unreachable ${m.unreachable.length}${m.unreachable.length ? ` [${m.unreachable.join("; ")}]` : ""}`);
  for (const [w, h] of views) {
    await page.setViewportSize({ width: w, height: h });
    for (const scale of process.env.LTS_DEBUG ? [] : [1, 1.25, 1.5]) {
      await page.evaluate(s => { document.documentElement.style.fontSize = `${s}px`; }, base * scale);
      const tag = `${w}x${h}-${scale * 100}`;
      await layer(false); await caption(false); await settle();
      line(`rem-only ${tag}`, await measure()); await shot(`rem-only-${tag}`);
      await layer(true); await caption(true); await settle();
      const m = await measure(); line(`proposed ${tag}`, m); await settle(); await shot(`proposed-${tag}`, m.scrollY > 1);
      await caption(false); await settle(); await shot(`caption-stays-${tag}`);
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  }
  console.log(`browser errors: ${errors.length}`);
  assert.equal(errors.length, 0, errors.join("\n"));
} finally {
  await browser?.close();
  await vite?.close();
  if (host.exitCode === null && host.signalCode === null) {
    const gone = new Promise(resolve => host.once("exit", resolve));
    host.kill();
    await gone;
  }
  rmSync(rooms, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
