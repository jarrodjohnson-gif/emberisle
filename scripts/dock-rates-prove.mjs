// #538: dock inspection and owned hand rates use real pointer and keyboard input without changing game state.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8448;
const STEP_MS = 20_000;
const VIEWS = [
  { tag: "desktop", width: 1280, height: 720, touch: false, motion: "no-preference" },
  { tag: "portrait", width: 390, height: 844, touch: true, motion: "no-preference" },
  { tag: "landscape-reduced", width: 844, height: 390, touch: true, motion: "reduce" },
];
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
let browser;
let code = 0;

const stateSnapshot = (page) => page.evaluate(() => JSON.stringify(window.__emberisle.getState().state));
const text = (value) => value.replace(/\s+/g, " ").trim();

async function fixture(page, ownership) {
  return page.evaluate((ownership) => {
    const api = window.__emberisle;
    const s = api.getState();
    const st = structuredClone(s.state);
    const me = st.players.find((p) => p.id === s.localId);
    const other = st.players.find((p) => p.id !== me.id);
    st.current = me.id;
    st.phase = "main";
    st.rollOff = null;
    st.winner = null;
    st.trade = null;
    st.discardNeeded = {};
    for (const p of st.players) {
      p.kind = "human";
      p.pathsLeft = 15;
      p.outpostsLeft = 5;
      p.strongholdsLeft = 4;
      p.resources = { timber: 6, clay: 6, wool: 6, grain: 6, ore: 6 };
    }
    for (const v of st.vertices) v.building = null;
    for (const e of st.edges) e.path = null;
    // An inland outpost gives the placement check legal path targets regardless of dock ownership.
    const inland = st.vertices.find((v) => !v.harbor);
    inland.building = { playerId: me.id, kind: "outpost" };
    const generic = st.vertices.find((v) => v.harbor === "any");
    const timber = st.vertices.find((v) => v.harbor === "timber");
    if (!generic || !timber) throw new Error("fixture requires generic and timber docks");
    generic.building = { playerId: ownership.generic ? me.id : other.id, kind: "outpost" };
    timber.building = { playerId: ownership.timber ? me.id : other.id, kind: "stronghold" };
    st.seq += 1;
    api.setState({ state: st, mode: "ai", buildMode: "none", pendingPlace: null, pendingSteal: null, tradeOpen: false, offer: null, error: null });
    return { generic: generic.id, timber: timber.id, me: me.id };
  }, ownership);
}

async function targets(page, tag) {
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="dock-rate-target"]').length === 9, null, { timeout: STEP_MS });
  const boxes = await page.getByTestId("dock-rate-target").evaluateAll((nodes) => nodes.map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.dataset.dock, kind: el.dataset.kind, tag: el.tagName, label: el.getAttribute("aria-label"),
      x: r.x, y: r.y, width: r.width, height: r.height,
      visible: getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none",
      inside: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
  }));
  assert.equal(new Set(boxes.map((b) => b.id)).size, 9, `${tag}: every dock has its own target`);
  assert.ok(boxes.every((b) => b.id && b.label && b.tag === "BUTTON" && b.width >= 44 && b.height >= 44 && b.visible && b.inside), `${tag}: nine named 44px dock buttons fit the viewport: ${JSON.stringify(boxes)}`);
  assert.equal(boxes.filter((b) => b.kind === "any").length, 4, `${tag}: four generic docks`);
  for (const kind of ["timber", "clay", "wool", "grain", "ore"]) assert.equal(boxes.filter((b) => b.kind === kind).length, 1, `${tag}: one ${kind} dock`);
  return boxes;
}

