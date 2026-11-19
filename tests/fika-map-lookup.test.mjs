import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../planner.js',import.meta.url),'utf8');
const extract=(a,b)=>{const start=src.indexOf(a),end=src.indexOf(b,start+a.length);assert.ok(start>=0&&end>start);return src.slice(start,end)};
test('Fika-style bakery names are eligible in coffee discovery without including all bakeries',async()=>{
 const code=extract('const osmCoffeeCache=new Map();','const discoveryCache=new Map();');
 const fetch=async()=>({ok:true,json:async()=>({elements:[
  {lat:45.15,lon:-87.17,tags:{name:'Fika Bakery & Coffee House',shop:'bakery'}},
  {lat:45.16,lon:-87.17,tags:{name:'Plain Bakery',shop:'bakery'}},
  {center:{lat:45.151,lon:-87.171},tags:{name:'Another Coffee House',building:'commercial'}},
  {lat:45.18,lon:-87.18,tags:{name:'Village Café',amenity:'cafe'}}
 ]})});
 const api=new Function('fetch','URLSearchParams','mapPlaceDistance',code+';return osmCoffeePlaces')(fetch,URLSearchParams,()=>10);
 const places=await api('rect:-87.50000,44.90000,-86.90000,45.50000');
 assert.deepEqual(places.map(x=>x.properties.name),['Fika Bakery & Coffee House','Another Coffee House','Village Café']);
 assert.ok(places[0].properties.categories.includes('commercial.food_and_drink.bakery'));
});
test('Tap lookup always checks OSM and never suggests a 217m-away hotel',()=>{
 const click=extract("async function showMapPlaceMenu(latlng,name=''","const placeDetailCache=");
 assert.ok(click.includes('matches.push(...await openStreetMapNearClick(latlng,controller.signal))'));
 assert.ok(!click.includes('if(!matches.some(p=>mapPlaceDistance(latlng,p)<=45))'));
 assert.ok(click.includes('if(mapPlaceDistance(latlng,p)>180)return false'));
 assert.ok(click.includes('Save exact clicked point instead'));
});
test('Named bakery or building map object remains eligible in a tap lookup',async()=>{
 const code=extract('async function openStreetMapNearClick(latlng,signal)','async function showMapPlaceMenu(');
 const fetch=async()=>({ok:true,json:async()=>({elements:[
  {type:'way',center:{lat:45.15,lon:-87.17},tags:{name:'Fika Bakery & Coffee House',shop:'bakery'}},
  {type:'way',center:{lat:45.151,lon:-87.171},tags:{name:'Coffee House',building:'commercial'}}
 ]})});
 const api=new Function('fetch','URLSearchParams','mapPlaceDistance','safeExternalURL','detectedCategory',code+';return openStreetMapNearClick')(
  fetch,URLSearchParams,()=>50,x=>x,()=> 'Coffee Shops');
 const rows=await api({lat:45.15,lng:-87.17});
 assert.equal(rows.length,2);
 assert.equal(rows[0].name,'Fika Bakery & Coffee House');
 assert.ok(rows[0].categories.includes('commercial.food_and_drink.bakery'));
});
