// #459: the turn banner must not move when the status line (data-testid="banner") appears or clears.
// Records the turn banner's bounding box with the line set, cleared and set again, at 1280x720 and 390x844 (touch), with
// and without prefers-reduced-motion; every edge stays within 1 px. Zero console errors. Run: npm run banner-stable-prove
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
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844, touch: true }]) {
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const tag = `${viewport.width}x${viewport.height} ${reducedMotion === "reduce" ? "reduced motion" : "motion"}`;
      const page = await browser.newPage({ viewport, reducedMotion, hasTouch: !!viewport.touch, isMobile: !!viewport.touch });
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
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        });
      };
      const cleared = await setBanner(null);
      const shown = await setBanner("Rolled 3 and 4: 7.");
      const clearedAgain = await setBanner(null);
      const same = (a, b) => ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) <= 1);
      check(same(cleared, shown), `${tag}: turn banner box unchanged when the status line appears`, { cleared, shown });
      check(same(shown, clearedAgain), `${tag}: turn banner box unchanged when the status line clears`, { shown, clearedAgain });
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
