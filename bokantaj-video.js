/* LYANN — Bokantaj vidéo V1.6. Shared Web, iOS and Android WebView.
 * The file is fetched only after the member presses play.
 */
(function () {
    'use strict';

    const policy = window.LYANN_BOKANTAJ_VIDEO_POLICY;
    if (!policy) return;

    // Re-encoding runs in real time, so a 60 s clip needs more than a minute.
    const ENCODE_GRACE_MS = 20000;
    const PREPARE_DEADLINE_MS = 150000;
    const FAST_DEADLINE_MS = 60000;
    const POSTER_DEADLINE_MS = 30000;

    // Each step below waits on media events that some WebViews never fire;
    // without a deadline the composer stays on "Préparation" forever.
    function withDeadline(promise, ms, message) {
        return new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error(message)), ms);
            promise.then(
                (value) => { window.clearTimeout(timer); resolve(value); },
                (err) => { window.clearTimeout(timer); reject(err); }
            );
        });
    }

    function readMeta(file) {
        return new Promise((resolve) => {
            const url = URL.createObjectURL(file);
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.muted = true;
            video.playsInline = true;
            let settled = false;
            const finish = (meta) => {
                if (settled) return;
                settled = true;
                URL.revokeObjectURL(url);
                resolve(meta);
            };
            const timeout = window.setTimeout(() => finish({
                duration: video.duration,
                width: video.videoWidth,
                height: video.videoHeight
            }), 8000);
            video.onloadedmetadata = () => {
                if (Number.isFinite(video.duration) && video.duration > 0) {
                    window.clearTimeout(timeout);
                    finish({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
                    return;
                }
                video.onseeked = () => {
                    window.clearTimeout(timeout);
                    finish({
                        duration: Number.isFinite(video.duration) ? video.duration : NaN,
                        width: video.videoWidth,
                        height: video.videoHeight
                    });
                };
                try { video.currentTime = 1e10; } catch (err) {
                    window.clearTimeout(timeout);
                    finish({ duration: NaN, width: video.videoWidth, height: video.videoHeight });
                }
            };
            video.onloadeddata = () => {
                if (Number.isFinite(video.duration) && video.duration > 0) {
                    window.clearTimeout(timeout);
                    finish({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
                }
            };
            video.onerror = () => {
                window.clearTimeout(timeout);
                finish({ duration: NaN, width: 0, height: 0 });
            };
            video.src = url;
        });
    }

    function grabPoster(file, at) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const video = document.createElement('video');
            video.preload = 'auto';
            video.muted = true;
            video.playsInline = true;
            let settled = false;
            const finish = (err, blob) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timer);
                URL.revokeObjectURL(url);
                if (blob) resolve(blob);
                else reject(err || new Error('La miniature n’a pas pu être créée.'));
            };
            // A 4K gallery file needs several seconds just to load and seek on
            // a phone; 3 s gave up on exactly the files that matter most.
            const timer = window.setTimeout(() => finish(new Error('La miniature n’a pas pu être créée.')), 12000);
            video.onerror = () => {
                finish(new Error('La miniature n’a pas pu être créée.'));
            };
            video.onloadeddata = async () => {
                const seekTo = Math.min(Math.max(0, at || 0), Math.max(0, (video.duration || 1) - 0.05));
                let rotation = 0;
                try {
                    const head = await file.slice(0, 131072).arrayBuffer();
                    const known = policy.mp4HasTkhd ? policy.mp4HasTkhd(head) : false;
                    rotation = known && policy.mp4Rotation ? policy.mp4Rotation(head) : 0;
                    if (!known && policy.mp4RotationScan && file.size > 131072) {
                        const tail = await file.slice(Math.max(0, file.size - 262144)).arrayBuffer();
                        rotation = policy.mp4RotationScan(tail);
                    }
                } catch (_) {}
                const draw = () => {
                    const isSwapped = rotation === 90 || rotation === 270;
                    const vw = video.videoWidth || 1920;
                    const vh = video.videoHeight || 1080;
                    const displayW = isSwapped ? vh : vw;
                    const displayH = isSwapped ? vw : vh;
                    const frame = policy.fitFrame(displayW, displayH);
                    const canvas = document.createElement('canvas');
                    canvas.width = frame.width;
                    canvas.height = frame.height;
                    const context = canvas.getContext('2d');
                    if (rotation === 90) {
                        context.translate(frame.width, 0);
                        context.rotate(Math.PI / 2);
                        context.drawImage(video, 0, 0, frame.height, frame.width);
                    } else if (rotation === 270) {
                        context.translate(0, frame.height);
                        context.rotate(-Math.PI / 2);
                        context.drawImage(video, 0, 0, frame.height, frame.width);
                    } else if (rotation === 180) {
                        context.translate(frame.width, frame.height);
                        context.rotate(Math.PI);
                        context.drawImage(video, 0, 0, frame.width, frame.height);
                    } else {
                        context.drawImage(video, 0, 0, frame.width, frame.height);
                    }
                    canvas.toBlob((blob) => finish(null, blob), 'image/jpeg', 0.82);
                };
                video.onseeked = draw;
                // Seeking to 0 when the player is already at 0 does not fire
                // seeked on many WebViews, leaving the poster Promise pending.
                if (Math.abs(video.currentTime - seekTo) < 0.02) {
                    draw();
                } else {
                    try { video.currentTime = seekTo; } catch (err) { draw(); }
                }
            };
            video.src = url;
        });
    }

    function recordClip(file, start, end) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const video = document.createElement('video');
            // Keep the audio source unmuted for capture. The Web Audio graph
            // routes it only into the recorder, not to the device speakers.
            video.muted = false;
            video.playsInline = true;
            video.preload = 'auto';
            video.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('La vidéo ne peut pas être lue pour le découpage.'));
            };
            // iOS fires neither loadeddata nor error for some gallery MOV files.
            const openWatch = window.setTimeout(() => {
                URL.revokeObjectURL(url);
                reject(new Error('Cette vidéo ne peut pas être préparée sur cet appareil. Choisissez un MP4 de 40 Mo maximum.'));
            }, 12000);
            video.onloadeddata = async () => {
                window.clearTimeout(openWatch);
                const frame = policy.fitFrame(video.videoWidth, video.videoHeight);
                const canvas = document.createElement('canvas');
                canvas.width = frame.width;
                canvas.height = frame.height;
                const context = canvas.getContext('2d');
                if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
                    URL.revokeObjectURL(url);
                    const error = new Error('Cet appareil ne peut pas convertir la vidéo. Choisissez un MP4 de 60 secondes et 40 Mo maximum.');
                    error.code = 'encode_unsupported';
                    reject(error);
                    return;
                }
                const mime = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')
                    ? 'video/mp4;codecs=avc1,mp4a.40.2'
                    : (MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : '');
                if (!mime) {
                    URL.revokeObjectURL(url);
                    reject(new Error('Cet appareil ne peut pas exporter un MP4 avec le son. Choisissez un MP4 déjà raccourci.'));
                    return;
                }
                let stream, audioContext;
                const cleanAudio = () => {
                    if (stream) stream.getTracks().forEach((track) => track.stop());
                    if (audioContext) audioContext.close().catch(() => {});
                };
                try {
                    stream = canvas.captureStream(24);
                    const Audio = window.AudioContext || window.webkitAudioContext;
                    if (!Audio) throw new Error('Le son ne peut pas être préservé sur cet appareil.');
                    audioContext = new Audio();
                    const fromVideo = audioContext.createMediaElementSource(video);
                    const recorderOutput = audioContext.createMediaStreamDestination();
                    fromVideo.connect(recorderOutput); // deliberately not connected to speakers
                    const tracks = recorderOutput.stream.getAudioTracks();
                    if (tracks.length !== 1) throw new Error('Piste audio non disponible.');
                    stream.addTrack(tracks[0]);
                    await audioContext.resume();
                    if (audioContext.state !== 'running') throw new Error('Capture audio non disponible.');
                } catch (err) {
                    cleanAudio();
                    URL.revokeObjectURL(url);
                    reject(new Error('Impossible de conserver le son avec la compression sur cet appareil. Utilisez un MP4 déjà raccourci.'));
                    return;
                }
                let recorder;
                try {
                    recorder = new MediaRecorder(stream, {
                        mimeType: mime,
                        videoBitsPerSecond: policy.targetVideoBitsPerSecond(end - start)
                    });
                } catch (err) {
                    cleanAudio();
                    URL.revokeObjectURL(url);
                    reject(new Error('Export MP4 avec son indisponible sur cet appareil.'));
                    return;
                }
                const chunks = [];
                recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
                recorder.onerror = () => {
                    cleanAudio();
                    URL.revokeObjectURL(url);
                    reject(new Error('La compression a échoué.'));
                };
                const limit = window.setTimeout(() => {
                    video.pause();
                    if (recorder.state === 'recording') recorder.stop();
                }, Math.ceil((end - start) * 1000) + 1500);
                recorder.onstop = () => {
                    window.clearTimeout(limit);
                    cleanAudio();
                    URL.revokeObjectURL(url);
                    const type = 'video/mp4';
                    const blob = new Blob(chunks, { type });
                    if (!blob.size || blob.size > policy.MAX_BYTES) {
                        reject(new Error('Le passage choisi reste trop lourd après conversion. Raccourcissez-le.'));
                        return;
                    }
                    resolve(new File([blob], type === 'video/mp4' ? 'bokantaj.mp4' : 'bokantaj.webm', { type }));
                };
                const paint = () => {
                    context.drawImage(video, 0, 0, frame.width, frame.height);
                    if (video.currentTime >= end - 0.05 || video.ended) {
                        video.pause();
                        if (recorder.state === 'recording') recorder.stop();
                        return;
                    }
                    requestAnimationFrame(paint);
                };
                let started = false;
                const startRecording = () => {
                    if (started) return;
                    started = true;
                    try { recorder.start(200); } catch (err) {
                        cleanAudio();
                        URL.revokeObjectURL(url);
                        reject(new Error('Impossible de démarrer la compression.'));
                        return;
                    }
                    video.play().then(() => requestAnimationFrame(paint)).catch(() => {
                        cleanAudio();
                        reject(new Error('Lecture nécessaire à la conversion indisponible.'));
                        try { if (recorder.state === 'recording') recorder.stop(); } catch (_) {}
                    });
                };
                video.onseeked = startRecording;
                if (Math.abs(video.currentTime - start) < 0.02) startRecording();
                else {
                    try { video.currentTime = start; } catch (err) { cleanAudio(); reject(err); }
                }
            };
            video.src = url;
        });
    }

    function namedVideo(file) {
        const kind = policy.videoKind(file);
        if (!kind) {
            const error = new Error('Choisissez une vidéo MP4, MOV ou WebM.');
            error.code = 'type';
            throw error;
        }
        if (file.type === kind.mime) return { file, kind };
        return {
            kind,
            file: new File([file], file.name || ('bokantaj.' + kind.ext), { type: kind.mime, lastModified: file.lastModified || Date.now() })
        };
    }

    // WebCodecs converts far faster than real time; the recorder stays as the
    // fallback for devices that lack it or files it cannot parse.
    async function convert(source, clip, meta) {
        const fast = window.LYANN_BOKANTAJ_VIDEO_FAST;
        if (fast && fast.codecsAvailable()) {
            try {
                return await withDeadline(
                    fast.fastClip(source, clip.start, clip.end, meta),
                    FAST_DEADLINE_MS,
                    'La conversion de la vidéo a pris trop de temps.'
                );
            } catch (err) {
                if (window.console && console.info) {
                    console.info('[BOKANTAJ] conversion rapide indisponible:', err && err.message);
                }
            }
        }
        try {
            const recorded = await withDeadline(
                recordClip(source, clip.start, clip.end),
                Math.ceil((clip.end - clip.start) * 1000) + ENCODE_GRACE_MS,
                'La conversion de la vidéo a pris trop de temps. Choisissez un extrait plus court.'
            );
            return { file: recorded, poster: null };
        } catch (err) {
            if (source.size > policy.MAX_BYTES) throw err;
            return { file: source, poster: null };
        }
    }

    // Moderation can only release a video once it has a poster to review, so a
    // missing one means a post nobody would ever see. The decoder is tried
    // first: it is the only route that holds up on large gallery files.
    async function posterOf(source, at) {
        const fast = window.LYANN_BOKANTAJ_VIDEO_FAST;
        if (fast && fast.firstFrame && fast.codecsAvailable()) {
            try {
                return await withDeadline(
                    fast.firstFrame(source, at),
                    POSTER_DEADLINE_MS,
                    'La miniature n’a pas pu être créée.'
                );
            } catch (err) { /* the <video> route below is the fallback */ }
        }
        try {
            return await grabPoster(source, at);
        } catch (err) {
            return null;
        }
    }

    function posterError() {
        const error = new Error('La miniature de la vidéo n’a pas pu être créée. Réessayez avec une autre vidéo.');
        error.code = 'poster';
        return error;
    }

    function prepareClip(file, start, end) {
        return withDeadline(
            prepareClipSteps(file, start, end),
            PREPARE_DEADLINE_MS,
            'La préparation de la vidéo n’a pas abouti. Réessayez avec un extrait plus court.'
        );
    }

    async function prepareClipSteps(file, start, end) {
        const named = namedVideo(file);
        const source = named.file;
        const meta = await readMeta(source);
        if (!Number.isFinite(meta.duration) || meta.duration <= 0) {
            if (!policy.canAttachWithoutDuration(source)) {
                const error = new Error('Cette vidéo n’a pas pu être lue. Choisissez un extrait de 60 s et 40 Mo maximum.');
                error.code = 'duration';
                throw error;
            }
            const unreadPoster = await posterOf(source, 0);
            if (!unreadPoster) throw posterError();
            return { file: source, poster: unreadPoster, start: 0, end: 0 };
        }
        const window = policy.clipWindow(meta.duration, start, end);
        if (!window.ok) {
            const error = new Error(window.reason === 'needs_trim'
                ? 'Choisissez un passage de 60 secondes maximum.'
                : window.reason === 'duration'
                    ? 'Cette vidéo n’a pas pu être lue. Essayez un autre extrait de la galerie.'
                    : 'Ce passage vidéo est trop court.');
            error.code = window.reason;
            throw error;
        }
        let poster = null;
        let output = source;
        if (policy.needsReencode(source, meta, window)) {
            const converted = await convert(source, window, meta);
            output = converted.file;
            poster = converted.poster;
        }
        if (!poster) poster = await posterOf(source, window.start);
        if (!poster) throw posterError();
        return { file: output, poster, start: window.start, end: window.end, converted: output !== source };
    }

    window.LYANN_BOKANTAJ_VIDEO = {
        prepareClip,
        readMeta,
        mapPinVisible: policy.mapPinVisible,
        pinExpiryEffect: policy.pinExpiryEffect,
        clipWindow: policy.clipWindow,
        isPosterUrl: policy.isPosterUrl,
        posterFor: policy.posterFor,
        playbackMarkup: policy.playbackMarkup,
        MAX_SECONDS: policy.MAX_SECONDS,
        MAX_BYTES: policy.MAX_BYTES,
        MAX_SOURCE_BYTES: policy.MAX_SOURCE_BYTES
    };
})();
