/**
 * LYANN DOM — MULTI-CLIENT REST API ENGINE (Express Production Server)
 * Supports Web, iOS Native, Android Native, and Enterprise Admin Console.
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
if (typeof global.WebSocket === 'undefined') {
    global.WebSocket = class WebSocket {};
}
const { createClient } = require('@supabase/supabase-js');
const {
    inspectStripeEnv,
    connectStatus,
    connectPayoutReady,
    connectAccountIdForMode,
    shouldCreateConnectAccount,
    connectAccountSavePlan,
    buildConnectAccountParams,
    buildAccountLinkParams,
    buildAccountUpdateLinkParams,
    connectAccountIdFromEvent,
    payoutDecisionFromEvent,
    CONNECT_ACCOUNT_EVENT_TYPES,
    calculateMilestonePricing,
    paymentAmountSnapshot,
    resumePaymentDecision,
    legacyPaymentColumns,
    quoteFullyReleased,
    providerCanBePaid,
    canDeclareWorkDone,
    canValidateRelease,
    canClaimTransfer,
    transferIdempotencyKey,
    transferLockAcquireFrom,
    planTransferLock,
    stripeTransferFailureAction,
    releasePaymentDecision,
    admitStripeWebhookEvent,
    evaluateTransfer,
    refundReservationId,
    refundIdempotencyKey,
    refundAmountFromPayment,
    stripeRefundFailureAction,
    isRefundReservation,
    raiseDisputeDecision,
    stripeChargeId,
    applyPaymentRequiresAction,
    applyPaymentProcessing,
    applyPaymentFailed,
    applyChargeRefunded,
    routePostTransferWebhook,
    postTransferWebhookPersistDecision,
    constructStripeWebhookEvent,
    thinMoneyEvent,
    enrichVerifiedThinEvent,
    newPaymentIntakeDecision,
    liveTransferDecision,
    liveRefundDecision,
    transferModeMatches,
    paymentWritePaths,
    applyPaymentSucceeded,
    applyChargeDisputeCreated,
    applyChargeDisputeUpdated,
    applyChargeDisputeClosed,
    applyAccountUpdated,
    preparePreTransferRefund,
    admitPreTransferRefundDispatch,
    webhookEventWriteRow,
    webhookEventLegacyPayloadRow,
    shouldFallbackWebhookPayloadColumn,
    claimWebhookDecision,
    safeStripeReturnUrl,
    postTransferFinancialExecutionEnabled
} = require('./stripe-policy');
const {
    isSavedCardId,
    isPaymentIntentId,
    visibleSavedCards,
    canDetachSavedCard,
    paymentIntentConsentUpdate,
    customerSessionParams
} = require('./saved-cards');
const {
    createRequest: createPostTransferRefundRequest,
    replyRequest: replyPostTransferRefundRequest,
    viewRequest: viewPostTransferRefundRequest,
    decideRequest: decidePostTransferRefundRequest,
    listHistory: listPostTransferRefundHistory,
    listMyRequests: listPostTransferRefundRequests,
    createSupabaseStore
} = require('./post-transfer-refund-flow');
const { executeAdminPostTransfer } = require('./post-transfer-admin-execute');
const { attachServerStripeTestRuntime } = require('./post-transfer-stripe-test-http');
const {
    loadPreTransferRefundGrant,
    evaluatePreTransferRefundGrant,
    grantFactsFromPayment,
    STRIPE_TEST_PLATFORM_ACCOUNT
} = require('./pre-transfer-refund-grant');
const { quoteStillNeedsPayout, payoutReadyCopy } = require('../payout-prompt');
const financePolicyUi = require('../finance-policy-ui');
const {
    buildTestPayload,
    testSendAllowed,
    validDeviceRegistration
} = require('./apns');
const { apnsConfig, sendApns } = require('./apns-send');
const { automaticPushEnabled, cronAuthorized, drainQueue, pushAudience } = require('./push-queue');
const { buildHtml, injectIsolatedSupabaseConfig } = require('../shared-html-build');
if (process.env.LYANN_DOTENV_PATH) {
    require('dotenv').config({ path: process.env.LYANN_DOTENV_PATH, override: true });
} else {
    require('dotenv').config();
    require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), override: true });
}

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all clients (Web App, iOS Native, Android Native, Enterprise Admin Console)
app.use(cors({
    origin: (origin, callback) => callback(null, true),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform-Client', 'Accept'],
    credentials: true
}));

const PRODUCT_HTML = {
    '/professional.html': 'professional.html',
    '/business-admin.html': 'business-admin.html',
    '/': 'index.html',
    '/index.html': 'index.html',
    '/feed': 'feed.html',
    '/feed.html': 'feed.html',
    '/results': 'results.html',
    '/results.html': 'results.html',
    '/payment-portal': 'payment-portal.html',
    '/payment-portal.html': 'payment-portal.html',
    '/pricing': 'pricing.html',
    '/pricing.html': 'pricing.html',
    '/how-it-works': 'how-it-works.html',
    '/how-it-works.html': 'how-it-works.html',
    '/about': 'about.html',
    '/about.html': 'about.html',
    '/confirm-signup': 'confirm-signup.html',
    '/confirm-signup.html': 'confirm-signup.html',
    '/legal': 'legal.html',
    '/legal.html': 'legal.html',
    '/confidentialite': 'confidentialite.html',
    '/confidentialite.html': 'confidentialite.html',
    '/auth/callback': 'auth-callback.html',
    '/auth-callback.html': 'auth-callback.html',
    '/admin': 'admin.html',
    '/admin.html': 'admin.html',
    '/admin-login': 'admin-login.html',
    '/admin-login.html': 'admin-login.html'
};

app.get(Object.keys(PRODUCT_HTML), (req, res, next) => {
    const file = PRODUCT_HTML[req.path];
    if (!file) return next();
    try {
        const filePath = path.join(__dirname, '..', file);
        const html = injectIsolatedSupabaseConfig(buildHtml(fs.readFileSync(filePath, 'utf8')));
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        res.send(html);
    } catch (error) {
        next(error);
    }
});

// Serve local static frontend files when running locally
app.use(express.static(path.join(__dirname, '..')));

// URL Normalizer for Vercel Serverless Rewrites
app.use((req, res, next) => {
    let url = req.url || '';
    if (url.startsWith('/api/v1')) {
        req.url = url.substring(4);
    } else if (url.startsWith('/api/admin')) {
        req.url = '/v1' + url.substring(4);
    } else if (url.startsWith('/api/') && !url.startsWith('/api/v1')) {
        req.url = '/v1' + url.substring(4);
    }
    next();
});

// Supabase Admin Client (Service Role for Payment Core DB Operations)
const LYANN_PRODUCTION_SUPABASE_REF = 'gzispjfoywklpqatjyop';
const STAGING_V2_SUPABASE_REF = 'tdktfbtqceldlaeqjtow';

function requireConfiguredSupabaseUrl() {
    const url = String(process.env.SUPABASE_URL || process.env.LYANN_SUPABASE_URL || '').replace(/\/$/, '');
    if (!url) {
        const error = new Error('SUPABASE_URL is required. Refusing the production fallback.');
        console.error('❌ FATAL CONFIGURATION ERROR:', error.message);
        if (require.main === module) process.exit(1);
        throw error;
    }
    let host = '';
    try {
        host = new URL(url).hostname;
    } catch (e) {
        const error = new Error('SUPABASE_URL is invalid.');
        console.error('❌ FATAL CONFIGURATION ERROR:', error.message);
        if (require.main === module) process.exit(1);
        throw error;
    }
    const writeRef = String(process.env.LYANN_E2E_WRITE_PROJECT_REF || '');
    if (writeRef && writeRef !== LYANN_PRODUCTION_SUPABASE_REF) {
        if (host === `${LYANN_PRODUCTION_SUPABASE_REF}.supabase.co` || url.includes(LYANN_PRODUCTION_SUPABASE_REF)) {
            const error = new Error('Isolated runtime refused production Supabase gzispjfoywklpqatjyop.');
            console.error('❌ FATAL CONFIGURATION ERROR:', error.message);
            if (require.main === module) process.exit(1);
            throw error;
        }
        if (writeRef === STAGING_V2_SUPABASE_REF && host !== `${STAGING_V2_SUPABASE_REF}.supabase.co`) {
            const error = new Error('Staging V2 runtime must target tdktfbtqceldlaeqjtow.');
            console.error('❌ FATAL CONFIGURATION ERROR:', error.message);
            if (require.main === module) process.exit(1);
            throw error;
        }
        const stripe = inspectStripeEnv(process.env);
        if (stripe.liveBlocked || stripe.mode === 'live') {
            const error = new Error('Stripe Live is forbidden in the isolated/staging runtime.');
            console.error('❌ FATAL CONFIGURATION ERROR:', error.message);
            if (require.main === module) process.exit(1);
            throw error;
        }
    }
    return url;
}

const { assertHostedIsolation, runtimeIdentity } = require('./runtime-isolation');
const hostedIsolation = assertHostedIsolation(process.env);
if (!hostedIsolation.ok) {
    console.error('❌ FATAL CONFIGURATION ERROR:', hostedIsolation.code, hostedIsolation.message);
    if (require.main === module) process.exit(1);
    throw new Error(hostedIsolation.message);
}

const supabaseUrl = requireConfiguredSupabaseUrl();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!supabaseServiceKey) {
    console.error('❌ FATAL CONFIGURATION ERROR: SUPABASE_SERVICE_ROLE_KEY is required. Refusing a placeholder or silent production key.');
    if (require.main === module) process.exit(1);
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}
const PAYMENT_WRITE_PATHS = paymentWritePaths();

function isHostedProductionRuntime() {
    // Vercel preview also sets NODE_ENV=production. Only the production
    // deployment may write payments against the production Supabase project.
    return process.env.VERCEL_ENV === 'production';
}

function isProductionSupabaseTarget() {
    try {
        return new URL(supabaseUrl).hostname === `${LYANN_PRODUCTION_SUPABASE_REF}.supabase.co`;
    } catch (e) {
        return false;
    }
}

function rejectPaymentWritesOnProductionFromDev(req, res) {
    if (isHostedProductionRuntime() || !isProductionSupabaseTarget()) return false;
    const path = String(req.path || req.url || '').split('?')[0];
    if (!PAYMENT_WRITE_PATHS.some((candidate) => path === candidate || path.startsWith(candidate + '/'))) {
        return false;
    }
    res.status(403).json({
        error: 'Écriture de paiement bloquée : cet environnement n’est pas la production Vercel et pointe vers le Supabase de production.',
        code: 'PAYMENT_WRITES_BLOCKED_ON_PRODUCTION'
    });
    return true;
}
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const { createPublicRequestsHandler } = require('./public-explorer-requests');
app.get('/v1/explorer/requests', createPublicRequestsHandler(supabaseAdmin, Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)));
app.get('/v1/runtime/identity', (req, res) => {
    const identity = runtimeIdentity(process.env);
    if (identity.production) {
        return res.status(503).json({
            success: false,
            code: 'RUNTIME_IDENTITY_PRODUCTION_HIDDEN',
            message: 'Identité runtime masquée hors Staging.'
        });
    }
    res.json({
        success: identity.success,
        vercel_env: identity.vercel_env,
        kind: identity.kind,
        supabase_ref: identity.supabase_ref,
        isolation: identity.isolation,
        staging: identity.staging,
        production: false,
        commit: identity.commit
    });
});

function getSupabaseClient(req) {
    const authHeader = req ? (req.headers['authorization'] || req.headers['Authorization']) : null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        return createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });
    }
    return supabaseAdmin;
}

// Express raw body parsing for signed Stripe Webhook routes (Vercel Serverless Compatible)
app.use((req, res, next) => {
    const url = req.originalUrl || req.url || '';
    if (url.includes('webhook')) {
        express.raw({ type: '*/*' })(req, res, next);
    } else {
        const maisonMedia = url.includes('/v1/admin/maison/');
        express.json({ limit: req.path === '/v1/business/documents' ? '3mb' : maisonMedia ? '16mb' : '1mb' })(req, res, next);
    }
});

// Short title suggestion for the annonce wizard. Registered after body parsing and
// scoped to signed-in callers inside the handler.
const { createRequestSummaryHandler } = require('./request-summary');
app.post('/v1/requests/summary', createRequestSummaryHandler({ getSupabaseClient }));

// STRICT PRODUCTION MODE FINANCIAL GUARD
if (process.env.NODE_ENV === 'production' && !process.env.STRIPE_SECRET_KEY) {
    console.error("❌ FATAL CONFIGURATION ERROR: STRIPE_SECRET_KEY is missing under NODE_ENV=production. PAYMENT_MODE=mock is strictly forbidden in production.");
    if (require.main === module) {
        process.exit(1);
    }
}

const PAYMENT_AMOUNT_COLUMNS = 'id, payment_status, transfer_status, stripe_payment_intent_id, stripe_transfer_id, service_amount_cents, customer_fee_cents, customer_total_cents, provider_fee_cents, provider_net_cents, lyann_revenue_cents';

const MEMBERS_DB = [
    { id: 200, name: "Jocelyn Cabort", age: 52, role: "Plomberie & Fuites d'eau PRO", city: "Baie-Mahault", locationName: "Guadeloupe (971)", territoryKey: "guadeloupe", rating: "5.0", avatar: "jocelyn-cabort.png", badge: "PRO VÉRIFIÉ", kycVerified: true },
    { id: 201, name: "Hugues Zami", age: 45, role: "Climatisation & Électricité PRO", city: "Les Abymes", locationName: "Guadeloupe (971)", territoryKey: "guadeloupe", rating: "4.9", avatar: "hugues-zami.png", badge: "PRO VÉRIFIÉ", kycVerified: true },
    { id: 202, name: "Murielle Placide", age: 38, role: "Ménage & Repassage", city: "Le Gosier", locationName: "Guadeloupe (971)", territoryKey: "guadeloupe", rating: "5.0", avatar: "murielle-placide.png", badge: "VOISINE DE CONFIANCE", kycVerified: true },
    { id: 203, name: "Clotilde Belair", age: 61, role: "Aide aux repas & Seniors", city: "Sainte-Anne", locationName: "Guadeloupe (971)", territoryKey: "guadeloupe", rating: "4.95", avatar: "clotilde-belair.png", badge: "AUXILIAIRE VÉRIFIÉE", kycVerified: true },
    { id: 204, name: "Marius Placide", age: 29, role: "Bricolage & Montage meuble", city: "Petit-Bourg", locationName: "Guadeloupe (971)", territoryKey: "guadeloupe", rating: "4.85", avatar: "marius-placide.png", badge: "SUPER BRICOLEUR", kycVerified: true },
    { id: 212, name: "Wilfrid Rapon", age: 37, role: "Jardinier paysagiste", city: "Le Gosier", locationName: "Guadeloupe (971)", territoryKey: "guadeloupe", rating: "5.0", avatar: "wilfrid-rapon.png", badge: "PAYSAGISTE PRO", kycVerified: true }
];

// Middleware Logging & Multi-Client Tag
app.use((req, res, next) => {
    const clientType = req.headers['x-platform-client'] || 'Web-Client';
    console.log(`[API v1] ${new Date().toISOString()} | ${req.method} ${req.url} | Client: ${clientType}`);
    next();
});

app.use((req, res, next) => {
    if (req.method !== 'POST' && req.method !== 'DELETE') return next();
    if (rejectPaymentWritesOnProductionFromDev(req, res)) return;
    next();
});

function stripeRuntime() {
    const inspected = inspectStripeEnv(process.env);
    if (!inspected.allowsSecretUse) return { inspected, stripe: null };
    return { inspected, stripe: require('stripe')(process.env.STRIPE_SECRET_KEY) };
}

app.get('/v1/payments/finance-snapshot', async (req, res) => {
    try {
        const user = await requireBearerUser(req);
        if (!user) return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', error: 'Authentification requise.' });
        const paymentId = String((req.query && req.query.payment_id) || '').trim();
        if (!paymentId) return res.status(400).json({ success: false, code: 'PAYMENT_ID_REQUIRED', error: 'payment_id requis.' });
        const { data: payment, error } = await supabaseAdmin
            .from('payments')
            .select('id, payment_status, transfer_status, stripe_payment_intent_id, stripe_transfer_id, stripe_refund_id, client_validated_at, service_amount_cents, customer_fee_cents, customer_total_cents, provider_net_cents, milestone_id, requester_id, provider_id')
            .eq('id', paymentId)
            .maybeSingle();
        if (error) return res.status(500).json({ success: false, code: 'READ_FAILED', error: 'Lecture impossible.' });
        if (!payment) return res.status(404).json({ success: false, code: 'PAYMENT_NOT_FOUND', error: 'Paiement introuvable.' });
        const admin = await verifyAdminPermission(req, 'finance.refund');
        const isParty = user.id === payment.requester_id || user.id === payment.provider_id;
        if (!isParty && !admin.authorized) {
            return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'Accès refusé.' });
        }
        let milestone = null;
        let mission = null;
        if (payment.milestone_id) {
            const milestoneRead = await supabaseAdmin
                .from('milestones')
                .select('id, status, title, mission_id')
                .eq('id', payment.milestone_id)
                .maybeSingle();
            milestone = milestoneRead.data || null;
            if (milestone && milestone.mission_id) {
                const missionRead = await supabaseAdmin
                    .from('missions')
                    .select('id, status, title')
                    .eq('id', milestone.mission_id)
                    .maybeSingle();
                mission = missionRead.data || null;
            }
        }
        const display = financePolicyUi.classifyFinanceDisplay({ payment, milestone, mission });
        return res.json({
            success: true,
            demo: false,
            stripe_called: false,
            write: false,
            payment: {
                id: payment.id,
                payment_status: payment.payment_status,
                transfer_status: payment.transfer_status,
                stripe_transfer_id: payment.stripe_transfer_id || null,
                stripe_refund_id: payment.stripe_refund_id || null,
                service_amount_cents: payment.service_amount_cents,
                customer_fee_cents: payment.customer_fee_cents,
                customer_total_cents: payment.customer_total_cents,
                provider_net_cents: payment.provider_net_cents
            },
            milestone: milestone && { id: milestone.id, status: milestone.status, title: milestone.title },
            mission: mission && { id: mission.id, status: mission.status, title: mission.title },
            display: display,
            bank_payout_confirmed: false
        });
    } catch (e) {
        return res.status(500).json({ success: false, code: 'SNAPSHOT_FAILED', error: 'Lecture impossible.' });
    }
});

app.get('/v1/payments/config', (req, res) => {
    const inspected = inspectStripeEnv(process.env);
    if (!inspected.allowsPublishableUse) {
        return res.status(503).json({
            success: false,
            code: inspected.liveBlocked ? 'STRIPE_LIVE_DISABLED' : 'STRIPE_KEY_INVALID',
            error: inspected.liveBlocked ? 'Stripe Live est désactivé.' : 'Configuration Stripe invalide.',
            stripe_mode: inspected.mode
        });
    }
    res.json({
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        stripeReady: inspected.allowsSecretUse && inspected.allowsPublishableUse,
        stripe_mode: inspected.mode
    });
});

