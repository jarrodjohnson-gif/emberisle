// Lobby names and bots in real tabs through server/host.mjs (the host-side rules are in server/lobby-prove.mjs).
// 1. The title's name field can be emptied and retyped; the default and a trim apply only when the name is committed (blur, host, join).
// 2. A seated player renames from their own seat row: Enter or blur saves, Escape cancels; every tab sees it, the title's remembered
//    name follows, and it survives a reload (the saved seat is rejoined).
// 3. A guest has no Add bot or Remove; the host adds a bot, the table then starts with 2 people + 1 bot, and names are fixed in the game.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8106;
const ROOMS_DIR = mkdtempSync(path.join(tmpdir(), "emberisle-rooms-"));
process.on("exit", () => rmSync(ROOMS_DIR, { recursive: true, force: true }));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR, RESULTS_DIR: `${ROOMS_DIR}/results`, RENAME_MS: "0" },
});
process.on("exit", () => host.kill());
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));
const hostPort = await new Promise((resolve) =>
  host.stdout.on("data", (d) => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  }),
);
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
});

const T0 = Date.now();
const errors = [];
let code = 0;
const url = `http://127.0.0.1:${PORT}/?host=ws://127.0.0.1:${hostPort}`;
const check = (ok, what) => {
  if (!ok) throw new Error(what);
  console.log(`ok ${what}`, `+${((Date.now() - T0) / 1000).toFixed(1)}s`);
};

async function tab(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e}`));
  await page.addInitScript(() => {
    for (const fn of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      WebGL2RenderingContext.prototype[fn] = function () {};
    }
  });
  await page.goto(url);
  await page.getByTestId("title-card").waitFor();
  return { name, page };
}
const seatNames = (t) => t.page.locator('[data-testid="lobby-card"] ul > li').evaluateAll((lis) => lis.map((li) => li.querySelector('[data-testid="lobby-name"]')?.textContent?.replace(/ · host$/, "").trim()).filter((n) => n !== "Empty"));
const until = async (fn, what, ms = 8000) => {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out: ${what}`);
};
const remembered = (t) => t.page.evaluate(() => localStorage.getItem("emberisle-name"));

