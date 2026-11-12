// #954: practice and hotseat have no chat log. After a roll the newest log line is the goods line, and the HUD chip
// shows the roll line instead, styled like the online log (Chat.tsx): red on 6 and 8, green and bold for this seat.
// A later line (the next seat's turn) replaces it. The online chip stays the plain goods line.
// Shots: practice and hotseat at 1280x720, 390x844, and 844x390, while this seat's red roll is on the chip.
// Run: node scripts/hud-roll-line-prove.mjs
import { mkdirSync, rmSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8474;
const STEP_MS = 30_000;
const MIN = 4.5;
const DANGER = [179, 38, 30]; // --color-danger #b3261e
const GAIN = [16, 86, 42]; // --color-gain #10562a
const VIEWS = [
  { tag: "1280x720", width: 1280, height: 720 },
  { tag: "390x844", width: 390, height: 844, touch: true },
  { tag: "844x390", width: 844, height: 390, touch: true },
];

const lum = ([r, g, b]) => {
  const [R, G, B] = [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 1);

mkdirSync("docs/proofs/954", { recursive: true });
mkdirSync("test-results", { recursive: true });
for (const stale of ["1280x720.png", "390x844.png"]) rmSync(`docs/proofs/954/${stale}`, { force: true });

const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];
let failures = 0;
let code = 0;
function check(ok, label, detail) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log("     ", JSON.stringify(detail));
  }
}

// The chip, read in the page: text, own-mark, name weight, and the inks the online log uses.
const readChip = () => {
  const chip = document.querySelector('[data-testid="log-line"]');
  const name = chip?.querySelector('[data-testid="log-roll-name"]');
  const sum = chip?.querySelector('[data-testid="log-roll-sum"]');
  // Own green is the wrapper around the name, "rolled", the sum, and "!". The sum overrides it on a 6 or 8.
  const wrap = name?.parentElement?.tagName === "SPAN" ? name.parentElement : null;
  const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const px = (css) => {
    c.clearRect(0, 0, 1, 1);
    c.fillStyle = "#000";
    c.fillRect(0, 0, 1, 1);
    c.fillStyle = css;
    c.fillRect(0, 0, 1, 1);
    return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };
  const paper = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const m = getComputedStyle(n).backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
      if (m.length >= 3 && (m.length === 3 || m[3] >= 0.99)) return m.slice(0, 3);
    }
    return [255, 255, 255];
  };
  return {
    text: (chip?.textContent ?? "").replace(/\s+/g, " ").trim(),
    roll: chip?.dataset.roll ?? null,
    own: chip?.dataset.own === "true",
    nameWeight: name ? Number(getComputedStyle(name).fontWeight) : null,
    nameInk: name ? px(getComputedStyle(name).color) : null,
    wrapInk: wrap ? px(getComputedStyle(wrap).color) : null,
    sumInk: sum ? px(getComputedStyle(sum).color) : null,
    paper: chip ? paper(chip) : null,
    goods: window.__emberisle.getState().gameLog.at(-1)?.text ?? "",
  };
};

