import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { browser } from './browser.mjs';

const root = fileURLToPath(new URL('../public', import.meta.url));
const out = fileURLToPath(new URL('../.local/screenshots', import.meta.url));
mkdirSync(out, { recursive: true });
const b = await browser(root);
let passes = 0, failures = 0;
let errors = [];
b.on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails.text));
b.on('Network.responseReceived', p => { if (p.response.status >= 400 && !p.response.url.endsWith('favicon.ico')) errors.push(p.response.status + ' ' + p.response.url); });
async function check(name, fn) { try { await fn(); passes++; console.log('PASS ' + name); } catch (e) { failures++; console.error('FAIL ' + name + ': ' + e.message); } }
async function click(selector) { await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function capture(file) { const r = await b.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, file), Buffer.from(r.data, 'base64')); }
try {
  for (const mode of ['traveler', 'creator']) {
    await check(mode + ' desktop and localized content', async () => {
      errors = []; await b.size(1440, 1000); await b.navigate('/' + mode + '/');
      assert.ok(await b.evaluate('document.querySelector("h1").textContent.length > 3'));
      assert.ok(await b.evaluate('document.querySelectorAll("main > section").length >= 4'));
      await click('#lang-toggle'); assert.equal(await b.evaluate('document.documentElement.lang'), 'en');
      await click('#lang-toggle'); assert.equal(await b.evaluate('document.documentElement.lang'), 'zh-CN');
      assert.deepEqual(errors, []); await capture(mode + '-desktop.png');
    });
    await check(mode + ' responsive 320–1440 in both languages', async () => {
      for (const lang of ['zh', 'en']) {
        if (await b.evaluate('document.documentElement.lang') !== (lang === 'zh' ? 'zh-CN' : 'en')) await click('#lang-toggle');
        for (const width of [320, 375, 390, 768, 1024, 1440]) {
          await b.size(width, 844, width < 768);
          await b.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
          assert.ok(await b.evaluate('document.documentElement.scrollWidth <= innerWidth'), mode + '/' + lang + '/' + width);
        }
      }
      await click('#lang-toggle'); await b.size(390, 844, true); await capture(mode + '-mobile.png');
    });
  }
  await check('project dialog, direct route, refresh, escape and history', async () => {
    await b.navigate('/creator/'); await click('[data-route="projects/atlas"]'); await b.wait('document.querySelector("dialog").open');
    assert.equal(await b.evaluate('location.hash'), '#projects/atlas');
    await b.send('Page.reload'); await b.wait('document.body.dataset.ready === "true" && document.querySelector("dialog").open');
    await click('#detail-close'); await b.wait('!document.querySelector("dialog").open');
    await b.navigate('/creator/'); await click('[data-route="projects/atlas"]');
    await b.evaluate('history.back()'); await b.wait('!document.querySelector("dialog").open');
    assert.ok(await b.evaluate('document.activeElement.matches("[data-route]")'));
    await b.navigate('/creator/#projects/atlas'); await b.wait('document.querySelector("dialog").open');
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await b.wait('!document.querySelector("dialog").open');
  });
  await check('travel place with repeat visit and episode selection', async () => {
    await b.navigate('/traveler/#trips/madrid/second-madrid');
    await b.wait('document.querySelector("dialog").open');
    await b.wait('document.querySelector(".globe-pin")');
    assert.equal(await b.evaluate('document.querySelector(".globe-pin.is-selected")?.dataset.id'), 'madrid');
    assert.ok(await b.evaluate('document.querySelectorAll("[data-episode]").length >= 2'));
    assert.ok(await b.evaluate('document.querySelector("dialog img").complete'));
    await click('#detail-close');
  });
  await check('globe canvas, accessible pins, zoom and pointer drag', async () => {
    await b.navigate('/traveler/'); await b.wait('document.querySelector(".globe-pin")');
    await b.evaluate('document.querySelector(".globe-wrap").scrollIntoView()');
    await click('#zoom-in'); await b.wait('document.querySelector(".globe-root").classList.contains("is-zoomed")');
    assert.ok(await b.evaluate('document.querySelector(".globe-canvas").width > 0'));
    assert.ok(await b.evaluate('[...document.querySelectorAll(".globe-pin")].every(p=>p.getAttribute("aria-label"))'));
    const rect = await b.evaluate('JSON.parse(JSON.stringify(document.querySelector(".globe-canvas").getBoundingClientRect()))');
    const x = Math.round(rect.x + rect.width / 2), y = Math.round(rect.y + rect.height / 2);
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 45, y: y + 10 }] });
    await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.deepEqual(errors, []);
  });
  await check('module order, disabled deep link, long copy and single language', async () => {
    const raw = readFileSync(join(root, 'creator/content.yaml'), 'utf8');
    const data = await b.evaluate(`jsyaml.load(${JSON.stringify(raw)})`);
    data.site.languages = ['zh']; data.site.name.zh = '一位名字很长但应该始终完整显示的独立创作者';
    data.sections = [{ id: 'contact', title: { zh: '联系' } }, { id: 'about', title: { zh: '介绍' } }, { id: 'projects', enabled: false }];
    b.overrides.set('/creator/content.yaml', JSON.stringify(data)); await b.navigate('/creator/#projects/atlas');
    assert.equal(await b.evaluate('document.querySelector("#lang-toggle").hidden'), true);
    assert.deepEqual(await b.evaluate('[...document.querySelectorAll("main > section:not(.hero)")].map(s=>s.id)'), ['contact', 'about']);
    assert.equal(await b.evaluate('document.querySelector("dialog").open'), false);
    assert.ok(await b.evaluate('document.querySelector("#route-status").textContent.length > 0'));
    assert.ok(await b.evaluate('document.querySelector("#route-status a")'));
    await click('#route-status a'); await b.wait('document.querySelector("#route-status").hidden');
    assert.ok(await b.evaluate('document.documentElement.scrollWidth <= innerWidth'));
    b.overrides.clear();
  });
  await check('untrusted strings are displayed as text and missing media recovers', async () => {
    const raw = readFileSync(join(root, 'creator/content.yaml'), 'utf8'); const data = await b.evaluate(`jsyaml.load(${JSON.stringify(raw)})`);
    data.site.name.zh = '<img src=x onerror="window.pwned=true">';
    data.projects.items[0].title.zh = '<script>window.pwned=true</script>';
    data.projects.items[0].cover = '../assets/media/missing.svg';
    b.overrides.set('/creator/content.yaml', JSON.stringify(data)); await b.navigate('/creator/');
    assert.equal(await b.evaluate('window.pwned === true'), false);
    assert.ok(await b.evaluate('document.querySelector(".brand").textContent.includes("<img")'));
    assert.ok(await b.evaluate('document.querySelector(".media-fallback:not([hidden])")'));
    b.overrides.clear(); errors = [];
  });
  await check('reduced motion and no-photo travel remain usable', async () => {
    await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await b.navigate('/traveler/'); await b.wait('document.querySelector(".globe-pin")');
    assert.equal(await b.evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'), true);
    await b.navigate('/traveler/#trips/tromso/northern-light'); await b.wait('document.querySelector("dialog").open');
    assert.ok(await b.evaluate('document.querySelector("#detail-body").textContent.length > 10'));
    await click('#detail-close');
  });
  await check('creator video source renders in project details', async () => {
    const raw = readFileSync(join(root, 'creator/content.yaml'), 'utf8'); const data = await b.evaluate(`jsyaml.load(${JSON.stringify(raw)})`);
    data.projects.items[0].video = '../assets/media/test.mp4';
    b.overrides.set('/creator/content.yaml', JSON.stringify(data)); b.overrides.set('/assets/media/test.mp4', '');
    await b.navigate('/creator/#projects/atlas');
    assert.ok(await b.evaluate('document.querySelector("dialog video source")?.type === "video/mp4"'));
    await click('#detail-close'); b.overrides.clear(); errors = [];
  });
  await check('template selection has two working entry points', async () => {
    await b.navigate('/'); assert.equal(await b.evaluate('document.querySelectorAll(".template-link").length'), 2);
  });
} finally { await b.close(); }
console.log(`${passes} passed, ${failures} failed`);
if (failures) process.exitCode = 1;
