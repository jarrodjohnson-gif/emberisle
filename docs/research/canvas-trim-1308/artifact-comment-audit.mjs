// Research only: estimates a built-artifact comment removal; never writes executable output.
import { parseAst } from 'vite';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const file = readdirSync('dist/assets').find(x => /^IslandCanvas-.*\.js$/.test(x));
const code = readFileSync(`dist/assets/${file}`, 'utf8');
const tree = parseAst(code);
const replacements=[];
function visit(node) {
 const value=node.type==='Literal'&&typeof node.value==='string'?node.value:node.type==='TemplateLiteral'&&node.expressions.length===0?node.quasis[0].value.cooked:null;
 if (node.type==='TemplateLiteral' && node.expressions.length && /\b(?:vec[234]|uniform|gl_Position|gl_FragColor|float)\b/.test(node.quasis.map(x=>x.value.cooked).join(' '))) {
  for(const q of node.quasis){const raw=code.slice(q.start,q.end);if(raw.includes('//')){const replacement=raw.replace(/\/\/[^\r\n]*/g,'');replacements.push({start:q.start,end:q.end,replacement,rawSaving:raw.length-replacement.length,preview:raw.slice(0,100)});}}
 }
 if (value && /\b(?:vec[234]|uniform|gl_Position|gl_FragColor|float)\b/.test(value) && /\/\//.test(value)) {
  const stripped=value.replace(/\/\/[^\r\n]*/g,'');
  const start=node.start,end=node.end;
  const quote=code[start];
  const replacement=quote==='`'?'`'+stripped.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$\{/g,'\\${')+'`':JSON.stringify(stripped);
  replacements.push({start,end,replacement,rawSaving:end-start-replacement.length,preview:value.slice(0,100)});
 }
 for (const child of Object.values(node)) { if (Array.isArray(child)) child.forEach(x=>{if(x&&typeof x.type==='string')visit(x)}); else if(child&&typeof child.type==='string') visit(child); }
}
visit(tree);
let candidate=code;
for(const r of replacements.toSorted((a,b)=>b.start-a.start))candidate=candidate.slice(0,r.start)+r.replacement+candidate.slice(r.end);
const appSources=['src/lib/scene/crystal-water.ts','src/lib/scene/isle-renderer.ts'].map(x=>readFileSync(x,'utf8'));
const appOnly=replacements.filter(r=>{const text=code.slice(r.start,r.end);const comments=text.match(/\/\/[^\r\n]*/g)||[];return comments.length&&comments.every(c=>appSources.some(s=>s.includes(c.trim())));});
let appCandidate=code;for(const r of appOnly.toSorted((a,b)=>b.start-a.start))appCandidate=appCandidate.slice(0,r.start)+r.replacement+appCandidate.slice(r.end);
const report={file,appOnlyGzip:gzipSync(appCandidate).length,appOnlySaving:gzipSync(code).length-gzipSync(appCandidate).length,appOnlyLiterals:appOnly.length,sourceBytes:Buffer.byteLength(code),sourceGzip:gzipSync(code).length,candidateBytes:Buffer.byteLength(candidate),candidateGzip:gzipSync(candidate).length,gzipSaving:gzipSync(code).length-gzipSync(candidate).length,note:'Read-only built-artifact estimates. appOnly matches comments to two application source files; all-literal estimate includes Three and is excluded. No source patch, buildable-source saving, or runtime validation.',literals:replacements.map(({replacement,...r})=>r)};
writeFileSync(process.argv[2]||'docs/research/canvas-trim-1308/comment-potential.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,literals:report.literals.length}));
