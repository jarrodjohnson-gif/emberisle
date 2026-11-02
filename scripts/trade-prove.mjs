// #163: three headless tabs on the rules host trade through the browser's trade panel and toast.
// Tab 1 asks the table through the panel; tab 3 says No (the offer stays open), tab 2 says Yes, and every tab's state
// shows the goods moved. A second ask gets a No and then runs out its 20 s: the goods stay put and the toast closes
// everywhere. Zero console errors.
// #366 / #537: every non-asker's toast is a named region for the offer (or compact demand) that does not take focus.
// A seat that can pay sees Yes/No; a seat that cannot (#537) sees only "X is looking for …" with Dismiss — no Accept.
// Escape answers No / Dismiss; the countdown is hidden from screen readers but a polite line says "5 seconds left".
// Step 4 keeps the normal timeout lifecycle: a second ask nobody takes runs out its 20 s (C answers with Escape, the asker
// alone hears the No, hands unchanged). Steps 5 and 6 are #537: B has none of the goods asked for and sees the compact demand,
// C can pay and sees the normal offer; changing B's hand flips its toast without a new offer; Dismiss from B and No from C
// close the offer on all three tabs within 500 ms, at normal motion and again under reduced motion (no skip path).
// #378: the asker's panel is a modal dialog named "Trade": focus moves in on open, 14 Tabs and 3 Shift+Tabs never leave
// it, and Escape (or the ask itself) puts focus back on the Trade button.
import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { RESOURCE_LABEL } from "../src/lib/game/types.ts";

const PORT = Number(process.env.VITE_PORT) || 8097;
const RES = ["timber", "clay", "wool", "grain", "ore"];

// Rooms go to a temp folder, dropped on exit, so the real host never restores this proof's tables (#207).
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results` },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
let code = 0;

async function tab(name) {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${name}: ${r.status()} ${r.url()}`));
  await page.addInitScript((n) => localStorage.setItem("emberisle-name", n), name);
  // #425: records every clip the page starts (the file name), without changing what play() does.
  await page.addInitScript(() => {
    window.__plays = [];
    window.__heard = [];
    window.__sockets = [];
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, args) {
        const socket = Reflect.construct(target, args);
        window.__sockets.push(socket);
        return socket;
      },
    });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      // #814: the background music is music-prove's, not a table sound.
      if (this.src.endsWith("/old_tower_inn_loop.mp3")) return play.call(this);
      window.__plays.push(new URL(this.src).pathname);
      window.__heard.push(`${new URL(this.src).pathname.replace("/audio/", "")}@${this.volume}`);
      return play.call(this);
    };
  });
  await page.goto(`http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`);
  return { name, page };
}

