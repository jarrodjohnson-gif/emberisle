// #543 (P-1): a reload restores the table in under two seconds. A real host serves the built dist/; three seats sit down
// (two are plain sockets), the game starts, and the seated browser at 390x844 reloads under a 4x CPU slowdown and a
// 1.6 Mbps / 150 ms network (the "Fast 3G"-like profile). From navigationStart, the board (island canvas drawn) and the
// player's own hand must be on screen with the median of five reloads inside 3000 ms (#624; no run over the 6000 ms outlier
// cap, #673), and the page must paint something branded before any table content.
// Each run prints where the time went. Run npm run build first.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// The rule (#673): 5 reloads, the median inside BUDGET; HARD is only an outlier cap, twice BUDGET, so one run that a busy
// runner stretched (4114 ms against a 2516 ms median on a docs-only PR) does not fail the proof, while a real slowdown moves
// the median and still does. Every run's time is printed.
const RUNS = Number(process.env.RESTORE_RUNS) || 5;
// 2026-10-16 (#624): 3000 / 3500 from 2000 / 2500. The owner: "Load time can increase, not a big deal, as long as the game
// is still snappy and has no lag." The Hex Jelly scenes load after the first draw; CI runners have measured 3.7 s medians
// on commits that changed nothing the page loads, so the old bound failed on the runner, not the change.
const BUDGET = Number(process.env.RESTORE_BUDGET_MS) || 3000;
const HARD = Number(process.env.RESTORE_HARD_MS) || 2 * BUDGET;
const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
if (!existsSync(`${DIST}index.html`)) {
  console.log("FAIL no dist/index.html: run npm run build first");
  process.exit(1);
}

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", DIST, ROOMS_DIR },
});
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
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, what, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const got = await check();
    if (got) return got;
    await sleep(50);
  }
  throw new Error(`timed out: ${what}`);
}

// The next move through the roll-off and setup for a seat that holds `legal`, or null when it is not its turn.
function setupMove(phase, legal) {
  if (!legal) return null;
  if (phase === "rollOff" && legal.actions.includes("roll")) return { type: "roll" };
  if (phase === "setupSettle" && legal.outpost.length) return { type: "place", kind: "outpost", id: legal.outpost[0] };
  if (phase === "setupRoad" && legal.path.length) return { type: "place", kind: "path", id: legal.path[0] };
  return null;
}

// A plain socket at the table: hello with the code, ready, and its share of the roll-off and setup.
function sitter(port, code, name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  let n = 0;
  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "hello", code, name })));
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(String(e.data));
    if (m.type === "welcome") ws.send(JSON.stringify({ type: "ready", value: true }));
    if (m.type !== "state" || !m.actionStamp) return;
    const move = setupMove(m.game.phase, m.legal);
    if (move) ws.send(JSON.stringify({ ...move, ...m.actionStamp, cid: `${name}${n++}` }));
  });
  return ws;
}

