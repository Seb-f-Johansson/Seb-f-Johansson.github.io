/* Shared behaviour: theme toggle, mobile nav, BibTeX buttons, live GitHub repositories. */
(function () {
  'use strict';

  // ---------- theme ----------
  var root = document.documentElement;
  var btn = document.getElementById('theme');
  function current() {
    var t = root.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function paintIcon() {
    if (!btn) return;
    var dark = current() === 'dark';
    btn.querySelectorAll('.sun').forEach(function (el) { el.style.display = dark ? 'none' : ''; });
    btn.querySelectorAll('.moon').forEach(function (el) { el.style.display = dark ? '' : 'none'; });
  }
  if (btn) {
    btn.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      paintIcon();
      document.dispatchEvent(new CustomEvent('themechange'));
    });
    paintIcon();
  }

  // ---------- mobile nav ----------
  var toggle = document.getElementById('navToggle'), nav = document.getElementById('nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // ---------- BibTeX show / copy ----------
  document.querySelectorAll('.bib-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var pre = document.getElementById(b.dataset.target);
      if (pre) pre.classList.toggle('open');
    });
  });
  document.querySelectorAll('.copy-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var pre = document.getElementById(b.dataset.target);
      if (!pre) return;
      var text = pre.textContent, label = b.textContent;
      function done(ok) {
        b.textContent = ok ? 'Copied' : 'Copy failed';
        setTimeout(function () { b.textContent = label; }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      } else {
        var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
        try { done(document.execCommand('copy')); } catch (e) { done(false); }
        document.body.removeChild(ta);
      }
    });
  });

  // ---------- GitHub repositories (public API, no token) ----------
  var box = document.getElementById('repos');
  if (!box) return;
  var user = document.body.getAttribute('data-github');
  if (!user || user === 'GITHUB_USER') {
    box.innerHTML = '<div class="notice">Set the GitHub user name in <code>&lt;body data-github="…"&gt;</code> to list repositories here.</div>';
    return;
  }
  var langColors = { Stata: '#1a5f91', Python: '#3572A5', R: '#198CE7', TeX: '#3D6117', JavaScript: '#f1e05a',
                     HTML: '#e34c26', Jupyter: '#DA5B0B', 'Jupyter Notebook': '#DA5B0B', Julia: '#a270ba', Shell: '#89e051' };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ago(iso) {
    var d = (Date.now() - new Date(iso)) / 864e5;
    if (d < 1) return 'today';
    if (d < 30) return Math.round(d) + ' d ago';
    if (d < 365) return Math.round(d / 30) + ' mo ago';
    return Math.round(d / 365) + ' y ago';
  }
  var cacheKey = 'gh-repos-' + user, cached = null;
  try { cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null'); } catch (e) {}
  function render(repos) {
    repos = repos.filter(function (r) { return !r.fork && !r.archived; })
                 .sort(function (a, b) { return new Date(b.pushed_at) - new Date(a.pushed_at); })
                 .slice(0, 9);
    if (!repos.length) { box.innerHTML = '<div class="notice">No public repositories yet.</div>'; return; }
    box.innerHTML = repos.map(function (r) {
      var lang = r.language ? '<span><i class="dot" style="background:' + (langColors[r.language] || 'var(--ink-3)') + '"></i>' + esc(r.language) + '</span>' : '';
      var stars = r.stargazers_count ? '<span>&#9733; ' + r.stargazers_count + '</span>' : '';
      var topics = (r.topics || []).slice(0, 3).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
      return '<a class="card link" href="' + esc(r.html_url) + '">' +
        '<h3 class="mono" style="font-family:var(--mono);font-size:1rem">' + esc(r.name) + '</h3>' +
        '<p>' + esc(r.description || 'No description yet.') + '</p>' +
        (topics ? '<div style="margin:4px 0 2px">' + topics + '</div>' : '') +
        '<div class="meta">' + lang + stars + '<span>Updated ' + ago(r.pushed_at) + '</span></div></a>';
    }).join('');
  }
  if (cached) { render(cached); return; }
  fetch('https://api.github.com/users/' + encodeURIComponent(user) + '/repos?per_page=100&sort=pushed', { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (repos) { try { sessionStorage.setItem(cacheKey, JSON.stringify(repos)); } catch (e) {} render(repos); })
    .catch(function () {
      box.innerHTML = '<div class="notice">Could not load repositories right now. See <a href="https://github.com/' + esc(user) + '">github.com/' + esc(user) + '</a>.</div>';
    });
})();
