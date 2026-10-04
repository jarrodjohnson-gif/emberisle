// The turn timer countdown in the HUD (#345): three headless tabs on a host with TURN_MS=25000. Once the roll-off is
// done and nobody acts, every tab shows the chip for the seat the host waits on (the owner reads "You"), and each tab
// hears one polite line. A second state push inside the window (a seat drops and rejoins) must not remount the chip
// or repeat the line. The count runs down, the host moves on (#344) and the chip re-arms; when the turn passes the
// chip names the next seat. One tab asks for reduced motion and gets no entry fade. Every wait is DOM-based.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8099;
const TURN = 25000;
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", TURN_MS: String(TURN), ACT_RATE: "1000", ACT_CAP: "1000", ROOMS_DIR },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const hostPort = await new Promise((resolve, reject) => {
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  });
  host.on("exit", (c) => reject(new Error(`host exited ${c}`)));
});

// Other proofs may hold the port for a while; wait for it rather than fail or take theirs.
async function serve() {
  for (let i = 0; ; i++) {
    const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
    try {
      await vite.listen();
      return vite;
    } catch (e) {
      await vite.close();
      if (!/EADDRINUSE|already in use/.test(String(e)) || i >= 60) throw e;
      if (i === 0) console.log(`port ${PORT} is busy; waiting`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
const vite = await serve();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
});

const errors = [];
let code = 0;

async function tab(name, opts = {}) {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 }, ...opts });
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${name}: ${r.status()} ${r.url()}`));
  await page.addInitScript((n) => localStorage.setItem("emberisle-name", n), name);
  await page.goto(`http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`);
  return { name, page };
}

const view = (t) =>
  t.page.evaluate(() => {
    const s = window.__emberisle.getState();
    const g = s.state;
    if (!g) return null;
    const chip = document.querySelector('[data-testid="turn-countdown"]');
    return {
      you: s.localId,
      legal: s.legal,
      seq: g.seq,
      phase: g.phase,
      current: g.current,
      error: s.error,
      players: g.players.map((p) => ({ id: p.id, name: p.name })),
      chip: chip && { player: chip.dataset.player, seconds: Number(chip.dataset.seconds), text: chip.textContent, fade: getComputedStyle(chip).animationDuration },
      live: document.querySelector('[data-testid="turn-countdown-live"]')?.textContent ?? null,
      liveTexts: window.__liveTexts ?? [],
      states: window.__states ?? 0,
      liveChanges: window.__liveChanges ?? 0,
    };
  });
const views = (tabs) => Promise.all(tabs.map(view));

async function until(check, what, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const got = await check();
    if (got) return got;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out: ${what}`);
}

// Fresh islands can block on their cold render for a while, so the start and the roll-off get a longer wait.
const synced = (tabs, seq, what) =>
  until(async () => {
    const vs = await views(tabs);
    return vs.every((v) => v && v.seq > seq) && new Set(vs.map((v) => v.seq)).size === 1 ? vs : null;
  }, what, 30_000);

const act = (t, fn, arg) => t.page.evaluate(([f, a]) => window.__emberisle.getState()[f](...[].concat(a)), [fn, arg]);

// Every tab's chip names `pid` and reads "You: m:ss" on that seat's own tab, "<name>: m:ss" elsewhere.
async function chipsName(tabs, pid, what) {
  const vs = await until(async () => {
    const vs = await views(tabs);
    return vs.every((v) => v?.chip?.player === pid) ? vs : null;
  }, `${what}: chip for ${pid} on every tab`);
  const name = vs[0].players.find((p) => p.id === pid).name;
  for (const v of vs) {
    const want = new RegExp(`^${v.you === pid ? "You" : name}: \\d+:\\d\\d$`);
    if (!want.test(v.chip.text)) throw new Error(`${what}: chip reads "${v.chip.text}", wanted ${want}`);
  }
  return vs;
}

// Every tab's live region has carried the one line for `pid` (recorded in the page, since a lagging tab may show
// it later than the others and the line is cleared when the window re-arms).
const liveSays = (tabs, pid, what, ms) =>
  until(async () => {
    const vs = await views(tabs);
    const name = vs[0]?.players.find((p) => p.id === pid)?.name;
    return vs.every((v) => v && v.liveTexts.some((t) => new RegExp(`^\\d+ seconds left for ${v.you === pid ? "you" : name}$`).test(t))) ? vs : null;
  }, `${what}: live line for ${pid} on every tab`, ms);

