import { createServer } from "vite";
import { chromium } from "../../../scripts/proof-browser.mjs";
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
const out=process.env.LOBBY_LABEL_OUT || 'test-results/lobby1472-label';mkdirSync(out,{recursive:true});
const rooms=mkdtempSync(tmpdir()+'/emberisle1472-');
const host=spawn(process.execPath,['--import','./register.mjs','host.mjs'],{cwd:new URL('../../../server/', import.meta.url),env:{...process.env,PORT:'0',ROOMS_DIR:rooms,RESULTS_DIR:rooms+'/results'}});
let err='';host.stderr.on('data',d=>err+=d);
const port=await new Promise((resolve,reject)=>{host.stdout.on('data',d=>{const m=String(d).match(/listening (\d+)/);if(m)resolve(+m[1]);});host.on('exit',c=>reject(Error('host '+c+' '+err)));});
const vite=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await vite.listen();
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const rows=[];
try{
for(const [width,height,insets] of [[320,568],[667,375],[667,375,{left:47,right:47,top:0,bottom:21}],[844,390]]){
 const tag=`${width}x${height}${insets?'-insets':''}`;
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,reducedMotion:'reduce'});const page=await context.newPage();
 await context.addInitScript(()=>{localStorage.setItem('emberisle-name','Jarrod');localStorage.setItem('emberisle-jelly','lite');});
 if(insets)await(await context.newCDPSession(page)).send('Emulation.setSafeAreaInsetsOverride',{insets});
 await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/?host=ws://127.0.0.1:${port}`);await page.waitForFunction(()=>!!window.__emberisle);await page.evaluate(()=>window.__emberisle.getState().hostTable());await page.getByTestId('lobby-card').waitFor();await page.evaluate(()=>document.fonts.ready);
 const button=page.getByRole('button',{name:'How to play',exact:true});
 const measure=()=>button.evaluate(el=>{const b=el.getBoundingClientRect(),row=el.parentElement.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);const t=range.getBoundingClientRect();return{button:{left:b.left,right:b.right,width:b.width},row:{left:row.left,right:row.right,width:row.width},padding:[getComputedStyle(el).paddingLeft,getComputedStyle(el).paddingRight],lines:range.getClientRects().length,text:{left:t.left,right:t.right},fits:b.left>=row.left&&b.right<=row.right};});
 const before=await measure();await page.screenshot({path:`${out}/${tag}-current.png`});
 await button.evaluate(el=>el.style.paddingInline='8px');const padding8=await measure();await page.screenshot({path:`${out}/${tag}-padding8.png`});
 let narrowWrap=null; if(width<=700 && width>height){await button.evaluate(el=>Object.assign(el.style,{width:'76px',height:'44px',paddingBlock:'0',whiteSpace:'normal'})); narrowWrap=await measure(); await page.screenshot({path:`${out}/${tag}-narrow-wrap-option.png`});} rows.push({tag,before,padding8,narrowWrap});console.log(JSON.stringify(rows.at(-1)));await context.close();
}
writeFileSync(out+'/measurements.json',JSON.stringify(rows,null,2)+'\n');
}finally{await browser.close();await vite.close();host.kill();}
