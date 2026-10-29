'use strict';

const {
    classifyContent,
    containsVideo,
    mediaFromStoredUrl,
    normalizeMedia
} = require('./content-moderation');
const { inspectMp4 } = require('../bokantaj-video-policy');

const SUBJECTS = Object.freeze({
    post: { table: 'bokantaj_posts', status: 'public_moderation_status' },
    comment: { table: 'bokantaj_comments', status: 'public_moderation_status' },
    request: { table: 'requests', status: 'public_moderation_status' },
    profile: { table: 'profiles', status: 'bio_moderation_status' },
    portfolio: { table: 'user_portfolio_items', status: null }
});

function backoffSeconds(attempts) {
    return Math.min(15 * 60, 30 * Math.max(1, Number(attempts) || 1));
}

function urlsFromRow(row) {
    const values = [];
    if (Array.isArray(row && row.media_urls)) values.push(...row.media_urls);
    if (row && row.media_url) values.push(row.media_url);
    if (row && row.avatar_url) values.push(row.avatar_url);
    if (row && row.avatar_pending) values.push(row.avatar_pending);
    if (row && row.image_url) values.push(row.image_url);
    return values.map(mediaFromStoredUrl).filter(Boolean);
}

async function loadSubject(supabaseAdmin, job) {
    const subject = SUBJECTS[job.subject_type];
    if (!subject) return null;
    const row = await supabaseAdmin.from(subject.table).select('*').eq('id', job.subject_id).maybeSingle();
    if (row.error || !row.data) return null;
    const queue = await supabaseAdmin
        .from('content_moderation_queue')
        .select('id, payload')
        .eq('subject_type', job.subject_type)
        .eq('subject_id', job.subject_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1);
    const pendingEdit = queue.data && queue.data[0];
    return { subject, row: row.data, pendingEdit: pendingEdit || null };
}

function profileText(job, loaded) {
    const row = loaded.row || {};
    if (!loaded.pendingEdit && row.bio_moderation_status === 'approved' && !row.bio_pending) return '';
    return textOf(job, loaded);
}

function textOf(job, loaded) {
    const row = loaded.row;
    const payload = loaded.pendingEdit && loaded.pendingEdit.payload;
    if (payload) return [payload.title, payload.description, payload.content].filter(Boolean).join('\n');
    if (job.subject_type === 'request') return [row.title, row.description].filter(Boolean).join('\n');
    if (job.subject_type === 'portfolio') return [row.title, row.caption].filter(Boolean).join('\n');
    if (job.subject_type === 'profile') return row.bio_pending || row.bio || '';
    return row.content || '';
}

function profileFiles(row) {
    if (row && row.avatar_pending) {
        const pending = mediaFromStoredUrl(row.avatar_pending);
        return pending ? [pending] : [];
    }
    return urlsFromRow(row);
}

function avatarIdentity(row) {
    return String((row && row.avatar_pending) || '') + '\n' + String((row && row.avatar_url) || '');
}

async function profileStillNeedsReview(supabaseAdmin, row) {
    if (!row) return false;
    if (row.avatar_moderation_status === 'pending' || row.bio_moderation_status === 'pending' || row.avatar_pending) return true;
    const held = urlsFromRow(row).filter((file) => String(file.bucket).endsWith('-hold'));
    for (const file of held) {
        const release = await supabaseAdmin.from('public_media_releases')
            .select('status')
            .eq('bucket_id', file.bucket)
            .eq('object_name', file.path)
            .maybeSingle();
        if (!release.data || release.data.status === 'pending') return true;
    }
    return false;
}

async function requeueNewerPhoto(supabaseAdmin, job) {
    await supabaseAdmin.from('moderation_jobs').update({
        status: 'queued',
        reason_code: 'newer_photo',
        available_at: new Date().toISOString(),
        claimed_at: null,
        finished_at: null,
        attempts: Math.max(0, (Number(job.attempts) || 1) - 1)
    }).eq('id', job.id);
}

