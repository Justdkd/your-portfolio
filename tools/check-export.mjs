import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { exportTemplate } from './content.mjs';
import { browser } from './browser.mjs';
const out = mkdtempSync(join(tmpdir(), 'portfolio-publish-check-'));
let b;
try {
  for (const mode of ['traveler', 'creator']) exportTemplate(mode, join(out, 'nested', mode));
  b = await browser(out);
  let problems = [];
  b.on('Runtime.exceptionThrown', p => problems.push(p.exceptionDetails.text));
  b.on('Network.responseReceived', p => { if (p.response.status >= 400 && !p.response.url.endsWith('favicon.ico')) problems.push(p.response.status + ' ' + p.response.url); });
  for (const mode of ['traveler', 'creator']) {
    problems = []; await b.size(390, 844, true); await b.navigate('/nested/' + mode + '/');
    assert.ok(await b.evaluate('document.querySelector("h1").textContent.length > 3'));
    assert.ok(await b.evaluate('document.documentElement.scrollWidth <= innerWidth'));
    if (mode === 'traveler') await b.wait('document.querySelector(".globe-pin")');
    await b.evaluate('document.querySelector("[data-route]").click()'); await b.wait('document.querySelector("dialog").open');
    assert.deepEqual(problems, []);
    console.log('PASS exported ' + mode + ': nested path, content, shared assets and detail route');
  }
} finally { if (b) await b.close(); rmSync(out, { recursive: true, force: true }); }