try {
  const a = await tab("Ember");
  // Ember keeps motion for the fade check; the other two ask for reduced motion, which also keeps their island
  // loops idle so three software-GL tabs do not starve each other of frames.
  const b = await tab("Tide", { reducedMotion: "reduce" });
  const c = await tab("Pine", { reducedMotion: "reduce" });
  const tabs = [a, b, c];

  await a.page.getByRole("button", { name: "Host a table" }).click();
  const tableCode = (await a.page.getByTestId("table-code").textContent()).trim();
  for (const t of [b, c]) {
    await t.page.getByPlaceholder(/code/i).fill(tableCode);
    await t.page.getByRole("button", { name: "Join" }).click();
    await t.page.getByTestId("table-code").waitFor();
  }
  for (const t of tabs) {
    await until(async () => (await t.page.locator("li", { hasText: "Pine" }).count()) === 1, `${t.name} sees 3 seats`);
    await t.page.getByRole("button", { name: "Ready", exact: true }).click();
  }
  await a.page.getByRole("button", { name: "Start" }).click();
  let vs = await synced(tabs, -1, "start");

  // The tabs roll the roll-off themselves (#232) so the timer's first idle window is a setup placement.
  for (let n = 0; vs[0].phase === "rollOff"; n++) {
    if (n > 30) throw new Error("roll-off never ended");
    const i = vs.findIndex((v) => v.you === vs[0].current);
    await act(tabs[i], "dispatch", [{ type: "roll" }]);
    vs = await synced(tabs, vs[0].seq, `roll-off roll ${n}`);
  }
  if (vs[0].phase !== "setupSettle") throw new Error(`after the roll-off: ${vs[0].phase}`);
  const first = vs[0].current;
  const firstTab = tabs[vs.findIndex((v) => v.you === first)];
  const seq0 = vs[0].seq;
  console.log(`table ${tableCode}: setup starts, ${first} (${firstTab.name}) is current and nobody acts`);

  // The chip names the waited-on seat on all three tabs. One seat the host is not waiting on will drop and rejoin;
  // the other two tabs watch for extra state pushes, for the chip node being replaced, and for every change to the
  // live region, which must be written exactly once in this window.
  vs = await chipsName(tabs, first, "first window");
  for (const t of tabs) {
    await t.page.evaluate(() => {
      window.__liveTexts = [];
      new MutationObserver(() => {
        const text = document.querySelector('[data-testid="turn-countdown-live"]')?.textContent;
        if (text && text !== window.__liveTexts.at(-1)) window.__liveTexts.push(text);
      }).observe(document.body, { childList: true, characterData: true, subtree: true });
    });
  }
  const dropper = [c, b].find((t) => t !== firstTab);
  const watchers = tabs.filter((t) => t !== dropper);
  for (const t of watchers) {
    await t.page.evaluate(() => {
      window.__states = 0;
      window.__emberisle.subscribe((s, prev) => s.legal !== prev.legal && window.__states++);
      window.__chip = document.querySelector('[data-testid="turn-countdown"]');
      window.__chipGone = 0;
      window.__liveChanges = 0;
      const chip = (n) => n.nodeType === 1 && n.dataset?.testid === "turn-countdown";
      new MutationObserver((muts) => muts.forEach((m) => m.removedNodes.forEach((n) => chip(n) && window.__chipGone++))).observe(document.body, { childList: true, subtree: true });
      new MutationObserver(() => window.__liveChanges++).observe(document.querySelector('[data-testid="turn-countdown-live"]'), { childList: true, characterData: true, subtree: true });
    });
  }
  console.log(`chip on every tab: ${vs.map((v) => `"${v.chip.text}"`).join(", ")}`);

  // Reduced motion: Pine's chip has no entry fade (the global 1 ms rule), Ember's keeps the 200 ms one.
  if (vs[2].chip.fade !== "0.001s") throw new Error(`reduced-motion tab fades for ${vs[2].chip.fade}`);
  if (vs[0].chip.fade !== "0.2s") throw new Error(`motion tab fades for ${vs[0].chip.fade}`);
  console.log(`entry fade: ${vs[0].chip.fade} on Ember, ${vs[2].chip.fade} on Pine (prefers-reduced-motion)`);

  // A second state push inside the same window: the dropper closes its socket and rejoins, and the host pushes state
  // to every seat. On the watchers the chip element is the same one (same window, whatever the skew wobble).
  const di = tabs.indexOf(dropper);
  await dropper.page.evaluate(() => window.__emberisle.getState().net.drop());
  const w = (vs) => tabs.map((t, i) => vs[i]).filter((_, i) => i !== di);
  vs = await until(async () => {
    const vs = await views(tabs);
    return vs.every((v) => v) && w(vs).every((v) => v.states >= 1) && !vs[di].error && vs[di].chip?.player === first ? vs : null;
  }, `${dropper.name} rejoins and every seat gets a second state`, TURN);
  if (!(w(vs)[0].chip?.seconds > 0 && vs.every((v) => v.seq === seq0))) throw new Error(`the rejoin landed after the window ended (seq ${vs.map((v) => v.seq)}, chip ${w(vs)[0].chip?.text})`);
  const mounted = await Promise.all(watchers.map((t) => t.page.evaluate(() => [window.__chip.isConnected, window.__chipGone])));
  for (const [i, t] of watchers.entries()) {
    if (!mounted[i][0] || mounted[i][1]) throw new Error(`${t.name}'s chip was replaced on the second state push (${mounted[i][1]} removed)`);
    if (w(vs)[i].chip?.player !== first) throw new Error(`${t.name}'s chip lost the seat after the second push`);
  }
  console.log(`${dropper.name} dropped and rejoined with ${w(vs)[0].chip.text} left: ${w(vs).map((v) => v.states).join("/")} extra state(s) on ${watchers.map((t) => t.name).join("/")}, chip still mounted`);

  // At ten seconds each tab hears one polite line. The count runs down, then the host moves on: a new seq, setupRoad,
  // a fresh window for the same seat, and the live region on Ember and Tide was written exactly once in the old one.
  vs = await liveSays(tabs, first, "first window", TURN);
  console.log(`live line on every tab: ${vs.map((v) => `"${v.liveTexts.join(" | ")}"`).join(", ")}`);
  const startSecs = vs[0].chip.seconds;
  const low = await until(async () => {
    const v = await view(a);
    return v?.chip?.player === first && v.chip.seconds < startSecs ? v : null;
  }, "countdown counts down", TURN + 5000);
  vs = await until(async () => {
    const vs = await views(tabs);
    return vs.every((v) => v && v.seq > seq0 && v.phase === "setupRoad" && v.chip?.player === first && v.chip.seconds > low.chip.seconds) ? vs : null;
  }, "the host moves on and the chip re-arms", TURN + 5000);
  for (const [i, t] of watchers.entries()) {
    // One write of the line, and the clear when the window re-arms: never a third.
    const n = w(vs)[i].liveChanges;
    if (n < 1 || n > 2) throw new Error(`${t.name}'s live region changed ${n} times across the window`);
  }
  console.log(`countdown ran ${startSecs}s → ${low.chip.seconds}s; host placed for ${first}: seq ${seq0} → ${vs[0].seq}, phase ${vs[0].phase}, chip back at ${vs[0].chip.text}; live region writes: ${w(vs).map((v) => v.liveChanges).join("/")}`);

  // The first seat lays its own path and the turn passes: the chip names the second seat everywhere.
  const second = vs[0].players[1].id;
  await act(firstTab, "pickEdge", vs[tabs.indexOf(firstTab)].legal.path[0]);
  vs = await until(async () => {
    const vs = await views(tabs);
    return vs.every((v) => v && v.current === second && v.phase === "setupSettle") ? vs : null;
  }, "the turn passes to the second seat");
  vs = await chipsName(tabs, second, "second seat");
  console.log(`turn passed to ${second}: chips read ${vs.map((v) => `"${v.chip.text}"`).join(", ")}`);

  if (errors.length) throw new Error(`console errors:\n${errors.join("\n")}`);
  console.log("PASS countdown-prove");
} catch (e) {
  console.error("FAIL", e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  host.kill();
  process.exit(code);
}
