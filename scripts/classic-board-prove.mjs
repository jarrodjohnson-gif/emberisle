// #760: the local board-look preference and the final Classic acceptance, on the real renderer, store and Table menu.
// Run one browser proof at a time: npm run classic-board-prove (about ten minutes on a software GPU).
// - Build graph: gzip by chunk, and Classic outside the entry, IslandCanvas and Jelly static dependency paths.
// - Storage: missing, invalid, valid, blocked-read and blocked-write; the choice reaches the renderer, survives a reload, a new
//   game and a renderer remount, and a blocked write still holds for the page.
// - Menu at 320x568, 440x956, 956x440 and 1280x720: the Board row beside Water and View, one aria-pressed choice, 44 px
//   targets, focus, reachability inside the panel, and the camera unchanged by a switch.
// - Quality: forced full and lite, crystal and simple water, both cameras and reduced motion, each with an explicit Classic
//   request that must be displayed, ready and error-free (a failed chunk fails the proof, never skips it).
// - Failure: an injected import failure shows "Classic could not load" with Retry; Jelly stays; Retry recovers.
// - Two clients in one room: different looks, equal canonical state, no message sent or received because of a look.
// - Cost: three interleaved Classic-lite/Jelly-lite runs, median and p95 frame intervals within ten percent.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "./proof-browser.mjs";
import { build, createServer } from "vite";