try {
  for (const view of VIEWS) {
    const page = await browser.newPage({
      viewport: { width: view.width, height: view.height },
      hasTouch: !!view.touch,
      isMobile: !!view.touch,
    });
    page.on("console", (m) => m.type() === "error" && errors.push(`${view.tag}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${view.tag}: ${e}`));
    page.on("response", (r) => r.status() >= 400 && errors.push(`${view.tag}: ${r.status()} ${r.url()}`));
    await page.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.getByRole("button", { name: "Join", exact: true }).waitFor();
    // The bot driver would roll on its own 700 ms later and replace the chip. Hold it off; this proof rolls.
    await page.evaluate(() => {
      window.__emberisle.setState({ runBots: () => {} });
      window.__rngReal = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (buf) => {
        if (buf instanceof Uint32Array && buf.length === 1 && window.__queue?.length) {
          buf[0] = window.__queue.shift();
          return buf;
        }
        return window.__rngReal(buf);
      };
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

    for (const kind of ["ai", "hotseat"]) {
      const tag = `${view.tag} ${kind === "ai" ? "practice" : "hotseat"}`;
      const reached = await page.evaluate(async (kind) => {
        const { legalRoads, legalSettle } = await import("/src/lib/game/rules.ts");
        window.__queue = [];
        const g = window.__emberisle;
        if (kind === "ai") g.getState().startAi();
        else g.getState().startHotseat(4);
        const localId = g.getState().localId;
        for (let n = 0; n < 500; n++) {
          const st = g.getState().state;
          if (st.phase === "roll" && st.current === localId) {
            const me = st.players.find((p) => p.id === localId);
            return { name: me.name, id: localId };
          }
          let action = null;
          if (st.phase === "roll" && st.current !== localId) {
            window.__queue.push(0, 1); // 1 and 2, so a 7 never opens a discard
            action = { type: "roll" };
          } else if (st.phase === "rollOff") action = { type: "roll" };
          else if (st.phase === "setupSettle") action = { type: "setupSettle", vertexId: legalSettle(st, st.current, true)[0] };
          else if (st.phase === "setupRoad") action = { type: "setupRoad", edgeId: legalRoads(st, st.current, true)[0] };
          else if (st.phase === "main") action = { type: "endTurn" };
          else return { error: `stuck in ${st.phase}` };
          const r = g.getState().dispatch(action, st.current);
          if (!r.ok) return { error: `${st.phase}: ${r.error}` };
        }
        return { error: "no roll for this seat" };
      }, kind);
      check(!reached.error && reached.name, `${tag}: this seat's roll is waiting (${reached.name ?? reached.error})`, reached);
      if (reached.error || !reached.name) continue;

      // This seat, a real click. 3+3 is a 6: red, and it is our roll (green, bold).
      await page.evaluate(() => window.__queue.push(2, 2));
      await page.getByRole("button", { name: "Roll", exact: true }).click({ timeout: STEP_MS });
      const wantOwn = `${reached.name} rolled 6!`;
      await page.waitForFunction((t) => (document.querySelector('[data-testid="log-line"]')?.textContent ?? "").replace(/\s+/g, " ").trim() === t, wantOwn, { timeout: STEP_MS });
      const own = await page.evaluate(readChip);
      check(own.text === wantOwn && own.roll === "6" && own.own === true, `${tag}: chip shows "${wantOwn}", not the goods line`, own);
      check(/ — .+['’]s roll(?:;|\.)/.test(own.goods) && own.goods !== own.text, `${tag}: the log's newest line is still the goods line`, { goods: own.goods });
      check(own.nameWeight >= 700 && same(own.wrapInk, GAIN), `${tag}: own name is bold and the phrase is green (${own.nameWeight})`, own);
      check(same(own.nameInk, GAIN) && same(own.sumInk, DANGER), `${tag}: own line is green and the 6 is red`, { nameInk: own.nameInk, sumInk: own.sumInk });
      const ownWorst = Math.min(ratio(own.nameInk, own.paper), ratio(own.sumInk, own.paper));
      check(ownWorst >= MIN, `${tag}: own inks are >= ${MIN}:1 (worst ${ownWorst.toFixed(2)}:1)`, own);
      await page.waitForFunction(() => !document.querySelector('[data-testid="roll-sum"]'), { timeout: 3000 }).catch(() => {});
      const shot = `${kind === "ai" ? "practice" : "hotseat"}-${view.tag}`;
      const vis = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="log-line"]');
        el?.scrollIntoView({ block: "center", inline: "nearest" });
        const sum = el?.querySelector('[data-testid="log-roll-sum"]');
        const r = sum?.getBoundingClientRect();
        const c = el?.getBoundingClientRect();
        const chipInView = !!c && c.width > 1 && c.height > 1 && c.bottom > 0 && c.right > 0 && c.top < innerHeight && c.left < innerWidth;
        const sumInChip = !!r && !!c && r.width > 1 && r.left >= c.left - 1 && r.right <= c.right + 1 && r.top < innerHeight && r.bottom > 0;
        return { chipInView, sumInChip, chip: c ? { top: c.top, left: c.left, width: c.width, right: c.right } : null, sum: r ? { left: r.left, right: r.right, width: r.width } : null };
      });
      await page.screenshot({ path: `docs/proofs/954/${shot}.png` });
      await page.screenshot({ path: `test-results/hud-roll-line-${shot}.png` });
      check(vis.chipInView, `${tag}: the chip is on screen for ${shot}.png`, vis);
      if (!vis.sumInChip) console.log(`${tag}: the sum glyph is clipped by the chip's existing truncate`);

      // The next seat's 8, not ours: red, and not green or bold. Passing the turn then replaces the roll.
      const other = await page.evaluate(() => {
        const g = window.__emberisle;
        const st = g.getState().state;
        const end = g.getState().dispatch({ type: "endTurn" }, st.current);
        if (!end.ok) return { error: end.error };
        const next = g.getState().state;
        window.__queue.push(3, 3); // 4 and 4, an 8
        const roll = g.getState().dispatch({ type: "roll" }, next.current);
        if (!roll.ok) return { error: roll.error };
        const name = next.players.find((p) => p.id === next.current).name;
        return { name };
      });
      check(!other.error && other.name && other.name !== reached.name, `${tag}: the next seat rolled (${other.name ?? other.error})`, other);
      if (!other.name) continue;
      const wantOther = `${other.name} rolled 8!`;
      await page.waitForFunction((t) => (document.querySelector('[data-testid="log-line"]')?.textContent ?? "").replace(/\s+/g, " ").trim() === t, wantOther, { timeout: STEP_MS });
      const plain = await page.evaluate(readChip);
      check(plain.text === wantOther && plain.roll === "8" && plain.own === false, `${tag}: chip shows "${wantOther}", not as this seat`, plain);
      check(/ — .+['’]s roll(?:;|\.)/.test(plain.goods) && plain.goods !== plain.text, `${tag}: the other roll's goods line stays in the log`, { goods: plain.goods });
      check(plain.nameWeight < 600 && !same(plain.nameInk, GAIN) && !same(plain.wrapInk, GAIN) && same(plain.sumInk, DANGER), `${tag}: the other seat's 8 is red, and the name is not bold or green`, plain);
      check(ratio(plain.nameInk, plain.paper) >= MIN && ratio(plain.sumInk, plain.paper) >= MIN, `${tag}: the other seat's inks are >= ${MIN}:1`, plain);
      const passed = await page.evaluate(() => {
        const g = window.__emberisle;
        const st = g.getState().state;
        const turn = g.getState().dispatch({ type: "endTurn" }, st.current);
        return turn.ok ? g.getState().gameLog.at(-1)?.text ?? "" : turn.error;
      });
      await page.waitForFunction((t) => (document.querySelector('[data-testid="log-line"]')?.textContent ?? "").replace(/\s+/g, " ").trim() === t, passed, { timeout: STEP_MS });
      const replaced = await page.evaluate(readChip);
      check(replaced.text === passed && replaced.roll === null, `${tag}: a later line replaces the roll on the chip (${JSON.stringify(replaced.text)})`, replaced);

      // A bank-short goods line still ends the roll, so the chip keeps the styled roll (the line does not end at "roll.").
      const shorted = `${reached.name} rolled 8!`;
      await page.evaluate((name) => {
        window.__emberisle.setState({
          gameLog: [
            { at: 1, text: `${name} rolled 8!` },
            { at: 2, text: `Nobody gains goods — ${name}'s roll; the bank is short of wood; nobody gains it.` },
          ],
        });
      }, reached.name);
      await page.waitForFunction((t) => (document.querySelector('[data-testid="log-line"]')?.textContent ?? "").replace(/\s+/g, " ").trim() === t, shorted, { timeout: STEP_MS });
      const bank = await page.evaluate(readChip);
      check(bank.text === shorted && bank.own === true && bank.roll === "8" && same(bank.nameInk, GAIN) && same(bank.sumInk, DANGER), `${tag}: a bank-short goods line still shows the styled roll`, bank);
      console.log(`${tag}: own "${wantOwn}"; other "${wantOther}"; then "${passed}"`);
    }

    if (view.tag === "1280x720") {
      await page.evaluate(() => {
        window.__emberisle.setState({
          mode: "online",
          gameLog: [
            { at: 1, text: "Ember rolled 8!" },
            { at: 2, text: "Nobody gains goods — Ember's roll." },
          ],
        });
      });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const online = await page.evaluate(() => {
        const chip = document.querySelector('[data-testid="log-line"]');
        return { text: (chip?.textContent ?? "").replace(/\s+/g, " ").trim(), spans: chip?.querySelectorAll('[data-testid="log-roll-sum"]').length ?? -1 };
      });
      // #1539: online the tray's event line shows the roll too; the goods line is in the chat log.
      check(online.text === "Ember rolled 8!" && online.spans === 1, "online chip shows the roll, as in practice and hotseat", online);
    }
    await page.close();
  }

  check(errors.length === 0, "zero console errors", errors);
  if (failures) throw new Error(`${failures} check(s) failed`);
  console.log("hud-roll-line-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
