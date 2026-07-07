/* ============================================================
 * gh-chart/theme.js
 * Maps the site's semantic CSS custom properties to the Three.js
 * colour set the chart uses, so it follows light/dark switching.
 * ============================================================ */

/* Reads a custom property off :root, falling back to a literal so the
   chart still renders if the stylesheet hasn't loaded. */
function readVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function mixHex(a, b, t) {
  return a.clone().lerp(b, t);
}

/* Build the palette for the current theme. `THREE` is passed in so this
   module stays free of the three import (it only needs THREE.Color). */
export function paletteFromTheme(THREE) {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  const primary   = new THREE.Color(readVar('--primary',   isLight ? '#2e7de9' : '#7aa2f7'));
  const info      = new THREE.Color(readVar('--info',      isLight ? '#007197' : '#7dcfff'));
  const success   = new THREE.Color(readVar('--success',   isLight ? '#587539' : '#9ece6a'));
  const text      = new THREE.Color(readVar('--text',      isLight ? '#1a1b26' : '#c0caf5'));
  const textMuted = new THREE.Color(readVar('--text-muted', isLight ? '#4b5076' : '#7982a9'));
  const surface   = new THREE.Color(readVar('--surface',   isLight ? '#e8e8ee' : '#1a1b26'));

  let low, high, zero, wire, gridMain, emissiveI;
  if (isLight) {
    low = mixHex(primary, info, 0.30);
    high = mixHex(info, new THREE.Color('#dff3ff'), 0.45);
    zero = mixHex(primary, surface, 0.82);
    wire = primary;
    gridMain = info;
    emissiveI = 0.45;
  } else {
    low = mixHex(success, surface, 0.35);
    high = mixHex(success, info, 0.35);
    zero = mixHex(success, surface, 0.82);
    wire = success;
    gridMain = info;
    emissiveI = 0.18;
  }

  return {
    low, high, zero, wire, gridMain, emissiveI,
    accent: primary,
    bg: surface,
    labelText: textMuted,
    hoverTint: text,
  };
}

/* Continuous colour for any commit count: faint `zero` tint for empty
   days, then a ramp from `low` (fewest commits) to `high` (peak). */
export function colorForCount(THREE, pal, count, minCount, maxCount) {
  if (count <= 0) return new THREE.Color().copy(pal.zero);
  if (maxCount <= minCount) return new THREE.Color().copy(pal.low).lerp(pal.high, 0.5);
  const t = (count - minCount) / (maxCount - minCount);
  return new THREE.Color().copy(pal.low).lerp(pal.high, t);
}

/* Bloom threshold per mode: dark bg is dark (low threshold lets the bars
   glow); light bg is near-white (threshold must stay above it). */
export function bloomThreshold() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 0.92 : 0.6;
}
