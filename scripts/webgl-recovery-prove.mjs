// #1137: TableRecoveryBoundary logs errors with componentStack, and WebGL creation failure falls back gracefully so the table stays playable.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
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
    await page.getByRole("button", { name: "Pass this device" }).click();
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
    const hotseatBtn = page.getByRole("button", { name: "Pass this device" });
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

  // Test 3: Non-WebGL constructor failure (e.g. at EffectComposer) tears down listeners, safeProbe div, and displays "3D view failed to start"
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(15_000);

    await page.route("**/src/lib/scene/isle-renderer.ts*", async (route) => {
      const response = await route.fetch();
      const original = await response.text();
      const signature = "this.composer = new EffectComposer(this.renderer);";
      assert(original.includes(signature), "found EffectComposer creation line");
      const body = original.replace(
        signature,
        `if (window.__forceComposerFail) throw new Error("forced EffectComposer failure");\n${signature}`,
      );
      await route.fulfill({ response, body });
    });

    await page.addInitScript(() => {
      window.__forceComposerFail = true;
      window.__loseContextCalls = 0;
      const origGetExt = WebGL2RenderingContext.prototype.getExtension;
      WebGL2RenderingContext.prototype.getExtension = function (name) {
        const ext = origGetExt.apply(this, arguments);
        if (ext && name === "WEBGL_lose_context" && !ext.__wrapped) {
          ext.__wrapped = true;
          const origLose = ext.loseContext.bind(ext);
          ext.loseContext = function () {
            window.__loseContextCalls++;
            return origLose();
          };
        }
        return ext;
      };

      window.__isleListeners = { added: 0, removed: 0 };
      const origAdd = window.addEventListener.bind(window);
      const origRemove = window.removeEventListener.bind(window);
      window.addEventListener = function (type, listener, ...args) {
        if (new Error().stack?.includes("isle-renderer")) window.__isleListeners.added++;
        return origAdd(type, listener, ...args);
      };
      window.removeEventListener = function (type, listener, ...args) {
        if (new Error().stack?.includes("isle-renderer")) window.__isleListeners.removed++;
        return origRemove(type, listener, ...args);
      };

      window.__documentListeners = { added: 0, removed: 0 };
      const origDocAdd = document.addEventListener.bind(document);
      const origDocRemove = document.removeEventListener.bind(document);
      document.addEventListener = function (type, listener, ...args) {
        if (type === "visibilitychange") window.__documentListeners.added++;
        return origDocAdd(type, listener, ...args);
      };
      document.removeEventListener = function (type, listener, ...args) {
        if (type === "visibilitychange") window.__documentListeners.removed++;
        return origDocRemove(type, listener, ...args);
      };
    });

    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);

    // Assert "3D view failed to start" is displayed (non-WebGL error)
    const fallbackNote = page.getByText("3D view failed to start");
    await fallbackNote.waitFor();
    assert.ok(await fallbackNote.isVisible(), "'3D view failed to start' note is visible");

    // Assert WebGL context was lost via forceContextLoss
    const isContextLost = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const gl = canvas?.getContext("webgl2");
      return gl ? gl.isContextLost() : null;
    });
    assert.equal(isContextLost, true, "webgl context is marked lost on constructor failure");

    const loseContextCalls = await page.evaluate(() => window.__loseContextCalls);
    assert.ok(loseContextCalls > 0, "WEBGL_lose_context.loseContext was called on constructor failure");

    // Assert safeProbe div was removed on constructor throw
    const safeProbes = await page.evaluate(
      () => document.querySelectorAll("div[style*='safe-area-inset']").length,
    );
    assert.equal(safeProbes, 0, "safeProbe div is cleaned up on constructor throw");

    // Assert window listeners and document visibility listener were cleaned up
    const winListeners = await page.evaluate(() => window.__isleListeners);
    assert.ok(winListeners.added > 0, "window listeners were registered");
    assert.equal(
      winListeners.added,
      winListeners.removed,
      "all registered window listeners were cleaned up on constructor failure",
    );

    const docListeners = await page.evaluate(() => window.__documentListeners);
    assert.ok(docListeners.added > 0, "document visibility listener was registered by clock");
    assert.equal(
      docListeners.added,
      docListeners.removed,
      "document visibility listener was cleaned up on constructor failure",
    );

    // Assert table recovery did not trigger
    assert.equal(
      await page.getByTestId("table-recovery").count(),
      0,
      "table recovery boundary did not trigger on constructor failure",
    );

    console.log(
      "ok  constructor teardown cleans up window listeners, clock, and safeProbe on failure",
    );
    await page.close();
  }

  // Test 4: Sync-failure failed/unsub guard and double dispose protection in IslandCanvas
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(15_000);

    await page.addInitScript(() => {
      let storeVal;
      window.__subscribers = [];
      Object.defineProperty(window, "__emberisle", {
        configurable: true,
        get() {
          return storeVal;
        },
        set(s) {
          storeVal = s;
          if (s && s.subscribe && !s.__wrappedSub) {
            s.__wrappedSub = true;
            const origSub = s.subscribe;
            s.subscribe = function (fn) {
              const record = { text: fn.toString(), fn, unsubbed: false, callCount: 0 };
              window.__subscribers.push(record);
              const wrappedFn = (...args) => {
                record.callCount++;
                return fn(...args);
              };
              const unsub = origSub.call(this, wrappedFn);
              return function () {
                record.unsubbed = true;
                return unsub();
              };
            };
          }
        },
      });
    });

    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);

    // Start a hotseat game and wait for play screen
    const hotseatBtn = page.getByRole("button", { name: "Pass this device" });
    await hotseatBtn.waitFor();
    await hotseatBtn.click();
    await page.waitForFunction(() => window.__emberisle?.getState().screen === "play" && window.__isle);

    // Assert active IslandCanvas subscriber is registered and not unsubbed
    const activeSubBefore = await page.evaluate(() => {
      const sub = window.__subscribers.filter((s) => s.text.includes("sync")).at(-1);
      return { found: !!sub, unsubbed: sub?.unsubbed };
    });
    assert.ok(activeSubBefore.found, "found active IslandCanvas store subscriber");
    assert.equal(activeSubBefore.unsubbed, false, "IslandCanvas subscriber is active before failure");

    // Track dispose calls, spy on setWaterChoice (called on every sync), and hook setBoard to throw on next sync
    await page.evaluate(() => {
      window.__disposeCount = 0;
      const origDispose = window.__isle.dispose.bind(window.__isle);
      window.__isle.dispose = function () {
        window.__disposeCount++;
        return origDispose();
      };
      window.__waterChoiceCalls = 0;
      const origWater = window.__isle.setWaterChoice.bind(window.__isle);
      window.__isle.setWaterChoice = function (...args) {
        window.__waterChoiceCalls++;
        return origWater(...args);
      };
      window.__isle.setBoard = function () {
        throw new Error("controlled sync failure");
      };
      // Trigger a store state change to invoke the sync subscriber
      window.__emberisle.setState({ error: "trigger sync failure" });
    });

    // Fallback note "3D view unavailable" should appear with background
    const fallbackNote = page.getByText("3D view unavailable");
    await fallbackNote.waitFor();
    assert.ok(await fallbackNote.isVisible(), "fallback note shown on sync failure");

    // Capture screenshot of fallback note over frozen frame for proof review
    mkdirSync("docs/proofs/1137", { recursive: true });
    await page.screenshot({ path: "docs/proofs/1137/canvas-fallback-frozen-frame.png" });

    const fallbackContainer = page.getByTestId("canvas-fallback");
    assert.ok(
      await fallbackContainer.evaluate((el) => el.classList.contains("bg-bg")),
      "fallback note has background to cover canvas",
    );

    // Renderer was disposed once
    assert.equal(
      await page.evaluate(() => window.__disposeCount),
      1,
      "renderer disposed once on sync failure",
    );

    // Verify unsub guard: active IslandCanvas subscriber was unsubscribed
    const subStatus = await page.evaluate(() => {
      const islandSub = window.__subscribers.filter((s) => s.text.includes("sync")).at(-1);
      const callsBefore = window.__waterChoiceCalls;
      const subRunsBefore = islandSub.callCount;

      // Trigger subsequent store updates
      window.__emberisle.setState({ error: "subsequent update after failure" });

      const callsAfter = window.__waterChoiceCalls;
      const subRunsAfter = islandSub.callCount;

      return {
        unsubbed: islandSub.unsubbed,
        subRunsBefore,
        subRunsAfter,
        callsBefore,
        callsAfter,
      };
    });

    assert.equal(subStatus.unsubbed, true, "IslandCanvas unsub() was called on failure");
    assert.equal(
      subStatus.subRunsAfter,
      subStatus.subRunsBefore,
      "subscriber is detached from store; subsequent setState does not invoke it",
    );
    assert.equal(
      subStatus.callsAfter,
      subStatus.callsBefore,
      "sync() does not run on subsequent store updates; setWaterChoice not called",
    );
    assert.equal(
      await page.evaluate(() => window.__disposeCount),
      1,
      "renderer is not disposed again on subsequent updates",
    );

    // Verify sync guard: even if subscriber function is directly invoked while failed,
    // sync() if (failed) return guard must prevent execution of setWaterChoice and dispose
    const guardCheck = await page.evaluate(() => {
      const islandSub = window.__subscribers.filter((s) => s.text.includes("sync")).at(-1);
      const callsBefore = window.__waterChoiceCalls;
      const disposeBefore = window.__disposeCount;

      islandSub.fn(); // directly invoke the subscriber callback while failed

      return {
        waterCalled: window.__waterChoiceCalls > callsBefore,
        disposeCalled: window.__disposeCount > disposeBefore,
      };
    });
    assert.equal(guardCheck.waterCalled, false, "sync() if (failed) return guard prevents execution when failed");
    assert.equal(guardCheck.disposeCalled, false, "no extra dispose calls when subscriber runs while failed");

    // Verify table is still playable
    const rollBtn = page.getByRole("button", { name: "Roll", exact: true });
    await rollBtn.waitFor();
    const beforeSeq = await page.evaluate(() => window.__emberisle.getState().state.seq);
    await rollBtn.click();
    await page.waitForFunction(
      (seq) => window.__emberisle.getState().state.seq > seq,
      beforeSeq,
      { timeout: 5000 },
    );
    assert.ok(
      (await page.evaluate(() => window.__emberisle.getState().state.seq)) > beforeSeq,
      "game sequence advanced on roll; table remains playable after sync failure",
    );

    // Verify double-dispose guard on unmount
    const unmountDisposeCount = await page.evaluate(async () => {
      const mainSrc = await fetch("/src/main.tsx").then((r) => r.text());
      const reactMatch = mainSrc.match(/from\s+["'](\/node_modules\/\.vite\/deps\/react\.js[^"']*)["']/);
      const reactDomMatch = mainSrc.match(/from\s+["'](\/node_modules\/\.vite\/deps\/react-dom_client\.js[^"']*)["']/);
      const React = (await import(reactMatch ? reactMatch[1] : "/node_modules/.vite/deps/react.js")).default;
      const ReactDOM = (await import(reactDomMatch ? reactDomMatch[1] : "/node_modules/.vite/deps/react-dom_client.js")).default;
      const IslandCanvas = (await import("/src/components/scene/IslandCanvas.tsx")).default;
      const div = document.createElement("div");
      document.body.appendChild(div);
      const root = ReactDOM.createRoot(div);
      root.render(React.createElement(IslandCanvas));
      await new Promise((r) => setTimeout(r, 100));

      let testDisposeCount = 0;
      const realDispose = window.__isle.dispose.bind(window.__isle);
      window.__isle.dispose = function () {
        testDisposeCount++;
        return realDispose();
      };
      window.__isle.setBoard = function () {
        throw new Error("sync error on test mount");
      };
      window.__emberisle.setState({ error: "trigger test sync fail" });
      await new Promise((r) => setTimeout(r, 50));

      // Unmount the component
      root.unmount();
      div.remove();
      return testDisposeCount;
    });

    assert.equal(
      unmountDisposeCount,
      1,
      "IslandCanvas does not double-dispose renderer on unmount after sync failure",
    );

    console.log("ok  sync failure triggers fallback, unsubs, and avoids double-dispose");
    await page.close();
  }

  console.log("webgl recovery prove ok");
} finally {
  await browser.close();
  await vite.close();
}
