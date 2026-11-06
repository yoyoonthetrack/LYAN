#!/usr/bin/env node
'use strict';

// Builds approx-zone-referential.v1.js: the closed list of public sectors ("zones")
// that the approximate-location engine accepts.
//
// A zone is a cell of a fixed grid. It is only authorised when the official commune
// contours (geo.api.gouv.fr, INSEE communes) show land inside it. The contours are
// rasterised on a regular sample grid aligned on the cells, so land share and the
// communes present in each cell come from real polygons, never from a distance to a
// commune centre.
//
//   node scripts/build-approx-zone-referential.js          # writes the referential
//   node scripts/build-approx-zone-referential.js --report # also prints the granularity study
//
// Network is only needed here, at build time. Runtime stays offline.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'approx-zone-referential.v1.js');
const API = 'https://geo.api.gouv.fr/communes';

// Hypotheses, not imposed dimensions: they live in the versioned referential so a
// later version can change them without touching the engine.
const CONFIG = Object.freeze({
  version: 1,
  kmPerDegreeLat: 111.32,
  samplesPerCell: 20,        // sample points per axis inside one level-"a" cell
  minLandPct: 3,             // a cell needs 3 % of land, unless it is a commune's best cell
  minCommuneSamples: 4,      // a commune counts in a cell from ~0.3 km² of land
  levels: Object.freeze({ a: { factor: 1, sizeKm: 5.5 }, b: { factor: 2, sizeKm: 11 } }),
  territories: Object.freeze({
    '971': { name: 'Guadeloupe', origin: [15.80, -61.90], refLat: 16.2, levels: ['a', 'b'] },
    '972': { name: 'Martinique', origin: [14.35, -61.30], refLat: 14.65, levels: ['a', 'b'] },
    // Guyane is vast and mostly empty: 5.5 km cells would be an artificial precision.
    '973': { name: 'Guyane', origin: [2.05, -54.70], refLat: 4.0, levels: ['b'] },
    '974': { name: 'La Réunion', origin: [-21.45, 55.15], refLat: -21.1, levels: ['a', 'b'] }
  })
});

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

const round = (value, digits) => Number(value.toFixed(digits));

function gridFor(territory) {
  const stepLat = round(CONFIG.levels.a.sizeKm / CONFIG.kmPerDegreeLat, 6);
  const stepLng = round(CONFIG.levels.a.sizeKm / (CONFIG.kmPerDegreeLat * Math.cos(territory.refLat * Math.PI / 180)), 6);
  return { stepLat, stepLng };
}

// Even-odd scanline fill of one polygon (outer ring + holes) on the sample grid.
function fillPolygon(rings, grid, origin, n, onSample, counters) {
  const [lat0, lng0] = origin;
  const sLat = grid.stepLat / n;
  const sLng = grid.stepLng / n;
  const rows = new Map();
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i += 1) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      if (y1 === y2) continue;
      const yMin = Math.min(y1, y2);
      const yMax = Math.max(y1, y2);
      const jStart = Math.ceil((yMin - lat0) / sLat - 0.5);
      const jEnd = Math.ceil((yMax - lat0) / sLat - 0.5) - 1;
      for (let j = jStart; j <= jEnd; j += 1) {
        const y = lat0 + (j + 0.5) * sLat;
        const x = x1 + (y - y1) * (x2 - x1) / (y2 - y1);
        if (!rows.has(j)) rows.set(j, []);
        rows.get(j).push(x);
      }
    }
  }
  for (const [j, xs] of rows) {
    xs.sort((a, b) => a - b);
    for (let p = 0; p + 1 < xs.length; p += 2) {
      const kStart = Math.ceil((xs[p] - lng0) / sLng - 0.5);
      const kEnd = Math.ceil((xs[p + 1] - lng0) / sLng - 0.5) - 1;
      for (let k = kStart; k <= kEnd; k += 1) {
        if (j < 0 || k < 0) { counters.outOfGrid += 1; continue; }
        onSample(Math.floor(k / n), Math.floor(j / n), lat0 + (j + 0.5) * sLat, lng0 + (k + 0.5) * sLng);
      }
    }
  }
}

function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

