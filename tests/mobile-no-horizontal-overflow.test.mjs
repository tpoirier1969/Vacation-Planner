import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../planner.css',import.meta.url),'utf8');
const rules=readFileSync(new URL('../PROJECT_RULES.md',import.meta.url),'utf8');
function body(selector){
 const start=css.indexOf(selector+'{');
 assert.ok(start>=0,'Missing CSS selector '+selector);
 const end=css.indexOf('}',start);
 assert.ok(end>start);
 return css.slice(start,end+1);
}
test('Mobile workspace panels scroll vertically without a horizontal scroll track',()=>{
 const panel=body('body.mobile-workspace #workspace>.panel');
 assert.match(panel,/overflow-x:hidden/);
 assert.match(panel,/overflow-y:auto/);
 assert.match(panel,/overscroll-behavior-x:none/);
 assert.match(panel,/max-width:100%/);
});
test('Nearby Places Route and Discover drawer cannot be dragged into empty sideways space',()=>{
 const side=body('body.mobile-workspace .map-layout>aside .explore-side');
 assert.match(side,/overflow-x:hidden/);
 assert.match(side,/overflow-y:auto/);
 assert.match(side,/overscroll-behavior-x:none/);
 assert.match(side,/width:100%;min-width:0;max-width:100%/);
 const route=css.slice(css.indexOf('body.mobile-workspace #exploreRoutePanel,'),
  css.indexOf('body.mobile-workspace #exploreRoutePanel .two,'));
 assert.match(route,/body.mobile-workspace #exploreDiscoverPanel,/);
 assert.match(route,/width:100%;max-width:100%;min-width:0/);
});
test('Route controls shrink or wrap instead of forcing the inner panel wider',()=>{
 const field=body('body.mobile-workspace #exploreRoutePanel .route-picker-row button');
 assert.match(field,/max-width:100%/);
 assert.match(field,/overflow-wrap:anywhere/);
 const cards=body('body.mobile-workspace #exploreRoutePanel .route-itinerary-suggestions');
 assert.match(cards,/min-width:0;max-width:100%/);
});
test('Map remains draggable and zoomable, and universal no-drift standard is referenced',()=>{
 assert.match(css,/#map,\.map-frame \.leaflet-container\{touch-action:none!important/);
 assert.match(rules,/No accidental sideways movement/);
 assert.match(rules,/universal rule 44/);
});
