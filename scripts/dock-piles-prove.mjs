// #846: real rendered cargo pixels, at default camera fit. Diagnostic vertex colours identify visible cargo only.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const port=Number(process.env.VITE_PORT)||18748;
const vite=await createServer({server:{host:'127.0.0.1',port,strictPort:true},logLevel:'error'});await vite.listen();
let browser;
const errors=[];
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 mkdirSync('test-results',{recursive:true});
 for(const [width,height,phone]of [[1280,720,false],[1920,1080,false],[390,844,true]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,...(phone?{hasTouch:true,isMobile:true}:{})});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{localStorage.setItem('emberisle-jelly','full');localStorage.setItem('emberisle-water','simple');});
  await page.goto(`http://127.0.0.1:${port}`);await page.waitForFunction(()=>window.__emberisle);
  await page.getByRole('button',{name:'Pass this device',exact:true}).click();
  await page.evaluate(async()=>{
   const {createGame}=await import('/src/lib/game/board.ts');
   const s=createGame({humans:[{name:'Ember'},{name:'Tide'},{name:'Dune'}],bots:0,seed:14,numberTokens:"random"});
   s.phase='main';s.rollOff=null;s.current='p0';s.seq=991;
   window.__emberisle.setState({state:s,mode:'hotseat',localId:'p0',banner:null,coachDismissed:true});
  });
  await page.waitForFunction(()=>window.__isle?.lastSeq===991&&window.__isle.shore?.group.userData.goodsPiles?.length===9&&!window.__isle.refitDue&&!window.__isle.glide,null,{timeout:60000});
  await page.evaluate(()=>{
   const isle=window.__isle;isle.shore.update=()=>{};
   const canvas=document.createElement('canvas'),gl=isle.renderer.domElement,draw=isle.composer.render.bind(isle.composer);
   window.__cargoFrame=canvas;
   isle.composer.render=(...args)=>{const result=draw(...args);canvas.width=gl.width;canvas.height=gl.height;canvas.getContext('2d').drawImage(gl,0,0);return result;};
  });
  async function frame(){
   await page.evaluate(async()=>{const isle=window.__isle,start=isle.renders,deadline=performance.now()+60000;isle.wake();await new Promise((resolve,reject)=>{const poll=()=>isle.renders>=start+2?resolve():performance.now()>deadline?reject(Error('cargo frame did not draw')):requestAnimationFrame(poll);poll();});});
  }
  await frame();
  const geometry=await page.evaluate(async()=>{
   const {Vector3,Matrix4,Box3}=await import('/node_modules/three/build/three.module.js');
   const isle=window.__isle,piles=isle.shore.group.userData.goodsPiles;
   const frame=window.__cargoFrame;window.__cargoNormal=frame.getContext('2d').getImageData(0,0,frame.width,frame.height);
   window.__tokenRects=isle.tokens.map(token=>{
    const box=new Box3().setFromObject(token),points=[];
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(isle.screenAt(x,y,z));
    return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
   });
   const rows=piles.map(pile=>{
    const matrix=new Matrix4().fromArray(pile.frame),points=[];
    for(const x of [pile.min[0],pile.max[0]])for(const y of [pile.min[1],pile.max[1]])for(const z of [pile.min[2],pile.max[2]]){
     const p=new Vector3(x,y,z).applyMatrix4(matrix);points.push(isle.screenAt(p.x,p.y,p.z));
    }
    const rectangle={left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
    return {kind:pile.kind,tokenCount:isle.tokens.length,scale:pile.scale,min:pile.min,max:pile.max,deck:pile.deck,rectangle,
      cornerClearance:Math.min(...isle.coast.map(c=>{
        const local=new Vector3(c.x,0,c.z).applyMatrix4(matrix.clone().invert());
        return Math.hypot(Math.max(pile.min[0]-local.x,0,local.x-pile.max[0]),Math.max(pile.min[2]-local.z,0,local.z-pile.max[2]));
      })),
};
   });
   window.__cargoRectangles=rows;
   const colors=isle.shore.group.getObjectByName('harbors').geometry.attributes.color;
   window.__cargoColors=colors.array.slice();
   for(const pile of piles)for(let vertex=pile.start;vertex<pile.start+pile.count;vertex++)colors.setXYZ(vertex,1,0,1);
   colors.needsUpdate=true;
   return rows;
  });
  for(const pile of geometry){
   assert.equal(pile.tokenCount,18);
   assert.equal(pile.scale,2.5);assert(pile.min[0]>=-pile.deck.width/2-0.001&&pile.max[0]<=pile.deck.width/2+0.001,`${pile.kind}: goods stay across the pier: ${pile.min[0]}..${pile.max[0]}`);
   assert(pile.min[2]>=pile.deck.from-0.001&&pile.max[2]<=pile.deck.to+0.001,`${pile.kind}: goods stay along the pier: ${pile.min[2]}..${pile.max[2]} versus ${pile.deck.from}..${pile.deck.to}`);
   assert(pile.cornerClearance>0.14,`${pile.kind}: harbor corners remain clear`);
   assert(pile.rectangle.left>=0&&pile.rectangle.top>=0&&pile.rectangle.right<=width&&pile.rectangle.bottom<=height,`${pile.kind}: pile remains inside viewport`);
  }
  await frame();
  const pixels=await page.evaluate(()=>{
   window.__cargoMask=window.__cargoFrame.getContext('2d').getImageData(0,0,window.__cargoFrame.width,window.__cargoFrame.height);
   const canvas=window.__cargoFrame,normal=window.__cargoNormal,mask=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height),ratio=canvas.width/innerWidth;
   const expected=(kind,r,g,b)=>kind==='timber'?r>g*1.1&&g>b*1.1:kind==='clay'?r>g*1.3&&r>b*1.6:kind==='wool'?r>160&&g>150&&b>120&&r-b<90:kind==='grain'?r>120&&r>g*1.05&&g>b*1.15:kind==='ore'?Math.max(r,g,b)-Math.min(r,g,b)<55&&b>=r*.85:true;
   return window.__cargoRectangles.map(pile=>{
    let visible=0,coloured=0;
    const rect=pile.rectangle;
    for(let y=Math.max(0,Math.floor(rect.top*ratio)-1);y<Math.min(canvas.height,Math.ceil(rect.bottom*ratio)+1);y++)for(let x=Math.max(0,Math.floor(rect.left*ratio)-1);x<Math.min(canvas.width,Math.ceil(rect.right*ratio)+1);x++){
     const i=(y*canvas.width+x)*4,[r,g,b]=mask.data.slice(i,i+3);
     if(r>g+40&&b>g+40){visible++;if(expected(pile.kind,...normal.data.slice(i,i+3)))coloured++;}
    }
    return {kind:pile.kind,visible:visible/(ratio*ratio),colour:coloured/(ratio*ratio)};
   });
  });
  // Compare actual visible cargo pixels with the tokens' silhouette when cargo is absent.
  // Rectangle intersections alone over-report occlusion for tilted discs and sparse stacks.
  await page.evaluate(async()=>{
   const {MeshBasicMaterial}=await import('/node_modules/three/build/three.module.js');
   const isle=window.__isle,positions=isle.shore.group.getObjectByName('harbors').geometry.attributes.position;
   window.__cargoPositions=positions.array.slice();
   for(const pile of isle.shore.group.userData.goodsPiles)for(let i=pile.start;i<pile.start+pile.count;i++)positions.setY(i,-100);
   positions.needsUpdate=true;
   const material=new MeshBasicMaterial({color:0x00ffff});window.__tokenMaskMaterial=material;window.__tokenMaterials=[];
   for(const token of isle.tokens)token.traverse(node=>{if(node.isMesh){window.__tokenMaterials.push([node,node.material]);node.material=material;}});
  });
  await frame();
  const occluded=await page.evaluate(()=>{
   const canvas=window.__cargoFrame,cargo=window.__cargoMask.data,normal=window.__cargoNormal.data,tokens=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   const pixels=[];let tokenPixels=0;
   for(let i=0;i<cargo.length;i+=4){
    const x=((i/4)%canvas.width)/(canvas.width/innerWidth),y=Math.floor(i/4/canvas.width)/(canvas.height/innerHeight);
    const inside=window.__tokenRects.some(rect=>x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom);
    const token=inside&&tokens[i+1]>tokens[i]+40&&tokens[i+2]>tokens[i]+40&&tokens[i]<170&&tokens[i+1]>160&&tokens[i+2]>160;
    if(token)tokenPixels++;
    const changed=Math.abs(cargo[i]-normal[i])+Math.abs(cargo[i+1]-normal[i+1])+Math.abs(cargo[i+2]-normal[i+2])>60;
    if(token&&changed&&cargo[i]>cargo[i+1]+40&&cargo[i+2]>cargo[i+1]+40)pixels.push({x:(i/4)%canvas.width,y:Math.floor(i/4/canvas.width)});
   }
   const samples=window.__isle.tokens.slice(0,3).map(t=>{
    const p=window.__isle.screenAt(t.position.x,t.position.y,t.position.z),ratio=canvas.width/innerWidth,index=(Math.round(p.y*ratio)*canvas.width+Math.round(p.x*ratio))*4;
    return [...tokens.slice(index,index+3)];
   });
   return {pixels,tokenPixels,samples};
  });
  assert(occluded.tokenPixels>100,`${width}x${height}: token diagnostic mask contains visible token pixels ${JSON.stringify(occluded.samples)}`);
  assert.equal(occluded.pixels.length,0,`${width}x${height}: no cargo pixel covers a number token ${JSON.stringify(occluded.pixels)}`);
  await page.evaluate(()=>{
   const positions=window.__isle.shore.group.getObjectByName('harbors').geometry.attributes.position;
   positions.array.set(window.__cargoPositions);positions.needsUpdate=true;
   for(const [node,material] of window.__tokenMaterials)node.material=material;
   window.__tokenMaskMaterial.dispose();
  });
  const minimum=phone?12:20;
  for(const pile of pixels)assert(pile.colour>=minimum,`${width}x${height} ${pile.kind}: ${pile.colour.toFixed(1)} real good-colour pixels; need ${minimum}`);
  await page.evaluate(()=>{const colors=window.__isle.shore.group.getObjectByName('harbors').geometry.attributes.color;colors.array.set(window.__cargoColors);colors.needsUpdate=true;});
  await frame();await page.screenshot({path:`test-results/dock-piles-${width}.png`});
  console.log(`ok ${width}x${height}: all nine piles enlarged 2.5x, within piers and clear of corners; visible colour pixels ${JSON.stringify(pixels)}`);
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log('dock piles prove ok');
}finally{await browser?.close();await vite.close();}
