'use strict';

const MAX_SECONDS = 60;
// Stored size, after the client re-encodes. Phones shoot far above it, so the
// picked file is allowed to be much larger and is converted before upload.
const MAX_BYTES = 40 * 1024 * 1024;
const MAX_SOURCE_BYTES = 512 * 1024 * 1024;
const MAX_LONG_EDGE = 1920;
const MAX_SHORT_EDGE = 1080;
const PIN_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const TRAFFIC_PIN_MS = 24 * 60 * 60 * 1000;
const ORPHAN_MIN_AGE_MS = 48 * 60 * 60 * 1000;
const PRODUCTION_REF = 'gzispjfoywklpqatjyop';

function videoKind(file) {
    const mime = String(file && file.type || '').toLowerCase();
    const name = String(file && file.name || '').toLowerCase();
    if (mime === 'video/mp4' || mime === 'video/x-m4v' || name.endsWith('.mp4') || name.endsWith('.m4v')) {
        return { mime: 'video/mp4', ext: 'mp4' };
    }
    if (mime === 'video/quicktime' || name.endsWith('.mov')) {
        return { mime: 'video/quicktime', ext: 'mov' };
    }
    if (mime === 'video/webm' || name.endsWith('.webm')) {
        return { mime: 'video/webm', ext: 'webm' };
    }
    if (mime === 'video/mov' || mime === 'video/x-quicktime') {
        return { mime: 'video/quicktime', ext: 'mov' };
    }
    if (mime.startsWith('video/')) {
        return { mime: mime, ext: 'mp4' };
    }
    return null;
}

// A file whose duration no decoder could read cannot be re-encoded either, so
// it may only be attached when it already fits the stored limit.
function canAttachWithoutDuration(file) {
    return Boolean(videoKind(file) && file && file.size > 0 && file.size <= MAX_BYTES);
}

function needsReencode(file, meta, clip) {
    const bytes = Number(file && file.size) || 0;
    if (bytes > MAX_BYTES) return true;
    const width = Number(meta && meta.width) || 0;
    const height = Number(meta && meta.height) || 0;
    if (Math.max(width, height) > MAX_LONG_EDGE || Math.min(width, height) > MAX_SHORT_EDGE) return true;
    const duration = Number(meta && meta.duration);
    if (!clip || !Number.isFinite(duration)) return false;
    return Math.abs((Number(clip.end) - Number(clip.start)) - duration) >= 0.3;
}

function clipWindow(duration, start, end) {
    const total = Number(duration);
    if (!Number.isFinite(total) || total <= 0) return { ok: false, reason: 'duration' };
    const hasWindow = Number.isFinite(Number(start)) || Number.isFinite(Number(end));
    if (total > MAX_SECONDS + 0.05 && !hasWindow) return { ok: false, reason: 'needs_trim' };
    let from = Number.isFinite(Number(start)) ? Number(start) : 0;
    let to = Number.isFinite(Number(end)) ? Number(end) : Math.min(total, from + MAX_SECONDS);
    from = Math.max(0, Math.min(from, total));
    to = Math.max(0, Math.min(to, total));
    if (to < from) to = from;
    if (to - from > MAX_SECONDS) to = from + MAX_SECONDS;
    if (to - from < 0.4) return { ok: false, reason: 'window' };
    return { ok: true, start: round3(from), end: round3(Math.min(to, total)), seconds: round3(Math.min(to, total) - from) };
}

function round3(value) {
    return Math.round(value * 1000) / 1000;
}

// The feed downloads the whole private file before playing it, so quality is
// pushed as far as 1080p allows while keeping a minute under the stored limit.
function targetVideoBitsPerSecond(seconds) {
    const span = Math.max(1, Number(seconds) || 1);
    const budgetBits = (MAX_BYTES - 3 * 1024 * 1024) * 8;
    return Math.max(600000, Math.min(5000000, Math.floor(budgetBits / span)));
}

function fitFrame(width, height) {
    const w = Math.max(2, Number(width) || MAX_LONG_EDGE);
    const h = Math.max(2, Number(height) || MAX_SHORT_EDGE);
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(w, h), MAX_SHORT_EDGE / Math.min(w, h));
    return {
        width: Math.max(2, Math.round((w * scale) / 2) * 2),
        height: Math.max(2, Math.round((h * scale) / 2) * 2)
    };
}

