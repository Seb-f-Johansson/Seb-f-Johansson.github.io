/* AI exposure explorer: SVG scatter of DAIOE (or C-DAIOE) against task complementarity, 422 ISCO-08 occupations. */
(function () {
  'use strict';
  var chart = document.getElementById('chart');
  if (!chart) return;
  var q = document.getElementById('q'), majorSel = document.getElementById('major'), xSel = document.getElementById('xvar');
  var tBtn = document.getElementById('toggleTable'), tWrap = document.getElementById('tableWrap'), tbody = document.querySelector('#table tbody');
  var countEl = document.getElementById('count');
  var NS = 'http://www.w3.org/2000/svg';
  var W = 900, H = 540, M = { t: 24, r: 24, b: 54, l: 62 };
  var data = [], med = {}, state = { x: 'daioe', query: '', major: '', sortK: 'daioe', sortDir: -1 };
  var MAJOR = { '1': 'Managers', '2': 'Professionals', '3': 'Technicians and associate professionals', '4': 'Clerical support workers',
                '5': 'Service and sales workers', '6': 'Skilled agricultural, forestry and fishery workers', '7': 'Craft and related trades workers',
                '8': 'Plant and machine operators and assemblers', '9': 'Elementary occupations' };

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); var m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function quadrant(d) {
    var hx = d[state.x] >= med[state.x], hc = d.comp >= med.comp;
    return hx ? (hc ? 2 : 1) : (hc ? 3 : 4);
  }
  var QNAME = { 1: 'High exposure, low complementarity', 2: 'High exposure, high complementarity', 3: 'Low exposure, high complementarity', 4: 'Low exposure, low complementarity' };
  function matches(d) {
    if (state.major && d.isco.charAt(0) !== state.major) return false;
    if (!state.query) return true;
    return d.title.toLowerCase().indexOf(state.query) >= 0 || d.isco.indexOf(state.query) === 0;
  }
  function niceTicks(lo, hi, n) {
    var span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / n)));
    var err = span / n / step; step *= err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1;
    var t = [], v = Math.ceil(lo / step) * step; for (; v <= hi + 1e-9; v += step) t.push(+v.toFixed(6)); return t;
  }
  function fmt(v, k) { return k === 'comp' ? v.toFixed(2) : v.toFixed(1); }

  var tip = document.createElement('div'); tip.className = 'tooltip'; chart.appendChild(tip);

  function draw() {
    chart.querySelectorAll('svg').forEach(function (s) { s.remove(); });
    var xk = state.x, xlab = xk === 'daioe' ? 'AI exposure (DAIOE, 2024)' : 'Complementarity-adjusted exposure (C-DAIOE, 2024)';
    var xs = data.map(function (d) { return d[xk]; }), ys = data.map(function (d) { return d.comp; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var px = (x1 - x0) * 0.04, py = (y1 - y0) * 0.06; x0 -= px; x1 += px; y0 -= py; y1 += py;
    var sx = function (v) { return M.l + (v - x0) / (x1 - x0) * (W - M.l - M.r); };
    var sy = function (v) { return H - M.b - (v - y0) / (y1 - y0) * (H - M.t - M.b); };

    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Scatter plot of ' + xlab + ' against task complementarity' });
    chart.insertBefore(svg, tip);
    // axes
    var ax = el('g', { 'class': 'axis' }, svg);
    niceTicks(x0, x1, 7).forEach(function (t) {
      el('line', { x1: sx(t), x2: sx(t), y1: M.t, y2: H - M.b }, ax);
      var tx = el('text', { x: sx(t), y: H - M.b + 16, 'text-anchor': 'middle' }, ax); tx.textContent = t;
    });
    niceTicks(y0, y1, 6).forEach(function (t) {
      el('line', { x1: M.l, x2: W - M.r, y1: sy(t), y2: sy(t) }, ax);
      var tx = el('text', { x: M.l - 8, y: sy(t) + 4, 'text-anchor': 'end' }, ax); tx.textContent = t.toFixed(2);
    });
    el('path', { d: 'M' + M.l + ',' + M.t + 'V' + (H - M.b) + 'H' + (W - M.r), fill: 'none' }, ax);
    var xt = el('text', { 'class': 'axis-title', x: (M.l + W - M.r) / 2, y: H - 14, 'text-anchor': 'middle' }, svg); xt.textContent = xlab + ' →';
    var yt = el('text', { 'class': 'axis-title', x: 16, y: (M.t + H - M.b) / 2, 'text-anchor': 'middle', transform: 'rotate(-90 16 ' + ((M.t + H - M.b) / 2) + ')' }, svg); yt.textContent = 'Task complementarity →';
    // median reference lines + quadrant labels
    var ref = el('g', { 'class': 'ref' }, svg);
    el('line', { x1: sx(med[xk]), x2: sx(med[xk]), y1: M.t, y2: H - M.b }, ref);
    el('line', { x1: M.l, x2: W - M.r, y1: sy(med.comp), y2: sy(med.comp) }, ref);
    var ql = el('g', {}, svg);
    [[W - M.r - 6, M.t + 14, 'end', 'high exposure, high complementarity'], [M.l + 6, M.t + 14, 'start', 'low exposure, high complementarity'],
     [W - M.r - 6, H - M.b - 8, 'end', 'high exposure, low complementarity'], [M.l + 6, H - M.b - 8, 'start', 'low exposure, low complementarity']]
      .forEach(function (a) { var t = el('text', { 'class': 'qlabel', x: a[0], y: a[1], 'text-anchor': a[2] }, ql); t.textContent = a[3]; });
    // points
    var pts = el('g', {}, svg), hl = el('g', { 'class': 'hl' }, svg);
    var anyFilter = !!(state.query || state.major), nMatch = 0, labelled = [];
    data.forEach(function (d) {
      var m = matches(d); if (m) nMatch++;
      var qd = quadrant(d);
      var c = el('circle', { 'class': 'pt', cx: sx(d[xk]).toFixed(1), cy: sy(d.comp).toFixed(1), r: anyFilter && m ? 6 : 4.5,
                             fill: 'var(--q' + qd + ')', stroke: 'var(--card)', 'stroke-width': 1.5,
                             opacity: anyFilter ? (m ? 1 : 0.12) : 0.85 }, pts);
      c.setAttribute('tabindex', '0');
      var show = function (ev) {
        tip.innerHTML = '<b>' + d.isco + ' ' + esc(d.title) + '</b>DAIOE ' + d.daioe.toFixed(1) + ' &middot; C-DAIOE ' + d.cdaioe.toFixed(1) +
                        ' &middot; complementarity ' + d.comp.toFixed(2) + '<div class="q">' + QNAME[qd] + ' &middot; ' + MAJOR[d.isco.charAt(0)] + '</div>';
        tip.style.display = 'block';
        var r = chart.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top;
        tip.style.left = Math.min(px + 14, r.width - 290) + 'px'; tip.style.top = (py + 14) + 'px';
      };
      c.addEventListener('mousemove', show);
      c.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
      c.addEventListener('focus', function () { var b = c.getBoundingClientRect(); show({ clientX: b.left + b.width / 2, clientY: b.top }); });
      c.addEventListener('blur', function () { tip.style.display = 'none'; });
      if (anyFilter && m && state.query) labelled.push(d);
    });
    // direct labels for search hits (cap at 12 so the plot stays legible)
    labelled.slice(0, 12).forEach(function (d) {
      var t = el('text', { x: sx(d[xk]) + 8, y: sy(d.comp) + 4 }, hl);
      t.textContent = d.title.length > 38 ? d.title.slice(0, 36) + '…' : d.title;
    });
    countEl.textContent = (anyFilter ? nMatch + ' of ' : '') + data.length + ' occupations shown. Medians: DAIOE ' + med.daioe.toFixed(1) +
                          ', C-DAIOE ' + med.cdaioe.toFixed(1) + ', complementarity ' + med.comp.toFixed(2) + '. Hover or tab to a point for details.';
    drawTable();
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function drawTable() {
    if (tWrap.hidden) return;
    var rows = data.filter(matches).sort(function (a, b) {
      var k = state.sortK, va = a[k], vb = b[k];
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * state.sortDir;
    });
    tbody.innerHTML = rows.map(function (d) {
      return '<tr><td class="mono">' + d.isco + '</td><td>' + esc(d.title) + '</td><td class="num">' + d.daioe.toFixed(1) +
             '</td><td class="num">' + d.cdaioe.toFixed(1) + '</td><td class="num">' + d.comp.toFixed(3) + '</td></tr>';
    }).join('');
    document.querySelectorAll('#table th').forEach(function (th) {
      th.setAttribute('aria-sort', th.dataset.k === state.sortK ? (state.sortDir > 0 ? 'ascending' : 'descending') : 'none');
      th.textContent = th.textContent.replace(/ [▲▼]$/, '') + (th.dataset.k === state.sortK ? (state.sortDir > 0 ? ' ▲' : ' ▼') : '');
    });
  }

  q.addEventListener('input', function () { state.query = q.value.trim().toLowerCase(); draw(); });
  majorSel.addEventListener('change', function () { state.major = majorSel.value; draw(); });
  xSel.addEventListener('change', function () { state.x = xSel.value; draw(); });
  tBtn.addEventListener('click', function () {
    tWrap.hidden = !tWrap.hidden; tBtn.setAttribute('aria-pressed', tWrap.hidden ? 'false' : 'true');
    tBtn.textContent = tWrap.hidden ? 'Table view' : 'Hide table'; drawTable();
  });
  document.querySelectorAll('#table th').forEach(function (th) {
    th.addEventListener('click', function () {
      if (state.sortK === th.dataset.k) state.sortDir *= -1; else { state.sortK = th.dataset.k; state.sortDir = th.dataset.k === 'title' || th.dataset.k === 'isco' ? 1 : -1; }
      drawTable();
    });
  });
  // deep link: exposure.html?q=2631
  var qs = new URLSearchParams(location.search).get('q'); if (qs) { q.value = qs; state.query = qs.trim().toLowerCase(); }

  fetch('data/exposure_2024.json').then(function (r) { return r.json(); }).then(function (j) {
    var ci = {}; j.cols.forEach(function (c, i) { ci[c] = i; });
    data = j.rows.map(function (r) { return { isco: String(r[ci.isco]), title: r[ci.title], daioe: +r[ci.daioe], cdaioe: +r[ci.cdaioe], comp: +r[ci.comp] }; })
                 .filter(function (d) { return isFinite(d.daioe) && isFinite(d.comp); });
    med = { daioe: j.median_daioe || median(data.map(function (d) { return d.daioe; })),
            cdaioe: median(data.map(function (d) { return d.cdaioe; })),
            comp: j.median_comp || median(data.map(function (d) { return d.comp; })) };
    draw();
  }).catch(function () { chart.innerHTML = '<div class="notice">Could not load data/exposure_2024.json.</div>'; });
})();
