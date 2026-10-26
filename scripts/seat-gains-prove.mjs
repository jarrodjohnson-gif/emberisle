// #827: public production/trade cues through real host projections and two recovered browser seats.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createGame } from '../src/lib/game/board.ts';
import { publicSeatChanges } from '../src/components/game/seat-public-gains.ts';

const previous={seq:1,rolls:4,lastProduction:[],log:['Earlier event'],players:[{id:'p0',name:'Jarrod'},{id:'p1',name:'Joshua'}]};
const after=(patch)=>({...previous,seq:2,...patch});
assert.deepEqual(publicSeatChanges(previous,after({rolls:5,lastProduction:[{player:'p1',res:'grain',n:2}]})),[{player:'p1',goods:{grain:2}}]);
assert.deepEqual(publicSeatChanges(previous,after({log:[...previous.log,'Joshua gains 1 good; Jarrod loses 1 good — wayfarer.']})),[]);
assert.deepEqual(publicSeatChanges(previous,after({players:previous.players.map(p=>({...p,resources:{grain:999}}))})),[]);
const trades=publicSeatChanges(previous,after({log:[...previous.log,'Jarrod traded 1 wood to Joshua for 1 wheat.']}));
assert.equal(trades.find(p=>p.player==='p1').goods.timber,1);assert.equal(trades.find(p=>p.player==='p1').goods.grain,-1);
assert.equal(publicSeatChanges(previous,after({log:[...previous.log,'Joshua traded 4 wood to the bank for 1 stone.']}))[0].goods.ore,1);
assert.deepEqual(publicSeatChanges(previous,after({log:[...previous.log,'Joshua discards 2 goods.']})),[]);
assert.deepEqual(publicSeatChanges(previous,after({seq:1,log:[...previous.log,'Joshua traded 4 wood to the bank for 1 stone.']})),[]);
const capped={...previous,log:Array.from({length:200},(_,i)=>`Event ${i}`)};
assert.equal(publicSeatChanges(capped,{...capped,seq:2,log:[...capped.log.slice(1),'Joshua traded 4 wood to the bank for 1 stone.']})[0].goods.timber,-4);
const duplicateNames={...previous,players:[{id:'p0',name:'Joshua'},{id:'p1',name:'Joshua'}]};
assert.deepEqual(publicSeatChanges(duplicateNames,{...duplicateNames,seq:2,log:['Earlier event','Joshua traded 4 wood to the bank for 1 stone.']}),[]);
console.log('ok public projection: roll aggregation, table/bank trades, bounded log, duplicate names, private hand/theft/discard exclusion');

const directory=mkdtempSync(path.join(tmpdir(),'emberisle-seat-gains-'));
const code='GA1N';
let game=createGame({humans:[{name:'Jarrod'},{name:'Joshua'}],bots:0,seed:14});
game.phase='roll';game.rollOff=null;game.current='p0';game.rolls=4;game.log=['Earlier event'];
for(const vertex of game.vertices)vertex.building=null;
const vertex=game.vertices.find(v=>v.hexes.length===3);
vertex.building={playerId:'p1',kind:'stronghold'};
for(const hex of game.hexes){hex.pip=8;hex.terrain='grain';}
const paying=game.hexes.find(h=>h.id===vertex.hexes[0]);paying.pip=6;
game.robberHex=game.hexes.find(h=>h.id!==paying.id).id;
for(const p of game.players){for(const r of ['timber','clay','wool','grain','ore'])p.resources[r]=0;}
game.players[0].resources.timber=2;game.players[1].strongholdsLeft=3;
game.bank={timber:17,clay:19,wool:19,grain:19,ore:19};
game.lastProduction=[{hex:paying.id,player:'p1',res:'grain',n:2}];
const seats=game.players.map((p,i)=>({id:`s${i}`,name:p.name,color:p.color,ready:true,pid:p.id,secret:`fixture-${p.id}`}));
writeFileSync(path.join(directory,`${code}.json`),JSON.stringify({code,host:'s0',next:2,chat:[],chatSeq:0,game,seats,shape:2,savedAt:Date.now()}));
// Test-process-only dice source. Production handlers and their private/public projections remain unchanged.
const preload=path.join(directory,'dice.mjs');
writeFileSync(preload,'crypto.getRandomValues = (buffer) => { buffer.fill(2); return buffer; };\n');
const host=spawn(process.execPath,['--import',pathToFileURL(preload).href,'--import','./register.mjs','host.mjs'],{
 cwd:new URL('../server/',import.meta.url),env:{...process.env,PORT:'0',ROOMS_DIR:directory,PROFILES_DIR:path.join(directory,'profiles'),TURN_MS:'600000',GRACE_MS:'600000',HOLD_MS:'600000'},stdio:['ignore','pipe','pipe']});
