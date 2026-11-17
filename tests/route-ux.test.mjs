import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function harness() {
  const controls = new Map();
  class Control {
    constructor() {
      this.value = '';
      this.textContent = '';
      this.innerHTML = '';
      this.dataset = {};
      this.checked = true;
      this.disabled = false;
      this.handlers = {};
      this.classList = { toggle() {}, add() {}, remove() {} };
    }
    addEventListener(type, handler) { this.handlers[type] = handler; }
    setAttribute() {}
  }
  const document = {
    getElementById(id) {
      if (!controls.has(id)) controls.set(id, new Control());
      return controls.get(id);
    },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  const window = {};
  runInNewContext(readFileSync(new URL('../routes.js', import.meta.url), 'utf8'), { window, document, URLSearchParams });
  const route = window.VacationRouteDomain.newRoute('r1', 'trip1');
  route.startDate = '2026-12-22';
  let saves = 0, nextId = 0;
  const activities = [
    { id: 'late', title: 'Later activity', date: '2026-12-22', time: '15:00', lat: 46.6, lng: -87.3 },
    { id: 'early', title: 'Early activity', date: '2026-12-22', time: '09:00', lat: 46.5, lng: -87.4 },
    { id: 'wrong-day', title: 'Different day', date: '2026-12-23', time: '11:00', lat: 46.2, lng: -87.1 },
    { id: 'unmapped', title: 'No location', date: '2026-12-22', time: '08:00' },
  ];
  const controller = window.createVacationRoutes({
    getTrip: () => ({ id: 'trip1' }),
    getRoutes: () => [route],
    getPlaces: () => [],
    getActivities: () => activities,
    uid: () => 'new-' + (++nextId),
    persist: () => { saves++; },
    onPickChange() {},
  });
  controller.render();
  return { route, controls, activities, getSaves: () => saves };
}

test('route types never violate the existing day/journey database constraint', () => {
  const { route, controls, getSaves } = harness();
  const selector = controls.get('routeKind');
  for (const [choice, expectedKind, expectedDirection] of [
    ['outbound', 'journey', 'outbound'],
    ['return', 'journey', 'return'],
    ['day', 'day', ''],
    ['journey', 'journey', ''],
  ]) {
    selector.handlers.change({ target: { value: choice } });
    assert.equal(route.routeKind, expectedKind);
    assert.equal(route.preferences.journeyDirection, expectedDirection);
  }
  assert.equal(getSaves(), 4);
});

test('itinerary import preserves dates, orders new stops and avoids duplicates', () => {
  const { route, controls, activities, getSaves } = harness();
  route.waypoints = [{ id:'previous', sourceType:'activities', sourceId:'early', kind:'stop', lat:46.5,lng:-87.4 }];
  const original = JSON.stringify(activities);
  controls.get('routeFromItinerary').handlers.click();
  assert.equal(route.waypoints.length, 2);
  assert.equal(route.waypoints[1].sourceId, 'late');
  assert.equal(route.waypoints.filter(p => p.sourceId === 'early').length, 1);
  assert.equal(JSON.stringify(activities), original);
  assert.equal(getSaves(), 1);
});
