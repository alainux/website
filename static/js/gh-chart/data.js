/* ============================================================
 * gh-chart/data.js
 * Normalises the raw GitHub contribution payload into the flat
 * list of day "cells" the renderer draws, plus the count range
 * used for colour mapping.
 * ============================================================ */

import {
  DAYS, WEEKS_PER_MONTH, MONTHS_PER_ROW, MONTH_ROWS, MONTH_COUNT,
  CELL, MONTH_GAP, ROW_GAP, H_ZERO, H_BASE, H_MAX, MONTHS, LEVELS,
} from './config.js';

function levelToHeight(l) {
  return l <= 0 ? H_ZERO : H_BASE + (l / LEVELS) * (H_MAX - H_BASE);
}

function weekdayMON(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return (d.getUTCDay() + 6) % 7; // Monday = 0
}

function monthFirstWeekdayMON(dateStr) {
  const ym = dateStr.slice(0, 7);
  return weekdayMON(ym + '-01');
}

function shiftMonth(key, delta) {
  const y = parseInt(key.slice(0, 4), 10);
  const m = parseInt(key.slice(5, 7), 10);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

function findTodayStr(flatDays) {
  for (let i = flatDays.length - 1; i >= 0; i--) {
    if (flatDays[i] && flatDays[i].date) return flatDays[i].date;
  }
  return new Date().toISOString().slice(0, 10);
}

/* Build the month descriptors covering the MONTH_COUNT months ending
   with the month containing "today". */
function buildMonthDescs(todayMonthKey) {
  const usedMonthKeys = [];
  for (let i = MONTH_COUNT - 1; i >= 0; i--) usedMonthKeys.push(shiftMonth(todayMonthKey, -i));
  usedMonthKeys.sort();

  return usedMonthKeys.map((key, idx) => {
    const month = parseInt(key.slice(5, 7), 10);
    return {
      key,
      idx,
      label: MONTHS[month - 1] + ' ' + key.slice(0, 4),
      shortLabel: MONTHS[month - 1],
      leadingDow: monthFirstWeekdayMON(key),
      rowInGrid: Math.floor(idx / MONTHS_PER_ROW),
      colInGrid: idx % MONTHS_PER_ROW,
    };
  });
}

/* Turn the raw { weeks: [[{date,count,level}...]] } payload into:
   - cells:  one entry per possible day slot across every month block
   - minCount / maxCount: normalisation range for the colour ramp
   Both return values are consumed by the renderer. */
export function buildCells(raw) {
  const flatDays = raw.weeks.flatMap((w) => w);
  const TODAY_STR = findTodayStr(flatDays);

  let minCount = Infinity;
  let maxCount = 0;
  for (const d of flatDays) {
    if (!d || !d.date || !d.count) continue;
    if (d.count < minCount) minCount = d.count;
    if (d.count > maxCount) maxCount = d.count;
  }
  if (!isFinite(minCount)) minCount = 0;

  const monthMap = new Map();
  for (const day of flatDays) {
    if (!day || !day.date) continue;
    const k = day.date.slice(0, 7);
    if (!monthMap.has(k)) monthMap.set(k, []);
    monthMap.get(k).push(day);
  }

  const monthDescs = buildMonthDescs(TODAY_STR.slice(0, 7)).map((m) => ({
    ...m,
    days: monthMap.get(m.key) || [],
  }));

  const MONTH_BLOCK_W = DAYS * CELL;
  const MONTH_BLOCK_D = WEEKS_PER_MONTH * CELL;

  const monthOffset = (rowInGrid, colInGrid) => ({
    x: (colInGrid - (MONTHS_PER_ROW - 1) / 2) * (MONTH_BLOCK_W + MONTH_GAP),
    z: (rowInGrid - (MONTH_ROWS - 1) / 2) * (MONTH_BLOCK_D + ROW_GAP),
  });

  const cells = [];
  for (const m of monthDescs) {
    const origin = monthOffset(m.rowInGrid, m.colInGrid);
    const dayMap = new Map();
    const days = m.days || [];
    for (const d of days) dayMap.set(d.date, d);

    const year = parseInt(m.key.slice(0, 4), 10);
    const mon = parseInt(m.key.slice(5, 7), 10);
    const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();

    for (let dow = 0; dow < DAYS; dow++) {
      for (let w = 0; w < WEEKS_PER_MONTH; w++) {
        const dayOfMonth = w * DAYS + dow - m.leadingDow + 1;
        const xLocal = (dow - (DAYS - 1) / 2) * CELL;
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
          monthIdx: m.idx,
          isToday,
          valid: date !== '',
          targetH: levelToHeight(level),
        });
      }
    }
  }

  return { cells, minCount, maxCount, monthDescs };
}
