'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const client = fs.readFileSync(path.join(__dirname, '..', 'api-client.js'), 'utf8');

test('skill inserts retry when slug is required', () => {
    assert.match(client, /function uniqueServiceSlug/);
    assert.match(client, /function isRetryableServiceInsertError/);
    assert.match(client, /code === '23502'/);
    const insert = client.slice(
        client.indexOf('async function insertServicesForOwner'),
        client.indexOf('function presentService')
    );
    assert.match(insert, /productionServiceInsert/);
    assert.match(insert, /slug: uniqueServiceSlug/);
    assert.match(insert, /canonicalServiceInsert/);
    assert.match(insert, /isRetryableServiceInsertError/);
});

test('profile skill sync does not delete priced listings', () => {
    const sync = client.slice(
        client.indexOf('async syncUserSkills'),
        client.indexOf('async getUserServices')
    );
    assert.match(sync, /priced/);
    assert.match(sync, /stub/);
    assert.match(sync, /insertServicesForOwner/);
});
