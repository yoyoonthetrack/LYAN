'use strict';

const policy = require('../bokantaj-video-policy');
const { mediaFromStoredUrl } = require('./content-moderation');

const BUCKETS = ['bokantaj-media', 'bokantaj-media-hold'];

function objectsFromUrls(urls) {
    return (Array.isArray(urls) ? urls : []).map(mediaFromStoredUrl).filter((item) => item && BUCKETS.includes(item.bucket));
}

async function removeObjects(supabaseAdmin, objects) {
    const grouped = {};
    objects.forEach((object) => {
        if (!grouped[object.bucket]) grouped[object.bucket] = [];
        grouped[object.bucket].push(object.path);
    });
    const removed = [];
    for (const bucket of Object.keys(grouped)) {
        const paths = [...new Set(grouped[bucket])];
        const result = await supabaseAdmin.storage.from(bucket).remove(paths);
        if (result.error) throw new Error(result.error.message || 'Suppression de fichier impossible.');
        removed.push(...paths);
    }
    return removed;
}

async function releaseMedia({ supabaseAdmin, supabaseUrl, urls }) {
    if (policy.isProductionTarget(supabaseUrl)) return { skipped: 'production', removed: [] };
    const objects = objectsFromUrls(urls);
    if (!objects.length) return { removed: [] };
    const removed = await removeObjects(supabaseAdmin, objects);
    return { removed };
}

async function clearPostMedia(supabaseAdmin, postId) {
    await supabaseAdmin.from('bokantaj_posts').update({ media_urls: [] }).eq('id', postId);
}

async function listBucket(supabaseAdmin, bucket) {
    const root = await supabaseAdmin.storage.from(bucket).list('', { limit: 1000 });
    if (root.error) throw new Error(root.error.message || 'Lecture du stockage impossible.');
    const objects = [];
    for (const entry of root.data || []) {
        if (!entry || !entry.name) continue;
        const nested = await supabaseAdmin.storage.from(bucket).list(entry.name, { limit: 1000 });
        if (nested.error || !nested.data || !nested.data.length) continue;
        nested.data.forEach((file) => {
            if (!file || !file.name || file.id == null && !file.metadata) return;
            objects.push({
                bucket,
                path: `${entry.name}/${file.name}`,
                created_at: file.created_at,
                size: file.metadata && file.metadata.size || 0
            });
        });
    }
    return objects;
}

async function referencedPaths(supabaseAdmin) {
    let rows = await supabaseAdmin.from('bokantaj_posts').select('id, media_urls, public_moderation_status, human_decision');
    if (rows.error && /human_decision/i.test(rows.error.message || '')) {
        rows = await supabaseAdmin.from('bokantaj_posts').select('id, media_urls, public_moderation_status');
    }
    if (rows.error) throw new Error(rows.error.message || 'Lecture des publications impossible.');
    const keep = new Set();
    const rejected = [];
    (rows.data || []).forEach((row) => {
        const urls = Array.isArray(row.media_urls) ? row.media_urls : [];
        if (row.human_decision === 'reject') {
            rejected.push(row);
            return;
        }
        urls.forEach((url) => {
            const object = mediaFromStoredUrl(url);
            if (object) keep.add(object.path);
        });
    });
    return { keep, rejected };
}

async function sweep({ supabaseAdmin, supabaseUrl, now, apply }) {
    if (policy.isProductionTarget(supabaseUrl)) return { skipped: 'production', removed: [], volume: { files: 0, bytes: 0 } };
    const listed = [];
    for (const bucket of BUCKETS) listed.push(...await listBucket(supabaseAdmin, bucket));
    const refs = await referencedPaths(supabaseAdmin);
    const orphans = policy.selectOrphans(listed, refs.keep, now || Date.now());
    const rejectedObjects = refs.rejected.flatMap((row) => objectsFromUrls(row.media_urls));
    const doomed = orphans.concat(rejectedObjects.filter((object) => !refs.keep.has(object.path)));
    const unique = [];
    const seen = new Set();
    doomed.forEach((object) => {
        const key = `${object.bucket}/${object.path}`;
        if (seen.has(key)) return;
        seen.add(key);
        unique.push(object);
    });
    let removed = [];
    if (apply && unique.length) {
        removed = await removeObjects(supabaseAdmin, unique);
        for (const row of refs.rejected) {
            if ((row.media_urls || []).length) await clearPostMedia(supabaseAdmin, row.id);
        }
    }
    return {
        volume: policy.volumeOf(listed),
        orphans: orphans.length,
        rejected: refs.rejected.length,
        removed
    };
}

module.exports = {
    objectsFromUrls,
    releaseMedia,
    clearPostMedia,
    sweep
};
