// docs/design/first-minute, slice 1: the title is a front page (the wordmark and Play) and a Play page (the choices), in one
// tray. The real game at 390x844, 844x390 and 1280x720. Every other proof opens on the Play page (scripts/proof-browser.mjs
// sets `__emberisleSkipIntro` to true); this one launches with `front: true`, so only the loading screen is skipped.
// - Front: one heading at 56 px, three controls (Play, How to play, sound), one primary, no field, no other words.
// - Play: Back, How to play, sound, Play with bots, Pass and play, Host a table, its open or private switch, the code field
//   and Join. One primary. The old words (Wayfarer, Practice, Hotseat, "Four seats, one table", "3 bots, no network") are gone.
// - Each state (front, Play, seat open, a code typed, a join link, a watch link): every control is 44 px or more both ways,
//   all text is 12 px or more, nothing is off screen, and the tray does not scroll at first paint.
// - Two taps start a bot game. Back returns to the front. Leaving a table opens the Play page, not the front.
// Zero page errors. Run: npm run first-minute-prove. SHOTS=1 also writes device-scale-2 PNGs (and adds 430x932) to
// docs/proofs/first-minute/.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const SHOTS = process.env.SHOTS === "1";
const OUT = "docs/proofs/first-minute";
const VIEWS = [
  ...(SHOTS ? [{ width: 430, height: 932, touch: true }] : []),
  { width: 390, height: 844, touch: true },
  { width: 844, height: 390, touch: true },
  { width: 1280, height: 720 },
];
if (SHOTS) mkdirSync(OUT, { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const base = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({
  front: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

// What the tray shows now: its page, its words, and every rule that holds in every state.
const read = (page) =>
  page.evaluate(() => {
    const card = document.querySelector('[data-testid="title-card"]');
    const c = card.getBoundingClientRect();
    const fg = getComputedStyle(document.documentElement).getPropertyValue("--color-fg").trim();
    const probe = document.createElement("div");
    probe.style.backgroundColor = fg;
    document.body.append(probe);
    const fgRgb = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const label = (n) => (n.textContent.trim() || n.getAttribute("aria-label") || n.getAttribute("placeholder") || n.tagName).slice(0, 28);
    const shown = (n) => n.checkVisibility() && n.getBoundingClientRect().width > 0;
    const controls = [...card.querySelectorAll("button, input, select, summary")].filter(shown);
    const small = controls
      .filter((n) => {
        const r = n.getBoundingClientRect();
        return r.width < 43.5 || r.height < 43.5;
      })
      .map((n) => `${label(n)} ${Math.round(n.getBoundingClientRect().width)}x${Math.round(n.getBoundingClientRect().height)}`);
    const out = [...card.querySelectorAll("h1, p, span, button, input, select, summary")]
      .filter(shown)
      .filter((n) => !n.classList.contains("sr-only"))
      .filter((n) => {
        const r = n.getBoundingClientRect();
        return r.top < -0.5 || r.left < -0.5 || r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5 ||
          r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5;
      })
      .map(label);
    const tiny = [];
    const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      const el = t.parentElement;
      if (!t.textContent.trim() || !shown(el) || el.classList.contains("sr-only")) continue;
      if (parseFloat(getComputedStyle(el).fontSize) < 12) tiny.push(t.textContent.trim().slice(0, 28));
    }
    const buttons = [...card.querySelectorAll("button:not([role=radio])")].filter(shown);
    return {
      page: card.dataset.page ?? null,
      joinLink: card.dataset.joinLink ?? null,
      headings: [...card.querySelectorAll("h1")].map((h) => `${h.textContent} ${getComputedStyle(h).fontSize}`),
      buttons: buttons.map(label),
      primary: buttons.filter((b) => getComputedStyle(b).backgroundColor === fgRgb).map(label),
      fields: [...card.querySelectorAll("input")].filter(shown).map(label),
      words: card.innerText.replace(/\s+/g, " ").trim(),
      small,
      out,
      tiny,
      scroll: card.scrollHeight - card.clientHeight,
      box: { left: c.left, top: c.top, right: c.right, bottom: c.bottom },
      view: { width: innerWidth, height: innerHeight },
    };
  });

// The rules every state keeps. Returns the reading, for the state's own checks.
async function state(page, tag, name, shot) {
  // A pointer left on a button tints it (hover), and the primary is found by its resting fill. The fill eases back over
  // 80 ms, so wait for it to rest.
  await page.mouse.move(1, 1);
  await page.waitForTimeout(300);
  const r = await read(page);
  assert.deepEqual(r.small, [], `${tag} ${name}: a control under 44 px`);
  assert.deepEqual(r.tiny, [], `${tag} ${name}: text under 12 px`);
  assert.deepEqual(r.out, [], `${tag} ${name}: off screen or outside the tray`);
  assert.ok(r.scroll <= 1, `${tag} ${name}: the tray scrolls ${r.scroll} px`);
  assert.ok(r.box.left >= 0 && r.box.top >= 0 && r.box.right <= r.view.width + 0.5 && r.box.bottom <= r.view.height + 0.5, `${tag} ${name}: the tray is on screen`);
  assert.ok(r.primary.length === 1, `${tag} ${name}: one primary, found ${JSON.stringify(r.primary)}`);
  if (SHOTS && shot) {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${shot}-${tag}.png` });
  }
  return r;
}

let code = 0;
try {
  for (const v of VIEWS) {
    const tag = `${v.width}x${v.height}`;
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      deviceScaleFactor: SHOTS ? 2 : 1,
      ...(v.touch ? { isMobile: true, hasTouch: true } : {}),
    });
    await ctx.addInitScript(() => localStorage.setItem("emberisle-name", "Ember"));
    const errors = [];
    const open = async (query = "") => {
      const page = await ctx.newPage();
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(String(e)));
      // No rules host runs here. A code in the field dials one for the colour peek, so accept the socket and stay silent.
      await page.routeWebSocket(/:8787\//, () => {});
      await page.goto(base + query);
      await page.getByTestId("title-card").waitFor();
      return page;
    };
    const page = await open();
    const press = (name) => (v.touch ? page.getByRole("button", { name, exact: true }).tap() : page.getByRole("button", { name, exact: true }).click());

    // Front: the wordmark and one button.
    const front = await state(page, tag, "front", "front");
    assert.equal(front.page, "front", `${tag}: the title opens on the front page`);
    assert.deepEqual(front.headings, ["Emberisle 56px"], `${tag} front: the wordmark`);
    assert.deepEqual(front.buttons, ["Play", "How to play", "Table sounds on"], `${tag} front: its three controls`);
    assert.deepEqual(front.primary, ["Play"], `${tag} front: Play is the primary`);
    assert.deepEqual(front.fields, [], `${tag} front: no field`);
    assert.equal(front.words, "Emberisle Play How to play", `${tag} front: the words on screen`);

    // Play: the choices.
    await press("Play");
    const play = await state(page, tag, "play", "play");
    assert.equal(play.page, "play", `${tag}: Play opens the Play page`);
    assert.deepEqual(play.headings, [], `${tag} play: no wordmark`);
    assert.deepEqual(play.primary, ["Play with bots"], `${tag} play: Play with bots is the primary`);
    for (const name of ["Back", "How to play", "Play with bots", "Pass and play", "Host a table", "Join"]) {
      assert.ok(play.buttons.includes(name), `${tag} play: ${name} is there, found ${JSON.stringify(play.buttons)}`);
    }
    assert.deepEqual(play.fields, ["Join code"], `${tag} play: one field, the code`);
    assert.ok(!/Wayfarer|Practice|Hotseat|Four seats|no network/.test(play.words), `${tag} play: an old word is back: ${play.words}`);

    // Seat settings open: name, four colours, Profile.
    await page.locator("summary[aria-label='Your seat']").click();
    const seat = await state(page, tag, "seat open", "seat");
    assert.deepEqual(seat.fields, ["Join code", "Your name"], `${tag} seat: the name field`);
    assert.ok(seat.buttons.includes("Profile"), `${tag} seat: Profile`);
    assert.equal(await page.getByRole("radio").count(), 4, `${tag} seat: four colours`);
    await page.locator("summary[aria-label='Your seat']").click();

    // A code typed: Watch joins the list. It is not a second primary.
    await page.getByRole("textbox", { name: "Join code" }).fill("ABCD");
    await page.getByRole("button", { name: "Watch", exact: true }).waitFor();
    const typed = await state(page, tag, "code typed", "code");
    assert.deepEqual(typed.primary, ["Play with bots"], `${tag} code typed: the primary stays`);
    await page.getByRole("textbox", { name: "Join code" }).fill("");

    // Back shows the front again.
    await press("Back");
    assert.equal((await state(page, tag, "front again")).page, "front", `${tag}: Back returns to the front page`);

    // Two taps start a bot game.
    await press("Play");
    await press("Play with bots");
    await page.waitForFunction(() => window.__emberisle.getState().screen === "play" && window.__emberisle.getState().state?.phase === "rollOff");
    // Leaving the table lands on the Play page: the front page is not shown twice.
    await page.evaluate(() => window.__emberisle.getState().goTitle());
    await page.getByRole("button", { name: "Play with bots", exact: true }).waitFor();
    assert.equal((await state(page, tag, "after a table")).page, "play", `${tag}: leaving a table opens the Play page`);
    await page.close();

    // A join link is its own tray: name, colour, Join table.
    const linked = await open("?code=K7QP");
    await linked.getByTestId("join-table").waitFor();
    const join = await state(linked, tag, "join link", "join-link");
    assert.equal(join.joinLink, "K7QP", `${tag} join link: the code`);
    assert.deepEqual(join.primary, ["Join table K7QP"], `${tag} join link: its primary`);
    assert.deepEqual(join.headings, ["Emberisle 56px"], `${tag} join link: the wordmark`);
    await linked.close();

    // A watch link opens the Play page with Watch as the primary.
    const watching = await open("?watch=K7QP");
    await watching.getByRole("button", { name: "Watch", exact: true }).waitFor();
    const watch = await state(watching, tag, "watch link", "watch-link");
    assert.equal(watch.page, "play", `${tag} watch link: the Play page`);
    assert.deepEqual(watch.primary, ["Watch"], `${tag} watch link: Watch is the primary`);
    await watching.close();

    assert.deepEqual(errors, [], `${tag}: page errors`);
    console.log(`ok   ${tag}: front (Emberisle, Play), Play page, seat open, code typed, Back, two taps to a bot game, join link, watch link`);
    await ctx.close();
  }
  console.log(`first-minute-prove: ok${SHOTS ? `, pictures in ${OUT}/` : ""}`);
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
