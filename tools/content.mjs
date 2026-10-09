import { readFileSync, writeFileSync, existsSync, cpSync, mkdirSync } from 'node:fs';
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
  mkdirSync(target, { recursive: true });
  cpSync(join(root, 'public/assets'), join(target, 'assets'), { recursive: true });
  mkdirSync(join(target, 'content')); cpSync(join(root, 'public/content/ui.yaml'), join(target, 'content/ui.yaml'));
  writeFileSync(join(target, 'content.yaml'), YAML.dump(content, { lineWidth: 110, noRefs: true }));
  let html = readFileSync(join(root, 'public', mode, 'index.html'), 'utf8').replaceAll('../assets/', 'assets/');
  writeFileSync(join(target, 'index.html'), updateHTML(html, content));
  for (const name of ['404.html', '_headers', 'robots.txt']) if (existsSync(join(root, 'public', name))) cpSync(join(root, 'public', name), join(target, name));
  return target;
}
