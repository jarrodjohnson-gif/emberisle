// Public draw-deck count: every real host purchase, empty deck, four seat views + watcher,
// private card boundary, rejoin/restart, the public "Deck N" chip on every seat and the watcher (#776), and live tray updates for the seat that holds a fortune.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from '../server/node_modules/ws/wrapper.mjs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createGame } from '../src/lib/game/board.ts';
const dir=mkdtempSync(path.join(tmpdir(),'emberisle-fortune-count-'));
const port=Number(process.env.VITE_PORT||18549),sockets=[];const wait=ms=>new Promise(r=>setTimeout(r,ms));
let host,hostPort,browser;
const g=createGame({humans:[{name:'Ember'},{name:'Tide'},{name:'Pine'},{name:'Moss'}],bots:0,seed:549});
g.phase='main';g.rollOff=null;g.current='p0';g.log=[];
// Rich-hand fixture isolates purchases; the off-turn seat's older Wayfarer must remain unplayable.
g.players[0].resources={timber:0,clay:0,wool:25,grain:25,ore:25};g.players[1].hidden.knight=1;
const seats=g.players.map((p,i)=>({id:`s${i}`,name:p.name,color:p.color,ready:true,pid:p.id,secret:`FDAB-${p.id}`}));
writeFileSync(path.join(dir,'FDAB.json'),JSON.stringify({code:'FDAB',host:'s0',next:4,chat:[],chatSeq:0,game:g,seats,recoveryPids:[],shape:2,savedAt:Date.now()}));
async function start(){
 host=spawn(process.execPath,['--import','./register.mjs','host.mjs'],{cwd:new URL('../server/',import.meta.url),env:{...process.env,PORT:'0',ROOMS_DIR:dir,SAVE_MS:'20',GRACE_MS:'600000',HOLD_MS:'600000',TURN_MS:'600000',ACT_CAP:'1000',ACT_RATE:'1000'},stdio:['ignore','pipe','pipe']});
 hostPort=await new Promise((resolve,reject)=>{host.stdout.on('data',d=>{const m=String(d).match(/listening (\d+)/);if(m)resolve(Number(m[1]));});host.on('exit',c=>reject(Error(`host ${c}`)));});
}
async function client(pid){
 const ws=new WebSocket(`ws://127.0.0.1:${hostPort}`),messages=[];sockets.push(ws);ws.on('message',d=>messages.push(JSON.parse(String(d))));await new Promise(r=>ws.on('open',r));
 ws.send(JSON.stringify(pid===null?{type:'hello',code:'FDAB',watch:true}:{type:'hello',code:'FDAB',secret:`FDAB-${pid}`}));
 const next=async seq=>{for(let i=0;i<300;i++){const m=messages.find(m=>m.type==='state'&&m.game.seq>=seq);if(m)return structuredClone(m);const err=messages.find(m=>m.type==='error');if(err)throw Error(err.message);await wait(10);}throw Error('state timeout');};
 return{ws,next,state:await next(0)};
}
const vite=await createServer({server:{host:'127.0.0.1',port,strictPort:true},logLevel:'error'});
try{
 await start();const ids=['p0','p1','p2','p3',null],peers=[];
 for(const id of ids)peers.push(await client(id));
 const history=[peers.map(p=>p.state)];let actor=peers[0].state;
 const privacy=(views,left)=>{for(let i=0;i<views.length;i++){const s=views[i].game;assert.equal(s.phase,'main');assert.equal(s.deckLeft,left);assert.deepEqual(s.deck,[]);for(const p of s.players)if(p.id!==ids[i]){assert.ok(Object.values(p.hidden).every(n=>n===0));assert.equal(p.resources,undefined);}assert.ok(!('seed' in s)&&!('rng' in s));assert.ok(!s.log.some(line=>/draws? (a |an )?(knight|Wayfarer|Path|Plenty|Monopoly|point fortune)/i.test(line)));}};
 privacy(history[0],25);
 for(let bought=1;bought<=25;bought++){
  peers[0].ws.send(JSON.stringify({...actor.actionStamp,cid:crypto.randomUUID(),type:'buy'}));
  const views=await Promise.all(peers.map(p=>p.next(actor.game.seq+1)));actor=views[0];privacy(views,25-bought);history.push(views);
 }
 // Rejoin at zero, then rebuild the host from its flushed room snapshot.
 peers[2].ws.terminate();await new Promise(r=>peers[2].ws.once('close',r));const rejoined=await client('p2');assert.equal(rejoined.state.game.deckLeft,0);
 for(let i=0;i<100;i++){if(JSON.parse(readFileSync(path.join(dir,'FDAB.json'))).game.deck.length===0)break;await wait(20);}
 assert.equal(JSON.parse(readFileSync(path.join(dir,'FDAB.json'))).game.deck.length,0);
 for(const ws of sockets)ws.terminate();host.kill('SIGKILL');await new Promise(r=>host.once('exit',r));await start();
 const restarted=[];for(const id of ids)restarted.push((await client(id)).state);privacy(restarted,0);
 for(const ws of sockets)ws.terminate();host.kill('SIGKILL');
 await vite.listen();browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});mkdirSync('test-results',{recursive:true});const errors=[];
 for(const [width,height,reduced] of [[390,844,false],[1280,720,false],[844,390,true]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,reducedMotion:reduced?'reduce':'no-preference'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${port}`);await page.waitForFunction(()=>window.__emberisle);
  const load=(view,i)=>page.evaluate(({view,i})=>{const store=window.__emberisle;store.setState({spectator:i===4,menuFor:null,chatOpen:false,code:'FDAB',seatId:`s${i}`});store.getState().loadState(view.game,view.you??'',i===0,'FDAB');},{view,i});
  for(let i=0;i<5;i++){
   // #776: the public chip beside the log line shows the count on every seat and the watcher, with any hand and on or off turn.
   const chip=n=>page.waitForFunction(n=>document.querySelector('[data-testid="deck-count"]')?.textContent===`Deck ${n}`,n);
   await load(history[0][i],i);const opener=page.getByTestId('fortunes-button');await chip(25);
   // My fortunes shows exactly when this seat holds a fortune (never to the watcher); buyers keep what they drew, so it is compared with the hand.
   const heldMatchesOpener=async()=>{const held=await page.evaluate(()=>{const g=window.__emberisle.getState();if(g.spectator)return 0;const me=g.state.players.find(p=>p.id===g.localId);return Object.values(me.hidden).reduce((n,c)=>n+c,0);});
    await page.waitForFunction(h=>{const b=document.querySelectorAll('[data-testid="fortunes-button"]');if(!(matchMedia('(pointer: coarse)').matches||innerWidth<768))return b.length===(h>0?1:0);if(b.length!==1||(b[0].getAttribute('aria-disabled')==='true')!==(h===0))return false;const r=b[0].getBoundingClientRect(),k=[r.x,r.y,r.width,r.height].join();return(window.__fortunesBox??=k)===k;},held);};
   if(i!==1){const phone=await page.evaluate(()=>matchMedia('(pointer: coarse)').matches||innerWidth<768);assert.equal(await opener.count(),phone?1:0);if(phone)assert.equal(await opener.getAttribute('aria-disabled'),'true');
    for(let bought=1;bought<=25;bought++){await load(history[bought][i],i);await chip(25-bought);await heldMatchesOpener();}
    await load(restarted[i],i);await chip(0);await heldMatchesOpener();
    continue;}
   await opener.waitFor();assert.equal(await opener.getAttribute('data-deck-left'),'25');
   const b=await opener.boundingBox();assert.ok(b.width>=44&&b.height>=44&&b.x>=0&&b.y>=0&&b.x+b.width<=width&&b.y+b.height<=height);
   await opener.click();await page.getByTestId('fortune-deck-count').waitFor();
   assert.equal(await page.getByTestId('fortune-play-knight').getAttribute('aria-disabled'),'true');
   for(let bought=1;bought<=25;bought++){
    await load(history[bought][i],i);
    await chip(25-bought);await page.waitForFunction(n=>document.querySelector('[data-testid="fortune-deck-count"]')?.dataset.deckLeft===String(n),25-bought);
    assert.equal(await opener.getAttribute('data-deck-left'),String(25-bought));
   }
   await load(restarted[i],i);await chip(0);assert.equal(await page.getByTestId('fortune-deck-count').textContent(),'0 left in deck');
   await page.keyboard.press('Escape');await page.getByTestId('fortune-tray').waitFor({state:'detached'});assert.equal(await opener.getAttribute('data-deck-left'),'0');
  }
  await page.screenshot({path:`test-results/fortune-count-${width}.png`});await context.close();
  console.log(`ok ${width}x${height}${reduced?' reduced':''}: all seats + watcher read the public Deck chip 25→0 and after restart; the holder's tray updates live; off-turn refusal, private deck/kinds protected`);
 }
 assert.deepEqual(errors,[]);console.log('fortune-count-prove: all passed');
}finally{await browser?.close();await vite.close();for(const ws of sockets)ws.terminate();host?.kill('SIGKILL');rmSync(dir,{recursive:true,force:true});}
