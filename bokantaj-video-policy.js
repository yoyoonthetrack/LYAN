'use strict';

const MAX_SECONDS = 60;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_LONG_EDGE = 1280;
const MAX_SHORT_EDGE = 720;
const PIN_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const TRAFFIC_PIN_MS = 24 * 60 * 60 * 1000;
const ORPHAN_MIN_AGE_MS = 48 * 60 * 60 * 1000;
const PRODUCTION_REF = 'gzispjfoywklpqatjyop';

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

function targetVideoBitsPerSecond(seconds) {
    const span = Math.max(1, Number(seconds) || 1);
    const budgetBits = 9 * 1024 * 1024 * 8;
    return Math.max(250000, Math.min(1200000, Math.floor(budgetBits / span)));
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

function isPosterUrl(url) {
    return /-poster\.jpe?g(?:[?#]|$)/i.test(String(url || ''));
}

function posterFor(videoUrl, urls) {
    const base = String(videoUrl || '').split(/[?#]/)[0].replace(/\.(mp4|mov|webm|m4v)$/i, '');
    if (!base) return '';
    return (Array.isArray(urls) ? urls : []).find((url) => String(url || '').split(/[?#]/)[0] === `${base}-poster.jpg`) || '';
}

function playbackMarkup(videoUrl, posterUrl) {
    const video = escapeAttr(videoUrl);
    const poster = escapeAttr(posterUrl);
    const image = poster
        ? `<img src="${poster}" alt="" class="bokantaj-video-poster-image">`
        : '';
    return `<button type="button" class="bokantaj-video-poster" data-video-src="${video}">${image}<span>Lire la vidéo</span></button>`;
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
    MAX_LONG_EDGE,
    MAX_SHORT_EDGE,
    PIN_MAX_MS,
    TRAFFIC_PIN_MS,
    ORPHAN_MIN_AGE_MS,
    PRODUCTION_REF,
    clipWindow,
    targetVideoBitsPerSecond,
    fitFrame,
    isPosterUrl,
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
