/* One registration, static same-origin application assets only. No auth/API caching. */
const BUILD_ID='__ZERO_ONE_BUILD__';
const APP='__ZERO_ONE_APP__';
const CACHE_PREFIX='__ZERO_ONE_CACHE_PREFIX__';
const APP_VERSION='__ZERO_ONE_VERSION__';
const clientBuilds=new Map();
let releasePromise;
const validId=id=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id);
const ownedPath=path=>typeof path==='string'&&/^[-\w./]+$/.test(path)&&!path.startsWith('/')&&!path.split('/').some(p=>!p||p==='.'||p==='..');
const authReturn=url=>['code','state','error','id_token','access_token'].some(key=>url.searchParams.has(key));
const base=self.registration.scope;
async function readRelease(){const cache=await caches.open(CACHE_PREFIX+BUILD_ID);const stored=await cache.match(new URL('app-version.json',base));if(!stored)throw Error('Missing completed app cache');return stored.json();}
function release(){return releasePromise??=readRelease();}
async function install(){const url=new URL('app-version.json',base);url.searchParams.set('check',BUILD_ID);const response=await fetch(url,{cache:'no-store',credentials:'omit'});if(!response.ok)throw Error('Release unavailable');const data=await response.json();if(data.schema!==1||data.app!==APP||data.buildId!==BUILD_ID||!Array.isArray(data.files)||!data.files.length||data.files.length>300||!data.files.some(f=>f.path==='index.html'))throw Error('Mismatched release');const names=new Set();const cache=await caches.open(CACHE_PREFIX+BUILD_ID);for(const file of data.files){if(!ownedPath(file.path)||!validId(file.sha256)||names.has(file.path))throw Error('Invalid asset');names.add(file.path);const target=new URL(file.path,base);const request=new URL(target);request.searchParams.set('build',BUILD_ID);const fetched=await fetch(request,{cache:'no-store',credentials:'omit'});if(!fetched.ok||fetched.type==='opaque')throw Error('Asset unavailable');const bytes=await fetched.clone().arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');if(hash!==file.sha256)throw Error('Incomplete deployment');await cache.put(target,fetched);}await cache.put(new URL('app-version.json',base),new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}));}
self.addEventListener('install',event=>{event.waitUntil(install());}); // Existing clients keep their running code; wait for explicit update.
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());}); // No navigation, no storage/cache deletion.
self.addEventListener('message',event=>{
  const data=event.data,reply=value=>event.ports?.[0]?.postMessage(value);
  if(data?.type==='ZERO_ONE_CLIENT_BUILD'&&validId(data.buildId)&&event.source?.id){clientBuilds.set(event.source.id,data.buildId);return;}
  if(data?.type==='ZERO_ONE_RELEASE_INFO')event.waitUntil(release().then(()=>reply({buildId:BUILD_ID,ready:true})).catch(()=>reply({buildId:BUILD_ID,ready:false})));
  if(data?.type==='ZERO_ONE_APPLY_UPDATE')event.waitUntil(release().then(async()=>{if(data.buildId!==BUILD_ID){reply({accepted:false});return;}await self.skipWaiting();reply({accepted:true});}).catch(()=>reply({accepted:false})));
  if(data?.type==='offlineCheck')event.waitUntil(release().then(()=>event.source?.postMessage({type:'offlineStatus',version:APP_VERSION,buildId:BUILD_ID,appShellReady:true})).catch(()=>event.source?.postMessage({type:'offlineStatus',version:APP_VERSION,appShellReady:false})));
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==new URL(base).origin||!url.href.startsWith(base)||url.pathname===new URL('app-version.json',base).pathname||authReturn(url))return;
  event.respondWith((async()=>{const data=await release();const path=url.pathname.slice(new URL(base).pathname.length)||'index.html';if(!data.files.some(file=>file.path===path))return fetch(request);
    const requested=url.searchParams.get('build'),client=clientBuilds.get(event.clientId);const version=request.mode==='navigate'?BUILD_ID:validId(requested)?requested:client||BUILD_ID;
    const cache=await caches.open(CACHE_PREFIX+version);const response=await cache.match(new URL(path,base));if(response)return response;return fetch(request,{cache:'no-store'});
  })());
});
