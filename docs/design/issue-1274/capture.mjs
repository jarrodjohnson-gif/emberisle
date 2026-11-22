// Proposal measurement; this does not exercise the production UI.
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here=dirname(fileURLToPath(import.meta.url));
const outputDir=process.env.ISSUE_1274_OUTPUT_DIR || join(process.cwd(),'test-results/issue-1274-proposal');
await mkdir(outputDir,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
try {
const page=await browser.newPage({viewport:{width:1400,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.setContent(await readFile(join(here,'index.html'),'utf8'));
const samples=[];
for(const safe of ['0','34']) {
await page.selectOption('#safe',safe);
let baseline;
for(const phase of await page.locator('#phase option').evaluateAll(x=>x.map(o=>o.value))) {
await page.selectOption('#phase',phase);
const rects=await page.locator('.frame').evaluateAll(fs=>fs.map(f=>{const r=f.getBoundingClientRect();const box=e=>{const b=e.getBoundingClientRect();return [b.x-r.x,b.y-r.y,b.width,b.height]};return {kind:f.dataset.kind,dock:box(f.querySelector('.dock')),slots:[...f.querySelectorAll('.hand,.turn,.builds > .mock-control,.actions .mock-control,.meta')].map(box),overflow:[...f.querySelectorAll('.dock,.card,.mock-control')].some(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1)}}));
if(!baseline)baseline=JSON.stringify(rects);else if(JSON.stringify(rects)!==baseline)throw Error(`geometry differs: ${safe}/${phase}`);
if(rects.some(r=>r.overflow))throw Error(`content overflow: ${safe}/${phase}`);
samples.push({safe,phase,rects});
}
}
await page.selectOption('#safe','0');await page.selectOption('#phase','main');
for(const kind of ['portrait','landscape','small','desktop'])await page.locator(`[data-kind=${kind}]`).screenshot({path:join(outputDir,`${kind}.png`)});
await writeFile(join(outputDir,'measurements.json'),JSON.stringify({errors,samples},null,2));
if(errors.length)throw Error(`page errors: ${errors.join('; ')}`);
console.log(`Proposal only: ${samples.length} phase/safe-area combinations × 4 frames; fixed slot rectangles and no content overflow; ${errors.length} page errors; four PNGs.`);
} finally {await browser.close()}
