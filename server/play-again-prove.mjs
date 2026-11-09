// #1411 (docs/design/play-again-1411): real sockets prove "I'll play again". `wantAgain` is taken only from a seated person
// while the game is over; every seat and the watcher hear it as `again: true` on that seat and nothing on the others; taking it
// back, dropping or a host restart clears it (it is never saved); a watcher cannot send it; a guest still cannot start the next
// game; and the host's rematch, which takes along exactly who it took before, clears every yes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createGame } from '../src/lib/game/board.ts';

const directory=mkdtempSync(path.join(tmpdir(),'emberisle-play-again-'));
const code='WANT';
const sockets=[];let host,stderr='';
process.on('exit',()=>{host?.kill();rmSync(directory,{recursive:true,force:true});});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>process.exit(130));

// Three people and a bot. p0 (s0) hosts; p3 (s3) is a lobby bot.
function fixture(phase){
 const game=createGame({humans:[{name:'Ember'},{name:'Tide'},{name:'Pine'},{name:'Cog'}],bots:0,seed:14,wayfarerMode:'off'});
 game.rollOff=null;game.current='p0';game.log=[];game.players[3].kind='bot';game.phase=phase;
 if(phase==='over')game.winner='p0';
 const seats=game.players.map((p,i)=>({id:`s${i}`,name:p.name,color:p.color,ready:true,pid:p.id,secret:`fixture-${p.id}`,...(i===3?{bot:true}:{})}));
 writeFileSync(path.join(directory,`${code}.json`),JSON.stringify({code,host:'s0',next:4,chat:[],chatSeq:0,game,seats,shape:2,savedAt:Date.now(),wayfarerMode:'off'}));
}
async function start(){
 host=spawn(process.execPath,['--import','./register.mjs','host.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:'0',ROOMS_DIR:directory,RESULTS_DIR:path.join(directory,'results'),PROFILES_DIR:path.join(directory,'profiles'),SAVE_MS:'20',TURN_MS:'600000',GRACE_MS:'600000',HOLD_MS:'600000'},stdio:['ignore','pipe','pipe']});
 host.stderr.on('data',data=>stderr+=data);
 return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error(`host startup timeout: ${stderr}`)),10000);host.once('error',reject);host.once('exit',exit=>{clearTimeout(timeout);reject(Error(`host exit ${exit}: ${stderr}`));});host.stdout.on('data',data=>{const m=String(data).match(/listening (\d+)/);if(m){clearTimeout(timeout);resolve(Number(m[1]));}});});
}
async function stopHost(){
 for(const socket of sockets)socket.terminate();
 sockets.length=0;
 if(host?.exitCode===null&&host?.signalCode===null){const current=host,stopped=once(current,'exit');current.kill('SIGTERM');await stopped;}
}
async function connect(port,pid,watch=false){
 const ws=new WebSocket(`ws://127.0.0.1:${port}`),c={ws,inbox:[],state:null};sockets.push(ws);
 ws.on('message',raw=>{const message=JSON.parse(String(raw));if(message.type==='state')c.state=message;c.inbox.push(message);c.changed?.();});
 c.next=async(type,predicate=()=>true)=>{
  const deadline=Date.now()+5000;
  for(;;){const i=c.inbox.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return c.inbox.splice(i,1)[0];
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`timeout ${pid} ${type}: ${JSON.stringify(c.inbox.slice(-3))} ${stderr}`)),Math.max(1,deadline-Date.now()));c.changed=()=>{clearTimeout(timer);c.changed=null;resolve();};});}
 };
 c.send=msg=>ws.send(JSON.stringify(msg));
 await once(ws,'open');c.send(watch?{type:'hello',code,watch:true}:{type:'hello',code,secret:`fixture-${pid}`});
 const welcome=await c.next('welcome');c.seat=welcome.you;await c.next('state');return c;
}
// Which seats say yes, as one table member hears it.
const yes=m=>m.seats.filter(s=>'again' in s).map(s=>`${s.id}:${s.again}`).join(',');
const heard=(c,want)=>c.next('seats',m=>yes(m)===want);
async function saved(test){for(let i=0;i<100;i++){try{const s=readFileSync(path.join(directory,`${code}.json`),'utf8');if(test(s))return s;}catch{}await new Promise(r=>setTimeout(r,20));}throw Error('save timeout');}

