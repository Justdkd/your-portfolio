import { readFileSync, writeFileSync, existsSync, cpSync, mkdirSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const context = { window: {}, URL, console };
vm.createContext(context);
vm.runInContext(readFileSync(join(ROOT, 'public/assets/js/vendor/js-yaml.min.js'), 'utf8'), context);
vm.runInContext(readFileSync(join(ROOT, 'public/assets/js/model.js'), 'utf8'), context);
export const YAML = context.jsyaml;
export const Model = context.window.HomepageModel;
export function modeName(mode) {
  if (!['traveler', 'creator'].includes(mode)) throw new Error('Choose traveler or creator.');
  return mode;
}
export function loadContent(mode, root = ROOT) {
  return YAML.load(readFileSync(join(root, 'public', modeName(mode), 'content.yaml'), 'utf8'));
}
function walk(value, path, visit) {
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, path + '[' + i + ']', visit));
  else if (value && typeof value === 'object') Object.keys(value).forEach(k => walk(value[k], path ? path + '.' + k : k, visit));
  else visit(value, path);
}
export function checkContent(mode, root = ROOT) {
  const c = loadContent(mode, root), errors = [...Model.validate(c)];
  const publicRoot = resolve(root, 'public');
  walk(c, '', (value, field) => {
    if (typeof value !== 'string' || !/^(?:\.\.\/)?assets\//.test(value)) return;
    const file = resolve(root, 'public', mode, value);
    if (!file.startsWith(publicRoot + sep) || !existsSync(file)) errors.push(field + ': missing resource ' + value);
  });
  return { content: c, errors };
}
function esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function meta(c) {
  const s = c.site, lang = s.defaultLanguage, name = Model.pick(s.name, lang), description = Model.pick(s.description, lang);
  const tags = [`<title>${esc(name)}</title>`, `<meta name="description" content="${esc(description)}">`, '<meta property="og:type" content="website">', `<meta property="og:site_name" content="${esc(name)}">`, `<meta property="og:title" content="${esc(name)}">`, `<meta property="og:description" content="${esc(description)}">`, '<meta name="twitter:card" content="summary_large_image">'];
  if (/^https?:\/\//.test(s.url || '')) {
    tags.push(`<link rel="canonical" href="${esc(s.url)}">`, `<meta property="og:url" content="${esc(s.url)}">`);
    if (Model.safeUrl(s.shareImage, 'media')) tags.push(`<meta property="og:image" content="${esc(new URL(s.shareImage, s.url))}">`);
  }
  return tags.join('\n');
}
function updateHTML(html, content) {
  if (!html.includes('<!-- META:START -->') || !html.includes('<!-- META:END -->')) throw new Error('Missing HTML metadata markers');
  return html.replace(/<!-- META:START -->[\s\S]*?<!-- META:END -->/, '<!-- META:START -->\n' + meta(content) + '\n<!-- META:END -->').replace(/<html lang="[^"]*">/, '<html lang="' + (content.site.defaultLanguage === 'zh' ? 'zh-CN' : 'en') + '">');
}
export function syncMeta(mode, root = ROOT) {
  const r = checkContent(mode, root); if (r.errors.length) throw new Error(r.errors.join('\n'));
  const html = join(root, 'public', mode, 'index.html'); writeFileSync(html, updateHTML(readFileSync(html, 'utf8'), r.content));
}
export function exportTemplate(mode, output, root = ROOT) {
  modeName(mode);
  const r = checkContent(mode, root); if (r.errors.length) throw new Error(r.errors.join('\n'));
  const target = resolve(output);
  if (existsSync(target)) throw new Error('Output already exists; choose a fresh folder: ' + target);
  if (target === resolve(root) || target.startsWith(resolve(root, 'public') + sep)) throw new Error('Output must be outside public/');
  const content = JSON.parse(JSON.stringify(r.content));
  function rebase(v) {
    if (Array.isArray(v)) return v.map(rebase);
    if (v && typeof v === 'object') { Object.keys(v).forEach(k => { v[k] = rebase(v[k]); }); return v; }
    return typeof v === 'string' && v.startsWith('../assets/') ? v.slice(3) : v;
  }
  rebase(content);
  const assetRoot = resolve(root, 'public/assets'), assets = new Set();
  function dependency(uri, file) {
    if (/^https?:\/\//i.test(uri)) {
      if (!Model.safeUrl(uri, 'media')) throw new Error('Unsupported resource URL in ' + file);
      return;
    }
    if (/^data:/i.test(uri) && file.endsWith('.css')) return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(uri) || uri.startsWith('//') || uri.includes('\\')) throw new Error('Unsupported resource URI in ' + file);
    const path = decodeURIComponent(uri.split(/[?#]/)[0]);
    addAsset(resolve(dirname(file), path));
  }
  function addAsset(file) {
    file = resolve(file);
    if (!file.startsWith(assetRoot + sep)) throw new Error('Resource points outside assets: ' + file);
    if (!existsSync(file) || !statSync(file).isFile()) throw new Error('Missing asset dependency: ' + file);
    if (!realpathSync(file).startsWith(realpathSync(assetRoot) + sep)) throw new Error('Resource symlink points outside assets: ' + file);
    if (assets.has(file)) return;
    assets.add(file);
    if (file.endsWith('.m3u8')) {
      const manifest = readFileSync(file, 'utf8');
      manifest.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#')).forEach(uri => dependency(uri, file));
      for (const match of manifest.matchAll(/\bURI="([^"]+)"/g)) dependency(match[1], file);
    }
    if (file.endsWith('.css')) for (const match of readFileSync(file, 'utf8').matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) dependency(match[1].trim(), file);
  }
  function addTree(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name); if (entry.isDirectory()) addTree(file); else addAsset(file);
    }
  }
  for (const shared of ['css', 'js', 'data']) addTree(join(assetRoot, shared));
  addAsset(join(assetRoot, 'favicon.svg'));
  walk(r.content, '', value => { if (typeof value === 'string' && /^(?:\.\.\/)?assets\//.test(value)) addAsset(resolve(root, 'public', mode, value)); });
  mkdirSync(target, { recursive: true });
  for (const file of assets) {
    const destination = join(target, 'assets', file.slice(assetRoot.length + 1));
    mkdirSync(dirname(destination), { recursive: true }); cpSync(file, destination);
  }
  mkdirSync(join(target, 'content')); cpSync(join(root, 'public/content/ui.yaml'), join(target, 'content/ui.yaml'));
  writeFileSync(join(target, 'content.yaml'), YAML.dump(content, { lineWidth: 110, noRefs: true }));
  let html = readFileSync(join(root, 'public', mode, 'index.html'), 'utf8').replaceAll('../assets/', 'assets/');
  writeFileSync(join(target, 'index.html'), updateHTML(html, content));
  for (const name of ['404.html', '_headers', 'robots.txt']) if (existsSync(join(root, 'public', name))) cpSync(join(root, 'public', name), join(target, name));
  return target;
}
