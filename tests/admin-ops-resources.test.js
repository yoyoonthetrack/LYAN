'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('every admin section resource is served by /v1/admin/ops', () => {
    const admin = fs.readFileSync(path.join(__dirname, '..', 'admin-script.js'), 'utf8');
    const server = fs.readFileSync(path.join(__dirname, '..', 'api', 'server.js'), 'utf8');
    const names = [...admin.matchAll(/fetchAdminOps\('([^']+)'\)/g)].map((match) => match[1]);
    const unique = [...new Set(names)];
    assert.ok(unique.includes('feature-flags'));
    assert.ok(unique.includes('territories'));
    for (const name of unique) {
        assert.match(server, new RegExp("resource === '" + name + "'"), name);
    }
});
