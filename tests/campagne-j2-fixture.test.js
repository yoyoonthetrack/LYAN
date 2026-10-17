'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/campagne-j2.json');

test('campagne J2 keeps three recognizable staging deals', () => {
    assert.equal(fixture.prefix, '[CAMPAGNE-J2]');
    assert.equal(fixture.cases.direct.quoteStatus, 'ACCEPTED');
    assert.equal(fixture.cases.jalons.quoteStatus, 'SENT');
    assert.equal(fixture.cases.refus.quoteStatus, 'REJECTED');
    assert.match(fixture.cases.direct.title, /Tarif Direct/);
    assert.match(fixture.cases.jalons.title, /jalons/);
    for (const item of Object.values(fixture.cases)) {
        assert.match(item.requestId, /^[0-9a-f-]{36}$/);
        assert.notEqual(item.requestId, '7c0e10ee-4bbf-44e8-8e93-0c3c7f6fc83d');
    }
});
