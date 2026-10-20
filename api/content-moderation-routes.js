'use strict';

const crypto = require('crypto');
const { runModerationOnce } = require('./moderation-worker');
const {
    MEDIA_BUCKETS,
    PRIVATE_MEDIA_BUCKETS,
    PLACEHOLDER_PENDING,
    PLACEHOLDER_REJECTED,
    classifyContent,
    containsVideo,
    mediaAccess,
    mediaFromStoredUrl,
    normalizeMedia
} = require('./content-moderation');

function secretMatches(provided, expected) {
    const left = Buffer.from(String(provided || ''));
    const right = Buffer.from(String(expected || ''));
    if (!expected || left.length === 0 || left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function bearer(req) {
    const header = String(req.headers.authorization || req.headers.Authorization || '');
    return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function workerAuthorized(req) {
    const provided = bearer(req);
    return secretMatches(provided, process.env.MODERATION_WORKER_SECRET)
        || secretMatches(provided, process.env.CRON_SECRET);
}

function safePath(value) {
    const path = decodeURIComponent(String(value || '')).replace(/^\/+/, '');
    if (!path || path.includes('..') || path.includes('\\') || path.includes('\0')) return null;
    return path;
}

async function downloadImages(supabaseAdmin, media) {
    const files = normalizeMedia(media);
    const images = [];
    for (const file of files) {
        const downloaded = await supabaseAdmin.storage.from(file.bucket).download(file.path);
        if (downloaded.error || !downloaded.data) return null;
        const bytes = Buffer.from(await downloaded.data.arrayBuffer());
        if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) return null;
        const type = downloaded.data.type && downloaded.data.type.startsWith('image/')
            ? downloaded.data.type
            : 'image/jpeg';
        images.push(`data:${type};base64,${bytes.toString('base64')}`);
    }
    return images;
}

async function removeRejectedMedia(supabaseAdmin, media) {
    const groups = new Map();
    normalizeMedia(media).forEach((file) => {
        const list = groups.get(file.bucket) || [];
        list.push(file.path);
        groups.set(file.bucket, list);
    });
    for (const [bucket, paths] of groups) {
        await supabaseAdmin.storage.from(bucket).remove(paths);
    }
}

function registerContentModerationRoutes(app, deps) {
    const supabaseAdmin = deps && deps.supabaseAdmin;
    const verifyAdminPermission = deps && deps.verifyAdminPermission;
    const recordMaisonAudit = deps && deps.recordMaisonAudit;

    app.post('/v1/internal/moderation/classify', async (req, res) => {
        if (!workerAuthorized(req)) {
            return res.status(401).json({ decision: 'pending', reason: 'unauthorized' });
        }
        const text = req.body && req.body.text;
        const media = normalizeMedia(req.body && req.body.media);
        const decision = await classifyContent({
            text,
            media,
            apiKey: process.env.OPENAI_API_KEY,
            fetchImpl: global.fetch,
            downloadMedia: (files) => downloadImages(supabaseAdmin, files)
        });
        if (decision.decision === 'rejected') {
            try {
                await removeRejectedMedia(supabaseAdmin, media);
            } catch (err) {
                decision.media_cleanup = 'failed';
            }
        }
        return res.json({ decision: decision.decision, reason: decision.reason || null });
    });

    app.all('/v1/internal/moderation/run', async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();
        if (!workerAuthorized(req)) return res.status(401).json({ processed: 0, reason: 'unauthorized' });
        try {
            const outcomes = await runModerationOnce({
                supabaseAdmin,
                apiKey: process.env.OPENAI_API_KEY || '',
                fetchImpl: global.fetch
            });
            const counts = {};
            for (const item of outcomes) counts[item.result || 'unknown'] = (counts[item.result || 'unknown'] || 0) + 1;
            return res.json({ processed: outcomes.length, counts });
        } catch (err) {
            return res.status(503).json({ processed: 0, reason: 'unavailable' });
        }
    });

    app.get(/^\/v1\/media\/([a-z0-9_-]+)\/(.+)$/i, async (req, res) => {
        const result = await serveModeratedMedia({
            supabaseAdmin,
            verifyAdminPermission,
            bucket: String(req.params[0] || ''),
            path: safePath(req.params[1]),
            authorization: req.headers.authorization || req.headers.Authorization
        });
        res.status(result.status);
        res.set('Cache-Control', 'private, no-store');
        res.set('X-Content-Type-Options', 'nosniff');
        if (result.type) res.set('Content-Type', result.type);
        if (result.body == null) return res.end();
        return res.send(result.body);
    });

    app.post('/v1/admin/ops/moderation/:subject/:id', async (req, res) => {
        const authResult = await verifyAdminPermission(req, 'moderation.manage');
        if (!authResult.authorized) {
            return res.status(authResult.status).json({ success: false, error: authResult.error });
        }
        const decision = String(req.body && req.body.decision || '');
        if (decision !== 'approved' && decision !== 'rejected') {
            return res.status(400).json({ success: false, error: 'Décision attendue : approved ou rejected.' });
        }
        const subject = String(req.params.subject || '');
        const tables = {
            post: 'bokantaj_posts',
            comment: 'bokantaj_comments',
            request: 'requests',
            profile: 'profiles'
        };
        const table = tables[subject];
        if (!table) return res.status(404).json({ success: false, error: 'Sujet inconnu.' });
        const patch = subject === 'profile'
            ? { bio_moderation_status: decision, avatar_moderation_status: decision }
            : { public_moderation_status: decision };
        const { data, error } = await supabaseAdmin
            .from(table)
            .update(patch)
            .eq('id', req.params.id)
            .select('id')
            .maybeSingle();
        if (error) return res.status(500).json({ success: false, error: 'Mise à jour impossible.' });
        if (!data) return res.status(404).json({ success: false, error: 'Contenu introuvable.' });
        await syncMediaDecision(supabaseAdmin, table, req.params.id, decision);
        if (typeof recordMaisonAudit === 'function') {
            await recordMaisonAudit(authResult.userId, 'CONTENT_MODERATION', req.params.id, { subject, decision });
        }
        return res.json({ success: true, id: data.id, decision });
    });

    app.get('/v1/admin/ops/moderation', async (req, res) => {
        const authResult = await verifyAdminPermission(req, 'moderation.manage');
        if (!authResult.authorized) {
            return res.status(authResult.status).json({ success: false, error: authResult.error });
        }
        const excerpt = (value) => String(value || '').slice(0, 160);
        const [posts, comments, requests, profiles] = await Promise.all([
            supabaseAdmin.from('bokantaj_posts').select('id, content, content_pending, media_urls, public_moderation_status, created_at').or('public_moderation_status.eq.pending,content_pending.not.is.null').limit(50),
            supabaseAdmin.from('bokantaj_comments').select('id, content, content_pending, public_moderation_status, created_at').or('public_moderation_status.eq.pending,content_pending.not.is.null').limit(50),
            supabaseAdmin.from('requests').select('id, title, description, title_pending, description_pending, public_moderation_status, created_at').or('public_moderation_status.eq.pending,title_pending.not.is.null,description_pending.not.is.null').limit(50),
            supabaseAdmin.from('profiles').select('id, bio_pending, avatar_pending, bio_moderation_status, avatar_moderation_status').or('bio_moderation_status.eq.pending,avatar_moderation_status.eq.pending').limit(50)
        ]);
        const failed = [posts, comments, requests, profiles].find((result) => result.error);
        if (failed) return res.status(503).json({ success: false, error: 'File de vérification indisponible.' });
        return res.json({
            success: true,
            posts: (posts.data || []).map((row) => ({
                id: row.id,
                status: row.public_moderation_status,
                excerpt: excerpt(row.content_pending || row.content),
                video: (row.media_urls || []).some((url) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(String(url)))
            })),
            comments: (comments.data || []).map((row) => ({ id: row.id, status: row.public_moderation_status, excerpt: excerpt(row.content_pending || row.content) })),
            requests: (requests.data || []).map((row) => ({ id: row.id, status: row.public_moderation_status, excerpt: excerpt(row.description_pending || row.description) })),
            profiles: (profiles.data || []).map((row) => ({ id: row.id, bio_status: row.bio_moderation_status, avatar_status: row.avatar_moderation_status, excerpt: excerpt(row.bio_pending) }))
        });
    });
}

async function syncMediaDecision(supabaseAdmin, table, id, decision) {
    const row = await supabaseAdmin.from(table).select('*').eq('id', id).maybeSingle();
    if (!row.data) return;
    const urls = [];
    if (Array.isArray(row.data.media_urls)) urls.push(...row.data.media_urls);
    if (row.data.media_url) urls.push(row.data.media_url);
    if (row.data.avatar_pending) urls.push(row.data.avatar_pending);
    if (row.data.avatar_url) urls.push(row.data.avatar_url);
    const files = urls.map(mediaFromStoredUrl).filter((file) => file && PRIVATE_MEDIA_BUCKETS.includes(file.bucket));
    for (const file of files) {
        await supabaseAdmin.from('public_media_releases').upsert({
            bucket_id: file.bucket,
            object_name: file.path,
            status: decision,
            kind: containsVideo([file]) ? 'video' : 'image'
        }, { onConflict: 'bucket_id,object_name' });
    }
    if (decision === 'rejected' && files.length) await removePrivateFiles(supabaseAdmin, files);
}

async function removePrivateFiles(supabaseAdmin, files) {
    const groups = new Map();
    files.forEach((file) => {
        if (!file || !String(file.bucket).endsWith('-hold')) return;
        const list = groups.get(file.bucket) || [];
        list.push(file.path);
        groups.set(file.bucket, list);
    });
    for (const [bucket, paths] of groups) {
        await supabaseAdmin.storage.from(bucket).remove(paths);
        for (const objectPath of paths) {
            const bucketApi = supabaseAdmin.storage.from(bucket);
            if (typeof bucketApi.purgeCache === 'function') await bucketApi.purgeCache(objectPath);
        }
    }
}

function ownerIdFromPath(path) {
    const first = String(path || '').split('/')[0];
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(first) ? first : '';
}

async function serveModeratedMedia({ supabaseAdmin, verifyAdminPermission, bucket, path, authorization }) {
    if (!path || !MEDIA_BUCKETS.includes(bucket)) return { status: 404, body: null };
    const release = await supabaseAdmin
        .from('public_media_releases')
        .select('status, kind')
        .eq('bucket_id', bucket)
        .eq('object_name', path)
        .maybeSingle();
    if (release.error) return { status: 404, body: null };
    let viewer = { id: null, isAdmin: false, ownerId: ownerIdFromPath(path) };
    const token = String(authorization || '').startsWith('Bearer ') ? String(authorization).slice(7).trim() : '';
    if (token && supabaseAdmin && supabaseAdmin.auth) {
        const user = await supabaseAdmin.auth.getUser(token);
        if (user && user.data && user.data.user) viewer.id = user.data.user.id;
        if (viewer.id && typeof verifyAdminPermission === 'function') {
            const admin = await verifyAdminPermission({ headers: { authorization: 'Bearer ' + token } }, 'moderation.manage');
            viewer.isAdmin = Boolean(admin && admin.authorized);
        }
    }
    const access = mediaAccess(release.data, bucket, viewer);
    if (access === 'placeholder' || access === 'rejected') {
        return {
            status: 200,
            type: 'image/svg+xml; charset=utf-8',
            body: access === 'placeholder' ? PLACEHOLDER_PENDING : PLACEHOLDER_REJECTED
        };
    }
    if (access !== 'stream') return { status: 404, body: null };
    const downloaded = await supabaseAdmin.storage.from(bucket).download(path);
    if (downloaded.error || !downloaded.data) return { status: 404, body: null };
    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    return { status: 200, type: downloaded.data.type || 'application/octet-stream', body: bytes };
}

module.exports = {
    registerContentModerationRoutes,
    secretMatches,
    workerAuthorized,
    serveModeratedMedia
};
