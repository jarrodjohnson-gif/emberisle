import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('scripts/hotseat-prove.mjs','utf8');
const prefix='  await page.addInitScript(';
const start=source.indexOf(prefix), end=source.indexOf('\n  await page.goto',start);
const hook=source.slice(start+prefix.length,end).trim().slice(0,-2);
const timers=[], listeners=new Map();let handle=100, clocks=0, nativePlays=0, armFailure=null;
const returned=Symbol('native play result');
class Media {play(){nativePlays++;return returned;}}
const window={setTimeout:function(callback,ms,...args){if(armFailure)throw armFailure;const id=++handle;timers.push({callback,ms,args,receiver:this,id});return id;}};
const document={addEventListener(kind,callback,options){listeners.set(kind,{callback,options});}};
vm.runInNewContext('('+hook+')()',{window,document,performance:{now:()=>++clocks},HTMLMediaElement:Media,URL,Error});
assert.equal(listeners.size,5);
assert.ok([...listeners.values()].every(x=>x.options.capture&&x.options.passive));
const calls=[];function pump(...args){calls.push({receiver:this,args});}
const caller={name:'registration receiver'}, fired={name:'callback receiver'}, payload={test:1};
const first=window.setTimeout.call(caller,pump,150,'first',payload);
assert.equal(first,timers[0].id);assert.equal(timers[0].ms,150);assert.equal(timers[0].receiver,caller);
assert.equal(window.__pendingPumps,1);
timers[0].callback.call(fired,...timers[0].args);
assert.equal(window.__pendingPumps,0);
const second=window.setTimeout.call(caller,pump,150,'second',payload);
assert.equal(second,timers[1].id);assert.equal(timers[1].ms,150);assert.equal(timers[1].receiver,caller);
assert.equal(timers[1].callback,timers[0].callback,'same wrapper reused across re-arms');
assert.equal(window.__pendingPumps,1);
timers[1].callback.call(fired,...timers[1].args);
assert.equal(window.__pendingPumps,0);
assert.equal(calls.length,2);assert.ok(calls.every(x=>x.receiver===fired&&x.args[1]===payload));
assert.deepEqual(calls.map(x=>x.args[0]),['first','second']);assert.equal(timers.length,2);
const ordinary=function ordinary(){};const passthrough=window.setTimeout.call(caller,ordinary,42,payload);
assert.equal(passthrough,timers[2].id);assert.equal(timers[2].callback,ordinary);assert.equal(timers[2].ms,42);assert.equal(timers[2].args[0],payload);assert.equal(timers[2].receiver,caller);
const sound=new Media();sound.src='https://example.test/audio/click_001.wav';assert.equal(sound.play(),returned);
assert.equal(clocks,5,'one clock per audio, schedule and fire');assert.equal(window.__leaveTrace.length,5);
assert.ok(window.__leaveTrace.every(x=>!('stack'in x)));
const music=new Media();music.src='https://example.test/audio/old_tower_inn_loop.mp3';assert.equal(music.play(),returned);
assert.equal(nativePlays,2);assert.equal(window.__leaveTrace.length,5,'existing background-music exclusion unchanged');
const result={nativeTimerRegistrations:timers.length,nonPumpIdentityPreserved:true,stableWrapper:true,delayAndHandleDelegated:true,receiverAndArgsDelegated:true,clockReadsForTwoPumpCyclesAndOneSound:clocks,traceRecords:window.__leaveTrace.length,audioAndPumpStacks:0,nativePlayResultPreserved:true};
writeFileSync('/tmp/issue1093-delegation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));

// Synchronous re-arms never expose an empty boundary, including callback failures.
const pending=[];let cycle=0;
function rearm(){pending.push(window.__pendingPumps);if(!cycle++){window.setTimeout(rearmPump,150);pending.push(window.__pendingPumps);}}
const rearmPump=Object.defineProperty(rearm,'name',{value:'pump'});
window.setTimeout(rearmPump,150);const armed=timers.at(-1);
armed.callback.call(fired,...armed.args);assert.equal(window.__pendingPumps,1);
const rearmed=timers.at(-1);rearmed.callback.call(fired,...rearmed.args);
assert.equal(window.__pendingPumps,0);assert.deepEqual(pending,[1,2,1]);
const thrown=new Error('controlled callback throw');
const badPump=Object.defineProperty(function(){assert.equal(window.__pendingPumps,1);throw thrown;},'name',{value:'pump'});
window.setTimeout(badPump,150);assert.throws(()=>timers.at(-1).callback(),e=>e===thrown);
assert.equal(window.__pendingPumps,0);
console.log('PASS: pending count spans real delegated callback/re-arm and clears on callback throw; all original delegation contracts retained.');

armFailure=new Error('controlled native registration throw');
assert.throws(()=>window.setTimeout(badPump,150),e=>e===armFailure);
assert.equal(window.__pendingPumps,0);
Object.assign(result,{pendingSpansSynchronousRearm:true,callbackThrowClearsPending:true,nativeRegistrationThrowRollsBackPending:true});
writeFileSync('/tmp/issue1093-delegation.json',JSON.stringify(result,null,2)+'\n');
console.log('PASS: failed native registration rolls back pending count and preserves the thrown error.');
