'use strict';

const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_BIN = '/Users/mac/hb/Cellar/postgresql@17/17.11_1/bin';
const SCHEMA = path.join(__dirname, '../../artifacts/staging-v2/phase610w/local-schema.sql');
const SQL069 = path.join(__dirname, '../../artifacts/staging-v2/phase610k/proposed-069.sql');

const IDS = {
    PAY: '11111111-1111-4111-8111-111111111111',
    PAY2: '12222222-2222-4222-8222-222222222222',
    MS: '22222222-2222-4222-8222-222222222222',
    REQ: '31111111-1111-4111-8111-111111111111',
    REQ2: '32222222-2222-4222-8222-222222222222',
    A: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    B: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
};

function findPgBin() {
    const candidates = [
        process.env.LYANN_PG_BIN,
        process.env.LYANN_610W_PG_BIN,
        DEFAULT_BIN,
        '/opt/homebrew/opt/postgresql@17/bin',
        '/opt/homebrew/bin',
        '/usr/local/opt/postgresql@17/bin',
        '/usr/lib/postgresql/17/bin'
    ].filter(Boolean);
    for (const dir of candidates) {
        if (fs.existsSync(path.join(dir, 'psql')) && fs.existsSync(path.join(dir, 'postgres'))) return dir;
    }
    return null;
}

