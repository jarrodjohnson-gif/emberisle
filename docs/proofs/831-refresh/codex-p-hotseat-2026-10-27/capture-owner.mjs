import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chromium } from '/workspace/p883-b-frozen-validation/node_modules/playwright/index.mjs';
import { createServer } from '/workspace/p883-b-frozen-validation/node_modules/vite/dist/node/index.js';
import { createGame } from '/workspace/p883-b-frozen-validation/src/lib/game/board.ts';
import { chooseBotAction } from '/workspace/p883-b-frozen-validation/src/lib/game/ai.ts';
import { applyAction, harborRate } from '/workspace/p883-b-frozen-validation/src/lib/game/rules.ts';
import { RESOURCES } from '/workspace/p883-b-frozen-validation/src/lib/game/types.ts';
import assert from 'node:assert/strict';
const output='/workspace/883-hotseat-output';mkdirSync(output,{recursive:true});
let fixture, fixtureSeed;
for (let seed=11;seed<100;seed++) {
 let game=createGame({humans:[{name:'Jarrod'}],bots:3,seed});
 for(let guard=0;game.phase!=='main';guard++) {
  assert.ok(guard<400,'legal setup and roll reach main');
  const result=applyAction(game,game.current,chooseBotAction(game,game.current));
  assert.equal(result.error,undefined,'fixture advances only through legal actions');game=result.state;
 }
 if(game.current==='p0' && harborRate(game,'p0','timber')===4 && harborRate(game,'p0','clay')===4) {fixture=game;fixtureSeed=seed;break;}
}
assert.ok(fixture,'find a legal seeded first turn with ordinary Wood/Brick bank rates');
for(const player of fixture.players) {player.kind='human';player.resources=Object.fromEntries(RESOURCES.map(r=>[r,0]));}
Object.assign(fixture.players.find(p=>p.id==='p0').resources,{timber:6,clay:2,ore:6,grain:1});
Object.assign(fixture.players.find(p=>p.id==='p1').resources,{wool:3,ore:2});
for(const resource of RESOURCES) fixture.bank[resource]=19-fixture.players.reduce((n,p)=>n+p.resources[resource],0);
assert.ok(RESOURCES.every(r=>fixture.bank[r]>=0 && fixture.bank[r]+fixture.players.reduce((n,p)=>n+p.resources[r],0)===19),'controlled fixture conserves every bank good');
writeFileSync(output+'/fixture.json',JSON.stringify({seed:fixtureSeed,setup:'legal applyAction sequence through first roll',hands:'controlled conserved hands; no board/harbor/phase mutation',game:fixture},null,2)+'\n');
const vite=await createServer({root:'/workspace/p883-b-frozen-validation',server:{host:'127.0.0.1',port:0},logLevel:'error'});await vite.listen();
let browser;const records=[],errors=[];
try {
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 console.log('browser',browser.version(),'fixture seed',fixtureSeed);
 for(const [width,height] of [[390,844],[844,390],[1280,720]]) {
  const context=await browser.newContext({viewport:{width,height},hasTouch:width!==1280,isMobile:width!==1280,reducedMotion:'no-preference'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>m.type()==='error'&&errors.push(m.text()));
  await page.addInitScript(()=>{localStorage.setItem('emberisle-name','Jarrod');localStorage.setItem('emberisle-water','simple');localStorage.setItem('emberisle-first-game-coach',JSON.stringify('done'))});
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/`);await page.waitForFunction(()=>window.__emberisle);
  await page.evaluate(game=>{const api=window.__emberisle;api.getState().startAi();api.setState({state:game,localId:'p0',mode:'hotseat',tradeOpen:false,buildMode:'none',pendingPlace:null,peeking:true,spectator:false,offer:null,declined:[],tradeOutcome:null,tradeTaker:null,error:null,announcement:null,toast:null,net:null})},fixture);
  // Capture readiness only: let the real island finish building and draw actual frames.
  await page.waitForFunction(()=>window.__isle?.landReady && window.__isle.terrainStats().ready);
  const firstDraw=await page.evaluate(()=>window.__isle.renders);
  await page.waitForFunction(before=>window.__isle.renders>=before+3,firstDraw);
  const panel=page.getByTestId('trade-panel');
  for(const [state,give] of [['initial',null],['affordable','Wood'],['disabled','Brick']]) {
   const beforeOpen=await page.evaluate(()=>window.__isle.renders);
   await page.getByRole('button',{name:'Trade',exact:true}).click();await panel.waitFor();
   await page.waitForFunction(before=>window.__isle.renders>before,beforeOpen);
   if(give) {
    await panel.getByRole('button',{name:`More ${give} to give`,exact:true}).click();
    await panel.getByRole('button',{name:'More Stone to want',exact:true}).click();
   }
   await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid="trade-selection-motion"]')].every(el=>el.getAnimations().every(a=>a.playState==='finished')));
   await page.evaluate(()=>document.fonts.ready);
   assert.equal(await panel.getByRole('tab').count(),0);assert.equal(await panel.getByRole('radio').count(),0);
   const bank=panel.getByRole('button',{name:/^(Bank(?: 4:1)?|Dock [23]:1)$/});const quote=await panel.getByTestId('trade-hint').textContent();
   if(state==='affordable') {assert.equal(quote,'You give 4 wood. You get 1 stone.');assert.equal(await bank.isEnabled(),true);}
   if(state==='disabled') {assert.equal(quote,'Need 4 brick for the bank.');assert.equal(await bank.isDisabled(),true);}
   if(state==='initial') {assert.match(quote,/Choose one kind on each side/);assert.equal(await bank.isDisabled(),true);}
   assert.equal(await page.getByTestId('first-game-coach').count(),0,'saved Skip tips preference suppresses the actual coach');
   const rendered=await page.evaluate(()=>({landReady:window.__isle.landReady,renders:window.__isle.renders,terrain:window.__isle.terrainStats()}));
   assert.equal(rendered.landReady&&rendered.terrain.ready,true,'actual island renderer is ready');
   assert.equal(await panel.getByRole('button',{name:'Ask the table',exact:true}).count(),0,'hotseat omits Table action'); assert.equal(await panel.getByTestId('trade-player-preview').count(),0,'hotseat omits player quote'); assert.equal(await panel.locator('.trade-instructions').textContent(),'Choose one kind to give and one to get. Trade with the bank or your docks.'); const file=`${width}x${height}-hotseat-${state}.png`;await page.screenshot({path:output+'/'+file});
   const geometry=await panel.evaluate(el=>{const box=node=>{const b=node.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,bottom:b.bottom,right:b.right}};const sc=el.querySelector('.trade-composer-scroll');return{panel:box(el),goods:box(sc),goodsScrollHeight:sc.scrollHeight,footer:box(el.querySelector('footer')),buttons:[...el.querySelectorAll('button')].map(n=>({label:n.getAttribute('aria-label')||n.textContent.trim(),...box(n)}))}});
   records.push({width,height,state,file,quote,rendered,bankLabel:await bank.textContent(),disabled:await bank.isDisabled(),sha256:createHash('sha256').update(readFileSync(output+'/'+file)).digest('hex'),geometry});
   console.log(file,JSON.stringify({quote,disabled:await bank.isDisabled(),goodsScroll:geometry.goodsScrollHeight>geometry.goods.h,rendered}));
   await panel.getByRole('button',{name:'Close',exact:true}).click();await panel.waitFor({state:'detached'});
  }
  await context.close();
 }
 assert.deepEqual(errors,[],'owner capture has no page/console errors');
 writeFileSync(output+'/records.json',JSON.stringify({browser:browser.version(),fixtureSeed,records,errors},null,2)+'\n');console.log('hotseat pictures: 9 actual UI captures, 0 errors');
}finally {await browser?.close();await vite.close();}
