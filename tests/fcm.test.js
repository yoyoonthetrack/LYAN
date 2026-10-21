'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { fcmConfig, buildFcmBody, sendFcm } = require('../api/fcm');
const { settleDelivery, drainQueue } = require('../api/push-queue');

const PRIVATE_KEY = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });

function config() {
    return {
        projectId: 'lyann-test',
        clientEmail: 'fcm@lyann-test.iam.gserviceaccount.com',
        privateKey: PRIVATE_KEY
    };
}

test('FCM stays off when the server environment has no service account', () => {
    assert.equal(fcmConfig({}), null);
    assert.equal(fcmConfig({ FCM_PROJECT_ID: 'lyann', FCM_CLIENT_EMAIL: 'a@b.c' }), null);
    assert.equal(fcmConfig({ FCM_PROJECT_ID: 'lyann-9c756', FCM_ACCESS_TOKEN: 'short-lived' }), null);
    const durable = fcmConfig({
        FCM_PROJECT_ID: 'lyann-9c756',
        FCM_CLIENT_EMAIL: 'fcm@lyann-test.iam.gserviceaccount.com',
        FCM_PRIVATE_KEY: 'key',
        FCM_ACCESS_TOKEN: 'short-lived'
    });
    assert.equal(durable.projectId, 'lyann-9c756');
    assert.equal(Object.hasOwn(durable, 'accessToken'), false);
});

test('an FCM message carries the alert and never the private key', async () => {
    const payload = {
        aps: { alert: { title: 'LYANN', body: 'Nouveau message' } },
        route: 'messages',
        contactId: '11111111-1111-4111-8111-111111111111'
    };
    const body = buildFcmBody('device-token', payload);
    assert.equal(body.message.notification.title, 'LYANN');
    assert.equal(body.message.notification.body, 'Nouveau message');
    assert.equal(body.message.data.route, 'messages');
    assert.equal(JSON.stringify(body).includes('PRIVATE KEY'), false);

    let calls = 0;
    const missing = await sendFcm({ config: null, deviceToken: 'x', payload, fetchImpl: async () => { calls += 1; } });
    assert.equal(missing.code, 'FCM_NOT_CONFIGURED');
    assert.equal(calls, 0);

    const seen = [];
    const sent = await sendFcm({
        config: config(),
        deviceToken: 'device-token',
        payload,
        nowSeconds: 1000,
        fetchImpl: async (url, options) => {
            seen.push(String(options.body));
            if (String(url).includes('oauth2')) {
                return { ok: true, status: 200, json: async () => ({ access_token: 'access-token' }) };
            }
            return { ok: true, status: 200, json: async () => ({ name: 'projects/lyann-test/messages/1' }) };
        }
    });
    assert.equal(sent.ok, true);
    assert.equal(seen.join('\n').includes('PRIVATE KEY'), false);
    assert.equal(seen.join('\n').includes(PRIVATE_KEY), false);
});

test('an unregistered Android token is deactivated and an iOS success still counts as sent', async () => {
    const rejected = await sendFcm({
        config: config(),
        deviceToken: 'gone',
        payload: { aps: { alert: { title: 'LYANN', body: 'Essai' } } },
        nowSeconds: 1000,
        fetchImpl: async (url) => {
            if (String(url).includes('oauth2')) return { ok: true, status: 200, json: async () => ({ access_token: 'access-token' }) };
            return { ok: false, status: 404, json: async () => ({ error: { status: 'NOT_FOUND' } }) };
        }
    });
    assert.equal(rejected.deactivate, true);
    const settled = settleDelivery({ attempts: 1, maxAttempts: 5 }, [
        { ok: true, code: 'SENT', deactivate: false, deviceId: 'ios-1' },
        { ok: false, code: 'FCM_NOT_CONFIGURED', deactivate: false, deviceId: 'android-1' }
    ], 1000);
    assert.equal(settled.status, 'sent');
    assert.deepEqual(settled.deactivateIds, []);

    const deactivated = [];
    const completed = [];
    await drainQueue({
        enabled: true,
        now: 1000,
        claim: async () => [{
            id: 'row-1',
            recipientId: '22222222-2222-4222-8222-222222222222',
            eventType: 'NEW_MESSAGE',
            title: 'LYANN',
            body: 'Bonjour',
            route: 'messages',
            contactId: '11111111-1111-4111-8111-111111111111',
            attempts: 1,
            maxAttempts: 5
        }],
        tokensForUser: async () => [
            { id: 'ios-1', token: 'a'.repeat(64), environment: 'sandbox', platform: 'ios' },
            { id: 'android-1', token: 'fcm', environment: 'production', platform: 'android' }
        ],
        send: async (input) => {
            if (input.platform === 'android') return { ok: false, deactivate: false, code: 'FCM_NOT_CONFIGURED' };
            return { ok: true, deactivate: false, code: 'SENT' };
        },
        deactivateTokens: async (ids) => { deactivated.push(...ids); },
        complete: async (row, result) => { completed.push(result); }
    });
    assert.equal(completed[0].status, 'sent');
    assert.deepEqual(deactivated, []);
});

test('a short-lived access token cannot replace the service account', async () => {
    let calls = 0;
    const sent = await sendFcm({
        config: { projectId: 'lyann-9c756', accessToken: 'ya29.test' },
        deviceToken: 'device-token',
        payload: { aps: { alert: { title: 'LYANN', body: 'Essai' } } },
        fetchImpl: async () => { calls += 1; return { ok: true, status: 200, json: async () => ({}) }; }
    });
    assert.equal(sent.ok, false);
    assert.equal(sent.code, 'FCM_NOT_CONFIGURED');
    assert.equal(calls, 0);
});

test('the Android token migration only widens the platform check', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', '74_device_push_tokens_android.sql'), 'utf8');
    assert.equal(sql.includes("CHECK (platform IN ('ios', 'android'))"), true);
    assert.equal(sql.includes('DROP TABLE'), false);
    assert.equal(sql.includes('PRIVATE KEY'), false);
    assert.equal(sql.includes('BEGIN'), false);
});
