// #216: in hotseat, a 7 where a seat other than the roller owes a discard must show that seat's DiscardBar, and the
// discard must be attributed to that seat. Crafts p0 rolled a 7, p2 holds 9 cards, discardNeeded {p2: 4}; zero console errors.
// #390: a seat change must not carry the last seat's flash tint onto the new seat's tiles.
// #232: first, the Roll button carries all four seats through the roll-off for first place.
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

// CI renders the island with software GL, where one frame can take seconds; a step gets this long to show.
const STEP_MS = 15_000;

const PORT = 8096;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
let code = 0;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.getByRole("button", { name: "Four seats, one table" }).click();
  await page.waitForFunction(() => window.__emberisle?.getState().state);

  // #232: the Roll button rolls off for whichever seat is current, until one seat places first.
  const rollBtn = page.getByRole("button", { name: "Roll", exact: true });
  const rollers = [];
  for (let i = 0; i < 40; i++) {
    const before = await page.evaluate(() => { const st = window.__emberisle.getState().state; return { phase: st.phase, current: st.current, seq: st.seq }; });
    if (before.phase !== "rollOff") break;
    await rollBtn.click({ timeout: STEP_MS });
    await page.waitForFunction((seq) => window.__emberisle.getState().state.seq > seq, before.seq, { timeout: STEP_MS });
    rollers.push(before.current);
  }
  const off = await page.evaluate(() => {
    const st = window.__emberisle.getState().state;
    const ids = st.players.map((p) => p.id);
    const d = st.rollOff.rolls;
    const [first, ...rest] = ids;
    const ok = st.phase === "setupSettle" && st.setupIndex === 0 && st.current === first && st.rollOff.pending.length === 0 &&
      Object.keys(d).length === ids.length && rest.every((id) => d[id] < d[first]) &&
      rest.every((id, i) => i === 0 || d[rest[i - 1]] > d[id] || (d[rest[i - 1]] === d[id] && rest[i - 1] < id));
    return { ok, ids, rolls: d, line: st.log.findLast((l) => l.includes("places first, then")) };
  });
  const offTiles = await page.locator('[data-testid="rolloff-die"]:visible').allTextContents();
  console.log(`roll-off by the Roll button: ${rollers.length} clicks (${rollers.join(" ")}), order ${off.ids.join(" ")} ok ${off.ok}, tiles [${offTiles.join(" ")}], "${off.line}"`);
  if (!off.ok || rollers.length < 4 || offTiles.length !== 4 || offTiles.some((t) => !/^[1-6]$/.test(t))) throw new Error(`roll-off: ${JSON.stringify({ off, rollers, offTiles })}`);

  // #390: the seat that is current gains timber and flashes; the next seat then takes the hand. Once the new seat has
  // painted (two frames), no tile may still carry the old seat's tint or label.
  const flashSeat = await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    const from = st.current;
    st.players.find((p) => p.id === from).resources.timber += 2;
    st.seq += 1;
    g.setState({ state: st });
    return from;
  });
  await page.locator('[data-testid="resource-flash"]').first().waitFor({ timeout: STEP_MS });
  const carried = await page.evaluate(async (from) => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    const to = st.players.find((p) => p.id !== from).id;
    st.current = to;
    st.seq += 1;
    g.setState({ state: st });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const tinted = [...document.querySelectorAll('[data-testid^="resource-"]')]
      .filter((el) => el.dataset.testid !== "resource-flash" && /emerald|rose/.test(el.className)).length;
    return { to, tinted, labels: document.querySelectorAll('[data-testid="resource-flash"]').length };
  }, flashSeat);
  console.log(`seat change ${flashSeat} -> ${carried.to}: tinted tiles ${carried.tinted}, flash labels ${carried.labels}`);
  if (carried.tinted || carried.labels) throw new Error(`flash carried over to the next seat: ${JSON.stringify(carried)}`);

  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.current = "p0";
    st.phase = "discard";
    st.dice = [3, 4];
    for (const p of st.players) p.resources = { timber: 0, clay: 0, wool: 0, grain: 0, ore: 0 };
    st.players.find((p) => p.id === "p0").resources.timber = 2;
    st.players.find((p) => p.id === "p2").resources = { timber: 3, clay: 2, wool: 2, grain: 1, ore: 1 };
    st.discardNeeded = { p2: 4 };
    st.seq += 1;
    g.setState({ state: st, pendingSteal: null, error: null });
  });

  const p2Name = await page.evaluate(() => window.__emberisle.getState().state.players.find((p) => p.id === "p2").name);
  const label = await page.getByText(`${p2Name}: discard 4`).textContent({ timeout: STEP_MS });
  console.log("bar:", label);

  const form = page.locator("form", { hasText: "discard 4" });
  // #255: the bar counts what is picked, clamps each count to what the seat holds, and keeps Discard off until the total is exact.
  const count = form.getByTestId("discard-count");
  const submit = form.getByRole("button", { name: "Discard" });
  const countState = async () => ({ text: (await count.textContent()).trim(), disabled: await submit.isDisabled() });
  const start = await countState();
  if (start.text !== "0 of 4" || !start.disabled) throw new Error(`empty bar: ${JSON.stringify(start)}`);
  await form.getByLabel("Timber").fill("3");
  const part = await countState();
  if (part.text !== "3 of 4" || !part.disabled) throw new Error(`3 picked: ${JSON.stringify(part)}`);
  await form.getByLabel("Ore").fill("5"); // holds 1: clamped
  const clamped = await form.getByLabel("Ore").inputValue();
  const over = await countState();
  if (clamped !== "1" || over.text !== "4 of 4" || over.disabled) throw new Error(`clamp/exact: ${clamped} ${JSON.stringify(over)}`);
  await form.getByLabel("Timber").fill("4"); // holds 3: clamped, total still 4
  const tooMany = await form.getByLabel("Timber").inputValue();
  if (tooMany !== "3") throw new Error(`timber not clamped: ${tooMany}`);
  await form.getByLabel("Timber").fill("2");
  const short = await countState();
  if (short.text !== "3 of 4" || !short.disabled) throw new Error(`short again: ${JSON.stringify(short)}`);
  console.log("discard count:", JSON.stringify({ start, part, clamped, over, short }));
  await form.getByLabel("Timber").fill("0");
  await form.getByLabel("Ore").fill("0");
  await form.locator('input[name="timber"]').fill("3");
  await form.locator('input[name="clay"]').fill("1");
  await form.getByRole("button", { name: "Discard" }).click();
  await page.waitForFunction(() => window.__emberisle.getState().state.phase === "robber", null, { timeout: STEP_MS });
  const after = await page.evaluate(() => {
    const st = window.__emberisle.getState().state;
    const p2 = st.players.find((p) => p.id === "p2");
    return { phase: st.phase, cards: Object.values(p2.resources).reduce((a, b) => a + b, 0), need: st.discardNeeded };
  });
  console.log("after discard:", JSON.stringify(after));
  if (after.cards !== 5) throw new Error(`p2 should hold 5 cards, has ${after.cards}`);

  // Two seats owe a discard: the second bar must not inherit what the first typed.
  // Hotseat bars go in seat order, which the roll-off shuffles (#232): the earlier of p1 and p2 owes 4, the later 5.
  const [first, second] = await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    const [x, y] = st.players.filter((p) => p.id === "p1" || p.id === "p2").map((p) => p.id);
    st.phase = "discard";
    st.players.find((p) => p.id === x).resources = { timber: 3, clay: 2, wool: 2, grain: 1, ore: 0 };
    st.players.find((p) => p.id === y).resources = { timber: 4, clay: 2, wool: 2, grain: 1, ore: 1 };
    st.discardNeeded = { [x]: 4, [y]: 5 };
    st.seq += 1;
    g.setState({ state: st, pendingSteal: null, error: null });
    return [x, y];
  });
  const name = (id) => page.evaluate((i) => window.__emberisle.getState().state.players.find((p) => p.id === i).name, id);
  await page.getByText(`${await name(first)}: discard 4`).waitFor({ timeout: STEP_MS });
  let f = page.locator("form", { hasText: "discard 4" });
  await f.locator('input[name="timber"]').fill("3");
  await f.locator('input[name="clay"]').fill("1");
  await f.getByRole("button", { name: "Discard" }).click();
  await page.getByText(`${await name(second)}: discard 5`).waitFor({ timeout: STEP_MS });
  f = page.locator("form", { hasText: "discard 5" });
  const vals = await f.locator("input").evaluateAll((els) => els.map((e) => e.value));
  console.log("second bar inputs:", vals.join(","));
  if (vals.some((v) => v !== "0")) throw new Error(`second bar kept the first seat's numbers: ${vals}`);
  await f.locator('input[name="timber"]').fill("4");
  await f.locator('input[name="clay"]').fill("1");
  await f.getByRole("button", { name: "Discard" }).click();
  await page.waitForFunction(() => window.__emberisle.getState().state.phase === "robber", null, { timeout: STEP_MS });
  console.log("two seats: phase robber");

  // The roller owes the discard too: the turn banner and the discard bar both name the current seat,
  // so their React keys must differ (a shared "p0" key logged a console error, caught on CI).
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.phase = "discard";
    st.players.find((p) => p.id === st.current).resources = { timber: 4, clay: 2, wool: 2, grain: 1, ore: 1 };
    st.discardNeeded = { [st.current]: 5 };
    st.seq += 1;
    g.setState({ state: st, pendingSteal: null, error: null });
  });
  const curName = await page.evaluate(() => { const st = window.__emberisle.getState().state; return st.players.find((p) => p.id === st.current).name; });
  await page.getByText(`${curName}: discard 5`).waitFor({ timeout: STEP_MS });
  await page.waitForTimeout(300);
  console.log("roller discards: bar and banner side by side");
} catch (e) {
  console.error("hotseat-prove failed:", e);
  code = 1;
}
if (errors.length) {
  console.error("console errors:", errors);
  code = 1;
}
await browser.close();
await vite.close();
console.log(code ? "hotseat-prove: FAIL" : "hotseat-prove: ok");
process.exit(code);
