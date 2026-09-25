const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('speech starts synchronously, selects local English, resumes and exposes failures',()=>{
 const status={},calls=[],voice={lang:'en-US',localService:true};let utterance;
 const synth={getVoices:()=>[{lang:'ja-JP'},voice],addEventListener(){},paused:true,speaking:false,pending:false,speak(u){calls.push('speak');utterance=u},resume(){calls.push('resume')},cancel(){calls.push('cancel')}};
 const window={navigator:{audioSession:{type:"auto"}},speechSynthesis:synth,SpeechSynthesisUtterance:function(text){this.text=text}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'..','speech.js'),'utf8'),{window,SpeechSynthesisUtterance:window.SpeechSynthesisUtterance,document:{getElementById:()=>status},setTimeout:()=>1,clearTimeout(){}});
 window.speak('Help side');assert.equal(window.navigator.audioSession.type,'playback');assert.deepEqual(calls,['speak','resume']);assert.equal(utterance.voice,voice);assert.equal(utterance.volume,1);
 utterance.onstart();assert.match(status.textContent,/再生中/);utterance.onerror();assert.match(status.textContent,/再生できませんでした/);
 delete window.navigator.audioSession;assert.doesNotThrow(()=>window.speak('Help'));
 Object.defineProperty(window.navigator,'audioSession',{get(){throw new Error('unavailable')}});assert.doesNotThrow(()=>window.speak('Help'));
});
