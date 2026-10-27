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
    mediaTypeFromPath,
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
                fetchImpl: global.fetch,
                limit: 4
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
            authorization: req.headers.authorization || req.headers.Authorization,
            range: req.headers.range || ''
        });
        res.status(result.status);
        res.set('Cache-Control', 'private, no-store');
        res.set('X-Content-Type-Options', 'nosniff');
        if (result.type) res.set('Content-Type', result.type);
        if (result.headers) Object.entries(result.headers).forEach(([key, value]) => res.set(key, String(value)));
        if (result.body == null) return res.end();
        return res.send(result.body);
    });

    app.post('/v1/admin/ops/moderation/:subject/:id', async (req, res) => {
        const authResult = await verifyAdminPermission(req, 'moderation.manage');
        if (!authResult.authorized) {
            return res.status(authResult.status).json({ success: false, error: authResult.error });
        }
        const raw = String(req.body && req.body.decision || '').toLowerCase();
        const decision = raw === 'approve' ? 'approved' : (raw === 'reject' ? 'rejected' : raw);
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
            : {
                public_moderation_status: decision,
                human_moderation_lock: decision === 'rejected',
                human_decision: decision === 'approved' ? 'approve' : 'reject'
            };
        const { data, error } = await supabaseAdmin
            .from(table)
            .update(patch)
            .eq('id', req.params.id)
            .select('id')
            .maybeSingle();
        if (error) return res.status(500).json({ success: false, error: 'Mise à jour impossible.' });
        if (!data) return res.status(404).json({ success: false, error: 'Contenu introuvable.' });
        await syncMediaDecision(supabaseAdmin, table, req.params.id, decision);
        try {
            await supabaseAdmin
                .from('moderation_jobs')
                .update({
                    status: 'done',
                    reason_code: decision === 'approved' ? 'admin_approved' : 'admin_rejected',
                    finished_at: new Date().toISOString()
                })
                .eq('subject_type', subject)
                .eq('subject_id', req.params.id);
        } catch (_) {}
        if (typeof recordMaisonAudit === 'function') {
            await recordMaisonAudit(authResult.userId, 'CONTENT_MODERATION', req.params.id, { subject, decision });
        }
        return res.json({
            success: true,
            id: data.id,
            decision,
            visible: decision === 'approved',
            lifecycle_status: decision === 'approved' ? 'PUBLISHED_VISIBLE' : 'REJECTED',
            lifecycle_label: decision === 'approved' ? 'Publié et visible' : 'Refusé'
        });
    });

    app.post('/v1/admin/ops/moderation/run-once', async (req, res) => {
        const authResult = await verifyAdminPermission(req, 'moderation.manage');
        if (!authResult.authorized) {
            return res.status(authResult.status).json({ success: false, error: authResult.error });
        }
        try {
            const [pendingPosts, pendingRequests, pendingComments, pendingProfiles] = await Promise.all([
                supabaseAdmin.from('bokantaj_posts').select('id').eq('public_moderation_status', 'pending').limit(30),
                supabaseAdmin.from('requests').select('id').eq('public_moderation_status', 'pending').limit(30),
                supabaseAdmin.from('bokantaj_comments').select('id').eq('public_moderation_status', 'pending').limit(30),
                supabaseAdmin.from('profiles').select('id').or('bio_moderation_status.eq.pending,avatar_moderation_status.eq.pending').limit(30)
            ]);
            for (const row of (pendingPosts.data || [])) {
                await supabaseAdmin.rpc('lyann_enqueue_moderation_job', { p_type: 'post', p_id: row.id });
            }
            for (const row of (pendingRequests.data || [])) {
                await supabaseAdmin.rpc('lyann_enqueue_moderation_job', { p_type: 'request', p_id: row.id });
            }
            for (const row of (pendingComments.data || [])) {
                await supabaseAdmin.rpc('lyann_enqueue_moderation_job', { p_type: 'comment', p_id: row.id });
            }
            for (const row of (pendingProfiles.data || [])) {
                await supabaseAdmin.rpc('lyann_enqueue_moderation_job', { p_type: 'profile', p_id: row.id });
            }
            const outcomes = await runModerationOnce({
                supabaseAdmin,
                apiKey: process.env.OPENAI_API_KEY || process.env.LYANN_AI_API_KEY || '',
                fetchImpl: global.fetch,
                limit: 12
            });
            const counts = {};
            for (const item of outcomes) counts[item.result || 'unknown'] = (counts[item.result || 'unknown'] || 0) + 1;
            if (typeof recordMaisonAudit === 'function') {
                await recordMaisonAudit(authResult.userId, 'MODERATION_WORKER_RUN', 'queue', { processed: outcomes.length, counts });
            }
            return res.json({ success: true, processed: outcomes.length, counts, outcomes });
        } catch (err) {
            return res.status(503).json({ success: false, processed: 0, error: 'Exécution de la passe de modération indisponible.' });
        }
    });

    app.get('/v1/admin/ops/moderation', async (req, res) => {
        const authResult = await verifyAdminPermission(req, 'moderation.manage');
        if (!authResult.authorized) {
            return res.status(authResult.status).json({ success: false, error: authResult.error });
        }
        const excerpt = (value) => String(value || '').slice(0, 160);
        const [posts, comments, requests, profiles, jobs] = await Promise.all([
            supabaseAdmin.from('bokantaj_posts').select('id, author_id, type, city, territory, content, content_pending, media_urls, public_moderation_status, created_at').or('public_moderation_status.eq.pending,content_pending.not.is.null').order('created_at', { ascending: false }).limit(50),
            supabaseAdmin.from('bokantaj_comments').select('id, author_id, post_id, content, content_pending, public_moderation_status, created_at').or('public_moderation_status.eq.pending,content_pending.not.is.null').order('created_at', { ascending: false }).limit(50),
            supabaseAdmin.from('requests').select('id, requester_id, location, category, title, description, title_pending, description_pending, public_moderation_status, created_at').or('public_moderation_status.eq.pending,title_pending.not.is.null,description_pending.not.is.null').order('created_at', { ascending: false }).limit(50),
            supabaseAdmin.from('profiles').select('id, first_name, last_name, city, territory, bio_pending, avatar_pending, bio_moderation_status, avatar_moderation_status').or('bio_moderation_status.eq.pending,avatar_moderation_status.eq.pending').limit(50),
            supabaseAdmin.from('moderation_jobs').select('subject_type, subject_id, status, reason_code, attempts, updated_at').in('status', ['queued', 'running', 'retry', 'held']).limit(200)
        ]);
        const failed = [posts, comments, requests, profiles].find((result) => result.error);
        if (failed) return res.status(503).json({ success: false, error: 'File de vérification indisponible.' });
        const jobMap = {};
        (jobs.data || []).forEach((j) => { jobMap[`${j.subject_type}:${j.subject_id}`] = j; });
        return res.json({
            success: true,
            posts: (posts.data || []).map((row) => ({
                id: row.id,
                author_id: row.author_id || null,
                type: row.type || 'info',
                city: row.city || null,
                territory: row.territory || null,
                created_at: row.created_at || null,
                status: row.public_moderation_status,
                job_status: jobMap[`post:${row.id}`]?.status || 'unqueued',
                reason_code: jobMap[`post:${row.id}`]?.reason_code || null,
                excerpt: excerpt(row.content_pending || row.content),
                video: (row.media_urls || []).some((url) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(String(url)))
            })),
            comments: (comments.data || []).map((row) => ({
                id: row.id,
                author_id: row.author_id || null,
                post_id: row.post_id || null,
                created_at: row.created_at || null,
                status: row.public_moderation_status,
                job_status: jobMap[`comment:${row.id}`]?.status || 'unqueued',
                reason_code: jobMap[`comment:${row.id}`]?.reason_code || null,
                excerpt: excerpt(row.content_pending || row.content)
            })),
            requests: (requests.data || []).map((row) => ({
                id: row.id,
                requester_id: row.requester_id || null,
                title: row.title_pending || row.title || null,
                location: row.location || null,
                category: row.category || null,
                created_at: row.created_at || null,
                status: row.public_moderation_status,
                job_status: jobMap[`request:${row.id}`]?.status || 'unqueued',
                reason_code: jobMap[`request:${row.id}`]?.reason_code || null,
                excerpt: excerpt(row.description_pending || row.description)
            })),
            profiles: (profiles.data || []).map((row) => ({
                id: row.id,
                name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || null,
                city: row.city || null,
                territory: row.territory || null,
                bio_status: row.bio_moderation_status,
                avatar_status: row.avatar_moderation_status,
                job_status: jobMap[`profile:${row.id}`]?.status || 'unqueued',
                reason_code: jobMap[`profile:${row.id}`]?.reason_code || null,
                excerpt: excerpt(row.bio_pending)
            }))
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

// RFC 7233 single-range support for iOS/Android Safari seeking. Multi-range
// requests are rejected instead of allocating arbitrary multipart responses.
function mediaCacheControl(type) {
    // AVPlayer on iOS paints a white frame when a video response is no-store.
    // A short private lifetime lets the player reuse ranges. Images stay uncached
    // so a later moderation decision is not kept on disk.
    return String(type || '').toLowerCase().startsWith('video/')
        ? 'private, max-age=300'
        : 'private, no-store';
}

// Forward one Range to Storage. The previous path downloaded the whole object
// for every two-byte probe, so a 20 MB clip never reached the first frame.
async function fetchStorageObject({ supabaseAdmin, bucket, path, range, fetchImpl }) {
    const root = String(supabaseAdmin && supabaseAdmin.supabaseUrl || '').replace(/\/$/, '');
    const key = supabaseAdmin && supabaseAdmin.supabaseKey;
    const fetchFn = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!root || !key || typeof fetchFn !== 'function') return null;
    const encoded = String(path).split('/').map((part) => encodeURIComponent(part)).join('/');
    const headers = { Authorization: 'Bearer ' + key, apikey: key };
    if (range) headers.Range = range;
    let response;
    try {
        response = await fetchFn(root + '/storage/v1/object/' + bucket + '/' + encoded, { headers });
    } catch (err) {
        return null;
    }
    if (!response) return null;
    const raw = Buffer.from(await response.arrayBuffer());
    const type = response.headers && typeof response.headers.get === 'function'
        ? response.headers.get('content-type')
        : '';
    const contentRange = response.headers && typeof response.headers.get === 'function'
        ? response.headers.get('content-range')
        : '';
    return {
        status: response.status,
        type: type || '',
        body: raw,
        headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': raw.length,
            ...(contentRange ? { 'Content-Range': contentRange } : {})
        }
    };
}

function sliceMediaRange(buffer, rangeHeader) {
    const size = buffer.length;
    const raw = String(rangeHeader || '').trim();
    const base = { 'Accept-Ranges': 'bytes' };
    if (!raw) return { status: 200, body: buffer, headers: { ...base, 'Content-Length': size } };
    const match = raw.match(/^bytes=(\d*)-(\d*)$/i);
    if (!match || (!match[1] && !match[2])) {
        return { status: 416, body: null, headers: { ...base, 'Content-Range': 'bytes */' + size, 'Content-Length': 0 } };
    }
    let start;
    let end;
    if (!match[1]) {
        const suffix = Number(match[2]);
        if (!Number.isSafeInteger(suffix) || suffix <= 0) {
            return { status: 416, body: null, headers: { ...base, 'Content-Range': 'bytes */' + size, 'Content-Length': 0 } };
        }
        start = Math.max(0, size - suffix);
        end = size - 1;
    } else {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : size - 1;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
            return { status: 416, body: null, headers: { ...base, 'Content-Range': 'bytes */' + size, 'Content-Length': 0 } };
        }
        end = Math.min(end, size - 1);
    }
    const body = buffer.subarray(start, end + 1);
    return { status: 206, body, headers: { ...base, 'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Content-Length': body.length } };
}

// A moderation release alone is not enough: a post can later be hidden
// without its media release row being updated. Re-check the underlying post
// before serving video bytes or poster frames from reusable URLs.
async function isApprovedBokantajMediaReference(supabaseAdmin, bucket, path) {
    const ownerId = ownerIdFromPath(path);
    if (!ownerId || !['bokantaj-media-hold', 'bokantaj-media'].includes(bucket)) return false;
    const { data, error } = await supabaseAdmin.from('bokantaj_posts')
        .select('media_urls, public_moderation_status, human_decision')
        .eq('author_id', ownerId).limit(1000);
    // Fail closed when an incomplete PostgREST result could hide a matching
    // deleted/rejected reference; query pagination can be added later.
    if (error || !Array.isArray(data) || data.length >= 1000) return false;
    return data.some((post) => {
        if (post.public_moderation_status !== 'approved' ||
            post.human_decision === 'hide' || post.human_decision === 'reject') return false;
        return (post.media_urls || []).some((storedUrl) => {
            const parsed = mediaFromStoredUrl(storedUrl);
            return parsed && parsed.bucket === bucket && parsed.path === path;
        });
    });
}

async function serveModeratedMedia({ supabaseAdmin, verifyAdminPermission, bucket, path, authorization, range, fetchImpl }) {
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
    if (release.data?.status === 'approved' &&
        ['bokantaj-media-hold', 'bokantaj-media'].includes(bucket) &&
        (release.data?.kind === 'video' || /-poster(?:-\d+x\d+)?\.jpe?g$/i.test(path))) {
        const stillPublished = await isApprovedBokantajMediaReference(supabaseAdmin, bucket, path);
        if (!stillPublished) return { status: 404, body: null };
    }
    const streamed = await fetchStorageObject({ supabaseAdmin, bucket, path, range, fetchImpl });
    if (streamed && streamed.status !== 200 && streamed.status !== 206) {
        return { status: streamed.status, body: null, headers: streamed.headers };
    }
    if (streamed && (streamed.status === 200 || streamed.status === 206)) {
        const type = mediaTypeFromPath(path, streamed.type || 'application/octet-stream');
        const payload = streamed.status === 200 && range
            ? sliceMediaRange(streamed.body, range)
            : { status: streamed.status, body: streamed.body, headers: streamed.headers };
        return {
            ...payload,
            type,
            headers: { ...(payload.headers || {}), 'Cache-Control': mediaCacheControl(type) }
        };
    }
    const downloaded = await supabaseAdmin.storage.from(bucket).download(path);
    if (downloaded.error || !downloaded.data) return { status: 404, body: null };
    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    const type = mediaTypeFromPath(path, downloaded.data.type || 'application/octet-stream');
    // The storage object is small (Bokantaj <=10 MiB), and range extraction
    // happens only after the existing moderation access control above.
    const sliced = sliceMediaRange(bytes, range);
    return {
        ...sliced,
        type,
        headers: { ...(sliced.headers || {}), 'Cache-Control': mediaCacheControl(type) }
    };
}

module.exports = {
    registerContentModerationRoutes,
    secretMatches,
    workerAuthorized,
    sliceMediaRange,
    mediaCacheControl,
    isApprovedBokantajMediaReference,
    serveModeratedMedia
};
