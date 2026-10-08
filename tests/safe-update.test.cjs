const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const {createHash,webcrypto}=require('node:crypto');
const root=process.env.UPDATE_ROOT||join(__dirname,'..');
const box={exports:{}};vm.runInNewContext(readFileSync(join(root,'zero-one-update.js'),'utf8'),{module:box,URL,URLSearchParams,crypto:webcrypto,Uint8Array,Error,Response});const api=box.exports;
const digest=value=>createHash('sha256').update(value).digest('hex');
const id=digest('new'),old=digest('old');
const manifest={schema:1,app:'TEST',buildId:id,files:[{path:'index.html',sha256:digest('html')},{path:'app.js',sha256:digest('js')}]};
test('manifest rejects traversal, remote URLs, duplicate paths, malformed builds and wrong apps',()=>{assert.equal(api.validateRelease(manifest,'TEST'),manifest);for(const path of ['../auth','https://example.test/token','/app.js','a//b','a/./b'])assert.throws(()=>api.validateRelease({...manifest,files:[{path,sha256:id}]},'TEST'));assert.throws(()=>api.validateRelease({...manifest,files:[...manifest.files,manifest.files[0]]},'TEST'));assert.throws(()=>api.validateRelease({...manifest,buildId:'stale'},'TEST'));assert.throws(()=>api.validateRelease(manifest,'OTHER'));});
test('OAuth query/hash callbacks are recognized without changing the URL',()=>{for(const params of ['?code=test&state=x','#access_token=test','?error=denied','#id_token=test']){const url=new URL('https://example.test/app/'+params),before=url.href;assert(api.authReturn(url));assert.equal(url.href,before);}assert(!api.authReturn(new URL('https://example.test/app/?filter=keep#settings')));});
test('incomplete deployment and failed downloads are rejected before update',async()=>{await api.verifyAsset(new Response('js'),digest('js'));await assert.rejects(()=>api.verifyAsset(new Response('old-js'),digest('js')));await assert.rejects(()=>api.verifyAsset(new Response('missing',{status:404}),digest('js')));});
function worker({corrupt=false,offline=false}={}){
 const events={},maps=new Map(),requests=[],deleted=[];let skips=0,claims=0;
 const caches={open:async name=>{if(!maps.has(name))maps.set(name,new Map());const map=maps.get(name);return {put:async(k,v)=>map.set(String(k),v),match:async k=>map.get(String(k))?.clone()};},delete:async key=>deleted.push(key)};
 const self={registration:{scope:'https://example.test/app/'},clients:{claim:async()=>claims++},skipWaiting:async()=>skips++,addEventListener:(name,fn)=>events[name]=fn};
 const fetch=async request=>{requests.push(String(request.url||request));if(offline)throw Error('offline');const url=new URL(request.url||request);if(url.pathname.endsWith('app-version.json'))return new Response(JSON.stringify(manifest));return new Response(url.pathname.endsWith('index.html')?'html':corrupt?'old-js':'js');};
 const source=readFileSync(process.env.UPDATE_WORKER_TEMPLATE||join(__dirname,'update-worker.fixture.js'),'utf8').replace('__ZERO_ONE_BUILD__',id).replace('__ZERO_ONE_APP__','TEST').replace('__ZERO_ONE_CACHE_PREFIX__','test-owned-release-').replace('__ZERO_ONE_VERSION__','1');
 vm.runInNewContext(source,{self,caches,fetch,URL,Response,crypto:webcrypto,Map,Set,Error,Promise,Uint8Array});
 async function invoke(name,args={}){let promise;events[name]({...args,waitUntil:p=>promise=p});if(promise)await promise;}
 return {events,invoke,maps,requests,deleted,get skips(){return skips;},get claims(){return claims;}};
}
test('existing worker waits; only matching explicit update activates it',async()=>{const w=worker();await w.invoke('install');assert.equal(w.skips,0);let reply;await w.invoke('message',{data:{type:'ZERO_ONE_APPLY_UPDATE',buildId:old},ports:[{postMessage:v=>reply=v}]});assert.equal(reply.accepted,false);assert.equal(w.skips,0);await w.invoke('message',{data:{type:'ZERO_ONE_APPLY_UPDATE',buildId:id},ports:[{postMessage:v=>reply=v}]});assert(reply.accepted);assert.equal(w.skips,1);await w.invoke('activate');assert.equal(w.claims,1);assert.deepEqual(w.deleted,[]);});
test('interrupted/partial installation never marks a release complete',async()=>{for(const options of [{corrupt:true},{offline:true}]){const w=worker(options);await assert.rejects(()=>w.invoke('install'));assert.equal(w.skips,0);let reply;await w.invoke('message',{data:{type:'ZERO_ONE_RELEASE_INFO'},ports:[{postMessage:v=>reply=v}]});assert.equal(reply.ready,false);}});
test('OAuth, API, external and non-GET responses never enter the app cache',async()=>{const w=worker();await w.invoke('install');for(const url of ['https://graph.microsoft.com/v1.0/me','https://login.microsoftonline.com/token','https://example.test/app/?code=test&state=x','https://example.test/app/app-version.json']){let used=false;w.events.fetch({request:{url,method:'GET',mode:'navigate'},respondWith(){used=true;}});assert.equal(used,false,url);}let response;w.events.fetch({request:{url:'https://example.test/app/private-api',method:'GET',mode:'cors'},respondWith:p=>response=p});await response;assert.equal([...w.maps.values()][0].size,3);});
test('retained clients can still load their own previous immutable assets',async()=>{const w=worker();await w.invoke('install');w.maps.set('test-owned-release-'+old,new Map([['https://example.test/app/app.js',new Response('old-app')]]));await w.invoke('message',{data:{type:'ZERO_ONE_CLIENT_BUILD',buildId:old},source:{id:'old-tab'}});let response;w.events.fetch({clientId:'old-tab',request:{url:'https://example.test/app/app.js',method:'GET',mode:'cors'},respondWith:p=>response=p});assert.equal(await(await response).text(),'old-app');});
test('version generation preserves inline JavaScript, URLs and repeatable build identity',()=>{
 const {mkdtempSync,writeFileSync,rmSync}=require('node:fs'),{tmpdir}=require('node:os'),{execFileSync}=require('node:child_process');
 const directory=mkdtempSync(join(tmpdir(),'update-build-')),builder=process.env.UPDATE_BUILDER||join(root,'scripts/build-update-release.mjs');
 try{const inline="const value=null;window.protected=(value??'saved')==='saved'?'safe':'unsafe';window.markup='<link rel=\"stylesheet\" href=\"runtime.css\">';";
 const html='<html><head><meta charset="utf-8"><link href="app.css?v=1" rel="stylesheet"></head><body><script>'+inline+'</script><script src="app.js?v=1"></script></body></html>';
 for(const [name,body]of Object.entries({'index.html':html,'app.js':'window.ready=true;','app.css':'body{}','zero-one-update.js':'window.update=true;','zero-one-update.css':'aside{}'}))writeFileSync(join(directory,name),body);
 const config=join(directory,'config.json');writeFileSync(config,JSON.stringify({root:directory,app:'TEST',files:['index.html','app.js','app.css','zero-one-update.js','zero-one-update.css']}));
 execFileSync(process.execPath,[builder,config]);const once=readFileSync(join(directory,'index.html'),'utf8'),before=readFileSync(join(directory,'app-version.json'),'utf8');assert(once.includes('<script>'+inline+'</script>'));assert(once.includes('href="app.css?v=1&build='));
 execFileSync(process.execPath,[builder,config,'--check']);assert.equal(readFileSync(join(directory,'app-version.json'),'utf8'),before);
 writeFileSync(join(directory,'app.js'),'window.ready="new";');assert.throws(()=>execFileSync(process.execPath,[builder,config,'--check'],{stdio:'pipe'}));execFileSync(process.execPath,[builder,config]);assert.notEqual(readFileSync(join(directory,'app-version.json'),'utf8'),before);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