async function tapDock(page, kind) {
  const box = await page.locator(`[data-testid="dock-rate-target"][data-kind="${kind}"]`).first().boundingBox();
  assert.ok(box, `${kind}: projected dock target exists`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function inspectDock(page, kind, tag) {
  const button = page.locator(`[data-testid="dock-rate-target"][data-kind="${kind}"]`).first();
  await button.scrollIntoViewIfNeeded();
  // Native input reaches the canvas; keyboard and assistive activation use the transparent dock buttons.
  await page.evaluate((kind) => {
    window.__dockLatency = null;
    window.__dockStarted = null;
    window.__dockObserver?.disconnect();
    const wanted = kind === "any" ? "3:1 any goods" : `2:1 ${{ timber: "wood", clay: "brick", wool: "sheep", grain: "wheat", ore: "stone" }[kind]}`;
    const check = () => {
      const el = document.querySelector('[data-testid="dock-rate-label"]');
      const label = el?.cloneNode(true);
      label?.querySelectorAll('svg, [aria-hidden="true"]').forEach((icon) => icon.remove());
      if (window.__dockStarted !== null && label?.textContent.replace(/\s+/g, " ").trim() === wanted) {
        window.__dockLatency = performance.now() - window.__dockStarted;
        window.__dockObserver.disconnect();
      }
    };
    window.__dockObserver = new MutationObserver(check);
    window.__dockObserver.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    document.addEventListener("pointerup", (event) => {
      if (event.target instanceof HTMLCanvasElement) window.__dockStarted = performance.now();
    }, { capture: true, once: true });
  }, kind);
  await tapDock(page, kind);
  await page.waitForFunction(() => window.__dockLatency !== null, null, { timeout: STEP_MS });
  const result = await page.getByTestId("dock-rate-label").evaluate((el) => {
    const label = el.cloneNode(true);
    label.querySelectorAll('svg, [aria-hidden="true"]').forEach((icon) => icon.remove());
    return { role: el.getAttribute("role"), icon: !!el.querySelector('svg, [aria-hidden="true"]'), value: label.textContent, latency: window.__dockLatency };
  });
  assert.equal(result.role, "status", `${tag}: dock label is announced politely`);
  assert.equal(result.icon, true, `${tag}: dock label includes an icon`);
  assert.equal(text(result.value), kind === "any" ? "3:1 any goods" : `2:1 ${{ timber: "wood", clay: "brick", wool: "sheep", grain: "wheat", ore: "stone" }[kind]}`, `${tag}: exact dock rate and good`);
  assert.ok(result.latency < 300, `${tag}: dock label appears within 300ms (${result.latency.toFixed(1)}ms)`);
  await page.keyboard.press("Escape");
  return result.latency;
}

async function expectRates(page, expected, tag) {
  await page.waitForFunction((expected) => document.querySelector('[data-testid="hand-rates"]')?.textContent.replace(/\s+/g, " ").trim() === expected, expected, { timeout: STEP_MS });
  const hint = await page.getByTestId("hand-rates").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { font: getComputedStyle(el).fontSize, portal: !el.closest('[data-testid="hand-dock"]'),
      inside: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
  });
  assert.equal(hint.font, "16px", `${tag}: rate hint uses 16px text`);
  assert.equal(hint.portal, true, `${tag}: hint escapes the clipped hand through a portal`);
  assert.equal(hint.inside, true, `${tag}: rate hint fits the viewport`);
}

async function proveDockPan(page, touch, tag) {
  const beforeGame = await stateSnapshot(page);
  const origin = await page.getByTestId("dock-rate-target").evaluateAll((nodes) => nodes.map((node) => {
    const r = node.getBoundingClientRect();
    return { x: r.x + 22, y: r.y + 22 };
  }).filter((p) => document.elementFromPoint(p.x, p.y) instanceof HTMLCanvasElement)
    .sort((a, b) => Math.hypot(a.x - innerWidth / 2, a.y - innerHeight / 2) - Math.hypot(b.x - innerWidth / 2, b.y - innerHeight / 2))[0]);
  assert.ok(origin, `${tag}: dock pointer input reaches the canvas`);
  const camera = () => page.evaluate(() => window.__isle.orbit.target.toArray());
  const before = await camera();
  const dx = origin.x < 150 ? 35 : -35;
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    const offset = origin.x < 150 ? 50 : -50;
    const points = (step) => [{ id: 1, x: origin.x + dx * step / 6, y: origin.y }, { id: 2, x: origin.x + offset + dx * step / 6, y: origin.y }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(0) });
    for (let step = 1; step <= 6; step++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(step) });
      await page.waitForTimeout(30);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(origin.x + dx, origin.y, { steps: 6 });
    await page.mouse.up({ button: "right" });
  }
  await page.waitForFunction((before) => window.__isle.orbit.target.toArray().some((v, i) => Math.abs(v - before[i]) > 0.001), before, { timeout: STEP_MS });
  assert.notDeepEqual(await camera(), before, `${tag}: a pan starting on a dock moves the camera`);
  assert.equal(await page.getByTestId("dock-rate-label").count(), 0, `${tag}: a dock drag does not inspect`);
  assert.equal(await stateSnapshot(page), beforeGame, `${tag}: a dock drag preserves the game`);
  await page.evaluate(() => window.__isle.goHome());
  await page.waitForFunction(() => !window.__isle.glide && !window.__isle.refitDue, null, { timeout: STEP_MS });
}

