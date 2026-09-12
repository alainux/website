/* ============================================================
 * gh-chart/config.js
 * Shared constants + tunables for the contribution chart.
 * ============================================================ */

/* Geometry of the isometric calendar grid. */
export const DAYS = 7;
export const WEEKS_PER_MONTH = 6;
export const MONTHS_PER_ROW = 4;
export const MONTH_ROWS = 3;
export const MONTH_COUNT = MONTHS_PER_ROW * MONTH_ROWS;

export const CELL = 1.0;
export const GAP = 0.22;
export const BAR_W = CELL - GAP * 2;
export const H_ZERO = 0.015;   // flat "base" plate for 0-commit days
export const H_BASE = 0.12;    // raised bars start this far above the tile
export const H_MAX = 3.0;
export const MONTH_GAP = 2.0;  // whole CELL multiple → day lattice aligns
export const ROW_GAP = 2.0;    // with the uniform horizon grid

export const LABEL_W = DAYS * CELL;
export const LABEL_D = LABEL_W / 5;

export const LEVELS = 4;       // contribution levels (0..4) from the API

/* Post-processing / motion tunables. */
export const USE_BLOOM = true;
export const BLOOM_STRENGTH = 0.38;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
