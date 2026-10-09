/* ============================================================
   足迹地球—— Canvas 2D 正射投影，零依赖
   只管地球本身：海陆填色、海岸线、航线、pin、拖动缩放、开场转动。
   不知道弹窗的存在；点了哪个地点通过 onSelectPlace 告诉外面（app.js）。
   纯数学函数挂在 PortfolioGlobe.math 上，tools/check_trips.mjs 直接测。
   ============================================================ */
(function () {
  'use strict';

  var D = Math.PI / 180;

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  /* 经纬度 → 单位球向量 */
  function vec(lon, lat) {
    var c = Math.cos(lat * D);
    return [c * Math.cos(lon * D), c * Math.sin(lon * D), Math.sin(lat * D)];
  }

  /* 单位球上的点转到观察坐标：[深度, 右, 上]；深度 > 0 表示朝向观众 */
  function rotate(v, view) {
    var l = view.lon * D, p = view.lat * D;
    var cl = Math.cos(l), sl = Math.sin(l), cp = Math.cos(p), sp = Math.sin(p);
    var x1 = v[0] * cl + v[1] * sl, y1 = -v[0] * sl + v[1] * cl, z1 = v[2];
    return [x1 * cp + z1 * sp, y1, -x1 * sp + z1 * cp];
  }

  /* 圆盘上的 (u 右, v 上)（以半径为 1）反算经纬度；圆盘外返回 null */
  function unproject(u, v, view) {
    var q = u * u + v * v;
    if (q > 1) return null;
    var dep = Math.sqrt(1 - q);
    var l = view.lon * D, p = view.lat * D;
    var cl = Math.cos(l), sl = Math.sin(l), cp = Math.cos(p), sp = Math.sin(p);
    var x1 = dep * cp - v * sp, z = dep * sp + v * cp;
    var x = x1 * cl - u * sl, y = x1 * sl + u * cl;
    return { lon: Math.atan2(y, x) / D, lat: Math.asin(clamp(z, -1, 1)) / D };
  }

  function normLon(l) { return ((l + 180) % 360 + 360) % 360 - 180; }

  function angleDeg(a, b) {
    var d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) /
            (Math.hypot(a[0], a[1], a[2]) * Math.hypot(b[0], b[1], b[2]));
    return Math.acos(clamp(d, -1, 1)) / D;
  }

  /* 大圆弧，中间向外拱起：lift = 1 时最高 min(.28, 角距 × .16) 倍半径 */
  function arc(a, b, n, lift) {
    var w = angleDeg(a, b) * D, s = Math.sin(w) || 1, h = Math.min(0.28, w * 0.16) * lift, out = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, A = Math.sin((1 - t) * w) / s, B = Math.sin(t * w) / s, m = 1 + h * Math.sin(Math.PI * t);
      if (w < 1e-9) { A = 1 - t; B = t; }
      out.push([(A * a[0] + B * b[0]) * m, (A * a[1] + B * b[1]) * m, (A * a[2] + B * b[2]) * m]);
    }
    return out;
  }

  /* 屏幕上距离 < radius 的点合成一组（按输入顺序贪心），组的位置取成员平均 */
  function cluster(points, radius) {
    var groups = [];
    points.forEach(function (p) {
      for (var i = 0; i < groups.length; i++) {
        if (Math.hypot(groups[i].x0 - p.x, groups[i].y0 - p.y) < radius) { groups[i].items.push(p); return; }
      }
      groups.push({ x0: p.x, y0: p.y, items: [p] });
    });
    return groups.map(function (g) {
      var x = 0, y = 0;
      g.items.forEach(function (p) { x += p.x; y += p.y; });
      return { x: x / g.items.length, y: y / g.items.length, ids: g.items.map(function (p) { return p.id; }) };
    });
  }

  function centroid(pts) {
    var s = [0, 0, 0];
    pts.forEach(function (p) { var v = vec(p.lon, p.lat); s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; });
    return { lon: Math.atan2(s[1], s[0]) / D, lat: Math.atan2(s[2], Math.hypot(s[0], s[1])) / D };
  }

  /* land-110m.json：每个环首点为 0.1° 整数绝对值，其后为整数差值 */
  function decodeLand(json) {
    var sc = json.scale || 0.1;
    return (json.rings || []).map(function (r) {
      var out = [], lon = 0, lat = 0;
      for (var i = 0; i + 1 < r.length; i += 2) {
        lon += r[i]; lat += r[i + 1];
        out.push(lon * sc, lat * sc);
      }
      return out;
    });
  }

  var MATH = {
    vec: vec, rotate: rotate, unproject: unproject, normLon: normLon, angleDeg: angleDeg,
    arc: arc, cluster: cluster, centroid: centroid, decodeLand: decodeLand
  };

  /* ---------------- 画地球 ---------------- */

  var MW = 1440, MH = 720;           // 陆地掩膜：经纬度平面上每格 0.25°
  var MIN_K = 1, MAX_K = 8, MIN_LAT = -35, MAX_LAT = 65;
  var DOT_R = 12, CLUSTER_R = 18;    // pin 圆点（含白边）、合并圆点的半径，摆地名时避开
  var LABEL_GAP = 12, LABEL_PAD = 2; // 地名离 pin 中心的距离（和 CSS 的 left / right:34px 对应）、地名之间的最小间隔
  var ZOOMED = 1.05;                 // 超过这个倍数算「放大了」：画布接管手指的上下拖动

  function hexRgb(s) {
    var m = /^#([0-9a-f]{6})$/i.exec(String(s || '').trim());
    if (!m) return [0, 0, 0];
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  /* 在离屏 Canvas 上按经纬度填一次陆地，得到 1 = 陆地 的掩膜 */
  function buildMask(rings) {
    var c = document.createElement('canvas');
    c.width = MW; c.height = MH;
    var g = c.getContext('2d');
    g.beginPath();
    rings.forEach(function (r) {
      var pts = [], off = 0, prev = null, sum = 0;
      for (var i = 0; i + 1 < r.length; i += 2) {
        var lon = r[i] + off;
        /* 跨 ±180° 的轮廓：把经度展开成连续的 */
        if (prev !== null) {
          if (lon - prev > 180) { off -= 360; lon -= 360; }
          else if (lon - prev < -180) { off += 360; lon += 360; }
        }
        pts.push([lon, r[i + 1]]);
        prev = lon; sum += r[i + 1];
      }
      if (!pts.length) return;
      /* 南极洲这类绕极一圈的环：展开后首尾差约 360°，补两个极点把它封起来 */
      if (Math.abs(pts[pts.length - 1][0] - pts[0][0]) > 300) {
        var pole = sum < 0 ? -90 : 90;
        pts.push([pts[pts.length - 1][0], pole], [pts[0][0], pole]);
      }
      [-360, 0, 360].forEach(function (o) {
        pts.forEach(function (p, j) {
          var x = (p[0] + o + 180) / 360 * MW, y = (90 - p[1]) / 180 * MH;
          if (j) g.lineTo(x, y); else g.moveTo(x, y);
        });
        g.closePath();
      });
    });
    g.fillStyle = '#000';
    g.fill('evenodd');
    var d = g.getImageData(0, 0, MW, MH).data, mask = new Uint8Array(MW * MH);
    for (var k = 0; k < mask.length; k++) mask[k] = d[k * 4 + 3] > 127 ? 1 : 0;
    return mask;
  }

  function graticule() {
    var g = [], lo, la, line;
    for (lo = -180; lo < 180; lo += 30) { line = []; for (la = -80; la <= 80; la += 4) line.push(vec(lo, la)); g.push(line); }
    for (la = -60; la <= 60; la += 30) { line = []; for (lo = -180; lo <= 180; lo += 4) line.push(vec(lo, la)); g.push(line); }
    return g;
  }

  function create(root, opts) {
    var canvas = root && root.querySelector('.globe-canvas');
    var pinsEl = root && root.querySelector('.globe-pins');
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx || !pinsEl) return null;

    var css = window.getComputedStyle(root);
    function cssVar(n) { return css.getPropertyValue(n).trim(); }
    var COL = {
      ocean: hexRgb(cssVar('--globe-ocean')), land: hexRgb(cssVar('--globe-land')), ice: hexRgb(cssVar('--globe-ice')),
      coast: cssVar('--globe-coast'), grid: cssVar('--globe-grid'), rim: cssVar('--globe-rim'),
      arc: cssVar('--globe-arc'), route: cssVar('--globe-route'), home: cssVar('--globe-home')
    };
    var reduced = opts.reducedMotion || function () { return false; };
    var mask = buildMask(opts.land);
    var landV = opts.land.map(function (r) {
      var o = [];
      for (var i = 0; i + 1 < r.length; i += 2) o.push(vec(r[i], r[i + 1]));
      return o;
    });
    var grat = graticule();
    var homeV = vec(opts.home.lon, opts.home.lat);
    var introTarget = opts.initialView || opts.home;
    /* 开场：从起点转到内容指定的视角 */
    var introLon = opts.home.lon - ((normLon(opts.home.lon - introTarget.lon) + 360) % 360);

    var view = { lon: opts.home.lon, lat: 22, k: 1 };
    var W = 0, H = 0, R = 0, cx = 0, cy = 0, dpr = 1;
    var places = [], byId = {}, selectedId = null, clusterPool = [];
    var route = null, routeDashed = false, routeProg = 1;
    var flight = null;
    var plane = document.createElement('span');
    plane.className = 'globe-plane'; plane.hidden = true; plane.setAttribute('aria-hidden', 'true');
    plane.innerHTML = '<svg viewBox="0 0 34 28" xmlns="http://www.w3.org/2000/svg">' +
      '<path class="plane-paper" d="M32 14 2 2 8 14 2 26Z"/>' +
      '<path class="plane-fold" d="M32 14 8 14 2 26Z"/>' +
      '<path class="plane-paper" d="M8 14 5 20 32 14"/></svg>';
    root.appendChild(plane);
    var anim = null, iner = null, raf = 0, drag = null, pinch = null, pointers = {};
    var interactive = true, visible = false, inView = false, introDone = false, introAbort = false;
    var fcan = document.createElement('canvas'), fctx = fcan.getContext('2d'), fimg = null, FN = 0;

    function clampK(k) { return clamp(k, MIN_K, MAX_K); }

    /* 减少动态效果：不播开场，第一帧就是开场结束的画面 */
    if (reduced()) { view.lon = introLon; view.lat = introTarget.lat; introDone = true; introAbort = true; }

    /* 任何主动改视角（拖、点、键盘、flyTo、focusPlace）都取消开场，包括已经排上但还没开始的那一次 */
    function stopIntro() { introDone = true; introAbort = true; }

    /* 放大到这几个地点两两在屏幕上相距 ≥ 34px 所需的倍数（点在画面中心附近时，屏幕距离 ≈ R·k·角距） */
    function kToSeparate(list) {
      var need = 0;
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var a = angleDeg(list[i].v, list[j].v) * D;
          if (a > 1e-6) need = Math.max(need, 34 / (R * a));
        }
      }
      return need;
    }

    /* ---- 绘制 ---- */

    function fill(rr) {
      var n = Math.min(520, Math.max(64, Math.round(Math.min(W, H) * Math.min(dpr, 1.25))));
      if (n !== FN) { FN = n; fcan.width = n; fcan.height = n; fimg = fctx.createImageData(n, n); }
      var data = fimg.data, l = view.lon * D, p = view.lat * D;
      var cl = Math.cos(l), sl = Math.sin(l), cp = Math.cos(p), sp = Math.sin(p), px = W / n, py = H / n;
      for (var j = 0; j < n; j++) {
        var v = (cy - (j + 0.5) * py) / rr;
        for (var i = 0; i < n; i++) {
          var u = ((i + 0.5) * px - cx) / rr, q = u * u + v * v, o = (j * n + i) * 4;
          if (q > 1) { data[o + 3] = 0; continue; }
          var dep = Math.sqrt(1 - q), x1 = dep * cp - v * sp, z = dep * sp + v * cp;
          var x = x1 * cl - u * sl, y = x1 * sl + u * cl;
          var lat = Math.asin(z), lon = Math.atan2(y, x);
          var mx = ((lon / D + 180) * 4) | 0, my = ((90 - lat / D) * 4) | 0;
          if (mx >= MW) mx = MW - 1; if (my >= MH) my = MH - 1;
          var land = mask[my * MW + mx];
          var c = land ? ((lat > 70 * D || lat < -60 * D) ? COL.ice : COL.land) : COL.ocean;
          var sh = 1 - 0.14 * (1 - dep);   // 越靠近边缘越暗，最多 14%
          data[o] = c[0] * sh; data[o + 1] = c[1] * sh; data[o + 2] = c[2] * sh; data[o + 3] = 255;
        }
      }
      fctx.putImageData(fimg, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(fcan, 0, 0, W, H);
    }

    /* 只画朝向观众的半球；跨过地球边缘时插值出恰好落在边缘上的点，线条不断开 */
    function strokeLines(lines, color, width, rr) {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath();
      lines.forEach(function (pts) {
        var prev = null, on = false;
        for (var i = 0; i < pts.length; i++) {
          var q = rotate(pts[i], view), vis = q[0] > 0;
          if (prev && (prev[0] > 0) !== vis) {
            var t = prev[0] / (prev[0] - q[0]), y = prev[1] + (q[1] - prev[1]) * t, z = prev[2] + (q[2] - prev[2]) * t;
            var nn = Math.hypot(y, z) || 1, ex = cx + rr * y / nn, ey = cy - rr * z / nn;
            if (vis) { ctx.moveTo(ex, ey); on = true; } else { ctx.lineTo(ex, ey); on = false; }
          }
          if (vis) {
            var sx = cx + rr * q[1], sy = cy - rr * q[2];
            if (on) ctx.lineTo(sx, sy); else { ctx.moveTo(sx, sy); on = true; }
          }
          prev = q;
        }
      });
      ctx.stroke();
    }

    /* 抬高的航线：朝向观众、或者抬到了地球轮廓外面的部分才画 */
    function strokeArc(pts, upto, rr) {
      var on = false, lim = Math.floor((pts.length - 1) * upto);
      ctx.beginPath();
      for (var i = 0; i <= lim; i++) {
        var q = rotate(pts[i], view), vis = q[0] > 0 || Math.hypot(q[1], q[2]) > 1.0005;
        if (vis) {
          var sx = cx + rr * q[1], sy = cy - rr * q[2];
          if (on) ctx.lineTo(sx, sy); else { ctx.moveTo(sx, sy); on = true; }
        } else on = false;
      }
      ctx.stroke();
    }

    function drawHome(rr) {
      var h = rotate(homeV, view);
      if (h[0] <= 0) return;
      var x = cx + rr * h[1], y = cy - rr * h[2];
      /* 通用起点图标：屋顶、门窗，颜色沿用地图配置。 */
      ctx.save(); ctx.translate(x, y); ctx.lineJoin = 'round';
      ctx.fillStyle = COL.home; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(5, -13, 4, 9, 1); ctx.stroke(); ctx.fill();
      ctx.beginPath(); ctx.roundRect(-9, -3, 18, 17, 3);
      ctx.fillStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); ctx.fill();
      ctx.strokeStyle = COL.home; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-13, -2); ctx.lineTo(0, -13); ctx.lineTo(13, -2);
      ctx.lineTo(10, 1); ctx.lineTo(0, -7); ctx.lineTo(-10, 1); ctx.closePath();
      ctx.fillStyle = COL.home; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.fill();
      ctx.beginPath(); ctx.roundRect(2, 5, 5, 9, 1.5); ctx.fill();
      ctx.beginPath(); ctx.roundRect(-7, 3, 5, 5, 1); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-4.5, 3); ctx.lineTo(-4.5, 8); ctx.moveTo(-7, 5.5); ctx.lineTo(-2, 5.5); ctx.stroke();
      ctx.restore();
    }

    function drawPlane(rr) {
      plane.hidden = true;
      if (!flight) return;
      var path = flight.path, n = path.length - 1, at = flight.progress * n;
      var i = Math.min(n - 1, Math.floor(at)), f = at - i, a = path[i], b = path[i + 1];
      var q = rotate([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], view);
      if (q[0] <= 0 && Math.hypot(q[1], q[2]) <= 1.0005) return;
      var next = rotate(b, view), prev = rotate(a, view);
      var angle = Math.atan2(-(next[2] - prev[2]), next[1] - prev[1]);
      plane.hidden = false;
      plane.style.transform = 'translate(' + (cx + rr * q[1] - 17) + 'px,' + (cy - rr * q[2] - 14) + 'px) rotate(' + angle + 'rad)';
      plane.style.opacity = String(Math.min(1, (1 - flight.progress) / 0.12));
    }

    function draw() {
      if (!W) return;
      var rr = R * view.k;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      fill(rr);
      strokeLines(grat, COL.grid, 0.8, rr);
      strokeLines(landV, COL.coast, 0.9, rr);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 2 * Math.PI);
      ctx.strokeStyle = COL.rim; ctx.lineWidth = 1.2; ctx.stroke();

      ctx.setLineDash([2, 7]); ctx.strokeStyle = COL.arc; ctx.lineWidth = 1.6;
      places.forEach(function (p) { strokeArc(p.arc, 1, rr); });
      ctx.setLineDash([]);

      if (flight) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 5.5; strokeArc(flight.path, flight.progress, rr);
        ctx.strokeStyle = COL.route; ctx.lineWidth = 2.6; strokeArc(flight.path, flight.progress, rr);
      } else if (route) {
        if (routeDashed) ctx.setLineDash([6, 6]);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 5.5; strokeArc(route, routeProg, rr);
        ctx.strokeStyle = COL.route; ctx.lineWidth = 2.6; strokeArc(route, routeProg, rr);
        ctx.setLineDash([]);
      }
      drawHome(rr);
      drawPlane(rr);
      placePins(rr);
      root.classList.toggle('is-zoomed', view.k > ZOOMED);
      root.dataset.view = view.lon.toFixed(2) + ',' + view.lat.toFixed(2) + ',' + view.k.toFixed(2);
    }

    /* ---- pin ---- */

    function getCluster(i) {
      if (!clusterPool[i]) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'globe-cluster';
        b.innerHTML = '<span aria-hidden="true"></span>';
        b.addEventListener('click', function () {
          if (!interactive || !b._ids) return;
          var members = b._ids.map(function (id) { return byId[id]; });
          var c = centroid(members);
          flyTo(c.lon, c.lat, Math.min(MAX_K, Math.max(view.k * 2, kToSeparate(members))), function () {
            /* 圆点分开后自己会被隐藏；键盘用户的焦点交给组里第一个现在看得见的 pin，不掉到 body */
            var a = document.activeElement;
            if (a !== b && a !== document.body && a !== null) return;
            for (var i = 0; i < members.length; i++) {
              if (!members[i].el.hidden) { members[i].el.focus({ preventScroll: true }); return; }
            }
          });
        });
        pinsEl.appendChild(b);
        clusterPool[i] = b;
      }
      return clusterPool[i];
    }

    function placePins(rr) {
      var vis = [];
      places.forEach(function (p) {
        var q = rotate(p.v, view), x = cx + rr * q[1], y = cy - rr * q[2];
        if (q[0] < 0.08 || x < 0 || y < 0 || x > W || y > H) { p.el.hidden = true; p.el.tabIndex = -1; return; }
        vis.push({ id: p.id, x: x, y: y });
      });
      var ci = 0, singles = [], blocks = [];
      cluster(vis, 30).forEach(function (g) {
        if (g.ids.length === 1) {
          var el = byId[g.ids[0]].el;
          el.hidden = false; el.tabIndex = 0;
          el.style.transform = 'translate(' + g.x.toFixed(1) + 'px,' + g.y.toFixed(1) + 'px)';
          singles.push({ p: byId[g.ids[0]], x: g.x, y: g.y });
          blocks.push(around(g.x, g.y, DOT_R, g.ids[0]));
          return;
        }
        blocks.push(around(g.x, g.y, CLUSTER_R, null));
        g.ids.forEach(function (id) { byId[id].el.hidden = true; byId[id].el.tabIndex = -1; });
        var c = getCluster(ci++), names = g.ids.map(function (id) { return byId[id].label; });
        c.hidden = false; c._ids = g.ids;
        c.style.transform = 'translate(' + g.x.toFixed(1) + 'px,' + g.y.toFixed(1) + 'px)';
        c.firstChild.textContent = g.ids.length;
        c.setAttribute('aria-label', opts.clusterLabel ? opts.clusterLabel(names) : names.join(', '));
      });
      for (; ci < clusterPool.length; ci++) { clusterPool[ci].hidden = true; clusterPool[ci]._ids = null; }
      placeLabels(singles, blocks);
      if (opts.zoomIn) opts.zoomIn.disabled = view.k >= MAX_K - 1e-6;
      if (opts.zoomOut) opts.zoomOut.disabled = view.k <= MIN_K + 1e-6;
    }

    /* 以 (x, y) 为中心、半径 r 的方块；own 是它属于哪个 pin（地名不算压住自己的点） */
    function around(x, y, r, own) { return { l: x - r, t: y - r, r: x + r, b: y + r, own: own }; }

    function hits(box, list) {
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (o.own === box.own && o.own !== null) continue;
        if (box.l < o.r + LABEL_PAD && o.l < box.r + LABEL_PAD && box.t < o.b + LABEL_PAD && o.t < box.b + LABEL_PAD) return true;
      }
      return false;
    }

    function rank(p) { return (p.id === selectedId ? 1e6 : 0) + (p.featured ? 1e3 : 0) + (p.weight || 0); }

    /* 地名默认显示：按「选中 > 重点旅行 > 去过的次数」依次摆在 pin 右边（靠右的 pin 先试左边），
       和已经摆好的地名或别的 pin 重叠就换一边，两边都不行就先不显示，放大后有地方了再出来 */
    function placeLabels(singles, blocks) {
      var taken = blocks.slice();
      singles.sort(function (a, b) { return rank(b.p) - rank(a.p); });
      singles.forEach(function (s) {
        var p = s.p, el = p.el, sides = s.x > W * 0.72 ? [-1, 1] : [1, -1], got = 0;
        if (!p.lw) { p.lw = el.lastChild.offsetWidth; p.lh = el.lastChild.offsetHeight; }
        for (var i = 0; i < 2 && !got; i++) {
          var l = sides[i] > 0 ? s.x + LABEL_GAP : s.x - LABEL_GAP - p.lw;
          var box = { l: l, t: s.y - p.lh / 2, r: l + p.lw, b: s.y + p.lh / 2, own: p.id };
          if (box.l < 0 || box.r > W || hits(box, taken)) continue;
          taken.push(box);
          got = sides[i];
        }
        el.classList.toggle('is-left', (got || sides[0]) < 0);
        el.classList.toggle('has-label', got !== 0);
      });
    }

    function setPlaces(list) {
      pinsEl.innerHTML = '';
      clusterPool = []; byId = {};
      places = list.map(function (p) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'globe-pin globe-pin--' + p.kind;
        b.setAttribute('data-id', p.id);
        b.setAttribute('aria-label', p.aria);
        if (p.haspopup) b.setAttribute('aria-haspopup', p.haspopup);
        b.innerHTML = '<span class="globe-pin-dot" aria-hidden="true"></span><span class="globe-pin-label" aria-hidden="true"></span>';
        b.lastChild.textContent = p.label;
        b.addEventListener('click', function () {
          if (interactive && opts.onSelectPlace) opts.onSelectPlace(p.id, b);
        });
        pinsEl.appendChild(b);
        var v = vec(p.lon, p.lat);
        var o = { id: p.id, lon: p.lon, lat: p.lat, label: p.label, v: v, arc: arc(homeV, v, 64, 1), el: b,
                  featured: p.kind === 'featured', weight: p.weight || 0, lw: 0, lh: 0 };
        byId[p.id] = o;
        return o;
      });
      select(selectedId);
    }

    function select(id) {
      selectedId = id || null;
      places.forEach(function (p) { p.el.classList.toggle('is-selected', p.id === selectedId); });
      draw();   // 选中的地名优先摆
    }

    function highlight(stops, oneWay) {
      if (!stops) { route = null; draw(); return; }
      var seq = [homeV].concat(stops.filter(function (id) { return byId[id]; }).map(function (id) { return byId[id].v; }));
      if (!oneWay) seq.push(homeV);
      route = [];
      for (var i = 0; i < seq.length - 1; i++) route = route.concat(arc(seq[i], seq[i + 1], 60, 0.8));
      routeDashed = !!oneWay;
      routeProg = (reduced() || !visible) ? 1 : 0;
      draw();
      if (routeProg < 1) kick();
    }

    /* ---- 动画 ---- */

    function kick() { if (!raf && visible) raf = window.requestAnimationFrame(loop); }

    /* 拖动 / 捏合时一帧最多画一次（有的浏览器 pointermove 比刷新率更密）；看不见时直接画 */
    function requestDraw() { if (visible) kick(); else draw(); }

    function loop(now) {
      raf = 0;
      var busy = false;
      if (anim) {
        var t = clamp((now - anim.t0) / anim.dur, 0, 1), e = anim.ease(t);
        view.lon = anim.a.lon + (anim.b.lon - anim.a.lon) * e;
        view.lat = anim.a.lat + (anim.b.lat - anim.a.lat) * e;
        view.k = anim.a.k + (anim.b.k - anim.a.k) * e;
        if (t >= 1) { var cb = anim.done; anim = null; if (cb) cb(); } else busy = true;
      }
      if (iner) {
        /* 按真实经过的时间算（每 16.7ms 衰减到 0.93），120Hz 屏幕上和 60Hz 转得一样快、一样远 */
        var dt = clamp(now - iner.t, 0, 64);
        iner.t = now;
        view.lon -= iner.v * dt;
        iner.v *= Math.pow(0.93, dt / (1000 / 60));
        if (Math.abs(iner.v) < 0.002) iner = null; else busy = true;
      }
      if (flight) {
        /* 按时间推进，屏幕刷新率不会改变飞行时长。 */
        flight.progress = reduced() ? 1 : clamp((now - flight.t0) / 1000, 0, 1);
        if (flight.progress >= 1) {
          var arrived = flight.done, target = flight.id;
          flight = null; routeProg = 1; focusPlace(target, null, true);
          if (arrived) arrived();
        } else busy = true;
      }
      if (!flight && route && routeProg < 1) { routeProg = Math.min(1, routeProg + 0.022); busy = true; }
      draw();
      if (busy) kick();
    }

    /* 看不见了（滚走 / 切到后台）：所有动画直接到终点，停止循环 */
    function finishAll() {
      if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
      if (anim) {
        view.lon = anim.b.lon; view.lat = anim.b.lat; view.k = anim.b.k;
        var cb = anim.done; anim = null;
        if (cb) cb();
      }
      /* 用户滚离地图或切到后台时取消待打开详情。 */
      cancelTravel(); iner = null; routeProg = 1;
      draw();
    }

    function cancelTravel() {
      var pending = !!flight;
      flight = null; plane.hidden = true;
      if (pending) {
        anim = null;
        if (opts.onTravelCancel) opts.onTravelCancel();
      }
    }

    function flyTo(lon, lat, k, done, dur) {
      stopIntro();
      cancelTravel();
      iner = null;
      var b = { lon: view.lon + normLon(lon - view.lon), lat: clamp(lat, MIN_LAT, MAX_LAT), k: clampK(k == null ? view.k : k) };
      if (reduced() || !visible) {
        anim = null; view.lon = b.lon; view.lat = b.lat; view.k = b.k;
        draw();
        if (done) done();
        return;
      }
      anim = {
        a: { lon: view.lon, lat: view.lat, k: view.k }, b: b, t0: window.performance.now(),
        dur: dur || Math.min(1100, 500 + Math.abs(b.lon - view.lon) * 3), ease: easeInOut, done: done
      };
      kick();
    }

    function focusPlace(id, done, instant) {
      cancelTravel();
      var p = byId[id];
      if (!p) { if (done) done(); return; }
      /* 放大到离它最近的那个地点也能分开（至少 1.4 倍）；最近的分开了，更远的自然也分开 */
      var nearest = null, best = Infinity;
      places.forEach(function (o) {
        if (o === p) return;
        var a = angleDeg(o.v, p.v);
        if (a < best) { best = a; nearest = o; }
      });
      var k = clampK(Math.max(view.k, 1.4, nearest ? kToSeparate([p, nearest]) : 0));
      stopIntro();
      if (instant) {
        anim = null; iner = null;
        view.lon = view.lon + normLon(p.lon - view.lon); view.lat = clamp(p.lat - 8, MIN_LAT, MAX_LAT); view.k = clampK(k);
        draw();
        if (done) done();
        return;
      }
      flyTo(p.lon, p.lat - 8, k, done);
    }

    function travelTo(id, done) {
      var p = byId[id]; cancelTravel();
      if (!p || opts.flightEnabled === false || reduced() || !visible || angleDeg(homeV, p.v) < 1e-6) { focusPlace(id, done, true); return; }
      stopIntro(); anim = null; iner = null;
      view.lon = opts.home.lon; view.lat = clamp(opts.home.lat - 8, MIN_LAT, MAX_LAT); view.k = 1;
      flyTo(p.lon, p.lat - 8, 1, null, 1000);
      flight = { id: id, path: arc(homeV, p.v, 120, 0.8), progress: 0, t0: window.performance.now(), done: done };
      draw(); kick();
    }

    function tryIntro() {
      if (introDone || !inView || document.visibilityState !== 'visible') return;
      introDone = true;
      window.setTimeout(function () {
        if (introAbort || anim || drag || !interactive) return;
        if (reduced()) { view.lon = introLon; view.lat = introTarget.lat; draw(); return; }
        anim = { a: { lon: view.lon, lat: view.lat, k: view.k }, b: { lon: introLon, lat: introTarget.lat, k: view.k },
                 t0: window.performance.now(), dur: 2600, ease: easeOut, done: null };
        kick();
      }, 500);
    }

    /* ---- 输入 ---- */

    function degPerPx() { return 1 / (R * view.k * D); }

    canvas.addEventListener('pointerdown', function (e) {
      if (!interactive) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      stopIntro(); cancelTravel(); anim = null; iner = null;
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: view.k };
        drag = null;
        return;
      }
      drag = { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch', zoomed: view.k > ZOOMED, t: window.performance.now(), v: 0 };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (pinch) {
        var ids = Object.keys(pointers);
        if (ids.length < 2) return;
        var a = pointers[ids[0]], b = pointers[ids[1]];
        view.k = clampK(pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
        requestDraw();
        return;
      }
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = window.performance.now(), per = degPerPx();
      view.lon -= dx * per;
      /* 1 倍时手指上下滑留给页面（画布是 pan-y），放大后画布接管手指（touch-action:none），上下拖改倾角 */
      if (!drag.touch || drag.zoomed) view.lat = clamp(view.lat + dy * per, MIN_LAT, MAX_LAT);
      drag.v = (dx * per) / Math.max(1, now - drag.t);
      drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
      requestDraw();
    });
    function up(e) {
      delete pointers[e.pointerId];
      if (pinch) { if (Object.keys(pointers).length < 2) pinch = null; return; }
      if (drag && !reduced() && window.performance.now() - drag.t < 80 && Math.abs(drag.v) > 0.01) {
        iner = { v: drag.v, t: window.performance.now() };
        kick();
      }
      if (drag) draw();   // 松手时把最后一次移动立刻画出来
      drag = null;
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    /* 触控板捏合会以 Ctrl + 滚轮的形式到达；普通滚轮留给页面滚动 */
    canvas.addEventListener('wheel', function (e) {
      if (!e.ctrlKey || !interactive) return;
      e.preventDefault();
      stopIntro(); cancelTravel(); anim = null;
      view.k = clampK(view.k * Math.exp(-e.deltaY * 0.01));
      draw();
    }, { passive: false });

    canvas.addEventListener('keydown', function (e) {
      if (!interactive) return;
      var s = 10 / view.k;
      var m = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] }[e.key];
      if (m) { e.preventDefault(); flyTo(view.lon + m[0], view.lat + m[1], view.k, null, 250); return; }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.8); }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(1 / 1.8); }
    });

    function zoomBy(f) { flyTo(view.lon, view.lat, view.k * f, null, 350); }
    if (opts.zoomIn) opts.zoomIn.addEventListener('click', function () { if (interactive) zoomBy(1.8); });
    if (opts.zoomOut) opts.zoomOut.addEventListener('click', function () { if (interactive) zoomBy(1 / 1.8); });

    /* ---- 尺寸、可见性 ---- */

    function resize() {
      var r = root.getBoundingClientRect();
      if (!r.width) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      cx = W / 2; cy = H / 2;
      R = Math.min(W, H) / 2 - 16;
      places.forEach(function (p) { p.lw = 0; });   // 手机和桌面的地名字号不同，重新量
      draw();
    }
    if ('ResizeObserver' in window) new window.ResizeObserver(resize).observe(root);
    else window.addEventListener('resize', resize);
    resize();

    if ('IntersectionObserver' in window) {
      new window.IntersectionObserver(function (en) {
        var r = en[en.length - 1];
        visible = r.isIntersecting;
        inView = r.intersectionRatio >= 0.4;
        if (!visible) finishAll(); else { draw(); tryIntro(); }
      }, { threshold: [0, 0.4] }).observe(root);
    } else {
      visible = true; inView = true;
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') finishAll(); else tryIntro();
    });

    return {
      setPlaces: setPlaces,
      select: select,
      highlight: highlight,
      flyTo: flyTo,
      focusPlace: focusPlace,
      travelTo: travelTo,
      cancelTravel: cancelTravel,
      skipIntro: stopIntro,
      setInteractive: function (on) {
        interactive = !!on;
        if (!interactive) { cancelTravel(); drag = null; pinch = null; pointers = {}; iner = null; }
      },
      pin: function (id) { var p = byId[id]; return p && !p.el.hidden ? p.el : null; },
      view: function () { return { lon: view.lon, lat: view.lat, k: view.k }; }
    };
  }

  window.PortfolioGlobe = { math: MATH, create: create };
})();
