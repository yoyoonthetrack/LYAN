'use strict';
/*
 * LYANN — cartes « À la une près de chez vous » (Découvrir). Back-office routes + pure validation helpers.
 *
 * Access   : every route calls verifyAdminPermission(req, 'agents.approve') (the editorial desk permission) on the server.
 * Writes   : service_role only (RLS gives no client any write). One admin_audit_events row per action.
 * Content  : plain text only (no HTML is ever accepted or stored); the CTA is a whitelisted target, never a URL.
 * Images   : JPEG / PNG / WebP checked by magic bytes, 1 MiB maximum, stored under a server-generated name in the
 *            public bucket editorial-highlights (migration 93).
 */
const crypto = require('crypto');

const PERMISSION = 'agents.approve';
const BUCKET = 'editorial-highlights';
const MAX_IMAGE_BYTES = 1024 * 1024;
const TERRITORIES = Object.freeze(['all', 'guadeloupe', 'martinique', 'guyane', 'reunion']);
const THEMES = Object.freeze(['rentree', 'toussaint', 'noel', 'carnaval', 'careme', 'paques', 'vacances', 'saison', 'autre']);
const STATUSES = Object.freeze(['draft', 'published', 'archived']);
const CTA_TARGETS = Object.freeze(['lyanneurs', 'lyanneurs_category', 'annonces', 'annonces_category', 'annonces_map']);
const CATEGORY_CTA = Object.freeze(['lyanneurs_category', 'annonces_category']);
const CATEGORY_VALUE = /^[\p{L}\p{N} &'’.,()/+-]{2,60}$/u;
const IMAGE_PATH = new RegExp(`/storage/v1/object/public/${BUCKET}/[A-Za-z0-9._/-]+$`);

class HighlightError extends Error {
    constructor(message, field) {
        super(message);
        this.field = field || null;
        this.status = 400;
    }
}

function cleanText(value, { min, max, field, required = true, label }) {
    const raw = value == null ? '' : String(value);
    // Plain text only: reject markup instead of silently rewriting it, so the editor sees what is wrong.
    if (/[<>]/.test(raw)) throw new HighlightError(`${label} : le HTML n'est pas accepté.`, field);
    // eslint-disable-next-line no-control-regex
    const text = raw.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) {
        if (required) throw new HighlightError(`${label} : champ obligatoire.`, field);
        return null;
    }
    if (text.length < min || text.length > max) throw new HighlightError(`${label} : entre ${min} et ${max} caractères.`, field);
    return text;
}

function cleanDate(value, field, label) {
    if (value == null || value === '') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new HighlightError(`${label} : date invalide.`, field);
    return date.toISOString();
}

function oneOf(value, allowed, field, label, fallback) {
    const v = value == null || value === '' ? fallback : String(value);
    if (v == null) return null;
    if (!allowed.includes(v)) throw new HighlightError(`${label} : valeur non autorisée.`, field);
    return v;
}

/** Validates a full card payload (create) or the supplied subset (update). Returns the exact columns to write. */
function sanitizeHighlight(body, { partial = false, publicImagePrefix = '' } = {}) {
    const input = body && typeof body === 'object' ? body : {};
    const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
    const out = {};
    if (!partial || has('title')) out.title = cleanText(input.title, { min: 3, max: 48, field: 'title', label: 'Titre' });
    if (!partial || has('teaser')) out.teaser = cleanText(input.teaser, { min: 3, max: 80, field: 'teaser', label: 'Accroche' });
    if (!partial || has('label')) out.label = cleanText(input.label, { min: 2, max: 24, field: 'label', label: 'Repère', required: false });
    if (!partial || has('image_alt')) out.image_alt = cleanText(input.image_alt, { min: 2, max: 120, field: 'image_alt', label: 'Texte alternatif', required: false });
    if (!partial || has('territory')) out.territory = oneOf(input.territory, TERRITORIES, 'territory', 'Territoire', 'all');
    if (!partial || has('theme')) out.theme = oneOf(input.theme, THEMES, 'theme', 'Thème', null);
    if (!partial || has('status')) out.status = oneOf(input.status, STATUSES, 'status', 'Statut', 'draft');
    if (!partial || has('cta_target')) out.cta_target = oneOf(input.cta_target, CTA_TARGETS, 'cta_target', 'Destination', 'lyanneurs');
    if (!partial || has('cta_value')) {
        const value = input.cta_value == null || String(input.cta_value).trim() === '' ? null : String(input.cta_value).replace(/\s+/g, ' ').trim();
        if (value && !CATEGORY_VALUE.test(value)) throw new HighlightError('Catégorie : caractères non autorisés.', 'cta_value');
        out.cta_value = value;
    }
    if (!partial || has('starts_at')) out.starts_at = cleanDate(input.starts_at, 'starts_at', 'Début');
    if (!partial || has('ends_at')) out.ends_at = cleanDate(input.ends_at, 'ends_at', 'Fin');
    if (!partial || has('priority')) {
        const n = input.priority == null || input.priority === '' ? 100 : Number(input.priority);
        if (!Number.isInteger(n) || n < 0 || n > 1000) throw new HighlightError('Priorité : entier entre 0 et 1000.', 'priority');
        out.priority = n;
    }
    if (!partial || has('image_url')) {
        const url = input.image_url == null || input.image_url === '' ? null : String(input.image_url);
        if (url && !(IMAGE_PATH.test(url) && (!publicImagePrefix || url.startsWith(publicImagePrefix)))) {
            throw new HighlightError('Image : seule une image envoyée depuis cet outil est acceptée.', 'image_url');
        }
        out.image_url = url;
    }
    return out;
}

