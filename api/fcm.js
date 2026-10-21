'use strict';

// FCM decisions only. The service-account private key stays in the server environment.

const crypto = require('crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

function fcmConfig(env = process.env) {
    const projectId = env.FCM_PROJECT_ID;
    const clientEmail = env.FCM_CLIENT_EMAIL;
    const privateKey = env.FCM_PRIVATE_KEY;
    if (!projectId || !clientEmail || !privateKey) return null;
    return {
        projectId: String(projectId),
        clientEmail: String(clientEmail),
        privateKey: String(privateKey).replace(/\\n/g, '\n')
    };
}

function alertFromPayload(payload) {
    const alert = payload && payload.aps && payload.aps.alert;
    if (typeof alert === 'string') return { title: 'LYANN', body: alert };
    return {
        title: String(alert && alert.title || 'LYANN'),
        body: String(alert && alert.body || '')
    };
}

function fcmData(payload) {
    const data = {};
    const keys = ['route', 'contactId', 'requestId', 'invitationId', 'quoteId', 'missionId', 'milestoneId', 'scopeSource'];
    for (const key of keys) {
        const value = payload && payload[key];
        if (value) data[key] = String(value);
    }
    return data;
}

function buildFcmBody(deviceToken, payload) {
    const alert = alertFromPayload(payload);
    return {
        message: {
            token: deviceToken,
            notification: alert,
            data: fcmData(payload)
        }
    };
}

function serviceAccountJwt(config, nowSeconds) {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claim = Buffer.from(JSON.stringify({
        iss: config.clientEmail,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: nowSeconds,
        exp: nowSeconds + 3600
    })).toString('base64url');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(header + '.' + claim);
    signer.end();
    const signature = signer.sign(config.privateKey).toString('base64url');
    return header + '.' + claim + '.' + signature;
}

function interpretFcmResult(status, body) {
    if (status === 200) return { ok: true, deactivate: false, code: 'SENT', status };
    const text = JSON.stringify(body || {});
    if (status === 404 || /UNREGISTERED|NOT_FOUND/.test(text)) {
        return { ok: false, deactivate: true, code: 'UNREGISTERED', status };
    }
    return { ok: false, deactivate: false, code: 'FCM_REJECTED', status };
}

async function sendFcm({ config, deviceToken, payload, fetchImpl, nowSeconds }) {
    if (!config || !config.projectId || !config.clientEmail || !config.privateKey) {
        return { ok: false, deactivate: false, code: 'FCM_NOT_CONFIGURED', status: 0 };
    }
    try {
        const fetchFn = fetchImpl || fetch;
        const assertion = serviceAccountJwt(config, nowSeconds || Math.floor(Date.now() / 1000));
        const tokenResponse = await fetchFn(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(assertion)
        });
        const tokenBody = await tokenResponse.json();
        if (!tokenResponse.ok || !tokenBody.access_token) {
            return { ok: false, deactivate: false, code: 'FCM_AUTH_FAILED', status: tokenResponse.status };
        }
        const accessToken = tokenBody.access_token;
        const message = buildFcmBody(deviceToken, payload);
        const response = await fetchFn('https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(config.projectId) + '/messages:send', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(message)
        });
        const body = await response.json().catch(() => ({}));
        return interpretFcmResult(response.status, body);
    } catch (_) {
        return { ok: false, deactivate: false, code: 'FCM_UNAVAILABLE', status: 0 };
    }
}

module.exports = {
    fcmConfig,
    buildFcmBody,
    interpretFcmResult,
    sendFcm
};
