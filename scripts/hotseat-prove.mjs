// #216: in hotseat, a 7 where a seat other than the roller owes a discard must show that seat's DiscardBar, and the
// discard must be attributed to that seat. Crafts p0 rolled a 7, p2 holds 9 cards, discardNeeded {p2: 4}; zero console errors.
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

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
  const label = await page.getByText(`${p2Name}: discard 4`).textContent({ timeout: 3000 });
  console.log("bar:", label);

  const form = page.locator("form", { hasText: "discard 4" });
  await form.locator('input[name="timber"]').fill("3");
  await form.locator('input[name="clay"]').fill("1");
  await form.getByRole("button", { name: "Discard" }).click();
  await page.waitForFunction(() => window.__emberisle.getState().state.phase === "robber", null, { timeout: 3000 });
  const after = await page.evaluate(() => {
    const st = window.__emberisle.getState().state;
    const p2 = st.players.find((p) => p.id === "p2");
    return { phase: st.phase, cards: Object.values(p2.resources).reduce((a, b) => a + b, 0), need: st.discardNeeded };
  });
  console.log("after discard:", JSON.stringify(after));
  if (after.cards !== 5) throw new Error(`p2 should hold 5 cards, has ${after.cards}`);

  // Two seats owe a discard: the second bar must not inherit what the first typed.
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    st.phase = "discard";
    st.players.find((p) => p.id === "p1").resources = { timber: 3, clay: 2, wool: 2, grain: 1, ore: 0 };
    st.players.find((p) => p.id === "p2").resources = { timber: 4, clay: 2, wool: 2, grain: 1, ore: 1 };
    st.discardNeeded = { p1: 4, p2: 5 };
    st.seq += 1;
    g.setState({ state: st, pendingSteal: null, error: null });
  });
  const name = (id) => page.evaluate((i) => window.__emberisle.getState().state.players.find((p) => p.id === i).name, id);
  await page.getByText(`${await name("p1")}: discard 4`).waitFor({ timeout: 3000 });
  let f = page.locator("form", { hasText: "discard 4" });
  await f.locator('input[name="timber"]').fill("3");
  await f.locator('input[name="clay"]').fill("1");
  await f.getByRole("button", { name: "Discard" }).click();
  await page.getByText(`${await name("p2")}: discard 5`).waitFor({ timeout: 3000 });
  f = page.locator("form", { hasText: "discard 5" });
  const vals = await f.locator("input").evaluateAll((els) => els.map((e) => e.value));
  console.log("second bar inputs:", vals.join(","));
  if (vals.some((v) => v !== "0")) throw new Error(`second bar kept the first seat's numbers: ${vals}`);
  await f.locator('input[name="timber"]').fill("4");
  await f.locator('input[name="clay"]').fill("1");
  await f.getByRole("button", { name: "Discard" }).click();
  await page.waitForFunction(() => window.__emberisle.getState().state.phase === "robber", null, { timeout: 3000 });
  console.log("two seats: phase robber");
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
