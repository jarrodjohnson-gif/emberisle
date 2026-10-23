# Wayfarer setup control bounds

#1058 diagnoses the non-chat failure in #1053. The failing control is the desktop **Muster** button at **1280×720**. The failed size/bounds conjunct and root cause remain unknown. No runtime or proof change is justified by the available measurements.

## Recorded failures

| Source | Revision | Evidence |
| --- | --- | --- |
| [Main soak 39967858375](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/39967858375) | `30737a5c81f194b1c6235c1409555ee8e6cb19bd` | flows-b, fifth internal iteration; wayfarer-setup failed 1/5 |
| [PR #934 CI 39938016583](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/39938016583/job/120362440462) | `ac67f848c86e03e4d3708ca2e376a2980c9fdb27` | same assertion, after the390×844 case passed |

Both fail [wayfarer-setup-prove.mjs:73](../../scripts/wayfarer-setup-prove.mjs) at the unchanged assertion:

```js
assert.ok(b.width>=44&&b.height>=44&&b.y>=0&&b.y+b.height<=height);
```

The viewport loop is 390×844,1280×720,844×390. Both logs finish 390×844 before this failure; therefore the failing iteration is 1280×720. The locator is `fortune-play-knight`, whose Off-mode label is Muster. The soak workflow has one GitHub run attempt; “run5” means its internal fifth proof iteration.

Recovered artifact `soak-browser-b-flows-b`, id12514118412, SHA256 `fc2f3a6196e1a86020e43bb668cf23f991c6c22725eeea9ca41e2d09e0e66593`, contains the complete failed output. It reports neither `b` nor which conjunct failed. The failed-run evidence directory contains the six setup-choice images and the preceding 390px Muster image, but no failing 1280px image: that screenshot is taken after the assertion. The ZIP's top-level 1280px image is not in the failed iteration's evidence directory and cannot establish its geometry.

## Source boundaries

The local main revision was `c33016a6e7a72ca8a7edbdb0a5986700dbd392b2`. The proof, FortuneTray, Hud, shared Button, styles and focus-trap files are byte-identical between that revision and both failure revisions. Proof SHA256: `2526f0e16d5654d3bd2f3a142234416035b8d5029c6d56a810a8f226847681d1`.

- [FortuneTray.tsx](../../src/components/game/FortuneTray.tsx) renders the target with `h-11 min-w-16`. Its root is a bottom-anchored scrollable dialog with `.hand-in`.
- [styles.css](../../src/styles.css) animates `.hand-in` with opacity and translateY(8px)→0 over 220ms. It does not scale the tray. Reduced motion disables animations/transitions. The proof requests reduced motion for both touch viewports and normal motion for desktop.
- The proof's `waitFor()` checks visibility. Its subsequent text reads and `boundingBox()` do not explicitly wait for animation completion.
- [Hud.tsx](../../src/components/game/Hud.tsx) mounts the tray outside its scrolling stack. The stack is a sibling, not an ancestor. [EmberisleApp.tsx](../../src/components/game/EmberisleApp.tsx) and the normal recovery boundary add no play-entry scale around Hud; renderer/camera transforms belong to the canvas.
- [focus-trap.ts](../../src/lib/focus-trap.ts) focuses Close in a passive effect without `preventScroll`. This permits native focus scrolling in principle, but no recorded failing rectangle attributes this failure to it.
- [button.tsx](../../src/components/ui/button.tsx) has a 0.97 active press scale. Muster is measured before its click; clicking the separate Fortunes opener does not demonstrate that Muster is active.

[Polish](../design/polish.md) retains 44px targets and normal motion. [Wayfarer modes](../design/wayfarer-modes.md) retains the targetless Muster behavior, contrast and safe-area checks. Neither contract authorizes a smaller target, an epsilon, disabled motion or an extra wait to conceal the failure.

## Local measurements

All browser runs were serial, on an npm-installed fresh main clone. The unchanged registered proof passed once normally, then passed with a read-only bounding-box wrapper and CDP CPU throttling 2. This does not reproduce the failed CI sample or establish a failure rate.

The wrapper returns Playwright's original box unchanged, then reads CSS and animation state. The native box has already been captured before diagnostic reads add time.

| Viewport | x | y | width | height | bottom | Motion at subsequent read |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
|390×844|279.203125|763|78.796875|44|807|reduced; no animation|
|1280×720|629.203125|644|78.796875|44|688|hand-in finished at 220ms|
|844×390|173.203125|301|78.796875|44|345|reduced; no animation|

A separate native-layout experiment mounted the real FortuneTray, real shared Button and real createGame state in an isolated 720px bottom-anchored host at 1280×720. Twelve mounts sampled fourteen native frames each: **168 samples, zero bounds failures**, including 109 samples with the tray animation running. Minimum target height 44px; minimum width 78.796875px; minimum y 644px; maximum bottom 696px. This tests the tray entrance alone, not the complete Hud mount/focus sequence or CI load. It argues against attributing the failure to `.hand-in` alone.

### Repeat the measurements

From a clean checkout of the local main revision:

```sh
npm ci
npm ci --prefix server
PLAYWRIGHT_BROWSERS_PATH=/path/to/installed/browsers node --import ./server/register.mjs scripts/wayfarer-setup-prove.mjs
```

The two external diagnostics below leave repository files and every proof assertion unchanged. Run them separately after the ordinary proof exits. Each starts its own Vite/browser and closes them before returning. The first wraps the existing proof; the second is an isolated geometry experiment, not a replacement proof or a full-game reproduction.

```sh
cat > /tmp/wayfarer-bounds-trace.mjs <<'JS'
import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
const {chromium}=await import(pathToFileURL(process.cwd()+'/node_modules/playwright/index.mjs'));
const launch=chromium.launch.bind(chromium),reports=[];let patched=false;
chromium.launch=async(...args)=>{
 const browser=await launch(...args);
 async function install(page){
  if(process.env.BOUNDS_CPU){const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.BOUNDS_CPU)});}
  if(!patched){patched=true;const proto=Object.getPrototypeOf(page.getByTestId('fortune-play-knight')),original=proto.boundingBox;
   proto.boundingBox=async function(...args){
    const value=await original.apply(this,args);
    if(this._selector?.includes('fortune-play-knight')){
     const state=await this.evaluate(el=>{const tray=el.closest('[data-testid="fortune-tray"]'),s=getComputedStyle(el),r=el.getBoundingClientRect();return{viewport:[innerWidth,innerHeight],rect:{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom},offset:[el.offsetWidth,el.offsetHeight],css:{height:s.height,width:s.width,transform:s.transform},motion:matchMedia('(prefers-reduced-motion: reduce)').matches,animations:tray?.getAnimations().map(a=>({time:a.currentTime,state:a.playState,frames:a.effect.getKeyframes(),transform:getComputedStyle(tray).transform}))};});
     reports.push({value,state});writeFileSync('/tmp/wayfarer-bounds-trace-1058.json',JSON.stringify(reports));console.log('BOUNDS1058 '+JSON.stringify({value,state}));
    }
    return value;
   };
  }
  return page;
 }
 const newContext=browser.newContext.bind(browser);browser.newContext=async(...args)=>{const c=await newContext(...args),newPage=c.newPage.bind(c);c.newPage=async(...args)=>install(await newPage(...args));return c;};
 const newPage=browser.newPage.bind(browser);browser.newPage=async(...args)=>install(await newPage(...args));return browser;
};
JS
PLAYWRIGHT_BROWSERS_PATH=/path/to/installed/browsers BOUNDS_CPU=2 node --import ./server/register.mjs --import /tmp/wayfarer-bounds-trace.mjs scripts/wayfarer-setup-prove.mjs
```

```sh
cat > /tmp/wayfarer-native-bounds.mjs <<'JS'
import {pathToFileURL} from 'node:url';import{writeFileSync}from'node:fs';
const{chromium}=await import(pathToFileURL(process.cwd()+'/node_modules/playwright/index.mjs'));
const{createServer}=await import(pathToFileURL(process.cwd()+'/node_modules/vite/dist/node/index.js'));
const vite=await createServer({server:{host:'127.0.0.1',port:18545,strictPort:true},logLevel:'error'});await vite.listen();const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'no-preference'});const reports=[];
try{await page.goto('http://127.0.0.1:18545');await page.evaluate(async()=>{
 const[{default:React},{default:ReactDOM},{FortuneTray},{createGame},{useGame}]=await Promise.all([import('/node_modules/.vite/deps/react.js'),import('/node_modules/.vite/deps/react-dom_client.js'),import('/src/components/game/FortuneTray.tsx'),import('/src/lib/game/board.ts'),import('/src/lib/game/store.ts')]);
 document.querySelector('#root').style.display='none';const fixture=document.createElement('div');fixture.style='position:fixed;bottom:12px;left:280px;width:720px;height:500px';document.body.append(fixture);const root=ReactDOM.createRoot(fixture);const state=createGame({seed:1,humans:[{name:'Ember'}],bots:3,wayfarerMode:'off'}),me=state.players.find(p=>p.id==='p0');state.phase='roll';state.current=me.id;me.hidden.knight=1;me.boughtThisTurn.knight=0;useGame.setState({state,localId:me.id});
 window.mountBoundsFixture=i=>root.render(React.createElement(FortuneTray,{key:i,me,opener:null,onClose:()=>{}}));
 });
 for(let i=0;i<12;i++){
  await page.evaluate(i=>window.mountBoundsFixture(i),i);const button=page.getByTestId('fortune-play-knight');await button.waitFor();
  for(let j=0;j<14;j++){
   const box=await button.boundingBox();const state=await button.evaluate(el=>{const tray=el.closest('[data-testid="fortune-tray"]'),s=getComputedStyle(el),r=el.getBoundingClientRect();return{height:r.height,y:r.y,offset:el.offsetHeight,cssHeight:s.height,buttonTransform:s.transform,trayTransform:getComputedStyle(tray).transform,time:tray.getAnimations()[0]?.currentTime,animationState:tray.getAnimations()[0]?.playState};});
   const ok=box.width>=44&&box.height>=44&&box.y>=0&&box.y+box.height<=720;reports.push({i,j,box,state,ok});if(!ok)console.log(JSON.stringify(reports.at(-1)));
   await page.evaluate(()=>new Promise(requestAnimationFrame));
  }
 }
 console.log(JSON.stringify({samples:reports.length,failed:reports.filter(r=>!r.ok).length,minHeight:Math.min(...reports.map(r=>r.box.height))}));
}finally{writeFileSync('/tmp/wayfarer-native-bounds-1058.json',JSON.stringify(reports));await browser.close();await vite.close();}
JS
PLAYWRIGHT_BROWSERS_PATH=/path/to/installed/browsers node /tmp/wayfarer-native-bounds.mjs
```

## Follow-up boundary

Capture the original box, each existing predicate, viewport, button offset dimensions/active state, ancestor rectangles/transforms and animation states on the next native failure. Keep the original assertion exactly as it is. Without that sample, increasing waits, ignoring fractional sizes or changing runtime geometry would select a cause without evidence.

The needed proof file remains reserved by #539. Coordinate that narrow diagnostic change before claiming it. Any later runtime child must identify the actual function and recheck #539's Hud/styles reservation, #936's Hud surroundings, #883's focus-trap changes and #706's separate styles hunks. No source overlap is authorized by this report. The chat fix #1056/#1057 is separate.
