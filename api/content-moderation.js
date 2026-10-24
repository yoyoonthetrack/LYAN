'use strict';

const MODEL = 'omni-moderation-latest';
const REJECT_MESSAGE = 'Ce contenu ne peut pas être publié.';
const REVIEW_EDIT_MESSAGE = 'Votre modification est en cours de vérification. La version déjà publiée reste visible.';
const PUBLIC_MEDIA_BUCKETS = Object.freeze([
    'bokantaj-media',
    'avatars',
    'profile-images',
    'request-photos'
]);
const PRIVATE_MEDIA_BUCKETS = Object.freeze([
    'bokantaj-media-hold',
    'avatars-hold',
    'portfolio-images-hold',
    'request-photos-hold'
]);
const MEDIA_BUCKETS = Object.freeze([...PUBLIC_MEDIA_BUCKETS, ...PRIVATE_MEDIA_BUCKETS]);
const NOTICE_PENDING = 'Votre publication est en cours de vérification.';
const NOTICE_PHOTO = 'Votre photo est en cours de vérification.';
const NOTICE_VISIBLE = 'Votre publication est maintenant visible.';
const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'm4v']);

// High scores refuse. A flagged or intermediate score waits for an administrator.
// Ordinary text, including Creole that the model does not flag, is published.
const REJECT_SCORE = Object.freeze({
    'sexual/minors': 0.2,
    sexual: 0.85,
    'violence/graphic': 0.8,
    violence: 0.92,
    'hate/threatening': 0.75,
    'harassment/threatening': 0.75,
    'illicit/violent': 0.75,
    illicit: 0.88,
    'self-harm/instructions': 0.7,
    'self-harm/intent': 0.8,
    'self-harm': 0.9,
    hate: 0.88,
    harassment: 0.92
});
const REVIEW_SCORE = 0.45;
// A public image on a 13+ service is not published on a moderate sexual or
// graphic score. The model can leave that score under its own flag and under
// the text review line. A person still has to accept it.
const IMAGE_HOLD_SCORE = Object.freeze({
    sexual: 0.2,
    'sexual/minors': 0.05,
    'violence/graphic': 0.2
});

const PLACEHOLDER_PENDING = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
<rect width="1200" height="900" fill="#F4F0E8"/>
<text x="600" y="430" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="#1E2822">Photo en cours de vérification</text>
<text x="600" y="490" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="#5C675F">Elle sera visible après contrôle.</text>
</svg>`;

const PLACEHOLDER_REJECTED = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
<rect width="1200" height="900" fill="#F4F0E8"/>
<text x="600" y="450" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="#1E2822">Cette photo n'a pas été publiée</text>
</svg>`;

function reviewFloor(name, hasImage) {
    if (hasImage && IMAGE_HOLD_SCORE[name] != null) return IMAGE_HOLD_SCORE[name];
    return REVIEW_SCORE;
}

function decideModeration(result, options) {
    if (!result || typeof result !== 'object' || !result.category_scores) {
        return { decision: 'pending', reason: 'unavailable' };
    }
    const hasImage = Boolean(options && options.hasImage);
    const scores = result.category_scores;
    const categories = result.categories || {};
    let reviewName = null;
    let reviewScore = 0;
    for (const [name, raw] of Object.entries(scores)) {
        const score = Number(raw);
        if (!Number.isFinite(score)) continue;
        const rejectAt = REJECT_SCORE[name];
        if (rejectAt != null && score >= rejectAt) {
            return { decision: 'rejected', reason: name, score };
        }
        const floor = reviewFloor(name, hasImage);
        const interesting = categories[name] === true || score >= floor;
        if (interesting && score >= reviewScore) {
            reviewScore = score;
            reviewName = name;
        }
    }
    if (result.flagged === true || (reviewName && reviewScore >= reviewFloor(reviewName, hasImage))) {
        return { decision: 'pending', reason: reviewName || 'flagged', score: reviewScore };
    }
    return { decision: 'approved', reason: 'clear' };
}

function extensionOf(path) {
    const clean = String(path || '').split('?')[0].split('#')[0];
    const dot = clean.lastIndexOf('.');
    return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase();
}

function containsVideo(media) {
    return (media || []).some((item) => VIDEO_EXT.has(extensionOf(item && (item.path || item.ext))));
}

function combineDecisions(textDecision, media) {
    const decision = textDecision && textDecision.decision;
    if (decision === 'rejected') return textDecision;
    if (containsVideo(media)) return { decision: 'pending', reason: 'video_unreviewed' };
    if (decision === 'pending') return textDecision;
    if (decision === 'approved') return textDecision;
    return { decision: 'pending', reason: 'unavailable' };
}

