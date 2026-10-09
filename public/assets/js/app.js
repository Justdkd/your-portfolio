/* 两套个人主页共用内容渲染、语言、模块与详情路由。 */
(function () {
  'use strict';
  var M = window.HomepageModel, script = document.currentScript;
  var rootURL = new URL('../../', script.src), mode = document.body.dataset.mode;
  var content, ui, lang, activeSections = [], model, globe, globeNode, globeLoading = false;
  var dialog = document.getElementById('detail'), opened = '', pushed = false, returnFocus = null, observer;
  var main = document.getElementById('main');
  var ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19L19 5M5 5h14v14" stroke="currentColor" stroke-width="1.5"/></svg>';

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pick(v) { return M.pick(v, lang); }
  function t(key) { return pick(ui[key]); }
  function reduced() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function enabled(id) { return activeSections.some(function (s) { return s.id === id; }); }
  function image(src, alt, extra) {
    var safe = M.safeUrl(src, 'media'); if (!safe) return '';
    return '<div class="media-frame ' + (extra || '') + '"><img src="' + esc(safe) + '" alt="' + esc(pick(alt)) + '" loading="lazy" decoding="async"><span class="media-fallback" hidden>' + esc(t('imageMissing')) + '</span></div>';
  }
  function routeButton(route, inner, cls) { return '<button type="button" class="' + (cls || '') + '" data-route="' + esc(route) + '" aria-haspopup="dialog">' + inner + '</button>'; }
  function summaryStats() {
    return t('tripStats').replace('{trips}', model.stats.trips).replace('{countries}', model.stats.countries).replace('{places}', model.stats.places);
  }
  function travelGlobe() {
    return '<div id="globe-slot" class="globe-wrap"><div class="globe-root"><canvas class="globe-canvas" tabindex="0" role="img"></canvas><div class="globe-pins"></div></div><div class="globe-controls"><p class="globe-hint">' + esc(t('globeHint')) + '</p><div class="globe-zoom"><button id="zoom-out" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg></button><button id="zoom-in" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12M12 6v12"/></svg></button></div></div></div>';
  }
  function hero() {
    var projects = (content.projects || {}).items || [], hasGlobe = enabled('trips') && model.placeOrder.length;
    var visual = '';
    if (mode === 'traveler' && hasGlobe) visual = travelGlobe();
    else if (enabled('projects') && projects.length) {
      var p = projects[0];
      visual = '<div class="lead-work">' + routeButton('projects/' + p.id, image(p.cover, p.title, 'lead-image') + '<span class="lead-caption">' + esc(pick(p.title)) + ICON + '</span>', 'lead-button') + '</div>';
    }
    var first = activeSections[0];
    return '<section class="hero ' + (!visual ? 'hero--text' : '') + '" id="hero"><div class="hero-copy"><h1>' + esc(pick(content.hero.title)) + '</h1><p class="hero-intro">' + esc(pick(content.hero.intro)) + '</p>' + (first ? '<a class="text-link" href="#' + first.id + '">' + esc(pick(first.title) || t('explore')) + ICON + '</a>' : '') + '</div>' + visual + '</section>';
  }
  function about() {
    var p = content.person || {};
    return '<div class="about-layout">' + (p.photo ? image(p.photo, p.photoAlt, 'portrait') : '') + '<div><p class="prose large-copy">' + esc(pick(p.bio)) + '</p><dl class="facts">' + (p.facts || []).map(function (f) { return '<div><dt>' + esc(pick(f.label)) + '</dt><dd>' + esc(pick(f.value)) + '</dd></div>'; }).join('') + '</dl></div></div>';
  }
  function trips() {
    return '<p class="section-intro">' + esc(summaryStats()) + '</p>' + (mode !== 'traveler' ? travelGlobe() : '') + '<ol class="journey-list">' + model.episodes.slice().reverse().map(function (e) {
      var place = e.stops[e.stops.length - 1];
      return '<li>' + routeButton('trips/' + place + '/' + e.id, '<span class="journey-date">' + esc(e.date) + '</span><span class="journey-info"><span class="journey-title">' + esc(pick(e.title)) + '</span><span class="journey-stops">' + esc(e.stops.map(function (id) { return pick(model.places[id].name); }).join(' / ')) + (e.upcoming ? ' · ' + esc(t('upcoming')) : '') + '</span></span>' + ICON, 'journey-button') + '</li>';
    }).join('') + '</ol>';
  }
  function projects() {
    return '<div class="project-grid">' + content.projects.items.map(function (p) {
      return '<article class="project">' + routeButton('projects/' + p.id, image(p.cover, p.title) + '<span class="project-heading"><span>' + esc(pick(p.title)) + '</span>' + ICON + '</span><span class="project-summary">' + esc(pick(p.summary)) + '</span><span class="project-tags">' + esc((p.tags || []).map(pick).join(' / ')) + '</span>', 'project-button') + '</article>';
    }).join('') + '</div>';
  }
  function experience() {
    return '<ol class="experience-list">' + content.experience.items.map(function (e) { return '<li><span class="experience-date">' + esc(e.date) + '</span><div><h3>' + esc(pick(e.title)) + '</h3><p class="prose">' + esc(pick(e.text)) + '</p></div></li>'; }).join('') + '</ol>';
  }
  function interests() {
    return '<div class="interest-list">' + content.interests.items.map(function (p) { return '<article><h3>' + esc(pick(p.title)) + '</h3><p>' + esc(pick(p.text)) + '</p></article>'; }).join('') + '</div>';
  }
  function now() {
    return '<ul class="now-list">' + content.now.items.map(function (p) { return '<li><time>' + esc(p.date) + '</time><p class="large-copy">' + esc(pick(p.text)) + '</p></li>'; }).join('') + '</ul>';
  }
  function contact() {
    var c = content.contact;
    return '<div class="contact-layout"><p class="contact-headline">' + esc(pick(c.headline)) + '</p><div class="contact-links">' + (c.email ? '<a class="text-link" href="mailto:' + esc(c.email) + '">' + esc(t('email')) + ICON + '</a>' : '') + (c.links || []).map(function (l) { var u = M.safeUrl(l.url, 'link'); return u ? '<a class="text-link" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(pick(l.label)) + ICON + '</a>' : ''; }).join('') + '</div></div>';
  }
  function gallery() {
    return '<section class="gallery-hero" id="hero"><h1>' + esc(pick(content.hero.title)) + '</h1><p class="hero-intro">' + esc(pick(content.hero.intro)) + '</p></section><div class="template-grid">' + content.templates.filter(function (p) { return p.id === 'traveler' || p.id === 'creator'; }).map(function (p) {
      return '<a class="template-link" href="' + p.id + '/">' + image(p.image, p.title) + '<div class="template-caption"><h2>' + esc(pick(p.title)) + '</h2>' + ICON + '</div><p>' + esc(pick(p.description)) + '</p><span class="text-link">' + esc(t('choose')) + ICON + '</span></a>';
    }).join('') + '</div><a class="source-link" href="https://github.com/Justdkd/your-portfolio" target="_blank" rel="noopener noreferrer">' + esc(t('source')) + ICON + '</a>';
  }
  function render() {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = pick(content.site.name);
    document.querySelector('meta[name="description"]').content = pick(content.site.description);
    document.querySelector('.brand').textContent = pick(content.site.name);
    document.querySelector('.skip-link').textContent = t('skip');
    document.getElementById('navigation').setAttribute('aria-label', t('navigation'));
    var toggle = document.getElementById('lang-toggle'); toggle.hidden = content.site.languages.length < 2;
    toggle.textContent = lang === 'zh' ? 'EN' : '中文'; toggle.setAttribute('aria-label', t('language'));
    var demo = document.getElementById('demo-notice'); demo.hidden = !content.site.demo; demo.textContent = t('demo');
    document.getElementById('detail-close').textContent = t('close');
    if (mode === 'gallery') {
      main.innerHTML = gallery(); document.getElementById('navigation').innerHTML = ''; document.getElementById('footer').textContent = 'your-portfolio'; mediaFallbacks(); return;
    }
    activeSections = M.sections(content); model = M.derive(content.trips);
    if (globeNode) globeNode.remove();
    var builders = { about: about, trips: trips, projects: projects, experience: experience, interests: interests, now: now, contact: contact };
    main.innerHTML = hero() + activeSections.map(function (s) { return '<section class="section section--' + s.id + '" id="' + s.id + '"><h2>' + esc(pick(s.title)) + '</h2>' + builders[s.id]() + '</section>'; }).join('');
    document.getElementById('navigation').innerHTML = activeSections.map(function (s) { return '<a href="#' + s.id + '">' + esc(pick(s.title)) + '</a>'; }).join('');
    var slot = document.getElementById('globe-slot');
    if (slot && globeNode) { slot.replaceWith(globeNode); globeNode.querySelector('.globe-hint').textContent = t('globeHint'); }
    document.getElementById('footer').innerHTML = '<span>' + esc(pick(content.site.name)) + '</span><span>' + esc(t('footer')) + '</span>';
    mediaFallbacks(); observeSections(); initializeGlobe();
  }
  function mediaFallbacks() {
    document.querySelectorAll('.media-frame img').forEach(function (img) {
      function failed() { img.hidden = true; var f = img.parentNode.querySelector('.media-fallback'); if (f) f.hidden = false; }
      img.addEventListener('error', failed, { once: true }); if (img.complete && !img.naturalWidth) failed();
    });
  }
  function initializeGlobe() {
    globeNode = document.getElementById('globe-slot'); if (!globeNode) return;
    function labels() {
      globeNode.querySelector('canvas').setAttribute('aria-label', t('globeLabel'));
      document.getElementById('zoom-in').setAttribute('aria-label', t('zoomIn')); document.getElementById('zoom-out').setAttribute('aria-label', t('zoomOut'));
      globe.setPlaces(model.placeOrder.map(function (id) { var p = model.places[id], name = pick(p.name); return { id: id, lon: p.lon, lat: p.lat, label: name, aria: t('placeLabel').replace('{name}', name), kind: p.upcoming ? 'upcoming' : p.featured ? 'featured' : 'normal', haspopup: 'dialog' }; }));
    }
    if (globe) { labels(); return; }
    if (globeLoading) return; globeLoading = true;
    fetch(new URL('assets/data/land-110m.json', rootURL)).then(function (r) { if (!r.ok) throw new Error('Map unavailable'); return r.json(); }).then(function (data) {
      if (!globeNode || !globeNode.isConnected) return;
      globe = window.PortfolioGlobe.create(globeNode.querySelector('.globe-root'), {
        land: window.PortfolioGlobe.math.decodeLand(data), home: model.home, initialView: { lon: model.home.lon, lat: model.home.lat }, reducedMotion: reduced,
        zoomIn: document.getElementById('zoom-in'), zoomOut: document.getElementById('zoom-out'),
        clusterLabel: function (names) { return t('clusterLabel').replace('{names}', names.join(', ')); },
        onSelectPlace: function (id, button) { var eps = model.places[id].eps; var ep = eps.filter(function (e) { return !e.upcoming; }).slice(-1)[0] || eps[0]; open('trips/' + id + '/' + ep.id, true, button); }
      });
      if (globe) { labels(); globeNode.classList.add('is-ready'); }
    }).catch(function () { if (globeNode) globeNode.hidden = true; }).finally(function () { globeLoading = false; });
  }
  function observeSections() {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (!e.isIntersecting) return; document.querySelectorAll('#navigation a').forEach(function (a) { if (a.hash === '#' + e.target.id) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); }); });
    }, { rootMargin: '-15% 0px -60% 0px' });
    document.querySelectorAll('main > section').forEach(function (s) { observer.observe(s); });
  }
  function photos(items) {
    return (items || []).map(function (p) { return '<figure>' + image(p.src, p.alt) + (p.caption ? '<figcaption>' + esc(pick(p.caption)) + '</figcaption>' : '') + '</figure>'; }).join('');
  }
  function videoHTML(item) {
    var video = M.safeUrl(item.video, 'media'), hls = M.safeUrl(item.hls, 'media'), cover = M.safeUrl(item.cover, 'media');
    if (!video && !hls) return '';
    return '<video controls playsinline preload="metadata"' + (cover ? ' poster="' + esc(cover) + '"' : '') + '>' + (hls ? '<source src="' + esc(hls) + '" type="application/vnd.apple.mpegurl">' : '') + (video ? '<source src="' + esc(video) + '" type="video/mp4">' : '') + '</video>';
  }
  function detailHTML(route) {
    var p = route.split('/'); if (!enabled(p[0])) return '';
    if (p[0] === 'projects') {
      var project = content.projects.items.find(function (x) { return x.id === p[1]; }); if (!project || p.length !== 2) return '';
      var link = M.safeUrl(project.link, 'link');
      return '<h2 id="detail-title">' + esc(pick(project.title)) + '</h2><p class="detail-meta">' + esc((project.tags || []).map(pick).join(' / ')) + '</p><p class="prose">' + esc(pick(project.text || project.summary)) + '</p>' + videoHTML(project) + photos(project.photos) + (link ? '<a class="text-link" href="' + esc(link) + '" rel="noopener noreferrer" target="_blank">' + esc(t('visit')) + ICON + '</a>' : '');
    }
    if (p[0] === 'trips') {
      var place = model.places[p[1]]; if (!place) return '';
      var ep = p[2] ? place.eps.find(function (e) { return e.id === p[2]; }) : place.eps.slice(-1)[0]; if (!ep || p.length > 3) return '';
      var switches = place.eps.length > 1 ? '<div class="episode-switches" role="group" aria-label="' + esc(t('visits')) + '">' + place.eps.map(function (e) { return '<button type="button" data-episode="' + e.id + '" data-place="' + place.id + '" aria-pressed="' + (e.id === ep.id) + '">' + esc(e.date) + '</button>'; }).join('') + '</div>' : '';
      var media = videoHTML(ep);
      if (globe) { globe.select(place.id); globe.highlight(ep.stops, ep.upcoming); }
      return '<h2 id="detail-title">' + esc(pick(ep.title)) + '</h2><p class="detail-meta">' + esc(ep.date) + (ep.upcoming ? ' · ' + esc(t('upcoming')) : '') + '</p><p class="detail-route">' + esc([pick(model.home.name)].concat(ep.stops.map(function (id) { return pick(model.places[id].name); })).concat(ep.upcoming ? [] : [pick(model.home.name)]).join(' → ')) + '</p>' + switches + '<p class="prose">' + esc(pick(ep.text) || t('noMedia')) + '</p>' + media + photos(ep.photos);
    }
    return '';
  }
  function open(route, push, button) {
    var html = detailHTML(route); if (!html) { status(); return false; }
    if (button) returnFocus = button;
    else if (!returnFocus) returnFocus = document.querySelector('[data-route="' + route.replace(/[^a-z0-9/-]/g, '') + '"]');
    document.getElementById('detail-body').innerHTML = html; dialog.setAttribute('aria-labelledby', 'detail-title');
    if (!dialog.open) { dialog.showModal(); document.documentElement.classList.add('is-modal'); }
    opened = route;
    if (push) { history.pushState({ portfolioDetail: route }, '', '#' + route); pushed = true; }
    document.getElementById('detail-close').focus(); mediaFallbacks(); return true;
  }
  function finishClose() {
    if (!opened) return;
    opened = ''; pushed = false;
    dialog.querySelectorAll('video').forEach(function (v) { v.pause(); });
    if (dialog.open) dialog.close(); document.documentElement.classList.remove('is-modal');
    if (globe) { globe.highlight(null); globe.select(null); }
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
    else document.querySelector('.brand').focus({ preventScroll: true });
    returnFocus = null;
  }
  function close() {
    var parent = opened.split('/')[0], goBack = pushed && history.state && history.state.portfolioDetail;
    pushed = false; finishClose();
    if (goBack) history.back(); else history.replaceState(null, '', '#' + parent);
  }
  function status() {
    var el = document.getElementById('route-status'); el.textContent = t('routeMissing'); el.hidden = false;
  }
  function applyRoute() {
    document.getElementById('route-status').hidden = true;
    var route; try { route = decodeURIComponent(location.hash.slice(1)); } catch (e) { status(); return; }
    if (route.includes('/')) { if (!open(route, false)) finishClose(); return; }
    finishClose();
    if (route) { var target = document.getElementById(route); if (target && target.tagName === 'SECTION') target.scrollIntoView({ behavior: reduced() ? 'instant' : 'smooth' }); else if (route !== 'main') status(); }
  }
  document.addEventListener('click', function (e) {
    var button = e.target.closest('[data-route]'); if (button) { open(button.dataset.route, true, button); return; }
    var ep = e.target.closest('[data-episode]');
    if (ep) { var route = 'trips/' + ep.dataset.place + '/' + ep.dataset.episode; open(route, false); history.replaceState(pushed ? { portfolioDetail: route } : null, '', '#' + route); }
  });
  document.getElementById('detail-close').addEventListener('click', close);
  dialog.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });
  window.addEventListener('hashchange', function () { if (content && mode !== 'gallery') applyRoute(); });
  document.getElementById('lang-toggle').addEventListener('click', function () {
    lang = lang === 'zh' ? 'en' : 'zh';
    try { localStorage.setItem('portfolio.' + mode + '.language', lang); } catch (e) { /* 禁用存储不影响语言切换 */ }
    var focusRoute = returnFocus && returnFocus.dataset.route, route = opened;
    render(); if (route) { returnFocus = focusRoute ? document.querySelector('[data-route="' + focusRoute + '"]') : null; open(route, false); }
  });
  window.addEventListener('scroll', function () {
    var max = document.documentElement.scrollHeight - innerHeight;
    document.getElementById('progress').style.width = (max > 0 ? Math.min(100, 100 * scrollY / max) : 0) + '%';
  }, { passive: true });
  Promise.all([fetch(document.body.dataset.content).then(function (r) { if (!r.ok) throw new Error('content.yaml: ' + r.status); return r.text(); }), fetch(new URL('content/ui.yaml', rootURL)).then(function (r) { if (!r.ok) throw new Error('ui.yaml: ' + r.status); return r.text(); })]).then(function (texts) {
    content = window.jsyaml.load(texts[0]); ui = window.jsyaml.load(texts[1]);
    if (mode !== 'gallery') { var errors = M.validate(content); if (errors.length) throw new Error(errors.join('\n')); }
    lang = content.site.defaultLanguage;
    try { var saved = localStorage.getItem('portfolio.' + mode + '.language'); if (content.site.languages.indexOf(saved) >= 0) lang = saved; } catch (e) { /* 存储可选 */ }
    render(); document.body.dataset.ready = 'true'; if (mode !== 'gallery') applyRoute();
  }).catch(function (error) {
    main.innerHTML = '<div class="load-error"><h1>内容没有加载成功。<br>Content could not load.</h1><p>请通过 HTTP 预览，并检查内容文件。<br>Preview over HTTP and check your content file.</p><pre>' + esc(error.message) + '</pre></div>';
    document.body.dataset.ready = 'error';
  });
})();
