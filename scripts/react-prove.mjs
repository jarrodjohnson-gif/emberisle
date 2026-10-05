// #467: a phone tap sends a board reaction to every seat within 300 ms without opening chat or moving the board.
// The receiving tab checks the actual seat float; every visible phone reaction control is at least 44 px.
// Reads VITE_PORT so it can run beside another local Vite process. Zero console errors.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8095;
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-react-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR },
});
process.on("exit", () => host.kill());
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));

const hostPort = await new Promise((resolve, reject) => {
  host.once("error", reject);
  host.stdout.on("data", (data) => {
    const match = String(data).match(/listening (\d+)/);
    if (match) resolve(Number(match[1]));
  });
});
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
});

const errors = [];
const url = `http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`;
function watch(name, page) {
  page.on("console", (message) => message.type() === "error" && errors.push(`${name}: ${message.text()}`));
  page.on("pageerror", (error) => errors.push(`${name}: ${error}`));
  page.on("response", (response) => response.status() >= 400 && errors.push(`${name}: ${response.status()} ${response.url()}`));
}

async function tab(name, phone = false) {
  const context = await browser.newContext(
    phone
      ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }
      : { viewport: { width: 1280, height: 720 } },
  );
  const page = await context.newPage();
  watch(name, page);
  await page.addInitScript((savedName) => localStorage.setItem("emberisle-name", savedName), name);
  await page.addInitScript(() => localStorage.setItem("emberisle-chat-open", "0"));
  // The board is only measured here; suppress software GL draws to keep the three browser contexts light.
  await page.addInitScript(() => {
    window.__draw = false;
    for (const method of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const original = WebGL2RenderingContext.prototype[method];
      WebGL2RenderingContext.prototype[method] = function (...args) {
        if (window.__draw) return original.apply(this, args);
      };
    }
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__emberisle);
  return { name, page, context };
}

const check = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`ok ${message}`);
};

try {
  const sender = await tab("Ember", true);
  const receiver = await tab("Tide");
  const third = await tab("Pine");
  await sender.page.getByRole("button", { name: "Host a table" }).tap();
  const code = (await sender.page.getByTestId("table-code").textContent()).trim();
  for (const guest of [receiver, third]) {
    await guest.page.getByPlaceholder(/code/i).fill(code);
    await guest.page.getByRole("button", { name: "Join" }).click();
    await guest.page.getByTestId("table-code").waitFor();
  }
  for (const player of [sender, receiver, third]) {
    await player.page.getByRole("button", { name: "Ready", exact: true }).click();
  }
  await sender.page.getByRole("button", { name: "Start", exact: true }).tap();

  for (const player of [sender, receiver, third]) {
    await player.page.getByRole("button", { name: "Quick reactions", exact: true }).waitFor({ timeout: 15_000 });
  }
  await sender.page.waitForFunction(() => window.__isle?.insets);
  await receiver.page.evaluate(() => {
    window.__reactionProof = [];
    window.__unsubscribeReactionProof = window.__emberisle.subscribe((next, previous) => {
      window.__reactionProof.push(...next.reactions.filter((reaction) => !previous.reactions.includes(reaction)).map((reaction) => ({ ...reaction, receivedAt: Date.now() })));
    });
  });
  await sender.page.evaluate(() => {
    const originalSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function (payload) {
      try {
        if (JSON.parse(String(payload)).type === "react") window.__reactionSentAt = Date.now();
      } catch {}
      return originalSend.call(this, payload);
    };
  });

  const before = await sender.page.evaluate(() => {
    const rect = document.querySelector("canvas").getBoundingClientRect();
    return { rect: [rect.x, rect.y, rect.width, rect.height], insets: window.__isle.insets() };
  });
  const trigger = sender.page.getByRole("button", { name: "Quick reactions", exact: true });
  await trigger.tap();
  const picker = sender.page.getByRole("group", { name: "Choose a reaction" });
  await picker.waitFor();
  const dimensions = await sender.page.evaluate(() => [...document.querySelectorAll('#quick-reaction-picker button')].map((button) => {
    const rect = button.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  check(dimensions.length >= 6 && dimensions.every((size) => size.width >= 44 && size.height >= 44), `phone reaction picker: ${dimensions.length} buttons are all at least 44x44 px`);
  await picker.getByRole("button", { name: "React happy", exact: true }).tap();
  await picker.waitFor({ state: "detached" });

  const reaction = await receiver.page.waitForFunction(() => window.__reactionProof.find((item) => item.emote === "😊") ?? null, null, { timeout: 5000 });
  const received = await reaction.jsonValue();
  const sentAt = await sender.page.evaluate(() => window.__reactionSentAt);
  check(received && sentAt && received.receivedAt - sentAt < 300, `one phone tap reaches another seat in ${received && sentAt ? received.receivedAt - sentAt : "over 300"} ms`);
  await receiver.page.getByTestId(`rail-${received.player}`).getByTestId("reaction").waitFor({ timeout: 300 });
  check(true, "the receiving tab renders the reaction over the sender's seat");

  const after = await sender.page.evaluate(() => {
    const rect = document.querySelector("canvas").getBoundingClientRect();
    return { rect: [rect.x, rect.y, rect.width, rect.height], insets: window.__isle.insets() };
  });
  check(JSON.stringify(after) === JSON.stringify(before), "opening the picker and sending a reaction leaves the board bounds and camera insets unchanged");
  check(await sender.page.evaluate(() => window.__emberisle.getState().chatOpen === false), "sending a board reaction leaves chat closed");
  await receiver.page.evaluate(() => window.__unsubscribeReactionProof());
  check(errors.length === 0, `zero console errors${errors.length ? `\n${errors.join("\n")}` : ""}`);
  console.log("react prove ok");
} catch (error) {
  console.error("FAIL", error instanceof Error ? error.message : String(error));
  if (errors.length) console.error(errors.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