function normalizeMedia(media) {
    return (Array.isArray(media) ? media : []).map((item) => {
        const bucket = String(item && item.bucket || '').trim();
        const path = String(item && item.path || '').replace(/^\/+/, '');
        return { bucket, path };
    }).filter((item) => MEDIA_BUCKETS.includes(item.bucket)
        && item.path
        && !item.path.includes('..')
        && !item.path.includes('\\'));
}

function publicationNotice({ status, hasImage, hasVideo, edited } = {}) {
    if (status === 'rejected') return { tone: 'warning', message: REJECT_MESSAGE };
    if (status === 'pending') {
        if (hasImage && !hasVideo) return { tone: 'success', message: NOTICE_PHOTO };
        return { tone: 'success', message: NOTICE_PENDING };
    }
    if (status === 'approved' && edited) return { tone: 'success', message: REVIEW_EDIT_MESSAGE };
    if (status === 'approved') return { tone: 'success', message: NOTICE_VISIBLE };
    return null;
}

function storagePublicUrlParts(url) {
    const match = String(url || '').match(
        /^https:\/\/([a-z0-9-]+)\.supabase\.co\/storage\/v1\/object\/public\/([a-z0-9_-]+)\/([^?#]+)/i
    );
    if (!match) return null;
    return { projectRef: match[1], bucket: match[2], path: decodeURIComponent(match[3]) };
}

function gatewayUrlForStorage(url, origin) {
    const parts = storagePublicUrlParts(url);
    if (!parts || !MEDIA_BUCKETS.includes(parts.bucket)) return url;
    const base = String(origin || 'https://lyann.app').replace(/\/$/, '');
    return `${base}/v1/media/${parts.bucket}/${parts.path.split('/').map(encodeURIComponent).join('/')}`;
}

function gatewayUrlForPrivateObject(origin, bucket, objectPath) {
    const base = String(origin || 'https://lyann.app').replace(/\/$/, '');
    const encoded = String(objectPath || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return `${base}/v1/media/${bucket}/${encoded}`;
}

function objectIsPubliclyFetchable({ bucketPublic }) {
    // A public Supabase bucket serves /object/public even when storage RLS would deny the read.
    // A private bucket never does, including after the file is approved.
    return bucketPublic === true;
}

function mediaFromStoredUrl(url) {
    const gateway = String(url || '').match(/\/v1\/media\/([a-z0-9_-]+)\/([^?#]+)/i);
    if (gateway && MEDIA_BUCKETS.includes(gateway[1])) {
        return { bucket: gateway[1], path: decodeURIComponent(gateway[2]) };
    }
    const storage = storagePublicUrlParts(url);
    if (!storage || !MEDIA_BUCKETS.includes(storage.bucket)) return null;
    return { bucket: storage.bucket, path: storage.path };
}

function postVisibleTo({ status, authorId, viewerId, isAdmin }) {
    if (status === 'approved') return true;
    if (isAdmin) return true;
    if (viewerId && viewerId === authorId && status !== 'rejected') return true;
    return false;
}

function requestVisibleTo({ status, authorId, viewerId, isAdmin }) {
    if (status === 'approved') return true;
    if (isAdmin) return true;
    if (viewerId && viewerId === authorId && status !== 'rejected') return true;
    return false;
}

function explorerRowIsPublic(row) {
    if (!row || row.visibility !== 'PUBLIC' || row.status !== 'OPEN') return false;
    if (row.target_user_id) return false;
    if (row.public_moderation_status == null) return true;
    return row.public_moderation_status === 'approved';
}

function mediaAccess(release, bucket, viewer) {
    if (!MEDIA_BUCKETS.includes(bucket)) return 'denied';
    const ownerId = String((viewer && viewer.ownerId) || '');
    const privileged = Boolean(viewer && (viewer.isAdmin || (viewer.id && ownerId && viewer.id === ownerId)));
    if (!release) {
        if (privileged && PRIVATE_MEDIA_BUCKETS.includes(bucket)) return 'stream';
        return 'missing';
    }
    if (release.status === 'approved') return 'stream';
    if (privileged && release.status !== 'rejected') return 'stream';
    if (release.kind === 'video' || release.status === 'rejected') return release.status === 'rejected' ? 'rejected' : 'hidden';
    if (release.status === 'pending') return 'placeholder';
    return 'hidden';
}

function isPosterPath(path) {
    return /-poster\.jpe?g$/i.test(String(path || '').split(/[?#]/)[0]);
}

async function decideVideoRelease({ textDecision, files, inspectVideo, downloadMedia, apiKey, fetchImpl }) {
    if (textDecision && textDecision.decision === 'rejected') return textDecision;
    if (typeof inspectVideo !== 'function') return { decision: 'pending', reason: 'video_unreviewed' };
    const videos = files.filter((file) => VIDEO_EXT.has(extensionOf(file.path)));
    const posters = files.filter((file) => isPosterPath(file.path));
    if (!videos.length || posters.length < videos.length) return { decision: 'pending', reason: 'video_unverified' };
    for (const video of videos) {
        let report = null;
        try { report = await inspectVideo(video); } catch (err) { report = null; }
        if (!report || report.verified !== true) return { decision: 'pending', reason: 'video_unverified' };
    }
    if (typeof downloadMedia !== 'function') return { decision: 'pending', reason: 'video_unverified' };
    let posterImages;
    try { posterImages = await downloadMedia(posters); } catch (err) { return { decision: 'pending', reason: 'video_unverified' }; }
    if (!Array.isArray(posterImages) || posterImages.length !== posters.length || posterImages.some((image) => !image)) {
        return { decision: 'pending', reason: 'video_unverified' };
    }
    const posterDecision = await moderateInput(fetchImpl, apiKey, posterImages.map((image) => ({
        type: 'image_url',
        image_url: { url: image }
    })), true);
    if (!posterDecision) return { decision: 'pending', reason: 'video_unverified' };
    if (posterDecision.decision !== 'approved') return posterDecision;
    if (textDecision && textDecision.decision === 'pending') return textDecision;
    return { decision: 'approved', reason: 'video_checked' };
}

async function classifyContent({ text, media, apiKey, fetchImpl, downloadMedia, inspectVideo }) {
    const files = normalizeMedia(media);
    const trimmed = String(text || '').trim();
    if (!trimmed && files.length === 0) return { decision: 'approved', reason: 'empty' };
    if (!apiKey || typeof fetchImpl !== 'function') {
        return combineDecisions({ decision: 'pending', reason: 'unconfigured' }, files);
    }
    if (containsVideo(files)) {
        const textDecision = trimmed
            ? await classifyContent({ text: trimmed, media: [], apiKey, fetchImpl, downloadMedia })
            : { decision: 'approved', reason: 'clear' };
        return decideVideoRelease({ textDecision, files, inspectVideo, downloadMedia, apiKey, fetchImpl });
    }

    let images = [];
    if (files.length && typeof downloadMedia === 'function') {
        try {
            images = await downloadMedia(files);
        } catch (err) {
            return { decision: 'pending', reason: 'media_unreadable' };
        }
        if (!Array.isArray(images) || images.length !== files.length || images.some((image) => !image)) {
            return { decision: 'pending', reason: 'media_unreadable' };
        }
    } else if (files.length) {
        return { decision: 'pending', reason: 'media_unreadable' };
    }

    const textDecision = trimmed
        ? await moderateInput(fetchImpl, apiKey, [{ type: 'text', text: trimmed.slice(0, 8000) }], false)
        : { decision: 'approved', reason: 'clear' };
    if (!textDecision) return { decision: 'pending', reason: 'unavailable' };
    if (textDecision.decision === 'rejected') return combineDecisions(textDecision, files);
    if (images.length === 0) return combineDecisions(textDecision, files);

    const imageDecision = await moderateInput(fetchImpl, apiKey, images.map((image) => ({
        type: 'image_url',
        image_url: { url: image }
    })), true);
    if (!imageDecision) return { decision: 'pending', reason: 'unavailable' };
    if (imageDecision.decision !== 'approved') return combineDecisions(imageDecision, files);
    return combineDecisions(textDecision, files);
}

async function moderateInput(fetchImpl, apiKey, input, hasImage) {
    let response;
    try {
        response = await fetchImpl('https://api.openai.com/v1/moderations', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ model: MODEL, input })
        });
    } catch (err) {
        return null;
    }
    if (!response || !response.ok) return null;
    let body;
    try {
        body = await response.json();
    } catch (err) {
        return null;
    }
    const result = body && Array.isArray(body.results) ? body.results[0] : null;
    return decideModeration(result, { hasImage });
}

module.exports = {
    MODEL,
    REJECT_MESSAGE,
    REVIEW_EDIT_MESSAGE,
    PUBLIC_MEDIA_BUCKETS,
    PRIVATE_MEDIA_BUCKETS,
    MEDIA_BUCKETS,
    NOTICE_PENDING,
    NOTICE_PHOTO,
    NOTICE_VISIBLE,
    PLACEHOLDER_PENDING,
    PLACEHOLDER_REJECTED,
    decideModeration,
    combineDecisions,
    containsVideo,
    normalizeMedia,
    storagePublicUrlParts,
    gatewayUrlForStorage,
    gatewayUrlForPrivateObject,
    mediaFromStoredUrl,
    publicationNotice,
    objectIsPubliclyFetchable,
    postVisibleTo,
    requestVisibleTo,
    explorerRowIsPublic,
    mediaAccess,
    classifyContent
};
