import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const out = "docs/proofs/1103";
mkdirSync(out, { recursive: true });
const rooms = mkdtempSync(path.join(tmpdir(), "emberisle-1103-rooms-"));
const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
  cwd: new URL("../server/", import.meta.url),
  env: { ...process.env, PORT: "0", ROOMS_DIR: rooms },
});
const hostPort = await new Promise((resolve, reject) => {
  host.on("error", reject);
  host.stdout.on("data", d => {
    const m = String(d).match(/listening (\d+)/);
    if (m) resolve(Number(m[1]));
  });
  host.on("exit", code => reject(new Error(`host exited ${code}`)));
});
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${hostPort}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const results = [];
async function client(name, viewport, touch) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(n => {
    localStorage.setItem("emberisle-name", n);
    localStorage.setItem("emberisle-jelly", "lite");
    window.__copies = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => { window.__copies.push(text); } } });
  }, name);
  await page.goto(url);
  await page.waitForFunction(() => !!window.__emberisle);
  return page;
}
async function geometry(page, minimum) {
  const data = await page.evaluate(() => {
    const rect = el => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const card = document.querySelector(".lobby-cover");
    const people = document.querySelector('[data-testid="lobby-players"]');
    const chat = document.querySelector('[data-testid="lobby-chat"]');
    const controls = [...card.querySelectorAll("button, input")].filter(el => el.getBoundingClientRect().width > 0);
    return {
      card: rect(card), chat: rect(chat),
      overflow: [card.scrollWidth - card.clientWidth, card.scrollHeight - card.clientHeight, people.scrollWidth - people.clientWidth, people.scrollHeight - people.clientHeight],
      seats: [...people.children].map(rect),
      controls: controls.map(el => ({ label: el.getAttribute("aria-label") || el.textContent || el.placeholder, ...rect(el) })),
      background: getComputedStyle(card).backgroundColor,
    };
  });
  assert.deepEqual(data.overflow, [0, 0, 0, 0], "card and people never scroll");
  assert.equal(data.background, "rgb(243, 246, 245)", "neutral light card");
  assert.equal(data.seats[0].y, data.seats[1].y, "first pair shares a row");
  assert.equal(data.seats[2].y, data.seats[3].y, "second pair shares a row");
  assert.ok(data.seats[2].y >= data.seats[0].bottom + 8, "people rows have 8px gap");
  const share = data.chat.width * data.chat.height / (data.card.width * data.card.height);
  assert.ok(share >= minimum, `chat share ${share} >= ${minimum}`);
  for (const c of data.controls) {
    assert.ok(c.width >= 44 && c.height >= 44, `${c.label}: target ${c.width}x${c.height}`);
    assert.ok(c.x >= data.card.x && c.right <= data.card.right && c.y >= data.card.y && c.bottom <= data.card.bottom, `${c.label}: inside card`);
  }
  for (let i = 0; i < data.controls.length; i++) for (const b of data.controls.slice(i + 1)) {
    const a = data.controls[i];
    const gap = Math.max(b.x - a.right, a.x - b.right, b.y - a.bottom, a.y - b.bottom);
    assert.ok(gap >= 7.99, `${a.label} / ${b.label}: gap ${gap}`);
  }
  return { ...data, share };
}
async function clearOfName(page, kind) {
  const bubble = page.locator(`[data-testid="${kind}"] > div`).first();
  await bubble.waitFor();
  const bounds = await bubble.evaluate(el => {
    const seat = el.closest("li");
    const name = seat.querySelector('[data-testid="lobby-name"]');
    const st = seat.querySelector(".lobby-player-status").getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const n = name.getBoundingClientRect();
    const s = seat.getBoundingClientRect();
    return {
      clear: b.right <= n.left || b.left >= n.right || b.bottom <= n.top || b.top >= n.bottom,
      clearStatus: b.right <= st.left || b.left >= st.right || b.bottom <= st.top || b.top >= st.bottom,
      inside: b.left >= s.left && b.right <= s.right && b.top >= s.top && b.bottom <= s.bottom,
    };
  });
  assert.ok(bounds.clearStatus, `${kind}: bubble clear of the seat status`);
  assert.ok(bounds.clear && bounds.inside, `${kind}: whole bubble stays inside its seat and clear of the name`);
}
try {
  for (const [width, height, minimum] of [[390, 844, .52], [844, 390, .39], [1280, 720, .40]]) {
    const page = await client("Jarrod", { width, height }, width < 1000);
    await page.evaluate(() => window.__emberisle.getState().hostTable());
    await page.getByTestId("lobby-card").waitFor();
    const code = (await page.getByTestId("table-code").textContent()).trim();
    const guest = await client("Josh", { width: 390, height: 844 }, true);
    await guest.evaluate(code => window.__emberisle.getState().joinTable(code), code);
    await guest.getByTestId("lobby-card").waitFor();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 2);
    await page.getByTestId("add-bot").first().click();
    await page.getByTestId("add-bot").first().click();
    await page.waitForFunction(() => window.__emberisle.getState().seats.length === 4);
    await page.evaluate(() => document.fonts.ready);
    for (const label of ["Copy", "Copy link", "Invite", "Rules", "Ready", "Leave the table"]) {
      assert.equal(await page.getByRole("button", { name: label, exact: true }).count(), 1, label);
    }
    assert.equal(await page.getByRole("tab").count(), 2);
    assert.equal(await page.getByTestId("emoji-row").locator("button").count(), 6);
    assert.equal(await page.getByRole("button", { name: "Start", exact: true }).count(), 0, "host sees no Start until everyone is ready");
    assert.equal(await guest.getByRole("button", { name: "Start", exact: true }).count(), 0, "guest cannot start");
    assert.equal(await guest.getByRole("radio").count(), 0, "guest cannot change target");
    assert.equal(await guest.getByTestId("remove-bot").count(), 0, "guest cannot remove bots");
    const data = await geometry(page, minimum);
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await page.waitForFunction(code => window.__copies.includes(code), code);
    await page.getByRole("button", { name: "Copy link", exact: true }).click();
    await page.waitForFunction(() => window.__copies.some(s => s.includes("?code=")));
    await page.evaluate(() => Object.defineProperty(navigator, "share", { configurable: true, value: async data => { window.__invitation = data; } }));
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    assert.ok((await page.evaluate(() => window.__invitation.url)).includes(`code=${code}`));
    await page.getByRole("button", { name: "Rules", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("radio", { name: "7 points" }).click();
    await guest.waitForFunction(() => window.__emberisle.getState().tableVictoryTarget === 7);
    await page.getByRole("radio", { name: "10 points" }).click();
    await guest.waitForFunction(() => window.__emberisle.getState().tableVictoryTarget === 10);
    await page.locator("#chat-input").fill("One more and we're ready.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await guest.getByTestId("chat-log").getByText("One more and we're ready.", { exact: false }).waitFor();
    assert.equal(await page.locator("#chat-input").inputValue(), "");
    await page.getByTestId("emoji-row").locator("button").first().click();
    await guest.getByTestId("react-line").waitFor();
    await clearOfName(page, "reaction");
    await page.getByRole("tab", { name: "Sounds & stickers" }).click();
    await page.getByTestId("sounds-tab").waitFor();
    assert.ok(await page.getByTestId("soundboard").locator("button").count() > 0);
    await guest.getByRole("tab", { name: "Sounds & stickers" }).click();
    await guest.getByRole("button", { name: "Play sound Wololo", exact: true }).click();
    await clearOfName(page, "sound-bubble");
    await guest.getByRole("tab", { name: "Chat", exact: true }).click();
    await page.getByRole("tab", { name: "Chat", exact: true }).click();
    await page.getByRole("button", { name: "Ready", exact: true }).click();
    await page.getByTestId("lobby-status").getByText("3 of 4 ready").waitFor();
    await page.waitForFunction(() => !!window.__isle);
    await page.screenshot({ path: `${out}/${width}x${height}.png` });
    await guest.getByRole("button", { name: "Ready", exact: true }).click();
    await page.getByRole("button", { name: "Start", exact: true }).waitFor();
    await geometry(page, minimum);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle.getState().screen === "play");
    await guest.waitForFunction(() => window.__emberisle.getState().screen === "play");
    results.push({ viewport: `${width}x${height}`, ...data });
    console.log(`${width}x${height}: chat ${(data.share * 100).toFixed(2)}%; two columns; 44px targets / 8px gaps; no card/people scroll; copy/invite/rules/target/chat/reaction/ready/start passed`);
    await page.context().close();
    await guest.context().close();
  }
  assert.deepEqual(errors, [], "zero browser errors");
  writeFileSync(`${out}/measurements.json`, JSON.stringify(results, null, 2) + "\n");
  console.log("lobby-layout-prove: ok; real host, two clients, three viewports; zero browser errors");
} finally {
  await browser.close();
  await vite.close();
  host.kill();
}
