// #829: the "My fortunes" cue. In hotseat at 390x844 and 1280x720:
// - holding a playable fortune reads "Play fortune · N" (N held, no count badge); none playable (bought this turn, already
//   played) reads "Fortunes · N" with no glow; points never count as playable;
// - the soft glow runs once when the turn starts, and a later state change in the same turn neither restarts nor replaces it;
// - the next turn glows again;
// - under reduced motion nothing animates and a still outline marks the button instead.
// Zero console errors. Saves docs/design/829-fortune-cue/<size>.png when SHOTS=1. Run: npm run fortune-cue-prove
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8424;
const STEP_MS = 15_000;
const VIEWS = [
  { tag: "1280x720", width: 1280, height: 720 },
  { tag: "390x844", width: 390, height: 844, touch: true },
];

if (process.env.SHOTS) mkdirSync("docs/design/829-fortune-cue", { recursive: true });
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
    for (const reduced of [false, true]) {
      const tag = `${v.tag}${reduced ? " reduced" : ""}`;
      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch, reducedMotion: reduced ? "reduce" : "no-preference" });
      const page = await ctx.newPage();
      page.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
      page.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
      page.on("response", (r) => r.status() >= 400 && errors.push(`${tag}: ${r.status()} ${r.url()}`));
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.waitForFunction(() => window.__emberisle);
      await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
      await page.waitForFunction(() => window.__emberisle.getState().state);

      // Set the current seat's fortunes; `newTurn` moves the turn counter on (enough to remount the cue).
      const craft = ({ hidden, bought = {}, newTurn = false, ore = 2, phase = "main", playedCard = false }) =>
        page.evaluate(({ hidden, bought, newTurn, ore, phase, playedCard }) => {
          const g = window.__emberisle;
          const st = structuredClone(g.getState().state);
          const me = st.players.find((p) => p.id === st.current);
          st.phase = phase;
          st.playedCard = playedCard;
          st.dice = [3, 4];
          if (newTurn) st.turn += 1;
          me.resources = { timber: 2, clay: 2, wool: 2, grain: 2, ore };
          me.hidden = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0, ...hidden };
          me.boughtThisTurn = { knight: 0, road: 0, plenty: 0, monopoly: 0, vp: 0, ...bought };
          st.seq += 1;
          g.setState({ state: st, buildMode: "none", roadPicks: [], pendingSteal: null, pendingPlace: null, error: null });
        }, { hidden, bought, newTurn, ore, phase, playedCard });
      const button = page.getByTestId("fortunes-button");
      const glow = page.getByTestId("fortune-cue-glow");
      const label = async () => (await button.textContent()).trim();
      const noBadge = () => button.evaluate((el) => ({ attr: el.dataset.playable ?? null, content: getComputedStyle(el, "::after").content }));
      const mark = () => glow.evaluate(async (el) => { el.__cue = (el.__cue ?? 0) + 1; await Promise.all(el.getAnimations().map((a) => a.ready)); return el.getAnimations().map((a) => a.startTime); });
      const marked = () => glow.evaluate((el) => ({ cue: el.__cue ?? 0, starts: el.getAnimations().map((a) => a.startTime) }));

      // Held and playable: badge with the playable count (points held but not counted).
      await craft({ hidden: { knight: 1, plenty: 1, vp: 1 } });
      await button.waitFor({ timeout: STEP_MS });
      await glow.waitFor({ timeout: STEP_MS });
      let b = await noBadge();
      assert.deepEqual(b, { attr: null, content: "none" }, `${tag}: no count badge, got ${JSON.stringify(b)}`);
      assert.equal(await label(), "Play fortune · 3", `${tag}: a playable fortune reads Play fortune with the number held`);
      assert.equal(await button.getAttribute("aria-label"), "Play fortune, 3 held");
      if (process.env.SHOTS && !reduced) await page.screenshot({ path: `docs/design/829-fortune-cue/${v.tag}.png` });

      const cue = await glow.evaluate((el) => ({ name: getComputedStyle(el).animationName, iter: getComputedStyle(el).animationIterationCount, shadow: getComputedStyle(el).boxShadow, anims: el.getAnimations().length }));
      if (reduced) {
        assert.equal(cue.name, "none", `${tag}: no animation under reduced motion`);
        assert.equal(cue.anims, 0, `${tag}: nothing runs under reduced motion`);
        assert.notEqual(cue.shadow, "none", `${tag}: a still outline marks the button instead`);
      } else {
        assert.equal(cue.name, "fortune-cue-glow", `${tag}: the glow runs at turn start`);
        assert.equal(cue.iter, "1", `${tag}: the glow runs once`);
        assert.equal(cue.anims, 1, `${tag}: one animation on the ring`);
        const before = await mark();
        // A later state change in the same turn (goods, a seq bump, a fortune used) leaves the same ring and the same animation.
        await craft({ hidden: { knight: 1, plenty: 1, vp: 1 }, ore: 4 });
        await page.waitForTimeout(300);
        await craft({ hidden: { knight: 1, vp: 1 }, ore: 1 });
        assert.equal(await label(), "Play fortune · 2", `${tag}: the held count follows a played fortune`);
        const after = await marked();
        assert.equal(after.cue, 1, `${tag}: the ring was replaced by a state change`);
        assert.deepEqual(after.starts, before, `${tag}: the animation restarted on a state change`);
        // A phase change in the same turn (roll to main, a 7's robber and back) remounts the button; the glow must not replay.
        for (const phase of ["roll", "main", "robber", "discard", "main"]) {
          await craft({ hidden: { knight: 1, vp: 1 }, phase });
          await page.waitForTimeout(150);
          if (await button.count()) {
            const now = await glow.evaluate((el) => el.getAnimations().map((a) => a.startTime));
            assert.ok(now.every((t) => before.includes(t)), `${tag}: the glow replayed on ${phase}: ${JSON.stringify(now)} vs ${JSON.stringify(before)}`);
          }
        }
      }

      // Bought this turn: no badge, no glow, and the bought one is not counted.
      await craft({ hidden: { knight: 1 }, bought: { knight: 1 }, newTurn: true });
      await button.waitFor({ timeout: STEP_MS });
      assert.equal(await label(), "Fortunes · 1", `${tag}: a fortune bought this turn reads Fortunes`);
      assert.equal(await button.getAttribute("aria-label"), "Fortunes, 1 held");
      assert.equal(await glow.count(), 0, `${tag}: no glow for a fortune bought this turn`);
            // A fortune already played this turn: nothing more can be played, so no badge and no ring.
      await craft({ hidden: { knight: 1, plenty: 1 }, playedCard: true });
      await button.waitFor({ timeout: STEP_MS });
      assert.equal(await label(), "Fortunes · 2", `${tag}: a fortune already played this turn reads Fortunes`);
      assert.equal(await glow.count(), 0, `${tag}: no ring once a fortune was played this turn`);
      await craft({ hidden: { knight: 2, vp: 1 }, bought: { knight: 1, vp: 1 } });
      assert.equal(await label(), "Play fortune · 3", `${tag}: one held since before is playable, label keeps the held count`);

      if (!reduced) {
        // The next turn glows again, on a new ring.
        await craft({ hidden: { knight: 1 }, newTurn: true });
        await glow.waitFor({ timeout: STEP_MS });
        const next = await marked();
        assert.equal(next.cue, 0, `${tag}: a new turn gets a new ring`);
        assert.equal(next.starts.length, 1, `${tag}: and it glows`);
      }
      // An empty hand has no button, so no cue.
      const held = await button.boundingBox(); await craft({ hidden: {} });
      if (v.touch) { await glow.waitFor({ state: "detached", timeout: STEP_MS }); assert.equal(await button.getAttribute("aria-disabled"), "true", `${tag}: an empty hand greys the dock's Fortunes button`); assert.equal(await label(), "Fortunes · 0", `${tag}: and it reads Fortunes · 0`); assert.deepEqual(await button.boundingBox(), held, `${tag}: in the same box`); } else await button.waitFor({ state: "detached", timeout: STEP_MS });
      console.log(`ok ${tag}`);
      await ctx.close();
    }
  }
  assert.deepEqual(errors, [], `console errors: ${errors.join("; ")}`);
  console.log("fortune-cue-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
