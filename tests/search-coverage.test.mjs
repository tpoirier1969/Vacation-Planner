import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../planner.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const slice=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert.ok(i>=0&&j>i);return source.slice(i,j);};
test('Cafe and retail coffee categories are both queried',()=>{
 assert.match(source,/coffee_shops:'catering\.cafe,commercial\.food_and_drink\.coffee_and_tea'/);
 assert.match(source,/coffeeRetailTagged/);
 assert.match(source,/const DISCOVERY_PAGE_SIZE=100/);
});
test('Generic coffee in main map search opens paged discovery',()=>{
 const search=slice('async function searchLocation(query,store=false)',"$('#searchMatches').addEventListener");
 assert.match(search,/genericDiscoveryTerm\(term\)/);
 assert.match(search,/await discover\(false\)/);
});
test('Load next results is reachable before the result list',()=>{
 assert.ok(html.indexOf('id="discoverMore"')>0);
 assert.ok(html.indexOf('id="discoverMore"')<html.indexOf('id="suggestions"'));
});
test('Bounded OSM coffee lookup recognizes cafés and coffee retailers',async()=>{
 const code=slice('const osmCoffeeCache=new Map()','const discoveryCache=new Map()');
 const queries=[];
 const fetch=async url=>{queries.push(String(url));return {ok:true,json:async()=>({elements:[
  {type:'node',id:1,lat:45.15,lon:-87.1,tags:{name:'Village Café',amenity:'cafe'}},
  {type:'node',id:2,lat:45.2,lon:-87.2,tags:{name:'Bean Seller',shop:'coffee'}}
 ]})};};
 const params=URLSearchParams;
 const api=new Function('requestOsmElements','mapPlaceDistance',code+';return {osmCoffeePlaces,sameNearbyBusiness}')(async()=> (await fetch()).json(),()=>20);
 const rows=await api.osmCoffeePlaces('rect:-87.50000,44.90000,-86.90000,45.50000',null);
 assert.equal(rows.length,2);
 assert.ok(rows[0].properties.categories.includes('catering.cafe'));
 assert.ok(rows[1].properties.categories.includes('commercial.food_and_drink.coffee_and_tea'));
 assert.equal(queries.length,1);
 assert.equal(await api.osmCoffeePlaces('rect:-87.50000,44.90000,-86.90000,45.50000',null),rows);
 assert.equal(queries.length,1);
 assert.equal(api.sameNearbyBusiness({name:'Village Café',lat:1,lng:1},{name:'village café',lat:1,lng:1}),true);
});
test('Very large regions do not request public raw OSM data',async()=>{
 const code=slice('const osmCoffeeCache=new Map()','const discoveryCache=new Map()');
 let count=0;
 const api=new Function('requestOsmElements','mapPlaceDistance',code+';return osmCoffeePlaces')(
 async()=>{count++;throw Error('Not expected')},()=>0);
 const rows=await api('rect:-90.00000,40.00000,-70.00000,50.00000');
 assert.equal(rows.length,0);
 assert.equal(count,0);
});
