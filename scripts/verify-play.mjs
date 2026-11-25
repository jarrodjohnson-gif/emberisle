// #1883: actual production practice actions; no state injection, sleeps or retries.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { preview } from 'vite';
import { chromium } from './proof-browser.mjs';
const start = performance.now(), errors = [], shots = mkdtempSync(path.join(tmpdir(), 'emberisle-verify-'));
const server = await preview({ preview: {host:'127.0.0.1',port:0,strictPort:false},logLevel:'error' });
let browser, step='boot', index=0;
const limit=setTimeout(()=>{console.error(`verify-play: FAIL ${step}: 90s total limit`);process.exitCode=1;void browser?.close();void server.close();},90000);
try {
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:440,height:956},hasTouch:true,reducedMotion:'reduce'});
 page.setDefaultTimeout(12000);
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(e.message));
 const snap=async name=>{assert.deepEqual(errors,[],`${step}: browser errors`);const file=path.join(shots,`${++index}-${name}.png`);await page.screenshot({path:file});console.log(`verify-play: ${name} ${file}`);};
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
 await page.waitForFunction(()=>window.__emberisle);await snap('title');step='start practice';
 const play=page.getByRole('button',{name:'Play',exact:true});if(await play.count())await play.click();
 await page.getByRole('button',{name:'Play with bots',exact:true}).click();
 await page.waitForFunction(()=>window.__emberisle.getState().mode==='ai'&&window.__emberisle.getState().state);await snap('practice');
 let placed=0,rolled=false,ended=false,next=false,turn;
 for(let actions=0;actions<30;actions++){
  step=ended?'next player':'own action';
  await page.waitForFunction(({ended,turn})=>{const s=window.__emberisle.getState(),g=s.state;return ended?g.turn>turn||g.current!==s.localId:g.current===s.localId||(g.discardNeeded?.[s.localId]??0)>0;},{ended,turn},{timeout:20000});
  if(ended){await snap('next-player');next=true;break;}
  const before=await page.evaluate(()=>{const g=window.__emberisle.getState().state;return {seq:g.seq,phase:g.phase,turn:g.turn};});step=before.phase;
  if(['roll','rollOff'].includes(before.phase)){await page.getByRole('button',{name:'Roll',exact:true}).click();if(before.phase==='roll')rolled=true;}
  else if(before.phase==='main'){assert.ok(rolled);turn=before.turn;await page.getByRole('button',{name:'End turn',exact:true}).click();ended=true;}
  else {
   await page.evaluate(()=>{const s=window.__emberisle.getState(),g=s.state,me=s.localId;
    if(g.phase==='setupSettle')s.pickVertex(s.highlights().vertices[0]);
    else if(g.phase==='setupRoad')s.pickEdge(s.highlights().edges[0]);
    else if(g.phase==='discard'){let left=g.discardNeeded[me];const resources={};for(const [r,n]of Object.entries(g.players.find(p=>p.id===me).resources)){const take=Math.min(left,n);resources[r]=take;left-=take;}s.dispatch({type:'discard',resources});}
    else if(g.phase==='robber'){s.pickHex(s.highlights().hexes[0]);const p=window.__emberisle.getState().pendingSteal;if(p)s.dispatch({type:p.kind,hexId:p.hexId,stealFrom:p.targets[0]});}
    else throw Error(`unexpected phase ${g.phase}`);
   });if(before.phase.startsWith('setup'))placed++;
  }
  await page.waitForFunction(seq=>window.__emberisle.getState().state.seq>seq,before.seq);await snap(before.phase);
 }
 assert.equal(placed,4,'two outposts and two paths');assert.ok(rolled&&ended&&next,'roll, end and next player');assert.deepEqual(errors,[]);
 console.log(`verify-play: PASS ${((performance.now()-start)/1000).toFixed(1)}s; screenshots ${shots}`);
}catch(e){console.error(`verify-play: FAIL ${step}: ${e.stack}`);process.exitCode=1;}
finally{clearTimeout(limit);await browser?.close();await server.close();}