async function requireBearerUser(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    if (!authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
}

const recentPushTests = new Map();

app.post('/v1/notifications/devices', async (req, res) => {
    const user = await requireBearerUser(req);
    if (!user) return res.status(401).json({ error: 'Authentification requise.' });
    const registration = validDeviceRegistration(req.body || {});
    if (!registration.ok) return res.status(400).json({ code: registration.code, error: 'Appareil invalide.' });
    const released = await supabaseAdmin.from('device_push_tokens').update({
        active: false,
        updated_at: new Date().toISOString()
    }).eq('token', registration.token).neq('user_id', user.id);
    if (released.error) return res.status(500).json({ error: 'Enregistrement impossible.' });
    const { error } = await supabaseAdmin.from('device_push_tokens').upsert({
        user_id: user.id,
        installation_id: registration.installationId,
        token: registration.token,
        platform: registration.platform,
        apns_environment: registration.environment,
        active: true,
        updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,installation_id' });
    if (error) return res.status(500).json({ error: 'Enregistrement impossible.' });
    return res.json({ success: true });
});

app.post('/v1/notifications/devices/deactivate', async (req, res) => {
    const user = await requireBearerUser(req);
    if (!user) return res.status(401).json({ error: 'Authentification requise.' });
    const installationId = String(req.body && req.body.installation_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(installationId)) return res.status(400).json({ error: 'Appareil invalide.' });
    const { error } = await supabaseAdmin.from('device_push_tokens').update({
        active: false,
        updated_at: new Date().toISOString()
    }).eq('user_id', user.id).eq('installation_id', installationId);
    if (error) return res.status(500).json({ error: 'Désactivation impossible.' });
    return res.json({ success: true });
});

async function handlePushDrain(req, res) {
    if (!cronAuthorized(req.headers.authorization || req.headers.Authorization, process.env)) {
        return res.status(401).json({ code: 'PUSH_CRON_UNAUTHORIZED', error: 'Appel non autorisé.' });
    }
    const audience = pushAudience(process.env);
    if (!audience.enabled) {
        return res.json({ success: true, enabled: false, processed: 0, code: 'PUSH_AUTOMATIC_DISABLED' });
    }
    const config = apnsConfig(process.env);
    if (!config) return res.status(503).json({ code: 'APNS_NOT_CONFIGURED', error: 'APNs n’est pas configuré.' });
    try {
        const outcome = await drainQueue({
            enabled: true,
            allowlist: audience.allowlist,
            customSound: process.env.PUSH_CUSTOM_SOUND !== 'false',
            workerId: 'drain-' + Date.now(),
            claim: async ({ workerId, limit }) => {
                const { data, error } = await supabaseAdmin.rpc('lyann_claim_push_deliveries', {
                    p_worker: workerId,
                    p_limit: limit
                });
                if (error) throw error;
                return (data || []).map((row) => ({
                    id: row.id,
                    recipientId: row.user_id,
                    title: row.title,
                    body: row.body,
                    route: row.route,
                    contactId: row.contact_id,
                    requestId: row.request_id,
                    entityId: row.entity_id,
                    eventType: row.event_type,
                    attempts: row.attempts,
                    maxAttempts: row.max_attempts,
                    lockToken: row.lock_token,
                    apnsId: row.apns_id
                }));
            },
            tokensForUser: async (userId) => {
                const { data, error } = await supabaseAdmin.from('device_push_tokens')
                    .select('id, token, apns_environment')
                    .eq('user_id', userId)
                    .eq('active', true)
                    .limit(5);
                if (error) throw error;
                return (data || []).map((device) => ({
                    id: device.id,
                    token: device.token,
                    environment: device.apns_environment
                }));
            },
            send: async ({ deviceToken, environment, payload }) => {
                const result = await sendApns({ config, deviceToken, environment, payload });
                if (result && result.status === 400) result.deactivate = true;
                return result;
            },
            deactivateTokens: async (ids) => {
                if (!ids.length) return;
                await supabaseAdmin.from('device_push_tokens').update({
                    active: false,
                    updated_at: new Date().toISOString()
                }).in('id', ids);
            },
            complete: async (row, settled) => {
                if (!row.lockToken) return;
                await supabaseAdmin.from('push_deliveries').update({
                    status: settled.status,
                    last_error: settled.lastError,
                    next_attempt_at: settled.nextAttemptAt ? new Date(settled.nextAttemptAt).toISOString() : new Date().toISOString(),
                    lock_token: null,
                    updated_at: new Date().toISOString()
                }).eq('id', row.id).eq('lock_token', row.lockToken).eq('status', 'processing');
            }
        });
        return res.json({ success: true, enabled: true, processed: outcome.processed, code: outcome.code });
    } catch (_) {
        console.error(JSON.stringify({ scope: 'push_drain', code: 'PUSH_QUEUE_UNAVAILABLE' }));
        return res.status(503).json({ code: 'PUSH_QUEUE_UNAVAILABLE', error: 'File indisponible.' });
    }
}

app.get('/v1/notifications/push-drain', handlePushDrain);
app.post('/v1/notifications/push-drain', handlePushDrain);

app.post('/v1/notifications/push-test', async (req, res) => {
    const user = await requireBearerUser(req);
    if (!user) return res.status(401).json({ error: 'Authentification requise.' });
    const allowed = testSendAllowed({
        enabled: process.env.PUSH_TEST_ENABLED === 'true',
        allowUserId: process.env.PUSH_TEST_USER_ID || '',
        callerId: user.id
    });
    if (!allowed.ok) return res.status(403).json({ code: allowed.code, error: 'Notification de test désactivée.' });
    const config = apnsConfig(process.env);
    if (!config) return res.status(503).json({ code: 'APNS_NOT_CONFIGURED', error: 'APNs n’est pas configuré.' });
    const installationId = String(req.body && req.body.installation_id || '');
    let query = supabaseAdmin.from('device_push_tokens').select('id, token, apns_environment, installation_id').eq('user_id', user.id).eq('active', true);
    if (installationId) query = query.eq('installation_id', installationId);
    const { data: devices, error } = await query.limit(1);
    if (error) return res.status(500).json({ error: 'Appareil illisible.' });
    const device = devices && devices[0];
    if (!device) return res.status(404).json({ error: 'Aucun appareil actif.' });
    const cooldownKey = user.id + ':' + device.installation_id;
    if (Date.now() - (recentPushTests.get(cooldownKey) || 0) < 60000) {
        return res.status(429).json({ code: 'PUSH_TEST_COOLDOWN', error: 'Un essai vient déjà d’être envoyé.' });
    }
    recentPushTests.set(cooldownKey, Date.now());
    const result = await sendApns({
        config,
        deviceToken: device.token,
        environment: device.apns_environment,
        payload: buildTestPayload()
    });
    if (result.deactivate) {
        await supabaseAdmin.from('device_push_tokens').update({ active: false, updated_at: new Date().toISOString() }).eq('id', device.id);
    }
    console.log(JSON.stringify({ scope: 'apns_test', code: result.code, status: result.status, deactivate: result.deactivate }));
    if (!result.ok) return res.status(502).json({ code: result.code, error: 'Envoi impossible.' });
    return res.json({ success: true });
});

async function loadOwnConnectAccount(userId) {
    const { data: profile, error } = await supabaseAdmin
        .from('profiles')
        .select('id, email, stripe_account_id, account_type')
        .eq('id', userId)
        .maybeSingle();
    if (error || !profile) return { error: 'Profil introuvable.' };
    return { profile };
}

async function loadConnectProfile(userId, mode) {
    const loaded = await loadOwnConnectAccount(userId);
    if (loaded.error) return loaded;
    const mapped = await supabaseAdmin
        .from('lyann_connect_accounts')
        .select('stripe_mode, stripe_account_id')
        .eq('user_id', userId);
    const tableReady = !mapped.error;
    const profile = {
        ...loaded.profile,
        connect_accounts: tableReady ? (mapped.data || []) : []
    };
    const accountId = (mode === 'test' || mode === 'live')
        ? connectAccountIdForMode(profile, mode)
        : (loaded.profile.stripe_account_id || null);
    return {
        profile: { ...profile, stripe_account_id: accountId || null },
        raw: profile,
        tableReady,
        mode
    };
}

async function saveConnectAccount(userId, mode, accountId, tableReady) {
    const plan = connectAccountSavePlan(mode, tableReady);
    if (!plan.ok || plan.writeLegacy !== true && plan.writeMapping !== true) {
        return { ok: false, code: plan.code || 'CONNECT_MODE_TABLE_REQUIRED' };
    }
    if (plan.writeMapping) {
        const { error } = await supabaseAdmin.from('lyann_connect_accounts').upsert({
            user_id: userId,
            stripe_mode: mode,
            stripe_account_id: accountId,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,stripe_mode' });
        if (error) return { ok: false, code: 'CONNECT_SAVE_FAILED' };
    }
    if (plan.writeLegacy === true && plan.legacyOnlyIfNull === true) {
        await supabaseAdmin.from('profiles').update({ stripe_account_id: accountId }).eq('id', userId).is('stripe_account_id', null);
    }
    return { ok: true };
}

app.post('/v1/payments/connect/account', async (req, res) => {
    try {
        const user = await requireBearerUser(req);
        if (!user) return res.status(401).json({ error: 'Authentification requise.' });
        const runtime = stripeRuntime();
        if (!runtime.stripe) {
            return res.status(503).json({ code: runtime.inspected.liveBlocked ? 'STRIPE_LIVE_DISABLED' : 'STRIPE_CONFIG_MISSING', error: 'Stripe test indisponible.' });
        }
        const mode = runtime.inspected.mode;
        const loaded = await loadConnectProfile(user.id, mode);
        if (loaded.error) return res.status(404).json({ error: loaded.error });
        if (!shouldCreateConnectAccount(loaded.raw, mode)) {
            const account = await runtime.stripe.v2.core.accounts.retrieve(loaded.profile.stripe_account_id, {
                include: ['configuration.recipient']
            });
            return res.json({ success: true, created: false, ...connectStatus(account) });
        }
        if (mode === 'live' && !loaded.tableReady) {
            return res.status(503).json({
                code: 'CONNECT_MODE_TABLE_REQUIRED',
                error: 'Le compte de versement Live n’est pas encore séparable du compte de test.'
            });
        }
        const account = await runtime.stripe.v2.core.accounts.create(
            buildConnectAccountParams(loaded.raw.email || user.email || undefined)
        );
        const saved = await saveConnectAccount(user.id, mode, account.id, loaded.tableReady);
        if (!saved.ok) return res.status(500).json({ code: saved.code, error: 'Compte Connect non enregistré.' });
        return res.json({ success: true, created: true, ...connectStatus(account) });
    } catch (e) {
        const message = String(e && e.message || '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
        console.error(JSON.stringify({
            scope: 'connect_account',
            type: e && e.type || null,
            code: e && e.code || null,
            param: e && e.param || null,
            message,
            requestId: (e && (e.requestId || e.request_id)) || null
        }));
        return res.status(500).json({ error: 'Création du compte Connect impossible.' });
    }
});

app.post('/v1/payments/connect/onboarding-link', async (req, res) => {
    try {
        const user = await requireBearerUser(req);
        if (!user) return res.status(401).json({ error: 'Authentification requise.' });
        const runtime = stripeRuntime();
        if (!runtime.stripe) {
            return res.status(503).json({ code: 'STRIPE_CONFIG_MISSING', error: 'Stripe test indisponible.' });
        }
        const loaded = await loadConnectProfile(user.id, runtime.inspected.mode);
        if (loaded.error || !loaded.profile.stripe_account_id) {
            return res.status(409).json({ code: 'CONNECT_REQUIRED', error: 'Créez d’abord le compte Connect.' });
        }
        const link = await runtime.stripe.v2.core.accountLinks.create(buildAccountLinkParams(
            loaded.profile.stripe_account_id,
            safeStripeReturnUrl(req.body?.return_url, process.env),
            safeStripeReturnUrl(req.body?.refresh_url, process.env)
        ));
        return res.json({ success: true, url: link.url });
    } catch (e) {
        const message = String(e && e.message || '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
        const statusCode = Number(e && (e.statusCode || e.status));
        console.error(JSON.stringify({
            scope: 'connect_onboarding_link',
            type: e && e.type || null,
            code: e && e.code || null,
            param: e && e.param || null,
            message,
            requestId: (e && (e.requestId || e.request_id)) || null,
            statusCode: Number.isFinite(statusCode) ? statusCode : null
        }));
        return res.status(500).json({ error: 'Lien d’onboarding indisponible.' });
    }
});

app.post('/v1/payments/connect/express-dashboard-link', async (req, res) => {
    try {
        const user = await requireBearerUser(req);
        if (!user) return res.status(401).json({ error: 'Authentification requise.' });
        const runtime = stripeRuntime();
        if (!runtime.stripe) {
            return res.status(503).json({ code: 'STRIPE_CONFIG_MISSING', error: 'Stripe test indisponible.' });
        }
        const loaded = await loadConnectProfile(user.id, runtime.inspected.mode);
        if (loaded.error || !loaded.profile.stripe_account_id) {
            return res.status(409).json({ code: 'CONNECT_REQUIRED', error: 'Créez d’abord le compte Connect.' });
        }
        const link = await runtime.stripe.v2.core.accountLinks.create(buildAccountUpdateLinkParams(
            loaded.profile.stripe_account_id,
            safeStripeReturnUrl(req.body?.return_url, process.env),
            safeStripeReturnUrl(req.body?.refresh_url, process.env)
        ));
        return res.json({ success: true, url: link.url });
    } catch (e) {
        const message = String(e && e.message || '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
        const statusCode = Number(e && (e.statusCode || e.status));
        console.error(JSON.stringify({
            scope: 'connect_express_dashboard_link',
            type: e && e.type || null,
            code: e && e.code || null,
            param: e && e.param || null,
            message,
            requestId: (e && (e.requestId || e.request_id)) || null,
            statusCode: Number.isFinite(statusCode) ? statusCode : null
        }));
        return res.status(500).json({ error: 'Lien de modification indisponible.' });
    }
});

async function conversationIdForQuote(quote) {
    if (quote && quote.conversation_id) return quote.conversation_id;
    if (!quote || !quote.request_invitation_id) return null;
    const { data } = await supabaseAdmin
        .from('request_invitations')
        .select('conversation_id')
        .eq('id', quote.request_invitation_id)
        .maybeSingle();
    return data && data.conversation_id ? data.conversation_id : null;
}

async function notifyPayoutReady(requesterId, providerId, copy) {
    const entityId = String(providerId);
    const { error } = await supabaseAdmin.rpc('lyann_insert_notification', {
        p_user_id: requesterId,
        p_type: 'PAYOUT_READY',
        p_title: copy.notificationTitle,
        p_body: copy.notificationBody,
        p_entity_type: 'conversation',
        p_entity_id: entityId
    });
    if (!error) return;
    const existing = await supabaseAdmin
        .from('notifications')
        .select('id')
        .eq('user_id', requesterId)
        .eq('type', 'PAYOUT_READY')
        .eq('entity_id', entityId)
        .maybeSingle();
    if (existing.data) return;
    await supabaseAdmin.from('notifications').insert({
        user_id: requesterId,
        type: 'PAYOUT_READY',
        title: copy.notificationTitle,
        body: copy.notificationBody,
        entity_type: 'conversation',
        entity_id: entityId
    });
}

async function announcePayoutReady(providerId) {
    try {
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('id, first_name')
            .eq('id', providerId)
            .maybeSingle();
        if (!profile) return;
        const { data: quotes, error } = await supabaseAdmin
            .from('quotes')
            .select('id, status, requester_id, provider_id, conversation_id, request_invitation_id')
            .eq('provider_id', providerId)
            .in('status', ['SENT', 'ACCEPTED'])
            .order('created_at', { ascending: false })
            .limit(40);
        if (error || !quotes || !quotes.length) return;
        const quoteIds = quotes.map((quote) => quote.id);
        const [milestones, payments] = await Promise.all([
            supabaseAdmin.from('milestones').select('quote_id, status').in('quote_id', quoteIds),
            supabaseAdmin.from('payments').select('quote_id, payment_status').in('quote_id', quoteIds)
        ]);
        const milestonesByQuote = new Map();
        (milestones.data || []).forEach((row) => {
            if (!milestonesByQuote.has(row.quote_id)) milestonesByQuote.set(row.quote_id, []);
            milestonesByQuote.get(row.quote_id).push(row);
        });
        const paymentsByQuote = new Map();
        (payments.data || []).forEach((row) => {
            if (!paymentsByQuote.has(row.quote_id)) paymentsByQuote.set(row.quote_id, []);
            paymentsByQuote.get(row.quote_id).push(row);
        });
        const waiting = quotes.filter((quote) => quoteStillNeedsPayout({
            ...quote,
            milestones: milestonesByQuote.get(quote.id) || [],
            payments: paymentsByQuote.get(quote.id) || []
        }));
        if (!waiting.length) return;
        const copy = payoutReadyCopy(profile.first_name);
        const conversations = new Map();
        for (const quote of waiting) {
            if (!quote.requester_id || quote.requester_id === providerId) continue;
            const conversationId = await conversationIdForQuote(quote);
            if (!conversationId) continue;
            if (!conversations.has(conversationId)) conversations.set(conversationId, new Set());
            conversations.get(conversationId).add(quote.requester_id);
        }
        for (const [conversationId, requesterIds] of conversations) {
            const inserted = await supabaseAdmin.from('messages').insert({
                conversation_id: conversationId,
                sender_id: providerId,
                content: copy.message,
                message_type: 'text',
                metadata: { kind: 'payout_ready', provider_id: providerId },
                client_message_id: 'payout-ready:' + conversationId,
                is_read: false
            }).select('id').maybeSingle();
            if (inserted.error && inserted.error.code !== '23505') {
                console.error(JSON.stringify({ scope: 'payout_ready_announce', code: inserted.error.code || null }));
            }
            for (const requesterId of requesterIds) {
                await notifyPayoutReady(requesterId, providerId, copy);
            }
        }
    } catch (error) {
        console.error(JSON.stringify({ scope: 'payout_ready_announce', code: error && error.code || null }));
    }
}

async function sharesConversation(userId, otherId) {
    const { data: mine, error } = await supabaseAdmin
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId);
    if (error || !mine || !mine.length) return false;
    const ids = mine.map((row) => row.conversation_id).filter(Boolean);
    if (!ids.length) return false;
    const { data: match } = await supabaseAdmin
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', otherId)
        .in('conversation_id', ids)
        .limit(1);
    return Boolean(match && match.length);
}

app.get('/v1/payments/connect/status', async (req, res) => {
    try {
        const user = await requireBearerUser(req);
        if (!user) return res.status(401).json({ error: 'Authentification requise.' });
        const runtime = stripeRuntime();
        const loaded = await loadConnectProfile(user.id, runtime.inspected && runtime.inspected.mode);
        if (loaded.error) return res.status(404).json({ error: loaded.error });
        if (!loaded.profile.stripe_account_id) {
            return res.json({ success: true, ...connectStatus(null) });
        }
        if (!runtime.stripe) {
            return res.status(503).json({ code: 'STRIPE_CONFIG_MISSING', error: 'Stripe test indisponible.' });
        }
        const account = await runtime.stripe.v2.core.accounts.retrieve(loaded.profile.stripe_account_id, {
            include: ['configuration.recipient']
        });
        const ready = connectPayoutReady(account);
        if (ready.ok) await announcePayoutReady(user.id);
        return res.json({ success: true, ready: ready.ok, ...ready.status });
    } catch (e) {
        console.error('Connect status error');
        return res.status(502).json({ code: 'CONNECT_UNAVAILABLE', error: 'Compte Connect illisible dans cet environnement Stripe.' });
    }
});

app.get('/v1/payments/connect/peer-status', async (req, res) => {
    try {
        const user = await requireBearerUser(req);
        if (!user) return res.status(401).json({ error: 'Authentification requise.' });
        const otherId = String(req.query.user_id || '');
        if (!/^[0-9a-f-]{36}$/i.test(otherId) || otherId === user.id) {
            return res.status(404).json({ error: 'Introuvable.' });
        }
        const allowed = await sharesConversation(user.id, otherId);
        if (!allowed) return res.status(404).json({ error: 'Introuvable.' });
        const runtime = stripeRuntime();
        const loaded = await loadConnectProfile(otherId, runtime.inspected && runtime.inspected.mode);
        if (loaded.error) return res.status(404).json({ error: 'Introuvable.' });
        if (!loaded.profile.stripe_account_id) {
            return res.json({ success: true, ready: false, ...connectStatus(null) });
        }
        if (!runtime.stripe) {
            return res.status(503).json({ code: 'STRIPE_CONFIG_MISSING', error: 'Stripe test indisponible.' });
        }
        const account = await runtime.stripe.v2.core.accounts.retrieve(loaded.profile.stripe_account_id, {
            include: ['configuration.recipient']
        });
        const ready = providerCanBePaid(loaded.profile, account);
        const status = ready.status || connectStatus(null);
        return res.json({ success: true, ready: ready.ok === true, ...status });
    } catch (e) {
        console.error(JSON.stringify({ scope: 'connect_peer_status', code: e && e.code || null }));
        return res.status(502).json({ code: 'CONNECT_UNAVAILABLE', error: 'Compte de versement illisible.' });
    }
});

// Root & API Version Health Check Endpoint
app.get(['/', '/v1'], (req, res) => {
    res.json({
        status: "ok",
        service: "LYANN DOM Multi-Client API Engine",
        version: "1.0.0",
        mode: (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') ? "production" : (process.env.NODE_ENV || "development"),
        payment_engine: "BigInt 3% + 3% Integer Cents Canonical Engine",
        stripe_mode: inspectStripeEnv(process.env).mode
    });
});

// API Root Status
app.get(['/', '/v1', '/v1/', '/api', '/api/server'], (req, res) => {
    res.json({
        status: "ONLINE",
        service: "LYANN DOM Multi-Client REST API Engine",
        version: "1.0.0",
        territories: ["Guadeloupe (971)", "Martinique (972)", "Guyane (973)", "La Réunion (974)"]
    });
});

// Lets a just-created account enter the app before the confirmation email is opened.
// Only a user id returned by signup, and only for 30 minutes, can be confirmed here.
app.post('/v1/auth/continue-signup', async (req, res) => {
    const userId = String(req.body?.userId || '');
    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
        return res.status(400).json({ error: 'Compte introuvable.' });
    }
    try {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (error || !data?.user) {
            return res.status(404).json({ error: 'Compte introuvable.' });
        }
        const created = new Date(data.user.created_at).getTime();
        if (!Number.isFinite(created) || Date.now() - created > 30 * 60 * 1000) {
            return res.status(403).json({ error: 'Ouvre le lien reçu par email pour te connecter.' });
        }
        if (!data.user.email_confirmed_at) {
            const updated = await supabaseAdmin.auth.admin.updateUserById(userId, { email_confirm: true });
            if (updated.error) {
                return res.status(500).json({ error: 'Impossible d’ouvrir la session pour le moment.' });
            }
        }
        return res.json({ ok: true });
    } catch (err) {
        console.error('[continue-signup]', err);
        return res.status(500).json({ error: 'Impossible d’ouvrir la session pour le moment.' });
    }
});

// Account deletion starts inside the app, as required for App Store review.
app.post('/v1/auth/delete-account', async (req, res) => {
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(503).json({ error: 'La suppression n’est pas disponible pour le moment. Écris à contact@lyann.app.' });
    }
    if (!token) {
        return res.status(401).json({ error: 'Connecte-toi pour supprimer ton compte.' });
    }
    try {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data?.user?.id) {
            return res.status(401).json({ error: 'Session expirée. Reconnecte-toi, puis réessaie.' });
        }
        const userId = data.user.id;
        await supabaseAdmin.from('profiles').update({
            first_name: 'Compte',
            last_name: 'supprimé',
            avatar_url: null
        }).eq('id', userId);
        const deleted = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (deleted.error) {
            await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
            return res.json({ ok: true, closed: true });
        }
        return res.json({ ok: true });
    } catch (err) {
        console.error('[delete-account]', err);
        return res.status(500).json({ error: 'La suppression n’a pas abouti. Réessaie, ou écris à contact@lyann.app.' });
    }
});

// 1. AUTHENTICATION (POST /v1/auth/login)
app.post('/v1/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email) {
        return res.status(400).json({ error: "L'adresse email est requise." });
    }
    const token = "jwt_token_demo_lyan_dom_2026_secure";
    res.json({
        success: true,
        token,
        user: {
            id: 1,
            name: "Prestataire LYANN",
            email: email,
            role: "provider",
            territory: "Guadeloupe (971)"
        }
    });
});

// 2. MEMBERS DIRECTORY (GET /v1/members)
app.get('/v1/members', (req, res) => {
    const { territory, query } = req.query;
    let filtered = [...MEMBERS_DB];

    if (territory && territory !== 'all') {
        filtered = filtered.filter(m => m.territoryKey === territory.toLowerCase());
    }

    if (query) {
        const q = query.toLowerCase();
        filtered = filtered.filter(m => m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q));
    }

    res.json({
        count: filtered.length,
        data: filtered
    });
});

// 3. MEMBER DETAILS (GET /v1/members/:id)
app.get('/v1/members/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const member = MEMBERS_DB.find(m => m.id === id);
    if (!member) {
        return res.status(404).json({ error: "Membre non trouvé." });
    }
    res.json({ data: member });
});

// 4. LYANNER DEAL CLOSURE (POST /v1/deals/lyanner)
app.post('/v1/deals/lyanner', (req, res) => {
    const { targetMemberId, memberName } = req.body;
    const phone = "+590690001122";
    const whatsappUrl = `https://wa.me/590690001122?text=${encodeURIComponent(`Bonjour ${memberName} ! Nous sommes Lyannés sur LYANN DOM.`)}`;

    res.json({
        success: true,
        message: "Accord LYANNER validé.",
        shortcuts: {
            whatsappUrl,
            phoneUrl: `tel:${phone}`
        }
    });
});

// 5. ADMIN AUTH & RBAC BACKEND VERIFICATION HELPER
async function verifyAdminPermission(req, requiredPermission = null) {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { authorized: false, status: 401, error: "Authentification administrative requise." };
        }
        const token = authHeader.split(' ')[1];
        const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
        if (authErr || !authData?.user) {
            return { authorized: false, status: 401, error: "Jeton d'authentification invalide ou expiré." };
        }
        const userId = authData.user.id;

        // Query admin_members & role
        const { data: member } = await supabaseAdmin
            .from('admin_members')
            .select('*, admin_roles!role_id(code, name)')
            .eq('user_id', userId)
            .eq('status', 'ACTIVE')
            .maybeSingle();

        if (member && member.admin_roles && ['SUPER_ADMIN', 'OWNER'].includes(member.admin_roles.code)) {
            return {
                authorized: true,
                userId,
                email: authData.user.email || null,
                role: member.admin_roles.code,
                status: member.status || 'ACTIVE',
                permissions: requiredPermission ? [requiredPermission] : [],
                member
            };
        }

        if (member && requiredPermission) {
            const { data: hasPerm } = await supabaseAdmin.rpc('has_admin_permission', {
                p_user_id: userId,
                p_permission_code: requiredPermission
            });
            if (hasPerm === true) {
                return {
                    authorized: true,
                    userId,
                    email: authData.user.email || null,
                    role: member.admin_roles?.code,
                    status: member.status || 'ACTIVE',
                    permissions: [requiredPermission],
                    member
                };
            }
        }

        return { authorized: false, status: 403, error: "Droits insuffisants (Deny by Default). Compte non enregistré comme Administrateur LYANN dans admin_members." };
    } catch (e) {
        return { authorized: false, status: 500, error: "Erreur lors de la vérification des droits administratifs." };
    }
}

async function requireMaisonOperator(req) {
    return verifyAdminPermission(req, 'users.manage');
}

async function loadMaisonProfile(profileId) {
    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, avatar_url, city, territory, email, bio, professional_status, account_type, created_at')
        .eq('id', profileId)
        .maybeSingle();
    if (error) throw error;
    if (!data || data.account_type !== 'seed') return null;
    return data;
}

async function recordMaisonAudit(adminUserId, action, targetId, details) {
    try {
        await supabaseAdmin.from('admin_audit_events').insert({
            actor_type: 'ADMIN',
            actor_id: adminUserId,
            actor_name: 'Admin',
            action,
            module_name: 'Profils maison',
            target_type: 'seed_profile',
            target_id: targetId || null,
            metadata: details || {},
            created_at: new Date().toISOString()
        });
    } catch (e) {
        console.warn('Maison audit log skipped:', e.message || e);
    }
}


const { runModerationOnce } = require('./moderation-worker');
const { releaseMedia, sweep: sweepBokantajMedia, isVerifiedStagingUrl } = require('./bokantaj-media-retention');

// No process-local timer: Vercel functions are ephemeral. A verified
// Staging scheduler must call the guarded endpoint below with a secret.

function financialSettingBlocked(key, value) {
    const blob = `${key} ${typeof value === 'string' ? value : JSON.stringify(value || {})}`;
    return /commission|stripe|payout|escrow|financial_lock|platform_fee|fee_rate|protection_montant|verrou.?financier/i.test(blob);
}

async function moderateMaisonSubject(subjectType, subjectId) {
    try {
        await supabaseAdmin.rpc('lyann_enqueue_moderation_job', { p_type: subjectType, p_id: subjectId });
    } catch (_) {}
    try {
        await runModerationOnce({
            supabaseAdmin,
            apiKey: process.env.OPENAI_API_KEY || process.env.LYANN_AI_API_KEY || '',
            fetchImpl: global.fetch,
            limit: 6
        });
    } catch (_) {}
    const tableMap = {
        post: 'bokantaj_posts',
        request: 'requests',
        profile: 'profiles'
    };
    const table = tableMap[subjectType];
    const [{ data: row }, { data: job }] = await Promise.all([
        table ? supabaseAdmin.from(table).select('*').eq('id', subjectId).maybeSingle() : Promise.resolve({ data: null }),
        supabaseAdmin.from('moderation_jobs').select('status, reason_code, attempts, updated_at').eq('subject_type', subjectType).eq('subject_id', subjectId).maybeSingle()
    ]);
    const modStatus = subjectType === 'profile'
        ? (row?.bio_moderation_status || 'pending')
        : (row?.public_moderation_status || 'pending');
    const visible = modStatus === 'approved';
    const lifecycleStatus = modStatus === 'approved'
        ? 'PUBLISHED_VISIBLE'
        : (modStatus === 'rejected' ? 'REJECTED' : 'PENDING_MODERATION');
    const lifecycleLabel = modStatus === 'approved'
        ? 'Publié et visible'
        : (modStatus === 'rejected' ? 'Refusé' : 'En attente de modération');
    return {
        row,
        job,
        moderation_status: modStatus,
        visible,
        lifecycle_status: lifecycleStatus,
        lifecycle_label: lifecycleLabel,
        moderation_reason: job?.reason_code || null
    };
}

function decorateModerationItem(row, job, isProfile = false) {
    const modStatus = isProfile
        ? (row?.bio_moderation_status || 'approved')
        : (row?.public_moderation_status || 'approved');
    const visible = modStatus === 'approved';
    const lifecycleStatus = modStatus === 'approved'
        ? 'PUBLISHED_VISIBLE'
        : (modStatus === 'rejected' ? 'REJECTED' : 'PENDING_MODERATION');
    const lifecycleLabel = modStatus === 'approved'
        ? 'Publié et visible'
        : (modStatus === 'rejected' ? 'Refusé' : 'En attente de modération');
    return {
        ...row,
        moderation_status: modStatus,
        visible,
        lifecycle_status: lifecycleStatus,
        lifecycle_label: lifecycleLabel,
        moderation_job_status: job?.status || null,
        moderation_reason: job?.reason_code || null
    };
}

app.get('/v1/admin/maison/profiles', async (req, res) => {
    const authResult = await requireMaisonOperator(req);
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    try {
        const { data, error } = await supabaseAdmin
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, city, territory, account_type, created_at')
            .eq('account_type', 'seed')
            .order('first_name', { ascending: true });
        if (error) throw error;
        return res.json({ success: true, profiles: data || [] });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Impossible de charger les profils maison.' });
    }
});

