'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
    apnsHost,
    buildTestPayload,
    testSendAllowed,
    maskToken,
    interpretApnsStatus,
    validDeviceRegistration,
    SOUND_FILE,
    TEST_TITLE,
    TEST_BODY
} = require('../api/apns');
const { apnsConfig, apnsAuthorization, resetApnsJwtCache } = require('../api/apns-send');

test('the test alert uses the custom sound and no payment data', () => {
    const payload = buildTestPayload();
    assert.equal(payload.aps.alert.title, TEST_TITLE);
    assert.equal(payload.aps.alert.title, 'LYANN');
    assert.equal(payload.aps.alert.body, TEST_BODY);
    assert.equal(payload.aps.sound, SOUND_FILE);
    assert.equal(payload.aps.sound, 'lyann-notif.caf');
    assert.equal(JSON.stringify(payload).includes('card'), false);
    assert.equal(JSON.stringify(payload).includes('iban'), false);
});

test('sandbox and production APNs hosts stay separate from Stripe', () => {
    assert.equal(apnsHost('sandbox'), 'api.sandbox.push.apple.com');
    assert.equal(apnsHost('production'), 'api.push.apple.com');
    assert.equal(apnsHost('anything-else'), 'api.sandbox.push.apple.com');
});

test('a test send stays closed unless one explicit user is enabled', () => {
    assert.equal(testSendAllowed({ enabled: false, allowUserId: 'user-a', callerId: 'user-a' }).ok, false);
    assert.equal(testSendAllowed({ enabled: true, allowUserId: '', callerId: 'user-a' }).code, 'PUSH_TEST_FORBIDDEN');
    assert.equal(testSendAllowed({ enabled: true, allowUserId: 'user-a', callerId: 'user-b' }).ok, false);
    assert.equal(testSendAllowed({ enabled: true, allowUserId: 'user-a', callerId: 'user-a' }).ok, true);
});

test('device registration rejects a foreign or malformed token', () => {
    const good = validDeviceRegistration({
        installation_id: '11111111-1111-4111-8111-111111111111',
        token: 'a'.repeat(64),
        apns_environment: 'sandbox'
    });
    assert.equal(good.ok, true);
    assert.equal(validDeviceRegistration({ installation_id: 'nope', token: 'a'.repeat(64), apns_environment: 'sandbox' }).ok, false);
    assert.equal(validDeviceRegistration({
        installation_id: '11111111-1111-4111-8111-111111111111',
        token: 'BEGIN PRIVATE KEY',
        apns_environment: 'production'
    }).ok, false);
    assert.equal(maskToken('a'.repeat(64)).includes('a'.repeat(20)), false);
});

test('an unregistered device is deactivated and a missing key does not send', () => {
    assert.equal(interpretApnsStatus(200).ok, true);
    assert.equal(interpretApnsStatus(410).deactivate, true);
    assert.equal(interpretApnsStatus(400).deactivate, false);
    assert.equal(apnsConfig({}), null);
});

test('the APNs authorization is a three part token and is cached', () => {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    resetApnsJwtCache();
    const first = apnsAuthorization({ privateKey: pem, keyId: 'KEYID12345', teamId: 'TEAMID1234' }, 1000);
    const second = apnsAuthorization({ privateKey: pem, keyId: 'KEYID12345', teamId: 'TEAMID1234' }, 1100);
    assert.equal(first.split('.').length, 3);
    assert.equal(second, first);
    assert.equal(first.includes('BEGIN'), false);
});
