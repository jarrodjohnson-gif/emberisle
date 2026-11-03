import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const file='src/components/game/OpenTables.tsx';
function extract(source){const a=source.indexOf('function hostExpected()');const start=source.indexOf('{',a)+1;const end=source.indexOf('\n}',start);assert.ok(a>=0&&end>start);return new Function('location','env',source.slice(start,end).replaceAll('import.meta.env.','env.'));}
const before=extract(execFileSync('git',['show','28b1686:'+file],{encoding:'utf8'})),after=extract(readFileSync(file,'utf8'));
let cases=0;
for(const DEV of [true,false])for(const BASE_URL of ['/','/emberisle/','/renamed/'])for(const hostname of ['localhost','owner.github.io','game.example'])for(const search of ['', '?other=x','?host=','?host=ws://rules.example']){
 const location={hostname,search};assert.equal(after(location,{DEV,BASE_URL}),before(location,{DEV,BASE_URL}));cases++;
}
assert.equal(after({hostname:'owner.github.io',search:''},{DEV:false,BASE_URL:'/renamed/'}),false);
assert.equal(after({hostname:'localhost',search:''},{DEV:true,BASE_URL:'/'}),false);
assert.equal(after({hostname:'owner.github.io',search:'?host='},{DEV:false,BASE_URL:'/renamed/'}),true);
console.log(JSON.stringify({cases,allMatchPublishedHostGate:true,staticNoAutomaticDial:true,devNoAutomaticDial:true,explicitHostOptInRetained:true}));