function literal(value) {
    if (value == null) return 'NULL';
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    const text = String(value);
    if (text.length > 400) throw new Error('bind too long');
    return "'" + text.replace(/'/g, "''") + "'";
}

function bind(sql, params) {
    return String(sql).replace(/\$(\d+)/g, (_, index) => literal(params[Number(index) - 1]));
}

function createPsqlQuery({ bin, port, db }) {
    function exec(sql, params) {
        const bound = bind(sql, params || []);
        const result = spawnSync(path.join(bin, 'psql'), [
            '-h', '127.0.0.1', '-p', String(port), '-d', db,
            '-v', 'ON_ERROR_STOP=1', '-c', bound
        ], { encoding: 'utf8' });
        if (result.status !== 0) {
            throw new Error((result.stderr || result.stdout || 'psql').slice(0, 900));
        }
        return result.stdout || '';
    }
    function query(sql, params) {
        const bound = bind(sql, params || []);
        const trimmed = bound.trim();
        const wrapped = /^SELECT/i.test(trimmed)
            ? `SELECT COALESCE(json_agg(row_to_json(q)), '[]'::json)::text FROM (${trimmed}) q;`
            : `WITH q AS (${trimmed}) SELECT COALESCE(json_agg(row_to_json(q)), '[]'::json)::text FROM q;`;
        const result = spawnSync(path.join(bin, 'psql'), [
            '-h', '127.0.0.1', '-p', String(port), '-d', db,
            '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', wrapped
        ], { encoding: 'utf8' });
        if (result.status !== 0) {
            throw new Error((result.stderr || result.stdout || 'psql').slice(0, 900));
        }
        const raw = String(result.stdout || '').trim();
        if (!raw) return [];
        return JSON.parse(raw);
    }
    query.exec = exec;
    return query;
}

function runSqlFile(bin, port, db, file) {
    const result = spawnSync(path.join(bin, 'psql'), [
        '-h', '127.0.0.1', '-p', String(port), '-d', db,
        '-v', 'ON_ERROR_STOP=1', '-f', file
    ], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error((result.stderr || result.stdout || file).slice(0, 900));
}

async function waitReady(bin, port) {
    for (let i = 0; i < 50; i += 1) {
        const ready = spawnSync(path.join(bin, 'pg_isready'), ['-h', '127.0.0.1', '-p', String(port)]);
        if (ready.status === 0) return;
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error('postgres not ready');
}

function seedUnexecuted(query, ids) {
    const { PAY, PAY2, MS, REQ, REQ2, A, B } = ids || IDS;
    query.exec(`
        INSERT INTO milestones (id, status) VALUES (${literal(MS)}, 'RELEASED')
        ON CONFLICT (id) DO NOTHING;
        INSERT INTO payments (
            id, requester_id, provider_id, milestone_id, payment_status, transfer_status,
            stripe_payment_intent_id, stripe_charge_id, stripe_transfer_id, stripe_connect_account_id
        ) VALUES (
            ${literal(PAY)}, ${literal(A)}, ${literal(B)}, ${literal(MS)}, 'SUCCEEDED', 'TRANSFERRED',
            'pi_610w', 'ch_610w', 'tr_610w', 'acct_610w'
        )
        ON CONFLICT (id) DO NOTHING;
        INSERT INTO payments (
            id, requester_id, provider_id, milestone_id, payment_status, transfer_status,
            stripe_payment_intent_id, stripe_charge_id, stripe_transfer_id
        ) VALUES (
            ${literal(PAY2)}, ${literal(A)}, ${literal(B)}, ${literal(MS)}, 'REFUNDED', 'REVERSED',
            'pi_610w_done', 'ch_610w_done', 'tr_610w_done'
        )
        ON CONFLICT (id) DO NOTHING;
        INSERT INTO post_transfer_refund_requests (
            id, payment_id, milestone_id, requester_id, provider_id, requested_cents, status
        ) VALUES (${literal(REQ)}, ${literal(PAY)}, ${literal(MS)}, ${literal(A)}, ${literal(B)}, 4349, 'ADMIN_APPROVED')
        ON CONFLICT (id) DO NOTHING;
        INSERT INTO post_transfer_refund_requests (
            id, payment_id, milestone_id, requester_id, provider_id, requested_cents, status
        ) VALUES (${literal(REQ2)}, ${literal(PAY2)}, ${literal(MS)}, ${literal(A)}, ${literal(B)}, 4349, 'OPEN')
        ON CONFLICT (id) DO NOTHING;
        INSERT INTO post_transfer_refund_decisions (
            request_id, payment_id, action, operation_id, decided_amount_cents
        )
        SELECT ${literal(REQ)}, ${literal(PAY)}, 'ADMIN_APPROVED', 'op-610w', 4349
        WHERE NOT EXISTS (
            SELECT 1 FROM post_transfer_refund_decisions WHERE operation_id = 'op-610w'
        );
    `);
}

function resetPayment(query, paymentId, patch) {
    const id = paymentId || IDS.PAY;
    query.exec(`
        DELETE FROM payment_adjustments WHERE payment_id = ${literal(id)};
        UPDATE payments SET
            payment_status = ${literal((patch && patch.payment_status) || 'SUCCEEDED')},
            transfer_status = ${literal((patch && patch.transfer_status) || 'TRANSFERRED')},
            stripe_refund_id = NULL,
            stripe_reversal_id = ${literal((patch && patch.stripe_reversal_id) || null)},
            amount_refunded_cents = ${literal((patch && patch.amount_refunded_cents) || 0)},
            customer_fee_refunded_cents = ${literal((patch && patch.customer_fee_refunded_cents) || 0)},
            service_refunded_cents = ${literal((patch && patch.service_refunded_cents) || 0)},
            provider_fee_reversed_cents = ${literal((patch && patch.provider_fee_reversed_cents) || 0)},
            provider_net_reversed_cents = ${literal((patch && patch.provider_net_reversed_cents) || 0)},
            reversal_lock = ${literal((patch && patch.reversal_lock) || null)},
            refund_lock = ${literal((patch && patch.refund_lock) || null)},
            post_transfer_operation_id = ${literal((patch && patch.post_transfer_operation_id) || null)}
        WHERE id = ${literal(id)};
    `);
}

function resetRequest(query, requestId, patch) {
    const status = (patch && patch.status) || 'ADMIN_APPROVED';
    const cents = (patch && patch.requested_cents) || 4349;
    query.exec(`
        DELETE FROM post_transfer_refund_decisions WHERE request_id = ${literal(requestId)};
        UPDATE post_transfer_refund_requests
        SET executed_at = NULL, execution_operation_id = NULL,
            status = ${literal(status)}, requested_cents = ${literal(cents)}
        WHERE id = ${literal(requestId)};
    `);
    if (status !== 'OPEN' && !(patch && patch.noDecision)) {
        query.exec(`
            INSERT INTO post_transfer_refund_decisions (
                request_id, payment_id, action, operation_id, decided_amount_cents
            ) VALUES (
                ${literal(requestId)},
                ${literal((patch && patch.payment_id) || IDS.PAY)},
                'ADMIN_APPROVED',
                ${literal((patch && patch.operation_id) || 'op-610w')},
                ${literal((patch && patch.decided_amount_cents) || 4349)}
            );
        `);
    }
}

function isolatedHttpStore(query, ids) {
    const { PAY, MS } = ids || IDS;
    return {
        persist: {
            acquireReversal() { throw new Error('persist called from HTTP store'); }
        },
        adjustments: [],
        async getPayment({ id }) {
            const rows = query('SELECT * FROM payments WHERE id = $1', [id || PAY]);
            return rows[0] ? { ...rows[0] } : null;
        },
        async getMilestone(id) {
            const rows = query('SELECT * FROM milestones WHERE id = $1', [id || MS]);
            return rows[0] || { id: MS, status: 'RELEASED' };
        },
        async getRequest(id) {
            const rows = query('SELECT * FROM post_transfer_refund_requests WHERE id = $1', [id]);
            return rows[0] ? { ...rows[0] } : null;
        },
        async listDecisions(requestId) {
            return query('SELECT * FROM post_transfer_refund_decisions WHERE request_id = $1 ORDER BY created_at', [requestId]);
        }
    };
}

function createPersistentStore(query, seed) {
    const payments = new Map();
    const requests = new Map();
    const decisions = [...(seed.decisions || [])];
    const adjustments = [...(seed.adjustments || [])];
    (seed.payments || []).forEach((row) => payments.set(row.id, { ...row }));
    (seed.requests || []).forEach((row) => requests.set(row.id, { ...row }));
    return {
        isolatedLocal: true,
        persist: seed.persist,
        stripeCalls: [],
        payments,
        requests,
        decisions,
        adjustments,
        getPayment(id) { return payments.get(id) || null; },
        getMilestone(id) { return (seed.milestones || []).find((row) => row.id === id) || null; },
        getRequest(id) { return requests.get(id) || null; },
        latestApproved(requestId) {
            return [...decisions].reverse().find((row) => row.request_id === requestId && row.action === 'ADMIN_APPROVED') || null;
        },
        adjustmentFor(operationId) {
            return adjustments.find((row) => row.operation_id === operationId) || null;
        },
        refreshPayment(id) {
            const live = query('SELECT * FROM payments WHERE id = $1', [id])[0];
            if (live && payments.has(id)) Object.assign(payments.get(id), live);
            return payments.get(id) || null;
        }
    };
}

async function startIsolatedPg610w(options) {
    const extraSql = (options && options.extraSqlFiles) || [];
    if (process.env.LYANN_610W_PG_PORT && process.env.LYANN_610W_PG_DB) {
        const bin = findPgBin();
        if (!bin) throw new Error('pg bin missing');
        const port = process.env.LYANN_610W_PG_PORT;
        const db = process.env.LYANN_610W_PG_DB;
        return {
            bin, port, db, ids: IDS,
            query: createPsqlQuery({ bin, port, db }),
            stop() {}
        };
    }
    const bin = findPgBin();
    if (!bin) return null;
    const port = process.env.LYANN_610W_START_PORT || '55441';
    const db = 'lyann610w';
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyann-610w-'));
    const logFile = path.join(dataDir, 'pg.log');
    const user = process.env.USER || 'mac';
    spawnSync(path.join(bin, 'initdb'), ['-D', dataDir, '--auth-local=trust', '--auth-host=trust', '-U', user], { encoding: 'utf8' });
    const child = spawn(path.join(bin, 'postgres'), [
        '-D', dataDir, '-p', String(port), '-c', 'listen_addresses=127.0.0.1'
    ], { stdio: ['ignore', fs.openSync(logFile, 'w'), fs.openSync(logFile, 'a')] });
    await waitReady(bin, port);
    spawnSync(path.join(bin, 'createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', user, db], { encoding: 'utf8' });
    runSqlFile(bin, port, db, SCHEMA);
    runSqlFile(bin, port, db, SQL069);
    extraSql.forEach((file) => runSqlFile(bin, port, db, file));
    const query = createPsqlQuery({ bin, port, db });
    seedUnexecuted(query, IDS);
    return {
        bin, port, db, ids: IDS, query, dataDir,
        stop() {
            try { process.kill(child.pid, 'SIGTERM'); } catch (_) { /* ignore */ }
        }
    };
}

function acquireConcurrent(bin, port, db, paymentId, opA, opB) {
    function one(op) {
        return new Promise((resolve) => {
            const sql = bind(`
                UPDATE payments
                SET reversal_lock = 'pending_rv_' || id::text,
                    post_transfer_operation_id = $1,
                    transfer_status = 'REVERSAL_PROCESSING'
                WHERE id = $2
                  AND reversal_lock IS NULL
                  AND refund_lock IS NULL
                  AND transfer_status IN ('TRANSFERRED', 'PARTIALLY_REVERSED', 'REVERSAL_FAILED')
                  AND payment_status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED')
                  AND stripe_transfer_id IS NOT NULL
                RETURNING id, post_transfer_operation_id
            `, [op, paymentId]);
            const child = spawn(path.join(bin, 'psql'), [
                '-h', '127.0.0.1', '-p', String(port), '-d', db,
                '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql
            ], { encoding: 'utf8' });
            let out = '';
            let err = '';
            child.stdout.on('data', (chunk) => { out += chunk; });
            child.stderr.on('data', (chunk) => { err += chunk; });
            child.on('close', (code) => resolve({ op, code, out: out.trim(), err }));
        });
    }
    return Promise.all([one(opA), one(opB)]);
}

module.exports = {
    IDS,
    findPgBin,
    createPsqlQuery,
    startIsolatedPg610w,
    seedUnexecuted,
    resetPayment,
    resetRequest,
    isolatedHttpStore,
    createPersistentStore,
    acquireConcurrent,
    bind
};
