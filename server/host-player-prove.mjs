// #944: real-host current-seat cap, multiple listings, guest bearer and verified-profile identity.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import {PLAYER_COLORS} from '../src/lib/game/types.ts';
const dir=mkdtempSync(path.join(tmpdir(),'emberisle-host-player-'));
const host=spawn(process.execPath,['--import','./register.mjs','host.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:'0',ROOMS_DIR:path.join(dir,'rooms'),PROFILES_DIR:path.join(dir,'profiles'),PROFILES_DEV:'1',OPEN_CAP:'100',OPEN_IP_CAP:'100',LOBBY_HOLD_MS:'30000'}});
const sockets=[];let checks=0;
const watchdog=setTimeout(()=>{console.error('FAIL host-player exceeded30s');process.exit(1)},30000);
process.on('exit',()=>{host.kill();for(const c of sockets)c.ws.terminate();rmSync(dir,{recursive:true,force:true})});
const check=(ok,why)=>{assert.ok(ok,why);checks++;console.log('ok',why)};
try{
 const port=await new Promise((resolve,reject)=>{host.stdout.on('data',d=>{const m=String(d).match(/listening (\d+)/);if(m)resolve(Number(m[1]))});host.once('error',reject);host.once('exit',c=>reject(Error('host exited '+c)))});
 async function client(){const ws=new WebSocket(`ws://127.0.0.1:${port}`,{origin:'http://localhost'});const inbox=[];ws.on('message',raw=>inbox.push(JSON.parse(String(raw))));const c={ws,inbox,send:m=>ws.send(JSON.stringify(m)),async next(type){const end=Date.now()+3000;while(Date.now()<end){const i=inbox.findIndex(m=>!type||m.type===type);if(i>=0)return inbox.splice(i,1)[0];await new Promise(r=>setTimeout(r,10))}throw Error('no '+type)}};sockets.push(c);await once(ws,'open');return c}
 async function create(name,extra={}){const c=await client();c.send({type:'hello',name,visibility:'open',...extra});const r=await c.next();return {c,r}}
 const list=async()=>{const res=await fetch(`http://127.0.0.1:${port}/tables`);assert.equal(res.status,200);return res.json()};
 const a=await create('Ember');check(a.r.type==='welcome','first guest opens an open table');
 const b=await create('Tide');check(b.r.type==='welcome','different guest opens a second open table on the same server');
 const entries=await list();check(entries.length===2&&[a.r.code,b.r.code].every(code=>entries.some(t=>t.code===code)),'both independent open tables are discoverable');
 for(const visibility of ['open','private']){const dupe=await create('Ember again',{visibility,hostingSecrets:[a.r.secret]});check(dupe.r.type==='error'&&dupe.r.message==="You're already hosting a table.",`same guest host cannot create a second ${visibility} table`)}
 const privateHost=await create('Private',{visibility:'private'});check(privateHost.r.type==='welcome','independent guest can create a private table');
 const privateDupe=await create('Private again',{hostingSecrets:[privateHost.r.secret]});check(privateDupe.r.type==='error'&&privateDupe.r.message==="You're already hosting a table.",'private-table host cannot create another open table');
 check(!(await list()).some(t=>t.code===privateHost.r.code),'private table never leaks into discovery');
 const guest=await client();guest.send({type:'hello',code:a.r.code,name:'Successor'});const joined=await guest.next('welcome');
 a.c.ws.close();await once(a.c.ws,'close');
 const end=Date.now()+3000;let handoff;while(Date.now()<end){handoff=guest.inbox.find(m=>m.type==='seats'&&m.seats.some(s=>s.id===joined.you&&s.host));if(handoff)break;await new Promise(r=>setTimeout(r,10))}
 check(Boolean(handoff),'existing lobby drop hands the host role to the connected successor');
 const freed=await create('Ember new',{hostingSecrets:[a.r.secret]});check(freed.r.type==='welcome','old host can create again after handing off the host seat');
 const inherited=await create('Successor again',{hostingSecrets:[joined.secret]});check(inherited.r.type==='error'&&inherited.r.message==="You're already hosting a table.",'new current host inherits the second-create restriction');
 const live=await list();check([a.r.code,b.r.code,freed.r.code].every(code=>live.some(t=>t.code===code)),'handoff and new create preserve the other listings');
 guest.ws.close();await once(guest.ws,'close');await new Promise(r=>setTimeout(r,30));
 const afterDrop=await create('Successor freed',{hostingSecrets:[joined.secret]});check(afterDrop.r.type==='welcome','entirely disconnected old room no longer blocks creation');
 const invalid=await create('Unknown hint',{hostingSecrets:['not-a-secret','0'.repeat(32)]});check(invalid.r.type==='welcome','malformed and unknown hints confer no host identity');
 const auth=await client();auth.send({type:'profileCreate',login:'owner944',displayName:'Owner',color:PLAYER_COLORS[0],backupColor:PLAYER_COLORS[1],pin:'2468',pinConfirm:'2468'});const session=await auth.next('profileSession');
 check(typeof session.credential==='string','profile identity comes from authenticated native profile creation');
 const profile=await create('Profile',{visibility:'private',credential:session.credential});check(profile.r.type==='welcome','verified profile can host its first private table');
 const profileDupe=await create('Profile again',{credential:session.credential});check(profileDupe.r.type==='error'&&profileDupe.r.message==="You're already hosting a table.",'verified profile cannot evade cap through a different socket without a seat hint');
 const spoof=await create('Raw profile ID',{profileId:session.profile.profileId});check(spoof.r.type==='welcome','an unauthenticated raw profile ID grants no profile identity');
 console.log(`host-player-prove: ${checks} checks passed`);
}finally{clearTimeout(watchdog);for(const c of sockets)c.ws.terminate();host.kill();if(host.exitCode===null&&host.signalCode===null)await once(host,'exit');rmSync(dir,{recursive:true,force:true})}
