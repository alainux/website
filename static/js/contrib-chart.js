/* ============================================================
 * contrib-chart.js
 * Entry point for the homepage GitHub contribution chart.
 * The implementation is split into focused ES modules under
 * ./gh-chart/ (config, data, theme, scene, chart). This file
 * only kicks off the orchestrator once the DOM is ready.
 * ============================================================ */

import { initContribChart } from './gh-chart/chart.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initContribChart, { once: true });
} else {
  initContribChart();
}
