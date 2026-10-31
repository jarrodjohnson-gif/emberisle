// Creation defaults, seven/discard completion, blocking/theft, useful fortunes and bot termination in every mode.
import assert from 'node:assert/strict';
import { createGame } from '../src/lib/game/board.ts';
import { applyAction, publicVP, stealTargets, wayfarerMode } from '../src/lib/game/rules.ts';
import { chooseBotAction } from '../src/lib/game/ai.ts';
const make=mode=>createGame({seed:42,humans:[{name:'Ember'},{name:'Tide'},{name:'Pine'}],bots:0,wayfarerMode:mode});
const act=(s,p,a)=>{const r=applyAction(s,p,a);assert.equal(r.error,undefined,JSON.stringify(a));assert.equal(r.state.wayfarerMode,s.wayfarerMode);return r.state;};
function roll(s,total){for(let rng=1;rng<100000;rng++){const t=structuredClone(s);t.rng=rng;t.phase='roll';const r=applyAction(t,t.current,{type:'roll'});if(!r.error&&r.state.dice.reduce((a,b)=>a+b)===total)return r.state;}throw Error('no roll');}
assert.equal(wayfarerMode(make(undefined)),'on');const legacy=make();delete legacy.wayfarerMode;assert.equal(wayfarerMode(legacy),'on');
for(const mode of ['on','off']){
 let s=make(mode);s.current='p0';s.phase='roll';for(const p of s.players)p.resources={timber:0,clay:0,wool:0,grain:0,ore:0};
 assert.equal(s.hexes.filter(h=>h.blocked).length,mode==='off'?0:1);
 let seven=roll(s,7);assert.equal(seven.phase,mode==='off'?'main':'robber');
 s.players[1].resources.timber=10;seven=roll(s,7);assert.equal(seven.phase,'discard');assert.equal(seven.discardNeeded.p1,5);
 seven=act(seven,'p1',{type:'discard',resources:{timber:5,clay:0,wool:0,grain:0,ore:0}});assert.equal(seven.phase,mode==='off'?'main':'robber');assert.equal(seven.players[1].resources.timber,5);
 const h=s.hexes.find(h=>h.terrain!=='waste'&&h.pip!==7),v=s.vertices.find(v=>v.hexes.includes(h.id));s.vertices.forEach(v=>v.building=null);v.building={kind:'outpost',playerId:'p1'};s.players[1].resources.timber=3;s.phase='robber';
 const before=structuredClone(s.players.map(p=>p.resources));assert.deepEqual(stealTargets(s,h.id,'p0'),mode==='on'?['p1']:[]);
 const forged=applyAction(s,'p0',{type:'moveRobber',hexId:h.id,stealFrom:'p1'});
 if(mode!=='on'){assert.ok(forged.error);assert.equal(forged.state,s);}
 if(mode==='off')assert.ok(applyAction(s,'p0',{type:'moveRobber',hexId:h.id,stealFrom:null}).error);
 else{const moved=act(s,'p0',{type:'moveRobber',hexId:h.id,stealFrom:mode==='on'?'p1':null});assert.equal(moved.phase,'main');assert.equal(moved.hexes.find(x=>x.id===h.id).blocked,true);if(mode==='on'){assert.equal(moved.players[0].resources.timber,1);assert.equal(moved.players[1].resources.timber,2);}else assert.deepEqual(moved.players.map(p=>p.resources),before);
  const produced=roll({...moved,playedCard:false},h.pip);assert.equal(produced.players[1].resources[h.terrain],moved.players[1].resources[h.terrain]);}
 if(mode==='off'){s.hexes.find(x=>x.id===h.id).blocked=true;const produced=roll(s,h.pip);assert.equal(produced.players[1].resources[h.terrain],s.players[1].resources[h.terrain]+1,'Off ignores a stale blocked flag from a saved view');}
 // Three old cards, one per turn, build the normal largest army in all modes, before or after rolling.
 s=make(mode);s.current='p0';s.phase='roll';s.players[0].hidden.knight=4;s.players[0].boughtThisTurn.knight=0;
 for(let n=1;n<=3;n++){s.playedCard=false;s.phase=n===2?'main':'roll';const phase=s.phase,hexId=mode==='off'?'':s.hexes.find(h=>h.id!==s.robberHex).id;
  if(mode==='off'){const bad=applyAction(s,'p0',{type:'playKnight',hexId:s.robberHex,stealFrom:null});assert.ok(bad.error);assert.equal(bad.state,s);}
  s=act(s,'p0',{type:'playKnight',hexId,stealFrom:null});assert.equal(s.phase,phase);assert.equal(s.players[0].knightsPlayed,n);assert.equal(s.players[0].hidden.knight,4-n);assert.ok(applyAction(s,'p0',{type:'playKnight',hexId,stealFrom:null}).error);
  if(mode==='off'){assert.equal(s.hexes.some(h=>h.blocked),false);assert.match(s.log.at(-1),/plays Wayfarer/);}
 }
 assert.equal(s.largestArmy,'p0');assert.equal(publicVP(s,'p0'),2);
 s.playedCard=false;s.players[0].boughtThisTurn.knight=1;assert.ok(applyAction(s,'p0',{type:'playKnight',hexId:mode==='off'?'':s.hexes.find(h=>h.id!==s.robberHex).id,stealFrom:null}).error);
 console.log(`ok ${mode}: sevens, half discards, movement/blocking/theft, no-target Off, army, card-age and one/turn rules`);
 for(const seed of [11,42]){let g=createGame({seed,humans:[],bots:4,wayfarerMode:mode});let steps=0;
  while(g.phase!=='over'&&steps++<15000){const pid=g.phase==='discard'?Object.keys(g.discardNeeded)[0]:g.current,a=chooseBotAction(g,pid);assert.ok(a,`${mode}: bot stalled ${g.phase}`);g=act(g,pid,a);if(mode==='off'){assert.notEqual(g.phase,'robber');assert.equal(g.hexes.some(h=>h.blocked),false);}}
  assert.equal(g.phase,'over',`${mode} seed ${seed} bot loop`);console.log(`ok ${mode} seed ${seed}: complete bot game in ${steps} actions`);
 }
}
console.log('wayfarer-modes-prove: rules checks passed');

