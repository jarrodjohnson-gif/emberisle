// Research instrumentation; leaves tracked application files untouched.
import { build } from 'vite';
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const output=process.argv[2]||'docs/research/canvas-trim-1308/bundle.json';
let moduleRows=[];
await build({ plugins: [{ name: 'read-only-canvas-audit', generateBundle(_options,bundle) {
 const canvas=Object.values(bundle).find(x=>x.type==='chunk'&&x.name==='IslandCanvas');
 if(!canvas)throw new Error('IslandCanvas missing');
 moduleRows=Object.entries(canvas.modules).map(([id,m])=>({id:id.includes('/node_modules/')?'node_modules/'+id.split('/node_modules/')[1]:id.replace(process.cwd()+'/',''),renderedLength:m.renderedLength})).sort((a,b)=>b.renderedLength-a.renderedLength);
}}] });
const chunks=readdirSync('dist/assets').filter(x=>x.endsWith('.js')).map(file=>{const bytes=readFileSync('dist/assets/'+file);return{file,bytes:bytes.length,gzip:gzipSync(bytes).length}});
writeFileSync(output,JSON.stringify({note:'Chunk gzip reads final files after build. Module renderedLength is pre-minification attribution, not marginal gzip savings.',chunks,canvasModules:moduleRows},null,2)+'\n');
console.log(JSON.stringify(chunks.find(x=>x.file.startsWith('IslandCanvas-'))));
