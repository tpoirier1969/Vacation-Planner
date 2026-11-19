import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../planner.js',import.meta.url),'utf8'),html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const section=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)+a.length));
test('No radius selector; discovery and map searches use visible map area',()=>{
 assert.ok(!html.includes('discoverRadius'));
 const discovery=section('async function discover(loadMore=false)','function planPlace(');
 const name=section('async function searchLocation(query,store=false)',"$('#searchMatches').addEventListener");
 assert.ok(discovery.includes('visibleMapArea()'));
 assert.ok(name.includes("searchGroup(group,area)"));
 assert.ok(name.includes("geocode.set('filter',area)"));
 assert.ok(!name.includes('80467'));
 assert.ok(!name.includes('searchGroup(group,null)'));
});
test('Coffee keyword is a category and map results preserve pagination area',()=>{
 const d=section('const DISCOVERY_TERMS=[','function discoveryFoundPlace(');
 const generic=new Function(d+';return genericDiscoveryTerm')();
 assert.equal(generic('coffee'),true);
 assert.equal(generic('My Coffee House'),false);
 const search=section('async function discover(loadMore=false)','function planPlace(');
 assert.ok(search.includes('(loadMore&&discoveryArea)||visibleMapArea()'));
});
test('Map clicks attempt named OSM objects and preserve manual placement',()=>{
 assert.ok(src.includes('openStreetMapNearClick(latlng,controller.signal)'));
 assert.ok(src.includes('Save this exact point manually'));
 assert.ok(src.includes('overpass-api.de/api/interpreter'));
});

test('named OpenStreetMap fallback respects map bounds and classifies cafés',async()=>{
 const source=section('async function nominatimNamedSearch(term,area,limit=8)','function normalizedBusinessName(');
 const urls=[];
 const fakeFetch=async url=>{
  urls.push(new URL(String(url)));
  return {ok:true,json:async()=>[
   {name:'Village Café',class:'amenity',type:'cafe',lat:'45.154',lon:'-87.17',display_name:'Village Café, Door County, WI'}]};
 };
 const search=new Function('fetch','URLSearchParams',source+';return nominatimNamedSearch;')(fakeFetch,URLSearchParams);
 const results=await search('Village Café','rect:-87.50000,44.90000,-86.90000,45.50000');
 assert.equal(urls[0].searchParams.get('bounded'),'1');
 assert.equal(urls[0].searchParams.get('viewbox'),'-87.5,45.5,-86.9,44.9');
 assert.equal(results[0].properties.name,'Village Café');
 assert.deepEqual(results[0].properties.categories,['catering.cafe']);
});
test('both business search entry points have bounded name fallback',()=>{
 const location=section('async function searchLocation(query,store=false)',"$('#searchMatches').addEventListener");
 const nearby=section('async function discover(loadMore=false)','function planPlace(');
 assert.ok(location.includes('geo.push(...await nominatimNamedSearch(term,area))'));
 assert.ok(nearby.includes('if(!found.length&&nameFilter&&!loadMore)'));
 assert.ok(nearby.includes('nominatimNamedSearch(term,area,8)'));
 assert.ok(nearby.includes('expectedCategory'));
});