// The title's choice sticks across games made without the menu (new game, play again) and resets only on returning to it.
{
 const {useGame}=await import('../src/lib/game/store.ts'),g=()=>useGame.getState();
 assert.deepEqual(g().wayfarerChoices,{});
 g().setWayfarerChoice('ai','off');g().setWayfarerChoice('hotseat','off');g().setWayfarerChoice('online','off');
 g().startAi();assert.equal(g().state.wayfarerMode,'off');
 g().startAi();assert.equal(g().state.wayfarerMode,'off','new practice game keeps Off');
 g().startHotseat(3);assert.equal(g().state.wayfarerMode,'off');
 useGame.setState({state:{...g().state,phase:'over',winner:'p0'}});g().playAgain();assert.equal(g().state.wayfarerMode,'off','hotseat play again keeps Off');
 g().startHotseat(3);assert.equal(g().state.wayfarerMode,'off','new hotseat game keeps Off');
 g().goTitle();assert.deepEqual(g().wayfarerChoices,{},'the menu resets the choice');
 g().startAi();assert.equal(g().state.wayfarerMode,'on','default after the menu');
 g().goTitle();g().setWayfarerChoice('ai','on');assert.equal(g().wayfarerChoices.ai,'on');
 g().setWayfarerChoice('ai','gentle');assert.equal(g().wayfarerChoices.ai,'on','Gentle is not a mode');
 console.log('ok sticky choice: Off survives new/play-again games, the title menu resets to On');
}

