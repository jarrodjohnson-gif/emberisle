// #1544 one tray, slice D: seats without boxes (docs/design/one-tray, "Seats"). In a practice game past setup, at 390x844
// and 844x390 (touch, the phone strip) and 1280x720 (the desktop rail):
// - there are four seats, each one button at least 44x44 px, and every seat lies inside the viewport;
// - no visible text in a seat is under 12 px;
// - every seat has a transparent ground and no box-shadow, except exactly one, the seat on turn: the white pill
//   (#fbfdfc, 14 px radius, the soft 0 2px 10px rgba(14,60,66,0.18) shadow) with aria-current;
// - the pill moves when the turn moves;
// - every visible text in a seat reads at least 4.5:1 against what is really behind it: the seats are hidden, the page is
//   captured, and each text box is checked against every pixel of that capture under it (the sea, the board, or the pill);
// - the phone strip leaves "(bot)" to the player menu; the rail reads "Name · you" on your own seat and the hand in words;
// - the Table menu button (and the chat button, online only, so not here) has no ground;
// - tapping a seat opens its player menu;
// - zero page errors.
// Every failure is listed before the run fails. SHOTS=1 also writes real-game PNGs at device scale 2 into docs/proofs/1544/
// for 430x932, 390x844, 844x390 and 1280x720. Run: npm run seat-tray-prove
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const STEP_MS = 30_000;
const SHOTS = process.env.SHOTS === "1";
const SHOT_DIR = "docs/proofs/1544";
const VIEWS = [
  { tag: "390x844", width: 390, height: 844, touch: true, seat: "seat", full: true },
  { tag: "844x390", width: 844, height: 390, touch: true, seat: "seat", full: true },
  { tag: "1280x720", width: 1280, height: 720, seat: "rail", full: true },
  { tag: "430x932", width: 430, height: 932, touch: true, seat: "seat" },
];
const PILL = "rgb(251, 253, 252)";
const SHADOW = "rgba(14, 60, 66, 0.18) 0px 2px 10px 0px";
const CLEAR = "rgba(0, 0, 0, 0)";

// A practice game past setup, in `main` for the person (p0), with goods and fortunes so the rail's quiet line has words.
function game(current = "p0") {
  let g = createGame({ humans: [{ name: "Ember" }], bots: 3, seed: 11 });
  while (g.phase !== "roll") g = applyAction(g, g.current, chooseBotAction(g, g.current)).state;
  g.phase = "main";
  g.current = current;
  g.dice = [3, 4];
  const [me, a, b] = ["p0", "p1", "p2"].map((id) => g.players.find((p) => p.id === id));
  me.resources = { timber: 2, clay: 1, wool: 2, grain: 1, ore: 1 };
  me.hidden = { ...me.hidden, plenty: 1 };
  a.resources = { timber: 1, clay: 0, wool: 0, grain: 0, ore: 0 };
  b.resources = { timber: 3, clay: 3, wool: 2, grain: 2, ore: 1 };
  b.hidden = { ...b.hidden, knight: 2 };
  return g;
}

if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const PORT = vite.httpServer.address().port;
const { chooseBotAction } = await vite.ssrLoadModule("/src/lib/game/ai.ts");
const { createGame } = await vite.ssrLoadModule("/src/lib/game/board.ts");
const { applyAction } = await vite.ssrLoadModule("/src/lib/game/rules.ts");
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

// Every seat as the page draws it: its box, its buttons, its ground and every visible text in it.
const readSeats = (page, sel) =>
  page.evaluate((sel) => {
    const seen = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest(".sr-only");
    };
    const box = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height });
    return [...document.querySelectorAll(`.seat-card[data-testid^="${sel}-p"]`)].map((card) => {
      const cs = getComputedStyle(card);
      const buttons = [...card.querySelectorAll(":scope > button")];
      const texts = [];
      for (const el of card.querySelectorAll("button *")) {
        const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
        if (!text || !seen(el)) continue;
        const ecs = getComputedStyle(el);
        // The text's own box: a range over its text nodes, so a flex child's empty room is not sampled.
        const range = document.createRange();
        range.selectNodeContents(el);
        texts.push({ text, size: parseFloat(ecs.fontSize), color: ecs.color, box: box(range.getBoundingClientRect()) });
      }
      return {
        id: card.dataset.testid,
        box: box(card.getBoundingClientRect()),
        buttons: buttons.map((b) => ({ ...box(b.getBoundingClientRect()), bg: getComputedStyle(b).backgroundColor, current: b.getAttribute("aria-current") })),
        allButtons: card.querySelectorAll("button").length,
        bg: cs.backgroundColor,
        shadow: cs.boxShadow,
        radius: cs.borderTopLeftRadius,
        texts,
        line: card.querySelector("button").textContent,
      };
    });
  }, sel);

