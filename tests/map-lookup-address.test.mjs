import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../planner.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../planner.css',import.meta.url),'utf8');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)+a.length));
test('Map tap never treats nearby addresses as named businesses',()=>{
 const block=slice("async function showMapPlaceMenu(latlng,name=''","const placeDetailCache=");
 assert.ok(!block.includes('Nearby address'));
 assert.ok(!block.includes('geocode/reverse?'));
 assert.ok(block.includes('No named business was identified here'));
 assert.ok(block.includes("openPlace(latlng.lat,latlng.lng,'','','places','Other')"));
});
test('OSM lookup retries another source for named places',()=>{
 const block=slice('async function openStreetMapNearClick(latlng,signal)','async function showMapPlaceMenu(');
 assert.ok(block.includes('overpass-api.de/api/interpreter'));
 assert.ok(block.includes('overpass.kumi.systems/api/interpreter'));
 assert.ok(block.includes('if(signal?.aborted)break'));
});
test('Mobile trip header gives status its own row',()=>{
 assert.ok(css.includes('--phone-header:92px'));
 assert.ok(css.includes('top:49px;bottom:auto;left:0;right:92px'));
});