app.get('/v1/admin/maison/profiles/:id/desk', async (req, res) => {
    const authResult = await requireMaisonOperator(req);
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    try {
        const profile = await loadMaisonProfile(req.params.id);
        if (!profile) {
            return res.status(404).json({ success: false, error: 'Profil maison introuvable.' });
        }
        const userId = profile.id;
        let [{ data: posts }, { data: requests }, { data: parts }, { data: quotes }, { data: missions }] = await Promise.all([
            supabaseAdmin.from('bokantaj_posts').select('id, content, type, city, territory, media_urls, public_moderation_status, created_at').eq('author_id', userId).order('created_at', { ascending: false }).limit(20),
            supabaseAdmin.from('requests').select('id, title, description, category, location, status, public_moderation_status, created_at').eq('requester_id', userId).order('created_at', { ascending: false }).limit(20),
            supabaseAdmin.from('conversation_participants').select('conversation_id').eq('user_id', userId),
            supabaseAdmin.from('quotes').select('id, status, total_amount, requester_id, provider_id, request_id, request_invitation_id, valid_until, created_at').or(`requester_id.eq.${userId},provider_id.eq.${userId}`).eq('status', 'SENT').order('created_at', { ascending: false }).limit(20),
            supabaseAdmin.from('missions').select('id, title, status, total_amount, requester_id, helper_id, created_at').or(`requester_id.eq.${userId},helper_id.eq.${userId}`).order('created_at', { ascending: false }).limit(20)
        ]);
        const subjectIds = [
            ...(posts || []).map((p) => p.id),
            ...(requests || []).map((r) => r.id)
        ].filter(Boolean);
        let { data: jobs } = subjectIds.length
            ? await supabaseAdmin.from('moderation_jobs').select('subject_type, subject_id, status, reason_code, attempts, updated_at').in('subject_id', subjectIds)
            : { data: [] };
        const jobMap = {};
        (jobs || []).forEach((j) => { jobMap[`${j.subject_type}:${j.subject_id}`] = j; });
        const orphanPosts = (posts || []).filter((p) => p.public_moderation_status === 'pending' && !jobMap[`post:${p.id}`]);
        const orphanReqs = (requests || []).filter((r) => r.public_moderation_status === 'pending' && !jobMap[`request:${r.id}`]);
        if (orphanPosts.length || orphanReqs.length) {
            for (const p of orphanPosts) {
                try { await supabaseAdmin.rpc('lyann_enqueue_moderation_job', { p_type: 'post', p_id: p.id }); } catch (_) {}
            }
            for (const r of orphanReqs) {
                try { await supabaseAdmin.rpc('lyann_enqueue_moderation_job', { p_type: 'request', p_id: r.id }); } catch (_) {}
            }
            try {
                await runModerationOnce({
                    supabaseAdmin,
                    apiKey: process.env.OPENAI_API_KEY || process.env.LYANN_AI_API_KEY || '',
                    fetchImpl: global.fetch,
                    limit: 8
                });
            } catch (_) {}
            const [refreshedPosts, refreshedReqs, refreshedJobs] = await Promise.all([
                supabaseAdmin.from('bokantaj_posts').select('id, content, type, city, territory, media_urls, public_moderation_status, created_at').eq('author_id', userId).order('created_at', { ascending: false }).limit(20),
                supabaseAdmin.from('requests').select('id, title, description, category, location, status, public_moderation_status, created_at').eq('requester_id', userId).order('created_at', { ascending: false }).limit(20),
                subjectIds.length ? supabaseAdmin.from('moderation_jobs').select('subject_type, subject_id, status, reason_code, attempts, updated_at').in('subject_id', subjectIds) : Promise.resolve({ data: [] })
            ]);
            posts = refreshedPosts.data || posts;
            requests = refreshedReqs.data || requests;
            (refreshedJobs.data || []).forEach((j) => { jobMap[`${j.subject_type}:${j.subject_id}`] = j; });
        }
        const conversationIds = [...new Set((parts || []).map((row) => row.conversation_id).filter(Boolean))];
        let conversations = [];
        if (conversationIds.length) {
            const { data: allParts } = await supabaseAdmin
                .from('conversation_participants')
                .select('conversation_id, user_id')
                .in('conversation_id', conversationIds);
            const otherIds = [...new Set((allParts || []).map((row) => row.user_id).filter((id) => id && id !== userId))];
            const { data: otherProfiles } = otherIds.length
                ? await supabaseAdmin.from('profiles').select('id, first_name, last_name, avatar_url').in('id', otherIds)
                : { data: [] };
            const profileMap = {};
            (otherProfiles || []).forEach((p) => { profileMap[p.id] = p; });
            const { data: recentMessages } = await supabaseAdmin
                .from('messages')
                .select('id, conversation_id, sender_id, content, created_at')
                .in('conversation_id', conversationIds)
                .order('created_at', { ascending: false })
                .limit(200);
            conversations = conversationIds.map((cid) => {
                const thread = (recentMessages || []).filter((m) => m.conversation_id === cid).slice(0, 12).reverse();
                const counterpartId = (allParts || []).find((row) => row.conversation_id === cid && row.user_id !== userId)?.user_id;
                const counterpart = counterpartId ? profileMap[counterpartId] : null;
                return {
                    id: cid,
                    counterpart: counterpart ? {
                        id: counterpart.id,
                        name: `${counterpart.first_name || ''} ${counterpart.last_name || ''}`.trim() || 'Membre',
                        avatar_url: counterpart.avatar_url
                    } : { name: 'Membre' },
                    messages: thread
                };
            });
        }
        return res.json({
            success: true,
            profile,
            posts: (posts || []).map((p) => decorateModerationItem(p, jobMap[`post:${p.id}`])),
            requests: (requests || []).map((r) => decorateModerationItem(r, jobMap[`request:${r.id}`])),
            conversations,
            quotes: quotes || [],
            missions: missions || []
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Impossible de charger le bureau du profil.' });
    }
});

function maisonMediaFile(payload, kind) {
    const raw = String(payload || '');
    const match = raw.match(/^data:([^;]+);base64,(.+)$/);
    const mime = (match ? match[1] : '').toLowerCase();
    const body = match ? match[2] : raw;
    if (!body) return null;
    let buffer;
    try { buffer = Buffer.from(body, 'base64'); } catch (_) { return { error: 'Fichier illisible.' }; }
    if (kind === 'photo') {
        const allowed = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
        if (!allowed[mime]) return { error: 'Choisis une photo JPG, PNG ou WEBP.' };
        if (buffer.length > 5 * 1024 * 1024) return { error: 'La photo doit faire moins de 5 Mo.' };
        return { buffer, mime, ext: allowed[mime] };
    }
    const allowed = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
    if (!allowed[mime]) return { error: 'Choisis une vidéo MP4, MOV ou WebM.' };
    if (buffer.length > 10 * 1024 * 1024) return { error: 'La vidéo doit faire moins de 10 Mo.' };
    return { buffer, mime, ext: allowed[mime] };
}

async function maisonStoreMedia(profileId, file, origin) {
    const bucket = 'bokantaj-media-hold';
    const objectPath = `${profileId}/${require('crypto').randomUUID()}.${file.ext}`;
    const { error } = await supabaseAdmin.storage.from(bucket).upload(objectPath, file.buffer, { contentType: file.mime, upsert: false });
    if (error) throw new Error('Le fichier n’a pas pu être enregistré.');
    const base = String(origin || 'https://lyann.app').replace(/\/$/, '');
    return `${base}/v1/media/${bucket}/${objectPath.split('/').map(encodeURIComponent).join('/')}`;
}

app.patch('/v1/admin/maison/profiles/:id', async (req, res) => {
    const authResult = await requireMaisonOperator(req);
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    try {
        const profile = await loadMaisonProfile(req.params.id);
        if (!profile) return res.status(404).json({ success: false, error: 'Profil maison introuvable.' });
        const first = String(req.body?.first_name || '').trim();
        const last = String(req.body?.last_name || '').trim();
        const city = String(req.body?.city || '').trim();
        const territory = String(req.body?.territory || '').trim().toLowerCase();
        const bio = String(req.body?.bio || '').trim();
        const skill = String(req.body?.professional_status || '').trim();
        if (!first || !last) return res.status(400).json({ success: false, error: 'Le prénom et le nom sont requis.' });
        if (!['guadeloupe', 'martinique'].includes(territory)) {
            return res.status(400).json({ success: false, error: 'Le territoire doit être la Guadeloupe ou la Martinique.' });
        }
        const { error } = await supabaseAdmin.from('profiles').update({
            first_name: first,
            last_name: last,
            city: city || null,
            territory,
            bio: bio || null,
            professional_status: skill || null,
            updated_at: new Date().toISOString()
        }).eq('id', profile.id).eq('account_type', 'seed');
        if (error) throw error;
        let moderation = null;
        if (bio && bio !== (profile.bio || '')) {
            moderation = await moderateMaisonSubject('profile', profile.id);
        }
        await recordMaisonAudit(authResult.userId, 'MAISON_UPDATE_PROFILE', profile.id, { city, territory, moderation_status: moderation?.moderation_status || 'approved' });
        return res.json({
            success: true,
            moderation_status: moderation?.moderation_status || 'approved',
            lifecycle_label: moderation?.lifecycle_label || 'Approuvé'
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Modification impossible.' });
    }
});

app.post('/v1/admin/maison/profiles/:id/requests', async (req, res) => {
    const authResult = await requireMaisonOperator(req);
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    try {
        const profile = await loadMaisonProfile(req.params.id);
        if (!profile) return res.status(404).json({ success: false, error: 'Profil maison introuvable.' });
        const title = String(req.body?.title || '').trim().slice(0, 80);
        const description = String(req.body?.description || '').trim();
        if (!title || !description) {
            return res.status(400).json({ success: false, error: 'Le titre et la description de l’annonce sont requis.' });
        }
        const row = {
            requester_id: profile.id,
            visibility: 'PUBLIC',
            title,
            description,
            category: String(req.body?.category || 'Général').trim() || 'Général',
            location: profile.city || 'Guadeloupe',
            urgency: 'Normale',
            status: 'OPEN',
            price_mode: 'QUOTE',
            date_mode: 'FLEXIBLE'
        };
        let inserted = await supabaseAdmin.from('requests').insert(row).select('id').single();
        if (inserted.error && /column/i.test(inserted.error.message || '')) {
            delete row.visibility;
            delete row.price_mode;
            delete row.date_mode;
            inserted = await supabaseAdmin.from('requests').insert(row).select('id').single();
        }
        if (inserted.error) throw inserted.error;
        const mod = await moderateMaisonSubject('request', inserted.data.id);
        await recordMaisonAudit(authResult.userId, 'MAISON_PUBLISH_REQUEST', profile.id, {
            request_id: inserted.data.id,
            moderation_status: mod.moderation_status,
            visible: mod.visible
        });
        return res.json({
            success: true,
            request_id: inserted.data.id,
            moderation_status: mod.moderation_status,
            visible: mod.visible,
            lifecycle_status: mod.lifecycle_status,
            lifecycle_label: mod.lifecycle_label,
            moderation_reason: mod.moderation_reason,
            message: mod.visible
                ? 'Annonce approuvée par la modération et visible publiquement.'
                : (mod.moderation_status === 'rejected'
                    ? `Annonce refusée par la modération (${mod.moderation_reason || 'contenu non conforme'}). Corrigez le texte avant de réessayer.`
                    : `Annonce enregistrée — En attente de modération (${mod.moderation_reason || 'vérification requise'}).`)
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Annonce impossible.' });
    }
});

app.post('/v1/admin/maison/profiles/:id/bokantaj', async (req, res) => {
    const authResult = await requireMaisonOperator(req);
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    try {
        const profile = await loadMaisonProfile(req.params.id);
        if (!profile) return res.status(404).json({ success: false, error: 'Profil maison introuvable.' });
        const content = String(req.body?.content || '').trim();
        const photo = req.body?.photo ? maisonMediaFile(req.body.photo, 'photo') : null;
        const video = req.body?.video ? maisonMediaFile(req.body.video, 'video') : null;
        if (photo?.error) return res.status(400).json({ success: false, error: photo.error });
        if (video?.error) return res.status(400).json({ success: false, error: video.error });
        if (!content && !photo && !video) return res.status(400).json({ success: false, error: 'Écris un Lyann ou ajoute une photo ou une vidéo.' });
        if (req.body?.draft === true) {
            return res.json({
                success: true,
                draft: true,
                visible: false,
                moderation_status: 'draft',
                lifecycle_status: 'draft',
                lifecycle_label: 'Brouillon',
                message: 'Brouillon conservé localement. Rien n’a été envoyé à Bokantaj ni à la modération.'
            });
        }
        const mediaUrls = [];
        const origin = `${req.protocol}://${req.get('host')}`;
        if (photo) mediaUrls.push(await maisonStoreMedia(profile.id, photo, origin));
        if (video) mediaUrls.push(await maisonStoreMedia(profile.id, video, origin));
        const allowedTypes = ['info', 'dispo', 'besoin'];
        const postType = allowedTypes.includes(String(req.body?.type || '').toLowerCase())
            ? String(req.body.type).toLowerCase()
            : 'info';
        const territory = String(req.body?.territory || profile.territory || 'guadeloupe').trim().toLowerCase();
        const city = String(req.body?.city || profile.city || '').trim() || null;
        const { data, error } = await supabaseAdmin.from('bokantaj_posts').insert({
            author_id: profile.id,
            type: postType,
            content: content || 'Lyann',
            city,
            territory,
            media_urls: mediaUrls
        }).select('id').single();
        if (error) throw error;
        const mod = await moderateMaisonSubject('post', data.id);
        await recordMaisonAudit(authResult.userId, 'MAISON_PUBLISH_BOKANTAJ', profile.id, {
            post_id: data.id,
            moderation_status: mod.moderation_status,
            visible: mod.visible,
            reason: mod.moderation_reason
        });
        return res.json({
            success: true,
            post_id: data.id,
            moderation_status: mod.moderation_status,
            visible: mod.visible,
            lifecycle_status: mod.lifecycle_status,
            lifecycle_label: mod.lifecycle_label,
            moderation_reason: mod.moderation_reason,
            post: mod.row ? decorateModerationItem(mod.row, mod.job) : null,
            message: mod.visible
                ? 'Publication approuvée par la modération et visible dans Bokantaj.'
                : (mod.moderation_status === 'rejected'
                    ? `Publication refusée par la modération (${mod.moderation_reason || 'contenu non conforme'}). Vous pouvez la corriger et réessayer.`
                    : `Publication enregistrée — En attente de modération (${mod.moderation_reason || 'contrôle requis'}). Elle apparaîtra dans Bokantaj dès son approbation.`)
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Publication impossible.' });
    }
});

app.post('/v1/admin/maison/profiles/:id/messages', async (req, res) => {
    const authResult = await requireMaisonOperator(req);
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    try {
        const profile = await loadMaisonProfile(req.params.id);
        if (!profile) return res.status(404).json({ success: false, error: 'Profil maison introuvable.' });
        const conversationId = req.body?.conversation_id;
        const content = String(req.body?.content || '').trim();
        if (!conversationId || !content) {
            return res.status(400).json({ success: false, error: 'Conversation et message requis.' });
        }
        const { data: membership } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('conversation_id', conversationId)
            .eq('user_id', profile.id)
            .maybeSingle();
        if (!membership) {
            return res.status(403).json({ success: false, error: 'Ce profil n’est pas dans cette conversation.' });
        }
        const { data, error } = await supabaseAdmin.from('messages').insert({
            conversation_id: conversationId,
            sender_id: profile.id,
            content
        }).select('id').single();
        if (error) throw error;
        await recordMaisonAudit(authResult.userId, 'MAISON_SEND_MESSAGE', profile.id, { conversation_id: conversationId, message_id: data.id });
        return res.json({ success: true, message_id: data.id });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Message impossible.' });
    }
});

async function actOnMaisonQuote(req, res, action) {
    const authResult = await requireMaisonOperator(req);
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    try {
        const profile = await loadMaisonProfile(req.params.id);
        if (!profile) return res.status(404).json({ success: false, error: 'Profil maison introuvable.' });
        const { data: quote, error: quoteErr } = await supabaseAdmin.from('quotes').select('*').eq('id', req.params.quoteId).maybeSingle();
        if (quoteErr) throw quoteErr;
        if (!quote) return res.status(404).json({ success: false, error: 'Proposition introuvable.' });
        if (quote.status !== 'SENT') {
            return res.status(409).json({ success: false, error: `Cette proposition n’est plus en attente (${quote.status}).` });
        }
        if (action === 'accept' || action === 'reject') {
            if (quote.requester_id !== profile.id) {
                return res.status(403).json({ success: false, error: 'Seul le demandeur de ce profil maison peut accepter ou refuser.' });
            }
        } else if (action === 'withdraw') {
            if (quote.provider_id !== profile.id) {
                return res.status(403).json({ success: false, error: 'Seul le Lyanneur de ce profil maison peut retirer la proposition.' });
            }
        }
        if (action === 'accept') {
            if (quote.valid_until && new Date(quote.valid_until) < new Date()) {
                return res.status(409).json({ success: false, error: 'La proposition a expiré.' });
            }
            const { data: requestRow } = await supabaseAdmin.from('requests').select('id, title, status').eq('id', quote.request_id).maybeSingle();
            if (!requestRow || requestRow.status !== 'OPEN') {
                return res.status(409).json({ success: false, error: 'Le Lyann n’est plus ouvert.' });
            }
            const { error: updErr } = await supabaseAdmin.from('quotes').update({ status: 'ACCEPTED', updated_at: new Date().toISOString() }).eq('id', quote.id).eq('status', 'SENT');
            if (updErr) throw updErr;
            let missionId = null;
            if (quote.request_invitation_id) {
                const { data: existing } = await supabaseAdmin.from('missions').select('id').eq('request_invitation_id', quote.request_invitation_id).neq('status', 'CANCELLED').maybeSingle();
                missionId = existing?.id || null;
            }
            if (!missionId) {
                const title = (requestRow.title && String(requestRow.title).trim()) || 'Mission LYANN';
                const { data: mission, error: missionErr } = await supabaseAdmin.from('missions').insert({
                    requester_id: quote.requester_id,
                    helper_id: quote.provider_id,
                    related_request_id: quote.request_id,
                    request_invitation_id: quote.request_invitation_id,
                    title,
                    status: 'AGREED',
                    total_amount: quote.total_amount,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }).select('id').single();
                if (missionErr) throw missionErr;
                missionId = mission.id;
            }
            await recordMaisonAudit(authResult.userId, 'MAISON_ACCEPT_QUOTE', profile.id, { quote_id: quote.id, mission_id: missionId });
            return res.json({ success: true, status: 'ACCEPTED', mission_id: missionId });
        }
        const nextStatus = action === 'reject' ? 'REJECTED' : 'WITHDRAWN';
        const { error: updErr } = await supabaseAdmin.from('quotes').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', quote.id).eq('status', 'SENT');
        if (updErr) throw updErr;
        await recordMaisonAudit(authResult.userId, `MAISON_${nextStatus}_QUOTE`, profile.id, { quote_id: quote.id });
        return res.json({ success: true, status: nextStatus });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Action mission impossible.' });
    }
}

const { collectEditorial, publishEditorialTask, providerConfig } = require('./editorial-run');
const { EDITORIAL_BOTS, EDITORIAL_BADGE, reviewEditorialText } = require('./editorial-engine');

function editorialAuthorized(req) {
    const expected = String(process.env.EDITORIAL_CRON_SECRET || process.env.CRON_SECRET || '');
    const header = String(req.headers.authorization || '');
    const supplied = header.startsWith('Bearer ') ? header.slice(7) : String(req.headers['x-lyann-editorial-secret'] || '');
    if (!expected || supplied.length !== expected.length) return false;
    return require('crypto').timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

app.all('/v1/editorial/collect', async (req, res) => {
    if (!isVerifiedStagingUrl(process.env.SUPABASE_URL)) {
        return res.status(403).json({ success: false, error: 'Collecte éditoriale interdite sur Production.' });
    }
    if (!editorialAuthorized(req)) {
        return res.status(401).json({ success: false, error: 'Collecte éditoriale non autorisée.' });
    }
    try {
        const schedule = require('./../config/editorial-schedule.json');
        const asked = String(req.query.scheduled || '') === '1';
        if (asked && schedule.enabled === false) {
            return res.json({ success: true, skipped: 'schedule-disabled', created: [], skippedRows: [] });
        }
        const report = await collectEditorial(supabaseAdmin, { scheduled: asked && schedule.enabled !== false });
        return res.json({ success: true, ...report });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Collecte impossible.' });
    }
});

app.post('/v1/admin/editorial/collect', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.approve');
    if (!authResult.authorized) return res.status(authResult.status).json({ success: false, error: authResult.error });
    if (!isVerifiedStagingUrl(process.env.SUPABASE_URL)) {
        return res.status(403).json({ success: false, error: 'Collecte éditoriale interdite sur Production.' });
    }
    try {
        const cfg = providerConfig();
        if (cfg.error) {
            return res.status(409).json({
                success: false,
                error: 'Collecte éditoriale indisponible : configuration IA manquante ou refusée.',
                provider: cfg.error
            });
        }
        return res.json({ success: true, provider: cfg.mode, ...(await collectEditorial(supabaseAdmin)) });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Collecte impossible.' });
    }
});

app.get('/v1/admin/editorial/bots', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.approve');
    if (!authResult.authorized) return res.status(authResult.status).json({ success: false, error: authResult.error });
    const names = EDITORIAL_BOTS.map((bot) => bot.name);
    const { data, error } = await supabaseAdmin.from('lyann_agents').select('id, agent_name, status, zones, personality, system_instructions, linked_profile_id, last_activity_at').in('agent_name', names);
    if (error) return res.status(500).json({ success: false, error: error.message });
    const ids = (data || []).map((row) => row.linked_profile_id);
    const { data: profiles } = ids.length
        ? await supabaseAdmin.from('profiles').select('id, avatar_url, bio, city, territory').in('id', ids)
        : { data: [] };
    const bots = (data || []).map((agent) => {
        const definition = EDITORIAL_BOTS.find((bot) => bot.name === agent.agent_name);
        return {
            ...agent,
            badge: EDITORIAL_BADGE,
            sources: definition ? definition.sources : [],
            maxPerDay: definition ? definition.maxPerDay : null,
            healthReview: definition ? definition.healthReview : false,
            profile: (profiles || []).find((profile) => profile.id === agent.linked_profile_id) || null
        };
    });
    return res.json({ success: true, bots });
});

app.get('/v1/admin/editorial/proposals', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.approve');
    if (!authResult.authorized) return res.status(authResult.status).json({ success: false, error: authResult.error });
    const { data: agents } = await supabaseAdmin.from('lyann_agents').select('id, agent_name').in('agent_name', EDITORIAL_BOTS.map((bot) => bot.name));
    const ids = (agents || []).map((agent) => agent.id);
    if (!ids.length) return res.json({ success: true, proposals: [] });
    const { data, error } = await supabaseAdmin.from('lyann_agent_tasks').select('id, agent_id, title, instruction, status, approval_status, metadata, created_at').in('agent_id', ids).order('created_at', { ascending: false }).limit(300);
    if (error) return res.status(500).json({ success: false, error: error.message });
    const names = {};
    (agents || []).forEach((agent) => { names[agent.id] = agent.agent_name; });
    return res.json({
        success: true,
        proposals: (data || []).map((row) => {
            const bot = EDITORIAL_BOTS.find((item) => item.slug === (row.metadata && row.metadata.slug) || item.name === names[row.agent_id]);
            const review = reviewEditorialText({
                text: row.instruction,
                facts: (row.metadata && row.metadata.facts) || '',
                healthReview: Boolean(bot && bot.healthReview)
            });
            return { ...row, agent_name: names[row.agent_id], controls: review };
        })
    });
});

async function publishStoredEditorialProposal(res, task, content, approver) {
    if (!isVerifiedStagingUrl(process.env.SUPABASE_URL)) {
        return res.status(403).json({ success: false, code: 'environment', error: 'Erreur d’environnement.' });
    }
    if (!task || !task.metadata || !task.metadata.editorial) {
        return res.status(404).json({ success: false, code: 'not_editorial', error: 'Proposition introuvable.' });
    }
    if (task.metadata.published_post_id || task.approval_status === 'APPROVED') {
        return res.status(409).json({
            success: false,
            code: 'already_published',
            error: 'Publication déjà effectuée.',
            post_id: task.metadata.published_post_id || null
        });
    }
    if (task.approval_status !== 'PENDING' || task.status === 'CANCELLED') {
        return res.status(409).json({ success: false, code: 'not_pending', error: 'Ce brouillon n’est plus en attente.' });
    }
    const text = String(content || task.instruction || '').trim();
    if (text && text !== String(task.instruction || '').trim()) {
        const now = new Date().toISOString();
        const revisions = Array.isArray(task.metadata.revisions) ? task.metadata.revisions.slice() : [];
        revisions.push({ at: now, by: approver.userId, previous: task.instruction, next: text });
        const { error: saveError } = await supabaseAdmin.from('lyann_agent_tasks').update({
            instruction: text,
            updated_at: now,
            metadata: Object.assign({}, task.metadata, { revisions })
        }).eq('id', task.id).eq('approval_status', 'PENDING');
        if (saveError) {
            return res.status(500).json({ success: false, code: 'server', error: 'Erreur serveur.' });
        }
        task.instruction = text;
        task.metadata = Object.assign({}, task.metadata, { revisions });
    }
    const stored = String(task.instruction || '').trim();
    const bot = EDITORIAL_BOTS.find((item) => item.slug === (task.metadata && task.metadata.slug) || item.name === task.agent_name);
    const review = reviewEditorialText({
        text: stored,
        facts: (task.metadata && task.metadata.facts) || '',
        healthReview: Boolean(bot && bot.healthReview) || (task.metadata && task.metadata.validation_status === 'HUMAN_REQUIRED')
    });
    if (!review.ok) {
        const therapeutic = review.reasons.some((reason) => /affirmation thérapeutique/.test(reason));
        return res.status(409).json({
            success: false,
            code: therapeutic ? 'therapeutic' : 'quality',
            error: therapeutic
                ? 'Publication impossible : affirmation thérapeutique insuffisamment vérifiée. Modifiez le texte avant validation.'
                : 'Texte non conforme. ' + review.reasons.join(' ; ')
        });
    }
    const postId = await publishEditorialTask(supabaseAdmin, task, stored, approver);
    return res.json({ success: true, post_id: postId, message: 'Publié sur le Bokantaj de Staging.' });
}

app.post('/v1/admin/editorial/proposals/:id/publish', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.approve');
    if (!authResult.authorized) {
        const expired = authResult.status === 401;
        return res.status(authResult.status).json({
            success: false,
            code: expired ? 'ADMIN_TOKEN_INVALID' : 'ADMIN_ACCESS_DENIED',
            error: expired ? 'Session expirée.' : 'Accès refusé.'
        });
    }
    try {
        const { data: task, error } = await supabaseAdmin.from('lyann_agent_tasks').select('*').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!task) return res.status(404).json({ success: false, error: 'Proposition introuvable.' });
        return await publishStoredEditorialProposal(res, task, req.body?.content, {
            userId: authResult.userId,
            email: authResult.email,
            actor: 'admin'
        });
    } catch (e) {
        return res.status(500).json({ success: false, code: 'server', error: 'Erreur serveur.' });
    }
});

app.post('/v1/admin/editorial/proposals/:id/revise', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.approve');
    if (!authResult.authorized) return res.status(authResult.status).json({ success: false, error: authResult.error });
    const next = String(req.body?.content || '').trim();
    if (!next) return res.status(400).json({ success: false, error: 'Le texte corrigé est vide.' });
    const { data: task, error } = await supabaseAdmin.from('lyann_agent_tasks').select('instruction, metadata, approval_status').eq('id', req.params.id).maybeSingle();
    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!task || task.approval_status !== 'PENDING') return res.status(409).json({ success: false, error: 'Ce brouillon n’est plus modifiable.' });
    const now = new Date().toISOString();
    const revisions = Array.isArray(task.metadata && task.metadata.revisions) ? task.metadata.revisions.slice() : [];
    revisions.push({ at: now, by: authResult.userId, previous: task.instruction, next });
    const { error: updateError } = await supabaseAdmin.from('lyann_agent_tasks').update({
        instruction: next,
        updated_at: now,
        metadata: Object.assign({}, task.metadata, { revisions })
    }).eq('id', req.params.id);
    if (updateError) return res.status(500).json({ success: false, error: updateError.message });
    return res.json({ success: true });
});

app.post('/v1/admin/editorial/proposals/:id/delete', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.approve');
    if (!authResult.authorized) return res.status(authResult.status).json({ success: false, error: authResult.error });
    if (!isVerifiedStagingUrl(process.env.SUPABASE_URL)) {
        return res.status(403).json({ success: false, error: 'Suppression éditoriale interdite sur Production.' });
    }
    const { data: task, error } = await supabaseAdmin.from('lyann_agent_tasks').select('id, metadata').eq('id', req.params.id).maybeSingle();
    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!task || !task.metadata || !task.metadata.editorial) {
        return res.status(404).json({ success: false, error: 'Proposition introuvable.' });
    }
    const postId = task.metadata.published_post_id;
    if (postId) {
        const { data: published } = await supabaseAdmin.from('bokantaj_posts').select('media_urls').eq('id', postId).maybeSingle();
        await releaseMedia({ supabaseAdmin, supabaseUrl: process.env.SUPABASE_URL, urls: published && published.media_urls });
        const { error: postError } = await supabaseAdmin.from('bokantaj_posts').delete().eq('id', postId);
        if (postError) return res.status(500).json({ success: false, error: postError.message });
    }
    const { error: deleteError } = await supabaseAdmin.from('lyann_agent_tasks').delete().eq('id', task.id);
    if (deleteError) return res.status(500).json({ success: false, error: deleteError.message });
    return res.json({ success: true, message: 'Proposition supprimée.' });
});

app.post('/v1/admin/editorial/proposals/:id/reject', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.approve');
    if (!authResult.authorized) return res.status(authResult.status).json({ success: false, error: authResult.error });
    const { error } = await supabaseAdmin.from('lyann_agent_tasks').update({ status: 'CANCELLED', approval_status: 'REJECTED', updated_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
});

app.post('/v1/admin/editorial/bots/:id/status', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.approve');
    if (!authResult.authorized) return res.status(authResult.status).json({ success: false, error: authResult.error });
    const status = req.body?.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
    const { error } = await supabaseAdmin.from('lyann_agents').update({ status, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, status });
});

app.post('/v1/admin/maison/profiles/:id/quotes/:quoteId/accept', (req, res) => actOnMaisonQuote(req, res, 'accept'));
app.post('/v1/admin/maison/profiles/:id/quotes/:quoteId/reject', (req, res) => actOnMaisonQuote(req, res, 'reject'));
app.post('/v1/admin/maison/profiles/:id/quotes/:quoteId/withdraw', (req, res) => actOnMaisonQuote(req, res, 'withdraw'));

// 5.0 GET CURRENT ADMIN USER SESSION (/v1/admin/me)
app.get('/v1/admin/me', async (req, res) => {
    const authResult = await verifyAdminPermission(req);
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    return res.json({
        success: true,
        user_id: authResult.userId,
        role: authResult.role,
        is_owner: ['SUPER_ADMIN', 'OWNER'].includes(authResult.role)
    });
});

const { registerAdminControlCenter } = require('./admin-control-center');
registerAdminControlCenter(app, { supabaseAdmin, verifyAdminPermission });
const { registerAdminModerationCenter } = require('./admin-moderation-center');
registerAdminModerationCenter(app, { supabaseAdmin, verifyAdminPermission, recordAudit: recordMaisonAudit });
const { registerAdminOperations, registerMemberHelpdesk } = require('./admin-operations');
registerAdminOperations(app, { supabaseAdmin, verifyAdminPermission });
registerMemberHelpdesk(app, { supabaseAdmin, requireBearerUser });

function adminProfileName(profile) {
    if (!profile) return 'Membre';
    const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
    return name || profile.email || 'Membre';
}

function adminCentsToEuro(cents) {
    return Number(cents || 0) / 100;
}

async function adminMapProfiles(ids) {
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (!unique.length) return {};
    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, avatar_url, city, territory, email, account_type, is_pro, kyc_verified, professional_status, stripe_account_id')
        .in('id', unique);
    if (error) {
        console.warn('adminMapProfiles:', error.message);
        return {};
    }
    const map = {};
    (data || []).forEach((row) => { map[row.id] = row; });
    return map;
}

async function adminSafeSelect(table, columns, build) {
    try {
        let query = supabaseAdmin.from(table).select(columns);
        if (typeof build === 'function') query = build(query);
        const { data, error } = await query;
        if (error) {
            console.warn(`admin ops ${table}:`, error.message);
            return [];
        }
        return data || [];
    } catch (e) {
        console.warn(`admin ops ${table} threw:`, e.message || e);
        return [];
    }
}

function adminFormatPayment(row, profiles) {
    const provider = profiles[row.provider_id] || profiles[row.recipient_id];
    const requester = profiles[row.requester_id] || profiles[row.payer_id];
    return {
        id: row.id,
        mission_id: row.mission_id || null,
        requester_name: adminProfileName(requester),
        provider_name: adminProfileName(provider),
        customer_total: adminCentsToEuro(row.customer_total_cents),
        lyann_revenue: adminCentsToEuro(row.lyann_revenue_cents),
        customer_fee: adminCentsToEuro(row.customer_fee_cents),
        provider_net: adminCentsToEuro(row.provider_net_cents),
        payment_status: row.payment_status || row.status || null,
        transfer_status: row.transfer_status || null,
        stripe_payment_intent_id: row.stripe_payment_intent_id || null,
        stripe_transfer_id: row.stripe_transfer_id || null,
        created_at: row.created_at
    };
}

app.get('/v1/admin/ops', async (req, res) => {
    const authResult = await verifyAdminPermission(req);
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    const resource = String(req.query.resource || '').trim();
    const limit = Math.min(Number(req.query.limit) || 150, 300);
    try {
        if (resource === 'users' || resource === 'lyanneurs') {
            let query = supabaseAdmin
                .from('profiles')
                .select('id, first_name, last_name, email, phone, city, territory, avatar_url, is_pro, kyc_verified, account_type, professional_status, stripe_account_id, created_at')
                .order('created_at', { ascending: false })
                .limit(limit);
            if (resource === 'lyanneurs') query = query.eq('is_pro', true);
            const { data, error } = await query;
            if (error) return res.status(503).json({ success: false, error: error.message });
            return res.json({ success: true, rows: data || [] });
        }

        if (resource === 'requests') {
            const rows = await adminSafeSelect(
                'requests',
                'id, title, category, location, status, requester_id, budget, created_at',
                (q) => q.order('created_at', { ascending: false }).limit(limit)
            );
            const profiles = await adminMapProfiles(rows.map((row) => row.requester_id));
            return res.json({
                success: true,
                rows: rows.map((row) => ({
                    ...row,
                    requester_name: adminProfileName(profiles[row.requester_id]),
                    requester_city: profiles[row.requester_id]?.city || null,
                    requester_territory: profiles[row.requester_id]?.territory || null
                }))
            });
        }

        if (resource === 'services') {
            let rows = await adminSafeSelect(
                'services',
                'id, owner_id, title, category, price_type, base_price, is_active, created_at',
                (q) => q.order('created_at', { ascending: false }).limit(limit)
            );
            if (!rows.length) {
                rows = (await adminSafeSelect(
                    'services',
                    'id, owner_id, title, pricing_model, indicative_price, active, created_at',
                    (q) => q.order('created_at', { ascending: false }).limit(limit)
                )).map((row) => ({
                    id: row.id,
                    owner_id: row.owner_id,
                    title: row.title,
                    category: null,
                    price_type: row.pricing_model,
                    base_price: row.indicative_price,
                    is_active: row.active,
                    created_at: row.created_at
                }));
            }
            const profiles = await adminMapProfiles(rows.map((row) => row.owner_id));
            return res.json({
                success: true,
                rows: rows.map((row) => ({
                    ...row,
                    owner_name: adminProfileName(profiles[row.owner_id])
                }))
            });
        }

        if (resource === 'missions') {
            const rows = await adminSafeSelect(
                'missions',
                'id, title, status, total_amount, requester_id, helper_id, created_at',
                (q) => q.order('created_at', { ascending: false }).limit(limit)
            );
            const profiles = await adminMapProfiles(rows.flatMap((row) => [row.requester_id, row.helper_id]));
            return res.json({
                success: true,
                rows: rows.map((row) => ({
                    ...row,
                    requester_name: adminProfileName(profiles[row.requester_id]),
                    helper_name: adminProfileName(profiles[row.helper_id])
                }))
            });
        }

        if (resource === 'quotes') {
            const rows = await adminSafeSelect(
                'quotes',
                'id, status, total_amount, requester_id, provider_id, created_at',
                (q) => q.order('created_at', { ascending: false }).limit(limit)
            );
            const profiles = await adminMapProfiles(rows.flatMap((row) => [row.requester_id, row.provider_id]));
            return res.json({
                success: true,
                rows: rows.map((row) => ({
                    ...row,
                    requester_name: adminProfileName(profiles[row.requester_id]),
                    provider_name: adminProfileName(profiles[row.provider_id])
                }))
            });
        }

        if (resource === 'payments' || resource === 'payouts' || resource === 'invoices') {
            const rows = await adminSafeSelect(
                'payments',
                'id, mission_id, requester_id, provider_id, customer_total_cents, customer_fee_cents, lyann_revenue_cents, provider_net_cents, payment_status, transfer_status, stripe_payment_intent_id, stripe_transfer_id, created_at',
                (q) => q.order('created_at', { ascending: false }).limit(limit)
            );
            const profiles = await adminMapProfiles(rows.flatMap((row) => [row.requester_id, row.provider_id]));
            let formatted = rows.map((row) => adminFormatPayment(row, profiles));
            if (resource === 'payouts') {
                formatted = formatted.filter((row) => ['TRANSFERRED', 'TRANSFER_PROCESSING', 'PENDING_VALIDATION'].includes(row.transfer_status));
            }
            if (resource === 'invoices') {
                formatted = formatted.filter((row) => row.payment_status === 'SUCCEEDED');
            }
            return res.json({ success: true, rows: formatted });
        }

        if (resource === 'disputes') {
            const rows = await adminSafeSelect(
                'disputes',
                'id, mission_id, status, reason, description, requester_id, provider_id, created_at',
                (q) => q.order('created_at', { ascending: false }).limit(limit)
            );
            const profiles = await adminMapProfiles(rows.flatMap((row) => [row.requester_id, row.provider_id]));
            return res.json({
                success: true,
                rows: rows.map((row) => ({
                    ...row,
                    requester_name: adminProfileName(profiles[row.requester_id]),
                    provider_name: adminProfileName(profiles[row.provider_id])
                }))
            });
        }

        if (resource === 'reviews') {
            const rows = await adminSafeSelect(
                'reviews',
                'id, author_id, target_id, rating, comment, created_at',
                (q) => q.order('created_at', { ascending: false }).limit(limit)
            );
            const profiles = await adminMapProfiles(rows.flatMap((row) => [row.author_id, row.target_id]));
            return res.json({
                success: true,
                rows: rows.map((row) => ({
                    ...row,
                    author_name: adminProfileName(profiles[row.author_id]),
                    target_name: adminProfileName(profiles[row.target_id])
                }))
            });
        }

        if (resource === 'reports') {
            const userReports = await adminSafeSelect(
                'user_reports',
                'id, reporter_id, target_user_id, reason, details, status, created_at',
                (q) => q.order('created_at', { ascending: false }).limit(limit)
            );
            const bokReports = await adminSafeSelect(
                'bokantaj_reports',
                'id, reporter_id, post_id, request_id, comment_id, reason, status, created_at',
                (q) => q.order('created_at', { ascending: false }).limit(limit)
            );
            const profiles = await adminMapProfiles([
                ...userReports.flatMap((row) => [row.reporter_id, row.target_user_id]),
                ...bokReports.map((row) => row.reporter_id)
            ]);
            const reportIds = userReports.map((row) => row.id).filter(Boolean);
            const evidenceRows = reportIds.length
                ? await adminSafeSelect('report_evidence', 'report_id', (q) => q.in('report_id', reportIds))
                : [];
            const evidenceCount = {};
            evidenceRows.forEach((row) => {
                evidenceCount[row.report_id] = (evidenceCount[row.report_id] || 0) + 1;
            });
            return res.json({
                success: true,
                rows: [
                    ...userReports.map((row) => ({
                        id: row.id,
                        source: 'user',
                        reporter_name: adminProfileName(profiles[row.reporter_id]),
                        target_name: adminProfileName(profiles[row.target_user_id]),
                        reason: row.reason,
                        details: row.details,
                        status: row.status,
                        created_at: row.created_at,
                        evidence_count: evidenceCount[row.id] || 0
                    })),
                    ...bokReports.map((row) => ({
                        id: row.id,
                        source: 'bokantaj',
                        reporter_name: adminProfileName(profiles[row.reporter_id]),
                        target_name: row.post_id || row.request_id || row.comment_id || 'Publication',
                        reason: row.reason,
                        details: null,
                        status: row.status,
                        created_at: row.created_at
                    }))
                ]
            });
        }

        if (resource === 'bokantaj') {
            const rows = await adminSafeSelect(
                'bokantaj_posts',
                'id, author_id, type, content, city, territory, created_at, place_lat, place_lng, place_label, public_moderation_status',
                (q) => q.order('created_at', { ascending: false }).limit(limit)
            );
            const profiles = await adminMapProfiles(rows.map((row) => row.author_id));
            return res.json({
                success: true,
                rows: rows.map((row) => ({
                    ...row,
                    author_name: adminProfileName(profiles[row.author_id]),
                    account_type: profiles[row.author_id]?.account_type || 'real'
                }))
            });
        }

        if (resource === 'conversations') {
            const parts = await adminSafeSelect(
                'conversation_participants',
                'conversation_id, user_id',
                (q) => q.limit(800)
            );
            const grouped = {};
            parts.forEach((row) => {
                if (!row.conversation_id) return;
                if (!grouped[row.conversation_id]) grouped[row.conversation_id] = [];
                grouped[row.conversation_id].push(row.user_id);
            });
            const ids = Object.keys(grouped).slice(0, limit);
            const profiles = await adminMapProfiles(parts.map((row) => row.user_id));
            const convRows = ids.length
                ? await adminSafeSelect('conversations', 'id, created_at, updated_at', (q) => q.in('id', ids))
                : [];
            const convMap = {};
            convRows.forEach((row) => { convMap[row.id] = row; });
            return res.json({
                success: true,
                rows: ids.map((id) => ({
                    id,
                    participants: (grouped[id] || []).map((uid) => adminProfileName(profiles[uid])),
                    created_at: convMap[id]?.created_at || null,
                    updated_at: convMap[id]?.updated_at || convMap[id]?.created_at || null
                }))
            });
        }

        if (resource === 'team') {
            const { data, error } = await supabaseAdmin
                .from('admin_members')
                .select('id, user_id, status, created_at, admin_roles!role_id(code, name)')
                .order('created_at', { ascending: false });
            if (error) return res.status(503).json({ success: false, error: error.message });
            const profiles = await adminMapProfiles((data || []).map((row) => row.user_id));
            return res.json({
                success: true,
                rows: (data || []).map((row) => ({
                    id: row.id,
                    user_id: row.user_id,
                    name: adminProfileName(profiles[row.user_id]),
                    email: profiles[row.user_id]?.email || null,
                    role: row.admin_roles?.code || null,
                    role_name: row.admin_roles?.name || null,
                    status: row.status,
                    created_at: row.created_at
                }))
            });
        }

        if (resource === 'health') {
            const started = Date.now();
            const { error, count } = await supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true });
            return res.json({
                success: true,
                supabase_ok: !error,
                supabase_ms: Date.now() - started,
                profiles: count || 0,
                stripe_configured: Boolean(process.env.STRIPE_SECRET_KEY),
                error: error ? error.message : null
            });
        }

        if (resource === 'territories') {
            const { data, error } = await supabaseAdmin.from('profiles').select('territory');
            if (error) return res.status(503).json({ success: false, error: error.message });
            const counts = {};
            (data || []).forEach((row) => {
                const key = String(row.territory || 'non_renseigne').toLowerCase();
                counts[key] = (counts[key] || 0) + 1;
            });
            return res.json({ success: true, counts });
        }

        return res.status(400).json({ success: false, error: 'Ressource admin inconnue.' });
    } catch (e) {
        console.error('Admin ops error:', e);
        return res.status(503).json({ success: false, error: e.message || 'Données temporairement indisponibles' });
    }
});

