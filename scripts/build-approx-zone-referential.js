#!/usr/bin/env node
'use strict';

// Builds the versioned referentials of public sectors ("zones") accepted by the
// approximate-location engine (approx-zone.js).
//
// A zone is a cell of a fixed grid. It is only authorised when the official commune
// contours (geo.api.gouv.fr, INSEE communes) show land inside it. The contours are
// rasterised on a regular sample grid aligned on the cells, so land share and the
// communes present in each cell come from real polygons, never from a distance to a
// commune centre, and never from a population average.
//
//   node scripts/build-approx-zone-referential.js            # builds V2 (default)
//   node scripts/build-approx-zone-referential.js --check    # rebuild in memory, compare with the file
//   node scripts/build-approx-zone-referential.js --version 1 # V1 is frozen: always a --check
//   node scripts/build-approx-zone-referential.js --report   # also prints the geometry study
//
// Network is only needed here, at build time. Runtime stays offline.
// A published version is never rewritten: a change of cells or sectors is a new version.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const API = 'https://geo.api.gouv.fr/communes';

// Hypotheses, not imposed dimensions: they live in the versioned referential so a
// later version can change them without touching the engine.
const CONFIGS = Object.freeze({
  // V1 is published and frozen. Its output must stay byte for byte identical.
  1: Object.freeze({
    version: 1,
    output: 'approx-zone-referential.v1.js',
    kmPerDegreeLat: 111.32,
    samplesPerCell: 20,        // sample points per axis inside one level-"a" cell
    minLandPct: 3,             // a cell needs 3 % of land, unless it is a commune's best cell
    minCommuneSamples: 4,      // a commune counts in a cell from ~0.3 km² of land
    centre: 'centroid',
    coarseExtra: false,
    levels: Object.freeze({ a: { factor: 1, sizeKm: 5.5 }, b: { factor: 2, sizeKm: 11 } }),
    territories: Object.freeze({
      '971': { name: 'Guadeloupe', origin: [15.80, -61.90], refLat: 16.2, levels: ['a', 'b'] },
      '972': { name: 'Martinique', origin: [14.35, -61.30], refLat: 14.65, levels: ['a', 'b'] },
      // Guyane is vast and mostly empty: 5.5 km cells would be an artificial precision.
      '973': { name: 'Guyane', origin: [2.05, -54.70], refLat: 4.0, levels: ['b'] },
      '974': { name: 'La Réunion', origin: [-21.45, 55.15], refLat: -21.1, levels: ['a', 'b'] }
    }),
    unsupported: { '976': 'NO_REFERENTIAL', '977': 'NO_REFERENTIAL', '978': 'NO_COMMUNE_DATA' },
    header: `// GENERATED FILE — do not edit by hand.
// Public sectors ("zones") authorised for approximate mission locations.
// Built from official commune contours: node scripts/build-approx-zone-referential.js
// Cell key "ix.iy" -> [landPct, centreLat, centreLng, [[communeInseeCode, landSharePct], ...]]
// The centre is the land centroid of the cell: it describes the sector, never a member.
`
  }),
  // V2: standard sector of about 2 km radius (2.8 km cells, 1.98 km from centre to corner).
  2: Object.freeze({
    version: 2,
    output: 'approx-zone-referential.v2.js',
    kmPerDegreeLat: 111.32,
    samplesPerCell: 20,        // 0.14 km between two samples
    // A fine sector must be mostly land: a coastal sliver is offered through its wider
    // parent instead. Pure geometry, no population estimate.
    minLandPct: { a: 10, b: 3 },
    minCommuneSamples: 16,     // ~0.3 km² of land at 0.14 km sampling
    centre: 'nearest-land',    // the land sample closest to the middle of the cell
    coarseExtra: true,         // wider sectors also exist where no fine one is offered
    levels: Object.freeze({ a: { factor: 1, sizeKm: 2.8 }, b: { factor: 2, sizeKm: 5.6 } }),
    territories: Object.freeze({
      '971': { name: 'Guadeloupe', origin: [15.80, -61.90], refLat: 16.2, levels: ['a', 'b'] },
      '972': { name: 'Martinique', origin: [14.35, -61.30], refLat: 14.65, levels: ['a', 'b'] },
      '974': { name: 'La Réunion', origin: [-21.45, 55.15], refLat: -21.1, levels: ['a', 'b'] }
    }),
    // Guyane and Saint-Martin keep today's commune-level location until a granularity
    // adapted to them is validated.
    unsupported: {
      '973': 'GRANULARITY_NOT_VALIDATED', '976': 'NO_REFERENTIAL', '977': 'NO_REFERENTIAL', '978': 'NO_COMMUNE_DATA'
    },
    header: `// GENERATED FILE — do not edit by hand.
// Public sectors ("zones") authorised for approximate mission locations, version 2.
// Built from official commune contours: node scripts/build-approx-zone-referential.js
// Cell key "ix.iy" -> [landPct, centreLat, centreLng, [[communeInseeCode, landSharePct], ...]]
// Level "a" is the standard sector (~2 km radius), level "b" the wider one (2 x 2 cells).
// The centre is the land point closest to the middle of the cell: it describes the
// sector, never a member.
`
  })
});

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

