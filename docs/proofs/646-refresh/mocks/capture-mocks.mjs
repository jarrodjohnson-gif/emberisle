import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../../../');
const require=createRequire(path.join(root,'package.json'));
const {chromium}=require('playwright');
const {createServer}=require('vite');
const out=path.join(root,'docs/proofs/646-refresh/mocks');
const source=execFileSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const port=Number(process.env.NEEDS_MOCKS_PORT||18789);
fs.mkdirSync(out,{recursive:true});
const measurements=[];
const vite=await createServer({root,server:{host:'127.0.0.1',port,strictPort:true},logLevel:'error'});
await vite.listen();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
try {
 for (const [w,h] of [[320,568],[390,844],[844,390],[1280,720]]) {
  const page=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:1});
  await page.goto(`http://127.0.0.1:${port}/`); await page.waitForFunction(()=>window.__emberisle);
  await page.evaluate(async()=>{
    const g=window.__emberisle;
    g.getState().startHotseat(4);
    const {createGame}=await import('/src/lib/game/board.ts');
    const {useLocalNeeds}=await import('/src/components/game/need-state.ts');
    const game=createGame({humans:[{name:'Jarrod'},{name:'Joshua'},{name:'Dune'},{name:'Ember'}],bots:0,seed:14,wayfarerMode:'off'});
    game.phase='main';game.rollOff=null;game.current='p0';game.log=[];
    for(const v of game.vertices)v.building=null;
    g.setState({mode:'hotseat',state:game,localId:'p0',tradeOpen:false,spectator:false});
    useLocalNeeds.setState({p1:{kinds:['ore'],turnsLeft:2},p2:{kinds:['grain','wool'],turnsLeft:2}},true);
  });
  await page.waitForFunction(()=>document.querySelectorAll('.seat-card').length===4);
  await page.waitForTimeout(250);
  // Option A: proposal-only row with 48px reserved below a 44px seat line.
  await page.evaluate(()=>{
    const style=document.createElement('style');style.dataset.proposal='A-style';style.textContent='.seat-card{height:92px!important}.seat-card>button{height:44px!important;position:relative!important}.seat-card [data-testid=\"seat-needs\"]{display:none!important}[data-testid=\"seat-strip\"]{height:92px!important}';document.head.append(style);
    for(const card of document.querySelectorAll('.seat-card')){const p=card.querySelector('[data-menu-trigger]')?.dataset.menuTrigger;const existing=card.querySelector('[data-testid=\"seat-needs\"]');const labels={p1:'Stone',p2:'Wheat and Wool'};const row=document.createElement('div');row.setAttribute('data-proposal','A-need-row');row.setAttribute('aria-label',labels[p]?'Need: '+labels[p]:'No Need set');row.title=labels[p]?'Need: '+labels[p]:'';row.style.cssText='position:absolute;left:0;right:0;bottom:0;height:48px;box-sizing:border-box;padding:8px 12px;background:#ffffff30;display:flex;flex-direction:column;justify-content:flex-start;gap:4px;color:#293244';if(labels[p]){const caption=document.createElement('span');caption.textContent='Need';caption.style.cssText='font:12px/16px system-ui';row.append(caption);const icons=document.createElement('span');icons.style.cssText='height:12px;display:flex;align-items:center;gap:4px';for(const svg of existing?.querySelectorAll('svg')??[]){const icon=svg.cloneNode(true);icon.setAttribute('width','12');icon.setAttribute('height','12');icon.style.setProperty('width','12px','important');icon.style.setProperty('height','12px','important');icons.append(icon);}row.append(icons);}card.append(row);}
  });
  measurements.push(await page.evaluate(()=>({variant:'A',viewport:[innerWidth,innerHeight],seats:[...document.querySelectorAll('.seat-card')].map(card=>{const r=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom}};const row=card.querySelector('[data-proposal=\"A-need-row\"]');return {seat:card.querySelector('[data-menu-trigger]').dataset.menuTrigger,card:r(card),seatButton:r(card.querySelector('button')),needRow:r(row),icons:[...row.querySelectorAll('svg')].map(r)};})})));
  await page.screenshot({path:out+'/A-'+w+'x'+h+'.png'});console.log('captured A '+w+'x'+h);
  // Option B: remove A DOM and its style overlay, preserve the rendered game state, and show 8px badges.
  await page.evaluate(()=>{
    document.querySelectorAll('[data-proposal=\"A-need-row\"],[data-proposal=\"A-style\"]').forEach(node=>node.remove());
    const style=document.createElement('style');style.dataset.proposal='B-style';style.textContent='.seat-card [data-testid=\"seat-needs\"]{display:none!important}';document.head.append(style);
    for(const id of ['p1','p2']){const card=document.querySelector('[data-testid=\"rail-'+id+'\"], [data-testid=\"seat-'+id+'\"]');if(card){const dot=document.createElement('span');dot.dataset.proposal='B-dot';dot.title='Need set';dot.setAttribute('aria-label','Need set');dot.style.cssText='position:absolute;left:-3px;top:-3px;width:8px;height:8px;border-radius:50%;background:#be5b39;box-shadow:0 0 0 1px #fff';card.append(dot);}}
  });
  measurements.push(await page.evaluate(()=>({variant:'B-overview',viewport:[innerWidth,innerHeight],seats:[...document.querySelectorAll('.seat-card')].map(card=>{const r=e=>{if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom}};const dot=card.querySelector('[data-proposal=\"B-dot\"]');const overlaps=(a,b)=>a&&b&&Math.min(a.right,b.right)>Math.max(a.x,b.x)&&Math.min(a.bottom,b.bottom)>Math.max(a.y,b.y);const db=r(dot);const metrics=[...document.querySelectorAll('[data-testid=\"seat-vp\"],[data-testid=\"tally-path\"],[data-testid=\"tally-army\"]')].map(el=>({el,box:r(el)})).filter(item=>item.box?.width&&item.box?.height);const covered=metrics.filter(item=>overlaps(db,item.box)).map(item=>item.el.dataset.testid);return {seat:card.querySelector('[data-menu-trigger]').dataset.menuTrigger,card:r(card),button:r(card.querySelector('button')),dot:db,overlapsVisiblePublic:covered};})})));
  await page.screenshot({path:out+'/B-'+w+'x'+h+'-overview.png'});console.log('captured B overview '+w+'x'+h);
  // The two-kind player's actual game menu, with proposed 12px chips appended for presentation only.
  const trigger=page.locator('[data-menu-trigger="p2"]');await trigger.click();await page.waitForSelector('[data-testid="player-menu"]');
  await page.locator('[data-testid="player-menu"]').evaluate(el=>{const row=document.createElement('div');row.dataset.proposal='B-menu-chips';row.setAttribute('aria-label','Dune needs Wheat and Wool');row.style.cssText='margin:4px 4px 8px;display:flex;flex-wrap:wrap;align-items:center;gap:4px;font:12px/16px system-ui;color:#263244';const label=document.createElement('span');label.textContent='Needs';row.append(label);for(const text of ['Wheat','Wool']){const chip=document.createElement('span');chip.textContent=text;chip.style.cssText='padding:8px 12px;border-radius:999px;background:#dce5ed;font:12px/16px system-ui';row.append(chip);}el.prepend(row);});
  measurements.push(await page.locator('[data-proposal=\"B-menu-chips\"]').evaluate(row=>({variant:'B-menu',viewport:[innerWidth,innerHeight],row:{width:row.getBoundingClientRect().width,height:row.getBoundingClientRect().height},chips:[...row.children].slice(1).map(e=>({text:e.textContent,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,font:getComputedStyle(e).fontSize,paddingX:getComputedStyle(e).paddingLeft,paddingY:getComputedStyle(e).paddingTop}))})));
  await page.screenshot({path:out+'/B-'+w+'x'+h+'-menu.png'});console.log('captured B menu '+w+'x'+h);
  await page.evaluate(()=>{window.__emberisle.getState().openMenu(null);window.__emberisle.getState().setTradeOpen(true);});
  await page.waitForSelector('[data-testid="trade-panel"]');
  await page.locator('[data-testid="trade-panel"]').evaluate(el=>{const row=document.createElement('div');row.dataset.proposal='B-trade-chips';row.setAttribute('aria-label','Joshua needs Stone; Dune needs Wheat and Wool');row.style.cssText='margin:4px 0 8px;display:flex;flex-wrap:wrap;align-items:center;gap:4px;font:12px/16px system-ui;color:#263244';for(const [name,goods] of [['Joshua',['Stone']],['Dune',['Wheat','Wool']]]){const label=document.createElement('span');label.textContent=name+':';row.append(label);for(const text of goods){const chip=document.createElement('span');chip.textContent=text;chip.style.cssText='padding:8px 12px;border-radius:999px;background:#dce5ed;font:12px/16px system-ui';row.append(chip);}}el.querySelector('.trade-composer-scroll')?.querySelector('div')?.after(row);});
  measurements.push(await page.locator('[data-proposal=\"B-trade-chips\"]').evaluate(row=>({variant:'B-trade',viewport:[innerWidth,innerHeight],row:{width:row.getBoundingClientRect().width,height:row.getBoundingClientRect().height},chips:[...row.children].filter(e=>e.tagName==='SPAN'&&e.textContent!=='Joshua:'&&e.textContent!=='Dune:').map(e=>({text:e.textContent,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,font:getComputedStyle(e).fontSize,paddingX:getComputedStyle(e).paddingLeft,paddingY:getComputedStyle(e).paddingTop}))})));
  await page.screenshot({path:out+'/B-'+w+'x'+h+'-trade.png'});console.log('captured B trade '+w+'x'+h);
  await page.close();
 }
 const compact=measurements.map(m=>{if(m.variant==='A')return {viewport:m.viewport,variant:'A',seats:m.seats.map(s=>({seat:s.seat,cardWidth:s.card.width,cardHeight:s.card.height,seatButtonHeight:s.seatButton.height,needRowHeight:s.needRow.height,iconSizes:s.icons.map(i=>[i.width,i.height])}))};if(m.variant==='B-overview')return {viewport:m.viewport,variant:'B-overview',seats:m.seats.map(s=>({seat:s.seat,cardHeight:s.card.height,seatButtonHeight:s.button.height,dot:s.dot?{size:[s.dot.width,s.dot.height],offset:[s.dot.x-s.card.x,s.dot.y-s.card.y],overlapsVisiblePublic:s.overlapsVisiblePublic}:null}))};return {viewport:m.viewport,variant:m.variant,chips:m.chips.map(c=>({text:c.text,size:[c.width,c.height],font:c.font,padding:[c.paddingX,c.paddingY]}))}});
 fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify({source,runtime:'Vite real game, four-seat hotseat fixture, WebGL enabled; option-only DOM/CSS overlays',browser:process.env.CHROMIUM_PATH||'/usr/bin/chromium',measurements:compact})+'\n');
} finally { await browser.close(); await vite.close(); }
