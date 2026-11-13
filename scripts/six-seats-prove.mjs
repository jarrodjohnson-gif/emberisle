// #1608 six players 5: six-seat identity (docs/design/six-players.md, "Six seats at 440×956" and "Colours and non-colour
// identification"). A five and a six seat game (createExpandedGame, past setup, loaded straight into the page) at 440x956,
// 390x844 and 956x440 (touch, the phone strip) and 1280x720 (the desktop rail):
// - five or six seats, all inside the viewport, none overlapping, each one button at least 44x44 px;
// - each seat shows its number, 1 to n, beside its dot and reads "Seat N" in its accessible name; the numbers stay with
//   their seats after the turn moves and after a rematch-style reorder of the seats;
// - exactly one white pill, on the seat in `current`, also during a partner activation;
// - each seat shows a name that is not empty and is not cut (no ellipsis, no overflow), and no two seats read the same
//   (number and name), also with six names that share an initial and a three-letter start, and with long names;
// - no visible text in a seat is under 12 px;
// - every text reads at least 4.5:1 and every dot's outline at least 3:1 against the real pixels behind it (the seats are
//   hidden, the page captured, and each box checked against every pixel of that capture under it): every colour is read
//   on the sea and, as the turn walks round the table, on the pill;
// - a tap opens that seat's player menu; on a phone its heading shows the seat number and the name;
// - at 1280x600 the rail scrolls inside itself with a menu open, and never reaches the tray;
// - a four-seat classic table's strip (390x844) and rail (1280x720) measure the same boxes and texts as on main
//   (CLASSIC below, measured on origin/main with MEASURE_CLASSIC=1), and show no seat number;
// - zero page errors.
// Every failure is listed before the run fails. SHOTS=1 also writes real-game PNGs at device scale 2 into docs/proofs/1608/
// for 430x932, 390x844, 844x390 and 1280x720, five and six seats. Run: npm run six-seats-prove
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const STEP_MS = 30_000;
const SHOTS = process.env.SHOTS === "1";
const MEASURE_CLASSIC = process.env.MEASURE_CLASSIC === "1";
const SHOT_DIR = "docs/proofs/1608";
const VIEWS = [
  { tag: "440x956", width: 440, height: 956, touch: true, seat: "seat" },
  { tag: "390x844", width: 390, height: 844, touch: true, seat: "seat" },
  { tag: "956x440", width: 956, height: 440, touch: true, seat: "seat" },
  { tag: "1280x720", width: 1280, height: 720, seat: "rail" },
];
const SHOT_VIEWS = [
  { tag: "430x932", width: 430, height: 932, touch: true },
  { tag: "390x844", width: 390, height: 844, touch: true },
  { tag: "844x390", width: 844, height: 390, touch: true },
  { tag: "1280x720", width: 1280, height: 720 },
];
const PILL = "rgb(251, 253, 252)";
const CLEAR = "rgba(0, 0, 0, 0)";
const COLORS = { "#e23d2e": "red", "#2d6ee8": "blue", "#f3ecd9": "white", "#dd6b20": "orange", "#216d3c": "green", "#805532": "brown" };
const SAME_START = ["Ember", "Emberly", "Emma", "Emmett", "Elm", "Eve"];
const LONG = ["Bartholomew the Bold", "Wilhelmina Featherstonehaugh", "Maximilian", "Anastasia Brightwater", "Christopher", "Evangeline"];

