'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const policy = require('../bokantaj-video-policy');

const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
const admin = fs.readFileSync(path.join(__dirname, '../admin-script.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(__dirname, '../admin.html'), 'utf8');
const feedHtml = fs.readFileSync(path.join(__dirname, '../feed.html'), 'utf8');

test('a bokantaj place uses the same bounds as a member pin', () => {
    assert.equal(policy.normalizeBokantajPlace(null), null);
    assert.deepEqual(policy.normalizeBokantajPlace({ lat: 16.241, lng: -61.534, label: ' Pointe-à-Pitre ' }), {
        lat: 16.241,
        lng: -61.534,
        label: 'Pointe-à-Pitre'
    });
    assert.equal(policy.normalizeBokantajPlace({ lat: 99, lng: 0, label: 'Trop loin' }).error.length > 0, true);
    assert.equal(policy.normalizeBokantajPlace({ lat: 16, lng: -61, label: 'x' }).error.length > 0, true);
});

test('an empty place is not stored', () => {
    assert.equal(policy.normalizeBokantajPlace(undefined), null);
    assert.equal(policy.normalizeBokantajPlace(null), null);
    assert.equal(policy.normalizeBokantajPlace(false), null);
    assert.equal(policy.normalizeBokantajPlace({}).error.length > 0, true);
    assert.equal(policy.normalizeBokantajPlace({ lat: null, lng: null, label: '' }).error.length > 0, true);
});

test('pin lifetime stays at seven days, and twenty-four hours for traffic', () => {
    const now = Date.parse('2026-10-28T12:00:00Z');
    const visible = (type, ageMs) => policy.mapPinVisible({
        public_moderation_status: 'approved',
        type,
        created_at: new Date(now - ageMs).toISOString(),
        place_lat: 14.6,
        place_lng: -61.0,
        place_label: 'Fort-de-France'
    }, now);
    assert.equal(visible('info', policy.PIN_MAX_MS), true);
    assert.equal(visible('info', policy.PIN_MAX_MS + 1000), false);
    assert.equal(visible('trafic', policy.TRAFFIC_PIN_MS), true);
    assert.equal(visible('trafic', policy.TRAFFIC_PIN_MS + 1000), false);
    assert.equal(policy.PIN_MAX_MS, 7 * 24 * 60 * 60 * 1000);
    assert.equal(policy.TRAFFIC_PIN_MS, 24 * 60 * 60 * 1000);
});

test('an old publication does not get a longer pin because its place changed', () => {
    const created = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const post = {
        public_moderation_status: 'approved',
        type: 'info',
        created_at: created,
        place_lat: 16.2,
        place_lng: -61.5,
        place_label: 'Lieu modifié'
    };
    assert.equal(policy.mapPinVisible(post, Date.now()), false);
    assert.deepEqual(policy.pinExpiryEffect(), {
        hidePinOnly: true,
        deletePost: false,
        deletePhotos: false,
        deleteVideo: false
    });
});

test('the house-profile form stores the place on the post and can change it later', () => {
    assert.match(server, /profiles\/:id\/bokantaj\/:postId\/place/);
    assert.match(server, /place_lat: place \? place\.lat : null/);
    assert.match(server, /Date\.parse\(data\.created_at\) !== Date\.parse\(existing\.created_at\)/);
    assert.equal(server.includes('MAISON_BOKANTAJ_PLACE'), true);
    assert.match(admin, /id="maisonPlaceSearch"/);
    assert.match(admin, /id="bokantajPlaceTrigger"/);
    assert.match(admin, /getComposerPlace/);
    assert.match(admin, /data-maison-place-clear/);
    assert.equal(admin.includes('account_type'), true);
    const placeUpdate = server.slice(server.indexOf("app.patch('/v1/admin/maison/profiles/:id/bokantaj/:postId/place'"));
    const updateCall = placeUpdate.slice(placeUpdate.indexOf('.update({'), placeUpdate.indexOf('.eq(\'id\', existing.id)'));
    assert.match(updateCall, /place_lat/);
    assert.equal(updateCall.includes('created_at'), false);
    assert.equal(updateCall.includes('content'), false);
    assert.equal(placeUpdate.slice(0, 1800).includes('moderateMaisonSubject'), false);
    const maplibre = adminHtml.indexOf('vendor/maplibre/maplibre-gl.js');
    const bridge = adminHtml.indexOf('vendor/maplibre/leaflet-maplibre-gl.js');
    assert.equal(maplibre > 0 && bridge > maplibre, true);
    assert.equal(adminHtml.includes('vendor/maplibre/maplibre-gl.css'), true);
    assert.equal(feedHtml.includes('vendor/maplibre/maplibre-gl.js'), true);
});
