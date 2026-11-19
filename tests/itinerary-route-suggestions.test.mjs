import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../routes.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=js.indexOf('function straightLineMiles('),end=js.indexOf('function createController(config)',start);
assert.ok(start>=0&&end>start);
const domain=new Function('pointOK','MAX_WAYPOINTS',js.slice(start,end)+';return {suggestItineraryRoutes};')(
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
