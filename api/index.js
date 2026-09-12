/**
 * Vercel Serverless Function Entrypoint for LYANN REST API
 *
 * This file is also the security gateway in front of the historical Express
 * application. Keep security decisions here fail-closed so legacy routes in
 * api/server.js cannot accidentally become reachable in production.
 *
 * IMPORTANT: This gateway is a containment layer, not a replacement for
 * removing legacy/mock code from api/server.js. Dead legacy code should be
 * deleted in a later cleanup after regression validation.
 */
const { createClient } = require('@supabase/supabase-js');
const app = require('./server.js');

const IS_PRODUCTION = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

const ALLOWED_WEB_ORIGINS = new Set([
    'https://lyann.app',
    'https://www.lyann.app',
    'https://admin.lyann.app'
]);

const PRODUCTION_DISABLED_ROUTES = new Set([
    '/v1/auth/login',
    '/v1/members',
    '/v1/deals/lyanner',
    '/v1/payments/create-intent',
    '/v1/payments/validate-and-transfer',
    '/v1/payments/dispute'
]);

const PRODUCTION_FINANCIAL_ROUTES = new Set([
    '/v1/payments/create-milestone-intent',
    '/v1/milestones/start-work',
    '/v1/milestones/submit-completion',
    '/v1/milestones/release-payment',
    '/v1/milestones/claim-transfer',
    '/v1/milestones/raise-dispute'
]);

function normalizePathValue(value) {
    const raw = String(value || '').split('?')[0];
    if (!raw) return '';
    if (raw.startsWith('/api/v1')) return raw.slice(4);
    if (raw.startsWith('/api/admin')) return '/v1' + raw.slice(4);
    if (raw.startsWith('/api/') && !raw.startsWith('/api/v1')) return '/v1' + raw.slice(4);
    return raw;
}

function getCandidatePaths(req) {
    // Vercel rewrites may expose the original URL through different request
    // properties/headers depending on runtime. Security checks therefore
    // evaluate every available candidate rather than trusting a single field.
    const candidates = [
        req.url,
        req.originalUrl,
        req.headers['x-vercel-original-url'],
        req.headers['x-forwarded-uri'],
        req.headers['x-original-url']
    ];

    return [...new Set(candidates.map(normalizePathValue).filter(Boolean))];
}

function matchesAnyPath(paths, predicate) {
    return paths.some(predicate);
}

function isDisabledProductionRoute(path) {
    if (PRODUCTION_DISABLED_ROUTES.has(path)) return true;
    // Legacy member details endpoint, backed by static demo fixtures.
    if (/^\/v1\/members\/[^/]+$/.test(path)) return true;
    return false;
}

function isStripeWebhook(path) {
    return path === '/v1/payments/webhook'
        || path === '/v1/webhooks/stripe'
        || path === '/payments/webhook'
        || path === '/webhooks/stripe'
        || path === '/api/payments/webhook'
        || path === '/api/webhooks/stripe';
}

function isFinancialRoute(path) {
    return PRODUCTION_FINANCIAL_ROUTES.has(path) || isStripeWebhook(path);
}

function jsonError(res, status, code, message) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ success: false, code, error: message }));
}

let adminClient = null;
function getAdminClient() {
    if (adminClient) return adminClient;

    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) return null;

    adminClient = createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
    return adminClient;
}

async function verifyAdminRequest(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { ok: false, status: 401, code: 'ADMIN_AUTH_REQUIRED' };
    }

    const client = getAdminClient();
    if (!client) {
        return { ok: false, status: 503, code: 'ADMIN_SECURITY_CONFIG_MISSING' };
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData?.user?.id) {
        return { ok: false, status: 401, code: 'ADMIN_TOKEN_INVALID' };
    }

    const { data: member, error: memberError } = await client
        .from('admin_members')
        .select('user_id,status')
        .eq('user_id', authData.user.id)
        .eq('status', 'ACTIVE')
        .maybeSingle();

    if (memberError || !member) {
        return { ok: false, status: 403, code: 'ADMIN_ACCESS_DENIED' };
    }

    return { ok: true };
}

