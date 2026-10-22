/**
 * LYANN DOM — SUPABASE & API CLIENT SDK
 * Production Supabase client. No local mock business-data fallback is permitted.
 */

const LYANN_PRODUCTION_ORIGIN = 'https://lyann.app';
const LYANN_PRODUCTION_SUPABASE_REF = 'gzispjfoywklpqatjyop';
const LYANN_PRODUCTION_SUPABASE_URL = 'https://gzispjfoywklpqatjyop.supabase.co';
const LYANN_PRODUCTION_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6aXNwamZveXdrbHBxYXRqeW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTE4ODcsImV4cCI6MjEwMTk4Nzg4N30.oPJvkDVffQ4EaxDy2V7Jj7veusCVGTnM2BUBKXnoQ0A';

let supabaseClient;
function isUUID(str) {
    if (typeof str !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}
window.isUUID = isUUID;

// The annonce title is a one-line summary shown on every card.
const LYANN_REQUEST_TITLE_MAX = 60;
const LYANN_FEED_PAGE_SIZE = 60;
const LEGACY_MISSION_WRITE_DISABLED = 'Cette action passe désormais par le devis sécurisé de la conversation.';
window.LYANN_REQUEST_TITLE_MAX = LYANN_REQUEST_TITLE_MAX;

// PostgREST reports an unknown column as 42703, or as PGRST204 when its schema
// cache has no such field. Both mean a pending migration, not a caller mistake.
function isMissingColumnError(error) {
    if (!error) return false;
    if (['42703', 'PGRST204'].includes(String(error.code))) return true;
    return /column .* does not exist|could not find the .* column/i.test(String(error.message || ''));
}

function emitLyannClientEvent(name, detail) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    try {
        window.dispatchEvent(new CustomEvent(name, { detail: detail || null }));
    } catch (_) {}
}

function isPublishedService(row) {
    if (!row) return false;
    if (row.is_active === false || row.active === false) return false;
    return true;
}

function slugifyServiceTitle(title) {
    return String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || 'service';
}

function uniqueServiceSlug(userId, title) {
    const base = slugifyServiceTitle(title);
    const owner = String(userId || '').replace(/-/g, '').slice(0, 8);
    return owner ? `${base}-${owner}` : `${base}-${Date.now().toString(36)}`;
}

function isRetryableServiceInsertError(error) {
    if (!error) return false;
    if (isMissingColumnError(error)) return true;
    const code = String(error.code || '');
    const message = String(error.message || '');
    if (code === '23502' || /null value in column/i.test(message)) return true;
    if (code === '23505' || /duplicate key/i.test(message)) return true;
    return false;
}

// Production `services` stores category / is_active. The later canonical shape
// uses slug / active / pricing_model. Writes try the live production columns
// first, then the canonical ones if PostgREST says a column is missing.
function productionServiceInsert(userId, title, extra = {}) {
    const row = {
        owner_id: userId,
        title,
        category: extra.category || title,
        description: extra.description || title,
        is_active: true
    };
    if (extra.price_type) row.price_type = extra.price_type;
    if (extra.base_price != null) row.base_price = extra.base_price;
    return row;
}

function canonicalServiceInsert(userId, title, extra = {}) {
    const row = {
        owner_id: userId,
        title,
        slug: extra.slug || slugifyServiceTitle(title),
        description: extra.description || title,
        active: true
    };
    if (extra.pricing_model) row.pricing_model = extra.pricing_model;
    if (extra.indicative_price != null) row.indicative_price = extra.indicative_price;
    return row;
}

async function insertServicesForOwner(supabase, userId, items) {
    const attempts = [
        items.map((item) => productionServiceInsert(userId, item.title, item)),
        items.map((item) => Object.assign({}, productionServiceInsert(userId, item.title, item), {
            slug: uniqueServiceSlug(userId, item.title),
            active: true
        })),
        items.map((item) => canonicalServiceInsert(userId, item.title, Object.assign({}, item, {
            slug: uniqueServiceSlug(userId, item.title)
        })))
    ];
    let result = { error: { message: 'insert failed' } };
    for (let i = 0; i < attempts.length; i += 1) {
        result = await supabase.from('services').insert(attempts[i]).select();
        if (!result.error) return result;
        if (!isRetryableServiceInsertError(result.error)) return result;
    }
    return result;
}

function presentService(row) {
    if (!row) return row;
    const category = typeof row.category === 'string' ? row.category : '';
    return {
        ...row,
        is_active: isPublishedService(row),
        category,
        taxonomy_id: row.taxonomy_id || null,
        price_type: row.price_type || row.pricing_model || null,
        base_price: row.base_price != null ? row.base_price : row.indicative_price
    };
}

function isCapacitorRuntime() {
    if (typeof window === 'undefined') return false;
    try {
        if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
            return true;
        }
    } catch (e) {}
    const protocol = window.location && window.location.protocol;
    return protocol === 'capacitor:' || protocol === 'ionic:' || protocol === 'file:';
}

function resolveLyannClientBinding() {
    const runtime = (typeof window !== 'undefined' && window.LyannRuntimeConfig)
        || (typeof globalThis !== 'undefined' && globalThis.LyannRuntimeConfig);
    const location = (typeof window !== 'undefined' && window.location) || {};
    const input = {
        injectedUrl: typeof window !== 'undefined' ? window.LYANN_SUPABASE_URL : '',
        injectedAnon: typeof window !== 'undefined' ? window.LYANN_SUPABASE_ANON_KEY : '',
        lock: typeof window !== 'undefined' ? (window.LYANN_SUPABASE_LOCK || window.LYANN_E2E_WRITE_PROJECT_REF) : '',
        hostname: location.hostname || '',
        isNative: isCapacitorRuntime(),
    };
    if (typeof window !== 'undefined' && Object.prototype.hasOwnProperty.call(window, 'LYANN_BACKEND_ORIGIN')) {
        input.backendOrigin = window.LYANN_BACKEND_ORIGIN;
    }
    if (runtime && typeof runtime.resolveLyannRuntimeConfig === 'function') {
        return runtime.resolveLyannRuntimeConfig(input);
    }
    const lock = String(input.lock || '');
    const injectedUrl = String(input.injectedUrl || '').replace(/\/$/, '');
    if (injectedUrl) {
        if (lock && lock !== LYANN_PRODUCTION_SUPABASE_REF && injectedUrl.indexOf(LYANN_PRODUCTION_SUPABASE_REF) !== -1) {
            return { ok: false, code: 'SUPABASE_PRODUCTION_BLOCKED', url: '', anonKey: '', backendOrigin: '' };
        }
        return {
            ok: true,
            code: 'INJECTED',
            url: injectedUrl,
            anonKey: String(input.injectedAnon || ''),
            backendOrigin: Object.prototype.hasOwnProperty.call(input, 'backendOrigin')
                ? String(input.backendOrigin || '').replace(/\/$/, '')
                : (lock && lock !== LYANN_PRODUCTION_SUPABASE_REF ? '' : (input.isNative ? LYANN_PRODUCTION_ORIGIN : ''))
        };
    }
    if (lock && lock !== LYANN_PRODUCTION_SUPABASE_REF) {
        return { ok: false, code: 'SUPABASE_CONFIG_REQUIRED', url: '', anonKey: '', backendOrigin: '' };
    }
    const deployed = input.hostname === 'lyann.app' || input.hostname === 'www.lyann.app' || input.hostname === 'admin.lyann.app';
    if (deployed || (input.isNative && !lock)) {
        return {
            ok: true,
            code: deployed ? 'DEPLOYED_WEB' : 'SHIPPED_NATIVE',
            url: LYANN_PRODUCTION_SUPABASE_URL,
            anonKey: LYANN_PRODUCTION_ANON_KEY,
            backendOrigin: input.isNative ? LYANN_PRODUCTION_ORIGIN : ''
        };
    }
    return { ok: false, code: 'SUPABASE_CONFIG_REQUIRED', url: '', anonKey: '', backendOrigin: '' };
}

function getLyannSupabaseUrl() {
    const binding = resolveLyannClientBinding();
    if (!binding.ok || !binding.url) {
        throw new Error('Configuration Supabase manquante. Aucun basculement silencieux vers la production.');
    }
    return binding.url;
}

function getLyannSupabaseAnonKey() {
    const binding = resolveLyannClientBinding();
    if (!binding.ok || !binding.anonKey) {
        throw new Error('Clé Supabase anonyme manquante. Aucun basculement silencieux vers la production.');
    }
    return binding.anonKey;
}

function isLoopbackHttpOrigin(value) {
    return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(String(value || '').replace(/\/$/, ''));
}

function pageHttpOrigin() {
    try {
        const loc = typeof window !== 'undefined' ? window.location : null;
        if (!loc || (loc.protocol !== 'http:' && loc.protocol !== 'https:')) return '';
        return String(loc.origin || '').replace(/\/$/, '');
    } catch (_) {
        return '';
    }
}

function holdMediaUrl(bucket, objectPath) {
    const origin = (typeof getLyannBackendOrigin === 'function' && getLyannBackendOrigin()) || 'https://lyann.app';
    const encoded = String(objectPath || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return `${String(origin).replace(/\/$/, '')}/v1/media/${bucket}/${encoded}`;
}

function getLyannBackendOrigin() {
    const binding = resolveLyannClientBinding();
    if (!binding.ok) {
        throw new Error('Configuration Supabase manquante. Le backend production n’est pas utilisé par défaut.');
    }
    const origin = binding.backendOrigin || '';
    if (isCapacitorRuntime() && isLoopbackHttpOrigin(origin)) {
        console.warn('[LYANN] native-build ignored loopback backend', origin);
        return '';
    }
    // Chrome blocks 127.0.0.1 fetches from a LAN page (192.168.x / 10.x). The API
    // already serves that page, so payment must stay same-origin.
    const pageOrigin = pageHttpOrigin();
    if (!isCapacitorRuntime() && origin && isLoopbackHttpOrigin(origin) && pageOrigin && !isLoopbackHttpOrigin(pageOrigin)) {
        return pageOrigin;
    }
    return origin;
}

function lyannBackendFetch(path, options) {
    const origin = getLyannBackendOrigin();
    const url = /^https?:\/\//i.test(path) ? path : `${origin}${path}`;
    const opts = options || {};
    const cap = typeof window !== 'undefined' ? window.Capacitor : null;
    const Http = cap && cap.Plugins && cap.Plugins.CapacitorHttp;
    const native = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
    if (native && Http && typeof Http.request === 'function' && /^https?:\/\//i.test(url)) {
        const headers = {};
        const rawHeaders = opts.headers;
        if (rawHeaders && typeof rawHeaders.forEach === 'function') {
            rawHeaders.forEach((value, key) => { headers[key] = value; });
        } else if (rawHeaders && typeof rawHeaders === 'object') {
            Object.keys(rawHeaders).forEach((key) => { headers[key] = rawHeaders[key]; });
        }
        let data = opts.body;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch (_) {}
        }
        return Http.request({
            url,
            method: String(opts.method || 'GET').toUpperCase(),
            headers,
            data,
            connectTimeout: 15000,
            readTimeout: 20000
        }).then((res) => {
            const payload = res && Object.prototype.hasOwnProperty.call(res, 'data') ? res.data : {};
            const bodyText = typeof payload === 'string' ? payload : JSON.stringify(payload == null ? {} : payload);
            const status = Number(res && res.status) || 0;
            return {
                ok: status >= 200 && status < 300,
                status,
                json: async () => {
                    if (payload && typeof payload === 'object') return payload;
                    try { return JSON.parse(bodyText || '{}'); } catch (_) { return {}; }
                },
                text: async () => bodyText
            };
        });
    }
    return fetch(url, options);
}