const round = (value, digits) => Number(value.toFixed(digits));
const minLandFor = (config, levelId) => (typeof config.minLandPct === 'number' ? config.minLandPct : config.minLandPct[levelId]);

function gridFor(territory, config) {
  const size = config.levels.a.sizeKm;
  const stepLat = round(size / config.kmPerDegreeLat, 6);
  const stepLng = round(size / (config.kmPerDegreeLat * Math.cos(territory.refLat * Math.PI / 180)), 6);
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

const cellOrder = (x, y) => {
  const [ax, ay] = x.split('.').map(Number);
  const [bx, by] = y.split('.').map(Number);
  return ay - by || ax - bx;
};

// Pure: official communes in, territory entry out. No clock, no randomness, no network.
function buildTerritoryEntry(communes, territory, config) {
  const grid = gridFor(territory, config);
  const n = config.samplesPerCell;
  const keepSamples = config.centre === 'nearest-land';
  const counters = { outOfGrid: 0 };
  const cells = new Map();
  const communeTotals = new Map();
  for (const commune of communes) {
    for (const rings of polygonsOf(commune.contour)) {
      fillPolygon(rings, grid, territory.origin, n, (cx, cy, lat, lng) => {
        const key = `${cx}.${cy}`;
        let cell = cells.get(key);
        if (!cell) {
          cell = { cx, cy, total: 0, latSum: 0, lngSum: 0, byCommune: new Map(), samples: keepSamples ? [] : null };
          cells.set(key, cell);
        }
        cell.total += 1;
        cell.latSum += lat;
        cell.lngSum += lng;
        if (keepSamples) cell.samples.push([lat, lng]);
        cell.byCommune.set(commune.code, (cell.byCommune.get(commune.code) || 0) + 1);
        communeTotals.set(commune.code, (communeTotals.get(commune.code) || 0) + 1);
      }, counters);
    }
  }
  if (counters.outOfGrid) throw new Error(`${territory.name}: ${counters.outOfGrid} land samples fall outside the grid origin; widen the origin.`);
  if (communeTotals.size !== communes.length) {
    const missing = communes.filter((c) => !communeTotals.has(c.code)).map((c) => c.nom);
    throw new Error(`${territory.name}: communes without any land sample: ${missing.join(', ')}`);
  }

  const levels = {};
  const study = {};
  // Levels run finest first.
  let finerKeys = null;
  let finerFactor = 1;
  for (const levelId of territory.levels) {
    const level = config.levels[levelId];
    const f = level.factor;
    const dLat = round(grid.stepLat * f, 6);
    const dLng = round(grid.stepLng * f, 6);
    const agg = new Map();
    for (const cell of cells.values()) {
      const cx = Math.floor(cell.cx / f);
      const cy = Math.floor(cell.cy / f);
      const key = `${cx}.${cy}`;
      let a = agg.get(key);
      if (!a) { a = { cx, cy, total: 0, latSum: 0, lngSum: 0, byCommune: new Map(), samples: keepSamples ? [] : null }; agg.set(key, a); }
      a.total += cell.total;
      a.latSum += cell.latSum;
      a.lngSum += cell.lngSum;
      if (keepSamples) for (const s of cell.samples) a.samples.push(s);
      for (const [c, count] of cell.byCommune) a.byCommune.set(c, (a.byCommune.get(c) || 0) + count);
    }
    const perCell = n * n * f * f;
    const landPctOf = (a) => Math.round(100 * a.total / perCell);
    const bestAmong = (keys) => {
      const best = new Map();
      for (const key of keys) {
        for (const [c, count] of agg.get(key).byCommune) {
          const current = best.get(c);
          if (!current || count > current.count || (count === current.count && cellOrder(key, current.key) < 0)) best.set(c, { key, count });
        }
      }
      return best;
    };
    // Candidate cells. A coarser level of the same territory contains the parents of the
    // finer level's cells, so a fine sector can always roll up to a published coarse one.
    // A fine level needs real land, and each commune keeps its best cell so that every
    // commune stays reachable.
    let candidates;
    if (finerKeys) {
      const ratio = f / finerFactor;
      candidates = new Set([...finerKeys].map((key) => {
        const [cx, cy] = key.split('.').map(Number);
        return `${Math.floor(cx / ratio)}.${Math.floor(cy / ratio)}`;
      }));
      if (config.coarseExtra) {
        for (const [key, a] of agg) if (landPctOf(a) >= minLandFor(config, levelId)) candidates.add(key);
      }
    } else {
      candidates = new Set([...agg.keys()].filter((key) => landPctOf(agg.get(key)) >= minLandFor(config, levelId)));
      for (const b of bestAmong(agg.keys()).values()) candidates.add(b.key);
    }
    const best = bestAmong(candidates);
    const out = {};
    const landPcts = [];
    let communeSum = 0;
    for (const key of [...candidates].sort(cellOrder)) {
      const a = agg.get(key);
      const landPct = Math.min(100, landPctOf(a));
      const present = [...a.byCommune.entries()]
        .filter(([c, count]) => count >= config.minCommuneSamples || (best.get(c) && best.get(c).key === key))
        .map(([c, count]) => [c, Math.max(1, Math.round(100 * count / a.total))])
        .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
      let lat;
      let lng;
      if (config.centre === 'nearest-land') {
        // The land sample closest to the middle of the cell: the marker sits on land, as
        // central as the coastline allows, and the choice is fully deterministic.
        const [lat0, lng0] = territory.origin;
        const midLat = lat0 + (a.cy + 0.5) * dLat;
        const midLng = lng0 + (a.cx + 0.5) * dLng;
        const scale = Math.cos(territory.refLat * Math.PI / 180);
        let pick = null;
        for (const sample of a.samples) {
          const d = (sample[0] - midLat) ** 2 + ((sample[1] - midLng) * scale) ** 2;
          if (!pick || d < pick.d - 1e-15 || (Math.abs(d - pick.d) <= 1e-15 && (sample[0] < pick.s[0] || (sample[0] === pick.s[0] && sample[1] < pick.s[1])))) pick = { d, s: sample };
        }
        lat = round(pick.s[0], 3);
        lng = round(pick.s[1], 3);
      } else {
        lat = round(a.latSum / a.total, 3);
        lng = round(a.lngSum / a.total, 3);
      }
      out[key] = [Math.max(1, landPct), lat, lng, present];
      communeSum += present.length;
      landPcts.push(landPct);
    }
    levels[levelId] = { sizeKm: level.sizeKm, dLat, dLng, cells: out };
    landPcts.sort((x, y) => x - y);
    study[levelId] = {
      cells: landPcts.length,
      communesPerCellAvg: Number((communeSum / landPcts.length).toFixed(2)),
      landPct: { min: landPcts[0], median: landPcts[Math.floor(landPcts.length / 2)] },
      cellsUnder10PctLand: landPcts.filter((p) => p < 10).length
    };
    finerKeys = new Set(Object.keys(out));
    finerFactor = f;
  }
  const names = {};
  communes.forEach((c) => { names[c.code] = c.nom; });
  const sortedNames = Object.fromEntries(Object.entries(names).sort(([x], [y]) => x.localeCompare(y)));
  return { entry: { name: territory.name, origin: territory.origin, refLat: territory.refLat, communes: sortedNames, levels }, study };
}

function buildReferentialData(communesByCode, config) {
  const territories = {};
  const study = {};
  for (const [code, territory] of Object.entries(config.territories)) {
    const built = buildTerritoryEntry(communesByCode[code], territory, config);
    territories[code] = built.entry;
    study[code] = built.study;
  }
  const meta = {
    source: 'geo.api.gouv.fr communes (contour), INSEE codes',
    generatedBy: 'scripts/build-approx-zone-referential.js',
    unsupported: config.unsupported,
    params: {
      kmPerDegreeLat: config.kmPerDegreeLat, samplesPerCell: config.samplesPerCell,
      minLandPct: config.minLandPct, minCommuneSamples: config.minCommuneSamples
    }
  };
  const body = { version: config.version, meta, territories };
  const integrity = { algorithm: 'sha256', value: crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex') };
  return { data: { ...body, integrity }, study };
}

// Objects are indented, arrays stay on one line: one cell per line keeps diffs readable.
function pretty(value, depth = 0) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value);
  const pad = '    '.repeat(depth + 1);
  const entries = Object.entries(value).map(([key, v]) => `${pad}${JSON.stringify(key)}: ${pretty(v, depth + 1)}`);
  return entries.length ? `{\n${entries.join(',\n')}\n${'    '.repeat(depth)}}` : '{}';
}