async function finishJob(supabaseAdmin, job, status, reason) {
    const patch = {
        status,
        reason_code: String(reason || 'unavailable').slice(0, 80),
        finished_at: status === 'retry' ? null : new Date().toISOString()
    };
    if (status === 'retry') {
        patch.available_at = new Date(Date.now() + backoffSeconds(job.attempts) * 1000).toISOString();
        patch.claimed_at = null;
    }
    await supabaseAdmin.from('moderation_jobs').update(patch).eq('id', job.id);
}

async function markReleases(supabaseAdmin, files, status) {
    for (const file of files) {
        if (!file || !String(file.bucket).endsWith('-hold')) continue;
        await supabaseAdmin.from('public_media_releases').upsert({
            bucket_id: file.bucket,
            object_name: file.path,
            status,
            kind: containsVideo([file]) ? 'video' : 'image'
        }, { onConflict: 'bucket_id,object_name' });
    }
}

async function removeHoldFiles(supabaseAdmin, files) {
    const groups = new Map();
    normalizeMedia(files).forEach((file) => {
        if (!String(file.bucket).endsWith('-hold')) return;
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

async function applyDecision(supabaseAdmin, job, loaded, decision) {
    const files = urlsFromRow(loaded.pendingEdit ? { ...loaded.row, ...loaded.pendingEdit.payload } : loaded.row);
    const outcome = decision && decision.decision;
    // A video is published only after the poster and the text have passed the
    // same automated checks as a photo. Any other approve reason stays with a
    // person. A missing poster or an unreadable file is a technical retry, not
    // a silent approval and not an immediate permanent hold.
    const videoPublishable = decision && (decision.reason === 'video_checked' || decision.reason === 'video_poster_checked');
    if (outcome === 'approved' && containsVideo(files) && !videoPublishable) {
        await finishJob(supabaseAdmin, job, 'held', 'video_unreviewed');
        return 'held';
    }
    if (outcome === 'rejected') {
        if (loaded.pendingEdit) {
            await supabaseAdmin.from('content_moderation_queue').update({ status: 'rejected' }).eq('id', loaded.pendingEdit.id);
            if (loaded.row.public_moderation_status === 'approved' || loaded.row.bio_moderation_status === 'approved') {
                await finishJob(supabaseAdmin, job, 'done', 'rejected');
                return 'rejected';
            }
        }
        await removeHoldFiles(supabaseAdmin, files);
        await markReleases(supabaseAdmin, files, 'rejected');
        if (job.subject_type === 'profile') {
            await supabaseAdmin.from('profiles').update({
                bio_moderation_status: 'rejected',
                avatar_moderation_status: files.length ? 'rejected' : loaded.row.avatar_moderation_status
            }).eq('id', job.subject_id);
        } else if (job.subject_type === 'portfolio') {
            await supabaseAdmin.from('user_portfolio_items').update({ is_public: false }).eq('id', job.subject_id);
        } else {
            await supabaseAdmin.from(SUBJECTS[job.subject_type].table).update({
                public_moderation_status: 'rejected'
            }).eq('id', job.subject_id);
        }
        await finishJob(supabaseAdmin, job, 'done', 'rejected');
        return 'rejected';
    }
    if (outcome === 'approved') {
        const locked = loaded.row && loaded.row.human_moderation_lock;
        let auditLock = locked;
        if (!auditLock) {
            const audits = await supabaseAdmin
                .from('admin_audit_events')
                .select('after_state, created_at')
                .eq('target_id', job.subject_id)
                .eq('action', 'CONTENT_MODERATION')
                .order('created_at', { ascending: false })
                .limit(1);
            const last = audits.data && audits.data[0] && audits.data[0].after_state;
            auditLock = !!(last && last.human_moderation_lock && last.human_decision && last.human_decision !== 'restore' && last.human_decision !== 'approve');
        }
        if (auditLock) {
            await finishJob(supabaseAdmin, job, 'done', 'human_lock');
            return 'human_lock';
        }
    }
    let publishFiles = files;
    if (outcome === 'approved' && job.subject_type === 'profile') {
        const fresh = await supabaseAdmin.from('profiles')
            .select('avatar_url, avatar_pending, avatar_moderation_status, bio_moderation_status')
            .eq('id', job.subject_id)
            .maybeSingle();
        if (fresh.data && avatarIdentity(fresh.data) !== avatarIdentity(loaded.row)) {
            await requeueNewerPhoto(supabaseAdmin, job);
            return 'newer_photo';
        }
        publishFiles = profileFiles(fresh.data || loaded.row);
    }
    if (outcome === 'approved') {
        await markReleases(supabaseAdmin, publishFiles, 'approved');
        if (loaded.pendingEdit) {
            const payload = loaded.pendingEdit.payload || {};
            const patch = { public_moderation_status: 'approved' };
            if (job.subject_type === 'post') {
                if (payload.content != null) patch.content = payload.content;
                if (payload.media_urls != null) patch.media_urls = payload.media_urls;
            } else if (job.subject_type === 'comment') {
                if (payload.content != null) patch.content = payload.content;
                if (payload.media_url != null) patch.media_url = payload.media_url;
            } else if (job.subject_type === 'request') {
                if (payload.title != null) patch.title = payload.title;
                if (payload.description != null) patch.description = payload.description;
            }
            await supabaseAdmin.from(SUBJECTS[job.subject_type].table).update(patch).eq('id', job.subject_id);
            await supabaseAdmin.from('content_moderation_queue').update({ status: 'approved' }).eq('id', loaded.pendingEdit.id);
        } else if (job.subject_type === 'profile') {
            await supabaseAdmin.from('profiles').update({
                bio_moderation_status: 'approved',
                avatar_moderation_status: 'approved'
            }).eq('id', job.subject_id);
        } else if (job.subject_type === 'portfolio') {
            await supabaseAdmin.from('user_portfolio_items').update({ is_public: true }).eq('id', job.subject_id);
        } else {
            await supabaseAdmin.from(SUBJECTS[job.subject_type].table).update({
                public_moderation_status: 'approved'
            }).eq('id', job.subject_id);
        }
        await finishJob(supabaseAdmin, job, 'done', 'approved');
        return 'approved';
    }
    const reason = (decision && decision.reason) || 'unavailable';
    if (job.subject_type === 'profile' && HUMAN_REASONS.has(String(reason))) {
        await finishJob(supabaseAdmin, job, 'held', reason);
        return 'held';
    }
    if (reason === 'video_unreviewed') {
        await finishJob(supabaseAdmin, job, 'held', reason);
        return 'held';
    }
    const attempts = Number(job.attempts) || 1;
    const max = Number(job.max_attempts) || 3;
    if (attempts >= max) {
        await finishJob(supabaseAdmin, job, 'held', reason);
        return 'held';
    }
    await finishJob(supabaseAdmin, job, 'retry', reason);
    return 'retry';
}

async function runModerationOnce({ supabaseAdmin, apiKey, fetchImpl, downloadMedia, limit = 10 }) {
    if (!supabaseAdmin) throw new Error('worker requires the service client');
    await supabaseAdmin.rpc('requeue_stale_moderation_jobs');
    const outcomes = [];
    for (let index = 0; index < limit; index += 1) {
        const claimed = await supabaseAdmin.rpc('claim_moderation_job');
        const job = claimed && (Array.isArray(claimed.data) ? claimed.data[0] : claimed.data);
        if (!job || !job.id) break;
        if (!SUBJECTS[job.subject_type]) {
            await finishJob(supabaseAdmin, job, 'held', 'unknown_subject');
            outcomes.push({ id: job.id, result: 'held' });
            continue;
        }
        const loaded = await loadSubject(supabaseAdmin, job);
        if (!loaded) {
            await finishJob(supabaseAdmin, job, 'done', 'missing');
            outcomes.push({ id: job.id, result: 'missing' });
            continue;
        }
        if (loaded.row.human_moderation_lock) {
            await finishJob(supabaseAdmin, job, 'done', 'human_lock');
            outcomes.push({ id: job.id, result: 'human_lock' });
            continue;
        }
        if (!loaded.pendingEdit && job.subject_type === 'profile') {
            const needs = await profileStillNeedsReview(supabaseAdmin, loaded.row);
            if (!needs) {
                await finishJob(supabaseAdmin, job, 'done', 'already_decided');
                outcomes.push({ id: job.id, result: 'already_decided' });
                continue;
            }
        } else {
            const liveStatus = loaded.row.public_moderation_status || loaded.row.bio_moderation_status;
            if (!loaded.pendingEdit && (liveStatus === 'approved' || liveStatus === 'rejected')) {
                await finishJob(supabaseAdmin, job, 'done', 'already_decided');
                outcomes.push({ id: job.id, result: 'already_decided' });
                continue;
            }
        }
        const source = loaded.pendingEdit ? { ...loaded.row, ...loaded.pendingEdit.payload } : loaded.row;
        const files = job.subject_type === 'profile' ? profileFiles(source) : urlsFromRow(source);
        let decision;
        try {
            decision = await classifyContent({
                text: job.subject_type === 'profile' ? profileText(job, loaded) : textOf(job, loaded),
                media: files,
                apiKey,
                fetchImpl: fetchImpl || global.fetch,
                inspectVideo: async (file) => {
                    const downloaded = await supabaseAdmin.storage.from(file.bucket).download(file.path);
                    if (downloaded.error || !downloaded.data) return { verified: false, reason: 'unreadable' };
                    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
                    return inspectMp4(bytes);
                },
                downloadMedia: downloadMedia || (async (media) => {
                    const images = [];
                    for (const file of normalizeMedia(media)) {
                        if (containsVideo([file])) continue;
                        const downloaded = await supabaseAdmin.storage.from(file.bucket).download(file.path);
                        if (downloaded.error || !downloaded.data) return null;
                        const bytes = Buffer.from(await downloaded.data.arrayBuffer());
                        if (!bytes.length || bytes.length > 5 * 1024 * 1024) return null;
                        const type = downloaded.data.type && downloaded.data.type.startsWith('image/')
                            ? downloaded.data.type
                            : 'image/jpeg';
                        images.push(`data:${type};base64,${bytes.toString('base64')}`);
                    }
                    return images;
                })
            });
        } catch (err) {
            decision = { decision: 'pending', reason: 'unavailable' };
        }
        const result = await applyDecision(supabaseAdmin, job, loaded, decision);
        outcomes.push({ id: job.id, subject: job.subject_type, result, reason: decision.reason || null });
    }
    return outcomes;
}

const HUMAN_REASONS = new Set(['flagged', 'sexual', 'violence', 'self-harm', 'hate', 'harassment', 'illicit']);

async function enqueueProfileReview(supabaseAdmin, userId) {
    const rpc = await supabaseAdmin.rpc('lyann_enqueue_moderation_job', { p_type: 'profile', p_id: userId });
    if (!rpc || !rpc.error) return;
    const existing = await supabaseAdmin.from('moderation_jobs').select('id, status')
        .eq('subject_type', 'profile').eq('subject_id', userId).maybeSingle();
    if (existing.data && existing.data.status === 'running') return;
    const patch = {
        status: 'queued',
        attempts: 0,
        available_at: new Date().toISOString(),
        reason_code: null,
        claimed_at: null,
        finished_at: null
    };
    if (existing.data) {
        await supabaseAdmin.from('moderation_jobs').update(patch).eq('id', existing.data.id);
        return;
    }
    await supabaseAdmin.from('moderation_jobs').insert({
        subject_type: 'profile',
        subject_id: userId,
        ...patch
    });
}

async function reviewProfileAvatar(supabaseAdmin, userId, deps) {
    if (!supabaseAdmin || !userId) return { result: 'missing' };
    const [existing, profileRes] = await Promise.all([
        supabaseAdmin.from('moderation_jobs').select('*')
            .eq('subject_type', 'profile').eq('subject_id', userId).maybeSingle(),
        supabaseAdmin.from('profiles')
            .select('avatar_url, avatar_pending, avatar_moderation_status, bio_moderation_status, bio_pending')
            .eq('id', userId).maybeSingle()
    ]);
    const current = existing.data;
    const profile = profileRes.data;
    if (!profile) return { result: 'missing' };
    if (current && current.status === 'held' && HUMAN_REASONS.has(String(current.reason_code || ''))) {
        return { result: 'held', reason: current.reason_code, needs_human: true };
    }
    if (current && current.status === 'running') return { result: 'running', reason: current.reason_code || null };
    if ((!current || current.status === 'done') && !(await profileStillNeedsReview(supabaseAdmin, profile))) {
        return { result: 'already_decided', reason: (current && current.reason_code) || null };
    }
    await enqueueProfileReview(supabaseAdmin, userId);
    let claimed = current && await supabaseAdmin.from('moderation_jobs').update({
        status: 'running',
        attempts: 1,
        claimed_at: new Date().toISOString()
    }).eq('id', current.id).in('status', ['queued', 'retry']).select('*').maybeSingle();
    if (!claimed || !claimed.data) {
        const refreshed = await supabaseAdmin.from('moderation_jobs').select('*')
            .eq('subject_type', 'profile').eq('subject_id', userId).maybeSingle();
        const job = refreshed.data;
        if (!job) return { result: 'missing' };
        if (job.status === 'running') return { result: 'running', reason: job.reason_code || null };
        if (!['queued', 'retry'].includes(job.status)) return { result: job.status, reason: job.reason_code || null };
        claimed = await supabaseAdmin.from('moderation_jobs').update({
            status: 'running',
            attempts: 1,
            claimed_at: new Date().toISOString()
        }).eq('id', job.id).in('status', ['queued', 'retry']).select('*').maybeSingle();
    }
    if (!claimed.data) return { result: 'running' };
    const loaded = await loadSubject(supabaseAdmin, claimed.data);
    if (!loaded) {
        await finishJob(supabaseAdmin, claimed.data, 'done', 'missing');
        return { result: 'missing' };
    }
    if (!(await profileStillNeedsReview(supabaseAdmin, loaded.row)) && !loaded.pendingEdit) {
        await finishJob(supabaseAdmin, claimed.data, 'done', 'already_decided');
        return { result: 'already_decided' };
    }
    const files = profileFiles(loaded.row);
    let decision;
    const analysisStarted = Date.now();
    try {
        decision = await classifyContent({
            text: profileText(claimed.data, loaded),
            media: files,
            apiKey: deps && deps.apiKey,
            fetchImpl: (deps && deps.fetchImpl) || global.fetch,
            inspectVideo: async () => ({ verified: false, reason: 'unreadable' }),
            downloadMedia: (deps && deps.downloadMedia) || (async (media) => {
                const images = [];
                for (const file of normalizeMedia(media)) {
                    if (containsVideo([file])) continue;
                    const downloaded = await supabaseAdmin.storage.from(file.bucket).download(file.path);
                    if (downloaded.error || !downloaded.data) return null;
                    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
                    if (!bytes.length || bytes.length > 5 * 1024 * 1024) return null;
                    const type = downloaded.data.type && downloaded.data.type.startsWith('image/')
                        ? downloaded.data.type
                        : 'image/jpeg';
                    images.push(`data:${type};base64,${bytes.toString('base64')}`);
                }
                return images;
            })
        });
    } catch (err) {
        decision = { decision: 'pending', reason: 'unavailable' };
    }
    const analysisMs = Date.now() - analysisStarted;
    const validationStarted = Date.now();
    const result = await applyDecision(supabaseAdmin, claimed.data, loaded, decision);
    const reason = (decision && decision.reason) || null;
    return {
        result,
        reason,
        needs_human: result === 'held' && HUMAN_REASONS.has(String(reason || '')),
        analysis_ms: analysisMs,
        validation_ms: Date.now() - validationStarted
    };
}

module.exports = {
    runModerationOnce,
    applyDecision,
    backoffSeconds,
    profileStillNeedsReview,
    reviewProfileAvatar
};
