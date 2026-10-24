// #442: the table's top chrome is one menu button. In hotseat at 1280x720, 390x844 (touch) and 844x390 (touch):
// - no visible element on the table says "Emberisle", and the only button in the top 64 px (the seat strip aside, on a
//   sideways phone) is the 44 px "Table menu" button, top-right;
// - it opens a sheet with the turn number, How to play, Table sounds, Haptics (#542, when coarse and vibrate exists), Water
//   (Crystal / Simple), View (Diorama / Overhead, #597) and Leave table, focus moving to the first row; at 1280x720 Water
//   flips the sea's path both ways and the choice survives a reload (crystal-water.md);
// - How to play opens its dialog and closing that puts the focus back on the menu button; the sound and haptics toggles
//   flip and keep the sheet open; Escape closes the sheet and refocuses the button; Enter on the button opens it; a tap
//   outside closes it;
// - online (a faked socket): the sheet shows the watcher count and "Copy table code" (copied where the clipboard works, the
//   select-and-copy field where it does not, as on CI; both are run), Leave table asks first (Stay, Escape
//   and the 5 s auto-cancel return to the rows with the focus on Leave table), then leaves; hotseat Leave table goes
//   straight to the title.
// Zero console errors. Run: npm run table-menu-prove
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8107;
const VIEWS = [
  { tag: "1280x720", width: 1280, height: 720 },
  { tag: "390x844", width: 390, height: 844, touch: true, noClipboard: true },
  { tag: "844x390", width: 844, height: 390, touch: true },
];

