// Wayfarer mode at table setup, through real lobby controls and the hosted rules: default On, the On / Off
// choice, host-only updates, restart persistence, the chosen rules in play, rematch inheritance, and the choice sticking until the title menu.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from '../server/node_modules/ws/wrapper.mjs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const dir=mkdtempSync(path.join(tmpdir(),'emberisle-wayfarer-setup-'));
const port=Number(process.env.VITE_PORT||18545),sockets=[];const wait=ms=>new Promise(r=>setTimeout(r,ms));
let host,hostPort,browser;
async function start(){
 let stderr='';host=spawn(process.execPath,['--import','./register.mjs','host.mjs'],{cwd:new URL('../server/',import.meta.url),env:{...process.env,PORT:'0',ROOMS_DIR:dir, RESULTS_DIR: `${dir}/results`,SAVE_MS:'20',GRACE_MS:'600000',HOLD_MS:'600000',LOBBY_HOLD_MS:'600000',TURN_MS:'600000',ACT_CAP:'1000',ACT_RATE:'1000'},stdio:['ignore','pipe','pipe']});
 host.stderr.on('data',d=>stderr+=d);hostPort=await new Promise((resolve,reject)=>{host.stdout.on('data',d=>{const m=String(d).match(/listening (\d+)/);if(m)resolve(Number(m[1]));});host.on('exit',c=>reject(Error(`host ${c}: ${stderr}`)));});
}
async function client(hello){
 const ws=new WebSocket(`ws://127.0.0.1:${hostPort}`),messages=[];sockets.push(ws);let state;
 ws.on('message',d=>{const m=JSON.parse(String(d));messages.push(m);if(m.type==='state')state=m;});await new Promise(r=>ws.on('open',r));ws.send(JSON.stringify({type:'hello',...hello}));
 const next=async(type,test=()=>true)=>{for(let i=0;i<400;i++){const m=messages.find(m=>m.type===type&&test(m));if(m)return structuredClone(m);await wait(10);}throw Error(`timeout ${type}: ${JSON.stringify(messages.slice(-3))}`);};
 const welcome=await next('welcome');return{ws,messages,next,welcome,send:m=>ws.send(JSON.stringify({...state?.actionStamp,cid:crypto.randomUUID(),...m}))};
}
const restore=async welcome=>{await wait(150);return client({code:welcome.code,secret:welcome.secret});};
async function close(peer){if(peer.ws.readyState===WebSocket.CLOSED)return;peer.ws.terminate();await new Promise(r=>peer.ws.once('close',r));}
async function saved(code,test){for(let i=0;i<100;i++){try{const s=JSON.parse(readFileSync(path.join(dir,`${code}.json`)));if(test(s))return s;}catch{}await wait(20);}throw Error('save timeout');}
const vite=await createServer({server:{host:'127.0.0.1',port,strictPort:true},logLevel:'error'});
const tables=[],errors=[];
const url=()=>`http://127.0.0.1:${port}/?host=${encodeURIComponent(`ws://127.0.0.1:${hostPort}`)}`;
async function pageAt(width=390,height=844){const context=await browser.newContext({viewport:{width,height},hasTouch:width<900,reducedMotion:width<900?'reduce':'no-preference'});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url());await page.getByRole('button',{name:'Play against bots',exact:true}).waitFor();return{context,page};}
async function help(page,mode){await page.getByRole('button',{name:'Table menu',exact:true}).click();await page.getByRole('dialog',{name:'Table menu'}).getByRole('button',{name:'How to play',exact:true}).click();const dialog=page.getByRole('dialog',{name:'How to play'});await dialog.waitFor();assert.match(await dialog.innerText(),mode==='off'?/No movement, blocked land or taking cards/:/takes a card from an adjacent seat/);await dialog.getByRole('button',{name:'Close',exact:true}).click();}
async function setup(page){await page.getByRole('button',{name:'Wayfarer rules',exact:true}).click();}
// #1059: diagnostics only. watchMusterBox wraps boundingBox() for the Muster button on the watched page. When the
// ORIGINAL box fails the same width/height>=44 and viewport predicate, it logs that box and its four predicate parts,
// plus a separately labelled later sample, then returns the original box unchanged; the existing assertion decides.
let musterWatch=null;
function watchMusterBox(page,width,height){
 musterWatch={page,width,height};
 const proto=Object.getPrototypeOf(page.getByTestId('fortune-play-knight'));
 if(proto.__musterWatched)return;proto.__musterWatched=true;
 const real=proto.boundingBox;
 proto.boundingBox=async function(...args){
  const box=await real.apply(this,args);const w=musterWatch;
  if(w&&this.page()===w.page&&String(this._selector).includes('fortune-play-knight')&&(!box||!(box.width>=44&&box.height>=44&&box.y>=0&&box.y+box.height<=w.height)))await musterBoundsDiagnostics(w.page,box,w.width,w.height);
  return box;
 };
}
async function musterBoundsDiagnostics(page,box,width,height){
 const parts=box?{width44:box.width>=44,height44:box.height>=44,top:box.y>=0,bottom:box.y+box.height<=height}:null;
 const later=await page.getByTestId('fortune-play-knight').evaluate(el=>{
  const rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};
  const anims=n=>n.getAnimations().map(a=>({name:a.animationName??a.id??'',state:a.playState,time:a.currentTime}));
  const ancestors=[];for(let n=el.parentElement;n&&n!==document.body;n=n.parentElement){const cs=getComputedStyle(n);ancestors.push({tag:n.tagName.toLowerCase(),testid:n.dataset.testid??null,cls:String(n.className).slice(0,60),rect:rect(n),transform:cs.transform,translate:cs.translate,scale:cs.scale,animations:anims(n)});}
  return{rect:rect(el),offset:{w:el.offsetWidth,h:el.offsetHeight,top:el.offsetTop,left:el.offsetLeft},active:document.activeElement===el,matchesActive:el.matches(':active'),disabled:el.disabled,animations:anims(el),trayAnimations:document.querySelector('[data-testid="fortune-tray"]')?.getAnimations({subtree:true}).map(a=>({state:a.playState,time:a.currentTime}))??null,ancestors};
 }).catch(e=>({error:String(e)}));
 console.log(`#1059 Muster bounds predicate failed at ${width}x${height}:`,JSON.stringify({originalBox:box,viewport:{width,height},predicate:parts,laterSample:later}));
}
try{
 await start();await vite.listen();browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});mkdirSync('test-results',{recursive:true});
 for(const contextName of ['ai','hotseat','online'])for(const mode of ['on','off']){
  const {context,page}=await pageAt();await setup(page);
  assert.equal(await page.getByLabel('Play against bots',{exact:true}).inputValue(),'on');assert.equal(await page.getByLabel('Host a table online',{exact:true}).inputValue(),'on');assert.equal(await page.getByLabel('Pass this device',{exact:true}).inputValue(),'on');
  const label={ai:'Play against bots',hotseat:'Pass this device',online:'Host a table online'}[contextName],select=page.getByLabel(label,{exact:true});await select.selectOption(mode);
  const b=await select.boundingBox();assert.ok(b.height>=44&&b.width>=44&&b.x>=0&&b.x+b.width<=390,'44px safe setup target');
  const contrast=await select.evaluate(el=>{const s=getComputedStyle(el),c=document.createElement('canvas').getContext('2d');const l=css=>{c.fillStyle=css;c.fillRect(0,0,1,1);const a=[...c.getImageData(0,0,1,1).data].slice(0,3).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return .2126*a[0]+.7152*a[1]+.0722*a[2];};const r=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05),bg=l(s.backgroundColor);return{text:r(l(s.color),bg),border:r(l(s.borderTopColor),bg)};});assert.ok(contrast.text>=4.5&&contrast.border>=3,`AA setup control: ${JSON.stringify(contrast)}`);
  await page.screenshot({path:`test-results/wayfarer-setup-${contextName}-${mode}-390.png`});
  await page.getByRole('dialog',{name:'Wayfarer rules',exact:true}).getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:{ai:'Play against bots',hotseat:'Pass this device',online:'Host a table'}[contextName],exact:true}).click();
  if(contextName==='online'){
   await page.getByTestId('lobby-card').waitFor();await page.waitForFunction(()=>window.__emberisle.getState().code.length===4);
   const seat=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberisle-seat'))),code=seat.code;
   assert.match(await page.getByTestId('lobby-card').innerText(),new RegExp(`Wayfarer ${mode}`,"i"));assert.equal(await page.getByRole('combobox').count(),0,'lobby has no mode toggle');
   const guests=[await client({code,name:'Tide'}),await client({code,name:'Pine'})];for(const p of guests){assert.equal(p.welcome.wayfarerMode,mode);assert.equal((await p.next('seats',m=>m.seats.length===3)).wayfarerMode,mode);}
   guests[0].send({type:'setWayfarerMode',value:mode==='off'?'on':'off'});assert.match((await guests[0].next('error')).message,/fixed when the table is created/);
   // The real joining browser reads the rule before play; no selector is offered to a guest.
   const guestWelcome=guests[1].welcome;await close(guests[1]);const guestContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});await guestContext.addInitScript(w=>localStorage.setItem('emberisle-seat',JSON.stringify({code:w.code,secret:w.secret})),guestWelcome);
   const guestPage=await guestContext.newPage();guestPage.on('pageerror',e=>errors.push(e.message));await guestPage.goto(url());await guestPage.getByTestId('lobby-card').waitFor();assert.match(await guestPage.getByTestId('lobby-card').innerText(),new RegExp(`Wayfarer ${mode}`,"i"));assert.equal(await guestPage.getByRole('combobox').count(),0);await guestContext.close();guests[1]=await restore(guestWelcome);
   for(const p of guests)p.send({type:'ready',value:true});await page.getByRole('button',{name:'Ready',exact:true}).click();await page.getByRole('button',{name:'Start',exact:true}).click();await page.waitForFunction(()=>window.__emberisle.getState().state!==null);
   assert.equal(await page.evaluate(()=>window.__emberisle.getState().state.wayfarerMode),mode);assert.equal(await page.getByLabel(/wayfarer$/).count(),0);
   await help(page,mode);await context.close();await wait(150);const creator=await client({code,secret:seat.secret});assert.equal((await creator.next('state')).game.wayfarerMode,mode);tables.push({code,mode,peers:[creator,...guests]});await saved(code,s=>s.game?.wayfarerMode===mode);
  }else{await page.waitForFunction(()=>window.__emberisle.getState().state!==null);assert.equal(await page.evaluate(()=>window.__emberisle.getState().state.wayfarerMode),mode);assert.equal(await page.getByTestId('wayfarer-setup').count(),0);const fixed=await page.evaluate(m=>{const g=window.__emberisle;g.getState().setWayfarerChoice('ai',m==='off'?'on':'off');return g.getState().wayfarerChoices;},mode);assert.deepEqual(fixed,{[contextName]:mode},'mid-game edits are refused; the pick stays for the next game');await help(page,mode);if(contextName==='hotseat'){await page.evaluate(()=>{const g=window.__emberisle,s=structuredClone(g.getState().state);s.phase='over';s.winner='p0';g.setState({state:s});g.getState().playAgain();});assert.equal(await page.evaluate(()=>window.__emberisle.getState().state.wayfarerMode),mode);}await context.close();}
  console.log(`ok 390 ${contextName} ${mode}: visible pre-creation choice, correct default, fixed after creation${contextName==='online'?', public joiner rule':''}`);
 }
