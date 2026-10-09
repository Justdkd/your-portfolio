import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, cpSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const file = new URL('../tools/content.mjs', import.meta.url);
const T = existsSync(file) ? await import(file) : {};

test('both template files validate with existing local media', () => {
  for (const mode of ['traveler', 'creator']) assert.deepEqual(T.checkContent(mode).errors, []);
});
test('unknown template selection is refused', () => { assert.throws(() => T.checkContent('../private'), /traveler.*creator/); });
test('static metadata follows the default language and escapes strings', () => {
  const meta = T.meta({ site: { name: { zh: '<demo>', en: 'Demo' }, defaultLanguage: 'zh', description: { zh: 'A & B' }, url: 'https://example.com/portfolio/', shareImage: 'assets/media/atlas.svg' } });
  assert.match(meta, /<title>&lt;demo&gt;<\/title>/);
  assert.match(meta, /content="A &amp; B"/);
  assert.match(meta, /https:\/\/example.com\/portfolio\/assets\/media\/atlas.svg/);
});
test('metadata omits unconfigured absolute share URLs', () => {
  assert.doesNotMatch(T.meta({ site: { name: { zh: 'Demo' }, defaultLanguage: 'zh', url: '' } }), /og:url|og:image/);
});
test('selected template export contains no other template or project documents', () => {
  const out = mkdtempSync(join(tmpdir(), 'portfolio-export-test-'));
  try {
    T.exportTemplate('creator', join(out, 'site'));
    assert.ok(existsSync(join(out, 'site/index.html')));
    assert.ok(existsSync(join(out, 'site/assets/js/app.js')));
    assert.equal(existsSync(join(out, 'site/traveler')), false);
    assert.equal(existsSync(join(out, 'site/README.md')), false);
    assert.equal(existsSync(join(out, 'site/assets/media/kyoto.svg')), false);
    assert.equal(existsSync(join(out, 'site/assets/media/madrid.svg')), false);
    assert.ok(existsSync(join(out, 'site/assets/media/atlas.svg')));
    assert.doesNotMatch(readFileSync(join(out, 'site/content.yaml'), 'utf8'), /\.\.\/assets/);
    assert.match(readFileSync(join(out, 'site/index.html'), 'utf8'), /<title>林序<\/title>/);
    assert.doesNotMatch(readFileSync(join(out, 'site/index.html'), 'utf8'), /\.\.\/assets/);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
test('HLS export follows only declared local dependencies and rejects paths outside assets', () => {
  const out = mkdtempSync(join(tmpdir(), 'portfolio-hls-test-'));
  try {
    cpSync(join(root, 'public'), join(out, 'public'), { recursive: true });
    const media = join(out, 'public/assets/media/hls-demo'); mkdirSync(media);
    writeFileSync(join(media, 'index.m3u8'), '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2.0,\nsegment.m4s\n');
    writeFileSync(join(media, 'init.mp4'), 'test init'); writeFileSync(join(media, 'segment.m4s'), 'test segment');
    writeFileSync(join(media, 'unreferenced.txt'), 'must not publish');
    const c = T.loadContent('creator', out); c.projects.items[0].hls = '../assets/media/hls-demo/index.m3u8';
    writeFileSync(join(out, 'public/creator/content.yaml'), T.YAML.dump(c));
    T.exportTemplate('creator', join(out, 'site'), out);
    assert.ok(existsSync(join(out, 'site/assets/media/hls-demo/init.mp4')));
    assert.ok(existsSync(join(out, 'site/assets/media/hls-demo/segment.m4s')));
    assert.equal(existsSync(join(out, 'site/assets/media/hls-demo/unreferenced.txt')), false);
    writeFileSync(join(media, 'index.m3u8'), '#EXTM3U\n../../../../README.md\n');
    assert.throws(() => T.exportTemplate('creator', join(out, 'unsafe-site'), out), /outside assets/);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
test('missing media produces a field-specific error', () => {
  const out = mkdtempSync(join(tmpdir(), 'portfolio-resource-test-'));
  try {
    cpSync(join(root, 'public'), join(out, 'public'), { recursive: true });
    rmSync(join(out, 'public/assets/media/atlas.svg'));
    const errors = T.checkContent('creator', out).errors.join('\n');
    assert.match(errors, /projects.items\[0\]\.cover/);
    assert.match(errors, /atlas\.svg/);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
