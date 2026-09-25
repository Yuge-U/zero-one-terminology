const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
test('all terms produce complete diagram frames or a readable concept guide',()=>{
 const context={window:{}};for(const file of ['motion-examples.js','diagrams.js'])vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 const terms=JSON.parse(fs.readFileSync(path.join(root,'terms.json'),'utf8'));let count=0;
 for(const t of terms){const model=context.window.MotionDiagram.plan(t);assert.ok(model.kind,t.ID);if(model.concept){assert.ok(model.definition,t.ID);continue}count++;assert.ok(model.frames.length);for(const f of model.frames){assert.ok(f.title);assert.ok(f.caption);for(const p of f.players)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));for(const a of f.arrows)assert.ok([a.x,a.y,a.X,a.Y].every(Number.isFinite));}}
 console.log(count+' terms with visual diagrams; '+(terms.length-count)+' concept guides');
});
