// #669: the Sound panel in the Table menu (option A of docs/design/sound-sheet-1276), in a real browser with audio stubbed.
// - The Table menu's two sound rows are one "Sound" row; it opens the panel in the menu's place, and Back, Escape and Close
//   leave it (focus back on the Sound row, or on the menu button).
// - At 390x844, 844x390, 1280x720, 440x956 and 956x440: the panel lies inside the viewport, every control is at least 44 px
//   (a slider's touch area too), the sliders step in 10s, and the board map does not move or resize while it is open.
// - Each slider changes the volume of a clip of its own kind (measured through the Audio stub), and only that kind; a kind's mute
//   silences only that kind; All sound scales and silences everything; letting go of a slider plays a clip of its kind, and
//   pressing and dragging does not.
// - Sea sounds is a saved switch and a saved volume (#1163; playback is #662's). Muted players mutes one seat for this device, and the chat's
//   Mute players list has a shortcut here.
// - Settings survive a reload. Zero console errors.
// Run: npm run sound-sheet-prove. Pictures go to test-results/, or to $PIC_DIR (docs/proofs/669 for the PR).
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8669;
const PIC_DIR = process.env.PIC_DIR || "test-results";
const VIEWS = [
  { tag: "390x844", width: 390, height: 844, touch: true },
  { tag: "844x390", width: 844, height: 390, touch: true },
  { tag: "1280x720", width: 1280, height: 720 },
  { tag: "440x956", width: 440, height: 956, touch: true },
  { tag: "956x440", width: 956, height: 440, touch: true },
];
// One clip per kind, and the file it plays.
const CLIPS = { game: ["dice_land", "drop_001.wav"], touch: ["tap_forest", "tap_forest.wav"], memes: ["sb_airhorn", "sb_airhorn.mp3"], music: ["game_start", "game_start.mp3"] };
const KINDS = Object.keys(CLIPS);
const SAMPLES = { master: "click_001.wav", game: "click_001.wav", touch: "tap_forest.wav", memes: "bong_001.wav", music: "game_start.mp3" };
const NAMES = { master: "All sound", game: "Game sounds", touch: "Board touch", memes: "Soundboard and memes", music: "Music and ambience" };
const SEATS = [
  { id: "me", name: "Jarrod", color: "#c0392b", avatarId: null, ready: true, host: true, url: null },
  { id: "josh", name: "Josh", color: "#2f6fdb", avatarId: null, ready: true, host: false, url: null },
  { id: "bot", name: "Bot", color: "#e8dcc0", avatarId: null, ready: true, host: false, url: null, bot: true },
];

