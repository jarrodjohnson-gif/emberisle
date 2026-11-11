// #442: the table's top chrome is one menu button. In hotseat at 1280x720, 390x844 (touch) and 844x390 (touch):
// - no visible element on the table says "Emberisle", and the only button in the top 64 px (the seat strip aside, on a
//   sideways phone) is the 44 px "Table menu" button, top-right;
// - it opens a sheet with the turn number, How to play, Sound, Haptics (#542, when coarse and vibrate exists), Water
//   (Crystal / Simple), View (Diorama / Overhead, #597) and Leave table, focus moving to the first row; at 1280x720 Water
//   flips the sea's path both ways and the choice survives a reload (crystal-water.md);
// - How to play opens its dialog and closing that puts the focus back on the menu button; the Sound panel and the haptics toggle
//   flip and keep the sheet open; Escape closes the sheet and refocuses the button; Enter on the button opens it; a tap
//   outside closes it;
// - online (a faked socket): the sheet shows the watcher count and "Copy code" (copied where the clipboard works, the
//   select-and-copy field where it does not, as on CI; both are run), Leave table asks first (Stay, Escape
//   and the 5 s auto-cancel return to the rows with the focus on Leave table), then leaves; hotseat Leave table asks
//   "Leave the table? The game ends." the same way (#1449), and practice Leave table goes straight to the title.
// Zero console errors. Run: npm run table-menu-prove
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8107;
const VIEWS = [
  { tag: "1280x720", width: 1280, height: 720 },
  { tag: "390x844", width: 390, height: 844, touch: true, noClipboard: true },
  { tag: "844x390", width: 844, height: 390, touch: true },
];
// #1501: every control sits inside the menu panel, including the phone where Overhead used to pass the right edge.
// A row below the fold may scroll; it still belongs to the menu. One that runs past the side does not.
const FIT = [
  { tag: "320x568", width: 320, height: 568 },
  { tag: "375x812", width: 375, height: 812 },
  { tag: "390x844", width: 390, height: 844 },
  { tag: "430x932", width: 430, height: 932 },
  { tag: "820x1180", width: 820, height: 1180 },
  { tag: "844x390", width: 844, height: 390 },
];

function check(ok, label, detail) {
  if (!ok) assert.fail(detail ? `${label}: ${detail}` : label);
  console.log(`ok  ${label}`);
}