async function proveHand(page, touch, tag) {
  const card = page.getByTestId("resource-timber");
  const initial = await stateSnapshot(page);
  assert.equal(await card.getAttribute("role"), "button", `${tag}: goods card is keyboard-operable`);
  await card.focus();
  assert.equal(await card.evaluate((el) => el === document.activeElement), true, `${tag}: goods card accepts focus`);
  await page.keyboard.press("Enter");
  await expectRates(page, "Bank 4:1", tag);
  await page.keyboard.press("Escape");
  await page.getByTestId("hand-rates").waitFor({ state: "detached", timeout: STEP_MS });

  await card.evaluate((el) => el.click());
  await expectRates(page, "Bank 4:1", `${tag} synthesized click`);
  await page.keyboard.press("Escape");
  await page.getByTestId("hand-rates").waitFor({ state: "detached", timeout: STEP_MS });

  await card.click({ button: "right" });
  await expectRates(page, "Bank 4:1", tag);
  assert.equal(await stateSnapshot(page), initial, `${tag}: Enter, Escape, and contextmenu preserve every game field`);
  await fixture(page, { generic: true, timber: false });
  await expectRates(page, "Bank 4:1 · Dock 3:1", `${tag} live generic ownership`);
  await fixture(page, { generic: true, timber: true });
  await expectRates(page, "Bank 4:1 · Dock 3:1 · Wood dock 2:1", `${tag} live specific ownership`);
  await fixture(page, { generic: false, timber: true });
  await expectRates(page, "Bank 4:1 · Wood dock 2:1", `${tag} lost generic dock`);
  await fixture(page, { generic: false, timber: false });
  await expectRates(page, "Bank 4:1", `${tag} lost all docks`);
  // An actual pointer press outside the portal must dismiss it without needing a second action.
  await page.mouse.click(2, 2);
  await page.getByTestId("hand-rates").waitFor({ state: "detached", timeout: STEP_MS });

  const before = await stateSnapshot(page);
  const box = await card.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (touch) {
    const input = await page.context().newCDPSession(page);
    await input.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await page.waitForTimeout(550);
    await expectRates(page, "Bank 4:1", `${tag} touch hold`);
    await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await input.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(550);
    await expectRates(page, "Bank 4:1", `${tag} pointer hold`);
    await page.mouse.up();
  }
  await page.keyboard.press("Escape");
  await page.getByTestId("hand-rates").waitFor({ state: "detached", timeout: STEP_MS });
  assert.equal(await stateSnapshot(page), before, `${tag}: hand inspection preserves seq, resources, bank, and every game field`);
}

