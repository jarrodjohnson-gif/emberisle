// #1546 one tray, slice C (docs/design/one-tray, "The action row in every state"). An incoming offer, a discard on a 7 and
// "take from whom" each take over the one tray: its top line, its hand and its action row, with no second box. In a
// practice game past setup, at 390x844 and 844x390 (touch) and 1280x720, for each state:
// - an offer I can answer: the top line reads "<seat>: give 1 wood, get 1 brick" (no "(bot)"), the give words in the Give red
//   (#b3261e) and the get words in the Get green (#1e7a46); the hand tags wood "−1" in Give colours and brick "+1" in Get
//   colours; the action row is No then Yes, one row, Yes the one primary button, on the right; No answers no;
// - an offer I cannot pay: "<seat> is looking for 2 sheep", the action row is Dismiss alone;
//   A two-goods offer ("give 1 wood and 1 wheat, get 2 brick") is whole too: no top line is ever cut, it may wrap;
// - my own offer out: "You offer 2 wheat for 1 stone" with who has said no on its own quiet line under it; Cancel alone;
// - take from whom: "Take from whom?"; one button per seat, colour dot, name (no "(bot)") and card count, sharing one row
//   equally on an upright phone, one row each in the sideways column, and as wide as their words on a desktop; no name is cut, 8-letter names included; the three look
//   the same at rest; pressing one takes from that seat;
// - the discard: "Discard 4: pick 4 more", with no dot (a dot names a seat); the picker's five columns show what you keep
//   (the name in each label), a column of a good you hold none of is disabled; a fixed row of five 44 px take-one-back
//   buttons stands where the names were from the start (aria-disabled at 0); the tray never changes height while picking
//   and is no taller than the my-turn tray; Enter on a focused column adds one; the count reads "pick N more", then
//   "ready"; "Discard 4" is off until the count is exact, and then discards those goods;
// - in every state: every button and hand column in the tray is at least 44 px both ways, no visible text in it is under
//   12 px, the tray and its buttons lie inside the viewport, the tray is the one surface (nothing inside it but buttons has
//   a border, a shadow or a fill bigger than a dot or a tag; the offer's own element draws no box), every island corner
//   and dock lies in the hole the tray leaves (above it; right of it in the sideways column), and the tray is no taller
//   than the my-turn tray but for what its own top line adds;
// - zero page errors.
// Every failure is listed before the run fails. SHOTS=1 also writes real-game PNGs at device scale 2 into docs/proofs/1546/
// for 430x932, 390x844, 844x390 and 1280x720. Run: npm run tray-offers-prove
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";

const STEP_MS = 30_000;
const SHOTS = process.env.SHOTS === "1";
const SHOT_DIR = "docs/proofs/1546";
const VIEWS = [
  { tag: "390x844", width: 390, height: 844, touch: true, full: true },
  { tag: "844x390", width: 844, height: 390, touch: true, full: true, column: true },
  { tag: "1280x720", width: 1280, height: 720, full: true },
  { tag: "430x932", width: 430, height: 932, touch: true },
];
// One hand for every state, so the hand never flashes a gain or a loss between them.
const HAND = { timber: 3, clay: 2, wool: 0, grain: 2, ore: 1 };
const GIVE = "rgb(179, 38, 30)";
const GIVE_BG = "rgb(253, 236, 234)";
const GET = "rgb(30, 122, 70)";
const GET_BG = "rgb(228, 244, 234)";
const INK = "rgb(31, 61, 59)";

// A practice game past setup with p0 (Ember) on `current`'s turn in `phase`.
function game({ phase = "main", current = "p0", patch } = {}) {
  let g = createGame({ humans: [{ name: "Ember" }], bots: 3, seed: 11 });
  while (g.phase !== "roll") g = applyAction(g, g.current, chooseBotAction(g, g.current)).state;
  g.phase = phase;
  g.current = current;
  g.dice = [3, 4];
  g.players.find((p) => p.id === "p0").resources = { ...HAND };
  patch?.(g);
  return g;
}

if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const PORT = vite.httpServer.address().port;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const failures = [];
const check = (ok, msg) => {
  if (!ok) {
    failures.push(msg);
    console.log(`FAIL ${msg}`);
  }
  return ok;
};
let code = 0;

