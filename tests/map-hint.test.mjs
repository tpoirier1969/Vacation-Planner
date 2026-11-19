import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../planner.js',import.meta.url),'utf8');
test('ordinary map browsing has no drag/pinch overlay',()=>{
 assert.ok(html.includes('id="mapHint" class="map-hint hidden"'));
 assert.ok(!html.includes('Drag to explore · Pinch to zoom'));
 assert.ok(!js.includes('Drag to explore · Pinch to zoom'));
});
test('map mode provides guidance only during active editing',()=>{
 const start=js.indexOf('function syncMapMode()');
 const end=js.indexOf('function syncExpanded()',start);
 assert.ok(start>=0&&end>start);
 const code=js.slice(start,end);
 assert.ok(code.includes("$('#mapHint').classList.toggle('hidden',!routeMode&&!addingPlace)"));
 assert.ok(code.includes("addingPlace?'Tap the map where you want to save a place':''"));
});
