import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, extname, sep, join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';

export async function browser(root) {
  const overrides = new Map();
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.yaml': 'text/plain', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.m3u8': 'application/vnd.apple.mpegurl', '.mp4': 'video/mp4' };
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = resolve(root, '.' + pathname);
    if (!file.startsWith(resolve(root) + sep) && file !== resolve(root)) { res.writeHead(403); res.end(); return; }
    if (pathname.endsWith('/')) file = join(file, 'index.html');
    if (overrides.has(pathname)) { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(overrides.get(pathname)); return; }
    if (!existsSync(file)) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = mkdtempSync(join(tmpdir(), 'portfolio-browser-'));
  const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; chrome.stderr.on('data', d => { stderr += d; });
  const deadline = Date.now() + 15000;
  while (!/DevTools listening on (ws:\/\/[^\s]+)/.test(stderr)) {
    if (Date.now() > deadline || chrome.exitCode !== null) { chrome.kill(); server.close(); throw new Error('Chrome startup failed: ' + stderr.slice(-400)); }
    await new Promise(r => setTimeout(r, 70));
  }
  const debug = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr)[1];
  const port = new URL(debug).port;
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((yes, no) => { ws.addEventListener('open', yes, { once: true }); ws.addEventListener('error', no, { once: true }); });
  let id = 0; const pending = new Map(), listeners = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p.timer); m.error ? p.no(new Error(m.error.message)) : p.yes(m.result); }
    if (m.method) (listeners.get(m.method) || []).forEach(fn => fn(m.params));
  });
  function send(method, params = {}) {
    return new Promise((yes, no) => { const key = ++id; const timer = setTimeout(() => { pending.delete(key); no(new Error('CDP timeout: ' + method)); }, 12000); pending.set(key, { yes, no, timer }); ws.send(JSON.stringify({ id: key, method, params })); });
  }
  function on(method, fn) { const list = listeners.get(method) || []; list.push(fn); listeners.set(method, list); }
  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async function wait(expression, timeout = 9000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 60)); }
    throw new Error('Timed out: ' + expression);
  }
  async function navigate(path) {
    await send('Page.navigate', { url: 'about:blank' });
    await wait('location.href === "about:blank"');
    await send('Page.navigate', { url: origin + path });
    await wait(`location.href === ${JSON.stringify(origin + path)} && document.body?.dataset.ready === 'true'`);
    await evaluate('document.fonts.ready');
  }
  async function size(w, h, mobile = false) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
  }
  async function close() {
    ws.close(); chrome.kill(); await new Promise(r => server.close(r));
    if (chrome.exitCode === null) await Promise.race([once(chrome, 'exit'), new Promise(r => setTimeout(r, 1500))]);
    rmSync(profile, { recursive: true, force: true });
  }
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  return { send, evaluate, wait, navigate, size, close, on, origin, overrides };
}