// The poster carries the frame size in its name, so a card can reserve the
// real shape of the clip before fetching anything. Names without it stay valid.
const POSTER_PATTERN = /-poster(?:-(\d+)x(\d+))?\.jpe?g(?:[?#]|$)/i;

function posterName(id, width, height) {
    const w = Math.round(Number(width) || 0);
    const h = Math.round(Number(height) || 0);
    return w > 0 && h > 0 ? `${id}-poster-${w}x${h}.jpg` : `${id}-poster.jpg`;
}

function isPosterUrl(url) {
    return POSTER_PATTERN.test(String(url || ''));
}

function posterRatio(url) {
    const match = POSTER_PATTERN.exec(String(url || ''));
    const width = Number(match && match[1]);
    const height = Number(match && match[2]);
    if (!(width > 0) || !(height > 0)) return null;
    return { width, height };
}

function posterFor(videoUrl, urls) {
    const base = String(videoUrl || '').split(/[?#]/)[0].replace(/\.(mp4|mov|webm|m4v)$/i, '');
    if (!base) return '';
    return (Array.isArray(urls) ? urls : []).find((url) => {
        const clean = String(url || '').split(/[?#]/)[0];
        return clean.startsWith(`${base}-poster`) && POSTER_PATTERN.test(clean);
    }) || '';
}

function playbackMarkup(videoUrl, posterUrl) {
    const video = escapeAttr(videoUrl);
    const poster = escapeAttr(posterUrl);
    const ratio = posterRatio(posterUrl);
    const shaped = ratio ? ' has-media-ratio' : '';
    const style = ratio ? ` style="--media-ratio:${ratio.width} / ${ratio.height}"` : '';
    const image = poster
        ? `<img src="${poster}" alt="" class="bokantaj-video-poster-image">`
        : '';
    return `<button type="button" class="bokantaj-video-poster${shaped}" data-video-src="${video}"${style}>${image}<span>Lire la vidéo</span></button>`;
}

function escapeAttr(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
}

function mapPinVisible(post, now) {
    if (!post || post.public_moderation_status !== 'approved') return false;
    if (post.map_featured === true || post.map_pin_permanent === true) return true;
    const created = Date.parse(post.created_at);
    if (!Number.isFinite(created)) return false;
    const age = Number(now) - created;
    if (post.type === 'trafic') return age <= TRAFFIC_PIN_MS;
    return age <= PIN_MAX_MS;
}

function pinExpiryEffect() {
    return { hidePinOnly: true, deletePost: false, deletePhotos: false, deleteVideo: false };
}

function inspectMp4(input) {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
    if (buffer.length < 32 || buffer.length > MAX_BYTES) return { verified: false, reason: 'size' };
    if (buffer.slice(4, 8).toString('ascii') !== 'ftyp') return { verified: false, reason: 'container' };
    const mvhd = buffer.indexOf('mvhd');
    if (mvhd < 0 || mvhd + 24 > buffer.length) return { verified: false, reason: 'duration_unreadable' };
    const version = buffer[mvhd + 4];
    let timescale = 0;
    let duration = 0;
    if (version === 0 && mvhd + 24 <= buffer.length) {
        timescale = buffer.readUInt32BE(mvhd + 16);
        duration = buffer.readUInt32BE(mvhd + 20);
    } else if (version === 1 && mvhd + 40 <= buffer.length) {
        timescale = buffer.readUInt32BE(mvhd + 28);
        duration = buffer.readUInt32BE(mvhd + 32) * 4294967296 + buffer.readUInt32BE(mvhd + 36);
    } else {
        return { verified: false, reason: 'duration_unreadable' };
    }
    if (!timescale) return { verified: false, reason: 'duration_unreadable' };
    const seconds = duration / timescale;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_SECONDS + 0.5) {
        return { verified: false, reason: 'duration' };
    }
    const tkhd = buffer.indexOf('tkhd');
    const tkhdVersion = tkhd >= 0 ? buffer[tkhd + 4] : -1;
    const widthOffset = tkhdVersion === 1 ? 92 : 80;
    if (tkhd < 0 || tkhd + widthOffset + 8 > buffer.length) return { verified: false, reason: 'frame_unreadable' };
    const width = buffer.readUInt32BE(tkhd + widthOffset) / 65536;
    const height = buffer.readUInt32BE(tkhd + widthOffset + 4) / 65536;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) {
        return { verified: false, reason: 'frame_unreadable' };
    }
    const longEdge = Math.max(width, height);
    const shortEdge = Math.min(width, height);
    if (longEdge > MAX_LONG_EDGE + 2 || shortEdge > MAX_SHORT_EDGE + 2) {
        return { verified: false, reason: 'frame' };
    }
    return { verified: true, seconds: round3(seconds), width, height, bytes: buffer.length };
}

function isProductionTarget(url) {
    return String(url || '').includes(PRODUCTION_REF);
}

function mediaDeletionAllowed(event) {
    return event === 'reject' || event === 'delete' || event === 'abandon';
}

function selectOrphans(objects, referenced, now) {
    const keep = referenced instanceof Set ? referenced : new Set(referenced || []);
    const clock = Number(now) || Date.now();
    return (objects || []).filter((object) => {
        const path = object && object.path;
        if (!path || keep.has(path)) return false;
        const created = Date.parse(object.created_at);
        return Number.isFinite(created) && clock - created >= ORPHAN_MIN_AGE_MS;
    });
}

function volumeOf(objects) {
    const files = Array.isArray(objects) ? objects : [];
    const bytes = files.reduce((sum, object) => sum + (Number(object && object.size) || 0), 0);
    return { files: files.length, bytes };
}

const api = {
    MAX_SECONDS,
    MAX_BYTES,
    MAX_SOURCE_BYTES,
    MAX_LONG_EDGE,
    MAX_SHORT_EDGE,
    PIN_MAX_MS,
    TRAFFIC_PIN_MS,
    ORPHAN_MIN_AGE_MS,
    PRODUCTION_REF,
    videoKind,
    canAttachWithoutDuration,
    needsReencode,
    clipWindow,
    targetVideoBitsPerSecond,
    fitFrame,
    isPosterUrl,
    posterName,
    posterRatio,
    posterFor,
    playbackMarkup,
    mapPinVisible,
    pinExpiryEffect,
    inspectMp4,
    isProductionTarget,
    mediaDeletionAllowed,
    selectOrphans,
    volumeOf
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.LYANN_BOKANTAJ_VIDEO_POLICY = api;
