import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../planner.js',import.meta.url),'utf8');
const section=(a,b)=>{const x=src.indexOf(a),y=src.indexOf(b,x+a.length);assert.ok(x>=0&&y>x);return src.slice(x,y);};
const snippet=section('function pointInsideOsmWay(point,vertices)','async function showMapPlaceMenu(');
const fixture={elements:[
 {type:'node',id:1,lat:45.0469,lon:-87.2731},
 {type:'node',id:2,lat:45.0469,lon:-87.2729},
 {type:'node',id:3,lat:45.0471,lon:-87.2729},
 {type:'node',id:4,lat:45.0471,lon:-87.2731},
 {type:'way',id:100,nodes:[1,2,3,4,1],tags:{name:'Fika Bakery & Coffee House',shop:'bakery',building:'yes'}},
 {type:'node',id:5,lat:45.0478,lon:-87.2741,tags:{name:'Other Nearby Business',shop:'clothes'}}
]};
function makeApi(fetch){
 return new Function('fetch','AbortController','URLSearchParams','setTimeout','clearTimeout','mapPlaceDistance','safeExternalURL','detectedCategory',snippet+';return {namedOsmMapAtClick,pointInsideOsmWay}')(
 fetch,AbortController,URLSearchParams,setTimeout,clearTimeout,(a,b)=>Math.round(Math.hypot((a.lat-b.lat)*111000,(a.lng-b.lng)*79000)),x=>x,()=> 'Coffee Shops');
}
test('Tap inside the Fika OSM bakery outline uses the mapped name and precise tap location',async()=>{
 let request='';
 const api=makeApi(async url=>{request=String(url);return {ok:true,json:async()=>fixture};});
 const point={lat:45.047,lng:-87.273};
 const places=await api.namedOsmMapAtClick(point);
 const fika=places.find(p=>p.name==='Fika Bakery & Coffee House');
 assert.ok(fika,'named bakery discovered');
 assert.equal(fika.lat,point.lat);
 assert.equal(fika.lng,point.lng);
 assert.equal(fika.category,'Coffee Shops');
 assert.ok(fika.categories.includes('commercial.food_and_drink.bakery'));
 assert.ok(request.includes('api.openstreetmap.org/api/0.6/map.json?bbox='));
});
test('Outside a building polygon does not receive its name as a zero-distance hit',()=>{
 const polygon=[{lat:45.0469,lng:-87.2731},{lat:45.0469,lng:-87.2729},{lat:45.0471,lng:-87.2729},{lat:45.0471,lng:-87.2731}];
 const api=makeApi(async()=>({ok:true,json:async()=>fixture}));
 assert.equal(api.pointInsideOsmWay({lat:45.047,lng:-87.273},polygon),true);
 assert.equal(api.pointInsideOsmWay({lat:45.0475,lng:-87.273},polygon),false);
});
test('Fast nearby Places lookup precedes and gates both OSM fallbacks',()=>{
 const click=section('async function showMapPlaceMenu(latlng,name=\'\'','const placeDetailCache=');
 const primary=click.indexOf("await request('https://api.geoapify.com/v2/places?'+nearby)");
 const fallback=click.indexOf('namedOsmMapAtClick(latlng,controller.signal)');
 assert.ok(primary>=0&&fallback>primary);
 assert.ok(click.includes("const closeMatches=matches.filter(p=>mapPlaceDistance(latlng,p)<=35)"));
 assert.ok(click.includes('if(closeMatches.length){'));
 assert.ok(click.includes('matches=closeMatches;'));
 assert.ok(click.includes('Promise.allSettled(['));
 assert.ok(click.includes('openStreetMapNearClick(latlng,controller.signal)'));
 assert.ok(!click.includes('Promise.all(jobs)'));
 assert.ok(!click.includes("showManual('Place-name lookup is not configured."));
});
