import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../planner.js',import.meta.url),'utf8');
const a=code.indexOf('const DISCOVERY_INTENTS='),b=code.indexOf('// "catering" is an OpenStreetMap category group.',a);
const cats={restaurants:'catering.restaurant',coffee_shops:'catering.cafe',lodging:'accommodation',attractions:'tourism',shopping:'commercial',wineries:'production.winery',hiking:'leisure',boating:'leisure',fishing:'sport',events:'entertainment'};
const {discoveryNameMatches}=new Function('DISCOVERY_CATEGORIES','normalizedBusinessName',code.slice(a,b)+'return {discoveryNameMatches};')(
 cats,x=>String(x||'').replace(/^(?:the|an|a)\s+/i,'').trim());
test('Misspelled names get strict, local candidate matching',()=>{
 assert.equal(discoveryNameMatches('Fika Bakrey','Fika Bakery & Coffee House'),true);
 assert.equal(discoveryNameMatches('Old Post Ofice','The Old Post Office Restaurant'),true);
 assert.equal(discoveryNameMatches('Fika Bakrey','Whitefish Dunes Park'),false);
 assert.equal(discoveryNameMatches('Old Post Office','Old Lighthouse Restaurant'),false);
});
test('Fuzzy fallback uses no exact-name parameter but retains map or route filter',()=>{
 const top=code.slice(code.indexOf('async function searchLocation('),code.indexOf("$('#searchMatches').addEventListener"));
 const route=code.slice(code.indexOf('async function discoverAlongRoute('),code.indexOf('async function verifyCorridorDetour('));
 const map=code.slice(code.indexOf('async function discover(loadMore=false)'),code.indexOf('function planPlace(',code.indexOf('async function discover(loadMore=false)')));
 assert.match(top,/if\(!store&&!places\.length&&!geo\.length&&area\)/);
 assert.match(top,/filter:area/);
 assert.match(route,/const broad=\{\.\.\.body\};delete broad\.name/);
 assert.match(route,/item\.similarName=true/);
 assert.match(map,/if\(!found\.length&&nameFilter&&!loadMore\)/);
 assert.match(map,/discoveryNameMatches\(nameFilter,item\.name\)/);
 assert.match(map,/filter:area/);
});
test('List labels fuzzy matches as suggestions, not verified identities',()=>{
 assert.match(code,/Similar name — verify this is the intended place/);
 assert.match(code,/Similar names from a limited sample/);
 assert.match(code,/Similar name: verify place/);
 const a=code.indexOf('async function discoverAlongRoute('),b=code.indexOf('async function discover(loadMore=false)',a);
 assert.doesNotMatch(code.slice(a,b),/persist\(\)/);
});
