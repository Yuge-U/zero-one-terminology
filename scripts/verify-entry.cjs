const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const practice=__dirname.endsWith('/production');
const root=practice?path.resolve('_site'):path.resolve('.');
const app=practice?'zero-one-practice-lab':'zero-one-terminology';
const newHtml=fs.readFileSync(path.join(root,'index.html'),'utf8');
const newHead=newHtml.match(/<head>([\s\S]*?)<\/head>/)[1];
const simpleNew=`<!doctype html><html><head>${newHead}</head><body><h1 id="new">updated</h1></body></html>`;
const oldHtml=`<!doctype html><html><head><link rel="icon" href="brand-logo.svg"></head><body><input id="draft" value="unsaved"><script>localStorage.setItem('brand-test-marker','preserve');${practice?"navigator.serviceWorker.register('./sw.js');":''}</script></body></html>`;
(async()=>{
 for(const engine of (process.env.BROWSER_ENGINE === "chromium" ? [chromium] : [chromium,webkit])){
  let upgraded=false,originOnline=true;
  const requests=[];
  const server=http.createServer((req,res)=>{
   if(!originOnline){req.socket.destroy();return;}
   const url=new URL(req.url,'http://localhost');requests.push(url.pathname+url.search);
   let relative=url.pathname.slice(app.length+2);
   if(!url.pathname.startsWith('/'+app+'/')){res.writeHead(404).end();return;}
   if(!relative||relative==='index.html'){res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');res.end(upgraded?simpleNew:oldHtml);return;}
   if(practice&&relative==='sw.js'&&!upgraded){res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');res.end(fs.readFileSync(path.join(__dirname,'tests/fixtures/before-brand-refresh-sw.js')));return;}
   const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
   res.setHeader('Content-Type',relative.endsWith('.js')||relative.endsWith('.mjs')?'text/javascript':relative.endsWith('.png')?'image/png':relative.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(fs.readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}/${app}/`;
  const browser=await engine.launch(process.env.CHROMIUM_PATH && engine.name()==="chromium" ? {executablePath:process.env.CHROMIUM_PATH} : {});
  try{
   const context=await browser.newContext();const old=await context.newPage();await old.goto(base,{waitUntil:'domcontentloaded'});
   await old.locator('#draft').fill('preserved unsaved draft');
   await old.evaluate(async()=>{await new Promise((resolve,reject)=>{const req=indexedDB.open('brand-update-test',1);req.onupgradeneeded=()=>req.result.createObjectStore('records');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result;const tx=db.transaction('records','readwrite');tx.objectStore('records').put('saved plan','plan');tx.oncomplete=()=>{db.close();resolve();};};});});
   if(practice){await old.evaluate(async()=>{await navigator.serviceWorker.ready;});await old.reload({waitUntil:'domcontentloaded'});await old.locator('#draft').fill('preserved unsaved draft');await old.waitForFunction(()=>navigator.serviceWorker.controller);}
   upgraded=true;
   if(practice){
    await old.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});
    let active=false;const deadline=Date.now()+15000;
    while(Date.now()<deadline){
     active=await old.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();if(!r?.active||r.active.state!=='activated'||navigator.serviceWorker.controller!==r.active)return false;return new Promise(resolve=>{const finish=value=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('message',receive);resolve(value);};const receive=e=>{if(e.source===r.active&&e.data?.type==='offlineStatus')finish(e.data.brandRevision==='20261007i');};const timer=setTimeout(()=>finish(false),500);navigator.serviceWorker.addEventListener('message',receive);r.active.postMessage({type:'offlineCheck'});});});
     if(active)break;await new Promise(r=>setTimeout(r,100));
    }
    assert(active,'New worker must actively control the retained tab');
   }
   const fresh=await context.newPage();await fresh.goto(base,{waitUntil:'domcontentloaded'});await fresh.waitForURL(u=>u.searchParams.get('brand')==='20261007h',{waitUntil:'domcontentloaded'});await fresh.locator('#new').waitFor();
   assert.equal(await old.locator('#draft').inputValue(),'preserved unsaved draft','Old editor must not reload');
   assert.equal(await fresh.evaluate(()=>localStorage.getItem('brand-test-marker')),'preserve');
   assert.equal(await fresh.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('brand-update-test');r.onsuccess=()=>{const db=r.result;const q=db.transaction('records').objectStore('records').get('plan');q.onsuccess=()=>{db.close();resolve(q.result);};};})),'saved plan');
   const icon=await fresh.locator('link[rel="icon"]').getAttribute('href');assert(icon.includes('20261007g.png'));
   await fresh.goto(base+'index.html?existing=keep&brand=old#section',{waitUntil:'domcontentloaded'});await fresh.waitForURL(u=>u.searchParams.get('brand')==='20261007h',{waitUntil:'domcontentloaded'});const final=new URL(fresh.url());assert.equal(final.searchParams.get('existing'),'keep');assert.equal(final.hash,'#section');assert.equal(new URL('./',final).href,base,'Authentication redirect must remain stable');
   for(const callback of ['?code=synthetic-code&state=synthetic-state','#code=synthetic-code&state=synthetic-state']){
    await fresh.goto(base+callback,{waitUntil:'domcontentloaded'});await fresh.locator('#new').waitFor();assert.equal(fresh.url(),base+callback,'Authentication return must not redirect');
   }
   await fresh.goto(base,{waitUntil:'domcontentloaded'});await fresh.waitForURL(u=>u.searchParams.get('brand')==='20261007h',{waitUntil:'domcontentloaded'});
   const count=requests.length;await fresh.reload({waitUntil:'domcontentloaded'});await fresh.locator('#new').waitFor();assert(requests.length-count<20,'No redirect loop');
   if(practice){originOnline=false;await fresh.reload({waitUntil:'domcontentloaded'});await fresh.locator('#new').waitFor();originOnline=true;}
   console.log('PASS',engine.name(),app,'normal URL, retained tab/draft, localStorage, IndexedDB, auth URL, parameters, offline shell');
   await context.close();
  }finally{await browser.close();await new Promise(r=>server.close(r));}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
