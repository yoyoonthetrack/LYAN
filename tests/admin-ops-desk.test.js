'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { DEFAULT_PLANS, DISPUTE_CLOSED, handleOpsResource } = require('../api/admin-ops-desk');

test('admin ops desk ships default subscription plans and closed dispute statuses', () => {
    assert.equal(DEFAULT_PLANS.length, 3);
    assert.equal(DEFAULT_PLANS[0].slug, 'lyanneur');
    assert.equal(DISPUTE_CLOSED.has('RESOLVED_CLIENT'), true);
    assert.equal(DISPUTE_CLOSED.has('OPEN'), false);
});

test('server registers the admin ops desk and dispute decide route', () => {
    const server = fs.readFileSync(path.join(__dirname, '..', 'api', 'server.js'), 'utf8');
    assert.match(server, /registerAdminOpsDesk/);
    assert.match(server, /handleOpsResource/);
    const desk = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin-ops-desk.js'), 'utf8');
    assert.match(desk, /\/v1\/admin\/ops\/disputes\/:id\/decide/);
    assert.match(desk, /stripe_execution: false/);
    assert.match(desk, /grant-pro/);
    assert.match(desk, /notifications\/test/);
});

test('admin script loads the previously shell sections', () => {
    const script = fs.readFileSync(path.join(__dirname, '..', 'admin-script.js'), 'utf8');
    assert.match(script, /'sec-subscriptions'/);
    assert.match(script, /'sec-protection'/);
    assert.match(script, /'sec-notifications'/);
    assert.match(script, /'sec-rbac'/);
    assert.match(script, /adminDecideDispute/);
    assert.match(script, /KPI live indisponibles/);
    assert.doesNotMatch(script, /Offrir un abonnement Pro n’est pas une opération financière activée ici/);
});

test('handleOpsResource returns null for unknown resources', async () => {
    const result = await handleOpsResource({ from() { throw new Error('should not query'); } }, 'nope', 10);
    assert.equal(result, null);
});
