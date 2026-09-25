const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
test('every term, sentence and call has non-empty PCM audio',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'audio/manifest.json'),'utf8'));
 const terms=JSON.parse(fs.readFileSync(path.join(root,'terms.json'),'utf8'));
 const english=JSON.parse(fs.readFileSync(path.join(root,'english.json'),'utf8'));
 for(const text of [...terms.map(t=>t['正式/標準用語']),...Object.values(english).flatMap(e=>[e[0],e[2]])].filter(Boolean)){
  assert.ok(manifest[text],text);const audio=fs.readFileSync(path.join(root,manifest[text]));assert.equal(audio.toString('ascii',0,4),'RIFF');assert.ok(audio.length>1000);assert.ok(audio.subarray(100).some(b=>b!==0),text);
 }
});
test('tap starts media synchronously, replacement stops prior audio, failures are visible',async()=>{
 const status={},players=[];
 class Audio {constructor(src){this.src=src;players.push(this)}play(){this.played=true;return Promise.resolve()}pause(){this.paused=true}removeAttribute(){}load(){}}
 const window={TERM_AUDIO:{Help:'audio/help.wav'}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'speech.js'),'utf8'),{window,Audio,document:{getElementById:()=>status},setTimeout:()=>1,clearTimeout(){}});
 window.speak('Help');assert.equal(players[0].played,true);assert.equal(players[0].src,'audio/help.wav');
 window.speak('Help');assert.equal(players[0].paused,true);players[0].onerror();assert.match(status.textContent,/読み込んで/);
 players[1].onerror();assert.match(status.textContent,/再生できません/);
 players[1].onplaying();assert.equal(status.hidden,true);
 window.speak('missing');assert.match(status.textContent,/まだ用意/);
});
