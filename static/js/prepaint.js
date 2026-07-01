(function () {
  var storedTheme  = localStorage.getItem('theme');
  var storedLayout = localStorage.getItem('layout');
  var systemLight  = window.matchMedia('(prefers-color-scheme: light)').matches;
  var theme  = storedTheme  || (systemLight ? 'light' : 'dark');
  var layout = storedLayout || 'centered';
  document.documentElement.setAttribute('data-theme',  theme);
  document.documentElement.setAttribute('data-layout', layout);
})();
