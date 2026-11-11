'use strict';
// Phase 3.2A — garde-fous de non-régression sur le code des trois correctifs.
// Les preuves de comportement (navigateur + Staging) sont dans scripts/v32a-*-staging.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const api = read('api-client.js');
const script = read('script.js');
const ui = read('explorer-ui.js');
const families = require('../needs-map-category-families.js');

// Bug 1 — la table profiles n'est lisible que par son propriétaire : l'hydratation des favoris passe par la vue publique.
const hydrate = api.slice(api.indexOf('async getHydratedFavorites()'), api.indexOf('LYANN_API_CLIENT.getMyFavorites ='));
assert.ok(hydrate.length > 500, 'hydratation des favoris introuvable');
assert.doesNotMatch(hydrate, /\.from\('profiles'\)/, 'les favoris ne doivent pas relire la table profiles (RLS propriétaire)');
assert.doesNotMatch(hydrate, /profiles:author_id\(/, 'pas de jointure directe sur profiles pour l\'auteur');
assert.match(hydrate, /\.from\('public_profiles'\)/);
assert.doesNotMatch(hydrate, /primary_activity|\.select\('[^']*\bskills\b/, 'colonnes absentes de public_profiles');
assert.equal((api.match(/LyannFavoritesService = \{/g) || []).length, 1, 'un seul système de favoris');

// Bug 2 — un seul écouteur délégué, état lu au clic, aucune copie figée de la sélection.
assert.match(ui, /onMapCategoryGridClick/);
assert.match(ui, /addEventListener\('click', onMapCategoryGridClick\)/);
assert.doesNotMatch(ui, /const set = new Set\(draft\)/, 'ancienne bascule basée sur une copie figée au rendu');
assert.doesNotMatch(ui, /mapFamilyDraft = \[\.\.\.api\.ALL_FAMILY_IDS\]/, 'le brouillon initial ne doit plus contenir toutes les familles');
assert.deepEqual(families.toggleFamilySelection([], 'plomberie'), ['plomberie']);
assert.equal(families.effectiveFamilyFilter(families.ALL_FAMILY_IDS), null);

// Bug 3 — préparation de l'image, erreurs d'insertion visibles, cache de profil invalidé, suivi du statut.
assert.match(api, /window\.LYANN_IMAGE_PREPARE = /);
assert.match(api, /DEFAULT_MAX_BYTES = 4 \* 1024 \* 1024/, 'plafond sous la limite de lecture de la modération (5 Mio)');
assert.match(api, /HEIC/);
const upload = api.slice(api.indexOf('async uploadPortfolioImage'), api.indexOf('async updatePortfolioItem'));
assert.match(upload, /LYANN_IMAGE_PREPARE\.prepare/);
assert.match(upload, /contentType: 'image\/jpeg'/);
const submit = script.slice(script.indexOf('window.lyannHandleAddPortfolioSubmit = '), script.indexOf('window.lyannDeletePortfolioItem = '));
assert.match(submit, /added && added\.error/, 'l\'échec d\'insertion ne doit plus être silencieux');
assert.match(submit, /LYANN_PROFILE_REPOSITORY\?\.invalidate/, 'le profil en cache doit être invalidé après ajout');
assert.match(script.slice(script.indexOf('window.lyannDeletePortfolioItem = ')), /LYANN_PROFILE_REPOSITORY\?\.invalidate/);
assert.match(script, /window\.lyannWatchPortfolioItems = /);
assert.match(script, /plus longue que prévu/);
assert.match(script, /Photo non publiée/);
assert.doesNotMatch(submit, /is_public:\s*true[\s\S]*approved/i, 'aucun contournement de la modération côté client');
assert.doesNotMatch(submit + script.slice(script.indexOf('window.lyannWatchPortfolioItems = ')), /public_media_releases|moderation_jobs/, 'le client ne touche jamais aux tables de modération');

console.log('v32a-functional-fixes.test.js: ok');
