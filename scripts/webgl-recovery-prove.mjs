// #1137: TableRecoveryBoundary logs errors with componentStack, and WebGL creation failure falls back gracefully so the table stays playable.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8460;
const vite = await createServer({
  server: { host: "127.0.0.1", port: PORT, strictPort: true },
  logLevel: "error",
});
await vite.listen();

const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

try {
  // Test 1: Forced render error inside TableRecoveryBoundary logs error and componentStack to console.error
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(15_000);

    const loggedErrors = [];
    page.on("console", async (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      const args = [];
      for (const arg of msg.args()) {
        try {
          args.push(await arg.jsonValue());
        } catch {
          args.push(String(arg));
        }
      }
      loggedErrors.push({ text, args });
    });

    // Intercept Hud.tsx to throw a controlled render error
    await page.route("**/src/components/game/Hud.tsx*", async (route) => {
      const response = await route.fetch();
      const original = await response.text();
      const signature = "function Hud() {";
      assert(original.includes(signature), "found Hud render entry for controlled injection");
      const body = original.replace(
        signature,
        `${signature}\nif (window.__renderFault === "hud") throw new Error("controlled table render failure: hud");`,
      );
      await route.fulfill({ response, body });
    });

    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);

    // Start a hotseat game
    await page.getByRole("button", { name: "Four seats, one table" }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().screen === "play");

    // Trigger render failure
    await page.evaluate(() => {
      window.__renderFault = "hud";
      window.__emberisle.setState({ error: "Trigger a table render" });
    });

    // Verify recovery boundary shows
    await page.getByTestId("table-recovery").waitFor();
    assert.match(
      await page.getByTestId("table-recovery").innerText(),
      /Your table hit a snag/,
      "table recovery boundary caught render error",
    );

    // Verify TableRecoveryBoundary logged error and componentStack to console.error
    const boundaryLog = loggedErrors.find((entry) => {
      return (
        entry.args.length >= 2 &&
        String(entry.args[0]).includes("controlled table render failure: hud") &&
        typeof entry.args[1] === "string" &&
        entry.args[1].includes("Hud")
      );
    });

    assert.ok(
      boundaryLog,
      "TableRecoveryBoundary logged the error and componentStack to console.error",
    );
    console.log("ok  forced render error logs error and componentStack to console.error");
    await page.close();
  }

  // Test 2: Forced WebGL failure leaves the table playable
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(15_000);

    // Disable WebGL completely so THREE.WebGLRenderer fails
    await page.addInitScript(() => {
      const origGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        if (typeof type === "string" && (type.includes("webgl") || type.includes("experimental-webgl"))) {
          return null;
        }
        return origGetContext.apply(this, [type, ...args]);
      };
    });

    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);

    // The title screen should be visible and usable, not crashed
    assert.equal(
      await page.getByTestId("table-recovery").count(),
      0,
      "title screen did not crash to table recovery",
    );

    // Start a hotseat game
    const hotseatBtn = page.getByRole("button", { name: "Four seats, one table" });
    await hotseatBtn.waitFor();
    await hotseatBtn.click();

    // Table enters play screen
    await page.waitForFunction(() => window.__emberisle?.getState().screen === "play");

    // Table recovery should NOT have triggered
    assert.equal(
      await page.getByTestId("table-recovery").count(),
      0,
      "game play screen did not crash to table recovery",
    );

    // Calm 3D view unavailable fallback note should be shown
    const fallbackNote = page.getByText("3D view unavailable");
    await fallbackNote.waitFor();
    assert.ok(await fallbackNote.isVisible(), "calm '3D view unavailable' note is visible");

    // Table is playable: Roll button is clickable and advances the game
    const rollBtn = page.getByRole("button", { name: "Roll", exact: true });
    await rollBtn.waitFor();
    const beforeSeq = await page.evaluate(() => window.__emberisle.getState().state.seq);

    await rollBtn.click();
    await page.waitForFunction(
      (seq) => window.__emberisle.getState().state.seq > seq,
      beforeSeq,
      { timeout: 5000 },
    );

    const afterSeq = await page.evaluate(() => window.__emberisle.getState().state.seq);
    assert.ok(afterSeq > beforeSeq, "dice roll advanced game sequence; table is playable");

    console.log("ok  forced WebGL failure leaves the table playable with calm note");
    await page.close();
  }

  console.log("webgl recovery prove ok");
} finally {
  await browser.close();
  await vite.close();
}