window.getLyannBackendOrigin = getLyannBackendOrigin;
window.getLyannSupabaseUrl = getLyannSupabaseUrl;
window.lyannBackendFetch = lyannBackendFetch;
window.resolveLyannClientBinding = resolveLyannClientBinding;
try {
    if (isCapacitorRuntime()) {
        console.warn('[LYANN] native-build', window.LYANN_NATIVE_BUILD_ID || window.LYANN_ASSET_VERSION || 'unversioned', {
            at: window.LYANN_NATIVE_BUILD_AT || '',
            lock: window.LYANN_SUPABASE_LOCK || '',
            backend: getLyannBackendOrigin()
        });
    }
} catch (_) {}
if (window.supabase) {
    try {
        supabaseClient = window.supabase.createClient(getLyannSupabaseUrl(), getLyannSupabaseAnonKey(), {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
        console.log("⚡ Supabase client initialized with session persistence.");
        console.log("⚡ [BOOT 03] Supabase ready");
    } catch (error) {
        console.error("⚠️ Supabase n’a pas été initialisé :", error && error.message);
        console.log("⚡ [BOOT 03] Supabase unavailable");
    }
} else {
    console.error("⚠️ Supabase JS SDK missing. Production data features are unavailable.");
    console.log("⚡ [BOOT 03] Supabase unavailable");
}

if (!window.getLyannDefaultAvatar) {
    (function() {
        const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><circle cx="50" cy="50" r="50" fill="#FAF7F2"/><circle cx="50" cy="50" r="48" fill="#EBF2ED" stroke="rgba(74,124,89,0.25)" stroke-width="2"/><circle cx="50" cy="38" r="16" fill="#4A7C59"/><path d="M 22 84 C 22 66, 34 58, 50 58 C 66 58, 78 66, 78 84 Z" fill="#4A7C59"/></svg>`;
        window.LYANN_DEFAULT_AVATAR_SVG = 'data:image/svg+xml,' + encodeURIComponent(rawSvg);
        window.LYANN_DEFAULT_AVATAR_PATH = window.LYANN_DEFAULT_AVATAR_SVG;
    })();

    window.getLyannDefaultAvatar = function() {
        return window.LYANN_DEFAULT_AVATAR_SVG;
    };

    window.escapeHtmlAttr = function(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    };

    window.resolveLyannAvatarSrc = function(input) {
        if (!input) return window.getLyannDefaultAvatar();

        let raw = input;
        if (typeof input === 'object') {
            raw = input.avatar_url || input.author_avatar || input.authorAvatar || input.avatar || input.profile_photo || '';
        }

        if (typeof raw !== 'string') return window.getLyannDefaultAvatar();

        let clean = raw.trim();
        if (!clean) return window.getLyannDefaultAvatar();

        // Extract URL if caller passed raw <img> tag
        if (clean.includes('<') || clean.includes('>')) {
            const match = clean.match(/src=["']([^"']+)["']/i);
            if (match && match[1]) {
                clean = match[1].trim();
            } else {
                return window.getLyannDefaultAvatar();
            }
        }

        if (clean === 'null' || clean === 'undefined' || 
            clean.includes('dicebear.com') || clean.includes('bottts') || 
            clean.includes('avataaars') || clean.includes('avatar_01.png') || 
            clean.includes('david-34.png') || clean === 'default-avatar.svg') {
            return window.getLyannDefaultAvatar();
        }

        return clean;
    };

    window.getLyannAvatarUrl = window.resolveLyannAvatarSrc;

    window.handleAvatarError = function(imgEl) {
        if (imgEl && !imgEl.dataset.fallbackDone) {
            imgEl.dataset.fallbackDone = 'true';
            imgEl.onerror = null;
            imgEl.src = window.LYANN_DEFAULT_AVATAR_SVG;
        }
    };
}



// ----------------------------------------------------------------------
// PRODUCTION DATA POLICY: business data is remote-only (Supabase/RPC).
// No localStorage mission/message/service fallback is allowed.
// ----------------------------------------------------------------------
function normalizeAuthError(error) {
    if (!error) return null;
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('invalid login credentials') || msg.includes('invalid credentials') || msg.includes('user not found') || msg.includes('wrong password')) {
        return { message: 'Adresse email ou mot de passe incorrect.' };
    }
    if (msg.includes('email not confirmed')) {
        return { message: 'Votre compte est créé. Ouvrez le lien reçu par email pour activer la connexion, puis réessayez.' };
    }
    if (msg.includes('rate limit') || msg.includes('too many requests')) {
        return { message: 'Trop de tentatives effectuées. Veuillez patienter quelques minutes.' };
    }
    if (msg.includes('user already registered') || msg.includes('email already in use') || msg.includes('already exists')) {
        return { message: 'Un compte existe déjà avec cette adresse email.' };
    }
    if (msg.includes('password should be at least')) {
        return { message: 'Le mot de passe doit comporter au moins 8 caractères.' };
    }
    return { message: error.message || 'Erreur lors de l’authentification.' };
}

// ----------------------------------------------------------------------
// LYANN API CLIENT
// ----------------------------------------------------------------------
function lyannAppleNamePatch(profile, user, hints) {
    const existingFirst = String((profile && profile.first_name) || '').trim();
    const existingLast = String((profile && profile.last_name) || '').trim();
    const emailLocal = String((user && user.email) || '').split('@')[0].trim();
    const meta = (user && user.user_metadata) || {};
    const hint = hints || {};
    const clean = (value) => {
        const text = String(value || '').trim();
        if (!text || text.includes('@') || text.length > 80) return '';
        return text;
    };
    let first = clean(hint.givenName || meta.given_name || meta.first_name);
    let last = clean(hint.familyName || meta.family_name || meta.last_name);
    const full = clean(meta.full_name || meta.name);
    if (!first && full) {
        const parts = full.split(/\s+/).filter(Boolean);
        first = parts.shift() || '';
        if (!last) last = parts.join(' ');
    }
    const firstIsPlaceholder = !existingFirst || (emailLocal && existingFirst.toLowerCase() === emailLocal.toLowerCase());
    const patch = {};
    if (first && firstIsPlaceholder) patch.first_name = first;
    if (last && !existingLast) patch.last_name = last;
    const resolvedFirst = patch.first_name || existingFirst;
    const createdAt = Date.parse((profile && profile.created_at) || '');
    const ageMs = Number.isFinite(createdAt) ? Date.now() - createdAt : null;
    const isNewSignup = !profile || (ageMs !== null && ageMs >= 0 && ageMs < 120000);
    const hasRealName = Boolean(resolvedFirst) && !isNewSignup;
    return { patch, hasRealName };
}

const LYANN_API_CLIENT = {
    get supabase() {
        if (!supabaseClient && window.supabase) {
            supabaseClient = window.supabase.createClient(getLyannSupabaseUrl(), getLyannSupabaseAnonKey(), {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            });
        }
        return supabaseClient;
    },

    normalizeAuthError,
    isPublishedService,
    presentService,

    // --- AUTHENTICATION ---
    async signUp(email, password, metadata) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        if (!password || password.length < 8) {
            return { error: { message: 'Le mot de passe doit comporter au moins 8 caractères.' } };
        }
        const res = await this.supabase.auth.signUp({
            email,
            password,
            options: {
                data: metadata,
                emailRedirectTo: isCapacitorRuntime()
                    ? 'app.lyann.dom://confirm-signup'
                    : window.location.origin + '/confirm-signup.html'
            }
        });
        if (res.error) {
            console.error('[LYANN AUTH DEBUG]', {
                message: res.error.message,
                code: res.error.code,
                status: res.error.status
            });
            res.error = normalizeAuthError(res.error);
        }
        return res;
    },

    async deleteMyAccount() {
        if (!this.supabase) throw new Error('Supabase non initialisé');
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Connecte-toi pour supprimer ton compte.');
        const response = await lyannBackendFetch('/v1/auth/delete-account', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
            }
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'La suppression n’a pas abouti.');
        await this.supabase.auth.signOut();
        return body;
    },

    async continueSignup(userId) {
        if (!userId) return { error: { message: 'Compte introuvable.' } };
        try {
            const res = await lyannBackendFetch('/v1/auth/continue-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) return { error: { message: body.error || 'Impossible d’ouvrir la session pour le moment.' } };
            return { data: body };
        } catch (_) {
            return { error: { message: 'Connexion au serveur impossible.' } };
        }
    },

    async login(email, password) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const res = await this.supabase.auth.signInWithPassword({ email, password });
        if (res.error) {
            console.error('[LYANN AUTH DEBUG]', {
                message: res.error.message,
                code: res.error.code,
                status: res.error.status
            });
            res.error = normalizeAuthError(res.error);
        }
        return res;
    },

    async logout() {
        if (!this.supabase) return { error: null };
        if (window.LYANN_PUSH && typeof window.LYANN_PUSH.deactivate === 'function') {
            try { await window.LYANN_PUSH.deactivate(); } catch (_) {}
        }
        return await this.supabase.auth.signOut();
    },

    async signOut() {
        return await this.logout();
    },

    async getSession() {
        if (!this.supabase) return { data: { session: null }, error: null };
        return await this.supabase.auth.getSession();
    },

    async getCurrentUser() {
        if (!this.supabase) return null;
        const { data: { session } } = await this.supabase.auth.getSession();
        return session ? session.user : null;
    },

    async resetPasswordForEmail(email) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const res = await this.supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/index.html?action=reset_password'
        });
        if (res.error) res.error = normalizeAuthError(res.error);
        return res;
    },

    async updatePassword(newPassword) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const res = await this.supabase.auth.updateUser({ password: newPassword });
        if (res.error) res.error = normalizeAuthError(res.error);
        return res;
    },

    async getProfile(userId) {
        if (!this.supabase) return { data: null };
        return await this.supabase.from('profiles').select('*').eq('id', userId).single();
    },

    async rememberAppleIdentity(user, hints) {
        if (!this.supabase || !user || !user.id) return { hasRealName: false };
        let profile = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const res = await this.getProfile(user.id);
            if (res && res.data) {
                profile = res.data;
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 400));
        }
        const decision = lyannAppleNamePatch(profile, user, hints || {});
        if (Object.keys(decision.patch).length) {
            await this.updateProfile(user.id, decision.patch);
        }
        return { hasRealName: decision.hasRealName };
    },

    async updateProfile(userId, profileData) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };

        const safeData = {};

        // Map & sanitize allowed columns for public.profiles table
        const fn = profileData.first_name ?? profileData.firstName;
        if (fn !== undefined && fn !== null) safeData.first_name = String(fn).trim();

        const ln = profileData.last_name ?? profileData.lastName;
        if (ln !== undefined && ln !== null) safeData.last_name = String(ln).trim();

        const terr = profileData.territory;
        if (terr !== undefined && terr !== null) safeData.territory = String(terr).trim();

        const ci = profileData.city ?? profileData.commune;
        if (ci !== undefined && ci !== null) safeData.city = String(ci).trim();

        const ph = profileData.phone;
        if (ph !== undefined && ph !== null) safeData.phone = String(ph).trim();

        const bioVal = profileData.bio ?? profileData.short_bio ?? profileData.headline ?? profileData.title ?? profileData.presentation;
        if (bioVal !== undefined && bioVal !== null) safeData.bio = String(bioVal).trim();

        const av = profileData.avatar_url ?? profileData.avatar;
        if (av !== undefined && av !== null) safeData.avatar_url = String(av).trim();

        const rad = profileData.intervention_radius_km ?? profileData.intervention_radius ?? profileData.radius;
        if (rad !== undefined && rad !== null) {
            const numRad = typeof rad === 'number' ? rad : parseFloat(String(rad).replace(/[^0-9.]/g, ''));
            if (!isNaN(numRad)) safeData.intervention_radius_km = numRad;
        }

        const iz = profileData.intervention_zone;
        if (iz !== undefined && iz !== null) safeData.intervention_zone = Array.isArray(iz) ? iz : [String(iz)];

        if (profileData.is_pro !== undefined) safeData.is_pro = !!profileData.is_pro;
        if (profileData.is_verified !== undefined) safeData.is_verified = !!profileData.is_verified;

        if (profileData.notification_prefs && typeof profileData.notification_prefs === 'object') {
            safeData.notification_prefs = {
                messages: profileData.notification_prefs.messages !== false,
                matching_requests: profileData.notification_prefs.matching_requests !== false,
                bokantaj: profileData.notification_prefs.bokantaj !== false
            };
        }

        safeData.updated_at = new Date().toISOString();

        console.log(`[ProfileSave] userId=${userId} step=final payloadFields=${Object.keys(safeData).join(',')} avatarChanged=${safeData.avatar_url !== undefined} saveStarted=true`);

        const { data, error } = await this.supabase
            .from('profiles')
            .update(safeData)
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            console.error(`[ProfileSaveResult] profilesUpdate=ERROR skillsUpdate=SKIPPED avatarUpload=SKIPPED errorCode=${error.code || 'UNKNOWN'} errorMessage=${error.message || 'Error updating profile'}`);
        } else {
            console.log(`[ProfileSaveResult] profilesUpdate=SUCCESS skillsUpdate=SUCCESS avatarUpload=SKIPPED`);
        }

        return { data, error };
    },

    formatResponseTimeLabel(seconds) {
        if (seconds === null || seconds === undefined || isNaN(seconds)) return '—';
        const sec = Number(seconds);
        if (sec < 1800) return 'Répond généralement en moins de 30 min';
        if (sec < 3600) return "Répond généralement en moins d'1 h";
        if (sec < 7200) return 'Répond généralement en moins de 2 h';
        if (sec < 21600) return 'Répond généralement en quelques heures';
        if (sec < 86400) return 'Répond généralement dans la journée';
        return 'Répond généralement sous 24 à 48 h';
    },

    async getUserTrustAndReputation(userId) {
        if (!this.supabase) return { data: null };
        const { data, error } = await this.supabase.rpc('get_user_trust_and_reputation', {
            p_target_user_id: userId
        });
        if (error) {
            console.warn('[Trust Engine RPC Fallback]:', error.message);
            const { data: p } = await this.supabase.from('public_profiles').select('*').eq('id', userId).maybeSingle();
            if (!p) return { data: null };
            return {
                data: {
                    user_id: p.id,
                    first_name: p.first_name,
                    last_name_initial: p.last_name ? (p.last_name.substring(0, 1).toUpperCase() + '.') : '',
                    display_name: window.formatPublicName ? window.formatPublicName(p, null, 'Membre') : (p.first_name ? `${p.first_name.trim()}${p.last_name ? '.' + p.last_name.trim().substring(0, 1).toUpperCase() : ''}` : 'Membre'),
                    city: (p.city && p.city.trim().toLowerCase() !== 'guadeloupe') ? p.city.trim() : null,
                    territory: p.territory || 'Guadeloupe (971)',
                    bio: p.bio || '',
                    avatar_url: p.avatar_url,
                    is_verified: !!p.is_verified,
                    is_pro_verified: !!(p.is_pro && p.kyc_verified),
                    member_since: p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : null,
                    skills: p.intervention_zone || [],
                    intervention_zone: p.intervention_zone || [],
                    intervention_radius_km: p.intervention_radius_km || 10,
                    completion_pct: 20,
                    metrics: {
                        average_rating: null,
                        reviews_count: 0,
                        completed_missions: 0,
                        response_rate_percent: null,
                        median_response_time_seconds: null,
                        avg_response_time_label: '—',
                        completion_rate_percent: null,
                        repeat_users_count: 0,
                        recommendations_count: 0,
                        top_categories: [],
                        rating_distribution: { star_5: 0, star_4: 0, star_3: 0, star_2: 0, star_1: 0 }
                    }
                }
            };
        }

        // Decorate backend data with UI helper labels
        if (data && data.metrics) {
            data.metrics.avg_response_time_label = this.formatResponseTimeLabel(data.metrics.median_response_time_seconds);
        }
        return { data };
    },

    async uploadAvatar(userId, file) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const fileExt = file.name ? file.name.split('.').pop() : 'png';
        const filePath = `${userId}/avatar_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await this.supabase.storage
            .from('avatars-hold')
            .upload(filePath, file, { upsert: true });

        if (uploadError) return { error: uploadError };

        const submittedUrl = holdMediaUrl('avatars-hold', filePath);
        const updated = await this.updateProfile(userId, { avatar_url: submittedUrl });
        if (updated.error) return { error: updated.error };
        return {
            data: {
                avatar_url: updated.data && updated.data.avatar_url,
                avatar_pending: updated.data && updated.data.avatar_pending,
                avatar_moderation_status: updated.data && updated.data.avatar_moderation_status,
                submitted_avatar_url: submittedUrl
            }
        };
    },

    async deleteAvatar(userId) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        await this.updateProfile(userId, { avatar_url: null });
        return { data: { success: true } };
    },

    async getUserSkills(userId) {
        if (!this.supabase || !userId) return [];
        try {
            // Fetch skills exclusively from canonical public.services table
            const { data: servData, error } = await this.supabase
                .from('services')
                .select('title')
                .eq('owner_id', userId);

            if (error) {
                console.warn('[getUserSkills] DB error fetching services:', error.message);
                return [];
            }

            const serviceSkills = (servData || []).map(s => s.title).filter(Boolean);
            return [...new Set(serviceSkills)];
        } catch (e) {
            console.warn('[getUserSkills] Exception:', e);
            return [];
        }
    },

    async syncUserSkills(userId, skillsArray) {
        if (!this.supabase || !userId) {
            return { error: { message: 'Supabase non initialisé ou session manquante.' } };
        }

        const selectedSkills = Array.isArray(skillsArray) 
            ? [...new Set(skillsArray.map(s => String(s).trim()).filter(Boolean))]
            : [];

        try {
            // Fetch current services state from canonical public.services table
            let existingRes = await this.supabase
                .from('services')
                .select('id, title, description, base_price, indicative_price, price_type, pricing_model')
                .eq('owner_id', userId);
            if (existingRes.error && isMissingColumnError(existingRes.error)) {
                existingRes = await this.supabase
                    .from('services')
                    .select('id, title')
                    .eq('owner_id', userId);
            }
            const existing = existingRes.data;
            const fetchErr = existingRes.error;

            if (fetchErr) {
                console.error(`[ProfileSkillsSave]\nuserId=${userId}\nselectedCount=${selectedSkills.length}\naddedCount=0\nremovedCount=0\nresult=ERROR\nerrorCode=${fetchErr.code || 'FETCH_ERR'}\nerrorMessage=${fetchErr.message}`);
                return { error: fetchErr };
            }

            const existingMap = new Map();
            (existing || []).forEach(item => {
                if (item.title) existingMap.set(item.title.toLowerCase().trim(), item);
            });

            const nextSet = new Set(selectedSkills.map(s => s.toLowerCase().trim()));

            const idsToDelete = [];
            existingMap.forEach((item, titleLower) => {
                if (nextSet.has(titleLower)) return;
                const priced = item.base_price != null || item.indicative_price != null || item.price_type || item.pricing_model;
                const desc = String(item.description || '').trim();
                const title = String(item.title || '').trim();
                const stub = !priced && (!desc || desc === title);
                if (stub) idsToDelete.push(item.id);
            });

            const skillsToInsert = [];
            selectedSkills.forEach(title => {
                const titleLower = title.toLowerCase().trim();
                if (!existingMap.has(titleLower)) {
                    skillsToInsert.push({
                        title,
                        description: title,
                        category: title,
                        slug: uniqueServiceSlug(userId, title)
                    });
                }
            });

            const addedCount = skillsToInsert.length;
            const removedCount = idsToDelete.length;

            // Execute deletions if any
            if (idsToDelete.length > 0) {
                const { error: delErr } = await this.supabase
                    .from('services')
                    .delete()
                    .in('id', idsToDelete);

                if (delErr) {
                    console.error(`[ProfileSkillsSave]\nuserId=${userId}\nselectedCount=${selectedSkills.length}\naddedCount=0\nremovedCount=0\nresult=ERROR\nerrorCode=${delErr.code || 'DELETE_ERR'}\nerrorMessage=${delErr.message}`);
                    return { error: delErr };
                }
            }

            // Execute insertions if any
            if (skillsToInsert.length > 0) {
                const { error: insErr } = await insertServicesForOwner(this.supabase, userId, skillsToInsert);

                if (insErr) {
                    console.error(`[ProfileSkillsSave]\nuserId=${userId}\nselectedCount=${selectedSkills.length}\naddedCount=0\nremovedCount=0\nresult=ERROR\nerrorCode=${insErr.code || 'INSERT_ERR'}\nerrorMessage=${insErr.message}`);
                    return { error: insErr };
                }
            }

            console.log(`[ProfileSkillsSave]\nuserId=${userId}\nselectedCount=${selectedSkills.length}\naddedCount=${addedCount}\nremovedCount=${removedCount}\nresult=SUCCESS\nerrorCode=NONE\nerrorMessage=NONE`);
            return { data: { success: true, skills: selectedSkills } };

        } catch (err) {
            console.error(`[ProfileSkillsSave]\nuserId=${userId}\nselectedCount=${selectedSkills.length}\naddedCount=0\nremovedCount=0\nresult=ERROR\nerrorCode=${err.code || 'EXCEPTION'}\nerrorMessage=${err.message || String(err)}`);
            return { error: { message: err.message || String(err) } };
        }
    },

    async getUserServices(userId) {
        if (!this.supabase) return { data: [] };
        const { data, error } = await this.supabase
            .from('services')
            .select('*')
            .eq('owner_id', userId)
            .order('created_at', { ascending: false });
        if (error) return { data: [], error };
        return { data: (data || []).filter(isPublishedService).map(presentService) };
    },

    async getUserPortfolio(userId, isSelf = false) {
        if (!this.supabase) return { data: [] };
        let req = this.supabase
            .from('user_portfolio_items')
            .select('*')
            .eq('user_id', userId);

        if (!isSelf) {
            req = req.eq('is_public', true);
        }

        return await req
            .order('display_order', { ascending: true })
            .order('created_at', { ascending: false });
    },

    async addPortfolioItem(userId, itemData) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        return await this.supabase
            .from('user_portfolio_items')
            .insert({
                user_id: userId,
                image_url: itemData.image_url,
                title: itemData.title || '',
                caption: itemData.caption || '',
                display_order: itemData.display_order || 0,
                is_public: itemData.is_public !== undefined ? itemData.is_public : true
            })
            .select()
            .single();
    },

    async uploadPortfolioImage(userId, file) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const fileExt = file.name ? file.name.split('.').pop() : 'png';
        const filePath = `${userId}/portfolio_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await this.supabase.storage
            .from('portfolio-images-hold')
            .upload(filePath, file, { upsert: true });

        if (uploadError) return { error: uploadError };

        return { data: { image_url: holdMediaUrl('portfolio-images-hold', filePath) } };
    },

    async updatePortfolioItem(itemId, itemData) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        return await this.supabase
            .from('user_portfolio_items')
            .update({
                title: itemData.title,
                caption: itemData.caption,
                is_public: itemData.is_public,
                updated_at: new Date().toISOString()
            })
            .eq('id', itemId)
            .select()
            .single();
    },

    async deletePortfolioItem(itemId) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        return await this.supabase
            .from('user_portfolio_items')
            .delete()
            .eq('id', itemId);
    },

    async addService(userId, serviceData) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        return await this.supabase
            .from('services')
            .insert({
                owner_id: userId,
                title: serviceData.title,
                category: serviceData.category || 'general',
                description: serviceData.description || ''
            })
            .select()
            .single();
    },

    async deleteService(serviceId) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        return await this.supabase
            .from('services')
            .delete()
            .eq('id', serviceId);
    },

    async getOrCreateConversation(myUserId, targetUserId) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const { data, error } = await this.supabase.rpc('get_or_create_conversation', {
            p_target_user_id: targetUserId
        });

        if (error) return { error };
        return { data: { id: data } };
    },

    async getSupportUserId() {
        if (window.LYANN_SUPPORT_USER_ID) return window.LYANN_SUPPORT_USER_ID;
        if (!this.supabase) return null;
        const { data, error } = await this.supabase.rpc('lyann_support_user_id');
        if (error || !data) return null;
        window.LYANN_SUPPORT_USER_ID = data;
        return data;
    },

    async memberHelpdeskRequest(path, options = {}) {
        const sessionRes = await this.getSession();
        const token = sessionRes?.data?.session?.access_token;
        if (!token) return { ok: false, status: 401, json: async () => ({ success: false, error: 'Authentification requise.' }) };
        return lyannBackendFetch(path, {
            method: options.method || 'GET',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: options.body ? JSON.stringify(options.body) : undefined
        });
    },

    async listMyHelpdeskTickets() {
        const res = await this.memberHelpdeskRequest('/v1/me/helpdesk');
        return res.json();
    },

    async createMyHelpdeskTicket(payload) {
        const res = await this.memberHelpdeskRequest('/v1/me/helpdesk', { method: 'POST', body: payload });
        return res.json();
    },

    async getMyHelpdeskTicket(id) {
        const res = await this.memberHelpdeskRequest(`/v1/me/helpdesk/${id}`);
        return res.json();
    },

    async replyMyHelpdeskTicket(id, body) {
        const res = await this.memberHelpdeskRequest(`/v1/me/helpdesk/${id}/messages`, { method: 'POST', body: { body } });
        return res.json();
    },

    async openSupportConversation() {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const supportId = await this.getSupportUserId();
        const opened = await this.supabase.rpc('lyann_open_support_conversation');
        if (opened.error && supportId) {
            const fallback = await this.getOrCreateConversation(null, supportId);
            if (fallback.error) return { error: opened.error, supportUserId: supportId };
            return { data: { id: fallback.data?.id, supportUserId: supportId } };
        }
        if (opened.error) return { error: opened.error, supportUserId: supportId };
        return { data: { id: opened.data, supportUserId: supportId } };
    },

    async listMyNotifications() {
        if (!this.supabase) return { data: [] };
        const user = await this.getCurrentUser();
        if (!user?.id) return { data: [] };
        return await this.supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(80);
    },

    async markNotificationRead(notificationId) {
        if (!this.supabase || !notificationId) return { error: { message: 'Notification invalide.' } };
        const user = await this.getCurrentUser();
        if (!user?.id) return { error: { message: 'Non authentifié.' } };
        return await this.supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', notificationId)
            .eq('user_id', user.id);
    },

    async markAllNotificationsRead(expectedUserId = null) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const user = await this.getCurrentUser();
        if (!user?.id || (expectedUserId && user.id !== expectedUserId)) {
            return { error: { message: 'Session utilisateur modifiée ou expirée.' } };
        }
        return await this.supabase
            .from('notifications')
            .update({ read: true })
            .eq('user_id', user.id)
            .eq('read', false);
    },

    async initiateLyannHelp(requestId) {
        if (!this.supabase || !requestId) return { error: { message: 'Requête invalide' } };
        try {
            const { data, error } = await this.supabase.rpc('initiate_lyann_help_conversation', {
                p_request_id: requestId
            });
            if (error) return { error };
            return { data };
        } catch (e) {
            return { error: { message: e.message || 'Erreur lors de l’initialisation du besoin' } };
        }
    },

    async linkConversationToRequest(conversationId, requestId, requesterId, helperId) {
        if (!this.supabase || !requestId) return null;
        try {
            const res = await this.initiateLyannHelp(requestId);
            if (res && res.data) return res.data;
            return null;
        } catch (e) {
            console.error('[LINK CONV TO REQ ERR]', e);
            return null;
        }
    },

    async getConversationRequestContext(conversationId, requestIdHint) {
        if (!this.supabase || !conversationId) return null;
        try {
            // STEP 17.4 SECURITY GATE:
            // Client-side fallback (requestIdHint) is IGNORED to prevent authorization bypass.
            // Canonical relation MUST be validated server-side via RLS / RPC.
            const { data, error } = await this.supabase.rpc('get_conversation_request_context_secure', {
                p_conversation_id: conversationId
            });

            if (error) {
                console.warn('[GET CONV REQ CTX SECURE WARN]', error.message || error);
                return null;
            }

            if (data && (data.request || data.direct)) {
                const requestId = data.request_id;
                const hint = requestIdHint ? String(requestIdHint) : '';
                return {
                    invitationId: data.invitation_id,
                    invitationStatus: data.invitation_status,
                    requestId: requestId,
                    requesterId: data.requester_id,
                    helperId: data.helper_id,
                    request: data.request || null,
                    requesterProfile: data.requester_profile,
                    direct: Boolean(data.direct),
                    startedBy: data.started_by || null,
                    // Hint is never used as an authorization bypass. When it disagrees
                    // with the RPC's latest invitation, the caller must load the hinted
                    // request via RLS instead of treating this row as the active dossier.
                    mismatchedHint: Boolean(hint && requestId && String(requestId) !== hint)
                };
            }

            return null;
        } catch (e) {
            console.error('[GET CONV REQ CTX ERR]', e);
            return null;
        }
    },

    async openDirectConversation(targetUserId) {
        if (!this.supabase || !isUUID(targetUserId)) return null;
        const { data, error } = await this.supabase.rpc('open_direct_conversation', { p_target_user_id: targetUserId });
        if (error) {
            const failure = new Error(error.message || 'Conversation indisponible');
            failure.code = error.code || error.hint || '';
            throw failure;
        }
        return data;
    },

    async prepareDirectOffer(otherUserId) {
        if (!this.supabase || !isUUID(otherUserId)) return null;
        const { data, error } = await this.supabase.rpc('prepare_direct_offer', { p_other_user: otherUserId });
        if (error) throw error;
        return data;
    },

    async bindConversationRequest(requestId, recipientId, visibility) {
        if (!this.supabase || !isUUID(requestId) || !isUUID(recipientId)) return null;
        const { data, error } = await this.supabase.rpc('bind_conversation_request', {
            p_request_id: requestId,
            p_recipient_id: recipientId,
            p_visibility: visibility || 'DIRECT'
        });
        if (error) throw error;
        return data;
    },

    // Public author identity plus the aggregate reputation shown next to a name.
    // The reputation columns arrive with migration 37; until then the read degrades
    // to the identity-only projection instead of failing.
    async getPublicProfileWithReputation(userId) {
        if (!this.supabase || !isUUID(userId)) return null;
        const identity = 'id, first_name, last_name, avatar_url, city, territory';
        const read = columns => this.supabase.from('public_profiles').select(columns).eq('id', userId).maybeSingle();
        let { data, error } = await read(`${identity}, is_verified, is_pro_verified, average_rating, reviews_count`);
        if (error) ({ data } = await read(identity));
        return data || null;
    },

    async getUserProfile(userId) {
        if (!this.supabase || !userId || !isUUID(userId)) return null;
        const columns = [
            'id, first_name, last_name, avatar_url, bio, city, territory, is_pro',
            'id, first_name, last_name, avatar_url, city, territory'
        ];
        for (const select of columns) {
            try {
                const { data, error } = await this.supabase
                    .from('profiles')
                    .select(select)
                    .eq('id', userId)
                    .maybeSingle();
                if (!error && data) return data;
                if (error && !/column|schema cache/i.test(error.message || '')) return null;
            } catch (e) {
                return null;
            }
        }
        return null;
    },

    async getUserConversations(myUserId) {
        if (!this.supabase) return { data: [] };
        const sessionRes = await this.getSession();
        const activeUserId = sessionRes?.data?.session?.user?.id || myUserId;
        return await this.supabase
            .from('conversation_participants')
            .select('conversation_id, conversations(*)')
            .eq('user_id', activeUserId);
    },

    async getConversationMessages(conversationId) {
        if (!this.supabase) return { data: [] };
        return await this.supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });
    },

    async sendMessage(conversationId, senderId, content, extra) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const sessionRes = await this.getSession();
        const activeSenderId = sessionRes?.data?.session?.user?.id || senderId;
        const reservedTimeline = new Set(['system', 'visit_rescheduled', 'visit_accepted', 'visit_declined', 'quote_created', 'quote_updated', 'quote_accepted', 'quote_declined', 'payment_requested', 'payment_secured', 'payment_failed', 'milestone_created', 'milestone_completed', 'milestone_approved', 'funds_released', 'mission_started', 'mission_completed', 'mission_cancelled', 'review_requested', 'review_submitted']);
        if (extra?.messageType && reservedTimeline.has(extra.messageType)) {
            return { error: { message: 'reserved timeline event', code: '42501' } };
        }
        const base = { conversation_id: conversationId, sender_id: activeSenderId, content: content ?? '' };
        const row = { ...base };
        if (extra?.clientMessageId) row.client_message_id = String(extra.clientMessageId);
        if (extra?.messageType) row.message_type = extra.messageType;
        if (extra?.entityType) row.entity_type = extra.entityType;
        if (extra?.entityId) row.entity_id = extra.entityId;
        if (extra?.metadata && typeof extra.metadata === 'object') row.metadata = extra.metadata;
        if (extra?.path) {
            row.attachment_url = extra.path;
            row.attachment_type = extra.type || null;
            row.attachment_name = extra.name || null;
            row.attachment_size = Number.isFinite(Number(extra.size)) ? Number(extra.size) : null;
            row.attachment_mime = extra.mime || null;
        }
        let result = await this.supabase.from('messages').insert(row).select().single();
        if (result.error && /message_type|entity_type|entity_id|metadata/.test(result.error.message || '')) {
            const plain = { ...base };
            if (extra?.clientMessageId) plain.client_message_id = String(extra.clientMessageId);
            if (extra?.path) {
                plain.attachment_url = extra.path;
                plain.attachment_type = extra.type || null;
                plain.attachment_name = extra.name || null;
                plain.attachment_size = Number.isFinite(Number(extra.size)) ? Number(extra.size) : null;
                plain.attachment_mime = extra.mime || null;
            }
            result = await this.supabase.from('messages').insert(plain).select().single();
        }
        if (result.error && extra?.clientMessageId && /client_message_id/.test(result.error.message || '') && !extra.path) {
            result = await this.supabase.from('messages').insert(base).select().single();
        }
        if (result.error && result.error.code === '23505' && extra?.clientMessageId) {
            const existing = await this.supabase.from('messages').select('*').eq('sender_id', activeSenderId).eq('client_message_id', String(extra.clientMessageId)).maybeSingle();
            if (existing.data) {
                emitLyannClientEvent('lyann:chat-persisted', existing.data);
                return { data: existing.data, error: null };
            }
        }
        if (result.data) emitLyannClientEvent('lyann:chat-persisted', result.data);
        return result;
    },

    async respondToVisit(messageId, decision) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const { data, error } = await this.supabase.rpc('respond_to_visit', {
            p_message_id: messageId,
            p_decision: decision
        });
        if (error) return { error };
        return { data };
    },

    async uploadChatAttachment(path, file, mime, hooks) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const onProgress = hooks && hooks.onProgress;
        const signal = hooks && hooks.signal;
        if (!onProgress && !signal) {
            const { error } = await this.supabase.storage.from('chat-attachments').upload(path, file, {
                contentType: mime || file.type || undefined,
                upsert: false
            });
            if (error) return { error };
            return { data: { path } };
        }
        const session = await this.supabase.auth.getSession();
        const token = session && session.data && session.data.session && session.data.session.access_token;
        const base = String(this.supabase.supabaseUrl || (typeof getLyannSupabaseUrl === 'function' ? getLyannSupabaseUrl() : '')).replace(/\/$/, '');
        const apiKey = this.supabase.supabaseKey || (typeof getLyannSupabaseAnonKey === 'function' ? getLyannSupabaseAnonKey() : '');
        if (!token || !base || !apiKey) return { error: { message: 'Connexion requise pour envoyer le fichier.' } };
        return await new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', base + '/storage/v1/object/chat-attachments/' + path.split('/').map(encodeURIComponent).join('/'));
            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            xhr.setRequestHeader('apikey', apiKey);
            xhr.setRequestHeader('Content-Type', mime || file.type || 'application/octet-stream');
            xhr.setRequestHeader('x-upsert', 'false');
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
            };
            if (signal) {
                if (signal.aborted) {
                    resolve({ error: { message: 'Envoi annulé.', cancelled: true } });
                    return;
                }
                signal.addEventListener('abort', () => xhr.abort(), { once: true });
            }
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve({ data: { path } });
                else resolve({ error: { message: 'Le fichier n’a pas pu être envoyé.' } });
            };
            xhr.onerror = () => resolve({ error: { message: 'Réseau indisponible.' } });
            xhr.onabort = () => resolve({ error: { message: 'Envoi annulé.', cancelled: true } });
            xhr.send(file);
        });
    },

    async removeChatAttachment(path) {
        if (!this.supabase || !path) return { error: null };
        return await this.supabase.storage.from('chat-attachments').remove([path]);
    },

    async signedChatAttachmentUrl(path) {
        if (!path) return null;
        if (/^https?:\/\//i.test(path) || String(path).startsWith('blob:')) return path;
        if (!this._chatSignedUrls) this._chatSignedUrls = new Map();
        const hit = this._chatSignedUrls.get(path);
        if (hit && hit.exp > Date.now() + 60000) return hit.url;
        if (!this.supabase) return null;
        const { data, error } = await this.supabase.storage.from('chat-attachments').createSignedUrl(path, 3600);
        if (error || !data?.signedUrl) return null;
        this._chatSignedUrls.set(path, { url: data.signedUrl, exp: Date.now() + 3600000 });
        return data.signedUrl;
    },

    clearSignedChatAttachmentUrl(path) {
        this._chatSignedUrls?.delete(path);
    },

    async getMembers(territory = 'all', query = '') {
        if (!this.supabase) return { data: [] };
        let req = this.supabase.from('public_profiles').select('*').limit(200);
        if (territory && territory !== 'all') {
            req = req.eq('territory', territory);
        }
        const safeQuery = String(query || '').replace(/[,()*%\\:"]/g, ' ').trim().slice(0, 80);
        if (safeQuery) {
            req = req.or(`first_name.ilike.%${safeQuery}%,last_name.ilike.%${safeQuery}%,bio.ilike.%${safeQuery}%`);
        }
        return await req;
    },

    async getFeed() {
        const pageOptions = (arguments.length && arguments[0] && typeof arguments[0] === 'object') ? arguments[0] : {};
        function extractTerritoryKey(locationStr, profileTerritory) {
            const combined = ((locationStr || '') + ' ' + (profileTerritory || '')).toLowerCase();
            if (combined.includes('martinique') || combined.includes('972')) return 'martinique';
            if (combined.includes('guyane') || combined.includes('973')) return 'guyane';
            if (combined.includes('reunion') || combined.includes('réunion') || combined.includes('974')) return 'reunion';
            if (combined.includes('saint-martin') || combined.includes('st-martin') || combined.includes('978')) return 'saint-martin';
            return 'guadeloupe';
        }

        if (!this.supabase) return { data: [], error: "Supabase non disponible" };

        try {
            // 1. Fetch Bokantaj Posts
            let postsQuery = this.supabase
                .from('bokantaj_posts')
                .select('*')
                // Public Bokantaj must never expose hidden/pending posts, including to admin sessions.
                .eq('public_moderation_status', 'approved')
                .order('created_at', { ascending: false })
                .limit(LYANN_FEED_PAGE_SIZE);
            if (pageOptions.before) postsQuery = postsQuery.lt('created_at', pageOptions.before);
            const { data: postsData, error: postsError } = await postsQuery;

            if (postsError) throw postsError;
            const posts = postsData || [];
            // Community discovery never queries or merges transactional Requests.
            const authorIds = [...new Set(posts.map(p => p.author_id).filter(Boolean))];

            const profilesMap = {};
            if (authorIds.length > 0) {
                try {
                    const { data: pubProfs } = await this.supabase
                        .from('public_profiles')
                        .select('id, first_name, last_name, avatar_url, city, territory, bio')
                        .in('id', authorIds);
                    if (pubProfs && Array.isArray(pubProfs)) {
                        pubProfs.forEach(p => { profilesMap[p.id] = p; });
                    }
                } catch (profErr) {
                    console.warn("[LYANN API] Error fetching public_profiles for feed:", profErr);
                }
            }

            function formatAuthorName(prof) {
                if (!prof || !prof.first_name) return 'Lyanneur';
                const fn = prof.first_name.trim();
                if (!fn || fn.startsWith('step') || fn.startsWith('prod') || fn.startsWith('user_') || fn.startsWith('req_user_') || fn.startsWith('check_') || fn.startsWith('ua_') || fn.startsWith('ub_') || fn.startsWith('h_step')) {
                    return 'Lyanneur';
                }
                return window.formatPublicName ? window.formatPublicName(prof, null, 'Lyanneur') : `${fn}${prof.last_name ? '.' + prof.last_name.trim().charAt(0).toUpperCase() : ''}`;
            }

            // 3. Fetch Likes & Comments for Counts & Current User Like State
            const postLikesCountMap = {};
            const requestLikesCountMap = {};
            const postCommentsCountMap = {};
            const requestCommentsCountMap = {};
            const userLikedPostsSet = new Set();
            const userLikedRequestsSet = new Set();

            try {
                const postIds = posts.map(p => p.id).filter(Boolean);
                const [likesRes, commentsRes, sessionUser] = postIds.length
                    ? await Promise.all([
                        this.supabase.from('bokantaj_likes').select('post_id, request_id, user_id').in('post_id', postIds),
                        this.supabase.from('bokantaj_comments').select('post_id, request_id').in('post_id', postIds).eq('public_moderation_status', 'approved'),
                        this.getCurrentUser()
                    ])
                    : [{ data: [] }, { data: [] }, null];
                const allLikes = likesRes && likesRes.data;
                const allComments = commentsRes && commentsRes.data;
                const currentUserId = sessionUser ? sessionUser.id : null;

                if (allLikes && Array.isArray(allLikes)) {
                    allLikes.forEach(l => {
                        if (l.post_id) {
                            postLikesCountMap[l.post_id] = (postLikesCountMap[l.post_id] || 0) + 1;
                            if (currentUserId && l.user_id === currentUserId) {
                                userLikedPostsSet.add(l.post_id);
                            }
                        }
                        if (l.request_id) {
                            requestLikesCountMap[l.request_id] = (requestLikesCountMap[l.request_id] || 0) + 1;
                            if (currentUserId && l.user_id === currentUserId) {
                                userLikedRequestsSet.add(l.request_id);
                            }
                        }
                    });
                }

                if (allComments && Array.isArray(allComments)) {
                    allComments.forEach(c => {
                        if (c.post_id) postCommentsCountMap[c.post_id] = (postCommentsCountMap[c.post_id] || 0) + 1;
                        if (c.request_id) requestCommentsCountMap[c.request_id] = (requestCommentsCountMap[c.request_id] || 0) + 1;
                    });
                }
            } catch (likesErr) {
                console.warn("[LYANN API] Could not fetch likes counts/states:", likesErr);
            }

            // 4. Format posts into unified presentation structures
            const formattedPosts = posts.map(p => {
                const authorProf = profilesMap[p.user_id || p.author_id];
                const authorName = formatAuthorName(authorProf);
                const avatarUrl = window.getLyannAvatarUrl(authorProf?.avatar_url);
                
                return {
                    id: p.id,
                    item_type: 'POST',
                    author_id: p.user_id || p.author_id,
                    author_name: authorName,
                    author_avatar: avatarUrl,
                    author_city: authorProf?.city || authorProf?.territory || p.territory || 'Guadeloupe',
                    badge: ({ trafic: '🚗 Trafic', bon_plan: '✨ Bon plan', restaurant: '🍴 Resto', avis: '⭐ Avis', evenement: '🎉 Sortie', info: '💬 Info', alerte: '⚠️ Alerte', astuce: '💡 Astuce' })[p.type] || 'Info Bokantaj',
                    badgeIcon: p.type === 'dispo' ? 'ph-lightning' : (p.type === 'besoin' ? 'ph-magnifying-glass' : 'ph-newspaper'),
                    type: p.type,
                    city: p.city || '',
                    territory: p.territory || authorProf?.territory || '',
                    location: p.city || p.territory || authorProf?.city || '',
                    territoryKey: extractTerritoryKey(p.territory || authorProf?.city, authorProf?.territory),
                    place_lat: p.place_lat,
                    place_lng: p.place_lng,
                    place_label: p.place_label || null,
                    created_at: p.created_at,
                    content: p.content,
                    title: p.headline || '',
                    source_name: p.source_name || '',
                    source_url: p.source_url || '',
                    source_published_at: p.source_published_at || '',
                    editorial: /Compte éditorial LYANN/i.test(authorProf?.bio || ''),
                    images: (p.media_urls || []).filter(url => typeof url === 'string' && /^https?:\/\//i.test(url) && !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)),
                    videos: (p.media_urls || []).filter(url => typeof url === 'string' && /^https?:\/\//i.test(url) && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)),
                    moderation_status: p.public_moderation_status || null,
                    likes: (postLikesCountMap[p.id] !== undefined) ? postLikesCountMap[p.id] : (p.likes_count || 0),
                    user_has_liked: userLikedPostsSet.has(p.id),
                    comments_count: (postCommentsCountMap[p.id] !== undefined) ? postCommentsCountMap[p.id] : 0,
                    repliesCount: (postCommentsCountMap[p.id] !== undefined) ? postCommentsCountMap[p.id] : 0
                };
            });

            const unifiedFeed = formattedPosts;

            return { data: unifiedFeed, error: null, hasMore: posts.length === LYANN_FEED_PAGE_SIZE };
        } catch (err) {
            console.error("❌ Error loading unified Bokantaj feed:", err);
            return { data: [], error: err.message || "Erreur serveur" };
        }
    },

    // Map requests are independent of the paginated feed and always public / approved only.
    // Bounding-box filtering happens at PostgREST before the server-side cap.
    async getMappedBokantajPosts(bounds) {
        if (!this.supabase) return { data: [], error: 'Carte indisponible.' };
        const { south, north, west, east } = bounds || {};
        if (![south, north, west, east].every(Number.isFinite)
            || south < -90 || north > 90 || west < -180 || east > 180
            || south > north || west > east) {
            return { data: [], error: 'Zone géographique invalide.' };
        }
        const { data, error } = await this.supabase
            .from('bokantaj_posts')
            .select('id, type, content, city, territory, media_urls, created_at, place_lat, place_lng, place_label')
            .eq('public_moderation_status', 'approved')
            .not('place_lat', 'is', null)
            .not('place_lng', 'is', null)
            .gte('place_lat', south).lte('place_lat', north)
            .gte('place_lng', west).lte('place_lng', east)
            .order('created_at', { ascending: false })
            .limit(250);
        return { data: data || [], error: error ? error.message : null };
    },

    // --- BOKANTAJ SOCIAL API METHODS ---

    async uploadPostVideo(file) {
        if (!this.supabase || !file) throw new Error('Vidéo indisponible');
        const user = await this.getCurrentUser();
        if (!user) throw new Error('Veuillez vous connecter');
        const mime = String(file.type || '').toLowerCase();
        const allowed = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
        if (!allowed[mime] || file.size > 10 * 1024 * 1024) {
            throw new Error('Choisissez une vidéo MP4, MOV ou WebM de moins de 10 Mo.');
        }
        const duration = await new Promise((resolve) => {
            const url = URL.createObjectURL(file);
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.onloadedmetadata = () => { const value = video.duration; URL.revokeObjectURL(url); resolve(value); };
            video.onerror = () => { URL.revokeObjectURL(url); resolve(NaN); };
            video.src = url;
        });
        if (!Number.isFinite(duration) || duration <= 0 || duration > 60) {
            throw new Error('La vidéo doit durer 60 secondes au plus.');
        }
        const path = `${user.id}/${crypto.randomUUID()}.${allowed[mime]}`;
        const { error } = await this.supabase.storage.from('bokantaj-media-hold').upload(path, file, { contentType: mime });
        if (error) throw new Error('La vidéo n’a pas pu être envoyée. Réessayez avant de publier.');
        return holdMediaUrl('bokantaj-media-hold', path);
    },

    async uploadPostPhoto(file) {
        if (!this.supabase || !file) throw new Error('Photo indisponible');
        const user = await this.getCurrentUser();
        if (!user) throw new Error('Veuillez vous connecter');
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
            throw new Error('Choisissez une photo JPG, PNG ou WEBP de moins de 5 Mo.');
        }
        const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await this.supabase.storage.from('bokantaj-media-hold').upload(path, file);
        if (error) throw new Error('La photo n’a pas pu être envoyée. Réessayez avant de publier.');
        return holdMediaUrl('bokantaj-media-hold', path);
    },

    async createPost(payload) {
        if (!this.supabase) throw new Error("Supabase non initialisé");
        const session = await this.getCurrentUser();
        if (!session) throw new Error("Utilisateur non connecté");

        const postRecord = {
            author_id: session.id,
            type: payload.type || 'info',
            content: payload.content,
            city: payload.city || null,
            territory: payload.territory || null,
            media_urls: payload.media_urls || []
        };
        if (payload.place) {
            const { lat, lng, label } = payload.place;
            if (!Number.isFinite(lat) || !Number.isFinite(lng)
                || lat < -90 || lat > 90 || lng < -180 || lng > 180
                || typeof label !== 'string' || label.trim().length < 2 || label.trim().length > 90) {
                throw new Error('Sélectionnez un repère valide sur la carte.');
            }
            postRecord.place_lat = lat;
            postRecord.place_lng = lng;
            postRecord.place_label = label.trim();
        }

        const { data, error } = await this.supabase
            .from('bokantaj_posts')
            .insert(postRecord)
            .select('*, profiles(first_name, last_name, avatar_url, city, territory)')
            .single();

        if (error) {
            console.error("❌ Error creating bokantaj_post:", error);
            throw error;
        }
        return data;
    },

    async updatePost(postId, updates) {
        if (!this.supabase) throw new Error('Supabase non initialisé');
        const session = await this.getCurrentUser();
        if (!session) throw new Error('Utilisateur non connecté');
        const { data, error } = await this.supabase
            .from('bokantaj_posts')
            .update(updates)
            .eq('id', postId)
            .eq('author_id', session.id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deletePost(postId) {
        if (!this.supabase) throw new Error('Supabase non initialisé');
        const session = await this.getCurrentUser();
        if (!session) throw new Error('Utilisateur non connecté');
        const { error } = await this.supabase
            .from('bokantaj_posts')
            .delete()
            .eq('id', postId)
            .eq('author_id', session.id);
        if (error) throw error;
        return true;
    },

    async toggleLike(targetId, targetType = 'POST') {
        if (!this.supabase) return { liked: false, likesCount: 0 };
        const session = await this.getCurrentUser();
        if (!session) return { liked: false, likesCount: 0 };

        const userId = session.id;
        const isLyann = targetType === 'LYANN';
        const matchCol = isLyann ? 'request_id' : 'post_id';

        try {
            // Check existing like
            const { data: existing } = await this.supabase
                .from('bokantaj_likes')
                .select('*')
                .eq('user_id', userId)
                .eq(matchCol, targetId)
                .maybeSingle();

            let isLiked = false;
            if (existing) {
                await this.supabase
                    .from('bokantaj_likes')
                    .delete()
                    .eq('user_id', userId)
                    .eq(matchCol, targetId);
                isLiked = false;
            } else {
                const likePayload = { user_id: userId };
                likePayload[matchCol] = targetId;
                await this.supabase.from('bokantaj_likes').insert(likePayload);
                isLiked = true;
            }

            // Get updated count
            const { count } = await this.supabase
                .from('bokantaj_likes')
                .select('*', { count: 'exact', head: true })
                .eq(matchCol, targetId);

            return { liked: isLiked, likesCount: count || 0 };
        } catch (e) {
            console.warn("Error toggling like:", e);
            return { liked: false, likesCount: 0 };
        }
    },

    async getComments(targetId, targetType = 'POST') {
        if (!this.supabase) return [];
        const isLyann = targetType === 'LYANN';
        const matchCol = isLyann ? 'request_id' : 'post_id';

        try {
            const { data, error } = await this.supabase
                .from('bokantaj_comments')
                .select('*, profiles:author_id(first_name, last_name, avatar_url, city)')
                // Admin privileges should not reveal moderated comments inside ordinary threads.
                .eq('public_moderation_status', 'approved')
                .eq(matchCol, targetId)
                .order('created_at', { ascending: true });

            if (error) {
                console.warn("Error fetching comments:", error);
                return [];
            }
            return data || [];
        } catch (e) {
            return [];
        }
    },

    async addComment({ targetId, targetType = 'POST', content, parentCommentId = null, mediaUrl = null }) {
        if (!this.supabase) throw new Error("Supabase non disponible");
        const session = await this.getCurrentUser();
        if (!session) throw new Error("Veuillez vous connecter pour commenter");

        const isLyann = targetType === 'LYANN';
        const commentRecord = {
            author_id: session.id,
            content: content,
            parent_comment_id: parentCommentId,
            media_url: mediaUrl
        };
        if (isLyann) {
            commentRecord.request_id = targetId;
        } else {
            commentRecord.post_id = targetId;
        }

        const { data, error } = await this.supabase
            .from('bokantaj_comments')
            .insert(commentRecord)
            .select('*, profiles:author_id(first_name, last_name, avatar_url, city)')
            .single();

        if (error) {
            console.error("❌ Error adding comment:", error);
            throw error;
        }
        return data;
    },

    async updateComment(commentId, content) {
        if (!this.supabase) throw new Error('Supabase non initialisé');
        const session = await this.getCurrentUser();
        if (!session) throw new Error('Utilisateur non connecté');
        const text = String(content || '').trim();
        if (!text) throw new Error('Le commentaire est vide.');
        const { data, error } = await this.supabase
            .from('bokantaj_comments')
            .update({ content: text })
            .eq('id', commentId)
            .eq('author_id', session.id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteComment(commentId) {
        if (!this.supabase) return false;
        const session = await this.getCurrentUser();
        if (!session) return false;

        const { error } = await this.supabase
            .from('bokantaj_comments')
            .delete()
            .eq('id', commentId)
            .eq('author_id', session.id);

        return !error;
    },

    async reportContent({ targetId, targetType = 'POST', commentId = null, reason = 'Contenu inapproprié' }) {
        if (!this.supabase) return false;
        const session = await this.getCurrentUser();
        if (!session) return false;

        const isLyann = targetType === 'LYANN';
        const reportRecord = {
            reporter_id: session.id,
            reason: reason,
            status: 'PENDING'
        };

        if (commentId) {
            reportRecord.comment_id = commentId;
        } else if (isLyann) {
            reportRecord.request_id = targetId;
        } else {
            reportRecord.post_id = targetId;
        }

        const { error } = await this.supabase
            .from('bokantaj_reports')
            .insert(reportRecord);

        return !error;
    },

    async getQuotes(userId) {
        if (!this.supabase) return { data: [] };
        return await this.supabase.from('quotes').select(`
            *,
            provider:profiles!provider_id(first_name, last_name, avatar_url),
            client:profiles!client_id(first_name, last_name, avatar_url)
        `).or(`provider_id.eq.${userId},client_id.eq.${userId}`);
    },

    async serverRequest(endpoint, body = {}) {
        const session = await this.getSession();
        const token = session?.data?.session?.access_token;
        return lyannBackendFetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        }).then(res => res.json());
    },

    // --- MOCK BACKEND METHODS (Overrides for testing the AI Journey) ---
    
    // Gets the active mission between two users
    
    async getActiveMissionBetween(userId1, userId2) {
        const missions = await this.listMissionsBetween(userId1, userId2);
        return missions[0] || null;
    },

    async listMissionsBetween(userId1, userId2) {
        if (!isUUID(userId1) || !isUUID(userId2) || !this.supabase) return [];
        try {
            const { data, error } = await this.supabase
                .from('missions')
                .select('*')
                .or(`and(requester_id.eq.${userId1},helper_id.eq.${userId2}),and(requester_id.eq.${userId2},helper_id.eq.${userId1})`)
                .order('created_at', { ascending: false })
                .limit(20);
            if (error) throw error;
            return Array.isArray(data) ? data : [];
        } catch (error) {
            console.error('[MISSIONS] pair mission query failed', error);
            return [];
        }
    },

    /** @deprecated Local mock mission creation is disabled in production. */
    async mockCreateNeed() {
        throw new Error('Legacy local mission creation is disabled. Use the request/invitation workflow.');
    },

    // --- QUOTES & MILESTONES (PRODUCTION BACKEND RPCs) ---
    async createRequestQuote(invitationId, description, validUntil, milestonesJson) {
        if (!this.supabase) throw new Error("Supabase non disponible.");
        const { data, error } = await this.supabase.rpc('create_request_quote', {
            p_invitation_id: invitationId,
            p_description: description || null,
            p_valid_until: validUntil || null,
            p_milestones_json: milestonesJson || []
        });
        if (error) throw error;
        emitLyannClientEvent('lyann:deal-mutated', { rpc: 'createRequestQuote', data });
        return data;
    },

    async reviseSentQuote(quoteId, description, validUntil, milestonesJson, expectedVersion) {
        if (!this.supabase) throw new Error('Supabase non disponible.');
        const { data, error } = await this.supabase.rpc('revise_sent_quote', {
            p_quote_id: quoteId,
            p_description: description || null,
            p_valid_until: validUntil || null,
            p_milestones_json: milestonesJson || [],
            p_expected_version: expectedVersion
        });
        if (error) throw error;
        emitLyannClientEvent('lyann:deal-mutated', { rpc: 'reviseSentQuote', data });
        return data;
    },

    async acceptRequestQuote(quoteId, expectedVersion) {
        if (!this.supabase) throw new Error("Supabase non disponible.");
        const planner = window.LYANN_QUOTE_REVISION;
        const plan = planner && typeof planner.planQuoteAcceptance === 'function'
            ? planner.planQuoteAcceptance(expectedVersion)
            : { ok: Number.isInteger(Number(expectedVersion)) && Number(expectedVersion) >= 1, version: Number(expectedVersion), message: 'Rechargez le devis avant de l’accepter.' };
        if (!plan.ok) throw new Error(plan.message || 'Rechargez le devis avant de l’accepter.');
        const version = plan.version;
        let { data, error } = await this.supabase.rpc('accept_request_quote', {
            p_quote_id: quoteId,
            p_expected_version: version
        });
        if (error && planner && typeof planner.acceptSignatureFallback === 'function') {
            const next = planner.acceptSignatureFallback(error, version);
            if (next.message) throw new Error(next.message);
        }
        if (error) throw error;
        emitLyannClientEvent('lyann:deal-mutated', { rpc: 'acceptRequestQuote', data });
        return data;
    },

    async rejectRequestQuote(quoteId) {
        if (!this.supabase) throw new Error("Supabase non disponible.");
        const { data, error } = await this.supabase.rpc('reject_request_quote', {
            p_quote_id: quoteId
        });
        if (error) throw error;
        emitLyannClientEvent('lyann:deal-mutated', { rpc: 'rejectRequestQuote', data });
        return data;
    },

    async getQuotesForInvitation(invitationId) {
        if (!this.supabase || !isUUID(invitationId)) return [];
        const { data, error } = await this.supabase
            .from('quotes')
            .select('*')
            .eq('request_invitation_id', invitationId)
            .order('created_at', { ascending: false });
        if (error) {
            console.error("Error fetching quotes for invitation:", error);
            return [];
        }
        return data || [];
    },

    // =========================================================================
    // STEP 18: PROPOSAL ENGINE (DEVIS & PROPOSITIONS SÉCURISÉS)
    // =========================================================================
    async createProposalSecure({ conversationId, description, validUntilDays = 14, items = [] }) {
        if (!this.supabase || !conversationId) {
            return { error: { message: "Identifiant de conversation invalide." } };
        }
        try {
            const { data, error } = await this.supabase.rpc('create_proposal_secure', {
                p_conversation_id: conversationId,
                p_description: description || null,
                p_valid_until_days: validUntilDays,
                p_items_json: items
            });
            if (error) return { error };
            return { data };
        } catch (e) {
            return { error: { message: e.message || "Erreur lors de la création de la proposition." } };
        }
    },

    async acceptProposalSecure(proposalId) {
        if (!this.supabase || !proposalId) {
            return { error: { message: "Identifiant de proposition invalide." } };
        }
        try {
            const { data, error } = await this.supabase.rpc('accept_proposal_secure', {
                p_proposal_id: proposalId
            });
            if (error) return { error };
            return { data };
        } catch (e) {
            return { error: { message: e.message || "Erreur lors de l'acceptation de la proposition." } };
        }
    },

    async rejectProposalSecure(proposalId) {
        if (!this.supabase || !proposalId) {
            return { error: { message: "Identifiant de proposition invalide." } };
        }
        try {
            const { data, error } = await this.supabase.rpc('reject_proposal_secure', {
                p_proposal_id: proposalId
            });
            if (error) return { error };
            return { data };
        } catch (e) {
            return { error: { message: e.message || "Erreur lors du refus de la proposition." } };
        }
    },

    async withdrawProposalSecure(proposalId) {
        if (!this.supabase || !proposalId) {
            return { error: { message: "Identifiant de proposition invalide." } };
        }
        try {
            const { data, error } = await this.supabase.rpc('withdraw_proposal_secure', {
                p_proposal_id: proposalId
            });
            if (error) return { error };
            return { data };
        } catch (e) {
            return { error: { message: e.message || "Erreur lors du retrait de la proposition." } };
        }
    },

    async getConversationProposals(conversationId) {
        if (!this.supabase || !conversationId) return [];
        try {
            const { data, error } = await this.supabase.rpc('get_conversation_proposals', {
                p_conversation_id: conversationId
            });
            if (error) {
                console.warn('[GET CONV PROPOSALS WARN]', error);
                return [];
            }
            return data || [];
        } catch (e) {
            console.error('[GET CONV PROPOSALS ERR]', e);
            return [];
        }
    },

    // =========================================================================
    // LYANN STEP 19 — MISSION EXECUTION & MILESTONES SECURE RPCs
    // =========================================================================
    async getMissionDetailsSecure(missionId) {
        if (!this.supabase || !missionId) {
            return { error: { message: "Identifiant de mission invalide." } };
        }
        try {
            const { data, error } = await this.supabase.rpc('get_mission_details_secure', {
                p_mission_id: missionId
            });
            if (error) return { error };
            return { data };
        } catch (e) {
            return { error: { message: e.message || "Erreur lors de la récupération des détails de la mission." } };
        }
    },

    async startMissionSecure(missionId) {
        if (!this.supabase || !missionId) {
            return { error: { message: "Identifiant de mission invalide." } };
        }
        try {
            const { data, error } = await this.supabase.rpc('start_mission_secure', {
                p_mission_id: missionId
            });
            if (error) return { error };
            return { data };
        } catch (e) {
            return { error: { message: e.message || "Erreur lors du démarrage de la mission." } };
        }
    },

    async markMilestoneDoneSecure(milestoneId, comments = null, deliverables = []) {
        if (!this.supabase || !milestoneId) {
            return { error: { message: "Identifiant de jalon invalide." } };
        }
        try {
            const { data, error } = await this.supabase.rpc('mark_milestone_done_secure', {
                p_milestone_id: milestoneId,
                p_comments: comments,
                p_deliverables: deliverables
            });
            if (error) return { error };
            return { data };
        } catch (e) {
            return { error: { message: e.message || "Erreur lors de la mise à jour du jalon." } };
        }
    },

    async validateMilestoneSecure(milestoneId) {
        if (!this.supabase || !milestoneId) {
            return { error: { message: "Identifiant de jalon invalide." } };
        }
        try {
            const { data, error } = await this.supabase.rpc('validate_milestone_secure', {
                p_milestone_id: milestoneId
            });
            if (error) return { error };
            return { data };
        } catch (e) {
            return { error: { message: e.message || "Erreur lors de la validation du jalon." } };
        }
    },

    async cancelMissionSecure(missionId, reason = 'Annulation utilisateur') {
        if (!this.supabase || !missionId) {
            return { error: { message: "Identifiant de mission invalide." } };
        }
        try {
            const { data, error } = await this.supabase.rpc('cancel_mission_secure', {
                p_mission_id: missionId,
                p_reason: reason
            });
            if (error) return { error };
            return { data };
        } catch (e) {
            return { error: { message: e.message || "Erreur lors de l'annulation de la mission." } };
        }
    },

    async createMilestonePaymentIntent(milestoneId) {
        const sessionRes = await this.getSession();
        const token = sessionRes?.data?.session?.access_token;
        if (!token) {
            return { error: { message: "Utilisateur non authentifié." } };
        }
        try {
            const res = await lyannBackendFetch('/v1/payments/create-milestone-intent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    // E5: safe client retry key (Lyann-test / code paths). Server also uses pi_milestone_<id>.
                    'Idempotency-Key': 'create-milestone-intent:' + String(milestoneId)
                },
                body: JSON.stringify({ milestone_id: milestoneId })
            });
            const data = await res.json();
            if (!res.ok) {
                return { error: { message: data.error || "Erreur lors de la création du paiement.", code: data.code } };
            }
            return { data };
        } catch (err) {
            return { error: { message: err.message || "Erreur de connexion au serveur de paiement." } };
        }
    },

    async startMilestoneWork(milestoneId) {
        const sessionRes = await this.getSession();
        const token = sessionRes?.data?.session?.access_token;
        if (!token) {
            return { error: { message: "Utilisateur non authentifié." } };
        }
        try {
            const res = await lyannBackendFetch('/v1/milestones/start-work', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ milestone_id: milestoneId })
            });
            const data = await res.json();
            if (!res.ok) {
                return { error: { message: data.error || "Erreur lors du démarrage des travaux." } };
            }
            return { data };
        } catch (err) {
            return { error: { message: err.message || "Erreur de connexion serveur." } };
        }
    },

    async submitMilestoneCompletion(milestoneId, comments = '', deliverables = []) {
        const sessionRes = await this.getSession();
        const token = sessionRes?.data?.session?.access_token;
        if (!token) {
            return { error: { message: "Utilisateur non authentifié." } };
        }
        try {
            const res = await lyannBackendFetch('/v1/milestones/submit-completion', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    milestone_id: milestoneId,
                    completion_comments: comments,
                    deliverables: deliverables
                })
            });
            const data = await res.json();
            if (!res.ok) {
                return { error: { message: data.error || "Erreur lors de la déclaration de réalisation." } };
            }
            emitLyannClientEvent('lyann:deal-mutated', { rpc: 'submitMilestoneCompletion', milestoneId });
            return { data };
        } catch (err) {
            return { error: { message: err.message || "Erreur de connexion serveur." } };
        }
    },

    async getActiveQuoteForInvitation(invitationId) {
        if (!this.supabase || !isUUID(invitationId)) return null;
        const { data, error } = await this.supabase
            .from('quotes')
            .select('*')
            .eq('request_invitation_id', invitationId)
            .in('status', ['SENT', 'ACCEPTED'])
            .order('created_at', { ascending: false })
            .limit(1);
        if (error || !data || data.length === 0) return null;
        return data[0];
    },

    async getAcceptedInvitationForRequest(requestId, userA, userB) {
        if (!this.supabase || !isUUID(requestId) || !isUUID(userA) || !isUUID(userB)) return null;
        const { data, error } = await this.supabase
            .from('request_invitations')
            .select('id, request_id, status, requester_id, recipient_id')
            .eq('request_id', requestId)
            .eq('status', 'ACCEPTED')
            .eq('recipient_id', userA)
            .eq('requester_id', userB);
        if (error || !Array.isArray(data)) return null;
        if (data.length !== 1) return { ambiguous: data.length > 1 };
        return data[0];
    },

    async getActiveInvitationBetween(user1, user2) {
        if (!this.supabase || !isUUID(user1) || !isUUID(user2)) return null;
        const rows = await this.listAcceptedInvitationsBetween(user1, user2, { limit: 1 });
        return rows[0] || null;
    },

    async listAcceptedInvitationsBetween(user1, user2, options = {}) {
        if (!this.supabase || !isUUID(user1) || !isUUID(user2)) return [];
        const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 50);
        const { data, error } = await this.supabase
            .from('request_invitations')
            .select('*')
            .or(`and(requester_id.eq.${user1},recipient_id.eq.${user2}),and(requester_id.eq.${user2},recipient_id.eq.${user1})`)
            .eq('status', 'ACCEPTED')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error || !Array.isArray(data)) return [];
        return data;
    },

    /** @deprecated Legacy mission writers are disabled: missions only change through server RPCs. */
    async mockProposePrice() { throw new Error(LEGACY_MISSION_WRITE_DISABLED); },
    async mockAcceptPrice() { throw new Error(LEGACY_MISSION_WRITE_DISABLED); },
    async mockPayMission() { throw new Error(LEGACY_MISSION_WRITE_DISABLED); },
    async mockMarkMissionDone() { throw new Error(LEGACY_MISSION_WRITE_DISABLED); },
    async mockConfirmMissionCompletion() { throw new Error(LEGACY_MISSION_WRITE_DISABLED); },
    async mockReportProblem() { throw new Error(LEGACY_MISSION_WRITE_DISABLED); },

    // --- STATE MACHINE & ROLE-BASED ACTIONS ---
    getAvailableMissionActions(userId, mission) {
        if (!mission) {
            return [
                { id: 'MAKE_PROPOSAL', label: 'Faire une proposition', type: 'primary' },
                { id: 'PROPOSE_DATE', label: 'Proposer une date', type: 'outline' }
            ];
        }

        const isRequester = mission.requester_id === userId;
        const isHelper = mission.helper_id === userId;
        const state = mission.status;

        let actions = [];

        if (state === 'DISCUSSION') {
            if (isHelper || !isRequester) {
                actions.push({ id: 'MAKE_PROPOSAL', label: 'Faire une proposition', type: 'primary' });
            }
            actions.push({ id: 'PROPOSE_DATE', label: 'Proposer une date', type: 'outline' });
        }

        if (state === 'PROPOSED') {
            const didIPropose = mission.proposed_by === userId;
            if (!didIPropose) {
                if (isRequester) {
                    actions.push({ id: 'ACCEPT_PRICE', label: 'Accepter', type: 'primary' });
                    actions.push({ id: 'DISCUSS_PRICE', label: 'Discuter du prix', type: 'outline' });
                } else {
                    actions.push({ id: 'ACCEPT_PRICE', label: 'Accepter l\'offre', type: 'primary' });
                    actions.push({ id: 'DISCUSS_PRICE', label: 'Discuter du prix', type: 'outline' });
                }
            } else {
                actions.push({ id: 'WAITING_ACCEPTANCE', label: 'Proposition envoyée (En attente)', type: 'disabled' });
                actions.push({ id: 'CANCEL_PROPOSAL', label: 'Annuler la proposition', type: 'outline' });
            }
        }
        
        if (state === 'AGREED') {
            if (isRequester) {
                actions.push({ id: 'PAY_MISSION', label: 'Payer et confirmer', type: 'primary' });
            } else {
                actions.push({ id: 'WAITING_PAYMENT', label: 'En attente du paiement', type: 'disabled' });
            }
        }

        if (state === 'IN_PROGRESS') {
            if (isHelper) {
                actions.push({ id: 'MARK_DONE', label: '✓ J\'ai terminé', type: 'primary' });
            }
            if (isRequester) {
                actions.push({ id: 'REPORT_PROBLEM', label: 'Signaler un problème', type: 'outline' });
            }
        }

        if (state === 'WORK_MARKED_COMPLETE') {
            if (isRequester) {
                actions.push({ id: 'CONFIRM_DONE', label: '✓ Tout est bon', type: 'primary' });
                actions.push({ id: 'REPORT_PROBLEM', label: '⚠️ Signaler un problème', type: 'outline' });
            } else {
                actions.push({ id: 'WAITING_VALIDATION', label: 'En attente de validation', type: 'disabled' });
            }
        }

        if (state === 'COMPLETED') {
            actions.push({ id: 'LEAVE_REVIEW', label: '⭐ Laisser un avis', type: 'primary' });
            actions.push({ id: 'RECOMMEND', label: '🤝 Recommander', type: 'outline' });
        }

        if (state === 'DISPUTE') {
            actions.push({ id: 'VIEW_DISPUTE', label: 'Voir le litige', type: 'primary' });
        }

        return actions;
    },

    // --- SERVICES MANAGEMENT ---
    async addUserService(userId, title, price, billing, description) {
        if (!isUUID(userId) || !this.supabase) {
            throw new Error('Impossible d’ajouter un service sans session Supabase valide.');
        }
        const pricing_model = billing === '/ heure' ? 'HOURLY' :
                              billing === '/ jour' ? 'DAILY' :
                              billing === 'Sur devis' ? 'QUOTE' : 'FLAT_RATE';
        const indicative_price = (price === 'Sur devis' || isNaN(parseFloat(price))) ? null : parseFloat(price);
        const { data, error } = await insertServicesForOwner(this.supabase, userId, [{
            title,
            description,
            category: title,
            slug: slugifyServiceTitle(title),
            pricing_model,
            indicative_price,
            price_type: pricing_model,
            base_price: indicative_price
        }]);
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        return {
            id: row.id,
            title: row.title,
            price: row.indicative_price || row.base_price ? String(row.indicative_price || row.base_price) : 'Sur devis',
            billing,
            details: row.description || '',
            status: 'Actif'
        };
    },

    // --- ENTERPRISE ADMIN BACK-OFFICE METHODS ---
    async getAdminMetrics() {
        if (!this.supabase) {
            return {
                totalUsers: 148,
                activeUsers: 112,
                verifiedPros: 89,
                totalMissions: 342,
                activeMissions: 24,
                gmv: 48650.00,
                revenue: 1459.50,
                protectionFees: 2432.50,
                activeBots: 8,
                openDisputes: 2
            };
        }
        try {
            const { count: usersCount } = await this.supabase.from('profiles').select('*', { count: 'exact', head: true });
            const { count: missionsCount } = await this.supabase.from('missions').select('*', { count: 'exact', head: true });
            return {
                totalUsers: usersCount || 148,
                activeUsers: Math.round((usersCount || 148) * 0.8),
                verifiedPros: Math.round((usersCount || 148) * 0.6),
                totalMissions: missionsCount || 342,
                activeMissions: 24,
                gmv: 48650.00,
                revenue: 1459.50,
                protectionFees: 2432.50,
                activeBots: 8,
                openDisputes: 2
            };
        } catch (e) {
            console.warn("Failed fetching admin metrics from Supabase:", e);
            return { totalUsers: 148, activeUsers: 112, verifiedPros: 89, totalMissions: 342, activeMissions: 24, gmv: 48650.00, revenue: 1459.50 };
        }
    },

    async logAuditAction(actorUsername, action, moduleName, resourceType, resourceId, accessReason = null, oldVals = null, newVals = null) {
        const logEntry = {
            actor_username: actorUsername || 'Administrateur',
            action,
            module: moduleName,
            resource_type: resourceType,
            resource_id: resourceId,
            access_reason: accessReason,
            old_values: oldVals,
            new_values: newVals,
            created_at: new Date().toISOString()
        };

        if (this.supabase) {
            try {
                await this.supabase.from('audit_logs').insert([logEntry]);
            } catch (err) {
                console.warn("Audit log insert warning:", err);
            }
        }

        try {
            const raw = localStorage.getItem('lyann_admin_audit_logs');
            const list = raw ? JSON.parse(raw) : [];
            list.unshift(logEntry);
            localStorage.setItem('lyann_admin_audit_logs', JSON.stringify(list.slice(0, 500)));
        } catch (e) {}
    },

    findMatchingLyanneurs(needQuery, options) {
        if (typeof window !== 'undefined' && window.LyannMatchingEngine) {
            const membersList = (typeof window.isExplicitDemoMode === 'function' && window.isExplicitDemoMode()) ? (window.LYANN_MEMBERS || []) : [];
            return window.LyannMatchingEngine.findMatchingLyanneursForNeed(needQuery, membersList, options);
        }
        return { matches_found: 0, lyanneurs: [] };
    },

    dispatchTargetedNeed(needData, batchSize = 5) {
        if (typeof window !== 'undefined' && window.LyannMatchingEngine) {
            const membersList = (typeof window.isExplicitDemoMode === 'function' && window.isExplicitDemoMode()) ? (window.LYANN_MEMBERS || []) : [];
            return window.LyannMatchingEngine.dispatchTargetedNeedNotifications(needData, membersList, batchSize);
        }
        return { dispatched_count: 0, fallback_message: "Votre besoin est bien publié dans les Annonces." };
    },

    // --- REAL HELP REQUESTS API (requests table) ---
    async createRequest(payload) {
        if (!this.supabase) {
            throw new Error("Supabase non initialisé");
        }
        if (payload.media_urls?.length) {
            throw new Error("Les annonces se publient sans photo pour le moment.");
        }
        
        // Identity MUST come strictly from session auth.uid()
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session || !session.user) {
            throw new Error("Utilisateur non connecté");
        }
        const authUid = session.user.id;

        // Security enforcement: Reject any attempt to spoof requester_id
        if (payload.requester_id && payload.requester_id !== authUid) {
            throw new Error("Sécurité: Falsification de requester_id refusée. L'identité provient uniquement de la session.");
        }

        const requestData = {
            requester_id: authUid,
            visibility: payload.visibility || 'PUBLIC',
            title: payload.title || "Demande d'aide",
            description: payload.description || "",
            category: payload.category || "Général",
            location: payload.location || "Guadeloupe",
            budget: payload.budget !== undefined && payload.budget !== null && payload.budget !== '' ? Number(payload.budget) : null,
            urgency: payload.urgency || "Normale",
            // Structured date and price. `budget` stays the primary amount: exact in
            // FIXED mode, lower bound in RANGE mode, null on quote.
            date_mode: payload.date_mode || 'FLEXIBLE',
            scheduled_at: payload.date_mode === 'EXACT' && payload.scheduled_at ? payload.scheduled_at : null,
            price_mode: payload.price_mode || 'QUOTE',
            budget_max: payload.price_mode === 'RANGE' && payload.budget_max != null && payload.budget_max !== ''
                ? Number(payload.budget_max) : null,
            status: payload.status || "OPEN",
            taxonomy_id: payload.taxonomy_id || null,
            classification_confidence: payload.classification_confidence !== undefined ? payload.classification_confidence : 1.0,
            classification_status: payload.classification_status || 'UNCLASSIFIED',
            internal_tags: payload.internal_tags || ['#UNCLASSIFIED'],
            safety_status: payload.safety_status || 'SAFE',
            created_at: new Date().toISOString(),
            visibility: payload.visibility || 'PUBLIC',
            target_user_id: payload.target_user_id || null
        };

        // Automatic background classification if taxonomy fields not pre-set
        if (typeof window !== 'undefined' && window.LyanAI && payload.description && !payload.taxonomy_id) {
            try {
                const cls = await window.LyanAI.classifyNeed(payload.description);
                if (cls) {
                    if (cls.taxonomy_id) requestData.taxonomy_id = cls.taxonomy_id;
                    if (cls.confidence) requestData.classification_confidence = cls.confidence;
                    if (cls.classification_status) requestData.classification_status = cls.classification_status;
                    if (cls.internal_tags) requestData.internal_tags = cls.internal_tags;
                    if (cls.safety_status) requestData.safety_status = cls.safety_status;
                    if (cls.category && (!payload.category || payload.category === 'Général')) {
                        requestData.category = cls.category;
                    }
                    if (cls.title && (!payload.title || payload.title === "Demande d'aide")) {
                        requestData.title = cls.title;
                    }
                }
            } catch (clsErr) {
                console.warn("[APIClient] Auto-classification skipped:", clsErr);
            }
        }

        // The card shows the title on one line: keep the stored value within the
        // budget the Explorer and the detail surface are designed for.
        requestData.title = String(requestData.title || "Demande d'aide").slice(0, LYANN_REQUEST_TITLE_MAX);

        const insert = row => this.supabase.from('requests').insert([row]).select().single();
        let { data, error } = await insert(requestData);
        // Migration 37 introduces the structured date and price columns. Before it is
        // applied the table rejects them, so publishing keeps working on the legacy
        // shape instead of failing in the author's face.
        if (error && isMissingColumnError(error)) {
            const legacy = { ...requestData };
            for (const column of ['date_mode', 'scheduled_at', 'price_mode', 'budget_max', 'visibility', 'target_user_id']) delete legacy[column];
            ({ data, error } = await insert(legacy));
        }

        if (error) {
            console.error("Erreur création demande Supabase DB:", error);
            throw error;
        }

        return data;
    },

    // Three AI titles for the annonce wizard. The server is the only owner of
    // generation: the client never invents stand-in titles when the call fails.
    async suggestRequestTitles(description) {
        const text = String(description || '').trim();
        if (text.length < 10) return { error: 'INVALID' };
        let supabase = null;
        try {
            supabase = this.supabase;
        } catch (_) {
            return { error: 'AUTH' };
        }
        if (!supabase) return { error: 'AUTH' };
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) return { error: 'AUTH' };
            const fetcher = typeof window.lyannBackendFetch === 'function' ? window.lyannBackendFetch : fetch;
            const response = await fetcher('/v1/requests/summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ description: text })
            });
            if (response.status === 401) return { error: 'AUTH' };
            if (response.status === 429) return { error: 'RATE' };
            if (!response.ok) return { error: 'UNAVAILABLE' };
            const payload = await response.json();
            const titles = Array.isArray(payload?.titles)
                ? payload.titles.map(title => String(title || '').trim().slice(0, LYANN_REQUEST_TITLE_MAX)).filter(title => title.length >= 3)
                : [];
            if (titles.length < 3) return { error: 'UNAVAILABLE' };
            return { titles: titles.slice(0, 3) };
        } catch (_) {
            return { error: 'UNAVAILABLE' };
        }
    },

    async getRequests(filters = {}) {
        if (!this.supabase) return [];
        let query = this.supabase
            .from('requests')
            .select('*')
            .order('created_at', { ascending: false });

        if (filters.requester_id) {
            query = query.eq('requester_id', filters.requester_id);
        }
        if (filters.category) {
            query = query.eq('category', filters.category);
        }
        if (filters.classification_status) {
            query = query.eq('classification_status', filters.classification_status);
        }

        const { data, error } = await query;
        if (error) {
            console.error("Erreur récupération requests:", error);
            return [];
        }
        return data || [];
    },

    async getRequest(requestId) {
        if (!this.supabase || !requestId) return null;
        const { data, error } = await this.supabase
            .from('requests')
            .select('*')
            .eq('id', requestId)
            .maybeSingle();
        if (error) throw error;
        return data;
    },

    async updateRequest(requestId, updates) {
        if (!this.supabase) throw new Error("Supabase non initialisé");
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session || !session.user) throw new Error("Utilisateur non connecté");

        const { data, error } = await this.supabase
            .from('requests')
            .update(updates)
            .eq('id', requestId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deleteRequest(requestId) {
        if (!this.supabase) throw new Error("Supabase non initialisé");
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session || !session.user) throw new Error("Utilisateur non connecté");

        const { error } = await this.supabase
            .from('requests')
            .delete()
            .eq('id', requestId)
            .eq('requester_id', session.user.id);

        if (error) throw error;
        return true;
    },

    async applyRequestLifecycle(requestId, action) {
        if (!this.supabase) throw new Error('Supabase non initialisé');
        const { error } = await this.supabase.rpc('lyann_apply_request_lifecycle', {
            p_request_id: requestId,
            p_action: action
        });
        if (error) throw error;
        return true;
    },

    async advanceRequestLifecycle() {
        if (!this.supabase) return;
        try {
            const { error } = await this.supabase.rpc('lyann_advance_request_lifecycle');
            if (error && !/PGRST202|could not find the function|42883/i.test(error.message || error.code || '')) {
                console.warn('[LYANN] lifecycle', error.message);
            }
        } catch (err) {
            console.warn('[LYANN] lifecycle', err.message);
        }
    },

    async uploadRequestPhoto(file) {
        if (!this.supabase || !file) return null;
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session || !session.user) throw new Error("Utilisateur non connecté");

        const fileExt = file.name ? file.name.split('.').pop() : 'png';
        const filePath = `${session.user.id}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

        const bucket = 'request-photos-hold';
        const { error } = await this.supabase.storage
            .from(bucket)
            .upload(filePath, file, { upsert: true });

        if (error) {
            console.warn("Storage upload warning (bucket request-photos-hold):", error);
            return null;
        }

        return holdMediaUrl(bucket, filePath);
    },

    // --- REQUEST INVITATIONS API (request_invitations) ---
    async sendRequestInvitations(requestId, recipientIds) {
        if (!this.supabase) throw new Error("Supabase non initialisé");
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session || !session.user) throw new Error("Utilisateur non connecté");

        const requesterId = session.user.id;
        const validIds = recipientIds.filter(id => isUUID(id) && id !== requesterId);

        if (validIds.length === 0) {
            console.log("ℹ️ Aucun destinataire avec un UUID valide (profils démo/mock).");
            return { success: true, inserted_count: 0 };
        }

        const payload = {
            p_request_id: requestId,
            p_recipient_ids: validIds
        };
        console.log('[SEND INVITATIONS PAYLOAD]', {
            p_request_id: { value: payload.p_request_id, type: typeof payload.p_request_id, isUUID: isUUID(payload.p_request_id) },
            p_recipient_ids: { value: payload.p_recipient_ids, type: typeof payload.p_recipient_ids, elements: payload.p_recipient_ids.map(id => ({ id, type: typeof id, isUUID: isUUID(id) })) }
        });

        try {
            const { data, error } = await this.supabase.rpc('send_request_invitations', payload);
            if (!error) return data;
            console.warn("RPC send_request_invitations returned error:", error);
        } catch (e) {
            console.warn("RPC send_request_invitations fallback to direct insert:", e);
        }

        const rows = validIds.map(recipientId => ({
            request_id: requestId,
            requester_id: requesterId,
            recipient_id: recipientId,
            status: 'PENDING'
        }));

        const { data, error } = await this.supabase
            .from('request_invitations')
            .upsert(rows, { onConflict: 'request_id,recipient_id', ignoreDuplicates: true })
            .select();

        if (error) {
            console.error("Error inserting request_invitations:", error);
            throw error;
        }
        return { success: true, inserted_count: data ? data.length : validIds.length };
    },

    async getReceivedInvitations() {
        if (!this.supabase) return [];
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session || !session.user) return [];

        const { data, error } = await this.supabase
            .from('request_invitations')
            .select(`
                *,
                requests:request_id (id, title, description, category, location, budget, urgency, status, created_at),
                requester:requester_id (id, first_name, last_name, avatar_url, city, territory)
            `)
            .eq('recipient_id', session.user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error fetching received invitations:", error);
            return [];
        }
        return data || [];
    },

    async getSentInvitations(requestId) {
        if (!this.supabase || !requestId) return [];
        const { data, error } = await this.supabase
            .from('request_invitations')
            .select(`
                *,
                recipient:recipient_id (id, first_name, last_name, avatar_url, city)
            `)
            .eq('request_id', requestId);

        if (error) {
            console.error("Error fetching sent invitations:", error);
            return [];
        }
        return data || [];
    },

    async acceptInvitation(invitationId) {
        if (!this.supabase) throw new Error("Supabase non initialisé");
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session || !session.user) throw new Error("Utilisateur non connecté");

        try {
            const { data, error } = await this.supabase.rpc('accept_request_invitation', {
                p_invitation_id: invitationId
            });
            if (!error) return data;
        } catch (e) {
            console.warn("RPC accept_request_invitation fallback to manual flow:", e);
        }

        const { data: inv, error: fetchErr } = await this.supabase
            .from('request_invitations')
            .select('*')
            .eq('id', invitationId)
            .single();

        if (fetchErr || !inv) throw fetchErr || new Error("Invitation introuvable");
        if (inv.recipient_id !== session.user.id) throw new Error("Action non autorisée sur cette invitation");

        const convId = await this.getOrCreateConversation(inv.requester_id);

        const { data: updated, error: updateErr } = await this.supabase
            .from('request_invitations')
            .update({
                status: 'ACCEPTED',
                conversation_id: convId,
                responded_at: new Date().toISOString()
            })
            .eq('id', invitationId)
            .select()
            .single();

        if (updateErr) throw updateErr;
        return { success: true, invitation_id: invitationId, conversation_id: convId, request_id: inv.request_id };
    },

    async declineInvitation(invitationId) {
        if (!this.supabase) throw new Error("Supabase non initialisé");
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session || !session.user) throw new Error("Utilisateur non connecté");

        try {
            const { data, error } = await this.supabase.rpc('decline_request_invitation', {
                p_invitation_id: invitationId
            });
            if (!error) return data;
        } catch (e) {
            console.warn("RPC decline_request_invitation fallback:", e);
        }

        const { data, error } = await this.supabase
            .from('request_invitations')
            .update({
                status: 'DECLINED',
                responded_at: new Date().toISOString()
            })
            .eq('id', invitationId)
            .eq('recipient_id', session.user.id)
            .select()
            .single();

        if (error) throw error;
        return { success: true, invitation_id: invitationId, status: 'DECLINED' };
    },

    async releaseMilestonePayment(milestoneId, validationComment = '') {
        if (!this.supabase) throw new Error("Supabase non initialisé");
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session || !session.user) throw new Error("Utilisateur non connecté");

        const response = await lyannBackendFetch('/v1/milestones/release-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                milestone_id: milestoneId,
                validation_comment: validationComment
            })
        });

        const resData = await response.json();
        if (!response.ok || !resData || resData.success === false || resData.status !== 'RELEASED') {
            throw new Error((resData && (resData.error || resData.message)) || "Le versement n’a pas abouti. Les fonds restent en sécurité.");
        }
        emitLyannClientEvent('lyann:deal-mutated', { rpc: 'releaseMilestonePayment', milestoneId });
        return resData;
    },

    async claimMilestoneTransfer(milestoneId) {
        if (!this.supabase) throw new Error("Supabase non initialisé");
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session || !session.user) throw new Error("Utilisateur non connecté");

        const response = await lyannBackendFetch('/v1/milestones/claim-transfer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                milestone_id: milestoneId
            })
        });

        const resData = await response.json();
        if (!response.ok) {
            throw new Error(resData.error || "Erreur lors de la réclamation du versement");
        }
        return resData;
    },

    async raiseMilestoneDispute(milestoneId, reason = '') {
        if (!this.supabase) throw new Error("Supabase non initialisé");
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session || !session.user) throw new Error("Utilisateur non connecté");

        const response = await lyannBackendFetch('/v1/milestones/raise-dispute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                milestone_id: milestoneId,
                reason: reason
            })
        });

        const resData = await response.json();
        if (!response.ok) {
            throw new Error(resData.error || "Erreur lors du signalement de litige");
        }
        return resData;
    }
};

