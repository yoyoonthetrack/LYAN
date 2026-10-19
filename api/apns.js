'use strict';

// APNs decisions only. Secrets stay in the server environment and are never returned.

const BUNDLE_ID = 'app.lyann.mobile';
const SOUND_FILE = 'lyann-notif.caf';
const TEST_TITLE = 'LYANN';
const TEST_BODY = 'Votre première notification LYANN fonctionne !';

function apnsHost(environment) {
    return environment === 'production' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
}

function buildPushPayload(alert) {
    return {
        aps: {
            alert: {
                title: String(alert && alert.title || TEST_TITLE),
                body: String(alert && alert.body || '')
            },
            sound: SOUND_FILE
        }
    };
}

function buildTestPayload() {
    return buildPushPayload({ title: TEST_TITLE, body: TEST_BODY });
}

function testSendAllowed({ enabled, allowUserId, callerId }) {
    if (enabled !== true) return { ok: false, code: 'PUSH_TEST_DISABLED' };
    if (!allowUserId || !callerId || String(callerId) !== String(allowUserId)) {
        return { ok: false, code: 'PUSH_TEST_FORBIDDEN' };
    }
    return { ok: true };
}

function maskToken(token) {
    const value = String(token || '');
    if (value.length < 12) return null;
    return value.slice(0, 4) + '…' + value.slice(-4);
}

function interpretApnsStatus(status) {
    const code = Number(status);
    if (code === 200) return { ok: true, deactivate: false, code: 'SENT' };
    if (code === 410) return { ok: false, deactivate: true, code: 'UNREGISTERED' };
    return { ok: false, deactivate: false, code: 'APNS_REJECTED' };
}

function validDeviceRegistration(input) {
    const installationId = String(input && input.installation_id || '');
    const token = String(input && input.token || '').trim();
    const environment = input && input.apns_environment;
    if (!/^[0-9a-f-]{36}$/i.test(installationId)) return { ok: false, code: 'INSTALLATION_INVALID' };
    if (!/^[0-9a-f]{64,200}$/i.test(token)) return { ok: false, code: 'TOKEN_INVALID' };
    if (environment !== 'sandbox' && environment !== 'production') return { ok: false, code: 'ENVIRONMENT_INVALID' };
    return { ok: true, installationId, token, environment, platform: 'ios' };
}

module.exports = {
    BUNDLE_ID,
    SOUND_FILE,
    TEST_TITLE,
    TEST_BODY,
    apnsHost,
    buildTestPayload,
    buildPushPayload,
    testSendAllowed,
    maskToken,
    interpretApnsStatus,
    validDeviceRegistration
};