async function proveHintLifecycle(page, tag) {
  const card = page.getByTestId("resource-timber");
  const before = await stateSnapshot(page);
  await card.evaluate((el) => el.click());
  await expectRates(page, "Bank 4:1", `${tag} before arming`);
  await page.evaluate(() => window.__emberisle.getState().setBuildMode("path"));
  await page.getByTestId("hand-rates").waitFor({ state: "detached", timeout: STEP_MS });
  await card.focus();
  await page.keyboard.press("Enter");
  await card.evaluate((el) => el.click());
  await card.click({ button: "right" });
  await page.waitForTimeout(100);
  assert.equal(await page.getByTestId("hand-rates").count(), 0, `${tag}: armed placement suppresses keyboard, synthesized click, and contextmenu hints`);
  assert.equal(await page.evaluate(() => window.__emberisle.getState().buildMode), "path", `${tag}: suppressed inspection leaves the armed build intact`);
  await page.evaluate(() => window.__emberisle.getState().setBuildMode("none"));
  await page.waitForTimeout(100);
  assert.equal(await page.getByTestId("hand-rates").count(), 0, `${tag}: disarming does not revive the canceled hint`);

  // Begin a real hold, then arm placement before its 500ms timer can fire.
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.evaluate(() => window.__emberisle.getState().setBuildMode("path"));
  await page.waitForTimeout(550);
  assert.equal(await page.getByTestId("hand-rates").count(), 0, `${tag}: arming cancels a pending hold hint`);
  await page.mouse.up();
  await page.evaluate(() => window.__emberisle.getState().setBuildMode("none"));

  await page.mouse.down();
  await page.evaluate(() => window.__emberisle.getState().setBuildMode("path"));
  await page.waitForTimeout(50);
  await page.evaluate(() => window.__emberisle.getState().setBuildMode("none"));
  await page.waitForTimeout(550);
  assert.equal(await page.getByTestId("hand-rates").count(), 0, `${tag}: a canceled hold does not revive after rapid arm/disarm`);
  await page.mouse.up();

  await card.evaluate((el) => el.click());
  await expectRates(page, "Bank 4:1", `${tag} before owner switch`);
  const owner = await page.evaluate(() => {
    const api = window.__emberisle;
    const s = api.getState();
    const owner = s.localId;
    api.setState({ localId: s.state.players.find((p) => p.id !== owner).id });
    return owner;
  });
  await page.getByTestId("hand-rates").waitFor({ state: "detached", timeout: STEP_MS });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate((localId) => window.__emberisle.setState({ localId }), owner);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.getByTestId("hand-rates").count(), 0, `${tag}: returning to the original hand never revives its dismissed hint`);
  assert.equal(await stateSnapshot(page), before, `${tag}: hint lifecycle preserves every game field`);
}

async function provePlacement(page, tag) {
  await page.evaluate(() => window.__emberisle.getState().setBuildMode("path"));
  await page.waitForFunction(() => ![...document.querySelectorAll('[data-testid="dock-rate-target"]')].some((el) => {
    const r = el.getBoundingClientRect();
    return r.width && r.height && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none";
  }), null, { timeout: STEP_MS });
  const legal = await page.evaluate(() => {
    const s = window.__emberisle.getState();
    return s.highlights().edges.map((id) => {
      const p = window.__isle.screenOf(id);
      const hit = p && document.elementFromPoint(p.x, p.y);
      return { id, p, canvas: hit?.tagName === "CANVAS" };
    });
  });
  assert.ok(legal.length > 0, `${tag}: fixture has legal path placements`);
  assert.ok(legal.every((p) => p.canvas), `${tag}: every legal path remains pointer-reachable while armed: ${JSON.stringify(legal)}`);
  await page.evaluate(() => window.__emberisle.getState().setBuildMode("none"));
  await targets(page, `${tag} disarmed`);
}

