// #646: real sockets validate public needs, persistence, expiry, trade clearing and the shared ACT bucket.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createGame } from '../src/lib/game/board.ts';
import { advanceNeed, validNeeds } from '../src/lib/game/needs.ts';

for(const value of [null,{},['bad'],['ore','ore'],['ore','grain','timber']])assert.equal(validNeeds(value),false);
for(const value of [[],['ore'],['ore','grain']])assert.equal(validNeeds(value),true);
const unit=createGame({humans:[{name:'A'},{name:'B'},{name:'C'}],bots:0,seed:14});unit.phase='main';unit.current='p0';
const selection={kinds:['ore'],turnsLeft:2};
const end={...unit,current:'p1',phase:'roll'};
assert.equal(advanceNeed(selection,'p0',unit,end,false).turnsLeft,1,'own turn counts even without whole-round increment');
assert.equal(advanceNeed(selection,'p1',unit,end,false),selection,'another player passing does not age needs');
const gained=structuredClone(unit);gained.players[0].resources.ore++;
assert.equal(advanceNeed(selection,'p0',unit,gained,false),selection,'rolls or steals do not satisfy a trade need');
assert.equal(advanceNeed(selection,'p0',unit,gained,true),undefined,'matching trade clears');
console.log('ok needs validation and shared local/host expiry rules');