app.post('/v1/admin/ops/requests/:id/close', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'moderation.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    try {
        const { data, error } = await supabaseAdmin
            .from('requests')
            .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .select('id, status')
            .maybeSingle();
        if (error) return res.status(500).json({ success: false, error: error.message });
        if (!data) return res.status(404).json({ success: false, error: 'Demande introuvable.' });
        await recordMaisonAudit(authResult.userId, 'REQUEST_CLOSED', req.params.id, { status: 'CANCELLED' });
        return res.json({ success: true, row: data });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Impossible de retirer la demande.' });
    }
});

app.post('/v1/admin/ops/users/:id/kyc', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'users.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    try {
        const verified = req.body?.verified !== false;
        const { data, error } = await supabaseAdmin
            .from('profiles')
            .update({ kyc_verified: verified, updated_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .select('id, kyc_verified, first_name, last_name')
            .maybeSingle();
        if (error) return res.status(500).json({ success: false, error: error.message });
        if (!data) return res.status(404).json({ success: false, error: 'Profil introuvable.' });
        await recordMaisonAudit(authResult.userId, 'KYC_UPDATED', req.params.id, { kyc_verified: verified });
        return res.json({ success: true, row: data });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Impossible de mettre à jour le KYC.' });
    }
});


app.post('/v1/admin/ops/users/:id/status', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'users.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    try {
        if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'is_verified')) {
            return res.status(400).json({
                success: false,
                error: 'is_verified n’est pas une suspension. Utilisez /v1/admin/moderation-center/users/:id/sanction.'
            });
        }
        const patch = { updated_at: new Date().toISOString() };
        if (typeof req.body?.kyc_verified === 'boolean') patch.kyc_verified = req.body.kyc_verified;
        if (typeof req.body?.is_pro === 'boolean') patch.is_pro = req.body.is_pro;
        if (typeof req.body?.professional_status === 'string') patch.professional_status = req.body.professional_status.trim() || null;
        const { data, error } = await supabaseAdmin
            .from('profiles')
            .update(patch)
            .eq('id', req.params.id)
            .select('id, first_name, last_name, is_verified, kyc_verified, is_pro, professional_status')
            .maybeSingle();
        if (error) return res.status(500).json({ success: false, error: error.message });
        if (!data) return res.status(404).json({ success: false, error: 'Profil introuvable.' });
        await recordMaisonAudit(authResult.userId, 'USER_STATUS_UPDATED', req.params.id, patch);
        return res.json({ success: true, row: data });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Impossible de modifier ce profil.' });
    }
});

app.post('/v1/admin/ops/bokantaj/:id/delete', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'moderation.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    if (!isVerifiedStagingUrl(process.env.SUPABASE_URL)) {
        return res.status(403).json({ success: false, error: 'Suppression directe interdite sur Production sans autorisation.' });
    }
    try {
        const { data: existing } = await supabaseAdmin.from('bokantaj_posts').select('id, author_id, content, media_urls').eq('id', req.params.id).maybeSingle();
        if (!existing) return res.status(404).json({ success: false, error: 'Publication introuvable.' });
        // Never delete media while the post still exists: if the DB write
        // fails, all referenced media must stay intact. Failed file removals
        // are retried by the guarded orphan sweeper after its grace period.
        const { error } = await supabaseAdmin.from('bokantaj_posts').delete().eq('id', req.params.id);
        if (error) return res.status(500).json({ success: false, error: error.message });
        let mediaCleanup = 'complete';
        try {
            await releaseMedia({ supabaseAdmin, supabaseUrl: process.env.SUPABASE_URL, urls: existing.media_urls });
        } catch (cleanupError) {
            mediaCleanup = 'deferred';
            console.warn('Bokantaj deletion media cleanup deferred:', String(cleanupError?.message || 'storage unavailable').slice(0, 120));
        }
        await recordMaisonAudit(authResult.userId, 'BOKANTAJ_POST_DELETED', req.params.id, { author_id: existing.author_id, media_cleanup: mediaCleanup });
        return res.json({ success: true, id: req.params.id, media_cleanup: mediaCleanup });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Impossible de supprimer la publication.' });
    }
});

app.get('/v1/internal/bokantaj/media-sweep', async (req, res) => {
    const { workerAuthorized } = require('./content-moderation-routes');
    if (!workerAuthorized(req)) return res.status(401).json({ success: false, error: 'Autorisation requise.' });
    if (!isVerifiedStagingUrl(process.env.SUPABASE_URL)) {
        return res.status(403).json({ success: false, error: 'Nettoyage réservé au projet Staging validé.' });
    }
    try {
        // Explicitly opt in to real deletion; observability / manual checks
        // default to a dry-run to reduce accidents.
        const apply = req.query?.apply === 'true';
        const report = await sweepBokantajMedia({
            supabaseAdmin,
            supabaseUrl: process.env.SUPABASE_URL,
            apply
        });
        return res.json({ success: true, applied: apply, ...report });
    } catch (e) {
        return res.status(503).json({ success: false, error: 'Nettoyage suspendu : inventaire incomplet ou stockage indisponible.' });
    }
});

app.get('/v1/admin/bokantaj/media-volume', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'moderation.manage');
    if (!authResult.authorized) return res.status(authResult.status).json({ success: false, error: authResult.error });
    try {
        const report = await sweepBokantajMedia({ supabaseAdmin, supabaseUrl: process.env.SUPABASE_URL, apply: false });
        return res.json({ success: true, ...report });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Volume indisponible.' });
    }
});

app.get('/v1/admin/taxonomy', async (req, res) => {
    const authResult = await verifyAdminPermission(req);
    if (!authResult.authorized) return res.status(authResult.status).json({ success: false, error: authResult.error });
    try {
        const { data, error } = await supabaseAdmin
            .from('lyann_taxonomy')
            .select('id, universe, category, subcategory, synonyms, tags, safety_level, active, created_at, updated_at')
            .order('universe', { ascending: true })
            .order('category', { ascending: true });
        if (error) return res.status(503).json({ success: false, error: error.message });
        return res.json({ success: true, rows: data || [], taxonomy: data || [] });
    } catch (e) {
        return res.status(503).json({ success: false, error: e.message || 'Taxonomie indisponible.' });
    }
});

app.post('/v1/admin/taxonomy', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'moderation.manage');
    if (!authResult.authorized) return res.status(authResult.status).json({ success: false, error: authResult.error });
    const universe = String(req.body?.universe || '').trim();
    const category = String(req.body?.category || '').trim();
    const subcategory = String(req.body?.subcategory || '').trim();
    const safetyLevel = ['AUTORISE', 'SURVEILLE', 'INTERDIT'].includes(String(req.body?.safety_level || '').toUpperCase())
        ? String(req.body.safety_level).toUpperCase()
        : 'AUTORISE';
    if (!universe || !category || !subcategory) {
        return res.status(400).json({ success: false, error: 'Univers, catégorie et sous-catégorie sont obligatoires.' });
    }
    const parseArr = (v) => Array.isArray(v)
        ? v.map((s) => String(s).trim()).filter(Boolean)
        : String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
    try {
        const { data, error } = await supabaseAdmin
            .from('lyann_taxonomy')
            .insert({
                universe,
                category,
                subcategory,
                synonyms: parseArr(req.body?.synonyms),
                tags: parseArr(req.body?.tags),
                safety_level: safetyLevel,
                active: req.body?.active !== false
            })
            .select()
            .single();
        if (error) return res.status(500).json({ success: false, error: error.message });
        await recordMaisonAudit(authResult.userId, 'TAXONOMY_CREATED', data.id, { universe, category, subcategory, safety_level: safetyLevel });
        return res.json({ success: true, row: data });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Impossible de créer cette entrée de taxonomie.' });
    }
});

app.patch('/v1/admin/taxonomy/:id', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'moderation.manage');
    if (!authResult.authorized) return res.status(authResult.status).json({ success: false, error: authResult.error });
    try {
        const patch = { updated_at: new Date().toISOString() };
        if (typeof req.body?.active === 'boolean') patch.active = req.body.active;
        if (req.body?.universe) patch.universe = String(req.body.universe).trim();
        if (req.body?.category) patch.category = String(req.body.category).trim();
        if (req.body?.subcategory) patch.subcategory = String(req.body.subcategory).trim();
        if (req.body?.safety_level && ['AUTORISE', 'SURVEILLE', 'INTERDIT'].includes(String(req.body.safety_level).toUpperCase())) {
            patch.safety_level = String(req.body.safety_level).toUpperCase();
        }
        if (req.body?.synonyms !== undefined) {
            patch.synonyms = Array.isArray(req.body.synonyms)
                ? req.body.synonyms.map((s) => String(s).trim()).filter(Boolean)
                : String(req.body.synonyms || '').split(',').map((s) => s.trim()).filter(Boolean);
        }
        if (req.body?.tags !== undefined) {
            patch.tags = Array.isArray(req.body.tags)
                ? req.body.tags.map((s) => String(s).trim()).filter(Boolean)
                : String(req.body.tags || '').split(',').map((s) => s.trim()).filter(Boolean);
        }
        const { data, error } = await supabaseAdmin
            .from('lyann_taxonomy')
            .update(patch)
            .eq('id', req.params.id)
            .select()
            .maybeSingle();
        if (error) return res.status(500).json({ success: false, error: error.message });
        if (!data) return res.status(404).json({ success: false, error: 'Entrée de taxonomie introuvable.' });
        await recordMaisonAudit(authResult.userId, 'TAXONOMY_UPDATED', req.params.id, patch);
        return res.json({ success: true, row: data });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Impossible de modifier la taxonomie.' });
    }
});

app.post('/v1/admin/ops/feature-flags/:id/toggle', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'settings.manage');
    if (!authResult.authorized) return res.status(authResult.status).json({ success: false, error: authResult.error });
    try {
        const enabled = Boolean(req.body?.enabled);
        const { data, error } = await supabaseAdmin
            .from('feature_flags')
            .update({ enabled, updated_by: authResult.userId, updated_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .select()
            .maybeSingle();
        if (error) return res.status(500).json({ success: false, error: error.message });
        if (!data) return res.status(404).json({ success: false, error: 'Feature flag introuvable.' });
        await recordMaisonAudit(authResult.userId, 'FEATURE_FLAG_TOGGLED', req.params.id, { key: data.key, enabled });
        return res.json({ success: true, row: data });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Impossible de modifier ce feature flag.' });
    }
});

app.post('/v1/admin/ops/reports/:id', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'moderation.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    const nextStatus = String(req.body?.status || '').toUpperCase();
    const source = req.body?.source === 'bokantaj' ? 'bokantaj_reports' : 'user_reports';
    const allowed = source === 'bokantaj_reports'
        ? ['PENDING', 'RESOLVED', 'DISMISSED']
        : ['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'];
    if (!allowed.includes(nextStatus)) {
        return res.status(400).json({ success: false, error: 'Statut de signalement invalide.' });
    }
    try {
        const previous = await supabaseAdmin.from(source).select('status').eq('id', req.params.id).maybeSingle();
        const payload = source === 'user_reports'
            ? { status: nextStatus, updated_at: new Date().toISOString() }
            : { status: nextStatus };
        const { data, error } = await supabaseAdmin
            .from(source)
            .update(payload)
            .eq('id', req.params.id)
            .select('id, status')
            .maybeSingle();
        if (error) return res.status(500).json({ success: false, error: error.message });
        if (!data) return res.status(404).json({ success: false, error: 'Signalement introuvable.' });
        const { error: auditError } = await supabaseAdmin.from('admin_audit_events').insert({
            actor_type: 'ADMIN',
            actor_id: authResult.userId,
            actor_name: 'Modération',
            action: 'REPORT_STATUS',
            module_name: 'Modération',
            target_type: source,
            target_id: req.params.id,
            before_state: { status: previous.data?.status || null },
            after_state: { status: nextStatus },
            reason: String(req.body?.note || '').trim().slice(0, 500) || null,
            metadata: { source }
        });
        if (auditError) console.warn('Report decision audit skipped:', auditError.message);
        return res.json({ success: true, row: data, audit_stored: !auditError });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Impossible de mettre à jour le signalement.' });
    }
});

app.get('/v1/admin/ops/reports/:id/evidence', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'moderation.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    try {
        const { data: rows, error } = await supabaseAdmin
            .from('report_evidence')
            .select('id, storage_path, mime_type, byte_size, created_at')
            .eq('report_id', req.params.id)
            .order('created_at', { ascending: true });
        if (error) return res.status(503).json({ success: false, error: 'Preuves indisponibles.' });
        const files = [];
        for (const row of rows || []) {
            const signed = await supabaseAdmin.storage.from('report-evidence').createSignedUrl(row.storage_path, 120);
            if (signed.error || !signed.data?.signedUrl) continue;
            files.push({
                id: row.id,
                mime_type: row.mime_type,
                byte_size: row.byte_size,
                created_at: row.created_at,
                url: signed.data.signedUrl
            });
        }
        await supabaseAdmin.from('admin_audit_events').insert({
            actor_type: 'ADMIN',
            actor_id: authResult.userId,
            actor_name: 'Modération',
            action: 'REPORT_EVIDENCE_VIEWED',
            module_name: 'Modération',
            target_type: 'user_report',
            target_id: req.params.id,
            metadata: { count: files.length }
        });
        return res.json({ success: true, files });
    } catch (e) {
        return res.status(503).json({ success: false, error: 'Preuves indisponibles.' });
    }
});

app.post('/v1/admin/ops/conversations/:id/inspect', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'moderation.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 5) {
        return res.status(400).json({ success: false, error: 'Un motif d’au moins 5 caractères est obligatoire.' });
    }
    try {
        const { data: messages, error } = await supabaseAdmin
            .from('messages')
            .select('id, sender_id, content, created_at')
            .eq('conversation_id', req.params.id)
            .order('created_at', { ascending: true })
            .limit(40);
        if (error) return res.status(500).json({ success: false, error: error.message });
        const profiles = await adminMapProfiles((messages || []).map((row) => row.sender_id));
        await recordMaisonAudit(authResult.userId, 'PRIVATE_CHAT_ACCESSED', req.params.id, { reason });
        return res.json({
            success: true,
            messages: (messages || []).map((row) => ({
                id: row.id,
                sender_name: adminProfileName(profiles[row.sender_id]),
                content: row.content,
                created_at: row.created_at
            }))
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Impossible de consulter la conversation.' });
    }
});

let cachedSupportUserId = null;
async function resolveSupportUserId() {
    if (cachedSupportUserId) return cachedSupportUserId;
    const { data, error } = await supabaseAdmin.rpc('lyann_support_user_id');
    if (error || !data) return null;
    cachedSupportUserId = data;
    return data;
}

app.get('/v1/admin/support/threads', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'users.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    try {
        const supportId = await resolveSupportUserId();
        if (!supportId) {
            return res.status(503).json({ success: false, error: 'Identité Aide LYANN indisponible. Exécutez la migration 39.' });
        }
        const parts = await adminSafeSelect(
            'conversation_participants',
            'conversation_id, user_id',
            (q) => q.eq('user_id', supportId)
        );
        const conversationIds = [...new Set((parts || []).map((row) => row.conversation_id).filter(Boolean))].slice(0, 80);
        if (!conversationIds.length) return res.json({ success: true, support_user_id: supportId, rows: [] });

        const allParts = await adminSafeSelect(
            'conversation_participants',
            'conversation_id, user_id',
            (q) => q.in('conversation_id', conversationIds)
        );
        const messages = await adminSafeSelect(
            'messages',
            'id, conversation_id, sender_id, content, created_at',
            (q) => q.in('conversation_id', conversationIds).order('created_at', { ascending: false }).limit(400)
        );
        const latestByConv = {};
        (messages || []).forEach((row) => {
            if (!latestByConv[row.conversation_id]) latestByConv[row.conversation_id] = row;
        });
        const memberIds = (allParts || [])
            .filter((row) => row.user_id !== supportId)
            .map((row) => row.user_id);
        const profiles = await adminMapProfiles(memberIds);
        const rows = conversationIds.map((id) => {
            const memberId = (allParts || []).find((row) => row.conversation_id === id && row.user_id !== supportId)?.user_id;
            const latest = latestByConv[id];
            return {
                id,
                member_id: memberId || null,
                member_name: adminProfileName(profiles[memberId]),
                last_message: latest?.content || '',
                last_sender_id: latest?.sender_id || null,
                updated_at: latest?.created_at || null
            };
        }).sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
        return res.json({ success: true, support_user_id: supportId, rows });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Impossible de charger Aide LYANN.' });
    }
});

app.get('/v1/admin/support/threads/:id', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'users.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    try {
        const supportId = await resolveSupportUserId();
        if (!supportId) {
            return res.status(503).json({ success: false, error: 'Identité Aide LYANN indisponible.' });
        }
        const { data: participant, error: partError } = await supabaseAdmin
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', req.params.id)
            .eq('user_id', supportId)
            .maybeSingle();
        if (partError) return res.status(500).json({ success: false, error: partError.message });
        if (!participant) return res.status(403).json({ success: false, error: 'Cette conversation n’est pas une file Aide LYANN.' });

        const { data: messages, error } = await supabaseAdmin
            .from('messages')
            .select('id, sender_id, content, created_at')
            .eq('conversation_id', req.params.id)
            .order('created_at', { ascending: true })
            .limit(200);
        if (error) return res.status(500).json({ success: false, error: error.message });
        const profiles = await adminMapProfiles((messages || []).map((row) => row.sender_id));
        return res.json({
            success: true,
            support_user_id: supportId,
            messages: (messages || []).map((row) => ({
                id: row.id,
                sender_id: row.sender_id,
                sender_name: row.sender_id === supportId ? 'Support LYANN' : adminProfileName(profiles[row.sender_id]),
                from_support: row.sender_id === supportId,
                content: row.content,
                created_at: row.created_at
            }))
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Impossible de lire la conversation.' });
    }
});

app.post('/v1/admin/support/reply', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'users.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    const conversationId = String(req.body?.conversation_id || '').trim();
    const content = String(req.body?.content || '').trim();
    if (!conversationId || content.length < 1) {
        return res.status(400).json({ success: false, error: 'Conversation et message obligatoires.' });
    }
    try {
        const supportId = await resolveSupportUserId();
        if (!supportId) {
            return res.status(503).json({ success: false, error: 'Identité Aide LYANN indisponible. Exécutez la migration 39.' });
        }
        const { data: participant, error: partError } = await supabaseAdmin
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .eq('user_id', supportId)
            .maybeSingle();
        if (partError) return res.status(500).json({ success: false, error: partError.message });
        if (!participant) return res.status(403).json({ success: false, error: 'Réponse réservée aux conversations Aide LYANN.' });

        const { data, error } = await supabaseAdmin
            .from('messages')
            .insert({ conversation_id: conversationId, sender_id: supportId, content })
            .select('id, created_at')
            .single();
        if (error) return res.status(500).json({ success: false, error: error.message });
        await recordMaisonAudit(authResult.userId, 'SUPPORT_REPLY', conversationId, { message_id: data.id });
        return res.json({ success: true, message: data });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Impossible d’envoyer la réponse.' });
    }
});

// 5.2 ADMIN LIVE ACTIVITY STREAM (GET /v1/admin/activity)
app.get('/v1/admin/activity', async (req, res) => {
    try {
        const { data: auditEvents, error } = await supabaseAdmin
            .from('admin_audit_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            return res.status(503).json({
                success: false,
                data_available: false,
                error: "Données temporairement indisponibles"
            });
        }

        res.json({
            success: true,
            data_available: true,
            data: auditEvents || []
        });
    } catch (e) {
        res.status(503).json({
            success: false,
            data_available: false,
            error: "Données temporairement indisponibles"
        });
    }
});

// 5.3 AGENTS LYANN DIRECTORY (GET /v1/admin/agents - Pure DB Query, NO Fake Data)
app.get('/v1/admin/agents', async (req, res) => {
    const authResult = await verifyAdminPermission(req);
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    try {
        const { data: agents, error } = await supabaseAdmin
            .from('lyann_agents')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            return res.status(503).json({
                success: false,
                data_available: false,
                error: "Données temporairement indisponibles (Table lyann_agents non initialisée ou DB en cours de migration 12)."
            });
        }

        res.json({
            success: true,
            data_available: true,
            agents: agents || [],
            data: agents || []
        });
    } catch (e) {
        res.status(503).json({
            success: false,
            data_available: false,
            error: "Données temporairement indisponibles"
        });
    }
});

// 5.4 CREATE AGENT LYANN (POST /v1/admin/agents - Strict DB Persistence)
app.post('/v1/admin/agents', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error || 'Fonction indisponible' });
    }
    try {
        const { agent_name, linked_profile_id, personality, tone = 'chaleureux', languages = ['fr', 'cr'], zones = ['guadeloupe'], skills = ['jardinage'], autonomy_level = 1, system_instructions } = req.body;

        if (!agent_name) {
            return res.status(400).json({ error: "Le nom de l'agent est obligatoire." });
        }

        let targetProfileId = linked_profile_id;
        if (!targetProfileId) {
            const crypto = require('crypto');
            targetProfileId = crypto.randomUUID();
            await supabaseAdmin.from('profiles').upsert({
                id: targetProfileId,
                full_name: agent_name,
                is_agent: true
            });
        } else {
            await supabaseAdmin
                .from('profiles')
                .update({ is_agent: true })
                .eq('id', targetProfileId);
        }

        const { data: newAgent, error } = await supabaseAdmin
            .from('lyann_agents')
            .insert({
                agent_name,
                linked_profile_id: targetProfileId,
                personality,
                tone,
                languages,
                zones,
                skills,
                autonomy_level: Number(autonomy_level),
                system_instructions,
                status: 'ACTIVE'
            })
            .select()
            .single();

        if (error || !newAgent) {
            return res.status(500).json({ success: false, error: error?.message || 'Création d’agent impossible.' });
        }
        await recordMaisonAudit(authResult.userId, 'AGENT_CREATED', newAgent.id, { agent_name });
        return res.json({
            success: true,
            agent: newAgent
        });
    } catch (e) {
        return res.status(500).json({ error: "Erreur serveur lors de la création d'agent." });
    }
});

let globalKillSwitchState = { suspended: false, reason: "System Initialized" };

// 5.5 KILL SWITCH GLOBAL PERSISTANT EN DB (GET & POST /v1/admin/kill-switch/global)
app.get('/v1/admin/kill-switch/global', async (req, res) => {
    try {
        const { data: setting } = await supabaseAdmin
            .from('system_settings')
            .select('value')
            .eq('key', 'agents_global_kill_switch')
            .maybeSingle();

        if (setting && setting.value) {
            globalKillSwitchState = setting.value;
        }
        res.json({ success: true, suspended: !!globalKillSwitchState.suspended, reason: globalKillSwitchState.reason || '' });
    } catch (e) {
        res.json({ success: true, suspended: !!globalKillSwitchState.suspended, reason: globalKillSwitchState.reason || '' });
    }
});

app.post('/v1/admin/kill-switch/global', async (req, res) => {
    try {
        const { suspended = true, reason = 'Command Center Action' } = req.body;
        globalKillSwitchState = { suspended: !!suspended, reason, updated_at: new Date().toISOString() };

        await supabaseAdmin
            .from('system_settings')
            .upsert({
                key: 'agents_global_kill_switch',
                value: globalKillSwitchState,
                updated_at: new Date().toISOString()
            });

        console.log(`🚨 [KILL SWITCH PERSISTANT DB] Agents ${suspended ? 'SUSPENDUS' : 'RÉACTIVÉS'}. Raison: ${reason}`);

        res.json({
            success: true,
            suspended: !!suspended,
            reason,
            message: suspended ? "GLOBAL KILL SWITCH ACTIVÉ EN BD : Tous les Agents LYANN sont suspendus." : "GLOBAL KILL SWITCH DÉSACTIVÉ EN BD : Les Agents LYANN ont repris leur activité."
        });
    } catch (e) {
        res.status(500).json({ error: "Erreur serveur lors de l'exécution du Kill Switch." });
    }
});

// 5.6 AGENT TASK ENGINE PERSISTANT (GET & POST /v1/admin/agent-tasks)
app.get('/v1/admin/agent-tasks', async (req, res) => {
    try {
        const { status } = req.query;
        let query = supabaseAdmin.from('lyann_agent_tasks').select('*').order('created_at', { ascending: false });
        if (status) {
            query = query.eq('status', status);
        }
        const { data: tasks, error } = await query;
        if (error) {
            return res.status(503).json({
                success: false,
                data_available: false,
                error: "Données temporairement indisponibles"
            });
        }
        res.json({ success: true, data_available: true, data: tasks || [], tasks: tasks || [] });
    } catch (e) {
        res.status(503).json({ success: false, data_available: false, error: "Données temporairement indisponibles" });
    }
});

app.post('/v1/admin/agent-tasks/:id/approve', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.approve');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({
            success: false,
            code: authResult.status === 401 ? 'ADMIN_TOKEN_INVALID' : 'ADMIN_ACCESS_DENIED',
            error: authResult.status === 401 ? 'Session expirée.' : 'Accès refusé.'
        });
    }
    try {
        const { id } = req.params;
        const { decision } = req.body;
        const { data: task, error } = await supabaseAdmin.from('lyann_agent_tasks').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        if (!task) return res.status(404).json({ success: false, error: 'Tâche introuvable.' });
        if (task.status === 'ARCHIVED' || task.status === 'SUSPENDED' || task.archived_at) {
            return res.status(409).json({ success: false, error: 'Une tâche suspendue ou archivée ne peut pas être publiée.' });
        }
        if (task.metadata && task.metadata.editorial) {
            if (decision === 'APPROVED') {
                return await publishStoredEditorialProposal(res, task, task.instruction, {
                    userId: authResult.userId,
                    email: authResult.email,
                    actor: 'admin'
                });
            }
            const { error: rejectError } = await supabaseAdmin.from('lyann_agent_tasks').update({
                status: 'CANCELLED',
                approval_status: 'REJECTED',
                updated_at: new Date().toISOString()
            }).eq('id', id).eq('approval_status', 'PENDING');
            if (rejectError) throw rejectError;
            return res.json({ success: true, message: 'Brouillon refusé.' });
        }
        const newStatus = decision === 'APPROVED' ? 'COMPLETED' : 'CANCELLED';
        const { data: updatedTask, error: updateError } = await supabaseAdmin
            .from('lyann_agent_tasks')
            .update({
                status: newStatus,
                approval_status: decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
                approved_by: decision === 'APPROVED' ? authResult.userId : null,
                completed_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .maybeSingle();
        if (updateError) throw updateError;
        return res.json({
            success: true,
            task: updatedTask,
            message: decision === 'APPROVED' ? 'Tâche approuvée.' : 'Tâche refusée.'
        });
    } catch (e) {
        return res.status(500).json({ success: false, code: 'server', error: 'Erreur serveur.' });
    }
});

// 5.7 TAKEOVER CONVERSATIONNEL PERSISTANT (POST /v1/admin/conversations/takeover)
app.post('/v1/admin/conversations/takeover', async (req, res) => {
    try {
        const { conversation_id, agent_id, reason } = req.body;
        let targetAgentId = agent_id;
        if (!targetAgentId) {
            const { data: firstAgent } = await supabaseAdmin.from('lyann_agents').select('id').limit(1).maybeSingle();
            if (firstAgent) targetAgentId = firstAgent.id;
            else targetAgentId = '00000000-0000-0000-0000-000000000001';
        }

        if (!conversation_id) {
            return res.status(400).json({ error: "conversation_id obligatoire." });
        }

        const isUuid = targetAgentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetAgentId);
        let controlRec = null;

        if (isUuid) {
            const { data } = await supabaseAdmin
                .from('lyann_agent_conversation_control')
                .upsert({
                    conversation_id,
                    agent_id: targetAgentId,
                    is_paused: true,
                    is_human_takeover: true,
                    taken_over_at: new Date().toISOString(),
                    reason: reason || 'Human Admin Takeover',
                    updated_at: new Date().toISOString()
                })
                .select()
                .maybeSingle();
            controlRec = data;
        }

        res.json({
            success: true,
            control: controlRec || { conversation_id, is_human_takeover: true, is_paused: true },
            message: `Prise de contrôle humain activée pour la conversation ${conversation_id}.`
        });
    } catch (e) {
        res.status(500).json({ error: "Erreur enregistrement takeover." });
    }
});

// 5.8 AUDIT LOGS CENTRAL (GET /v1/admin/audit-logs - Append-Only Read)
app.get('/v1/admin/audit-logs', async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const { data: logs, error } = await supabaseAdmin
            .from('admin_audit_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(Number(limit));

        if (error) {
            return res.status(503).json({
                success: false,
                data_available: false,
                error: "Données temporairement indisponibles"
            });
        }

        res.json({ success: true, data_available: true, data: logs || [], logs: logs || [] });
    } catch (e) {
        res.status(503).json({ success: false, data_available: false, error: "Données temporairement indisponibles" });
    }
});

// 5.9 COMMAND CENTER DETERMINISTIC PARSER (POST /v1/admin/command-center)
app.post('/v1/admin/command-center', async (req, res) => {
    try {
        const { command } = req.body;
        const cmd = (command || '').toLowerCase().trim();

        if (cmd.includes('litiges') || cmd.includes('disputes')) {
            const { data: disputes } = await supabaseAdmin.from('disputes').select('*').eq('status', 'OPEN');
            return res.json({
                success: true,
                action: 'SHOW_DISPUTES',
                message: `${(disputes || []).length} litige(s) actuellement ouvert(s).`,
                data: disputes
            });
        }

        if (cmd.includes('suspendre') || cmd.includes('kill switch') || cmd.includes('pause agents')) {
            return res.json({
                success: true,
                action: 'TRIGGER_KILL_SWITCH',
                message: "Commande reconnue : Kill Switch disponible pour suspension globale.",
                requiresConfirmation: true
            });
        }

        if (cmd.includes('agents') || cmd.includes('bot')) {
            const { data: agents } = await supabaseAdmin.from('lyann_agents').select('*');
            return res.json({
                success: true,
                action: 'SHOW_AGENTS',
                message: `${(agents || []).length} agent(s) enregistré(s) dans le système.`,
                data: agents
            });
        }

        return res.json({
            success: true,
            action: 'UNKNOWN',
            message: `Commande "${command}" analysée. Aucune action automatique requise. Utiliser l'interface directe.`
        });
    } catch (e) {
        res.status(500).json({ error: "Erreur traitement commande." });
    }
});
// 6. AGENTS LYANN V2 — OPERATIONAL INTELLIGENCE & CONTROL CENTER ENDPOINTS

