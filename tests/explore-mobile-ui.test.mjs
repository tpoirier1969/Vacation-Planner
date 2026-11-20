import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../planner.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../planner.css',import.meta.url),'utf8');
test('Map controls include Search, Layers, Add, Satellite, Expand on mobile',()=>{
 const row=html.match(/<div class="map-float"[^]*?<\/div>/)?.[0]||'';
 for(const id of ['mobileSearchToggle','mobileMapOptions','mapAdd','mapStyle','mapFullscreen'])
  assert.ok(row.includes('id="'+id+'"'));
 assert.match(js,/setMobileMapSearch\(!document\.body\.classList\.contains\('mobile-search-open'\)\)/);
 assert.match(css,/mobile-search-open #explore>\.toolbar\{display:flex\}/);
});
test('Search feedback and redirected category results are visible',()=>{
 const search=js.slice(js.indexOf('async function searchLocation('),js.indexOf("$('#searchMatches').addEventListener"));
 assert.match(search,/Enter a business, town, or address/);
 assert.match(search,/await discover\(false\)/);
 assert.match(search,/setMobileSheet\('expanded'\)/);
});
test('Collapsed Nearby places is a narrow file-folder tab, not a full width drawer',()=>{
 const tab=html.match(/<button id="mobileSheetHandle"[^]*?<\/button>/)?.[0]||'';
 assert.match(tab,/mobileSheetTitle/);assert.doesNotMatch(tab,/mobileSheetAction/);
 assert.match(css,/sheet-collapsed \.map-layout>aside\{[^}]*height:38px/);
});
test('Discover category and scope selectors share a row with compact text',()=>{
 const row=html.match(/<div class="discover-main-filters">[^]*?<\/div>/)?.[0]||'';
 assert.match(row,/id="category"/);assert.match(row,/id="discoverScope"/);
 assert.match(css,/\.discover-main-filters\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
 assert.match(css,/#exploreDiscoverPanel select\{font-size:14px/);
});
test('Number only list results, with white rounded cards',()=>{
 const cards=js.slice(js.indexOf('function discoveryCard('),js.indexOf('let corridorOffset=',js.indexOf('function discoveryCard(')));
 const pins=js.slice(js.indexOf('function renderDiscoveryMarkers('),js.indexOf('function refreshMarkers('));
 assert.match(cards,/class="poi-number"/);
 assert.match(cards,/\(i\+1\)\+'\\.'/);
 assert.match(css,/\.suggestions \.poi\{[^}]*background:#fff;[^}]*border-radius:9px/);
 assert.match(pins,/discovery-map-pin/);assert.doesNotMatch(pins,/poi-number/);
});
