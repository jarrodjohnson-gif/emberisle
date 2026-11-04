// #687: every dice roll is one line in the game log, "<name> rolled <sum>!". The sum is red like the 6 and 8 number tokens
// (--color-danger); your own roll is green (--color-gain) with the name bold, so it does not rest on colour alone; every other
// roll is the log's normal text colour. Every ink is at least 4.5:1 (WCAG 1.4.3, the ratio and threshold contrast-prove uses)
// on the log's paper. The styled log is the online table's chat box (Chat.tsx; practice and hotseat have no chat box, only the
// HUD's one-line chip).
// Real rules text: the rolls are made by applyAction in node (rules.ts, loaded through vite) with the dice forced through
// crypto.getRandomValues, as dice-prove and flash-prove do. Three kinds of seat are shown:
// - a human in practice (a real click on Roll, dice forced in the page): the line the rules wrote, one per roll;
// - a bot in practice (the app's own bot driver rolls, dice forced in the page): the same line;
// - an online table: a scripted socket stands in for the host and pushes the real states and the log lines the host says (for a
//   roll, the roll line then the goods line and nothing else; server/roll-lines-prove.mjs holds the real host to that), through
//   the store's real welcome, state and log handlers (mode online, p1 is `you`; seats: two people and a bot), for every sum
//   2 to 12 by the three seats, read from the open chat box (text, line ink, name weight, the sum's ink, ratio on paper).
// Also: one roll is one roll line (the old "rolls a+b = n." is gone), the roll-off line is unchanged, bankShort still finds the
// roll event (a bank-short roll), and the screen-reader log region and the HUD's last-line chip read the new line. Zero console errors.
// Saves test-results/roll-log-390x844.png and test-results/roll-log-1280x720.png (a red 6 and 8, your own green roll).
// Run: node scripts/roll-log-prove.mjs
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8454;
const STEP_MS = 30_000;
const MIN = 4.5;
const DANGER = [179, 38, 30]; // --color-danger #b3261e, the red of the 6 and 8 tokens (.my-number-hot)
const GAIN = [16, 86, 42]; // --color-gain #10562a
const VIEWS = [
  { tag: "1280x720", width: 1280, height: 720 },
  { tag: "390x844", width: 390, height: 844, touch: true },
];

