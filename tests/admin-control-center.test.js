const test = require('node:test');
const assert = require('node:assert/strict');
const { periodBounds, DEFINITIONS } = require('../api/admin-control-center');

test('period 30d is bounded and all is unbounded', () => {
    const month = periodBounds('30d');
    const all = periodBounds('all');
    assert.ok(month.start);
    assert.equal(all.start, null);
    assert.ok(DEFINITIONS.activeMembers.includes('événement'));
    assert.ok(DEFINITIONS.collectedCommissions.includes('MRR'));
});

test('gmv and commissions definitions are not monthly recurring claims', () => {
    assert.match(DEFINITIONS.gmvPeriod, /période/);
    assert.match(DEFINITIONS.collectedCommissions, /pas un MRR/i);
});