// What this tab knows: its own hand in full, and every hand's size (#206).
const view = (t) =>
  t.page.evaluate(() => {
    const s = window.__emberisle.getState();
    const g = s.state;
    if (!g) return null;
    return {
      you: s.localId,
      legal: s.legal,
      seq: g.seq,
      phase: g.phase,
      current: g.current,
      bank: g.bank,
      mine: g.players.find((p) => p.id === s.localId)?.resources,
      goods: Object.fromEntries(g.players.map((p) => [p.id, p.goods ?? Object.values(p.resources).reduce((a, b) => a + b, 0)])),
      offer: s.offer,
      declined: s.declined,
      toast: document.querySelector('[data-testid="trade-toast"], [data-testid="trade-outcome"]')?.textContent ?? null,
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

// Every tab past `seq`, on the same seq, with the same hand sizes.
async function synced(tabs, seq, what, ms) {
  const vs = await until(async () => {
    const vs = await views(tabs);
    return vs.every((v) => v && v.seq > seq) && new Set(vs.map((v) => v.seq)).size === 1 ? vs : null;
  }, what, ms);
  if (new Set(vs.map((v) => JSON.stringify(v.goods))).size !== 1) throw new Error(`${what}: tabs disagree on the hand sizes`);
  return vs;
}

// #609: the clips this tab started since `forget`, as "file@volume", without the UI clicks.
const forget = (tabs) => Promise.all(tabs.map((t) => t.page.evaluate(() => (window.__heard = []))));
const trades = (t) => t.page.evaluate(() => window.__heard.filter((h) => /^(trade_offer|confirmation_001|error_002|three_wood|daking_wood|sheep_for_wood|stone_for_wood|corn_no)/.test(h)));
// #1107: what a seat hears when an offer of 1 `gives` for `wants` arrives, from fixed expectations (the precedence itself is proved
// with explicit give/want bags in hearOffer below). Sheep or stone for wood plays its own clip on every seat, the asker included;
// any other pair is the plain chime on the other seats and silent on the asker.
const OFFER_CLIP = { "wool>timber": "sheep_for_wood.mp3@1", "ore>timber": "stone_for_wood.mp3@1" };
const offerHeard = (gives, wants, asker) => (OFFER_CLIP[`${gives}>${wants}`] ? [OFFER_CLIP[`${gives}>${wants}`]] : asker ? [] : ["trade_offer.wav@1"]);
const act = (t, fn, arg) => t.page.evaluate(([f, a]) => window.__emberisle.getState()[f](...[].concat(a)), [fn, arg]);
const total = (hand) => RES.reduce((n, r) => n + hand[r], 0);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

try {
  const tabs = [await tab("Ember"), await tab("Tide"), await tab("Pine")];
  const [a, b, c] = tabs;
  await a.page.getByRole("button", { name: "Host a table" }).click();
  // #425: a press plays ui_click once, on the pointer going down.
  const hostPlays = await a.page.evaluate(() => window.__plays);
  if (hostPlays.join() !== "/audio/click_001.wav") throw new Error(`Host a table played ${JSON.stringify(hostPlays)}, not click_001.wav once`);
  console.log("#425: Host a table -> /audio/click_001.wav once");
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
  let vs = await synced(tabs, -1, "start", 90_000);
  // Three islands under software GL starve the HUD, and the host's offer lives 20 s. The board is not under test
  // here (tabs-prove covers it), so each tab stops drawing it and the clicks below land in time.
  for (const t of tabs) await t.page.evaluate(() => window.__isle.renderer.setAnimationLoop(null));

  // #232: roll off for first place, each die from the tab whose seat is up.
  for (let n = 0; vs[0].phase === "rollOff"; n++) {
    if (n > 30) throw new Error("roll-off never ended");
    const i = vs.findIndex((v) => v.you === vs[0].current);
    await act(tabs[i], "dispatch", [{ type: "roll" }]);
    vs = await synced(tabs, vs[0].seq, `roll-off roll ${n}`);
  }

  for (let step = 0; step < 12; step++) {
    const i = vs.findIndex((v) => v.you === vs[0].current);
    if (vs[i].phase === "setupSettle") await act(tabs[i], "pickVertex", vs[i].legal.outpost[0]);
    else await act(tabs[i], "pickEdge", vs[i].legal.path[0]);
    vs = await synced(tabs, vs[0].seq, `setup step ${step}`);
  }
  console.log(`table ${tableCode}: setup done, seq ${vs[0].seq}`);

  // Roll, settle any 7, and pass until the player in `main` holds a card another tab can match.
  let pair = null;
  for (let guard = 0; guard < 60 && !pair; guard++) {
    const i = vs.findIndex((v) => v.you === vs[0].current);
    const { phase } = vs[0];
    if (phase === "roll") await act(tabs[i], "dispatch", [{ type: "roll" }]);
    else if (phase === "discard") {
      const j = vs.findIndex((v) => v.legal?.discard > 0);
      let need = vs[j].legal.discard;
      const cards = {};
      for (const r of RES) {
        const k = Math.min(vs[j].mine[r], need);
        if (k) cards[r] = k;
        need -= k;
      }
      await act(tabs[j], "dispatch", [{ type: "discard", resources: cards }]);
    } else if (phase === "robber") {
      const hexId = vs[i].legal.wayfarer.find((h) => !vs[i].legal.steal[h]) ?? vs[i].legal.wayfarer[0];
      await act(tabs[i], "pickHex", hexId);
      if ((vs[i].legal.steal[hexId] ?? []).length > 1) await act(tabs[i], "chooseSteal", vs[i].legal.steal[hexId][0]);
    } else if (phase === "main") {
      for (const give of RES.filter((r) => vs[i].mine[r] >= 1)) {
        for (const j of [0, 1, 2].filter((j) => j !== i)) {
          const want = RES.find((r) => r !== give && vs[j].mine[r] >= 1);
          if (want) pair ??= { i, j, k: [0, 1, 2].find((k) => k !== i && k !== j), give, want };
        }
      }
      if (!pair) await act(tabs[i], "dispatch", [{ type: "endTurn" }]);
    } else throw new Error(`unexpected phase ${phase}`);
    if (!pair) vs = await synced(tabs, vs[0].seq, `turn ${guard} (${phase})`);
  }
  if (!pair) throw new Error("never reached a main turn with a tradeable pair");
  const { i, j, k, give, want } = pair;
  const [A, B, C] = [tabs[i], tabs[j], tabs[k]];
  console.log(`${A.name} gives 1 ${give}, wants 1 ${want}; ${C.name} says no, ${B.name} says yes`);

  // Records every answer this tab sends to the host.
  const spyAnswers = (t) =>
    t.page.evaluate(() => {
      const net = window.__emberisle.getState().net;
      window.__answer ??= net.answer.bind(net);
      window.__answers = [];
      net.answer = (...a) => (window.__answers.push(a), window.__answer(...a));
    });

  // 0. #378: Enter on Trade opens a modal dialog with focus inside; Tab cycles inside it; Escape closes it and focus is back on Trade.
  const tradeButton = A.page.getByRole("button", { name: "Trade", exact: true });
  const dialog = A.page.getByRole("dialog", { name: "Trade", exact: true });
  const focusIs = (t) =>
    t.page.evaluate(() => {
      const el = document.activeElement;
      const dlg = document.querySelector('[data-testid="trade-panel"]');
      return { inDialog: Boolean(dlg && dlg !== el && dlg.contains(el)), label: el?.getAttribute("aria-label") ?? el?.textContent?.trim() ?? null };
    });
  await tradeButton.focus();
  await A.page.keyboard.press("Enter");
  await dialog.waitFor({ timeout: 5_000 });
  if ((await dialog.getAttribute("aria-modal")) !== "true") throw new Error("the trade dialog is not aria-modal");
  const opened = await focusIs(A);
  if (!opened.inDialog) throw new Error(`focus did not move into the trade dialog: on "${opened.label}"`);
  const visited = [opened.label];
  for (let n = 0; n < 14; n++) {
    await A.page.keyboard.press("Tab");
    const f = await focusIs(A);
    if (!f.inDialog) throw new Error(`Tab ${n + 1} left the trade dialog for "${f.label}" (visited ${visited.join(" > ")})`);
    visited.push(f.label);
  }
  for (let n = 0; n < 3; n++) {
    await A.page.keyboard.press("Shift+Tab");
    const f = await focusIs(A);
    if (!f.inDialog) throw new Error(`Shift+Tab ${n + 1} left the trade dialog for "${f.label}"`);
  }
  if (new Set(visited).size < 3) throw new Error(`Tab did not cycle through the dialog: ${visited.join(" > ")}`);
  // A piece placed just before (the last setup path, or one pushed by another seat) knocks when it lands, up to 320 ms
  // later (#438, LAND_MS). Let those knocks play out so only the Escape's own sound is measured.
  for (let quiet = 0, seen = -1; quiet < 600; ) {
    const n = (await A.page.evaluate(() => window.__plays)).length;
    quiet = n === seen ? quiet + 100 : 0;
    seen = n;
    await new Promise((r) => setTimeout(r, 100));
  }
  const playsBefore = (await A.page.evaluate(() => window.__plays)).length;
  await A.page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached", timeout: 5_000 });
  // #425: Escape on the trade panel plays ui_back once.
  const escPlays = (await A.page.evaluate(() => window.__plays)).slice(playsBefore);
  if (escPlays.join() !== "/audio/back_001.wav") throw new Error(`Escape on the trade panel played ${JSON.stringify(escPlays)}, not back_001.wav once`);
  console.log("#425: Escape on the trade panel -> /audio/back_001.wav once");
  const back = await focusIs(A);
  if (back.label !== "Trade") throw new Error(`Escape put focus on "${back.label}", not the Trade button`);
  console.log(`#378: Enter on Trade -> dialog "Trade", focus on "${opened.label}"; 14 Tabs + 3 Shift+Tabs stayed inside (${new Set(visited).size} stops); Escape -> focus on Trade`);

  // 1. The panel: one Trade button, steppers, Ask the table. Offline there is no table to ask, so the button is online-only.
  const ask = async (g, w, n = 1) => {
    await tradeButton.click();
    await A.page.getByTestId("trade-panel").waitFor();
    await A.page.getByRole("button", { name: `More ${RESOURCE_LABEL[g]} to give` }).click();
    for (let m = 0; m < n; m++) await A.page.getByRole("button", { name: `More ${RESOURCE_LABEL[w]} to want` }).click();
    await A.page.getByRole("button", { name: "Ask the table" }).click();
    return until(async () => {
      const vs = await views(tabs);
      return vs.every((v) => v.offer && v.toast) ? vs : null;
    }, "the offer reaches every tab");
  };
  await forget(tabs);
  vs = await ask(give, want);
  await until(async () => (await trades(B)).length && (await trades(C)).length, "the offer sound");
  // #609: the offer's arrival ticks on the other seats, not on the asker.
  for (const t of [B, C]) if (!same(await trades(t), offerHeard(give, want, false))) throw new Error(`${t.name} heard ${JSON.stringify(await trades(t))} for the offer`);
  // The asker hears its clip on the same frame as the others; silence cannot be polled, so only a clip is waited for.
  if (offerHeard(give, want, true).length) await until(async () => (await trades(A)).length || null, "the asker's offer clip");
  if (!same(await trades(A), offerHeard(give, want, true))) throw new Error(`the asker heard ${JSON.stringify(await trades(A))} for its own offer`);
  console.log(`#609/#1107: offer of ${give} for ${want} heard as ${JSON.stringify(offerHeard(give, want, false))} on the other seats and ${JSON.stringify(offerHeard(give, want, true))} on the asker`);
  if (await A.page.getByTestId("trade-panel").isVisible()) throw new Error("the panel stayed open after the ask");
  const afterAsk = await focusIs(A);
  if (afterAsk.label !== "Trade") throw new Error(`#378: the ask closed the panel but focus went to "${afterAsk.label}", not the Trade button`);
  const line = `${A.name} offers 1 ${RESOURCE_LABEL[give].toLowerCase()} for 1 ${RESOURCE_LABEL[want].toLowerCase()}`;
  const demand1 = `${A.name} is looking for 1 ${RESOURCE_LABEL[want].toLowerCase()}`;
  for (const t of [B, C]) {
    const v = vs[tabs.indexOf(t)];
    // #537: a seat short of the ask sees compact demand, not the full "offers" line.
    const expect = (v.mine[want] ?? 0) < 1 ? demand1 : line;
    if (!v.toast.includes(expect)) throw new Error(`${t.name} toast: "${v.toast}"`);
    const secs = Number((await t.page.getByTestId("trade-countdown").textContent()).replace(/\D/g, ""));
    if (secs < 1 || secs > 20) throw new Error(`${t.name} toast has no countdown: "${v.toast}"`);
  }
  if (!vs[i].toast.includes(`You offer 1 ${RESOURCE_LABEL[give].toLowerCase()} for 1 ${RESOURCE_LABEL[want].toLowerCase()}`) || !vs[i].toast.includes("Waiting")) throw new Error(`asker toast: "${vs[i].toast}"`);
  const tradeId = vs[0].offer.tradeId;
  console.log(`toast on ${B.name} and ${C.name}: full or compact per hand; asker sees "Waiting…"`);

  // #366 / #537: the offer is a region that leaves focus alone. A seat that can pay gets Yes/No; a short seat gets
  // the compact demand (#537) with Dismiss only.
  const answerable = async (t, v, line, r, n) => {
    const got = await t.page.getByTestId("trade-toast").evaluate((el) => {
      const yes = [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === "Yes");
      // #537: a short seat has no Yes; its Dismiss is the one control, and it must stay reachable by Tab just the same.
      const control = yes ?? el.querySelector('[data-testid="trade-dismiss"]');
      const text = (ids) => (ids ?? "").split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
      const focusInside = el.contains(document.activeElement);
      control.focus();
      const out = {
        role: el.getAttribute("role"),
        focusInside,
        compact: el.getAttribute("data-compact") === "true",
        hasYes: Boolean(yes),
        hasDismiss: Boolean(el.querySelector('[data-testid="trade-dismiss"]')),
        demand: el.querySelector('[data-testid="trade-demand"]')?.textContent?.trim() ?? null,
        ariaDisabled: control.getAttribute("aria-disabled"),
        disabled: control.hasAttribute("disabled"),
        describedBy: text(control.getAttribute("aria-describedby")),
        focusable: document.activeElement === control && control.tabIndex >= 0,
        countdownHidden: el.querySelector('[data-testid="trade-countdown"]')?.getAttribute("aria-hidden"),
      };
      control.blur();
      return out;
    });
    const where = `${t.name} (${JSON.stringify(got)})`;
    if (got.role !== "region") throw new Error(`${where}: the offer is not an alertdialog`);
    if (got.focusInside) throw new Error(`${where}: the offer took focus`);
    if (got.countdownHidden !== "true") throw new Error(`${where}: the ticking countdown is not aria-hidden`);
    if (got.disabled) throw new Error(`${where}: Yes uses disabled, so Tab cannot reach it`);
    if (!got.focusable) throw new Error(`${where}: Yes is not focusable`);
    const short = n - v.mine[r];
    if (short <= 0) {
      if (got.compact || got.hasDismiss || !got.hasYes) throw new Error(`${where}: can pay but saw compact/Dismiss or no Yes`);
      if ((await t.page.getByRole("region", { name: line, exact: true }).count()) !== 1) throw new Error(`${where}: alertdialog not named "${line}"`);
      if (got.ariaDisabled !== null || got.describedBy) throw new Error(`${where}: Yes is marked disabled but can pay`);
      return false;
    }
    // #537: cannot pay -> compact demand with Dismiss and no Accept. Its reason is hidden text on Dismiss (owner decision, PR #824).
    const demand = `${A.name} is looking for ${n} ${RESOURCE_LABEL[r].toLowerCase()}`;
    if (!got.compact || !got.hasDismiss || got.hasYes) throw new Error(`${where}: short seat must be compact with Dismiss and no Yes`);
    if (got.demand !== demand) throw new Error(`${where}: demand was "${got.demand}", want "${demand}"`);
    if ((await t.page.getByRole("region", { name: demand, exact: true }).count()) !== 1) throw new Error(`${where}: region not named "${demand}"`);
    if (got.ariaDisabled !== null) throw new Error(`${where}: Dismiss is marked disabled`);
    if (got.describedBy !== `You need ${short} more ${RESOURCE_LABEL[r].toLowerCase()} to accept`) throw new Error(`${where}: Dismiss is not described by "You need ${short} more ${RESOURCE_LABEL[r].toLowerCase()} to accept"`);
    return true;
  };
  for (const t of [B, C]) await answerable(t, vs[tabs.indexOf(t)], line, want, 1);
  const askerView = await A.page.getByTestId("trade-toast").evaluate((el) => ({
    live: el.querySelector('[data-testid="trade-countdown-live"]') !== null,
    hidden: el.querySelector('[data-testid="trade-countdown"]')?.getAttribute("aria-hidden") ?? null,
    role: el.getAttribute("role"),
  }));
  if (askerView.live || askerView.hidden !== null || askerView.role !== "region") throw new Error(`asker's toast changed: ${JSON.stringify(askerView)}`);
  console.log(`#366 / #537: ${B.name} and ${C.name} see a named offer region (full or compact), focus untouched`);

  // 2. C declines (No, or Dismiss when short of the ask): everyone sees it, C's toast goes, the offer stays open for B.
  const before = vs;
  const cToast = C.page.getByTestId("trade-toast");
  if ((await cToast.getAttribute("data-compact")) === "true") await cToast.getByTestId("trade-dismiss").click();
  else await cToast.getByRole("button", { name: "No", exact: true }).click();
  vs = await until(async () => {
    const vs = await views(tabs);
    return vs.every((v) => v.declined.includes(before[k].you)) ? vs : null;
  }, "the decline reaches every tab");
  // #537: the card fades for 150 ms before it leaves; the check below reads it once the fade is over.
  await until(async () => ((await C.page.getByTestId("trade-toast").count()) === 0 ? true : null), `${C.name}'s card leaves after the fade`, 2_000);
  vs = await views(tabs);
  if (vs[k].toast !== null) throw new Error(`${C.name} still has a toast after No: "${vs[k].toast}"`);
  if (!vs[i].toast.includes(`${C.name} declined`)) throw new Error(`asker toast after No: "${vs[i].toast}"`);
  if (!vs[j].toast || vs.some((v) => !v.offer || v.offer.tradeId !== tradeId)) throw new Error("the offer closed on a single No");
  console.log(`${C.name} declined: asker sees "${C.name} declined", offer still open for ${B.name}`);

  await forget(tabs);
  // 3. B says Yes (Enter on the focused button, the spy's positive control for #366): the goods move in every tab's next state.
  await spyAnswers(B);
  await B.page.getByTestId("trade-toast").getByRole("button", { name: "Yes", exact: true }).focus();
  await B.page.keyboard.press("Enter");
  const yesSent = await B.page.evaluate(() => window.__answers);
  if (!same(yesSent, [[tradeId, true]])) throw new Error(`${B.name}'s Enter on an enabled Yes sent ${JSON.stringify(yesSent)}`);
  vs = await synced(tabs, before[0].seq, "the trade lands");
  await until(async () => (await views(tabs)).every((v) => !v.offer) || null, "offers cleared");
  // #609: a deal is heard in full by the two who made it and softer by the bystander.
  await until(async () => (await Promise.all(tabs.map(trades))).every((h) => h.length), "the deal sound");
  for (const t of [A, B]) if (!same(await trades(t), ["confirmation_001.wav@1"])) throw new Error(`${t.name} heard ${JSON.stringify(await trades(t))} for the deal`);
  if (!same(await trades(C), ["confirmation_001.wav@0.5"])) throw new Error(`${C.name} heard ${JSON.stringify(await trades(C))} for the deal`);
  console.log("#609: trade_yes plays in full for the asker and taker, at half volume for the bystander");
  const [a0, b0, a1, b1] = [before[i].mine, before[j].mine, vs[i].mine, vs[j].mine];
  if (a1[give] !== a0[give] - 1 || a1[want] !== a0[want] + 1) throw new Error(`asker hand ${JSON.stringify([a0, a1])}`);
  if (b1[give] !== b0[give] + 1 || b1[want] !== b0[want] - 1) throw new Error(`taker hand ${JSON.stringify([b0, b1])}`);
  if (!same(vs[k].mine, before[k].mine)) throw new Error("the bystander's hand changed");
  if (!same(vs[0].bank, before[0].bank)) throw new Error("the bank changed on a table trade");
  for (const v of vs) {
    if (v.goods[vs[i].you] !== total(a1) || v.goods[vs[j].you] !== total(b1)) throw new Error(`${tabs[vs.indexOf(v)].name} goods counts ${JSON.stringify(v.goods)}`);
  }
  if (!vs[i].toast?.includes(`${B.name} takes it.`)) throw new Error(`asker outcome: "${vs[i].toast}"`);
  await until(async () => (await views(tabs)).every((v) => v.toast === null) || null, "toasts gone after the yes");
  console.log(`${B.name} took it: 1 ${give} -> ${B.name}, 1 ${want} -> ${A.name}, hands and goods counts agree on all 3 tabs`);

  // 4. #366: the timeout lifecycle, with #537's compact seats. Ask again, the other way round (the asker now holds the card
  // it got), for one more than either other tab holds, so both are short and see compact demand: Dismiss, no Yes. C
  // answers with Escape; nobody else does, so the host's 20 s run out. Nothing moves, every toast closes.
  if (vs[0].phase !== "main" || vs[0].current !== vs[i].you) throw new Error("the asker lost the turn");
  const n2 = Math.max(vs[j].mine[give], vs[k].mine[give]) + 1;
  await forget(tabs);
  const again = await ask(want, give, n2);
  const tradeId2 = again[0].offer.tradeId;
  if (tradeId2 === tradeId) throw new Error("second ask reused the tradeId");
  const line2 = `${A.name} offers 1 ${RESOURCE_LABEL[want].toLowerCase()} for ${n2} ${RESOURCE_LABEL[give].toLowerCase()}`;
  for (const t of [B, C]) {
    if (!(await answerable(t, again[tabs.indexOf(t)], line2, give, n2))) throw new Error(`${t.name} can pay ${n2} ${RESOURCE_LABEL[give].toLowerCase()}`);
  }
  // #537: a short seat has nothing to accept with, and the host would refuse it anyway.
  for (const t of [B, C]) {
    const accepts = await t.page.getByTestId("trade-toast").getByRole("button", { name: /^(yes|accept)/i }).count();
    if (accepts) throw new Error(`${t.name} is short of ${n2} ${RESOURCE_LABEL[give].toLowerCase()} but its toast has an Accept`);
  }
  console.log(`#537: "${A.name} is looking for ${n2} ${RESOURCE_LABEL[give].toLowerCase()}" is compact on ${B.name} and ${C.name}: Dismiss, no Yes`);
  // B sends nothing from here to the timeout; its polite line is watched for every text it takes, from ~20 s left until
  // the toast closes (a MutationObserver misses no 1 s window).
  await spyAnswers(B);
  await B.page.evaluate(() => {
    const live = document.querySelector('[data-testid="trade-countdown-live"]');
    window.__said = [live.textContent];
    new MutationObserver(() => window.__said.push(live.textContent)).observe(live, { childList: true, characterData: true, subtree: true });
  });
  // Escape inside C's compact toast answers: the same decline as Dismiss.
  await C.page.getByTestId("trade-dismiss").focus();
  await C.page.keyboard.press("Escape");
  await until(async () => (await views(tabs)).every((v) => v.declined.includes(again[k].you)) || null, "second decline (Escape)");
  console.log(`#366: Escape in ${C.name}'s compact toast answered No; ${B.name} has no Accept and answers nothing`);
  const left = Number((await A.page.getByTestId("trade-countdown").textContent()).replace(/\D/g, ""));
  if (left < 15 || left > 20) throw new Error(`countdown reads ${left} s right after the ask`);
  vs = await until(async () => {
    const vs = await views(tabs);
    return vs.every((v) => !v.offer && v.toast === null) ? vs : null;
  }, "the offer times out and every toast closes", 30_000);
  const bSent = await B.page.evaluate(() => window.__answers);
  if (bSent.length) throw new Error(`${B.name} answered ${JSON.stringify(bSent)} on the offer it let run out`);
  // #609: nobody took it, so only the asker hears the No.
  await sleep(500);
  if (!same(await trades(A), [...offerHeard(want, give, true), "error_002.wav@1"])) throw new Error(`the asker heard ${JSON.stringify(await trades(A))} for the expiry`);
  for (const t of [B, C]) if (!same(await trades(t), offerHeard(want, give, false))) throw new Error(`${t.name} heard ${JSON.stringify(await trades(t))} for the expiry`);
  console.log("#609: trade_no plays for the asker only");
  // The polite line stays silent while the clock ticks and says "5 seconds left" once, at 5 s.
  const heard = [...new Set((await B.page.evaluate(() => window.__said)).filter(Boolean))];
  if (!same(heard, ["5 seconds left"])) throw new Error(`${B.name}'s polite countdown line said ${JSON.stringify(heard)}`);
  console.log(`#366: ${B.name}'s polite line said only "5 seconds left"`);
  if (vs[0].seq !== again[0].seq) throw new Error("the timeout changed the game");
  for (const n of [0, 1, 2]) if (!same(vs[n].mine, again[n].mine)) throw new Error(`${tabs[n].name}'s hand changed on a timeout`);
  console.log(`second offer ran out after ${left} s left on the clock: hands unchanged, toast closed on all 3 tabs`);

  // 5. #537: A asks for 2 of a good (and offers 1 of the card it holds). B has none, so B sees the compact demand with
  // Dismiss and no Accept; C can pay and sees the normal offer. Affordance follows the seat's own hand, so changing a hand
  // updates its toast without another offer. Declining from B's compact signal and C's normal offer closes the offer on
  // A, B and C within 500 ms, not at the 20 s timeout.
  const offerRes = want;
  const need = want === "ore" ? "timber" : "ore";
  const needLabel = RESOURCE_LABEL[need].toLowerCase();
  const demand = `${A.name} is looking for 2 ${needLabel}`;
  const line3 = `${A.name} offers 1 ${RESOURCE_LABEL[offerRes].toLowerCase()} for 2 ${needLabel}`;
  // Sets this tab's own count of `need`, the way a state from the host would: the toast reads it from the store.
  const setLocal = (t, count) =>
    t.page.evaluate(({ res, n }) => {
      const store = window.__emberisle;
      const state = structuredClone(store.getState().state);
      const me = state.players.find((p) => p.id === store.getState().localId);
      me.resources = { ...me.resources, [res]: n };
      me.goods = Object.values(me.resources).reduce((sum, x) => sum + x, 0);
      store.setState({ state });
    }, { res: need, n: count });
  // The toast's data-compact, read without waiting for a toast to exist.
  const compactOf = (t) => t.page.evaluate(() => document.querySelector('[data-testid="trade-toast"]')?.getAttribute("data-compact") ?? null);
  const fadeOf = (t) => t.page.evaluate(() => document.querySelector('[data-testid="trade-toast"]')?.getAttribute("data-fade-ms") ?? null);
  // The last decline closes the offer on every tab within 500 ms. Each page stamps (Date.now, one clock) when its store
  // dropped the offer and its toast left the DOM, so the number reads the app, not this script's polling.
  const watchClear = (t) =>
    t.page.evaluate(() => {
      if (!window.__watchClear) {
        const store = window.__emberisle;
        window.__watchClear = () => {
          const clear = !store.getState().offer && !document.querySelector('[data-testid="trade-toast"]');
          if (!clear) window.__clearedAt = null;
          else window.__clearedAt ??= Date.now();
        };
        store.subscribe(window.__watchClear);
        new MutationObserver(window.__watchClear).observe(document.body, { childList: true, subtree: true });
      }
      window.__clearedAt = null;
      window.__watchClear();
    });
  const clearedAt = (t) => t.page.evaluate(() => window.__clearedAt ?? null);
  const lastDecline = async (click, what) => {
    await Promise.all(tabs.map(watchClear));
    const t0 = Date.now();
    await click();
    const at = await until(async () => {
      const all = await Promise.all(tabs.map(clearedAt));
      return all.every((x) => x !== null) ? all : null;
    }, `#537 (${what}): the fully declined offer closes on every tab, not at the timeout`, 5_000);
    const ms = Math.max(...at) - t0;
    if (ms > 500) throw new Error(`#537 (${what}): the fully declined offer took ${ms} ms to close on every tab (> 500)`);
    const closed = await views(tabs);
    if (closed.some((v) => v.offer)) throw new Error(`#537 (${what}): a tab still holds the offer`);
    return ms;
  };
  // #537: when the outcome line clears (2.5 s on), no copy of the old offer card may come back for any seat. The watchers go in
  // right after the last decline, while the outcome line is still showing, and report any trade-toast that is added.
  const noGhostCard = async (what) => {
    await Promise.all(tabs.map((t) => t.page.evaluate(() => {
      window.__ghost = [];
      window.__sawOutcome = Boolean(document.querySelector('[data-testid="trade-outcome"]'));
      new MutationObserver((records) => {
        if (document.querySelector('[data-testid="trade-outcome"]')) window.__sawOutcome = true;
        for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1 && (n.matches?.('[data-testid="trade-toast"]') || n.querySelector?.('[data-testid="trade-toast"]'))) window.__ghost.push(performance.now());
      }).observe(document.body, { childList: true, subtree: true });
    })));
    await until(async () => {
      const gone = await Promise.all(tabs.map((t) => t.page.evaluate(() => !document.querySelector('[data-testid="trade-outcome"]'))));
      return gone.every(Boolean) ? true : null;
    }, `#537 (${what}): the outcome line clears on every tab`, 6_000);
    await sleep(500);
    const seen = await Promise.all(tabs.map((t) => t.page.evaluate(() => ({ ghost: window.__ghost.length, outcome: window.__sawOutcome }))));
    if (!seen.some((x) => x.outcome)) throw new Error(`#537 (${what}): no seat showed an outcome line, so the ghost check proved nothing`);
    if (seen.some((x) => x.ghost)) throw new Error(`#537 (${what}): an offer card came back after the outcome line cleared: ${JSON.stringify(seen)}`);
    console.log(`#537 (${what}): no stale offer card appears when the outcome line clears`);
  };
  // A holds the card it is offering, and still has the turn, so it can ask again.
  const canAskAgain = (what) => {
    if (vs[0].phase !== "main" || vs[0].current !== vs[i].you || (vs[i].mine[offerRes] ?? 0) < 1) {
      throw new Error(`#537 (${what}): the asker cannot ask again (phase ${vs[0].phase}, holds ${vs[i].mine[offerRes]} ${offerRes})`);
    }
  };
  // B short, C able, then the ask: B must see the compact demand and C the normal offer within 2 s of it.
  const askShortAndAble = async (what) => {
    await forget(tabs);
    await setLocal(B, 0);
    await setLocal(C, 2);
    const got = await ask(offerRes, need, 2);
    await until(async () => ((await compactOf(B)) === "true" && (await compactOf(C)) === null ? true : null), `#537 (${what}): B sees the compact demand and C the normal offer`, 2_000);
    return got;
  };

  canAskAgain("normal motion");
  const third = await askShortAndAble("normal motion");
  const tradeId3 = third[0].offer.tradeId;
  if (tradeId3 === tradeId2) throw new Error("third ask reused the tradeId");
  const afterPin = await views(tabs);
  if (!(await answerable(B, afterPin[tabs.indexOf(B)], line3, need, 2))) throw new Error(`${B.name} should be short of ${needLabel}`);
  if (await answerable(C, afterPin[tabs.indexOf(C)], line3, need, 2)) throw new Error(`${C.name} should be able to pay 2 ${needLabel}`);
  if ((await fadeOf(B)) !== "150") throw new Error(`#537: the dismiss fade is ${await fadeOf(B)} ms, want 150`);
  console.log(`#537: ${B.name} sees compact "${demand}"; ${C.name} sees full offer "${line3}"`);
  // #537 / owner decision on PR #824: the compact signal keeps its reason for keyboard and screen-reader users. B has 0 of
  // the good and the ask wants 2, so the hidden reason names exactly that; C can pay and gets no reason at all.
  const why = await B.page.evaluate(() => {
    const el = document.querySelector('[data-testid="trade-why"]');
    const dismiss = document.querySelector('[data-testid="trade-dismiss"]');
    const toast = document.querySelector('[data-testid="trade-toast"]');
    const box = el?.getBoundingClientRect();
    return { text: el?.textContent ?? null, id: el?.id ?? null, dismissRef: dismiss?.getAttribute("aria-describedby") ?? null, toastRef: toast?.getAttribute("aria-describedby") ?? null, tiny: box ? box.width <= 1 && box.height <= 1 : null };
  });
  if (why.text !== `You need 2 more ${needLabel} to accept`) throw new Error(`#537: ${B.name}'s hidden reason reads ${JSON.stringify(why.text)}`);
  if (!why.id || why.dismissRef !== why.id || why.toastRef !== why.id) throw new Error(`#537: the reason is not tied to Dismiss and the toast: ${JSON.stringify(why)}`);
  if (!why.tiny) throw new Error(`#537: the reason is visible on screen: ${JSON.stringify(why)}`);
  if (await C.page.getByTestId("trade-why").count()) throw new Error(`#537: ${C.name} can pay but has an unaffordable reason`);
  console.log(`#537: ${B.name}'s Dismiss and toast are described by the hidden "${why.text}"; ${C.name} has none`);

  // Change B's hand: the compact signal flips to the normal Yes/No with no new offer, and back.
  await setLocal(B, 2);
  await until(async () => {
    const yes = await B.page.getByTestId("trade-toast").getByRole("button", { name: "Yes", exact: true }).count();
    return (await compactOf(B)) === null && yes === 1 ? true : null;
  }, `#537: B's toast upgrades when ${needLabel} arrives`);
  if ((await view(B)).offer?.tradeId !== tradeId3) throw new Error("#537: the upgrade needed another offer");
  if (await B.page.getByTestId("trade-why").count()) throw new Error("#537: the reason stayed after B could pay");
  console.log(`#537: giving ${B.name} 2 ${needLabel} flips compact to full Yes/No without a new offer`);
  await setLocal(B, 0);
  await until(async () => ((await compactOf(B)) === "true" ? true : null), "#537: B compact again");

  // B dismisses from the compact signal (Enter on the focused Dismiss sends a No): the offer stays open for C.
  await spyAnswers(B);
  await B.page.getByTestId("trade-dismiss").focus();
  // The card must stay mounted and fade: sample every frame from the Enter until it leaves the DOM.
  await B.page.evaluate(() => {
    window.__fade = [];
    const sample = () => {
      const el = document.querySelector('[data-testid="trade-toast"]');
      if (el) window.__fade.push({ leaving: el.getAttribute("data-leaving") === "true", opacity: Number(getComputedStyle(el).opacity), inert: el.hasAttribute("inert") });
      if (el || window.__fade.length < 2) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await B.page.keyboard.press("Enter");
  await until(async () => ((await B.page.getByTestId("trade-toast").count()) === 0 ? true : null), "#537: B's card leaves after the fade", 2_000);
  const fade = await B.page.evaluate(() => window.__fade);
  const leavingFrames = fade.filter((f) => f.leaving);
  if (leavingFrames.length < 2) throw new Error(`#537: the 150 ms dismiss fade never ran: ${JSON.stringify(fade)}`);
  if (!leavingFrames.some((f) => f.opacity > 0 && f.opacity < 1)) throw new Error(`#537: opacity never took a value between 0 and 1 while fading: ${JSON.stringify(leavingFrames)}`);
  if (!leavingFrames.every((f) => f.inert)) throw new Error(`#537: a fading card was still operable: ${JSON.stringify(leavingFrames)}`);
  console.log(`#537: Dismiss fades the card over ${leavingFrames.length} frames (opacity ${leavingFrames[0].opacity.toFixed(2)} to ${leavingFrames.at(-1).opacity.toFixed(2)}), inert while it goes`);
  const dismissSent = await B.page.evaluate(() => window.__answers);
  if (!same(dismissSent, [[tradeId3, false]])) throw new Error(`#537: ${B.name}'s Enter on Dismiss sent ${JSON.stringify(dismissSent)}`);
  vs = await until(async () => {
    const next = await views(tabs);
    return next.every((v) => v.declined.includes(third[j].you)) ? next : null;
  }, "#537: B's dismiss reaches every tab");
  if (vs.some((v) => !v.offer || v.offer.tradeId !== tradeId3)) throw new Error("#537: the offer closed on B's dismiss alone");
  if (!(await C.page.getByTestId("trade-toast").count())) throw new Error(`#537: ${C.name}'s offer went when only ${B.name} declined`);
  // C declines from the normal offer: A, B and C close it within 500 ms.
  const normalMs = await lastDecline(() => C.page.getByTestId("trade-toast").getByRole("button", { name: "No", exact: true }).click(), "normal motion");
  console.log(`#537: both declined, the offer is gone on all 3 tabs in ${normalMs} ms`);
  await noGhostCard("normal motion");

  // 6. #537 again under reduced motion: the dismiss does not fade (0 ms) and the fully declined offer is gone at once. The
  // asker can always ask again here; if it cannot, this fails rather than skips.
  for (const t of tabs) await t.page.emulateMedia({ reducedMotion: "reduce" });
  vs = await views(tabs);
  canAskAgain("reduced motion");
  const fourth = await askShortAndAble("reduced motion");
  const tradeId4 = fourth[0].offer.tradeId;
  if (tradeId4 === tradeId3) throw new Error("fourth ask reused the tradeId");
  for (const t of [B, C]) {
    const fade = await fadeOf(t);
    if (fade !== "0") throw new Error(`#537: reduced motion left ${t.name}'s toast with data-fade-ms ${fade}, want 0`);
  }
  const t0 = Date.now();
  await B.page.getByTestId("trade-dismiss").click();
  await until(async () => ((await B.page.getByTestId("trade-toast").count()) === 0 ? true : null), "#537: B's compact signal is gone after Dismiss", 2_000);
  // The fade is 0 ms; the allowance covers a React unmount and the click's round trip on a slow runner.
  if (Date.now() - t0 > 250) throw new Error(`#537: reduced motion dismiss took ${Date.now() - t0} ms`);
  await until(async () => (await views(tabs)).every((v) => v.declined.includes(fourth[j].you)) || null, "#537: B's dismiss reaches every tab under reduced motion");
  const calmMs = await lastDecline(() => C.page.getByTestId("trade-toast").getByRole("button", { name: "No", exact: true }).click(), "reduced motion");
  console.log(`#537: reduced motion: dismiss at once, both declined, the offer is gone on all 3 tabs in ${calmMs} ms`);
  await noGhostCard("reduced motion");

  // Step 6's last decline plays corn_no on every seat a moment after the offer closes; let it land before #1107 listens.
  await sleep(2000);
  const dakingId = vs[tabs.indexOf(A)].you;
  await Promise.all(tabs.map((t) => t.page.evaluate((id) => {
    const store = window.__emberisle;
    const state = store.getState().state;
    store.setState({ state: { ...state, players: state.players.map((p) => p.id === id ? { ...p, name: "Daking" } : p) } });
  }, dakingId)));
  const issueTradeSounds = (t) => t.page.evaluate(() => window.__heard.filter((h) => /^(trade_offer|three_wood|daking_wood|sheep_for_wood|stone_for_wood|corn_no|error_002)\./.test(h)));
  const sendTableEvent = async (event) => Promise.all(tabs.map((t) => t.page.evaluate((msg) => window.__sockets.at(-1).onmessage({ data: JSON.stringify(msg) }), event)));
  const hearOffer = async (tradeId, give, want) => {
    await forget(tabs);
    await sendTableEvent({ type: "tradeOffer", tradeId, from: dakingId, give, want, seconds: 20 });
    await sleep(300);
    return Promise.all(tabs.map(issueTradeSounds));
  };
  let clip = await hearOffer("new-three-wood", { timber: 3 }, { wool: 1 });
  for (const got of clip) assert.deepEqual(got, ["three_wood.mp3@1"], "3+ timber uses the same clip on every seat, including the asker");
  clip = await hearOffer("new-daking-wood", { timber: 2 }, { wool: 1 });
  for (const got of clip) assert.deepEqual(got, ["daking_wood.mp3@1"], "Daking's 1-2 timber clip reaches every seat");
  for (const [id, name] of [["lower", "daking"], ["padded", " DAKING "]]) {
    await Promise.all(tabs.map((t) => t.page.evaluate(([who, n]) => {
      const store = window.__emberisle;
      const state = store.getState().state;
      store.setState({ state: { ...state, players: state.players.map((p) => p.id === who ? { ...p, name: n } : p) } });
    }, [dakingId, name])));
    clip = await hearOffer(`new-daking-${id}`, { timber: 1 }, { wool: 1 });
    for (const got of clip) assert.deepEqual(got, ["daking_wood.mp3@1"], `"${name}" counts as Daking: 1-2 timber plays daking_wood on every seat`);
    clip = await hearOffer(`new-daking-${id}-three`, { timber: 3 }, { wool: 1 });
    for (const got of clip) assert.deepEqual(got, ["three_wood.mp3@1"], `"${name}" with 3 timber still plays three_wood first`);
  }
  clip = await hearOffer("new-sheep-for-wood", { wool: 1 }, { timber: 1 });
  for (const got of clip) assert.deepEqual(got, ["sheep_for_wood.mp3@1"], "sheep for timber reaches every seat, including the asker");
  clip = await hearOffer("new-stone-for-wood", { ore: 1 }, { timber: 1 });
  for (const got of clip) assert.deepEqual(got, ["stone_for_wood.mp3@1"], "stone for timber reaches every seat, including the asker");
  clip = await hearOffer("new-plain-offer", { grain: 1 }, { wool: 1 });
  assert.deepEqual(clip[tabs.indexOf(A)], [], "the asker does not hear the plain offer chime");
  for (const t of [B, C]) assert.deepEqual(clip[tabs.indexOf(t)], ["trade_offer.wav@1"], "other seats hear the plain offer chime");

  await hearOffer("new-all-no", { grain: 1 }, { wool: 1 });
  await forget(tabs);
  const otherIds = vs.map((v) => v.you).filter((id) => id !== dakingId);
  await sendTableEvent({ type: "tradeDeclined", tradeId: "new-all-no", by: otherIds[0] });
  await sleep(200);
  assert.ok((await Promise.all(tabs.map(issueTradeSounds))).every((got) => !got.some((h) => h.startsWith("corn_no."))), "one No is not enough for corn_no");
  await sendTableEvent({ type: "tradeDeclined", tradeId: "new-all-no", by: otherIds[1] });
  await sendTableEvent({ type: "tradeClosed", tradeId: "new-all-no" });
  await sleep(300);
  for (const got of await Promise.all(tabs.map(issueTradeSounds))) assert.deepEqual(got, ["corn_no.mp3@1"], "all explicit No answers play corn_no on every seat");
  await sendTableEvent({ type: "tradeOffer", tradeId: "new-timeout", from: dakingId, give: { grain: 1 }, want: { wool: 1 }, seconds: 20 });
  await forget(tabs);
  await sendTableEvent({ type: "tradeClosed", tradeId: "new-timeout" });
  await sleep(300);
  for (const got of await Promise.all(tabs.map(issueTradeSounds))) assert.ok(!got.some((h) => h.startsWith("corn_no.")), "timeout without all explicit No answers does not play corn_no");
  console.log("#1107: trade clips follow precedence, reach all seats, plain chime excludes the asker, and corn_no needs every explicit No");

  if (errors.length) throw new Error(`console errors:\n${errors.join("\n")}`);
  console.log("trade prove ok");
} catch (e) {
  console.log("FAIL", e.message);
  if (errors.length) console.log(errors.join("\n"));
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  host.kill();
  if (host.exitCode === null && host.signalCode === null) await Promise.race([once(host, "exit"), new Promise((r) => setTimeout(r, 3000).unref())]);
}
process.exit(code);