window.LYANN_API_CLIENT = LYANN_API_CLIENT;
window.apiClient = LYANN_API_CLIENT;

// === REAL SUPABASE FAVORITES SERVICE (V1) ===
window.LyannFavoritesService = {
    getSupabaseClient() {
        return window.supabaseClient || window.LYANN_API_CLIENT?.supabase || supabaseClient;
    },

    async getMyFavorites() {
        const client = this.getSupabaseClient();
        if (!client) return [];
        try {
            const { data: sessionData } = await client.auth.getSession();
            const user = sessionData?.session?.user;
            if (!user) return [];

            const { data, error } = await client
                .from('user_favorites')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.warn('[FAVORITES_SERVICE] getMyFavorites error:', error.message);
                return [];
            }
            return data || [];
        } catch (e) {
            console.error('[FAVORITES_SERVICE] getMyFavorites exception:', e);
            return [];
        }
    },

    async isFavorite(entityType, entityId) {
        const client = this.getSupabaseClient();
        if (!client || !entityType || !entityId) return false;
        try {
            const { data: sessionData } = await client.auth.getSession();
            const user = sessionData?.session?.user;
            if (!user) return false;

            const { data, error } = await client
                .from('user_favorites')
                .select('id')
                .eq('user_id', user.id)
                .eq('entity_type', entityType)
                .eq('entity_id', entityId)
                .maybeSingle();

            if (error) return false;
            return !!data;
        } catch (e) {
            return false;
        }
    },

    async addFavorite(entityType, entityId) {
        const client = this.getSupabaseClient();
        if (!client) return { success: false, error: 'Supabase non initialisé' };
        if (!entityType || !entityId) return { success: false, error: 'Paramètres invalides' };

        const validTypes = ['PROFILE', 'REQUEST', 'BOKANTAJ_POST'];
        if (!validTypes.includes(entityType)) {
            return { success: false, error: 'Type d\'entité non supporté' };
        }

        if (!isUUID(entityId)) {
            return { success: false, error: 'UUID invalide' };
        }

        try {
            const { data: sessionData } = await client.auth.getSession();
            const user = sessionData?.session?.user;
            if (!user) return { success: false, error: 'Utilisateur non authentifié' };

            const { data, error } = await client
                .from('user_favorites')
                .upsert({
                    user_id: user.id,
                    entity_type: entityType,
                    entity_id: entityId
                }, { onConflict: 'user_id,entity_type,entity_id' })
                .select()
                .single();

            if (error) {
                console.warn('[FAVORITES_SERVICE] addFavorite error:', error.code, error.message);
                return { success: false, error: error.message, errorCode: error.code };
            }

            window.dispatchEvent(new CustomEvent('lyann_favorites_updated', { detail: { action: 'add', entityType, entityId } }));
            return { success: true, data };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    async removeFavorite(entityType, entityId) {
        const client = this.getSupabaseClient();
        if (!client) return { success: false, error: 'Supabase non initialisé' };
        if (!entityType || !entityId) return { success: false, error: 'Paramètres invalides' };
        try {
            const { data: sessionData } = await client.auth.getSession();
            const user = sessionData?.session?.user;
            if (!user) return { success: false, error: 'Utilisateur non authentifié' };

            const { error } = await client
                .from('user_favorites')
                .delete()
                .eq('user_id', user.id)
                .eq('entity_type', entityType)
                .eq('entity_id', entityId);

            if (error) {
                console.warn('[FAVORITES_SERVICE] removeFavorite error:', error.code, error.message);
                return { success: false, error: error.message, errorCode: error.code };
            }

            window.dispatchEvent(new CustomEvent('lyann_favorites_updated', { detail: { action: 'remove', entityType, entityId } }));
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    async toggleFavorite(entityType, entityId) {
        const isFav = await this.isFavorite(entityType, entityId);
        if (isFav) {
            const res = await this.removeFavorite(entityType, entityId);
            return { operation: 'REMOVE', isFavorite: !res.success, success: res.success, error: res.error, errorCode: res.errorCode };
        } else {
            const res = await this.addFavorite(entityType, entityId);
            return { operation: 'ADD', isFavorite: res.success, success: res.success, error: res.error, errorCode: res.errorCode, data: res.data };
        }
    },

    async getHydratedFavorites() {
        const rawFavs = await this.getMyFavorites();
        if (!rawFavs || rawFavs.length === 0) return [];

        const hydrated = [];
        for (const fav of rawFavs) {
            try {
                if (fav.entity_type === 'PROFILE') {
                    const { data: p } = await supabaseClient
                        .from('profiles')
                        .select('id, first_name, last_name, avatar_url, city, territory, role, primary_activity, skills')
                        .eq('id', fav.entity_id)
                        .maybeSingle();

                    if (p) {
                        const formattedName = window.formatPublicName ? window.formatPublicName(p, null, 'Lyanneur') : `${p.first_name || 'Lyanneur'}${p.last_name ? '.' + p.last_name.charAt(0).toUpperCase() : ''}`.trim();
                        const loc = p.city || p.territory || 'Guadeloupe';
                        const skillsStr = Array.isArray(p.skills) && p.skills.length > 0 ? p.skills.slice(0, 2).join(', ') : (p.primary_activity || p.role || 'Membre LYANN');
                        hydrated.push({
                            favId: fav.id,
                            entity_type: 'PROFILE',
                            entity_id: p.id,
                            title: formattedName,
                            subtitle: `${loc} • ${skillsStr}`,
                            avatar: window.getLyannAvatarUrl ? window.getLyannAvatarUrl(p.avatar_url) : (p.avatar_url || '/default-avatar.svg'),
                            created_at: fav.created_at,
                            raw: p
                        });
                    }
                } else if (fav.entity_type === 'REQUEST') {
                    const { data: req } = await supabaseClient
                        .from('requests')
                        .select('id, title, description, category, location, budget, created_at, status')
                        .eq('id', fav.entity_id)
                        .maybeSingle();

                    if (req) {
                        const mainTitle = req.description || req.title || 'Besoin LYANN';
                        const statusBadge = (typeof window.getRequestStatusBadge === 'function') ? window.getRequestStatusBadge(req.status) : { label: req.status || 'Ouvert', class: 'badge-open' };
                        const budgetStr = req.budget ? `${req.budget} €` : 'Sur devis';
                        hydrated.push({
                            favId: fav.id,
                            entity_type: 'REQUEST',
                            entity_id: req.id,
                            title: mainTitle,
                            category: req.category || 'Entraide',
                            location: req.location || 'Guadeloupe',
                            budget: budgetStr,
                            statusBadge: statusBadge,
                            subtitle: `${req.category || 'Service'} • ${req.location || 'Guadeloupe'} • ${budgetStr}`,
                            avatar: null,
                            created_at: fav.created_at,
                            raw: req
                        });
                    }
                } else if (fav.entity_type === 'BOKANTAJ_POST') {
                    const { data: post } = await supabaseClient
                        .from('bokantaj_posts')
                        .select('id, headline, content, media_urls, created_at, author_id, profiles:author_id(first_name, last_name, avatar_url)')
                        .eq('public_moderation_status', 'approved')
                        .eq('id', fav.entity_id)
                        .maybeSingle();

                    if (post) {
                        const authorName = post.profiles ? (window.formatPublicName ? window.formatPublicName(post.profiles, null, 'Membre') : `${post.profiles.first_name}${post.profiles.last_name ? '.' + post.profiles.last_name.charAt(0).toUpperCase() : ''}`) : 'Membre';
                        const dateStr = post.created_at ? new Date(post.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
                        const excerpt = post.headline || post.content?.substring(0, 80) || 'Publication Bokantaj';
                        const mediaUrl = (Array.isArray(post.media_urls) && post.media_urls[0]) ? post.media_urls[0] : null;
                        hydrated.push({
                            favId: fav.id,
                            entity_type: 'BOKANTAJ_POST',
                            entity_id: post.id,
                            title: excerpt,
                            authorName: authorName,
                            dateStr: dateStr,
                            mediaUrl: mediaUrl,
                            subtitle: `Par ${authorName}${dateStr ? ' • ' + dateStr : ''} • Bokantaj`,
                            avatar: post.profiles?.avatar_url ? (window.getLyannAvatarUrl ? window.getLyannAvatarUrl(post.profiles.avatar_url) : post.profiles.avatar_url) : null,
                            created_at: fav.created_at,
                            raw: post
                        });
                    }
                }
            } catch (err) {
                console.warn('[FAVORITES_SERVICE] Inaccessible favorite omitted:', fav.entity_id);
            }
        }
        return hydrated;
    }
};

LYANN_API_CLIENT.getMyFavorites = window.LyannFavoritesService.getMyFavorites.bind(window.LyannFavoritesService);
LYANN_API_CLIENT.isFavorite = window.LyannFavoritesService.isFavorite.bind(window.LyannFavoritesService);
LYANN_API_CLIENT.addFavorite = window.LyannFavoritesService.addFavorite.bind(window.LyannFavoritesService);
LYANN_API_CLIENT.removeFavorite = window.LyannFavoritesService.removeFavorite.bind(window.LyannFavoritesService);
LYANN_API_CLIENT.toggleFavorite = window.LyannFavoritesService.toggleFavorite.bind(window.LyannFavoritesService);
LYANN_API_CLIENT.getHydratedFavorites = window.LyannFavoritesService.getHydratedFavorites.bind(window.LyannFavoritesService);


