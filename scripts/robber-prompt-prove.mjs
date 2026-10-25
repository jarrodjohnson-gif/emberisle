// #1112: after a real 7 the mover sees a dark "Move the wayfarer" line in the status slot; the other seats keep
// "Wait for NAME ..."; it clears when the "Take from whom?" bar opens and after the move; a played Knight shows it too.
// Sizes 390x844, 844x390, 1280x720. Optional screenshots: SHOTS=docs/proofs/1112 node scripts/robber-prompt-prove.mjs
// Run: CHROMIUM_PATH=/usr/bin/chromium node scripts/robber-prompt-prove.mjs (VITE_PORT defaults to 8452).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const port = Number(process.env.VITE_PORT) || 8452;
const shots = process.env.SHOTS;
const vite = await createServer({ server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
let code = 0;

const rgb = (css) => css.match(/[\d.]+/g).slice(0, 3).map(Number);

try {
  for (const [width, height] of [[390, 844], [844, 390], [1280, 720]]) {
    const tag = `${width}x${height}`;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 900, isMobile: width < 900 });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => window.__emberisle);
    await page.evaluate(() => window.__emberisle.getState().startAi());
    await page.waitForFunction(() => window.__isle?.landReady);
    const line = page.getByTestId("turn-banner");
    const moving = () => line.evaluate((el) => el.classList.contains("turn-instruction-move"));
    const clearBanner = () => page.evaluate(() => window.__emberisle.setState({ banner: null }));

    // A real roll: the dice come from crypto.getRandomValues (value % 6 + 1), so 2 then 3 gives 3 and 4.
    await page.evaluate(() => {
      const g = window.__emberisle;
      const s = structuredClone(g.getState().state);
      s.phase = "roll";
      s.current = g.getState().localId;
      s.discardNeeded = {};
      s.dice = null;
      s.seq++;
      g.setState({ state: s, banner: null });
      const real = crypto.getRandomValues.bind(crypto);
      let n = 0;
      crypto.getRandomValues = (buf) => {
        if (n >= 2) return real(buf);
        buf[0] = [2, 3][n++];
        if (n === 2) crypto.getRandomValues = real;
        return buf;
      };
    });
    assert.equal(await moving(), false, `${tag}: no wayfarer prompt before the roll`);
    await page.getByRole("button", { name: "Roll", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle.getState().state.phase === "robber");
    assert.deepEqual(await page.evaluate(() => window.__emberisle.getState().state.dice), [3, 4], `${tag}: the roll was a 7`);
    await clearBanner();

    // The mover: dark, white ink, on screen, over no goods tile, and every legal hex still takes the tap.
    await page.waitForTimeout(800);
    const mover = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="turn-banner"]');
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const hit = (b) => !(b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom);
      const covered = window.__emberisle.getState().highlights().hexes.filter((id) => {
        const p = window.__isle.screenOf(id);
        return p && el.contains(document.elementFromPoint(p.x, p.y));
      });
      return {
        text: el.textContent.trim(), visible: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        bg: cs.backgroundColor, color: cs.color, covered,
        overDock: [...document.querySelectorAll('[data-testid^="resource-"]')].filter((n) => hit(n.getBoundingClientRect())).length,
        pointer: cs.pointerEvents,
      };
    });
    assert.equal(mover.text, "Move the wayfarer", `${tag}: mover's line says Move the wayfarer`);
    assert.equal(mover.visible, true, `${tag}: the line is fully on screen`);
    assert.equal(await moving(), true, `${tag}: the mover's line wears the prompt style`);
    const [r, g, b] = rgb(mover.bg);
    assert.ok(r < 90 && g < 90 && b < 90, `${tag}: dark neutral ground, got ${mover.bg}`);
    assert.deepEqual(rgb(mover.color), [255, 255, 255], `${tag}: white ink`);
    assert.deepEqual(mover.covered, [], `${tag}: the line covers no legal hex`);
    assert.equal(mover.overDock, 0, `${tag}: the line covers no goods tile`);
    if (shots) await page.screenshot({ path: `${shots}/after-${tag}.png` });

    // The other seats keep "Wait for NAME ..." and no prompt.
    const others = await page.evaluate(() => {
      const g = window.__emberisle;
      const s = g.getState();
      g.setState({ localId: s.state.players.find((p) => p.id !== s.localId).id });
      return { mover: s.state.players.find((p) => p.id === s.localId).name };
    });
    await page.waitForTimeout(300);
    assert.equal(await moving(), false, `${tag}: another seat gets no prompt`);
    assert.match(await line.innerText(), new RegExp(`^Wait for ${others.mover} to move the wayfarer$`), `${tag}: another seat waits`);
    await page.evaluate((id) => window.__emberisle.setState({ localId: id }), await page.evaluate(() => window.__emberisle.getState().state.current));
    await page.waitForTimeout(300);
    assert.equal(await moving(), true, `${tag}: back on the mover's seat the prompt returns`);

    // Two victims on one hex: the Take-from bar opens and replaces the prompt.
    const hexId = await page.evaluate(() => {
      const g = window.__emberisle;
      const s = structuredClone(g.getState().state);
      const id = g.getState().highlights().hexes[0];
      const [a, b] = s.players.filter((p) => p.id !== s.current);
      s.vertices.filter((v) => v.hexes.includes(id)).slice(0, 2).forEach((v, i) => (v.building = { playerId: [a, b][i].id, kind: "outpost" }));
      [a, b].forEach((p) => (p.resources.timber = 1));
      s.seq++;
      g.setState({ state: s });
      return id;
    });
    await page.waitForFunction((id) => window.__isle.screenOf(id), hexId);
    const group = page.getByRole("group", { name: "The wayfarer takes a card" });
    for (let attempt = 0; attempt < 6 && !(await group.isVisible()); attempt++) {
      await page.waitForTimeout(400);
      const spot = await page.evaluate((id) => window.__isle.screenOf(id), hexId);
      assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, spot), "CANVAS", `${tag}: the hex tap reaches the canvas`);
      if (width < 900) await page.touchscreen.tap(spot.x, spot.y);
      else await page.mouse.click(spot.x, spot.y);
      if (await page.getByTestId("place-chip").isVisible()) await page.getByTestId("place-chip").click();
    }
    await group.waitFor();
    assert.equal(await moving(), false, `${tag}: the prompt gives way to the Take-from bar`);
    const overlap = await page.evaluate(() => {
      const a = document.querySelector('[data-testid="turn-banner"]').getBoundingClientRect();
      const b = document.querySelector('[aria-label="The wayfarer takes a card"]').getBoundingClientRect();
      return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    });
    assert.equal(overlap, false, `${tag}: the status line and the Take-from bar do not overlap`);
    if (shots) await page.screenshot({ path: `${shots}/take-from-${tag}.png` });

    // After the move the prompt is gone.
    await group.getByRole("button").first().click();
    await page.waitForFunction(() => window.__emberisle.getState().state.phase === "main");
    await clearBanner();
    assert.equal(await moving(), false, `${tag}: no prompt after the move`);
    assert.doesNotMatch(await line.innerText(), /wayfarer/i, `${tag}: the line has moved on`);

    // A played Knight is the other way to move him: the prompt shows while it is armed and goes when it is not.
    await page.evaluate(() => window.__emberisle.getState().setBuildMode("knight"));
    await page.waitForTimeout(300);
    assert.equal(await moving(), true, `${tag}: an armed Knight shows the prompt`);
    await page.evaluate(() => window.__emberisle.getState().setBuildMode("none"));
    await page.waitForTimeout(300);
    assert.equal(await moving(), false, `${tag}: a cancelled Knight clears it`);
    console.log(`ok   ${tag}: mover prompt, others wait, Take-from replaces it, gone after the move, Knight`);
    await context.close();
  }
  assert.deepEqual(errors, [], "no console errors");
  console.log("robber-prompt-prove: PASS");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
