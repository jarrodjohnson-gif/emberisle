import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const {createServer}=await import(pathToFileURL(path.resolve('node_modules/vite/dist/node/index.js')));
const vite=await createServer({server:{middlewareMode:true},logLevel:'error'});
const source=execFileSync('git',['show','672a54f:scripts/longest-army-prove.mjs'],{encoding:'utf8'});
const fixture=source.slice(source.indexOf('  const act ='),source.indexOf('  for (const v of VIEWS)'));
const {createGame}=await vite.ssrLoadModule('/src/lib/game/board.ts');
const {applyAction,legalRoads,legalSettle,roadLength}=await vite.ssrLoadModule('/src/lib/game/rules.ts');
const build=new Function('createGame','applyAction','legalRoads','legalSettle','roadLength','assert',fixture+'\nreturn steps;');
const native=crypto.getRandomValues, descriptor=Object.getOwnPropertyDescriptor(crypto,'getRandomValues');
let draws=0,deals=0,error;
try{
 Object.defineProperty(crypto,'getRandomValues',{configurable:true,writable:true,value:array=>{array[0]=[5,4,3,2][draws++%4];return array;}});
 try{build(opts=>{deals++;return createGame(opts);},applyAction,legalRoads,legalSettle,roadLength,assert);}catch(e){error=e;}
 assert.match(String(error),/the rules built every scenario on some island/);
 assert.equal(deals,59);assert.equal(draws,236);
}finally{if(descriptor)Object.defineProperty(crypto,'getRandomValues',descriptor);else delete crypto.getRandomValues;await vite.close();}
assert.equal(crypto.getRandomValues,native);assert.deepEqual(Object.getOwnPropertyDescriptor(crypto,'getRandomValues'),descriptor);
const result={oldFixture:true,controlledOrder:['p0','p1','p2','p3'],deals,rollOffDraws:draws,originalGuardFailure:String(error).split('\n')[0],nativeFunctionRestored:true,nativeDescriptorRestored:true};
writeFileSync('/tmp/issue1051-old-order.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
