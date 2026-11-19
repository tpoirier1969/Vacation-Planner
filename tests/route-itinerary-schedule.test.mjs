import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../routes.js',import.meta.url),'utf8');
const start=js.indexOf('function minutesOfDay('),end=js.indexOf('function createController(config)',start);
assert.ok(start>=0&&end>start);
const f=new Function(js.slice(start,end)+'return {itineraryDrivingAssessment,itinerarySnapshot};')();
const stop=(id,time,endTime='')=>({id,title:id,date:'2026-12-22',lat:45,lng:-87,time,endTime});
test('Driving leg too long for two fixed appointments is warned, not silently reordered',()=>{
 const result=f.itineraryDrivingAssessment([stop('Museum','10:00','11:00'),stop('Lunch','11:15')],[{durationS:1800}]);
 assert.equal(result.checked,true);
 assert.match(result.issues[0],/15 min after 11:15/);
});
test('Known leg travel fits and unknown visit duration cannot be asserted',()=>{
 const good=f.itineraryDrivingAssessment([stop('Museum','10:00','10:15'),stop('Lunch','11:00')],[{durationS:900}]);
 assert.equal(good.issues.length,0);
 const noLegs=f.itineraryDrivingAssessment([stop('Museum','10:00'),stop('Lunch','11:00')],[]);
 assert.equal(noLegs.checked,false);
});
test('Midnight end time is a valid departure, not a missing end time',()=>{
 const result=f.itineraryDrivingAssessment([stop('Night stop','23:00','00:00'),stop('Early stop','00:10')],[{durationS:1200}]);
 assert.equal(result.checked,true);
 assert.match(result.issues[0],/10 min after 00:10/);
});
test('Missing routing key is explained in the suggestion UI',()=>{
 assert.ok(js.includes("itinerarySuggestions.routeNote='Road estimates unavailable: routing API is not configured.'"));
 assert.ok(js.includes("itinerarySuggestions.routeNote?'<p class="));
});
test('Changed time or coordinates invalidates proposal signature',()=>{
 const a=[stop('Museum','10:00'),stop('Lunch','11:00')];
 const first=f.itinerarySnapshot(a,'2026-12-22');a[1].time='12:00';
 assert.notEqual(f.itinerarySnapshot(a,'2026-12-22'),first);
});
test('Preview uses actual road route and only saves on explicit acceptance',()=>{
 assert.ok(js.includes("option.roadMiles=result.distanceM/1609.344"));
 assert.ok(js.includes("option.assessment=itineraryDrivingAssessment(points,result.legStats)"));
 assert.ok(js.includes("itinerarySuggestions.snapshot!==itinerarySnapshot("));
 assert.ok(js.includes("config.getRoutes().push(r)"));
});
test('Conflict detection sums every road leg across an intervening flexible stop',()=>{
 const route=[stop('Museum','10:00','11:00'),stop('Coffee shop',''),stop('Dinner','11:30')];
 const result=f.itineraryDrivingAssessment(route,[{durationS:1200},{durationS:1200}]);
 assert.equal(result.checked,true);
 assert.equal(result.issues.length,1);
 assert.match(result.issues[0],/via 1 flexible stop/);
 assert.match(result.issues[0],/10 min after 11:30/);
 assert.match(result.message,/visit durations are unknown/);
});
test('Flexible stop order cannot be pronounced schedule-safe without visit durations',()=>{
 const route=[stop('Museum','10:00','10:30'),stop('Coffee shop',''),stop('Dinner','12:30')];
 const result=f.itineraryDrivingAssessment(route,[{durationS:900},{durationS:900}]);
 assert.equal(result.issues.length,0);
 assert.match(result.message,/flexible stops/);
 assert.match(result.message,/opening hours/);
});
