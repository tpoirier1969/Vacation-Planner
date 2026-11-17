import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const sandbox = { window: {}, URLSearchParams };
runInNewContext(readFileSync(new URL('../routes.js', import.meta.url), 'utf8'), sandbox, { filename: 'routes.js' });
const routeDomain = sandbox.window.VacationRouteDomain;
const encodedPath = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const point = (label, lat, lng, id) => ({ label, lat, lng, ...(id ? { id } : {}) });

function sampleRoute() {
  const route = routeDomain.newRoute('route-1', 'trip-1');
  route.start = point('Start', 41, -87);
  route.waypoints = [point('Stop A', 42, -88, 'a'), point('Stop B', 43, -89, 'b')];
  route.end = point('Finish', 44, -90);
  return route;
}

test('new routes support ordered day routes without changing legacy data', () => {
  const route = routeDomain.newRoute('r', 't');
  assert.equal(route.routeKind, 'day');
  assert.equal(route.routeOrder, 0);
  assert.equal(route.segments.length, 0);
  assert.equal(route.gaps.length, 0);
  assert.equal(route.visible, true);
});

test('database route kinds remain day or journey, with direction as an option', () => {
  const route = sampleRoute();
  assert.equal(route.routeKind, 'day');
  assert.equal(routeDomain.routeDisplayType(route), 'day');
  route.routeKind = 'journey';
  assert.equal(routeDomain.routeDisplayType(route), 'journey');
  route.preferences.journeyDirection = 'outbound';
  assert.equal(routeDomain.routeDisplayType(route), 'outbound');
  route.preferences.journeyDirection = 'return';
  assert.equal(routeDomain.routeDisplayType(route), 'return');
  assert.ok(['day', 'journey'].includes(route.routeKind));
});

test('leg identifiers are tied to stable stop IDs', () => {
  const route = sampleRoute();
  const legs = routeDomain.legPairs(route);
  assert.deepEqual(Array.from(legs, leg => leg.key), ['start::a', 'a::b', 'b::end']);
  assert.equal(legs.length, route.waypoints.length + 1);
});

test('Geoapify request creates one leg per stop, including road-shaping points', () => {
  const route = sampleRoute();
  const url = new URL(routeDomain.routeURL(route, 'example-browser-key'));
  assert.equal(url.searchParams.get('intermediate_waypoint_mode'), 'through_stop');
  assert.equal(url.searchParams.get('details'), 'polyline5');
  assert.equal(url.searchParams.get('waypoints').split('|').length, 4);
});

test('parseRoute preserves per-leg geometry, duration and distance', () => {
  const result = routeDomain.parseRoute({ features: [{ properties: {
    polyline5: encodedPath, distance: 25000, time: 3600,
    legs: [
      { polyline5: encodedPath, distance: 5000, time: 600 },
      { polyline5: encodedPath, distance: 8000, time: 1200 },
      { polyline5: encodedPath, distance: 12000, time: 1800 },
    ],
  }}] });
  assert.equal(result.segments.length, 3);
  assert.equal(result.legStats[1].durationS, 1200);
  assert.equal(result.distanceM, 25000);
  assert.equal(result.segments[2].polyline, encodedPath);
  assert.ok(routeDomain.decodePolyline(result.segments[2].polyline).length > 1);
});

test('deleted road leg does not remove either stop or any neighboring leg', () => {
  const route = sampleRoute();
  route.segments = routeDomain.legPairs(route).map(x => ({
    fromId: x.fromId, toId: x.toId, polyline: encodedPath, distanceM: 10000, durationS: 600,
  }));
  route.gaps = ['a::b'];
  const pieces = routeDomain.segmentList(route);
  assert.deepEqual(Array.from(pieces, p => p.disconnected), [false, true, false]);
  assert.equal(route.waypoints.length, 2);
  const savedGap = route.gaps[0];
  route.gaps = route.gaps.filter(g => g !== savedGap);
  assert.deepEqual(Array.from(routeDomain.segmentList(route), p => p.disconnected), [false, false, false]);
});

test('gapped section summary totals only connected road geometry', () => {
  const route = sampleRoute();
  route.distanceM = 30000;
  route.durationS = 2700;
  route.segments = routeDomain.legPairs(route).map(x => ({
    fromId: x.fromId, toId: x.toId, polyline: encodedPath, distanceM: 10000, durationS: 900,
  }));
  route.gaps = ['a::b'];
  assert.match(routeDomain.summary(route), /12 mi/);
  assert.match(routeDomain.summary(route), /30 min/);
  assert.match(routeDomain.summary(route), /1 disconnected section/);
});

test('legacy continuous routes keep their full geometry in memory until upgraded', () => {
  const route = sampleRoute();
  route.polyline = encodedPath;
  route.distanceM = 50000;
  route.durationS = 4000;
  route.legStats = [{ distanceM: 10000, durationS: 800 }];
  assert.equal(routeDomain.segmentList(route).length, 3);
  assert.equal(routeDomain.segmentList(route)[0].leg, null);
  assert.equal(route.polyline, encodedPath);
  assert.equal(routeDomain.summary(route).includes('disconnected'), false);
});

test('route calculator rejects malformed geometry', () => {
  assert.throws(() => routeDomain.parseRoute({features:[{properties:{polyline5:'',distance:3,time:4}}]}), /geometry/);
});