// The pixels behind the seats: hide them, capture the page, and decode the capture in the page.
const backdrop = async (page, dpr) => {
  await page.addStyleTag({ content: ".seat-card > button > * { visibility: hidden !important; }", }).then((h) => h.evaluate((el) => el.setAttribute("data-seat-tray-hide", "")));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const png = (await page.screenshot()).toString("base64");
  await page.evaluate(() => document.querySelector("[data-seat-tray-hide]").remove());
  return { png, dpr };
};

// The lowest contrast of a text colour against every captured pixel under its box (WCAG relative luminance).
const contrastOf = (page, shot, items) =>
  page.evaluate(async ({ png, dpr, items }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const lum = ([r, g, b]) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const parse = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);
    return items.map(({ color, box }) => {
      const L = lum(parse(color));
      const x0 = Math.max(0, Math.floor(box.left * dpr)), y0 = Math.max(0, Math.floor(box.top * dpr));
      const w = Math.max(1, Math.min(c.width - x0, Math.ceil(box.w * dpr))), h = Math.max(1, Math.min(c.height - y0, Math.ceil(box.h * dpr)));
      const data = ctx.getImageData(x0, y0, w, h).data;
      let worst = Infinity, at = null;
      for (let i = 0; i < data.length; i += 4) {
        const B = lum([data[i], data[i + 1], data[i + 2]]);
        const ratio = (Math.max(L, B) + 0.05) / (Math.min(L, B) + 0.05);
        if (ratio < worst) {
          worst = ratio;
          at = `rgb(${data[i]}, ${data[i + 1]}, ${data[i + 2]})`;
        }
      }
      return { ratio: worst, behind: at };
    });
  }, { ...shot, items });