try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) });
  for (const view of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height }, hasTouch: view.touch, isMobile: view.touch, reducedMotion: view.motion });
    const page = await ctx.newPage();
    page.setDefaultTimeout(STEP_MS);
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
    await page.addInitScript(() => {
      localStorage.setItem("emberisle-name", "Dock proof");
      localStorage.setItem("emberisle-water", "simple");
    });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state, null, { timeout: STEP_MS });
    await fixture(page, { generic: false, timber: false });
    const initial = await targets(page, view.tag);
    const before = await stateSnapshot(page);
    const latencies = [await inspectDock(page, "any", view.tag), await inspectDock(page, "timber", view.tag)];
    assert.equal(await stateSnapshot(page), before, `${view.tag}: coast inspection preserves seq, resources, bank, and every game field`);
    await proveDockPan(page, view.touch, view.tag);
    const accessible = page.locator('[data-testid="dock-rate-target"][data-kind="timber"]');
    assert.equal(await accessible.evaluate((el) => getComputedStyle(el).opacity), "0", `${view.tag}: unfocused dock target is visually hidden`);
    await page.keyboard.press("Tab");
    await accessible.focus();
    assert.equal(await accessible.evaluate((el) => el.matches(":focus-visible") && getComputedStyle(el).opacity === "1" && getComputedStyle(el).borderColor !== "rgba(0, 0, 0, 0)"), true, `${view.tag}: keyboard focus shows the dock outline`);
    await page.keyboard.press("Enter");
    await page.getByTestId("dock-rate-label").waitFor();
    await page.keyboard.press("Escape");
    await proveHand(page, view.touch, view.tag);
    assert.equal(await accessible.evaluate((el) => getComputedStyle(el).opacity), "0", `${view.tag}: dock outline hides after focus leaves`);
    await proveHintLifecycle(page, view.tag);
    await provePlacement(page, view.tag);

    await fixture(page, { generic: true, timber: true });
    await tapDock(page, "timber");
    await page.getByTestId("dock-rate-label").waitFor();
    await page.getByTestId("resource-timber").focus();
    await page.keyboard.press("Enter");
    await expectRates(page, "Bank 4:1 · Dock 3:1 · Wood dock 2:1", `${view.tag} screenshot`);
    await page.screenshot({ path: fileURLToPath(new URL(`../../dock-rates-${view.tag}.png`, import.meta.url)) });
    await page.keyboard.press("Escape");

    const oldPositions = await targets(page, `${view.tag} before resize`);
    await page.setViewportSize({ width: view.width - 20, height: view.height - 20 });
    await page.waitForFunction((old) => [...document.querySelectorAll('[data-testid="dock-rate-target"]')].some((el) => {
      const r = el.getBoundingClientRect();
      const was = old.find((p) => p.id === el.dataset.dock);
      return was && Math.hypot(r.x - was.x, r.y - was.y) > 1;
    }), oldPositions, { timeout: STEP_MS });
    const resized = await targets(page, `${view.tag} resized`);
    assert.deepEqual(resized.map((p) => p.id).sort(), initial.map((p) => p.id).sort(), `${view.tag}: resize preserves dock identities`);
    await inspectDock(page, "timber", `${view.tag} resized`);
    await page.evaluate(() => window.__emberisle.setState({ viewChoice: "diorama" }));
    await page.waitForFunction(() => window.__emberisle.getState().playView === "diorama", null, { timeout: STEP_MS });
    await targets(page, `${view.tag} diorama`);
    await inspectDock(page, "any", `${view.tag} diorama`);
    await page.evaluate(() => window.__emberisle.setState({ viewChoice: "overhead" }));
    await page.waitForFunction(() => window.__emberisle.getState().playView === "overhead", null, { timeout: STEP_MS });
    await targets(page, `${view.tag} overhead`);
    await inspectDock(page, "timber", `${view.tag} overhead`);
    assert.deepEqual(errors, [], `${view.tag}: zero console, page, and HTTP errors`);
    console.log(`${view.tag} ${view.width}x${view.height}: nine 44px docks, labels ${latencies.map((n) => n.toFixed(1)).join("/")}ms, owned rates, Enter/contextmenu/hold/synthesized click, live ownership, dismissal, armed/owner lifecycle, placement, resize/views, screenshot; zero errors`);
    await ctx.close();
  }
  console.log("dock-rates-prove: ok");
} catch (error) {
  console.error(error);
  code = 1;
} finally {
  await browser?.close();
  await vite.close();
}
process.exit(code);