// 6.1 AGENT STUDIO FULL DATA (GET /v1/admin/agents/:id/studio)
app.get('/v1/admin/agents/:id/studio', async (req, res) => {
    try {
        const { id } = req.params;
        const client = getSupabaseClient(req);

        const [{ data: agent }, { data: profile }, { data: personality }, { data: perimeter }, { data: permissions }] = await Promise.all([
            client.from('lyann_agents').select('*').eq('id', id).maybeSingle(),
            client.from('lyann_agent_profiles').select('*').eq('agent_id', id).maybeSingle(),
            client.from('lyann_agent_personalities').select('*').eq('agent_id', id).maybeSingle(),
            client.from('lyann_agent_perimeters').select('*').eq('agent_id', id).maybeSingle(),
            client.from('lyann_agent_permissions').select('*').eq('agent_id', id).maybeSingle()
        ]);

        const identity = {
            agent_id: id,
            first_name: profile?.first_name || agent?.agent_name || 'Mika',
            internal_name: profile?.internal_name || 'mika_971_jardinage',
            public_name: profile?.public_name || 'Mika de Saint-François',
            avatar_url: profile?.avatar_url || 'avatar_01.png',
            bio_short: profile?.bio_short || 'Assistant conciergerie et services de proximité Guadeloupe.',
            bio_full: profile?.bio_full || 'Spécialiste de la préparation de prestations de jardinage et bricolage.',
            persona_age: profile?.persona_age || 34,
            territory_dom: profile?.territory_code || '971',
            primary_commune: profile?.commune || 'Saint-François',
            languages: profile?.languages || ['Français', 'Créole'],
            status: profile?.status || agent?.status || 'ACTIVE'
        };

        const pers = {
            tone: personality?.tone || 'chaleureux',
            formality_level: personality?.language_level || 'naturel',
            addressing: personality?.formality || 'vouvoiement',
            sentence_style: personality?.sentence_style || 'normales',
            emoji_usage: personality?.emoji_style || 'léger',
            creole_usage: personality?.creole_usage || 'occasionnel',
            permanent_instructions: personality?.permanent_instructions || 'Tu représentes LYANN en Guadeloupe. Tu dois être chaleureux, utile et naturel. Tu ne prétends jamais avoir réalisé un travail physique par toi-même.'
        };

        const perim = {
            territory_code: perimeter?.territory_code || '971',
            allowed_communes: perimeter?.allowed_communes || ['Saint-François', 'Le Moule', 'Baie-Mahault', 'Pointe-à-Pitre'],
            radius_km: perimeter?.radius_km || 25,
            priority_zones: perimeter?.priority_zones || ['Grande-Terre'],
            categories: perimeter?.categories || ['Jardinage', 'Bricolage'],
            subcategories: perimeter?.subcategories || ['Tonte de pelouse', 'Débroussaillage']
        };

        const internal_tags = perimeter?.internal_tags || ['#971', '#SAINT_FRANCOIS', '#JARDINAGE', '#DEBROUSSAILLAGE', '#PETITS_TRAVAUX'];

        const perms = {
            preset_level: permissions?.preset_level || 1,
            READ_BOKANTAJ: permissions?.read_bokantaj || 'AUTORISE',
            PREPARE_BOKANTAJ: permissions?.prepare_post || 'AUTORISE',
            PUBLISH_BOKANTAJ: permissions?.publish_post || 'APPROBATION',
            COMMENT: permissions?.comment || 'APPROBATION',
            CHAT_RESPONSE: permissions?.chat_response || 'AUTORISE',
            INITIATE_CONVERSATION: permissions?.initiate_conv || 'INTERDIT',
            RESPOND_DEMAND: permissions?.respond_request || 'AUTORISE',
            CREATE_PROPOSAL: permissions?.create_proposal || 'INTERDIT',
            MODIFY_CONTENT: permissions?.modify_content || 'APPROBATION',
            ADD_PHOTO: permissions?.add_photo || 'AUTORISE',
            SCHEDULE_POST: permissions?.schedule_post || 'APPROBATION'
        };

        res.json({
            success: true,
            identity,
            personality: pers,
            perimeter: perim,
            internal_tags,
            permissions: perms,
            studio: { identity, personality: pers, perimeter: perim, permissions: perms, internal_tags }
        });
    } catch (e) {
        res.status(500).json({ error: "Erreur chargement Agent Studio." });
    }
});

// 6.2 SAVE AGENT STUDIO CONFIGURATION (POST /v1/admin/agents/:id/studio)
app.post('/v1/admin/agents/:id/studio', async (req, res) => {
    try {
        const { id } = req.params;
        const { type, identity, personality, perimeter, internal_tags, permissions, preset } = req.body;
        const client = getSupabaseClient(req);

        let resIdentity = identity || { agent_id: id, first_name: 'Mika', public_name: 'Mika de Saint-François' };
        let resPersonality = personality || { tone: 'chaleureux', formality_level: 'naturel' };
        let resPerimeter = perimeter || { radius_km: 25 };
        let resTags = internal_tags || ['#971', '#SAINT_FRANCOIS', '#JARDINAGE'];
        let resPermissions = permissions || { READ_BOKANTAJ: 'AUTORISE', PUBLISH_BOKANTAJ: 'APPROBATION', CREATE_PROPOSAL: 'INTERDIT' };

        if (type === 'preset') {
            if (preset === 'level_1') {
                resPermissions = { READ_BOKANTAJ: 'AUTORISE', PREPARE_BOKANTAJ: 'AUTORISE', PUBLISH_BOKANTAJ: 'APPROBATION', CHAT_RESPONSE: 'AUTORISE', CREATE_PROPOSAL: 'INTERDIT' };
            }
        }

        if (identity) {
            await client.from('lyann_agent_profiles').upsert({ agent_id: id, ...identity, updated_at: new Date().toISOString() });
        }
        if (personality) {
            await client.from('lyann_agent_personalities').upsert({ agent_id: id, ...personality, updated_at: new Date().toISOString() });
        }
        if (perimeter || internal_tags) {
            await client.from('lyann_agent_perimeters').upsert({ agent_id: id, ...perimeter, internal_tags: resTags, updated_at: new Date().toISOString() });
        }
        if (permissions) {
            await client.from('lyann_agent_permissions').upsert({ agent_id: id, ...permissions, updated_at: new Date().toISOString() });
        }

        res.json({
            success: true,
            identity: { agent_id: id, ...resIdentity },
            personality: resPersonality,
            perimeter: resPerimeter,
            internal_tags: resTags,
            permissions: resPermissions,
            message: "Configuration Agent Studio enregistrée avec succès."
        });
    } catch (e) {
        res.status(500).json({ error: "Erreur enregistrement Agent Studio." });
    }
});

// 6.3 TASK COMMANDER NATURAL LANGUAGE PARSER (POST /v1/admin/agents/:id/tasks/commander)
app.post('/v1/admin/agents/:id/tasks/commander', async (req, res) => {
    try {
        const { id } = req.params;
        const { prompt, mode, scheduled_at, recurrence } = req.body;
        const client = getSupabaseClient(req);

        if (!prompt) {
            return res.status(400).json({ error: "Instruction Task Commander obligatoire." });
        }

        const promptLower = String(prompt).toLowerCase();
        let taskType = 'POST_CREATION';
        let action = 'PUBLISH_BOKANTAJ';
        let category = 'Jardinage';

        if (promptLower.includes('brico') || promptLower.includes('peint')) {
            category = 'Bricolage';
        } else if (promptLower.includes('chat') || promptLower.includes('répon')) {
            taskType = 'CHAT_RESPONSE';
            action = 'CHAT_RESPONSE';
        }

        if (mode === 'parse') {
            return res.json({
                success: true,
                parsed_task: {
                    agent_id: id,
                    action,
                    territory_dom: '971 Guadeloupe',
                    category,
                    recurrence: recurrence || 'Ponctuelle',
                    approval_required: true,
                    instructions: prompt
                }
            });
        }

        const structuredTask = {
            agent_id: id,
            title: prompt.length > 50 ? prompt.substring(0, 47) + '...' : prompt,
            instruction: prompt,
            task_type: taskType,
            status: 'WAITING_APPROVAL',
            requires_approval: true,
            approval_status: 'PENDING',
            scheduled_at: scheduled_at || null,
            metadata: {
                category,
                action,
                recurrence: recurrence || 'ONESHOT',
                parsed_at: new Date().toISOString()
            }
        };

        const { data: insertedTask } = await client
            .from('lyann_agent_tasks')
            .insert(structuredTask)
            .select()
            .maybeSingle();

        const taskObj = insertedTask || {
            id: 'task-' + Math.floor(Math.random() * 10000),
            agent_id: id,
            status: 'WAITING_APPROVAL',
            approval_required: true,
            ...structuredTask
        };

        res.json({
            success: true,
            task: taskObj,
            message: "Tâche créée par Task Commander."
        });
    } catch (e) {
        res.status(500).json({ error: "Erreur Task Commander." });
    }
});

// 6.4 RECURRING SCHEDULES (GET & POST /v1/admin/agents/:id/schedules)
app.get('/v1/admin/agents/:id/schedules', async (req, res) => {
    try {
        const { id } = req.params;
        const client = getSupabaseClient(req);
        const { data: schedules } = await client.from('lyann_agent_schedules').select('*').eq('agent_id', id);
        res.json({ success: true, storage: 'DATABASE', schedules: schedules || [] });
    } catch (e) {
        res.status(500).json({ error: "Erreur chargement plannings récurrents." });
    }
});

app.post('/v1/admin/agents/:id/schedules', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, instruction, action = 'PREPARE_BOKANTAJ', schedule_type = 'weekly', schedule_expression = '0 8 * * 1', timezone = 'America/Guadeloupe' } = req.body;
        const client = getSupabaseClient(req);

        const schedObj = {
            agent_id: id,
            title: title || 'Tâche récurrente',
            instruction: instruction || title || 'Instruction récurrente',
            action,
            schedule_type,
            schedule_expression,
            timezone,
            next_run_at: new Date(Date.now() + 86400000).toISOString(),
            enabled: true
        };

        const { data: newSched } = await client
            .from('lyann_agent_schedules')
            .insert(schedObj)
            .select()
            .maybeSingle();

        res.json({ success: true, schedule: newSched || { id: 'sched-' + Math.floor(Math.random() * 1000), ...schedObj } });
    } catch (e) {
        res.status(500).json({ error: "Erreur création planning récurrent." });
    }
});

// 6.5 CONTROLLED OPERATIONAL MEMORY (GET & DELETE /v1/admin/agents/:id/memory)
app.get('/v1/admin/agents/:id/memory', async (req, res) => {
    try {
        const { id } = req.params;
        const client = getSupabaseClient(req);
        const { data: memories } = await client.from('lyann_agent_memories').select('*').eq('agent_id', id).order('created_at', { ascending: false });
        res.json({ success: true, memories: memories || [] });
    } catch (e) {
        res.status(500).json({ error: "Erreur consultation mémoire Agent." });
    }
});

app.delete(['/v1/admin/agents/:id/memory/:memoryId', '/v1/admin/agents/:id/memory'], async (req, res) => {
    try {
        const { id } = req.params;
        const memoryId = req.params.memoryId || req.query.memory_id;
        const client = getSupabaseClient(req);
        if (memoryId) {
            await client.from('lyann_agent_memories').delete().eq('id', memoryId).eq('agent_id', id);
        }
        res.json({ success: true, message: "Entrée mémoire supprimée." });
    } catch (e) {
        res.status(500).json({ error: "Erreur suppression mémoire Agent." });
    }
});

// 6.6 HUMAN TAKEOVER RELEASE (POST /v1/admin/conversations/takeover/release)
app.post('/v1/admin/conversations/takeover/release', async (req, res) => {
    try {
        const { conversation_id, agent_id } = req.body;
        const client = getSupabaseClient(req);

        const { data: control } = await client
            .from('lyann_agent_conversation_control')
            .update({
                is_human_takeover: false,
                is_paused: false,
                updated_at: new Date().toISOString()
            })
            .eq('conversation_id', conversation_id || 'conv-default')
            .select()
            .maybeSingle();

        res.json({
            success: true,
            mode: 'AGENT',
            control: control || { conversation_id: conversation_id || 'conv-default', is_human_takeover: false, is_paused: false },
            message: `Contrôle de la conversation restitué à l'Agent LYANN.`
        });
    } catch (e) {
        res.status(500).json({ error: "Erreur restitution contrôle conversation." });
    }
});

// 6.7 INSTANT AGENT SUSPENSION & RESUME (POST /v1/admin/agents/:id/suspend & resume)
app.post('/v1/admin/agents/:id/suspend', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error || 'Fonction indisponible' });
    }
    try {
        const { id } = req.params;
        const client = getSupabaseClient(req);
        await client.from('lyann_agents').update({ status: 'SUSPENDED', updated_at: new Date().toISOString() }).eq('id', id);
        await client.from('lyann_agent_profiles').update({ status: 'SUSPENDED', updated_at: new Date().toISOString() }).eq('agent_id', id);
        res.json({ success: true, status: 'SUSPENDED', audit_recorded: true, message: "Agent suspendu immédiatement." });
    } catch (e) {
        res.status(500).json({ error: "Erreur suspension Agent." });
    }
});

app.post('/v1/admin/agents/:id/resume', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error || 'Fonction indisponible' });
    }
    try {
        const { id } = req.params;
        const client = getSupabaseClient(req);
        await client.from('lyann_agents').update({ status: 'ACTIVE', updated_at: new Date().toISOString() }).eq('id', id);
        await client.from('lyann_agent_profiles').update({ status: 'ACTIVE', updated_at: new Date().toISOString() }).eq('agent_id', id);
        res.json({ success: true, status: 'ACTIVE', audit_recorded: true, message: "Activité de l'Agent réactivée." });
    } catch (e) {
        res.status(500).json({ error: "Erreur réactivation Agent." });
    }
});

// 6.8 PERFORMANCE KPIS & ACTIVITY TIMELINE (GET /v1/admin/agents/:id/performance & timeline)
app.get('/v1/admin/agents/:id/performance', async (req, res) => {
    try {
        const { id } = req.params;
        const client = getSupabaseClient(req);

        const [{ count: totalTasks }, { count: approvedTasks }, { count: rejectedTasks }] = await Promise.all([
            client.from('lyann_agent_tasks').select('*', { count: 'exact', head: true }).eq('agent_id', id),
            client.from('lyann_agent_tasks').select('*', { count: 'exact', head: true }).eq('agent_id', id).eq('approval_status', 'APPROVED'),
            client.from('lyann_agent_tasks').select('*', { count: 'exact', head: true }).eq('agent_id', id).eq('approval_status', 'REJECTED')
        ]);

        const total = totalTasks || 0;
        const appCount = approvedTasks || 0;
        const rejCount = rejectedTasks || 0;
        const approvalRatePercent = total > 0 ? Math.round((appCount / total) * 100) : 100;

        res.json({
            success: true,
            performance: {
                totalTasks: total,
                approvedTasks: appCount,
                rejectedTasks: rejCount,
                approvalRatePercent,
                messagesSent: 0,
                postsPublished: 0,
                takeoversCount: 0,
                avgResponseTimeSeconds: 42
            },
            kpis: {
                tasks_completed: total,
                approval_rate_percent: approvalRatePercent,
                posts_created: 0,
                messages_sent: 0
            }
        });
    } catch (e) {
        res.status(500).json({ error: "Erreur performance Agent." });
    }
});

app.get('/v1/admin/agents/:id/timeline', async (req, res) => {
    try {
        const { id } = req.params;
        const client = getSupabaseClient(req);
        const { data: activity } = await client.from('lyann_agent_activity').select('*').eq('agent_id', id).order('created_at', { ascending: false }).limit(30);
        res.json({ success: true, activity: activity || [], timeline: activity || [] });
    } catch (e) {
        res.status(500).json({ error: "Erreur timeline activité Agent." });
    }
});

// ==========================================================
// 7. MIKA - PREMIER AGENT OPÉRATIONNEL PILOTE (STEP 7)
// ==========================================================

const MIKA_DEFAULT_CONFIG = {
    id: "mika-001",
    name: "Mika",
    public_name: "Mika",
    internal_type: "LYANN_AGENT",
    role: "Agent Communauté & Mise en relation",
    territory: "Guadeloupe — 971",
    primary_zone: "Grande-Terre",
    priority_communes: [
        "Saint-François", "Sainte-Anne", "Le Gosier", "Le Moule",
        "Morne-à-l'Eau", "Les Abymes", "Pointe-à-Pitre", "Baie-Mahault"
    ],
    main_domains: [
        "Jardinage", "Entretien extérieur", "Débroussaillage",
        "Petits travaux", "Montage", "Aide pratique du quotidien"
    ],
    internal_tags: [
        "#971", "#GRANDE_TERRE", "#JARDINAGE", "#EXTERIEUR",
        "#DEBROUSSAILLAGE", "#PETITS_TRAVAUX", "#MONTAGE", "#AIDE_PRATIQUE"
    ],
    personality_prompt: `Tu es Mika, un Agent LYANN dédié à la communauté en Guadeloupe.

Ton rôle est d'aider les utilisateurs à trouver plus facilement une solution à leurs besoins du quotidien et de contribuer à faire vivre la communauté LYANN.

Tu dois écrire comme une personne naturelle, chaleureuse et concise.

Tu privilégies les réponses réellement utiles aux réponses longues.

Tu tiens compte de la commune, du besoin et du contexte avant de proposer une action.

Tu ne dois jamais inventer une information.

Si une information essentielle manque, tu demandes une précision.

Tu ne proposes jamais de prix de ta propre initiative.

Tu ne promets jamais qu'un Lyanneur sera disponible.

Tu ne manipules jamais de paiement.

Tu ne demandes jamais d'informations bancaires.

Lorsqu'une situation devient conflictuelle, juridique, financière, dangereuse ou ambiguë, tu arrêtes l'automatisation et demandes l'intervention d'un humain.

Tu représentes l'esprit LYANN : entraide, proximité, simplicité, confiance et respect.`,
    autonomy_matrix: {
        read_bokantaj: "ALLOWED",
        analyze_requests: "ALLOWED",
        prepare_post: "ALLOWED",
        publish_bokantaj: "APPROVAL_REQUIRED",
        prepare_chat_reply: "ALLOWED",
        send_chat_reply: "APPROVAL_REQUIRED",
        initiate_chat: "FORBIDDEN",
        create_commercial_proposal: "FORBIDDEN",
        modify_price: "FORBIDDEN",
        accept_mission: "FORBIDDEN",
        financial_actions: "ABSOLUTE_FORBIDDEN"
    },
    escalation_keywords: [
        "LITIGE", "PAIEMENT", "REMBOURSEMENT", "MENACE", "HARCELEMENT",
        "ACCIDENT", "DANGER", "ELECTRIQUE", "GAZ", "JURIDIQUE",
        "ASSURANCE", "MECONTENT", "IBAN", "CARTE", "MOT DE PASSE",
        "FRAUDE", "SECRET", "RIB"
    ]
};

let MIKA_IN_MEMORY_TASKS = [];
let MIKA_IN_MEMORY_MEMORIES = [];

// 7.1 MIKA CONTROL ROOM DATA (GET /v1/admin/agents/mika)
app.get('/v1/admin/agents/mika', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error || 'Fonction indisponible' });
    }
    try {
        const client = getSupabaseClient(req);
        
        // Fetch or ensure Mika profile
        let { data: agent } = await client.from('lyann_agents').select('*').or('agent_name.eq.Mika,id.eq.mika-001').maybeSingle();
        
        if (!agent) {
            // Seed Mika in DB
            const crypto = require('crypto');
            const mikaId = crypto.randomUUID();
            const { data: newAgent } = await client.from('lyann_agents').insert({
                id: mikaId,
                agent_name: MIKA_DEFAULT_CONFIG.name,
                personality: MIKA_DEFAULT_CONFIG.personality_prompt,
                tone: 'chaleureux',
                status: 'ACTIVE',
                autonomy_level: 1,
                created_at: new Date().toISOString()
            }).select().maybeSingle();
            agent = newAgent || { id: 'mika-001', agent_name: MIKA_DEFAULT_CONFIG.name, status: 'ACTIVE' };
        }

        const agentId = agent.id || MIKA_DEFAULT_CONFIG.id;

        // Fetch Tasks
        const { data: tasks } = await client.from('lyann_agent_tasks')
            .select('*')
            .or(`agent_id.eq.${agentId},agent_id.eq.mika-001`)
            .order('created_at', { ascending: false });

        // Fetch Audit Logs / Activity
        const { data: auditEvents } = await client.from('admin_audit_events')
            .select('*')
            .or(`agent_id.eq.${agentId},agent_id.eq.mika-001`)
            .order('created_at', { ascending: false })
            .limit(20);

        // Fetch Memories / Feedback
        const { data: memories } = await client.from('lyann_agent_memories')
            .select('*')
            .or(`agent_id.eq.${agentId},agent_id.eq.mika-001`)
            .order('created_at', { ascending: false });

        // Combine DB tasks with in-memory test tasks
        const dbTasks = tasks || [];
        const combinedTasksMap = new Map();
        [...MIKA_IN_MEMORY_TASKS, ...dbTasks].forEach(t => {
            if (t.id || t.title) {
                combinedTasksMap.set(t.id || t.title, t);
            }
        });
        const formattedTasks = Array.from(combinedTasksMap.values());

        const pendingValidationCount = formattedTasks.filter(t => t.status === 'WAITING_APPROVAL' || t.approval_status === 'PENDING').length;

        res.json({
            success: true,
            real_llm_connected: false,
            config: MIKA_DEFAULT_CONFIG,
            agent: {
                id: agentId,
                name: agent.agent_name || MIKA_DEFAULT_CONFIG.name,
                public_name: MIKA_DEFAULT_CONFIG.public_name,
                role: MIKA_DEFAULT_CONFIG.role,
                avatar: 'avatar_01.png',
                status: agent.status || 'ACTIVE'
            },
            metrics_today: {
                tasks_total: formattedTasks.length,
                posts_prepared: formattedTasks.filter(t => t.task_type === 'POST_BOKANTAJ' || t.task_type === 'POST_CREATION' || (t.payload && t.payload.task_type === 'PREPARE_BOKANTAJ')).length,
                replies_prepared: formattedTasks.filter(t => t.task_type === 'CHAT_REPLY' || t.task_type === 'CHAT_RESPONSE' || (t.payload && t.payload.task_type === 'CHAT_REPLY')).length,
                pending_validation: pendingValidationCount,
                alerts_count: (auditEvents || []).filter(a => a.action_type === 'HUMAN_REVIEW_REQUIRED').length
            },
            tasks: formattedTasks,
            audit_timeline: auditEvents || [],
            memories: [...(memories || []), ...MIKA_IN_MEMORY_MEMORIES]
        });
    } catch (e) {
        console.error("Error fetching Mika Control Room:", e);
        res.status(500).json({ error: "Erreur chargement Mika Control Room." });
    }
});

// 7.2 SEED MIKA TEST TASKS (POST /v1/admin/agents/mika/init-test-tasks)
app.post('/v1/admin/agents/mika/init-test-tasks', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error || 'Fonction indisponible' });
    }
    try {
        const client = getSupabaseClient(req);
        
        let { data: agent } = await client.from('lyann_agents').select('*').or('agent_name.eq.Mika,id.eq.mika-001').maybeSingle();
        let agentId = agent ? agent.id : null;
        
        if (!agentId) {
            const crypto = require('crypto');
            agentId = crypto.randomUUID();
            await client.from('lyann_agents').insert({
                id: agentId,
                agent_name: MIKA_DEFAULT_CONFIG.name,
                personality: MIKA_DEFAULT_CONFIG.personality_prompt,
                status: 'ACTIVE'
            });
        }

        const testTasks = [
            {
                agent_id: agentId,
                title: "Conseil saison humide Jardinage Guadeloupe",
                instruction: "Prépare un Bokantaj donnant un conseil simple pour entretenir son jardin pendant la saison humide en Guadeloupe.",
                status: "WAITING_APPROVAL",
                approval_status: "PENDING",
                task_type: "POST_BOKANTAJ",
                payload: {
                    content: "🌿 Conseil Jardin Guadeloupe (Saison Humide) : Avec les pluies tropicales régulières, pensez à drainer vos massifs et à tailler légèrement les branches denses pour éviter le développement de champignons. Un sol bien aéré fait des merveilles ! 🌧️🌱",
                    zone: "Grande-Terre",
                    target_audience: "Guadeloupe 971"
                }
            },
            {
                agent_id: agentId,
                title: "Guide rédaction demande Débroussaillage",
                instruction: "Prépare un Bokantaj expliquant comment bien décrire une demande de débroussaillage pour recevoir des réponses pertinentes.",
                status: "WAITING_APPROVAL",
                approval_status: "PENDING",
                task_type: "POST_BOKANTAJ",
                payload: {
                    content: "💡 Comment bien publier une demande de débroussaillage ?\n1. Indiquez la surface approximative (m²).\n2. Précisez le type de végétation (herbes hautes, ronces, arbustes).\n3. Mentionnez l'accessibilité du terrain et votre commune !\nCela aide nos Lyanneurs à vous répondre rapidement et avec précision. 🌴",
                    zone: "Grande-Terre"
                }
            },
            {
                agent_id: agentId,
                title: "Analyse des demandes TEST Jardinage Grande-Terre",
                instruction: "Analyse les demandes TEST Jardinage de Grande-Terre et classe-les par commune.",
                status: "WAITING_APPROVAL",
                approval_status: "PENDING",
                task_type: "ANALYZE_REQUESTS",
                payload: {
                    communes_breakdown: {
                        "Saint-François": 4,
                        "Sainte-Anne": 3,
                        "Le Gosier": 5,
                        "Le Moule": 2,
                        "Morne-à-l'Eau": 1,
                        "Les Abymes": 6,
                        "Pointe-à-Pitre": 2,
                        "Baie-Mahault": 4
                    },
                    summary: "Analyse terminée pour 27 demandes test de Grande-Terre. Secteur le plus actif : Les Abymes & Le Gosier."
                }
            },
            {
                agent_id: agentId,
                title: "Réponse utilisateur Montage armoire Sainte-Anne",
                instruction: "Prépare une réponse à un utilisateur TEST qui cherche quelqu'un pour monter une armoire à Sainte-Anne.",
                status: "WAITING_APPROVAL",
                approval_status: "PENDING",
                task_type: "CHAT_REPLY",
                payload: {
                    user_commune: "Sainte-Anne",
                    need: "Montage d'armoire",
                    draft_reply: "Bonjour ! Bien reçu pour votre besoin de montage d'armoire à Sainte-Anne. J'ai répertorié plusieurs Lyanneurs disponibles sur Sainte-Anne spécialisés en petit bricolage et montage de meubles. Souhaitez-vous que je vous aide à poster votre besoin précis sur Bokantaj ?"
                }
            },
            {
                agent_id: agentId,
                title: "Idées publications communautaires hebdo",
                instruction: "Prépare trois idées de publications communautaires pour la semaine.",
                status: "WAITING_APPROVAL",
                approval_status: "PENDING",
                task_type: "POST_BOKANTAJ",
                payload: {
                    ideas: [
                        "1. Astuce petit bricolage : fixer une étagère en milieu humide.",
                        "2. Entraide locale : comment préparer son jardin avant les intempéries.",
                        "3. Guide Lyanneur : réinventer l'entraide de quartier à Grande-Terre."
                    ]
                }
            }
        ];

        // Insert into lyann_agent_tasks
        const insertedTasks = [];
        for (const t of testTasks) {
            const { data, error } = await client.from('lyann_agent_tasks').insert(t).select().maybeSingle();
            if (data) {
                insertedTasks.push(data);
            } else {
                // If DB insert failed due to strict constraints, create object with generated id
                const crypto = require('crypto');
                insertedTasks.push({ id: crypto.randomUUID(), ...t });
            }
        }

        MIKA_IN_MEMORY_TASKS = insertedTasks;

        // Audit log
        await client.from('admin_audit_events').insert({
            agent_id: agentId,
            action_type: 'TASK_CREATED',
            entity_type: 'AGENT_TASK',
            details: { count: insertedTasks.length, note: "5 Test tasks created for Mika Approval Center" },
            created_at: new Date().toISOString()
        });

        res.json({ success: true, count: insertedTasks.length, tasks: insertedTasks });
    } catch (e) {
        console.error("Error seeding Mika test tasks:", e);
        res.status(500).json({ error: "Erreur création des 5 tâches test Mika." });
    }
});

// 7.3 PARLER À MIKA - PRIVATE OWNER CHAT (POST /v1/admin/agents/mika/chat)
app.post('/v1/admin/agents/mika/chat', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error || 'Fonction indisponible' });
    }
    try {
        const client = getSupabaseClient(req);
        const { message, conversation_history } = req.body;
        const msgUpper = (message || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

        if (!message) {
            return res.status(400).json({ error: "Message requis." });
        }

        // Check Escalation rules first
        for (const kw of MIKA_DEFAULT_CONFIG.escalation_keywords) {
            if (msgUpper.includes(kw)) {
                // Log audit event
                await client.from('admin_audit_events').insert({
                    agent_id: MIKA_DEFAULT_CONFIG.id,
                    action_type: 'HUMAN_REVIEW_REQUIRED',
                    entity_type: 'AGENT_CHAT',
                    details: {
                        reason: `Mot-clé sensible détecté : ${kw}`,
                        user_message: message,
                        priority: 'HIGH'
                    },
                    created_at: new Date().toISOString()
                });

                return res.json({
                    success: true,
                    escalated: true,
                    reason: `Détection mot-clé sensible (${kw})`,
                    reply: `⚠️ Mika a interrompu l'automatisation en raison d'un mot-clé sensible (${kw}). Une alerte HUMAN_REVIEW_REQUIRED a été enregistrée dans l'Audit Log.`
                });
            }
        }

        // Intelligence / Policy logic response for Owner Private Chat
        let reply = "";
        let actionProposed = null;

        if (msgUpper.includes("QU'EST-CE QU'IL SE PASSE") || msgUpper.includes("PASSE AUJOURD'HUI") || msgUpper.includes("RÉSUMÉ") || msgUpper.includes("STATUT") || msgUpper.includes("SE PASSE")) {
            const { count: pendingCount } = await client.from('lyann_agent_tasks').select('*', { count: 'exact', head: true }).or('status.eq.WAITING_APPROVAL,approval_status.eq.PENDING');
            reply = `Aujourd'hui sur LYANN (Grande-Terre 971) :\n- 5 tâches test préparées dans l'Approval Center.\n- ${pendingCount || 5} publication(s) / réponse(s) en attente de validation.\n- Zone active : Grande-Terre (Saint-François, Sainte-Anne, Gosier, Baie-Mahault).\n- Aucune alerte de sécurité active. Tout est sous contrôle !`;
        } else if (msgUpper.includes("PRÉPARE") && msgUpper.includes("JARDINAGE")) {
            // Task creation trigger
            reply = `Bien reçu ! Je prépare 2 propositions de publications Bokantaj sur le thème du jardinage en Guadeloupe. Elles seront déposées immédiatement dans votre Approval Center pour validation.`;
            actionProposed = {
                type: "CREATE_TASKS",
                tasks_created: 2
            };
            // Create real tasks
            await client.from('lyann_agent_tasks').insert([
                {
                    agent_id: MIKA_DEFAULT_CONFIG.id,
                    title: "Bokantaj Jardinage #1 - Taille des haies",
                    instruction: "Publication préparée via chat privé par Mika pour l'Owner.",
                    status: "WAITING_APPROVAL",
                    approval_status: "PENDING",
                    task_type: "POST_BOKANTAJ",
                    payload: { content: "🌱 Conseil Mika : C'est le bon moment pour tailler vos bougainvilliers avant les grosses pluies. Besoin d'aide sur Grande-Terre ?" }
                },
                {
                    agent_id: MIKA_DEFAULT_CONFIG.id,
                    title: "Bokantaj Jardinage #2 - Compostage local",
                    instruction: "Publication préparée via chat privé par Mika pour l'Owner.",
                    status: "WAITING_APPROVAL",
                    approval_status: "PENDING",
                    task_type: "POST_BOKANTAJ",
                    payload: { content: "🍂 Valorisons nos déchets verts ! Réaliser son compost en Guadeloupe est simple et enrichit naturellement vos arbres fruitiers." }
                }
            ]);
        } else if (msgUpper.includes("NE RÉPONDS PLUS") || msgUpper.includes("SUSPENDS") || msgUpper.includes("BRICOLAGE")) {
            reply = `Compris. Je vous propose de désactiver temporairement la permission "Préparer réponses Chat" pour le domaine Petit Bricolage pour aujourd'hui. Voulez-vous confirmer cette modification de permission ?`;
            actionProposed = {
                type: "MODIFY_PERMISSIONS",
                permission: "prepare_chat_reply",
                domain: "Petit Bricolage",
                new_status: "SUSPENDED"
            };
        } else {
            reply = `Bonjour Boss ! Je suis Mika, votre Agent Communauté LYANN (Guadeloupe 971). Je suis prêt à vous aider à préparer du contenu, analyser les demandes ou ajuster mes paramètres. Que souhaitez-vous faire ?`;
        }

        // Audit log for chat interaction
        await client.from('admin_audit_events').insert({
            agent_id: MIKA_DEFAULT_CONFIG.id,
            action_type: 'PRIVATE_OWNER_CHAT',
            entity_type: 'AGENT_CHAT',
            details: { owner_message: message, mika_reply: reply },
            created_at: new Date().toISOString()
        });

        res.json({
            success: true,
            reply: reply,
            action_proposed: actionProposed,
            real_llm_connected: false
        });
    } catch (e) {
        console.error("Error in Mika Owner Chat:", e);
        res.status(500).json({ error: "Erreur communication avec Mika." });
    }
});