const lum = ([r, g, b]) => {
  const [R, G, B] = [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const same = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 1);

mkdirSync("test-results", { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
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

try {
  // The rules, run in node on the real code.
  const { createGame } = await vite.ssrLoadModule("/src/lib/game/board.ts");
  const { applyAction, legalRoads, legalSettle, bankShort } = await vite.ssrLoadModule("/src/lib/game/rules.ts");
  const settled = (seed, humans, bots) => {
    let st = createGame({ seed, humans: humans.map((name) => ({ name })), bots, wayfarerMode: "off" });
    for (let i = 0; i < 300 && st.phase !== "roll"; i++) {
      const cur = st.current;
      const action = st.phase === "rollOff" ? { type: "roll" }
        : st.phase === "setupSettle" ? { type: "setupSettle", vertexId: legalSettle(st, cur, true)[0] }
        : { type: "setupRoad", edgeId: legalRoads(st, cur, true)[0] };
      const r = applyAction(st, cur, action);
      assert.ok(!r.error, `setup: ${r.error}`);
      st = r.state;
    }
    assert.equal(st.phase, "roll");
    return st;
  };
  // `pid` rolls dice a and b (the rules draw each die from crypto.getRandomValues; the queued values steer the next two draws).
  const roll = (st, pid, a, b) => {
    const s = structuredClone(st);
    Object.assign(s, { current: pid, phase: "roll", discardNeeded: {}, dice: null });
    const original = crypto.getRandomValues;
    const queue = [a - 1, b - 1];
    crypto.getRandomValues = (buf) => (queue.length ? ((buf[0] = queue.shift()), buf) : original.call(crypto, buf));
    try {
      const r = applyAction(s, pid, { type: "roll" });
      assert.ok(!r.error, `roll: ${r.error}`);
      assert.deepEqual(r.state.dice, [a, b]);
      return r.state;
    } finally {
      crypto.getRandomValues = original;
    }
  };
  const diceFor = (sum) => [Math.max(1, sum - 6), sum - Math.max(1, sum - 6)];

  // Node-side, no page: the line the rules write, the roll-off line left alone, and bankShort reading the new roll event.
  {
    const st = settled(11, ["Jarrod", "Ember", "Dune"], 0);
    for (let sum = 2; sum <= 12; sum++) {
      const [a, b] = diceFor(sum);
      const next = roll(st, "p1", a, b);
      const fresh = next.log.slice(st.log.length);
      assert.equal(fresh[0], `Ember rolled ${sum}!`, `the rules' roll line for ${sum}`);
      assert.ok(!fresh.some((l) => / rolls \d\+\d = \d+\./.test(l)), "the old roll text is gone");
      assert.equal(fresh.filter((l) => /^.+ rolled \d+!$/.test(l)).length, 1, "one roll, one roll line");
    }
    console.log("ok   node: every sum 2 to 12 is one line, \"<name> rolled <sum>!\", the old text gone");
    assert.ok(st.log.some((l) => /^.+ rolls a \d\.$/.test(l)), "the roll-off line (rolls a N.) is still in the setup log");
    console.log("ok   node: the roll-off line \"<name> rolls a N.\" is unchanged");
    // A short bank: a hex whose token is some sum, two seats owed on it, the bank empty of its goods.
    const dry = structuredClone(st);
    let found = null;
    for (const h of dry.hexes) {
      if (h.pip == null || h.terrain === "waste") continue;
      const owners = new Set(dry.vertices.filter((v) => v.hexes.includes(h.id) && v.building).map((v) => v.building.playerId));
      if (owners.size > 1 && h.pip !== 7) { found = h; break; }
    }
    if (!found) {
      // Give two seats the corners of one hex by hand: the bank rule only needs two owners on a token.
      const h = dry.hexes.find((x) => x.pip != null && x.terrain !== "waste" && x.pip !== 7);
      const corners = dry.vertices.filter((v) => v.hexes.includes(h.id));
      corners[0].building = { playerId: "p0", kind: "outpost" };
      corners[2].building = { playerId: "p2", kind: "outpost" };
      found = h;
    }
    dry.bank[found.terrain] = 0;
    const [a, b] = diceFor(found.pip);
    const shortState = roll(dry, "p1", a, b);
    const roller = shortState.log.slice(dry.log.length);
    assert.equal(roller[0], `Ember rolled ${found.pip}!`);
    assert.ok(roller.some((l) => /^.+ — Ember's roll; the bank is short of [a-z and]+; nobody gains it\.$/.test(l)), `the bank is short: ${roller.join(" | ")}`);
    assert.deepEqual(bankShort(shortState), [found.terrain], "bankShort finds the shortage from the new roll line");
    console.log(`ok   node: a bank-short roll (${found.pip}, ${found.terrain}): bankShort reads it from the new roll line`);
  }

  // Everything the page needs to read a log row: its text, its ink and name weight, its sum's ink, and the paper under it.
  const readRows = () => {
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
    return [...document.querySelectorAll('[data-testid="chat-log"] [data-testid="log-row"]')].map((li) => {
      const name = li.querySelector('[data-testid="log-roll-name"]');
      const sum = li.querySelector('[data-testid="log-roll-sum"]');
      return {
        text: li.textContent,
        roll: li.dataset.roll ?? null,
        own: li.dataset.own === "true",
        ink: px(getComputedStyle(li).color),
        nameInk: name ? px(getComputedStyle(name).color) : null,
        nameWeight: name ? Number(getComputedStyle(name).fontWeight) : null,
        sumInk: sum ? px(getComputedStyle(sum).color) : null,
        paper: paper(li),
      };
    });
  };

  // One row against what the owner asked: the text, the red on 6 and 8, green and bold when it is your own, the ratio on paper.
  const expectRow = (tag, row, normal, { name, sum, own }) => {
    const want = `${name} rolled ${sum}!`;
    const hot = sum === 6 || sum === 8;
    const label = `${tag}: "${want}"${own ? " (own)" : ""}`;
    check(row.text === want && row.roll === String(sum), `${label} reads as written`, row);
    check(row.own === own, `${label} is ${own ? "marked" : "not marked"} as your own`, row);
    check(same(row.ink, own ? GAIN : normal.ink), `${label} line ink ${own ? "green (--color-gain)" : "is the normal log ink"}`, { ink: row.ink, normal: normal.ink });
    check(own ? row.nameWeight >= 700 : row.nameWeight === normal.nameWeight && row.nameWeight < 600, `${label} name is ${own ? "bold" : "not bold"} (${row.nameWeight})`, row);
    check(same(row.sumInk, hot ? DANGER : own ? GAIN : normal.ink), `${label} sum ${hot ? "red (--color-danger)" : "has the line's ink"}`, { sumInk: row.sumInk });
    const worst = Math.min(ratio(row.ink, row.paper), ratio(row.sumInk, row.paper), ratio(row.nameInk, row.paper));
    check(worst >= MIN, `${label} every ink is >= ${MIN}:1 on the paper rgb(${row.paper}) (worst ${worst.toFixed(2)}:1)`, { ink: row.ink, sumInk: row.sumInk, paper: row.paper });
  };

  const open = async (view) => {
    const page = await browser.newPage({ viewport: { width: view.width, height: view.height }, hasTouch: !!view.touch, isMobile: !!view.touch });
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
    return page;
  };
  const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const stampLog = (lines) => lines.map((text) => ({ at: Date.now(), text }));

  for (const view of VIEWS) {
    const tag = view.tag;

    // ---- Practice: the person rolls (own), then the bots (not). The bots' rolls come from the app's own bot driver. ----
    {
      const st = settled(5, ["Jarrod"], 3);
      const page = await open(view);
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.getByRole("button", { name: "Join", exact: true }).waitFor();
      await page.evaluate(({ st, log }) => {
        const g = window.__emberisle;
        st.current = "p0";
        st.phase = "roll";
        st.dice = null;
        g.setState({ screen: "play", mode: "ai", host: true, localId: "p0", spectator: false, state: st, gameLog: log, chatOpen: false, error: null });
        // The rules draw each die from crypto.getRandomValues; queued values steer the next draws, otherwise it is untouched.
        window.__queue = [];
        const real = crypto.getRandomValues.bind(crypto);
        crypto.getRandomValues = (buf) => (window.__queue.length ? ((buf[0] = window.__queue.shift()), buf) : real(buf));
      }, { st: { ...st, current: "p0" }, log: stampLog(st.log) });
      await page.getByRole("button", { name: "Roll", exact: true }).waitFor({ timeout: STEP_MS });
      await frames(page);
      // The person: a real click on Roll, 3+3 (a 6: red, and it is your own: green, bold name).
      await page.evaluate(() => window.__queue.push(2, 2));
      await page.getByRole("button", { name: "Roll", exact: true }).click();
      await page.waitForFunction(() => (window.__emberisle.getState().state.rolls ?? 0) === 1, null, { timeout: STEP_MS });
      // Then the bots: the next seat rolls 4+4 (an 8), the one after 2+3 (a 5), through the bot driver.
      const names = await page.evaluate(() => {
        const g = window.__emberisle;
        const s = g.getState();
        const order = s.state.players.map((p) => p.name);
        const me = order.indexOf(s.state.players.find((p) => p.id === "p0").name);
        window.__queue.push(3, 3, 1, 2);
        g.getState().dispatch({ type: "endTurn" });
        return { me: order[me], one: order[(me + 1) % order.length], two: order[(me + 2) % order.length] };
      });
      await page.waitForFunction(({ one, two }) => {
        const t = window.__emberisle.getState().gameLog.map((l) => l.text);
        return t.includes(`${one} rolled 8!`) && t.includes(`${two} rolled 5!`);
      }, names, { timeout: 60_000, polling: 100 });
      const practice = await page.evaluate(() => {
        const s = window.__emberisle.getState();
        const lines = s.gameLog.map((l) => l.text);
        return { lines, rolls: s.state.rolls, logLines: s.state.log.filter((l) => /^.+ rolled \d+!$/.test(l)).length, old: lines.filter((l) => / rolls \d\+\d = \d+\./.test(l)).length, rollOff: lines.filter((l) => /^.+ rolls a \d\.$/.test(l)).length };
      });
      check(practice.old === 0, `${tag} practice: the old "rolls a+b = n." text is nowhere in the log`);
      check(practice.logLines === practice.rolls, `${tag} practice: one roll, one line (${practice.logLines} lines for ${practice.rolls} rolls)`, practice);
      check(practice.rollOff >= 3, `${tag} practice: the roll-off lines "rolls a N." are unchanged (${practice.rollOff})`);
      // The person's roll is the person's, the bots' come from the bot driver: each is its name and its sum, as the rules wrote it.
      check(practice.lines.includes(`${names.me} rolled 6!`), `${tag} practice human: "${names.me} rolled 6!" (a real click on Roll)`);
      check(practice.lines.includes(`${names.one} rolled 8!`) && names.one.endsWith("(bot)"), `${tag} practice bot: "${names.one} rolled 8!"`);
      check(practice.lines.includes(`${names.two} rolled 5!`) && names.two.endsWith("(bot)"), `${tag} practice bot: "${names.two} rolled 5!"`);
      await page.close();
    }

    // ---- Online: a scripted host. Real welcome/state/log handlers, mode online, p1 (Ember) is this seat. ----
    {
      const humans = ["Jarrod", "Ember"];
      let st = settled(7, humans, 1);
      const seatNames = ["p0", "p1", "p2"].map((id) => st.players.find((p) => p.id === id).name); // Jarrod, Ember (this seat, p1), a bot (the roll-off reorders st.players, not the ids)
      const page = await open(view);
      await page.addInitScript(() => {
        const Real = window.WebSocket;
        // The page's one table socket is scripted (vite's own hot-reload socket carries a protocol and stays real).
        window.WebSocket = function (url, protocols) {
          if (protocols) return new Real(url, protocols);
          const s = { readyState: 0, onopen: null, onmessage: null, onclose: null, sent: [] };
          s.send = (data) => s.sent.push(JSON.parse(data));
          s.close = () => { s.readyState = 3; s.onclose?.({}); };
          s.push = (msg) => s.onmessage?.({ data: JSON.stringify(msg) });
          window.__socket = s;
          setTimeout(() => { s.readyState = 1; s.onopen?.({}); }, 0);
          return s;
        };
        window.WebSocket.OPEN = 1;
      });
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.getByRole("button", { name: "Join", exact: true }).waitFor();
      const proto = await page.evaluate(async () => (await import("/src/lib/net/proto.ts")).PROTO);
      await page.evaluate(() => window.__emberisle.getState().joinTable("TEST"));
      await page.waitForFunction(() => window.__socket?.readyState === 1 && window.__socket.sent.some((m) => m.type === "hello"), null, { timeout: STEP_MS });
      const send = (msgs) => page.evaluate((msgs) => msgs.forEach((m) => window.__socket.push(m)), msgs);
      const seats = seatNames.map((name, i) => ({ id: `s${i}`, name, color: ["#c44", "#48c", "#4a4"][i], avatarId: null, ready: true, host: i === 0 }));
      await send([
        { type: "welcome", proto, code: "TEST", you: "s1", host: false, chat: [], secret: "scripted", victoryTarget: 10, wayfarerMode: "off" },
        { type: "seats", code: "TEST", seats, watching: 0, victoryTarget: 10, wayfarerMode: "off" },
        { type: "state", you: "p1", game: st, legal: null },
      ]);
      await page.waitForFunction(() => window.__emberisle.getState().screen === "play" && window.__emberisle.getState().state, null, { timeout: STEP_MS });
      const online = await page.evaluate(() => ({ mode: window.__emberisle.getState().mode, local: window.__emberisle.getState().localId }));
      check(online.mode === "online" && online.local === "p1", `${tag} online: this tab is seat p1 over the store's online handlers (${online.mode}, ${online.local})`);

      // The host says every new log line, then pushes the state (server/host.mjs play(); nothing is said ahead of them since the
      // "<sum> · <name> +n <good>" summary was dropped, and server/roll-lines-prove.mjs holds the real host to this). A roll is exactly
      // two lines: "<name> rolled <sum>!", then that seat's goods line in the rules' own wording ("Ember gains 1 wool - Jarrod's roll.",
      // "Nobody gains goods - Ember's roll."). `heard` is every line pushed, in order, for the chat box to be held to.
      const heard = [];
      const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rollAs = async (pid, sum, { clear = false } = {}) => {
        const [a, b] = diceFor(sum);
        const before = st;
        st = roll(before, pid, a, b);
        if (clear) st.vertices.forEach((v) => (v.building = null));
        const fresh = st.log.slice(before.log.length);
        const roller = st.players.find((p) => p.id === pid).name;
        assert.equal(fresh.length, 2, `the host says a ${sum} as two lines: ${JSON.stringify(fresh)}`);
        assert.equal(fresh[0], `${roller} rolled ${sum}!`);
        assert.match(fresh[1], new RegExp(`^(Nobody gains goods|.+ gains .+) — ${escape(roller)}'s roll(; the bank is short of [a-z ]+; nobody gains it)?\\.$`), "the goods line");
        heard.push(...fresh);
        await send([...fresh.map((text) => ({ type: "log", text })), { type: "state", you: "p1", game: st, legal: null }]);
        return fresh;
      };
      // The real Open chat button (the dock is a lazy chunk; on a phone it closes itself once when it mounts).
      await page.getByRole("button", { name: "Open chat" }).click({ timeout: STEP_MS });
      await page.getByTestId("chat-log").waitFor();
      // Every sum 2 to 12, rolled by the three seats in turn (Ember, p1, is this seat).
      const plan = [];
      for (let sum = 2; sum <= 12; sum++) plan.push({ pid: `p${sum % 3}`, sum });
      for (const step of plan) await rollAs(step.pid, step.sum);
      await frames(page);
      const rows = await page.evaluate(readRows);
      const normal = rows.find((r) => r.roll === null && r.text.length > 0);
      const plainWeight = await page.evaluate(() => Number(getComputedStyle(document.querySelector('[data-testid="chat-log"] [data-testid="log-row"]')).fontWeight));
      const normalRow = { ink: normal.ink, nameWeight: plainWeight };
      for (const step of plan) {
        const name = seatNames[Number(step.pid.slice(1))];
        const row = rows.find((r) => r.text === `${name} rolled ${step.sum}!`);
        check(!!row, `${tag} online: "${name} rolled ${step.sum}!" is in the log`);
        if (row) expectRow(`${tag} online`, row, normalRow, { name, sum: step.sum, own: step.pid === "p1" });
      }
      // The red is only on 6 and 8.
      const reds = rows.filter((r) => r.roll !== null && same(r.sumInk, DANGER)).map((r) => Number(r.roll));
      check(reds.length === 2 && reds.includes(6) && reds.includes(8), `${tag} online: only the 6 and the 8 are red (${reds})`);

      // Four more rolls to end the log on for the screenshot (the island emptied, so each is the roll line and "Nobody gains goods"):
      // the bot's 5, your own 4, another seat's red 6, and your own 8 (red sum, green line, bold name).
      await rollAs("p2", 5, { clear: true });
      await rollAs("p1", 4, { clear: true });
      await rollAs("p0", 6, { clear: true });
      await rollAs("p1", 8, { clear: true });
      await frames(page);
      await page.screenshot({ path: `test-results/roll-log-${tag}.png` });
      const tail = (await page.evaluate(readRows)).filter((r) => r.roll !== null).slice(-4);
      expectRow(`${tag} online shot`, tail[0], normalRow, { name: seatNames[2], sum: 5, own: false });
      expectRow(`${tag} online shot`, tail[1], normalRow, { name: "Ember", sum: 4, own: true });
      expectRow(`${tag} online shot`, tail[2], normalRow, { name: "Jarrod", sum: 6, own: false });
      expectRow(`${tag} online shot`, tail[3], normalRow, { name: "Ember", sum: 8, own: true });

      // The count (#687): the open chat log shows each online roll as one roll row and one goods row, in the host's order, and
      // no third row (the old "<sum> · <name> +n <good>" summary came ahead of them and said the sum twice).
      const shown = (await page.evaluate(readRows)).map((r) => r.text);
      const rolls = heard.length / 2;
      const isRoll = (t) => /^.+ rolled \d+!$/.test(t);
      const isGoods = (t) => / — .+'s roll[;.]$/.test(t);
      const firstRoll = shown.findIndex(isRoll);
      check(rolls === plan.length + 4, `${tag} online: ${rolls} rolls were made (${plan.length} sums, then four more)`);
      check(shown.filter(isRoll).length === rolls, `${tag} online: exactly one roll row per roll (${shown.filter(isRoll).length} for ${rolls})`, shown.filter(isRoll));
      check(shown.filter(isGoods).length === rolls, `${tag} online: exactly one goods row per roll (${shown.filter(isGoods).length} for ${rolls})`, shown.filter(isGoods));
      check(!shown.some((t) => /^\d+ · /.test(t)), `${tag} online: no "<sum> · ..." summary row`, shown.filter((t) => /^\d+ · /.test(t)));
      check(firstRoll >= 0 && JSON.stringify(shown.slice(firstRoll)) === JSON.stringify(heard), `${tag} online: from the first roll on, the rows are the host's lines in order, two per roll and no third`, { shown: shown.slice(Math.max(0, firstRoll)), heard });

      // The screen-reader log region and the HUD's last-line chip read the new line when the chat is closed (the Announcer).
      await page.evaluate(() => window.__emberisle.getState().setChatOpen(false));
      await send([{ type: "log", text: `${seatNames[2]} rolled 6!` }]);
      await page.waitForFunction((t) => document.querySelector('[data-testid="announce-log"]')?.textContent === t, `${seatNames[2]} rolled 6!`, { timeout: STEP_MS });
      check(true, `${tag} online: the screen-reader log region reads "${seatNames[2]} rolled 6!"`);
      const chip = await page.evaluate(() => document.querySelector('[data-testid="log-line"]')?.textContent ?? null);
      check(chip === `${seatNames[2]} rolled 6!`, `${tag} online: the HUD's last-line chip shows it too (${JSON.stringify(chip)})`);
      await page.close();
    }
  }

  check(errors.length === 0, "zero console errors", errors);
  if (failures) throw new Error(`${failures} check(s) failed`);
  console.log("roll-log-prove: ok");
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
