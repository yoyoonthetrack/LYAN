'use strict';

const {
    classifyContent,
    containsVideo,
    mediaFromStoredUrl,
    normalizeMedia
} = require('./content-moderation');

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

function textOf(job, loaded) {
    const row = loaded.row;
    const payload = loaded.pendingEdit && loaded.pendingEdit.payload;
    if (payload) return [payload.title, payload.description, payload.content].filter(Boolean).join('\n');
    if (job.subject_type === 'request') return [row.title, row.description].filter(Boolean).join('\n');
    if (job.subject_type === 'portfolio') return [row.title, row.caption].filter(Boolean).join('\n');
    if (job.subject_type === 'profile') return row.bio_pending || row.bio || '';
    return row.content || '';
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
    if (outcome === 'approved' && containsVideo(files)) {
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
        await markReleases(supabaseAdmin, files, 'approved');
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
        const liveStatus = loaded.row.public_moderation_status || loaded.row.bio_moderation_status;
        if (!loaded.pendingEdit && (liveStatus === 'approved' || liveStatus === 'rejected')) {
            await finishJob(supabaseAdmin, job, 'done', 'already_decided');
            outcomes.push({ id: job.id, result: 'already_decided' });
            continue;
        }
        const files = urlsFromRow(loaded.pendingEdit ? { ...loaded.row, ...loaded.pendingEdit.payload } : loaded.row);
        let decision;
        try {
            decision = await classifyContent({
                text: textOf(job, loaded),
                media: files,
                apiKey,
                fetchImpl: fetchImpl || global.fetch,
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

module.exports = {
    runModerationOnce,
    applyDecision,
    backoffSeconds
};
