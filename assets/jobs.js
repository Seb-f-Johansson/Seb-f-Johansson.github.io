/* AI and Norwegian jobs: SSB tables 11658 and 14160 by task complementarity and AI exposure. Data: data/ai_jobs.json (weekly), data/exposure_scores.json. */
(function () {
  'use strict';
  if (!document.getElementById('ch-quint')) return;
  var NS = 'http://www.w3.org/2000/svg';
  var J, S, SC = {}, state = { measure: 'comp', age: '0-39', from: '2019K1', age2: '-24', skv: 'post', ska: '999D', skt: 'abilities', skSort: 'diff', skDir: 1 };
  var QNAME = { 1: 'High exposure, low complementarity', 2: 'High exposure, high complementarity', 3: 'Low exposure, high complementarity', 4: 'Low exposure, low complementarity' };
  var GN = { comp: { 1: '1 Lowest complementarity', 5: '5 Highest complementarity' }, daioe: { 1: '1 Least exposed', 5: '5 Most exposed' } };
  var GNAME = new Proxy({}, { get: function (t, k) { return (GN[state.measure] || {})[k] || String(k); } });
  var MNAME = { comp: 'complementarity', daioe: 'DAIOE' };

  function el(name, attrs, parent, style) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (style) e.setAttribute('style', style);
    if (parent) parent.appendChild(e);
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ql(q) { return q.slice(0, 4) + ' Q' + q.slice(5); }
  function f1(v) { return v == null || !isFinite(v) ? '–' : v.toFixed(1); }
  function f2(v) { return v == null || !isFinite(v) ? '–' : v.toFixed(2); }
  function sgn(v, d) { return v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d == null ? 1 : d); }
  function nfmt(v) { return v == null ? '–' : Math.round(v).toLocaleString('en-GB').replace(/,/g, ' '); }
  function niceTicks(lo, hi, n) {
    var span = hi - lo || 1, step = Math.pow(10, Math.floor(Math.log10(span / n)));
    var err = span / n / step; step *= err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1;
    var t = [], v = Math.ceil(lo / step) * step; for (; v <= hi + 1e-9; v += step) t.push(+v.toFixed(6)); return t;
  }

  /* ---------- generic line chart with crosshair tooltip and direct end labels ---------- */
  function lineChart(host, o) {
    host.innerHTML = '';
    var W = o.width || 900, H = o.height || 380, M = { t: 18, r: o.labelRoom == null ? 150 : o.labelRoom, b: 34, l: 52 };
    var n = o.x.length, all = [];
    o.series.forEach(function (s) { s.values.forEach(function (v) { if (v != null && isFinite(v)) all.push(v); }); });
    if (o.base != null) all.push(o.base);
    var y0 = Math.min.apply(null, all), y1 = Math.max.apply(null, all), pad = (y1 - y0) * 0.08 || 1;
    y0 -= pad; y1 += pad;
    var sx = function (i) { return M.l + (n === 1 ? 0 : i / (n - 1)) * (W - M.l - M.r); };
    var sy = function (v) { return H - M.b - (v - y0) / (y1 - y0) * (H - M.t - M.b); };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.aria || '' });
    host.appendChild(svg);
    var tip = document.createElement('div'); tip.className = 'tooltip'; host.appendChild(tip);
    var ax = el('g', { 'class': 'axis' }, svg);
    niceTicks(y0, y1, 5).forEach(function (t) {
      var tx = el('text', { x: M.l - 8, y: sy(t) + 4, 'text-anchor': 'end' }, ax); tx.textContent = o.yfmt ? o.yfmt(t) : t;
    });
    el('path', { d: 'M' + M.l + ',' + M.t + 'V' + (H - M.b) + 'H' + (W - M.r), fill: 'none' }, ax);
    o.x.forEach(function (lab, i) {
      var t = o.xtick ? o.xtick(lab, i) : lab; if (t == null) return;
      el('line', { x1: sx(i), x2: sx(i), y1: H - M.b, y2: H - M.b + 4 }, ax);
      var tx = el('text', { x: sx(i), y: H - M.b + 17, 'text-anchor': 'middle' }, ax); tx.textContent = t;
    });
    if (o.ytitle) { var yt = el('text', { 'class': 'axis-title', x: M.l, y: M.t - 6 }, svg); yt.textContent = o.ytitle; }
    if (o.base != null) el('line', { x1: M.l, x2: W - M.r, y1: sy(o.base), y2: sy(o.base) }, svg, 'stroke:var(--line);stroke-width:1');
    if (o.marker != null && o.marker >= 0) {
      var mk = el('g', { 'class': 'marker' }, svg), mx = o.markerFrac != null ? M.l + o.markerFrac * (W - M.l - M.r) : sx(o.marker);
      el('line', { x1: mx, x2: mx, y1: M.t, y2: H - M.b }, mk);
      var mt = el('text', { x: mx + 5, y: M.t + 10 }, mk); mt.textContent = o.markerText || '';
    }
    o.series.forEach(function (s) {
      var segs = [], cur = [];
      s.values.forEach(function (v, i) {
        if (v == null || !isFinite(v)) { if (cur.length) segs.push(cur); cur = []; return; }
        cur.push([sx(i), sy(v), i]);
      });
      if (cur.length) segs.push(cur);
      segs.forEach(function (sg) {
        var solid = sg.filter(function (p) { return s.dashFrom == null || p[2] <= s.dashFrom; });
        var dash = s.dashFrom == null ? [] : sg.filter(function (p) { return p[2] >= s.dashFrom; });
        var st = 'fill:none;stroke:' + s.color + ';stroke-width:' + (s.width || 2) + ';stroke-linejoin:round;stroke-linecap:round' + (s.dash ? ';stroke-dasharray:' + s.dash : '');
        if (solid.length > 1) el('path', { d: 'M' + solid.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('L') }, svg, st);
        if (dash.length > 1) el('path', { d: 'M' + dash.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('L') }, svg, st + ';stroke-dasharray:5 4');
        if (s.points) sg.forEach(function (p) { el('circle', { cx: p[0], cy: p[1], r: 3.5 }, svg, 'fill:' + s.color + ';stroke:var(--card);stroke-width:1.5'); });
      });
    });
    // direct labels at the last point, nudged apart
    if (o.labelRoom !== 0) {
      var labs = o.series.filter(function (s) { return s.label !== false; }).map(function (s) {
        var i = s.values.length - 1; while (i >= 0 && (s.values[i] == null || !isFinite(s.values[i]))) i--;
        return { s: s, y: sy(s.values[i]), x: sx(i) };
      }).filter(function (d) { return isFinite(d.y); }).sort(function (a, b) { return a.y - b.y; });
      for (var k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 13) labs[k].y = labs[k - 1].y + 13;
      labs.forEach(function (d) { var t = el('text', { 'class': 'ln-label', x: d.x + 8, y: d.y + 4 }, svg); t.textContent = d.s.short || d.s.name; });
    }
    // crosshair
    var cross = el('g', { 'class': 'cross', visibility: 'hidden' }, svg);
    var cl = el('line', { y1: M.t, y2: H - M.b }, cross);
    var dots = o.series.map(function (s) { return el('circle', { r: 4 }, cross, 'fill:' + s.color + ';stroke:var(--card);stroke-width:1.5'); });
    var hit = el('rect', { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b, fill: 'transparent' }, svg);
    function show(ev) {
      var r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width;
      var i = Math.round((px - M.l) / (W - M.l - M.r) * (n - 1)); i = Math.max(0, Math.min(n - 1, i));
      cross.setAttribute('visibility', 'visible'); cl.setAttribute('x1', sx(i)); cl.setAttribute('x2', sx(i));
      var rows = [];
      o.series.forEach(function (s, k) {
        var v = s.values[i];
        if (v == null || !isFinite(v)) { dots[k].setAttribute('visibility', 'hidden'); return; }
        dots[k].setAttribute('visibility', 'visible'); dots[k].setAttribute('cx', sx(i)); dots[k].setAttribute('cy', sy(v));
        rows.push([s, v]);
      });
      rows.sort(function (a, b) { return b[1] - a[1]; });
      tip.innerHTML = '<b>' + esc(o.xfmt ? o.xfmt(o.x[i]) : o.x[i]) + '</b><table>' + rows.map(function (rw) {
        return '<tr><td><span class="sw" style="background:' + rw[0].color + '"></span>' + esc(rw[0].name) + '</td><td class="num">' + (o.vfmt ? o.vfmt(rw[1]) : rw[1].toFixed(1)) + '</td></tr>';
      }).join('') + '</table>';
      tip.style.display = 'block';
      var hr = host.getBoundingClientRect(), tx = ev.clientX - hr.left + 14;
      if (tx + 240 > hr.width) tx = ev.clientX - hr.left - 254;
      tip.style.left = Math.max(0, tx) + 'px'; tip.style.top = Math.max(0, ev.clientY - hr.top - 20) + 'px';
    }
    hit.addEventListener('mousemove', show);
    hit.addEventListener('touchstart', function (e) { show(e.touches[0]); }, { passive: true });
    hit.addEventListener('mouseleave', function () { cross.setAttribute('visibility', 'hidden'); tip.style.display = 'none'; });
  }

  function legend(id, items) {
    document.getElementById(id).innerHTML = items.map(function (it) {
      return '<span><span class="sw" style="background:' + it.color + (it.dash ? ';background:repeating-linear-gradient(90deg,' + it.color + ' 0 4px,transparent 4px 7px)' : '') + '"></span>' + esc(it.name) + '</span>';
    }).join('');
  }

  /* ---------- helpers on the SSB data ---------- */
  function fromIdx() { return Math.max(0, J.quarters.indexOf(state.from)); }
  function sliceQ(arr) { return arr.slice(Math.max(3, fromIdx())); }
  function xtickQ(lab) { return lab.slice(4) === 'K1' ? lab.slice(0, 4) : null; }
  function markerFrac(qs) {
    var i = qs.indexOf(J.base_quarter); if (i < 0) return null;
    return (i + 0.67) / (qs.length - 1);   // ChatGPT: 30 November 2022, two thirds into 2022 Q4
  }
  function chartQuarters(host, series, ytitle, vfmt) {
    var qs = sliceQ(J.quarters);
    lineChart(host, {
      x: qs, series: series, base: 100, xtick: xtickQ, xfmt: ql, ytitle: ytitle, vfmt: vfmt || function (v) { return v.toFixed(1); },
      marker: 0, markerFrac: markerFrac(qs), markerText: 'ChatGPT', aria: ytitle
    });
  }
  function avg(arr, from, to) { var s = 0, k = 0; for (var i = from; i <= to; i++) { if (arr[i] == null) return null; s += arr[i]; k++; } return k ? s / k : null; }

  /* ---------- sections ---------- */
  function drawQuint() {
    var gs = J.groups[state.measure], age = state.age;
    var series = gs.map(function (g) {
      return { name: GNAME[g.group], short: GNAME[g.group], color: 'var(--s' + g.group + ')', values: sliceQ(g.emp[age].ma4), width: 2.2 };
    });
    series.push({ name: 'All occupations', short: 'All', color: 'var(--ink-2)', dash: '6 4', width: 1.6, values: sliceQ(J.all.emp[age].ma4) });
    var ageL = J.ages.filter(function (a) { return a.code === age; })[0].label.toLowerCase();
    chartQuarters(document.getElementById('ch-quint'), series, 'Employees, ' + ageL + ', four-quarter average, year to 2022 Q3 = 100');
    legend('lg-quint', series.map(function (s) { return { name: s.name.replace(/^(\d)$/, 'Group $1') + (s.name === 'All occupations' || state.measure === 'comp' ? '' : ' (' + MNAME[state.measure] + ')'), color: s.color, dash: !!s.dash }; }));
  }

  function drawDumb() {
    var host = document.getElementById('ch-dumb'), age = state.age, gs = J.groups[state.measure];
    var rows = gs.map(function (g) { return { name: GNAME[g.group], n: g.n_occ, pre: g.emp[age].growth_pre, post: g.emp[age].growth_post, color: 'var(--s' + g.group + ')' }; });
    var al = { name: 'All occupations', n: J.n_matched, pre: J.all.emp[age].growth_pre, post: J.all.emp[age].growth_post, color: 'var(--ink-3)' };
    rows.push(al);
    host.innerHTML = '';
    var W = 900, rh = 34, M = { t: 10, r: 30, b: 34, l: 205 }, H = M.t + M.b + rows.length * rh;
    var vals = []; rows.forEach(function (r) { vals.push(r.pre, r.post); }); vals.push(0);
    var x0 = Math.min.apply(null, vals), x1 = Math.max.apply(null, vals), p = (x1 - x0) * 0.08; x0 -= p; x1 += p;
    var sx = function (v) { return M.l + (v - x0) / (x1 - x0) * (W - M.l - M.r); };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Annual employment growth before and after ChatGPT by group' });
    host.appendChild(svg);
    var tip = document.createElement('div'); tip.className = 'tooltip'; host.appendChild(tip);
    var ax = el('g', { 'class': 'axis' }, svg);
    niceTicks(x0, x1, 6).forEach(function (t) {
      el('line', { x1: sx(t), x2: sx(t), y1: H - M.b, y2: H - M.b + 4 }, ax);
      var tx = el('text', { x: sx(t), y: H - M.b + 17, 'text-anchor': 'middle' }, ax); tx.textContent = t + '%';
    });
    el('path', { d: 'M' + M.l + ',' + (H - M.b) + 'H' + (W - M.r), fill: 'none' }, ax);
    el('line', { x1: sx(0), x2: sx(0), y1: M.t, y2: H - M.b }, svg, 'stroke:var(--line)');
    el('line', { x1: sx(al.post), x2: sx(al.post), y1: M.t, y2: H - M.b }, svg, 'stroke:var(--ink-3);stroke-dasharray:3 3');
    rows.forEach(function (r, i) {
      var y = M.t + rh * i + rh / 2, g = el('g', {}, svg);
      var lt = el('text', { x: M.l - 10, y: y + 4, 'text-anchor': 'end' }, g, 'fill:var(--ink-2);font-size:12px' + (r === al ? ';font-weight:600' : '')); lt.textContent = r.name;
      if (r.pre != null && r.post != null) el('line', { x1: sx(r.pre), x2: sx(r.post), y1: y, y2: y }, g, 'stroke:var(--ink-3);stroke-width:2');
      if (r.pre != null) el('circle', { cx: sx(r.pre), cy: y, r: 5.5 }, g, 'fill:var(--card);stroke:var(--ink-3);stroke-width:2');
      if (r.post != null) el('circle', { cx: sx(r.post), cy: y, r: 6 }, g, 'fill:' + (r === al ? 'var(--ink-2)' : 'var(--accent)') + ';stroke:var(--card);stroke-width:1.5');
      var hit = el('rect', { x: 0, y: y - rh / 2, width: W, height: rh, fill: 'transparent' }, g);
      hit.addEventListener('mousemove', function (ev) {
        tip.innerHTML = '<b>' + esc(r.name) + '</b>Before ' + sgn(r.pre, 2) + '% a year<br>After ' + sgn(r.post, 2) + '% a year<div class="q">' + r.n + ' occupations</div>';
        tip.style.display = 'block'; var hr = host.getBoundingClientRect();
        tip.style.left = Math.min(ev.clientX - hr.left + 14, hr.width - 200) + 'px'; tip.style.top = (ev.clientY - hr.top + 10) + 'px';
      });
      hit.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
    });
    var ad = al.post - al.pre;
    document.querySelector('#tb-dumb tbody').innerHTML = rows.map(function (r) {
      var d = r.post - r.pre;
      return '<tr><td>' + esc(r.name) + '</td><td class="num">' + r.n + '</td><td class="num">' + f2(r.pre) + '</td><td class="num">' + f2(r.post) +
             '</td><td class="num">' + sgn(d, 2) + '</td><td class="num">' + (r === al ? '' : sgn(d - ad, 2)) + '</td></tr>';
    }).join('');
  }

  function drawQuad() {
    var age = state.age;
    var series = J.quadrants.map(function (q) { return { name: QNAME[q.quadrant], short: QNAME[q.quadrant].replace('exposure', 'exp.').replace('complementarity', 'compl.'), color: 'var(--q' + q.quadrant + ')', values: sliceQ(q.emp[age].ma4), width: 2.2 }; });
    series.push({ name: 'All occupations', short: 'All', color: 'var(--ink-2)', dash: '6 4', width: 1.6, values: sliceQ(J.all.emp[age].ma4) });
    var ageL = J.ages.filter(function (a) { return a.code === age; })[0].label.toLowerCase();
    var o = document.getElementById('ch-quad');
    chartQuarters(o, series, 'Employees, ' + ageL + ', four-quarter average, year to 2022 Q3 = 100');
    legend('lg-quad', series.map(function (s) { return { name: s.name, color: s.color, dash: !!s.dash }; }));
  }

  function drawWage() {
    var gs = J.groups[state.measure];
    var series = gs.map(function (g) { return { name: GNAME[g.group], color: 'var(--s' + g.group + ')', values: sliceQ(g.wage.ma4), width: 2 }; });
    series.push({ name: 'All occupations', short: 'All', color: 'var(--ink-2)', dash: '6 4', width: 1.6, values: sliceQ(J.all.wage.ma4) });
    chartQuarters(document.getElementById('ch-wage'), series, 'Median monthly earnings, four-quarter average, year to 2022 Q3 = 100');
    legend('lg-wage', series.map(function (s) { return { name: s.name.replace(/^(\d)$/, 'Group $1') + (s.name === 'All occupations' || state.measure === 'comp' ? '' : ' (' + MNAME[state.measure] + ')'), color: s.color, dash: !!s.dash }; }));
  }

  function drawYears() {
    var by = J.by_year, yrs = by.years.map(String), pf = by.years.indexOf(S.provisional_from) - 1;
    lineChart(document.getElementById('ch-years'), {
      x: yrs, xtick: function (y) { return +y % 2 === 0 ? y : null; }, ytitle: 'Average exposure of Norwegian employment (2022 weights)',
      series: [{ name: 'DAIOE', color: 'var(--s4)', values: by.daioe, dashFrom: pf, points: false, width: 2.4 },
               { name: 'C-DAIOE', color: 'var(--q1)', values: by.cdaioe, dashFrom: pf, width: 2.4 }],
      xfmt: function (y) { return y + (+y === S.ytd_year ? ' (year to date)' : +y >= S.provisional_from ? ' (provisional)' : ''); }, labelRoom: 90
    });
    var apps = {}; S.application_updates.forEach(function (a) { (apps[a.app] = apps[a.app] || {})[a.year] = a; });
    document.querySelector('#tb-apps tbody').innerHTML = Object.keys(apps).map(function (k) {
      var a = apps[k], a5 = a[2025] || {}, a6 = a[2026] || {};
      return '<tr><td>' + esc(k) + '</td><td class="num">' + f2(a5.factor) + '</td><td class="num">' + (a5.benchmarks || 0) + '</td><td class="num">' + f2(a6.factor) + '</td><td class="num">' + (a6.benchmarks || 0) + '</td></tr>';
    }).join('');
  }

  function drawRelease() {
    var br = J.by_release, b = br.releases.map(function (r) { return r.key; }).indexOf(S.paper_release);
    var idx = function (a) { return a.map(function (v) { return 100 * v / a[b]; }); };
    lineChart(document.getElementById('ch-rel'), {
      x: br.releases.map(function (r) { return r.key; }), xtick: function (k) { return k; },
      xfmt: function (k) { var r = br.releases.filter(function (x) { return x.key === k; })[0]; return 'O*NET ' + k + ' (' + r.year + ')'; },
      series: [{ name: 'C-DAIOE', color: 'var(--q1)', values: idx(br.cdaioe), points: true, width: 2.2 },
               { name: 'Ability-only DAIOE', short: 'Ability-only', color: 'var(--s4)', values: idx(br.daioe), points: true, width: 2.2 }],
      base: 100, ytitle: 'Exposure at the 2025 AI frontier, O*NET 24.3 = 100', vfmt: function (v) { return v.toFixed(2); }, labelRoom: 100,
      marker: br.releases.map(function (r) { return r.key; }).indexOf('26.0'), markerText: '2019 taxonomy', height: 320
    });
    // tables of largest movers
    var rel = S.releases.map(function (r) { return r.key; }), i0 = rel.indexOf(S.paper_release), i1 = rel.length - 1;
    var w22 = J.quarters.map(function (q, i) { return q.indexOf(J.weight_year) === 0 ? i : -1; }).filter(function (i) { return i >= 0; });
    var mv = [];
    Object.keys(SC).forEach(function (c) {
      var o = J.occ[c], s = SC[c]; if (!o) return;
      var e = avg(o.e, w22[0], w22[w22.length - 1]); if (e == null || e < 1000) return;
      var a = s.cdaioe_by_release[i0], z = s.cdaioe_by_release[i1]; if (a == null || z == null) return;
      mv.push({ c: c, t: o.t, a: a, z: z, d: z - a, r: s.share_rerated });
    });
    mv.sort(function (p, q) { return q.d - p.d; });
    var row = function (m) { return '<tr><td><a href="#occ" data-occ="' + m.c + '">' + m.c + '</a> ' + esc(m.t) + '</td><td class="num">' + f1(m.a) + '</td><td class="num">' + f1(m.z) + '</td><td class="num">' + (m.r == null ? '–' : Math.round(100 * m.r) + '%') + '</td></tr>'; };
    document.querySelector('#tb-up tbody').innerHTML = mv.slice(0, 10).map(row).join('');
    document.querySelector('#tb-down tbody').innerHTML = mv.slice(-10).reverse().map(row).join('');
    document.querySelectorAll('[data-occ]').forEach(function (a) {
      a.addEventListener('click', function (ev) { ev.preventDefault(); showOcc(a.dataset.occ); document.getElementById('occ-q').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    });
  }

  function drawStats() {
    var last = J.last_quarter, g5 = J.groups.comp[0].emp['0-39'], al = J.all.emp['0-39'];
    document.getElementById('st-last').textContent = ql(last);
    document.getElementById('st-cov').textContent = Math.round(100 * J.coverage) + '%';
    var gap = (g5.growth_post - g5.growth_pre) - (al.growth_post - al.growth_pre);
    document.getElementById('st-gap').textContent = sgn(gap) + ' pp';
    document.getElementById('st-gap-l').textContent = 'Change in annual employment growth after ChatGPT, under 40: lowest-complementarity fifth relative to all occupations';
    var y = J.by_year, i = y.years.indexOf(J.frontier_year);
    document.getElementById('st-exp').textContent = y.cdaioe[i].toFixed(1);
    document.getElementById('st-exp-l').textContent = 'Employment-weighted C-DAIOE in ' + J.frontier_year + ' (' + y.years[i - 1] + ': ' + y.cdaioe[i - 1].toFixed(1) + ')';
    document.getElementById('stamp').textContent = 'SSB table last updated ' + (J.ssb_updated || '').slice(0, 10) + '. Page data rebuilt ' + J.built + '; exposure scores built ' + S.built + '. ' + J.n_matched + ' occupations.';
  }

  /* ---------- finer age groups (table 14160) ---------- */
  function heat(v, all) {
    if (v == null || all == null) return '';
    var d = v - all, a = Math.min(1, Math.abs(d) / 12) * 0.55 + 0.08;
    return 'background:color-mix(in srgb, var(' + (d < 0 ? '--neg' : '--pos') + ') ' + Math.round(a * 100) + '%, transparent)';
  }
  function drawAgeDetail() {
    var D = J.age_detail, gs = D.groups[state.measure], ages = D.ages;
    var th = '<tr><th>Group (' + (state.measure === 'comp' ? 'complementarity' : 'DAIOE') + ')</th><th class="num">Occupations</th>' + ages.map(function (a) { return '<th class="num">' + esc(a.label) + '</th>'; }).join('') + '</tr>';
    document.querySelector('#tb-age thead').innerHTML = th;
    var rows = gs.map(function (g) {
      return '<tr><td>' + GNAME[g.group] + '</td><td class="num">' + g.n_occ + '</td>' + ages.map(function (a) {
        var v = g.emp[a.code].change, al = D.all[a.code].change;
        return '<td class="num cell" style="' + heat(v, al) + '" title="' + esc(a.label) + ': ' + sgn(v) + '% vs ' + sgn(al) + '% for all occupations">' + sgn(v) + '%</td>';
      }).join('') + '</tr>';
    });
    rows.push('<tr><td><b>All occupations</b></td><td class="num">' + Object.keys(D.occ).length + '</td>' + ages.map(function (a) { return '<td class="num"><b>' + sgn(D.all[a.code].change) + '%</b></td>'; }).join('') + '</tr>');
    document.querySelector('#tb-age tbody').innerHTML = rows.join('');
    var qs = D.quarters.slice(3), age = state.age2, lab = ages.filter(function (a) { return a.code === age; })[0].label;
    var series = gs.map(function (g) { return { name: GNAME[g.group], color: 'var(--s' + g.group + ')', values: g.emp[age].ma4.slice(3), width: 2.2 }; });
    series.push({ name: 'All occupations', short: 'All', color: 'var(--ink-2)', dash: '6 4', width: 1.6, values: D.all[age].ma4.slice(3) });
    lineChart(document.getElementById('ch-age2'), {
      x: qs, series: series, base: 100, xtick: function (l) { return l.slice(4) === 'K1' ? l.slice(0, 4) : null; }, xfmt: ql,
      ytitle: 'Employees, ' + lab.toLowerCase() + ', four-quarter average, year to 2022 Q3 = 100', marker: 0, markerFrac: markerFrac(qs), markerText: 'ChatGPT', height: 340
    });
    legend('lg-age2', series.map(function (x) { return { name: x.name.replace(/^(\d)$/, 'Group $1') + (x.name === 'All occupations' ? '' : ' (two-digit' + (state.measure === 'comp' ? '' : ', ' + MNAME[state.measure]) + ')'), color: x.color, dash: !!x.dash }; }));
    var oc = Object.keys(D.occ).map(function (t) { var o = D.occ[t]; return { t: t, o: o, v: o.change['-24'] }; })
      .filter(function (d) { return d.o.w25 >= 1000 && d.v != null; }).sort(function (a, b) { return a.v - b.v; });
    var gk = state.measure === 'comp' ? 'g' : 'gd';
    var row = function (d) { return '<tr><td>' + d.t + ' ' + esc(d.o.t) + '</td><td class="num">' + (d.o[gk] || '–') + ' of 5</td><td class="num">' + sgn(d.v) + '%</td><td class="num">' + sgn(d.o.change['999A']) + '%</td></tr>'; };
    document.querySelector('#tb-y-down tbody').innerHTML = oc.slice(0, 8).map(row).join('');
    document.querySelector('#tb-y-up tbody').innerHTML = oc.slice(-8).reverse().map(row).join('');
  }

  /* ---------- skill set ---------- */
  var TCOL = { Cognitive: 'var(--q2)', Psychomotor: 'var(--q1)', Physical: 'var(--q3)', Sensory: 'var(--q4)' };
  function skVal(r, age, v) { var x = r[age]; if (!x || x.pre == null || x.post == null) return null; return v === 'post' ? x.post : x.post - x.pre; }
  function drawSkills() {
    var K = J.skillset; if (!K) return;
    var host = document.getElementById('ch-sk'); host.innerHTML = '';
    var W = 900, H = 420, M = { t: 22, r: 24, b: 44, l: 62 }, age = state.ska, v = state.skv;
    var pts = K.abilities.map(function (r) { return { r: r, x: r.ai, y: skVal(r, age, v) }; }).filter(function (p) { return p.y != null; });
    var ys = pts.map(function (p) { return p.y; }); ys.push(0);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), py = (y1 - y0) * 0.1; y0 -= py; y1 += py;
    var sx = function (x) { return M.l + x / 100 * (W - M.l - M.r); }, sy = function (y) { return H - M.b - (y - y0) / (y1 - y0) * (H - M.t - M.b); };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Abilities by AI exposure and change in employment-weighted importance' });
    host.appendChild(svg);
    var tip = document.createElement('div'); tip.className = 'tooltip'; host.appendChild(tip);
    var ax = el('g', { 'class': 'axis' }, svg);
    [0, 20, 40, 60, 80, 100].forEach(function (t) { el('line', { x1: sx(t), x2: sx(t), y1: H - M.b, y2: H - M.b + 4 }, ax); var tx = el('text', { x: sx(t), y: H - M.b + 17, 'text-anchor': 'middle' }, ax); tx.textContent = t; });
    niceTicks(y0, y1, 6).forEach(function (t) { var tx = el('text', { x: M.l - 8, y: sy(t) + 4, 'text-anchor': 'end' }, ax); tx.textContent = (+t.toFixed(3)) + '%'; });
    el('path', { d: 'M' + M.l + ',' + M.t + 'V' + (H - M.b) + 'H' + (W - M.r), fill: 'none' }, ax);
    el('line', { x1: M.l, x2: W - M.r, y1: sy(0), y2: sy(0) }, svg, 'stroke:var(--line)');
    var xt = el('text', { 'class': 'axis-title', x: (M.l + W - M.r) / 2, y: H - 8, 'text-anchor': 'middle' }, svg); xt.textContent = 'AI exposure of the ability (2025 frontier, 0–100) →';
    var yt = el('text', { 'class': 'axis-title', x: M.l, y: M.t - 8 }, svg);
    yt.textContent = v === 'post' ? 'Growth of employment-weighted importance after ChatGPT, % a year' : 'Growth after minus growth before, percentage points a year';
    // least-squares line, for orientation
    var n = pts.length, mx = 0, my = 0; pts.forEach(function (p) { mx += p.x / n; my += p.y / n; });
    var sxy = 0, sxx = 0, syy = 0; pts.forEach(function (p) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) * (p.x - mx); syy += (p.y - my) * (p.y - my); });
    var bta = sxy / sxx, corr = sxy / Math.sqrt(sxx * syy);
    el('line', { x1: sx(0), x2: sx(100), y1: sy(my - bta * mx), y2: sy(my + bta * (100 - mx)) }, svg, 'stroke:var(--ink-3);stroke-dasharray:4 4');
    var sorted = pts.slice().sort(function (a, b) { return a.y - b.y; });
    pts.forEach(function (p) {
      var c = el('circle', { cx: sx(p.x), cy: sy(p.y), r: 6 }, svg, 'fill:' + (TCOL[p.r.type] || 'var(--ink-3)') + ';stroke:var(--card);stroke-width:1.5;opacity:.9');
      c.setAttribute('tabindex', '0');
      var show = function (ev) {
        var a = p.r[age];
        tip.innerHTML = '<b>' + esc(p.r.name) + '</b>' + esc(p.r.type) + ' ability · AI exposure ' + p.r.ai.toFixed(0) + '<br>Before ' + sgn(a.pre, 2) + '% a year · after ' + sgn(a.post, 2) + '% a year';
        tip.style.display = 'block'; var hr = host.getBoundingClientRect();
        tip.style.left = Math.min(ev.clientX - hr.left + 14, hr.width - 260) + 'px'; tip.style.top = (ev.clientY - hr.top + 10) + 'px';
      };
      c.addEventListener('mousemove', show);
      c.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
    });
    // direct labels for the extremes, skipping any that would overlap one already placed
    var placed = [];
    sorted.slice(-4).reverse().concat(sorted.slice(0, 4)).forEach(function (p) {
      var right = p.x > 70, w = p.r.name.length * 6.2, x = sx(p.x) + (right ? -9 : 9), y = sy(p.y) + 4;
      var box = { x0: right ? x - w : x, x1: right ? x : x + w, y0: y - 10, y1: y + 2 };
      if (placed.some(function (b) { return box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0; })) return;
      placed.push(box);
      var t = el('text', { 'class': 'ln-label', x: x, y: y, 'text-anchor': right ? 'end' : 'start' }, svg); t.textContent = p.r.name;
    });
    legend('lg-sk', Object.keys(TCOL).map(function (k) { return { name: k + ' abilities', color: TCOL[k] }; }));
    document.getElementById('sk-note').textContent = 'Correlation across the 52 abilities: ' + corr.toFixed(2) + '. Dashed line: least-squares fit. Before = 2018 Q3–2022 Q3, after = 2022 Q3–' + ql(J.last_quarter) + '. ' + K.n_occ + ' occupations.';
    // summary lines
    var qs = J.quarters.slice(3), sm = K.summary;
    var series = [{ name: 'Ten most AI-exposed abilities', short: 'Most exposed', color: 'var(--q2)', values: sm.top10[age].slice(3), width: 2.2 },
                  { name: 'Ten least AI-exposed abilities', short: 'Least exposed', color: 'var(--q3)', values: sm.bottom10[age].slice(3), width: 2.2 }];
    lineChart(document.getElementById('ch-sk2'), {
      x: qs, series: series, base: 100, xtick: xtickQ, xfmt: ql, vfmt: function (x) { return x.toFixed(2); },
      ytitle: 'Employment-weighted importance' + (age === '0-39' ? ', under 40' : '') + ', four-quarter average, year to 2022 Q3 = 100',
      marker: 0, markerFrac: markerFrac(qs), markerText: 'ChatGPT', height: 320, labelRoom: 110
    });
    legend('lg-sk2', series.map(function (x) { return { name: x.name, color: x.color }; }).concat([{ name: 'Most exposed: ' + sm.top10.abilities.slice().reverse().join(', '), color: 'transparent' }]));
    drawSkTable();
  }
  function drawSkTable() {
    var K = J.skillset, age = state.ska, rows = K[state.skt].map(function (r) {
      var a = r[age] || {}; return { name: r.name, ai: r.ai, level: a.level, pre: a.pre, post: a.post, diff: a.pre == null || a.post == null ? null : a.post - a.pre };
    });
    var k = state.skSort;
    rows.sort(function (a, b) { var x = a[k], y = b[k]; if (typeof x === 'string') return x.localeCompare(y) * state.skDir; return ((x == null ? -1e9 : x) - (y == null ? -1e9 : y)) * state.skDir; });
    document.querySelector('#tb-sk tbody').innerHTML = rows.map(function (r) {
      return '<tr><td>' + esc(r.name) + '</td><td class="num">' + (r.ai == null ? '–' : r.ai.toFixed(0)) + '</td><td class="num">' + f2(r.level) + '</td><td class="num">' + sgn(r.pre, 2) + '</td><td class="num">' + sgn(r.post, 2) + '</td><td class="num">' + sgn(r.diff, 2) + '</td></tr>';
    }).join('');
  }

  /* ---------- occupation lookup ---------- */
  function showOcc(code) {
    var o = J.occ[code], s = SC[code], out = document.getElementById('occ-out');
    if (!o || !s) { out.innerHTML = 'No Norwegian employment series for this occupation in the matched panel.'; return; }
    document.getElementById('occ-q').value = code + ' ' + o.t;
    var Y = S.years, yi = function (y) { return Y.indexOf(y); }, rel = S.releases.map(function (r) { return r.key; });
    var bi = J.quarters.indexOf(J.base_quarter), li = J.quarters.length - 1;
    var e0 = avg(o.e, bi - 3, bi), e1 = avg(o.e, li - 3, li), y0 = avg(o.y, bi - 3, bi), y1 = avg(o.y, li - 3, li);
    var pct = function (a, b) { return a && b ? sgn(100 * (b / a - 1)) + '%' : '–'; };
    var sc = function (k) { return [2023, 2024, 2025, 2026].map(function (y) { return f1(s[k][yi(y)]); }).join(' · '); };
    out.className = '';
    out.innerHTML = '<h3>' + code + ' ' + esc(o.t) + '</h3><div class="occ-card"><dl class="kv">' +
      '<dt>Group (fifths)</dt><dd>complementarity ' + o.g + ' of 5 · DAIOE ' + o.gd + ' of 5</dd>' +
      '<dt>Quadrant</dt><dd>' + QNAME[o.q] + '</dd>' +
      '<dt>DAIOE 2023–26</dt><dd>' + sc('daioe') + '</dd>' +
      '<dt>C-DAIOE 2023–26</dt><dd>' + sc('cdaioe') + '</dd>' +
      '<dt>Complementarity</dt><dd>' + s.comp.toFixed(3) + ' (median ' + J.medians.comp.toFixed(3) + ')</dd>' +
      '<dt>Employees ' + ql(J.last_quarter) + '</dt><dd>' + nfmt(o.e[li]) + '</dd>' +
      '<dt>Since 2022 Q3</dt><dd>all ages ' + pct(e0, e1) + ', under 40 ' + pct(y0, y1) + ' (four-quarter averages)</dd>' +
      '<dt>Median monthly earnings</dt><dd>NOK ' + nfmt(o.w[li]) + ' (' + pct(o.w[bi], o.w[li]) + ' since 2022 Q3)</dd>' +
      '<dt>C-DAIOE at 2025 frontier</dt><dd>O*NET 24.3: ' + f1(s.cdaioe_by_release[rel.indexOf('24.3')]) + ' · 31.0: ' + f1(s.cdaioe_by_release[rel.length - 1]) +
      (s.share_rerated == null ? '' : ' · ' + Math.round(100 * s.share_rerated) + '% of O*NET codes re-rated') + '</dd>' +
      '</dl><div><div class="chart" id="ch-occ"></div><div class="legend small" id="lg-occ"></div></div></div>';
    var ix = function (a) {
      var m = a.map(function (v, i) { return i < 3 ? null : avg(a, i - 3, i); }), b = m[bi];
      return m.map(function (v) { return v == null || !b ? null : 100 * v / b; });
    };
    var series = [{ name: 'All ages', color: 'var(--accent)', values: ix(o.e), width: 2 },
                  { name: 'Under 40', color: 'var(--q1)', values: ix(o.y), width: 2 },
                  { name: 'All occupations', short: 'All occ.', color: 'var(--ink-3)', dash: '6 4', width: 1.4, values: J.all.emp['999D'].ma4 }];
    lineChart(document.getElementById('ch-occ'), {
      x: J.quarters.slice(3), series: series.map(function (x) { x.values = x.values.slice(3); return x; }), base: 100, xtick: function (l) { return l.slice(4) === 'K1' && (+l.slice(0, 4)) % 2 === 0 ? l.slice(0, 4) : null; }, xfmt: ql,
      ytitle: 'Employees, four-quarter average, year to 2022 Q3 = 100', height: 300, width: 520, labelRoom: 70, marker: 0, markerFrac: markerFrac(J.quarters.slice(3)), markerText: 'ChatGPT'
    });
    legend('lg-occ', series.map(function (x) { return { name: x.name, color: x.color, dash: !!x.dash }; }));
  }

  function wireOcc() {
    var codes = Object.keys(J.occ).sort();
    document.getElementById('occ-list').innerHTML = codes.map(function (c) { return '<option value="' + c + ' ' + esc(J.occ[c].t) + '">'; }).join('');
    var inp = document.getElementById('occ-q');
    function go() {
      var v = inp.value.trim().toLowerCase(); if (!v) return;
      var m = v.match(/^(\d{4})/);
      if (m && J.occ[m[1]]) return showOcc(m[1]);
      var hits = codes.filter(function (c) { return J.occ[c].t.toLowerCase().indexOf(v) >= 0; });
      if (hits.length === 1) showOcc(hits[0]);
    }
    inp.addEventListener('change', go);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    var qs = new URLSearchParams(location.search).get('occ'); if (qs && J.occ[qs]) showOcc(qs);
  }

  function wireSeg(id, key, cb) {
    var box = document.getElementById(id);
    box.querySelectorAll('button').forEach(function (b) {
      b.type = 'button';
      b.addEventListener('click', function () {
        state[key] = b.dataset.v;
        box.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        (cb || redraw)();
      });
    });
  }
  function redraw() { drawQuint(); drawDumb(); drawAgeDetail(); drawQuad(); drawWage(); }

  Promise.all([fetch('data/ai_jobs.json').then(function (r) { return r.json(); }), fetch('data/exposure_scores.json').then(function (r) { return r.json(); })])
    .then(function (res) {
      J = res[0]; S = res[1];
      S.rows.forEach(function (r) { var d = {}; S.cols.forEach(function (c, i) { d[c] = r[i]; }); SC[d.isco] = d; });
      wireSeg('c-measure', 'measure'); wireSeg('c-age', 'age'); wireSeg('c-from', 'from');
      wireSeg('c-age2', 'age2', drawAgeDetail); wireSeg('c-skv', 'skv', drawSkills); wireSeg('c-ska', 'ska', drawSkills); wireSeg('c-skt', 'skt', drawSkTable);
      document.querySelectorAll('#tb-sk th').forEach(function (th) {
        th.style.cursor = 'pointer';
        th.addEventListener('click', function () { if (state.skSort === th.dataset.k) state.skDir *= -1; else { state.skSort = th.dataset.k; state.skDir = th.dataset.k === 'name' ? 1 : -1; } drawSkTable(); });
      });
      drawStats(); redraw(); drawYears(); drawRelease(); drawSkills(); wireOcc();
    })
    .catch(function (e) {
      document.getElementById('ch-quint').innerHTML = '<div class="notice">Could not load the data files (' + esc(e.message || e) + ').</div>';
    });
})();
