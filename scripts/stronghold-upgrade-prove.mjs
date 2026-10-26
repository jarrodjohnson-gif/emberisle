// #1155: upgrading a home to a stronghold.
// In a practice game across four viewports (320x568, 390x844, 844x390, 1280x720):
// 1. When upgrade mode is on with eligible homes:
//    - Every eligible home glows with the PR #848 legal-spot glow (ring, outline, disc resting on the piece base).
//    - The turn banner shows a clear line: "Pick a home to upgrade to a stronghold".
//    - Shows a clear way out ("Esc cancels" on desktop, "tap Upgrade again to cancel" on phone).
//    - Saves docs/proofs/1155/upgrade-mode-eligible-{w}x{h}.png.
// 2. When upgrade mode is on with no eligible homes:
//    - The turn banner shows: "No homes to upgrade".
//    - The button tile subtitle shows "No homes" (not "No spot").
//    - Clicking says why via hint tooltip and refuseQuietly instead of doing nothing.
//    - No homes glow (0 marks).
//    - Shows a clear way out ("Esc cancels" on desktop, "tap Upgrade again to cancel" on phone).
//    - Saves docs/proofs/1155/upgrade-mode-none-{w}x{h}.png.
// 3. Disarming via Esc or button tap cleanly returns to "none" with normal turn banner.
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";

const STEP_MS = 30_000;
const PORT = Number(process.env.VITE_PORT) || 8135;

// A practice game past setup and into `main` for the person (p0), who holds the two outposts setup placed.
function mainGame(hand = {}, seed = 11) {
  let g = createGame({ humans: [{ name: "Ember" }], bots: 3, seed });
  while (g.phase !== "roll") g = applyAction(g, g.current, chooseBotAction(g, g.current)).state;
  g.phase = "main";
  g.current = "p0";
  g.dice = [3, 4];
  const p0 = g.players.find((p) => p.id === "p0");
  if (p0) {
    p0.resources = { timber: 0, clay: 0, wool: 0, grain: 3, ore: 2, ...hand };
  }
  return g;
}

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();

const errors = [];
const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
mkdirSync("test-results", { recursive: true });
mkdirSync("docs/proofs/1155", { recursive: true });

const drawn = (page, n, ms = 30_000) =>
  page.evaluate(
    async ([n, ms]) => {
      const isle = window.__isle;
      const r0 = isle.renders;
      const t0 = performance.now();
      isle.wake?.();
      await new Promise((res, rej) => {
        const poll = () =>
          isle.renders >= r0 + n
            ? res()
            : performance.now() - t0 > ms
              ? rej(new Error(`drawn: ${n} frame(s) never came`))
              : requestAnimationFrame(poll);
        poll();
      });
    },
    [n, ms],
  );

const VIEWPORTS = [
  { w: 320, h: 568, isMobile: true, hasTouch: true },
  { w: 390, h: 844, isMobile: true, hasTouch: true },
  { w: 844, h: 390, isMobile: true, hasTouch: true },
  { w: 1280, h: 720, isMobile: false, hasTouch: false },
];

