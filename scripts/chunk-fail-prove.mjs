// #488: the lazy chunks (sheets: How to play, trade panel, win screen; online: lobby, chat dock, reactions) can fail to
// load, and the page must stand. On the built dist/ (vite preview), with the sheets chunk routed to fail: the title's
// idle prefetch fails, the page reloads itself once for that URL and not again (a stale page after a deploy), Play then renders the
// table (HUD header and canvas, store at "play") with no sheet, and once the route recovers, How to play from the table
// menu opens. With the online chunk routed to fail: Host shows "Couldn't load the table lobby." with a Reload button
// instead of a blank page, and after the route recovers that Reload rejoins the saved seat into a working lobby.
// #492: a join link whose online chunk fails once keeps its code across the reload; the title's How to play retries on
// the first press after the route recovers; a stale-chunk reload waits while focus is in a text field; chunkUrl names
// dev (.tsx) URLs as well as built ones. Game over with the sheets chunk gone for good (a deploy mid-game): the HUD's
// winner line gets the way out; practice's Back to menu reaches the title, and a seated player's Reload rejoins the saved
// seat into the finished table, where the win screen loads from the fresh chunk.
// Run npm run build first.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { preview } from "vite";

const { chunkUrl } = await import("../src/lib/lazy.ts");
const { createGame } = await import("../src/lib/game/board.ts");
const PORT = Number(process.env.VITE_PORT) || 8109;
const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
if (!existsSync(`${DIST}index.html`)) {
  console.log("FAIL no dist/index.html: run npm run build first");
  process.exit(1);
}

const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
// A finished table the host restores on boot (host.mjs load(); the file is what save() writes), for case 9: a saved seat at
// it rejoins straight into the game over. The shape stamp is read off host.mjs (importing it would start a host).
const FINISHED = { code: "WNR7", secret: "f".repeat(32) };
{
  const shape = Number(/^const ROOM_SHAPE = (\d+);/m.exec(readFileSync(new URL("../server/host.mjs", import.meta.url), "utf8"))?.[1]);
  if (!shape) {
    console.log("FAIL could not read ROOM_SHAPE from server/host.mjs");
    process.exit(1);
  }
  const game = createGame({ humans: ["Elm", "Sage", "Rook"].map((name) => ({ name })), bots: 0 });
  game.phase = "over";
  game.winner = game.players[1].id;
  const seats = game.players.map((pl, n) => ({ id: `s${n}`, name: pl.name, color: pl.color, ready: true, pid: pl.id, secret: n === 0 ? FINISHED.secret : String(n).repeat(32) }));
  writeFileSync(path.join(ROOMS_DIR, `${FINISHED.code}.json`), JSON.stringify({ code: FINISHED.code, host: "s0", next: 3, chat: [], chatSeq: 0, game, seats, shape, savedAt: Date.now() }));
}
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const hostPort = await new Promise((resolve) =>
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  }),
);
const server = await preview({ preview: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
const url = `http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, what, ms = 15_000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await sleep(50);
  }
};

// A page whose requests for one chunk fail while `broken` is true. `loads` counts page loads (the reload under test),
// `blocked` the chunk requests refused. Page errors other than the chunk's own failure count against the page.
// `reloaded` seeds the session with chunk URLs it already reloaded for, so the title stays put when one is refused; `seat`
// is a saved seat the page rejoins on load.
async function tab(name, chunk, query = "", { reloaded = [], seat, viewport = { width: 1280, height: 720 } } = {}) {
  const page = await browser.newPage({ viewport });
  const t = { page, loads: 0, blocked: 0, broken: true, errors: [] };
  if (reloaded.length) await page.addInitScript((urls) => sessionStorage.setItem("emberisle-chunk-reloaded", JSON.stringify(urls)), reloaded);
  if (seat) await page.addInitScript((s) => localStorage.setItem("emberisle-seat", JSON.stringify(s)), seat);
  page.on("load", () => t.loads++);
  page.on("pageerror", (e) => t.errors.push(`${name}: ${e}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // The refused chunk logs its own failure (the import, and React reporting the boundary's catch); anything else counts.
    if (/Failed to fetch dynamically imported module|ERR_FAILED|net::|The above error|LazyBoundary|Lazy/.test(text)) return;
    t.errors.push(`${name}: ${text}`);
  });
  await page.route(new RegExp(`/assets/${chunk}-[A-Za-z0-9_-]{8}\\.js`), (route) => {
    if (!t.broken) return route.continue();
    t.blocked++;
    return route.abort("failed");
  });
  await page.addInitScript((n) => localStorage.setItem("emberisle-name", n), name);
  await page.goto(url + query);
  return t;
}
const title = (page) => page.getByRole("button", { name: "Play", exact: true }).waitFor({ timeout: 15_000 });

