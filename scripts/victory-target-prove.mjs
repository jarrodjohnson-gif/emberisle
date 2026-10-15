// Real lobby controls and hosted rules: default 10, public 7/10 selection, host-only updates,
// restart persistence, wins at the selected target, fixed live rules, and rematch inheritance/selection.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from '../server/node_modules/ws/wrapper.mjs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const dir=mkdtempSync(path.join(tmpdir(),'emberisle-victory-target-'));
const port=Number(process.env.VITE_PORT||18547),sockets=[];const wait=ms=>new Promise(r=>setTimeout(r,ms));
let host,hostPort,browser;
async function start(){
 let stderr='';host=spawn(process.execPath,['--import','./register.mjs','host.mjs'],{cwd:new URL('../server/',import.meta.url),env:{...process.env,PORT:'0',ROOMS_DIR:dir,SAVE_MS:'20',GRACE_MS:'600000',HOLD_MS:'600000',LOBBY_HOLD_MS:'600000',TURN_MS:'600000',ACT_CAP:'1000',ACT_RATE:'1000'},stdio:['ignore','pipe','pipe']});
 host.stderr.on('data',d=>stderr+=d);hostPort=await new Promise((resolve,reject)=>{host.stdout.on('data',d=>{const m=String(d).match(/listening (\d+)/);if(m)resolve(Number(m[1]));});host.on('exit',c=>reject(Error(`host ${c}: ${stderr}`)));});
}
async function client(hello,retryTaken){
 const ws=new WebSocket(`ws://127.0.0.1:${hostPort}`),messages=[];sockets.push(ws);let state;
 ws.on('message',d=>{const m=JSON.parse(String(d));messages.push(m);if(m.type==='state')state=m;});await new Promise(r=>ws.on('open',r));ws.send(JSON.stringify({type:'hello',...hello}));
 const next=async(type,test=()=>true)=>{for(let i=0;i<400;i++){const m=messages.find(m=>m.type===type&&test(m));if(m)return structuredClone(m);await wait(10);}throw Error(`timeout ${type}: ${JSON.stringify(messages.slice(-3))}`);};
 if(retryTaken)for(let i=0;i<400&&!messages.some(m=>m.type==='welcome');i++){if(messages.some(m=>m.type==='error'&&m.message==='Seat is taken.')){ws.terminate();throw Error('taken');}await wait(10);}
 const welcome=await next('welcome');return{ws,messages,next,welcome,send:m=>ws.send(JSON.stringify({...state?.actionStamp,cid:crypto.randomUUID(),...m}))};
}
// The host drops a socket asynchronously, so a rejoin can race the old socket's close: retry while the seat still looks taken.
async function restore(welcome){for(let i=0;i<100;i++){try{return await client({code:welcome.code,secret:welcome.secret},true);}catch(e){if(e.message!=='taken')throw e;await wait(20);}}throw Error('seat stayed taken');}
async function guestsAway(host){for(let i=0;i<400;i++){const last=host.messages.findLast(m=>m.type==='seats');if(last?.seats.slice(1).every(x=>x.away))return;await wait(10);}throw Error('guests never marked away');}
async function close(peer){if(peer.ws.readyState===WebSocket.CLOSED)return;peer.ws.terminate();await new Promise(r=>peer.ws.once('close',r));}
async function room(){const peers=[await client({name:'Ember'})],code=peers[0].welcome.code;for(const name of ['Tide','Pine'])peers.push(await client({code,name}));for(const p of peers){const m=await p.next('seats',m=>m.seats.length===3);assert.equal(m.victoryTarget,10);}return{code,peers};}
async function setting(table,n){for(const p of table.peers)await p.next('seats',m=>m.victoryTarget===n);}
async function begin(table){for(const p of table.peers)p.send({type:'ready',value:true});await table.peers[0].next('seats',m=>m.seats.length===3&&m.seats.every(s=>s.ready));table.peers[0].send({type:'start'});return Promise.all(table.peers.map(p=>p.next('state')));}
async function saved(code,test){for(let i=0;i<100;i++){try{const s=JSON.parse(readFileSync(path.join(dir,`${code}.json`)));if(test(s))return s;}catch{}await wait(20);}throw Error('save timeout');}
const vite=await createServer({server:{host:'127.0.0.1',port,strictPort:true},logLevel:'error'});
try{
 await start();await vite.listen();browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});mkdirSync('test-results',{recursive:true});const errors=[];
 const seven=await room(),ten=await room(),change=await room();const tables=[seven,ten,change];
 seven.peers[1].send({type:'setVictoryTarget',value:7});assert.equal((await seven.peers[1].next('error')).message,'Only the host can choose the target.');
 seven.peers[0].send({type:'setVictoryTarget',value:8});assert.equal((await seven.peers[0].next('error')).message,'Choose 7 or 10 points.');
 change.peers[0].send({type:'setVictoryTarget',value:7});await setting(change,7);
 const original=seven.peers[0].welcome;
 for(const [width,height,touch] of [[390,844,true],[1280,720,false],[844,390,true]]){
  for(const p of seven.peers.slice(1))await close(p);await guestsAway(seven.peers[0]);await close(seven.peers[0]);await wait(80);const context=await browser.newContext({viewport:{width,height},hasTouch:touch,reducedMotion:touch?'reduce':'no-preference'});
  await context.addInitScript(w=>localStorage.setItem('emberisle-seat',JSON.stringify({code:w.code,secret:w.secret})),original);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${port}/?host=${encodeURIComponent(`ws://127.0.0.1:${hostPort}`)}`);
  await page.getByTestId('lobby-card').waitFor();for(let i=1;i<3;i++)seven.peers[i]=await restore(seven.peers[i].welcome);
  for(const n of [10,7]){await page.getByRole('radio',{name:`${n} points`,exact:true}).click();await page.waitForFunction(n=>document.querySelector('[data-testid="victory-target"]')?.dataset.value===String(n),n);}
  for(const p of seven.peers.slice(1))await p.next('seats',m=>m.victoryTarget===7);
  // Native-like arrow navigation changes and focuses the next 44px radio.
  await page.getByRole('radio',{name:'7 points',exact:true}).focus();await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>document.querySelector('[data-testid="victory-target"]')?.dataset.value==='10');
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'10 points');
  await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>document.querySelector('[data-testid="victory-target"]')?.dataset.value==='7');
  // Two keys in one task run before any host reply: follow focus, not the last acknowledged selection.
  const at=seven.peers[1].messages.length;
  assert.equal(await page.evaluate(()=>{const group=document.querySelector('[role="radiogroup"][aria-label="Victory target"]');group.querySelector('[aria-label="7 points"]').focus();for(let i=0;i<2;i++)document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));return document.activeElement.getAttribute('aria-label');}),'7 points');
  for(let i=0;i<400;i++){const choices=seven.peers[1].messages.slice(at).filter(m=>m.type==='seats').map(m=>m.victoryTarget);if(choices.slice(-2).join(',')==='10,7')break;await wait(10);}
  assert.deepEqual(seven.peers[1].messages.slice(at).filter(m=>m.type==='seats').map(m=>m.victoryTarget).slice(-2),[10,7]);
  await page.waitForFunction(()=>document.querySelector('[data-testid="victory-target"]')?.dataset.value==='7');
  for(const radio of await page.getByRole('radio',{name:/^(7|10) points$/}).all()){const b=await radio.boundingBox();assert.ok(b.width>=44&&b.height>=44&&b.x>=0&&b.y>=0&&b.x+b.width<=width&&b.y+b.height<=height);}
  await page.screenshot({path:`test-results/victory-target-lobby-${width}.png`});for(const p of seven.peers.slice(1))await close(p);await page.waitForFunction(()=>window.__emberisle.getState().seats.slice(1).every(x=>x.away));await context.close();await wait(80);seven.peers[0]=await restore(original);for(let i=1;i<3;i++)seven.peers[i]=await restore(seven.peers[i].welcome);
  console.log(`ok ${width}x${height}: host radio choice, keyboard arrows, 44px targets, public 7-point lobby`);
 }
 // A guest gets the same visible value without host controls.
 const guest=seven.peers[1].welcome;await close(seven.peers[1]);
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});await ctx.addInitScript(w=>localStorage.setItem('emberisle-seat',JSON.stringify({code:w.code,secret:w.secret})),guest);
 const pg=await ctx.newPage();pg.on('pageerror',e=>errors.push(e.message));await pg.goto(`http://127.0.0.1:${port}/?host=${encodeURIComponent(`ws://127.0.0.1:${hostPort}`)}`);await pg.getByTestId('victory-target').waitFor();assert.equal(await pg.getByTestId('victory-target').getAttribute('data-value'),'7');assert.equal(await pg.getByRole('radiogroup',{name:'Victory target'}).count(),0);await ctx.close();seven.peers[1]=await restore(guest);
 for(const table of tables){const views=await begin(table),target=table===ten?10:7;for(const v of views)assert.equal(v.game.victoryTarget,target);table.peers[0].send({type:'setVictoryTarget',value:target===7?10:7});assert.equal((await table.peers[0].next('error',m=>m.message.includes('fixed'))).message,'The target is fixed for this game.');await saved(table.code,s=>s.game?.victoryTarget===target);}
 // First restart without changing the game proves live-target persistence.
 for(const ws of sockets)ws.terminate();host.kill('SIGKILL');await new Promise(r=>host.once('exit',r));await start();
 for(const table of tables){const old=table.peers.map(p=>p.welcome);table.peers=[];for(const w of old)table.peers.push(await restore(w));for(const p of table.peers){const v=await p.next('state');assert.equal(v.game.phase,'rollOff');assert.equal(v.game.victoryTarget,table===ten?10:7);}}
 for(const ws of sockets)ws.terminate();host.kill('SIGKILL');await new Promise(r=>host.once('exit',r));
 // Crafted near-win positions retain each room's selected target and exercise real host actions.
 for(const table of tables){const s=JSON.parse(readFileSync(path.join(dir,`${table.code}.json`))),g=s.game;g.phase='main';g.current='p0';g.rollOff=null;g.seq++;g.log=[];g.vertices.forEach(v=>v.building=null);for(let i=0;i<4;i++)g.vertices[i].building={playerId:'p0',kind:i<2?'stronghold':'outpost'};g.players[0].resources={timber:0,clay:0,wool:3,grain:6,ore:5};g.deck=['vp','vp','vp'];s.savedAt=Date.now();writeFileSync(path.join(dir,`${table.code}.json`),JSON.stringify(s));table.vertex=g.vertices[2].id;}
 await start();
 for(const table of tables){const old=table.peers.map(p=>p.welcome);table.peers=[];for(const w of old)table.peers.push(await restore(w));const a=table.peers[0],initial=await a.next('state');
  a.send({type:'place',kind:'stronghold',id:table.vertex,victoryTarget:10});let next=await a.next('state',m=>m.game.seq>initial.game.seq);
  assert.equal(next.game.victoryTarget,table===ten?10:7);assert.equal(next.game.phase,table===ten?'main':'over');
  if(table===ten){for(let i=0;i<3;i++){a.send({type:'buy'});next=await a.next('state',m=>m.game.seq>next.game.seq);}assert.equal(next.game.phase,'over');}
  assert.equal(next.game.winner,'p0');assert.equal(next.game.current,'p0');await saved(table.code,s=>s.game.phase==='over');
 }
 // Unchanged tables inherit 7 and 10; a finished table may choose a different next target.
 for(const table of [seven,ten]){const a=table.peers[0],before=await a.next('state',m=>m.game.phase==='over');a.send({type:'again'});for(const p of table.peers){const v=await p.next('state',m=>m.game.seq===0&&m.game.phase==='rollOff'&&m.game.seed!==before.game.seed);assert.equal(v.game.victoryTarget,table===ten?10:7);}}
 // A watcher's welcome carries the table's target, so its win screen labels the next game correctly.
 for(const table of [seven,ten]){const w=await client({code:table.code,watch:true});assert.equal(w.welcome.victoryTarget,table===ten?10:7);}
 const hostWelcome=change.peers[0].welcome;await close(change.peers[0]);
 const endContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});await endContext.addInitScript(w=>{localStorage.setItem('emberisle-seat',JSON.stringify({code:w.code,secret:w.secret}));localStorage.setItem('emberisle-seat-live',w.code);},hostWelcome);
 const end=await endContext.newPage();end.on('pageerror',e=>errors.push(e.message));await end.goto(`http://127.0.0.1:${port}/?host=${encodeURIComponent(`ws://127.0.0.1:${hostPort}`)}`);await end.getByTestId('win-screen').waitFor();await end.getByRole('radio',{name:'10 points',exact:true}).click();await end.waitForFunction(()=>window.__emberisle.getState().tableVictoryTarget===10);assert.equal(await end.evaluate(()=>window.__emberisle.getState().state.victoryTarget),7);await end.getByTestId('win-again').click();await end.waitForFunction(()=>window.__emberisle.getState().state.phase==='rollOff');assert.equal(await end.evaluate(()=>window.__emberisle.getState().state.victoryTarget),10);await endContext.close();
 assert.deepEqual(errors,[]);console.log('victory-target-prove: all passed; default 10, public choices, guest/invalid/live refusal, restart, 7 vs 10 wins, inherited and changed rematches');
}finally{await browser?.close();await vite.close();for(const ws of sockets)ws.terminate();host?.kill('SIGKILL');rmSync(dir,{recursive:true,force:true});}
