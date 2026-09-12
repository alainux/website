/* Keep the activity summary usable when WebGL or the CDN is unavailable. */
async function startContribChart() {
  try {
    const { initContribChart } = await import('./gh-chart/chart.js');
    initContribChart();
  } catch (error) {
    console.warn('The interactive contribution chart is unavailable.', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startContribChart, { once: true });
} else {
  startContribChart();
}