// Exercise the same branches through the authoritative host, with real action stamps and private seat views.
{
 const {spawn}=await import('node:child_process'),{mkdtempSync,readFileSync,writeFileSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{default:path}=await import('node:path'),{default:WebSocket}=await import('ws');
 const dir=mkdtempSync(path.join(tmpdir(),'emberisle-wayfarer-rules-')),sockets=[],tables=[],wait=ms=>new Promise(r=>setTimeout(r,ms));let host,port;
 // Only this child proof supplies deterministic dice; production keeps crypto dice. Seat secrets use node:crypto independently.
 writeFileSync(path.join(dir,'dice.mjs'),'let n=0; crypto.getRandomValues = a => { a.fill(n++ % 2 ? 3 : 2); return a; };');
 async function start(){let err='';host=spawn(process.execPath,['--import',path.join(dir,'dice.mjs'),'--import','./register.mjs','host.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:'0',ROOMS_DIR:dir,RESULTS_DIR:dir+'/results',SAVE_MS:'20',GRACE_MS:'600000',HOLD_MS:'600000',TURN_MS:'600000',ACT_CAP:'1000',ACT_RATE:'1000'}});host.stderr.on('data',d=>err+=d);port=await new Promise((resolve,reject)=>{host.stdout.on('data',d=>{const m=String(d).match(/listening (\d+)/);if(m)resolve(Number(m[1]));});host.once('exit',c=>reject(Error(`host ${c}: ${err}`)));});}
 async function client(hello){const ws=new WebSocket(`ws://127.0.0.1:${port}`),inbox=[];let state;sockets.push(ws);ws.on('message',d=>{const m=JSON.parse(String(d));inbox.push(m);if(m.type==='state')state=m;});await new Promise(r=>ws.once('open',r));ws.send(JSON.stringify({type:'hello',...hello}));const next=async(type,test=()=>true)=>{for(let n=0;n<500;n++){const i=inbox.findIndex(m=>m.type===type&&test(m));if(i>=0)return inbox.splice(i,1)[0];await wait(10);}throw Error(`timeout ${type}: ${JSON.stringify(inbox.slice(-2))}`);};const welcome=await next('welcome');return{welcome,next,send:m=>ws.send(JSON.stringify({...state?.actionStamp,cid:crypto.randomUUID(),...m}))};}
 async function stop(){for(const ws of sockets)ws.terminate();if(host?.exitCode===null){host.kill('SIGKILL');await new Promise(r=>host.once('exit',r));}}
 try{
  await start();for(const mode of ['on','off']){const p=[await client({name:'Ember',wayfarerMode:mode})],code=p[0].welcome.code;for(const name of ['Tide','Pine'])p.push(await client({code,name}));for(const a of p)a.send({type:'ready',value:true});await p[0].next('seats',m=>m.seats.length===3&&m.seats.every(s=>s.ready));p[0].send({type:'start'});await p[0].next('state');tables.push({code,mode,p});}
  await wait(150);await stop();
  for(const t of tables){const f=path.join(dir,`${t.code}.json`),s=JSON.parse(readFileSync(f)),g=s.game;g.current='p0';g.phase='roll';g.rollOff=null;g.seq++;g.log=[];for(const p of g.players){p.resources={timber:0,clay:0,wool:0,grain:0,ore:0};p.hidden.knight=3;p.boughtThisTurn.knight=0;}g.players[1].resources.timber=10;const h=g.hexes.find(h=>h.terrain!=='waste'),v=g.vertices.find(v=>v.hexes.includes(h.id));g.vertices.forEach(v=>v.building=null);v.building={playerId:'p1',kind:'outpost'};t.hex=h.id;s.savedAt=Date.now();writeFileSync(f,JSON.stringify(s));}
  await start();for(const t of tables){const old=t.p.map(p=>p.welcome);t.p=[];for(const w of old)t.p.push(await client({code:w.code,secret:w.secret}));const a=t.p[0],initial=await a.next('state');a.send({type:'roll'});const rolled=await a.next('state',m=>m.game.seq>initial.game.seq);assert.equal(rolled.game.dice.reduce((a,b)=>a+b),7);assert.equal(rolled.game.phase,'discard');assert.equal(rolled.game.discardNeeded.p1,5);t.p[1].send({type:'discard',cards:{timber:5}});const discarded=await a.next('state',m=>m.game.seq>rolled.game.seq);assert.equal(discarded.game.phase,t.mode==='off'?'main':'robber');assert.equal(discarded.game.wayfarerMode,t.mode);
   if(t.mode==='off'){assert.deepEqual(discarded.legal.wayfarer,[]);a.send({type:'rob',hexId:t.hex,stealFrom:null});assert.match((await a.next('error')).message,/not moving|off/);a.send({type:'play',card:'knight',hexId:t.hex,stealFrom:null});assert.match((await a.next('error')).message,/no land or target/);}
   else{a.send({type:'rob',hexId:t.hex,stealFrom:null});const moved=await a.next('state',m=>m.game.seq>discarded.game.seq);assert.equal(moved.game.phase,'main');assert.equal(moved.game.players.find(p=>p.id==='p0').resources.timber,t.mode==='on'?1:0);assert.equal(moved.game.hexes.find(h=>h.id===t.hex).blocked,true);}
   const before=await t.p[2].next('state',m=>m.game.phase==='main'),nextHex=before.game.hexes.find(h=>h.id!==before.game.robberHex).id;a.send({type:'play',card:'knight',hexId:t.mode==='off'?'':nextHex,stealFrom:null});const played=await a.next('state',m=>m.game.seq>before.game.seq);assert.equal(played.game.players.find(p=>p.id==='p0').knightsPlayed,1);assert.equal(played.game.phase,'main');if(t.mode==='off')assert.equal(played.game.hexes.some(h=>h.blocked),false);a.send({type:'setWayfarerMode',value:t.mode==='off'?'on':'off'});assert.match((await a.next('error')).message,/fixed when the table is created/);console.log(`ok hosted ${t.mode}: real seven/discard, public legal targets, refused theft/targets, fortune and immutable rule`);
  }
 }finally{await stop();rmSync(dir,{recursive:true,force:true});}
}
console.log('wayfarer-modes-prove: hosted checks passed');