try{
 // Mid-game, nobody can say it.
 fixture('main');
 let port=await start(),a=await connect(port,'p0'),b=await connect(port,'p1');
 b.send({type:'wantAgain',value:true});
 assert.equal((await b.next('error')).message,'Game is not over.');
 a.send({type:'wantAgain',value:true});
 assert.equal((await a.next('error')).message,'Game is not over.');
 await stopHost();
 console.log('ok mid-game: wantAgain is refused, nothing changes');

 fixture('over');
 port=await start();a=await connect(port,'p0');b=await connect(port,'p1');let c=await connect(port,'p2');const w=await connect(port,'watch',true);
 assert.equal(a.state.game.phase,'over');
 const first=await a.next('seats',m=>m.seats.every(s=>s.bot||!s.away));
 assert.equal(yes(first),'','nobody has said yes yet, and the host and bot carry no again field');
 assert.deepEqual(first.seats.map(s=>[s.id,s.host,s.bot]),[['s0',true,false],['s1',false,false],['s2',false,false],['s3',false,true]]);

 // A guest says yes: every seat and the watcher hear it on that seat only. The host saves the room after it, without the yes.
 const before=JSON.parse(await saved(()=>true)).savedAt;
 b.send({type:'wantAgain',value:true});
 for(const peer of [a,b,c,w])await heard(peer,'s1:true');
 const after=JSON.parse(await saved(s=>JSON.parse(s).savedAt>before));
 assert.equal(after.game.phase,'over');
 assert.ok(after.seats.every(s=>!('again' in s)),'the saved room carries no again');
 console.log('ok a guest says yes: seats and the watcher hear again:true on s1 only; not saved');

 // The same answer again sends nothing; the next change is the only seat list that follows.
 a.inbox=[];b.send({type:'wantAgain',value:true});c.send({type:'wantAgain',value:true});
 await heard(a,'s1:true,s2:true');
 assert.equal(a.inbox.filter(m=>m.type==='seats').length,0,'a repeated yes sends no seat list');
 // Anything but true is a no.
 c.send({type:'wantAgain',value:'yes'});await heard(a,'s1:true');
 console.log('ok a repeat sends nothing; a value that is not true takes it back');

 // A watcher cannot say it; a guest still cannot start the next game.
 w.send({type:'wantAgain',value:true});
 assert.equal((await w.next('error')).message,'Watching only.');
 b.send({type:'again'});
 assert.equal((await b.next('error')).message,'Only the host can start.');
 assert.equal(b.state.game.phase,'over');
 console.log('ok a watcher cannot say yes; a guest who said yes still cannot start');

 // Take it back.
 b.send({type:'wantAgain',value:false});
 for(const peer of [a,b,c,w])await heard(peer,'');
 console.log('ok taking it back clears it for everyone');

 // A player who drops is away, and back before the next game has not said yes.
 c.send({type:'wantAgain',value:true});await heard(a,'s2:true');
 const cid=c.seat;c.ws.terminate();
 const away=await a.next('seats',m=>m.seats.find(s=>s.id===cid).away);
 assert.equal(yes(away),'','a dropped seat is away with no yes');
 c=await connect(port,'p2');
 const back=await a.next('seats',m=>!m.seats.find(s=>s.id===cid).away);
 assert.equal(yes(back),'');
 console.log('ok a dropped player shows away, and comes back with no yes');

 // A host restart forgets every yes: it was never saved.
 b.send({type:'wantAgain',value:true});c.send({type:'wantAgain',value:true});await heard(a,'s1:true,s2:true');
 await stopHost();
 port=await start();a=await connect(port,'p0');b=await connect(port,'p1');c=await connect(port,'p2');
 assert.equal(yes(await a.next('seats',m=>m.seats.every(s=>s.bot||!s.away))),'');
 console.log('ok a host restart clears every yes');

 // The host starts the next game with who it always took (every connected seat and the bot, yes or not); every yes is cleared.
 b.send({type:'wantAgain',value:true});await heard(a,'s1:true');
 a.inbox=[];a.send({type:'again'});
 const next=await a.next('state',m=>m.game.phase!=='over');
 assert.equal(next.game.players.length,4,'the rematch takes all four seats, as before');
 assert.equal(yes(await a.next('seats')),'','the rematch clears every yes');
 b.send({type:'wantAgain',value:true});
 assert.equal((await b.next('error')).message,'Game is not over.');
 console.log('ok the host rematch takes the same seats, clears every yes, and wantAgain is refused in the new game');
 console.log('play-again-prove: all passed');
}finally{await stopHost();}
