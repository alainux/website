(function () {
  'use strict';

  var htmlEl = document.documentElement;
  var windowBody = document.getElementById('window-body');

  /* ── Theme ────────────────────────────────────────────────── */
  var themeToggle = document.getElementById('theme-toggle');
  var themeIcon = document.getElementById('theme-icon');
  var themeText = document.getElementById('theme-text');

  function paintTheme() {
    var isLight = htmlEl.getAttribute('data-theme') === 'light';
    var ic = isLight ? '\u2600' : '\u263E';
    var tx = isLight ? 'LIGHT' : 'DARK';
    if (themeIcon) themeIcon.textContent = ic;
    if (themeText) themeText.textContent = tx;
  }

  function toggleTheme() {
    var isLight = htmlEl.getAttribute('data-theme') === 'light';
    var next = isLight ? 'dark' : 'light';
    htmlEl.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    paintTheme();
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
  paintTheme();

  /* ── Layout ───────────────────────────────────────────────── */
  var layoutToggle = document.getElementById('layout-toggle');
  var layoutIcon = document.getElementById('layout-icon');
  var layoutText = document.getElementById('layout-text');

  function paintLayout() {
    var isFull = htmlEl.getAttribute('data-layout') === 'full';
    var ic = isFull ? '\u25AC' : '\u25AD';
    var tx = isFull ? 'FULL' : 'CENTERED';
    if (layoutIcon) layoutIcon.textContent = ic;
    if (layoutText) layoutText.textContent = tx;
  }

  function toggleLayout() {
    var isFull = htmlEl.getAttribute('data-layout') === 'full';
    var next = isFull ? 'centered' : 'full';
    htmlEl.setAttribute('data-layout', next);
    localStorage.setItem('layout', next);
    paintLayout();
  }

  if (layoutToggle) {
    layoutToggle.addEventListener('click', toggleLayout);
  }
  paintLayout();

  /* ── Word count + read time ──────────────────────────────── */
  var wordsEl = document.getElementById('winbar-words');
  var readTimeEl = document.getElementById('winbar-readtime');

  function paintStats() {
    var prose = windowBody ? windowBody.querySelector('.markdown-content') : null;
    if (!prose) {
      /* No article prose on this page (list/index/home) — the words /
         read-time figures would only count chrome, so hide them. */
      if (wordsEl) wordsEl.hidden = true;
      if (readTimeEl) readTimeEl.hidden = true;
      return;
    }
    var text = prose.textContent || '';
    var words = text.trim().split(/\s+/).filter(Boolean).length;
    var mins = Math.max(1, Math.ceil(words / 220));
    if (wordsEl) wordsEl.querySelector('.winbar-text').textContent = words.toLocaleString() + ' words';
    if (readTimeEl) readTimeEl.querySelector('.winbar-text').textContent = mins + ' min';
  }

  paintStats();

  /* ── Deep-link: ?menu=open auto-opens hamburger ──────────── */
  try {
    var p = new URLSearchParams(location.search);
    if (p.get('menu') === 'open' || p.get('nav') === 'open') {
      var det = document.getElementById('nav-hamburger');
      if (det && !det.hasAttribute('open')) det.setAttribute('open', '');
    }
  } catch (_) {}

  /* ── Glare follow on .tui-panel ────────────────────────────── */
  var panels = document.querySelectorAll('.tui-panel');
  if (panels.length && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (var p = 0; p < panels.length; p++) {
      (function (panel) {
        var glare = document.createElement('div');
        glare.className = 'tui-panel__glare';
        panel.insertBefore(glare, panel.firstChild);

        panel.addEventListener('mousemove', function (e) {
          var r = panel.getBoundingClientRect();
          glare.style.setProperty('--glare-x', (e.clientX - r.left) + 'px');
          glare.style.setProperty('--glare-y', (e.clientY - r.top) + 'px');
        });
      })(panels[p]);
    }
  }

  /* ── Print button (CV pages) ─────────────────────────────── */
  var printBtn = document.querySelector('.print-btn');
  if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

})();
