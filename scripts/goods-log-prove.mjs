// Canonical public goods narration: real rule/store actions, all fortune kinds, privacy,
// chronological persistent dock rows, newest HUD line, cap, and both motion preferences.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const port=Number(process.env.VITE_PORT||18534);
const vite=await createServer({server:{host:'127.0.0.1',port,strictPort:true},logLevel:'error'});
await vite.listen();
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];mkdirSync('test-results',{recursive:true});
try {
 for(const [width,height,reduced] of [[390,844,false],[1280,720,false],[390,844,true]]) {
  const context=await browser.newContext({viewport:{width,height},reducedMotion:reduced?'reduce':'no-preference'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByRole('button',{name:'Four seats, one table',exact:true}).click();
  const result=await page.evaluate(async()=>{
   const {createGame}=await import('/src/lib/game/board.ts');
   const R=await import('/src/lib/game/rules.ts');
   const {chooseBotAction}=await import('/src/lib/game/ai.ts');
   
   const g=window.__emberisle;
   let state=createGame({humans:[{name:'Ember'},{name:'Tide'},{name:'Pine'},{name:'Moss'}],bots:0,seed:14});
   state.phase='setupSettle';state.rollOff=null;
   while(state.phase==='setupSettle'||state.phase==='setupRoad'){
    const r=R.applyAction(state,state.current,chooseBotAction(state,state.current));if(r.error)throw Error(r.error);state=r.state;
   }
   state.current=state.players[0].id;state.phase='main';state.log=[];
   for(const p of state.players)p.resources={timber:3,clay:3,wool:3,grain:3,ore:6};
   for(const r of ['timber','clay','wool','grain','ore'])state.bank[r]=30;
   g.setState({state,mode:'hotseat',gameLog:[],banner:null});
   const events=[];
   const act=(action,actor=g.getState().state.current)=>{
    const before=g.getState().gameLog.length,r=g.getState().dispatch(action,actor);
    if(!r.ok)throw Error(r.error);
    const lines=g.getState().gameLog.slice(before).map(l=>l.text);
    if(lines.length!==1)throw Error(`${action.type}: ${JSON.stringify(lines)}`);
    if(g.getState().banner)throw Error(`duplicate banner ${g.getState().banner}`);
    events.push({kind:action.type,line:lines[0]});
   };
   const edit=fn=>{const s=structuredClone(g.getState().state);fn(s);s.seq++;g.setState({state:s,banner:null});};
   edit(s=>s.phase='roll');
   const original=crypto.getRandomValues.bind(crypto),dice=[3,3];
   crypto.getRandomValues=b=>dice.length?(b[0]=dice.shift(),b):original(b);
   act({type:'roll'});crypto.getRandomValues=original;
   act({type:'buildPath',edgeId:R.legalRoads(g.getState().state,g.getState().state.current,false)[0]});
   act({type:'bankTrade',give:'ore',want:'grain'});
   edit(s=>s.trade={from:s.current,to:s.players[1].id,give:{timber:1},want:{clay:1}});
   act({type:'respondTrade',accept:true},g.getState().state.players[1].id);
   edit(s=>{s.phase='discard';s.discardNeeded={[s.current]:2};});
   act({type:'discard',resources:{wool:2}});
   edit(s=>{s.phase='main';s.discardNeeded={};const p=s.players.find(p=>p.id===s.current);p.hidden={knight:1,road:1,plenty:1,monopoly:1,vp:0};p.boughtThisTurn={knight:0,road:0,plenty:0,monopoly:0,vp:0};s.playedCard=false;});
   let s=g.getState().state;
   const h=s.hexes.find(h=>h.id!==s.robberHex&&R.stealTargets(s,h.id,s.current).length);
   act({type:'playKnight',hexId:h.id,stealFrom:R.stealTargets(s,h.id,s.current)[0]});
   edit(s=>s.playedCard=false);
   act({type:'playRoad',edgeIds:[R.legalRoads(g.getState().state,g.getState().state.current,false)[0]]});
   edit(s=>s.playedCard=false);act({type:'playPlenty',resources:['wool','grain']});
   edit(s=>s.playedCard=false);act({type:'playMonopoly',resource:'timber'});
   edit(s=>{s.deck=['vp',...s.deck];});act({type:'buyCard'});
   // 200-event engine and client history survive the rolling cap.
   const history=g.getState().gameLog.map(l=>l.text);
   g.setState({gameLog:[...Array.from({length:200-history.length},(_,i)=>({at:0,text:`Earlier event ${i}`})),...g.getState().gameLog],chatOpen:false,logFilter:'all',banner:null,mode:'online'});
   return {events,history,cap:g.getState().gameLog.length};
  });
  assert.equal(result.cap,200);
  assert.deepEqual(result.events.map(e=>e.kind),['roll','buildPath','bankTrade','respondTrade','discard','playKnight','playRoad','playPlenty','playMonopoly','buyCard']);
  for(const event of result.events)assert.match(event.line,/^[A-Z][a-z]+ (gains|spends|steals|discards|traded|plays)/);
  assert.match(result.events[0].line,/— Ember's roll[;.]/);
  assert.match(result.events[1].line,/spends 1 wood, 1 brick — path/);
  assert.match(result.events[2].line,/^.+ traded [234] stone to (the bank|a dock) for 1 wheat\.$/);
  assert.match(result.events[3].line,/ traded 1 wood to .+ for 1 brick\.$/);
  for(const [index,kind] of [[5,'Wayfarer'],[6,'Path'],[7,'Plenty'],[8,'Monopoly']])assert.ok(result.events[index].line.includes(`plays ${kind}`));
  assert.match(result.events[5].line,/gains 1 good;.*loses 1 good/);
  assert.doesNotMatch(result.events[5].line,/timber|clay|wool|grain|wood|brick|sheep|wheat|ore|\bVP\b/);
  assert.equal(result.events[4].line,'Ember discards 2 goods.');
  assert.doesNotMatch(result.events[9].line,/\bvp\b|point fortune/i);
  await page.getByRole('button',{name:'Open chat',exact:true}).click();
  await page.getByTestId('log-row').last().waitFor();
  const rows=await page.getByTestId('log-row').allTextContents();
  assert.deepEqual(rows.slice(-result.history.length),result.history);
  const style=await page.getByTestId('log-row').last().evaluate(el=>getComputedStyle(el).fontSize);assert.equal(style,'14px');
  const latest=await page.getByTestId('log-line').textContent();assert.equal(latest,result.history.at(-1));
  await page.screenshot({path:`test-results/goods-log-${width}${reduced?'-reduced':''}.png`});
  console.log(`ok ${width}x${height}${reduced?' reduced':''}: ten ordered events, one line each; all four public fortunes; private theft/discard/bought-kind protected; 200 rows; latest HUD line`);
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log('goods-log-prove: all passed');
}finally{await browser.close();await vite.close();}
