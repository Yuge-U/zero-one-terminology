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
 for(const engine of [chromium,webkit]){
  let upgraded=false;
  const requests=[];
  const server=http.createServer((req,res)=>{
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
  const browser=await engine.launch();
  try{
   const context=await browser.newContext();const old=await context.newPage();await old.goto(base);
   await old.locator('#draft').fill('preserved unsaved draft');
   await old.evaluate(async()=>{await new Promise((resolve,reject)=>{const req=indexedDB.open('brand-update-test',1);req.onupgradeneeded=()=>req.result.createObjectStore('records');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result;const tx=db.transaction('records','readwrite');tx.objectStore('records').put('saved plan','plan');tx.oncomplete=()=>{db.close();resolve();};};});});
   if(practice){await old.evaluate(async()=>{await navigator.serviceWorker.ready;});await old.reload();await old.locator('#draft').fill('preserved unsaved draft');await old.waitForFunction(()=>navigator.serviceWorker.controller);}
   upgraded=true;
   if(practice){await old.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});await old.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return r?.active&&!(r.waiting||r.installing)&&(await caches.keys()).includes('zero-one-practice-lab-1.3.4-brand-20261007h');},null,{timeout:15000});}
   const fresh=await context.newPage();fresh.on('console',m=>{if(m.type()==='error')console.log('BROWSER',engine.name(),m.text());});fresh.on('pageerror',e=>console.log('PAGE ERROR',e.message));await fresh.goto(base);await fresh.waitForURL(u=>u.searchParams.get('brand')==='20261007h');await fresh.locator('#new').waitFor();
   assert.equal(await old.locator('#draft').inputValue(),'preserved unsaved draft','Old editor must not reload');
   assert.equal(await fresh.evaluate(()=>localStorage.getItem('brand-test-marker')),'preserve');
   assert.equal(await fresh.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('brand-update-test');r.onsuccess=()=>{const db=r.result;const q=db.transaction('records').objectStore('records').get('plan');q.onsuccess=()=>{db.close();resolve(q.result);};};})),'saved plan');
   const icon=await fresh.locator('link[rel="icon"]').getAttribute('href');assert(icon.includes('20261007g.png'));
   await fresh.goto(base+'index.html?existing=keep&brand=old#section');await fresh.waitForURL(u=>u.searchParams.get('brand')==='20261007h');const final=new URL(fresh.url());assert.equal(final.searchParams.get('existing'),'keep');assert.equal(final.hash,'#section');assert.equal(new URL('./',final).href,base,'Authentication redirect must remain stable');
   const count=requests.length;await fresh.reload();await fresh.locator('#new').waitFor();assert(requests.length-count<20,'No redirect loop');
   if(practice){await context.setOffline(true);await fresh.reload();await fresh.locator('#new').waitFor();await context.setOffline(false);}
   console.log('PASS',engine.name(),app,'normal URL, retained tab/draft, localStorage, IndexedDB, auth URL, parameters, offline shell');
   await context.close();
  }finally{await browser.close();await new Promise(r=>server.close(r));}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
