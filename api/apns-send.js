'use strict';

const crypto = require('crypto');
const http2 = require('http2');
const { apnsHost, BUNDLE_ID, buildTestPayload, maskToken, interpretApnsStatus } = require('./apns');

function apnsConfig(env = process.env) {
    const key = env.APNS_PRIVATE_KEY;
    const keyId = env.APNS_KEY_ID;
    const teamId = env.APNS_TEAM_ID;
    if (!key || !keyId || !teamId) return null;
    return {
        privateKey: String(key).replace(/\\n/g, '\n'),
        keyId: String(keyId),
        teamId: String(teamId),
        bundleId: env.APNS_BUNDLE_ID || BUNDLE_ID
    };
}

let cachedJwt = { value: '', at: 0, keyId: '' };

function resetApnsJwtCache() {
    cachedJwt = { value: '', at: 0, keyId: '' };
}

function apnsAuthorization(config, nowSeconds = Math.floor(Date.now() / 1000)) {
    if (cachedJwt.value && cachedJwt.keyId === config.keyId && nowSeconds - cachedJwt.at < 2400) {
        return cachedJwt.value;
    }
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: config.keyId })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({ iss: config.teamId, iat: nowSeconds })).toString('base64url');
    const unsigned = header + '.' + claims;
    const signer = crypto.createSign('SHA256');
    signer.update(unsigned);
    const signature = signer.sign({ key: config.privateKey, dsaEncoding: 'ieee-p1363' });
    cachedJwt = {
        value: unsigned + '.' + Buffer.from(signature).toString('base64url'),
        at: nowSeconds,
        keyId: config.keyId
    };
    return cachedJwt.value;
}

function sendApns({ config, deviceToken, environment, payload }) {
    const host = apnsHost(environment);
    const body = JSON.stringify(payload || buildTestPayload());
    return new Promise((resolve) => {
        const client = http2.connect('https://' + host);
        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            try { client.close(); } catch (_) {}
            resolve(result);
        };
        client.on('error', () => finish({
            ok: false,
            deactivate: false,
            code: 'APNS_UNAVAILABLE',
            status: 0,
            token: maskToken(deviceToken)
        }));
        const request = client.request({
            ':method': 'POST',
            ':path': '/3/device/' + deviceToken,
            authorization: 'bearer ' + apnsAuthorization(config),
            'apns-topic': config.bundleId,
            'apns-push-type': 'alert',
            'apns-priority': '10',
            'apns-id': crypto.randomUUID()
        });
        let status = 0;
        request.setEncoding('utf8');
        request.on('response', (headers) => {
            status = Number(headers[':status'] || 0);
        });
        request.on('data', () => {});
        request.on('end', () => {
            const decision = interpretApnsStatus(status);
            finish({ ...decision, status, token: maskToken(deviceToken) });
        });
        request.on('error', () => finish({
            ok: false,
            deactivate: false,
            code: 'APNS_UNAVAILABLE',
            status: 0,
            token: maskToken(deviceToken)
        }));
        request.end(body);
    });
}

module.exports = { apnsConfig, apnsAuthorization, resetApnsJwtCache, sendApns };