try {
  // --- 1. The sheets chunk fails. Idle on the title prefetches it: one reload, then the flag holds.
  const a = await tab("Ember", "sheets");
  await title(a.page);
  await until(() => a.loads >= 2, "the title reloading once on the failed idle prefetch");
  await title(a.page);
  // The reloaded title prefetches again, fails again, and must not reload a second time.
  await until(() => a.blocked >= 2, "the reloaded title's prefetch being refused");
  await sleep(1500);
  const loads = a.loads;
  check("sheets: the title reloaded itself once on the failed prefetch and not again", loads === 2 && a.blocked >= 2, { loads, blocked: a.blocked });

  await a.page.getByRole("button", { name: "Play", exact: true }).click();
  await a.page.waitForFunction(() => window.__emberisle?.getState().screen === "play", null, { timeout: 15_000 });
  await a.page.waitForSelector("header", { timeout: 15_000 });
  await a.page.waitForSelector("canvas", { timeout: 15_000 });
  await sleep(2500); // the Hud's idle prefetch fails here too; the table must still stand
  const table = await a.page.evaluate(() => ({
    screen: window.__emberisle.getState().screen,
    header: Boolean(document.querySelector("header")),
    canvas: Boolean(document.querySelector("canvas")),
    rootChildren: document.getElementById("root").children.length,
    seats: document.querySelectorAll('[data-testid^="rail-"]').length,
    loads: undefined,
  }));
  check("sheets: Play renders the table with the chunk still failing", table.screen === "play" && table.header && table.canvas && table.rootChildren > 0 && table.seats === 4 && a.loads === 2, { ...table, loads: a.loads, blocked: a.blocked });

  // How to play while the chunk still fails: nothing opens, and the flag is dropped so the row can be pressed again.
  await a.page.getByRole("button", { name: "Table menu" }).click();
  await a.page.getByRole("dialog", { name: "Table menu" }).getByRole("button", { name: "How to play" }).click();
  await a.page.waitForFunction(() => window.__emberisle.getState().howTo === false, null, { timeout: 15_000 });
  const noSheet = await a.page.evaluate(() => ({ dialogs: document.querySelectorAll('[role="dialog"]').length, screen: window.__emberisle.getState().screen, header: Boolean(document.querySelector("header")) }));
  check("sheets: How to play with the chunk failing opens nothing, closes its flag and leaves the table standing", noSheet.dialogs === 0 && noSheet.screen === "play" && noSheet.header, noSheet);

  // The route recovers: the next press (a failed load is remembered for one second) loads the chunk and the dialog opens.
  a.broken = false;
  await sleep(1200);
  await a.page.getByRole("button", { name: "Table menu" }).click();
  await a.page.getByRole("dialog", { name: "Table menu" }).getByRole("button", { name: "How to play" }).click();
  const howto = a.page.getByRole("dialog", { name: "How to play" });
  await howto.waitFor({ timeout: 15_000 });
  check("sheets: once the route recovers, How to play opens on the next press", await howto.isVisible(), { loads: a.loads });
  await howto.getByRole("button", { name: "Close" }).click();
  await howto.waitFor({ state: "detached" });
  check("sheets: no other page errors", a.errors.length === 0, a.errors);

  await a.page.close(); // each page runs a WebGL canvas; idle ones starve the next section's idle prefetch
  // --- 2. The online chunk fails. Hover Host prefetches it: one reload. Host then shows the message, not a blank page.
  const b = await tab("Moss", "online");
  await title(b.page);
  await b.page.getByRole("button", { name: "Host a table" }).hover();
  await until(() => b.loads >= 2, "the title reloading once on the failed Host prefetch");
  await title(b.page);
  const remembered = await b.page.evaluate(() => JSON.parse(sessionStorage.getItem("emberisle-chunk-reloaded") ?? "[]"));
  check("online: the session remembers the chunk URL it reloaded for", remembered.length === 1 && /\/assets\/online-/.test(remembered[0]), remembered);
  await b.page.getByRole("button", { name: "Host a table" }).click();
  const failed = b.page.getByTestId("lobby-failed");
  await failed.waitFor({ timeout: 15_000 });
  const lobby = await b.page.evaluate(() => ({
    screen: window.__emberisle.getState().screen,
    text: document.querySelector('[data-testid="lobby-failed"]')?.textContent ?? "",
    reload: Boolean(document.querySelector('[data-testid="lobby-failed"] button')),
    rootChildren: document.getElementById("root").children.length,
  }));
  check("online: Host with the chunk failing shows the message and a Reload button, not a blank page", lobby.screen === "lobby" && /Couldn't load/.test(lobby.text) && lobby.reload && lobby.rootChildren > 0 && b.loads === 2, { ...lobby, loads: b.loads, blocked: b.blocked });

  // The route recovers and Reload is pressed. The seat Host took was saved, so the reloaded page rejoins it (#196) and
  // lands in a real lobby, the chunk fetched by the rejoin's own prefetch.
  b.broken = false;
  await sleep(1200);
  await failed.getByRole("button", { name: "Reload" }).click();
  await b.page.getByTestId("table-code").waitFor({ timeout: 15_000 });
  const code = await b.page.getByTestId("table-code").textContent();
  check("online: after Reload with the route recovered, the saved seat rejoins into a working lobby", /^[A-Z0-9]{4}$/.test(code ?? "") && b.loads === 3, { code, loads: b.loads });
  check("online: no other page errors", b.errors.length === 0, b.errors);
  await b.page.close();

  // --- 3. (#492) A join link whose online chunk fails once: the code survives the stale-chunk reload.
  const c2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  let cLoads = 0;
  let cBlocked = 0;
  c2.on("load", () => cLoads++);
  await c2.route(/\/assets\/online-[A-Za-z0-9_-]{8}\.js/, (route) => {
    if (cBlocked++ > 0) return route.continue(); // fails once, then the route recovers
    return route.abort("failed");
  });
  await c2.addInitScript((n) => localStorage.setItem("emberisle-name", n), "Reed");
  await c2.goto(`${url}&code=K7QP`);
  await until(() => cLoads >= 2, "the join link's title reloading once on the failed online prefetch");
  await title(c2);
  const joinInput = c2.locator('input[aria-label="Join code"]');
  await joinInput.waitFor({ timeout: 15_000 });
  await sleep(500);
  check("join link: the code is still in the field after the stale-chunk reload", (await joinInput.inputValue()) === "K7QP" && cLoads === 2, { value: await joinInput.inputValue(), loads: cLoads });
  await c2.close();

  // --- 4. (#492) The title's How to play retries on every press, the first one after the route recovers included.
  const d = await tab("Ash", "sheets");
  await title(d.page);
  await until(() => d.loads >= 2, "the title reloading once on the failed sheets prefetch");
  await title(d.page);
  await sleep(1500);
  const howBtn = d.page.getByRole("button", { name: "How to play" });
  await howBtn.click();
  await d.page.waitForFunction(() => window.__emberisle.getState().howTo === false, null, { timeout: 15_000 });
  check("title How to play: a refused press opens nothing and drops its flag", (await d.page.locator('[role="dialog"]').count()) === 0);
  d.broken = false;
  await sleep(1200);
  await howBtn.click();
  const dHow = d.page.getByRole("dialog", { name: "How to play" });
  await dHow.waitFor({ timeout: 5000 }).catch(() => {});
  check("title How to play: the first press after the route recovers opens it", await dHow.isVisible());
  await d.page.close();

  // --- 5. (#492) A reload never fires while focus is in a text field; it fires once focus leaves.
  const e = await tab("Fern", "online");
  await title(e.page);
  const typed = e.page.locator('input[aria-label="Join code"]');
  await typed.click();
  await typed.pressSequentially("K7");
  await e.page.getByRole("button", { name: "Host a table" }).hover(); // prefetches online: refused
  await until(() => e.blocked >= 1, "the online prefetch being refused");
  await sleep(1500);
  const held = { loads: e.loads, value: await typed.inputValue(), focused: await typed.evaluate((el) => el === document.activeElement) };
  check("typing: no reload while focus is in the join-code input", held.loads === 1 && held.value === "K7" && held.focused, held);
  e.broken = false;
  await e.page.locator("body").click({ position: { x: 5, y: 5 } }); // focus leaves the field
  await until(() => e.loads >= 2, "the held reload once focus left the field");
  check("typing: the reload fires after focus leaves the field", e.loads === 2, { loads: e.loads });
  await e.page.close();

  // --- 7. (#492) A watch link whose online chunk is refused twice, then recovers: the stale link never reaches a later title.
  const f = await tab("Wren", "online", "&watch=K7QP");
  const fInput = f.page.locator('input[aria-label="Join code"]');
  await title(f.page);
  await until(() => f.loads >= 2, "the watch link's title reloading once");
  await title(f.page);
  await until(() => f.blocked >= 2, "the reloaded title's online prefetch being refused");
  const kept = await fInput.inputValue();
  f.broken = false;
  await sleep(1200);
  await f.page.getByRole("button", { name: "Host a table" }).hover(); // the retry succeeds
  await sleep(1000);
  await fInput.fill("ZZZZ");
  await f.page.getByRole("button", { name: "Play", exact: true }).click();
  await f.page.waitForFunction(() => window.__emberisle.getState().screen === "play", null, { timeout: 15_000 });
  await f.page.evaluate(() => window.__emberisle.getState().goTitle());
  await title(f.page);
  const urlAfterPlay = await f.page.evaluate(() => location.search);
  const back = { kept, value: await fInput.inputValue(), watch: await f.page.getByRole("button", { name: "Watch" }).count() };
  check("watch link: the field survived the reload; a later title starts empty with Play primary", kept === "K7QP" && back.value === "" && back.watch === 0, back);
  check("watch link: the URL has no watch/code once Play left the title", !/watch=|code=/.test(urlAfterPlay), { urlAfterPlay });
  await f.page.reload();
  await title(f.page);
  await sleep(500);
  check("watch link: a reload at the title does not refill the stale code", (await fInput.inputValue()) === "" && (await f.page.getByRole("button", { name: "Watch" }).count()) === 0, { value: await fInput.inputValue() });
  await f.page.close();

  // --- 8. (#492) The online chunk always refused: a typed code survives the reload that the Join press releases.
  const g = await tab("Pine", "online");
  await title(g.page);
  const gInput = g.page.locator('input[aria-label="Join code"]');
  await gInput.click();
  await gInput.pressSequentially("K7QP");
  await sleep(1000); // the focus prefetch is refused; the reload is held
  const before = g.loads;
  await g.page.getByRole("button", { name: "Join", exact: true }).click();
  await until(() => g.loads >= 2, "the held reload once Join took focus");
  await title(g.page);
  await sleep(500);
  check("typing: a typed code is still in the field after the reload Join released", before === 1 && (await gInput.inputValue()) === "K7QP", { before, loads: g.loads, value: await gInput.inputValue() });
  await g.page.close();

  // --- 6. (#492) chunkUrl names dev source URLs (.tsx) as well as built ones, so dev retries too.
  const dev = chunkUrl?.(new TypeError("Failed to fetch dynamically imported module: http://localhost:8080/src/components/game/online.tsx?t=1"));
  const built = chunkUrl?.(new TypeError("Failed to fetch dynamically imported module: http://localhost/assets/online-AbCd1234.js?retry=2"));
  check("dev: chunkUrl matches .tsx URLs and still the built .js ones", dev === "http://localhost:8080/src/components/game/online.tsx" && built === "http://localhost/assets/online-AbCd1234.js", { dev, built });

  // --- 9. (#492) Game over with the sheets chunk gone for good. The win screen cannot load: the retry at game over asks the
  // network once more and is refused, so the HUD's winner line gets a focused way out, and it works.
  const over = (page) =>
    page.evaluate(() => {
      const store = window.__emberisle;
      const st = structuredClone(store.getState().state);
      st.phase = "over";
      st.winner = st.players[1].id;
      st.seq += 1;
      store.setState({ state: st });
      return st.players[1].name;
    });
  const shown = (page) =>
    page.evaluate(() => {
      const button = document.querySelector('[data-testid="win-failed"]');
      const rect = button?.getBoundingClientRect();
      return {
        line: document.getElementById("hud-winner")?.textContent ?? "",
        button: button?.textContent ?? "",
        focused: document.activeElement === button,
        inView: Boolean(rect) && rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth,
        dialogs: document.querySelectorAll('[role="dialog"]').length,
        screen: window.__emberisle.getState().screen,
        header: Boolean(document.querySelector("header")),
      };
    });
  // A practice table with the sheets chunk refused, at rest: the table's own asks (the mount, the idle prefetch within
  // preloadOnIdle's 2 s) have been refused and nothing has asked for longer than that, so the next ask is game over's.
  const settled = async (t) => {
    const atPlay = t.blocked;
    await t.page.getByRole("button", { name: "Play", exact: true }).click();
    await t.page.waitForFunction(() => window.__emberisle?.getState().screen === "play", null, { timeout: 15_000 });
    await t.page.waitForSelector("header", { timeout: 15_000 });
    await until(() => t.blocked > atPlay, "the table's own sheets request being refused");
    let quiet = { n: t.blocked, since: Date.now() };
    await until(() => {
      if (t.blocked !== quiet.n) quiet = { n: t.blocked, since: Date.now() };
      return Date.now() - quiet.since > 2500;
    }, "the table's sheets requests going quiet");
  };
  // Practice, 1280x720: no seat to rejoin, so the way out is the menu.
  const h = await tab("Oak", "sheets");
  await title(h.page);
  await until(() => h.loads >= 2, "the title reloading once on the failed sheets prefetch");
  await title(h.page);
  await settled(h);
  const hBefore = h.blocked;
  const hName = await over(h.page);
  const hButton = h.page.getByTestId("win-failed");
  await hButton.waitFor({ timeout: 15_000 });
  const hShown = await shown(h.page);
  check("game over (practice): the chunk is asked for again, refused, and the winner line gets a focused Back to menu", hShown.line.startsWith(`${hName} wins with`) && hShown.button === "Back to menu" && hShown.focused && hShown.inView && hShown.dialogs === 0 && hShown.screen === "play" && hShown.header && h.blocked > hBefore && h.loads === 2, { ...hShown, name: hName, blocked: h.blocked, before: hBefore, loads: h.loads });
  await h.page.screenshot({ path: "test-results/win-stale-1280x720.png" });
  await hButton.click();
  await title(h.page);
  check("game over (practice): Back to menu reaches the title without a reload", h.loads === 2 && (await h.page.evaluate(() => window.__emberisle.getState().screen)) === "title", { loads: h.loads });
  check("game over (practice): no other page errors", h.errors.length === 0, h.errors);
  await h.page.close();

  // The chunk failed mid-game but the route has recovered by the win: the retry at game over succeeds, the win screen
  // opens with its focus, and the way-out button never mounts, not even for a frame.
  const j = await tab("Fir", "sheets");
  await title(j.page);
  await until(() => j.loads >= 2, "the title reloading once on the failed sheets prefetch");
  await title(j.page);
  await settled(j);
  await j.page.evaluate(() => {
    window.__seen = [];
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.('[data-testid="win-failed"]') || n.querySelector?.('[data-testid="win-failed"]'))) window.__seen.push("win-failed");
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("focusin", (e) => window.__seen.push(`focus:${e.target.getAttribute?.("data-testid") ?? e.target.tagName}`), true);
  });
  j.broken = false;
  const jBefore = j.blocked;
  const jName = await over(j.page);
  await j.page.getByTestId("win-screen").waitFor({ timeout: 15_000 });
  const jSeen = await j.page.evaluate(() => ({ seen: window.__seen, headline: document.querySelector('[data-testid="win-headline"]')?.textContent, focusInside: Boolean(document.querySelector('[data-testid="win-screen"]')?.contains(document.activeElement)) }));
  check("game over (retry succeeds): the win screen opens with focus and the way-out button never mounts", jSeen.headline === `${jName} wins` && jSeen.focusInside && !jSeen.seen.includes("win-failed") && !jSeen.seen.some((x) => /win-failed/.test(x)) && j.blocked === jBefore, { ...jSeen, blocked: j.blocked, before: jBefore });
  check("game over (retry succeeds): no other page errors", j.errors.length === 0, j.errors);
  await j.page.close();

  // Online, 390x844: a saved seat at the finished table rejoins into the game over with the chunk gone. The session has
  // already had its one title reload for this URL, so the title stays put while the rejoin dials.
  const sheetsUrl = `http://127.0.0.1:${PORT}/assets/${readdirSync(`${DIST}assets`).find((f) => /^sheets-[A-Za-z0-9_-]{8}\.js$/.test(f))}`;
  const i = await tab("Elm", "sheets", "", { reloaded: [sheetsUrl], seat: FINISHED, viewport: { width: 390, height: 844 } });
  await i.page.waitForFunction(() => window.__emberisle?.getState().state?.winner, null, { timeout: 15_000 });
  const iButton = i.page.getByTestId("win-failed");
  await iButton.waitFor({ timeout: 15_000 });
  const iShown = await shown(i.page);
  check("game over (online): the rejoined seat finds the chunk refused, and the winner line gets a focused Reload inside the viewport", iShown.line.startsWith("Sage wins with") && iShown.button === "Reload for the results" && iShown.focused && iShown.inView && iShown.dialogs === 0 && iShown.screen === "play" && iShown.header && i.blocked >= 1 && i.loads === 1, { ...iShown, blocked: i.blocked, loads: i.loads });
  await i.page.screenshot({ path: "test-results/win-stale-390x844.png" });
  // The deploy is done (the route recovers): Reload rejoins the saved seat, and the win screen loads from the fresh chunk.
  i.broken = false;
  await iButton.click();
  await until(() => i.loads >= 2, "the page reloading on Reload for the results");
  await i.page.getByTestId("win-screen").waitFor({ timeout: 15_000 });
  const results = await i.page.evaluate(() => ({ headline: document.querySelector('[data-testid="win-headline"]')?.textContent, rows: document.querySelectorAll('[data-testid="win-row"]').length, fallback: document.querySelectorAll('[data-testid="win-failed"]').length }));
  check("game over (online): Reload for the results rejoins into the finished table and the win screen shows the results", results.headline === "Sage wins" && results.rows === 3 && results.fallback === 0 && i.loads === 2, { ...results, loads: i.loads });
  check("game over (online): no other page errors", i.errors.length === 0, i.errors);
  await i.page.close();
} catch (err) {
  fails.push(String(err));
  console.log(`FAIL ${err.stack ?? err}`);
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
if (fails.length) {
  console.log(`chunk-fail prove: ${fails.length} failed`);
  process.exit(1);
}
console.log("chunk-fail prove ok");
process.exit(0);
