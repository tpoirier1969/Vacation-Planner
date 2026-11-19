import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const routes=readFileSync(new URL('../routes.js',import.meta.url),'utf8');
const planner=readFileSync(new URL('../planner.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=routes.indexOf('function decodePolyline('),end=routes.indexOf('function sameRoad(',start);
assert.ok(start>=0&&end>start);
const api=new Function('pointOK','straightLineMiles',routes.slice(start,end)+'return {routeDiscoveryGeometry,nearestRoadWindow};')(
 p=>p?.lat!=null&&p?.lng!=null,
 (a,b)=>Math.hypot(a.lat-b.lat,(a.lng-b.lng)*.7)*69);
const example='_p~iF~ps|U_ulLnnqC';
test('Saved calculated road polyline is the corridor, not straight waypoint connectors',()=>{
 const x=api.routeDiscoveryGeometry({polyline:example});
 assert.equal(x.filter.type,'polyline');assert.equal(x.filter.encoding,'polyline5');
 assert.equal(x.filter.geometry,example);assert.equal(x.lines[0].length,2);
 assert.equal(api.routeDiscoveryGeometry({start:{lat:45,lng:-87},end:{lat:45,lng:-86}}),null);
});
test('Disconnected road sections remain separate with GeoJSON longitude latitude order',()=>{
 const x=api.routeDiscoveryGeometry({segments:[{polyline:example},{polyline:example}],polyline:''});
 assert.equal(x.filter.geometry.type,'MultiLineString');
 assert.equal(x.filter.geometry.coordinates.length,2);
 assert.equal(x.filter.geometry.coordinates[0][0].length,2);
});
test('Selected candidate has a connected local road window',()=>{
 const x=api.nearestRoadWindow({polyline:example},{lat:40.7,lng:-120.95});
 assert.ok(x);assert.ok(x.start&&x.end);assert.ok(Number.isFinite(x.distanceMiles));
});
test('Search uses POST polyline and existing card/map render with explicit detour verification',()=>{
 for(const id of ['discoverScope','discoverRoute','discoverDetourMinutes','discoverRouteControls'])
  assert.ok(html.includes('id="'+id+'"'));
 assert.match(planner,/async function discoverAlongRoute\(loadMore=false\)/);
 assert.match(planner,/method:'POST'/);
 assert.match(planner,/filter:\{\.\.\.geometry\.filter,buffer\}/);
 assert.match(planner,/const found=\[\.\.\.previous,\.\.\.newItems\]/);
 assert.match(planner,/renderDiscoveryMarkers\(found\)/);
 assert.match(planner,/data-detour-check/);
 assert.match(planner,/if\(\$\('#discoverScope'\)\.value==='route'\)return discoverAlongRoute\(loadMore\)/);
});
test('Searching and checking never persist or overwrite a saved route',()=>{
 const a=planner.indexOf('async function discoverAlongRoute(');
 const z=planner.indexOf('async function discover(loadMore=false)',a);
 const section=planner.slice(a,z);
 assert.ok(!section.includes('persist()'));
 assert.ok(!section.includes('cloudSave('));
 assert.ok(section.includes('corridorFingerprint(route)'));
 assert.ok(section.includes('domain.routeURL('));
});
