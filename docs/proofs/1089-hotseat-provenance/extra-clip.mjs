import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {chromium}=await import(pathToFileURL(path.resolve('node_modules/playwright/index.mjs')));
const launch=chromium.launch.bind(chromium);
chromium.launch=async(...args)=>{
 const browser=await launch(...args);
 const newPage=browser.newPage.bind(browser);
 browser.newPage=async(...args)=>{
  const page=await newPage(...args);
  await page.addInitScript(()=>{
   document.addEventListener('pointerup',function controlledLeaveExtraClip(event){
    if(event.target.closest?.('button')?.textContent?.trim()!=='Leave table')return;
    const clip=new Audio('/audio/back_001.wav');
    void clip.play()?.catch(()=>{});
   },{capture:true,passive:true});
  });
  return page;
 };
 return browser;
};
