import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../planner.js',import.meta.url),'utf8');
const start=src.indexOf("async function showMapPlaceMenu(latlng,name=''");
const end=src.indexOf('const placeDetailCache=',start);
assert.ok(start>=0&&end>start);
const popup=src.slice(start,end);
test('Limit popup choices to five closest valid businesses',()=>{
 assert.match(popup,/matches\.sort\(\(a,b\)=>mapPlaceDistance\(latlng,a\)-mapPlaceDistance\(latlng,b\)\)/);
 assert.match(popup,/if\(distinct\.some\(x=>sameNearbyBusiness\(x,p\)\)\)return false/);
 assert.match(popup,/\.slice\(0,5\)/);
 assert.doesNotMatch(popup,/\.slice\(0,10\)/);
});
test('Business selection cannot bubble into the map click handler',()=>{
 assert.match(popup,/L\.DomEvent\.disableClickPropagation\(box\)/);
 assert.match(popup,/\['pointerdown','touchstart','click','dblclick','contextmenu'\]/);
 assert.match(popup,/button\.onclick=e=>\{L\.DomEvent\.stop\(e\);select\(place\);\}/);
 assert.match(popup,/manual\.onclick=e=>\{L\.DomEvent\.stop\(e\);map\?\.closePopup\(\)/);
});
test('Geoapify failure permits OSM fallback without a ReferenceError',()=>{
 assert.doesNotMatch(popup,/placeError=e/);
 assert.match(popup,/catch\{\/\* A failed primary lookup triggers/);
 assert.match(popup,/Promise\.allSettled\(\[/);
});