// In the page from the first byte: when the table's pieces first show, in ms since navigationStart.
const watcher = () => {
  const t = (window.__restore = { marks: {}, ws: [], paints: {} });
  const mark = (k) => (t.marks[k] ??= Math.round(performance.now()));
  const visible = (el) => {
    const r = el?.getBoundingClientRect();
    return Boolean(r) && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  };
  const NativeWS = window.WebSocket;
  window.WebSocket = class extends NativeWS {
    constructor(...a) {
      super(...a);
      const w = { dial: Math.round(performance.now()), open: null, msgs: [] };
      t.ws.push(w);
      this.addEventListener("open", () => (w.open = Math.round(performance.now())));
      this.addEventListener("message", (e) => {
        try {
          w.msgs.push([JSON.parse(e.data).type, Math.round(performance.now())]);
        } catch {}
      });
    }
  };
  new PerformanceObserver((l) => l.getEntries().forEach((e) => (t.paints[e.name] = Math.round(e.startTime)))).observe({ type: "paint", buffered: true });
  t.long = [];
  new PerformanceObserver((l) => l.getEntries().forEach((e) => t.long.push(`${Math.round(e.startTime)}+${Math.round(e.duration)}`))).observe({ type: "longtask", buffered: true });
  const frame = () => {
    const root = document.getElementById("root");
    const text = root?.innerText ?? "";
    if (root?.children.length) mark("firstContent");
    const splash = document.getElementById("splash");
    if (document.querySelector('[data-testid="restoring"]') || (splash && getComputedStyle(splash).display !== "none")) mark("loading");
    if (document.querySelector('[data-testid="title-card"]')) mark("title");
    if (document.querySelector('[data-testid="table-code"]')) mark("lobby");
    const canvas = document.querySelector("canvas");
    if (window.__isle) mark("island");
    if (window.__isle?.renders > 0) mark("firstFrame");
    // Drawn means a frame went out after the real board was set: the renderer counts them, and sets the board as the store changes.
    const live = window.__emberisle?.getState();
    if (live?.state && live.screen === "play") {
      mark("state");
      t.drawn0 ??= window.__isle?.renders ?? 0;
      if (visible(canvas) && window.__isle && window.__isle.renders > t.drawn0) mark("canvas");
    }
    if (visible(document.querySelector('[data-testid="hand-dock"]'))) mark("hand");
    if (visible(document.querySelector("header"))) mark("hud");
    if (t.marks.canvas && t.marks.hand) return mark("board");
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};

const boards = [];
const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // A saved water choice skips the one-time GPU probe (crystal-water.md). Unsaved, the probe starts a second after the
  // client settles, which is exactly when the first timed reload below fires, and its blocking pixel reads under the 4x
  // throttle held that reload's unload by about 2 s. The probe has its own proofs (jelly-ocean, table-menu); this one times
  // the restore.
  await page.addInitScript(() => {
    localStorage.setItem("emberisle-name", "Ember");
    localStorage.setItem("emberisle-water", "simple");
  });
  await page.goto(`http://127.0.0.1:${hostPort}/`);
  await page.getByRole("button", { name: "Host a table" }).click();
  const code = (await page.getByTestId("table-code").textContent()).trim();
  const others = [sitter(hostPort, code, "Tide"), sitter(hostPort, code, "Pine")];
  await until(() => page.locator("li").filter({ hasText: "Tide" }).count().then((n) => n && page.locator("li").filter({ hasText: "Pine" }).count()), "both seats in the lobby");
  await page.evaluate(() => window.__emberisle.getState().setReady(true));
  await until(() => page.evaluate(() => window.__emberisle.getState().seats.every((s) => s.ready)), "everyone ready");
  await page.evaluate(() => window.__emberisle.getState().startTable());
  await until(() => page.evaluate(() => window.__emberisle.getState().screen === "play" && window.__emberisle.getState().state), "the game starting");
  // The browser seat plays its own roll-off and setup moves through the store, as taps would.
  await until(
    () =>
      page.evaluate(() => {
        const st = window.__emberisle.getState();
        const { phase } = st.state;
        const { legal } = st;
        if (!["rollOff", "setupSettle", "setupRoad"].includes(phase)) return true;
        if (legal && phase === "rollOff" && legal.actions.includes("roll")) st.dispatch({ type: "roll" });
        else if (legal && phase === "setupSettle" && legal.outpost.length) st.dispatch({ type: "setupSettle", vertexId: legal.outpost[0] });
        else if (legal && phase === "setupRoad" && legal.path.length) st.dispatch({ type: "setupRoad", edgeId: legal.path[0] });
        return false;
      }),
    "roll-off and setup finishing",
    60_000,
  );
  await page.waitForSelector('[data-testid="hand-dock"]');
  const phase = await page.evaluate(() => window.__emberisle.getState().state.phase);
  check("setup: the seated browser holds a hand in a started game", true, { code, phase });

  // Chrome keeps compiled code for a script once the page has loaded twice. A player reloading mid-game has been on the page
  // for a while, so the page has loaded a few times before the reloads timed below.
  for (let i = 0; i < 2; i++) {
    await page.reload();
    await page.waitForSelector('[data-testid="hand-dock"]');
  }

  // From here the page is a phone: 4x CPU, 1.6 Mbps down / 750 kbps up, 150 ms.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(watcher);

  // One reload under the throttle that is not timed: the page's compiled code is cached in the background after a load, and
  // the load that writes it is not the one a player's next reload resembles.
  await page.reload();
  await page.waitForSelector('[data-testid="hand-dock"]');
  await sleep(1000);

  // The median of the reloads must land inside BUDGET; a single run is only held to the outlier cap HARD (no re-measuring: a run
  // is never thrown away, so a slow stretch shows up in the median).
  for (let run = 1; run <= RUNS; run++) {
    await page.reload({ waitUntil: "commit" });
    const t = await until(
      () => page.evaluate(() => window.__restore?.marks.board !== undefined && window.__restore),
      `run ${run}: the board and hand on screen`,
      20_000,
    );
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      return {
        responseEnd: Math.round(n.responseEnd),
        dcl: Math.round(n.domContentLoadedEventEnd),
        res: performance
          .getEntriesByType("resource")
          .filter((e) => /\/assets\/.*\.js/.test(e.name))
          .map((e) => `${e.name.split("/").pop().replace(/-[\w-]{8}\.js$/, "")} ${Math.round(e.startTime)}-${Math.round(e.responseEnd)}${e.transferSize === 0 ? " (cache)" : ""}`),
      };
    });
    const w = t.ws[0];
    const msgs = Object.fromEntries((w?.msgs ?? []).map(([k, v]) => [k, v]).reverse());
    console.log(`run ${run}: html ${nav.responseEnd}ms, dom ${nav.dcl}ms | chunks ${nav.res.join(", ")}`);
    console.log(`run ${run}: first paint ${t.paints["first-paint"]} fcp ${t.paints["first-contentful-paint"]} | socket dial ${w?.dial} open ${w?.open} welcome ${msgs.welcome} state ${msgs.state} | marks ${JSON.stringify(t.marks)}`);
    console.log(`run ${run}: long tasks ${t.long.join(" ")}`);
    const board = t.marks.board;
    boards.push(board);
    check(`run ${run}: board + own hand on screen at ${board} ms (outlier cap ${HARD})`, board <= HARD, t.marks);
    const fcp = t.paints["first-contentful-paint"];
    check(`run ${run}: the branded loading state painted (${fcp} ms) before any table content`, t.marks.loading !== undefined && fcp !== undefined && fcp < Math.min(t.marks.hud ?? 1e9, t.marks.canvas ?? 1e9), { paints: t.paints, loading: t.marks.loading });
    check(`run ${run}: no flash of the title`, t.marks.title === undefined, t.marks);
    const screen = await page.evaluate(() => window.__emberisle.getState().screen);
    check(`run ${run}: still seated at the table`, screen === "play");
    await sleep(500);
  }
  const sorted = [...boards].sort((a, b) => a - b);
  console.log(`board on screen, ms from navigationStart: ${boards.join(", ")} (median ${sorted[Math.floor(sorted.length / 2)]}, max ${sorted.at(-1)})`);
  const median = sorted[Math.floor(sorted.length / 2)];
  check(`median ${median} ms inside ${BUDGET} ms`, median <= BUDGET);
  check("no page errors", errors.length === 0, errors);
  others.forEach((o) => o.close());
} catch (err) {
  fails.push(String(err));
  console.log(`FAIL ${err.stack ?? err}`);
} finally {
  await browser.close();
}
if (fails.length) {
  console.log(`restore prove: ${fails.length} failed`);
  process.exit(1);
}
console.log(`restore prove ok (${RUNS} reloads, median inside ${BUDGET} ms, every run under the ${HARD} ms outlier cap)`);
process.exit(0);
