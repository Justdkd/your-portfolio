/* 内容模型：纯函数，供页面和 Node 校验共用。 */
(function () {
  'use strict';
  var IDS = ['about', 'trips', 'projects', 'experience', 'interests', 'now', 'contact'];
  var ID = /^[a-z][a-z0-9-]*$/;
  var MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

  function pick(value, lang) {
    if (value == null) return '';
    if (typeof value === 'object') return String(value[lang] || value.zh || value.en || '');
    return String(value);
  }
  function safeUrl(value, kind) {
    var s = String(value || '').trim();
    if (!s || /[\x00-\x20\\]/.test(s)) return '';
    if (/^https?:\/\//i.test(s)) {
      try { var u = new URL(s); return u.hostname && !u.username && !u.password ? s : ''; } catch (e) { return ''; }
    }
    if (kind === 'link' && /^mailto:[^\s?<>@]+@[^\s?<>@]+(?:\?[^<>]*)?$/i.test(s)) return s;
    if (kind === 'media' && /^(?:\.\.\/)?assets\/[a-z0-9_./-]+$/i.test(s) && !s.replace(/^\.\.\//, '').includes('..')) return s;
    return '';
  }
  function sections(c) {
    return (c.sections || []).filter(function (s) {
      if (s.enabled === false || IDS.indexOf(s.id) < 0) return false;
      var d = c[s.id] || (s.id === 'about' ? c.person : null) || {};
      if (s.id === 'about') return !!(pick(d.bio, 'zh') || d.photo || (d.facts || []).length);
      if (s.id === 'contact') return !!(d.email || (d.links || []).length);
      if (s.id === 'trips') return !!(d.episodes || []).length;
      return !!(d.items || []).length;
    });
  }
  function todayYM() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function derive(trips, today) {
    trips = trips || {}; today = today || todayYM();
    var places = Object.create(null), episodes = [], no = 0, next;
    Object.keys(trips.places || {}).forEach(function (id) {
      var p = trips.places[id];
      places[id] = { id: id, name: p.name, country: p.country, lat: +p.lat, lon: +p.lon, eps: [], upcoming: false, featured: false };
    });
    (trips.episodes || []).forEach(function (e) {
      var stops = (e.stops || []).filter(function (id) { return !!places[id]; });
      if (!stops.length) return;
      var copy = Object.assign({}, e, { stops: stops, upcoming: String(e.date) > today, no: null, nextNo: null });
      episodes.push(copy);
    });
    episodes.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    episodes.forEach(function (e) { if (!e.upcoming) e.no = ++no; }); next = no;
    episodes.forEach(function (e) {
      if (e.upcoming) e.nextNo = ++next;
      e.stops.forEach(function (id) { if (places[id].eps.indexOf(e) < 0) places[id].eps.push(e); });
    });
    var order = Object.keys(places).filter(function (id) { return places[id].eps.length; });
    order.forEach(function (id) {
      var p = places[id]; p.upcoming = p.eps.every(function (e) { return e.upcoming; }); p.featured = p.eps.some(function (e) { return e.featured; });
    });
    var visited = order.filter(function (id) { return !places[id].upcoming; }), countries = Object.create(null);
    visited.forEach(function (id) { countries[pick(places[id].country, 'en') || id] = true; });
    return { home: trips.home || { name: { zh: '', en: '' }, lat: 0, lon: 0 }, places: places, placeOrder: order, episodes: episodes,
      stats: { trips: no, places: visited.length, countries: Object.keys(countries).length } };
  }
  function validate(c) {
    var errors = [];
    function bad(path, message) { errors.push(path + ': ' + message); }
    function list(value, path) { if (value != null && !Array.isArray(value)) { bad(path, '应为列表 / expected an array'); return []; } return value || []; }
    function coord(p, path) {
      if (!p || !Number.isFinite(p.lat) || Math.abs(p.lat) > 90) bad(path + '.lat', '纬度应在 -90 到 90 / invalid latitude');
      if (!p || !Number.isFinite(p.lon) || Math.abs(p.lon) > 180) bad(path + '.lon', '经度应在 -180 到 180 / invalid longitude');
    }
    function url(v, path, kind) { if (v && !safeUrl(v, kind)) bad(path, '不安全或不支持的链接 / unsupported URL'); }
    function unique(items, path) {
      var seen = Object.create(null);
      items.forEach(function (v, i) { var id = v && v.id; if (!ID.test(id || '') || seen[id]) bad(path + '[' + i + '].id', 'id 应唯一且只含小写字母、数字、短横线 / invalid or duplicate id'); seen[id] = true; });
    }
    function media(items, path) {
      list(items, path).forEach(function (p, i) { url(p && p.src, path + '[' + i + '].src', 'media'); if (!p || !p.src) bad(path + '[' + i + '].src', '缺少图片路径 / missing image'); });
    }
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['content: 应为内容对象 / expected a content object'];
    var site = c.site || {}, langs = list(site.languages, 'site.languages');
    if (!pick(site.name, 'zh')) bad('site.name', '请填写站点名字 / missing name');
    if (!langs.length || langs.some(function (l) { return l !== 'zh' && l !== 'en'; }) || new Set(langs).size !== langs.length) bad('site.languages', '支持 zh、en / use zh and/or en');
    if (langs.indexOf(site.defaultLanguage) < 0) bad('site.defaultLanguage', '默认语言必须启用 / default language must be enabled');
    if (site.url && !/^https?:\/\//i.test(site.url)) bad('site.url', '网站地址应使用 http 或 https / website URL must use HTTP(S)');
    url(site.url, 'site.url', 'link'); url(site.shareImage, 'site.shareImage', 'media');
    var secs = list(c.sections, 'sections'); unique(secs, 'sections');
    secs.forEach(function (s, i) { if (!s || IDS.indexOf(s.id) < 0) bad('sections[' + i + '].id', '未知模块 / unknown section'); });
    var t = c.trips || {}, places = t.places || {};
    if (t.home) coord(t.home, 'trips.home');
    Object.keys(places).forEach(function (id) { if (!ID.test(id)) bad('trips.places.' + id, '无效 id / invalid id'); coord(places[id], 'trips.places.' + id); });
    var eps = list(t.episodes, 'trips.episodes'); unique(eps, 'trips.episodes');
    eps.forEach(function (e, i) {
      var p = 'trips.episodes[' + i + ']'; if (!e) return;
      if (!MONTH.test(String(e.date || ''))) bad(p + '.date', '使用 YYYY-MM / invalid month');
      var stops = list(e.stops, p + '.stops');
      if (!stops.length || stops.some(function (id) { return !Object.prototype.hasOwnProperty.call(places, id); })) bad(p + '.stops', '引用不存在的地点 / unknown or missing stop');
      ['video', 'hls', 'cover'].forEach(function (k) { url(e[k], p + '.' + k, 'media'); }); media(e.photos, p + '.photos');
    });
    ['projects', 'interests'].forEach(function (k) {
      var items = list((c[k] || {}).items, k + '.items'); unique(items, k + '.items');
      items.forEach(function (v, i) { if (!v) return; var p = k + '.items[' + i + ']'; url(v.link, p + '.link', 'link'); ['cover', 'video', 'hls'].forEach(function (field) { url(v[field], p + '.' + field, 'media'); }); media(v.photos, p + '.photos'); });
    });
    ['experience', 'now'].forEach(function (k) { list((c[k] || {}).items, k + '.items'); });
    var person = c.person || {}, contact = c.contact || {};
    url(person.photo, 'person.photo', 'media'); list(person.facts, 'person.facts');
    if (contact.email && !/^[^\s<>?@]+@[^\s<>?@]+\.[^\s<>?@]+$/.test(contact.email)) bad('contact.email', '无效邮箱 / invalid email');
    list(contact.links, 'contact.links').forEach(function (v, i) { url(v && v.url, 'contact.links[' + i + '].url', 'link'); });
    return errors;
  }
  window.HomepageModel = { pick: pick, safeUrl: safeUrl, sections: sections, derive: derive, validate: validate, todayYM: todayYM };
})();
