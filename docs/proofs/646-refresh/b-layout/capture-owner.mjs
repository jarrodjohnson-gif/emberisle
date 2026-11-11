// Manual owner pictures: controlled fixture, actual product UI and renderer, no overlays or WebGL stubs.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from '/workspace/p873-b-frozen-validation/node_modules/playwright/index.mjs';
import { createServer } from '/workspace/p873-b-frozen-validation/node_modules/vite/dist/node/index.js';
const root='/workspace/p873-b-frozen-validation',out='/workspace/873-b-output/product-pictures';
mkdirSync(out,{recursive:true});
const vite=await createServer({root,server:{host:'127.0.0.1',port:0},logLevel:'error'});await vite.listen();
let browser;const records=[],errors=[];
try {
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const [width,height] of [[320,568],[390,844],[844,390],[1280,720]]) {
  const context=await browser.newContext({viewport:{width,height},hasTouch:width!==1280,isMobile:width!==1280,reducedMotion:'no-preference'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>m.type()==='error'&&errors.push(m.text()));
  await page.addInitScript(()=>{localStorage.setItem('emberisle-name','Jarrod');localStorage.setItem('emberisle-water','simple');localStorage.setItem('emberisle-first-game-coach',JSON.stringify('done'));});
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/`);await page.waitForFunction(()=>window.__emberisle);
  await page.evaluate(async()=>{
   const g=window.__emberisle;g.getState().startHotseat(4);
   const {createGame}=await import('/src/lib/game/board.ts');
   const {useLocalNeeds}=await import('/src/components/game/need-state.ts');
   const state=createGame({humans:[{name:'Jarrod'},{name:'Joshua'},{name:'Dune'},{name:'Ember'}],bots:0,seed:14,wayfarerMode:'off'});
   state.phase='main';state.rollOff=null;state.current='p0';state.log=[];
   for(const v of state.vertices)v.building=null;
   g.setState({mode:'hotseat',state,localId:'p0',tradeOpen:false,spectator:false});
   useLocalNeeds.setState({p1:{kinds:['ore'],turnsLeft:2},p2:{kinds:['grain','wool'],turnsLeft:2}},true);
  });
  await page.waitForFunction(()=>window.__isle?.landReady && window.__isle.terrainStats().ready);
  const firstDraw=await page.evaluate(()=>window.__isle.renders);await page.waitForFunction(n=>window.__isle.renders>=n+3,firstDraw);
  await page.waitForFunction(()=>document.querySelector('[data-testid="seat-needs"][data-player="p2"]'));
  assert.equal(await page.getByTestId('first-game-coach').count(),0);
  for(const state of ['overview','menu']) {
   if(state==='menu') {const before=await page.evaluate(()=>window.__isle.renders);await page.locator('[data-menu-trigger="p2"]').click();await page.getByTestId('menu-needs').waitFor();await page.waitForFunction(n=>window.__isle.renders>n,before);assert.deepEqual(await page.getByTestId('menu-needs').getByTestId('need-chip').allTextContents(),['Wheat','Sheep']);}
   await page.evaluate(()=>document.fonts.ready);
   const rendered=await page.evaluate(()=>({landReady:window.__isle.landReady,renders:window.__isle.renders,terrain:window.__isle.terrainStats()}));
   assert.equal(rendered.landReady&&rendered.terrain.ready,true);
   const file=`${width}x${height}-${state}.png`;await page.screenshot({path:`${out}/${file}`});
   records.push({width,height,state,file,rendered,sha256:createHash('sha256').update(readFileSync(`${out}/${file}`)).digest('hex')});
   console.log(file,JSON.stringify(rendered));
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);
} catch(e) {errors.push(String(e));throw e;} finally {
 writeFileSync(`${out}/records.json`,JSON.stringify({source:'8647aabf4c019a6ca6c584cb34997bd6d214bded',fixture:'controlled hotseat seed 14, forced main phase, cleared buildings, Joshua Stone, Dune grain/wool displayed Wheat/Sheep; not a legal play path',browser:browser?.version(),records,errors},null,2)+'\n');
 await browser?.close();await vite.close();
}
