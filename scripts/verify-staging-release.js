'use strict';

// Non-destructive Staging release check. It never calls Production and never
// sends a cron secret. Creation routes are not invoked.

const https = require('https');
const { URL } = require('url');
const { loadUploadConfig, cronProblems, STAGING_PROJECT_ID } = require('./staging-vercel-upload');

const STAGING_REF = 'tdktfbtqceldlaeqjtow';
const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const origin = String(process.env.LYANN_STAGING_PUBLIC_ORIGIN || '').replace(/\/$/, '');

function fail(message) {
    console.error(message);
    process.exit(1);
}

const uploaded = loadUploadConfig(require('path').join(__dirname, '..'));
const problems = cronProblems(uploaded);
if (uploaded.name === 'lyan-app') problems.push('nom du projet Production');
if (!uploaded.functions || !uploaded.functions['api/index.js'] || uploaded.functions['api/index.js'].maxDuration < 60) {
    problems.push('durée de fonction insuffisante');
}
if (problems.length) fail(problems.join(' ; '));
console.log('Configuration Staging locale : crons, association Apple et durée de fonction prêts.');
console.log('Projet attendu : ' + STAGING_PROJECT_ID);

if (!origin) {
    console.log('Contrôle HTTP non lancé. Définir LYANN_STAGING_PUBLIC_ORIGIN=https://staging.lyann.app');
    process.exit(0);
}

let url;
try {
    url = new URL(origin);
} catch (_) {
    fail('URL Staging invalide.');
}
if (url.protocol !== 'https:' || url.hostname === 'lyann.app' || url.hostname === 'www.lyann.app') {
    fail('Le contrôle refuse Production.');
}

function request(method, pathname, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(Object.assign(new URL(pathname, origin), { method }), (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
        });
        req.setTimeout(12000, () => req.destroy(new Error('timeout ' + pathname)));
        req.on('error', reject);
        if (body != null) {
            req.setHeader('content-type', 'application/json');
            req.end(body);
        } else req.end();
    });
}

const expected = [
    ['GET', '/v1/runtime/identity', [200]],
    ['GET', '/v1/payments/config', [200]],
    ['GET', '/v1/explorer/requests', [200]],
    ['GET', '/.well-known/apple-app-site-association', [200]],
    ['POST', '/v1/editorial/collect/scheduled', [401]],
    ['POST', '/v1/internal/moderation/run', [401]],
    ['GET', '/v1/internal/bokantaj/media-sweep', [401]],
    ['POST', '/v1/notifications/push-drain', [401]],
    ['POST', '/v1/payments/webhook', [400]],
    ['POST', '/v1/auth/delete-account', [401]],
    ['GET', '/v1/admin/editorial/bots', [401]],
    ['GET', '/v1/store/config', [401, 403]],
    ['GET', '/v1/business/rights', [401]]
];

(async () => {
    const identity = await request('GET', '/v1/runtime/identity');
    const id = JSON.parse(identity.body);
    if (id.supabase_ref !== STAGING_REF || id.production !== false || id.isolation !== 'STAGING_ISOLATED') {
        fail('Identité Staging incorrecte.');
    }
    if (String(id.commit || '').includes(PRODUCTION_REF)) fail('Commit mêlé à Production.');
    console.log('Serveur ' + id.commit + ' projet ' + id.supabase_ref);
    const config = JSON.parse((await request('GET', '/v1/payments/config')).body);
    if (config.stripe_mode !== 'test') fail('Stripe n’est pas en mode Test.');
    if (/sk_live|service_role/i.test(JSON.stringify(config))) fail('Secret exposé par la configuration paiement.');
    const aasa = JSON.parse((await request('GET', '/.well-known/apple-app-site-association')).body);
    const components = (((aasa.applinks || {}).details || [])[0] || {}).components || [];
    if (!components.some((item) => item['/'] === '/auth/callback')) fail('Association Apple Staging absente du domaine.');
    for (const [method, pathname, statuses] of expected) {
        const response = await request(method, pathname, method === 'POST' ? '{}' : null);
        if (!statuses.includes(response.status)) {
            fail(method + ' ' + pathname + ' a répondu ' + response.status + ', attendu ' + statuses.join('/'));
        }
    }
    console.log('Contrôle Staging : PASS. ' + expected.length + ' routes critiques, crons locaux, Stripe Test, isolation.');
})().catch((error) => fail(String(error && error.message || error)));
