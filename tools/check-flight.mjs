import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { browser } from './browser.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, '.local/flight'); mkdirSync(out, { recursive: true });
const b = await browser(root);
let pass = 0, fail = 0;
async function check(name, fn) { try { await fn(); pass++; console.log('PASS ' + name); } catch (e) { fail++; console.error('FAIL ' + name + ': ' + e.message); } }
async function fixture(query = '') { await b.size(1440, 1000); await b.navigate('/tests/fixtures/flight.html' + query); }
async function click(selector) { await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function noLateDialog() { await b.evaluate('new Promise(r => setTimeout(r, 1150))'); assert.equal(await b.evaluate('!!document.querySelector("dialog[open]")'), false); }
async function mapPin() {
  await b.wait('document.querySelector(".globe-pin[data-id=madrid]")');
  await b.evaluate('document.querySelector(".globe-wrap").scrollIntoView({block:"center",behavior:"instant"});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  for (var step = 0; step < 3 && await b.evaluate('document.querySelector(".globe-pin[data-id=madrid]").hidden'); step++) {
    const target = Math.min(8, await b.evaluate('parseFloat(document.querySelector(".globe-root").dataset.view.split(",")[2])') * 1.8);
    await click('#zoom-in'); await b.wait(`Math.abs(parseFloat(document.querySelector('.globe-root').dataset.view.split(',')[2]) - ${target}) < 0.02`);
  }
  assert.equal(await b.evaluate('document.querySelector(".globe-pin[data-id=madrid]").hidden'), false, 'Map pin must be visible before selecting it');
  await click('.globe-pin[data-id=madrid]');
}
try {
  await check('generic flight moves and calls arrival only after landing', async () => {
    await fixture();
    await b.evaluate('testGlobe.travelTo("lisbon", function () { arrivals.push("lisbon"); })');
    await b.wait('!document.querySelector(".globe-plane").hidden');
    const first = await b.evaluate('document.querySelector(".globe-plane").style.transform');
    assert.deepEqual(await b.evaluate('arrivals'), []);
    await b.wait(`document.querySelector('.globe-plane').style.transform !== ${JSON.stringify(first)}`);
    await b.wait('arrivals.length === 1');
    assert.deepEqual(await b.evaluate('arrivals'), ['lisbon']);
    assert.equal(await b.evaluate('document.querySelector(".globe-plane").hidden'), true);
  });
  await check('new destination cancels previous arrival', async () => {
    await fixture();
    await b.evaluate('testGlobe.travelTo("lisbon", function () { arrivals.push("lisbon"); }); testGlobe.travelTo("rome", function () { arrivals.push("rome"); })');
    await b.wait('arrivals.length === 1'); assert.deepEqual(await b.evaluate('arrivals'), ['rome']);
  });
  await check('animation off and reduced motion arrive immediately', async () => {
    await fixture('?flight=off');
    await b.evaluate('testGlobe.travelTo("lisbon", function () { arrivals.push("lisbon"); })');
    assert.deepEqual(await b.evaluate('arrivals'), ['lisbon']); assert.equal(await b.evaluate('document.querySelector(".globe-plane").hidden'), true);
    await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await fixture(); await b.evaluate('testGlobe.travelTo("rome", function () { arrivals.push("rome"); })');
    assert.deepEqual(await b.evaluate('arrivals'), ['rome']);
    await b.send('Emulation.setEmulatedMedia', { features: [] });
  });
  await check('explicit cancel and direct focus suppress stale callbacks', async () => {
    await fixture();
    await b.evaluate('testGlobe.travelTo("lisbon", function () { arrivals.push("lisbon"); }); testGlobe.cancelTravel(); testGlobe.focusPlace("rome", null, true)');
    await b.evaluate('new Promise(r=>setTimeout(r,1150))');
    assert.deepEqual(await b.evaluate('arrivals'), []); assert.equal(await b.evaluate('document.querySelector(".globe-plane").hidden'), true);
  });
  await check('map click flies before opening, using template colors', async () => {
    await b.navigate('/public/traveler/'); await mapPin();
    assert.equal(await b.evaluate('!!document.querySelector("dialog[open]")'), false);
    await b.wait('!document.querySelector(".globe-plane").hidden');
    assert.equal(await b.evaluate('getComputedStyle(document.querySelector(".globe-plane")).color'), 'rgb(128, 81, 54)');
    const image = await b.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, 'traveler-flight.png'), Buffer.from(image.data, 'base64'));
    await b.wait('!!document.querySelector("dialog[open]")'); assert.equal(await b.evaluate('location.hash'), '#trips/madrid/second-madrid');
  });
  await check('timeline interrupts flight and opens requested detail immediately', async () => {
    await b.navigate('/public/traveler/'); await mapPin();
    await click('[data-route="trips/lisbon/lisbon-walk"]');
    assert.equal(await b.evaluate('location.hash'), '#trips/lisbon/lisbon-walk');
    assert.equal(await b.evaluate('document.querySelector(".globe-plane").hidden'), true);
    await b.evaluate('new Promise(r=>setTimeout(r,1150))'); assert.equal(await b.evaluate('location.hash'), '#trips/lisbon/lisbon-walk');
  });
  await check('content switch off opens map detail immediately', async () => {
    await b.navigate('/public/traveler/');
    const data = await b.evaluate(`jsyaml.load(${JSON.stringify(readFileSync(join(root, 'public/traveler/content.yaml'), 'utf8'))})`);
    data.trips.flightAnimation = false; b.overrides.set('/public/traveler/content.yaml', JSON.stringify(data));
    await b.navigate('/public/traveler/'); await mapPin();
    assert.equal(await b.evaluate('!!document.querySelector("dialog[open]")'), true);
    assert.equal(await b.evaluate('document.querySelector(".globe-plane").hidden'), true); b.overrides.clear();
  });
  await check('direct links and back-forward never replay a flight', async () => {
    await b.navigate('/public/traveler/#trips/madrid/second-madrid'); await b.wait('document.querySelector(".globe-plane")');
    assert.equal(await b.evaluate('document.querySelector(".globe-plane").hidden'), true);
    await b.navigate('/public/traveler/'); await click('[data-route="trips/lisbon/lisbon-walk"]');
    await b.evaluate('history.back()'); await b.wait('!document.querySelector("dialog").open');
    await b.evaluate('history.forward()'); await b.wait('document.querySelector("dialog").open');
    assert.equal(await b.evaluate('document.querySelector(".globe-plane").hidden'), true);
  });
  await check('Escape and language switch cancel unfinished map flight', async () => {
    await b.navigate('/public/traveler/'); await mapPin();
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.ok(await b.evaluate('document.activeElement.matches(".globe-canvas,.globe-pin:not([hidden])")'), 'Escape must restore usable map focus');
    await noLateDialog();
    await b.navigate('/public/traveler/'); await mapPin(); await click('#lang-toggle'); await noLateDialog();
  });
  await check('dragging or leaving the map cancels unfinished flight', async () => {
    await fixture(); await b.evaluate('testGlobe.travelTo("lisbon",function(){arrivals.push("lisbon")})');
    const p = await b.evaluate('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await b.send('Input.dispatchMouseEvent', { type:'mousePressed', x:p.x, y:p.y, button:'left', clickCount:1 });
    await b.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:p.x+40, y:p.y, buttons:1 });
    await b.send('Input.dispatchMouseEvent', { type:'mouseReleased', x:p.x+40, y:p.y, button:'left', clickCount:1 });
    await b.evaluate('new Promise(r=>setTimeout(r,1150))'); assert.deepEqual(await b.evaluate('arrivals'), []);
    await fixture(); await b.evaluate('document.body.insertAdjacentHTML("beforeend", "<div style=height:2400px></div>");testGlobe.travelTo("rome",function(){arrivals.push("rome")});scrollTo({top:2000,behavior:"instant"})');
    await b.evaluate('new Promise(r=>setTimeout(r,1150))'); assert.deepEqual(await b.evaluate('arrivals'), []);
    assert.equal(await b.evaluate('document.querySelector(".globe-plane").hidden'), true);
  });
  await check('mobile English flight stays within the viewport', async () => {
    await b.size(390, 844, true); await b.navigate('/public/traveler/');
    if (await b.evaluate('document.documentElement.lang') !== 'en') await click('#lang-toggle');
    await mapPin(); await b.wait('!document.querySelector(".globe-plane").hidden');
    assert.ok(await b.evaluate('document.documentElement.scrollWidth <= innerWidth'));
    const image = await b.send('Page.captureScreenshot', {format:'png'});writeFileSync(join(out,'traveler-flight-mobile.png'),Buffer.from(image.data,'base64'));
    await b.wait('document.querySelector("dialog").open');
  });
  await check('creator optional travel shares the same flight behavior', async () => {
    await b.navigate('/public/creator/');
    const data = await b.evaluate(`jsyaml.load(${JSON.stringify(readFileSync(join(root, 'public/creator/content.yaml'), 'utf8'))})`);
    data.sections.find(s => s.id === 'trips').enabled = true;
    b.overrides.set('/public/creator/content.yaml', JSON.stringify(data)); await b.navigate('/public/creator/');
    await b.wait('document.querySelector(".globe-pin[data-id=porto]")');
    await b.evaluate('document.querySelector(".globe-wrap").scrollIntoView({block:"center",behavior:"instant"});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    await click('.globe-pin[data-id=porto]'); await b.wait('!document.querySelector(".globe-plane").hidden');
    assert.equal(await b.evaluate('!!document.querySelector("dialog[open]")'), false);
    await b.wait('document.querySelector("dialog").open'); assert.equal(await b.evaluate('location.hash'), '#trips/porto/porto-walk'); b.overrides.clear();
  });
} finally { await b.close(); }
console.log(`${pass} passed, ${fail} failed`); if (fail) process.exitCode = 1;
