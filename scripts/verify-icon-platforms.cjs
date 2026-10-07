const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {chromium, webkit, devices} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const configs = require('./icon-platforms.json');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const profiles = {
  mac: [{name:'mac-webkit',engine:webkit,options:{viewport:{width:1440,height:1000}}},
        {name:'mac-chromium',engine:chromium,options:{viewport:{width:1440,height:1000}}}],
  windows: [{name:'windows-chrome',engine:chromium,channel:'chrome',options:{viewport:{width:1440,height:1000}}},
            {name:'windows-edge',engine:chromium,channel:'msedge',options:{viewport:{width:1440,height:1000}}}],
  mobile: [{name:'iphone-emulation',engine:webkit,options:devices['iPhone 13']},
           {name:'ipad-emulation',engine:webkit,options:devices['iPad Pro 11']},
           {name:'android-emulation',engine:chromium,options:devices['Pixel 7']}],
  local: [{name:'local-chromium',engine:chromium,options:{viewport:{width:1440,height:1000}}}]
};
(async()=>{
  const group=process.env.ICON_PLATFORM || 'local';
  assert(profiles[group],'Unknown platform');
  fs.mkdirSync('icon-platform-evidence',{recursive:true});
  const results=[];
  for(const profile of profiles[group]){
    const browser=await profile.engine.launch({channel:profile.channel,
      ...(process.env.CHROMIUM_PATH&&profile.engine===chromium?{executablePath:process.env.CHROMIUM_PATH}:{})});
    try{
      for(const app of configs){
        const context=await browser.newContext(profile.options);
        try{
          const page=await context.newPage();
          await page.goto(app.url,{waitUntil:'domcontentloaded'});
          await page.locator('link[rel="apple-touch-icon"]').waitFor({state:'attached'});
          if(['PRACTICE','TERMINOLOGY'].includes(app.name))
            await page.waitForURL(url=>url.searchParams.get('brand')==='20261007h',{waitUntil:'domcontentloaded'});
          const metadata=await page.evaluate(async()=>{
            const links=[...document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"]')]
              .map(link=>({kind:link.rel==='icon'?'favicon':'apple',url:link.href,type:link.type,sizes:link.sizes.value}));
            const manifestURL=document.querySelector('link[rel="manifest"]').href;
            const response=await fetch(manifestURL,{cache:'no-store'});
            if(!response.ok)throw Error('Manifest HTTP '+response.status);
            return {links,manifestURL,manifest:await response.json()};
          });
          const manifest=metadata.manifest;
          for(const [key,value] of Object.entries(app.identity))assert.equal(manifest[key],value,app.name+' '+key);
          assert.equal(manifest.display,'standalone');
          assert(manifest.icons.some(icon=>icon.sizes==='192x192'&&(icon.purpose||'any').split(' ').includes('any')));
          assert(manifest.icons.some(icon=>icon.sizes==='512x512'&&(icon.purpose||'any').split(' ').includes('any')));
          const sourceRoot=process.env.ICON_SOURCE_ROOT || '..';
          const assets=[];
          for(const asset of app.assets){
            const wanted=new URL(asset.remote,app.url);
            const refs=asset.kind==='manifest'?manifest.icons.map(icon=>new URL(icon.src,metadata.manifestURL).href):
              metadata.links.filter(link=>link.kind===asset.kind).map(link=>link.url);
            const url=refs.find(ref=>new URL(ref).pathname===wanted.pathname);
            assert(url,app.name+' missing '+asset.kind+' '+wanted.pathname);
            assert.equal(new URL(url).origin,new URL(app.url).origin);
            assert(new URL(url).pathname.startsWith(new URL(app.url).pathname),'App-specific icon URL');
            const response=await context.request.get(url);
            assert.equal(response.status(),200,url);
            const bytes=await response.body();
            const expected=fs.readFileSync(path.join(sourceRoot,app.repo,asset.local));
            assert.equal(sha(bytes),sha(expected),'Approved artwork differs: '+url);
            const dimensions=await page.evaluate(async url=>{const image=new Image();image.src=url;await image.decode();return [image.naturalWidth,image.naturalHeight];},url);
            assert.deepEqual(dimensions,[asset.size,asset.size]);
            assets.push({kind:asset.kind,url,dimensions,sha256:sha(bytes)});
          }
          // A new navigation with the same profile must retain the same declared icon.
          await page.reload({waitUntil:'domcontentloaded'});
          const apple=await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
          assert(apple&&new URL(apple,page.url()).pathname===new URL(app.assets.find(a=>a.kind==='apple').remote,app.url).pathname);
          await page.screenshot({path:`icon-platform-evidence/${profile.name}-${app.name}.png`});
          results.push({profile:profile.name,app:app.name,url:page.url(),assets,identity:app.identity,
            browserVersion:browser.version(),physicalBrowserChromeVerified:false});
          console.log('PASS',profile.name,app.name);
        }finally{await context.close();}
      }
    }finally{await browser.close();}
  }
  fs.writeFileSync('icon-platform-evidence/'+group+'.json',JSON.stringify({platform:process.platform,results,
    limits:['Safari Favorites database and OS launcher are outside Playwright','Mobile profiles are emulated, not physical devices']},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
