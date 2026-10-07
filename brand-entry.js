if(location.protocol==='https:'||location.hostname==='127.0.0.1'||location.hostname==='localhost'){
  const entry=new URL(location.href);
  const authKeys=['code','state','error','id_token','access_token'];
  const authReturn=[...entry.searchParams.keys(),...new URLSearchParams(entry.hash.slice(1)).keys()].some(key=>authKeys.includes(key));
  if(!authReturn&&entry.searchParams.get('brand')!=='20261007k'){
    entry.searchParams.set('brand','20261007k');
    location.replace(entry.href);
  }
}
