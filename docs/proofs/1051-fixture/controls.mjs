import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {createServer}=await import(pathToFileURL(path.resolve('node_modules/vite/dist/node/index.js')));
const vite=await createServer({server:{middlewareMode:true},logLevel:'error'});
const source=readFileSync('scripts/longest-army-prove.mjs','utf8');
const fixture=source.slice(source.indexOf('  const act ='),source.indexOf('  for (const v of VIEWS)'));
const {createGame}=await vite.ssrLoadModule('/src/lib/game/board.ts');
const {applyAction,legalRoads,legalSettle,roadLength}=await vite.ssrLoadModule('/src/lib/game/rules.ts');
const compile=text=>new Function('createGame','applyAction','legalRoads','legalSettle','roadLength','assert',text+'\nreturn steps;');
const native=crypto.getRandomValues, descriptor=Object.getOwnPropertyDescriptor(crypto,'getRandomValues');
const restored=()=>{assert.equal(crypto.getRandomValues,native);assert.deepEqual(Object.getOwnPropertyDescriptor(crypto,'getRandomValues'),descriptor);};
const results=[];
try{
 const run=(text,action=applyAction)=>{
  let deals=0,rolls=0;
  const build=compile(text);
  const states=build(opts=>{deals++;return createGame(opts);},(state,pid,actionValue)=>{if(state.phase==='rollOff')rolls++;return action(state,pid,actionValue);},legalRoads,legalSettle,roadLength,assert);
  return {states,deals,rolls};
 };
 const good=run(fixture);restored();assert.equal(good.deals,1);assert.equal(good.rolls,4);assert.equal(good.states.length,9);
 for(const state of good.states){assert.equal(state.st.seed,1);assert.deepEqual(state.st.players.map(p=>p.id),['p0','p2','p3','p1']);assert.equal(state.st.longestRoad,state.path);assert.equal(state.st.largestArmy,state.army);}
 assert.deepEqual(good.states[0].st.rollOff.rolls,{p0:6,p1:3,p2:5,p3:4});
 const repeated=run(fixture);restored();assert.deepEqual(repeated.states,good.states,'all nine real-rule states reproduce byte-for-byte in value');
 results.push({case:'normal',deals:good.deals,rollOffActions:good.rolls,seed:1,order:good.states[0].st.players.map(p=>p.id),states:good.states.length,holderChecks:18,repeatedStatesEqual:true,functionAndDescriptorRestored:true,holders:good.states.map(s=>({name:s.name,path:s.st.longestRoad,army:s.st.largestArmy}))});
 const bad=fixture.replace('const fixtureRolls = [5, 2, 4, 3];','const fixtureRolls = [5, 4, 3, 2];');assert.notEqual(bad,fixture);
 let deals=0,error;
 try{compile(bad)(opts=>{deals++;return createGame(opts);},applyAction,legalRoads,legalSettle,roadLength,assert);}catch(e){error=e;}
 restored();assert.match(String(error),/the rules built every scenario on some island/);assert.equal(deals,59);
 results.push({case:'unusable-order',order:['p0','p1','p2','p3'],deals,originalGuardFailure:true,functionAndDescriptorRestored:true,error:String(error).split('\n')[0]});
 let actions=0;
 error=undefined;
 try{run(fixture,(...args)=>{const r=applyAction(...args);if(++actions===2)throw new Error('controlled failure after two real roll-off actions');return r;});}catch(e){error=e;}
 restored();assert.match(String(error),/controlled failure after two real roll-off actions/);assert.equal(actions,2);
 results.push({case:'throw-after-entropy-used',realRollOffActions:actions,functionAndDescriptorRestored:true,error:String(error)});
 writeFileSync('/tmp/issue1051-controls.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
}finally{restored();await vite.close();}
