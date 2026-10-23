/* LYANN — Bokantaj vidéo V1.6. Shared Web, iOS and Android WebView.
 * The file is fetched only after the member presses play.
 */
(function () {
    'use strict';

    const policy = window.LYANN_BOKANTAJ_VIDEO_POLICY;
    if (!policy) return;

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
            }), 2500);
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
            video.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('La miniature n’a pas pu être créée.'));
            };
            video.onloadeddata = () => {
                const seekTo = Math.min(Math.max(0, at || 0), Math.max(0, (video.duration || 1) - 0.05));
                const draw = () => {
                    const frame = policy.fitFrame(video.videoWidth, video.videoHeight);
                    const canvas = document.createElement('canvas');
                    canvas.width = frame.width;
                    canvas.height = frame.height;
                    canvas.getContext('2d').drawImage(video, 0, 0, frame.width, frame.height);
                    canvas.toBlob((blob) => {
                        URL.revokeObjectURL(url);
                        if (!blob) reject(new Error('La miniature n’a pas pu être créée.'));
                        else resolve(blob);
                    }, 'image/jpeg', 0.72);
                };
                video.onseeked = draw;
                try { video.currentTime = seekTo; } catch (err) { draw(); }
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
            video.onloadeddata = async () => {
                const frame = policy.fitFrame(video.videoWidth, video.videoHeight);
                const canvas = document.createElement('canvas');
                canvas.width = frame.width;
                canvas.height = frame.height;
                const context = canvas.getContext('2d');
                if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
                    URL.revokeObjectURL(url);
                    const error = new Error('Cet appareil ne peut pas compresser la vidéo. Choisissez un MP4 de 60 secondes et 10 Mo maximum.');
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
                        reject(new Error('Le passage choisi dépasse encore 10 Mo. Raccourcissez-le.'));
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
                video.onseeked = () => {
                    recorder.start(200);
                    video.play().then(() => requestAnimationFrame(paint)).catch((err) => {
                        cleanAudio();
                        reject(new Error('Lecture nécessaire à la conversion indisponible.'));
                        try { if (recorder.state === 'recording') recorder.stop(); } catch (_) {}
                    });
                };
                try { video.currentTime = start; } catch (err) { reject(err); }
            };
            video.src = url;
        });
    }

    async function prepareClip(file, start, end) {
        const meta = await readMeta(file);
        const window = policy.clipWindow(meta.duration, start, end);
        if (!window.ok) {
            const error = new Error(window.reason === 'needs_trim'
                ? 'Choisissez un passage de 60 secondes maximum.'
                : 'Ce passage vidéo est trop court.');
            error.code = window.reason;
            throw error;
        }
        const poster = await grabPoster(file, window.start);
        const untouched = file.type === 'video/mp4'
            && file.size <= policy.MAX_BYTES
            && meta.width <= policy.MAX_LONG_EDGE + 2
            && meta.height <= policy.MAX_SHORT_EDGE + 2
            && Math.abs((window.end - window.start) - meta.duration) < 0.3;
        const output = untouched ? file : await recordClip(file, window.start, window.end);
        return { file: output, poster, start: window.start, end: window.end };
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
        MAX_BYTES: policy.MAX_BYTES
    };
})();
