/* ============================================================
 * gh-chart/scene.js
 * Owns the Three.js scene graph: renderer, camera, lights, floor
 * grids, instanced bars + their Tron edges, the "today" marker,
 * and the month labels. Exposes the handles the chart orchestrator
 * needs (mesh, materials, rebuild helpers, camera fit, resize).
 * ============================================================ */

import * as THREE from 'https://esm.sh/three@0.169.0';
import { OrbitControls } from 'https://esm.sh/three@0.169.0/examples/jsm/controls/OrbitControls.js';
import {
  CELL, BAR_W, LABEL_W, LABEL_D, MONTHS_PER_ROW, MONTH_ROWS, ROW_GAP, MONTH_GAP,
  WEEKS_PER_MONTH, DAYS,
} from './config.js';

/* Re-export the few geometry sizes the orchestrator needs for camera
   framing (kept here so config.js stays free of cross-references). */
function gridExtent(cells) {
  const xs = cells.map((c) => c.x);
  const zs = cells.map((c) => c.z);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minZ: Math.min(...zs), maxZ: Math.max(...zs),
  };
}

export function createScene(canvas, pal, cells) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NoToneMapping;          // keep bg hex == DOM bg
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(pal.bg);
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

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.6);
  keyLight.position.set(6, 12, 4);
  scene.add(keyLight);

  /* ── Floor grids ── */
  const extent = gridExtent(cells);
  const span = Math.max(extent.maxX - extent.minX, extent.maxZ - extent.minZ);

  function buildHorizonGrid() {
    const size = span * 4 + 40 * CELL;
    const divs = Math.round(size / CELL);
    const g = new THREE.GridHelper(size, divs, pal.gridMain, pal.gridMain);
    g.material.opacity = 0.12;
    g.material.transparent = true;
    g.material.depthWrite = false;
    g.position.set(CELL / 2, 0.002, CELL / 2);
    return g;
  }
  let horizonGrid = buildHorizonGrid();
  scene.add(horizonGrid);

  const tileSrc = (() => {
    const s = CELL / 2;
    return new Float32Array([-s, 0, -s, s, 0, -s, s, 0, s, -s, 0, s, -s, 0, s, -s, 0, -s]);
  })();
  const TOTAL = cells.length;
  const tileArr = new Float32Array(TOTAL * tileSrc.length);
  const tileGeo = new THREE.BufferGeometry();
  tileGeo.setAttribute('position', new THREE.BufferAttribute(tileArr, 3));
  const tileMat = new THREE.LineBasicMaterial({ color: pal.gridMain, transparent: true, opacity: 0.32 });
  const floorTiles = new THREE.LineSegments(tileGeo, tileMat);
  floorTiles.position.y = 0.002;
  floorTiles.frustumCulled = false;
  floorTiles.renderOrder = 1;
  scene.add(floorTiles);

  for (let i = 0; i < TOTAL; i++) {
    const c = cells[i];
    const off = i * tileSrc.length;
    if (!c.valid) { tileArr.fill(0, off, off + tileSrc.length); continue; }
    for (let k = 0; k < tileSrc.length; k += 3) {
      tileArr[off + k] = c.x + tileSrc[k];
      tileArr[off + k + 1] = tileSrc[k + 1];
      tileArr[off + k + 2] = c.z + tileSrc[k + 2];
    }
  }
  tileGeo.attributes.position.needsUpdate = true;

  /* ── Bars (instanced) + Tron edge contour ── */
  const barGeo = new THREE.BoxGeometry(BAR_W, 1, BAR_W);
  barGeo.translate(0, 0.5, 0);
  const barMat = new THREE.MeshStandardMaterial({
    metalness: 0.2, roughness: 0.35, emissive: new THREE.Color(pal.wire), emissiveIntensity: pal.emissiveI,
  });
  const mesh = new THREE.InstancedMesh(barGeo, barMat, TOTAL);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL * 3), 3);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const edgeSrc = new THREE.EdgesGeometry(barGeo).attributes.position.array;
  const currentH = new Float32Array(TOTAL).fill(0.0001);
  const edgeArr = new Float32Array(TOTAL * edgeSrc.length);
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgeArr, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: pal.wire, transparent: true, opacity: 0.6 });
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
        edgeArr[off + k] = c.x + edgeSrc[k];
        edgeArr[off + k + 1] = edgeSrc[k + 1] * h;
        edgeArr[off + k + 2] = c.z + edgeSrc[k + 2];
      }
    }
    edgeGeo.attributes.position.needsUpdate = true;
  }

  /* ── Today marker ── */
  const todayCell = cells.find((c) => c.isToday);
  let todayRing = null;
  if (todayCell) {
    const ringGeo = new THREE.TorusGeometry(BAR_W * 0.85, 0.05, 12, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: pal.accent, transparent: true, opacity: 0.9, depthWrite: false });
    todayRing = new THREE.Mesh(ringGeo, ringMat);
    todayRing.rotation.x = Math.PI / 2;
    todayRing.position.set(todayCell.x, Math.max(todayCell.targetH, 0.12) + 0.08, todayCell.z);
    todayRing.renderOrder = 5;
    scene.add(todayRing);
  }

  const dummy = new THREE.Object3D();

  function writeInstance(i, h) {
    const c = cells[i];
    dummy.position.set(c.x, 0, c.z);
    dummy.scale.set(c.valid ? 1 : 0, h, c.valid ? 1 : 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  /* ── Month labels ── */
  const monthsGroup = new THREE.Group();
  scene.add(monthsGroup);
  const labelGeo = new THREE.PlaneGeometry(LABEL_W, LABEL_D);

  function monthTexture(name) {
    const c = document.createElement('canvas');
    c.width = 384; c.height = 72;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = pal.labelText.getStyle();
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

  function disposeGroup(group) {
    group.clear();
    for (const child of group.children) {
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    }
  }

  /* monthOffset mirrors data.js; recomputed here from the same constants. */
  function monthOffset(rowInGrid, colInGrid) {
    const MONTH_BLOCK_W = DAYS * CELL;
    const MONTH_BLOCK_D = WEEKS_PER_MONTH * CELL;
    return {
      x: (colInGrid - (MONTHS_PER_ROW - 1) / 2) * (MONTH_BLOCK_W + MONTH_GAP),
      z: (rowInGrid - (MONTH_ROWS - 1) / 2) * (MONTH_BLOCK_D + ROW_GAP),
    };
  }

  function buildMonthLabels(monthDescs) {
    disposeGroup(monthsGroup);
    for (const m of monthDescs) {
      const origin = monthOffset(m.rowInGrid, m.colInGrid);
      const tex = monthTexture(m.shortLabel);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const plane = new THREE.Mesh(labelGeo, mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(origin.x, 0.02, origin.z - (WEEKS_PER_MONTH * CELL) / 2 - LABEL_D / 2 - 0.05);
      plane.renderOrder = 4;
      monthsGroup.add(plane);
    }
  }

  return {
    THREE, renderer, scene, camera, controls,
    mesh, barMat, lineMat, tileMat, edges, rebuildEdges, writeInstance,
    currentH, todayRing, monthsGroup, buildMonthLabels, horizonGrid, buildHorizonGrid,
    extent, TOTAL,
  };
}
