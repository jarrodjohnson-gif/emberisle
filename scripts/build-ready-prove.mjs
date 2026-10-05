// Jarrod (playtest): "need some sort of indication on when you are eligible for building something. And a quick reference
// card that in-game board comes with." In hotseat at 1280x720, 390x844 (touch, notch insets) and 844x390 (touch, notch
// insets), with the seat on turn in `main` and its hand crafted through window.__emberisle:
// - each build button (Path, Outpost, Stronghold, Fortune) reads ready, short or blocked exactly as rules.ts says for that
//   hand: COST and the hand give the shortfall, legalRoads / legalSettle / legalCities say whether a spot exists, and the
//   piece supply or the deck says "None left"; a ready build wears the dot and is pressable, the others refuse;
// - a build one good short in all dims that chip and hangs a "−1" badge on it, visible with the pointer parked at 0,0 (no
//   hover); 2 or more short shows the plain cost with no red (an empty hand reads quiet); the aria-description names the
//   full shortfall either way;
// - on a phone (390x844, 360x640, 844x390) each build is a two-line 44 px tile, and the bottom stack's content height is
//   at most main's (MAIN_STACK, measured on e61d665 with the same hand) plus 2 px, so the island's hole is no smaller;
// - a build that just became ready pulses once (class build-ready); one with no spot or none left never does, however the
//   hand changes; under reduced motion the pulse has no animation;
// - with Path armed, one Escape on the open Costs card closes the card and leaves Path armed;
// - the Costs card opens from the Table menu: one row per build with the COST chips and the price as text for a screen
//   reader, the POINTS lines, the win line; focus
//   lands on Close, Tab stays inside, it lies inside the safe rect, and Escape closes it with the focus back on the menu button;
// - zero console errors.
// Saves test-results/build-ready-<size>.png and build-ready-card-<size>.png. Run: npm run build-ready-prove (VITE_PORT, default 8509).
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";
import * as types from "../src/lib/game/types.ts";
import { legalCities, legalRoads, legalSettle } from "../src/lib/game/rules.ts";

// A namespace import, so on a main without POINTS the run fails on the table, not at link time.
const { COST, LARGEST_ARMY_MIN, LONGEST_PATH_MIN, POINTS, RESOURCES } = types;
const PORT = Number(process.env.VITE_PORT) || 8509;
const STEP_MS = 30_000;
const VIEWS = [
  { tag: "1280x720", width: 1280, height: 720 },
  { tag: "390x844", width: 390, height: 844, touch: true, insets: { top: 47, right: 0, bottom: 34, left: 0 } },
  { tag: "360x640", width: 360, height: 640, touch: true },
  { tag: "844x390", width: 844, height: 390, touch: true, insets: { top: 0, right: 47, bottom: 21, left: 47 } },
];
// The bottom stack's scrollHeight on main (813022f, 2026-10-05: hotseat, `main`, the "outpost goods, no spot" hand below,
// an outpost of the seat's own, dice 3+4, no fortunes) and the island hole's bottom inset at 390x844 (`__isle.insets()`).
// The build row may not grow past these on a phone; at 1280x720 the 44 px tiles are 8 px taller than main's 32 px buttons,
// which the review accepted (DESKTOP_GROW). When main's stack changes for another reason (a new row, a banner, the hand),
// re-measure these on main with the same fixture and say so in the PR; do not loosen the margin.
const MAIN_STACK = { "1280x720": 208, "390x844": 352, "360x640": 352, "844x390": 316 };
const DESKTOP_GROW = 8;
const MAIN_HOLE_BOTTOM = 398;
const KINDS = Object.keys(COST);
const NAME = { path: "Path", outpost: "Outpost", stronghold: "Stronghold", card: "Fortune" };
const NONE = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
// Hands and supplies to craft; every expectation below is computed from rules.ts on the state the page then holds.
const HANDS = [
  { name: "empty", hand: NONE },
  { name: "one clay short", hand: { ...NONE, timber: 1, wool: 1, grain: 1, ore: 1 } },
  { name: "path only", hand: { ...NONE, timber: 1, clay: 1, ore: 1 } },
  { name: "outpost goods, no spot", hand: { ...NONE, timber: 1, clay: 1, wool: 1, grain: 1 } },
  { name: "stronghold and fortune", hand: { ...NONE, wool: 1, grain: 4, ore: 3 } },
  { name: "rich, no paths left, deck empty", hand: { timber: 5, clay: 5, wool: 5, grain: 5, ore: 5 }, pathsLeft: 0, deckLeft: 0 },
];