// Everything the rules read off the tray, as far as each box shows.
const readTray = (page) =>
  page.evaluate(() => {
    const s = document.querySelector("[data-hud-stack]");
    const sr = s.getBoundingClientRect();
    const seen = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest(".sr-only,[hidden]");
    };
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom) };
    };
    const name = (el) => el.dataset.testid ?? el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 24);
    const small = [];
    const boxes = [];
    for (const el of s.querySelectorAll("*")) {
      if (!seen(el)) continue;
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
      const cs = getComputedStyle(el);
      if (text && parseFloat(cs.fontSize) < 12) small.push(`${text.slice(0, 24)} ${cs.fontSize}`);
      // One surface: inside the tray only a button (or what is inside one) draws a box. A dot, a "−N" tag and the gain or
      // loss cue are marks, not boxes; a 1 px divider between hand columns is the tray's own line.
      if (el.closest("button") || el.closest(".goods-tab,.goods-lit,.goods-lost") || el.matches(".tray-tag,.hand-offer-delta")) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 16 && r.height <= 16) continue;
      const sides = ["Top", "Right", "Bottom", "Left"].filter((k) => parseFloat(cs[`border${k}Width`]) > 0 && cs[`border${k}Style`] !== "none" && !(k === "Left" && cs.borderLeftColor === "rgb(227, 234, 231)"));
      const fill = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent";
      if (sides.length || fill || cs.boxShadow !== "none") boxes.push(`${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join(".")} ${sides.length ? `border ${sides.join("/")}` : ""}${fill ? ` fill ${cs.backgroundColor}` : ""}${cs.boxShadow !== "none" ? " shadow" : ""}`);
    }
    const toast = document.querySelector('[data-testid="trade-toast"]');
    const line = s.querySelector(".tray-takeover > .tray-line");
    const lineText = line ? (line.querySelector("p") ?? line).textContent.trim() : null;
    return {
      rect: { left: sr.left, top: sr.top, right: sr.right, bottom: sr.bottom, h: Math.round(sr.height * 10) / 10 },
      tray: s.classList.contains("hud-tray"),
      line: lineText,
      lineShown: line ? seen(line) : false,
      normalTop: [...s.querySelectorAll(":scope > .tray-top")].some(seen),
      right: line?.querySelector(".tray-event")?.textContent.trim() ?? null,
      // Never cut: the sentence wraps instead of clipping or ending in an ellipsis.
      cut: (() => { const p = line && (line.querySelector("p") ?? line); if (!p) return null; const cs = getComputedStyle(p); return p.scrollWidth > p.clientWidth + 0.5 || cs.textOverflow === "ellipsis" || (cs.whiteSpace === "nowrap" && cs.overflow === "hidden"); })(),
      lineH: line ? Math.round(line.getBoundingClientRect().height) : 0,
      sentenceBottom: line?.querySelector("p") ? Math.round(line.querySelector("p").getBoundingClientRect().bottom) : null,
      rightTop: line?.querySelector(".tray-event") ? Math.round(line.querySelector(".tray-event").getBoundingClientRect().top) : null,
      lineDot: line ? [...line.querySelectorAll("span")].some((x) => x.style.background) || getComputedStyle(line, "::before").content !== "none" : null,
      names: [...s.querySelectorAll(".take-row .truncate")].map((n) => ({ text: n.textContent, cut: n.scrollWidth > n.clientWidth })),
      give: line?.querySelector(".trade-give-text") ? { text: line.querySelector(".trade-give-text").textContent, color: getComputedStyle(line.querySelector(".trade-give-text")).color } : null,
      get: line?.querySelector(".trade-get-text") ? { text: line.querySelector(".trade-get-text").textContent, color: getComputedStyle(line.querySelector(".trade-get-text")).color } : null,
      toast: toast ? { display: getComputedStyle(toast).display, inTray: s.contains(toast) } : null,
      buttons: [...s.querySelectorAll("button, [role=button]")].filter(seen).map((b) => ({ name: name(b), ...box(b), primary: getComputedStyle(b).backgroundColor === "rgb(31, 61, 59)" })),
      row: [...s.querySelectorAll(".tray-takeover .tray-row > button")].filter(seen).map((b) => ({ name: b.textContent.trim(), label: b.getAttribute("aria-label"), disabled: b.disabled, bg: getComputedStyle(b).backgroundColor, ...box(b) })),
      otherRows: [...s.querySelectorAll(":scope > .hud-actions, :scope > .hud-roll, :scope > .end-footer, :scope > .tray-fortunes")].filter(seen).length,
      handShown: [...s.querySelectorAll(':scope > [data-testid="hand-dock"]')].some(seen),
      tags: Object.fromEntries([...s.querySelectorAll(".hand-offer-delta, .tray-tag")].filter(seen).map((t) => {
        const kind = (t.closest("[data-testid^=offer-slot-]")?.dataset.testid ?? t.closest("[data-testid^=discard-]")?.dataset.testid ?? "").replace(/^(offer-slot|discard)-/, "");
        const cs = getComputedStyle(t);
        return [kind, { text: t.textContent.trim(), color: cs.color, bg: cs.backgroundColor, size: parseFloat(cs.fontSize) }];
      })),
      small,
      boxes,
    };
  });

