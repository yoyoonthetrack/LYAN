/**
 * E4 — Deal/ActionPanel context sync helpers.
 * Generation tokens drop stale network responses; coalescing avoids refresh storms.
 * Payment / mission phase always come from server quote fields (never optimistic-only).
 *
 * E5 — Deal mutation guard: per-action mutex + scope/generation checks so late
 * network responses cannot paint another annonce/conversation.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.LYANN_DEAL_CONTEXT_SYNC = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const DEBOUNCE_MS = 80;
    const FALLBACK_INTERVAL_MS = 12000;

    function scopeKey(scope) {
        const s = scope || {};
        return [
            s.contactId || '',
            s.requestId || '',
            s.invitationId || '',
            s.missionId || '',
            s.conversationId || ''
        ].join('|');
    }

    function mutationKey(action, entityId) {
        return String(action || '') + ':' + String(entityId || '');
    }

    /**
     * Per-deal mutation mutex bound to conversation/request scope.
     * begin() returns null when the same action+entity is already in flight.
     * shouldApply() is false after conversation/annonce switch (setScope/cancel).
     */
    function createDealMutationGuard() {
        const inFlight = new Map();
        let activeScope = '';
        let generation = 0;
        let seq = 0;

        function setScope(scope) {
            const key = scopeKey(scope);
            if (key !== activeScope) {
                activeScope = key;
                generation += 1;
            }
            return generation;
        }

        function cancel() {
            generation += 1;
            return generation;
        }

        function begin(action, entityId, scope) {
            const key = mutationKey(action, entityId);
            if (inFlight.has(key)) return null;
            const snap = scopeKey(scope);
            if (snap && snap !== activeScope) {
                activeScope = snap;
                generation += 1;
            }
            const handle = {
                key,
                action: String(action || ''),
                entityId: entityId != null ? String(entityId) : '',
                scope: snap,
                token: ++seq,
                generation
            };
            inFlight.set(key, handle);
            return handle;
        }

        function isBusy(action, entityId) {
            return inFlight.has(mutationKey(action, entityId));
        }

        function shouldApply(handle) {
            if (!handle || !handle.key) return false;
            const current = inFlight.get(handle.key);
            if (!current || current.token !== handle.token) return false;
            if (handle.generation !== generation) return false;
            if (handle.scope !== activeScope) return false;
            return true;
        }

        function end(handle) {
            if (!handle || !handle.key) return;
            const current = inFlight.get(handle.key);
            if (current && current.token === handle.token) inFlight.delete(handle.key);
        }

        async function run(action, entityId, scope, executor) {
            const handle = begin(action, entityId, scope);
            if (!handle) {
                return { started: false, busy: true, apply: false, stale: false, result: null, handle: null };
            }
            try {
                const result = await executor(handle);
                const apply = shouldApply(handle);
                return { started: true, busy: false, apply, stale: !apply, result, handle };
            } catch (err) {
                if (err && typeof err === 'object') {
                    err.dealMutationStale = !shouldApply(handle);
                }
                throw err;
            } finally {
                end(handle);
            }
        }

        return {
            begin,
            end,
            isBusy,
            shouldApply,
            setScope,
            cancel,
            run,
            mutationKey,
            getGeneration: () => generation,
            getActiveScope: () => activeScope,
            getInFlightKeys: () => [...inFlight.keys()]
        };
    }

    /**
     * Wake signal from an existing messages Realtime INSERT (no new system messages).
     * Deal timeline types + entity-linked rows that already exist for business events.
     */
    function isDealWakeMessage(row, isDealTimeline) {
        if (!row) return false;
        const type = row.message_type || row.messageType || '';
        if (typeof isDealTimeline === 'function' && isDealTimeline(type)) return true;
        if (type && typeof isDealTimeline !== 'function') {
            const known = {
                quote_created: 1,
                quote_updated: 1,
                quote_accepted: 1,
                quote_declined: 1,
                payment_requested: 1,
                payment_secured: 1,
                payment_failed: 1,
                milestone_created: 1,
                milestone_completed: 1,
                milestone_approved: 1,
                funds_released: 1,
                mission_started: 1,
                mission_completed: 1,
                mission_cancelled: 1
            };
            if (known[type]) return true;
        }
        const entity = row.entity_type || row.entityType || '';
        return entity === 'quote' || entity === 'mission' || entity === 'milestone' || entity === 'payment';
    }

    /** Payment / closed phase must be derived from server quote (+ milestones/payments), never invented. */
    function serverPaymentPhase(quote, missionPhaseFn) {
        if (!quote || typeof missionPhaseFn !== 'function') return null;
        return missionPhaseFn(quote);
    }

    function createDealContextRefreshController(options) {
        const opts = options || {};
        const debounceMs = opts.debounceMs != null ? Number(opts.debounceMs) : DEBOUNCE_MS;
        let generation = 0;
        let activeScope = '';
        let inFlight = null;
        let pending = false;
        let pendingReason = 'idle';
        let debounceTimer = null;
        let lastAppliedToken = 0;
        // E5.1: a pending re-run must execute the latest runner (bound to the current
        // contact/E1 scope), never the closure captured by the request that started the loop.
        let latestRunner = null;

        function bump() {
            generation += 1;
            return generation;
        }

        function clearDebounce() {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
        }

        function setScope(scope) {
            const key = scopeKey(scope);
            if (key !== activeScope) {
                activeScope = key;
                bump();
                pending = false;
                clearDebounce();
            }
            return generation;
        }

        function cancel() {
            bump();
            pending = false;
            clearDebounce();
            return generation;
        }

        function shouldAccept(token, scope) {
            const key = typeof scope === 'string' ? scope : scopeKey(scope);
            return token === generation && key === activeScope;
        }

        function runLoop(runner) {
            if (inFlight) return inFlight;
            inFlight = (async () => {
                let last = { applied: false, stale: true, token: generation, generation };
                try {
                    do {
                        pending = false;
                        const reason = pendingReason;
                        const token = generation;
                        const scope = activeScope;
                        try {
                            const outcome = await (latestRunner || runner)({ token, scope, reason, generation });
                            if (!shouldAccept(token, scope)) {
                                last = { applied: false, stale: true, token, generation };
                            } else {
                                lastAppliedToken = token;
                                last = outcome && typeof outcome === 'object'
                                    ? Object.assign({ applied: true, stale: false, token }, outcome)
                                    : { applied: true, stale: false, token, result: outcome };
                            }
                        } catch (err) {
                            if (!shouldAccept(token, scope)) {
                                last = { applied: false, stale: true, token, generation };
                            } else {
                                throw err;
                            }
                        }
                    } while (pending);
                    return last;
                } finally {
                    inFlight = null;
                }
            })();
            return inFlight;
        }

        function request(reason, runner) {
            pendingReason = reason || 'refresh';
            pending = true;
            if (typeof runner === 'function') latestRunner = runner;
            if (inFlight) return inFlight;
            clearDebounce();
            if (debounceMs <= 0) return runLoop(runner);
            return new Promise((resolve, reject) => {
                debounceTimer = setTimeout(() => {
                    debounceTimer = null;
                    Promise.resolve(runLoop(runner)).then(resolve, reject);
                }, debounceMs);
            });
        }

        return {
            request,
            cancel,
            setScope,
            bump,
            shouldAccept,
            scopeKey,
            getGeneration: () => generation,
            getActiveScope: () => activeScope,
            getLastAppliedToken: () => lastAppliedToken,
            isBusy: () => !!inFlight || !!debounceTimer,
            hasPending: () => pending
        };
    }

    return {
        createDealContextRefreshController,
        createDealMutationGuard,
        scopeKey,
        mutationKey,
        isDealWakeMessage,
        serverPaymentPhase,
        DEBOUNCE_MS,
        FALLBACK_INTERVAL_MS
    };
});
