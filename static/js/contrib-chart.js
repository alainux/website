/* ============================================================
 * contrib-chart.js
 * ------------------------------------------------------------
 * Isometric 3D GitHub contribution chart (Three.js + GSAP).
 * ============================================================ */

import * as THREE from 'https://esm.sh/three@0.169.0';
import { OrbitControls } from 'https://esm.sh/three@0.169.0/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'https://esm.sh/three@0.169.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.169.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.169.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'https://esm.sh/three@0.169.0/examples/jsm/postprocessing/OutputPass.js';
import { AfterimagePass } from 'https://esm.sh/three@0.169.0/examples/jsm/postprocessing/AfterimagePass.js';
import { gsap } from 'https://esm.sh/gsap@3.12.5';

/* Master switch for the post-process glow. Set false to fall back to the
   plain renderer if a browser/WebGL quirk ever breaks the composer. */
const USE_BLOOM = true;
const BLOOM_STRENGTH = 0.38;
const PHOSPHOR_DAMP = 0.82;  // afterimage persistence (0=off, →1 longer trails)

(function () {
  'use strict';

  /* ── Data ─────────────────────────────────────────────────── */
  const dataEl = document.getElementById('gh-contrib-data');
  const canvas = document.getElementById('gh-contrib-canvas');
  if (!dataEl || !canvas) return;
  let DATA;
  try { DATA = JSON.parse(dataEl.textContent); } catch (_) { return; }
  if (!DATA || !DATA.weeks || !DATA.weeks.length) return;

  const tooltipEl = document.getElementById('gh-tooltip');

  /* ── Palette (Tokyo Night, from CSS variables) ────────────── */
  const readVar = (n) =>
    getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function mixHex(a, b, t) {
    const ca = new THREE.Color(a), cb = new THREE.Color(b);
    return ca.lerp(cb, t);
  }

  function paletteFromTheme() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const accent    = readVar('--accent')    || (isLight ? '#2e7de9' : '#7aa2f7');
    const cyan      = readVar('--cyan')      || (isLight ? '#007197' : '#7dcfff');
    const green     = readVar('--green')     || (isLight ? '#587539' : '#9ece6a');
    const fg        = readVar('--fg')        || (isLight ? '#1a1b26' : '#c0caf5');
    const fgDim     = readVar('--fg-dim')    || (isLight ? '#4b5076' : '#7982a9');
    const chipBg    = readVar('--chip-bg')   || (isLight ? '#e8e8ee' : '#1a1b26');
    const chipEdge  = readVar('--border-soft') || (isLight ? '#a8abbd' : '#565f89');
    const bg        = readVar('--bg')        || (isLight ? '#e8e8ee' : '#1a1b26');
    const border    = readVar('--border')    || (isLight ? '#d8d8e0' : '#292e42');

    // Per-mode colour range. Light mode → light-blue shades, dark mode →
    // light-green shades. `zero` keeps empty cells as a faint tint of the
    // same hue so the field reads as continuous wireframe territory.
    let low, high, zero, wire, gridMain, emissiveI;
    if (isLight) {
      // Light mode → pale blue shades. Pushed toward cyan/white so the
      // bars read light even under the standard lighting model.
      low      = mixHex(accent,    cyan,   0.30).getStyle();
      high     = mixHex(cyan,      '#dff3ff', 0.45).getStyle();
      zero     = mixHex(accent,    bg,     0.82).getStyle();
      wire     = accent;  // blue edges read with contrast on light bg
      gridMain = cyan;
      emissiveI = 0.45;  // strong self-glow keeps the bars light
    } else {
      low      = mixHex(green, bg,  0.35).getStyle();
      high     = mixHex(green, cyan, 0.35).getStyle();
      zero     = mixHex(green, bg,  0.82).getStyle();
      wire     = green;
      gridMain = cyan;
      emissiveI = 0.18;
    }

    return {
      low, high, zero, wire, gridMain, emissiveI,
      accent, green, bg, fg, fgDim, chipBg, chipEdge,
      labelText: fgDim,
      hoverTint: fg,
      groundDim: border,
      edge: wire,
    };
  }
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let pal = paletteFromTheme();

  /* Continuous colour for any commit count — accent (blue) at the
     dataset's lowest non-zero count, accent green at its peak. Zero
     commits fall back to a dim accent. */
  /* Continuous colour: faint `zero` tint for empty days, then a ramp
     from `low` (fewest commits) to `high` (peak) within the mode's hue
     family — light-blue in light mode, light-green in dark mode. */
  function colorForCount(count) {
    if (count <= 0) return new THREE.Color(pal.zero);
    if (maxCount <= minCount) return new THREE.Color(pal.low).lerp(new THREE.Color(pal.high), 0.5);
    const t = (count - minCount) / (maxCount - minCount);
    return new THREE.Color(pal.low).lerp(new THREE.Color(pal.high), t);
  }

  /* ── Geometry constants ───────────────────────────────────── */
  const DAYS = 7;                    
  const WEEKS_PER_MONTH = 6;          
  const MONTHS_PER_ROW = 3;           
  const MONTH_ROWS = 4;               
  const MONTH_COUNT = MONTHS_PER_ROW * MONTH_ROWS;

  const CELL = 1.0;
  const GAP  = 0.22;
  const BAR_W = CELL - GAP * 2;
  const H_ZERO = 0.015;               // flat "base" plate for 0-commit days
  const H_BASE = 0.12;                // raised bars start this far above the tile
  const H_MAX  = 3.0;                 
  const MONTH_GAP = 2.0;              // whole CELL multiple → day lattice aligns
  const ROW_GAP = 2.0;                // with the uniform horizon grid

  const LABEL_W = DAYS * CELL;
  const LABEL_D = LABEL_W / 5; 

  /* ── Flatten weeks → daily entries ───────────────────────── */
  const flatDays = DATA.weeks.flatMap(w => w);

  /* Normalization range: accent (blue) for the lowest non-zero
     commit-day, accent green for the highest. The full spectrum
     is always used regardless of how lopsided the dataset is. */
  let minCount = Infinity, maxCount = 0;
  for (const d of flatDays) {
    if (!d || !d.date || !d.count) continue;
    if (d.count < minCount) minCount = d.count;
    if (d.count > maxCount) maxCount = d.count;
  }
  if (!isFinite(minCount)) minCount = 0;

  function findTodayStr() {
    for (let i = flatDays.length - 1; i >= 0; i--) {
      if (flatDays[i] && flatDays[i].date) return flatDays[i].date;
    }
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }
  const TODAY_STR = findTodayStr();

  /* ── Re-bucket days into calendar months ──────────────────── */
  const monthMap = new Map(); 
  for (const day of flatDays) {
    if (!day || !day.date) continue;
    const key = day.date.slice(0, 7); 
    if (!monthMap.has(key)) monthMap.set(key, []);
    monthMap.get(key).push(day);
  }

  const todayMonthKey = TODAY_STR.slice(0, 7); 
  function shiftMonth(key, delta) {
    const y = parseInt(key.slice(0, 4));
    const m = parseInt(key.slice(5, 7)); 
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return d.toISOString().slice(0, 7);
  }
  const usedMonthKeys = [];
  for (let i = MONTH_COUNT - 1; i >= 0; i--) {
    usedMonthKeys.push(shiftMonth(todayMonthKey, -i));
  }
  usedMonthKeys.sort();

  function weekdayMON(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const jsDay = d.getUTCDay();
    return (jsDay + 6) % 7;
  }
  function monthFirstWeekdayMON(dateStr) {
    const ym = dateStr.slice(0, 7);
    const first = ym + '-01';
    return weekdayMON(first);
  }

  const monthDescs = usedMonthKeys.map((key, idx) => {
    const days = monthMap.get(key) || [];
    const leadingDow = monthFirstWeekdayMON(key);
    return {
      key,
      idx,
      label: MONTHS[parseInt(key.slice(5, 7), 10) - 1] + ' ' + key.slice(0, 4),
      shortLabel: MONTHS[parseInt(key.slice(5, 7), 10) - 1],
      year: key.slice(0, 4),
      leadingDow,
      days,
      rowInGrid: Math.floor(idx / MONTHS_PER_ROW), 
      colInGrid: idx % MONTHS_PER_ROW,             
    };
  });

  /* ── Cell array ───────────────────────────────────────────── */
  const cells = [];
  const MONTH_BLOCK_W = DAYS * CELL;
  const MONTH_BLOCK_D = WEEKS_PER_MONTH * CELL;
  const ROW_W = MONTHS_PER_ROW * MONTH_BLOCK_W + (MONTHS_PER_ROW - 1) * MONTH_GAP;
  const GRID_D = MONTH_ROWS * MONTH_BLOCK_D + (MONTH_ROWS - 1) * ROW_GAP;

  function monthOffset(rowInGrid, colInGrid) {
    const x = (colInGrid - (MONTHS_PER_ROW - 1) / 2) * (MONTH_BLOCK_W + MONTH_GAP);
    const z = (rowInGrid - (MONTH_ROWS - 1) / 2) * (MONTH_BLOCK_D + ROW_GAP);
    return { x, z };
  }

  for (const m of monthDescs) {
    const origin = monthOffset(m.rowInGrid, m.colInGrid);
    const dayMap = new Map();
    for (const d of m.days) dayMap.set(d.date, d);

    const year = parseInt(m.key.slice(0, 4), 10);
    const mon  = parseInt(m.key.slice(5, 7), 10); 
    const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();

    for (let dow = 0; dow < DAYS; dow++) {
      for (let w = 0; w < WEEKS_PER_MONTH; w++) {
        const dayOfMonth = w * DAYS + dow - m.leadingDow + 1;
        const xLocal = (dow - (DAYS - 1) / 2) * CELL;
        // Integer-centred (floor) so Z cell centres share the X lattice
        // parity — otherwise the horizon grid aligns edges in X but runs
        // through centres in Z.
        const zLocal = (w - Math.floor((WEEKS_PER_MONTH - 1) / 2)) * CELL;
        const x = origin.x + xLocal;
        const z = origin.z + zLocal;
        let date = '', level = 0, count = 0, isToday = false;
        if (dayOfMonth >= 1 && dayOfMonth <= daysInMonth) {
          const dd = String(dayOfMonth).padStart(2, '0');
          date = `${m.key}-${dd}`;
          const src = dayMap.get(date);
          if (src) { level = src.level; count = src.count; }
          if (date === TODAY_STR) isToday = true;
        }
        cells.push({
          x, z,
          level, count, date,
          monthKey: m.key,
          monthIdx: m.idx,
          rowInGrid: m.rowInGrid,
          colInGrid: m.colInGrid,
          isToday,
          valid: date !== '',
          targetH: levelToHeight(level),
        });
      }
    }
  }

  const TOTAL = cells.length;

  function levelToHeight(l) {
    return l <= 0 ? H_ZERO : H_BASE + (l / 4) * (H_MAX - H_BASE);
  }

  const dummy = new THREE.Object3D();
  const startH = 0.0001;

  /* ── Renderer / scene / camera ────────────────────────────── */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
  } catch (_) {
    canvas.style.display = 'none';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  
  // Explicitly turn off tone mapping and force regular output color space mapping.
  // This guarantees that the background hex values match the DOM container perfectly.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(pal.bg);
  /* Distance fog fades the far reaches of the floor grid into the page
     background, producing the classic Tron/synthwave horizon line
     without any transparency tricks. */
  scene.fog = new THREE.Fog(pal.bg, 60, 165);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minPolarAngle = Math.PI * 0.15;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;

  // Switched back to clear standard lighting since bloom shader injectors are gone
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.6);
  keyLight.position.set(6, 12, 4);
  scene.add(keyLight);

  /* ── Ground grid ──────────────────────────────────────────── */
  /* Far horizon grid — a much larger, fainter floor that the fog fades
     into the background, reading as an infinite vector plane. This is
     the only floor grid; the tighter grid that hugged the calendar was
     removed for a cleaner retro-planes look. */
  function buildHorizonGrid() {
    const size = Math.max(ROW_W, GRID_D) * 4 + 40 * CELL;
    const divs = Math.round(size / CELL);
    const g = new THREE.GridHelper(size, divs, pal.gridMain, pal.gridMain);
    g.material.opacity = 0.12;
    g.material.transparent = true;
    g.material.depthWrite = false;
    // Offset by half a cell so its lines run along the day-tile edges,
    // and share the floor plane (y) with the per-cell grid.
    g.position.set(CELL / 2, 0.002, CELL / 2);
    return g;
  }
  let horizonGrid = buildHorizonGrid();
  scene.add(horizonGrid);

  /* Aligned day grid — one flat square per cell, built from the actual
     cell positions so every day sits neatly inside a grid square
     (the far horizon grid can't align because of month/row gaps). This
     also serves as the flat "base" plate under 0-commit days. */
  const tileSrc = (() => {
    const s = CELL / 2;
    return new Float32Array([
      -s, 0, -s,  s, 0, -s,
       s, 0, -s,  s, 0,  s,
       s, 0,  s, -s, 0,  s,
      -s, 0,  s, -s, 0, -s,
    ]);
  })();
  const tileArr = new Float32Array(TOTAL * tileSrc.length);
  const tileGeo = new THREE.BufferGeometry();
  tileGeo.setAttribute('position', new THREE.BufferAttribute(tileArr, 3));
  const tileMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(pal.gridMain),
    transparent: true,
    opacity: 0.32,
  });
  const floorTiles = new THREE.LineSegments(tileGeo, tileMat);
  floorTiles.position.y = 0.002;
  floorTiles.frustumCulled = false;
  floorTiles.renderOrder = 1;
  scene.add(floorTiles);
  (function buildFloorTiles() {
    for (let i = 0; i < TOTAL; i++) {
      const c = cells[i];
      const off = i * tileSrc.length;
      if (!c.valid) { tileArr.fill(0, off, off + tileSrc.length); continue; }
      for (let k = 0; k < tileSrc.length; k += 3) {
        tileArr[off + k]     = c.x + tileSrc[k];
        tileArr[off + k + 1] = tileSrc[k + 1];
        tileArr[off + k + 2] = c.z + tileSrc[k + 2];
      }
    }
    tileGeo.attributes.position.needsUpdate = true;
  })();

  /* ── Bars: InstancedMesh ──────────────────────────────────── */
  const barGeo = new THREE.BoxGeometry(BAR_W, 1, BAR_W);
  barGeo.translate(0, 0.5, 0); 

  const barMat = new THREE.MeshStandardMaterial({
    metalness: 0.2,
    roughness: 0.35,
    emissive: new THREE.Color(pal.wire),
    emissiveIntensity: pal.emissiveI,
  });

  const mesh = new THREE.InstancedMesh(barGeo, barMat, TOTAL);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL * 3), 3);
  mesh.frustumCulled = false;
  scene.add(mesh);

  /* Clean Tron edge contour — the 12 outer edges of each box (from
     EdgesGeometry), merged into a single LineSegments buffer. Only the
     true cube edges are drawn (no triangulated diagonals), so it stays
     crisp instead of the jagged `wireframe: true` look. */
  const edgeSrc = new THREE.EdgesGeometry(barGeo).attributes.position.array; // 24 verts * 3
  const currentH = new Float32Array(TOTAL).fill(startH);
  const edgeArr = new Float32Array(TOTAL * edgeSrc.length);
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgeArr, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(pal.wire),
    transparent: true,
    opacity: 0.6,
  });
  const edges = new THREE.LineSegments(edgeGeo, lineMat);
  edges.renderOrder = 2;
  edges.frustumCulled = false;
  scene.add(edges);

  function rebuildEdges() {
    for (let i = 0; i < TOTAL; i++) {
      const c = cells[i];
      const off = i * edgeSrc.length;
      if (!c.valid) { edgeArr.fill(0, off, off + edgeSrc.length); continue; }
      const h = currentH[i];
      for (let k = 0; k < edgeSrc.length; k += 3) {
        edgeArr[off + k]     = c.x + edgeSrc[k];
        edgeArr[off + k + 1] = edgeSrc[k + 1] * h;
        edgeArr[off + k + 2] = c.z + edgeSrc[k + 2];
      }
    }
    edgeGeo.attributes.position.needsUpdate = true;
  }
  rebuildEdges();

  /* ── Today marker ─────────────────────────────────────────── */
  const todayCell = cells.find(c => c.isToday);
  let todayRing = null;
  if (todayCell) {
    const ringGeo = new THREE.TorusGeometry(BAR_W * 0.85, 0.05, 12, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(pal.accent),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    todayRing = new THREE.Mesh(ringGeo, ringMat);
    todayRing.rotation.x = Math.PI / 2; 
    todayRing.position.set(todayCell.x, Math.max(todayCell.targetH, H_BASE) + 0.08, todayCell.z);
    todayRing.renderOrder = 5;
    scene.add(todayRing);
  }

  function writeInstance(i, h) {
    const c = cells[i];
    dummy.position.set(c.x, 0, c.z);
    // Invalid (out-of-month) days render as zero-size → no square, no bar.
    dummy.scale.set(c.valid ? 1 : 0, h, c.valid ? 1 : 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  function baseColorOf(i) {
    const c = cells[i];
    // Continuous spectrum: accent (blue) at the dataset's lowest
    // non-zero count, accent green at its peak. Zero-commit days get
    // a dimmed accent so empty cells still read as "low activity".
    return colorForCount(c.count);
  }
  function applyColors() {
    for (let i = 0; i < TOTAL; i++) mesh.setColorAt(i, baseColorOf(i));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  for (let i = 0; i < TOTAL; i++) writeInstance(i, startH);
  applyColors();
  mesh.instanceMatrix.needsUpdate = true;

  /* ── Month labels ─────────────────────────────────────────── */
  const monthsGroup = new THREE.Group();
  scene.add(monthsGroup);

  const labelGeo = new THREE.PlaneGeometry(LABEL_W, LABEL_D);

  function monthTexture(name) {
    const c = document.createElement('canvas');
    c.width = 384; c.height = 72;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = pal.labelText;
    ctx.font = 'bold 44px "JetBrainsMono Nerd Font", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.toUpperCase(), c.width / 2, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  function buildMonthLabels() {
    disposeGroup(monthsGroup);
    for (const m of monthDescs) {
      const origin = monthOffset(m.rowInGrid, m.colInGrid);
      const tex = monthTexture(m.shortLabel);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const plane = new THREE.Mesh(labelGeo, mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(
        origin.x,
        0.02,
        origin.z - MONTH_BLOCK_D / 2 - LABEL_D / 2 - 0.05
      );
      plane.renderOrder = 4;
      monthsGroup.add(plane);
    }
  }
  buildMonthLabels();

  /* ── Entrance animation ───────────────────────────────────── */
  const hs = new Float32Array(TOTAL).fill(startH);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tlEnter = gsap.timeline({ delay: 0.12 });
  if (reduced) {
    for (let i = 0; i < TOTAL; i++) hs[i] = cells[i].targetH;
    writeInstances();
  } else {
    for (let i = 0; i < TOTAL; i++) {
      const c = cells[i];
      const stagger = c.monthIdx * 0.06 + Math.abs(c.x) * 0.01 + Math.abs(c.z) * 0.005;
      tlEnter.to(
        hs,
        { [i]: cells[i].targetH, duration: 0.7, ease: 'elastic.out(1, 0.7)' },
        stagger
      );
    }
    tlEnter.eventCallback('onUpdate', writeInstances);
  }

  function writeInstances() {
    for (let i = 0; i < TOTAL; i++) {
      writeInstance(i, hs[i]);
      currentH[i] = hs[i];
    }
    mesh.instanceMatrix.needsUpdate = true;
    rebuildEdges();
  }

  /* ── Auto-fit camera ──────────────────────────────────────── */
  /* Frame configuration per breakpoint:
       • desktop → chart sits middle-left, occupying ~70% of the stage
       • mobile  → chart sits bottom-right, occupying ~60% of the stage
     `ndcX`/`ndcY` are the subject's desired centre in NDC space
     (+x right, +y up), `occ` the desired stage-occupancy fraction. */
  function frameConfig() {
    const mobile = window.matchMedia('(max-width: 860px)').matches;
    if (mobile) return { ndcX: 0.42, ndcY: -0.42, occ: 0.74 };
    return { ndcX: -0.42, ndcY: 0.0, occ: 0.88 };
  }

  /* Pan the subject within the frame via the frustum skew terms
     (projectionMatrix elements 8/9). NDC offset = -value, so the chart
     lands at (ndcX, ndcY). Re-applied after every projection rebuild.
     The inverse must be refreshed too, or raycasting (hover) uses the
     stale matrix and highlights the wrong box. */
  function applyViewShift() {
    const fc = frameConfig();
    camera.projectionMatrix.elements[8] = -fc.ndcX;
    camera.projectionMatrix.elements[9] = -fc.ndcY;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  function fitCameraToChart() {
    const halfX = ROW_W / 2;
    const halfZ = GRID_D / 2;
    const halfY = H_MAX / 2;
    // Aim below the floor (y<0) to lift the chart higher in the
    // frame. Bars grow upward from y=0; aiming lower than the
    // floor pushes the visible chart toward the top of the stage.
    const center = new THREE.Vector3(halfX * 0.10, -H_MAX * 0.6, 0);
    const radius = Math.sqrt(halfX * halfX + halfZ * halfZ + halfY * halfY);
    const fov = (camera.fov * Math.PI) / 180;
    const fc = frameConfig();
    const fitFactor = 0.5 / fc.occ;  // occ scales how much of the stage the chart fills
    const dist = (radius / Math.tan(fov / 2)) * fitFactor;
    const dir = new THREE.Vector3(-0.85, 0.55, 0.7).normalize();
    camera.position.copy(center).add(dir.multiplyScalar(dist));
    controls.target.copy(center);
    controls.minDistance = dist * 0.4;
    controls.maxDistance = dist * 2.5;
    camera.near = dist * 0.05;
    camera.far = dist * 5;
    camera.updateProjectionMatrix();
    // Fog follows camera distance so the chart stays crisp while only the
    // extended horizon grid dissolves into the background.
    scene.fog.near = dist * 1.15;
    scene.fog.far = dist * 3.4;
    applyViewShift();
    controls.update();
  }
  fitCameraToChart();

  /* ── Resize ───────────────────────────────────────────────── */
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    applyViewShift();
    if (composer) composer.setSize(w, h);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement);

  /* ── Hover ────────────────────────────────────────────────── */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hoveredIdx = -1;
  const hoverLift = new Float32Array(TOTAL).fill(0);

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(mesh, false);
    const hit = hits.length > 0 ? hits[0].instanceId : -1;
    // Ignore hits on invalid (out-of-month) days — they have no square.
    const newIdx = hit >= 0 && cells[hit].valid ? hit : -1;
    if (newIdx !== hoveredIdx) {
      hoveredIdx = newIdx;
      if (hoveredIdx >= 0 && tooltipEl) {
        const c = cells[hoveredIdx];
        tooltipEl.innerHTML =
          `<span class="gh-tip-date">${c.date || '—'}</span>` +
          `<span class="gh-tip-count"><b>${c.count}</b> commit${c.count === 1 ? '' : 's'}</span>`;
        tooltipEl.classList.add('is-visible');
      } else if (tooltipEl) {
        tooltipEl.classList.remove('is-visible');
      }
    }
    if (tooltipEl && hoveredIdx >= 0) {
      tooltipEl.style.transform =
        'translate3d(' + (e.clientX - r.left + 14) + 'px,' +
                      (e.clientY - r.top  - 6) + 'px, 0)';
    }
  });

  canvas.addEventListener('pointerleave', () => {
    hoveredIdx = -1;
    if (tooltipEl) tooltipEl.classList.remove('is-visible');
  });

  /* ── Post-processing (subtle bloom) ───────────────────────── */
  /* Opaque background + OutputPass (sRGB) is the canonical setup that
     avoids the grey-wash / lost-transparency regression from earlier
     naive bloom attempts. Kill-switch: USE_BLOOM at top of file. */
  /* Bloom threshold per mode: dark mode bg is dark, so a low threshold
     lets the green bars glow; light mode bg is near-white, so the
     threshold must stay above it or the whole frame blooms. */
  function bloomThreshold() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 0.92 : 0.6;
  }

  let composer = null;
  if (USE_BLOOM) {
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      // Trailing phosphor: afterimage blends the previous frame, leaving
      // CRT-style motion trails as the chart auto-rotates / bars animate.
      if (PHOSPHOR_DAMP > 0) composer.addPass(new AfterimagePass(PHOSPHOR_DAMP));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(1, 1),
        BLOOM_STRENGTH, // strength — kept low so only neon edges glow
        0.5,            // radius
        bloomThreshold()
      );
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      composer._bloom = bloom;
    } catch (_) {
      composer = null;
    }
  }

  /* ── Render loop ──────────────────────────────────────────── */
  let isVisible = true;
  document.addEventListener('visibilitychange', () => { isVisible = !document.hidden; });

  const ringPulse = { v: 0 };

  function render() {
    requestAnimationFrame(render);
    if (!isVisible) return;
    controls.update();

    let dirty = false;
    for (let i = 0; i < TOTAL; i++) {
      // Bars with commits lift/colour on hover; 0-commit "base" tiles
      // stay put so they read as a static floor, not interactive posts.
      const hoverable = i === hoveredIdx && cells[i].count > 0;
      const want = hoverable ? 1 : 0;
      const prev = hoverLift[i];
      const next = prev + (want - prev) * 0.18;
      if (Math.abs(next - prev) < 0.002 && next < 0.01) {
        if (prev >= 0.01) {
          writeInstance(i, hs[i]);
          mesh.setColorAt(i, baseColorOf(i));
          hoverLift[i] = 0;
          currentH[i] = hs[i];
          dirty = true;
        }
        continue;
      }
      hoverLift[i] = next;
      writeInstance(i, hs[i] + next * 0.4);
      currentH[i] = hs[i] + next * 0.4;
      const target = colorForCount(cells[i].count)
        .lerp(new THREE.Color(pal.hoverTint), 0.55 * next);
      mesh.setColorAt(i, target);
      dirty = true;
    }
    if (dirty) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      rebuildEdges();
    }

    if (todayRing) {
      ringPulse.v += 0.04;
      const p = (Math.sin(ringPulse.v) + 1) / 2; 
      todayRing.material.opacity = 0.55 + p * 0.45;
      todayRing.scale.setScalar(1 + p * 0.18);
    }

    if (composer) composer.render();
    else renderer.render(scene, camera);
  }
  requestAnimationFrame(render);

  /* ── Pause auto-rotate after interaction ─────────────────── */
  let resumeTimer;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    clearTimeout(resumeTimer);
  });
  controls.addEventListener('end', () => {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => (controls.autoRotate = true), 4000);
  });

  /* ── Theme switch ────────────────────────────────────────── */
  function disposeGroup(group) {
    group.clear();
    for (const child of group.children) {
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    }
  }
  function applyTheme() {
    pal = paletteFromTheme();
    applyColors();

    if (lineMat) lineMat.color.set(pal.wire);
    if (tileMat) tileMat.color.set(pal.gridMain);
    if (barMat) { barMat.emissive.set(pal.wire); barMat.emissiveIntensity = pal.emissiveI; }
    if (composer && composer._bloom) composer._bloom.threshold = bloomThreshold();

    scene.background.set(pal.bg);
    scene.fog.color.set(pal.bg);

    scene.remove(horizonGrid);
    horizonGrid.geometry.dispose();
    horizonGrid.material.dispose();
    horizonGrid = buildHorizonGrid();
    scene.add(horizonGrid);

    if (todayRing) todayRing.material.color.set(pal.accent);

    buildMonthLabels();

    if (!reduced) {
      for (let i = 0; i < TOTAL; i++) hs[i] = startH;
      tlEnter.restart();
    }
  }
  new MutationObserver(applyTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  resize();
})();