// #459: the turn banner must not move when the status line (data-testid="banner") appears or clears.
// Records the turn banner's bounding box with the line set, cleared and set again, at 1280x720, 390x844, 844x390 and
// 667x375 (touch; the last two put the HUD in a left column, #422), with and without prefers-reduced-motion; every edge
// stays within 1 px, and the status line never overlaps the turn banner or the hand. At 667x375 with a 44 px notch each side
// (and a 21 px home bar), a long roll line stays inside the safe area. Zero console errors.
// Run: npm run banner-stable-prove
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8101;
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const failures = [];
const check = (ok, what, data) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what} ${JSON.stringify(data)}`);
  if (!ok) failures.push(what);
};
let code = 0;
try {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844, touch: true },
    { width: 844, height: 390, touch: true },
    { width: 667, height: 375, touch: true },
    { width: 667, height: 375, touch: true, insets: { top: 0, right: 44, bottom: 21, left: 44 } },
  ]) {
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const tag = `${viewport.width}x${viewport.height}${viewport.insets ? " notched" : ""} ${reducedMotion === "reduce" ? "reduced motion" : "motion"}`;
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion, hasTouch: !!viewport.touch, isMobile: !!viewport.touch });
      if (viewport.insets) await (await page.context().newCDPSession(page)).send("Emulation.setSafeAreaInsetsOverride", { insets: viewport.insets });
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.getByRole("button", { name: "Join", exact: true }).waitFor();
      await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
      await page.waitForFunction(() => window.__emberisle?.getState().state);
      await page.evaluate(() => {
        const g = window.__emberisle;
        const st = structuredClone(g.getState().state);
        st.phase = "main";
        st.current = st.players[0].id;
        st.dice = [3, 4];
        st.players[0].resources = { timber: 2, clay: 1, wool: 1, grain: 1, ore: 0 };
        st.seq += 1;
        g.setState({ state: st, banner: null, buildMode: "none", pendingSteal: null, error: null });
      });
      await page.getByTestId("turn-banner").waitFor();
      const setBanner = async (text) => {
        await page.evaluate((t) => window.__emberisle.setState({ banner: t }), text);
        if (text) await page.getByTestId("banner").waitFor();
        else await page.getByTestId("banner").waitFor({ state: "detached" });
        // Past the 200 ms fade, and two frames so layout has settled.
        await page.waitForTimeout(300);
        return page.evaluate(() => {
          const r = document.querySelector('[data-testid="turn-banner"]').getBoundingClientRect();
          const pill = document.querySelector('[data-testid="banner"]')?.getBoundingClientRect();
          const hand = document.querySelector('[data-testid="hand-dock"]')?.getBoundingClientRect();
          const meets = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
          return { x: r.x, y: r.y, w: r.width, h: r.height, over: meets(pill, r) || meets(pill, hand), pillLeft: pill?.left, pillRight: pill?.right };
        });
      };
      const cleared = await setBanner(null);
      // The longest kind of roll line: who rolled, and two goods gained.
      const shown = await setBanner("Seat 2's roll · Seat 2 gains 1 timber and 1 clay · Seat 3 gains 2 wool");
      const clearedAgain = await setBanner(null);
      const same = (a, b) => ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) <= 1);
      check(same(cleared, shown), `${tag}: turn banner box unchanged when the status line appears`, { cleared, shown });
      check(same(shown, clearedAgain), `${tag}: turn banner box unchanged when the status line clears`, { shown, clearedAgain });
      check(!shown.over, `${tag}: the status line covers neither the turn banner nor the hand`, shown);
      const safe = viewport.insets ?? { left: 0, right: 0 };
      check(shown.pillLeft >= safe.left && shown.pillRight <= viewport.width - safe.right, `${tag}: the status line stays inside the safe area`, { left: shown.pillLeft, right: shown.pillRight, safeRight: viewport.width - safe.right });
      await page.close();
    }
  }
  check(errors.length === 0, "zero console errors", errors);
  if (failures.length) throw new Error(`${failures.length} check(s) failed`);
  console.log("banner-stable-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