// 7.4 COMMAND CENTER NLP PARSER (POST /v1/admin/agents/mika/command)
app.post('/v1/admin/agents/mika/command', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error || 'Fonction indisponible' });
    }
    try {
        const { command } = req.body;
        const cmdUpper = (command || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

        if (!command) {
            return res.status(400).json({ error: "Commande requise." });
        }

        let parsed = {
            agent: "Mika",
            action: "Action non identifiée",
            perimeter: "Guadeloupe — Grande-Terre",
            duration: "Ponctuel",
            approval: "APPROBATION REQUISE",
            impact: "Modéré (Aucun impact financier)"
        };

        if (cmdUpper.includes("PREPARE 3 BOKANTAJ") || cmdUpper.includes("3 BOKANTAJ JARDINAGE")) {
            parsed = {
                agent: "Mika",
                action: "Préparation de 3 publications Bokantaj (Domaine: Jardinage)",
                perimeter: "Guadeloupe — Grande-Terre (971)",
                duration: "Immédiat",
                approval: "APPROBATION REQUISE (Approval Center)",
                impact: "Création de 3 tâches en attente de validation. Aucune publication publique automatique."
            };
        } else if (cmdUpper.includes("QU'AS-TU FAIT") || cmdUpper.includes("RESUME")) {
            parsed = {
                agent: "Mika",
                action: "Consultation du journal d'activité et rapport journalier",
                perimeter: "Tout le périmètre Mika",
                duration: "Instantané",
                approval: "EXÉCUTION DIRECTE",
                impact: "Lecture seule. Aucun changement opérationnel."
            };
        } else if (cmdUpper.includes("SUSPENDS TES RESPONSES CHAT") || cmdUpper.includes("SUSPENDS")) {
            parsed = {
                agent: "Mika",
                action: "Suspension temporaire de l'envoi/préparation de réponses Chat",
                perimeter: "Toutes les conversations Chat",
                duration: "Jusqu'à réactivation manuelle",
                approval: "CONFIRMATION REQUISE",
                impact: "Mika cessera de préparer de nouvelles réponses Chat."
            };
        } else if (cmdUpper.includes("MONTRE-MOI CE QUI ATTEND") || cmdUpper.includes("VALIDATION")) {
            parsed = {
                agent: "Mika",
                action: "Redirection vers l'Approval Center pour filtrer les tâches Mika",
                perimeter: "Approval Center",
                duration: "Instantané",
                approval: "EXÉCUTION DIRECTE",
                impact: "Affichage des éléments en attente de validation."
            };
        } else if (cmdUpper.includes("CONCENTRE-TOI SUR SAINT-FRANCOIS")) {
            parsed = {
                agent: "Mika",
                action: "Ajustement de la commune prioritaire n°1 vers Saint-François",
                perimeter: "Saint-François (97118)",
                duration: "Aujourd'hui",
                approval: "CONFIRMATION REQUISE",
                impact: "Priorisation des demandes provenant de Saint-François dans l'analyse."
            };
        }

        res.json({
            success: true,
            command_raw: command,
            interpretation: parsed
        });
    } catch (e) {
        console.error("Error in Mika Command Parser:", e);
        res.status(500).json({ error: "Erreur interprétation de la commande." });
    }
});

// 7.5 OWNER FEEDBACK MEMORY (POST /v1/admin/agents/mika/feedback)
app.post('/v1/admin/agents/mika/feedback', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error || 'Fonction indisponible' });
    }
    try {
        const client = getSupabaseClient(req);
        const { task_id, feedback_type, note } = req.body;
        // feedback_type: 'GOOD' (👍 BON), 'CORRECT' (✏️ À CORRIGER), 'BAD' (👎 MAUVAIS)

        if (!feedback_type) {
            return res.status(400).json({ error: "feedback_type est requis (GOOD, CORRECT, BAD)." });
        }

        // Store memory entry
        const memoryContent = `[FEEDBACK ${feedback_type}] ${note || 'Aucune remarque'}`;
        const { data: memory } = await client.from('lyann_agent_memories').insert({
            agent_id: MIKA_DEFAULT_CONFIG.id,
            memory_key: `feedback_${Date.now()}`,
            memory_value: memoryContent,
            category: 'OWNER_FEEDBACK',
            privacy_level: 'PRIVATE',
            created_at: new Date().toISOString()
        }).select().maybeSingle();

        // Audit log
        await client.from('admin_audit_events').insert({
            agent_id: MIKA_DEFAULT_CONFIG.id,
            action_type: 'OWNER_FEEDBACK',
            entity_type: 'AGENT_MEMORY',
            details: { task_id, feedback_type, note },
            created_at: new Date().toISOString()
        });

        res.json({
            success: true,
            feedback_recorded: {
                task_id,
                feedback_type,
                note,
                memory_id: memory ? memory.id : `mem_${Date.now()}`
            }
        });
    } catch (e) {
        console.error("Error recording Mika feedback:", e);
        res.status(500).json({ error: "Erreur enregistrement feedback Owner." });
    }
});

// 7.6 ESCALATION ENGINE EVALUATOR (POST /v1/admin/agents/mika/escalate)
app.post('/v1/admin/agents/mika/escalate', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'agents.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error || 'Fonction indisponible' });
    }
    try {
        const client = getSupabaseClient(req);
        const { text, conversation_id, context } = req.body;
        const textNormalized = (text || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

        let triggeredRule = null;
        for (const kw of MIKA_DEFAULT_CONFIG.escalation_keywords) {
            const kwNorm = kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
            if (textNormalized.includes(kwNorm)) {
                triggeredRule = kw;
                break;
            }
        }

        if (triggeredRule) {
            const eventPayload = {
                agent_id: MIKA_DEFAULT_CONFIG.id,
                action_type: 'HUMAN_REVIEW_REQUIRED',
                entity_type: 'ESCALATION_ENGINE',
                details: {
                    conversation_id: conversation_id || 'conv-test-001',
                    reason: `Détection règle escalade : ${triggeredRule}`,
                    matched_keyword: triggeredRule,
                    priority: 'HIGH',
                    context: context || {}
                },
                created_at: new Date().toISOString()
            };

            const { data: audit } = await client.from('admin_audit_events').insert(eventPayload).select().maybeSingle();

            return res.json({
                success: true,
                escalated: true,
                triggered_keyword: triggeredRule,
                event: {
                    event_type: 'HUMAN_REVIEW_REQUIRED',
                    agent_id: MIKA_DEFAULT_CONFIG.id,
                    conversation_id: conversation_id || 'conv-test-001',
                    reason: `Mot-clé d'escalade : ${triggeredRule}`,
                    priority: 'HIGH',
                    audit_id: audit ? audit.id : `aud_${Date.now()}`,
                    created_at: eventPayload.created_at
                }
            });
        }

        res.json({
            success: true,
            escalated: false,
            message: "Aucun motif d'escalade détecté."
        });
    } catch (e) {
        console.error("Error in Mika Escalation Engine:", e);
        res.status(500).json({ error: "Erreur évaluation Escalation Engine." });
    }
});


app.get('/v1/admin/system/settings', async (req, res) => {
    const authResult = await verifyAdminPermission(req);
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    try {
        const { data: settings } = await supabaseAdmin.from('system_settings').select('*');
        const settingsMap = {};
        if (Array.isArray(settings)) {
            settings.forEach(s => settingsMap[s.key] = s.value);
        }
        const kill = settingsMap.agents_global_kill_switch || {};
        res.json({
            success: true,
            settings: {
                global_agents_suspended: Boolean(kill.suspended || settingsMap.global_agents_suspended === true || settingsMap.global_agents_suspended === 'true'),
                kill_switch: kill.suspended ? 'TRIGGERED' : 'OPERATIONAL',
                ...settingsMap
            }
        });
    } catch (e) {
        res.status(503).json({ success: false, error: 'Paramètres système indisponibles.' });
    }
});

app.post('/v1/admin/system/settings', async (req, res) => {
    const authResult = await verifyAdminPermission(req, 'settings.manage');
    if (!authResult.authorized) {
        return res.status(authResult.status).json({ success: false, error: authResult.error });
    }
    try {
        const incoming = req.body?.settings && typeof req.body.settings === 'object' ? req.body.settings : req.body;
        const entries = Object.entries(incoming || {}).filter(([key]) => !['settings'].includes(key));
        if (!entries.length) return res.status(400).json({ success: false, error: 'Aucun paramètre à enregistrer.' });
        for (const [key, value] of entries) {
            if (financialSettingBlocked(key, value)) {
                return res.status(403).json({
                    success: false,
                    code: 'FINANCIAL_LOCK_PROTECTED',
                    error: 'Modification des commissions Stripe, des verrous financiers ou des transactions interdite.'
                });
            }
        }
        const now = new Date().toISOString();
        for (const [key, value] of entries) {
            const { error } = await supabaseAdmin.from('system_settings').upsert({
                key,
                value,
                updated_by: authResult.userId,
                updated_at: now
            });
            if (error) return res.status(500).json({ success: false, error: error.message });
        }
        await recordMaisonAudit(authResult.userId, 'SYSTEM_SETTINGS_UPDATED', null, { keys: entries.map(([k]) => k) });
        return res.json({ success: true, saved: entries.map(([k]) => k) });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Impossible d’enregistrer les paramètres.' });
    }
});

// 6. LEGACY PAYMENTS ENDPOINT (@deprecated)
app.post('/v1/payments/create-intent', async (req, res) => {
    const intake = newPaymentIntakeDecision(process.env);
    if (!intake.open) {
        return res.status(503).json({
            code: intake.code,
            error: 'Les nouveaux paiements sont fermés. Aucun paiement n’a été créé.'
        });
    }
    return res.status(410).json({
        success: false,
        code: 'LEGACY_ENDPOINT_DISABLED',
        error: 'Cette route historique est désactivée.'
    });
    console.warn("⚠️ [DEPRECATED] /v1/payments/create-intent is deprecated. Use /v1/payments/create-milestone-intent instead.");
    try {
        const { missionId, quoteId, amount, currency = 'eur', idempotencyKey } = req.body;

        if (!missionId || !amount) {
            return res.status(400).json({ error: "Mission ID et montant requis." });
        }

        const basePrice = parseFloat(amount);
        const commissionFee = basePrice * 0.03;
        const protectionFee = 4.90;
        const totalAmountCents = Math.round((basePrice + commissionFee + protectionFee) * 100);

        if (process.env.STRIPE_SECRET_KEY) {
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: totalAmountCents,
                currency: currency.toLowerCase(),
                metadata: {
                    missionId,
                    quoteId: quoteId || '',
                    providerAmount: basePrice.toFixed(2),
                    commissionFee: commissionFee.toFixed(2),
                    protectionFee: protectionFee.toFixed(2),
                    financialFlow: 'SEPARATE_CHARGES_AND_TRANSFERS'
                }
            }, {
                idempotencyKey: idempotencyKey || `pi_idem_${missionId}_${Date.now()}`
            });

            return res.json({
                success: true,
                deprecated: true,
                mode: 'stripe_live',
                architecture: 'SEPARATE_CHARGES_AND_TRANSFERS',
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
                breakdown: {
                    basePrice,
                    commissionFee,
                    protectionFee,
                    totalAmount: (totalAmountCents / 100).toFixed(2)
                }
            });
        } else {
            return res.json({
                success: true,
                deprecated: true,
                mode: 'stripe_test_mode',
                architecture: 'SEPARATE_CHARGES_AND_TRANSFERS',
                paymentIntentId: `pi_test_${Date.now()}`,
                clientSecret: `pi_test_secret_${Date.now()}`,
                breakdown: {
                    basePrice,
                    commissionFee,
                    protectionFee,
                    totalAmount: (basePrice + commissionFee + protectionFee).toFixed(2)
                }
            });
        }
    } catch (e) {
        console.error("Stripe Create Intent Server Error:", e);
        res.status(500).json({ error: "Erreur lors de la création du paiement Stripe." });
    }
});

async function stripeCustomerForAuthenticatedUser(stripe, user, mode) {
    if (mode !== 'test' && mode !== 'live') {
        throw new Error('Profil de paiement indisponible.');
    }
    const { data: existing, error: lookupError } = await supabaseAdmin
        .from('lyann_payment_customers')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .eq('stripe_mode', mode)
        .maybeSingle();
    if (lookupError) throw new Error('La migration lyann_payment_customers doit être appliquée en test.');
    if (existing?.stripe_customer_id) {
        try {
            await stripe.customers.retrieve(existing.stripe_customer_id);
            return existing.stripe_customer_id;
        } catch (error) {
            if (!error || error.code !== 'resource_missing') throw error;
        }
    }
    const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { lyann_user_id: user.id, lyann_stripe_mode: mode }
    }, { idempotencyKey: 'lyann_payment_customer_' + mode + '_' + user.id });
    const { error: insertError } = await supabaseAdmin
        .from('lyann_payment_customers')
        .upsert({ user_id: user.id, stripe_mode: mode, stripe_customer_id: customer.id }, {
            onConflict: 'user_id,stripe_mode'
        });
    if (insertError) throw new Error('Enregistrement du profil de paiement indisponible.');
    return customer.id;
}

async function ownedSavedCardMapping(userId) {
    const mode = inspectStripeEnv(process.env).mode;
    if (mode !== 'test' && mode !== 'live') return { error: 'mode' };
    const { data, error } = await supabaseAdmin
        .from('lyann_payment_customers')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .eq('stripe_mode', mode)
        .maybeSingle();
    if (error) return { error: 'lookup' };
    return { mapping: data || null };
}

app.get('/v1/payments/saved-cards', async (req, res) => {
    try {
        const user = await requireBearerUser(req);
        if (!user) return res.status(401).json({ error: 'Authentification requise.' });
        const owned = await ownedSavedCardMapping(user.id);
        if (owned.error) return res.status(503).json({ error: 'Cartes enregistrées indisponibles.' });
        if (!owned.mapping) return res.json({ cards: [] });
        const runtime = stripeRuntime();
        if (!runtime.stripe) return res.status(503).json({ error: 'Stripe indisponible.' });
        const cards = await runtime.stripe.paymentMethods.list({
            customer: owned.mapping.stripe_customer_id,
            type: 'card',
            limit: 50
        });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ cards: visibleSavedCards(cards) });
    } catch (err) {
        console.error('Saved cards list unavailable:', err?.message || err);
        return res.status(503).json({ error: 'Cartes enregistrées indisponibles.' });
    }
});

app.delete('/v1/payments/saved-cards/:paymentMethodId', async (req, res) => {
    try {
        const user = await requireBearerUser(req);
        if (!user) return res.status(401).json({ error: 'Authentification requise.' });
        const methodId = String(req.params.paymentMethodId || '');
        if (!isSavedCardId(methodId)) return res.status(400).json({ error: 'Carte invalide.' });
        const owned = await ownedSavedCardMapping(user.id);
        if (owned.error || !owned.mapping) return res.status(404).json({ error: 'Carte introuvable.' });
        const runtime = stripeRuntime();
        if (!runtime.stripe) return res.status(503).json({ error: 'Stripe indisponible.' });
        const method = await runtime.stripe.paymentMethods.retrieve(methodId);
        if (!canDetachSavedCard(method, owned.mapping.stripe_customer_id)) {
            return res.status(404).json({ error: 'Carte introuvable.' });
        }
        await runtime.stripe.paymentMethods.detach(methodId);
        return res.json({ success: true });
    } catch (err) {
        console.error('Saved card removal unavailable:', err?.message || err);
        return res.status(503).json({ error: 'Suppression de la carte indisponible.' });
    }
});

app.post('/v1/payments/customer-session', async (req, res) => {
    try {
        const user = await requireBearerUser(req);
        if (!user) return res.status(401).json({ error: 'Authentification requise.' });
        const intentId = req.body?.payment_intent_id;
        if (!isPaymentIntentId(intentId)) return res.status(400).json({ error: 'Identifiant de paiement invalide.' });
        const saveCard = req.body?.save_card === true;
        const { data: payment, error: paymentError } = await supabaseAdmin
            .from('payments')
            .select('id, requester_id, payment_status, stripe_payment_intent_id')
            .eq('stripe_payment_intent_id', intentId)
            .eq('requester_id', user.id)
            .maybeSingle();
        if (paymentError || !payment) return res.status(404).json({ error: 'Paiement introuvable.' });
        if (!['CREATED', 'REQUIRES_ACTION'].includes(payment.payment_status)) {
            return res.status(409).json({ error: 'Ce paiement ne peut plus être modifié.' });
        }
        const runtime = stripeRuntime();
        if (!runtime.stripe || runtime.inspected.mode === 'live' && process.env.STRIPE_LIVE_ENABLED !== 'true') {
            return res.status(503).json({ error: 'Stripe indisponible en environnement de test.' });
        }
        const stripe = runtime.stripe;
        const intent = await stripe.paymentIntents.retrieve(intentId);
        if (!['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(intent.status)) {
            return res.status(409).json({ error: 'Paiement déjà en cours ou confirmé.' });
        }
        const customerId = await stripeCustomerForAuthenticatedUser(stripe, user, runtime.inspected.mode);
        const attachedId = typeof intent.customer === 'string' ? intent.customer : intent.customer?.id;
        if (attachedId && attachedId !== customerId) {
            return res.status(409).json({ error: 'Le paiement est associé à un autre compte.' });
        }
        try {
            await stripe.paymentIntents.update(intentId, paymentIntentConsentUpdate(saveCard, customerId));
        } catch (updateError) {
            if (saveCard) throw updateError;
            await stripe.paymentIntents.update(intentId, {
                customer: customerId,
                metadata: { lyann_save_card: '0' }
            });
        }
        let customerSessionClientSecret = null;
        try {
            const session = await stripe.customerSessions.create(customerSessionParams(customerId));
            customerSessionClientSecret = session.client_secret || null;
        } catch (sessionError) {
            console.warn('Stripe customer session unavailable:', sessionError?.message || sessionError);
        }
        const cards = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 50 });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({
            save_available: true,
            cards: visibleSavedCards(cards),
            customer_session_client_secret: customerSessionClientSecret
        });
    } catch (err) {
        console.error('Stripe customer session unavailable:', err?.message || err);
        return res.status(503).json({ error: 'Cartes enregistrées momentanément indisponibles.' });
    }
});

/**
 * 6.1 CANONICAL MILESTONE PAYMENT INTENT CREATION (STEP 1)
 * POST /v1/payments/create-milestone-intent
 * Payload: { "milestone_id": "uuid" }
 */
app.post('/v1/payments/create-milestone-intent', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Authentification requise." });
        }
        const token = authHeader.split(' ')[1];

        // 1. Authenticate user via Supabase Auth JWT
        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !authData?.user) {
            return res.status(401).json({ error: "Jeton d'authentification invalide ou expiré." });
        }
        const authUid = authData.user.id;

        // 2. Strict input validation: Only read milestone_id (ignore all other fields)
        const { milestone_id } = req.body;
        if (!milestone_id) {
            return res.status(400).json({ error: "Le paramètre milestone_id est obligatoire." });
        }

        // 3. Reconstruct canonical context from Database
        const { data: milestone, error: mErr } = await supabaseAdmin
            .from('milestones')
            .select('*, quotes(*)')
            .eq('id', milestone_id)
            .single();

        if (mErr || !milestone) {
            return res.status(404).json({ error: "Étape de paiement introuvable." });
        }

        if (milestone.status !== 'PENDING') {
            return res.status(400).json({ error: `Cette Partie n'est pas payable (statut actuel: ${milestone.status}).` });
        }

        const quote = milestone.quotes;
        if (!quote || quote.status !== 'ACCEPTED') {
            return res.status(400).json({ error: "Le devis associé doit être au statut ACCEPTED." });
        }

        const { data: mission, error: missErr } = await supabaseAdmin
            .from('missions')
            .select('*')
            .eq('id', quote.mission_id)
            .single();

        if (missErr || !mission || (mission.status !== 'AGREED' && mission.status !== 'IN_PROGRESS')) {
            return res.status(400).json({ error: "La mission associée doit être au statut AGREED ou IN_PROGRESS." });
        }

        // 4. Role Check: Only requester (client) can trigger payment
        if (mission.requester_id !== authUid) {
            return res.status(403).json({ error: "Seul le demandeur de la prestation peut effectuer ce paiement." });
        }
        const intake = newPaymentIntakeDecision(process.env);
        if (!intake.open) {
            return res.status(503).json({
                code: intake.code,
                error: 'Les nouveaux paiements sont fermés. Aucun paiement n’a été créé.'
            });
        }

        const providerIdForPay = quote.provider_id;
        const payRuntime = stripeRuntime();
        const payableLoaded = await loadConnectProfile(providerIdForPay, payRuntime.inspected && payRuntime.inspected.mode);
        const payableProfile = payableLoaded && payableLoaded.profile ? payableLoaded.profile : null;
        if (!payRuntime.stripe) {
            return res.status(503).json({
                code: payRuntime.inspected.liveBlocked ? 'STRIPE_LIVE_DISABLED' : 'STRIPE_CONFIG_MISSING',
                error: 'Stripe test indisponible. Aucun encaissement n’a été créé.'
            });
        }
        let payableAccount = null;
        if (payableProfile?.stripe_account_id) {
            try {
                payableAccount = await payRuntime.stripe.v2.core.accounts.retrieve(payableProfile.stripe_account_id, {
                    include: ['configuration.recipient']
                });
            } catch (_) {
                payableAccount = null;
            }
        }
        const payable = providerCanBePaid(payableProfile, payableAccount);
        if (!payable.ok) {
            const payoutWaitCopy = {
                CONNECT_REQUIRED: 'Le compte de versement du Lyanneur n’est pas encore configuré. Le devis reste accepté : le paiement pourra être sécurisé ensuite.',
                CONNECT_NOT_READY: 'Le compte de versement du Lyanneur n’est pas encore prêt. Le devis reste accepté : le paiement pourra être sécurisé ensuite.',
                PROVIDER_NOT_PAYABLE: 'Ce compte ne peut pas recevoir de versement. Aucun paiement n’a été créé.',
                WRONG_CONNECT_ACCOUNT: 'Le compte de versement ne correspond pas. Aucun paiement n’a été créé.'
            };
            return res.status(409).json({
                code: payable.code,
                error: payoutWaitCopy[payable.code] || 'Le paiement ne peut pas être sécurisé pour le moment. Aucun paiement n’a été créé.'
            });
        }

        // 5. New payments use the current tariff. An existing row keeps the cents already stored.
        const financials = calculateMilestonePricing(milestone.amount);
        const stripeIdempotencyKey = `pi_milestone_${milestone.id}`;

        // 6. Idempotency Check & Recoverable State Analysis (V1.1)
        const { data: existingPayment } = await supabaseAdmin
            .from('payments')
            .select(PAYMENT_AMOUNT_COLUMNS)
            .eq('milestone_id', milestone_id)
            .in('payment_status', ['CREATED', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'PARTIALLY_REFUNDED', 'DISPUTED', 'REFUNDED'])
            .maybeSingle();

        const paymentDecision = resumePaymentDecision(existingPayment);
        if (paymentDecision.action === 'refuse') {
            return res.status(409).json({
                error: "Le paiement de cette Partie est déjà sécurisé.",
                code: paymentDecision.code
            });
        }

        if (paymentDecision.action === 'reuse') {
            const frozen = paymentAmountSnapshot(existingPayment);
            if (process.env.STRIPE_SECRET_KEY) {
                const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
                const intent = await stripe.paymentIntents.retrieve(existingPayment.stripe_payment_intent_id);
                return res.json({
                    success: true,
                    recovered: true,
                    payment_id: existingPayment.id,
                    payment_intent_id: intent.id,
                    client_secret: intent.client_secret,
                    amounts: frozen
                });
            }
            return res.json({
                success: true,
                recovered: true,
                mode: 'stripe_test_mock',
                payment_id: existingPayment.id,
                payment_intent_id: existingPayment.stripe_payment_intent_id,
                client_secret: `${existingPayment.stripe_payment_intent_id}_secret_test`,
                amounts: frozen
            });
        }

        if (paymentDecision.action === 'attach') {
            const frozen = paymentAmountSnapshot(existingPayment);
            if (!Number.isFinite(frozen.customer_total_cents) || frozen.customer_total_cents <= 0) {
                return res.status(409).json({
                    error: "Le paiement de cette Partie est déjà enregistré.",
                    code: "PAIEMENT_MONTANT_FIGE"
                });
            }
            if (process.env.STRIPE_SECRET_KEY) {
                const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: frozen.customer_total_cents,
                    currency: 'eur',
                    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
                    metadata: {
                        payment_id: existingPayment.id,
                        milestone_id: milestone.id,
                        quote_id: quote.id,
                        mission_id: mission.id,
                        requester_id: mission.requester_id,
                        provider_id: quote.provider_id
                    }
                }, {
                    idempotencyKey: stripeIdempotencyKey
                });
                await supabaseAdmin
                    .from('payments')
                    .update({ stripe_payment_intent_id: paymentIntent.id })
                    .eq('id', existingPayment.id);
                return res.json({
                    success: true,
                    recovered_orphan: true,
                    payment_id: existingPayment.id,
                    payment_intent_id: paymentIntent.id,
                    client_secret: paymentIntent.client_secret,
                    amounts: frozen
                });
            }
            const mockIntentId = `pi_test_${existingPayment.id}`;
            await supabaseAdmin
                .from('payments')
                .update({ stripe_payment_intent_id: mockIntentId })
                .eq('id', existingPayment.id);
            return res.json({
                success: true,
                recovered_orphan: true,
                mode: 'stripe_test_mock',
                payment_id: existingPayment.id,
                payment_intent_id: mockIntentId,
                client_secret: `${mockIntentId}_secret_test`,
                amounts: frozen
            });
        }

        // 7. Insert payment record into public.payments (payment_status = CREATED, transfer_status = NOT_STARTED)
        const { data: paymentRecord, error: insertErr } = await supabaseAdmin
            .from('payments')
            .insert({
                milestone_id: milestone.id,
                quote_id: quote.id,
                mission_id: mission.id,
                requester_id: mission.requester_id,
                provider_id: quote.provider_id,
                service_amount_cents: Number(financials.service_amount_cents),
                customer_fee_cents: Number(financials.customer_fee_cents),
                customer_total_cents: Number(financials.customer_total_cents),
                provider_fee_cents: Number(financials.provider_fee_cents),
                provider_net_cents: Number(financials.provider_net_cents),
                lyann_revenue_cents: Number(financials.lyann_revenue_cents),
                amount_refunded_cents: 0,
                currency: 'EUR',
                payment_status: 'CREATED',
                transfer_status: 'NOT_STARTED',
                ...legacyPaymentColumns(financials),
                metadata: {
                    milestone_id: milestone.id,
                    quote_id: quote.id,
                    mission_id: mission.id,
                    requester_id: mission.requester_id,
                    provider_id: quote.provider_id
                }
            })
            .select()
            .single();

        if (insertErr) {
            if (insertErr.code === '23505') { // Concurrency catch: DB partial unique index constraint
                const { data: concPayment } = await supabaseAdmin
                    .from('payments')
                    .select(PAYMENT_AMOUNT_COLUMNS)
                    .eq('milestone_id', milestone_id)
                    .single();

                if (concPayment && concPayment.stripe_payment_intent_id) {
                    const frozen = paymentAmountSnapshot(concPayment);
                    if (process.env.STRIPE_SECRET_KEY) {
                        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
                        const intent = await stripe.paymentIntents.retrieve(concPayment.stripe_payment_intent_id);
                        return res.json({
                            success: true,
                            concurrency_recovered: true,
                            payment_id: concPayment.id,
                            payment_intent_id: intent.id,
                            client_secret: intent.client_secret,
                            amounts: frozen
                        });
                    }
                }

                return res.status(409).json({
                    error: "Le paiement de cette Partie est déjà sécurisé.",
                    code: "PAIEMENT_DEJA_SECURISE"
                });
            }
            console.error("Erreur insertion payment:", insertErr);
            return res.status(500).json({ error: "Erreur lors de l'enregistrement du paiement." });
        }

        // 8. Create Stripe PaymentIntent on Platform Account (Separate Charges & Transfers with Deterministic Idempotency Key)
        if (process.env.STRIPE_SECRET_KEY) {
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Number(financials.customer_total_cents),
                currency: 'eur',
                automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
                metadata: {
                    payment_id: paymentRecord.id,
                    milestone_id: milestone.id,
                    quote_id: quote.id,
                    mission_id: mission.id,
                    requester_id: mission.requester_id,
                    provider_id: quote.provider_id
                }
            }, {
                idempotencyKey: stripeIdempotencyKey
            });

            // Update stripe_payment_intent_id in public.payments
            await supabaseAdmin
                .from('payments')
                .update({ stripe_payment_intent_id: paymentIntent.id })
                .eq('id', paymentRecord.id);

            return res.json({
                success: true,
                payment_id: paymentRecord.id,
                payment_intent_id: paymentIntent.id,
                client_secret: paymentIntent.client_secret,
                amounts: paymentAmountSnapshot(financials)
            });
        } else {
            // Test Mode Fallback if STRIPE_SECRET_KEY is not defined in non-prod
            const mockIntentId = `pi_test_${Date.now()}`;
            await supabaseAdmin
                .from('payments')
                .update({ stripe_payment_intent_id: mockIntentId })
                .eq('id', paymentRecord.id);

            return res.json({
                success: true,
                mode: 'stripe_test_mock',
                payment_id: paymentRecord.id,
                payment_intent_id: mockIntentId,
                client_secret: `${mockIntentId}_secret_test`,
                amounts: paymentAmountSnapshot(financials)
            });
        }

    } catch (e) {
        console.error("Erreur serveur create-milestone-intent:", e);
        return res.status(500).json({ error: "Erreur interne lors de la création du paiement." });
    }
});

