import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";

const port = Number(process.env.VITE_PORT || 18532);
const vite = await createServer({ server: { host: "127.0.0.1", port, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
mkdirSync("test-results", { recursive: true });
try {
  for (const [width, height, reduced] of [[360,640,false],[390,844,false],[844,390,false],[1280,720,false],[360,640,true]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1000, isMobile: width < 1000, reducedMotion: reduced ? "reduce" : "no-preference" });
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => m.type() === "error" && errors.push(m.text()));
    await page.goto(`http://127.0.0.1:${port}`);
    await page.getByRole("button", { name: "Four seats, one table", exact: true }).click();
    await page.waitForFunction(() => window.__emberisle?.getState().state);
    const prompt = async (prefix) => {
      await page.waitForFunction(prefix => document.querySelector('[data-testid="turn-banner"]')?.textContent.startsWith(prefix), prefix);
      const info = await page.getByTestId("turn-banner").evaluate(el => {
        const s = getComputedStyle(el), r = el.getBoundingClientRect();
        return { text: el.textContent, font: s.fontSize, transform: s.textTransform, tracking: s.letterSpacing, lines: (r.height - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom) - parseFloat(s.borderTopWidth) - parseFloat(s.borderBottomWidth)) / parseFloat(s.lineHeight) };
      });
      assert.equal(info.font, "15px");
      assert.ok(info.lines <= 2.05, JSON.stringify({width, ...info}));
      assert.equal(info.transform, "none");
      assert.ok(["normal", "0px"].includes(info.tracking), info.tracking);
      assert.ok(!info.text.endsWith(".") && !info.text.includes("turn ·"), info.text);
      assert.match(info.text, /^(Roll|Place|Build|Move|Discard|Wait|Pick)\b/);
    };
    // Real roll-off and both rounds of legal setup, through the store's normal actions.
    for (let i = 0; i < 100; i++) {
      const phase = await page.evaluate(() => window.__emberisle.getState().state.phase);
      if (phase === "roll") break;
      await prompt({ rollOff: "Roll", setupSettle: "Place an outpost", setupRoad: "Place a path" }[phase]);
      const seq = await page.evaluate(() => {
        const s = window.__emberisle.getState(), st = s.state, h = s.highlights(), seq = st.seq;
        const action = st.phase === "rollOff" ? {type:"roll"} : st.phase === "setupSettle" ? {type:"setupSettle",vertexId:h.vertices[0]} : {type:"setupRoad",edgeId:h.edges[0]};
        const result = s.dispatch(action); if (!result.ok) throw new Error(result.error);
        return seq;
      });
      await page.waitForFunction(seq => window.__emberisle.getState().state.seq > seq, seq);
    }
    await prompt("Roll the dice");
    await page.evaluate(() => {
      const real = crypto.getRandomValues.bind(crypto), queue = [0,1];
      crypto.getRandomValues = buf => queue.length ? (buf[0] = queue.shift(), buf) : real(buf);
    });
    await page.getByRole("button", { name: "Roll", exact: true }).click();
    await prompt("Build, trade, or end your turn");
    await page.evaluate(() => {
      const g=window.__emberisle,st=structuredClone(g.getState().state);
      st.phase="discard";st.discardNeeded={[st.players.find(p=>p.id!==st.current).id]:3};st.seq++;
      g.setState({state:st});
    });
    await prompt("Discard 3 goods · ");
    await page.evaluate(() => {
      const g=window.__emberisle,st=g.getState().state;
      g.setState({mode:"ai",localId:st.current});
    });
    await prompt("Wait for discards");
    await page.evaluate(() => {
      const g=window.__emberisle,st=structuredClone(g.getState().state);
      st.phase="main";st.discardNeeded={};st.seq++;g.setState({state:st,mode:"hotseat"});
    });
    await page.evaluate(() => {
      const g=window.__emberisle, st=structuredClone(g.getState().state);
      st.players.find(p=>p.id===st.current).resources={timber:5,clay:5,wool:5,grain:5,ore:5};st.seq++;
      g.setState({state:st});
    });
    const path=page.getByRole("button",{name:"Path",exact:true});
    await path.click(); await prompt("Place a path");
    assert.match(await page.getByTestId("turn-banner").textContent(), /tap Path again to cancel|Esc cancels/);
    await path.click(); await prompt("Build, trade, or end your turn");
    const strongBtn = page.getByTestId("build-stronghold");
    await strongBtn.click(); await prompt("Pick a home to upgrade");
    assert.match(await page.getByTestId("turn-banner").textContent(), /tap Upgrade again to cancel|Esc cancels/);
    await strongBtn.click(); await prompt("Build, trade, or end your turn");
    await page.evaluate(() => {
      const g=window.__emberisle, st=structuredClone(g.getState().state);
      st.phase="discard";st.discardNeeded={[st.current]:3};st.seq++;g.setState({state:st});
    });
    await prompt("Discard 3 goods");
    await page.evaluate(() => window.__emberisle.getState().dispatch({type:"discard",resources:{timber:3}}));
    await prompt("Move the wayfarer");
    await page.evaluate(() => {
      const s=window.__emberisle.getState(),st=s.state;
      const hex=st.hexes.find(h=>h.id!==st.robberHex&&!st.vertices.some(v=>v.hexes.includes(h.id)&&v.building&&v.building.playerId!==st.current));
      const result=s.dispatch({type:"moveRobber",hexId:hex.id,stealFrom:null});if(!result.ok)throw new Error(result.error);
    });
    await prompt("Build, trade, or end your turn");
    await page.evaluate(() => {
      const g=window.__emberisle,st=g.getState().state;
      g.setState({mode:"ai",localId:st.players.find(p=>p.id!==st.current).id});
    });
    await prompt("Wait for ");
    await page.screenshot({path:`test-results/turn-copy-${width}${reduced?"-reduced":""}.png`});
    console.log(`${width}×${height}${reduced?" reduced":""}: action-first setup, roll, builds, discard and wayfarer; 15 px, at most two lines; waiting ownership preserved`);
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log("turn-copy-prove: all passed");
} finally {await browser.close();await vite.close();}