let stderr='';host.stderr.on('data',d=>stderr+=d);
process.on('exit',()=>{host.kill();rmSync(directory,{recursive:true,force:true});});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>process.exit(130));
let browser,vite;
try {
 const hostPort=await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error(`host startup timeout: ${stderr}`)),10000);
  host.once('error',e=>{clearTimeout(timeout);reject(e);});
  host.once('exit',c=>{clearTimeout(timeout);reject(Error(`host exited ${c}: ${stderr}`));});
  host.stdout.on('data',d=>{const m=String(d).match(/listening (\d+)/);if(m){clearTimeout(timeout);resolve(Number(m[1]));}});
 });
 const port=Number(process.env.VITE_PORT)||18727;
 vite=await createServer({server:{host:'127.0.0.1',port,strictPort:true},logLevel:'error'});await vite.listen();
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined)});
 const errors=[];
 async function tab(pid){
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(({code,pid})=>{
   localStorage.setItem('emberisle-seat',JSON.stringify({code,secret:`fixture-${pid}`}));
   localStorage.setItem('emberisle-seat-live',code);localStorage.setItem('emberisle-chat-open','0');
   for(const method of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced'])WebGL2RenderingContext.prototype[method]=()=>{};
  },{code,pid});
  await page.goto(`http://127.0.0.1:${port}/?host=ws://127.0.0.1:${hostPort}`);
  await page.waitForFunction(pid=>window.__emberisle?.getState().state&&window.__emberisle.getState().localId===pid,pid);
  await page.waitForFunction(()=>window.__isle?.insets);
  return page;
 }
 const jarrod=await tab('p0'),joshua=await tab('p1');
 const cue=jarrod.getByTestId('rail-p1').getByTestId('seat-public-gains');
 assert.equal(await jarrod.getByTestId('seat-public-gains').count(),0,'restored production never replays');
 const baseline=await jarrod.evaluate(()=>window.__isle.insets());
 await jarrod.evaluate(()=>window.__emberisle.getState().dispatch({type:'roll'}));
 await cue.waitFor();assert.equal(await cue.getAttribute('aria-label'),'Joshua: +2 Wheat');
 const started=Date.now();
 assert.equal(await jarrod.getByTestId('rail-p0').getByTestId('seat-public-gains').count(),0);
 assert.equal(await jarrod.evaluate(()=>window.__emberisle.getState().state.players.find(p=>p.id==='p1').resources),undefined,'other hand stays hidden');
 assert.deepEqual(await jarrod.evaluate(()=>window.__isle.insets()),baseline);
 mkdirSync('test-results',{recursive:true});await jarrod.screenshot({path:'test-results/seat-gains-desktop.png'});
 await cue.waitFor({state:'detached',timeout:3200});
 assert(Date.now()-started>=1900,'cue stays visible near 2.5 seconds');
 console.log('ok real host, two clients: Joshua gains +2 Wheat on Jarrod\'s rail, then clears; hidden hand absent; map hole unchanged');
 await jarrod.emulateMedia({reducedMotion:'reduce'});await jarrod.setViewportSize({width:390,height:844});
 await jarrod.evaluate(()=>window.__emberisle.getState().askTable({timber:1},{grain:1}));
 await joshua.waitForFunction(()=>window.__emberisle.getState().offer);
 await joshua.evaluate(()=>window.__emberisle.getState().answerTrade(true));
 const phoneCue=jarrod.getByTestId('seat-p1').getByTestId('seat-public-gains');
 await phoneCue.waitFor();assert.equal(await phoneCue.getAttribute('aria-label'),'Joshua: +1 Wood, −1 Wheat');
 const box=await phoneCue.boundingBox(),anchor=await jarrod.getByTestId('seat-p1').boundingBox();
 assert.deepEqual(box,anchor);assert.equal(await phoneCue.evaluate(el=>el.getAnimations({subtree:true}).length),0);
 await jarrod.screenshot({path:'test-results/seat-gains-phone.png'});
 await jarrod.setViewportSize({width:1280,height:720});await cue.waitFor();
 assert.equal(await cue.getAttribute('aria-label'),'Joshua: +1 Wood, −1 Wheat');
 await cue.waitFor({state:'detached',timeout:3200});
 await jarrod.reload();await jarrod.waitForFunction(()=>window.__emberisle?.getState().state);
 assert.equal(await jarrod.getByTestId('seat-public-gains').count(),0,'rejoin never replays public history');
 console.log('ok real table trade: received Wood and given Wheat appear on the phone seat; reduced motion is static; rotation and rejoin preserve cue lifetime');
 assert.deepEqual(errors,[]);console.log('seat gains prove ok');
} finally {
 await browser?.close();await vite?.close();host.kill();
 if(host.exitCode===null&&host.signalCode===null)await Promise.race([once(host,'exit'),new Promise(r=>setTimeout(r,3000).unref())]);
 rmSync(directory,{recursive:true,force:true});
}