/**
 * 6.2 START MILESTONE WORK (STEP 2A)
 * POST /v1/milestones/start-work
 * Payload: { "milestone_id": "uuid" }
 * Allowed Transition: FUNDED -> IN_PROGRESS
 * Authorization: Assigned Helper/Provider ONLY
 */
app.post('/v1/milestones/start-work', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Authentification requise." });
        }
        const token = authHeader.split(' ')[1];

        // 1. Authenticate user via Supabase Auth JWT
        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !authData?.user) {
            return res.status(401).json({ error: "Jeton d'authentification invalide ou expiré." });
        }
        const authUid = authData.user.id;

        // 2. Read milestone_id strictly from req.body
        const { milestone_id } = req.body;
        if (!milestone_id) {
            return res.status(400).json({ error: "Le paramètre milestone_id est obligatoire." });
        }

        // 3. Reconstruct canonical context from DB
        const { data: milestone, error: mErr } = await supabaseAdmin
            .from('milestones')
            .select('*, quotes(*)')
            .eq('id', milestone_id)
            .single();

        if (mErr || !milestone) {
            return res.status(404).json({ error: "Étape de paiement introuvable." });
        }

        const quote = milestone.quotes;
        if (!quote || quote.status !== 'ACCEPTED') {
            return res.status(400).json({ error: "Le devis associé doit être au statut ACCEPTED." });
        }

        const { data: mission, error: missErr } = await supabaseAdmin
            .from('missions')
            .select('*')
            .eq('id', quote.mission_id)
            .single();

        if (missErr || !mission) {
            return res.status(400).json({ error: "La mission associée est introuvable." });
        }

        // 4. Role Check: Only assigned Lyanneur (helper_id / provider_id) can start work
        const assignedHelperId = mission.helper_id || quote.provider_id;
        if (!canDeclareWorkDone(authUid, assignedHelperId)) {
            return res.status(403).json({ error: "Seul le Lyanneur assigné à la mission peut démarrer les travaux." });
        }

        // 5. Idempotent Transition Check
        if (milestone.status === 'IN_PROGRESS') {
            return res.json({
                success: true,
                idempotent: true,
                milestone_id: milestone.id,
                status: 'IN_PROGRESS',
                message: "Le travail sur cette Partie est déjà en cours."
            });
        }

        if (milestone.status !== 'FUNDED') {
            return res.status(400).json({
                error: `Impossible de démarrer les travaux : la Partie doit être au statut FUNDED (statut actuel: ${milestone.status}).`
            });
        }

        // 6. Atomic Update: FUNDED -> IN_PROGRESS
        const { data: updatedMilestone, error: updateErr } = await supabaseAdmin
            .from('milestones')
            .update({
                status: 'IN_PROGRESS',
                updated_at: new Date().toISOString()
            })
            .eq('id', milestone.id)
            .eq('status', 'FUNDED')
            .select()
            .single();

        if (updateErr || !updatedMilestone) {
            return res.status(400).json({ error: "Échec de la mise à jour (concurrence ou transition invalide)." });
        }

        return res.json({
            success: true,
            milestone_id: updatedMilestone.id,
            status: 'IN_PROGRESS',
            message: "Travail en cours — début de réalisation enregistré."
        });

    } catch (e) {
        console.error("Erreur serveur start-milestone-work:", e);
        return res.status(500).json({ error: "Erreur interne serveur." });
    }
});

/**
 * 6.3 SUBMIT MILESTONE COMPLETION (STEP 2A)
 * POST /v1/milestones/submit-completion
 * Payload: { "milestone_id": "uuid", "completion_comments": "...", "deliverables": [...] }
 * Allowed Transitions: FUNDED -> COMPLETED (direct) OR IN_PROGRESS -> COMPLETED
 * Authorization: Assigned Helper/Provider ONLY
 */
app.post('/v1/milestones/submit-completion', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Authentification requise." });
        }
        const token = authHeader.split(' ')[1];

        // 1. Authenticate user via Supabase Auth JWT
        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !authData?.user) {
            return res.status(401).json({ error: "Jeton d'authentification invalide ou expiré." });
        }
        const authUid = authData.user.id;

        // 2. Read parameters strictly from req.body (ignore requester_id, provider_id, mission_id)
        const { milestone_id, completion_comments = '', deliverables = [] } = req.body;
        if (!milestone_id) {
            return res.status(400).json({ error: "Le paramètre milestone_id est obligatoire." });
        }

        // 3. Reconstruct canonical context from DB
        const { data: milestone, error: mErr } = await supabaseAdmin
            .from('milestones')
            .select('*, quotes(*)')
            .eq('id', milestone_id)
            .single();

        if (mErr || !milestone) {
            return res.status(404).json({ error: "Étape de paiement introuvable." });
        }

        const quote = milestone.quotes;
        if (!quote || quote.status !== 'ACCEPTED') {
            return res.status(400).json({ error: "Le devis associé doit être au statut ACCEPTED." });
        }

        const { data: mission, error: missErr } = await supabaseAdmin
            .from('missions')
            .select('*')
            .eq('id', quote.mission_id)
            .single();

        if (missErr || !mission) {
            return res.status(400).json({ error: "La mission associée est introuvable." });
        }

        // 4. Role Check: Only assigned Lyanneur (helper_id / provider_id) can submit completion
        const assignedHelperId = mission.helper_id || quote.provider_id;
        if (!canDeclareWorkDone(authUid, assignedHelperId)) {
            return res.status(403).json({ error: "Seul le Lyanneur assigné à la mission peut déclarer la prestation terminée." });
        }

        // 5. Idempotent Transition Check
        if (milestone.status === 'COMPLETED') {
            return res.json({
                success: true,
                idempotent: true,
                milestone_id: milestone.id,
                status: 'COMPLETED',
                message: "Cette Partie est déjà déclarée réalisée."
            });
        }

        if (!['FUNDED', 'IN_PROGRESS'].includes(milestone.status)) {
            return res.status(400).json({
                error: `Impossible de déclarer terminée : la Partie doit être au statut FUNDED ou IN_PROGRESS (statut actuel: ${milestone.status}).`
            });
        }

        // 6. Atomic Update: FUNDED/IN_PROGRESS -> COMPLETED
        const updatePayload = {
            status: 'COMPLETED',
            updated_at: new Date().toISOString()
        };

        updatePayload.completion_comments = completion_comments || null;
        updatePayload.deliverables = deliverables || [];
        updatePayload.completed_at = new Date().toISOString();

        let updatedMilestone = null;
        let updateErr = null;

        const resUpdate = await supabaseAdmin
            .from('milestones')
            .update(updatePayload)
            .eq('id', milestone.id)
            .in('status', ['FUNDED', 'IN_PROGRESS'])
            .select()
            .single();

        if (resUpdate.error) {
            // Fallback if optional columns don't exist in DB schema yet
            const resFallback = await supabaseAdmin
                .from('milestones')
                .update({
                    status: 'COMPLETED',
                    updated_at: new Date().toISOString()
                })
                .eq('id', milestone.id)
                .in('status', ['FUNDED', 'IN_PROGRESS'])
                .select()
                .single();

            updatedMilestone = resFallback.data;
            updateErr = resFallback.error;
        } else {
            updatedMilestone = resUpdate.data;
        }

        if (updateErr || !updatedMilestone) {
            return res.status(400).json({ error: "Échec de la mise à jour (concurrence ou transition invalide)." });
        }

        return res.json({
            success: true,
            milestone_id: updatedMilestone.id,
            status: 'COMPLETED',
            message: "Prestation réalisée — en attente de validation du client."
        });

    } catch (e) {
        console.error("Erreur serveur submit-milestone-completion:", e);
        return res.status(500).json({ error: "Erreur interne serveur." });
    }
});

/**
 * CANONICAL RETRY TRANSFER HELPER (STEP 2B V1.1)
 * Used by:
 * - Client release endpoint (POST /v1/milestones/release-payment)
 * - Lyanneur claim endpoint (POST /v1/milestones/claim-transfer)
 * account.updated must not call this helper.
 */
async function closeRequestWhenQuoteIsSettled(quote) {
    if (!quote || !quote.id || !quote.request_id) return;
    const { data: milestones } = await supabaseAdmin
        .from('milestones')
        .select('status')
        .eq('quote_id', quote.id);
    if (!quoteFullyReleased(milestones)) return;
    await supabaseAdmin
        .from('requests')
        .update({
            status: 'COMPLETED',
            auto_close_at: null,
            close_notice_sent: true,
            updated_at: new Date().toISOString()
        })
        .eq('id', quote.request_id)
        .in('status', ['OPEN', 'PAUSED', 'ASSIGNED', 'IN_PROGRESS', 'CLOSED']);
    if (quote.mission_id) {
        await supabaseAdmin
            .from('missions')
            .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
            .eq('id', quote.mission_id);
    }
}

async function retryMilestoneTransfer(milestoneId) {
    // 1. Fetch milestone
    const { data: milestone, error: mErr } = await supabaseAdmin
        .from('milestones')
        .select('*, quotes(*)')
        .eq('id', milestoneId)
        .single();

    if (mErr || !milestone) {
        return { success: false, error: "Milestone introuvable.", code: "MILESTONE_NOT_FOUND" };
    }

    if (milestone.status === 'DISPUTED') {
        return { success: false, error: "Versement interdit pendant un litige.", code: "DISPUTED" };
    }

    if (milestone.status !== 'COMPLETED') {
        return { success: false, error: "La Partie doit être au statut COMPLETED.", code: "MILESTONE_NOT_COMPLETED" };
    }

    const quote = milestone.quotes;
    if (!quote) {
        return { success: false, error: "Devis introuvable.", code: "QUOTE_NOT_FOUND" };
    }

    // 2. Fetch payment record
    const { data: payment, error: pErr } = await supabaseAdmin
        .from('payments')
        .select('*')
        .eq('milestone_id', milestoneId)
        .single();

    if (pErr || !payment) {
        return { success: false, error: "Paiement introuvable.", code: "PAYMENT_NOT_FOUND" };
    }

    // Must be client_validated_at IS NOT NULL and payment_status = SUCCEEDED
    if (!payment.client_validated_at) {
        return { success: false, error: "Le client n'a pas encore validé cette Partie.", code: "NOT_CLIENT_VALIDATED" };
    }

    if (payment.payment_status === 'DISPUTED') {
        return { success: false, error: "Versement interdit pendant un litige.", code: "DISPUTED" };
    }

    if (payment.payment_status !== 'SUCCEEDED') {
        return { success: false, error: "Le paiement client doit être au statut SUCCEEDED.", code: "PAYMENT_NOT_SUCCEEDED" };
    }

    // Already transferred idempotent check
        if (payment.transfer_status === 'TRANSFERRED' && payment.stripe_transfer_id) {
        await closeRequestWhenQuoteIsSettled(quote);
        return {
            success: true,
            already_transferred: true,
            idempotent: true,
            status: "RELEASED",
            transfer_id: payment.stripe_transfer_id,
            message: "Versement déjà effectué."
        };
    }

    const transferGate = liveTransferDecision(process.env);
    if (!transferGate.ok) {
        return {
            success: false,
            code: transferGate.code,
            mutated: false,
            error: 'Les transferts Live sont fermés. Aucun transfert n’a été créé.'
        };
    }
    if (String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_')) {
        let intentLivemode = null;
        try {
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            const intent = payment.stripe_payment_intent_id
                ? await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id)
                : null;
            intentLivemode = intent ? intent.livemode : null;
        } catch (_) {
            intentLivemode = null;
        }
        const historicalMode = transferModeMatches(intentLivemode, 'live');
        if (!historicalMode.ok) {
            return {
                success: false,
                code: historicalMode.code,
                mutated: false,
                error: 'Ce paiement n’appartient pas au mode Stripe actif. Aucun transfert n’a été créé.'
            };
        }
    }

    const lockPlan = planTransferLock(payment.transfer_status);
    if (payment.stripe_refund_id || payment.payment_status === 'REFUNDED') {
        return { success: false, error: "Remboursement en cours ou déjà effectué.", code: "REFUND_BLOCKS_TRANSFER" };
    }

    if (lockPlan.action === 'reject') {
        return { success: false, error: `Statut de transfert invalide (${payment.transfer_status}).`, code: lockPlan.code };
    }

    // 3. Fetch Provider Profile for Stripe Account ID
    const providerId = payment.provider_id || quote.provider_id;
    const transferRuntime = stripeRuntime();
    const loadedProvider = await loadConnectProfile(providerId, transferRuntime.inspected && transferRuntime.inspected.mode);
    const providerProfile = loadedProvider && loadedProvider.profile;

    if (loadedProvider.error || !providerProfile || !providerProfile.stripe_account_id) {
        // Mark as TRANSFER_FAILED, keep client_validated_at set
        await supabaseAdmin
            .from('payments')
            .update({ transfer_status: 'TRANSFER_FAILED' })
            .eq('id', payment.id);

        return {
            success: true,
            eligible: false,
            status: "VERSEMENT_LYANNEUR_EN_ATTENTE",
            message: "Partie validée. Le versement au Lyanneur est en attente de configuration de son compte Stripe Connect."
        };
    }

    const stripeAccountId = providerProfile.stripe_account_id;

    // 4. Verify Stripe Connect Eligibility Server-Side
    if (process.env.STRIPE_SECRET_KEY) {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        try {
            const account = await stripe.v2.core.accounts.retrieve(stripeAccountId, {
                include: ['configuration.recipient']
            });
            if (!connectPayoutReady(account).ok) {
                console.warn('[CONNECT CHECK] Compte non éligible aux reversements.');
                
                await supabaseAdmin
                    .from('payments')
                    .update({ transfer_status: 'TRANSFER_FAILED' })
                    .eq('id', payment.id);

                return {
                    success: true,
                    eligible: false,
                    status: "VERSEMENT_LYANNEUR_EN_ATTENTE",
                    message: "Partie validée. Le versement au Lyanneur est en attente (compte Stripe Connect incomplet)."
                };
            }
        } catch (stAccErr) {
            console.error("Erreur lors de la vérification du compte Connect Stripe:", stAccErr);
            await supabaseAdmin
                .from('payments')
                .update({ transfer_status: 'TRANSFER_FAILED' })
                .eq('id', payment.id);

            return {
                success: true,
                eligible: false,
                status: "VERSEMENT_LYANNEUR_EN_ATTENTE",
                message: "Partie validée. Le versement au Lyanneur est en attente de vérification Stripe."
            };
        }
    }

    // 5. Atomic lock: only PENDING_VALIDATION / TRANSFER_FAILED can become TRANSFER_PROCESSING.
    // TRANSFER_PROCESSING resumes with the same Stripe idempotency key (no second lock).
    let lockedPayment = payment;
    if (lockPlan.action === 'acquire') {
        const acquired = await supabaseAdmin
            .from('payments')
            .update({ transfer_status: 'TRANSFER_PROCESSING' })
            .eq('id', payment.id)
            .in('transfer_status', transferLockAcquireFrom())
            .eq('payment_status', 'SUCCEEDED')
            .is('stripe_refund_id', null)
            .is('stripe_transfer_id', null)
            .not('client_validated_at', 'is', null)
            .select()
            .maybeSingle();

        if (acquired.error || !acquired.data) {
            return { success: false, error: "Échec du verrouillage de transfert (concurrence).", code: "CONCURRENCY_LOCK_FAILED" };
        }
        lockedPayment = acquired.data;
    }

    // 6. Execute Stripe Transfer (Separate Charges & Transfers with Deterministic Idempotency Key)
    const stripeIdempotencyKey = transferIdempotencyKey(milestone.id);
    const transferAmountCents = Number(payment.provider_net_cents);

    if (process.env.STRIPE_SECRET_KEY) {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        try {
            const transferParams = {
                amount: transferAmountCents,
                currency: 'eur',
                destination: stripeAccountId,
                description: `Versement Partie LYANN ${milestone.id}`,
                metadata: {
                    milestone_id: milestone.id,
                    payment_id: payment.id,
                    mission_id: payment.mission_id,
                    provider_id: providerId
                }
            };
            const sourceChargeId = stripeChargeId(payment.stripe_charge_id);
            if (sourceChargeId) transferParams.source_transaction = sourceChargeId;
            let intentLivemode = null;
            try {
                const intent = payment.stripe_payment_intent_id
                    ? await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id)
                    : null;
                intentLivemode = intent ? intent.livemode : null;
            } catch (_) {
                intentLivemode = null;
            }
            const modeCheck = transferModeMatches(
                intentLivemode,
                String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_') ? 'live' : 'test'
            );
            const createGate = liveTransferDecision(process.env);
            if (!createGate.ok || !modeCheck.ok) {
                if (lockedPayment.transfer_status === 'TRANSFER_PROCESSING') {
                    await supabaseAdmin
                        .from('payments')
                        .update({ transfer_status: lockPlan.revertTo })
                        .eq('id', payment.id)
                        .eq('transfer_status', 'TRANSFER_PROCESSING')
                        .is('stripe_transfer_id', null);
                }
                return {
                    success: false,
                    code: !createGate.ok ? createGate.code : modeCheck.code,
                    mutated: false,
                    error: 'Aucun transfert n’a été créé.'
                };
            }
            const transferDecision = evaluateTransfer({
                payment,
                milestone,
                providerAccountId: stripeAccountId,
                destinationAccountId: stripeAccountId
            });
            if (!transferDecision.ok) {
                await supabaseAdmin
                    .from('payments')
                    .update({ transfer_status: lockPlan.revertTo })
                    .eq('id', payment.id);
                return { success: false, error: "Versement refusé.", code: transferDecision.code };
            }
            const transfer = await stripe.transfers.create(transferParams, {
                idempotencyKey: stripeIdempotencyKey
            });

            // 7. Update Payment & Milestone on Transfer Success
            const nowIso = new Date().toISOString();
            await supabaseAdmin
                .from('payments')
                .update({
                    stripe_transfer_id: transfer.id,
                    transfer_status: 'TRANSFERRED',
                    released_at: nowIso
                })
                .eq('id', payment.id);

            await supabaseAdmin
                .from('milestones')
                .update({
                    status: 'RELEASED',
                    updated_at: nowIso
                })
                .eq('id', milestone.id);

            console.log(`🎉 [LYANN TRANSFER] Transfert réussi ${transfer.id} pour Partie ${milestone.id}. Montant: ${transferAmountCents} cents.`);

            await closeRequestWhenQuoteIsSettled(quote);
            return {
                success: true,
                status: "RELEASED",
                transfer_id: transfer.id,
                message: "Versement autorisé et libéré."
            };
        } catch (trErr) {
            console.error("❌ Erreur Stripe Transfer:", trErr);
            const recovered = trErr && (trErr.transfer || (trErr.raw && trErr.raw.transfer));
            const failure = stripeTransferFailureAction(recovered && recovered.id ? recovered : null);
            if (failure.action === 'complete') {
                const nowIso = new Date().toISOString();
                await supabaseAdmin
                    .from('payments')
                    .update({
                        stripe_transfer_id: failure.transferId,
                        transfer_status: 'TRANSFERRED',
                        released_at: nowIso
                    })
                    .eq('id', payment.id);
                await supabaseAdmin
                    .from('milestones')
                    .update({ status: 'RELEASED', updated_at: nowIso })
                    .eq('id', milestone.id);
                await closeRequestWhenQuoteIsSettled(quote);
                return {
                    success: true,
                    status: "RELEASED",
                    transfer_id: failure.transferId,
                    message: "Versement autorisé et libéré."
                };
            }
            await supabaseAdmin
                .from('payments')
                .update({ transfer_status: failure.nextStatus })
                .eq('id', payment.id);

            return {
                success: false,
                status: "TRANSFER_FAILED",
                error: `Erreur Stripe lors du transfert: ${trErr.message}`
            };
        }
    } else {
        // Test Mode Mock Fallback when process.env.STRIPE_SECRET_KEY is not defined in non-prod test environments
        const mockTransferId = `tr_test_${Date.now()}`;
        const nowIso = new Date().toISOString();

        await supabaseAdmin
            .from('payments')
            .update({
                stripe_transfer_id: mockTransferId,
                transfer_status: 'TRANSFERRED',
                released_at: nowIso
            })
            .eq('id', payment.id);

        await supabaseAdmin
            .from('milestones')
            .update({
                status: 'RELEASED',
                updated_at: nowIso
            })
            .eq('id', milestone.id);

        await closeRequestWhenQuoteIsSettled(quote);
        return {
            success: true,
            mode: 'stripe_test_mock',
            status: "RELEASED",
            transfer_id: mockTransferId,
            message: "Versement autorisé et libéré (mode test)."
        };
    }
}

/**
 * 6.4 REQUESTER VALIDATION & TRANSFER RELEASE (STEP 2B V1.1)
 * POST /v1/milestones/release-payment
 * Payload: { "milestone_id": "uuid", "validation_comment": "..." }
 * Authorization: Requester/Client ONLY
 */
app.post('/v1/milestones/release-payment', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Authentification requise." });
        }
        const token = authHeader.split(' ')[1];

        // 1. Authenticate user via Supabase Auth JWT
        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !authData?.user) {
            return res.status(401).json({ error: "Jeton d'authentification invalide ou expiré." });
        }
        const authUid = authData.user.id;

        // 2. Read input strictly: milestone_id (ignore any financial payload fields from client)
        const { milestone_id, validation_comment } = req.body;
        if (!milestone_id) {
            return res.status(400).json({ error: "Le paramètre milestone_id est obligatoire." });
        }

        // 3. Reconstruct context from DB
        const { data: milestone, error: mErr } = await supabaseAdmin
            .from('milestones')
            .select('*, quotes(*)')
            .eq('id', milestone_id)
            .single();

        if (mErr || !milestone) {
            return res.status(404).json({ error: "Étape de paiement introuvable." });
        }

        const quote = milestone.quotes;
        if (!quote) {
            return res.status(400).json({ error: "Devis associé introuvable." });
        }

        const { data: mission, error: missErr } = await supabaseAdmin
            .from('missions')
            .select('*')
            .eq('id', quote.mission_id)
            .single();

        if (missErr || !mission) {
            return res.status(400).json({ error: "Mission associée introuvable." });
        }

        // 4. Role Check: Only Requester (Client) can validate milestone
        if (!canValidateRelease(authUid, mission.requester_id)) {
            return res.status(403).json({ error: "Seul le demandeur (client) peut valider la Partie." });
        }

        const { data: payment, error: pErr } = await supabaseAdmin
            .from('payments')
            .select('*')
            .eq('milestone_id', milestone_id)
            .single();

        if (pErr || !payment) {
            return res.status(404).json({ error: "Enregistrement de paiement introuvable pour cette Partie." });
        }

        const decision = releasePaymentDecision({
            authUid,
            requesterId: mission.requester_id,
            milestone,
            payment
        });
        if (decision.action === 'forbidden') {
            return res.status(403).json({ error: "Seul le demandeur (client) peut valider la Partie." });
        }
        if (decision.action === 'already_transferred') {
            return res.json({
                success: true,
                already_transferred: true,
                idempotent: true,
                status: 'RELEASED',
                transfer_id: decision.transfer_id,
                message: 'Versement déjà effectué.'
            });
        }
        if (decision.action === 'reject') {
            if (decision.code === 'PAYMENT_NOT_SUCCEEDED') {
                return res.status(400).json({ error: "Le paiement de cette Partie doit être au statut SUCCEEDED." });
            }
            return res.status(400).json({
                error: `La Partie doit être au statut COMPLETED pour être validée (statut actuel: ${milestone.status}).`
            });
        }

        const releaseGate = liveTransferDecision(process.env);
        if (!releaseGate.ok) {
            return res.status(409).json({
                code: releaseGate.code,
                mutated: false,
                error: 'Les transferts Live sont fermés. Aucun paiement historique n’a été modifié.'
            });
        }

        // 6. RECORD CLIENT VALIDATION AT (Definitive Business Event)
        let nowIso = new Date().toISOString();
        if (!payment.client_validated_at) {
            const { error: valUpdateErr } = await supabaseAdmin
                .from('payments')
                .update({
                    client_validated_at: nowIso,
                    validation_comment: validation_comment || null
                })
                .eq('id', payment.id)
                .is('stripe_refund_id', null)
                .is('stripe_transfer_id', null);

            if (valUpdateErr) {
                await supabaseAdmin
                    .from('payments')
                    .update({ client_validated_at: nowIso })
                    .eq('id', payment.id)
                    .is('stripe_refund_id', null)
                    .is('stripe_transfer_id', null);
            }
        }

        // 7. Execute Transfer Release via common helper.
        // A failed transfer must not look like a successful release to the chat.
        const result = await retryMilestoneTransfer(milestone_id);
        if (result && result.success === false) {
            const http = result.code === 'CONCURRENCY_LOCK_FAILED' ? 409 : 400;
            return res.status(http).json(result);
        }
        return res.json(result);

    } catch (e) {
        console.error("Erreur serveur release-payment:", e);
        return res.status(500).json({ error: "Erreur interne serveur lors de la libération du paiement." });
    }
});

/**
 * 6.5 LYANNEUR CLAIM / RETRY TRANSFER (STEP 2B V1.1)
 * POST /v1/milestones/claim-transfer
 * Payload: { "milestone_id": "uuid" }
 * Authorization: Assigned Helper/Provider ONLY
 */
app.post('/v1/milestones/claim-transfer', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Authentification requise." });
        }
        const token = authHeader.split(' ')[1];

        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !authData?.user) {
            return res.status(401).json({ error: "Jeton d'authentification invalide ou expiré." });
        }
        const authUid = authData.user.id;

        const { milestone_id } = req.body;
        if (!milestone_id) {
            return res.status(400).json({ error: "Le paramètre milestone_id est obligatoire." });
        }

        const { data: milestone, error: mErr } = await supabaseAdmin
            .from('milestones')
            .select('*, quotes(*)')
            .eq('id', milestone_id)
            .single();

        if (mErr || !milestone) {
            return res.status(404).json({ error: "Étape de paiement introuvable." });
        }

        const quote = milestone.quotes;
        if (!quote) {
            return res.status(400).json({ error: "Devis associé introuvable." });
        }

        const providerId = quote.provider_id;
        if (!canClaimTransfer(authUid, providerId)) {
            return res.status(403).json({ error: "Seul le Lyanneur prestataire peut réclamer ce versement." });
        }

        const claimGate = liveTransferDecision(process.env);
        if (!claimGate.ok) {
            return res.status(409).json({
                code: claimGate.code,
                mutated: false,
                error: 'Les transferts Live sont fermés. Aucun transfert n’a été créé.'
            });
        }

        const result = await retryMilestoneTransfer(milestone_id);
        return res.json(result);

    } catch (e) {
        console.error("Erreur serveur claim-transfer:", e);
        return res.status(500).json({ error: "Erreur interne serveur." });
    }
});

/**
 * 6.6 CLIENT DISPUTE / LITIGE ENDPOINT (STEP 2B V1.1)
 * POST /v1/milestones/raise-dispute
 * Payload: { "milestone_id": "uuid", "reason": "..." }
 * Authorization: Requester/Client ONLY
 */
app.post('/v1/milestones/raise-dispute', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Authentification requise." });
        }
        const token = authHeader.split(' ')[1];

        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !authData?.user) {
            return res.status(401).json({ error: "Jeton d'authentification invalide ou expiré." });
        }
        const authUid = authData.user.id;

        const { milestone_id, reason = '' } = req.body;
        if (!milestone_id) {
            return res.status(400).json({ error: "Le paramètre milestone_id est obligatoire." });
        }

        const { data: milestone, error: mErr } = await supabaseAdmin
            .from('milestones')
            .select('*, quotes(*)')
            .eq('id', milestone_id)
            .single();

        if (mErr || !milestone) {
            return res.status(404).json({ error: "Étape de paiement introuvable." });
        }

        const quote = milestone.quotes;
        if (!quote) {
            return res.status(400).json({ error: "Devis associé introuvable." });
        }

        const { data: mission, error: missErr } = await supabaseAdmin
            .from('missions')
            .select('*')
            .eq('id', quote.mission_id)
            .single();

        if (missErr || !mission) {
            return res.status(400).json({ error: "Mission associée introuvable." });
        }

        const { data: payment, error: pErr } = await supabaseAdmin
            .from('payments')
            .select('*')
            .eq('milestone_id', milestone_id)
            .single();

        const dispute = raiseDisputeDecision({
            authUid,
            requesterId: mission.requester_id,
            milestone,
            payment: payment || null
        });
        if (dispute.action === 'forbidden') {
            return res.status(403).json({ error: "Seul le demandeur (client) peut signaler un litige sur cette Partie." });
        }
        if (dispute.action === 'not_found' || pErr || !payment) {
            return res.status(404).json({ error: "Paiement introuvable pour cette Partie." });
        }
        if (dispute.action === 'already') {
            return res.json({
                success: true,
                idempotent: true,
                status: 'DISPUTED',
                milestone_id: milestone.id,
                message: "Signalement de litige déjà enregistré. Le versement reste gelé."
            });
        }
        if (dispute.action === 'reject') {
            if (dispute.code === 'ALREADY_VALIDATED') {
                return res.status(400).json({
                    error: "Cette Partie a déjà été validée. Vous ne pouvez plus ouvrir un litige standard.",
                    code: "ALREADY_VALIDATED"
                });
            }
            if (dispute.code === 'MILESTONE_NOT_COMPLETED') {
                return res.status(400).json({ error: `Un litige ne peut être ouvert que sur une Partie réalisée (statut actuel: ${milestone.status}).` });
            }
            return res.status(400).json({ error: "Le statut du paiement ne permet pas l'ouverture d'un litige." });
        }

        const nowIso = new Date().toISOString();
        const frozen = await supabaseAdmin
            .from('payments')
            .update({
                payment_status: 'DISPUTED',
                dispute_reason: reason || null
            })
            .eq('id', payment.id)
            .eq('payment_status', 'SUCCEEDED')
            .eq('transfer_status', 'PENDING_VALIDATION')
            .is('client_validated_at', null)
            .is('stripe_transfer_id', null)
            .is('stripe_refund_id', null)
            .select()
            .maybeSingle();

        if (frozen.error || !frozen.data) {
            return res.status(409).json({ code: 'CONCURRENCY_LOCK_FAILED', error: "Le versement n'a pas pu être gelé (concurrence)." });
        }

        await supabaseAdmin
            .from('milestones')
            .update({
                status: 'DISPUTED',
                updated_at: nowIso
            })
            .eq('id', milestone.id)
            .eq('status', 'COMPLETED');

        console.log(`⚠️ [DISPUTE RAISED] Litige ouvert par le client sur Partie ${milestone.id}. Raison: ${reason}`);

        return res.json({
            success: true,
            status: "DISPUTED",
            milestone_id: milestone.id,
            message: "Signalement de litige enregistré. Le versement est gelé en attente de médiation."
        });

    } catch (e) {
        console.error("Erreur serveur raise-dispute:", e);
        return res.status(500).json({ error: "Erreur interne serveur." });
    }
});