// A four-seat classic table on origin/main (b35f6234, Six players 1), measured with MEASURE_CLASSIC=1: each seat's box
// and every visible text in it (text, px size, colour, box), rounded to 0.1 px.
const CLASSIC = {
  "390x844": [
    {"id":"seat-p0","box":[16,12,74.5,44],"texts":[["Ember",13,"rgb(31, 51, 49)",40,18,40.5,16],["2",12,"rgb(51, 71, 68)",39,34,7.8,15],["pts",12,"rgb(51, 71, 68)",46.8,34,20.7,15]],"number":null},
    {"id":"seat-p1","box":[94.5,12,74.5,44],"texts":[["Tide",13,"rgb(31, 51, 49)",124.8,18,27.8,16],["2",12,"rgb(51, 71, 68)",117.5,34,7.8,15],["pts",12,"rgb(51, 71, 68)",125.3,34,20.7,15]],"number":null},
    {"id":"seat-p2","box":[173,12,74.5,44],"texts":[["Dune",13,"rgb(31, 51, 49)",200.8,18,33,16],["2",12,"rgb(51, 71, 68)",196,34,7.8,15],["pts",12,"rgb(51, 71, 68)",203.8,34,20.7,15]],"number":null},
    {"id":"seat-p3","box":[251.5,12,74.5,44],"texts":[["Pine",13,"rgb(31, 51, 49)",282,18,27.4,16],["2",12,"rgb(51, 71, 68)",274.5,34,7.8,15],["pts",12,"rgb(51, 71, 68)",282.3,34,20.7,15]],"number":null},
  ],
  "1280x720": [
    {"id":"rail-p0","box":[12,80,192,50],"texts":[["Ember",15,"rgb(31, 51, 49)",40,86,46.8,19],["\u00b7 you",15,"rgb(31, 51, 49)",86.8,86,39,19],["2",15,"rgb(31, 51, 49)",186.3,86,9.7,19],["3 cards",12,"rgb(51, 71, 68)",20,107,42.5,15],["1",12,"rgb(51, 71, 68)",159.5,107,4.9,15],["0",12,"rgb(51, 71, 68)",186.4,107,7.6,15]],"number":null},
    {"id":"rail-p1","box":[12,134,192,50],"texts":[["Tide (bot)",15,"rgb(31, 51, 49)",40,140,71,19],["2",15,"rgb(31, 51, 49)",186.3,140,9.7,19],["4 cards",12,"rgb(51, 71, 68)",20,161,42.8,15],["1",12,"rgb(51, 71, 68)",159.5,161,4.9,15],["0",12,"rgb(51, 71, 68)",186.4,161,7.6,15]],"number":null},
    {"id":"rail-p2","box":[12,188,192,50],"texts":[["Dune (bot)",15,"rgb(31, 51, 49)",40,194,77,19],["2",15,"rgb(31, 51, 49)",186.3,194,9.7,19],["5 cards",12,"rgb(51, 71, 68)",20,215,42.4,15],["1",12,"rgb(51, 71, 68)",159.5,215,4.9,15],["0",12,"rgb(51, 71, 68)",186.4,215,7.6,15]],"number":null},
    {"id":"rail-p3","box":[12,242,192,50],"texts":[["Pine (bot)",15,"rgb(31, 51, 49)",40,248,70.6,19],["2",15,"rgb(31, 51, 49)",186.3,248,9.7,19],["6 cards",12,"rgb(51, 71, 68)",20,269,42.5,15],["1",12,"rgb(51, 71, 68)",159.5,269,4.9,15],["0",12,"rgb(51, 71, 68)",186.4,269,7.6,15]],"number":null},
  ],
};

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
const contrast = {};
const note = (key, r) => (contrast[key] = Math.min(contrast[key] ?? Infinity, r));

// seat-tray-prove's classic game: a practice game past setup, in `main` for the person (p0).
function classicGame() {
  let g = createGame({ humans: [{ name: "Ember" }], bots: 3, seed: 11 });
  while (g.phase !== "roll") g = applyAction(g, g.current, chooseBotAction(g, g.current)).state;
  g.phase = "main";
  g.current = "p0";
  g.dice = [3, 4];
  // The roll-off and the bots' setup draw on chance: fix the seat order and the hands, so main and here deal the same.
  g.players.sort((a, b) => a.id.localeCompare(b.id));
  g.players.forEach((p, i) => (p.resources = { timber: i, clay: 1, wool: 0, grain: 2, ore: 0 }));
  return g;
}

