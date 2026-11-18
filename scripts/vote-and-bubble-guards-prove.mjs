// Proves TurnExtensionVote clock-skew parity and inactive-interval stop, plus SeatBubbles expiry timing.
// Run: npm run vote-and-bubble-guards-prove
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";
import { chooseBotAction } from "../src/lib/game/ai.ts";
import { createGame } from "../src/lib/game/board.ts";
import { applyAction } from "../src/lib/game/rules.ts";

let base = createGame({ humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0, seed: 23 });
while (base.phase !== "roll") {
  const next = applyAction(base, base.current, chooseBotAction(base, base.current));
  if (next.error) throw new Error(next.error);
  base = next.state;
}
base.current = "p0";
base.phase = "main";
base.turn = 4;

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const port = vite.httpServer.address().port;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const fails = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  if (!ok) fails.push(name);
};

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.addInitScript(() => {
    localStorage.setItem("emberisle-first-game-coach", '"done"');
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    // Track active 250 ms intervals so we can prove TurnExtensionVote stops polling when inactive.
    window.__intervals250 = new Set();
    const realSet = window.setInterval.bind(window);
    const realClear = window.clearInterval.bind(window);
    window.setInterval = (fn, ms, ...rest) => {
      const id = realSet(fn, ms, ...rest);
      if (ms === 250) window.__intervals250.add(id);
      return id;
    };
    window.clearInterval = (id) => {
      window.__intervals250.delete(id);
      return realClear(id);
    };
  });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__emberisle && window.__isle?.renders > 0);

  // Enter online play with a stubbed extension source and online/reactions chunks loaded.
  const extState = { target: "p0", key: "t4-p0", used: false, vote: null, result: null };
  await page.evaluate(async ([g, ext]) => {
    const { online } = await import("/src/components/game/chunks.ts");
    await online.prefetch();
    const e = window.__emberisle;
    const now = Date.now();
    // Initial push had 0 skew -> timer.at = now + 38_000 (> 30 s).
    // Later clockSkew improved to +12_000 -> deadline - skew = now + 26_000 (<= 30 s).
    const deadline = now + 38_000;
    const net = {
      subscribeTurnExtension: () => () => {},
      getTurnExtension: () => ext,
      requestTurnExtension: () => {},
      answerTurnExtension: () => {},
      close: () => {},
    };
    e.setState({
      screen: "play",
      mode: "online",
      code: "VBT1",
      localId: "p0",
      seatId: "s0",
      spectator: false,
      chatOpen: false,
      state: g,
      net,
      seats: [
        { id: "s0", name: "Ember", color: g.players[0].color, ready: true, host: true, player: "p0" },
        { id: "s1", name: "Tide", color: g.players[1].color, ready: true, host: false, player: "p1" },
        { id: "s2", name: "Pine", color: g.players[2].color, ready: true, host: false, player: "p2" },
      ],
      turnTimer: { at: deadline, player: "p0", deadline, host: now },
      clockSkew: 12_000,
    });
  }, [base, extState]);

  // 1. TurnExtensionVote must match TurnCountdown's deadline - clockSkew threshold (not quiet).
  await page.getByTestId("turn-countdown").waitFor();
  await page.getByTestId("turn-extension-ask").waitFor();
  const skewState = await page.evaluate(() => {
    const cd = document.querySelector('[data-testid="turn-countdown"]');
    const ask = document.querySelector('[data-testid="turn-extension-ask"]');
    return {
      countdownVisible: !!cd,
      countdownSeconds: cd ? Number(cd.dataset.seconds) : null,
      askQuiet: ask?.getAttribute("data-quiet") ?? null,
    };
  });
  check(
    "TurnExtensionVote leaves quiet mode when deadline - clockSkew is inside 30s",
    skewState.countdownVisible && skewState.countdownSeconds <= 30 && skewState.askQuiet === null,
    skewState,
  );

  // 2. Switching to spectator must stop TurnExtensionVote's 250 ms interval (leaving only TurnCountdown's).
  const activeCount = await page.evaluate(() => window.__intervals250.size);
  await page.evaluate(() => window.__emberisle.setState({ spectator: true }));
  await page.getByTestId("turn-extension-ask").waitFor({ state: "detached" });
  const spectatorCount = await page.evaluate(() => window.__intervals250.size);
  check(
    "TurnExtensionVote stops its 250 ms interval for spectators",
    activeCount >= 2 && spectatorCount === activeCount - 1,
    { activeCount, spectatorCount },
  );

  // Restore seated mode for SeatBubbles check.
  await page.evaluate(() => window.__emberisle.setState({ spectator: false, turnTimer: null }));

  // 3. SeatBubbles: sound bubble (3000 ms) over older chat bubble (4000 ms) must expire at sound's deadline, not chat's.
  // Install virtual clock so timer expiration is deterministic under arbitrary machine load.
  await page.clock.install();
  await page.evaluate(async () => {
    await import("/src/components/game/Reactions.tsx");
    const { useTalk } = await import("/src/components/game/talk.tsx");
    const now = Date.now();
    // Chat arrived at now (expires in 4000 ms); sound arrived at now + 50 ms (newer, expires in 3050 ms).
    const chatLine = { id: 901, seat: "s1", player: "p1", name: "Tide", color: "#000", text: "Hello there", at: now };
    const soundLine = { id: 902, seat: "s1", player: "p1", name: "Tide", color: "#000", text: "🔊 Fah", sound: "robbed_fah", at: now + 50 };
    useTalk.setState({
      arrived: new Map([
        [901, now],
        [902, now + 50],
      ]),
    });
    window.__emberisle.setState({ chat: [chatLine, soundLine], reactions: [] });
  });
  await page.getByTestId("sound-bubble").waitFor();

  // Fast-forward 3100 ms: sound bubble (3050 ms) must expire and reveal chat bubble (4000 ms).
  await page.clock.fastForward(3100);
  const swappedToChat = await page
    .waitForFunction(
      () => !document.querySelector('[data-testid="sound-bubble"]') && !!document.querySelector('[data-testid="chat-bubble"]'),
      null,
      { timeout: 3000 },
    )
    .then(() => true, () => false);
  const bubbleAfter = await page.evaluate(() => ({
    sound: !!document.querySelector('[data-testid="sound-bubble"]'),
    chat: document.querySelector('[data-testid="chat-bubble"]')?.textContent?.trim() ?? null,
  }));
  check("SeatBubbles drops expired sound bubble on time to show live chat underneath", swappedToChat && !bubbleAfter.sound && bubbleAfter.chat === "Hello there", bubbleAfter);

  check("zero page or console errors", errors.length === 0, errors);
  if (fails.length) throw new Error(`FAIL vote-and-bubble-guards-prove: ${fails.join("; ")}`);
  console.log("PASS vote-and-bubble-guards-prove");
} finally {
  await browser.close();
  await vite.close();
}
