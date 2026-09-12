(function () {
  'use strict';

  var htmlEl = document.documentElement;
  var windowBody = document.getElementById('window-body');
  var WORDS_PER_MINUTE = 220;

  function savePreference(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

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
    if (themeToggle) {
      themeToggle.setAttribute('aria-pressed', String(isLight));
      themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
    }
  }

  function toggleTheme() {
    var isLight = htmlEl.getAttribute('data-theme') === 'light';
    var next = isLight ? 'dark' : 'light';
    htmlEl.setAttribute('data-theme', next);
    savePreference('theme', next);
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
    if (layoutToggle) layoutToggle.setAttribute('aria-pressed', String(isFull));
  }

  function toggleLayout() {
    var isFull = htmlEl.getAttribute('data-layout') === 'full';
    var next = isFull ? 'centered' : 'full';
    htmlEl.setAttribute('data-layout', next);
    savePreference('layout', next);
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
    var mins = Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
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

  /* Glare is a pointer enhancement; touch and reduced-motion views stay static. */
  function attachPanelGlare(panel) {
    var glare = document.createElement('div');
    glare.className = 'tui-panel__glare';
    glare.setAttribute('aria-hidden', 'true');
    panel.insertBefore(glare, panel.firstChild);
    panel.addEventListener('pointermove', function (event) {
      var bounds = panel.getBoundingClientRect();
      glare.style.setProperty('--glare-x', (event.clientX - bounds.left) + 'px');
      glare.style.setProperty('--glare-y', (event.clientY - bounds.top) + 'px');
    });
  }
  if (matchMedia('(pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.tui-panel').forEach(attachPanelGlare);
  }

  var menu = document.getElementById('nav-hamburger');
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && menu && menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
  document.addEventListener('click', function (event) {
    if (menu && menu.open && !menu.contains(event.target)) menu.open = false;
  });

  function renderMath() {
    if (!window.renderMathInElement || !windowBody) return;
    window.renderMathInElement(windowBody, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true }
      ],
      throwOnError: false
    });
  }
  renderMath();

  /* ── Print button (CV pages) ─────────────────────────────── */
  var printBtn = document.querySelector('.print-btn');
  if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

})();
