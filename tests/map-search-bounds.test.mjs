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
