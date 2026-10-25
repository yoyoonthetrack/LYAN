/* LYANN — Bokantaj conversion vidéo accélérée (WebCodecs).
 * The MediaRecorder path runs in real time: a 55 s clip costs 55 s of waiting
 * and dies as soon as the page is hidden. WebCodecs decodes and re-encodes as
 * fast as the device allows, so the composer no longer holds the member
 * hostage. Everything here is best-effort: any gap falls back to the recorder.
 */
(function () {
    'use strict';

    const policy = window.LYANN_BOKANTAJ_VIDEO_POLICY;
    if (!policy) return;

    // Resolved against this file, not the page, so pages in subfolders and the
    // Capacitor bundle all find the same vendored demuxer and muxer.
    const BASE = (document.currentScript && document.currentScript.src || '').replace(/[^/]*$/, '');
    const VENDOR = ['vendor/mp4/mp4box.all.min.js', 'vendor/mp4/mp4-muxer.js']
        .map((path) => BASE ? new URL(path, BASE).href : path);
    let vendorPromise = null;

    function codecsAvailable() {
        return typeof window.VideoEncoder === 'function'
            && typeof window.VideoDecoder === 'function'
            && typeof window.EncodedVideoChunk === 'function'
            && typeof window.VideoFrame === 'function';
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-lyann-mp4="${src}"]`);
            if (existing) {
                if (existing.dataset.loaded === '1') resolve();
                else {
                    existing.addEventListener('load', () => resolve());
                    existing.addEventListener('error', () => reject(new Error('mp4 vendor')));
                }
                return;
            }
            const node = document.createElement('script');
            node.src = src;
            node.async = true;
            node.dataset.lyannMp4 = src;
            node.addEventListener('load', () => { node.dataset.loaded = '1'; resolve(); });
            node.addEventListener('error', () => reject(new Error('mp4 vendor')));
            document.head.appendChild(node);
        });
    }

    // The demuxer and muxer are only fetched once a member actually attaches a
    // video, so the Fil stays light for everyone else.
    function loadVendor() {
        if (window.MP4Box && window.Mp4Muxer) return Promise.resolve();
        if (!vendorPromise) {
            vendorPromise = VENDOR.reduce(
                (chain, src) => chain.then(() => loadScript(src)),
                Promise.resolve()
            ).catch((err) => { vendorPromise = null; throw err; });
        }
        return vendorPromise;
    }

    function rotationOf(track) {
        const matrix = track && track.matrix;
        if (!matrix || matrix.length < 5) return 0;
        // The matrix stores 16.16 fixed point values; only the signs matter.
        const a = matrix[0];
        const b = matrix[1];
        if (a === 0 && b > 0) return 90;
        if (a < 0 && b === 0) return 180;
        if (a === 0 && b < 0) return 270;
        return 0;
    }

    function stsdEntries(mp4, track) {
        const trak = mp4.getTrackById(track.id);
        return (trak && trak.mdia && trak.mdia.minf && trak.mdia.minf.stbl
            && trak.mdia.minf.stbl.stsd && trak.mdia.minf.stbl.stsd.entries) || [];
    }

    function codecDescription(mp4, track) {
        for (const entry of stsdEntries(mp4, track)) {
            const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
            if (!box) continue;
            const stream = new window.DataStream(undefined, 0, window.DataStream.BIG_ENDIAN);
            box.write(stream);
            // write() emits the full box; the decoder wants its payload only.
            return new Uint8Array(stream.buffer, 8);
        }
        return null;
    }

    function aacDescription(entry) {
        try {
            const esds = entry && entry.esds;
            if (!esds || !esds.esd) return null;
            const configDesc = (esds.esd.descs || []).find((desc) => desc && desc.descs);
            const specific = configDesc && (configDesc.descs || []).find((desc) => desc && desc.data);
            return specific && specific.data ? new Uint8Array(specific.data) : null;
        } catch (err) {
            return null;
        }
    }

    // The original audio is copied over untouched: no re-encoding means no
    // quality loss, and nothing is published silently without sound.
    function audioConfig(mp4, track) {
        const codec = String(track && track.codec || '').toLowerCase();
        const entry = stsdEntries(mp4, track)[0];
        if (!entry) return null;
        if (codec.startsWith('mp4a') || codec.includes('aac')) {
            const description = aacDescription(entry);
            return description ? { codec: 'aac', description } : null;
        }
        if (codec.startsWith('opus')) return { codec: 'opus', description: null };
        return null;
    }

    function demux(file) {
        return new Promise((resolve, reject) => {
            const mp4 = window.MP4Box.createFile();
            const video = [];
            const audio = [];
            let tracks = null;
            let pending = 0;
            mp4.onError = () => reject(new Error('demux'));
            mp4.onReady = (info) => {
                const videoTrack = (info.videoTracks || [])[0];
                if (!videoTrack) {
                    reject(new Error('no_video_track'));
                    return;
                }
                const audioTrack = (info.audioTracks || [])[0] || null;
                tracks = { info, videoTrack, audioTrack };
                pending = audioTrack ? 2 : 1;
                mp4.setExtractionOptions(videoTrack.id, 'video', { nbSamples: 1000 });
                if (audioTrack) mp4.setExtractionOptions(audioTrack.id, 'audio', { nbSamples: 1000 });
                mp4.start();
            };
            mp4.onSamples = (id, user, samples) => {
                const sink = user === 'audio' ? audio : video;
                for (const sample of samples) {
                    sink.push({
                        data: new Uint8Array(sample.data),
                        cts: sample.cts,
                        duration: sample.duration,
                        timescale: sample.timescale,
                        isSync: Boolean(sample.is_sync)
                    });
                }
            };
            mp4.onFlush = () => {
                pending -= 1;
                if (pending > 0) return;
                resolve({ mp4, ...tracks, video, audio });
            };
            file.arrayBuffer().then((buffer) => {
                buffer.fileStart = 0;
                mp4.appendBuffer(buffer);
                mp4.flush();
                // onFlush does not always fire for short files; resolve once the
                // samples are in and the parser has nothing left to read.
                window.setTimeout(() => {
                    if (tracks && video.length) resolve({ mp4, ...tracks, video, audio });
                }, 0);
            }).catch(() => reject(new Error('read')));
        });
    }

    async function encoderConfig(width, height, seconds) {
        const base = {
            width,
            height,
            bitrate: policy.targetVideoBitsPerSecond(seconds),
            framerate: 30
        };
        for (const codec of ['avc1.42002A', 'avc1.4D0028', 'avc1.42001F']) {
            const config = { ...base, codec, avc: { format: 'avc' } };
            try {
                const support = await window.VideoEncoder.isConfigSupported(config);
                if (support && support.supported) return config;
            } catch (err) { /* try the next profile */ }
        }
        return null;
    }

    async function fastClip(file, start, end, meta) {
        if (!codecsAvailable()) throw new Error('webcodecs_unavailable');
        await loadVendor();
        const parsed = await demux(file);
        const track = parsed.videoTrack;
        const codedWidth = track.video ? track.video.width : meta.width;
        const codedHeight = track.video ? track.video.height : meta.height;
        const frame = policy.fitFrame(codedWidth, codedHeight);
        const seconds = Math.max(0.5, Number(end) - Number(start));
        const config = await encoderConfig(frame.width, frame.height, seconds);
        if (!config) throw new Error('no_encoder');

        const description = codecDescription(parsed.mp4, track);
        if (!description) throw new Error('no_description');

        const audioTrack = parsed.audioTrack;
        const audioMeta = audioTrack && audioTrack.audio ? audioTrack.audio : null;
        const audio = audioTrack ? audioConfig(parsed.mp4, audioTrack) : null;
        // Sound must never be dropped silently; an audio track we cannot carry
        // over sends the caller back to the recorder path.
        if (audioTrack && (!audioMeta || !audio)) throw new Error('no_audio_description');

        const muxer = new window.Mp4Muxer.Muxer({
            target: new window.Mp4Muxer.ArrayBufferTarget(),
            fastStart: 'in-memory',
            firstTimestampBehavior: 'offset',
            video: {
                codec: 'avc',
                width: frame.width,
                height: frame.height,
                rotation: rotationOf(track)
            },
            ...(audioTrack ? {
                audio: {
                    codec: audio.codec,
                    numberOfChannels: audioMeta.channel_count || 2,
                    sampleRate: audioMeta.sample_rate || 44100
                }
            } : {})
        });

        let encodeError = null;
        let firstChunk = true;
        const encoder = new window.VideoEncoder({
            output: (chunk, chunkMeta) => muxer.addVideoChunk(chunk, chunkMeta),
            error: (err) => { encodeError = err; }
        });
        encoder.configure(config);

        const canvas = document.createElement('canvas');
        canvas.width = frame.width;
        canvas.height = frame.height;
        const context = canvas.getContext('2d');
        // The poster is taken from the first decoded frame: a video published
        // without one stays pending forever, and the <video> + seek route is
        // exactly what fails on the large gallery files we convert here.
        const posterCanvas = document.createElement('canvas');
        posterCanvas.width = frame.width;
        posterCanvas.height = frame.height;

        const startUs = Math.round(Number(start) * 1e6);
        const endUs = Math.round(Number(end) * 1e6);
        let painted = 0;
        const decoder = new window.VideoDecoder({
            output: (videoFrame) => {
                const timestamp = videoFrame.timestamp;
                if (timestamp < startUs || timestamp > endUs) {
                    videoFrame.close();
                    return;
                }
                context.drawImage(videoFrame, 0, 0, frame.width, frame.height);
                if (!painted) posterCanvas.getContext('2d').drawImage(canvas, 0, 0);
                const scaled = new window.VideoFrame(canvas, { timestamp: timestamp - startUs });
                videoFrame.close();
                encoder.encode(scaled, { keyFrame: painted % 60 === 0 });
                scaled.close();
                painted += 1;
            },
            error: (err) => { encodeError = err; }
        });
        decoder.configure({
            codec: track.codec,
            description,
            codedWidth,
            codedHeight
        });

        // Decoding has to resume from the keyframe before the cut, otherwise the
        // first frames of the chosen window have nothing to reference.
        let decodeFrom = 0;
        parsed.video.forEach((sample, index) => {
            const at = (sample.cts / sample.timescale) * 1e6;
            if (sample.isSync && at <= startUs) decodeFrom = index;
        });

        for (let index = decodeFrom; index < parsed.video.length; index += 1) {
            const sample = parsed.video[index];
            const at = (sample.cts / sample.timescale) * 1e6;
            if (at > endUs) break;
            decoder.decode(new window.EncodedVideoChunk({
                type: sample.isSync ? 'key' : 'delta',
                timestamp: at,
                duration: (sample.duration / sample.timescale) * 1e6,
                data: sample.data
            }));
            if (decoder.decodeQueueSize > 30) {
                await new Promise((resolve) => window.setTimeout(resolve, 0));
            }
        }

        await decoder.flush();
        await encoder.flush();
        decoder.close();
        encoder.close();
        if (encodeError) throw encodeError;
        if (!painted) throw new Error('no_frames');

        if (audioTrack) {
            for (const sample of parsed.audio) {
                const at = (sample.cts / sample.timescale) * 1e6;
                if (at < startUs || at > endUs) continue;
                muxer.addAudioChunkRaw(
                    sample.data,
                    'key',
                    at - startUs,
                    (sample.duration / sample.timescale) * 1e6,
                    firstChunk && audio.description
                        ? { decoderConfig: { description: audio.description } }
                        : undefined
                );
                firstChunk = false;
            }
        }

        muxer.finalize();
        const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
        if (!blob.size || blob.size > policy.MAX_BYTES) throw new Error('too_large');
        const poster = await toJpeg(posterCanvas);
        return { file: new File([blob], 'bokantaj.mp4', { type: 'video/mp4' }), poster };
    }

    function toJpeg(canvas) {
        return new Promise((resolve) => {
            try { canvas.toBlob((blob) => resolve(blob || null), 'image/jpeg', 0.72); }
            catch (err) { resolve(null); }
        });
    }

    // Used when the file is already small enough to publish as is: the member
    // still needs a poster, and decoding one keyframe costs almost nothing.
    async function firstFrame(file, at) {
        if (!codecsAvailable()) throw new Error('webcodecs_unavailable');
        await loadVendor();
        const parsed = await demux(file);
        const track = parsed.videoTrack;
        const description = codecDescription(parsed.mp4, track);
        if (!description) throw new Error('no_description');
        const codedWidth = track.video ? track.video.width : 0;
        const codedHeight = track.video ? track.video.height : 0;
        const frame = policy.fitFrame(codedWidth, codedHeight);
        const canvas = document.createElement('canvas');
        canvas.width = frame.width;
        canvas.height = frame.height;

        const atUs = Math.round(Math.max(0, Number(at) || 0) * 1e6);
        let drawn = false;
        let failure = null;
        const decoder = new window.VideoDecoder({
            output: (videoFrame) => {
                if (!drawn && videoFrame.timestamp >= atUs) {
                    canvas.getContext('2d').drawImage(videoFrame, 0, 0, frame.width, frame.height);
                    drawn = true;
                }
                videoFrame.close();
            },
            error: (err) => { failure = err; }
        });
        decoder.configure({ codec: track.codec, description, codedWidth, codedHeight });

        let decodeFrom = 0;
        parsed.video.forEach((sample, index) => {
            const sampleAt = (sample.cts / sample.timescale) * 1e6;
            if (sample.isSync && sampleAt <= atUs) decodeFrom = index;
        });
        for (let index = decodeFrom; index < parsed.video.length && !drawn; index += 1) {
            const sample = parsed.video[index];
            decoder.decode(new window.EncodedVideoChunk({
                type: sample.isSync ? 'key' : 'delta',
                timestamp: (sample.cts / sample.timescale) * 1e6,
                duration: (sample.duration / sample.timescale) * 1e6,
                data: sample.data
            }));
            if (decoder.decodeQueueSize > 30) {
                await new Promise((resolve) => window.setTimeout(resolve, 0));
            }
        }
        await decoder.flush();
        decoder.close();
        if (failure || !drawn) throw new Error('no_frames');
        const poster = await toJpeg(canvas);
        if (!poster) throw new Error('no_poster');
        return poster;
    }

    window.LYANN_BOKANTAJ_VIDEO_FAST = {
        fastClip,
        firstFrame,
        codecsAvailable,
        rotationOf
    };
})();
