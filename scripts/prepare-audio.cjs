const fs = require('fs'), crypto = require('crypto');
const terms = JSON.parse(fs.readFileSync('terms.json','utf8'));
const english = JSON.parse(fs.readFileSync('english.json','utf8'));
const texts = [...new Set([...terms.map(t=>t['正式/標準用語']),...Object.values(english).flatMap(e=>[e[0],e[2]])].filter(Boolean))];
const manifest = Object.fromEntries(texts.map(text=>[text, 'audio/'+crypto.createHash('sha256').update(text).digest('hex').slice(0,20)+'.wav']));
fs.writeFileSync('audio-manifest.js','window.TERM_AUDIO = '+JSON.stringify(manifest)+';\n');
fs.writeFileSync('audio/manifest.json',JSON.stringify(manifest,null,2));
console.log(texts.length+' audio clips');
