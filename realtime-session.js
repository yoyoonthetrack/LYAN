/**
 * Realtime channel slot. One live channel, awaited removal, capped backoff.
 * Does not open a socket by itself.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.LYANN_REALTIME_SESSION = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const RETRY_STEPS_MS = [2000, 4000, 8000, 16000, 30000];
    const HEALTHY_CATCHUP_MS = 30000;
    const DROPPED_CATCHUP_MS = 8000;

    function nextRetryDelay(attempt) {
        const index = Math.max(0, Math.min(RETRY_STEPS_MS.length - 1, attempt | 0));
        return RETRY_STEPS_MS[index];
    }

    function createRealtimeSlot(options) {
        const opts = options || {};
        const setTimer = opts.setTimer || function (fn, ms) { return setTimeout(fn, ms); };
        const clearTimer = opts.clearTimer || function (id) { clearTimeout(id); };
        let generation = 0;
        let current = null;
        let timer = null;
        let attempt = 0;

        return {
            attempt: function () { return attempt; },
            generation: function () { return generation; },
            current: function () { return current; },
            hasRetry: function () { return timer != null; },
            markHealthy: function () { attempt = 0; },
            cancelRetry: function () {
                if (timer != null) clearTimer(timer);
                timer = null;
            },
            hold: function (channel) {
                current = channel || null;
                return generation;
            },
            scheduleRetry: function (fn) {
                if (timer != null) return 0;
                const delay = nextRetryDelay(attempt);
                const gen = generation;
                attempt += 1;
                timer = setTimer(function () {
                    timer = null;
                    if (gen !== generation) return;
                    return fn();
                }, delay);
                return delay;
            },
            release: async function (remove, options) {
                this.cancelRetry();
                generation += 1;
                const channel = current;
                current = null;
                if (!options || !options.keepAttempt) attempt = 0;
                if (channel && typeof remove === 'function') await remove(channel);
                return generation;
            }
        };
    }

    return {
        RETRY_STEPS_MS,
        HEALTHY_CATCHUP_MS,
        DROPPED_CATCHUP_MS,
        nextRetryDelay,
        createRealtimeSlot
    };
});
