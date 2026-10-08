/* App assets only. This module never reads, clears or migrates user/auth storage. */
(function(root){
  'use strict';
  const validId=id=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id);
  const authReturn=url=>['code','state','error','id_token','access_token'].some(key=>url.searchParams.has(key)||new URLSearchParams(url.hash.slice(1)).has(key));
  function validateRelease(value,app){
    if(value?.schema!==1||value.app!==app||!validId(value.buildId)||!Array.isArray(value.files)||!value.files.length||value.files.length>300)throw Error('配信情報を確認できません。');
    const names=new Set();for(const item of value.files){if(typeof item.path!=='string'||!/^[-\w./]+$/.test(item.path)||item.path.startsWith('/')||item.path.split('/').some(p=>!p||p==='.'||p==='..')||!validId(item.sha256)||names.has(item.path))throw Error('配信情報を確認できません。');names.add(item.path);}
    if(!names.has('index.html'))throw Error('配信情報を確認できません。');return value;
  }
  async function verifyAsset(response,expected){if(!response.ok||response.type==='opaque')throw Error('更新ファイルを取得できません。');const bytes=await response.clone().arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);const actual=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');if(actual!==expected)throw Error('配信の完了を確認できません。少し待って再試行してください。');return response;}
  function rpc(worker,message,timeout=4000){return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('更新の準備が完了しませんでした。再試行してください。'));},timeout);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};worker.postMessage(message,[channel.port2]);});}
  function start({app,buildId,swPath='',versionMount='',guard=()=>root.ZeroOneUpdateGuard?.(),base=new URL('./',location.href)}){
    if(!validId(buildId))return null;
    let latest=null,checking=null,applying=false,lastCheck=0,registration=null,panel,message,button;
    base=new URL(base);
    function protection(){try{const state=guard();if(!state||state.ready===false)return '保存機能の準備が終わってから更新してください。';if(state.busy)return '保存・同期が完了してから更新してください。';if(state.dirty)return state.message||'編集中の内容を保存してから更新してください。';return '';}catch{return '保存状態を確認できないため更新を停止しました。';}}
    function draw(text){if(!panel){panel=document.createElement('aside');panel.id='zeroOneUpdateNotice';panel.className='zou-notice';panel.setAttribute('aria-label','アプリの更新');message=document.createElement('p');message.id='zeroOneUpdateMessage';message.setAttribute('role','status');button=document.createElement('button');button.type='button';button.textContent='更新する';button.setAttribute('aria-describedby',message.id);button.addEventListener('click',apply);panel.append(message,button);document.body.append(panel);}panel.hidden=!latest;message.textContent=text||'新しいバージョンがあります';button.disabled=applying||!navigator.onLine;}
    function publishClient(){navigator.serviceWorker?.controller?.postMessage({type:'ZERO_ONE_CLIENT_BUILD',buildId});}
    async function released(){const url=new URL('app-version.json',base);url.searchParams.set('check',String(Date.now()));const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const response=await fetch(url,{cache:'no-store',credentials:'omit',signal:controller.signal});if(!response.ok)throw Error('配信情報を取得できません。');return validateRelease(await response.json(),app);}finally{clearTimeout(timer);}}
    async function workerReady(target){registration??=await navigator.serviceWorker.register(new URL(swPath,base),{scope:base.href,updateViaCache:'none'});await registration.update();const deadline=Date.now()+15000;while(Date.now()<deadline){const worker=registration.waiting||registration.active;if(worker){try{const info=await rpc(worker,{type:'ZERO_ONE_RELEASE_INFO'},1500);if(info.buildId===target.buildId&&info.ready)return worker;}catch{}}await new Promise(resolve=>setTimeout(resolve,100));}throw Error('更新の準備が完了していません。少し待って再試行してください。');}
    async function check(force=false){if(checking||applying||document.hidden||!navigator.onLine||authReturn(new URL(location.href))||(!force&&Date.now()-lastCheck<60000))return checking;lastCheck=Date.now();checking=(async()=>{try{const release=await released();latest=release.buildId===buildId?null:release;if(latest&&swPath)await workerReady(latest);if(latest||panel)draw();}catch{if(panel&&latest)draw('新しいバージョンがあります。通信復帰後に更新できます。');}finally{checking=null;}})();return checking;}
    async function apply(){if(applying||!latest)return;const reason=protection();if(reason){draw(reason);return;}if(!navigator.onLine){draw('通信復帰後に更新してください。');return;}applying=true;draw('更新を準備しています…');let locked=[];
      try{const release=await released();if(release.buildId!==latest.buildId){latest=release.buildId===buildId?null:release;throw Error('配信版が変わりました。もう一度確認してください。');}
        let worker;if(swPath)worker=await workerReady(release);else{for(const file of release.files){const url=new URL(file.path,base);url.searchParams.set('build',release.buildId);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{await verifyAsset(await fetch(url,{cache:'no-store',credentials:'omit',signal:controller.signal}),file.sha256);}finally{clearTimeout(timer);}}}
        const finalReason=protection();if(finalReason)throw Error(finalReason);if(authReturn(new URL(location.href)))throw Error('接続処理が終わってから更新してください。');
        // Lock user input only for the final activation, after downloads and a second guard.
        locked=[...document.body.children].filter(el=>el!==panel&&!el.inert);locked.forEach(el=>el.inert=true);
        if(worker){const result=await rpc(worker,{type:'ZERO_ONE_APPLY_UPDATE',buildId:release.buildId},10000);if(!result.accepted)throw Error('更新の準備が完了していません。');await new Promise((resolve,reject)=>{if(worker.state==='activated')return resolve();const timer=setTimeout(()=>{worker.removeEventListener('statechange',changed);reject(Error('更新の切替を確認できません。再試行してください。'));},10000);const changed=()=>{if(worker.state==='activated'){clearTimeout(timer);worker.removeEventListener('statechange',changed);resolve();}};worker.addEventListener('statechange',changed);changed();});}
        const afterActivation=protection();if(afterActivation)throw Error(afterActivation);
        // Preserve the standalone path and unrelated parameters/hash. Never alter OAuth returns.
        const destination=new URL(location.href);destination.searchParams.set('zeroOneBuild',release.buildId);location.replace(destination.href);
      }catch(error){locked.forEach(el=>el.inert=false);applying=false;draw(error.message||'更新できませんでした。現在のアプリを引き続き利用できます。');}
    }
    if(versionMount){const mount=document.querySelector(versionMount);if(mount){const p=document.createElement('p');p.className='zou-version';p.textContent='アプリ版：'+buildId.slice(0,12);mount.append(p);}}
    publishClient();navigator.serviceWorker?.addEventListener('controllerchange',publishClient); // Never auto-reload a retained editor.
    if(swPath&&'serviceWorker'in navigator)navigator.serviceWorker.register(new URL(swPath,base),{scope:base.href,updateViaCache:'none'}).then(r=>{registration=r;publishClient();}).catch(()=>{});
    const foreground=()=>{if(!document.hidden){publishClient();check();}};window.addEventListener('pageshow',foreground);window.addEventListener('focus',foreground);document.addEventListener('visibilitychange',foreground);window.addEventListener('online',()=>{if(panel)draw();foreground();});window.addEventListener('offline',()=>{if(panel)draw();});setInterval(foreground,300000);check();
    return {check,apply,get current(){return buildId;},get available(){return latest?.buildId||null;}};
  }
  const api={start,validateRelease,verifyAsset,authReturn,validId};if(typeof module!=='undefined'&&module.exports)module.exports=api;else{root.ZeroOneUpdate=api;const boot=()=>{const meta=document.querySelector('meta[name="zero-one-build"]');if(meta)root.zeroOneUpdater=start({app:meta.dataset.app,buildId:meta.content,swPath:meta.dataset.worker||'',versionMount:meta.dataset.versionMount||''});};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();}
})(globalThis);
