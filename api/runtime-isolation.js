'use strict';

const { inspectStripeEnv } = require('./stripe-policy');

const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const STAGING_REF = 'tdktfbtqceldlaeqjtow';

function supabaseRefFromUrl(value) {
    try {
        return new URL(String(value || '')).hostname.replace(/\.supabase\.co$/i, '');
    } catch (_) {
        return '';
    }
}

function jwtPayload(token) {
    try {
        const part = String(token || '').split('.')[1];
        if (!part) return null;
        const json = Buffer.from(part, 'base64url').toString('utf8');
        return JSON.parse(json);
    } catch (_) {
        return null;
    }
}

function hostedKind(env) {
    const runtime = String((env && env.LYANN_RUNTIME) || '').toLowerCase();
    if (runtime === 'staging') return 'staging';
    if (runtime === 'production') return 'production';
    if (env && env.VERCEL_ENV === 'production') return 'production';
    if (env && (env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development')) return 'preview';
    return '';
}

function assertHostedIsolation(env) {
    const kind = hostedKind(env || {});
    if (!kind) return { ok: true, code: 'LOCAL_UNSCOPED' };
    const ref = supabaseRefFromUrl((env && (env.SUPABASE_URL || env.LYANN_SUPABASE_URL)) || '');
    const stripe = inspectStripeEnv(env || {});
    const service = jwtPayload(env && env.SUPABASE_SERVICE_ROLE_KEY);
    const publicOrigin = String((env && env.LYANN_STAGING_PUBLIC_ORIGIN) || '');

    if (kind === 'staging' || kind === 'preview') {
        if (ref !== STAGING_REF) {
            return { ok: false, code: 'STAGING_POINTS_AT_PRODUCTION', message: 'Staging refuse un Supabase autre que tdktfbtqceldlaeqjtow.' };
        }
        if (stripe.mode === 'live' || stripe.secretKind === 'live' || stripe.publishableKind === 'live') {
            return { ok: false, code: 'STAGING_STRIPE_LIVE', message: 'Staging refuse Stripe Live.' };
        }
        if (service && service.ref && service.ref !== STAGING_REF) {
            return { ok: false, code: 'SERVICE_ROLE_REF_MISMATCH', message: 'La clé service Staging ne correspond pas au projet Staging.' };
        }
        if (service && service.role && service.role !== 'service_role') {
            return { ok: false, code: 'SERVICE_ROLE_REF_MISMATCH', message: 'La clé service Staging n’a pas le rôle service_role.' };
        }
        if (/lyann\.app/i.test(publicOrigin) && !/^https:\/\/staging\.lyann\.app$/i.test(publicOrigin)) {
            return { ok: false, code: 'STAGING_ORIGIN_IS_PRODUCTION', message: 'L’origine publique Staging ne peut pas être lyann.app.' };
        }
        return { ok: true, code: 'STAGING_ISOLATED' };
    }

    if (ref === STAGING_REF) {
        return { ok: false, code: 'PRODUCTION_POINTS_AT_STAGING', message: 'Production refuse le Supabase Staging.' };
    }
    if (ref && ref !== PRODUCTION_REF) {
        return { ok: false, code: 'PRODUCTION_SUPABASE_UNEXPECTED', message: 'Production refuse un projet Supabase inconnu.' };
    }
    if (publicOrigin) {
        return { ok: false, code: 'PRODUCTION_HAS_STAGING_ORIGIN', message: 'Production ne doit pas porter LYANN_STAGING_PUBLIC_ORIGIN.' };
    }
    return { ok: true, code: 'PRODUCTION_ISOLATED' };
}

function runtimeIdentity(env) {
    const isolation = assertHostedIsolation(env || {});
    const ref = supabaseRefFromUrl((env && (env.SUPABASE_URL || env.LYANN_SUPABASE_URL)) || '');
    return {
        success: isolation.ok,
        vercel_env: (env && env.VERCEL_ENV) || null,
        kind: hostedKind(env || {}),
        supabase_ref: ref || null,
        isolation: isolation.code,
        production: ref === PRODUCTION_REF,
        staging: ref === STAGING_REF,
        commit: (env && env.VERCEL_GIT_COMMIT_SHA) || null
    };
}

function browserOriginAllowed(origin, env) {
    if (!origin) return true;
    const known = new Set([
        'https://lyann.app',
        'https://www.lyann.app',
        'https://admin.lyann.app',
        'capacitor://localhost',
        'ionic://localhost',
        'http://localhost',
        'https://localhost'
    ]);
    if (known.has(origin)) return true;
    const ref = supabaseRefFromUrl((env && (env.SUPABASE_URL || env.LYANN_SUPABASE_URL)) || '');
    return ref === STAGING_REF && origin === 'https://staging.lyann.app';
}

module.exports = {
    PRODUCTION_REF,
    STAGING_REF,
    hostedKind,
    assertHostedIsolation,
    runtimeIdentity,
    jwtPayload,
    browserOriginAllowed
};