mkdirSync("test-results", { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
let code = 0;
try {
  for (const v of FIT) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${v.tag} fit: ${e}`));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => window.__emberisle);
    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    const trigger = page.getByRole("button", { name: "Table menu" });
    await trigger.waitFor();
    await trigger.click();
    const menu = page.getByRole("dialog", { name: "Table menu" });
    await menu.waitFor();
    const outside = await menu.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const eps = 1;
      const contentTop = box.top - el.scrollTop;
      const contentBottom = contentTop + el.scrollHeight;
      const controls = [...el.querySelectorAll("button, [role='group'], input, a")];
      const bad = [];
      for (const control of controls) {
        const r = control.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const range = document.createRange();
        range.selectNodeContents(control);
        const text = range.getBoundingClientRect();
        const name = (control.getAttribute("aria-label") || control.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
        const pastSide = r.left < box.left - eps || r.right > box.right + eps || (text.width > 0 && (text.left < box.left - eps || text.right > box.right + eps));
        const pastEnd = r.top < contentTop - eps || r.bottom > contentBottom + eps;
        const clipped = control.scrollWidth > control.clientWidth + 1 || control.scrollHeight > control.clientHeight + 1;
        if (pastSide || pastEnd || clipped) bad.push({ name, pastSide, pastEnd, clipped, right: Math.round((r.right - box.right) * 10) / 10 });
      }
      return bad;
    });
    check(outside.length === 0, `${v.tag}: every control sits inside the menu`, JSON.stringify(outside));
    // #1501 review: Water and View keep the same left and right inset as the other rows (How to play is the reference):
    // the icon-and-label column starts where the other rows' icons start, and the last choice ends a row inset short of
    // the panel's edge. Their two choices still share one line, each at least 44x44.
    const inset = await menu.evaluate((el) => {
      const ref = [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === "How to play");
      const refBox = ref.getBoundingClientRect();
      const refStyle = getComputedStyle(ref);
      const refIcon = ref.querySelector("svg").getBoundingClientRect();
      return ["water-toggle", "view-toggle"].map((id) => {
        const row = el.querySelector(`[data-testid="${id}"]`);
        const box = row.getBoundingClientRect();
        const style = getComputedStyle(row);
        const label = row.firstElementChild.getBoundingClientRect();
        const choices = [...row.querySelectorAll("button")].map((b) => b.getBoundingClientRect());
        const last = choices.at(-1);
        return {
          id,
          padLeft: style.paddingLeft,
          padRight: style.paddingRight,
          refPadLeft: refStyle.paddingLeft,
          refPadRight: refStyle.paddingRight,
          rowLeft: Math.round((box.left - refBox.left) * 10) / 10,
          rowRight: Math.round((box.right - refBox.right) * 10) / 10,
          labelLeft: Math.round((label.left - refIcon.left) * 10) / 10,
          rightGap: Math.round((refBox.right - last.right) * 10) / 10,
          oneLine: choices.length === 2 && Math.abs(choices[0].top - choices[1].top) < 1,
          minWidth: Math.round(Math.min(...choices.map((c) => c.width)) * 10) / 10,
          minHeight: Math.round(Math.min(...choices.map((c) => c.height)) * 10) / 10,
        };
      });
    });
    for (const r of inset) {
      const pad = parseFloat(r.refPadRight);
      const ok =
        r.padLeft === r.refPadLeft &&
        r.padRight === r.refPadRight &&
        Math.abs(r.rowLeft) <= 1 &&
        Math.abs(r.rowRight) <= 1 &&
        Math.abs(r.labelLeft) <= 1 &&
        r.rightGap >= pad - 1 &&
        r.oneLine &&
        r.minWidth >= 44 &&
        r.minHeight >= 44;
      check(ok, `${v.tag}: ${r.id} keeps the other rows' inset and its choices share the row`, JSON.stringify(r));
    }
    // Owner q1503-menu-fit D: the Water row's choice boxes and the View row's never touch or overlap; a gap of at least
    // 4 px stays between them (bottom of every Water choice to the top of every View choice).
    const between = await menu.evaluate((el) => {
      const boxes = (id) => [...el.querySelectorAll(`[data-testid="${id}"] button`)].map((b) => b.getBoundingClientRect());
      const water = boxes("water-toggle"), view = boxes("view-toggle");
      const gap = Math.min(...view.map((b) => b.top)) - Math.max(...water.map((b) => b.bottom));
      return { gap: Math.round(gap * 10) / 10, water: water.length, view: view.length };
    });
    check(between.water === 2 && between.view === 2 && between.gap >= 4, `${v.tag}: the Water and View choice boxes keep a gap of at least 4 px`, JSON.stringify(between));
    // Owner q1503-menu-gap D: Water and View are one aligned grid. Crystal over Diorama and Simple over Overhead share
    // the same left edge and width (within 0.5 px), and every box is at least 44x44.
    const grid = await menu.evaluate((el) => {
      const boxes = (id) => [...el.querySelectorAll(`[data-testid="${id}"] button`)].map((b) => b.getBoundingClientRect());
      const water = boxes("water-toggle"), view = boxes("view-toggle");
      const r = (n) => Math.round(n * 10) / 10;
      return {
        count: [water.length, view.length],
        left: water.map((b, i) => r(b.left - view[i].left)),
        width: water.map((b, i) => r(b.width - view[i].width)),
        min: r(Math.min(...[...water, ...view].flatMap((b) => [b.width, b.height]))),
      };
    });
    check(
      grid.count[0] === 2 && grid.count[1] === 2 && grid.left.every((d) => Math.abs(d) <= 0.5) && grid.width.every((d) => Math.abs(d) <= 0.5) && grid.min >= 44,
      `${v.tag}: Water and View boxes share left edges and widths column by column`,
      JSON.stringify(grid),
    );
    await ctx.close();
  }
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
      "Sound100%›",
      ...(hasHaptics ? ["Haptics on"] : []),
      "Crystal",
      "Simple",
      "Diorama",
      "Overhead",
      "Report a bug",
      "Leave table",
    ];
    assert.deepEqual(rows.map((t) => t.trim()), ["How to play", "Costs", "Sound100%›", "Crystal", "Simple", "Diorama", "Overhead", "Report a bug", "Leave table"], `${v.tag}: menu rows`);
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

    // Sound (#669): the row opens the Sound panel (sound-sheet-prove covers the panel); All sound's mute flips, the row reads Off, and Back returns to the rows.
    await trigger.click();
    await menu.waitFor();
    await menu.getByTestId("sound-entry").click();
    const sound = page.getByRole("dialog", { name: "Sound" });
    await sound.getByRole("button", { name: "Mute All sound" }).click();
    await sound.getByRole("button", { name: "Unmute All sound" }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("emberisle-muted")), "1", `${v.tag}: muting is remembered`);
    await sound.getByRole("button", { name: "Back to Table menu" }).click();
    assert.match(await menu.getByTestId("sound-entry").textContent(), /Off/, `${v.tag}: the Sound row reads Off while muted`);
    await menu.getByTestId("sound-entry").click();
    await sound.getByRole("button", { name: "Unmute All sound" }).click();
    await sound.getByRole("button", { name: "Mute All sound" }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem("emberisle-muted")), null, `${v.tag}: unmuting clears it`);
    await sound.getByRole("button", { name: "Back to Table menu" }).click();
    await menu.getByTestId("sound-entry").waitFor();

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

    // Report a bug (#912): a 44 px row that opens the prefilled GitHub issue in a new tab, with the game left where it is.
    const report = menu.getByRole("button", { name: "Report a bug, opens GitHub in a new tab", exact: true });
    assert.equal(Math.round((await report.boundingBox()).height), 44, `${v.tag}: Report a bug is a 44 px row`);
    assert.equal(await report.locator("svg.lucide-bug").count(), 1, "Report a bug uses the Bug icon");
    await page.evaluate(() => { window.__opened = []; window.open = (...a) => (window.__opened.push(a), null); });
    await report.click();
    const [openedUrl, target, features] = (await page.evaluate(() => window.__opened))[0] ?? [];
    const issue = new URL(openedUrl);
    assert.equal(issue.origin + issue.pathname, "https://github.com/jarrodjohnson-gif/emberisle/issues/new", `${v.tag}: report link goes to the new-issue page`);
    const gs = await page.evaluate(() => { const s = window.__emberisle.getState().state; return { seed: s.seed, seq: s.seq }; });
    assert.match(issue.searchParams.get("body"), new RegExp(`^Build: .+\\nSeed: ${gs.seed}\\nSeq: ${gs.seq}\\nViewport: ${v.width}x${v.height}\\n`), `${v.tag}: report body`);
    assert.equal(target, "_blank", `${v.tag}: report opens a new tab`);
    assert.match(features, /noopener/, `${v.tag}: report link is noopener`);
    assert.equal(await page.evaluate(() => window.__emberisle.getState().screen), "play", `${v.tag}: the game stays at the table`);

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
    const bugIcon = menu.getByTestId("report-bug").locator("svg");
    const logIcon = menu.getByRole("button", { name: "Copy log", exact: true }).locator("svg");
    await logIcon.waitFor();
    assert.equal(await logIcon.getAttribute("class").then(value => value.includes("lucide-scroll-text")), true, "Copy log keeps its ScrollText icon");
    assert.notDeepEqual(await bugIcon.locator("path").evaluateAll(paths => paths.map(p => p.getAttribute("d"))), await logIcon.locator("path").evaluateAll(paths => paths.map(p => p.getAttribute("d"))), "Report a bug and Copy log have different icon paths");

    await menu.getByRole("button", { name: "Copy code K7QP" }).click();
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
        await menu.getByRole("button", { name: "Copy code K7QP" }).click();
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

    // #1449: hotseat Leave table asks too (the game ends, nothing is saved); Stay keeps the game, Leave goes to the title.
    await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
    await trigger.click();
    await menu.getByRole("button", { name: "Leave table" }).click();
    await confirmBox.waitFor();
    assert.match(await confirmBox.textContent(), /Leave the table\? The game ends\./, `${v.tag}: hotseat Leave asks first`);
    await confirmBox.getByRole("button", { name: "Stay" }).click();
    await confirmBox.waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => window.__emberisle.getState().screen), "play", `${v.tag}: hotseat Stay keeps the game`);
    for (let tries = 0; (await page.evaluate(() => window.__emberisle.getState().screen)) !== "title"; tries++) {
      assert.ok(tries < 5, `${v.tag}: hotseat Leave never left the table`);
      if (!(await confirmBox.count())) await menu.getByRole("button", { name: "Leave table" }).click();
      await confirmBox.getByRole("button", { name: "Leave", exact: true }).click({ timeout: 5000 }).catch((e) => console.log(`${v.tag}: hotseat Leave click retried: ${String(e).split("\n")[0]}`));
    }
    // Practice keeps its one press.
    await page.evaluate(() => window.__emberisle.getState().startAi());
    await trigger.click();
    await menu.getByRole("button", { name: "Leave table" }).click();
    await page.waitForFunction(() => window.__emberisle.getState().screen === "title");
    assert.equal(await confirmBox.count(), 0, `${v.tag}: practice Leave asked for confirmation`);
    console.log(`${v.tag}: hotseat Leave table asks "Leave the table? The game ends.", Stay stays, Leave leaves; practice leaves on one press`);
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
    console.log(`${v.tag}: one ${b.w}x${b.h} menu button top-right, no wordmark; rows ${allRows.length}; How to play, sounds, code (${copied}), Leave (asks online and in hotseat) all work; Escape and Close refocus the button`);
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