try {
  for (const v of VIEWS) {
    const dpr = SHOTS ? 2 : 1;
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch, deviceScaleFactor: dpr });
    await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
    const page = await ctx.newPage();
    page.setDefaultTimeout(STEP_MS);
    page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`${v.tag}: ${m.text()}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0);
    const tag = v.tag;
    const load = async (current) => {
      const g = game(current);
      await page.evaluate((g) => {
        const e = window.__emberisle;
        if (e.getState().screen !== "play") e.getState().startAi();
        // The other seats stay still, so another seat's turn holds while it is read.
        e.setState({ runBots: () => {}, state: g, buildMode: "none", pendingPlace: null, error: null, banner: null, toast: null, menuFor: null });
      }, g);
      return g;
    };
    // The pill fades in over 200 ms: a read waits for the seats' transitions to end.
    const settle = () => page.evaluate(async () => {
      for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
      await Promise.all(document.getAnimations().filter((a) => a.effect?.target?.closest?.(".seat-card")).map((a) => a.finished.catch(() => {})));
    });
    const g = await load("p0");
    await page.locator(`[data-testid="${v.seat}-p0"]`).waitFor();
    await page.locator("canvas").first().waitFor();
    // The pointer rests off the seats, so no hover ground is read.
    if (!v.touch) await page.mouse.move(v.width / 2, v.height - 4);
    await settle();
    await page.waitForTimeout(400);

    if (SHOTS) await page.screenshot({ path: `${SHOT_DIR}/table-${tag}.png` });
    if (!v.full) {
      console.log(`${tag}: picture only`);
      await ctx.close();
      continue;
    }

    const rules = async (turn, at) => {
      const seats = await readSeats(page, v.seat);
      check(seats.length === 4, `${at}: ${seats.length} seats, not 4`);
      const pills = seats.filter((s) => s.bg !== CLEAR || s.shadow !== "none");
      check(pills.length === 1 && pills[0].id === `${v.seat}-${turn}`, `${at}: the one seat with a ground is ${JSON.stringify(pills.map((s) => s.id))}, the turn is ${turn}`);
      for (const s of seats) {
        const on = s.id === `${v.seat}-${turn}`;
        check(s.allButtons === 1 && s.buttons.length === 1, `${at}: ${s.id} holds ${s.allButtons} buttons, not one`);
        const b = s.buttons[0];
        if (b) {
          check(b.w >= 44 && b.h >= 44, `${at}: ${s.id} button is ${b.w.toFixed(1)}x${b.h.toFixed(1)}, under 44 px`);
          check(b.bg === CLEAR, `${at}: ${s.id} button has a ground ${b.bg}`);
          check((b.current === "true") === on, `${at}: ${s.id} aria-current ${b.current}, on turn ${on}`);
        }
        check(s.box.left >= 0 && s.box.top >= 0 && s.box.right <= v.width && s.box.bottom <= v.height, `${at}: ${s.id} is off screen ${JSON.stringify(s.box)}`);
        if (on) check(s.bg === PILL && s.shadow === SHADOW && s.radius === "14px", `${at}: ${s.id} on turn is not the white pill ${JSON.stringify({ bg: s.bg, shadow: s.shadow, radius: s.radius })}`);
        else check(s.bg === CLEAR && s.shadow === "none", `${at}: ${s.id} has a box ${JSON.stringify({ bg: s.bg, shadow: s.shadow })}`);
        for (const t of s.texts) check(t.size >= 12, `${at}: ${s.id} "${t.text}" is ${t.size}px, under 12 px`);
        if (v.seat === "seat") check(!/\(bot\)/.test(s.line), `${at}: ${s.id} shows "(bot)": ${s.line}`);
      }
      return seats;
    };

    // 1. My turn: the pill on my seat; the size, ground and screen rules.
    let at = `${tag} my turn`;
    const seats = await rules("p0", at);
    if (v.seat === "rail") {
      const mine = seats.find((s) => s.id === "rail-p0");
      check(/^Ember · you/.test(mine.line), `${at}: your rail seat reads ${JSON.stringify(mine.line)}`);
      check(/7 cards·1 fortune/.test(mine.line), `${at}: your rail seat names the hand in words ${JSON.stringify(mine.line)}`);
      const one = seats.find((s) => s.id === "rail-p1");
      check(/1 card(?!s)/.test(one.line) && !/fortune/.test(one.line), `${at}: one card and no fortune reads "1 card" alone ${JSON.stringify(one.line)}`);
      const two = seats.find((s) => s.id === "rail-p2");
      check(/11 cards·2 fortunes/.test(two.line), `${at}: plural forms ${JSON.stringify(two.line)}`);
    }

    // 2. Contrast: every text against the real pixels behind it.
    const items = seats.flatMap((s) => s.texts.map((t) => ({ id: s.id, text: t.text, color: t.color, box: t.box })));
    const shot = await backdrop(page, dpr);
    const ratios = await contrastOf(page, shot, items);
    let lowest = Infinity;
    ratios.forEach((r, i) => {
      lowest = Math.min(lowest, r.ratio);
      check(r.ratio >= 4.5, `${at}: ${items[i].id} "${items[i].text}" ${items[i].color} reads ${r.ratio.toFixed(2)}:1 on ${r.behind}`);
    });

    // 3. The Table menu button: a plain icon on the sea.
    const menuBg = await page.getByRole("button", { name: "Table menu" }).evaluate((b) => ({ bg: getComputedStyle(b).backgroundColor, border: getComputedStyle(b).borderTopWidth, w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height }));
    check(menuBg.bg === CLEAR && menuBg.border === "0px" && menuBg.w >= 44 && menuBg.h >= 44, `${at}: the Table menu button ${JSON.stringify(menuBg)}`);

    // 4. The turn moves: so does the pill.
    await page.evaluate(() => {
      const e = window.__emberisle;
      const st = structuredClone(e.getState().state);
      st.current = "p2";
      st.seq += 1;
      e.setState({ state: st });
    });
    await settle();
    await rules("p2", `${tag} turn moved`);

    // 5. A tap opens the player menu.
    const seat = page.locator(`[data-testid="${v.seat}-p1"] > button`);
    if (v.touch) await seat.tap();
    else await seat.click();
    const menu = page.getByTestId("player-menu");
    const opened = await menu.waitFor({ timeout: 5000 }).then(() => true, () => false);
    check(opened && (await menu.isVisible()), `${tag}: a tap on a seat opens its player menu`);
    const name = g.players.find((p) => p.id === "p1").name;
    if (opened) check((await menu.getAttribute("aria-label")) === `${name}'s actions`, `${tag}: the menu is ${name}'s, got ${await menu.getAttribute("aria-label")}`);

    console.log(`${tag}: four seats, one pill, lowest text contrast ${lowest.toFixed(2)}:1, menu ${opened ? "opens" : "missing"}`);
    await ctx.close();
  }
  check(errors.length === 0, `page errors:\n${errors.join("\n")}`);
  if (failures.length) throw new Error(`${failures.length} check(s) failed`);
  console.log(`seat-tray-prove: ok${SHOTS ? `, pictures in ${SHOT_DIR}` : ""}`);
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
