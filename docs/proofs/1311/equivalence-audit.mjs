// One-off review evidence for #1311; no permanent snapshot or CI registration.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseAst, transformWithOxc } from 'vite';
const base=process.argv[2]||'f111d0dff424f70a4e8ac101a8c2710240987fb2';
const files=['src/lib/scene/crystal-water.ts','src/lib/scene/isle-renderer.ts'];
const ignored=new Set(['start','end','loc','raw']);
let shaders=0;
function tokens(value){
 const pieces=value.match(/\/\/[^\r\n]*|[ \t\f\v]+|\r\n|[\r\n]|[A-Za-z_]\w*|(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?[uUfF]?|<<|>>|==|!=|<=|>=|&&|\|\||\+\+|--|[^\s]/g)||[];
 return pieces.filter(x=>!x.startsWith('//')&&!/^[ \t\f\v]+$/.test(x));
}
function normalize(node){
 if(Array.isArray(node))return node.map(normalize);
 if(!node||typeof node!=='object')return node;
 if(node.type==='TemplateLiteral'&&/\b(?:vec[234]|uniform|gl_Position|gl_FragColor|float)\b/.test(node.quasis.map(x=>x.value.cooked).join(' '))){
  shaders++;
  return{type:node.type,quasis:node.quasis.map(x=>({tail:x.tail,tokens:tokens(x.value.cooked)})),expressions:node.expressions.map(normalize)};
 }
 return Object.fromEntries(Object.entries(node).filter(([k])=>!ignored.has(k)).map(([k,v])=>[k,normalize(v)]));
}
async function signature(source,file){
 const js=await transformWithOxc(source,file,{target:'esnext'});
 return normalize(parseAst(js.code));
}
const originals=new Map(),changed=new Map();
for(const file of files){
 const old=execFileSync('git',['show',`${base}:${file}`],{encoding:'utf8'}),next=readFileSync(file,'utf8');
 originals.set(file,old);changed.set(file,next);
 assert.deepEqual(await signature(next,file),await signature(old,file));
 console.log(`PASS ${file}: complete compiled-JavaScript AST equal, except GLSL comment text; shader token/newline streams and interpolation ASTs equal`);
}
const file=files[0],source=changed.get(file),original=await signature(originals.get(file),file);
const fixtures=[
 ['numeric GLSL token','float near = 8.0','float near = 8.1'],
 ['shader newline','uniform float uSplashNow;\n','uniform float uSplashNow;'],
 ['preprocessor directive','#include <color_fragment>','#include <different_fragment>'],
 ['JavaScript interpolation','${SPLASH.max}','${SPLASH.max + 1}'],
];
for(const [name,from,to]of fixtures){
 assert.ok(source.includes(from),`fixture precondition: ${name}`);
 const bad=source.replace(from,to);
 let rejected=false;try{assert.deepEqual(await signature(bad,file),original)}catch{rejected=true}
 assert.ok(rejected,`negative fixture must reject ${name}`);
 console.log(`PASS negative fixture rejects changed ${name}`);
}
console.log(`PASS exact non-comment JavaScript, shader tokens/newlines/directives and interpolation audit; ${files.length} files; ${fixtures.length} negative fixtures; ${shaders} shader-template visits across comparisons`);