module.exports = async function lyannApiGateway(req, res) {
    const paths = getCandidatePaths(req);
    const origin = req.headers.origin;
    const hasDisabledRoute = matchesAnyPath(paths, isDisabledProductionRoute);
    const hasFinancialRoute = matchesAnyPath(paths, isFinancialRoute);
    const hasStripeWebhook = matchesAnyPath(paths, isStripeWebhook);
    const hasAdminRoute = paths.some(path => path === '/v1/admin' || path.startsWith('/v1/admin/'));

    // Native Capacitor clients typically do not send a browser Origin header.
    // Browser requests in production must originate from a LYANN-owned origin.
    if (IS_PRODUCTION && origin && !ALLOWED_WEB_ORIGINS.has(origin)) {
        return jsonError(res, 403, 'ORIGIN_NOT_ALLOWED', 'Origine non autorisée.');
    }

    // Let legitimate browser preflights reach Express CORS only after the
    // production origin allowlist above has accepted them.
    if (req.method === 'OPTIONS') {
        return app(req, res, app.GATEWAY_TOKEN);
    }

    // Historical mock/demo endpoints must never be callable in production.
    if (IS_PRODUCTION && hasDisabledRoute) {
        return jsonError(res, 410, 'LEGACY_ENDPOINT_DISABLED', 'Cette route historique est désactivée.');
    }

    // Any production financial path must have the trusted database credential.
    // This prevents api/server.js from silently falling back to anon privileges.
    if (IS_PRODUCTION && hasFinancialRoute && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return jsonError(res, 503, 'FINANCIAL_DB_CONFIG_MISSING', 'Configuration financière indisponible.');
    }

    // Production must never use the historical mock Stripe branches.
    if (IS_PRODUCTION && hasFinancialRoute && !process.env.STRIPE_SECRET_KEY) {
        return jsonError(res, 503, 'STRIPE_CONFIG_MISSING', 'Configuration Stripe indisponible.');
    }

    // Stripe Live remains explicitly OFF for LYANN. A live secret accidentally
    // placed in Vercel is rejected unless a separate intentional release flag is
    // enabled in a future production gate.
    if (
        IS_PRODUCTION
        && hasFinancialRoute
        && String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_')
        && process.env.STRIPE_LIVE_ENABLED !== 'true'
    ) {
        return jsonError(res, 503, 'STRIPE_LIVE_DISABLED', 'Stripe Live est désactivé.');
    }

    // Webhooks are authoritative financial inputs. In production, accepting an
    // unsigned body because a secret is missing is forbidden: fail closed.
    if (IS_PRODUCTION && hasStripeWebhook) {
        if (!process.env.STRIPE_WEBHOOK_SECRET) {
            return jsonError(res, 503, 'STRIPE_WEBHOOK_CONFIG_MISSING', 'Configuration webhook Stripe incomplète.');
        }
        if (!req.headers['stripe-signature']) {
            return jsonError(res, 400, 'STRIPE_SIGNATURE_REQUIRED', 'Signature Stripe requise.');
        }
    }

    // Global admin boundary. Individual routes may require finer permissions,
    // but no /v1/admin route is allowed to rely solely on route-local hygiene.
    if (IS_PRODUCTION && hasAdminRoute) {
        const admin = await verifyAdminRequest(req);
        if (!admin.ok) {
            const messages = {
                ADMIN_AUTH_REQUIRED: 'Authentification administrative requise.',
                ADMIN_TOKEN_INVALID: 'Jeton administrateur invalide ou expiré.',
                ADMIN_ACCESS_DENIED: 'Accès administrateur refusé.',
                ADMIN_SECURITY_CONFIG_MISSING: 'Configuration de sécurité administrateur indisponible.'
            };
            return jsonError(res, admin.status, admin.code, messages[admin.code]);
        }
    }

    return app(req, res, app.GATEWAY_TOKEN);
};