async function buildTerritory(code, territory) {
  const communes = await fetchJson(`${API}?codeDepartement=${code}&fields=nom,code,population,contour&format=json&geometry=contour`);
  const grid = gridFor(territory);
  const n = CONFIG.samplesPerCell;
  const counters = { outOfGrid: 0 };
  // L1 accumulators: cellKey -> { total, latSum, lngSum, byCommune: Map }
  const cells = new Map();
  const communeTotals = new Map();
  for (const commune of communes) {
    for (const rings of polygonsOf(commune.contour)) {
      fillPolygon(rings, grid, territory.origin, n, (cx, cy, lat, lng) => {
        const key = `${cx}.${cy}`;
        let cell = cells.get(key);
        if (!cell) { cell = { cx, cy, total: 0, latSum: 0, lngSum: 0, byCommune: new Map() }; cells.set(key, cell); }
        cell.total += 1;
        cell.latSum += lat;
        cell.lngSum += lng;
        cell.byCommune.set(commune.code, (cell.byCommune.get(commune.code) || 0) + 1);
        communeTotals.set(commune.code, (communeTotals.get(commune.code) || 0) + 1);
      }, counters);
    }
  }
  if (counters.outOfGrid) throw new Error(`${code}: ${counters.outOfGrid} land samples fall outside the grid origin; widen the origin.`);
  if (communeTotals.size !== communes.length) {
    const missing = communes.filter((c) => !communeTotals.has(c.code)).map((c) => c.nom);
    throw new Error(`${code}: communes without any land sample: ${missing.join(', ')}`);
  }

  const levels = {};
  const study = {};
  // Levels run finest first; Guyane only has the coarse one.
  let finerKeys = null;
  let finerFactor = 1;
  for (const levelId of territory.levels) {
    const level = CONFIG.levels[levelId];
    const f = level.factor;
    // Aggregate L1 cells into level cells.
    const agg = new Map();
    for (const cell of cells.values()) {
      const cx = Math.floor(cell.cx / f);
      const cy = Math.floor(cell.cy / f);
      const key = `${cx}.${cy}`;
      let a = agg.get(key);
      if (!a) { a = { cx, cy, total: 0, latSum: 0, lngSum: 0, byCommune: new Map() }; agg.set(key, a); }
      a.total += cell.total;
      a.latSum += cell.latSum;
      a.lngSum += cell.lngSum;
      for (const [c, count] of cell.byCommune) a.byCommune.set(c, (a.byCommune.get(c) || 0) + count);
    }
    const perCell = n * n * f * f;
    const bestAmong = (keys) => {
      const best = new Map();
      for (const key of keys) {
        for (const [c, count] of agg.get(key).byCommune) {
          const current = best.get(c);
          if (!current || count > current.count || (count === current.count && key < current.key)) best.set(c, { key, count });
        }
      }
      return best;
    };
    // Candidate cells. A coarser level of the same territory is exactly the parents of the
    // finer level's cells, so a fine sector can always roll up to a published coarse one.
    // Otherwise a cell needs real land, and each commune keeps its best cell so that every
    // commune stays reachable.
    let candidates;
    if (finerKeys) {
      const ratio = f / finerFactor;
      candidates = new Set([...finerKeys].map((key) => {
        const [cx, cy] = key.split('.').map(Number);
        return `${Math.floor(cx / ratio)}.${Math.floor(cy / ratio)}`;
      }));
    } else {
      const all = bestAmong(agg.keys());
      candidates = new Set([...agg.keys()].filter((key) => Math.round(100 * agg.get(key).total / perCell) >= CONFIG.minLandPct));
      for (const b of all.values()) candidates.add(b.key);
    }
    const best = bestAmong(candidates);
    const bestKeys = new Set([...best.values()].map((b) => b.key));
    const out = {};
    const populations = [];
    let communeSum = 0;
    for (const key of [...candidates].sort((x, y) => {
      const [ax, ay] = x.split('.').map(Number);
      const [bx, by] = y.split('.').map(Number);
      return ay - by || ax - bx;
    })) {
      const a = agg.get(key);
      const landPct = Math.min(100, Math.round(100 * a.total / perCell));
      const present = [...a.byCommune.entries()]
        .filter(([c, count]) => count >= CONFIG.minCommuneSamples || (best.get(c) && best.get(c).key === key))
        .map(([c, count]) => [c, Math.max(1, Math.round(100 * count / a.total))])
        .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
      out[key] = [Math.max(1, landPct), round(a.latSum / a.total, 3), round(a.lngSum / a.total, 3), present];
      communeSum += present.length;
      let pop = 0;
      for (const [c, count] of a.byCommune) {
        const commune = communes.find((x) => x.code === c);
        pop += (commune.population || 0) * count / communeTotals.get(c);
      }
      populations.push(Math.round(pop));
    }
    levels[levelId] = {
      sizeKm: level.sizeKm,
      dLat: round(grid.stepLat * f, 6),
      dLng: round(grid.stepLng * f, 6),
      cells: out
    };
    populations.sort((x, y) => x - y);
    const pick = (q) => populations[Math.min(populations.length - 1, Math.floor(q * populations.length))];
    study[levelId] = {
      cells: populations.length,
      communesPerCellAvg: Number((communeSum / populations.length).toFixed(2)),
      estPopulation: { p10: pick(0.1), p25: pick(0.25), median: pick(0.5), p90: pick(0.9) },
      cellsUnder100: populations.filter((p) => p < 100).length,
      cellsUnder500: populations.filter((p) => p < 500).length,
      bestCellOnly: [...bestKeys].filter((k) => !(Number(out[k]?.[0]) >= CONFIG.minLandPct)).length
    };
    finerKeys = new Set(Object.keys(out));
    finerFactor = f;
  }
  const names = {};
  communes.forEach((c) => { names[c.code] = c.nom; });
  const sortedNames = Object.fromEntries(Object.entries(names).sort(([x], [y]) => x.localeCompare(y)));
  return {
    entry: {
      name: territory.name,
      origin: territory.origin,
      refLat: territory.refLat,
      communes: sortedNames,
      levels
    },
    study
  };
}

