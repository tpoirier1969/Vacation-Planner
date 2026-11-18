import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('all loaded discovery results receive numbered markers; map fits all pages and opens on mobile',()=>{
 const src=readFileSync(new URL('../planner.js',import.meta.url),'utf8');
 const start=src.indexOf('function renderDiscoveryMarkers(found){');
 const end=src.indexOf('function refreshMarkers(){',start);
 assert.ok(start>=0&&end>start);
 const code=src.slice(start,end);
 const markers=[],calls={fit:0,points:[],sheet:[],mapTab:[],clears:0};
 const discoveries=[
  {name:'Place one',lat:46.5,lng:-87.4},
  {name:'Place two',lat:46.8,lng:-87.1},
  {name:'Place three on a second page',lat:47,lng:-86.9}
 ];
 const layer={clearLayers(){calls.clears++;}};
 const map={
  invalidateSize(){},
  fitBounds(bounds){calls.fit++;calls.points=bounds.points;},
  setView(){throw Error('Multiple results must use fitBounds');}
 };
 const L={
  divIcon(x){return x;},
  marker(p,opts){markers.push({p,opts});return{addTo(){return this;},bindPopup(){return this;},bindTooltip(){return this;},on(){return this;}};},
  latLngBounds(points){return{points,pad(){return this;}};}
 };
 const window={__tripSuggestions:discoveries,matchMedia(){return{matches:true};}};
 const geo=x=>Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lng));
 const scope={map,discoveryMarkers:layer,L,window,geo,
  makeDiscoveryPopup:()=>({content:{},load(){}}),
  setTab:x=>calls.mapTab.push(x),
  setMobileSheet:x=>calls.sheet.push(x),
  requestAnimationFrame:f=>f()
 };
 runInNewContext(code,scope);
 scope.renderDiscoveryMarkers(discoveries);
 assert.equal(markers.length,3);
 assert.deepEqual(markers.map(x=>x.opts.title),['1. Place one','2. Place two','3. Place three on a second page']);
 scope.showDiscoveryResultsOnMap();
 assert.equal(calls.fit,1);
 assert.equal(calls.points.length,3);
 assert.deepEqual(calls.sheet,['collapsed']);
 assert.deepEqual(calls.mapTab,['explore']);
});
test('discovery UI includes an explicit show-all-map action and maintains paginated results',()=>{
 const js=readFileSync(new URL('../planner.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="discoverShowOnMap"/);
 assert.match(js,/mapButton\.textContent='Show all '\+found\.length\+' on map'/);
 assert.match(js,/const found=\[\.\.\.previous,\.\.\.additions\]/);
 assert.match(js,/if\(found\.length\)showDiscoveryResultsOnMap\(\)/);
});
