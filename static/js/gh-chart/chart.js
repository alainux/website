/* ============================================================
 * gh-chart/chart.js
 * Orchestrates the contribution chart: loads data, builds the
 * scene, runs the entrance + render loops, wires hover/tooltip,
 * resize, auto-rotate pausing, and live theme switching.
 *
 * Loaded as an ES module by templates/partials/github_contributions.html
 * only on the homepage. Three.js + GSAP are lazy-imported from esm.sh.
 * ============================================================ */

import * as THREE from 'https://esm.sh/three@0.169.0';
import { gsap } from 'https://esm.sh/gsap@3.12.5';
import { EffectComposer } from 'https://esm.sh/three@0.169.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.169.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.169.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'https://esm.sh/three@0.169.0/examples/jsm/postprocessing/OutputPass.js';

import { USE_BLOOM, BLOOM_STRENGTH, H_MAX } from './config.js';
import { buildCells } from './data.js';
import { paletteFromTheme, colorForCount, bloomThreshold } from './theme.js';
import { createScene } from './scene.js';

export function initContribChart() {
  const dataEl = document.getElementById('gh-contrib-data');
  const canvas = document.getElementById('gh-contrib-canvas');
  if (!dataEl || !canvas) return;
  let DATA;
  try { DATA = JSON.parse(dataEl.textContent); } catch (_) { return; }
  if (!DATA || !DATA.weeks || !DATA.weeks.length) return;

  const tooltipEl = document.getElementById('gh-tooltip');
  let pal = paletteFromTheme(THREE);
  const { cells, minCount, maxCount, monthDescs } = buildCells(DATA);
  const TOTAL = cells.length;
  const startH = 0.0001;

  const s = createScene(canvas, pal, cells);
  const { renderer, scene, camera, controls, mesh, barMat, lineMat, tileMat,
          edges, rebuildEdges, writeInstance, currentH, todayRing, monthsGroup,
          buildMonthLabels, horizonGrid, buildHorizonGrid } = s;

  function baseColorOf(i) { return colorForCount(THREE, pal, cells[i].count, minCount, maxCount); }
  function applyColors() {
    for (let i = 0; i < TOTAL; i++) mesh.setColorAt(i, baseColorOf(i));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  for (let i = 0; i < TOTAL; i++) writeInstance(i, startH);
  applyColors();
  mesh.instanceMatrix.needsUpdate = true;

  buildMonthLabels(monthDescs);

  /* ── Entrance animation ── */
  const hs = new Float32Array(TOTAL).fill(startH);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tlEnter = gsap.timeline({ delay: 0.12 });
  function writeInstances() {
    for (let i = 0; i < TOTAL; i++) { writeInstance(i, hs[i]); currentH[i] = hs[i]; }
    mesh.instanceMatrix.needsUpdate = true;
    rebuildEdges();
  }
  if (reduced) {
    for (let i = 0; i < TOTAL; i++) hs[i] = cells[i].targetH;
    writeInstances();
  } else {
    for (let i = 0; i < TOTAL; i++) {
      const c = cells[i];
      const stagger = c.monthIdx * 0.06 + Math.abs(c.x) * 0.01 + Math.abs(c.z) * 0.005;
      tlEnter.to(hs, { [i]: c.targetH, duration: 0.7, ease: 'elastic.out(1, 0.7)' }, stagger);
    }
    tlEnter.eventCallback('onUpdate', writeInstances);
  }

  /* ── Camera framing (desktop vs mobile) ── */
  function frameConfig() {
    const mobile = window.matchMedia('(max-width: 860px)').matches;
    return mobile ? { ndcX: 0.42, ndcY: -0.42, occ: 0.92 } : { ndcX: -0.42, ndcY: 0.0, occ: 1.12 };
  }
  function applyViewShift() {
    const fc = frameConfig();
    camera.projectionMatrix.elements[8] = -fc.ndcX;
    camera.projectionMatrix.elements[9] = -fc.ndcY;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  function fitCameraToChart() {
    const halfX = (s.extent.maxX - s.extent.minX) / 2;
    const halfZ = (s.extent.maxZ - s.extent.minZ) / 2;
    const halfY = H_MAX / 2;
    const center = new THREE.Vector3(halfX * 0.10, -H_MAX * 0.6, 0);
    const radius = Math.sqrt(halfX * halfX + halfZ * halfZ + halfY * halfY);
    const fov = (camera.fov * Math.PI) / 180;
    const fc = frameConfig();
    const dist = (radius / Math.tan(fov / 2)) * (0.5 / fc.occ);
    const dir = new THREE.Vector3(-0.85, 0.55, 0.7).normalize();
    camera.position.copy(center).add(dir.multiplyScalar(dist));
    controls.target.copy(center);
    controls.minDistance = dist * 0.4;
    controls.maxDistance = dist * 2.5;
    camera.near = dist * 0.05;
    camera.far = dist * 5;
    camera.updateProjectionMatrix();
    scene.fog.near = dist * 1.15;
    scene.fog.far = dist * 3.4;
    applyViewShift();
    controls.update();
  }
  fitCameraToChart();

  /* ── Resize ── */
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
  new ResizeObserver(resize).observe(canvas.parentElement);

  /* ── Hover + tooltip ── */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hoveredIdx = -1;
  const hoverLift = new Float32Array(TOTAL).fill(0);

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(mesh, false);
    const id = hit.length > 0 ? hit[0].instanceId : -1;
    const newIdx = id >= 0 && cells[id].valid ? id : -1;
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
        `translate3d(${e.clientX - r.left + 14}px, ${e.clientY - r.top - 6}px, 0)`;
    }
  });
  canvas.addEventListener('pointerleave', () => {
    hoveredIdx = -1;
    if (tooltipEl) tooltipEl.classList.remove('is-visible');
  });

  /* ── Post-processing (subtle bloom) ── */
  let composer = null;
  if (USE_BLOOM) {
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM_STRENGTH, 0.5, bloomThreshold());
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      composer._bloom = bloom;
    } catch (_) {
      composer = null;
    }
  }

  /* ── Render loop ── */
  let isVisible = true;
  document.addEventListener('visibilitychange', () => { isVisible = !document.hidden; });
  const ringPulse = { v: 0 };

  function render() {
    requestAnimationFrame(render);
    if (!isVisible) return;
    controls.update();

    let dirty = false;
    for (let i = 0; i < TOTAL; i++) {
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
      mesh.setColorAt(i, colorForCount(THREE, pal, cells[i].count, minCount, maxCount).lerp(new THREE.Color(pal.hoverTint), 0.55 * next));
      dirty = true;
    }
    if (dirty) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      rebuildEdges();
    }

    if (todayRing && !reduced) {
      ringPulse.v += 0.04;
      const p = (Math.sin(ringPulse.v) + 1) / 2;
      todayRing.material.opacity = 0.55 + p * 0.45;
      todayRing.scale.setScalar(1 + p * 0.18);
    }

    if (composer) composer.render();
    else renderer.render(scene, camera);
  }
  requestAnimationFrame(render);

  /* ── Pause auto-rotate after interaction ── */
  let resumeTimer;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeTimer); });
  controls.addEventListener('end', () => {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => (controls.autoRotate = true), 4000);
  });

  /* ── Live theme switch ── */
  function applyTheme() {
    pal = paletteFromTheme(THREE);
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
    buildMonthLabels(monthDescs);
    if (!reduced) {
      for (let i = 0; i < TOTAL; i++) hs[i] = startH;
      tlEnter.restart();
    }
  }
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  resize();
}
