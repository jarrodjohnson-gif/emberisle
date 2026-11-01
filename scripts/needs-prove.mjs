// #646: two real clients choose needs, receive chips and settle an actual table trade.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
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
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined)});
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
 await a.evaluate(()=>window.__emberisle.getState().setTradeOpen(true));
 await a.getByRole('heading',{name:'You need',exact:true}).waitFor();
 assert.equal(await a.getByRole('button',{name:/^Need (Wood|Brick|Sheep|Wheat|Stone)$/}).count(),5);
 const started=Date.now();await a.getByRole('button',{name:'Need Stone',exact:true}).click();
 const chip=b.getByTestId('rail-p0').getByTestId('seat-needs');await chip.waitFor({timeout:1000});
 assert.equal(await chip.getAttribute('aria-label'),'Jarrod needs Stone');assert(Date.now()-started<1000);
 await b.locator('[data-menu-trigger="p0"]').click();
 const peerNeeds=b.getByTestId('player-menu').getByTestId('menu-needs');await peerNeeds.waitFor();
 assert.deepEqual(await peerNeeds.getByTestId('need-chip').allTextContents(),['Stone']);
 await a.getByRole('button',{name:'Need Wheat',exact:true}).click();
 await b.waitForFunction(()=>document.querySelector('[data-testid="rail-p0"] [data-testid="seat-needs"]')?.getAttribute('aria-label')==='Jarrod needs Stone and Wheat');
 await b.waitForFunction(()=>[...document.querySelectorAll('[data-testid="player-menu"] [data-testid="need-chip"]')].map(e=>e.textContent).join(',')==='Stone,Wheat');
 assert.deepEqual(await peerNeeds.getByTestId('need-chip').allTextContents(),['Stone','Wheat']);
 // The approved single Trade window (open on the seat whose turn it is) lists the other seats' published needs, quietly, from
 // the host projection (owner B, #873). Only the actor can open it, so the peer publishes through its own socket.
 const tradeNeeds=a.getByTestId('trade-panel').getByTestId('menu-needs');
 assert.equal(await tradeNeeds.count(),0,'no needs published by the other seat yet: nothing is listed');
 await b.evaluate(()=>window.__emberisle.getState().net.need(['ore']));await tradeNeeds.waitFor();
 assert.equal(await tradeNeeds.count(),1,'only the other seat with needs is listed, never the viewer');
 assert.equal((await a.locator('.trade-peer-seat:has([data-testid="menu-needs"])').textContent()).startsWith(await a.evaluate(()=>window.__emberisle.getState().state.players.find(p=>p.id==='p1').name)+'Needs'),true);
 assert.deepEqual(await tradeNeeds.getByTestId('need-chip').allTextContents(),['Stone']);
 await b.evaluate(()=>window.__emberisle.getState().net.need(['ore','grain']));
 await a.waitForFunction(()=>[...document.querySelectorAll('[data-testid="trade-panel"] [data-testid="menu-needs"] [data-testid="need-chip"]')].map(e=>e.textContent).join(',')==='Stone,Wheat');
 assert.equal(await tradeNeeds.evaluate(row=>row.hasAttribute('aria-live')||row.getAttribute('role')==='status'||row.querySelector('[aria-live],[role=status]')!==null),false,'Trade-window needs are not a live region');
 assert.equal(/\d/.test(await tradeNeeds.textContent()),false,'the needs row carries no counts or hand information');
 // BAD input: a clear leaves the window; three goods are refused by the host, so the row keeps its last valid value.
 await b.evaluate(()=>window.__emberisle.getState().net.need(['ore','grain','wool']));
 await a.waitForTimeout(600);
 assert.deepEqual(await tradeNeeds.getByTestId('need-chip').allTextContents(),['Stone','Wheat']);
 await b.evaluate(()=>window.__emberisle.getState().net.need([]));await tradeNeeds.waitFor({state:'detached'});
 assert(await a.getByRole('button',{name:'Need Wood',exact:true}).isDisabled());
 const dimensions=await a.getByRole('button',{name:/^Need (Wood|Brick|Sheep|Wheat|Stone)$/}).evaluateAll(buttons=>buttons.map(button=>{const box=button.getBoundingClientRect();return {w:box.width,h:box.height};}));
 assert(dimensions.every(d=>d.w>=44&&d.h>=44));
 assert.deepEqual(await a.evaluate(()=>window.__isle.insets()),before);
 assert.equal(await b.evaluate(()=>window.__emberisle.getState().state.players.find(p=>p.id==='p0').resources),undefined);
 for(const good of ['Stone','Wheat'])await a.getByRole('button',{name:`Need ${good}`,exact:true}).click();await chip.waitFor({state:'detached'});
 await peerNeeds.waitFor({state:'detached'});await b.keyboard.press('Escape');
 // Empty row: closing the picker shows the one sentence of the feature, then reopen for the next step.
 // The picker is always in the window: the heading and its one hint line replace the old closed-row sentence.
 await a.getByRole('heading',{name:'You need',exact:true}).waitFor();assert.equal(await a.locator('.need-hint').textContent(),'Tap up to two. Not part of the offer; other players see it.');assert.equal(await a.getByTestId('own-needs').count(),0,'no separate own chips line');assert.equal(await a.getByRole('button',{name:'Need',exact:true}).count(),0,'no Need toggle button');
 await a.getByRole('button',{name:'Need Stone',exact:true}).click();await chip.waitFor();
 mkdirSync('test-results',{recursive:true});await a.screenshot({path:'test-results/needs-picker-phone.png'});
 await a.getByRole('button',{name:'Close',exact:true}).click();
 await a.reload();await a.waitForFunction(()=>window.__emberisle?.getState().state);
 await a.getByTestId('seat-p0').getByTestId('seat-needs').waitFor();
 console.log('ok Need picker with 250ms host echoes: rapid selections compose; five 44px controls, maximum two, clear, public chip within 1s, hidden hand preserved, rejoin and unchanged hole');
 await a.evaluate(()=>window.__emberisle.getState().setTradeOpen(true));
 await a.getByRole('button',{name:'More Wood to give',exact:true}).click();await a.getByRole('button',{name:'More Stone to want',exact:true}).click();
 await a.getByRole('button',{name:'Ask the table',exact:true}).click();
 await b.getByRole('button',{name:'Yes',exact:true}).click();await chip.waitFor({state:'detached'});
 await b.waitForFunction(()=>window.__emberisle.getState().state.players.find(p=>p.id==='p1').resources.ore===1);
 console.log('ok real table trade: received requested Stone clears the public need on the other client');
 await a.waitForFunction(()=>window.__emberisle.getState().seats.find(s=>s.player==='p0')?.needs?.length===0);
 await a.evaluate(()=>window.__emberisle.getState().setTradeOpen(true));
 await a.getByRole('heading',{name:'You need',exact:true}).waitFor();
 // Hold real host seat echoes so unrelated messages cannot hide an optimistic-draft reset.
 await a.evaluate(()=>{window.__holdNeedSeats=true;});
 await a.getByRole('button',{name:'Need Stone',exact:true}).click();
 await a.evaluate(()=>window.__emberisle.getState().refuseQuietly('An unrelated announcement.'));
 await a.evaluate(()=>new Promise(requestAnimationFrame));
 assert.equal(await a.getByRole('button',{name:'Need Stone',exact:true}).getAttribute('aria-pressed'),'true','an unrelated announcement preserves the delayed Need draft');
 const errorBefore=await a.evaluate(()=>window.__emberisle.getState().errorSeq);
 await a.evaluate(()=>{for(let i=0;i<30;i++)window.__emberisle.getState().net.rename('Still the same person');});
 await a.waitForFunction(n=>window.__emberisle.getState().errorSeq>n&&window.__emberisle.getState().error==='Slow down.',errorBefore);
 assert.equal(await a.getByRole('button',{name:'Need Stone',exact:true}).getAttribute('aria-pressed'),'true','unrelated host ACT rate errors preserve the delayed Need draft');
 const rejectedAt=Date.now();
 await a.evaluate(()=>{
  // Exhaust and choose in one task: no intervening browser round trip can refill an ACT token.
  for(let i=0;i<30;i++)window.__emberisle.getState().net.rename('Still the same person');
  document.querySelector('#need-picker [aria-label="Need Wheat"]').click();
 });
 await a.waitForFunction(()=>[...document.querySelectorAll('#need-picker [aria-pressed]')].every(button=>button.getAttribute('aria-pressed')==='false'));
 assert(Date.now()-rejectedAt<1000,'Need rejection rolls back promptly, before the unchanged three-second fallback');
 assert.equal(await a.evaluate(()=>window.__emberisle.getState().error),'Slow down.','a genuinely rate-rejected Need rolls back to the authoritative selection');
 await a.evaluate(()=>{window.__holdNeedSeats=false;for(const deliver of window.__needSeats??[])deliver();window.__needSeats=[];});
 console.log('ok delayed Need draft survives unrelated announcements and host ACT errors; actual Need rate rejection rolls back');
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
   if(seat.trigger.height!==44||seat.pointerEvents!=='none'||seat.buttons!==0||seat.tabIndex>=0)geometryProblems.push(`${prefix}: trigger or dot interaction changed`);
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
  const picker=await page.locator('#need-picker').evaluate(field=>{
   const grid=field.querySelector('div'),style=getComputedStyle(grid),scroll=document.querySelector('.trade-composer-scroll');
   const viewport=scroll.getBoundingClientRect(),give=scroll.querySelector('[data-testid="trade-give-row"]');
   const controls=[give.querySelector('h3'),...give.querySelectorAll('button')].map(control=>{const box=control.getBoundingClientRect();return {label:control.getAttribute('aria-label')||control.textContent,top:box.top,bottom:box.bottom,visible:box.top>=viewport.top&&box.bottom<=viewport.bottom};});
   const targets=[...field.querySelectorAll('button')].map(button=>{const box=button.getBoundingClientRect();return {label:button.getAttribute('aria-label')||button.textContent,width:box.width,height:box.height,fill:getComputedStyle(button).backgroundColor,pressed:button.getAttribute('aria-pressed')};}),gaps=[...field.querySelectorAll('button')].slice(1).map((button,i)=>button.getBoundingClientRect().left-field.querySelectorAll('button')[i].getBoundingClientRect().right);
   return {targets,gaps,noOverflow:field.scrollWidth<=field.clientWidth&&scroll.scrollWidth<=scroll.clientWidth,gap:Number.parseFloat(style.columnGap),scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight,viewport:{top:viewport.top,bottom:viewport.bottom},giveControls:controls};
  });
  geometry.at(-1).picker=picker;if(!picker.noOverflow)geometryProblems.push(`${width}x${height}: picker horizontal overflow`);if(picker.targets.some(target=>target.width<44||target.height<44))geometryProblems.push(`${width}x${height}: picker target below44px`);if(width===844&&picker.giveControls.some(control=>!control.visible))geometryProblems.push(`${width}x${height}: open picker pushes give heading/steppers below scroll fold`);if(picker.gap<8)geometryProblems.push(`${width}x${height}: picker gap below8px`);if(picker.targets.length!==5||picker.targets.some(t=>t.height!==44)||picker.gaps.some(g=>g<8))geometryProblems.push(`${width}x${height}: five 44px pills with 8px gaps differ ${JSON.stringify(picker.targets)}`);if(picker.targets.some(t=>t.fill!==(t.pressed==='true'?'rgb(255, 255, 255)':'rgb(243, 246, 245)')))geometryProblems.push(`${width}x${height}: lit pill must be white and unlit the sheet fill ${JSON.stringify(picker.targets)}`);
  // C3 11.1: the window stays in the lobby's white set, and the Need button and chips read at 4.5:1.
  const white=await page.getByTestId('trade-panel').evaluate(panel=>{
   const rgb=c=>c.match(/[\d.]+/g).slice(0,3).map(Number),lum=c=>{const [r,g,b]=rgb(c).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;});return 0.2126*r+0.7152*g+0.0722*b;};
   const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
   const button=panel.querySelector('#need-picker button'),chip=panel.querySelector('[data-testid="need-chip"]');
   return {sheet:getComputedStyle(panel).backgroundColor,button:ratio(getComputedStyle(button).color,getComputedStyle(button).backgroundColor),chip:chip?ratio(getComputedStyle(chip).color,getComputedStyle(chip).backgroundColor):null};
  });
  geometry.at(-1).white=white;
  if(white.sheet!=='rgb(243, 246, 245)'||white.button<4.5||white.chip===null||white.chip<4.5)geometryProblems.push(`${width}x${height}: Trade window colour or Need text contrast differs from C3 ${JSON.stringify(white)}`);
  await page.getByRole('button',{name:'Close',exact:true}).click();await context.close();
 }
 writeFileSync(path.join(captureDirectory,'needs-geometry.json'),JSON.stringify(geometry,null,2));
 console.log('four-seat needs geometry',JSON.stringify(geometry));
 assert.deepEqual(geometryProblems,[],'four-seat dots match approved geometry, clear public information and menu chips meet approved type/spacing');
 console.log('ok four-seat needs table and own picker:320x568,390x844,844x390,1280x720');
 assert.deepEqual(errors,[]);console.log('needs browser prove ok');
}finally{
 await browser?.close();await vite?.close();
 if(host.exitCode===null&&host.signalCode===null){const stopped=once(host,'exit');host.kill();await stopped;}
 rmSync(directory,{recursive:true,force:true});
}