const check = (ok, label, detail) => {
  if (!ok) assert.fail(detail === undefined ? label : `${label}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  console.log(`ok  ${label}`);
};

// ---- Build graph -------------------------------------------------------------------------------------------------------------
const outDir = mkdtempSync(path.join(tmpdir(), "emberisle-760-dist-"));
await build({ logLevel: "silent", build: { outDir, emptyOutDir: true } });
{
  const assets = path.join(outDir, "assets");
  const files = readdirSync(assets).filter((f) => f.endsWith(".js"));
  const text = new Map(files.map((f) => [f, readFileSync(path.join(assets, f), "utf8")]));
  const statics = (f) => [...text.get(f).matchAll(/(?:^|[;}])\s*(?:import|export)[^"';]*?from\s*"\.\/([^"]+\.js)"|(?:^|[;}])import\s*"\.\/([^"]+\.js)"/g)].map((m) => m[1] ?? m[2]).filter((n) => text.has(n));
  const closure = (roots) => {
    const seen = new Set(roots);
    for (const f of seen) for (const n of statics(f)) seen.add(n);
    return seen;
  };
  const html = readFileSync(path.join(outDir, "index.html"), "utf8");
  const entry = path.basename(html.match(/<script type="module"[^>]* src="([^"]+)"/)[1]);
  const find = (re) => files.filter((f) => re.test(f));
  const classic = find(/^(classic-board|terrain-classic)-/);
  check(classic.length >= 1 && find(/^jelly-board-/).length === 1 && find(/^IslandCanvas-/).length === 1, "classic, jelly and renderer chunks exist", { classic });
  for (const f of [...classic, ...find(/^(jelly-board|IslandCanvas|appearance-controller)-/), entry]) {
    console.log(`chunk ${f}: ${(gzipSync(text.get(f)).length / 1000).toFixed(2)} kB gzip, static imports [${statics(f).join(", ")}]`);
  }
  const startup = closure([entry, ...find(/^IslandCanvas-/), ...find(/^jelly-board-/), ...find(/^appearance-controller-/)]);
  check(classic.every((f) => !startup.has(f)), "Classic stays outside the entry, IslandCanvas, Jelly and controller dependency paths", [...startup].filter((f) => classic.includes(f)));
  check(!find(/^jelly-board-/).some((f) => closure([f]).has(classic[0])), "Jelly does not depend on Classic");
}

// ---- Browser -----------------------------------------------------------------------------------------------------------------
const PORT = Number(process.env.VITE_PORT) || 8199;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true, hmr: false }, logLevel: "error" });
await vite.listen();
const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-760-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], { cwd: new URL("../server/", import.meta.url), env: { ...process.env, PORT: "0", ROOMS_DIR: rooms } });
const hostPort = await new Promise((resolve, reject) => {
  host.on("error", reject);
  host.stdout.on("data", (d) => { const m = String(d).match(/listening (\d+)/); if (m) resolve(Number(m[1])); });
  host.on("exit", (code) => reject(new Error(`host exited ${code}`)));
});
const base = `http://127.0.0.1:${PORT}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const KEY = "emberisle-board-look";

const open = async ({ width = 1280, height = 720, init, url = base, reducedMotion = "no-preference", storage = {} } = {}) => {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: width < 700, isMobile: width < 700 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|could not load|net::ERR/i.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(([entries, extra]) => {
    for (const [k, v] of Object.entries(entries)) if (!sessionStorage.getItem(`seeded:${k}`)) { localStorage.setItem(k, v); sessionStorage.setItem(`seeded:${k}`, "1"); }
    if (extra) new Function(extra)();
  }, [{ "emberisle-water": "simple", "emberisle-jelly": "lite", ...storage }, init ?? ""]);
  await page.goto(url);
  await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0, null, { timeout: 120_000 });
  return page;
};
const status = (page) => page.evaluate(() => ({ ...window.__isle.landStatus, store: window.__emberisle.getState().boardLook }));
const settled = (page, look, timeout = 180_000) => page.waitForFunction((l) => {
  const s = window.__isle.landStatus;
  return s.requested === l && s.displayed === l && s.ready && !s.loading && !s.error;
}, look, { timeout });
const openMenu = async (page) => {
  await page.getByRole("button", { name: "Table menu" }).click();
  const menu = page.getByRole("dialog", { name: "Table menu" });
  await menu.waitFor();
  return menu;
};
const camera = (page) => page.evaluate(() => JSON.stringify([window.__isle.cam().matrixWorld.elements, window.__isle.cam().projectionMatrix.elements]));

try {
  // Storage: missing, invalid, valid, blocked read, blocked write.
  {
    let page = await open();
    check((await status(page)).requested === "jelly" && (await status(page)).store === "jelly", "missing storage requests Jelly");
    await settled(page, "jelly");
    await page.context().close();
    page = await open({ storage: { [KEY]: "sparkle" } });
    await settled(page, "jelly");
    check((await status(page)).store === "jelly", "an invalid stored value means Jelly");
    await page.context().close();
    page = await open({ storage: { [KEY]: "classic" } });
    await settled(page, "classic");
    check((await status(page)).displayed === "classic", "a stored Classic choice is requested at startup and displayed");
    await page.reload();
    await page.waitForFunction(() => window.__isle?.renders > 0);
    await settled(page, "classic");
    check(true, "reload keeps Classic");
    await page.context().close();
    page = await open({ init: "Storage.prototype.getItem = function (k) { if (k === 'emberisle-board-look') throw new Error('blocked'); return Object.getPrototypeOf(this).constructor === Storage ? this[k] ?? null : null; };", storage: { [KEY]: "classic" } });
    await settled(page, "jelly");
    check((await status(page)).store === "jelly", "blocked read means Jelly");
    await page.context().close();
    page = await open({ init: "Storage.prototype.setItem = function (k, v) { if (k === 'emberisle-board-look') throw new Error('blocked'); this[k] = v; };" });
    await page.evaluate(() => window.__emberisle.getState().startHotseat(3));
    let menu = await openMenu(page);
    await menu.getByRole("group", { name: "Board" }).getByRole("button", { name: "Classic" }).click();
    await settled(page, "classic");
    check((await status(page)).store === "classic", "blocked write still lets the page choose Classic");
    await page.getByRole("button", { name: "Close" }).first().click().catch(() => page.keyboard.press("Escape"));
    await page.evaluate(() => { window.__emberisle.getState().goTitle(); window.__emberisle.getState().startHotseat(3); });
    await settled(page, "classic");
    check(true, "a new game and a remount of the board keep the session choice");
    await page.context().close();
  }

  // Menu at the four sizes.
  for (const [width, height] of [[320, 568], [440, 956], [956, 440], [1280, 720]]) {
    const tag = `${width}x${height}`;
    const page = await open({ width, height });
    await page.evaluate(() => window.__emberisle.getState().startHotseat(3));
    await settled(page, "jelly");
    const menu = await openMenu(page);
    const row = menu.getByRole("group", { name: "Board" });
    await row.waitFor();
    const geometry = await menu.evaluate((el) => {
      const rect = (e) => e.getBoundingClientRect();
      const panel = rect(el);
      const group = (n) => el.querySelector(`[role=group][aria-label=${n}]`);
      const board = group("Board");
      const buttons = [...board.querySelectorAll("button")];
      const water = rect(group("Water")), view = rect(group("View")), b = rect(board);
      return {
        labels: buttons.map((x) => x.textContent.trim()),
        pressed: buttons.map((x) => x.getAttribute("aria-pressed")),
        sizes: buttons.map((x) => [Math.round(rect(x).width), Math.round(rect(x).height)]),
        inside: buttons.every((x) => rect(x).left >= panel.left - 1 && rect(x).right <= panel.right + 1),
        order: water.top < view.top && view.top < b.top,
        sameEdges: Math.abs(b.left - view.left) < 1 && Math.abs(b.right - view.right) < 1,
        buttonLefts: buttons.map((x) => Math.round(rect(x).left)),
        viewLefts: [...group("View").querySelectorAll("button")].map((x) => Math.round(rect(x).left)),
      };
    });
    check(JSON.stringify(geometry.labels) === '["Jelly","Classic"]' && JSON.stringify(geometry.pressed) === '["true","false"]', `${tag}: Board offers Jelly and Classic with one pressed`, geometry);
    check(geometry.sizes.every(([w, h]) => w >= 44 && h >= 44), `${tag}: Board targets are 44 px`, geometry.sizes);
    check(geometry.inside && geometry.order && geometry.sameEdges && JSON.stringify(geometry.buttonLefts) === JSON.stringify(geometry.viewLefts), `${tag}: Board sits under View inside the panel on the same columns`, geometry);
    await row.getByRole("button", { name: "Classic" }).scrollIntoViewIfNeeded();
    await page.keyboard.press("Shift");
    await row.getByRole("button", { name: "Classic" }).focus();
    check(await page.evaluate(() => document.activeElement?.textContent.trim()) === "Classic", `${tag}: the Classic choice takes focus`);
    const outline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return `${s.outlineStyle}|${s.boxShadow}`; });
    check(!/^none\|none$/.test(outline), `${tag}: the focused choice shows a focus treatment`, outline);
    const before = await camera(page);
    await row.getByRole("button", { name: "Classic" }).click();
    await settled(page, "classic");
    check(await camera(page) === before, `${tag}: switching to Classic leaves the camera unchanged`);
    check(await page.evaluate((k) => localStorage.getItem(k), KEY) === "classic", `${tag}: the choice is stored`);
    check(await row.getByRole("button", { name: "Classic" }).getAttribute("aria-pressed") === "true" && await row.getByRole("button", { name: "Jelly" }).getAttribute("aria-pressed") === "false", `${tag}: only Classic is pressed`);
    await row.getByRole("button", { name: "Jelly" }).click();
    await settled(page, "jelly");
    check(await camera(page) === before, `${tag}: back to Jelly leaves the camera unchanged`);
    await page.context().close();
  }

  // Quality, camera, water and reduced motion, each with an explicit Classic request.
  for (const quality of ["lite", "full"]) for (const water of ["simple", "crystal"]) for (const reducedMotion of ["no-preference", "reduce"]) {
    const page = await open({ reducedMotion, storage: { "emberisle-jelly": quality, "emberisle-water": water, [KEY]: "classic" } });
    await page.evaluate(() => window.__emberisle.getState().startHotseat(3));
    await settled(page, "classic");
    for (const view of ["diorama", "overhead"]) {
      await page.evaluate((v) => window.__emberisle.getState().setViewChoice(v), view);
      await page.waitForFunction((v) => window.__isle.view === v || window.__emberisle.getState().playView === v, view);
      const s = await status(page);
      check(s.displayed === "classic" && s.quality === quality && s.ready && !s.error && !s.loading, `Classic ${quality}, ${water} water, ${view}, motion ${reducedMotion}: displayed, ready, no error`, s);
    }
    await page.context().close();
  }

  // Failure and Retry.
  for (const [width, height] of [[320, 568], [390, 844]]) {
    const page = await open({ width, height });
    await page.evaluate(() => window.__emberisle.getState().startHotseat(3));
    await settled(page, "jelly");
    await page.route("**/src/lib/scene/classic-board.ts*", (route) => route.abort());
    const menu = await openMenu(page);
    await menu.getByRole("group", { name: "Board" }).getByRole("button", { name: "Classic" }).click();
    const message = menu.getByRole("alert");
    await message.waitFor({ timeout: 60_000 });
    check((await message.textContent()) === "Classic could not load", "a failed Classic import says so in the menu row");
    const retry = menu.getByRole("button", { name: "Retry" });
    const box = await menu.evaluate((el) => {
      const r = (e) => e.getBoundingClientRect();
      const row = el.querySelector("[role=group][aria-label=Board]");
      const [jelly, classic] = [...row.querySelectorAll("button")];
      const alert = row.querySelector("[role=alert]"), retry = [...row.querySelectorAll("button")].find((b) => b.textContent === "Retry");
      return { gap: r(alert).top - r(classic).bottom, retryGap: r(retry).top - r(classic).bottom, retryH: r(retry).height, retryW: r(retry).width, retryLeft: r(retry).left - r(classic).left, alertLeft: r(alert).left - r(row.firstElementChild).left, color: getComputedStyle(alert).color, danger: (() => { const t = document.createElement("i"); t.className = "text-danger"; el.append(t); const c = getComputedStyle(t).color; t.remove(); return c; })(), panelRight: r(el).right - r(retry).right };
    });
    check(box.gap >= 8 && box.retryGap >= 8 && box.retryH >= 44 && box.retryW >= 44 && Math.abs(box.retryLeft) < 1 && Math.abs(box.alertLeft) < 1 && box.color === box.danger && box.panelRight >= -1, "the error line sits 8 px under the choices, left-aligned, in the danger colour, with a 44 px Retry in the Classic column", box);
    if (process.env.SHOTS) await retry.scrollIntoViewIfNeeded(), await page.screenshot({ path: path.join(process.env.SHOTS, `failure-${width}x${height}.png`) });
    const s = await status(page);
    check(s.displayed === "jelly" && s.requested === "classic" && s.store === "classic", "Jelly stays visible and the stored choice is kept", s);
    await page.unroute("**/src/lib/scene/classic-board.ts*");
    await retry.click();
    await settled(page, "classic");
    check(await message.count() === 0 && await retry.count() === 0, "Retry recovers Classic and clears the message");
    await page.context().close();
  }

  // Two clients in one room.
  {
    const url = `${base}?host=ws://127.0.0.1:${hostPort}`;
    const a = await open({ url });
    await a.evaluate(() => window.__emberisle.getState().hostTable());
    await a.getByTestId("lobby-card").waitFor();
    const code = (await a.getByTestId("table-code").textContent()).trim();
    const b = await open({ url, width: 390, height: 844 });
    const frames = { a: { in: 0, out: 0 }, b: { in: 0, out: 0 } };
    for (const [name, page] of [["a", a], ["b", b]]) {
      page.on("websocket", (ws) => { ws.on("framereceived", () => frames[name].in++); ws.on("framesent", () => frames[name].out++); });
    }
    await b.evaluate((c) => window.__emberisle.getState().joinTable(c), code);
    await b.getByTestId("lobby-card").waitFor();
    await a.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
    await a.evaluate(() => window.__emberisle.getState().addBot());
    await a.waitForFunction(() => window.__emberisle.getState().seats.length === 3);
    await b.evaluate(() => window.__emberisle.getState().setReady(true));
    await a.getByRole("button", { name: "Ready", exact: true }).click();
    await a.getByRole("button", { name: "Start", exact: true }).click();
    await Promise.all([a, b].map((p) => p.waitForFunction(() => window.__emberisle.getState().screen === "play" && window.__emberisle.getState().state)));
    await Promise.all([a, b].map((p) => settled(p, "jelly")));
    const canon = (p) => p.evaluate(() => { const g = window.__emberisle.getState().state; return JSON.stringify([g.seq, g.phase, g.current, g.hexes, g.vertices, g.edges, g.players.map((q) => q.id)]); });
    const same = await canon(a) === await canon(b);
    const before = JSON.stringify(frames);
    await b.evaluate(() => window.__emberisle.getState().setBoardLook("classic"));
    await settled(b, "classic");
    await a.waitForTimeout(1000);
    check(JSON.stringify(frames) === before, "choosing a look sends and receives no network message", { before, after: frames });
    check(same && await canon(a) === await canon(b), "canonical state is identical in both clients");
    const [sa, sb] = [await status(a), await status(b)];
    check(sa.displayed === "jelly" && sb.displayed === "classic" && sa.store === "jelly" && sb.store === "classic", "the two clients show different looks in one room", { sa, sb });
    await a.context().close();
    await b.context().close();
  }

  // Cost: three interleaved runs of Classic lite and Jelly lite on one page.
  {
    const page = await open();
    await page.evaluate(() => window.__emberisle.getState().startHotseat(3));
    await settled(page, "jelly");
    const sample = async (look) => {
      await page.evaluate((l) => window.__emberisle.getState().setBoardLook(l), look);
      await settled(page, look);
      await page.waitForTimeout(1500);
      return page.evaluate(() => new Promise((resolve) => {
        const times = [];
        const tick = (t) => { times.push(t); if (t - times[0] < 6000) requestAnimationFrame(tick); else { const d = times.slice(1).map((x, i) => x - times[i]).sort((x, y) => x - y); resolve({ median: d[Math.floor(d.length / 2)], p95: d[Math.floor(d.length * 0.95)], n: d.length }); } };
        requestAnimationFrame(tick);
      }));
    };
    const runs = { jelly: [], classic: [] };
    for (let i = 0; i < 3; i++) for (const look of i % 2 ? ["classic", "jelly"] : ["jelly", "classic"]) runs[look].push(await sample(look));
    const med = (xs) => [...xs].sort((a, b) => a - b)[1];
    for (const look of ["jelly", "classic"]) console.log(`${look} lite: ${runs[look].map((r) => `median ${r.median.toFixed(1)} p95 ${r.p95.toFixed(1)} (${r.n})`).join(" | ")}`);
    for (const stat of ["median", "p95"]) {
      const j = med(runs.jelly.map((r) => r[stat])), c = med(runs.classic.map((r) => r[stat]));
      check(c <= j * 1.1, `Classic lite ${stat} frame interval ${c.toFixed(1)} ms within 10% of Jelly lite ${j.toFixed(1)} ms`);
    }
    await page.context().close();
  }
  check(errors.length === 0, "no page or console errors", errors);
  console.log("classic-board-prove: ok");
} finally {
  await browser.close();
  host.kill();
  await vite.close();
}
