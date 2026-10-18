'use strict';

const {
    orchestratePostTransferRefund,
    resolvePostTransferExecutionMode,
    MODES
} = require('./post-transfer-orchestrator');

function createMockStripeSim(script) {
    const queue = Array.isArray(script) ? script.slice() : [];
    const calls = [];
    return {
        calls,
        async dispatch(prepared) {
            calls.push({
                method: prepared && prepared.method,
                idempotencyKey: prepared && prepared.idempotencyKey,
                real: false
            });
            const next = queue.shift() || { ok: true };
            if (next.livemode === true) {
                return { ok: false, livemode: true, retryBlind: false, code: 'STRIPE_LIVE_BLOCKED' };
            }
            if (next.timeout === true) {
                return { ok: false, timeout: true, retryBlind: false, code: 'STRIPE_SIM_TIMEOUT' };
            }
            if (next.lost === true || next.uncertain === true) {
                return { ok: false, uncertain: true, retryBlind: false, code: next.code || 'STRIPE_RESPONSE_LOST' };
            }
            return { ok: true, livemode: false, id: next.id || null, retryBlind: false };
        }
    };
}

function simulationAllowed(options) {
    if (options && (options.httpRoute === true || options.req || options.body || options.query || options.headers)) {
        return { ok: false, code: 'SIMULATION_FORBIDDEN_FROM_HTTP' };
    }
    if (!(options && options.simulationHarness === true)) {
        return { ok: false, code: 'SIMULATION_REQUIRED' };
    }
    if (!(options && options.isolatedLocal === true)) {
        return { ok: false, code: 'ISOLATED_LOCAL_REQUIRED' };
    }
    const resolved = resolvePostTransferExecutionMode({
        mode: MODES.SIMULATED,
        isolatedLocal: true,
        simulationHarness: true,
        adapter: options.adapter,
        stripeDispatch: options.stripeSim
    }, {});
    if (resolved.mode !== MODES.SIMULATED) {
        return { ok: false, code: resolved.reason === 'DEFAULT' ? 'SIMULATION_REQUIRED' : resolved.reason };
    }
    return { ok: true };
}

async function simulateIsolatedPostTransfer(store, options) {
    const gate = simulationAllowed(options);
    if (!gate.ok) {
        return {
            http: 403,
            body: {
                success: false,
                code: gate.code,
                execute: false,
                createReversal: false,
                createRefund: false,
                invoked: false
            }
        };
    }
    return orchestratePostTransferRefund(store, {
        admin: options.admin,
        requestId: options.requestId,
        expected: options.expected,
        requestedCents: options.requestedCents,
        stripeRead: options.stripeRead,
        httpRoute: false,
        trustedConfig: {
            mode: MODES.SIMULATED,
            isolatedLocal: true,
            simulationHarness: true,
            adapter: options.adapter,
            stripeDispatch: options.stripeSim
        }
    });
}

simulateIsolatedPostTransfer.orchestrate = orchestratePostTransferRefund;

module.exports = {
    simulateIsolatedPostTransfer,
    simulationAllowed,
    createMockStripeSim
};