/** Cross-field rules, applied on the merged row so a partial update cannot slip past them. */
function assertConsistent(row) {
    if (row.starts_at && row.ends_at && new Date(row.ends_at) <= new Date(row.starts_at)) {
        throw new HighlightError('La fin doit être postérieure au début.', 'ends_at');
    }
    if (CATEGORY_CTA.includes(row.cta_target) && !row.cta_value) {
        throw new HighlightError('Cette destination demande une catégorie.', 'cta_value');
    }
    if (!CATEGORY_CTA.includes(row.cta_target)) row.cta_value = null;
    if (row.status === 'published' && !row.image_url) throw new HighlightError('Une carte publiée a besoin d’une image.', 'image_url');
    return row;
}

/** Returns { ext, mime } from the first bytes, or null. The declared MIME is never trusted. */
function detectImageType(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
    if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
    if (buffer.slice(0, 4).toString('latin1') === 'RIFF' && buffer.slice(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
    return null;
}

function decodeImage(base64) {
    const raw = String(base64 || '').replace(/^data:[^;]+;base64,/, '');
    if (!raw || raw.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
        throw new HighlightError('Image : fichier invalide ou trop lourd (1 Mo maximum).', 'image');
    }
    const buffer = Buffer.from(raw, 'base64');
    if (buffer.length > MAX_IMAGE_BYTES) throw new HighlightError('Image : 1 Mo maximum.', 'image');
    const type = detectImageType(buffer);
    if (!type) throw new HighlightError('Image : JPEG, PNG ou WebP uniquement.', 'image');
    return { buffer, ...type };
}

/** Visibility rule mirrored from the RLS policy, used by tests and by the admin "state" badge. */
function highlightState(row, now = new Date()) {
    if (!row) return 'draft';
    if (row.status !== 'published') return row.status;
    if (row.starts_at && new Date(row.starts_at) > now) return 'scheduled';
    if (row.ends_at && new Date(row.ends_at) <= now) return 'expired';
    return 'live';
}

function registerEditorialHighlightRoutes(app, { supabaseAdmin, verifyAdminPermission }) {
    const guard = async (req, res) => {
        const auth = await verifyAdminPermission(req, PERMISSION);
        if (auth.authorized) return auth;
        const expired = auth.status === 401;
        res.status(auth.status || 403).json({ success: false, code: expired ? 'ADMIN_TOKEN_INVALID' : 'ADMIN_ACCESS_DENIED', error: expired ? 'Session expirée.' : 'Accès refusé.' });
        return null;
    };
    const publicPrefix = () => String(supabaseAdmin.storage.from(BUCKET).getPublicUrl('x').data.publicUrl || '').replace(/x$/, '');
    const audit = async (auth, action, target, before, after) => {
        try {
            await supabaseAdmin.from('admin_audit_events').insert({
                actor_type: 'ADMIN', actor_id: auth.userId, actor_name: auth.email || 'Admin', action,
                module_name: 'Éditorial À la une', target_type: 'editorial_highlight', target_id: target || null,
                before_state: before || null, after_state: after || null, metadata: {}, created_at: new Date().toISOString()
            });
        } catch (e) { console.warn('Editorial highlight audit skipped:', e.message || e); }
    };
    const fail = (res, e) => {
        if (e instanceof HighlightError) return res.status(400).json({ success: false, code: 'invalid', field: e.field, error: e.message });
        console.warn('Editorial highlight error:', e && e.message);
        return res.status(500).json({ success: false, code: 'server', error: 'Erreur serveur.' });
    };
    const withState = (row) => ({ ...row, state: highlightState(row) });

    app.get('/v1/admin/editorial/highlights', async (req, res) => {
        const auth = await guard(req, res); if (!auth) return;
        const { data, error } = await supabaseAdmin.from('editorial_highlights').select('*').order('status', { ascending: true }).order('priority', { ascending: true }).order('created_at', { ascending: false }).limit(200);
        if (error) return res.status(500).json({ success: false, error: 'Lecture impossible.' });
        return res.json({ success: true, highlights: (data || []).map(withState), themes: THEMES, territories: TERRITORIES, targets: CTA_TARGETS });
    });

    app.post('/v1/admin/editorial/highlights', async (req, res) => {
        const auth = await guard(req, res); if (!auth) return;
        try {
            const row = assertConsistent(sanitizeHighlight(req.body, { publicImagePrefix: publicPrefix() }));
            const { data, error } = await supabaseAdmin.from('editorial_highlights').insert({ ...row, created_by: auth.userId, updated_by: auth.userId }).select('*').single();
            if (error) throw error;
            await audit(auth, 'EDITORIAL_HIGHLIGHT_CREATE', data.id, null, data);
            return res.status(201).json({ success: true, highlight: withState(data) });
        } catch (e) { return fail(res, e); }
    });

    app.patch('/v1/admin/editorial/highlights/:id', async (req, res) => {
        const auth = await guard(req, res); if (!auth) return;
        try {
            const { data: before, error: readError } = await supabaseAdmin.from('editorial_highlights').select('*').eq('id', req.params.id).maybeSingle();
            if (readError) throw readError;
            if (!before) return res.status(404).json({ success: false, error: 'Carte introuvable.' });
            const patch = sanitizeHighlight(req.body, { partial: true, publicImagePrefix: publicPrefix() });
            const merged = assertConsistent({ ...before, ...patch });
            const columns = { ...patch, cta_value: merged.cta_value, updated_by: auth.userId };
            const { data, error } = await supabaseAdmin.from('editorial_highlights').update(columns).eq('id', before.id).select('*').single();
            if (error) throw error;
            await audit(auth, patch.status && patch.status !== before.status ? `EDITORIAL_HIGHLIGHT_${String(patch.status).toUpperCase()}` : 'EDITORIAL_HIGHLIGHT_UPDATE', data.id, before, data);
            return res.json({ success: true, highlight: withState(data) });
        } catch (e) { return fail(res, e); }
    });

    app.delete('/v1/admin/editorial/highlights/:id', async (req, res) => {
        const auth = await guard(req, res); if (!auth) return;
        try {
            const { data: before, error: readError } = await supabaseAdmin.from('editorial_highlights').select('*').eq('id', req.params.id).maybeSingle();
            if (readError) throw readError;
            if (!before) return res.status(404).json({ success: false, error: 'Carte introuvable.' });
            const { error } = await supabaseAdmin.from('editorial_highlights').delete().eq('id', before.id);
            if (error) throw error;
            await audit(auth, 'EDITORIAL_HIGHLIGHT_DELETE', before.id, before, null);
            return res.json({ success: true });
        } catch (e) { return fail(res, e); }
    });

    app.post('/v1/admin/editorial/highlights/image', async (req, res) => {
        const auth = await guard(req, res); if (!auth) return;
        try {
            const image = decodeImage(req.body && req.body.data);
            const path = `${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${image.ext}`;
            const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, image.buffer, { contentType: image.mime, upsert: false, cacheControl: '3600' });
            if (error) throw error;
            const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
            await audit(auth, 'EDITORIAL_HIGHLIGHT_IMAGE', path, null, { path, bytes: image.buffer.length, mime: image.mime });
            return res.status(201).json({ success: true, url, bytes: image.buffer.length, mime: image.mime });
        } catch (e) { return fail(res, e); }
    });
}

module.exports = {
    PERMISSION, BUCKET, MAX_IMAGE_BYTES, TERRITORIES, THEMES, STATUSES, CTA_TARGETS,
    HighlightError, sanitizeHighlight, assertConsistent, detectImageType, decodeImage, highlightState, registerEditorialHighlightRoutes
};
