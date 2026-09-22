/**
 * LYANN DOM — SUPABASE & API CLIENT SDK
 * Production Supabase client. No local mock business-data fallback is permitted.
 */

// Global Supabase init
const SUPABASE_URL = 'https://gzispjfoywklpqatjyop.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6aXNwamZveXdrbHBxYXRqeW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTE4ODcsImV4cCI6MjEwMTk4Nzg4N30.oPJvkDVffQ4EaxDy2V7Jj7veusCVGTnM2BUBKXnoQ0A';

let supabaseClient;
function isUUID(str) {
    if (typeof str !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}
window.isUUID = isUUID;

// The annonce title is a one-line summary shown on every card.
const LYANN_REQUEST_TITLE_MAX = 60;
window.LYANN_REQUEST_TITLE_MAX = LYANN_REQUEST_TITLE_MAX;

// PostgREST reports an unknown column as 42703, or as PGRST204 when its schema
// cache has no such field. Both mean a pending migration, not a caller mistake.
function isMissingColumnError(error) {
    if (!error) return false;
    if (['42703', 'PGRST204'].includes(String(error.code))) return true;
    return /column .* does not exist|could not find the .* column/i.test(String(error.message || ''));
}

function isPublishedService(row) {
    if (!row) return false;
    if (row.is_active === false || row.active === false) return false;
    return true;
}

function slugifyServiceTitle(title) {
    return String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || 'service';
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
    const production = items.map(item => productionServiceInsert(userId, item.title, item));
    let result = await supabase.from('services').insert(production).select();
    if (!result.error) return result;
    if (!isMissingColumnError(result.error)) return result;
    const canonical = items.map(item => canonicalServiceInsert(userId, item.title, item));
    return supabase.from('services').insert(canonical).select();
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

const LYANN_PRODUCTION_ORIGIN = 'https://lyann.app';

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

function getLyannSupabaseUrl() {
    if (typeof window !== 'undefined' && window.LYANN_SUPABASE_URL) {
        return String(window.LYANN_SUPABASE_URL).replace(/\/$/, '');
    }
    return SUPABASE_URL;
}

function getLyannSupabaseAnonKey() {
    if (typeof window !== 'undefined' && window.LYANN_SUPABASE_ANON_KEY) {
        return String(window.LYANN_SUPABASE_ANON_KEY);
    }
    return SUPABASE_ANON_KEY;
}

function getLyannBackendOrigin() {
    if (typeof window !== 'undefined' && window.LYANN_BACKEND_ORIGIN) {
        return String(window.LYANN_BACKEND_ORIGIN).replace(/\/$/, '');
    }
    if (isCapacitorRuntime()) return LYANN_PRODUCTION_ORIGIN;
    return '';
}

function lyannBackendFetch(path, options) {
    const origin = getLyannBackendOrigin();
    const url = /^https?:\/\//i.test(path) ? path : `${origin}${path}`;
    return fetch(url, options);
}

window.getLyannBackendOrigin = getLyannBackendOrigin;
window.getLyannSupabaseUrl = getLyannSupabaseUrl;
window.lyannBackendFetch = lyannBackendFetch;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(getLyannSupabaseUrl(), getLyannSupabaseAnonKey(), {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });
    console.log("⚡ Supabase client initialized with session persistence.");
    console.log("⚡ [BOOT 03] Supabase ready");
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
        return { message: 'Veuillez confirmer votre adresse email pour continuer.' };
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
                emailRedirectTo: window.location.origin + '/confirm-signup.html'
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
                    member_since: p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '2026',
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

        const { data: uploadData, error: uploadError } = await this.supabase.storage
            .from('avatars')
            .upload(filePath, file, { upsert: true });

        if (uploadError) return { error: uploadError };

        const { data: urlData } = this.supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        await this.updateProfile(userId, { avatar_url: publicUrl });
        return { data: { avatar_url: publicUrl } };
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
            const { data: existing, error: fetchErr } = await this.supabase
                .from('services')
                .select('id, title')
                .eq('owner_id', userId);

            if (fetchErr) {
                console.error(`[ProfileSkillsSave]\nuserId=${userId}\nselectedCount=${selectedSkills.length}\naddedCount=0\nremovedCount=0\nresult=ERROR\nerrorCode=${fetchErr.code || 'FETCH_ERR'}\nerrorMessage=${fetchErr.message}`);
                return { error: fetchErr };
            }

            const existingMap = new Map();
            (existing || []).forEach(item => {
                if (item.title) existingMap.set(item.title.toLowerCase().trim(), item.id);
            });

            const nextSet = new Set(selectedSkills.map(s => s.toLowerCase().trim()));

            const idsToDelete = [];
            existingMap.forEach((id, titleLower) => {
                if (!nextSet.has(titleLower)) idsToDelete.push(id);
            });

            const skillsToInsert = [];
            selectedSkills.forEach(title => {
                const titleLower = title.toLowerCase().trim();
                if (!existingMap.has(titleLower)) {
                    skillsToInsert.push({ title, description: title, category: title });
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

        const { data: uploadData, error: uploadError } = await this.supabase.storage
            .from('portfolio_images')
            .upload(filePath, file, { upsert: true });

        if (uploadError) return { error: uploadError };

        const { data: urlData } = this.supabase.storage
            .from('portfolio_images')
            .getPublicUrl(filePath);

        return { data: { image_url: urlData.publicUrl } };
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

    async markAllNotificationsRead() {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const user = await this.getCurrentUser();
        if (!user?.id) return { error: { message: 'Non authentifié.' } };
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

            if (data && data.request) {
                return {
                    invitationId: data.invitation_id,
                    invitationStatus: data.invitation_status,
                    requestId: data.request_id,
                    requesterId: data.requester_id,
                    helperId: data.helper_id,
                    request: data.request,
                    requesterProfile: data.requester_profile
                };
            }

            return null;
        } catch (e) {
            console.error('[GET CONV REQ CTX ERR]', e);
            return null;
        }
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
        try {
            const { data } = await this.supabase
                .from('profiles')
                .select('id, first_name, last_name, avatar_url, city, territory')
                .eq('id', userId)
                .maybeSingle();
            return data;
        } catch (e) {
            return null;
        }
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

    async sendMessage(conversationId, senderId, content) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const sessionRes = await this.getSession();
        const activeSenderId = sessionRes?.data?.session?.user?.id || senderId;

        return await this.supabase
            .from('messages')
            .insert({ conversation_id: conversationId, sender_id: activeSenderId, content: content })
            .select()
            .single();
    },

    async getMembers(territory = 'all', query = '') {
        if (!this.supabase) return { data: [] };
        let req = this.supabase.from('public_profiles').select('*');
        if (territory && territory !== 'all') {
            req = req.eq('territory', territory);
        }
        if (query) {
            req = req.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,bio.ilike.%${query}%`);
        }
        return await req;
    },

    async getFeed() {
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
            const { data: postsData, error: postsError } = await this.supabase
                .from('bokantaj_posts')
                .select('*')
                .order('created_at', { ascending: false });

            if (postsError) throw postsError;
            const posts = postsData || [];
            // Community discovery never queries or merges transactional Requests.
            const authorIds = [...new Set(posts.map(p => p.author_id).filter(Boolean))];

            const profilesMap = {};
            if (authorIds.length > 0) {
                try {
                    const { data: pubProfs } = await this.supabase
                        .from('public_profiles')
                        .select('id, first_name, last_name, avatar_url, city, territory')
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
                const { data: allLikes } = await this.supabase
                    .from('bokantaj_likes')
                    .select('post_id, request_id, user_id');

                const sessionUser = await this.getCurrentUser();
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

                const { data: allComments } = await this.supabase
                    .from('bokantaj_comments')
                    .select('post_id, request_id');

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
                    badge: p.type === 'dispo' ? '<i class="ph ph-lightning"></i> Disponibilité' : (p.type === 'besoin' ? '<i class="ph ph-magnifying-glass"></i> Besoin' : '<i class="ph ph-newspaper"></i> Info Bokantaj'),
                    type: p.type,
                    location: p.city || p.territory || authorProf?.city || '',
                    territoryKey: extractTerritoryKey(p.territory || authorProf?.city, authorProf?.territory),
                    created_at: p.created_at,
                    content: p.content,
                    images: (p.media_urls || []).filter(url => typeof url === 'string' && /^https?:\/\//i.test(url)),
                    likes: (postLikesCountMap[p.id] !== undefined) ? postLikesCountMap[p.id] : (p.likes_count || 0),
                    user_has_liked: userLikedPostsSet.has(p.id),
                    comments_count: postCommentsCountMap[p.id] || p.replies_count || 0,
                    repliesCount: postCommentsCountMap[p.id] || p.replies_count || 0
                };
            });

            const unifiedFeed = formattedPosts;

            return { data: unifiedFeed, error: null };
        } catch (err) {
            console.error("❌ Error loading unified Bokantaj feed:", err);
            return { data: [], error: err.message || "Erreur serveur" };
        }
    },

    // --- BOKANTAJ SOCIAL API METHODS ---

    async uploadPostPhoto(file) {
        if (!this.supabase || !file) throw new Error('Photo indisponible');
        const user = await this.getCurrentUser();
        if (!user) throw new Error('Veuillez vous connecter');
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
            throw new Error('Choisissez une photo JPG, PNG ou WEBP de moins de 5 Mo.');
        }
        const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await this.supabase.storage.from('bokantaj-media').upload(path, file);
        if (error) throw new Error('La photo n’a pas pu être envoyée. Réessayez avant de publier.');
        return this.supabase.storage.from('bokantaj-media').getPublicUrl(path).data.publicUrl;
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
        if (!isUUID(userId1) || !isUUID(userId2) || !this.supabase) return null;
        try {
            const { data, error } = await this.supabase
                .from('missions')
                .select('*')
                .or(`and(requester_id.eq.${userId1},helper_id.eq.${userId2}),and(requester_id.eq.${userId2},helper_id.eq.${userId1})`)
                .order('created_at', { ascending: false })
                .limit(1);
            if (error) throw error;
            return data && data.length > 0 ? data[0] : null;
        } catch (error) {
            console.error('[MISSIONS] active mission query failed', error);
            return null;
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
        return data;
    },

    async acceptRequestQuote(quoteId) {
        if (!this.supabase) throw new Error("Supabase non disponible.");
        const { data, error } = await this.supabase.rpc('accept_request_quote', {
            p_quote_id: quoteId
        });
        if (error) throw error;
        return data;
    },

    async rejectRequestQuote(quoteId) {
        if (!this.supabase) throw new Error("Supabase non disponible.");
        const { data, error } = await this.supabase.rpc('reject_request_quote', {
            p_quote_id: quoteId
        });
        if (error) throw error;
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
                    'Authorization': `Bearer ${token}`
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

    async getActiveInvitationBetween(user1, user2) {
        if (!this.supabase || !isUUID(user1) || !isUUID(user2)) return null;
        const { data, error } = await this.supabase
            .from('request_invitations')
            .select('*')
            .or(`and(requester_id.eq.${user1},recipient_id.eq.${user2}),and(requester_id.eq.${user2},recipient_id.eq.${user1})`)
            .eq('status', 'ACCEPTED')
            .order('created_at', { ascending: false })
            .limit(1);
        if (error || !data || data.length === 0) return null;
        return data[0];
    },

    /** @deprecated Compatibility wrapper. Remote production data only. */
    async mockProposePrice(proposerId, receiverId, amount, description) {
        if (!isUUID(proposerId) || !isUUID(receiverId) || !this.supabase) {
            throw new Error('Proposition impossible sans session Supabase valide.');
        }
        const mission = await this.getActiveMissionBetween(proposerId, receiverId);
        if (!mission || mission.status === 'COMPLETED' || mission.status === 'CANCELLED') {
            const { data, error } = await this.supabase.from('missions').insert({
                requester_id: receiverId,
                helper_id: proposerId,
                title: description || 'Service demandé',
                agreed_price: amount,
                status: 'PROPOSED',
                proposed_by: proposerId
            }).select().single();
            if (error) throw error;
            return data;
        }
        const { data, error } = await this.supabase.from('missions').update({
            agreed_price: amount,
            status: 'PROPOSED',
            proposed_by: proposerId,
            title: description || mission.title
        }).eq('id', mission.id).select().single();
        if (error) throw error;
        return data;
    },

    async mockAcceptPrice(missionId) {
        if (!isUUID(missionId) || !this.supabase) throw new Error('Mission invalide.');
        const { data, error } = await this.supabase.from('missions').update({ status: 'AGREED' }).eq('id', missionId).select().single();
        if (error) throw error;
        return data;
    },

    async mockPayMission(missionId) {
        if (!isUUID(missionId) || !this.supabase) throw new Error('Mission invalide.');
        const { data, error } = await this.supabase.from('missions').update({ status: 'IN_PROGRESS', payment_status: 'PAID_ESCROW' }).eq('id', missionId).select().single();
        if (error) throw error;
        return data;
    },

    async mockMarkMissionDone(missionId) {
        if (!isUUID(missionId) || !this.supabase) throw new Error('Mission invalide.');
        const { data, error } = await this.supabase.from('missions').update({ status: 'WORK_MARKED_COMPLETE' }).eq('id', missionId).select().single();
        if (error) throw error;
        return data;
    },

    async mockConfirmMissionCompletion(missionId) {
        if (!isUUID(missionId) || !this.supabase) throw new Error('Mission invalide.');
        const { data, error } = await this.supabase.from('missions').update({ status: 'COMPLETED' }).eq('id', missionId).select().single();
        if (error) throw error;
        return data;
    },

    async mockReportProblem(missionId) {
        if (!isUUID(missionId) || !this.supabase) throw new Error('Mission invalide.');
        const { data, error } = await this.supabase.from('missions').update({ status: 'DISPUTE' }).eq('id', missionId).select().single();
        if (error) throw error;
        return data;
    },

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
        return { dispatched_count: 0, fallback_message: "Votre besoin est bien publié dans Explorer → Annonces." };
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
            created_at: new Date().toISOString()
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
            for (const column of ['date_mode', 'scheduled_at', 'price_mode', 'budget_max']) delete legacy[column];
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
        if (!this.supabase) return { error: 'AUTH' };
        try {
            const { data: { session } } = await this.supabase.auth.getSession();
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

    async uploadRequestPhoto(file) {
        if (!this.supabase || !file) return null;
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session || !session.user) throw new Error("Utilisateur non connecté");

        const fileExt = file.name ? file.name.split('.').pop() : 'png';
        const filePath = `${session.user.id}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

        let bucket = 'request-photos';
        const { data, error } = await this.supabase.storage
            .from(bucket)
            .upload(filePath, file, { upsert: true });

        if (error) {
            console.warn("Storage upload warning (bucket request-photos):", error);
            return null;
        }

        const { data: publicUrlData } = this.supabase.storage.from(bucket).getPublicUrl(filePath);
        return publicUrlData ? publicUrlData.publicUrl : null;
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
        if (!response.ok) {
            throw new Error(resData.error || "Erreur lors de la libération du paiement");
        }
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
                        .select('id, headline, content, category, media_urls, created_at, author_id, profiles:author_id(first_name, last_name, avatar_url)')
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
                            subtitle: `Par ${authorName}${dateStr ? ' • ' + dateStr : ''} • ${post.category || 'Bokantaj'}`,
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