(async () => {
  const territories = {};
  const study = {};
  for (const [code, territory] of Object.entries(CONFIG.territories)) {
    const built = await buildTerritory(code, territory);
    territories[code] = built.entry;
    study[code] = built.study;
  }
  const meta = {
    source: 'geo.api.gouv.fr communes (contour), INSEE codes',
    generatedBy: 'scripts/build-approx-zone-referential.js',
    unsupported: { '976': 'NO_REFERENTIAL', '977': 'NO_REFERENTIAL', '978': 'NO_COMMUNE_DATA' },
    params: {
      kmPerDegreeLat: CONFIG.kmPerDegreeLat, samplesPerCell: CONFIG.samplesPerCell,
      minLandPct: CONFIG.minLandPct, minCommuneSamples: CONFIG.minCommuneSamples
    }
  };
  const body = { version: CONFIG.version, meta, territories };
  const integrity = { algorithm: 'sha256', value: crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex') };
  const data = { ...body, integrity };

  // Objects are indented, arrays stay on one line: one cell per line keeps diffs readable.
  const pretty = (value, depth = 0) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value);
    const pad = '    '.repeat(depth + 1);
    const entries = Object.entries(value).map(([key, v]) => `${pad}${JSON.stringify(key)}: ${pretty(v, depth + 1)}`);
    return entries.length ? `{\n${entries.join(',\n')}\n${'    '.repeat(depth)}}` : '{}';
  };
  const lines = pretty(data, 1);
  const output = `// GENERATED FILE — do not edit by hand.
// Public sectors ("zones") authorised for approximate mission locations.
// Built from official commune contours: node scripts/build-approx-zone-referential.js
// Cell key "ix.iy" -> [landPct, centreLat, centreLng, [[communeInseeCode, landSharePct], ...]]
// The centre is the land centroid of the cell: it describes the sector, never a member.
(function (root) {
    'use strict';
    const data = ${lines};
    if (typeof module !== 'undefined' && module.exports) module.exports = data;
    else root.LYANN_APPROX_ZONE_REFERENTIALS = Object.assign(root.LYANN_APPROX_ZONE_REFERENTIALS || {}, { [data.version]: data });
})(typeof window !== 'undefined' ? window : globalThis);
`;
  fs.writeFileSync(OUTPUT, output, 'utf8');
  const bytes = Buffer.byteLength(output);
  console.log(`approx-zone-referential.v1.js written (${bytes} bytes, sha256 ${integrity.value.slice(0, 12)}…)`);
  if (process.argv.includes('--report')) console.log(JSON.stringify(study, null, 1));
})().catch((error) => { console.error(error); process.exit(1); });
