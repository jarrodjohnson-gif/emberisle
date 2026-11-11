// #1505: a ?code= link opens on an empty name, the colour and one dark "Join table <code>".
// Play, Watch, Wayfarer, the code box and hotseat stay hidden. Host stays a text link.
// Reachable stays off the lobby. Ready, once set, reads Cancel ready.
// Ask for more time is a text link until the last 30 seconds, then the button it was.
// Pictures: docs/proofs/1505/. Run: npm run join-link-prove
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const PORT = Number(process.env.VITE_PORT) || 8155;
const OUT = "docs/proofs/1505";
const VIEWS = [
  { width: 390, height: 844, touch: true, shot: "join-390x844.jpg" },
  { width: 844, height: 390, touch: true, shot: "join-844x390.jpg" },
  { width: 320, height: 568, touch: true, shot: "join-320x568.jpg" },
  { width: 1280, height: 720, touch: false, shot: "join-1280x720.jpg" },
];

mkdirSync(OUT, { recursive: true });
const vite = await createServer({ server: { host: "127.0.0.1", port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const origin = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
let code = 0;

async function open(path, view) {
  const ctx = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    ...(view.touch ? { isMobile: true, hasTouch: true } : {}),
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("emberisle-name", "Ember");
    localStorage.setItem("emberisle-color", "#e23d2e");
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.routeWebSocket(/:8787\//, () => {});
  await page.goto(`${origin}${path}`);
  return { ctx, page, errors };
}

try {
  for (const view of VIEWS) {
    const tag = `${view.width}x${view.height}`;
    const { ctx, page, errors } = await open("/?code=JJJ8", view);
    await page.getByTestId("join-table").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => window.__isle?.landReady, null, { timeout: 20000 }).catch(() => {});
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const card = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="title-card"]');
      const fg = getComputedStyle(document.documentElement).getPropertyValue("--color-fg").trim();
      const probe = document.createElement("div");
      probe.style.backgroundColor = fg;
      document.body.append(probe);
      const fgRgb = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const buttons = [...root.querySelectorAll("button")];
      const text = (el) => el.textContent.trim();
      const box = (el) => el.getBoundingClientRect();
      const inside = (el) => {
        const r = box(el);
        return r.width > 0 && r.height >= 44 && r.top >= -0.5 && r.left >= -0.5 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5;
      };
      const name = root.querySelector('[data-testid="join-name"]');
      const join = root.querySelector('[data-testid="join-table"]');
      const host = root.querySelector('[data-testid="join-host"]');
      const radios = [...root.querySelectorAll('[aria-label="Your color"] [role="radio"]')];
      const cardBox = root.getBoundingClientRect();
      const clipped = [...root.querySelectorAll("h1, button, input")].filter((el) => {
        const r = box(el);
        return r.top < cardBox.top - 0.5 || r.left < cardBox.left - 0.5 || r.bottom > Math.min(innerHeight, cardBox.bottom) + 0.5 || r.right > Math.min(innerWidth, cardBox.right) + 0.5;
      }).map((el) => text(el) || el.getAttribute("aria-label"));
      return {
        link: root.getAttribute("data-join-link"),
        primary: buttons.filter((b) => getComputedStyle(b).backgroundColor === fgRgb).map(text),
        name: name.value,
        placeholder: name.getAttribute("placeholder"),
        join: text(join),
        hostFill: getComputedStyle(host).backgroundColor,
        hostDeco: getComputedStyle(host).textDecorationLine,
        play: buttons.filter((b) => text(b) === "Play").length,
        watch: buttons.filter((b) => text(b) === "Watch").length,
        hotseat: buttons.filter((b) => text(b) === "Four seats, one table").length,
        profile: buttons.filter((b) => text(b) === "Profile").length,
        wayfarer: root.querySelectorAll('[data-testid="wayfarer-setup"]').length,
        codeBox: root.querySelectorAll('[aria-label="Join code"]').length,
        colors: radios.length,
        checked: radios.filter((r) => r.getAttribute("aria-checked") === "true").map((r) => r.getAttribute("aria-label")),
        nameInside: inside(name),
        joinInside: inside(join),
        hostInside: inside(host),
        colorsInside: radios.every(inside),
        saved: localStorage.getItem("emberisle-name"),
        scroll: root.scrollHeight - root.clientHeight,
        clipped,
      };
    });
    assert.equal(card.link, "JJJ8", tag);
    assert.deepEqual(card.primary, ["Join table JJJ8"], `${tag}: one dark button`);
    assert.equal(card.name, "", `${tag}: name field empty`);
    assert.equal(card.placeholder, "Your name", tag);
    assert.equal(card.join, "Join table JJJ8", tag);
    assert.equal(card.saved, "Ember", `${tag}: empty field does not show the saved name`);
    assert.match(card.hostFill, /rgba\(0,\s*0,\s*0,\s*0\)|transparent/, `${tag}: Host is not a filled button (${card.hostFill})`);
    assert.match(card.hostDeco, /underline/, `${tag}: Host is a text link`);
    assert.equal(card.play, 0, tag);
    assert.equal(card.watch, 0, tag);
    assert.equal(card.hotseat, 0, tag);
    assert.equal(card.profile, 0, tag);
    assert.equal(card.wayfarer, 0, tag);
    assert.equal(card.codeBox, 0, tag);
    assert.equal(card.colors, 4, tag);
    assert.deepEqual(card.checked, ["Ember"], `${tag}: saved colour stays selected`);
    assert.ok(card.nameInside && card.joinInside && card.hostInside && card.colorsInside, `${tag}: name, colour, Join and Host are on screen ${JSON.stringify(card)}`);
    assert.ok(card.scroll <= 1, `${tag}: the card scrolls ${card.scroll}px`);
    assert.deepEqual(card.clipped, [], `${tag}: clipped ${card.clipped}`);
    await page.screenshot({ path: `${OUT}/${view.shot}`, type: "jpeg", quality: 80 });
    assert.deepEqual(errors, [], `${tag}: page errors`);
    console.log(`ok   ${tag}: empty name, colour, Join table JJJ8`);
    await ctx.close();
  }

  const plain = await open("/", VIEWS[3]);
  await plain.page.getByRole("button", { name: "Play", exact: true }).waitFor();
  assert.equal(await plain.page.locator("[data-join-link]").count(), 0, "a page with no code keeps the title");
  assert.equal(await plain.page.getByRole("button", { name: "Four seats, one table" }).count(), 1);
  await plain.ctx.close();
  console.log("ok   no code: the title is unchanged");

  const watch = await open("/?watch=JJJ8", VIEWS[3]);
  await watch.page.getByRole("button", { name: "Watch", exact: true }).waitFor();
  assert.equal(await watch.page.locator("[data-join-link]").count(), 0, "a watch link is not the join card");
  assert.equal(await watch.page.getByRole("button", { name: "Play", exact: true }).count(), 1);
  await watch.ctx.close();
  console.log("ok   watch link: still the title, with Watch");

  const typed = await open("/?code=JJJ8", VIEWS[0]);
  await typed.page.getByTestId("join-name").fill("Ada");
  await typed.page.getByTestId("join-table").click();
  await typed.page.waitForFunction(() => window.__emberisle.getState().name === "Ada");
  await typed.ctx.close();
  const kept = await open("/?code=JJJ8", VIEWS[0]);
  await kept.page.getByTestId("join-table").click();
  await kept.page.waitForFunction(() => window.__emberisle.getState().name === "Ember");
  await kept.ctx.close();
  console.log("ok   Join sends a typed name and keeps a saved name when the field is left empty");

  const lobby = await open("/", VIEWS[0]);
  await lobby.page.waitForFunction(() => window.__emberisle);
  await lobby.page.evaluate(() => window.__emberisle.setState({
    screen: "lobby",
    mode: "online",
    code: "JJJ8",
    seatId: "s0",
    isHost: true,
    error: null,
    seats: ["Ada", "Tide", "Dune", "Pine"].map((name, i) => ({
      id: `s${i}`, name, color: ["#e23d2e", "#2d6ee8", "#f3ecd9", "#8a4fd3"][i], ready: true, bot: false, away: false, host: i === 0,
    })),
    connectionHealth: { status: "Reachable", rtt: 72 },
  }));
  await lobby.page.getByTestId("lobby-card").waitFor();
  assert.equal(await lobby.page.getByTestId("connection-status").count(), 0, "Reachable is hidden");
  assert.equal(await lobby.page.getByRole("button", { name: "Cancel ready", exact: true }).count(), 1);
  assert.equal(await lobby.page.getByRole("button", { name: "Not ready", exact: true }).count(), 0);
  await lobby.page.evaluate(() => window.__emberisle.setState({ connectionHealth: { status: "Reconnecting", rtt: null } }));
  await lobby.page.getByTestId("connection-status").waitFor();
  assert.match(await lobby.page.getByTestId("connection-status").innerText(), /^Reconnecting/);
  await lobby.page.evaluate(() => window.__emberisle.setState({ connectionHealth: { status: "Offline", rtt: null } }));
  assert.match(await lobby.page.getByTestId("connection-status").innerText(), /^Offline/);
  await lobby.page.evaluate(() => {
    const seats = window.__emberisle.getState().seats.map((seat) => seat.id === "s0" ? { ...seat, ready: false } : seat);
    window.__emberisle.setState({ seats });
  });
  assert.equal(await lobby.page.getByRole("button", { name: "Ready", exact: true }).count(), 1);
  assert.deepEqual(lobby.errors, [], "lobby page errors");
  await lobby.ctx.close();
  console.log("ok   lobby: Reachable hidden, bad links shown, Cancel ready");

  const ask = await open("/", VIEWS[3]);
  await ask.page.waitForFunction(() => window.__emberisle);
  await ask.page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const { createRoot } = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { TurnExtensionVote } = await import("/src/components/game/TurnExtensionVote.tsx");
    const { useGame } = await import("/src/lib/game/store.ts");
    if (useGame !== window.__emberisle) throw new Error("store instance split");
    const extension = { target: "p0", key: "k1", used: false };
    const net = {
      subscribeTurnExtension() { return () => {}; },
      getTurnExtension() { return extension; },
      requestTurnExtension() {},
    };
    useGame.setState({
      mode: "online",
      spectator: false,
      localId: "p0",
      net,
      state: { phase: "roll", players: [{ id: "p0", name: "Ember", kind: "human" }, { id: "p1", name: "Tide", kind: "human" }] },
      turnTimer: { at: Date.now() + 90_000, player: "p0", deadline: Date.now() + 90_000, host: Date.now() },
      clockSkew: 0,
    });
    const div = document.createElement("div");
    div.id = "ask-probe";
    document.body.append(div);
    createRoot(div).render(React.createElement(TurnExtensionVote));
  });
  const button = ask.page.locator("#ask-probe [data-testid='turn-extension-ask']");
  await button.waitFor();
  assert.equal(await button.getAttribute("data-quiet"), "true", "plenty of time is a text link");
  assert.equal((await button.innerText()).trim(), "Ask for more time");
  assert.match(await button.evaluate((el) => getComputedStyle(el).textDecorationLine), /underline/);
  await ask.page.evaluate(() => {
    window.__emberisle.setState({ turnTimer: { at: Date.now() + 10_000, player: "p0", deadline: Date.now() + 10_000, host: Date.now() } });
  });
  await ask.page.waitForFunction(() => !document.querySelector("#ask-probe [data-testid='turn-extension-ask']")?.hasAttribute("data-quiet"));
  assert.doesNotMatch(await button.evaluate((el) => getComputedStyle(el).backgroundColor), /rgba\(0,\s*0,\s*0,\s*0\)|transparent/, "short time is the button");
  await ask.page.evaluate(() => {
    window.__emberisle.setState({
      localId: "p1",
      turnTimer: { at: Date.now() + 90_000, player: "p0", deadline: Date.now() + 90_000, host: Date.now() },
    });
  });
  await ask.page.waitForFunction(() => document.querySelector("#ask-probe [data-testid='turn-extension-ask']")?.getAttribute("data-quiet") === "true");
  assert.equal((await button.innerText()).trim(), "Give Ember more time");
  assert.deepEqual(ask.errors, [], "ask page errors");
  await ask.ctx.close();
  console.log("ok   Ask for more time is a text link until the last 30 seconds");
  console.log("join-link-prove: ok");
} catch (error) {
  console.error(error);
  code = 1;
} finally {
  await browser.close();
  await vite.close();
}
process.exit(code);
