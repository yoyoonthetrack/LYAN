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

function describeApnsKey(env = process.env) {
    const config = apnsConfig(env);
    const empty = { configured: false, pem_ec: false, key_id_shape: false, kid_matches: false, team_ok: false, bundle_ok: false };
    if (!config) return empty;
    let pemEc = false;
    try {
        pemEc = crypto.createPrivateKey(config.privateKey).asymmetricKeyType === 'ec';
    } catch (_) {}
    let kidMatches = false;
    try {
        resetApnsJwtCache();
        const jwt = apnsAuthorization(config);
        const header = JSON.parse(Buffer.from(jwt.split('.')[0], 'base64url').toString('utf8'));
        kidMatches = header.alg === 'ES256' && header.kid === config.keyId;
    } catch (_) {}
    return {
        configured: true,
        pem_ec: pemEc,
        key_id_shape: /^[A-Za-z0-9]{10}$/.test(config.keyId),
        kid_matches: kidMatches,
        team_ok: config.teamId === 'WLV4WC47U2',
        bundle_ok: config.bundleId === 'app.lyann.mobile'
    };
}

const P256_N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');

let cachedJwt = { value: '', at: 0, identity: '' };

function resetApnsJwtCache() {
    cachedJwt = { value: '', at: 0, identity: '' };
}

function apnsConfigIdentity(config) {
    return crypto.createHash('sha256').update([
        config.keyId,
        config.teamId,
        config.bundleId,
        config.privateKey
    ].join('\n')).digest('hex');
}

function canonicalP1363(signature) {
    const raw = Buffer.from(signature);
    if (raw.length !== 64) return raw;
    const s = BigInt('0x' + raw.subarray(32).toString('hex'));
    if (s <= (P256_N >> 1n)) return raw;
    return Buffer.concat([
        raw.subarray(0, 32),
        Buffer.from((P256_N - s).toString(16).padStart(64, '0'), 'hex')
    ]);
}

function apnsAuthorization(config, nowSeconds = Math.floor(Date.now() / 1000)) {
    const identity = apnsConfigIdentity(config);
    if (cachedJwt.value && cachedJwt.identity === identity && nowSeconds - cachedJwt.at < 2400) {
        return cachedJwt.value;
    }
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: config.keyId })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({ iss: config.teamId, iat: nowSeconds })).toString('base64url');
    const unsigned = header + '.' + claims;
    const signer = crypto.createSign('SHA256');
    signer.update(unsigned);
    const signature = canonicalP1363(signer.sign({ key: config.privateKey, dsaEncoding: 'ieee-p1363' }));
    cachedJwt = {
        value: unsigned + '.' + signature.toString('base64url'),
        at: nowSeconds,
        identity
    };
    return cachedJwt.value;
}

function sendApns({ config, deviceToken, environment, payload, apnsId }) {
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
            'apns-id': apnsId || crypto.randomUUID()
        });
        let status = 0;
        let responseBody = '';
        request.setEncoding('utf8');
        request.on('response', (headers) => {
            status = Number(headers[':status'] || 0);
        });
        request.on('data', (chunk) => {
            if (responseBody.length < 300) responseBody += chunk;
        });
        request.on('end', () => {
            let reason = '';
            try {
                const parsed = JSON.parse(responseBody);
                if (parsed && /^[A-Za-z0-9_]+$/.test(parsed.reason || '')) reason = parsed.reason;
            } catch (_) {}
            const decision = interpretApnsStatus(status);
            finish({
                ...decision,
                status,
                reason,
                code: reason || decision.code,
                token: maskToken(deviceToken)
            });
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

module.exports = { apnsConfig, describeApnsKey, apnsAuthorization, resetApnsJwtCache, sendApns };
