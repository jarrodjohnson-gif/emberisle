import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {writeFileSync} from 'node:fs';
const {chromium}=await import(pathToFileURL(path.resolve('node_modules/playwright/index.mjs')));
const launch=chromium.launch.bind(chromium), results=[];
chromium.launch=async(...args)=>{
 const browser=await launch(...args),newContext=browser.newContext.bind(browser);
 browser.newContext=async(...args)=>{
  const context=await newContext(...args),newPage=context.newPage.bind(context),close=context.close.bind(context);
  context.newPage=async(...args)=>{
   const page=await newPage(...args);
   await page.addInitScript(()=>{
    const rect=Element.prototype.getBoundingClientRect;
    const describe=(el)=>({testid:el.dataset?.testid??null,tag:el.tagName,hud:el.hasAttribute('data-hud-stack'),box:rect.call(el).toJSON()});
    window.__stageTrace=[];
    const snapshot=(phase,extra={})=>{
     const el=document.querySelector('[data-testid="turn-moment"]');if(!el)return;
     window.__stageTrace.push({phase,at:performance.now(),shift:Number(el.dataset.shift),stage:el.dataset.stage,moment:describe(el),area:describe(el.parentElement),hard:[...document.querySelectorAll('header,[data-testid="seat-strip"],[data-hud-stack]')].map(describe),tabs:[...document.querySelectorAll('[data-testid="resource-flash"]')].map(describe),...extra});
    };
    const Native=ResizeObserver;
    window.ResizeObserver=class extends Native{
     constructor(callback){super(function(entries,observer){
      if(!observer.__stageArea?.isConnected)return Reflect.apply(callback,this,[entries,observer]);
      const reads=[];snapshot('before-resize');
      const previous=Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect=function(){const r=previous.call(this);reads.push({testid:this.dataset?.testid??null,tag:this.tagName,hud:this.hasAttribute('data-hud-stack'),box:r.toJSON()});return r;};
      try{return Reflect.apply(callback,this,[entries,observer]);}
      finally{Element.prototype.getBoundingClientRect=previous;snapshot('after-resize',{reads});queueMicrotask(()=>snapshot('after-resize-microtask'));}
     });}
     observe(target,...args){
      if(target.firstElementChild?.dataset?.testid==='turn-moment'){
       this.__stageArea=target;
       this.__styleProbe=new MutationObserver(()=>window.__stageTrace.push({phase:'parent-style',at:performance.now(),hole:Object.fromEntries(['top','right','bottom','left'].map(k=>[k,target.parentElement.style.getPropertyValue('--hole-'+k)]))}));
       this.__styleProbe.observe(target.parentElement,{attributes:true,attributeFilter:['style']});
      }
      return super.observe(target,...args);
     }
     disconnect(){this.__styleProbe?.disconnect();this.__stageArea=null;return super.disconnect();}
    };
   });
   return page;
  };
  const collect=async()=>{for(const page of context.pages())if(!page.isClosed())results.push(await page.evaluate(()=>({trace:window.__stageTrace,turns:window.__turns,lines:window.__lines,view:[innerWidth,innerHeight]})));};
  context.close=async(...args)=>{await collect();return close(...args);};
  context.__collectStage=collect;
  return context;
 };
 const close=browser.close.bind(browser);
 browser.close=async(...args)=>{for(const c of browser.contexts())await c.__collectStage?.();writeFileSync(process.env.STAGE_EVIDENCE||'/tmp/issue1096-stage-observer.json',JSON.stringify(results));return close(...args);};
 return browser;
};
