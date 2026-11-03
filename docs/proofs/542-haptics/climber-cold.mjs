import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {chromium}=await import(pathToFileURL(path.resolve('node_modules/playwright/index.mjs')));
const {createServer}=await import(pathToFileURL(path.resolve('node_modules/vite/dist/node/index.js')));
const extract=(text)=>text.slice(text.indexOf('const seedHotseat ='),text.indexOf('// Record inside the first natural update'));
const old=extract(execFileSync('git',['show','2f96e94:scripts/climber-prove.mjs'],{encoding:'utf8'}));
const current=extract(readFileSync('scripts/climber-prove.mjs','utf8'));
assert.ok(old.includes('store.getState()') && current.includes('page.waitForFunction'));
const vite=await createServer({server:{host:'127.0.0.1',port:8472,strictPort:true},logLevel:'error'});await vite.listen();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results=[];
async function bounded(p){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('cold control did not progress')),30000);})]);}finally{clearTimeout(timer);}}
try{
 for(const [kind,definition] of [['old',old],['new',current]]){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage();
  await page.addInitScript(()=>Object.defineProperty(navigator,'vibrate',{configurable:true,value:()=>true}));
  let release,seen;const held=new Promise(resolve=>{release=resolve;});const request=new Promise(resolve=>{seen=resolve;});
  await page.route(/\/src\/lib\/haptics\.tsx(?:\?|$)/,async route=>{seen();await held;await route.continue();});
  try{
   await page.goto('http://127.0.0.1:8472/',{waitUntil:'domcontentloaded'});await bounded(request);
   assert.equal(await page.evaluate(()=>!!window.__emberisle),false,'bootstrap remains held before store publication');
   const seedHotseat=new Function('page',definition+'\nreturn seedHotseat;')(page);
   if(kind==='old'){
    let error;try{await seedHotseat();}catch(e){error=e;}
    assert.match(String(error),/Cannot read properties of undefined.*getState/s);
    results.push({case:kind,expectedFailure:true,error:String(error).split('\n')[0]});
    release();await page.waitForFunction(()=>!!window.__emberisle);
   }else{
    let finished=false;const seeded=seedHotseat().then(()=>{finished=true;});
    await page.waitForTimeout(250);assert.equal(finished,false,'fixture must wait for the actual store');
    release();await seeded;
    await page.evaluate(()=>{window.__randomBeforeSeed=Math.random;});
    await page.getByRole('button',{name:'Four seats, one table',exact:true}).click();
    const got=await page.evaluate(()=>({seed:window.__emberisle.getState().state.seed,randomRestored:Math.random===window.__randomBeforeSeed}));
    assert.equal(got.seed,676);assert.equal(got.randomRestored,true);results.push({case:kind,waitedBeforeRelease:true,...got});
   }
  }finally{release();await context.close();}
 }
 writeFileSync('/tmp/pr844-climber-cold.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser.close();await vite.close();}
