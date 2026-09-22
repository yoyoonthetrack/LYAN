#!/usr/bin/env node
'use strict';

// Generates commune-geo.js from the authoritative French government geo API.
// Coordinates are never hand-written: run this script and commit its output so the
// runtime stays offline on Web and Capacitor.
//
//   node scripts/build-commune-geo.js

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const API = 'https://geo.api.gouv.fr/communes';

// INSEE region codes disambiguate metropolitan names that also exist overseas,
// such as Saint-Denis in Île-de-France and on La Réunion.
const REGION_CODES = {
  'Île-de-France': '11',
  'Auvergne-Rhône-Alpes': '84',
  'Provence-Alpes-Côte d\'Azur': '93',
  'Nouvelle-Aquitaine': '75',
  'Occitanie': '76'
};

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\u0153/g, 'oe')
    .replace(/\u00e6/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Official INSEE names keep articles the product dataset drops, such as
// "L'Ajoupa-Bouillon" against "Ajoupa-Bouillon".
function stripArticle(value) {
  return value.replace(/^(le|la|les|l|du|de|des)\s+/, '');
}

function readTerritoryDataset() {
  const source = fs.readFileSync(path.join(ROOT, 'profile-completion.js'), 'utf8');
  const sandbox = {
    window: {}, document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] },
    console, setTimeout, clearTimeout
  };
  sandbox.window.document = sandbox.document;
  try {
    vm.runInNewContext(source, sandbox);
  } catch (_) {
    // The module wires DOM behaviour we do not need; the dataset is assigned first.
  }
  const dataset = sandbox.window.LYANN_TERRITORY_DATASET;
  if (!dataset) throw new Error('LYANN_TERRITORY_DATASET not found in profile-completion.js');
  return dataset;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function fetchDepartment(code) {
  return fetchJson(`${API}?codeDepartement=${code}&fields=nom,centre,codeDepartement&format=json`);
}

async function fetchByName(name, regionCode) {
  const params = new URLSearchParams({ nom: name, fields: 'nom,centre,codeDepartement', boost: 'population', limit: '10' });
  if (regionCode) params.set('codeRegion', regionCode);
  return fetchJson(`${API}?${params}`);
}

function pickMatch(rows, communeName) {
  const wanted = normalize(communeName);
  const bare = stripArticle(wanted);
  return rows.find(row => normalize(row.nom) === wanted)
    || rows.find(row => stripArticle(normalize(row.nom)) === bare)
    || null;
}

(async () => {
  const dataset = readTerritoryDataset();
  const entries = new Map();
  const missing = [];
  const departmentCache = new Map();

  for (const [territory, islands] of Object.entries(dataset)) {
    const territoryCode = (territory.match(/\((\d{3})\)/) || [])[1] || null;
    for (const [island, communes] of Object.entries(islands)) {
      for (const commune of communes) {
        let row = null;
        if (territoryCode) {
          if (!departmentCache.has(territoryCode)) departmentCache.set(territoryCode, await fetchDepartment(territoryCode));
          row = pickMatch(departmentCache.get(territoryCode), commune);
        } else {
          row = pickMatch(await fetchByName(commune, REGION_CODES[island]), commune);
        }
        if (!row?.centre?.coordinates) {
          missing.push(`${territory} / ${island} / ${commune}`);
          continue;
        }
        const [lon, lat] = row.centre.coordinates;
        const code = territoryCode || row.codeDepartement;
        entries.set(`${code}|${normalize(commune)}`, {
          commune, code,
          lat: Number(lat.toFixed(4)),
          lon: Number(lon.toFixed(4))
        });
      }
    }
  }

  const sorted = [...entries.entries()].sort(([a], [b]) => a.localeCompare(b));
  const body = sorted.map(([key, value]) =>
    `        ${JSON.stringify(key)}: [${value.lat}, ${value.lon}]`).join(',\n');

  const output = `// GENERATED FILE — do not edit by hand.
// Commune centres from the French government geo API (https://geo.api.gouv.fr).
// Regenerate with: node scripts/build-commune-geo.js
// Key: "<department code>|<normalized commune name>" -> [latitude, longitude]
(function () {
    'use strict';
    window.LYANN_COMMUNE_GEO = Object.freeze({
${body}
    });
})();
`;

  fs.writeFileSync(path.join(ROOT, 'commune-geo.js'), output, 'utf8');
  console.log(`commune-geo.js written with ${sorted.length} commune centres.`);
  if (missing.length) {
    console.warn(`Unresolved communes (${missing.length}):`);
    missing.forEach(entry => console.warn(`  - ${entry}`));
    process.exitCode = 1;
  }
})();
