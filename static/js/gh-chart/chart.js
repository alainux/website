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
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ROTATION_RESUME_MS = 4000;
  const CAMERA_FILL = 0.74;
  let rotationPaused = reduced;
  const motionButton = document.getElementById('gh-motion-toggle');

  const s = createScene(canvas, pal, cells);
  const { renderer, scene, camera, controls, mesh, barMat, lineMat, tileMat,
          rebuildEdges, writeInstance, currentH, todayRing,
          buildMonthLabels } = s;

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
  controls.autoRotate = !rotationPaused;
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

  /* Fit the calendar inside its own viewport, including on narrow screens. */
  function fitCameraToChart() {
    const halfX = (s.extent.maxX - s.extent.minX) / 2 + 2;
    const halfZ = (s.extent.maxZ - s.extent.minZ) / 2 + 2;
    const center = new THREE.Vector3(0, H_MAX / 2, 0);
    const direction = new THREE.Vector3(-0.65, 1.2, 1).normalize();
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const radius = Math.sqrt(halfX * halfX + halfZ * halfZ + H_MAX * H_MAX / 4);
    const distance = CAMERA_FILL * radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2);
    camera.position.copy(center).add(direction.multiplyScalar(distance));
    controls.target.copy(center);
    camera.near = distance * 0.05;
    camera.far = distance * 5;
    camera.updateProjectionMatrix();
    scene.fog.near = distance * 1.5;
    scene.fog.far = distance * 4;
    controls.update();
  }

  function resize() {
    const bounds = canvas.parentElement.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    fitCameraToChart();
    if (composer) composer.setSize(width, height);
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
          `<span class="gh-tip-count"><b>${c.count}</b> contribution${c.count === 1 ? '' : 's'}</span>`;
        tooltipEl.classList.add('is-visible');
      } else if (tooltipEl) {
        tooltipEl.classList.remove('is-visible');
      }
    }
    if (tooltipEl && hoveredIdx >= 0) {
      tooltipEl.style.transform =
        `translate3d(${Math.max(0, Math.min(e.clientX - r.left + 14, r.width - tooltipEl.offsetWidth))}px, ${Math.max(0, e.clientY - r.top - tooltipEl.offsetHeight - 10)}px, 0)`;
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
  new IntersectionObserver(([entry]) => { isVisible = entry.isIntersecting; }).observe(canvas);

  const ringPulse = { v: 0 };

  function render() {
    requestAnimationFrame(render);
    if (!isVisible || document.hidden) return;
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

    if (todayRing && !reduced && !rotationPaused) {
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
    if (!rotationPaused) resumeTimer = setTimeout(() => (controls.autoRotate = true), ROTATION_RESUME_MS);
  });

  function paintMotionButton() {
    if (!motionButton) return;
    motionButton.hidden = false;
    motionButton.setAttribute('aria-pressed', String(rotationPaused));
    motionButton.textContent = rotationPaused ? '[ Resume rotation ]' : '[ Pause rotation ]';
  }
  if (motionButton) motionButton.addEventListener('click', () => {
    rotationPaused = !rotationPaused;
    controls.autoRotate = !rotationPaused;
    clearTimeout(resumeTimer);
    paintMotionButton();
  });
  paintMotionButton();

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
    s.updatePalette(pal);
    if (todayRing) todayRing.material.color.set(pal.accent);
    buildMonthLabels(monthDescs);
    if (!reduced) {
      for (let i = 0; i < TOTAL; i++) hs[i] = startH;
      tlEnter.restart();
    }
  }
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  resize();
  canvas.setAttribute('data-ready', '');
  const fallback = document.getElementById('gh-chart-fallback');
  if (fallback) fallback.hidden = true;
}
