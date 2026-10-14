// Actual browser capture for visual review; waiting intervals are shortened to show each visitor.
// Start npm run dev first. No gameplay action or shipped event timing is changed.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

mkdirSync("test-results/jelly",{recursive:true});
const browser=await chromium.launch({args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
try {
  const context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:"test-results/jelly/video",size:{width:1280,height:720}}});
  const page=await context.newPage();
  await page.goto("http://localhost:8080");
  await page.getByRole("button",{name:"Four seats, one table",exact:true}).click();
  await page.waitForFunction(()=>window.__isle?.lastState);
  await page.evaluate(async()=>{
    const {createGame}=await import("/src/lib/game/board.ts");
    const st=createGame({seed:20261013,humans:[{name:"You"},{name:"Mira"},{name:"Finn"},{name:"Jules"}],bots:0});
    const land=st.vertices.filter(v=>v.hexes.length>=2),step=Math.floor(land.length/8);
    st.players.forEach((p,i)=>{
      p.resources={timber:4,clay:3,wool:2,grain:5,ore:2};
      for(let k=0;k<2;k++){
        const v=land[(i*2+k)*step];v.building={playerId:p.id,kind:k?"stronghold":"outpost"};
        const e=st.edges.find(e=>(e.va===v.id||e.vb===v.id)&&!e.path);if(e)e.path=p.id;
      }
    });
    st.phase="main";st.current=st.players[0].id;st.dice=[3,5];st.log=["You laid a path."];st.seq++;
    window.__emberisle.setState({state:st,localId:st.current,mode:"ai",banner:null,error:null});
  });
  await page.waitForFunction(()=>!window.__isle.refitDue&&!window.__isle.glide);
  await page.waitForTimeout(2500);
  for(const [species,age,hold] of [["dolphin",4,8500],["turtle",7,7000],["whale",10,8000]]){
    await page.evaluate(({species,age})=>{
      const r=window.__isle,life=r.oceanLife;life.reset(`showcase-${species}`);
      const lane=life.lane(species,r.oceanViewport());if(!lane)throw new Error(`No clear ${species} lane`);
      life.begin(species,lane);life.active.age=age;life.pose(life.active);
    },{species,age});
    await page.waitForTimeout(200);
    await page.screenshot({path:`test-results/jelly/1280-${species}.png`});
    await page.waitForTimeout(hold);
  }
  await context.close();
  await page.video().saveAs("test-results/jelly/ambient-showcase.webm");
  console.log("jelly-showcase: real browser screenshots and ambient-showcase.webm saved");
} finally {await browser.close();}