try {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch, deviceScaleFactor: SHOTS ? 2 : 1 });
    await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
    const page = await ctx.newPage();
    page.setDefaultTimeout(STEP_MS);
    page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`${v.tag}: ${m.text()}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0);
    const tag = v.tag;
    const load = async (opts, extra = {}) => {
      const g = game(opts);
      await page.evaluate(([g, extra]) => {
        const e = window.__emberisle;
        if (e.getState().screen !== "play") e.getState().startAi();
        // The other seats stay still; the answer, cancel and steal calls are recorded instead of played out.
        window.__calls = [];
        e.setState({
          runBots: () => {}, state: g, buildMode: "none", pendingPlace: null, error: null, banner: null, toast: null,
          offer: null, declined: [], tradeOutcome: null, tradeTaker: null, pendingSteal: null,
          answerTrade: (yes) => window.__calls.push(["answer", yes]),
          cancelTrade: () => window.__calls.push(["cancel"]),
          chooseSteal: (id) => window.__calls.push(["steal", id]),
          ...extra,
        });
      }, [g, extra]);
      return g;
    };
    const press = async (loc) => {
      if (v.touch) await loc.tap();
      else await loc.click();
    };
    // The pointer rests off the tray, so no button reads in its hover state.
    const settle = async () => {
      if (!v.touch) await page.mouse.move(1, 1);
      await page.evaluate(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r)); });
    };
    const shot = async (name) => {
      if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}/${name}-${tag}.png` });
    };
    const calls = () => page.evaluate(() => window.__calls);
    // Every corner of the island, and every dock's pier and boat (0.7 out along the coast at the waterline, as
    // visual-direction-prove reads them), in the hole the tray leaves: above it, or right of the sideways column.
    const island = async (at, s) => {
      const out = await page.evaluate(([column, top, right]) => {
        const r = window.__isle;
        const st = window.__emberisle.getState().state;
        const points = st.vertices.map((x) => [x.id, r.screenOf(x.id)]);
        for (const x of st.vertices) {
          const m = x.harbor && r.coastMiter?.get(x.id);
          if (m) points.push([`dock ${x.id}`, r.screenAt(x.x + m.mx * 0.7, 0.1, x.z + m.mz * 0.7)]);
        }
        return points.filter(([, p]) => !p || p.y < 0 || p.y > innerHeight || (column ? p.x < right || p.x > innerWidth : p.y > top)).map(([id, p]) => `${id}@${p ? `${Math.round(p.x)},${Math.round(p.y)}` : "none"}`);
      }, [!!v.column, s.rect.top, s.rect.right]);
      check(out.length === 0, `${at}: ${out.length} island corners or docks lie under the tray or off screen: ${out.slice(0, 6).join(" ")}`);
    };
    const common = (s, at, { grow = 0 } = {}) => {
      check(s.tray, `${at}: the stack is the hud-tray`);
      for (const b of s.buttons) check(b.w >= 44 && b.h >= 44, `${at}: ${b.name} is ${b.w}x${b.h}, under 44 px`);
      for (const b of s.buttons) check(b.left >= 0 && b.top >= 0 && b.right <= v.width && b.bottom <= v.height, `${at}: ${b.name} ${JSON.stringify(b)} is off screen`);
      check(s.small.length === 0, `${at}: text under 12 px in the tray: ${s.small.join("; ")}`);
      const r = s.rect;
      check(r.left >= 0 && r.top >= 0 && r.right <= v.width && r.bottom <= v.height, `${at}: the tray ${JSON.stringify(r)} leaves the ${tag} viewport`);
      check(s.boxes.length === 0, `${at}: one tray surface, but these draw a box inside it: ${s.boxes.join("; ")}`);
      check(s.lineShown && !s.normalTop, `${at}: the takeover's top line stands in for the tray's (shown ${s.lineShown}, tray's own still shown ${s.normalTop})`);
      check(s.otherRows === 0, `${at}: the tray's own action rows are hidden (${s.otherRows} still shown)`);
      // A takeover is no taller than the my-turn tray, but for what its own top line adds over one line (a wrapped
      // sentence, the asker's quiet line) and, in the discard, the `grow` this view allows.
      const allowed = baseline + 2 + Math.max(0, s.lineH - 32) + grow;
      check(s.rect.h <= allowed, `${at}: the tray is ${s.rect.h} px tall, the my-turn tray ${baseline} px (allowed ${allowed})`);
      if (s.cut !== null) check(s.cut === false, `${at}: the top line is cut`);
      console.log(`${at}: tray ${s.rect.h} px (my turn ${baseline} px, delta ${Math.round((s.rect.h - baseline) * 10) / 10})`);
    };

    // 0. The my-turn tray, the height every takeover is held to.
    await load({});
    await page.getByTestId("build-open").waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-testid="resource-flash"]'), null, { timeout: 10_000 });
    await settle();
    const baseline = (await readTray(page)).rect.h;

    // 1. An offer I can answer: Tide (p2) gives 1 brick for 1 wood.
    let g = await load({ current: "p2" }, {});
    const bare = (n) => n.replace(/ \(bot\)$/, "");
    const tide = bare(g.players.find((p) => p.id === "p2").name);
    await page.evaluate(() => window.__emberisle.setState({ offer: { tradeId: "t1546", from: "p2", fromName: window.__emberisle.getState().state.players.find((p) => p.id === "p2").name, give: { clay: 1 }, want: { timber: 1 }, until: null } }));
    await page.getByTestId("trade-toast").waitFor();
    await settle();
    let s = await readTray(page);
    let at = `${tag} offer`;
    check(s.line === `${tide}: give 1 wood, get 1 brick`, `${at}: the top line reads "${s.line}"`);
    check(s.give?.text === "give 1 wood" && s.give.color === GIVE, `${at}: the give words ${JSON.stringify(s.give)}, want "give 1 wood" in ${GIVE}`);
    check(s.get?.text === "get 1 brick" && s.get.color === GET, `${at}: the get words ${JSON.stringify(s.get)}, want "get 1 brick" in ${GET}`);
    check(s.toast?.inTray && s.toast.display === "contents", `${at}: the offer is part of the tray and draws no box of its own ${JSON.stringify(s.toast)}`);
    check(s.handShown, `${at}: the hand stays`);
    check(JSON.stringify(Object.keys(s.tags).sort()) === '["clay","timber"]', `${at}: tags on ${JSON.stringify(s.tags)}, want wood and brick only`);
    check(s.tags.timber?.text === "−1" && s.tags.timber.color === GIVE && s.tags.timber.bg === GIVE_BG && s.tags.timber.size >= 12, `${at}: wood's tag ${JSON.stringify(s.tags.timber)}, want "−1" in Give colours`);
    check(s.tags.clay?.text === "+1" && s.tags.clay.color === GET && s.tags.clay.bg === GET_BG && s.tags.clay.size >= 12, `${at}: brick's tag ${JSON.stringify(s.tags.clay)}, want "+1" in Get colours`);
    check(JSON.stringify(s.row.map((b) => b.name)) === '["No","Yes"]', `${at}: the action row is ${JSON.stringify(s.row.map((b) => b.name))}, want No, Yes`);
    check(new Set(s.row.map((b) => b.top)).size === 1 && s.row[1]?.left > s.row[0]?.left, `${at}: No and Yes share one row, Yes on the right ${JSON.stringify(s.row)}`);
    check(s.row[1]?.bg === INK && s.row[0]?.bg !== INK && s.buttons.filter((b) => b.primary).length === 1, `${at}: Yes is the one primary button`);
    common(s, at);
    await island(at, s);
    await shot("offer");
    await press(page.getByTestId("trade-toast").getByRole("button", { name: "No", exact: true }));
    check(JSON.stringify(await calls()) === '[["answer",false]]', `${at}: No answered ${JSON.stringify(await calls())}`);
    // Two goods one way: the sentence is still whole (it may wrap).
    await load({ current: "p2" });
    await page.evaluate(() => window.__emberisle.setState({ offer: { tradeId: "t1546w", from: "p2", fromName: window.__emberisle.getState().state.players.find((p) => p.id === "p2").name, give: { clay: 2 }, want: { timber: 1, grain: 1 }, until: null } }));
    await page.getByTestId("trade-toast").waitFor();
    await settle();
    s = await readTray(page);
    at = `${tag} offer, two goods`;
    check(s.line === `${tide}: give 1 wood and 1 wheat, get 2 brick`, `${at}: the top line reads "${s.line}"`);
    common(s, at);
    await shot("offer-two");

    // 2. An offer I cannot pay: Tide wants 2 sheep and I hold none.
    await load({ current: "p2" });
    await page.evaluate(() => window.__emberisle.setState({ offer: { tradeId: "t1546b", from: "p2", fromName: window.__emberisle.getState().state.players.find((p) => p.id === "p2").name, give: { clay: 1 }, want: { wool: 2 }, until: null } }));
    await page.getByTestId("trade-dismiss").waitFor();
    await settle();
    s = await readTray(page);
    at = `${tag} offer I cannot pay`;
    check(s.line === `${tide} is looking for 2 sheep`, `${at}: the top line reads "${s.line}"`);
    check(JSON.stringify(s.row.map((b) => b.name)) === '["Dismiss"]', `${at}: the action row is ${JSON.stringify(s.row.map((b) => b.name))}, want Dismiss`);
    common(s, at);
    await island(at, s);
    await shot("offer-short");
    await press(page.getByTestId("trade-dismiss"));
    check(JSON.stringify(await calls()) === '[["answer",false]]', `${at}: Dismiss answered ${JSON.stringify(await calls())}`);

    // 3. My own offer is out: 2 wheat for 1 stone, and Pine (p3) has said no.
    g = await load({});
    const pine = bare(g.players.find((p) => p.id === "p3").name);
    await page.evaluate(() => window.__emberisle.setState({ offer: { tradeId: "t1546c", from: "p0", fromName: "Ember", give: { grain: 2 }, want: { ore: 1 }, until: null }, declined: ["p3"] }));
    await page.getByTestId("trade-cancel").waitFor();
    await settle();
    s = await readTray(page);
    at = `${tag} my offer`;
    check(s.line === "You offer 2 wheat for 1 stone", `${at}: the top line reads "${s.line}"`);
    check(s.right === `${pine} declined`, `${at}: who said no reads "${s.right}"`);
    check(s.rightTop >= s.sentenceBottom - 1, `${at}: "${s.right}" is its own line under the sentence (${s.rightTop} vs ${s.sentenceBottom})`);
    check(s.tags.grain?.text === "−2" && s.tags.grain.color === GIVE && s.tags.ore?.text === "+1" && s.tags.ore.color === GET, `${at}: the hand tags ${JSON.stringify(s.tags)}`);
    check(JSON.stringify(s.row.map((b) => b.name)) === '["Cancel"]', `${at}: the action row is ${JSON.stringify(s.row.map((b) => b.name))}, want Cancel`);
    common(s, at);
    await island(at, s);
    await shot("offer-mine");
    await press(page.getByTestId("trade-cancel"));
    check(JSON.stringify(await calls()) === '[["cancel"]]', `${at}: Cancel took it back ${JSON.stringify(await calls())}`);

    // 4. Take from whom: three seats to take from.
    g = await load({ phase: "robber" });
    await page.evaluate((hex) => window.__emberisle.setState({ pendingSteal: { hexId: hex, kind: "moveRobber", targets: ["p1", "p2", "p3"] } }), g.robberHex);
    const group = page.getByRole("group", { name: "The wayfarer takes a card" });
    await group.waitFor();
    await settle();
    s = await readTray(page);
    at = `${tag} take from`;
    check(s.line === "Take from whom?", `${at}: the top line reads "${s.line}"`);
    const cards = (p) => Object.values(p.resources).reduce((a, b) => a + b, 0);
    const want = ["p1", "p2", "p3"].map((id) => { const p = g.players.find((x) => x.id === id); return [`${bare(p.name)}${cards(p)}`, `${bare(p.name)}, ${cards(p)} cards`]; });
    check(JSON.stringify(s.row.map((b) => [b.name, b.label])) === JSON.stringify(want), `${at}: the seats read ${JSON.stringify(s.row.map((b) => [b.name, b.label]))}, want ${JSON.stringify(want)}`);
    check(s.names.length === 3 && s.names.every((n) => !n.cut), `${at}: every seat name shows in full ${JSON.stringify(s.names)}`);
    check(new Set(s.row.map((b) => b.bg)).size === 1, `${at}: the three seats look the same at rest ${JSON.stringify(s.row.map((b) => b.bg))}`);
    const dots = await group.evaluate((el) => [...el.querySelectorAll(".tray-row > button")].map((b) => b.firstElementChild?.style.background ?? null));
    check(dots.every(Boolean), `${at}: each seat has its colour dot ${JSON.stringify(dots)}`);
    const widths = s.row.map((b) => b.w);
    if (v.column) check(new Set(s.row.map((b) => b.top)).size === 3 && Math.max(...widths) - Math.min(...widths) <= 1, `${at}: in the 240 px column each seat has its own full-width row ${JSON.stringify(s.row)}`);
    else if (v.width < 768 || v.touch) check(new Set(s.row.map((b) => b.top)).size === 1 && Math.max(...widths) - Math.min(...widths) <= 1, `${at}: three buttons share one row equally ${JSON.stringify(s.row)}`);
    else check(new Set(s.row.map((b) => b.top)).size === 1, `${at}: three buttons in one row, each as wide as its words ${JSON.stringify(s.row)}`);
    common(s, at);
    await island(at, s);
    await shot("take-from");
    // Names of 8 letters still fit, three to the row.
    const long8 = await page.evaluate(() => {
      const e = window.__emberisle;
      const st = structuredClone(e.getState().state);
      ["Seafarer", "Wildfire", "Stormcap"].forEach((n, i) => (st.players[i + 1].name = n));
      e.setState({ state: st });
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r([...document.querySelectorAll(".take-row .truncate")].map((n) => ({ text: n.textContent, cut: n.scrollWidth > n.clientWidth, w: n.clientWidth, need: n.scrollWidth }))))));
    });
    check(long8.length === 3 && long8.every((n) => !n.cut), `${at}: 8-letter names show in full ${JSON.stringify(long8)}`);
    await page.evaluate((names) => { const e = window.__emberisle; const st = structuredClone(e.getState().state); names.forEach((n, i) => (st.players[i + 1].name = n)); e.setState({ state: st }); }, ["p1", "p2", "p3"].map((id) => g.players.find((x) => x.id === id).name));
    await press(group.getByRole("button").nth(1));
    check(JSON.stringify(await calls()) === '[["steal","p2"]]', `${at}: the second seat's button took from p2 ${JSON.stringify(await calls())}`);

    // 5. The discard: 4 of 8. The take-back row stands where the names were, so the tray keeps the my-turn height.
    // The desktop row stacks the picker and the take-backs where the hand was one row: 146 px against 140 px measured.
    const discardGrow = v.width >= 768 && !v.touch ? 6 : 0;
    await load({ phase: "discard", patch: (g) => (g.discardNeeded = { p0: 4 }) });
    const form = page.locator("form.discard-bar");
    await form.waitFor();
    await settle();
    s = await readTray(page);
    at = `${tag} discard`;
    const heights = [s.rect.h];
    check(s.line === "Discard 4: pick 4 more", `${at}: the top line reads "${s.line}"`);
    check(s.lineDot === false, `${at}: no dot before the line (a dot names a seat)`);
    check(!s.handShown, `${at}: the picker stands in for the hand`);
    check(JSON.stringify(s.row.map((b) => [b.name, b.disabled])) === '[["Discard 4",true]]', `${at}: the action row ${JSON.stringify(s.row)}, want "Discard 4", off`);
    const pick = () => form.evaluate((el) => ({
      kept: [...el.querySelectorAll(".discard-pick > button")].map((b) => [b.dataset.testid.slice(8), b.querySelector(".goods-count").textContent, b.disabled, b.getAttribute("aria-label")]),
      back: [...el.querySelectorAll(".discard-back > button")].map((b) => [b.getAttribute("aria-disabled"), b.getAttribute("aria-label"), Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height)]),
      columns: [...el.querySelectorAll(".discard-pick > button")].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; }),
      backs: [...el.querySelectorAll(".discard-back > button")].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; }),
    }));
    let p = await pick();
    check(JSON.stringify(p.kept.map((k) => [k[0], k[1], k[2]])) === '[["timber","3",false],["clay","2",false],["wool","0",true],["grain","2",false],["ore","1",false]]', `${at}: the picker shows what is kept, sheep (none held) disabled ${JSON.stringify(p.kept)}`);
    check(p.kept.every((k) => /^Discard \w+: 0 picked, \d+ kept$/.test(k[3])), `${at}: every column is named in its label ${JSON.stringify(p.kept.map((k) => k[3]))}`);
    check(p.back.length === 5 && p.back.every((b) => b[0] === "true" && /^Keep one more \w+$/.test(b[1]) && b[2] >= 44 && b[3] >= 44), `${at}: five 44 px take-back buttons from the start, all off ${JSON.stringify(p.back)}`);
    check(p.backs.every((b, i) => Math.abs(b[0] + b[1] - p.columns[i][0] - p.columns[i][1]) <= 4), `${at}: each take-back button sits under its column ${JSON.stringify({ columns: p.columns, backs: p.backs })}`);
    common(s, at, { grow: discardGrow });
    await island(at, s);
    // Two wood and a brick by tap, one wood back, then a wheat by keyboard.
    await press(page.getByTestId("discard-timber"));
    await press(page.getByTestId("discard-timber"));
    await press(page.getByTestId("discard-clay"));
    await settle();
    s = await readTray(page);
    heights.push(s.rect.h);
    check(s.line === "Discard 4: pick 1 more", `${at}: after three picks the top line reads "${s.line}"`);
    check(s.tags.timber?.text === "−2" && s.tags.timber.color === GIVE && s.tags.clay?.text === "−1", `${at}: the picked columns are tagged ${JSON.stringify(s.tags)}`);
    p = await pick();
    check(p.kept[0][1] === "1" && p.kept[1][1] === "1" && p.back[0][0] === null && p.back[1][0] === null && p.back[3][0] === "true", `${at}: wood keeps 1, brick keeps 1, their take-backs are on ${JSON.stringify(p)}`);
    await shot("discard");
    await press(page.getByTestId("discard-back-timber"));
    await page.getByTestId("discard-grain").focus();
    await page.keyboard.press("Enter");
    await page.getByTestId("discard-ore").focus();
    await page.keyboard.press("Enter");
    // The button's fill eases over the press duration.
    await page.waitForTimeout(300);
    s = await readTray(page);
    heights.push(s.rect.h);
    check(s.line === "Discard 4: ready", `${at}: at the exact count the top line reads "${s.line}"`);
    check(s.row[0]?.disabled === false && s.row[0]?.bg === INK, `${at}: "Discard 4" is on and primary ${JSON.stringify(s.row)}`);
    p = await pick();
    check(p.kept.map((k) => k[1]).join(",") === "2,1,0,1,0", `${at}: kept after the picks ${JSON.stringify(p.kept)}`);
    check(new Set(heights).size === 1, `${at}: the tray never changes height while picking ${JSON.stringify(heights)}`);
    common(s, at, { grow: discardGrow });
    await shot("discard-ready");
    await press(form.getByRole("button", { name: "Discard 4", exact: true }));
    await page.waitForFunction(() => window.__emberisle.getState().state.phase !== "discard");
    const after = await page.evaluate(() => window.__emberisle.getState().state.players.find((p) => p.id === "p0").resources);
    check(JSON.stringify(after) === JSON.stringify({ timber: 2, clay: 1, wool: 0, grain: 1, ore: 0 }), `${at}: Discard 4 discarded wood, brick, wheat and stone ${JSON.stringify(after)}`);
    console.log(`${tag}: offer, offer I cannot pay, my offer, take from whom and the discard read`);
    await ctx.close();
  }
  check(errors.length === 0, `page errors:\n${errors.join("\n")}`);
  if (failures.length) throw new Error(`${failures.length} check(s) failed`);
  console.log(`tray-offers-prove: ok${SHOTS ? `, pictures in ${SHOT_DIR}` : ""}`);
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
