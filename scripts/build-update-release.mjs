import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {createHash} from 'node:crypto';
const config=JSON.parse(await readFile(process.argv.slice(2).find(arg=>!arg.startsWith('--'))||'update-release.config.json','utf8'));
const root=resolve(config.root||'.'),check=process.argv.includes('--check'),hash=data=>createHash('sha256').update(data).digest('hex');
function assetUrls(html,change){return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,tag=>{const end=tag.indexOf('>')+1,opening=tag.slice(0,end);const attribute=opening.startsWith('<script')?'src':/\brel=["']stylesheet["']/.test(opening)?'href':null;if(!attribute)return tag;return opening.replace(new RegExp('('+attribute+'=)([\"\'])([^\"\']+)\\2'),(_,prefix,quote,value)=>prefix+quote+change(value)+quote)+tag.slice(end);});}
const files=new Set(config.files||[]);
async function scan(directory,recursive){for(const entry of await readdir(join(root,directory),{withFileTypes:true})){const name=directory?directory+'/'+entry.name:entry.name;if(entry.isFile()&&['.js','.mjs','.css','.html','.json','.wasm','.webmanifest'].includes(extname(name))&&!['app-version.json','update-release.config.json','package.json','package-lock.json'].includes(name))files.add(name);else if(recursive&&entry.isDirectory())await scan(name,true);}}
if(!config.files){await scan('',false);for(const directory of config.directories||[])await scan(directory,true);}
// Preserve the existing manifest/icon URLs and cache their static bodies in SW apps.
if(!config.files)for(const name of [...files].filter(name=>name.endsWith('.html'))){const html=await readFile(join(root,name),'utf8');for(const match of html.matchAll(/<(?:img|link)\b[^>]*(?:src|href)=["']([^"']+)["']/g)){const value=match[1];if(/^(?:https?:|\/\/|data:|#)/.test(value))continue;const path=value.replace(/^\.\//,'').split(/[?#]/)[0];if(/\.(?:png|webp|svg|ico|webmanifest)$/.test(path)&&!path.includes('..')&&!path.startsWith('/'))files.add(path);}}
const htmlNames=[...files].filter(name=>name.endsWith('.html'));const canonical=new Map();
for(const name of [...files].sort()){
  let bytes=await readFile(join(root,name));
  if(htmlNames.includes(name)){
    let html=assetUrls(bytes.toString().replace(/<meta name="zero-one-build"[^>]*>\n?/g,''),value=>{const [name,query]=value.split('?');if(query===undefined)return value;const params=query.split('&').filter(part=>!/^build=[a-f0-9]{64}$/.test(part));return name+(params.length?'?'+params.join('&'):'');});
    if(!html.includes('zero-one-update.js'))html=html.replace('</body>','<script defer src="./zero-one-update.js"></script>\n</body>');
    if(!html.includes('zero-one-update.css'))html=html.replace('</head>','<link rel="stylesheet" href="./zero-one-update.css">\n</head>');
    canonical.set(name,Buffer.from(html));
  }else if(name===config.worker){canonical.set(name,Buffer.from(bytes.toString().replace(/const BUILD_ID='[a-f0-9]{64}';/,"const BUILD_ID='__ZERO_ONE_BUILD__';")));}
  else canonical.set(name,bytes);
}
const buildId=hash(Buffer.concat([...canonical].flatMap(([name,bytes])=>[Buffer.from(name+'\0'),bytes,Buffer.from('\0')])));
const outputs=new Map();
for(const [name,bytes] of canonical){let final=bytes;
  if(htmlNames.includes(name)){let html=bytes.toString();const meta=`<meta name="zero-one-build" content="${buildId}" data-app="${config.app}" data-worker="${config.worker||''}" data-version-mount="${config.versionMount||''}">\n`;html=html.replace('<head>','<head>'+meta);
    html=assetUrls(html,url=>/^(?:https?:|\/\/|data:)/.test(url)?url:url+(url.includes('?')?'&':'?')+'build='+buildId);final=Buffer.from(html);
  }else if(name===config.worker)final=Buffer.from(bytes.toString().replace('__ZERO_ONE_BUILD__',buildId));outputs.set(name,final);
}
const release={schema:1,app:config.app,buildId,files:[...outputs].map(([path,bytes])=>({path,sha256:hash(bytes)}))};outputs.set('app-version.json',Buffer.from(JSON.stringify(release,null,2)+'\n'));
for(const [name,bytes]of outputs){if(check){if(!(await readFile(join(root,name))).equals(bytes))throw Error('Stale update release: '+name);}else await writeFile(join(root,name),bytes);}
console.log(`${config.app}: ${buildId.slice(0,12)}, ${release.files.length} verified application assets${check?' (unchanged)':''}`);
