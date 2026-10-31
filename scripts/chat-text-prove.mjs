// #117: client chat messages stay literal text in lobby and game across three real host-connected tabs.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TEMP = mkdtempSync(path.join(tmpdir(), "emberisle-chat-text-"));
const ROOMS_DIR = path.join(TEMP, "rooms");
const PROFILES_DIR = path.join(TEMP, "profiles");
mkdirSync(ROOMS_DIR);
mkdirSync(PROFILES_DIR);

let host, vite, browser;
let hostLog = "";
const errors = [];
const requests = [];
const check = (ok, message) => {
  if (!ok) throw new Error(message);
  console.log(`ok ${message}`);
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function stopHost(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, delay(1500)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
}
function listeningPort(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    const timer = setTimeout(() => reject(new Error(`host startup timed out: ${hostLog}`)), 10000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      hostLog = `${hostLog}${chunk}`.slice(-4000);
      const match = stdout.match(/listening (\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    child.stderr.on("data", (chunk) => { hostLog = `${hostLog}${chunk}`.slice(-4000); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`host exited ${code}: ${hostLog}`)); });
  });
}
async function until(fn, label, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await delay(50);
  }
  throw new Error(`timed out: ${label}`);
}

try {
  host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: path.join(ROOT, "server"),
    env: { ...process.env, PORT: "0", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results`, PROFILES_DIR },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const hostPort = await listeningPort(host);
  vite = await createServer({ root: ROOT, server: { host: "127.0.0.1", port: 0, strictPort: true }, logLevel: "error" });
  await vite.listen();
  const vitePort = vite.httpServer.address().port;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const url = `http://127.0.0.1:${vitePort}/?host=ws://127.0.0.1:${hostPort}`;
  const tabs = [];
  for (const name of ["Ember", "Tide", "Pine"]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    page.on("console", (message) => { if (message.type() === "error") errors.push(`${name}: ${message.text()}`); });
    page.on("pageerror", (error) => errors.push(`${name}: ${error}`));
    page.on("response", (response) => { if (response.status() >= 400) errors.push(`${name}: ${response.status()} ${response.url()}`); });
    page.on("request", (request) => { if (request.url().includes("/__chat-text-proof-")) requests.push(`${name}: ${request.url()}`); });
    await page.addInitScript((seatName) => {
      localStorage.setItem("emberisle-name", seatName);
      localStorage.setItem("emberisle-chat-open", "0");
      window.__chatTextExecuted = 0;
    }, name);
    await page.goto(url);
    await page.waitForFunction(() => window.__emberisle?.getState().screen === "title", null, { timeout: 15000 });
    tabs.push({ name, page });
  }
  const [hostTab, tideTab, pineTab] = tabs;
  await hostTab.page.getByRole("button", { name: "Host a table" }).click();
  const code = (await hostTab.page.getByTestId("table-code").textContent()).trim();
  for (const tab of [tideTab, pineTab]) {
    await tab.page.getByPlaceholder(/code/i).fill(code);
    await tab.page.getByRole("button", { name: "Join" }).click();
    await tab.page.getByTestId("table-code").waitFor();
  }
  for (const tab of tabs) await tab.page.getByPlaceholder("Say something…").waitFor();

  const dangerous = "img,script,a,b,iframe,svg,object";
  async function verify(tab, sender, color, payload, mention) {
    await tab.page.waitForFunction(({ sender, payload }) =>
      [...document.querySelectorAll('[data-testid="chat-log"] li')].some((line) => line.textContent === sender + payload),
    { sender, payload }, { timeout: 10000 });
    const result = await tab.page.evaluate(({ sender, color, payload, mention, dangerous }) => {
      const line = [...document.querySelectorAll('[data-testid="chat-log"] li')].find((item) => item.textContent === sender + payload);
      if (!line) return { ok: false, why: "exact payload line missing" };
      const swatch = line.children[0];
      const name = line.children[1];
      const probe = document.createElement("span");
      probe.style.backgroundColor = color;
      document.body.append(probe);
      const expected = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const actual = swatch ? getComputedStyle(swatch).backgroundColor : "";
      const nodes = [line, ...line.querySelectorAll("*")];
      const badNode = nodes.find((node) => node.matches(dangerous));
      const eventAttribute = nodes.flatMap((node) => [...node.attributes]).find((attribute) => /^on/i.test(attribute.name));
      return {
        ok: name?.textContent === sender && actual === expected && !badNode && !eventAttribute && (!mention || line.querySelector("mark")?.textContent === mention),
        exact: line.textContent === sender + payload,
        identity: name?.textContent,
        color: actual,
        expected,
        badNode: badNode?.tagName,
        eventAttribute: eventAttribute?.name,
        mention: line.querySelector("mark")?.textContent,
      };
    }, { sender, color, payload, mention, dangerous });
    check(result.ok && result.exact, `${tab.name} renders literal payload with sender, color, and no injected markup: ${JSON.stringify(result)}`);
  }
  async function sendStage(stage, mention) {
    const author = await hostTab.page.evaluate(() => {
      const state = window.__emberisle.getState();
      const seat = state.seats.find((item) => item.id === state.seatId);
      return { name: seat.name, color: seat.color };
    });
    const payloads = [
      `${stage}-1 <img src="/__chat-text-proof-${stage}-img" onerror="window.__chatTextExecuted='${stage}-img'"><script>window.__chatTextExecuted='${stage}-script'</script>`,
      `@${mention} ${stage}-2 <a href="javascript:window.__chatTextExecuted='${stage}-a'">link</a><b>bold & literal</b>`,
    ];
    for (const [index, payload] of payloads.entries()) {
      check([...payload].length <= 200, `${stage} payload ${index + 1} is within the 200-character limit`);
      const input = hostTab.page.getByPlaceholder("Say something…");
      await input.fill(payload);
      await input.press("Enter");
      for (const tab of tabs) {
        const ownMention = tab.name === mention && payload.startsWith(`@${mention} `) ? `@${mention}` : null;
        await verify(tab, author.name, author.color, payload, ownMention);
      }
    }
  }

  await sendStage("lobby", "Tide");
  for (const tab of tabs) await tab.page.evaluate(() => window.__emberisle.getState().setReady(true));
  await until(async () => (await hostTab.page.evaluate(() => window.__emberisle.getState().seats.every((seat) => seat.ready))), "all three seats ready");
  await hostTab.page.evaluate(() => window.__emberisle.getState().startTable());
  for (const tab of tabs) await tab.page.waitForFunction(() => window.__emberisle.getState().state?.phase === "rollOff", null, { timeout: 10000 });
  for (const tab of tabs) {
    await tab.page.getByRole("button", { name: /^Open chat/ }).click();
    await tab.page.getByRole("tab", { name: "Chat", exact: true }).waitFor();
    await tab.page.getByPlaceholder("Say something…").waitFor();
  }
  await sendStage("game", "Tide");

  for (const tab of tabs) check(await tab.page.evaluate(() => window.__chatTextExecuted === 0), `${tab.name} did not execute an injected sentinel`);
  check(requests.length === 0, `no injected resource requests${requests.length ? `: ${requests.join(", ")}` : ""}`);
  check(errors.length === 0, `no browser errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
  console.log("PASS chat-text-prove");
} finally {
  await browser?.close();
  await vite?.close();
  await stopHost(host);
  rmSync(TEMP, { recursive: true, force: true });
}
