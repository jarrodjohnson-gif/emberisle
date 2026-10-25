// #833: only native-host HTML or an explicit host link enables automatic title discovery.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { preview } from "vite";

const temp = mkdtempSync(path.join(tmpdir(), "emberisle-open-host-"));
const errors = [];
const hostErrors = [];
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", DIST: path.resolve("dist"), ROOMS_DIR: path.join(temp, "rooms"), PROFILES_DIR: path.join(temp, "profiles") },
});
host.stderr.on("data", d => hostErrors.push(String(d)));
let browser, served, fixture;
try {
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("native host startup timed out")), 30000);
    host.on("error", reject);
    host.on("exit", code => reject(new Error(`native host exited ${code}`)));
    host.stdout.on("data", d => {
      const match = String(d).match(/listening (\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
  });
  const native = `http://127.0.0.1:${port}`;
  const socketURL = `ws://127.0.0.1:${port}`;
  fixture = new WebSocket(socketURL);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("open fixture creation timed out")), 30000);
    fixture.addEventListener("error", reject);
    fixture.addEventListener("open", () => fixture.send(JSON.stringify({ type: "create", name: "Native marker", visibility: "open" })));
    fixture.addEventListener("message", ({ data }) => {
      const message = JSON.parse(String(data));
      if (message.type === "welcome") { clearTimeout(timer); resolve(); }
      if (message.type === "error") { clearTimeout(timer); reject(new Error(message.message)); }
    });
  });
  served = await preview({ preview: { host: "127.0.0.1", port: Number(process.env.OPEN_HOST_PORT) || 8494, strictPort: true }, logLevel: "error" });
  const staticURL = served.resolvedUrls.local[0];
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  async function visit(url) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => {
      for (const name of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) WebGL2RenderingContext.prototype[name] = function () {};
    });
    const page = await context.newPage(), sockets = [];
    page.on("websocket", socket => sockets.push(socket.url()));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto(url);
    await page.getByTestId("open-mode-toggle").waitFor();
    await page.waitForLoadState("networkidle");
    return { context, page, sockets };
  }
  {
    const { context, page, sockets } = await visit(staticURL);
    assert.equal(await page.locator('meta[name="emberisle-host"]').count(), 0);
    assert.deepEqual(sockets, [], "automatic discovery opens no WebSocket on a static root build");
    await page.getByRole("button", { name: "Pass this device", exact: true }).click();
    await page.getByRole("button", { name: "Table menu", exact: true }).waitFor();
    assert.deepEqual(sockets, [], "static offline play also makes no host connection");
    assert.deepEqual(errors, []);
    console.log("static root: 0 WebSockets; offline play works; no browser errors");
    await context.close();
  }
  {
    const { context, page, sockets } = await visit(`${native}/`);
    assert.equal(await page.locator('meta[name="emberisle-host"]').getAttribute("content"), "1");
    await page.getByTestId("open-table-entry").filter({ hasText: "Native marker" }).waitFor();
    assert.deepEqual(sockets.map(url => new URL(url).origin), [socketURL]);
    assert.deepEqual(errors, []);
    console.log("native root: served marker enables one real discovery socket and the open row");
    await context.close();
  }
  {
    const { context, page, sockets } = await visit(`${staticURL}?host=${encodeURIComponent(socketURL)}`);
    assert.equal(await page.locator('meta[name="emberisle-host"]').count(), 0);
    await page.getByTestId("open-table-entry").filter({ hasText: "Native marker" }).waitFor();
    assert.deepEqual(sockets.map(url => new URL(url).origin), [socketURL]);
    assert.deepEqual(errors, []);
    console.log("explicit host link: unmarked static build discovers the selected native host only");
    await context.close();
  }
  assert.deepEqual(hostErrors, []);
  console.log("open-host-prove: all passed");
} finally {
  await browser?.close();
  if (served) await new Promise(resolve => served.httpServer.close(resolve));
  fixture?.close();
  if (host.exitCode === null && host.signalCode === null) {
    await new Promise(resolve => { host.once("exit", resolve); host.kill(); });
  }
  rmSync(temp, { recursive: true, force: true });
}
