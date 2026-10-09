import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {}, console, URL };
vm.createContext(context);
const file = new URL('../public/assets/js/model.js', import.meta.url);
if (existsSync(file)) vm.runInContext(readFileSync(file, 'utf8'), context);
const M = context.window.HomepageModel || {};
const plain = value => JSON.parse(JSON.stringify(value));
const base = () => ({ site: { name: { zh: '演示', en: 'Demo' }, languages: ['zh', 'en'], defaultLanguage: 'zh' }, person: { bio: { zh: '介绍' } }, sections: [{ id: 'about' }, { id: 'projects' }, { id: 'trips' }, { id: 'contact' }], contact: { email: 'hello@example.com' } });
const trips = () => ({ home: { name: { zh: '起点' }, lat: 48, lon: 2 }, places: { porto: { name: { zh: '波尔图' }, country: { en: 'Portugal' }, lat: 41.1, lon: -8.6 }, oslo: { name: { zh: '奥斯陆' }, country: { en: 'Norway' }, lat: 59.9, lon: 10.7 } }, episodes: [{ id: 'first', date: '2024-05', stops: ['porto'] }, { id: 'again', date: '2025-06', stops: ['porto'] }, { id: 'future', date: '2099-01', stops: ['oslo'] }] });

test('localized content falls back and handles missing values', () => {
  assert.equal(M.pick({ zh: '中文' }, 'en'), '中文');
  assert.equal(M.pick(null, 'zh'), '');
  assert.equal(M.pick('text', 'zh'), 'text');
});
test('sections honor order and switches and omit empty modules', () => {
  const c = base(); c.projects = { items: [{ id: 'one' }] }; c.sections[0].enabled = false;
  assert.deepEqual(plain(M.sections(c)).map(s => s.id), ['projects', 'contact']);
});
test('repeat visits count as trips but future trips do not inflate places or countries', () => {
  const m = M.derive(trips(), '2026-10');
  assert.deepEqual(plain(m.stats), { trips: 2, places: 1, countries: 1 });
  assert.equal(m.places.porto.eps.length, 2);
  assert.equal(m.episodes[2].upcoming, true);
  assert.equal(m.episodes[2].nextNo, 3);
});
test('empty travel data is usable without private defaults', () => {
  const m = M.derive(null, '2026-10');
  assert.deepEqual(plain(m.stats), { trips: 0, places: 0, countries: 0 });
  assert.equal(m.home.lat, 0);
});
test('URLs reject executable protocols, controls and protocol-relative resources', () => {
  ['javascript:alert(1)', 'data:text/html,x', '//tracker.test/x', 'java\nscript:x', 'file:///x'].forEach(s => assert.equal(M.safeUrl(s, 'link'), ''));
  assert.equal(M.safeUrl('https://example.com/work', 'link'), 'https://example.com/work');
  assert.equal(M.safeUrl('mailto:hello@example.com', 'link'), 'mailto:hello@example.com');
  assert.equal(M.safeUrl('../assets/media/photo.webp', 'media'), '../assets/media/photo.webp');
  assert.equal(M.safeUrl('../../private.txt', 'media'), '');
});
test('valid bilingual content is accepted', () => {
  const c = base(); c.trips = trips();
  assert.deepEqual(plain(M.validate(c)), []);
});
test('invalid month, unknown stop and duplicate trip ids name their fields', () => {
  const c = base(); c.trips = trips();
  c.trips.episodes.push({ id: 'first', date: '2025-13', stops: ['missing'] });
  const errors = M.validate(c).join('\n');
  assert.match(errors, /episodes\[3\]\.id/);
  assert.match(errors, /episodes\[3\]\.date/);
  assert.match(errors, /episodes\[3\]\.stops/);
});
test('out of range coordinates are rejected', () => {
  const c = base(); c.trips = trips(); c.trips.places.porto.lat = 91;
  assert.match(M.validate(c).join('\n'), /places\.porto\.lat/);
});
test('invalid module, duplicate module and unavailable language are rejected', () => {
  const c = base(); c.sections.push({ id: 'about' }, { id: 'unknown' }); c.site.defaultLanguage = 'fr';
  const e = M.validate(c).join('\n');
  assert.match(e, /sections\[4\]/); assert.match(e, /sections\[5\]/); assert.match(e, /defaultLanguage/);
});
test('unsafe project links and duplicate project ids are rejected', () => {
  const c = base(); c.projects = { items: [{ id: 'same', link: 'javascript:x' }, { id: 'same' }] };
  const e = M.validate(c).join('\n'); assert.match(e, /projects.items\[0\]\.link/); assert.match(e, /projects.items\[1\]\.id/);
});
test('project videos and site URLs must use safe supported protocols', () => {
  const c = base(); c.site.url = 'mailto:hello@example.com'; c.projects = { items: [{ id: 'film', video: 'javascript:x' }] };
  const e = M.validate(c).join('\n'); assert.match(e, /site.url/); assert.match(e, /projects.items\[0\]\.video/);
});
test('empty optional contact and photo do not create active sections', () => {
  const c = base(); c.contact = {}; c.person = {};
  assert.equal(M.sections(c).length, 0);
});
test('data validation is safe for a non-object content file', () => {
  assert.ok(M.validate(null).length); assert.ok(M.validate('bad').length);
});