mkdirSync("test-results", { recursive: true });
mkdirSync(PIC_DIR, { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 0;

const stub = () => {
  window.__plays = [];
  window.Audio = class extends EventTarget {
    get volume() { return this._v; }
    // Like the real element: a volume outside 0..1 throws.
    set volume(v) { if (!(v >= 0 && v <= 1)) throw new DOMException("volume out of range", "IndexSizeError"); this._v = v; }
    constructor(src) { super(); this.src = src.split("/").at(-1); this.volume = 1; this.currentTime = 0; this.paused = true; this.ended = false; }
    play() { this.paused = false; window.__plays.push({ file: this.src, volume: this.volume }); this.dispatchEvent(new Event("play")); return Promise.resolve(); }
    pause() { this.paused = true; this.dispatchEvent(new Event("pause")); }
  };
};

// A table at this size with a faked online connection and three seats, so Muted players has someone to list.
async function open(ctx, v) {
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`${v.tag}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${v.tag}: ${e}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__emberisle);
  await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
  await page.getByRole("button", { name: "Table menu" }).waitFor();
  await page.evaluate((seats) => window.__emberisle.setState({ mode: "online", code: "K7QP", seats, seatId: "me", net: { act: () => true, close: () => {} } }), SEATS);
  await page.waitForFunction(() => window.__isle?.caps.size > 0 && window.__isle.renders > 5, null, { timeout: 90_000 });
  return page;
}

const geometry = (page) => page.evaluate(() => {
  const r = document.querySelector("canvas").getBoundingClientRect();
  return JSON.stringify({ canvas: [r.x, r.y, r.width, r.height].map(Math.round), hole: window.__isle.insets() });
});

// Clips start 150 ms apart (#609) and a slow software-GL frame can hold that timer much longer, so wait for a stretch with no
// new clip, polled on a timer, before reading what played.
const quiet = (page) => page.evaluate(async () => {
  for (let n = -1; n !== window.__plays.length;) {
    n = window.__plays.length;
    await new Promise((r) => setTimeout(r, 600));
  }
});

// What a clip of this kind plays at right now: the volumes of its file since the call (empty when it is silent).
async function heard(page, kind) {
  const [name, file] = CLIPS[kind];
  await quiet(page);
  const mark = await page.evaluate(() => window.__plays.length);
  await page.evaluate(async (n) => (await import("/src/lib/sound.ts")).play(n), name);
  await quiet(page);
  return page.evaluate(([m, f]) => window.__plays.slice(m).filter((p) => p.file === f).map((p) => p.volume), [mark, file]);
}

try {
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch });
    await ctx.addInitScript(stub);
    const page = await open(ctx, v);
    const trigger = page.getByRole("button", { name: "Table menu" });
    const menu = page.getByRole("dialog", { name: "Table menu" });
    const sheet = page.getByRole("dialog", { name: "Sound" });
    const entry = menu.getByTestId("sound-entry");
    const before = await geometry(page);

    // The way in: one Sound row where the two sound rows were.
    await trigger.click();
    await menu.waitFor();
    const rows = (await menu.getByRole("button").allTextContents()).map((t) => t.trim());
    assert.ok(rows.includes("Sound100%›"), `${v.tag}: one Sound row showing the level: ${rows}`);
    assert.ok(!rows.some((t) => /^(Table sounds|Music)/.test(t)), `${v.tag}: the old two sound rows are gone: ${rows}`);
    assert.ok((await entry.boundingBox()).height >= 44, `${v.tag}: the Sound row is a 44 px row`);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${PIC_DIR}/after-menu-${v.tag}.png` });

    // The panel takes the menu's place, with the focus on Back; the map does not move.
    await entry.click();
    await sheet.waitFor();
    assert.equal(await menu.count(), 0, `${v.tag}: the rows are replaced by the panel`);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Back to Table menu", `${v.tag}: focus starts on Back`);
    await page.waitForTimeout(300);
    assert.equal(await geometry(page), before, `${v.tag}: the board map and its hole are unchanged with the panel open`);
    const fit = await sheet.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const small = [...el.querySelectorAll("button, input, [role=switch]")].filter((c) => c.getClientRects().length).map((c) => {
        const b = c.getBoundingClientRect();
        return { name: c.getAttribute("aria-label"), w: b.width, h: b.height, range: c.type === "range", step: c.step };
      });
      const body = el.querySelector(".ss-body");
      return { inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, box: [r.x, r.y, r.width, r.height].map(Math.round), small, scroll: body.scrollHeight - body.clientHeight };
    });
    assert.ok(fit.inside, `${v.tag}: the panel is inside the viewport ${JSON.stringify(fit.box)}`);
    assert.ok(fit.small.length >= 14, `${v.tag}: every control is there (${fit.small.length})`);
    for (const c of fit.small) {
      assert.ok(c.h >= 43.5 && (c.range || c.w >= 43.5), `${v.tag}: ${c.name} is ${Math.round(c.w)}x${Math.round(c.h)}, under 44 px`);
      if (c.range) assert.equal(c.step, "10", `${v.tag}: ${c.name} steps in 10s`);
    }
    for (const id of ["master", ...KINDS]) assert.equal(await sheet.getByTestId(`sound-slider-${id}`).count(), 1, `${v.tag}: a slider for ${id}`);
    assert.deepEqual(await sheet.getByRole("heading").allTextContents(), ["Sound", "Muted players"], `${v.tag}: panel headings`);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${PIC_DIR}/after-sound-${v.tag}.png` });
    console.log(`${v.tag}: Sound row opens the panel (x, y, w, h ${fit.box.join(", ")}; scrolls ${fit.scroll} px), ${fit.small.length} controls all at least 44 px, sliders step 10, map unmoved`);

    // Back returns to the rows with the focus on the Sound row; Escape from the panel does the same; Escape again closes.
    await sheet.getByRole("button", { name: "Back to Table menu" }).click();
    await menu.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "sound-entry", `${v.tag}: Back puts the focus on the Sound row`);
    await entry.click();
    await sheet.waitFor();
    await page.keyboard.press("Escape");
    await menu.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "sound-entry", `${v.tag}: Escape in the panel goes back, focus on the Sound row`);
    await entry.click();
    await sheet.waitFor();
    await page.keyboard.press("Escape");
    await menu.waitFor();
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "detached" });
    assert.ok(await trigger.evaluate((el) => document.activeElement === el), `${v.tag}: a second Escape closes the menu and refocuses its button`);
    await trigger.click();
    await menu.getByTestId("sound-entry").click();
    await sheet.getByRole("button", { name: "Close" }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.ok(await trigger.evaluate((el) => document.activeElement === el), `${v.tag}: Close closes it all and refocuses the menu button`);
    assert.equal(await geometry(page), before, `${v.tag}: the map is where it was after closing`);

    if (v.tag === "440x956") {
      await trigger.click();
      await menu.getByTestId("sound-entry").click();
      await sheet.waitFor();
      const slider = (id) => sheet.getByTestId(`sound-slider-${id}`);
      const mute = (id) => sheet.getByTestId(`sound-mute-${id}`);
      const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("emberisle-sound-mix") ?? "null"));

      // Each kind has its own slider and mute; nothing else moves.
      for (const kind of KINDS) {
        const [other] = KINDS.filter((k) => k !== kind);
        assert.deepEqual(await heard(page, kind), [1], `${kind}: full volume to begin with`);
        await slider(kind).fill("50");
        assert.equal((await stored())[kind].volume, 0.5, `${kind}: the slider is saved`);
        assert.equal(await sheet.getByTestId(`sound-row-${kind}`).locator(".ss-val").textContent(), "50%", `${kind}: the level shows as a percent`);
        assert.deepEqual(await heard(page, kind), [0.5], `${kind}: its clip plays at half`);
        assert.deepEqual(await heard(page, other), [1], `${kind}: ${other} is still at full`);
        await mute(kind).click();
        assert.equal(await mute(kind).getAttribute("aria-pressed"), "true", `${kind}: mute is pressed`);
        assert.equal(await sheet.getByTestId(`sound-row-${kind}`).locator(".ss-val").textContent(), "Off", `${kind}: a muted kind reads Off`);
        assert.equal(await slider(kind).inputValue(), "50", `${kind}: a muted kind keeps its level`);
        assert.deepEqual(await heard(page, kind), [], `${kind}: muted is silent`);
        for (const k of KINDS.filter((x) => x !== kind)) assert.equal((await heard(page, k)).length, 1, `muting ${kind} leaves ${k} playing`);
        await mute(kind).click();
        assert.deepEqual(await heard(page, kind), [0.5], `${kind}: unmuted, back at half`);
        await slider(kind).fill("100");
      }

      // Keys move a slider one step (10) and the volume follows; All sound scales every kind.
      await slider("game").focus();
      await page.keyboard.press("ArrowLeft");
      assert.equal(await slider("game").inputValue(), "90", "ArrowLeft steps down by 10");
      await page.keyboard.press("ArrowRight");
      assert.equal(await slider("game").inputValue(), "100", "ArrowRight steps up by 10");
      await slider("master").fill("50");
      for (const kind of KINDS) assert.deepEqual(await heard(page, kind), [0.5], `All sound at half scales ${kind}`);
      await slider("memes").fill("60");
      assert.deepEqual(await heard(page, "memes"), [0.3], "master x kind: 0.5 x 0.6");
      await slider("memes").fill("100");
      await slider("master").fill("100");

      // All sound's mute silences every kind and is the same switch the title card's speaker is; it is remembered.
      await mute("master").click();
      assert.equal(await page.evaluate(() => localStorage.getItem("emberisle-muted")), "1", "All sound muted is remembered");
      for (const kind of KINDS) assert.deepEqual(await heard(page, kind), [], `All sound muted silences ${kind}`);
      await mute("master").click();
      assert.equal(await page.evaluate(() => localStorage.getItem("emberisle-muted")), null, "unmuting clears it");
      for (const kind of KINDS) assert.deepEqual(await heard(page, kind), [1], `${kind} is back after unmuting All sound`);

      // Letting go of a slider plays a clip of its kind; pressing and dragging do not.
      for (const id of ["master", ...KINDS]) {
        await quiet(page);
        const box = await slider(id).boundingBox();
        const y = box.y + box.height / 2;
        await page.mouse.move(box.x + box.width * 0.3, y);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.6, y, { steps: 4 });
        const mark = await page.evaluate(() => window.__plays.length);
        await sleep(300);
        assert.equal(await page.evaluate(() => window.__plays.length), mark, `${id}: nothing plays while the slider is held`);
        await page.mouse.up();
        await quiet(page);
        const files = await page.evaluate((m) => window.__plays.slice(m).map((p) => p.file), mark);
        assert.deepEqual(files, [SAMPLES[id]], `${id}: letting go plays its sample`);
        assert.equal(Number(await slider(id).inputValue()) % 10, 0, `${id}: it lands on a step of 10`);
        await slider(id).fill("100");
      }

      // A release sample never leaves a clip volume outside 0..1 behind: every kind at 80%, release All sound, then raise Game to 100%.
      for (const k of KINDS) await slider(k).fill("80");
      await quiet(page);
      const mb = await slider("master").boundingBox();
      await page.mouse.move(mb.x + mb.width * 0.5, mb.y + mb.height / 2);
      await page.mouse.down();
      await page.mouse.up();
      await quiet(page);
      await slider("game").fill("100");
      assert.equal(await sheet.getByTestId("sound-row-game").locator(".ss-val").textContent(), "100%", "Game sounds reads 100% after the release sample");
      assert.equal((await stored()).game.volume, 1, "and storage agrees");
      assert.equal(await slider("game").inputValue(), "100", "and so does the slider");
      assert.deepEqual(errors, [], "no error from changing a level after a release sample");
      for (const k of KINDS) await slider(k).fill("100");
      await slider("master").fill("100");

      // Music: the old Music off switch still counts, and the mute button brings it back.
      await page.evaluate(async () => (await import("/src/lib/sound.ts")).setMusicOn(false));
      assert.equal(await mute("music").getAttribute("aria-pressed"), "true", "Music saved off shows muted");
      assert.deepEqual(await heard(page, "music"), [], "Music saved off: the stings are silent too");
      await mute("music").click();
      assert.equal(await mute("music").getAttribute("aria-pressed"), "false", "pressing it turns Music back on");
      assert.equal(await page.evaluate(async () => (await import("/src/lib/sound.ts")).isMusicOn()), true, "the music switch is on again");
      assert.equal((await stored()).music.muted, false, "and its kind is unmuted");

      // Sea sounds (#1163): on at 100% to begin with. Off is saved, and the volume is its own saved tenth.
      const sea = sheet.getByRole("switch", { name: "Sea sounds" });
      const seaSlider = sheet.getByTestId("sound-slider-sea");
      const seaVal = () => sheet.getByTestId("sound-row-sea").locator(".ss-val").textContent();
      assert.equal(await sea.getAttribute("aria-checked"), "true", "Sea sounds starts on");
      assert.equal(await seaSlider.inputValue(), "100", "Sea sounds volume starts at 100%");
      assert.equal(await seaVal(), "100%", "Sea sounds shows 100%");
      await sea.click();
      assert.equal(await sea.getAttribute("aria-checked"), "false", "Sea sounds switches off");
      assert.equal(await page.evaluate(() => localStorage.getItem("emberisle-sea-sounds")), "0", "Sea sounds off is saved");
      assert.equal(await seaVal(), "Off", "Sea sounds off reads Off and keeps its level");
      assert.equal(await seaSlider.inputValue(), "100", "the level is still 100 while off");
      await seaSlider.fill("50");
      assert.equal(await page.evaluate(() => localStorage.getItem("emberisle-sea-volume")), "5", "Sea sounds 50% is saved as the tenth 5");
      assert.equal(await seaVal(), "Off", "off still reads Off at the new level");
      await sea.click();
      assert.equal(await seaVal(), "50%", "Sea sounds on shows the saved level");
      await seaSlider.focus();
      await page.keyboard.press("ArrowLeft");
      assert.equal(await seaSlider.inputValue(), "40", "ArrowLeft steps Sea sounds down by 10");
      assert.equal(await page.evaluate(() => localStorage.getItem("emberisle-sea-volume")), "4", "the key step is saved");
      await page.keyboard.press("ArrowRight");
      assert.equal(await seaSlider.inputValue(), "50", "ArrowRight steps Sea sounds back up");
      await seaSlider.fill("100");
      assert.equal(await page.evaluate(() => localStorage.getItem("emberisle-sea-volume")), null, "100% clears the saved volume");

      // Muted players: Josh and the bot are listed, not me; muting one mutes only that seat, for this table code.
      const seatNames = await sheet.getByTestId("sound-players").locator(".ss-name").allTextContents();
      assert.deepEqual(seatNames, ["Josh", "Bot"], "the other seats are listed");
      await sheet.getByRole("button", { name: "Mute player Josh" }).click();
      await sheet.getByRole("button", { name: "Unmute player Josh" }).waitFor();
      assert.equal(await sheet.getByTestId("sound-seat-bot").getAttribute("aria-pressed"), "false", "the bot is not muted");
      assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("emberisle-chat-muted-K7QP"))), ["josh"], "Josh is muted for this table");
      await slider("master").fill("70");
      await slider("memes").fill("30");
      await mute("touch").click();
      await page.keyboard.press("Escape");
      await menu.waitFor();
      assert.match(await menu.getByTestId("sound-entry").textContent(), /70%/, "the Sound row shows the All sound level");
      await page.keyboard.press("Escape");
      await menu.waitFor({ state: "detached" });
    }
    await ctx.close();
  }

  // Settings survive a reload; the chat's Mute players list points at the panel. Sideways phone.
  {
    const v = VIEWS.find((x) => x.tag === "956x440");
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: true, isMobile: true });
    await ctx.addInitScript(stub);
    await ctx.addInitScript(() => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("emberisle-sound-mix", JSON.stringify({ master: 0.7, game: { volume: 1, muted: false }, touch: { volume: 1, muted: true }, memes: { volume: 0.3, muted: false }, music: { volume: 1, muted: false } }));
      localStorage.setItem("emberisle-sea-sounds", "0");
      localStorage.setItem("emberisle-sea-volume", "5");
      localStorage.setItem("emberisle-chat-muted-K7QP", JSON.stringify(["josh"]));
    });
    const page = await open(ctx, v);
    for (const round of ["fresh load", "after a reload"]) {
      if (round === "after a reload") {
        await page.reload();
        await page.waitForFunction(() => window.__emberisle);
        await page.evaluate(() => window.__emberisle.getState().startHotseat(4));
        await page.getByRole("button", { name: "Table menu" }).waitFor();
        await page.evaluate((seats) => window.__emberisle.setState({ mode: "online", code: "K7QP", seats, seatId: "me", net: { act: () => true, close: () => {} } }), SEATS);
      }
      await page.getByRole("button", { name: "Table menu" }).click();
      await page.getByTestId("sound-entry").click();
      const sheet = page.getByRole("dialog", { name: "Sound" });
      await sheet.waitFor();
      const state = await sheet.evaluate((el) => {
        const sliders = {};
        let seaLevel = null;
        for (const r of el.querySelectorAll("input[type=range]")) {
          const key = r.dataset.testid.replace("sound-slider-", "");
          if (key === "sea") seaLevel = r.value;
          else sliders[key] = r.value;
        }
        return {
          sliders,
          seaLevel,
          pressed: Object.fromEntries([...el.querySelectorAll("[data-testid^=sound-mute-],[data-testid^=sound-seat-]")].map((b) => [b.dataset.testid, b.getAttribute("aria-pressed")])),
          sea: el.querySelector("[role=switch]").getAttribute("aria-checked"),
        };
      });
      assert.deepEqual(state.sliders, { master: "70", game: "100", touch: "100", memes: "30", music: "100" }, `${round}: the levels are kept`);
      assert.equal(state.seaLevel, "50", `${round}: Sea sounds keeps the saved 50%`);
      assert.equal(state.pressed["sound-mute-touch"], "true", `${round}: Board touch stays muted`);
      assert.equal(state.pressed["sound-mute-game"], "false", `${round}: Game sounds is not muted`);
      assert.equal(state.pressed["sound-seat-josh"], "true", `${round}: Josh stays muted`);
      assert.equal(state.pressed["sound-seat-bot"], "false", `${round}: the bot is not muted`);
      assert.equal(state.sea, "false", `${round}: Sea sounds stays off`);
      assert.deepEqual(await heard(page, "memes"), [0.21], `${round}: the saved levels apply to the sound (0.7 x 0.3)`);
      assert.deepEqual(await heard(page, "touch"), [], `${round}: the muted kind is silent`);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "detached" });
    }

    // The shortcut: Open chat, the Mute players list, Sound.
    await page.getByRole("button", { name: "Open chat" }).click();
    await page.getByTestId("chat-mute-toggle").click();
    assert.ok(await page.getByTestId("chat-mute-seat-josh").getByText("Unmute Josh").count(), "the chat's list still mutes and unmutes seats");
    await page.getByTestId("chat-mute-sound").click();
    await page.getByRole("dialog", { name: "Sound" }).waitFor();
    assert.equal(await page.getByTestId("chat-mute-panel").count(), 0, "the shortcut closes the chat's list");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Back to Table menu", "the shortcut opens the panel with focus on Back");
    console.log("956x440: levels, mutes, Sea sounds and a muted player survive a reload; the chat's Mute players list has a Sound shortcut");
    await ctx.close();
  }
  assert.deepEqual(errors, [], "console errors");
  console.log("sound-sheet-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
