'use strict';

// Runs only when a Staging HTTPS host is explicitly provided and answers.
// A missing host is not a failure: the environment has not been authorized yet.

const https = require('https');
const { URL } = require('url');

const origin = String(process.env.LYANN_STAGING_PUBLIC_ORIGIN || '').replace(/\/$/, '');
if (!origin) {
    console.log('NON DÉPLOYÉ. Définir LYANN_STAGING_PUBLIC_ORIGIN après autorisation.');
    process.exit(0);
}

let url;
try {
    url = new URL(origin);
} catch (_) {
    console.error('URL Staging invalide.');
    process.exit(1);
}
if (url.protocol !== 'https:' || url.hostname === 'lyann.app' || url.hostname === 'www.lyann.app') {
    console.error('Le contrôle refuse Production.');
    process.exit(1);
}

function get(path) {
    return new Promise((resolve, reject) => {
        const req = https.request(Object.assign(new URL(path, origin), { method: 'GET' }), (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
        });
        req.setTimeout(8000, () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        req.end();
    });
}

(async () => {
    const health = await get('/v1/payments/config');
    if (health.status !== 200) throw new Error('config HTTP ' + health.status);
    const config = JSON.parse(health.body);
    if (config.stripe_mode === 'live') throw new Error('Stripe Live exposé');
    if (/sk_live|service_role/i.test(health.body)) throw new Error('secret exposé');
    const aasa = await get('/.well-known/apple-app-site-association');
    if (aasa.status !== 200) throw new Error('AASA HTTP ' + aasa.status);
    if (Number(aasa.headers.location || 0)) throw new Error('AASA redirigé');
    const webhook = await new Promise((resolve, reject) => {
        const req = https.request(Object.assign(new URL('/v1/payments/webhook', origin), { method: 'POST' }), (res) => {
            res.resume();
            resolve(res.statusCode);
        });
        req.setTimeout(8000, () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        req.end('{}');
    });
    if (webhook !== 400 && webhook !== 503) throw new Error('webhook non signé accepté : ' + webhook);
    console.log('Contrôles hébergés de base : PASS. Auth, Universal Link et Connect restent à exécuter sur iPhone.');
})().catch((error) => {
    console.error(String(error && error.message || error));
    process.exit(1);
});
