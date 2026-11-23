// Run with: node --test tests/regression.test.cjs
// Source-level regression checks. These do not replace browser or Supabase end-to-end tests.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('all first-party JavaScript files parse',()=>{
 for(const file of ['planner.js','cloud.js','routes.js','ideas.js','itinerary.js','version.js']){
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}),file);
 }
});

test('journal controls exist and are optional during initialization',()=>{
 const html=read('index.html'),js=read('planner.js');
 for(const id of ['journalView','journalTrip','journalSearch','checkinList'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/const el=\$\('#'\+id\);if\(el\)el\.addEventListener/);
});

test('cross-trip check-in edits retain their original trip',()=>{
 assert.match(read('planner.js'),/tripId:old\?\.tripId\|\|active,name:d\.name\.trim\(\)/);
});

test('rating fields round-trip through Supabase mapping',()=>{
 const js=read('cloud.js');
 for(const key of ['places','activities']){
  const write=js.match(new RegExp("if\\(kind==='"+key+"'\\)return \\{\\.\\.\\.base,[^\\n]+"));
  const readBack=js.match(new RegExp("if\\(kind==='"+key+"'\\)return \\{id:r\\.id,[^\\n]+"));
  assert.ok(write&&readBack,'mapping for '+key);
  for(const field of ['interest_rating','cost_rating'])assert.ok(write[0].includes(field),'write '+key+' '+field);
  for(const field of ['interestRating','costRating'])assert.ok(readBack[0].includes(field),'read '+key+' '+field);
 }
});

test('manual map placement stores coordinates for both record types',()=>{
 const js=read('planner.js');
 assert.match(js,/lat:manualIdeaLocation\?\.lat\?\?null,lng:manualIdeaLocation\?\.lng\?\?null/);
 assert.match(js,/lat:loc\.lat\?\?null,lng:loc\.lng\?\?null/);
});

test('saved place check-in preserves links and coordinates',()=>{
 const js=read('planner.js');
 assert.match(js,/function checkinFromSaved\(kind,id\)/);
 assert.match(js,/const coords=geo\(x\)\?x:\(linked&&geo\(linked\)\?linked:null\)/);
});
