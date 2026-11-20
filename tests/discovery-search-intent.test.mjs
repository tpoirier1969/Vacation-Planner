import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../planner.js',import.meta.url),'utf8');
const start=code.indexOf('const DISCOVERY_INTENTS='),end=code.indexOf('// "catering" is an OpenStreetMap category group.',start);
assert.ok(start>=0&&end>start);
const cats={restaurants:'catering.restaurant,catering.fast_food,catering.food_court',coffee_shops:'catering.cafe',lodging:'accommodation',attractions:'tourism',shopping:'commercial',wineries:'production.winery',hiking:'leisure',boating:'leisure',fishing:'sport',events:'entertainment'};
const {discoveryIntent}=new Function('DISCOVERY_CATEGORIES',code.slice(start,end)+'return {discoveryIntent};')(cats);
test('Broad restaurant terms and minor spelling errors are category queries',()=>{
 for(const text of ['steak house','steakhose','steakhouse','supper club','grill','restuarant','best steak house']){
  assert.equal(discoveryIntent(text)?.label,'restaurants',text);
  assert.equal(discoveryIntent(text)?.categories,cats.restaurants);
 }
});
test('Specific business names remain name searches',()=>{
 for(const text of ['The Old Post Office Restaurant','Fika Bakery & Coffee House','Whitefish Dunes Park'])
  assert.equal(discoveryIntent(text),null,text);
});
test('Map, along-route and toolbar searches recognize the same broad terms',()=>{
 assert.equal((code.match(/const intent=discoveryIntent\(term\),match=intent\|\|DISCOVERY_TERMS/g)||[]).length,2);
 assert.match(code,/function genericDiscoveryTerm\(term\)/);
 assert.match(code,/!!discoveryIntent\(term\)/);
 assert.match(code,/if\(!store&&genericDiscoveryTerm\(term\)\)/);
});