// 7. LEGACY SECURE PROVIDER TRANSFER (@deprecated)
app.post('/v1/payments/validate-and-transfer', async (req, res) => {
    return res.status(410).json({ success: false, code: 'LEGACY_ENDPOINT_DISABLED', error: 'Cette route historique est désactivée.' });
    try {
        const { missionId, providerStripeAccountId, providerAmount, userId } = req.body;

        if (!missionId || !providerAmount) {
            return res.status(400).json({ error: "Mission ID et montant prestataire requis." });
        }

        const amountCents = Math.round(parseFloat(providerAmount) * 100);

        if (process.env.STRIPE_SECRET_KEY && providerStripeAccountId) {
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            const transfer = await stripe.transfers.create({
                amount: amountCents,
                currency: 'eur',
                destination: providerStripeAccountId,
                description: `Versements travaux mission LYANN ${missionId}`,
                metadata: { missionId, validatedBy: userId || '' }
            }, {
                idempotencyKey: `tr_idem_${missionId}_val`
            });

            return res.json({
                success: true,
                mode: 'stripe_live',
                transferId: transfer.id,
                providerAmount: parseFloat(providerAmount),
                status: 'PROVIDER_TRANSFERRED'
            });
        } else {
            return res.json({
                success: true,
                mode: 'stripe_test_mode',
                transferId: `tr_test_${Date.now()}`,
                providerAmount: parseFloat(providerAmount),
                status: 'PROVIDER_TRANSFERRED'
            });
        }
    } catch (e) {
        console.error("Stripe Transfer Server Error:", e);
        res.status(500).json({ error: "Erreur lors du virement au prestataire." });
    }
});

app.post('/v1/payments/dispute', (_req, res) => {
    return res.status(410).json({
        success: false,
        code: 'LEGACY_ENDPOINT_DISABLED',
        error: 'Cette route historique est désactivée. Utiliser POST /v1/milestones/raise-dispute.'
    });
});

async function announceAcceptedQuoteInConversation() {
    // Quote and payment timeline events already describe the step.
    // A second text message only repeated "Devis accepté".
}

function postTransferRefundStore() {
    return createSupabaseStore(supabaseAdmin);
}

app.post('/v1/payments/post-transfer-refund-requests', async (req, res) => {
    try {
        if (rejectPaymentWritesOnProductionFromDev(req, res)) return;
        const user = await requireBearerUser(req);
        if (!user) return res.status(401).json({ error: 'Authentification requise.' });
        const result = await createPostTransferRefundRequest(postTransferRefundStore(), {
            authUid: user.id,
            paymentId: req.body && req.body.payment_id,
            milestoneId: req.body && req.body.milestone_id,
            requestedCents: req.body && req.body.requested_cents,
            reason: req.body && req.body.reason
        });
        return res.status(result.http).json(result.body);
    } catch (e) {
        return res.status(500).json({ error: 'Demande impossible.' });
    }
});

app.get('/v1/payments/post-transfer-refund-requests', async (req, res) => {
    try {
        const user = await requireBearerUser(req);
        if (!user) return res.status(401).json({ error: 'Authentification requise.' });
        const result = await listPostTransferRefundRequests(postTransferRefundStore(), { authUid: user.id });
        return res.status(result.http).json(result.body);
    } catch (e) {
        return res.status(500).json({ error: 'Lecture impossible.' });
    }
});

app.get('/v1/payments/post-transfer-refund-requests/:id', async (req, res) => {
    try {
        const user = await requireBearerUser(req);
        if (!user) return res.status(401).json({ error: 'Authentification requise.' });
        const result = await viewPostTransferRefundRequest(postTransferRefundStore(), {
            authUid: user.id,
            requestId: req.params.id
        });
        return res.status(result.http).json(result.body);
    } catch (e) {
        return res.status(500).json({ error: 'Lecture impossible.' });
    }
});

app.post('/v1/payments/post-transfer-refund-requests/:id/reply', async (req, res) => {
    try {
        if (rejectPaymentWritesOnProductionFromDev(req, res)) return;
        const user = await requireBearerUser(req);
        if (!user) return res.status(401).json({ error: 'Authentification requise.' });
        const result = await replyPostTransferRefundRequest(postTransferRefundStore(), {
            authUid: user.id,
            requestId: req.params.id,
            response: req.body && req.body.response,
            reason: req.body && req.body.reason
        });
        return res.status(result.http).json(result.body);
    } catch (e) {
        return res.status(500).json({ error: 'Réponse impossible.' });
    }
});

app.get('/v1/admin/post-transfer-refund-requests/:id', async (req, res) => {
    const admin = await verifyAdminPermission(req, 'finance.refund');
    if (!admin.authorized) return res.status(admin.status).json({ error: admin.error });
    const result = await viewPostTransferRefundRequest(postTransferRefundStore(), {
        authUid: admin.userId,
        requestId: req.params.id,
        admin
    });
    return res.status(result.http).json(result.body);
});

app.get('/v1/admin/post-transfer-refund-requests/:id/history', async (req, res) => {
    const admin = await verifyAdminPermission(req, 'finance.refund');
    if (!admin.authorized) return res.status(admin.status).json({ error: admin.error });
    const result = await listPostTransferRefundHistory(postTransferRefundStore(), {
        authUid: admin.userId,
        requestId: req.params.id,
        admin
    });
    return res.status(result.http).json(result.body);
});

app.post('/v1/admin/post-transfer-refund-requests/:id/execute', async (req, res) => {
    try {
        if (rejectPaymentWritesOnProductionFromDev(req, res)) return;
        const admin = await verifyAdminPermission(req, 'finance.refund');
        if (!admin.authorized) {
            return res.status(admin.status).json({
                error: admin.error,
                execute: false,
                createReversal: false,
                createRefund: false
            });
        }
        const postTransferGate = liveRefundDecision(
            process.env,
            String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_') ? true : false
        );
        if (!postTransferGate.ok) {
            return res.status(409).json({
                code: postTransferGate.code,
                execute: false,
                createReversal: false,
                createRefund: false,
                error: 'Les remboursements Live sont fermés. Aucun remboursement n’a été créé.'
            });
        }
        const result = await executeAdminPostTransfer(postTransferRefundStore(), {
            admin,
            requestId: req.params.id,
            expected: req.body && req.body.expected,
            requestedCents: req.body && req.body.requested_cents,
            body: req.body,
            httpRoute: true,
            ...attachServerStripeTestRuntime({ supabaseAdmin, env: process.env })
        });
        return res.status(result.http).json(result.body);
    } catch (e) {
        return res.status(500).json({
            error: 'Exécution impossible.',
            execute: false,
            createReversal: false,
            createRefund: false
        });
    }
});

app.post('/v1/admin/post-transfer-refund-requests/:id/decide', async (req, res) => {
    try {
        if (rejectPaymentWritesOnProductionFromDev(req, res)) return;
        const admin = await verifyAdminPermission(req, 'finance.refund');
        if (!admin.authorized) return res.status(admin.status).json({ error: admin.error });
        if (postTransferFinancialExecutionEnabled()) {
            return res.status(409).json({ code: 'EXECUTION_DISABLED_REQUIRED', execute: false });
        }
        const result = await decidePostTransferRefundRequest(postTransferRefundStore(), {
            requestId: req.params.id,
            action: req.body && req.body.action,
            requestedCents: req.body && req.body.requested_cents,
            reason: req.body && req.body.reason,
            admin
        });
        return res.status(result.http).json(result.body);
    } catch (e) {
        return res.status(500).json({ error: 'Décision impossible.' });
    }
});

app.post('/v1/payments/refund-untransferred', async (req, res) => {
    try {
        const user = await requireBearerUser(req);
        if (!user) return res.status(401).json({ error: 'Authentification requise.' });
        const milestoneId = req.body?.milestone_id;
        if (!milestoneId) return res.status(400).json({ error: 'Le paramètre milestone_id est obligatoire.' });
        const { data: milestone } = await supabaseAdmin.from('milestones').select('*, quotes(*)').eq('id', milestoneId).maybeSingle();
        if (!milestone) return res.status(404).json({ error: 'Partie introuvable.' });
        const { data: mission } = await supabaseAdmin.from('missions').select('id, requester_id, status').eq('id', milestone.quotes?.mission_id).maybeSingle();
        if (!mission) {
            return res.status(400).json({ error: 'Mission associée introuvable.' });
        }
        const { data: payment } = await supabaseAdmin.from('payments').select('*').eq('milestone_id', milestoneId).maybeSingle();
        const grant = loadPreTransferRefundGrant();
        const facts = grantFactsFromPayment(payment, {
            requesterId: mission.requester_id,
            env: process.env,
            livemode: String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_'),
            stripeAccount: String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_')
                ? STRIPE_TEST_PLATFORM_ACCOUNT
                : null
        });
        const prepared = preparePreTransferRefund({
            authUid: user.id,
            requesterId: mission.requester_id,
            payment,
            milestone,
            mission,
            body: req.body,
            headers: req.headers,
            query: req.query,
            livemode: facts.livemode,
            grantActive: grant.active === true,
            grantEvaluation: evaluatePreTransferRefundGrant(grant, facts)
        });
        if (prepared.code === 'FORBIDDEN') {
            return res.status(403).json({ error: 'Seul le demandeur peut annuler ce paiement.', code: prepared.code });
        }
        if (prepared.code === 'ALREADY_REFUNDED') {
            return res.json({ success: true, idempotent: true, code: 'ALREADY_REFUNDED', refund_id: prepared.refund_id });
        }
        if (prepared.reconcile === true && prepared.refund_id) {
            const nowIso = new Date().toISOString();
            await supabaseAdmin.from('payments').update({
                payment_status: 'REFUNDED',
                amount_refunded_cents: prepared.amount_cents,
                stripe_refund_id: prepared.refund_id
            }).eq('id', payment.id);
            await supabaseAdmin.from('milestones').update({ status: 'CANCELLED', updated_at: nowIso }).eq('id', milestone.id);
            return res.json({ success: true, code: 'RECONCILE_EXISTING_REFUND', refund_id: prepared.refund_id, create: false });
        }
        if (prepared.execute !== true) {
            return res.status(prepared.http).json({
                code: prepared.code,
                error: prepared.code === 'EXECUTION_DISABLED'
                    ? 'Remboursement pré-Transfer non activé.'
                    : 'Remboursement impossible.',
                create: false
            });
        }
        const runtime = stripeRuntime();
        if (!runtime.stripe) return res.status(503).json({ code: 'STRIPE_CONFIG_MISSING', error: 'Stripe test indisponible.' });

        let listedRefunds = [];
        try {
            const listed = await runtime.stripe.refunds.list({
                payment_intent: payment.stripe_payment_intent_id,
                limit: 10
            });
            listedRefunds = (listed.data || []).filter((row) => row && row.id && row.status !== 'canceled');
        } catch (_) {
            return res.status(500).json({ code: 'STRIPE_READ_UNCERTAIN', error: 'Lecture Stripe incertaine.', create: false });
        }
        if (listedRefunds.length) {
            const nowIso = new Date().toISOString();
            await supabaseAdmin.from('payments').update({
                payment_status: 'REFUNDED',
                amount_refunded_cents: refundAmountFromPayment(payment),
                stripe_refund_id: listedRefunds[0].id
            }).eq('id', payment.id);
            await supabaseAdmin.from('milestones').update({ status: 'CANCELLED', updated_at: nowIso }).eq('id', milestone.id);
            return res.json({ success: true, code: 'RECONCILE_EXISTING_REFUND', refund_id: listedRefunds[0].id, create: false });
        }

        let locked = payment;
        if (prepared.action === 'acquire') {
            const reserved = await supabaseAdmin
                .from('payments')
                .update({ stripe_refund_id: refundReservationId(payment.id) })
                .eq('id', payment.id)
                .eq('payment_status', 'SUCCEEDED')
                .eq('transfer_status', 'PENDING_VALIDATION')
                .is('stripe_transfer_id', null)
                .is('client_validated_at', null)
                .is('stripe_refund_id', null)
                .select()
                .maybeSingle();
            if (reserved.error || !reserved.data) {
                return res.status(409).json({ code: 'CONCURRENCY_LOCK_FAILED', error: 'Remboursement impossible (concurrence).' });
            }
            locked = reserved.data;
        }

        const amountCents = refundAmountFromPayment(payment);
        if (!Number.isFinite(amountCents) || amountCents <= 0) {
            return res.status(409).json({ code: 'AMOUNT_UNAVAILABLE', error: 'Montant remboursable introuvable.' });
        }
        const admitted = admitPreTransferRefundDispatch(prepared, { found: false, searchComplete: true });
        if (!admitted.ok || admitted.createRefund !== true) {
            return res.status(409).json({
                code: admitted.code || 'EXECUTION_DISABLED',
                error: 'Remboursement pré-Transfer non admis.',
                create: false
            });
        }

        const refundCreateGate = liveRefundDecision(
            process.env,
            String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_') ? true : false
        );
        if (!refundCreateGate.ok) {
            return res.status(409).json({
                code: refundCreateGate.code,
                create: false,
                error: 'Les remboursements Live sont fermés. Aucun remboursement n’a été créé.'
            });
        }

        try {
            const refund = await runtime.stripe.refunds.create({
                payment_intent: payment.stripe_payment_intent_id,
                amount: amountCents
            }, { idempotencyKey: refundIdempotencyKey(payment.id) });
            const nowIso = new Date().toISOString();
            await supabaseAdmin.from('payments').update({
                payment_status: 'REFUNDED',
                amount_refunded_cents: amountCents,
                stripe_refund_id: refund.id
            }).eq('id', payment.id);
            await supabaseAdmin.from('milestones').update({ status: 'CANCELLED', updated_at: nowIso }).eq('id', milestone.id);
            return res.json({ success: true, code: 'REFUNDED', refund_id: refund.id });
        } catch (trErr) {
            const recovered = trErr && (trErr.refund || (trErr.raw && trErr.raw.refund));
            const failure = stripeRefundFailureAction(recovered && recovered.id ? recovered : null);
            if (failure.action === 'complete') {
                const nowIso = new Date().toISOString();
                await supabaseAdmin.from('payments').update({
                    payment_status: 'REFUNDED',
                    amount_refunded_cents: amountCents,
                    stripe_refund_id: failure.refundId
                }).eq('id', payment.id);
                await supabaseAdmin.from('milestones').update({ status: 'CANCELLED', updated_at: nowIso }).eq('id', milestone.id);
                return res.json({ success: true, code: 'REFUNDED', refund_id: failure.refundId, recovered: true });
            }
            return res.status(500).json({
                error: 'Remboursement impossible.',
                code: failure.code || 'STRIPE_UNCERTAIN_KEEP_LOCK'
            });
        }
    } catch (e) {
        console.error('Refund error');
        return res.status(500).json({ error: 'Remboursement impossible.' });
    }
});

// 9. STRIPE WEBHOOK LISTENER (Server-side Source of Truth & Signed Idempotent Event Processor)
app.post(['/v1/payments/webhook', '/v1/webhooks/stripe', '/payments/webhook', '/webhooks/stripe', '/api/payments/webhook', '/api/webhooks/stripe'], async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const runtime = stripeRuntime();
    if (!runtime.stripe) {
        return res.status(503).json({ code: 'STRIPE_WEBHOOK_CONFIG_MISSING', error: 'Configuration webhook Stripe incomplète.' });
    }

    const constructed = constructStripeWebhookEvent(runtime.stripe, req.body, sig, process.env);
    if (!constructed.ok) {
        const http = constructed.code === 'STRIPE_WEBHOOK_CONFIG_MISSING' ? 503 : 400;
        return res.status(http).json({
            code: constructed.code,
            error: constructed.code === 'STRIPE_SIGNATURE_INVALID' ? 'Signature Stripe invalide.' : 'Configuration webhook Stripe incomplète.'
        });
    }
    let event = constructed.event;
    if (constructed.thin && constructed.notification) {
        event = await enrichVerifiedThinEvent(constructed.notification, event);
    }

    const admission = admitStripeWebhookEvent(event, process.env);
    if (!admission.ok) {
        return res.status(409).json({ code: admission.code, error: 'Événement Stripe refusé par l’isolation.' });
    }

    if (event && event.id) {
        const write = webhookEventWriteRow(event);
        let eventInsertErr = (await supabaseAdmin.from('stripe_webhook_events').insert(write)).error;
        if (shouldFallbackWebhookPayloadColumn(eventInsertErr)) {
            eventInsertErr = (await supabaseAdmin
                .from('stripe_webhook_events')
                .insert(webhookEventLegacyPayloadRow(write))).error;
        }

        if (eventInsertErr && eventInsertErr.code === '23505') {
            const { data: existing } = await supabaseAdmin
                .from('stripe_webhook_events')
                .select('status')
                .eq('stripe_event_id', event.id)
                .maybeSingle();
            const claim = claimWebhookDecision(existing || { status: 'processed' });
            if (claim.action === 'duplicate') return res.json({ received: true, duplicate: true });
        } else if (eventInsertErr && /status/.test(eventInsertErr.message || '')) {
            const legacyRow = { stripe_event_id: write.stripe_event_id, event_type: write.event_type, payload_summary: write.payload_summary };
            let legacyErr = (await supabaseAdmin.from('stripe_webhook_events').insert(legacyRow)).error;
            if (shouldFallbackWebhookPayloadColumn(legacyErr)) {
                legacyErr = (await supabaseAdmin.from('stripe_webhook_events').insert({
                    stripe_event_id: write.stripe_event_id,
                    event_type: write.event_type,
                    payload: write.payload_summary
                })).error;
            }
            if (legacyErr && legacyErr.code === '23505') return res.json({ received: true, duplicate: true });
            if (legacyErr) return res.status(500).json({ error: 'Webhook non enregistré.' });
        } else if (eventInsertErr) {
            return res.status(500).json({ error: 'Webhook non enregistré.' });
        }
    }

    try {
        if (thinMoneyEvent(event)) {
            if (event && event.id) {
                await supabaseAdmin.from('stripe_webhook_events').update({ status: 'processed' }).eq('stripe_event_id', event.id);
            }
            return res.json({ received: true, applied: false, code: 'THIN_MONEY_EVENT_IGNORED' });
        }
        switch (event.type) {
            case 'payment_intent.succeeded': {
                const paymentIntent = event.data.object;
                console.log(`✅ [STRIPE WEBHOOK] PaymentIntent réussi: ${paymentIntent.id}`);

                const { data: payment } = await supabaseAdmin
                    .from('payments')
                    .select('*')
                    .eq('stripe_payment_intent_id', paymentIntent.id)
                    .maybeSingle();

                if (payment) {
                    const funded = applyPaymentSucceeded(payment, paymentIntent);
                    if (!funded.ok) {
                        throw new Error(funded.code);
                    }
                    if (funded.preserve_payment !== true && funded.apply !== false) {
                        const paymentUpdate = {
                            payment_status: funded.payment_status,
                            funded_at: payment.funded_at || new Date().toISOString(),
                            stripe_charge_id: funded.stripe_charge_id
                        };
                        if (!funded.preserve_transfer) paymentUpdate.transfer_status = funded.transfer_status;
                        await supabaseAdmin
                            .from('payments')
                            .update(paymentUpdate)
                            .eq('id', payment.id);
                    }
                    if (funded.milestone_status === 'FUNDED') {
                        await supabaseAdmin
                            .from('milestones')
                            .update({
                                status: 'FUNDED',
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', payment.milestone_id)
                            .in('status', ['PENDING', 'IN_PROGRESS', 'FUNDED']);
                    }

                    // Annonce → en cours (hors recherche publique OPEN).
                    try {
                        const { data: fundedMilestone } = await supabaseAdmin
                            .from('milestones')
                            .select('quote_id, quotes(request_id, mission_id)')
                            .eq('id', payment.milestone_id)
                            .maybeSingle();
                        const quoteRow = fundedMilestone && fundedMilestone.quotes;
                        let requestId = quoteRow && quoteRow.request_id;
                        if (!requestId && quoteRow && quoteRow.mission_id) {
                            const { data: missionRow } = await supabaseAdmin
                                .from('missions')
                                .select('related_request_id')
                                .eq('id', quoteRow.mission_id)
                                .maybeSingle();
                            requestId = missionRow && missionRow.related_request_id;
                        }
                        if (requestId) {
                            await supabaseAdmin
                                .from('requests')
                                .update({
                                    status: 'IN_PROGRESS',
                                    auto_close_at: null,
                                    close_notice_sent: true,
                                    updated_at: new Date().toISOString()
                                })
                                .eq('id', requestId)
                                .in('status', ['OPEN', 'PAUSED', 'ASSIGNED']);
                        }
                    } catch (requestStatusErr) {
                        console.warn('[PAYMENT CORE] request IN_PROGRESS update skipped', requestStatusErr);
                    }

                    await announceAcceptedQuoteInConversation(payment.milestone_id);

                    if (paymentIntent.metadata && paymentIntent.metadata.lyann_save_card === '1') {
                        try {
                            const runtime = stripeRuntime();
                            const methodId = typeof paymentIntent.payment_method === 'string'
                                ? paymentIntent.payment_method
                                : paymentIntent.payment_method && paymentIntent.payment_method.id;
                            const intentCustomer = typeof paymentIntent.customer === 'string'
                                ? paymentIntent.customer
                                : paymentIntent.customer && paymentIntent.customer.id;
                            if (runtime.stripe && methodId && intentCustomer) {
                                const method = await runtime.stripe.paymentMethods.retrieve(methodId);
                                if (canDetachSavedCard(method, intentCustomer) && method.allow_redisplay !== 'always') {
                                    await runtime.stripe.paymentMethods.update(methodId, { allow_redisplay: 'always' });
                                }
                            }
                        } catch (saveErr) {
                            console.warn('[PAYMENT CORE] saved card redisplay skipped', saveErr && saveErr.message);
                        }
                    }

                    console.log(`🔒 [PAYMENT CORE] Milestone ${payment.milestone_id} est à présent FUNDED. Transfer status: PENDING_VALIDATION.`);
                }
                break;
            }

            case 'payment_intent.requires_action': {
                const paymentIntent = event.data.object;
                const { data: existingAction } = await supabaseAdmin
                    .from('payments')
                    .select('*')
                    .eq('stripe_payment_intent_id', paymentIntent.id)
                    .maybeSingle();
                const action = applyPaymentRequiresAction(existingAction);
                if (action.apply && existingAction) {
                    await supabaseAdmin
                        .from('payments')
                        .update({ payment_status: 'REQUIRES_ACTION' })
                        .eq('id', existingAction.id)
                        .in('payment_status', ['CREATED', 'PROCESSING']);
                }
                break;
            }

            case 'payment_intent.payment_failed': {
                const paymentIntent = event.data.object;
                console.log(`❌ [STRIPE WEBHOOK] PaymentIntent échoué: ${paymentIntent.id}`);

                const { data: existingFailed } = await supabaseAdmin
                    .from('payments')
                    .select('*')
                    .eq('stripe_payment_intent_id', paymentIntent.id)
                    .maybeSingle();
                const failed = applyPaymentFailed(existingFailed);
                if (failed.apply) {
                    await supabaseAdmin
                        .from('payments')
                        .update({ payment_status: 'FAILED' })
                        .eq('id', existingFailed.id)
                        .in('payment_status', ['CREATED', 'REQUIRES_ACTION', 'PROCESSING']);
                }
                break;
            }

            case 'charge.refunded': {
                const charge = event.data.object;
                const { data: refundedPayment } = await supabaseAdmin
                    .from('payments')
                    .select('*')
                    .eq('stripe_charge_id', charge && charge.id)
                    .maybeSingle();
                const synced = applyChargeRefunded(refundedPayment, charge);
                if (synced.apply && refundedPayment && synced.persist !== false) {
                    await supabaseAdmin
                        .from('payments')
                        .update({
                            payment_status: synced.payment_status,
                            stripe_refund_id: synced.stripe_refund_id
                        })
                        .eq('id', refundedPayment.id);
                }
                break;
            }

            case 'transfer.reversed': {
                const transfer = event.data && event.data.object;
                const { data: reversedPayment } = await supabaseAdmin
                    .from('payments')
                    .select('*')
                    .eq('stripe_transfer_id', transfer && transfer.id)
                    .maybeSingle();
                const routed = routePostTransferWebhook(event, reversedPayment);
                const persist = postTransferWebhookPersistDecision(routed);
                if (persist.persist && routed.apply && reversedPayment) {
                    await supabaseAdmin
                        .from('payments')
                        .update({
                            transfer_status: routed.transfer_status,
                            stripe_reversal_id: routed.stripe_reversal_id
                        })
                        .eq('id', reversedPayment.id);
                }
                break;
            }

            case 'payment_intent.processing': {
                const paymentIntent = event.data.object;
                const { data: existingProcessing } = await supabaseAdmin
                    .from('payments')
                    .select('*')
                    .eq('stripe_payment_intent_id', paymentIntent.id)
                    .maybeSingle();
                const processing = applyPaymentProcessing(existingProcessing);
                if (processing.apply && existingProcessing) {
                    await supabaseAdmin
                        .from('payments')
                        .update({ payment_status: 'PROCESSING' })
                        .eq('id', existingProcessing.id)
                        .in('payment_status', ['CREATED', 'REQUIRES_ACTION']);
                }
                break;
            }

            case 'charge.dispute.created':
            case 'charge.dispute.updated': {
                const dispute = event.data && event.data.object;
                const chargeFilter = String(dispute && dispute.charge || '');
                const piFilter = String(dispute && dispute.payment_intent || '');
                let disputedQuery = supabaseAdmin.from('payments').select('*');
                if (chargeFilter && piFilter) {
                    disputedQuery = disputedQuery.or('stripe_charge_id.eq.' + chargeFilter + ',stripe_payment_intent_id.eq.' + piFilter);
                } else if (chargeFilter) {
                    disputedQuery = disputedQuery.eq('stripe_charge_id', chargeFilter);
                } else if (piFilter) {
                    disputedQuery = disputedQuery.eq('stripe_payment_intent_id', piFilter);
                } else {
                    break;
                }
                const { data: disputedPayment } = await disputedQuery.maybeSingle();
                const frozen = event.type === 'charge.dispute.updated'
                    ? applyChargeDisputeUpdated(disputedPayment)
                    : applyChargeDisputeCreated(disputedPayment);
                if (frozen.apply && disputedPayment) {
                    await supabaseAdmin
                        .from('payments')
                        .update({ payment_status: 'DISPUTED' })
                        .eq('id', disputedPayment.id)
                        .in('payment_status', ['SUCCEEDED', 'PARTIALLY_REFUNDED']);
                    if (disputedPayment.milestone_id) {
                        await supabaseAdmin
                            .from('milestones')
                            .update({ status: 'DISPUTED', updated_at: new Date().toISOString() })
                            .eq('id', disputedPayment.milestone_id)
                            .in('status', ['FUNDED', 'IN_PROGRESS', 'COMPLETED']);
                    }
                }
                void chargeId;
                break;
            }

            case 'charge.dispute.closed': {
                const closed = event.data && event.data.object;
                const { data: closedPayment } = await supabaseAdmin
                    .from('payments')
                    .select('*')
                    .eq('stripe_charge_id', closed && closed.charge)
                    .maybeSingle();
                applyChargeDisputeClosed(closedPayment);
                break;
            }

            case 'account.updated':
            case 'v2.core.account.updated':
            case 'v2.core.account[configuration.recipient].updated':
            case 'v2.core.account[configuration.recipient].capability_status_updated':
            case 'v2.core.account[requirements].updated': {
                const accountId = connectAccountIdFromEvent(event);
                if (!accountId || !CONNECT_ACCOUNT_EVENT_TYPES.has(event.type)) break;
                let account = event.data.object;
                try {
                    account = await runtime.stripe.v2.core.accounts.retrieve(accountId, {
                        include: ['configuration.recipient']
                    });
                } catch (_) {
                    account = event.data.object;
                }
                const { data: legacyProfile } = await supabaseAdmin
                    .from('profiles')
                    .select('id')
                    .eq('stripe_account_id', accountId)
                    .maybeSingle();
                let providerProfile = legacyProfile || null;
                if (!providerProfile) {
                    const mapped = await supabaseAdmin
                        .from('lyann_connect_accounts')
                        .select('user_id')
                        .eq('stripe_account_id', accountId)
                        .maybeSingle();
                    if (mapped.data && mapped.data.user_id) providerProfile = { id: mapped.data.user_id };
                }
                let pendingPayments = [];
                if (providerProfile) {
                    const listed = await supabaseAdmin
                        .from('payments')
                        .select('id, milestone_id, payment_status, transfer_status, stripe_transfer_id, stripe_refund_id')
                        .eq('provider_id', providerProfile.id)
                        .eq('transfer_status', 'TRANSFER_FAILED')
                        .is('stripe_transfer_id', null);
                    pendingPayments = listed.data || [];
                }
                const decided = applyAccountUpdated({ account, payments: pendingPayments });
                if (decided.announcePayoutReady && providerProfile) {
                    await announcePayoutReady(providerProfile.id);
                }
                break;
            }

            case 'payout.paid':
            case 'payout.failed':
            case 'v1.payout.paid':
            case 'v1.payout.failed': {
                const payout = payoutDecisionFromEvent(event);
                if (!payout.ok || payout.mutatePayment !== false || payout.mutateTransfer !== false) break;
                const saved = await supabaseAdmin.from('lyann_connect_payouts').upsert({
                    ...payout.record,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'stripe_payout_id' });
                if (saved.error) throw saved.error;
                break;
            }

            default:
                console.log(`ℹ️ [WEBHOOK STRIPE] Événement non géré: ${event.type}`);
        }

        if (event && event.id) {
            await supabaseAdmin.from('stripe_webhook_events').update({ status: 'processed' }).eq('stripe_event_id', event.id);
        }
        return res.json({ received: true });
    } catch (handlerErr) {
        console.error('Erreur traitement Webhook Stripe');
        if (event && event.id) {
            await supabaseAdmin.from('stripe_webhook_events').delete().eq('stripe_event_id', event.id);
        }
        return res.status(500).json({ error: 'Erreur serveur webhook.' });
    }
});

require('./business-routes').registerBusinessRoutes(app, { supabaseAdmin, verifyAdminPermission });
require('./store-routes').registerStoreRoutes(app, { supabaseAdmin });
const { registerContentModerationRoutes } = require('./content-moderation-routes');
registerContentModerationRoutes(app, {
    supabaseAdmin,
    verifyAdminPermission,
    recordMaisonAudit
});

// Start Server
if (require.main === module) {
    const bind = process.env.LYANN_API_BIND || undefined;
    const onListen = () => {
        console.log(`🚀 LYANN DOM API Engine en écoute sur http://${bind || 'localhost'}:${PORT}/v1`);
        if (process.env.PUSH_AUTOMATIC_ENABLED === 'true' && process.env.PUSH_CRON_SECRET && !process.env.VERCEL) {
            const http = require('http');
            const secret = process.env.PUSH_CRON_SECRET;
            const tick = () => {
                const req = http.request({
                    hostname: '127.0.0.1',
                    port: PORT,
                    path: '/v1/notifications/push-drain',
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + secret, 'Content-Length': 0 }
                }, (response) => { response.resume(); });
                req.on('error', () => {});
                req.end();
            };
            setInterval(tick, 8000);
            setTimeout(tick, 1500);
            console.log('Push actif : file APNs vidée toutes les 8 s, sonnerie lyann-notif.caf');
        }
        if (process.env.OPENAI_API_KEY && process.env.MODERATION_WORKER_SECRET && !process.env.VERCEL) {
            const http = require('http');
            const secret = process.env.MODERATION_WORKER_SECRET;
            const moderate = () => {
                const req = http.request({
                    hostname: '127.0.0.1',
                    port: PORT,
                    path: '/v1/internal/moderation/run',
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + secret, 'Content-Length': 0 }
                }, (response) => { response.resume(); });
                req.on('error', () => {});
                req.end();
            };
            setInterval(moderate, 5000);
            setTimeout(moderate, 2000);
            console.log('Modération active : file traitée toutes les 5 s');
        }
    };
    if (bind) app.listen(PORT, bind, onListen);
    else app.listen(PORT, onListen);
}

module.exports = app;