// What rules.ts says a build button should read for the seat on turn.
function expected(st) {
  const me = st.players.find((p) => p.id === st.current);
  const left = { path: me.pathsLeft, outpost: me.outpostsLeft, stronghold: me.strongholdsLeft, card: st.deckLeft ?? st.deck.length };
  const spot = {
    path: legalRoads(st, me.id, false).length > 0,
    outpost: legalSettle(st, me.id, false).length > 0,
    stronghold: legalCities(st, me.id).length > 0,
    card: true,
  };
  const out = {};
  for (const k of KINDS) {
    const short = RESOURCES.filter((r) => (COST[k][r] ?? 0) > me.resources[r]).map((r) => [r, COST[k][r] - me.resources[r]]);
    out[k] = left[k] <= 0 ? { state: "blocked", why: "None left" } : short.length ? { state: "short", short } : spot[k] ? { state: "ready" } : { state: "blocked", why: "No spot" };
  }
  return out;
}

mkdirSync("test-results", { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
let code = 0;
try {
  for (const v of VIEWS) {
    for (const reducedMotion of v.tag === "1280x720" ? ["no-preference", "reduce"] : ["no-preference"]) {
      const tag = `${v.tag}${reducedMotion === "reduce" ? " reduced motion" : ""}`;
      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch, reducedMotion });
      const page = await ctx.newPage();
      page.setDefaultTimeout(STEP_MS);
      page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
      page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
      if (v.insets) await (await ctx.newCDPSession(page)).send("Emulation.setSafeAreaInsetsOverride", { insets: v.insets });
      const safe = v.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.waitForFunction(() => window.__emberisle);
      await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
      await page.waitForFunction(() => window.__emberisle.getState().state);
      await page.mouse.move(0, 0);

      // The seat on turn in `main` with an outpost of its own on a three-hex corner (so a path has edges to grow from), the
      // given hand and supply; returns the state the page now holds, for rules.ts to judge.
      const craft = ({ hand, pathsLeft, deckLeft, phase = "main" }) =>
        page.evaluate(({ hand, pathsLeft, deckLeft, phase }) => {
          const g = window.__emberisle;
          const st = structuredClone(g.getState().state);
          const me = st.players.find((p) => p.id === st.current);
          st.phase = phase;
          st.dice = [3, 4];
          me.resources = { ...hand };
          if (pathsLeft !== undefined) me.pathsLeft = pathsLeft;
          if (deckLeft !== undefined) {
            st.deckLeft = deckLeft;
            st.deck = st.deck.slice(0, deckLeft);
          }
          if (!st.vertices.some((x) => x.building?.playerId === me.id)) st.vertices.find((x) => x.hexes.length === 3).building = { playerId: me.id, kind: "outpost" };
          st.seq += 1;
          g.setState({ state: st, buildMode: "none", error: null });
          return st;
        }, { hand, pathsLeft, deckLeft, phase });
      const readRow = () =>
        page.evaluate((KINDS) =>
          Object.fromEntries(
            KINDS.map((k) => {
              const b = document.querySelector(`[data-testid="build-${k}"]`);
              const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
              return [
                k,
                {
                  state: b.dataset.build,
                  disabled: b.getAttribute("aria-disabled") === "true",
                  description: b.getAttribute("aria-description"),
                  text: b.textContent.replace(/\s+/g, " ").trim(),
                  dot: !!b.querySelector(".bg-accent"),
                  pulse: b.classList.contains("build-ready"),
                  animation: getComputedStyle(b).animationName,
                  marks: [...b.querySelectorAll("[data-short]")].map((el) => ({
                    text: el.lastElementChild.textContent.trim(),
                    visible: visible(el.lastElementChild),
                    opacity: Number(getComputedStyle(el.lastElementChild).opacity),
                    hover: el.matches(":hover") || b.matches(":hover"),
                  })),
                  // As far as it shows past the stack, which scrolls on a sideways phone (as hud-safe-area-prove measures).
                  rect: (() => {
                    const r = b.getBoundingClientRect();
                    const s = b.closest(".overflow-y-auto")?.getBoundingClientRect() ?? r;
                    return { height: r.height, left: Math.max(r.left, s.left), top: Math.max(r.top, s.top), right: Math.min(r.right, s.right), bottom: Math.min(r.bottom, s.bottom) };
                  })(),
                },
              ];
            }),
          ), KINDS);

      let shots = 0;
      for (const h of HANDS) {
        const st = await craft(h);
        const want = expected(st);
        await page.getByTestId("build-card").waitFor();
        // Software GL can hold a frame long enough that two crafted hands land in one React commit: wait for the row to show
        // this hand (a wrong expectation still gets the assertions' detail below).
        await page
          .waitForFunction((want) => Object.entries(want).every(([k, w]) => document.querySelector(`[data-testid="build-${k}"]`)?.dataset.build === w.state), want, { timeout: 10_000 })
          .catch(() => {});
        await page.mouse.move(0, 0);
        const row = await readRow();
        for (const k of KINDS) {
          const w = want[k];
          const r = row[k];
          const at = `${tag} · ${h.name} · ${k}`;
          assert.equal(r.state, w.state, `${at}: reads ${r.state} (${r.text}), rules say ${w.state} ${JSON.stringify(w)}`);
          assert.equal(r.disabled, w.state !== "ready", `${at}: aria-disabled`);
          assert.equal(r.dot, w.state === "ready", `${at}: the ready dot`);
          if (w.state === "blocked") {
            assert.match(r.text, new RegExp(w.why), `${at}: says "${w.why}" (${r.text})`);
            assert.equal(r.marks.length, 0, `${at}: no shortfall marks on a blocked build`);
          } else if (w.state === "short") {
            const total = w.short.reduce((a, [, n]) => a + n, 0);
            if (total === 1) {
              assert.deepEqual(r.marks.map((s) => s.text), w.short.map(([, n]) => `−${n}`), `${at}: ${total} short, the chips show the shortfall ${JSON.stringify(r.marks)}`);
              for (const s of r.marks) {
                assert.ok(s.visible && !s.hover, `${at}: the shortfall is on screen with no hover ${JSON.stringify(s)}`);
                assert.equal(s.opacity, 1, `${at}: the "−N" is at full strength`);
              }
            } else assert.equal(r.marks.length, 0, `${at}: ${total} short, no red marks`);
            for (const [res, n] of w.short) assert.match(r.description, new RegExp(`${n} ${res}`), `${at}: aria-description names the shortfall (${r.description})`);
          } else {
            assert.equal(r.marks.length, 0, `${at}: no shortfall on a ready build`);
            assert.match(r.description, /Ready$/, `${at}: aria-description says Ready (${r.description})`);
          }
          // The 44 px touch target (docs/design/polish.md) and the safe area.
          const { rect } = r;
          if (v.touch) assert.ok(rect.height >= 44, `${at}: ${rect.height} px tall`);
          assert.ok(rect.left >= safe.left && rect.right <= v.width - safe.right && rect.top >= safe.top && rect.bottom <= v.height - safe.bottom, `${at}: inside the safe rect ${JSON.stringify(rect)}`);
        }
        // The build row has not grown: the stack's content is no taller than on main, and the island's hole no smaller.
        if (h.name === "outpost goods, no spot") {
          const fit = await page.evaluate(() => ({
            stack: document.querySelector('[data-testid="build-path"]').closest(".overflow-y-auto").scrollHeight,
            holeBottom: window.__isle.insets().bottom,
          }));
          const allow = MAIN_STACK[v.tag] + (v.touch ? 0 : DESKTOP_GROW) + 2;
          assert.ok(fit.stack <= allow, `${tag}: the stack is ${fit.stack} px tall, main's ${MAIN_STACK[v.tag]} (allowed ${allow})`);
          if (v.tag === "390x844") assert.ok(fit.holeBottom <= MAIN_HOLE_BOTTOM + 2, `${tag}: the island hole's bottom inset is ${fit.holeBottom}, main's ${MAIN_HOLE_BOTTOM}`);
          console.log(`${tag}: stack ${fit.stack} px (main ${MAIN_STACK[v.tag]}), hole bottom ${fit.holeBottom}`);
        }
        // A ready build arms on a press, a short or blocked one refuses.
        for (const k of ["path", "outpost", "stronghold"]) {
          const b = page.getByTestId(`build-${k}`);
          // aria-disabled, which Playwright reads as not enabled, is the point: the press itself must refuse.
          if (v.touch) await b.tap({ force: true });
          else await b.click({ force: true });
          const mode = await page.evaluate(() => window.__emberisle.getState().buildMode);
          assert.equal(mode, want[k].state === "ready" ? k : "none", `${tag} · ${h.name}: pressing ${k} (${want[k].state}) armed ${mode}`);
          if (mode !== "none") await page.evaluate(() => window.__emberisle.getState().setBuildMode("none"));
        }
        if (reducedMotion === "no-preference" && shots++ < 2) await page.screenshot({ path: `test-results/build-ready-${v.tag}${shots > 1 ? "-b" : ""}.png` });
      }

      // The pulse: from nothing to a path's goods, the Path button alone gets the build-ready class (polled: animationstart is
      // flaky under software GL); under reduced motion the class is on but no animation runs.
      await craft({ hand: NONE, pathsLeft: 5, deckLeft: 5 });
      await page.waitForFunction(() => document.querySelector('[data-testid="build-path"]').dataset.build === "short");
      await craft({ hand: { ...NONE, timber: 1, clay: 1 }, pathsLeft: 5, deckLeft: 5 });
      await page.waitForFunction(() => document.querySelector('[data-testid="build-path"]').classList.contains("build-ready"));
      const classed = () => page.evaluate(() => ["path", "outpost", "stronghold", "card"].filter((k) => document.querySelector(`[data-testid="build-${k}"]`).classList.contains("build-ready")));
      if (reducedMotion === "reduce") {
        const still = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="build-path"]')).animationName);
        assert.equal(still, "none", `${tag}: the pulse is marked but runs no animation (${still})`);
      } else {
        assert.deepEqual(await classed(), ["path"], `${tag}: only the newly payable Path pulses`);
      }
      await page.waitForFunction(() => !document.querySelector('[data-testid="build-path"]').classList.contains("build-ready"));
      // A roll: the row is not up in the roll phase and the goods come with main; that makes the Path newly payable too.
      await craft({ hand: NONE, pathsLeft: 5, deckLeft: 5, phase: "roll" });
      await page.waitForFunction(() => !document.querySelector('[data-testid="build-path"]') && window.__emberisle.getState().state.phase === "roll");
      await page.waitForTimeout(300);
      await craft({ hand: { ...NONE, timber: 1, clay: 1 }, pathsLeft: 5, deckLeft: 5, phase: "main" });
      await page.waitForFunction(() => document.querySelector('[data-testid="build-path"]').classList.contains("build-ready"));
      await page.waitForFunction(() => !document.querySelector('[data-testid="build-path"]').classList.contains("build-ready"));
      const pulsed = { animation: reducedMotion === "reduce" ? "none" : "build-ready" };
      // From nothing to everything: Path, Stronghold and Fortune become ready and pulse; Outpost, affordable with no spot, does not.
      await craft({ hand: NONE, pathsLeft: 5, deckLeft: 5 });
      await page.waitForFunction(() => document.querySelector('[data-testid="build-path"]').dataset.build === "short");
      await craft({ hand: { timber: 5, clay: 5, wool: 5, grain: 5, ore: 5 }, pathsLeft: 5, deckLeft: 5 });
      await page.waitForFunction(() => document.querySelector('[data-testid="build-path"]').classList.contains("build-ready"));
      const rich = await page.evaluate(() => ({
        outpost: document.querySelector('[data-testid="build-outpost"]').dataset.build,
        classes: ["path", "outpost", "stronghold", "card"].filter((k) => document.querySelector(`[data-testid="build-${k}"]`).classList.contains("build-ready")),
      }));
      assert.equal(rich.outpost, "blocked", `${tag}: Outpost reads No spot with a full hand`);
      assert.deepEqual(rich.classes, ["path", "stronghold", "card"], `${tag}: the ready builds pulse, No spot does not`);
      // The pulse clears on its own (reduced motion has no animationend to clear it).
      await page.waitForFunction(() => !document.querySelector('[data-testid="build-path"]').classList.contains("build-ready"));

      // The Costs card from the Table menu, with Path armed underneath: one Escape closes the card alone.
      await page.evaluate(() => window.__emberisle.getState().setBuildMode("path"));
      const trigger = page.getByRole("button", { name: "Table menu" });
      await trigger.click();
      await page.getByRole("dialog", { name: "Table menu" }).getByRole("button", { name: "Costs" }).click();
      const card = page.getByRole("dialog", { name: "Costs" });
      await card.waitFor();
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Close", `${tag}: focus lands on Close`);
      for (const k of KINDS) {
        const chips = await card.getByTestId(`cost-row-${k}`).evaluate((row) => [...row.querySelectorAll("[data-testid^=cost-]")].map((c) => [c.dataset.testid.split("-")[2], c.textContent.trim()]));
        assert.deepEqual(Object.fromEntries(chips), Object.fromEntries(RESOURCES.filter((r) => COST[k][r]).map((r) => [r, COST[k][r] > 1 ? String(COST[k][r]) : ""])), `${tag}: the ${k} row shows COST.${k} (a chip alone is one)`);
        // What a screen reader gets: the piece and its price as words (the chips are aria-hidden).
        const spoken = await card.getByTestId(`cost-row-${k}`).evaluate((row) => [...row.querySelectorAll(":scope > :not([aria-hidden])")].map((el) => el.textContent.trim()).join(" "));
        assert.equal(spoken, `${NAME[k]} · ${RESOURCES.filter((r) => COST[k][r]).map((r) => `${COST[k][r]} ${r}`).join(", ")}`, `${tag}: the ${k} row reads its price aloud`);
      }
      const worth = await card.getByTestId("worth-row").evaluateAll((rows) => rows.map((r) => [...r.children].map((c) => c.textContent.trim())));
      assert.deepEqual(
        worth,
        [
          ["Outpost", String(POINTS.outpost)],
          ["Stronghold", String(POINTS.stronghold)],
          [`Longest path (${LONGEST_PATH_MIN}+)`, String(POINTS.longestPath)],
          [`Largest army (${LARGEST_ARMY_MIN} wayfarers)`, String(POINTS.largestArmy)],
          ["Points fortune, hidden", String(POINTS.pointsFortune)],
        ],
        `${tag}: the worth lines come from POINTS`,
      );
      assert.match(await card.innerText(), new RegExp(`${POINTS.win} points`), `${tag}: the win line`);
      const box = await card.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, scrolls: el.scrollHeight > el.clientHeight + 1 };
      });
      assert.ok(box.left >= safe.left && box.right <= v.width - safe.right && box.top >= safe.top && box.bottom <= v.height - safe.bottom, `${tag}: the card is inside the safe rect ${JSON.stringify(box)}`);
      assert.ok(!box.scrolls, `${tag}: the card fits without scrolling`);
      await page.keyboard.press("Tab");
      assert.ok(await card.evaluate((el) => el.contains(document.activeElement)), `${tag}: Tab stays inside the card`);
      if (reducedMotion === "no-preference") await page.screenshot({ path: `test-results/build-ready-card-${v.tag}.png` });
      await page.keyboard.press("Escape");
      await card.waitFor({ state: "detached" });
      assert.ok(await trigger.evaluate((el) => document.activeElement === el), `${tag}: Escape returns the focus to the menu button`);
      assert.equal(await page.evaluate(() => window.__emberisle.getState().buildMode), "path", `${tag}: one Escape closed the card and left Path armed`);
      await page.evaluate(() => window.__emberisle.getState().setBuildMode("none"));
      console.log(`${tag}: ${HANDS.length} hands read as rules.ts says; shortfall chips visible without hover; pulse ${pulsed.animation}; Costs card opens, fits, traps focus, closes on Escape`);
      await ctx.close();
    }
  }
  assert.deepEqual(errors, [], "console errors");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
