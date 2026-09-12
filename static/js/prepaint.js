(function () {
  var theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  var layout = 'centered';
  try {
    var storedTheme = localStorage.getItem('theme');
    var storedLayout = localStorage.getItem('layout');
    if (storedTheme === 'dark' || storedTheme === 'light') theme = storedTheme;
    if (storedLayout === 'full' || storedLayout === 'centered') layout = storedLayout;
  } catch (_) { /* Storage may be unavailable in private or embedded browsers. */ }
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-layout', layout);
})();