const directory=mkdtempSync(path.join(tmpdir(),'emberisle-needs-'));
const code='NEED';
let game=createGame({humans:[{name:'A'},{name:'B'},{name:'C'}],bots:0,seed:14,wayfarerMode:'off'});
game.phase='main';game.rollOff=null;game.current='p0';game.log=[];
for(const vertex of game.vertices)vertex.building=null;
for(const p of game.players)for(const r of ['timber','clay','wool','grain','ore'])p.resources[r]=0;
game.players[0].resources.grain=1;game.players[1].resources.timber=4;
game.bank={timber:15,clay:19,wool:19,grain:18,ore:19};
const seats=game.players.map((p,i)=>({id:`s${i}`,name:p.name,color:p.color,ready:true,pid:p.id,secret:`fixture-${p.id}`}));
writeFileSync(path.join(directory,`${code}.json`),JSON.stringify({code,host:'s0',next:3,chat:[],chatSeq:0,game,seats,shape:2,savedAt:Date.now(),wayfarerMode:'off'}));
const sockets=[];let host,stderr='';
process.on('exit',()=>{host?.kill();rmSync(directory,{recursive:true,force:true});});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>process.exit(130));
async function start(){
 host=spawn(process.execPath,['--import','./register.mjs','host.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:'0',ROOMS_DIR:directory,PROFILES_DIR:path.join(directory,'profiles'),TURN_MS:'600000',GRACE_MS:'600000',HOLD_MS:'600000'},stdio:['ignore','pipe','pipe']});
 host.stderr.on('data',data=>stderr+=data);
 return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error(`host startup timeout: ${stderr}`)),10000);host.once('error',reject);host.once('exit',exit=>{clearTimeout(timeout);reject(Error(`host exit ${exit}: ${stderr}`));});host.stdout.on('data',data=>{const m=String(data).match(/listening (\d+)/);if(m){clearTimeout(timeout);resolve(Number(m[1]));}});});
}
async function stopHost(){
 for(const socket of sockets)socket.terminate();
 sockets.length=0;
 if(host?.exitCode===null&&host?.signalCode===null){const current=host,stopped=once(current,'exit');current.kill('SIGTERM');await stopped;}
}
function saveFixture(game,fixtureSeats){
 writeFileSync(path.join(directory,`${code}.json`),JSON.stringify({code,host:'s0',next:3,chat:[],chatSeq:0,game,seats:fixtureSeats,shape:2,savedAt:Date.now(),wayfarerMode:'off'}));
}
async function connect(port,pid,watch=false,waitForState=true){
 const ws=new WebSocket(`ws://127.0.0.1:${port}`), c={ws,inbox:[],state:null};sockets.push(ws);
 ws.on('message',raw=>{const message=JSON.parse(String(raw));if(message.type==='state')c.state=message;c.inbox.push(message);c.changed?.();});
 c.next=async(type,predicate=()=>true)=>{
  const deadline=Date.now()+5000;
  for(;;){const i=c.inbox.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return c.inbox.splice(i,1)[0];
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`timeout ${pid} ${type}: ${stderr}`)),Math.max(1,deadline-Date.now()));c.changed=()=>{clearTimeout(timer);c.changed=null;resolve();};});}
 };
 c.nextAny=async(types)=>{
  const accepted=new Set(types),deadline=Date.now()+5000;
  for(;;){const i=c.inbox.findIndex(m=>accepted.has(m.type));if(i>=0)return c.inbox.splice(i,1)[0];
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`timeout ${pid} ${types.join('/')} : ${stderr}`)),Math.max(1,deadline-Date.now()));c.changed=()=>{clearTimeout(timer);c.changed=null;resolve();};});}
 };
 c.send=msg=>ws.send(JSON.stringify(msg));
 c.act=async msg=>{const seq=c.state.game.seq;c.send({...msg,...c.state.actionStamp,cid:randomUUID()});return c.next('state',m=>m.game.seq>seq);};
 await once(ws,'open');c.send(watch?{type:'hello',code,watch:true}:{type:'hello',code,secret:`fixture-${pid}`});
 const welcome=await c.next('welcome');c.seat=welcome.you;if(waitForState)await c.next('state');return c;
}
const ownNeeds=(message,c)=>message.seats.find(s=>s.id===c.seat)?.needs;
async function need(c,kinds){c.send({type:'need',kinds});return c.next('seats',m=>JSON.stringify(ownNeeds(m,c))===JSON.stringify(kinds));}
try{
 let port=await start(),a=await connect(port,'p0'),b=await connect(port,'p1'),c=await connect(port,'p2');
 const stableState=state=>[state.game.seq,state.actionStamp,state.turnDeadline];
 const baseline=structuredClone(stableState(a.state));
 const publicMessage=await need(a,['grain']);
 assert.equal(publicMessage.seats.find(s=>s.id===a.seat).player,'p0');
 assert(!JSON.stringify(publicMessage).includes('turnsLeft'),'only chosen kinds, no private bookkeeping');
 assert.deepEqual(stableState(a.state),baseline,'need updates do not change game seq, action stamp or turn deadline');
 for(const kinds of [['bad'],['ore','ore'],['ore','grain','timber'],null]){a.send({type:'need',kinds});assert.match((await a.next('error')).message,/two different/);}
 console.log('ok real need frames: public seat projection, malformed/duplicate/oversized rejection; game and clocks unchanged');
 await a.act({type:'pass'});
 assert.deepEqual(ownNeeds(await a.next('seats',m=>JSON.stringify(ownNeeds(m,a))==='["grain"]'),a),['grain']);
 const stopped=once(host,'exit');host.kill('SIGTERM');await stopped;
 for(const socket of sockets)socket.terminate();
 port=await start();a=await connect(port,'p0');b=await connect(port,'p1');c=await connect(port,'p2');
 assert.deepEqual(ownNeeds(await a.next('seats'),a),['grain'],'selection survives restart/rejoin after its first turn');
 const watcher=await connect(port,'watch',true);watcher.send({type:'need',kinds:['ore']});assert.equal((await watcher.next('error')).message,'Watching only.');
 for(const client of [b,c,a]){
  await client.next('state',m=>m.game.current===client.state.you&&m.game.phase==='roll');
  await client.act({type:'roll'});await client.act({type:'pass'});
 }
 await a.next('seats',m=>JSON.stringify(ownNeeds(m,a))==='[]');
 console.log('ok restart/rejoin keeps one remaining own turn; second own turn clears; watchers cannot change needs');
 // B now rolls and exchanges four Wood for Stone.
 await b.next('state',m=>m.game.current==='p1'&&m.game.phase==='roll');await b.act({type:'roll'});
 await need(b,['ore']);a.inbox=[];b.inbox=[];await b.act({type:'tradeBank',give:'timber',take:'ore'});
 await b.next('seats',m=>JSON.stringify(ownNeeds(m,b))==='[]');
 await need(a,['ore']);await need(b,['grain']);
 b.send({...b.state.actionStamp,cid:randomUUID(),type:'tradeAsk',give:{ore:1},want:{grain:1}});
 const offer=await a.next('tradeOffer');
 a.inbox=[];b.inbox=[];
 await a.act({type:'tradeAnswer',tradeId:offer.tradeId,yes:true});
 await a.next('seats',m=>JSON.stringify(ownNeeds(m,a))==='[]'&&m.seats.find(s=>s.id===b.seat).needs.length===0);
 console.log('ok bank and player trades clear only needs satisfied by received goods, for both participants');
 c.inbox=[];for(let i=0;i<30;i++)c.send({type:'need',kinds:['clay']});
 assert.equal((await c.next('error')).message,'Slow down.');
 console.log('ok need updates share the ACT rate limit');

 // Starting a real lobby game clears restored public needs, observable on the next real seat projection.
 await stopHost();
 const lobby=createGame({humans:[{name:'A'},{name:'B'},{name:'C'}],bots:0,seed:14,wayfarerMode:'off'});
 const lobbySeats=lobby.players.map((p,i)=>({id:`s${i}`,name:p.name,color:p.color,ready:true,pid:null,secret:`fixture-p${i}`,needs:{kinds:[['ore'],['grain'],['clay']][i],turnsLeft:2}}));
 saveFixture(null,lobbySeats);
 port=await start();a=await connect(port,'p0',false,false);b=await connect(port,'p1',false,false);c=await connect(port,'p2',false,false);
 const beforeStart=a.inbox.filter(m=>m.type==='seats').at(-1);
 assert.deepEqual(beforeStart.seats.map(s=>s.needs),[['ore'],['grain'],['clay']],'pre-existing lobby needs are public before start');
 for(const client of [a,b,c])client.send({type:'ready',value:true});
 await a.next('seats',m=>m.seats.every(s=>s.ready));
 for(const client of [a,b,c])client.inbox=[];
 a.send({type:'start'});
 const startedState=await a.next('state',m=>Boolean(m.game?.phase));
 assert.ok(startedState.game.phase,'host accepted start and created a game');
 a.inbox=[];a.send({type:'ready',value:false});
 const afterStart=await a.next('seats');
 assert.deepEqual(afterStart.seats.map(s=>s.needs),[[],[],[]],'startGame clears prior needs in the host public seat projection');
 console.log('ok real start transition clears restored needs from every public seat');

 // A restored finished game rejects a new need without replacing a different, already-public selection.
 await stopHost();
 const overGame=structuredClone(startedState.game);
 overGame.phase='over';overGame.winner='p0';overGame.current='p0';
 const overSeats=overGame.players.map((p,i)=>({id:`s${i}`,name:p.name,color:p.color,ready:true,pid:p.id,secret:`fixture-${p.id}`,needs:{kinds:[['grain'],['ore'],['clay']][i],turnsLeft:2}}));
 saveFixture(overGame,overSeats);
 port=await start();a=await connect(port,'p0');b=await connect(port,'p1');c=await connect(port,'p2');
 assert.equal(a.state.game.phase,'over','finished-game fixture remains over after host restoration');
 const beforeOverAct=a.inbox.filter(m=>m.type==='seats').at(-1);
 assert.deepEqual(ownNeeds(beforeOverAct,a),['grain'],'finished-game fixture exposes the existing need before the rejected ACT');
 const beforeOverState=structuredClone(stableState(a.state));
 a.inbox=[];a.send({type:'need',kinds:['ore']});
 const overResult=await a.nextAny(['error','seats']);
 console.log('DEBUG postgame response',JSON.stringify(overResult));
 assert.equal(overResult.type,'error','need ACT after game over is rejected before publishing seat changes');
 assert.equal(overResult.message,'Needs are available during a game.');
 assert.deepEqual(stableState(a.state),beforeOverState,'rejected postgame ACT preserves the public game state and clocks');
 assert.deepEqual(ownNeeds(beforeOverAct,a),['grain'],'the pre-existing public need remains the only public selection');
 assert.equal(a.inbox.some(m=>m.type==='seats'),false,'rejected postgame ACT sends no public seat update');
 console.log('ok finished-game need ACT is refused with public state and existing need preserved');

 // The real rematch message clears each seat's restored need before publishing the new game.
 a.inbox=[];a.send({type:'again'});
 const rematchSeats=await a.next('seats');
 assert.deepEqual(rematchSeats.seats.map(s=>s.needs),[[],[],[]],'rematch clears every previous public need');
 const rematchState=await a.next('state',m=>m.game?.phase!=='over');
 assert.ok(rematchState.game.phase,'host accepted rematch and created a new game');
 console.log('ok real rematch transition clears prior needs from every public seat');

 // Rejoining runs a bot's real turn: only that bot's one-turn-remaining need expires.
 await stopHost();
 const botGame=createGame({humans:[{name:'A'},{name:'B'},{name:'C'}],bots:0,seed:14,wayfarerMode:'off'});
 botGame.phase='main';botGame.rollOff=null;botGame.current='p1';botGame.turn=1;botGame.log=[];botGame.players[1].kind='bot';
 const botSeats=botGame.players.map((p,i)=>({id:`s${i}`,name:p.name,color:p.color,ready:true,pid:p.id,secret:`fixture-${p.id}`,...(i===1?{bot:true}:{}),...(i===1?{needs:{kinds:['ore'],turnsLeft:2}}:i===2?{needs:{kinds:['clay'],turnsLeft:1}}:{})}));
 saveFixture(botGame,botSeats);
 port=await start();a=await connect(port,'p0');
 assert.equal(a.state.game.phase,'roll','the next human seat reached its normal turn start');
 assert.equal(a.state.game.current,'p2','the bot completed its own turn before the host returned state');
 const afterBotTurn=a.inbox.filter(m=>m.type==='seats').at(-1);
 assert.deepEqual(afterBotTurn.seats.find(s=>s.id==='s1').needs,['ore'],'the bot need remains after its first own turn');
 assert.deepEqual(afterBotTurn.seats.find(s=>s.id==='s2').needs,['clay'],'the next human need did not age on the bot turn');
 c=await connect(port,'p2');
 assert.equal(c.state.game.current,'p2');
 await c.act({type:'roll'});await c.act({type:'pass'});
 assert.equal(c.state.game.current,'p0','the next human seat completed its own turn');
 const afterHumanTurn=a.inbox.filter(m=>m.type==='seats').at(-1);
 assert.deepEqual(afterHumanTurn.seats.find(s=>s.id==='s1').needs,['ore'],'the bot need did not age on a different owner’s turn');
 assert.deepEqual(afterHumanTurn.seats.find(s=>s.id==='s2').needs,[],'the human need expires on its own completed turn');
 await a.act({type:'roll'});await a.act({type:'pass'});
 assert.equal(a.state.game.current,'p2','the bot completed its second own turn');
 const afterSecondBotTurn=a.inbox.filter(m=>m.type==='seats').at(-1);
 assert.deepEqual(afterSecondBotTurn.seats.find(s=>s.id==='s1').needs,[],'the bot need expires on its second own completed turn');
 assert.ok(a.inbox.filter(m=>m.type==='seats').length>=2,'runBots publishes the bot need expiry on its own completed turn');
 console.log('ok runBots decrements only the acting bot’s need; it survives one own turn and expires on the second');
 console.log('needs server prove ok');
}finally{
 for(const socket of sockets)socket.terminate();
 if(host?.exitCode===null&&host?.signalCode===null){const stopped=once(host,'exit');host.kill();await stopped;}
 rmSync(directory,{recursive:true,force:true});
}