// Every seat as the page draws it: its box, its button, its ground, its dot and every visible text in it.
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
        const rects = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => { const r = document.createRange(); r.selectNodeContents(n); return r.getBoundingClientRect(); });
        const l = Math.min(...rects.map((r) => r.left)), t = Math.min(...rects.map((r) => r.top)), rgt = Math.max(...rects.map((r) => r.right)), btm = Math.max(...rects.map((r) => r.bottom));
        texts.push({ text, size: parseFloat(ecs.fontSize), color: ecs.color, box: box(new DOMRect(l, t, rgt - l, btm - t)) });
      }
      const dot = card.querySelector("button [aria-hidden='true'].rounded-full");
      const shown = [...card.querySelectorAll("[data-testid='seat-name']")].filter(seen);
      const no = card.querySelector(".seat-no");
      return {
        id: card.dataset.testid,
        pid: card.dataset.testid.replace(/^\w+-/, ""),
        box: box(card.getBoundingClientRect()),
        buttons: buttons.map((b) => ({ ...box(b.getBoundingClientRect()), bg: getComputedStyle(b).backgroundColor, current: b.getAttribute("aria-current") })),
        allButtons: card.querySelectorAll("button").length,
        bg: cs.backgroundColor,
        shadow: cs.boxShadow,
        texts,
        number: no && seen(no) ? [...no.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("") : null,
        // Only the name's own drawn text: a read-out child (sr-only " (bot)") is not part of what shows.
        name: shown.map((n) => [...n.childNodes].map((c) => (c.nodeType === 3 ? c.textContent : seen(c) ? c.textContent : "")).join("")).join("").trim(),
        cut: shown.some((n) => n.scrollWidth > n.clientWidth + 0.5),
        nameWidth: Math.min(...shown.map((n) => n.getBoundingClientRect().width)),
        dot: dot && { box: box(dot.getBoundingClientRect()), ring: getComputedStyle(dot).boxShadow, fill: dot.style.background },
      };
    });
  }, sel);

// The pixels behind the seats: hide their contents, capture the page, and decode it in the page.
const backdrop = async (page, dpr) => {
  await page.addStyleTag({ content: ".seat-card > button > * { visibility: hidden !important; }" }).then((h) => h.evaluate((el) => el.setAttribute("data-six-hide", "")));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const png = (await page.screenshot()).toString("base64");
  await page.evaluate(() => document.querySelector("[data-six-hide]").remove());
  return { png, dpr };
};

// The lowest contrast of a colour against every captured pixel under its box (WCAG relative luminance).
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
          at = `rgb(${data[i]}, ${data[i + 1]}, ${data[i + 2]}) at ${((x0 + (i / 4) % w) / dpr).toFixed(1)},${((y0 + Math.floor(i / 4 / w)) / dpr).toFixed(1)}`;
        }
      }
      return { ratio: worst, behind: at };
    });
  }, { ...shot, items });

const newPage = async (v, dpr) => {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch, deviceScaleFactor: dpr });
  await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
  const page = await ctx.newPage();
  page.setDefaultTimeout(STEP_MS);
  page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${v.tag}: ${m.text()}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0);
  return { ctx, page };
};

// Puts a state on the table as practice does; the other seats stay still, so a turn holds while it is read.
const put = (page, g) =>
  page.evaluate((g) => {
    const e = window.__emberisle;
    if (e.getState().screen !== "play") e.getState().startAi();
    e.setState({ runBots: () => {}, state: g, buildMode: "none", pendingPlace: null, error: null, banner: null, toast: null, menuFor: null });
  }, g);