function render(data, config) {
  return `${config.header}(function (root) {
    'use strict';
    const data = ${pretty(data, 1)};
    if (typeof module !== 'undefined' && module.exports) module.exports = data;
    else root.LYANN_APPROX_ZONE_REFERENTIALS = Object.assign(root.LYANN_APPROX_ZONE_REFERENTIALS || {}, { [data.version]: data });
})(typeof window !== 'undefined' ? window : globalThis);
`;
}

async function main() {
  const args = process.argv.slice(2);
  const versionArg = args.indexOf('--version');
  const version = versionArg === -1 ? 2 : Number(args[versionArg + 1]);
  const config = CONFIGS[version];
  if (!config) throw new Error(`Unknown referential version: ${version}`);
  // A published version is never rewritten.
  const checkOnly = args.includes('--check') || version === 1;
  const communesByCode = {};
  for (const code of Object.keys(config.territories)) {
    communesByCode[code] = await fetchJson(`${API}?codeDepartement=${code}&fields=nom,code,contour&format=json&geometry=contour`);
  }
  const { data, study } = buildReferentialData(communesByCode, config);
  const output = render(data, config);
  const target = path.join(ROOT, config.output);
  if (checkOnly) {
    const identical = fs.existsSync(target) && fs.readFileSync(target, 'utf8') === output;
    console.log(`${config.output}: ${identical ? 'identical to the rebuilt referential' : 'DIFFERENT from the rebuilt referential'} (sha256 ${data.integrity.value.slice(0, 12)}…)`);
    if (!identical) process.exitCode = 1;
  } else {
    fs.writeFileSync(target, output, 'utf8');
    console.log(`${config.output} written (${Buffer.byteLength(output)} bytes, sha256 ${data.integrity.value.slice(0, 12)}…)`);
  }
  if (args.includes('--report')) console.log(JSON.stringify(study));
}

if (require.main === module) main().catch((error) => { console.error(error); process.exit(1); });

module.exports = { CONFIGS, buildTerritoryEntry, buildReferentialData, render, polygonsOf };