// The choice sticks across games made without the title menu and resets to On only on returning to it.
 {const {context:stickyContext,page:sticky}=await pageAt();await setup(sticky);
  for(const label of ['Play against bots','Pass this device','Host a table online'])await sticky.getByLabel(label,{exact:true}).selectOption('off');
  await sticky.getByRole('dialog',{name:'Wayfarer rules',exact:true}).getByRole('button',{name:'Close',exact:true}).click();
  const mode=()=>sticky.evaluate(()=>window.__emberisle.getState().state.wayfarerMode);
  await sticky.getByRole('button',{name:'Play against bots',exact:true}).click();
  assert.equal(await mode(),'off');
  await sticky.evaluate(()=>window.__emberisle.getState().startAi());assert.equal(await mode(),'off','new practice game without the menu keeps Off');
  await sticky.evaluate(()=>window.__emberisle.getState().startHotseat(4));assert.equal(await mode(),'off','hotseat game without the menu keeps Off');
  await sticky.evaluate(()=>{const g=window.__emberisle,s=structuredClone(g.getState().state);s.phase='over';s.winner='p0';g.setState({state:s});g.getState().playAgain();});assert.equal(await mode(),'off','hotseat play again keeps Off');
  await sticky.evaluate(()=>window.__emberisle.getState().startAi());assert.equal(await mode(),'off');
  await sticky.evaluate(()=>window.__emberisle.getState().goTitle());await sticky.getByRole('button',{name:'Play against bots',exact:true}).waitFor();await setup(sticky);
  for(const label of ['Play against bots','Pass this device','Host a table online'])assert.equal(await sticky.getByLabel(label,{exact:true}).inputValue(),'on',`${label} resets to the default on the menu`);
  await sticky.getByRole('dialog',{name:'Wayfarer rules',exact:true}).getByRole('button',{name:'Close',exact:true}).click();
  await sticky.getByRole('button',{name:'Play against bots',exact:true}).click();
  assert.equal(await mode(),'on');
  await stickyContext.close();console.log('ok sticky choice: Off survives new/play-again games, menu resets to On');}
 for(const [width,height] of [[390,844],[1280,720],[844,390]]){
  const {context,page}=await pageAt(width,height);await setup(page);await page.getByLabel('Play against bots',{exact:true}).selectOption('off');await page.getByRole('dialog',{name:'Wayfarer rules',exact:true}).getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Play against bots',exact:true}).click();
  // The tray's entrance transform can make a 44px button measure fractionally below 44px during animation.
  watchMusterBox(page,width,height); // #1059: diagnostics only; see watchMusterBox.
  await page.evaluate(()=>{const g=window.__emberisle,s=structuredClone(g.getState().state),p=s.players.find(p=>p.id===g.getState().localId);s.current=p.id;s.phase='roll';s.playedCard=false;p.hidden.knight=1;p.boughtThisTurn.knight=0;g.setState({state:s,banner:null});});await page.getByTestId('fortunes-button').click();await page.getByTestId('fortune-play-knight').waitFor();await page.getByTestId('fortune-tray').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));assert.equal(await page.getByTestId('fortune-tray').evaluate(el=>el.getAnimations().some(animation=>animation.playState==='running')),false,'tray animation settled before geometry');assert.equal(await page.getByTestId('fortune-play-knight').innerText(),'Muster');assert.match(await page.getByTestId('fortune-row-knight').innerText(),/No target needed/);const b=await page.getByTestId('fortune-play-knight').boundingBox();assert.ok(b.width>=44&&b.height>=44&&b.y>=0&&b.y+b.height<=height);await page.screenshot({path:`test-results/wayfarer-muster-${width}.png`});await page.getByTestId('fortune-play-knight').click();const played=await page.evaluate(()=>{const g=window.__emberisle.getState();return{phase:g.state.phase,army:g.state.players.find(p=>p.id===g.localId).knightsPlayed,mode:g.buildMode,pending:g.pendingSteal,blocked:g.state.hexes.some(h=>h.blocked)};});assert.deepEqual(played,{phase:'roll',army:1,mode:'none',pending:null,blocked:false});await context.close();console.log(`ok ${width}x${height}: Off fortune adds army immediately; no picker, blocker or lost roll`);
 }
 // Invalid choices and attempts to smuggle settings into join/rejoin never allocate or alter a rule.
 const invalid=new WebSocket(`ws://127.0.0.1:${hostPort}`);sockets.push(invalid);await new Promise(r=>invalid.once('open',r));const refusal=new Promise(r=>invalid.once('message',d=>r(JSON.parse(String(d)))));invalid.send(JSON.stringify({type:'hello',name:'Invalid',wayfarerMode:'maybe'}));assert.match((await refusal).message,/Choose Wayfarer/);invalid.terminate();
 for(const t of tables){t.peers[0].send({type:'setWayfarerMode',value:'off'});assert.match((await t.peers[0].next('error')).message,/fixed when/);const forged=new WebSocket(`ws://127.0.0.1:${hostPort}`);sockets.push(forged);await new Promise(r=>forged.once('open',r));const refused=new Promise(r=>forged.once('message',d=>r(JSON.parse(String(d)))));forged.send(JSON.stringify({type:'hello',code:t.code,secret:t.peers[0].welcome.secret,wayfarerMode:'off'}));assert.match((await refused).message,/fixed when/);forged.terminate();}
 // Unmodified saved games survive a host restart and a browser reload into the same seat.
 for(const ws of sockets)ws.terminate();host.kill('SIGKILL');await new Promise(r=>host.once('exit',r));await start();
 for(const t of tables){const old=t.peers.map(p=>p.welcome);t.peers=[];for(const w of old)t.peers.push(await restore(w));for(const p of t.peers){assert.equal(p.welcome.wayfarerMode,t.mode);assert.equal((await p.next('state')).game.wayfarerMode,t.mode);}const w=t.peers[0].welcome;await close(t.peers[0]);const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});await context.addInitScript(w=>{localStorage.setItem('emberisle-seat',JSON.stringify({code:w.code,secret:w.secret}));localStorage.setItem('emberisle-seat-live',w.code);},w);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url());await page.waitForFunction(()=>window.__emberisle?.getState().state);await page.reload();await page.waitForFunction(()=>window.__emberisle?.getState().state);assert.equal(await page.evaluate(()=>window.__emberisle.getState().state.wayfarerMode),t.mode);assert.equal(await page.getByRole('combobox').count(),0);await context.close();t.peers[0]=await restore(w);}
 // A normal rematch reuses the creation rule, even after a saved endgame/restart.
 for(const ws of sockets)ws.terminate();host.kill('SIGKILL');await new Promise(r=>host.once('exit',r));
 for(const t of tables){const s=JSON.parse(readFileSync(path.join(dir,`${t.code}.json`)));s.game.phase='over';s.game.winner='p0';s.savedAt=Date.now();writeFileSync(path.join(dir,`${t.code}.json`),JSON.stringify(s));}
 await start();for(const t of tables){const old=t.peers.map(p=>p.welcome);t.peers=[];for(const w of old)t.peers.push(await restore(w));await t.peers[0].next('state',m=>m.game.phase==='over');t.peers[0].send({type:'again'});for(const p of t.peers){const v=await p.next('state',m=>m.game.phase==='rollOff');assert.equal(v.game.wayfarerMode,t.mode);assert.equal(v.game.hexes.some(h=>h.blocked),t.mode!=='off');}}
 assert.deepEqual(errors,[]);console.log('wayfarer-setup-prove: all passed; setup defaults/overrides, sticky choice, no-target fortunes, host refusal, join/rejoin/reload/restart/rematch persistence');
}finally{await browser?.close();await vite.close();for(const ws of sockets)ws.terminate();if(host?.exitCode===null){host.kill('SIGKILL');await new Promise(r=>host.once('exit',r));}rmSync(dir,{recursive:true,force:true});}