try {
  // 1. The title's name field.
  const hana = await tab("Hana");
  await hana.page.getByLabel("Your name", { exact: true }).click();
  const field = hana.page.getByLabel("Your name");
  await field.fill("Hana");
  await field.fill("");
  check((await field.inputValue()) === "", "title: deleting every letter leaves the field empty (it no longer snaps back to Ember)");
  await field.pressSequentially("Zed");
  check((await field.inputValue()) === "Zed", "title: retyping after clearing gives exactly what was typed");
  await field.fill("");
  await field.blur();
  check((await field.inputValue()) === "Ember" && (await remembered(hana)) === "Ember", "title: leaving an empty field commits the default, Ember");
  await field.fill("   Hana   ");
  check((await field.inputValue()) === "   Hana   ", "title: spaces are allowed while editing");
  await field.blur();
  check((await field.inputValue()) === "Hana" && (await remembered(hana)) === "Hana", "title: blur trims and remembers the name");
  await field.fill("");
  await hana.page.getByRole("button", { name: "Host a table" }).click();
  await hana.page.getByTestId("table-code").waitFor();
  const tableCode = (await hana.page.getByTestId("table-code").textContent()).trim();
  check((await seatNames(hana))[0] === "Ember", "title: hosting with an empty field sits down as Ember");
  check((await remembered(hana)) === "Ember", "title: and Ember is what is remembered");

  // 2. A guest joins and renames.
  const gus = await tab("Gus");
  await gus.page.getByLabel("Your name", { exact: true }).click();
  await gus.page.getByLabel("Your name").fill("Gus");
  await gus.page.getByLabel("Your name").blur();
  await gus.page.getByPlaceholder(/code/i).fill(tableCode);
  await gus.page.getByRole("button", { name: "Join" }).click();
  await gus.page.getByTestId("table-code").waitFor();
  await until(async () => (await seatNames(hana)).includes("Gus"), "Gus appears on the host");
  check((await gus.page.getByTestId("rename-seat").count()) === 1 && (await hana.page.getByTestId("rename-seat").count()) === 1, "lobby: each tab has one tap-to-rename name, its own");

  await gus.page.getByTestId("rename-seat").click();
  const input = gus.page.getByTestId("rename-input");
  check(await input.evaluate((el) => document.activeElement === el && el.maxLength === 16), "lobby: tapping your name opens a focused input, 16 characters at most");
  await input.fill("Gus the Great of the Wide Isles");
  check((await input.inputValue()).length <= 16, "lobby: the input stops at the title's length");
  await input.press("Enter");
  await until(async () => (await seatNames(hana)).includes("Gus the Great of"), "the host sees the new name");
  await until(async () => (await seatNames(gus)).includes("Gus the Great of"), "the renamer's own seat list");
  check(true, "lobby: the new name is on the renamer's own seat list");
  check((await remembered(gus)) === "Gus the Great of", "lobby: the rename is also the name the title remembers");
  check((await gus.page.getByTestId("rename-input").count()) === 0, "lobby: Enter closes the input");

  await gus.page.getByTestId("rename-seat").click();
  await gus.page.getByTestId("rename-input").fill("Nope");
  await gus.page.getByTestId("rename-input").press("Escape");
  check((await seatNames(gus)).includes("Gus the Great of") && (await remembered(gus)) === "Gus the Great of", "lobby: Escape keeps the old name");

  await gus.page.getByTestId("rename-seat").click();
  await gus.page.getByTestId("rename-input").fill("");
  await gus.page.getByTestId("rename-input").blur();
  check((await seatNames(gus)).includes("Gus the Great of"), "lobby: an empty name is not sent; the old one stays");

  await gus.page.getByTestId("rename-seat").click();
  await gus.page.getByTestId("rename-input").fill("  Gus  ");
  await hana.page.getByTestId("table-code").click();
  await gus.page.getByTestId("rename-input").blur();
  await until(async () => (await seatNames(hana)).includes("Gus"), "blur saves the trimmed name for everyone");

  // The rename survives a reload (the saved seat is rejoined, and the host kept the name).
  await gus.page.reload();
  await gus.page.getByTestId("table-code").waitFor();
  await until(async () => (await seatNames(gus)).includes("Gus") && (await seatNames(gus)).length === 2, "Gus is back in his seat after a reload");
  check((await seatNames(hana)).filter((n) => n === "Gus").length === 1, "lobby: after a reload the renamed seat is still one seat on the host");

  // 3. Bots.
  check((await gus.page.getByTestId("add-bot").count()) === 0 && (await gus.page.getByTestId("remove-bot").count()) === 0, "lobby: a guest has no Add bot");
  check((await hana.page.getByTestId("add-bot").count()) === 2, "lobby: the host has Add bot on each of the two Empty seats");
  await hana.page.getByTestId("add-bot").first().click();
  await until(async () => (await seatNames(gus)).includes("Bot"), "the bot appears on the guest");
  await until(async () => (await seatNames(hana)).includes("Bot"), "the bot appears on the host");
  check((await gus.page.getByTestId("add-bot").count()) === 0 && (await gus.page.getByTestId("remove-bot").count()) === 0, "lobby: a guest still cannot add or remove");
  check((await hana.page.getByTestId("remove-bot").count()) === 1 && (await hana.page.getByTestId("add-bot").count()) === 1, "lobby: the host can remove the bot, and add one more");
  await hana.page.getByTestId("remove-bot").click();
  await until(async () => !(await seatNames(gus)).includes("Bot"), "removing a bot empties its seat for everyone");
  await hana.page.getByTestId("add-bot").first().click();
  await until(async () => (await seatNames(gus)).includes("Bot"), "the bot is back");
  await until(async () => (await hana.page.getByTestId("lobby-status").textContent()).includes("ready"), "the status counts the bot");
  check(true, "lobby: a bot counts toward the three: the status asks for readiness, not for players");

  await hana.page.getByRole("button", { name: "Ready", exact: true }).click();
  await gus.page.getByRole("button", { name: "Ready", exact: true }).click();
  await hana.page.getByRole("button", { name: "Start", exact: true }).click();
  await Promise.all([hana, gus].map((t) => t.page.waitForFunction(() => window.__emberisle.getState().screen === "play")));
  const players = await hana.page.evaluate(() => window.__emberisle.getState().state.players.map((p) => `${p.kind}:${p.name}`));
  check(players.join() === "human:Ember,human:Gus,bot:Bot", `a table of 2 people + 1 bot starts (${players})`);
  check(errors.length === 0, "zero console errors in all tabs");
  console.log("lobby prove ok");
} catch (e) {
  console.log("FAIL", e.message);
  if (errors.length) console.log(errors.join("\n"));
  code = 1;
} finally {
  await browser.close();
  await vite.close();
  host.kill();
  if (host.exitCode === null && host.signalCode === null) await Promise.race([once(host, "exit"), new Promise((r) => setTimeout(r, 3000).unref())]);
}
process.exit(code);