// A five or six seat game built in the page from expanded.ts, its setup played by the bots, then `main` for p0.
// `names` renames the seats by seat number.
const expanded = (page, seats, names) =>
  page.evaluate(async ({ seats, names }) => {
    const { createExpandedGame } = await import("/src/lib/game/expanded.ts");
    const { applyAction } = await import("/src/lib/game/rules.ts");
    const { chooseBotAction } = await import("/src/lib/game/ai.ts");
    let g = createExpandedGame({ humans: [{ name: "Ember" }], bots: seats - 1, seed: 7 });
    while (g.phase !== "roll") g = applyAction(g, g.current, chooseBotAction(g, g.current)).state;
    Object.assign(g, { phase: "main", dice: [3, 4], current: "p0", primary: "p0", role: "primary" });
    g.players.find((p) => p.id === "p0").resources = { timber: 2, clay: 1, wool: 2, grain: 1, ore: 1 };
    if (names) for (const p of g.players) p.name = names[p.seat - 1] + (p.kind === "bot" ? " (bot)" : "");
    return g;
  }, { seats, names });

const settle = (page) => page.evaluate(async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
  await Promise.all(document.getAnimations().filter((a) => a.effect?.target?.closest?.(".seat-card")).map((a) => a.finished.catch(() => {})));
});
const change = async (page, fn, arg) => {
  await page.evaluate(([src, arg]) => {
    const e = window.__emberisle;
    const st = structuredClone(e.getState().state);
    new Function("st", "arg", src)(st, arg);
    st.seq += 1;
    e.setState({ state: st, menuFor: null });
  }, [fn, arg]);
  await settle(page);
};

// The classic table's measurement: boxes and texts, rounded, for the parity check.
const classicRead = async (page, sel) =>
  (await readSeats(page, sel)).map((s) => ({
    id: s.id,
    box: [s.box.left, s.box.top, s.box.w, s.box.h].map((n) => +n.toFixed(1)),
    texts: s.texts.map((t) => [t.text, t.size, t.color, ...[t.box.left, t.box.top, t.box.w, t.box.h].map((n) => +n.toFixed(1))]),
    number: s.number,
  }));

