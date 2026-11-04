# Profile writer-lock publication race

Research #1020, Codex-open-table-833 (GPT-6.1 Sol), 2026-10-22. Observed on main `fdf5773161ddee6fd8277355d0ad89d5eacd9b25`. Follow-up bug: #1021; runtime implementation waits for orchestrator confirmation.

Two processes can open the same private profile store as writable. A normal second opener is refused, but publication of the lock owner is vulnerable to a scheduler interleaving. `takeLock` exclusively creates `writer.lock` and then writes its PID. Between those operations another process can read the empty file, remove it as an invalid lock, and take ownership. The first process then writes its PID into an unlinked descriptor and also returns ready.

Both stores hold independent snapshots. A real durable mutation from the second store overwrites the first store's update. The reproduction uses temporary unknown-login guards to demonstrate data loss without printing credentials or changing production data.

## Reproduce

Run from the repository root with Node 22 or newer on a POSIX filesystem. This is a diagnostic for the existing bug, not a passing correctness proof. Its assertions require the bad interleaving; #1021 must introduce a regression proof that requires exclusion instead.

The observer pauses only process A, after a successful native exclusive open but before returning its actual descriptor to the PID writer. The filesystem operations, store and mutations remain real. This represents a process being descheduled at that boundary. The control has no pause. Temporary stores and child processes are cleaned up.

```sh
cat > /tmp/emberisle-lock-race-1020.mjs <<'JS'
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const [role,dir,modulePath]=process.argv.slice(2);
if(role && role!=='control'){
  if(role==='a'){
    const open=fs.openSync;
    fs.openSync=function(name,flags,...rest){
      const fd=open.call(this,name,flags,...rest);
      if(path.basename(String(name))==='writer.lock'&&flags==='wx'){
        process.send({type:'opened'});
        const deadline=Date.now()+15000;
        while(!fs.existsSync(path.join(dir,'release-a'))){
          if(Date.now()>deadline)throw Error('release timeout');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);
        }
      }
      return fd;
    };
    syncBuiltinESMExports();
  }
  const {openProfiles}=await import(pathToFileURL(modulePath));
  const store=openProfiles(dir,{colors:[]});
  process.send({type:'ready',ready:store.ready,reason:store.reason,pid:process.pid});
  process.on('message',async(msg)=>{
    if(msg==='write'){
      await store.mutate(d=>{d.unknownLogins['writer-'+role]={times:[Date.now()],pending:{},lifetime:0};});
      process.send({type:'wrote'});
    }
  });
}else{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'emberisle-lock-race-'));
  const children=[];
  const target=process.env.EMBERISLE_PROFILES_MODULE??path.resolve('server/profiles.mjs');
  const child=(who)=>{
    const c=spawn(process.execPath,[process.argv[1],who,root,target],{stdio:['ignore','ignore','pipe','ipc']});
    children.push(c);const inbox=[];let errors='';c.on('message',m=>inbox.push(m));c.stderr.on('data',b=>errors+=b);
    return {c,next:async(type)=>{const end=Date.now()+15000;for(;;){const i=inbox.findIndex(m=>m.type===type);if(i>=0)return inbox.splice(i,1)[0];if(Date.now()>end||c.exitCode!==null)throw Error(type+' timeout '+errors);await new Promise(r=>setTimeout(r,5));}}};
  };
  try{
    if(role==='control'){
      const first=child('b');const ar=await first.next('ready');
      const second=child('c');const br=await second.next('ready');
      console.log(JSON.stringify({controlFirstReady:ar.ready,controlSecondReady:br.ready,secondReason:br.reason}));
      assert.equal(ar.ready,true);assert.equal(br.ready,false);assert.equal(br.reason,'locked');
    }else{
    const a=child('a');await a.next('opened');
    assert.equal(fs.readFileSync(path.join(root,'writer.lock'),'utf8'),'');
    const b=child('b');const br=await b.next('ready');
    fs.writeFileSync(path.join(root,'release-a'),'go');const ar=await a.next('ready');
    console.log(JSON.stringify({aReady:ar.ready,bReady:br.ready,lockNamesB:fs.readFileSync(path.join(root,'writer.lock'),'utf8')===String(br.pid)}));
    assert.equal(ar.ready,true);assert.equal(br.ready,true);
    a.c.send('write');await a.next('wrote');
    const first=JSON.parse(fs.readFileSync(path.join(root,'profiles.json'),'utf8'));
    b.c.send('write');await b.next('wrote');
    const second=JSON.parse(fs.readFileSync(path.join(root,'profiles.json'),'utf8'));
    console.log(JSON.stringify({afterA:Object.keys(first.unknownLogins),afterB:Object.keys(second.unknownLogins),lostA:!Object.hasOwn(second.unknownLogins,'writer-a')}));
    assert.ok(Object.hasOwn(first.unknownLogins,'writer-a'));assert.ok(!Object.hasOwn(second.unknownLogins,'writer-a'));assert.ok(Object.hasOwn(second.unknownLogins,'writer-b'));
    }
  }finally{
    await Promise.all(children.map(c=>new Promise(resolve=>{if(c.exitCode!==null||c.signalCode!==null)return resolve();c.once('exit',resolve);c.kill('SIGKILL');})));
    fs.rmSync(root,{recursive:true,force:true});
  }
}
JS
node /tmp/emberisle-lock-race-1020.mjs control
node /tmp/emberisle-lock-race-1020.mjs
```

Observed output, with both commands exiting zero:

```json
{"controlFirstReady":true,"controlSecondReady":false,"secondReason":"locked"}
{"aReady":true,"bReady":true,"lockNamesB":true}
{"afterA":["writer-a"],"afterB":["writer-b"],"lostA":true}
```

## Fix boundary

The contract in `docs/design/profiles.md` permits one host writer and recovery after a dead owner. A fix must preserve both. A contender must not remove an in-progress or live owner's lock. Review stale-lock reclamation contention too; this diagnostic establishes the initial-publication bug only.

The existing auth proof's sequential second-host refusal remains useful. It cannot detect this interleaving because the first owner has already published its PID. Keep that assertion, the killed-owner takeover and durable write-failure fencing. Add a registered real-process regression for #1021 after the orchestrator confirms its scope. No production changes are part of this research.
