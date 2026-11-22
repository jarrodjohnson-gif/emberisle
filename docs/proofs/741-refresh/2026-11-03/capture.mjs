import { chromium } from '/workspace/work/741-adopt/node_modules/playwright/index.mjs';
import { createServer } from '/workspace/work/741-adopt/node_modules/vite/dist/node/index.js';
import { writeFileSync } from 'node:fs';
const PORT=8121, STEP_MS=90000;
const vite=await createServer({root:'/workspace/work/741-adopt',server:{host:'127.0.0.1',port:PORT,strictPort:true},logLevel:'error'});await vite.listen();
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function toMySetup(page) {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__emberisle && window.__isle);
  await page.keyboard.press("Shift");
  await page.evaluate(() => window.__emberisle.getState().startAi());
  for (;;) {
    const next = await (
      await page.waitForFunction(
        () => {
          const s = window.__emberisle.getState();
          const st = s.state;
          if (!st || !window.__isle?.lastState) return false;
          if (st.phase === "rollOff" && st.current === s.localId) return "roll";
          if (st.phase === "setupSettle" && st.current === s.localId) return "mine";
          return false;
        },
        null,
        { timeout: STEP_MS },
      )
    ).jsonValue();
    if (next === "mine") return page.evaluate(() => window.__emberisle.setState({ runBots: () => {} }));
    await page.evaluate(() => window.__emberisle.getState().dispatch({ type: "roll" }));
    await page.waitForFunction(() => {
      const s = window.__emberisle.getState();
      return s.state.phase !== "rollOff" || s.state.current !== s.localId;
    });
  }
}


const records=[];
try {
for (const [width,height] of [[390,844],[1280,720]]) {
 const started=Date.now(), errors=[];
 const ctx=await browser.newContext({viewport:{width,height},recordVideo:{dir:'/workspace/work/741-evidence/raw-video',size:{width,height}}});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await toMySetup(page);await page.waitForTimeout(800);
 await page.screenshot({path:`/workspace/work/741-evidence/before-${width}.png`});
 const events=[];
 const mark=kind=>events.push({kind,videoSeconds:(Date.now()-started)/1000});
 mark('outpost');
 const vid=await page.evaluate(()=>{const g=window.__emberisle.getState(),id=g.highlights().vertices[0];g.pickVertex(id);return id;});
 await page.waitForTimeout(1600);
 mark('path');
 await page.evaluate(()=>{const g=window.__emberisle.getState();g.pickEdge(g.highlights().edges[0]);});
 await page.waitForTimeout(1600);
 mark('stronghold');
 await page.evaluate(vid=>{const isle=window.__isle,st=structuredClone(isle.lastState);st.vertices.find(v=>v.id===vid).building.kind='stronghold';st.seq++;isle.setBoard(st,isle.lastHi,false);},vid);
 await page.waitForTimeout(1600);
 await page.screenshot({path:`/workspace/work/741-evidence/after-${width}.png`});
 const video=page.video();await ctx.close();records.push({width,height,vid,events,errors,video:await video.path()});
 console.log(JSON.stringify(records.at(-1)));
}
} finally {await browser.close();await vite.close();writeFileSync('/workspace/work/741-evidence/capture.json',JSON.stringify(records,null,2));}
