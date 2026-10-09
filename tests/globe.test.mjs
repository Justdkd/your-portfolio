import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const c = { window: {}, console };
vm.createContext(c); vm.runInContext(readFileSync(new URL('../public/assets/js/globe.js', import.meta.url), 'utf8'), c);
const M = c.window.PortfolioGlobe.math;
test('projection round-trips visible points around multiple views', () => {
  for (const view of [{ lon: 0, lat: 0 }, { lon: -8, lat: 40 }, { lon: 135, lat: 30 }]) {
    for (const lon of [view.lon - 15, view.lon, view.lon + 20]) {
      const lat = view.lat + 8, q = M.rotate(M.vec(lon, lat), view), back = M.unproject(q[1], q[2], view);
      assert.ok(Math.abs(M.normLon(back.lon - lon)) < 1e-8); assert.ok(Math.abs(back.lat - lat) < 1e-8);
    }
  }
  assert.equal(M.unproject(2, 2, { lon: 0, lat: 0 }), null);
});
test('great circle route preserves endpoints and handles same point', () => {
  const a = M.vec(2, 48), b = M.vec(-9, 38), points = M.arc(a, b, 64, 1);
  for (const i of [0, 1, 2]) { assert.ok(Math.abs(points[0][i] - a[i]) < 1e-9); assert.ok(Math.abs(points[64][i] - b[i]) < 1e-9); }
  assert.ok(M.arc(a, a, 8, 1).every(p => p.every(Number.isFinite)));
});
test('compact land data decodes into geographic rings', () => {
  const rings = M.decodeLand(JSON.parse(readFileSync(new URL('../public/assets/data/land-110m.json', import.meta.url))));
  assert.ok(rings.length > 10); assert.ok(rings.every(r => r.length >= 6));
  assert.ok(rings.every(r => r.every((n, i) => Number.isFinite(n) && Math.abs(n) <= (i % 2 ? 90.1 : 180.1))));
});
test('cluster preserves each place and separates distant pins', () => {
  const points = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 8, y: 0 }, { id: 'c', x: 100, y: 100 }];
  const groups = M.cluster(points, 18);
  assert.equal(groups.length, 2); assert.deepEqual(JSON.parse(JSON.stringify(groups[0].ids)), ['a', 'b']);
});
