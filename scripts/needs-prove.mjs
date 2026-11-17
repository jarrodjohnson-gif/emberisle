// #646: two real clients choose needs, receive chips and settle an actual table trade.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from "./proof-browser.mjs";
import { createServer } from 'vite';
import { createGame } from '../src/lib/game/board.ts';

const directory=mkdtempSync(path.join(tmpdir(),'emberisle-needs-ui-')),code='NEED';
let game=createGame({humans:[{name:'Jarrod'},{name:'Joshua'},{name:'Dune'}],bots:0,seed:14,wayfarerMode:'off'});
game.phase='main';game.rollOff=null;game.current='p0';game.log=[];
for(const vertex of game.vertices)vertex.building=null;
for(const player of game.players)for(const resource of ['timber','clay','wool','grain','ore'])player.resources[resource]=0;
game.players[0].resources.timber=4;game.players[1].resources.ore=2;
game.bank={timber:15,clay:19,wool:19,grain:19,ore:17};
const seats=game.players.map((p,i)=>({id:`s${i}`,name:p.name,color:p.color,ready:true,pid:p.id,secret:`fixture-${p.id}`}));
writeFileSync(path.join(directory,`${code}.json`),JSON.stringify({code,host:'s0',next:3,chat:[],chatSeq:0,game,seats,shape:2,savedAt:Date.now(),wayfarerMode:'off'}));
const host=spawn(process.execPath,['--import','./register.mjs','host.mjs'],{cwd:new URL('../server/',import.meta.url),env:{...process.env,PORT:'0',ROOMS_DIR:directory,PROFILES_DIR:path.join(directory,'profiles'),RESULTS_DIR:path.join(directory,'results'),TURN_MS:'600000',GRACE_MS:'600000',HOLD_MS:'600000'},stdio:['ignore','pipe','pipe']});
let stderr='';host.stderr.on('data',data=>stderr+=data);
process.on('exit',()=>{host.kill();rmSync(directory,{recursive:true,force:true});});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>process.exit(130));
let browser,vite;
try{
 const hostPort=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error(`host startup timeout: ${stderr}`)),10000);host.once('error',reject);host.once('exit',c=>{clearTimeout(timeout);reject(Error(`host exit ${c}: ${stderr}`));});host.stdout.on('data',data=>{const m=String(data).match(/listening (\d+)/);if(m){clearTimeout(timeout);resolve(Number(m[1]));}});});
 const port=Number(process.env.VITE_PORT)||18746;
 vite=await createServer({server:{host:'127.0.0.1',port,strictPort:true},logLevel:'error'});await vite.listen();
 browser=await chromium.launch();
 const errors=[];
 async function tab(pid,phone){
  const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1280,height:720},hasTouch:phone,isMobile:phone});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(({pid,code})=>{localStorage.setItem('emberisle-seat',JSON.stringify({code,secret:`fixture-${pid}`}));localStorage.setItem('emberisle-seat-live',code);localStorage.setItem('emberisle-chat-open','0');for(const method of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced'])WebGL2RenderingContext.prototype[method]=()=>{};},{pid,code});
  if(pid==='p0')await page.addInitScript(()=>{
   const descriptor=Object.getOwnPropertyDescriptor(WebSocket.prototype,'onmessage');
   Object.defineProperty(WebSocket.prototype,'onmessage',{...descriptor,set(callback){
    descriptor.set.call(this,event=>{
     const later=JSON.parse(event.data).type==='seats';
     if(later&&window.__holdNeedSeats)(window.__needSeats??=[]).push(()=>callback.call(this,event));
     else if(later)setTimeout(()=>callback.call(this,event),250);else callback.call(this,event);
    });
   }});
  });
  await page.goto(`http://127.0.0.1:${port}/?host=ws://127.0.0.1:${hostPort}`);
  await page.waitForFunction(pid=>window.__emberisle?.getState().state&&window.__emberisle.getState().localId===pid,pid);
  await page.waitForFunction(()=>window.__isle?.insets);return page;
 }
 const a=await tab('p0',true),b=await tab('p1',false);
 const before=await a.evaluate(()=>window.__isle.insets());
 // #1537 one tray: the Need row is gone; your needs are the Get goods (first two) of the offer you send with Ask the table.
 const pick=async(page,goods)=>{const panel=page.getByTestId('trade-panel');if(!await panel.count())await page.evaluate(()=>window.__emberisle.getState().setTradeOpen(true));await panel.waitFor();await panel.getByRole('button',{name:'More Wood to give',exact:true}).click();for(const good of goods)await panel.getByRole('button',{name:`More ${good} to want`,exact:true}).click();};
 const askButton=page=>page.getByTestId('trade-panel').getByRole('button',{name:'Ask the table',exact:true});
 const cancel=async()=>{await a.evaluate(()=>window.__emberisle.getState().cancelTrade());await a.waitForFunction(()=>!window.__emberisle.getState().offer);};
 await a.evaluate(()=>window.__emberisle.getState().setTradeOpen(true));
 await a.getByTestId('trade-panel').waitFor();
 assert.equal(await a.getByRole('button',{name:/^Need (Wood|Brick|Sheep|Wheat|Stone)$/}).count(),0,'one tray: no Need buttons');assert.equal(await a.getByRole('button',{name:/^More (Wood|Brick|Sheep|Wheat|Stone) to want$/}).count(),5,'five Get tokens set the needs');
 await pick(a,['Stone']);const started=Date.now();await askButton(a).click();
 const chip=b.getByTestId('rail-p0').getByTestId('seat-needs');await chip.waitFor({timeout:1000});
 assert.equal(await chip.getAttribute('aria-label'),'Jarrod needs Stone');assert(Date.now()-started<1000);
 await b.locator('[data-menu-trigger="p0"]').click();
 const peerNeeds=b.getByTestId('player-menu').getByTestId('menu-needs');await peerNeeds.waitFor();
 assert.deepEqual(await peerNeeds.getByTestId('need-chip').allTextContents(),['Stone']);
 await cancel();await pick(a,['Sheep','Wheat','Stone']);await askButton(a).click();
 await b.waitForFunction(()=>document.querySelector('[data-testid="rail-p0"] [data-testid="seat-needs"]')?.getAttribute('aria-label')==='Jarrod needs Sheep and Wheat');
 await b.waitForFunction(()=>[...document.querySelectorAll('[data-testid="player-menu"] [data-testid="need-chip"]')].map(e=>e.textContent).join(',')==='Sheep,Wheat');
 assert.deepEqual(await peerNeeds.getByTestId('need-chip').allTextContents(),['Sheep','Wheat']);
 await cancel();await a.evaluate(()=>window.__emberisle.getState().setTradeOpen(true));
 // The approved single Trade window (open on the seat whose turn it is) lists the other seats' published needs, quietly, from
 // the host projection (owner B, #873). Only the actor can open it, so the peer publishes through its own socket.
 // #1537 one tray: the Others need list is replaced by seat-colour dots on the Get tokens, each with a hidden text label.
 const dots=a.getByTestId('trade-panel').getByTestId('trade-need-dot'),[p1Name,p2Name]=await a.evaluate(()=>['p1','p2'].map(id=>window.__emberisle.getState().state.players.find(p=>p.id===id).name));
 const dotsOn=kind=>a.getByTestId('trade-panel').getByTestId(`trade-want-${kind}`).getByTestId('trade-need-dot').allTextContents();
 await a.getByTestId('trade-panel').getByTestId('trade-want-ore').waitFor();
 assert.equal(await dots.count(),0,'no dot while nobody else has shared a need');
 assert.equal(await a.getByTestId('trade-panel').getByText(/has not shared a need|None yet/).count(),0,'no per-seat placeholder text');assert.equal(await a.getByTestId('trade-panel').getByRole('heading',{name:'Others need'}).count(),0,'the Others need list is removed');
 await b.evaluate(()=>window.__emberisle.getState().net.need(['ore']));
 await a.waitForFunction(()=>document.querySelector('[data-testid="trade-panel"] [data-testid="trade-need-dot"]')?.textContent.endsWith('needs stone'));
 assert.equal(await dots.count(),1,'one dot for one seat needing one good');
 assert.equal(await dots.first().textContent(),`${p1Name} needs stone`);assert.equal((await dotsOn('ore')).length,1,'the dot sits on the Stone Get token');
 assert.deepEqual(await dotsOn('ore'),[`${p1Name} needs stone`]);assert.equal((await dots.allTextContents()).some(t=>t.startsWith(p2Name)),false,'the seat with no need shows no dot');
 await b.evaluate(()=>window.__emberisle.getState().net.need(['ore','grain']));
 await a.waitForFunction(()=>document.querySelectorAll('[data-testid="trade-panel"] [data-testid="trade-need-dot"]').length===2);
 assert.deepEqual(await dots.allTextContents(),[`${p1Name} needs wheat`,`${p1Name} needs stone`]);
 assert.equal(await dots.evaluateAll(list=>list.some(dot=>dot.hasAttribute('aria-live')||dot.getAttribute('role')==='status'||dot.querySelector('[aria-live],[role=status],button,a,input,[tabindex]')!==null)),false,'Trade-sheet need dots are not a live region and not tappable');
 assert.equal(/\d/.test((await dots.allTextContents()).join('')),false,'the need dots carry no counts or hand information');
 // BAD input: a clear leaves the window; three goods are refused by the host, so the row keeps its last valid value.
 await b.evaluate(()=>window.__emberisle.getState().net.need(['ore','grain','wool']));
 await a.waitForTimeout(600);
 assert.deepEqual(await dots.allTextContents(),[`${p1Name} needs wheat`,`${p1Name} needs stone`]);
 await b.evaluate(()=>window.__emberisle.getState().net.need([]));await a.waitForFunction(()=>!document.querySelector('[data-testid="trade-panel"] [data-testid="trade-need-dot"]'));
 assert.equal(await a.getByTestId('trade-panel').getByRole('button',{name:/ to want$/}).count(),5,'clearing a need clears its dots and keeps every Get token');
 assert.deepEqual(await a.evaluate(()=>window.__emberisle.getState().seats.find(s=>s.player==='p0').needs),['wool','grain'],'an offer with three Get goods sets only the first two as needs');
 const dimensions=await a.getByRole('button',{name:/^More (Wood|Brick|Sheep|Wheat|Stone) to want$/}).evaluateAll(buttons=>buttons.map(button=>{const box=button.getBoundingClientRect();return {w:box.width,h:box.height};}));
 assert(dimensions.every(d=>d.w>=44&&d.h>=44));
 assert.deepEqual(await a.evaluate(()=>window.__isle.insets()),before);
 assert.equal(await b.evaluate(()=>window.__emberisle.getState().state.players.find(p=>p.id==='p0').resources),undefined);
 await a.evaluate(async()=>{const {setPlayerNeeds}=await import('/src/components/game/need-state.ts');setPlayerNeeds('p0',[]);});await chip.waitFor({state:'detached'});
 await peerNeeds.waitFor({state:'detached'});await b.keyboard.press('Escape');
 // Empty row: closing the picker shows the one sentence of the feature, then reopen for the next step.
 // The picker is always in the window: the heading and its one hint line replace the old closed-row sentence.
 await a.getByTestId('trade-panel').waitFor();assert.equal(await a.locator('.need-hint').count(),0,'help hint is removed');assert.equal(await a.locator('#need-picker').count(),0,'one tray: no need picker in the sheet');assert.equal(await a.getByTestId('own-needs').count(),0,'no separate own chips line');assert.equal(await a.getByRole('button',{name:'Need',exact:true}).count(),0,'no Need toggle button');
 await pick(a,['Stone']);await askButton(a).click();await chip.waitFor();
 mkdirSync('test-results',{recursive:true});await a.screenshot({path:'test-results/needs-picker-phone.png'});
 await cancel();
 await a.reload();await a.waitForFunction(()=>window.__emberisle?.getState().state);
 await a.getByTestId('seat-p0').getByTestId('seat-needs').waitFor();
 console.log('ok needs from Ask the table with 250ms host echoes: first two Get goods, public chip within 1s, need dots on Get tokens, 44px tokens, clear, hidden hand preserved, rejoin and unchanged hole');
 await a.evaluate(()=>window.__emberisle.getState().setTradeOpen(true));
 await a.getByRole('button',{name:'More Wood to give',exact:true}).click();await a.getByRole('button',{name:'More Stone to want',exact:true}).click();
 await a.getByRole('button',{name:'Ask the table',exact:true}).click();
 await b.getByRole('button',{name:'Yes',exact:true}).click();await chip.waitFor({state:'detached'});
 await b.waitForFunction(()=>window.__emberisle.getState().state.players.find(p=>p.id==='p1').resources.ore===1);
 console.log('ok real table trade: received requested Stone clears the public need on the other client');
 await a.waitForFunction(()=>window.__emberisle.getState().seats.find(s=>s.player==='p0')?.needs?.length===0);
 await a.evaluate(()=>window.__emberisle.getState().setTradeOpen(true));
 await a.getByTestId('trade-panel').waitFor();
 // Hold the asker's host seat echoes; the published need is read on the other client, which the host answers directly.
 await a.evaluate(()=>{window.__holdNeedSeats=true;});
 await pick(a,['Stone']);await askButton(a).click();await chip.waitFor();
 await a.evaluate(()=>window.__emberisle.getState().refuseQuietly('An unrelated announcement.'));
 await a.evaluate(()=>new Promise(requestAnimationFrame));
 assert.equal(await chip.getAttribute('aria-label'),'Jarrod needs Stone','an unrelated announcement on the asker leaves the need sent with Ask the table');
 await cancel();await pick(a,['Wheat']);
 const errorBefore=await a.evaluate(()=>window.__emberisle.getState().errorSeq);
 await a.evaluate(()=>{for(let i=0;i<30;i++)window.__emberisle.getState().net.rename('Still the same person');});
 await a.waitForFunction(n=>window.__emberisle.getState().errorSeq>n&&window.__emberisle.getState().error==='Slow down.',errorBefore);
 assert.equal(await chip.getAttribute('aria-label'),'Jarrod needs Stone','unrelated host ACT rate errors leave the published need');
 const rejectedSeq=await a.evaluate(()=>window.__emberisle.getState().errorSeq);
 const rejectedAt=Date.now();
 await a.evaluate(()=>{
  // Exhaust and choose in one task: no intervening browser round trip can refill an ACT token.
  for(let i=0;i<30;i++)window.__emberisle.getState().net.rename('Still the same person');
  document.querySelector('[data-testid="trade-panel"] .trade-ask').click();
 });
 await a.waitForFunction(n=>window.__emberisle.getState().errorSeq>n,rejectedSeq);
 assert(Date.now()-rejectedAt<1000,'a rate-rejected Need from Ask the table is refused promptly');
 assert.equal(await a.evaluate(()=>window.__emberisle.getState().error),'Slow down.','a genuinely rate-rejected Need rolls back to the authoritative selection');
 await a.evaluate(()=>{window.__holdNeedSeats=false;for(const deliver of window.__needSeats??[])deliver();window.__needSeats=[];});
 assert.equal(await chip.getAttribute('aria-label'),'Jarrod needs Stone','a rate-rejected Need leaves the authoritative selection');
 console.log('ok published need survives unrelated announcements and host ACT errors; a rate-rejected Need from Ask the table leaves the authoritative selection');
 // Isolated hotseat session exercises the same picker and the lazy local-state lifecycle.
 await a.evaluate(async()=>{
  const {createGame}=await import('/src/lib/game/board.ts');
  const {setPlayerNeeds,useLocalNeeds}=await import('/src/components/game/need-state.ts');
  const g=window.__emberisle;
  let s=createGame({humans:[{name:'Local A'},{name:'Local B'},{name:'Local C'}],bots:0,seed:14,wayfarerMode:'off'});
  s.phase='main';s.rollOff=null;s.current='p0';s.log=[];
  for(const vertex of s.vertices)vertex.building=null;
  for(const p of s.players)for(const r of ['timber','clay','wool','grain','ore'])p.resources[r]=0;
  s.players[0].resources.timber=4;s.bank={timber:15,clay:19,wool:19,grain:19,ore:19};
  g.setState({mode:'hotseat',state:s,localId:'p0',tradeOpen:false,spectator:false});
  setPlayerNeeds('p0',['ore']);if(!useLocalNeeds.getState().p0)throw Error('local need missing');
  const traded=g.getState().dispatch({type:'bankTrade',give:'timber',want:'ore'});if(!traded.ok)throw Error(traded.error);
  if(useLocalNeeds.getState().p0)throw Error('local matching trade did not clear');
  setPlayerNeeds('p0',['grain']);
  const act=action=>{const result=g.getState().dispatch(action);if(!result.ok)throw Error(result.error);};
  act({type:'endTurn'});if(useLocalNeeds.getState().p0?.turnsLeft!==1)throw Error('first own turn did not age');
  for(let i=0;i<2;i++){act({type:'roll'});act({type:'endTurn'});}
  if(useLocalNeeds.getState().p0?.turnsLeft!==1)throw Error('other turns aged the need');
  act({type:'roll'});act({type:'endTurn'});if(useLocalNeeds.getState().p0)throw Error('second own turn did not clear');
 });
 console.log('ok hotseat/practice shared local path: matching bank trade clears; only two own completed turns expire a need');
 // Local transaction identity must not depend on player names or public narration.
 await a.evaluate(async()=>{
  const {createGame}=await import('/src/lib/game/board.ts');
  const {setPlayerNeeds,useLocalNeeds}=await import('/src/components/game/need-state.ts');
  const g=window.__emberisle;
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const fresh=(edit=()=>{})=>{
   const s=createGame({humans:[{name:'Trader\nA'},{name:'Buyer\nB'},{name:'Other C'}],bots:0,seed:14,wayfarerMode:'on'});
   s.phase='main';s.rollOff=null;s.current='p0';s.log=[];
   for(const v of s.vertices)v.building=null;
   for(const p of s.players)for(const r of ['timber','clay','wool','grain','ore'])p.resources[r]=0;
   s.players[0].resources.timber=8;s.players[1].resources.ore=4;
   s.bank={timber:11,clay:19,wool:19,grain:19,ore:15};edit(s);
   useLocalNeeds.setState({},true);g.setState({mode:'ai',screen:'play',state:s,localId:'p0',spectator:false,offer:null,declined:[]});
  };
  const need=(id,kinds)=>{g.setState({localId:id});setPlayerNeeds(id,kinds);};
  const act=(action,actor='p0')=>{const r=g.getState().dispatch(action,actor);check(r.ok,r.error);return r;};
  const remains=(id,label)=>check(Boolean(useLocalNeeds.getState()[id]),label);
  const clears=(id,label)=>check(!useLocalNeeds.getState()[id],label);
  fresh();need('p0',['ore']);act({type:'bankTrade',give:'timber',want:'ore'});
  check(g.getState().state.players[0].resources.ore===1,'bank trade actually receives requested Stone');
  clears('p0','newline-name bank settlement clears Need independently of log wording');
  fresh();need('p0',['ore']);need('p1',['timber']);
  act({type:'offerTrade',to:'p1',give:{timber:1},want:{ore:1}});remains('p0','opening an offer does not clear Need');
  act({type:'respondTrade',accept:true},'p1');clears('p0','direct accepted trade clears proposer Need');clears('p1','direct accepted trade clears recipient Need');
  fresh();need('p0',['ore']);need('p1',['timber']);g.setState({localId:'p0'});
  g.getState().askTable({timber:1},{ore:1});g.setState({localId:'p1'});g.getState().answerTrade(true);
  check(g.getState().state.players[0].resources.ore===1,'askTable actually settles');
  clears('p0','askTable direct settlement clears proposer Need');clears('p1','askTable direct settlement clears recipient Need');
  fresh();need('p0',['grain']);act({type:'bankTrade',give:'timber',want:'ore'});remains('p0','nonmatching bank trade preserves Need');
  fresh();need('p0',['ore']);const failed=g.getState().dispatch({type:'bankTrade',give:'ore',want:'grain'});
  check(!failed.ok,'fixture bank trade really refuses missing goods');remains('p0','failed bank trade preserves Need');
  act({type:'offerTrade',to:'p1',give:{timber:1},want:{ore:1}});act({type:'respondTrade',accept:false},'p1');remains('p0','declined trade preserves Need');
  fresh(s=>{s.players[0].hidden.plenty=1;s.players[0].boughtThisTurn.plenty=0;s.playedCard=false;});
  need('p0',['ore']);act({type:'playPlenty',resources:['ore','grain']});
  check(g.getState().state.players[0].resources.ore===1,'Plenty actually grants requested Stone');remains('p0','Plenty gain does not satisfy a trade Need');
  fresh(s=>{s.phase='roll';const h=s.hexes.find(h=>h.terrain==='ore'&&h.id!==s.robberHex);h.pip=8;s.vertices.find(v=>v.hexes.includes(h.id)).building={playerId:'p0',kind:'outpost'};});
  need('p0',['ore']);const originalRandom=crypto.getRandomValues.bind(crypto),dice=[3,3];
  crypto.getRandomValues=values=>dice.length?(values[0]=dice.shift(),values):originalRandom(values);
  try{act({type:'roll'});}finally{crypto.getRandomValues=originalRandom;}
  check(g.getState().state.players[0].resources.ore>0,'production roll actually grants requested Stone');remains('p0','production roll does not satisfy a trade Need');
  fresh(s=>{s.phase='robber';const h=s.hexes.find(h=>h.id!==s.robberHex&&h.terrain!=='waste');s.vertices.find(v=>v.hexes.includes(h.id)).building={playerId:'p1',kind:'outpost'};});
  need('p0',['ore']);const target=g.getState().state.hexes.find(h=>g.getState().state.vertices.some(v=>v.hexes.includes(h.id)&&v.building?.playerId==='p1'));
  act({type:'moveRobber',hexId:target.id,stealFrom:'p1'});
  check(g.getState().state.players[0].resources.ore===1,'steal actually receives requested Stone');remains('p0','steal does not satisfy a trade Need');
  fresh();need('p0',['ore']);
  const gained=structuredClone(g.getState().state);gained.seq++;gained.players[0].resources.ore++;
  gained.log=['Other traded 1 wood to Trader for 1 stone.'];g.setState({state:gained});
  remains('p0','ordinary state gain with trade-looking narration cannot masquerade as settlement');
 });
 console.log('ok explicit local settlements: newline bank, direct acceptance and askTable; nonmatching/refused/declined trades and Plenty/ordinary gains preserve Needs');
 // Four seats and two published needs are the worst narrow-card case from desk review6409765942.
 // Keep the protocol/trade/expiry assertions above intact; this adds real rendered geometry coverage.
 const geometryProblems=[],geometry=[];
 const captureDirectory=process.env.NEEDS_CAPTURE_DIR||'test-results';mkdirSync(captureDirectory,{recursive:true});
 for(const [width,height] of [[320,568],[390,844],[844,390],[1280,720]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width!==1280,isMobile:width!==1280});
  const page=await context.newPage();
  await page.addInitScript(()=>{for(const method of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced'])WebGL2RenderingContext.prototype[method]=()=>{};});
  await page.goto(`http://127.0.0.1:${port}/`);await page.waitForFunction(()=>window.__emberisle);
  await page.evaluate(()=>window.__emberisle.getState().startHotseat(4));
  await page.waitForFunction(()=>document.querySelectorAll('.seat-card').length===4);
  await page.evaluate(async()=>{
   const {createGame}=await import('/src/lib/game/board.ts');
   const state=createGame({humans:[{name:'Jarrod'},{name:'Joshua'},{name:'Dune'},{name:'Ember'}],bots:0,seed:14,wayfarerMode:'off'});
   state.phase='main';state.rollOff=null;state.current='p0';state.log=[];
   window.__emberisle.setState({mode:'hotseat',state,localId:'p0',tradeOpen:false,spectator:false});
  });
  await page.waitForFunction(()=>[...document.querySelectorAll('.seat-card')].filter(e=>e.getBoundingClientRect().width).length===4);
  await page.evaluate(async()=>{
   const {useLocalNeeds}=await import('/src/components/game/need-state.ts');
   useLocalNeeds.setState(Object.fromEntries(window.__emberisle.getState().state.players.map(player=>[player.id,{kinds:['ore','grain'],turnsLeft:2}])),true);
  });
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid="seat-needs"]')].filter(e=>e.getBoundingClientRect().width).length===4);
  const measured=await page.evaluate(()=>{
   const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
   const visible=e=>e.getBoundingClientRect().width>0;
   return [...document.querySelectorAll('[data-testid="seat-needs"]')].filter(visible).map(chip=>{
    const card=chip.closest('.seat-card'),css=getComputedStyle(chip);
    return {player:chip.dataset.player,chip:rect(chip),card:rect(card),borderLeft:card.clientLeft,borderTop:card.clientTop,trigger:rect(card.querySelector('[data-menu-trigger]')),pointerEvents:css.pointerEvents,buttons:chip.querySelectorAll('button,a,input,[tabindex]').length,tabIndex:chip.tabIndex,label:chip.getAttribute('aria-label'),live:chip.getAttribute('aria-live'),color:css.backgroundColor,radius:css.borderRadius,shadow:css.boxShadow,
     status:chip.getAttribute('role'),tallies:[...card.querySelectorAll('[data-testid="seat-vp"],[data-testid="tally-path"],[data-testid="tally-army"]')].map(rect),
     hints:[...document.querySelectorAll('[data-testid="hidden-point-hint"]')].filter(visible).map(rect)};
   });
  });
  geometry.push({width,height,seats:measured});
  await page.screenshot({path:path.join(captureDirectory,`needs-${width}x${height}-table.png`)});
  const overlap=(a,b)=>Math.min(a.right,b.right)>Math.max(a.x,b.x)&&Math.min(a.bottom,b.bottom)>Math.max(a.y,b.y);
  for(const seat of measured){
   const prefix=`${width}x${height} ${seat.player}`;
   if(seat.chip.width!==8||seat.chip.height!==8||seat.chip.x!==seat.card.x+seat.borderLeft-3||seat.chip.y!==seat.card.y+seat.borderTop-3)geometryProblems.push(`${prefix}: dot size/offset differs from approved mock`);
   if((width===1280?(seat.trigger.height<44||seat.trigger.height>52):seat.trigger.height!==44)||seat.pointerEvents!=='none'||seat.buttons!==0||seat.tabIndex>=0)geometryProblems.push(`${prefix}: trigger or dot interaction changed`);
   if(seat.status!=='img'||seat.live!==null||seat.label!==`${{p0:'Jarrod',p1:'Joshua',p2:'Dune',p3:'Ember'}[seat.player]} needs Stone and Wheat`)geometryProblems.push(`${prefix}: dot accessibility differs from published needs`);
   if(seat.color!=='rgb(190, 91, 57)'||Number.parseFloat(seat.radius)<4||seat.shadow!=='rgb(255, 255, 255) 0px 0px 0px 1px')geometryProblems.push(`${prefix}: dot appearance differs from approved mock`);
   if([...seat.tallies,...seat.hints].some(r=>overlap(seat.chip,r)))geometryProblems.push(`${prefix}: chip covers public tally/hint`);
   if(measured.some(other=>other!==seat&&(overlap(seat.chip,other.chip)||overlap(seat.chip,other.card)||overlap(seat.chip,other.trigger))))geometryProblems.push(`${prefix}: dot overlaps neighbour`);
   if(seat.status==='status')geometryProblems.push(`${prefix}: public chip is a live region`);
  }
  await page.locator('[data-menu-trigger="p0"]').click();
  const menu=page.getByTestId('player-menu');
  const details=menu.getByTestId('menu-needs');await details.waitFor();
  const menuGeometry=await details.evaluate(row=>{const css=getComputedStyle(row);return {gap:Number.parseFloat(css.gap),role:row.getAttribute('role'),live:row.getAttribute('aria-live'),childLive:[...row.querySelectorAll('*')].some(e=>e.hasAttribute('aria-live')||e.getAttribute('role')==='status'),chips:[...row.querySelectorAll('[data-testid="need-chip"]')].map(chip=>{const style=getComputedStyle(chip);return {text:chip.textContent,font:Number.parseFloat(style.fontSize),paddingX:Number.parseFloat(style.paddingLeft),paddingY:Number.parseFloat(style.paddingTop)};})};});
  geometry.at(-1).menu=menuGeometry;
  if(menuGeometry.gap!==8||menuGeometry.role==='status'||menuGeometry.live!==null||menuGeometry.childLive||menuGeometry.chips.length!==2||menuGeometry.chips.map(c=>c.text).join(',')!=='Stone,Wheat'||menuGeometry.chips.some(c=>c.font!==12||c.paddingX!==12||c.paddingY!==8))geometryProblems.push(`${width}x${height}: menu needs differ from approved details`);
  await page.screenshot({path:path.join(captureDirectory,`needs-${width}x${height}-menu.png`)});
  await page.keyboard.press('Escape');
  await page.evaluate(()=>window.__emberisle.getState().setTradeOpen(true));
  await page.screenshot({path:path.join(captureDirectory,`needs-${width}x${height}-picker.png`)});
  // #1537 one tray: the Need picker is gone; the Get row carries the other seats' need dots.
  const picker=await page.locator('[data-testid="trade-want-row"]').evaluate(field=>{
   const grid=field.querySelector('.trade-resource-grid'),style=getComputedStyle(grid),scroll=document.querySelector('.trade-composer-scroll');
   const viewport=scroll.getBoundingClientRect(),give=scroll.querySelector('[data-testid="trade-give-row"]');
   give.scrollIntoView();
   const scrolledViewport=scroll.getBoundingClientRect();
   const controls=[give.querySelector('h3'),...give.querySelectorAll('button')].map(control=>{const box=control.getBoundingClientRect();return {label:control.getAttribute('aria-label')||control.textContent,top:box.top,bottom:box.bottom,visible:box.top>=scrolledViewport.top-1&&box.bottom<=scrolledViewport.bottom+1};});
   scroll.scrollTop=0;
   const tokens=[...field.querySelectorAll('.trade-resource')];
   const targets=tokens.map(token=>{const box=token.querySelector('.trade-add').getBoundingClientRect();return {label:token.querySelector('.trade-add').getAttribute('aria-label'),width:box.width,height:box.height,fill:getComputedStyle(token).backgroundColor,pressed:String(token.hasAttribute('data-selected')),dots:[...token.querySelectorAll('[data-testid="trade-need-dot"]')].map(d=>d.textContent)};}),gaps=tokens.slice(1).map((token,i)=>token.getBoundingClientRect().left-tokens[i].getBoundingClientRect().right);
   return {targets,gaps,noOverflow:field.scrollWidth<=field.clientWidth&&scroll.scrollWidth<=scroll.clientWidth,gap:Number.parseFloat(style.columnGap),scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight,viewport:{top:viewport.top,bottom:viewport.bottom},giveControls:controls};
  });
  geometry.at(-1).picker=picker;if(!picker.noOverflow)geometryProblems.push(`${width}x${height}: picker horizontal overflow`);if(picker.targets.some(target=>target.width<44||target.height<44))geometryProblems.push(`${width}x${height}: picker target below44px`);if(width===844&&picker.giveControls.some(control=>!control.visible))geometryProblems.push(`${width}x${height}: give heading/steppers must sit inside scrollable region after scroll`);if(picker.gap<8)geometryProblems.push(`${width}x${height}: picker gap below8px`);if(picker.targets.length!==5||picker.targets.some(t=>t.height!==64)||picker.gaps.some(g=>g<8))geometryProblems.push(`${width}x${height}: five 64px Get tokens with 8px gaps differ ${JSON.stringify(picker.targets)}`);if(picker.targets.some(t=>t.fill!==(t.pressed==='true'?'rgb(228, 244, 234)':'rgb(233, 240, 238)')))geometryProblems.push(`${width}x${height}: a chosen Get token must be the Get tint and a resting one the soft fill ${JSON.stringify(picker.targets)}`);if(picker.targets.map(t=>t.dots.length).join()!=='0,0,0,3,3'||picker.targets.some(t=>t.dots.some(label=>!/^(Joshua|Dune|Ember) needs (wheat|stone)$/.test(label))))geometryProblems.push(`${width}x${height}: the three other seats' Stone and Wheat needs must show as labelled dots ${JSON.stringify(picker.targets)}`);
  // C3 11.1 (#1537 one tray): the sheet is #fbfdfc, and the Get names and Give counts read at 4.5:1 on their tokens.
  const white=await page.getByTestId('trade-panel').evaluate(panel=>{
   const rgb=c=>c.match(/[\d.]+/g).slice(0,3).map(Number),lum=c=>{const [r,g,b]=rgb(c).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;});return 0.2126*r+0.7152*g+0.0722*b;};
   const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
   const button=panel.querySelector('[data-testid="trade-want-row"] .trade-resource-name'),chip=panel.querySelector('[data-testid="trade-give-row"] .trade-owned'),fill=e=>getComputedStyle(e.closest('.trade-resource')).backgroundColor;
   return {sheet:getComputedStyle(panel).backgroundColor,button:ratio(getComputedStyle(button).color,fill(button)),chip:chip?ratio(getComputedStyle(chip).color,fill(chip)):null};
  });
  geometry.at(-1).white=white;
  if(white.sheet!=='rgb(251, 253, 252)'||white.button<4.5||white.chip===null||white.chip<4.5)geometryProblems.push(`${width}x${height}: Trade window colour or Need text contrast differs from C3 ${JSON.stringify(white)}`);
  {const dangling=await page.getByTestId('trade-panel').evaluate(panel=>[...panel.querySelectorAll('[aria-controls]')].filter(e=>!e.getAttribute('aria-controls').split(/\s+/).every(id=>document.getElementById(id))).length+panel.querySelectorAll('#need-picker[aria-controls],#need-picker[aria-expanded],.trade-need[aria-controls],.trade-need[aria-expanded]').length);if(dangling)geometryProblems.push(`${width}x${height}: Trade window has a dangling aria-controls or the always-open picker carries aria-controls/aria-expanded`);}
  await page.getByRole('button',{name:'Close',exact:true}).click();await context.close();
 }
 writeFileSync(path.join(captureDirectory,'needs-geometry.json'),JSON.stringify(geometry,null,2));
 console.log('four-seat needs geometry',JSON.stringify(geometry));
 assert.deepEqual(geometryProblems,[],'four-seat dots match approved geometry, clear public information and menu chips meet approved type/spacing');
 console.log('ok four-seat needs table and Get-row need dots:320x568,390x844,844x390,1280x720');
 // #646 Others need, #1537 one tray: the list became need dots on the Get tokens. The sheet, its Close button and every token sit in the same place whatever the seats share.
 const fixedProblems=[],fixedSummary=[];
 const configs={none:{},oneSeatOne:{p1:['timber']},twoSeatsBoth:{p1:['timber','ore'],p2:['grain','clay']},sharedFirst:{p1:['timber','ore'],p2:['timber'],p3:['timber']}};
 for(const [width,height] of [[320,568],[390,844],[844,390],[1280,720]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width!==1280,isMobile:width!==1280});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('emberisle-chat-open','0');for(const method of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced'])WebGL2RenderingContext.prototype[method]=()=>{};});
  await page.goto(`http://127.0.0.1:${port}/`);await page.waitForFunction(()=>window.__emberisle);
  for(const names of [['Jarrod','Ashfield Wandere','Dune','Ember'],['Jarrod','WWWWWWWWWWWWWWWW','Ashfield Wandere','Dune']]){
   await page.evaluate(async names=>{
    const {createGame}=await import('/src/lib/game/board.ts');
    const {useLocalNeeds}=await import('/src/components/game/need-state.ts');
    const g=window.__emberisle,state=createGame({humans:names.map(name=>({name})),bots:0,seed:14,wayfarerMode:'off'});
    state.phase='main';state.rollOff=null;state.current='p0';state.log=[];
    for(const v of state.vertices)v.building=null;
    for(const player of state.players)for(const r of ['timber','clay','wool','grain','ore'])player.resources[r]=0;
    state.players[0].resources.timber=4;state.players[0].resources.ore=1;
    useLocalNeeds.setState({},true);g.setState({mode:'ai',screen:'play',state,localId:'p0',spectator:false,tradeOpen:false,offer:null,declined:[]});g.getState().setTradeOpen(true);
   },names);
   await page.getByTestId('trade-panel').waitFor();
   // Zero published needs means zero dots, so the dot count is already true before the trade chunk mounts.
   await page.locator('[data-testid="trade-want-row"]').waitFor();
   const frames={};
   for(const [label,needs] of Object.entries(configs)){
    await page.evaluate(async needs=>{const {useLocalNeeds}=await import('/src/components/game/need-state.ts');useLocalNeeds.setState(Object.fromEntries(Object.entries(needs).map(([id,kinds])=>[id,{kinds,turnsLeft:2}])),true);},needs);
    await page.waitForFunction(count=>document.querySelectorAll('[data-testid="trade-panel"] [data-testid="trade-need-dot"]').length===count,Object.values(needs).reduce((n,k)=>n+k.length,0));
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    frames[label]=await page.evaluate(()=>{
     const panel=document.querySelector('[data-testid="trade-panel"]'),box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};},num=n=>Math.round(n*100)/100;
     const tokens=[...panel.querySelectorAll('[data-testid="trade-want-row"] .trade-resource')];
     const close=panel.querySelector('[aria-label="Close"]')||document.querySelector('[aria-label="Close"]');
     return {top:num(panel.getBoundingClientRect().y),close:{x:num(close.getBoundingClientRect().x),y:num(close.getBoundingClientRect().y)},othersHeading:[...panel.querySelectorAll('h3')].some(h=>h.textContent==='Others need'),
      tokens:tokens.map(token=>({box:box(token),kind:token.dataset.testid.replace('trade-want-',''),
       dots:[...token.querySelectorAll('[data-testid="trade-need-dot"]')].map(d=>({...box(d),label:d.textContent,inside:(t=>{const r=d.getBoundingClientRect();return r.left>=t.left&&r.right<=t.right&&r.top>=t.top&&r.bottom<=t.bottom;})(token.getBoundingClientRect())}))})),
      giveDots:panel.querySelectorAll('[data-testid="trade-give-row"] [data-testid="trade-need-dot"]').length,
      focus:[...panel.querySelectorAll('button,a,input,[tabindex]')].map(e=>(e.getAttribute('aria-label')||`${e.tagName}.${e.className}`)+(e.closest('[data-testid="trade-need-dot"]')?'#IN-ROW':'')),
      hscroll:document.documentElement.scrollWidth>innerWidth||panel.scrollWidth>panel.clientWidth,rowGaps:tokens.slice(1).map((t,i)=>num(t.getBoundingClientRect().x-tokens[i].getBoundingClientRect().right))};
    });
   }
   const tag=`${width}x${height} ${names[1]}`,base=frames.none,good={timber:'wood',clay:'brick',wool:'sheep',grain:'wheat',ore:'stone'};
   for(const [label,f] of Object.entries(frames)){
    const at=`${tag} ${label}`;
    if(f.othersHeading)fixedProblems.push(`${at}: the Others need heading is still shown`);
    if(f.tokens.length!==5)fixedProblems.push(`${at}: ${f.tokens.length} Get tokens, expected five`);
    if(f.top!==base.top||f.close.x!==base.close.x||f.close.y!==base.close.y)fixedProblems.push(`${at}: Trade window top/Close moved ${JSON.stringify([f.top,f.close])} vs ${JSON.stringify([base.top,base.close])}`);
    if(JSON.stringify(f.tokens.map(t=>[t.box.x,t.box.y,t.box.w]))!==JSON.stringify(base.tokens.map(t=>[t.box.x,t.box.y,t.box.w])))fixedProblems.push(`${at}: a Get token moved or resized`);
    if(f.tokens.some(t=>t.box.h!==64))fixedProblems.push(`${at}: a Get token is not 64px`);
    if(f.rowGaps.some(g=>g!==8))fixedProblems.push(`${at}: token gap not 8px ${f.rowGaps}`);
    if(f.tokens.some(t=>t.dots.some(d=>!d.inside)))fixedProblems.push(`${at}: a dot leaves its token`);
    if(f.tokens.some(t=>t.dots.some(d=>d.w!==8||d.h!==8)))fixedProblems.push(`${at}: need dot not 8px`);
    const expected=Object.fromEntries(f.tokens.map(t=>[t.kind,names.filter((_,i)=>configs[label][`p${i}`]?.includes(t.kind)).map(name=>`${name} needs ${good[t.kind]}`)]));
    if(f.tokens.some(t=>JSON.stringify(t.dots.map(d=>d.label))!==JSON.stringify(expected[t.kind])))fixedProblems.push(`${at}: dot labels are not one full "<name> needs <good>" per seat ${JSON.stringify(f.tokens.map(t=>t.dots.map(d=>d.label)))}`);
    for(const t of f.tokens){
     if(t.dots.length>3)fixedProblems.push(`${at}: more dots than other seats`);
     t.dots.forEach((d,i)=>{if(i&&(d.x!==t.dots[i-1].x+10||d.y!==t.dots[0].y))fixedProblems.push(`${at}: dot ${d.label} off its place in the row ${JSON.stringify(d)}`);});
     if(!t.dots.length&&expected[t.kind].length)fixedProblems.push(`${at}: a needed good shows no dot`);
     if(f.giveDots)fixedProblems.push(`${at}: need dots on Give tokens`);
    }
    if(f.hscroll)fixedProblems.push(`${at}: horizontal overflow`);
    if(JSON.stringify(f.focus)!==JSON.stringify(base.focus)||f.focus.some(x=>x.endsWith('#IN-ROW')))fixedProblems.push(`${at}: tab order changed or a row is focusable ${JSON.stringify([f.focus,base.focus]).slice(0,300)}`);
   }
   if(frames.sharedFirst.tokens.map(t=>t.dots.length).join('|')!=='3|0|0|0|1')fixedProblems.push(`${tag}: shared first need not shown for every seat`);
   if(!frames.twoSeatsBoth.tokens[0].dots[0]?.label.endsWith(' needs wood')||frames.none.tokens.some(t=>t.dots.length))fixedProblems.push(`${tag}: dot labels`);
   fixedSummary.push({tag,top:base.top,close:base.close,tokenYs:base.tokens.map(t=>t.box.y)});
  }
  await context.close();
 }
 console.log('fixed Get tokens with need dots',JSON.stringify(fixedSummary));
 assert.deepEqual(fixedProblems,[],'Others need rows keep the Trade window, Close and every row still across 0/1/2 needs and shared firsts, with 16-letter names');
 console.log('ok need dots: 8px labelled dots inside fixed 64px Get tokens, window and Close identical across needs, no overflow, tab order:320x568,390x844,844x390,1280x720');
 assert.deepEqual(errors,[]);console.log('needs browser prove ok');
}finally{
 await browser?.close();await vite?.close();
 if(host.exitCode===null&&host.signalCode===null){const stopped=once(host,'exit');host.kill();await stopped;}
 rmSync(directory,{recursive:true,force:true});
}
