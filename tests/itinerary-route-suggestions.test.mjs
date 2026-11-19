import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../routes.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=js.indexOf('function straightLineMiles('),end=js.indexOf('function createController(config)',start);
assert.ok(start>=0&&end>start);
const domain=new Function('pointOK','MAX_WAYPOINTS',js.slice(start,end)+';return {suggestItineraryRoutes,itineraryTripOverview,smartDailyItinerary,tentativeDayTimeline};')(
 p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&p.lat!=null&&p.lng!=null,16);
const item=(id,lat,lng,time='',day='2026-12-22')=>({id,title:id,lat,lng,time,date:day});
test('Timed appointments stay chronologically ordered, flexible stops remain optional to reorder',()=>{
 const data=[item('dinner',45.1,-87.1,'18:00'),item('museum',45.2,-87.2,'10:00'),item('gallery',45.15,-87.15),item('coffee',45.21,-87.21)];
 const result=domain.suggestItineraryRoutes(data,'2026-12-22');
 assert.ok(result.options.length>=1);
 assert.deepEqual(result.options[0].ids.slice(0,2),['museum','dinner']);
 assert.ok(result.options.every(x=>x.ids.indexOf('museum')<x.ids.indexOf('dinner')));
 assert.ok(result.options.every(x=>Number.isFinite(x.directMiles)));
});
test('Missing locations do not create invented points, and old trip days are excluded',()=>{
 const data=[item('first',45,-87,'09:00'),item('unmapped',null,null),item('next',45.3,-87.3,'13:00'),item('otherday',45,-87,'','2026-12-23')];
 const p=domain.suggestItineraryRoutes(data,'2026-12-22');
 assert.equal(p.excluded,1);
 assert.deepEqual(p.options[0].ids,['first','next']);
});
test('Only one mapped stop cannot be converted into a driving route',()=>{
 const p=domain.suggestItineraryRoutes([item('single',45,-87)],'2026-12-22');
 assert.equal(p.options.length,0);
 assert.match(p.reason,/At least two/);
});
test('Review is separate from accepting/saving and does not overwrite itinerary',()=>{
 assert.ok(html.includes('id="routeSuggestItinerary"'));
 assert.ok(html.includes('id="routeItineraryOptions"'));
 assert.match(js,/function acceptItinerarySuggestion\(index\)/);
 assert.ok(js.includes("const r=newRoute")||js.includes("r=newRoute"));
 assert.ok(js.includes('config.getRoutes().push(r)'));
 assert.ok(js.includes('config.persist()'));
 assert.ok(js.includes("sourceType:'activities'"));
});
test('Flexible stops can be inserted geographically between fixed appointments',()=>{
 const data=[
  item('museum',45,-87,'10:00'),
  item('dinner',45,-87.2,'18:00'),
  item('coffee',45,-87.07),
  item('gallery',45,-87.14)
 ];
 const result=domain.suggestItineraryRoutes(data,'2026-12-22');
 assert.equal(result.options.length,2);
 assert.deepEqual(result.options[0].ids,['museum','dinner','coffee','gallery']);
 const inserted=result.options[1];
 assert.equal(inserted.label,'Flexible stops between appointments (tentative)');
 assert.equal(inserted.ids[0],'museum');
 assert.equal(inserted.ids.at(-1),'dinner');
 assert.ok(inserted.ids.indexOf('coffee')<inserted.ids.indexOf('dinner'));
 assert.ok(inserted.ids.indexOf('gallery')<inserted.ids.indexOf('dinner'));
 assert.ok(inserted.directMiles<result.options[0].directMiles);
});
test('Very tight scheduled appointments do not receive physically impossible insertions',()=>{
 const data=[
  item('appointment-1',45,-87,'10:00'),
  {...item('appointment-2',45,-88,'10:05'),endTime:''},
  item('coffee-near-middle',45,-87.5)
 ];
 const result=domain.suggestItineraryRoutes(data,'2026-12-22');
 assert.equal(result.options.length,1);
 assert.deepEqual(result.options[0].ids,['appointment-1','appointment-2','coffee-near-middle']);
});