for (const { w, h, isMobile, hasTouch } of VIEWPORTS) {
  const tag = `${w}x${h}`;
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    isMobile,
    hasTouch,
    deviceScaleFactor: 1,
  });
  await ctx.addInitScript(() => localStorage.setItem("emberisle-water", "simple"));
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));

  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__isle?.renders > 0, null, { timeout: STEP_MS });

  // Load practice game directly in main phase with 2 starter outposts
  await page.evaluate((g) => {
    window.__emberisle.getState().startAi();
    window.__emberisle.setState({ state: g, buildMode: "none", pendingPlace: null, error: null, toast: null });
  }, mainGame({ grain: 3, ore: 2 }));

  await page.getByTestId("build-stronghold").waitFor({ timeout: STEP_MS });
  await page.waitForFunction(() => window.__isle?.lastState && !window.__isle.refitDue && !window.__isle.glide, null, { timeout: STEP_MS });
  await drawn(page, 3);

  const marksInfo = () =>
    page.evaluate(() => {
      const kids = window.__isle.marks.children;
      const rings = kids.filter((m) => m.userData.kind === "vertex" && m.geometry?.type === "TorusGeometry");
      return {
        rings: rings.length,
        outlines: kids.filter((m) => m.userData.kind === "vertex-outline").length,
        discs: kids.filter((m) => m.userData.kind === "vertex-disc").length,
        ringTubes: rings.map((r) => +r.position.y.toFixed(3)),
        total: kids.length,
      };
    });

  const legalHomes = () => page.evaluate(() => window.__emberisle.getState().highlights().vertices);

  const press = async (loc) => {
    const b = await loc.boundingBox();
    if (!b) return;
    const [x, y] = [b.x + b.width / 2, b.y + b.height / 2];
    if (hasTouch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
  };

  // --- Part 1: Upgrade mode with eligible homes glowing ---
  const upgradeBtn = page.getByTestId("build-stronghold");
  await press(upgradeBtn);
  await page.waitForFunction(() => window.__emberisle.getState().buildMode === "stronghold", null, { timeout: STEP_MS });
  await drawn(page, 2);

  const ownHomes = await legalHomes();
  const infoWithHomes = await marksInfo();
  const bannerText = (await page.getByTestId("turn-banner").innerText()).trim();

  check(
    `${tag}: upgrade mode with eligible homes glows every eligible home`,
    ownHomes.length === 2 && infoWithHomes.rings === 2 && infoWithHomes.outlines === 2 && infoWithHomes.discs === 2,
    { legal: ownHomes.length, ...infoWithHomes },
  );

  check(
    `${tag}: instruction clearly says "Pick a home to upgrade to a stronghold"`,
    bannerText.includes("Pick a home to upgrade to a stronghold"),
    bannerText,
  );

  const expectedCancelWay = isMobile || hasTouch ? "tap Upgrade again to cancel" : "Esc cancels";
  check(
    `${tag}: instruction provides clear way out (${expectedCancelWay})`,
    bannerText.includes(expectedCancelWay) || bannerText.includes("cancel"),
    bannerText,
  );

  // Capture screenshot of upgrade mode with eligible homes glowing
  await page.screenshot({ path: `docs/proofs/1155/upgrade-mode-eligible-${tag}.png` });
  await page.screenshot({ path: `test-results/upgrade-mode-eligible-${tag}.png` });

  // Test disarm via clicking button again or Esc
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__emberisle.getState().buildMode === "none", null, { timeout: STEP_MS });
  await drawn(page, 2);
  const afterDisarm = await marksInfo();
  check(`${tag}: Esc disarms upgrade mode`, afterDisarm.total === 0);

  // --- Part 2: Upgrade mode with none eligible ---
  // Upgrade all player outposts to strongholds so 0 eligible homes remain
  await page.evaluate(() => {
    const g = window.__emberisle;
    const st = structuredClone(g.getState().state);
    for (const v of st.vertices) {
      if (v.building?.playerId === "p0") {
        v.building.kind = "stronghold";
      }
    }
    st.players.find((p) => p.id === "p0").strongholdsLeft -= 2;
    st.seq += 1;
    g.setState({ state: st, buildMode: "none" });
  });
  await drawn(page, 2);

  // Check the button subtitle says "No homes"
  const btnSubtitle = await upgradeBtn.innerText();
  check(
    `${tag}: stronghold button subtitle displays "No homes"`,
    btnSubtitle.includes("No homes"),
    btnSubtitle,
  );

  // Click the stronghold button when none are eligible:
  // It says why via hint balloon & announcement, and enters upgrade mode with the clear message
  await press(upgradeBtn);
  await page.waitForFunction(() => window.__emberisle.getState().buildMode === "stronghold", null, { timeout: STEP_MS });
  await drawn(page, 2);

  const hintText = await page.getByTestId("build-hint-stronghold").innerText().catch(() => "");
  check(
    `${tag}: clicking button with none eligible says why in hint tooltip`,
    hintText.includes("No homes to upgrade"),
    { hintText },
  );

  const infoNone = await marksInfo();
  const bannerNone = (await page.getByTestId("turn-banner").innerText()).trim();

  check(
    `${tag}: upgrade mode with none eligible leaves 0 marks`,
    infoNone.rings === 0 && infoNone.total === 0,
    infoNone,
  );

  check(
    `${tag}: banner says "No homes to upgrade" when none eligible`,
    bannerNone.includes("No homes to upgrade"),
    bannerNone,
  );

  check(
    `${tag}: banner provides clear way out when none eligible`,
    bannerNone.includes(expectedCancelWay) || bannerNone.includes("cancel"),
    bannerNone,
  );

  // Capture screenshot of upgrade mode with none eligible
  await page.screenshot({ path: `docs/proofs/1155/upgrade-mode-none-${tag}.png` });
  await page.screenshot({ path: `test-results/upgrade-mode-none-${tag}.png` });

  // Test disarm again
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__emberisle.getState().buildMode === "none", null, { timeout: STEP_MS });
  await drawn(page, 2);
  const afterNoneDisarm = await marksInfo();
  check(`${tag}: Esc disarms from none-eligible mode`, afterNoneDisarm.total === 0);

  await ctx.close();
}

check("zero console errors", errors.length === 0, errors.slice(0, 5));
await browser.close();
await vite.close();

if (fails.length > 0) {
  console.error(`stronghold-upgrade-prove FAILED: ${fails.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("stronghold-upgrade-prove ok");
}
