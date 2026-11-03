import {createServer} from 'vite';
import {chromium} from 'playwright';
const vite=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error',plugins:[{name:'audio-diagnostic',configureServer(server){server.middlewares.use('/__audio',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><button>Sound</button><script type="module">window.sound=await import("/src/lib/sound.ts")</script>');});}}]});
let browser;
try{
 await vite.listen();browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage();
 await page.addInitScript(()=>{window.audios=[];window.results=[];const NativeAudio=window.Audio;window.Audio=function(...args){const a=new NativeAudio(...args);window.audios.push(a);const play=a.play.bind(a);a.play=function(){const p=play();p?.then(()=>window.results.push('resolved'),e=>window.results.push(e.name));return p;};return a;};});
 await page.route('**/audio/drop_001.wav',route=>route.abort('failed'));
 await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/__audio`);await page.waitForFunction(()=>window.sound);await page.keyboard.press('Shift');
 await page.evaluate(()=>window.sound.play('dice_land'));await page.waitForFunction(()=>window.results.length);
 console.log('FIRST',await page.evaluate(()=>({results:window.results,audios:window.audios.map(a=>({src:a.src,error:a.error?.code,paused:a.paused,readyState:a.readyState}))})));
 await page.unroute('**/audio/drop_001.wav');await page.waitForTimeout(200);await page.evaluate(()=>window.sound.play('dice_land'));await page.waitForTimeout(500);
 console.log('RETRY',await page.evaluate(()=>({results:window.results,audios:window.audios.map(a=>({src:a.src,error:a.error?.code,paused:a.paused,readyState:a.readyState,time:a.currentTime}))})));
}finally{await browser?.close();await vite.close();}