mkdirSync("test-results", { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
let code = 0;
try {
  for (const v of VIEWS) {
    // The clipboard path is granted explicitly (a headless runner has no clipboard otherwise); the no-clipboard path removes it.
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      hasTouch: !!v.touch,
      isMobile: !!v.touch,
      permissions: v.noClipboard ? [] : ["clipboard-read", "clipboard-write"],
    });
    const page = await ctx.newPage();
    if (v.noClipboard) await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { value: undefined }));
    page.on("console", (m) => m.type() === "error" && errors.push(`${v.tag}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);
    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    const trigger = page.getByRole("button", { name: "Table menu" });
    const menu = page.getByRole("dialog", { name: "Table menu" });
    await trigger.waitFor();

    const top = await page.evaluate(() => {
      const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
      const wordmark = [...document.querySelectorAll("body *")].filter((el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes("Emberisle")));
      const buttons = [...document.querySelectorAll("button")]
        .filter((b) => visible(b) && b.getBoundingClientRect().top < 64 && !b.closest('[data-testid="seat-strip"]'))
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { name: b.getAttribute("aria-label") || b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(innerWidth - r.right), top: Math.round(r.top) };
        });
      return { wordmark: wordmark.map((el) => el.textContent.trim()), buttons };
    });
    assert.deepEqual(top.wordmark, [], `${v.tag}: nothing on the table says Emberisle`);
    assert.equal(top.buttons.length, 1, `${v.tag}: one button in the top 64 px: ${JSON.stringify(top.buttons)}`);
    const [b] = top.buttons;
    assert.equal(b.name, "Table menu", `${v.tag}: the one button is the menu`);
    assert.ok(b.w >= 44 && b.h >= 44, `${v.tag}: the menu button is ${b.w}x${b.h}, under 44 px`);
    assert.ok(b.right < 32 && b.top < 32, `${v.tag}: the menu button sits top-right (${JSON.stringify(b)})`);

    // Open: the rows, the turn line, and the focus on the first row. Haptics appears only where the API and pointer guards allow it (#542).
    await trigger.click();
    await menu.waitFor();
    const hasVibrate = await page.evaluate(() => typeof navigator.vibrate === "function");
    const hasHaptics = hasVibrate && await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
    const allRows = await menu.getByRole("button").allTextContents();
    const rows = allRows.filter(text => text.trim() !== "Haptics on");
    const expected = [
      "How to play",
      "Costs",
      "Table sounds on",
      "Music on",
      ...(hasHaptics ? ["Haptics on"] : []),
      "Crystal",
      "Simple",
      "Diorama",
      "Overhead",
      "Leave table",
    ];
    assert.deepEqual(rows.map((t) => t.trim()), ["How to play", "Costs", "Table sounds on", "Music on", "Crystal", "Simple", "Diorama", "Overhead", "Leave table"], `${v.tag}: menu rows`);
    assert.deepEqual(allRows.map((t) => t.trim()), expected, `${v.tag}: complete menu including haptics`);
    assert.match(await menu.textContent(), /Turn 1/, `${v.tag}: the turn number moved into the menu`);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), "How to play", `${v.tag}: focus moves to the first row`);
    assert.equal(await trigger.getAttribute("aria-expanded"), "true", `${v.tag}: aria-expanded while open`);
    const fits = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
    });
    assert.ok(fits, `${v.tag}: the sheet is inside the viewport`);
    await page.waitForFunction(() => window.__isle?.caps.size > 0 && window.__isle.renders > 5, null, { timeout: 90_000 });
    await page.screenshot({ path: `test-results/table-menu-${v.tag}.png` });

    // How to play works from the menu and gives the focus back to the button.
    await menu.getByRole("button", { name: "How to play" }).click();
    const howTo = page.getByRole("dialog", { name: "How to play" });
    await howTo.waitFor();
    assert.equal(await menu.count(), 0, `${v.tag}: picking How to play closes the menu`);
    await howTo.getByRole("button", { name: "Close" }).click();
    await howTo.waitFor({ state: "detached" });
    assert.ok(await trigger.evaluate((el) => document.activeElement === el), `${v.tag}: closing How to play returns the focus to the menu button`);

    // Sound: the toggle flips and the sheet stays open.
    await trigger.click();
    await menu.waitFor();
    await menu.getByRole("button", { name: "Table sounds on" }).click();
    await menu.getByRole("button", { name: "Table sounds off" }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("emberisle-muted")), "1", `${v.tag}: muting is remembered`);
    await menu.getByRole("button", { name: "Table sounds off" }).click();
    await menu.getByRole("button", { name: "Table sounds on" }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("emberisle-muted")), null, `${v.tag}: unmuting clears it`);

    // Haptics (#542): flip off/on; the sheet stays open; the choice is remembered.
    if (hasHaptics) {
      await menu.getByTestId("haptics-toggle").click();
      await menu.getByRole("button", { name: "Haptics off" }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem("emberisle-haptics")), "0", `${v.tag}: haptics off is remembered`);
      await menu.getByTestId("haptics-toggle").click();
      await menu.getByRole("button", { name: "Haptics on" }).waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem("emberisle-haptics")), "1", `${v.tag}: haptics on is remembered`);
    }

    if (!hasHaptics) assert.equal(await menu.getByTestId("haptics-toggle").count(), 0, `${v.tag}: unsupported Haptics row is absent`);

    // Escape closes and refocuses the button; Enter on the button opens; a pointer outside closes.
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "detached" });
    assert.ok(await trigger.evaluate((el) => document.activeElement === el), `${v.tag}: Escape returns the focus to the menu button`);
    assert.equal(await trigger.getAttribute("aria-expanded"), "false", `${v.tag}: aria-expanded after close`);
    await page.keyboard.press("Enter");
    await menu.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), "How to play", `${v.tag}: Enter opens with the focus on the first row`);
    const canvas = page.locator("canvas").first();
    // The version footer can reach the viewport centre. Measure an actual outside point rather than tapping its text.
    const box = await menu.boundingBox(), surface = await canvas.boundingBox();
    const outside = { x: Math.min(v.width / 2, box.x - 12), y: v.height / 2 };
    assert.ok(outside.x >= surface.x && outside.x < box.x && outside.y >= surface.y && outside.y < surface.y + surface.height, `${v.tag}: outside gesture stays on the canvas, left of the sheet`);
    assert.ok(await canvas.evaluate((el, p) => document.elementFromPoint(p.x, p.y) === el, outside), `${v.tag}: the outside point really hits the canvas`);
    if (!await canvas.evaluate((el, p) => document.elementFromPoint(p.x, p.y) === el, outside)) {
      throw new Error("no exposed board point outside the menu");
    }
    const position = { x: outside.x - surface.x, y: outside.y - surface.y };
    if (v.touch) await canvas.tap({ position });
    else await canvas.click({ position });
    await menu.waitFor({ state: "detached" });

    // Online: the watcher count and the table code live in the sheet; Leave asks first.
    await page.evaluate(() => window.__emberisle.setState({ mode: "online", code: "K7QP", watching: 2, net: { act: () => true, close: () => {} } }));
    await trigger.click();
    await menu.waitFor();
    assert.equal(await menu.getByTestId("watching-count").textContent().then((t) => t.trim()), "2", `${v.tag}: the watcher count is in the menu`);
    await menu.getByRole("button", { name: "Copy table code K7QP" }).click();
    const copied = v.noClipboard ? "fallback" : "copied";
    const clipboard = await page.evaluate(() => navigator.clipboard?.writeText("probe").then(() => "writes", (e) => `rejects: ${e}`) ?? "missing");
    assert.equal(clipboard, v.noClipboard ? "missing" : "writes", `${v.tag}: navigator.clipboard is ${clipboard}`);
    if (v.noClipboard) {
      await menu.getByTestId("copy-fallback").waitFor();
      assert.equal(await menu.getByTestId("copy-fallback").inputValue(), "K7QP", `${v.tag}: the fallback field holds the code`);
      assert.equal(await page.evaluate(() => document.activeElement?.value), "K7QP", `${v.tag}: the fallback field takes the focus`);
      // A failed copy is forgotten when the menu closes (Escape, then an outside tap): the next open shows no field and
      // opens on How to play.
      const reopen = async (how) => {
        await menu.getByRole("button", { name: "Copy table code K7QP" }).click();
        await menu.getByTestId("copy-fallback").waitFor();
        if (how === "escape") await page.keyboard.press("Escape");
        // Left of the 256 px sheet on a narrow phone, where the taller sheet's copy field now reaches the middle.
        else await canvas.tap({ position: { x: Math.min(v.width / 2, v.width - 320), y: v.height / 2 } });
        await menu.waitFor({ state: "detached" });
        await trigger.click();
        await menu.waitFor();
        assert.equal(await menu.getByTestId("copy-fallback").count(), 0, `${v.tag}: after ${how} the next open shows no stale copy field`);
        assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), "How to play", `${v.tag}: after ${how} the next open focuses How to play`);
      };
      await reopen("escape");
      await reopen("an outside tap");
    } else await menu.getByRole("button", { name: "Copied" }).waitFor();
    const confirmBox = page.getByTestId("leave-confirm");
    // The question folds itself away after 5 s, and a click needs the Stay button still over two animation frames. On
    // software GL the GPU probe's measured frames (crystal-water.md) and a view's first glide are the slowest the island
    // draws, so the sequence starts once the probe has reported and the camera is at rest.
    await page.waitForFunction(() => window.__emberisle.getState().water && !window.__isle.probe && !window.__isle.glide && !window.__isle.refitDue, null, { timeout: 60_000 });
    await menu.getByRole("button", { name: "Leave table" }).click();
    await confirmBox.waitFor();
    assert.match(await confirmBox.textContent(), /Leave the table\? Your seat goes to the bot\./, `${v.tag}: the question`);
    await confirmBox.getByRole("button", { name: "Stay" }).click();
    await confirmBox.waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), "Leave table", `${v.tag}: Stay returns the focus to Leave table`);
    await menu.getByRole("button", { name: "Leave table" }).click();
    await confirmBox.waitFor();
    await page.keyboard.press("Escape");
    await confirmBox.waitFor({ state: "detached" });
    assert.equal(await menu.count(), 1, `${v.tag}: Escape on the question keeps the menu`);
    // Left alone, the question folds back into the rows after 5 s, with the focus on Leave table.
    await menu.getByRole("button", { name: "Leave table" }).click();
    await confirmBox.waitFor();
    await confirmBox.waitFor({ state: "detached", timeout: 8000 });
    assert.equal(await menu.count(), 1, `${v.tag}: the 5 s auto-cancel keeps the menu`);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), "Leave table", `${v.tag}: the 5 s auto-cancel returns the focus to Leave table`);
    assert.equal(await page.evaluate(() => window.__emberisle.getState().screen), "play", `${v.tag}: Stay and Escape stay at the table`);
    // The question cancels itself after 5 s; a slow runner can lose that race between the two clicks, so ask again.
    for (let tries = 0; (await page.evaluate(() => window.__emberisle.getState().screen)) !== "title"; tries++) {
      assert.ok(tries < 5, `${v.tag}: Leave never left the table`);
      if (!(await confirmBox.count())) await menu.getByRole("button", { name: "Leave table" }).click();
      await confirmBox.getByRole("button", { name: "Leave", exact: true }).click({ timeout: 5000 }).catch((e) => console.log(`${v.tag}: Leave click retried: ${String(e).split("\n")[0]}`));
    }

    // Hotseat: Leave table is one press.
    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    await trigger.click();
    await menu.getByRole("button", { name: "Leave table" }).click();
    await page.waitForFunction(() => window.__emberisle.getState().screen === "title");
    assert.equal(await confirmBox.count(), 0, `${v.tag}: hotseat Leave asked for confirmation`);
    if (v.tag === "1280x720") {
      // Water: each chip switches the sea in place, as a saved choice, and the last one is still chosen after a reload.
      const water = () => page.evaluate(() => ({ ...window.__emberisle.water, saved: localStorage.getItem("emberisle-water") }));
      await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
      for (const [chip, path] of [["Crystal", "crystal"], ["Simple", "simple"]]) {
        await trigger.click();
        await menu.getByRole("button", { name: chip }).click();
        await page.waitForFunction((p) => window.__emberisle.water?.path === p && window.__isle.waterPath === p, path);
        const w = await water();
        assert.ok(w.source === "saved" && w.saved === path, `${v.tag}: Water ${chip} is the saved choice: ${JSON.stringify(w)}`);
        assert.equal(await menu.getByRole("button", { name: chip }).getAttribute("aria-pressed"), "true", `${v.tag}: ${chip} shows pressed`);
        await page.keyboard.press("Escape");
      }
      await page.reload();
      await page.waitForFunction(() => window.__emberisle?.water);
      const kept = await water();
      assert.ok(kept.path === "simple" && kept.source === "saved", `${v.tag}: the Water choice survives a reload: ${JSON.stringify(kept)}`);
      console.log(`${v.tag}: Water flips the sea crystal <-> simple in place and keeps the choice across a reload`);
    }
    console.log(`${v.tag}: one ${b.w}x${b.h} menu button top-right, no wordmark; rows ${allRows.length}; How to play, sounds, code (${copied}), Leave (asks online, one press in hotseat) all work; Escape and Close refocus the button`);
    await ctx.close();
  }
  assert.deepEqual(errors, [], "console errors");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
