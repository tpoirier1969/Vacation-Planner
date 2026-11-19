import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function domains(){
 const window={};
 runInNewContext(readFileSync(new URL('../itinerary.js',import.meta.url),'utf8'),{window});
 runInNewContext(readFileSync(new URL('../ideas.js',import.meta.url),'utf8'),{window});
 return window;
}
test('Idea search matches name, location, notes and category without changing input rows',()=>{
 const {VacationIdeas:ideas}=domains();
 const rows=[
  {id:'a',name:'Grand Teton Museum',category:'Attractions',notes:'Open on Sunday',location:'Jackson'},
  {id:'b',name:'Coffee Roaster',category:'Coffee Shops',notes:'Great espresso',location:'Bozeman'},
  {id:'c',name:'Fishing access',category:'Fishing',notes:'Boat ramp',location:'Yellowstone'}
 ];
 const before=JSON.stringify(rows);
 assert.equal(ideas.filterForList(rows,'all',' jackson ').length,1);
 assert.equal(ideas.filterForList(rows,'all','BOAT RAMP')[0].id,'c');
 assert.equal(ideas.filterForList(rows,'Coffee Shops','espresso')[0].id,'b');
 assert.equal(ideas.filterForList(rows,'Coffee Shops','Museum').length,0);
 assert.equal(ideas.filterForList(rows,'all','').length,3);
 assert.equal(JSON.stringify(rows),before);
});
test('Itinerary views preserve unscheduled, booking, must-do and all records',()=>{
 const {VacationItinerary:itinerary}=domains();
 const rows=[
  {id:'a',date:'2026-12-20',reservationStatus:'needed',mustDo:true},
  {id:'b',date:'',reservationStatus:'none',mustDo:false},
  {id:'c',date:'2026-12-21',reservationStatus:'booked',mustDo:true}
 ];
 const snapshot=JSON.stringify(rows);
 assert.deepEqual(Array.from(itinerary.filterForView(rows,'booking'),x=>x.id),['a']);
 assert.deepEqual(Array.from(itinerary.filterForView(rows,'unscheduled'),x=>x.id),['b']);
 assert.deepEqual(Array.from(itinerary.filterForView(rows,'mustdo'),x=>x.id),['a','c']);
 assert.equal(itinerary.filterForView(rows,'all').length,3);
 assert.equal(JSON.stringify(rows),snapshot);
});
test('Planner includes responsive Ideas search, Itinerary filters and accessible form expansion',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const planner=readFileSync(new URL('../planner.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../planner.css',import.meta.url),'utf8');
 for(const id of ['ideaSearch','ideaClearSearch','ideaCategoryCount','itineraryView','itineraryViewCount'])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const view of ['all','unscheduled','booking','mustdo'])
  assert.ok(html.includes('value="'+view+'"'),view);
 assert.ok(planner.includes("Ideas.filterForList("));
 assert.ok(planner.includes("Itinerary.filterForView("));
 assert.ok(planner.includes("moveOptional('#activityForm',['#activityHoursField'"));
 assert.ok(!planner.includes("moveOptional('#activityForm',['.two'"));
 assert.ok(css.includes('.itinerary-toolbar'));
 assert.ok(css.includes('.idea-search-row'));
 assert.match(html,/id="mobileShowActivityForm"[^>]*aria-expanded="false"/);
});

test('Mobile bottom navigation uses label-sized buttons rather than full-width stretched tabs',()=>{
 const css=readFileSync(new URL('../planner.css',import.meta.url),'utf8');
 const start=css.indexOf(' body.mobile-workspace #tabs{');
 const end=css.indexOf(' body.mobile-workspace #tabs .nav-long',start);
 assert.ok(start>0&&end>start);
 const nav=css.slice(start,end);
 assert.match(nav,/justify-content:space-evenly/);
 assert.match(nav,/flex:0 1 auto/);
 assert.match(nav,/min-height:40px/);
 assert.doesNotMatch(nav,/flex:1 1 0/);
});
test('Ideas and Itinerary each show all actions in a single button row',()=>{
 const js=readFileSync(new URL('../planner.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../planner.css',import.meta.url),'utf8');
 assert.match(js,/class="row entry-button-row"'\+editAndRemove\('places',x\)/);
 assert.match(js,/class="row entry-button-row"'\+editAndRemove\('activities',x\)/);
 assert.match(css,/\.entry-button-row\{display:flex;flex-wrap:nowrap/);
 assert.match(css,/\.entry-button-row \.entry-actions\{display:contents\}/);
 assert.match(css,/\.entry-button-row button,\.entry-button-row \.entry-actions button\{/);
 const mobile=css.slice(css.indexOf('@media(max-width:760px){',css.indexOf('.entry-button-row{')));
 assert.match(mobile,/body\.mobile-workspace #placeList \.entry-button-row/);
 assert.match(mobile,/white-space:normal;overflow-wrap:anywhere/);
});