test('Estimated visit duration is preview-only and not a saved route setting',()=>{
 assert.match(html,/id="routeVisitEstimate"/);
 assert.match(js,/option\.roadLegStats=result\.legStats/);
 assert.match(js,/routeVisitEstimate'\)\.addEventListener\('change'/);
});

test('Trip-wide overview lists each dated day and distinguishes mapped from unmapped',()=>{
 const data=[
  item('museum',45,-87,'10:00','2026-12-22'),
  item('dinner',45,-87.2,'18:00','2026-12-22'),
  item('unmapped',null,null,'','2026-12-22'),
  item('single',46,-86,'','2026-12-23'),
  item('undated',45,-87,'','')
 ];
 const days=domain.itineraryTripOverview(data);
 assert.deepEqual(days.map(x=>x.day),['2026-12-22','2026-12-23']);
 assert.equal(days[0].mapped,2);assert.equal(days[0].unmapped,1);
 assert.equal(days[0].timed,2);assert.equal(days[0].routeable,true);
 assert.equal(days[1].routeable,false);assert.equal(days[1].bestDirectMiles,null);
});
test('Overview is read-only and exposes an explicit per-day review action',()=>{
 assert.match(html,/id="routeTripOverviewRows"/);
 assert.match(js,/data-route-review-day/);
 assert.match(js,/function itineraryTripOverview/);
 assert.match(js,/void previewItinerary\(\)/);
 const pair=[item('a',45,-87,'09:00'),item('b',45,-87.1,'13:00')];
 const prior=JSON.stringify(pair);domain.itineraryTripOverview(pair);assert.equal(JSON.stringify(pair),prior);
});

test('Smart daily plan inserts flexible early and preserves appointment chronology and data',()=>{
 const rows=[
  {...item('museum',45,-87,'11:00'),endTime:'12:00'},
  {...item('dinner',45,-87.12,'18:00'),endTime:'19:00'},
  {...item('morning bakery',45,-87.01),hours:'Mo-Su 09:00-11:00'},
  item('gallery',45,-87.06)
 ];
 const untouched=JSON.stringify(rows);
 const plan=domain.smartDailyItinerary(rows,'2026-12-22',{dayStart:'09:00',dayEnd:'20:00',estimatedVisitMinutes:30});
 assert.ok(plan.ids.indexOf('morning bakery')<plan.ids.indexOf('museum'));
 assert.ok(plan.ids.indexOf('museum')<plan.ids.indexOf('dinner'));
 assert.ok(plan.ids.indexOf('gallery')<plan.ids.indexOf('dinner'));
 assert.equal(JSON.stringify(rows),untouched);
});
test('Impossible flexible detours are listed rather than silently dropped',()=>{
 const rows=[{...item('museum',45,-87,'09:00'),endTime:'12:00'},
 {...item('lunch',45,-87.1,'12:15'),endTime:'12:45'},item('far stop',47,-87.1)];
 const plan=domain.smartDailyItinerary(rows,'2026-12-22',{dayStart:'09:00',dayEnd:'13:00',estimatedVisitMinutes:60});
 assert.deepEqual(plan.ids,['museum','lunch']);
 assert.deepEqual(plan.unplaced,['far stop']);
});
test('Daily proposals are explicitly opt-in',()=>{
 const data=[item('first',45,-87,'10:00'),item('second',45,-87.12,'18:00'),item('coffee',45,-87.02)];
 assert.ok(domain.suggestItineraryRoutes(data,'2026-12-22').options.every(x=>x.label!=='Tentative daily schedule'));
 assert.ok(domain.suggestItineraryRoutes(data,'2026-12-22',{smart:true,dayStart:'09:00',dayEnd:'21:00',estimatedVisitMinutes:30})
  .options.some(x=>x.label==='Tentative daily schedule'));
});
