// Browser proof for PlaceChip and ChatDock keyboard/dialog guards and phone-rotation unread persistence.
// Covers src/components/game/PlaceChip.tsx and src/components/game/Chat.tsx.
// Run: npm run hud-chat-guards-prove
import assert from "node:assert/strict";
import { chromium } from "./proof-browser.mjs";
import { createServer } from "vite";

const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}/`;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
let checks = 0;
const ok = (msg) => { checks++; console.log(`ok   ${msg}`); };

async function loadOnlinePlay(page) {
  await page.evaluate(async () => {
    const { createGame } = await import("/src/lib/game/board.ts");
    const { applyAction, legalSettle } = await import("/src/lib/game/rules.ts");
    const st = createGame({ seed: 20261117, humans: [{ name: "Ember" }, { name: "Tide" }, { name: "Pine" }], bots: 0 });
    st.phase = "setupSettle";
    st.rollOff = null;
    st.current = "p0";
    st.seq = 10;
    const sentChat = [];
    const sentActs = [];
    window.__testNet = { sentChat, sentActs };
    const net = {
      say(text) { sentChat.push(text); },
      act(action) {
        sentActs.push(action);
        const cur = window.__emberisle.getState().state;
        const res = applyAction(cur, "p0", action);
        if (!res.error) window.__emberisle.setState({ state: res.state });
        return true;
      },
    };
    window.__emberisle.setState({
      screen: "play",
      mode: "online",
      net,
      code: "GUAR",
      seatId: "s0",
      localId: "p0",
      spectator: false,
      legal: { outpost: legalSettle(st, "p0", true), path: [], stronghold: [], wayfarer: [] },
      seats: [
        { id: "s0", name: "Ember", color: "#d64933", ready: true, connected: true, bot: false },
        { id: "s1", name: "Tide", color: "#2b6cb0", ready: true, connected: true, bot: false },
        { id: "s2", name: "Pine", color: "#2f855a", ready: true, connected: true, bot: false },
      ],
      state: st,
      chat: [],
      unread: 0,
      chatOpen: false,
      chatDraft: "",
      buildMode: "none",
      pendingPlace: null,
      howTo: false,
      costs: false,
      tradeOpen: false,
      menuFor: null,
      banner: null,
      error: null,
    });
  });
  await page.getByRole("button", { name: "Open chat" }).waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => window.__isle?.lastSeq === 10, null, { timeout: 30_000 });
}

try {
  // ---- Part 1: Desktop (1280x720) PlaceChip and ChatDock keyboard/dialog guards.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => localStorage.setItem("emberisle-first-game-coach", '"done"'));
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(`desktop: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`desktop: ${e}`));
    await page.goto(url);
    await page.waitForFunction(() => window.__emberisle);
    await loadOnlinePlay(page);

    const setPending = () =>
      page.evaluate(() => {
        const s = window.__emberisle.getState();
        const id = s.highlights().vertices[0];
        s.setPendingPlace({ kind: "vertex", id });
        return { id, seq: s.state.seq };
      });

    // 1. Enter on Cancel button cancels pendingPlace without placing the outpost.
    const c1 = await setPending();
    await page.getByTestId("place-cancel").waitFor({ timeout: 5000 });
    await page.getByTestId("place-cancel").focus();
    await page.keyboard.press("Enter");
    await page.getByTestId("place-chip").waitFor({ state: "detached", timeout: 5000 });
    const afterCancel = await page.evaluate((id) => {
      const s = window.__emberisle.getState();
      return { seq: s.state.seq, pending: s.pendingPlace, built: !!s.state.vertices.find((v) => v.id === id)?.building };
    }, c1.id);
    assert.equal(afterCancel.seq, c1.seq, "Enter on Cancel does not advance game seq");
    assert.equal(afterCancel.built, false, "Enter on Cancel does not place the outpost");
    assert.equal(afterCancel.pending, null, "Enter on Cancel clears pendingPlace");
    ok("Enter on Cancel button cancels pendingPlace without placing");

    // 2. Enter and Escape inside #chat-input do not confirm or cancel pendingPlace.
    const c2 = await setPending();
    await page.getByTestId("place-chip").waitFor({ timeout: 5000 });
    await page.getByRole("button", { name: "Open chat" }).click();
    const input = page.locator("#chat-input");
    await input.waitFor({ timeout: 5000 });
    await input.fill("hold on");
    await input.press("Enter");
    const afterChatEnter = await page.evaluate((id) => {
      const s = window.__emberisle.getState();
      return {
        seq: s.state.seq,
        pending: s.pendingPlace,
        built: !!s.state.vertices.find((v) => v.id === id)?.building,
        draft: s.chatDraft,
        sentChat: [...window.__testNet.sentChat],
        sentActs: window.__testNet.sentActs.length,
      };
    }, c2.id);
    assert.equal(afterChatEnter.seq, c2.seq, "Enter in chat input does not confirm pendingPlace");
    assert.equal(afterChatEnter.built, false, "Enter in chat input does not build outpost");
    assert.equal(afterChatEnter.sentActs, 0, "Enter in chat input sends no board actions");
    assert.equal(afterChatEnter.pending?.id, c2.id, "Enter in chat input keeps pendingPlace intact");
    assert.equal(afterChatEnter.draft, "", "Enter in chat input still sends and clears draft");
    assert.deepEqual(afterChatEnter.sentChat, ["hold on"], "Enter in chat input sends the chat line");
    ok("Enter in #chat-input sends chat without confirming pendingPlace");

    await input.focus();
    await input.press("Escape");
    await page.getByRole("button", { name: "Open chat" }).waitFor({ timeout: 5000 });
    const afterChatEsc = await page.evaluate(() => ({
      chatOpen: window.__emberisle.getState().chatOpen,
      pending: window.__emberisle.getState().pendingPlace,
    }));
    assert.equal(afterChatEsc.chatOpen, false, "Escape in chat input closes chat");
    assert.equal(afterChatEsc.pending?.id, c2.id, "Escape in chat input leaves pendingPlace intact");
    ok("Escape in #chat-input closes chat without clearing pendingPlace");

    // 3. Enter and Escape while How to play dialog is open do not confirm or clear pendingPlace.
    await page.evaluate(() => window.__emberisle.getState().setHowTo(true));
    await page.getByRole("dialog").waitFor({ timeout: 10_000 });
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Enter");
    const afterDialogEnter = await page.evaluate((id) => {
      const s = window.__emberisle.getState();
      return { seq: s.state.seq, pending: s.pendingPlace, built: !!s.state.vertices.find((v) => v.id === id)?.building };
    }, c2.id);
    assert.equal(afterDialogEnter.seq, c2.seq, "Enter with HowTo open does not confirm pendingPlace");
    assert.equal(afterDialogEnter.built, false, "Enter with HowTo open does not build outpost");
    assert.equal(afterDialogEnter.pending?.id, c2.id, "Enter with HowTo open keeps pendingPlace");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 });
    const afterDialogEsc = await page.evaluate(() => ({
      howTo: window.__emberisle.getState().howTo,
      pending: window.__emberisle.getState().pendingPlace,
    }));
    assert.equal(afterDialogEsc.howTo, false, "Escape closes HowTo dialog");
    assert.equal(afterDialogEsc.pending?.id, c2.id, "Escape closing HowTo leaves pendingPlace intact");
    ok("Enter and Escape while dialog is open leave pendingPlace intact");

    // 3b. Escape closing PlayerMenu leaves pendingPlace intact (document bubble vs window bubble).
    await page.evaluate(() => window.__emberisle.getState().openMenu("p1"));
    await page.getByTestId("player-menu").waitFor({ timeout: 10_000 });
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Escape");
    await page.getByTestId("player-menu").waitFor({ state: "detached", timeout: 5000 });
    const afterMenuEsc = await page.evaluate(() => ({
      menuFor: window.__emberisle.getState().menuFor,
      pending: window.__emberisle.getState().pendingPlace,
    }));
    assert.equal(afterMenuEsc.menuFor, null, "Escape closes PlayerMenu");
    assert.equal(afterMenuEsc.pending?.id, c2.id, "Escape closing PlayerMenu leaves pendingPlace intact");
    ok("Escape closing PlayerMenu leaves pendingPlace intact");

    // 4. With no input or dialog open, Escape cancels pendingPlace and Enter confirms pendingPlace.
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Escape");
    await page.getByTestId("place-chip").waitFor({ state: "detached", timeout: 5000 });
    assert.equal(await page.evaluate(() => window.__emberisle.getState().pendingPlace), null, "bare Escape clears pendingPlace");
    const c4 = await setPending();
    await page.getByTestId("place-chip").waitFor({ timeout: 5000 });
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Enter");
    await page.getByTestId("place-chip").waitFor({ state: "detached", timeout: 5000 });
    const afterBareEnter = await page.evaluate((id) => {
      const s = window.__emberisle.getState();
      return { seq: s.state.seq, built: !!s.state.vertices.find((v) => v.id === id)?.building, chatOpen: s.chatOpen };
    }, c4.id);
    assert.equal(afterBareEnter.built, true, "bare Enter confirms pendingPlace");
    assert.equal(afterBareEnter.seq, c4.seq + 1, "bare Enter advances game seq");
    assert.equal(afterBareEnter.chatOpen, false, "bare Enter confirming placement leaves chat closed");
    ok("bare Escape cancels and bare Enter confirms pendingPlace");

    // 5. ChatDock Enter hotkey does not open chat while How to play dialog is open.
    await page.evaluate(() => window.__emberisle.getState().setHowTo(true));
    await page.getByRole("dialog").waitFor({ timeout: 5000 });
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => window.__emberisle.getState().chatOpen), false, "Enter does not open chat while dialog is open");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 });
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__emberisle.getState().chatOpen && document.activeElement?.id === "chat-input", null, { timeout: 5000 });
    ok("ChatDock Enter hotkey stands down while a dialog is open and works once closed");

    await ctx.close();
  }

  // ---- Part 2: Phone (390x844 <-> 844x390) unread badge survives rotation and respects muted seats.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => {
      localStorage.setItem("emberisle-first-game-coach", '"done"');
      localStorage.setItem("emberisle-chat-muted-GUAR", JSON.stringify(["s2"]));
    });
    const page = await ctx.newPage();
    page.on("console", (m) => m.type() === "error" && errors.push(`phone: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`phone: ${e}`));
    await page.goto(url);
    await page.waitForFunction(() => window.__emberisle);
    await loadOnlinePlay(page);

    await page.evaluate(() => {
      const now = Date.now();
      window.__emberisle.setState({
        chatOpen: false,
        unread: 3,
        chat: [
          { id: 1, seat: "s1", name: "Tide", color: "#2b6cb0", text: "first", at: now - 300 },
          { id: 2, seat: "s2", name: "Pine", color: "#2f855a", text: "muted one", at: now - 200 },
          { id: 3, seat: "s0", name: "Ember", color: "#d64933", text: "my own line", at: now - 150 },
          { id: 4, seat: "s1", name: "Tide", color: "#2b6cb0", text: "second", at: now - 100 },
        ],
      });
    });

    await page.getByTestId("chat-unread").waitFor({ timeout: 5000 });
    assert.equal(await page.getByTestId("chat-unread").textContent(), "2", "portrait shows 2 unmuted unread messages");

    // Rotate portrait -> landscape (remounts ChatControls from Hud portrait slot to header slot).
    await page.setViewportSize({ width: 844, height: 390 });
    await page.getByTestId("chat-unread").waitFor({ timeout: 5000 });
    assert.equal(await page.getByTestId("chat-unread").textContent(), "2", "landscape keeps 2 unmuted unread messages after rotation");

    // Rotate landscape -> portrait again.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("chat-unread").waitFor({ timeout: 5000 });
    assert.equal(await page.getByTestId("chat-unread").textContent(), "2", "portrait again still keeps 2 unmuted unread messages");
    ok("phone unread badge survives portrait/landscape rotation and excludes muted seats");

    await ctx.close();
  }

  assert.deepEqual(errors, [], `console/page errors: ${errors.join("; ")}`);
  console.log(`hud-chat-guards-prove: ${checks} checks passed`);
} finally {
  await browser.close();
  await vite.close();
}
