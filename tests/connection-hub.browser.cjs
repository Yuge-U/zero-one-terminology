'use strict';
const {chromium,webkit}=require('playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=req.url==='/'?'index.html':req.url.slice(1);res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');if(file==='index.html'){res.setHeader('Content-Type','text/html');res.end('<meta charset="utf-8"><link rel="stylesheet" href="/zero-one-connection.css"><nav style="display:flex;justify-content:flex-end"><span id="cloud"></span></nav><script src="/zero-one-connection.js"></script>');}else res.end(fs.readFileSync(path.join(root,file)));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 for(const [name,type]of Object.entries({chromium,webkit})){
  const browser=await type.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:320,height:640}});
   await page.goto('http://127.0.0.1:'+server.address().port);
   await page.evaluate(()=>{
    window.calls={connect:0,sync:0,settings:0};
    window.ui=ZeroOneConnection.create({mount:'#cloud',connect:()=>{calls.connect++;return new Promise(r=>window.finishConnect=r)},sync:()=>{calls.sync++;return new Promise(r=>window.finishSync=r)},settings:()=>calls.settings++});
    ui.update({state:'disconnected'});
   });
   const button=page.locator('.zoc-primary');
   assert.match(await button.getAttribute('aria-label'),/未接続/);assert((await button.boundingBox()).height>=44);
   await button.click();assert(await page.locator('.zoc-more').isEnabled());await page.locator('.zoc-more').click();assert.equal(await page.evaluate(()=>calls.settings),1);
   await button.click();await page.locator('.zoc-connect').click();await button.click();assert(await page.locator('.zoc-connect').isDisabled());assert.equal(await page.evaluate(()=>calls.connect),1);await page.locator('.zoc-close').click();
   await page.evaluate(()=>{ui.update({state:'connected',account:true,username:'synthetic@example.invalid',sync:{state:'pending',title:'端末に保存済み・同期待ち'}});finishConnect()});
   await page.waitForFunction(()=>document.querySelector('#cloud').dataset.state==='connected');
   assert.equal(await page.locator('.zoc-caption').innerText(),'同期待ち');await button.click();assert.match(await page.locator('.zoc-dialog-status').innerText(),/接続済み/);assert.equal(await page.locator('.zoc-dialog-account').innerText(),'synthetic@example.invalid');
   await page.locator('.zoc-sync').click();assert(await page.locator('.zoc-sync').isDisabled());assert.equal(await page.locator('.zoc-caption').innerText(),'同期中');await page.locator('.zoc-close').click();assert(await button.isEnabled());await button.click();assert.equal(await page.evaluate(()=>calls.sync),1);
   await page.evaluate(()=>{ui.update({state:'connected',account:true,sync:{state:'synced',title:'最終同期 15:02'}});finishSync()});await page.waitForFunction(()=>!document.querySelector('.zoc-sync').disabled);assert.match(await page.locator('.zoc-dialog-sync').innerText(),/最終同期/);
   await page.evaluate(()=>ui.update({state:'connected',account:true,sync:{state:'error',title:'同期未完了・記録はこの端末にあります'}}));assert.equal(await page.locator('.zoc-caption').innerText(),'同期未完');assert(await page.locator('.zoc-sync').isEnabled());
   await page.evaluate(()=>ui.update({state:'auth',account:true,sync:{state:'synced'}}));assert.equal(await page.locator('.zoc-caption').innerText(),'再接続');assert.equal(await page.locator('.zoc-sync').isVisible(),false);assert.equal(await page.locator('.zoc-connect').innerText(),'再接続');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   console.log('PASS',name,'single menu; guest backup; pending; sync single-flight; details while busy; success; failure; auth priority; 320px');
  }finally{await browser.close()}
 }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