try {
  // Classic parity: a four-seat classic table measures as it does on main.
  {
    const got = {};
    for (const v of [{ tag: "390x844", width: 390, height: 844, touch: true, seat: "seat" }, { tag: "1280x720", width: 1280, height: 720, seat: "rail" }]) {
      const { ctx, page } = await newPage(v, 1);
      await put(page, classicGame());
      await page.locator(`[data-testid="${v.seat}-p0"]`).waitFor();
      if (!v.touch) await page.mouse.move(v.width / 2, v.height - 4);
      await settle(page);
      await page.waitForTimeout(400);
      got[v.tag] = await classicRead(page, v.seat);
      await ctx.close();
    }
    if (MEASURE_CLASSIC) {
      console.log(JSON.stringify(got));
      process.exit(0);
    }
    for (const [tag, seats] of Object.entries(got)) {
      check(seats.length === 4 && seats.every((s) => s.number === null), `classic ${tag}: four seats and no seat number ${JSON.stringify(seats.map((s) => s.number))}`);
      check(JSON.stringify(seats) === JSON.stringify(CLASSIC[tag]), `classic ${tag}: the seats differ from main\n  main ${JSON.stringify(CLASSIC[tag])}\n  here ${JSON.stringify(seats)}`);
    }
    console.log(`classic: 390x844 strip and 1280x720 rail measure as on main (${got["390x844"].length} + ${got["1280x720"].length} seats), no seat numbers`);
  }

  for (const v of VIEWS) {
    for (const n of [5, 6]) {
      const tag = `${v.tag} ${n} seats`;
      const { ctx, page } = await newPage(v, 1);
      const g = await expanded(page, n);
      await put(page, g);
      await page.locator(`[data-testid="${v.seat}-p0"]`).waitFor();
      if (!v.touch) await page.mouse.move(v.width / 2, v.height - 4);
      await settle(page);
      await page.waitForTimeout(400);
      const seatOf = Object.fromEntries(g.players.map((p) => [p.id, p.seat]));
      const colorOf = Object.fromEntries(g.players.map((p) => [p.id, COLORS[p.color]]));

      // The shape rules, for whoever is on turn.
      const rules = async (turn, at) => {
        const seats = await readSeats(page, v.seat);
        check(seats.length === n, `${at}: ${seats.length} seats, not ${n}`);
        const pills = seats.filter((s) => s.bg !== CLEAR || s.shadow !== "none");
        check(pills.length === 1 && pills[0].pid === turn && pills[0].bg === PILL, `${at}: the pill is on ${JSON.stringify(pills.map((s) => s.id))}, the turn is ${turn}`);
        const labels = new Set();
        seats.forEach((s, i) => {
          check(s.allButtons === 1 && s.buttons.length === 1, `${at}: ${s.id} holds ${s.allButtons} buttons, not one`);
          const b = s.buttons[0];
          if (b) {
            check(b.w >= 44 && b.h >= 44, `${at}: ${s.id} button is ${b.w.toFixed(1)}x${b.h.toFixed(1)}, under 44 px`);
            check((b.current === "true") === (s.pid === turn), `${at}: ${s.id} aria-current ${b.current}`);
          }
          check(s.box.left >= 0 && s.box.top >= 0 && s.box.right <= v.width + 0.01 && s.box.bottom <= v.height + 0.01, `${at}: ${s.id} is off screen ${JSON.stringify(s.box)}`);
          for (const o of seats.slice(i + 1)) {
            const overlap = Math.min(s.box.right, o.box.right) - Math.max(s.box.left, o.box.left) > 0.5 && Math.min(s.box.bottom, o.box.bottom) - Math.max(s.box.top, o.box.top) > 0.5;
            check(!overlap, `${at}: ${s.id} overlaps ${o.id}`);
          }
          check(s.number === String(seatOf[s.pid]), `${at}: ${s.id} shows seat number ${s.number}, its seat is ${seatOf[s.pid]}`);
          // The strip never cuts a name (#1509). The rail's 192 px row ends a long name in an ellipsis, as a classic rail does;
          // it never squeezes a name to nothing.
          if (v.seat === "seat") check(s.name.length > 0 && !s.cut && !/…|\.\.\./.test(s.name), `${at}: ${s.id} name "${s.name}" is empty or cut`);
          else check(s.name.length > 0 && s.nameWidth >= 40, `${at}: ${s.id} name "${s.name}" is squeezed to ${s.nameWidth.toFixed(1)} px`);
          labels.add(`${s.number} ${s.name}`);
          for (const t of s.texts) check(t.size >= 12, `${at}: ${s.id} "${t.text}" is ${t.size}px, under 12 px`);
        });
        check(labels.size === n, `${at}: two seats read the same ${JSON.stringify([...labels])}`);
        check(JSON.stringify(seats.map((s) => +s.number).sort()) === JSON.stringify([1, 2, 3, 4, 5, 6].slice(0, n)), `${at}: numbers ${seats.map((s) => s.number)}`);
        // Accessible names: each seat's button is found by "Seat N".
        for (const s of seats) {
          const count = await page.getByRole("button", { name: new RegExp(`^Seat ${seatOf[s.pid]}(?!\\d)`) }).count();
          const mine = await page.locator(`[data-testid="${s.id}"]`).getByRole("button", { name: new RegExp(`^Seat ${seatOf[s.pid]}(?!\\d)`) }).count();
          check(count === 1 && mine === 1, `${at}: ${count} buttons named "Seat ${seatOf[s.pid]} ...", ${mine} in ${s.id}`);
        }
        return seats;
      };

      // Contrast against the real pixels: every text, and every dot's outline, on its ground.
      const readContrast = async (seats, at, turn) => {
        const items = [];
        for (const s of seats) {
          const ground = s.pid === turn ? "pill" : "sea";
          for (const t of s.texts) items.push({ key: `text on the ${ground}`, label: `${s.id} "${t.text}"`, color: t.color, box: t.box, min: 4.5 });
          const ring = s.dot.ring.match(/rgba?\([^)]*\)/)?.[0];
          check(/1px inset$/.test(s.dot.ring) && ring === "rgb(28, 25, 21)", `${at}: ${s.id} dot outline is ${s.dot.ring}, not 1 px #1c1915`);
          const d = s.dot.box;
          items.push({ key: `${colorOf[s.pid]} dot on the ${ground}`, label: `${s.id} dot`, color: ring ?? "rgb(0,0,0)", box: { left: d.left - 1, top: d.top - 1, w: d.w + 2, h: d.h + 2 }, min: 3 });
        }
        const shot = await backdrop(page, 1);
        const ratios = await contrastOf(page, shot, items);
        ratios.forEach((r, i) => {
          note(`${items[i].key} (${v.seat === "rail" ? "rail" : "strip"})`, r.ratio);
          check(r.ratio >= items[i].min, `${at}: ${items[i].label} ${items[i].color} reads ${r.ratio.toFixed(2)}:1 on ${r.behind}`);
        });
      };

      let seats = await rules("p0", `${tag} p0 on turn`);
      if (v.seat === "rail") check(/^Ember · you/.test(seats.find((s) => s.pid === "p0").name), `${tag}: your rail seat reads ${seats.find((s) => s.pid === "p0").name}`);
      // The turn walks round the table: every colour wears the pill once, and is read on it and on the sea.
      const order = g.players.map((p) => p.id);
      for (const id of order) {
        await change(page, "st.current = arg; st.primary = arg; st.role = 'primary';", id);
        seats = await rules(id, `${tag} ${id} on turn`);
        await readContrast(seats, `${tag} ${id} on turn`, id);
      }
      // A partner activation: the pill is on the partner, the seat in `current`, and only there.
      const partner = order[(order.indexOf("p1") + 3) % n];
      await change(page, "st.primary = 'p1'; st.role = 'partner'; st.current = arg;", partner);
      await rules(partner, `${tag} partner ${partner} for p1`);
      // A rematch-style reorder: the seats come round in a new order, and each number stays with its seat.
      await change(page, "st.players = [...st.players.slice(2), ...st.players.slice(0, 2)].reverse(); st.current = st.players[0].id; st.primary = st.current; st.role = 'primary';");
      const first = await page.evaluate(() => window.__emberisle.getState().state.players[0].id);
      seats = await rules(first, `${tag} after a reorder`);
      check(seats.map((s) => s.pid).join() !== order.join(), `${tag}: the reorder changed nothing`);

      // A tap opens that seat's menu; on a phone its heading names the seat with its number.
      const target = order[order.length - 1];
      const button = page.locator(`[data-testid="${v.seat}-${target}"] > button`);
      if (v.touch) await button.tap();
      else await button.click();
      const menu = page.locator(`#player-menu-${target}`);
      const opened = await menu.waitFor({ timeout: 5000 }).then(() => true, () => false);
      const name = g.players.find((p) => p.id === target).name;
      check(opened && (await menu.getAttribute("aria-label")) === `${name}'s actions`, `${tag}: a tap on ${target} opens its menu`);
      if (opened && v.touch) {
        const heading = (await menu.getByTestId("menu-seat").textContent()).trim();
        check(heading === `Seat ${seatOf[target]}${name}` || heading.replace(/\s+/g, "") === `Seat${seatOf[target]}${name}`.replace(/\s+/g, ""), `${tag}: the menu heading reads "${heading}"`);
        const shown = await menu.getByTestId("menu-seat").locator(".seat-no").evaluate((el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(""));
        check(shown === String(seatOf[target]), `${tag}: the menu heading shows ${shown}, not ${seatOf[target]}`);
      }
      if (opened && !v.touch) {
        const card = await page.locator(`[data-testid="rail-${target}"] .seat-no`).textContent();
        check(card === `Seat ${seatOf[target]}`, `${tag}: the card over the menu reads ${card}`);
      }

      // What a cell shows, for the report.
      if (v.seat === "seat") {
        const cells = await readSeats(page, "seat");
        console.log(`${tag}: cells ${cells[0].box.w.toFixed(1)} px wide: ${cells.map((s) => `[${s.texts.map((t) => t.text).join(" ")}]`).join(" ")}`);
      }

      // Names that share a start, and long names.
      if (v.seat === "seat" || n === 6) {
        for (const [kind, names] of [["same start", SAME_START], ["long names", LONG]]) {
          await put(page, await expanded(page, n, names));
          await settle(page);
          await page.waitForTimeout(100);
          seats = await rules("p0", `${tag} ${kind}`);
          if (v.seat === "seat") console.log(`${tag} ${kind}: ${seats.map((s) => `${s.number} ${s.name}`).join(" | ")}`);
        }
      }
      console.log(`${tag}: ok so far, ${failures.length} failure(s) in all`);
      await ctx.close();
    }
  }

  // The desktop rail at 1280x600 with a menu open: it scrolls inside itself and stops above the tray.
  for (const n of [5, 6]) {
    const v = { tag: "1280x600", width: 1280, height: 600 };
    const { ctx, page } = await newPage(v, 1);
    const g = await expanded(page, n);
    await put(page, g);
    await page.locator('[data-testid="rail-p0"]').waitFor();
    const last = g.players[g.players.length - 1].id;
    await page.locator(`[data-testid="rail-${last}"] > button`).click();
    await page.locator(`#player-menu-${last}`).waitFor();
    await page.mouse.move(100, 120);
    // A wheel over the rail scrolls it; one wheel can land before the menu has settled, so try a few.
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 2000);
      if (await page.waitForFunction(() => document.querySelector("aside").scrollTop > 0, null, { timeout: 1000 }).then(() => true, () => false)) break;
    }
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const aside = document.querySelector("aside");
      const a = aside.getBoundingClientRect();
      const tray = document.querySelector("[data-hud-stack]").getBoundingClientRect();
      const cards = [...aside.querySelectorAll(".seat-card")].map((c) => c.getBoundingClientRect());
      return { bottom: a.bottom, tray: tray.top, trayLeft: tray.left, scroll: aside.scrollTop, overflow: aside.scrollHeight - aside.clientHeight, cardLeft: cards[0].left, cardW: cards[0].width, style: getComputedStyle(aside).overflowY };
    });
    check(m.style === "auto" && m.overflow > 0 && m.scroll > 0, `1280x600 ${n} seats: the rail does not scroll inside itself ${JSON.stringify(m)}`);
    check(m.bottom <= m.tray, `1280x600 ${n} seats: the rail ends at ${m.bottom}, the tray starts at ${m.tray}`);
    check(m.cardLeft === 12 && m.cardW === 192, `1280x600 ${n} seats: cards at ${m.cardLeft}, ${m.cardW} px wide`);
    console.log(`1280x600 ${n} seats: rail ends at ${m.bottom} px, tray starts at ${m.tray} px, scrolled ${m.scroll} of ${m.overflow} px`);
    await ctx.close();
  }

  if (SHOTS) {
    for (const v of SHOT_VIEWS) {
      for (const n of [5, 6]) {
        const { ctx, page } = await newPage(v, 2);
        await put(page, await expanded(page, n));
        await page.locator(`[data-testid="${v.touch ? "seat" : "rail"}-p0"]`).waitFor();
        if (!v.touch) await page.mouse.move(v.width / 2, v.height - 4);
        await settle(page);
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${SHOT_DIR}/seats-${n}-${v.tag}.png` });
        await ctx.close();
      }
    }
  }

  for (const [k, r] of Object.entries(contrast).sort()) console.log(`  lowest ${r.toFixed(2)}:1  ${k}`);
  check(errors.length === 0, `page errors:\n${errors.join("\n")}`);
  if (failures.length) throw new Error(`${failures.length} check(s) failed`);
  console.log(`six-seats-prove: ok${SHOTS ? `, pictures in ${SHOT_DIR}` : ""}`);
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
