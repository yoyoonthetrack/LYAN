'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createControlCenter, periodBounds, DEFINITIONS } = require('../api/admin-control-center');

const NOW = new Date('2026-10-22T12:00:00.000Z');

function hoursAgo(hours) {
    return new Date(NOW.getTime() - hours * 3600 * 1000).toISOString();
}

function createFakeSupabase(store) {
    function matches(row, filters) {
        return filters.every((filter) => {
            const value = row[filter.col];
            if (filter.type === 'eq') return value === filter.val;
            if (filter.type === 'neq') return value !== filter.val;
            if (filter.type === 'in') return filter.val.includes(value);
            if (filter.type === 'gte') return value >= filter.val;
            if (filter.type === 'lte') return value <= filter.val;
            if (filter.type === 'not') {
                if (filter.op === 'is' && filter.val == null) return value != null;
                return value !== filter.val;
            }
            return true;
        });
    }

    return {
        writes: [],
        from(table) {
            const query = {
                _filters: [],
                _count: false,
                _head: false,
                _order: null,
                _limit: null,
                _range: null,
                select(cols, opts) {
                    query._count = !!(opts && opts.count === 'exact');
                    query._head = !!(opts && opts.head);
                    return query;
                },
                eq(col, val) { query._filters.push({ type: 'eq', col, val }); return query; },
                neq(col, val) { query._filters.push({ type: 'neq', col, val }); return query; },
                in(col, val) { query._filters.push({ type: 'in', col, val }); return query; },
                gte(col, val) { query._filters.push({ type: 'gte', col, val }); return query; },
                lte(col, val) { query._filters.push({ type: 'lte', col, val }); return query; },
                not(col, op, val) { query._filters.push({ type: 'not', col, op, val }); return query; },
                order(col, opts) { query._order = { col, asc: !(opts && opts.ascending === false) }; return query; },
                limit(n) { query._limit = n; return query; },
                range(from, to) { query._range = [from, to]; return query; },
                insert(payload) {
                    store.writes = store.writes || [];
                    store.writes.push({ table, payload });
                    return Promise.resolve({ data: payload, error: { message: 'insert refusé sur endpoint analytique' } });
                },
                update(payload) {
                    store.writes = store.writes || [];
                    store.writes.push({ table, payload, op: 'update' });
                    return Promise.resolve({ data: null, error: { message: 'update refusé sur endpoint analytique' } });
                },
                then(resolve, reject) {
                    return Promise.resolve(execute()).then(resolve, reject);
                }
            };

            function execute() {
                if (store.errors && store.errors[table]) {
                    return { data: null, error: { message: store.errors[table] }, count: null };
                }
                let rows = (store[table] || []).slice();
                rows = rows.filter((row) => matches(row, query._filters));
                if (query._order) {
                    rows.sort((a, b) => {
                        const av = a[query._order.col];
                        const bv = b[query._order.col];
                        if (av === bv) return 0;
                        const cmp = av > bv ? 1 : -1;
                        return query._order.asc ? cmp : -cmp;
                    });
                }
                const count = rows.length;
                if (query._range) rows = rows.slice(query._range[0], query._range[1] + 1);
                else if (query._limit != null) rows = rows.slice(0, query._limit);
                if (query._head) return { data: null, error: null, count };
                return { data: rows, error: null, count: query._count ? count : null };
            }

            return query;
        }
    };
}

function sampleStore() {
    return {
        profiles: [
            { id: 'real-1', account_type: 'real', first_name: 'Ada', last_name: 'Lovelace', city: 'Pointe-à-Pitre', territory: 'guadeloupe', kyc_verified: true, is_pro: true, created_at: hoursAgo(10) },
            { id: 'real-2', account_type: 'real', first_name: 'Incomplet', last_name: '', city: '', territory: 'martinique', kyc_verified: false, is_pro: false, created_at: hoursAgo(80) },
            { id: 'seed-1', account_type: 'seed', first_name: 'Maison', last_name: 'Lyann', city: 'Le Gosier', territory: 'guadeloupe', created_at: hoursAgo(200) }
        ],
        requests: [
            { id: 'req-multi', created_at: hoursAgo(20), status: 'OPEN', territory: 'guadeloupe' },
            { id: 'req-accepted', created_at: hoursAgo(40), status: 'OPEN', territory: 'guadeloupe' },
            { id: 'req-none', created_at: hoursAgo(60), status: 'OPEN', territory: 'martinique' },
            { id: 'req-old', created_at: hoursAgo(200), status: 'OPEN', territory: 'guadeloupe' }
        ],
        quotes: [
            { id: 'q1', request_id: 'req-multi', created_at: hoursAgo(18), status: 'SENT', updated_at: hoursAgo(18) },
            { id: 'q2', request_id: 'req-multi', created_at: hoursAgo(16), status: 'REJECTED', updated_at: hoursAgo(15) },
            { id: 'q3', request_id: 'req-accepted', created_at: hoursAgo(30), status: 'ACCEPTED', updated_at: hoursAgo(8) },
            { id: 'q-old', request_id: 'req-old', created_at: hoursAgo(180), status: 'SENT', updated_at: hoursAgo(180) }
        ],
        missions: [
            { id: 'm-new', created_at: hoursAgo(12), completed_at: null, status: 'IN_PROGRESS', related_request_id: 'req-accepted' },
            { id: 'm-done', created_at: hoursAgo(200), completed_at: hoursAgo(5), status: 'COMPLETED', related_request_id: 'req-accepted' },
            { id: 'm-old-done', created_at: hoursAgo(400), completed_at: hoursAgo(300), status: 'COMPLETED', related_request_id: 'req-old' }
        ],
        payments: [
            { id: 'p1', payment_status: 'SUCCEEDED', customer_total_cents: 12000, lyann_revenue_cents: 1200, created_at: hoursAgo(8) },
            { id: 'p2', payment_status: 'SUCCEEDED', customer_total_cents: 8000, lyann_revenue_cents: 800, created_at: '2026-09-15T12:00:00.000Z' },
            { id: 'p3', payment_status: 'FAILED', customer_total_cents: 5000, lyann_revenue_cents: 500, created_at: hoursAgo(2) }
        ],
        bokantaj_posts: [
            { id: 'post-real', author_id: 'real-1', public_moderation_status: 'approved', territory: 'guadeloupe', created_at: hoursAgo(3) },
            { id: 'post-seed', author_id: 'seed-1', public_moderation_status: 'approved', territory: 'guadeloupe', created_at: hoursAgo(4) },
            { id: 'post-pending', author_id: 'real-1', public_moderation_status: 'pending', territory: 'guadeloupe', created_at: hoursAgo(1) }
        ],
        lyann_agents: [{ id: 'agent-1', status: 'ACTIVE', linked_profile_id: 'agent-profile' }],
        lyann_agent_tasks: [
            { id: 'task-1', approval_status: 'PENDING', status: 'WAITING', agent_name: 'LYANN Actu', created_at: hoursAgo(2) },
            { id: 'task-fail', approval_status: 'REJECTED', status: 'FAILED', agent_name: 'LYANN Actu', created_at: hoursAgo(1) }
        ],
        user_reports: [{ id: 'rep-1', status: 'OPEN' }],
        disputes: [],
        conversations: [{ id: 'c1' }]
    };
}

function center(store, extras = {}) {
    return createControlCenter({
        supabaseAdmin: createFakeSupabase(store),
        verifyAdminPermission: extras.verifyAdminPermission || (async () => ({ authorized: true, role: 'OWNER', status: 200 })),
        now: () => NOW,
        pageSize: extras.pageSize || 200,
        hardCap: extras.hardCap || 5000,
        cacheTtlMs: extras.cacheTtlMs || 1
    });
}

test('period 30d is a rolling window and month is the civil month', () => {
    const rolling = periodBounds('30d', NOW);
    const month = periodBounds('month', NOW);
    const all = periodBounds('all', NOW);
    assert.equal(rolling.kind, 'rolling_window');
    assert.equal(month.kind, 'calendar_month');
    assert.equal(month.start, '2026-10-01T00:00:00.000Z');
    assert.equal(all.start, null);
    assert.match(DEFINITIONS.conversionRequestToQuote, /au moins un devis/);
});

test('several quotes on one request count as a single request conversion', async () => {
    const kpis = await center(sampleStore()).computeKpis({ period: '7d', territory: 'all' }, { includeFinance: true });
    const conv = kpis.metrics.conversionRequestToQuote;
    assert.equal(conv.available, true);
    assert.equal(conv.kind, 'cohort');
    assert.equal(conv.value, Number((2 / 3).toFixed(3)));
    assert.equal(kpis.metrics.quotesIssued.value, 3);
});

test('accepted quote after a status change stays in the issued cohort', async () => {
    const kpis = await center(sampleStore()).computeKpis({ period: '7d' }, { includeFinance: true });
    const conv = kpis.metrics.conversionQuoteToAccept;
    assert.equal(conv.available, true);
    assert.equal(conv.value, Number((1 / 3).toFixed(3)));
    assert.equal(kpis.metrics.quotesAccepted.available, false);
    assert.match(kpis.metrics.quotesAccepted.error, /accepted_at/i);
});

test('missions created and completed use different dates', async () => {
    const kpis = await center(sampleStore()).computeKpis({ period: '7d' }, { includeFinance: true });
    assert.equal(kpis.metrics.missionsCreated.value, 1);
    assert.equal(kpis.metrics.missionsCompleted.value, 1);
});

test('calendar month excludes payments from the previous month', async () => {
    const kpis = await center(sampleStore()).computeKpis({ period: 'month' }, { includeFinance: true });
    assert.equal(kpis.period_kind, 'calendar_month');
    assert.equal(kpis.metrics.gmvPeriod.value, 120);
    assert.equal(kpis.metrics.collectedCommissions.value, 12);
});

test('territory filter does not mix Martinique into Guadeloupe conversions', async () => {
    const kpis = await center(sampleStore()).computeKpis({ period: '7d', territory: 'guadeloupe' }, { includeFinance: true });
    assert.equal(kpis.metrics.gmvPeriod.available, false);
    assert.match(kpis.metrics.gmvPeriod.error, /territoire/);
    assert.equal(kpis.metrics.conversionRequestToQuote.value, 1);
    assert.equal(kpis.metrics.realMembers.value, 1);
});

test('missing API tables stay unavailable instead of zero', async () => {
    const store = sampleStore();
    store.errors = { payments: 'relation payments missing', quotes: 'quotes timeout' };
    const kpis = await center(store).computeKpis({ period: '30d' }, { includeFinance: true });
    assert.equal(kpis.metrics.gmvPeriod.available, false);
    assert.notEqual(kpis.metrics.gmvPeriod.value, 0);
    assert.equal(kpis.metrics.conversionRequestToQuote.available, false);
    assert.equal(kpis.metrics.unanswered24h.available, false);
});

test('empty database returns zeros only when the query succeeded', async () => {
    const kpis = await center({
        profiles: [],
        requests: [],
        quotes: [],
        missions: [],
        payments: [],
        bokantaj_posts: [],
        lyann_agents: [],
        lyann_agent_tasks: [],
        user_reports: [],
        disputes: [],
        conversations: []
    }).computeKpis({ period: '30d' }, { includeFinance: true });
    assert.equal(kpis.metrics.realMembers.value, 0);
    assert.equal(kpis.metrics.realMembers.available, true);
    assert.equal(kpis.metrics.gmvPeriod.value, 0);
    assert.equal(kpis.metrics.conversionRequestToQuote.available, true);
    assert.equal(kpis.metrics.conversionRequestToQuote.reason, 'dénominateur nul');
    assert.equal(kpis.metrics.activeMembers.available, false);
    assert.equal(kpis.metrics.noFirstContact.available, false);
});

test('more than 1000 open requests without a complete fetch stay unavailable', async () => {
    const requests = [];
    for (let i = 0; i < 1001; i += 1) {
        requests.push({ id: `r${i}`, created_at: hoursAgo(80), status: 'OPEN', territory: 'guadeloupe' });
    }
    const store = sampleStore();
    store.requests = requests;
    store.quotes = [];
    const kpis = await center(store, { pageSize: 200, hardCap: 1000 }).computeKpis({ period: '30d' }, { includeFinance: true });
    assert.equal(kpis.metrics.unanswered48h.available, false);
    assert.match(kpis.metrics.unanswered48h.error, /tronqué/);
    assert.equal(kpis.metrics.conversionRequestToQuote.available, false);
});

test('completed profiles ignore empty names and do not use a sample cap', async () => {
    const kpis = await center(sampleStore()).computeKpis({ period: '30d' }, { includeFinance: false });
    assert.equal(kpis.metrics.completedProfiles.value, 1);
});

test('organic and maison posts stay separated', async () => {
    const kpis = await center(sampleStore()).computeKpis({ period: '30d' }, { includeFinance: false });
    assert.equal(kpis.metrics.bokantajOrganic.value, 1);
    assert.equal(kpis.metrics.bokantajAdministered.value, 1);
    assert.equal(kpis.metrics.bokantajEditorial.value, 0);
    assert.equal(kpis.metrics.bokantajUnknown.value, 0);
    assert.equal(kpis.metrics.seedMembers.value, 1);
    assert.equal(kpis.metrics.editorialAgents.value, 1);
});

test('unanswered ads ignore first-contact fiction and count only missing quotes', async () => {
    const kpis = await center(sampleStore()).computeKpis({ period: '30d' }, { includeFinance: false });
    assert.equal(kpis.metrics.unanswered24h.value, 1);
    assert.equal(kpis.metrics.unanswered48h.value, 1);
    assert.equal(kpis.metrics.noFirstContact.available, false);
    assert.equal(kpis.metrics.noConfirmedMission.value, 2);
});

test('median first quote uses every request of the period that has a quote', async () => {
    const kpis = await center(sampleStore()).computeKpis({ period: '7d' }, { includeFinance: false });
    assert.equal(kpis.metrics.medianFirstQuoteHours.available, true);
    assert.equal(kpis.metrics.medianFirstQuoteHours.sampleSize, 2);
    assert.ok(kpis.metrics.medianFirstQuoteHours.value >= 2);
});

test('finance figures stay hidden without a finance role and never write', async () => {
    const store = sampleStore();
    const db = createFakeSupabase(store);
    const cc = createControlCenter({
        supabaseAdmin: db,
        verifyAdminPermission: async (_req, perm) => {
            if (perm === 'finance.refund') return { authorized: true, role: 'SUPPORT', status: 200 };
            return { authorized: true, role: 'SUPPORT', status: 200 };
        },
        now: () => NOW,
        cacheTtlMs: 1
    });
    assert.equal(await cc.canSeeFinance({}, { role: 'SUPPORT' }), false);
    assert.equal(await cc.canSeeFinance({}, { role: 'OWNER' }), true);
    const kpis = await cc.computeKpis({ period: '30d' }, { includeFinance: await cc.canSeeFinance({}, { role: 'SUPPORT' }) });
    assert.equal(kpis.metrics.gmvPeriod.available, false);
    const routes = {};
    const app = { get(path, handler) { routes[path] = handler; } };
    cc.register(app);
    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; }
    };
    await routes['/v1/admin/kpis']({ headers: {}, query: { period: '30d' } }, res);
    assert.equal(res.body.metrics.gmvPeriod.available, false);
    assert.equal((store.writes || []).length, 0);
});

test('unauthenticated callers are rejected and authenticated owners receive data', async () => {
    const store = sampleStore();
    const cc = createControlCenter({
        supabaseAdmin: createFakeSupabase(store),
        verifyAdminPermission: async (req) => {
            if (req.headers.authorization === 'Bearer admin') return { authorized: true, role: 'OWNER', status: 200 };
            return { authorized: false, status: 401, error: 'Authentification administrative requise.' };
        },
        now: () => NOW,
        cacheTtlMs: 1
    });
    const routes = {};
    const app = { get(path, handler) { routes[path] = handler; } };
    cc.register(app);
    const denied = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    await routes['/v1/admin/control-center']({ headers: {}, query: {} }, denied);
    assert.equal(denied.statusCode, 401);
    const ok = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    await routes['/v1/admin/control-center']({ headers: { authorization: 'Bearer admin' }, query: { period: '7d' } }, ok);
    assert.equal(ok.body.success, true);
    assert.equal(ok.body.financeLocked, true);
});

test('action queue errors never become an empty success', async () => {
    const store = sampleStore();
    store.errors = { bokantaj_posts: 'timeout', lyann_agent_tasks: 'timeout', user_reports: 'timeout', disputes: 'timeout', requests: 'timeout' };
    const actions = await center(store).computeActions();
    assert.equal(actions.available, false);
    assert.ok(actions.errors.length > 0);
    assert.equal(actions.items.length, 0);
});

test('action queue keeps valid alerts when only one source fails', async () => {
    const store = sampleStore();
    store.errors = { disputes: 'timeout' };
    const actions = await center(store).computeActions();
    assert.equal(actions.partial, true);
    assert.ok(actions.items.some((item) => item.id === 'editorial-pending'));
    assert.ok(actions.errors.some((item) => item.id === 'open-disputes'));
});

test('paginated payments are fully summed instead of truncated to one page', async () => {
    const payments = [];
    for (let i = 0; i < 250; i += 1) {
        payments.push({
            id: `pay-${i}`,
            payment_status: 'SUCCEEDED',
            customer_total_cents: 100,
            lyann_revenue_cents: 10,
            created_at: hoursAgo(2)
        });
    }
    const store = sampleStore();
    store.payments = payments;
    const kpis = await center(store, { pageSize: 100 }).computeKpis({ period: '7d' }, { includeFinance: true });
    assert.equal(kpis.metrics.gmvPeriod.available, true);
    assert.equal(kpis.metrics.gmvPeriod.value, 250);
});

test('quote-to-accept cohort includes quotes created now on older requests', async () => {
    const store = sampleStore();
    store.quotes.push({
        id: 'q-on-old-request',
        request_id: 'req-old',
        created_at: hoursAgo(6),
        status: 'ACCEPTED',
        updated_at: hoursAgo(6)
    });
    const kpis = await center(store).computeKpis({ period: '7d' }, { includeFinance: false });
    assert.equal(kpis.metrics.quotesIssued.value, 4);
    assert.equal(kpis.metrics.conversionQuoteToAccept.value, Number((2 / 4).toFixed(3)));
    assert.equal(kpis.metrics.conversionRequestToQuote.value, Number((2 / 3).toFixed(3)));
});

test('unknown and editorial authors are never counted as organic Bokantaj', async () => {
    const store = sampleStore();
    store.profiles.push({ id: 'agent-profile', account_type: 'real', first_name: 'Bot', last_name: 'Actu', city: 'Basse-Terre', territory: 'guadeloupe', created_at: hoursAgo(10) });
    store.bokantaj_posts.push(
        { id: 'post-agent', author_id: 'agent-profile', public_moderation_status: 'approved', territory: 'guadeloupe', created_at: hoursAgo(2) },
        { id: 'post-ghost', author_id: 'missing-user', public_moderation_status: 'approved', territory: 'guadeloupe', created_at: hoursAgo(2) },
        { id: 'post-null', author_id: null, public_moderation_status: 'approved', territory: 'guadeloupe', created_at: hoursAgo(2) }
    );
    const kpis = await center(store).computeKpis({ period: '30d' }, { includeFinance: false });
    assert.equal(kpis.metrics.bokantajOrganic.value, 1);
    assert.equal(kpis.metrics.bokantajAdministered.value, 1);
    assert.equal(kpis.metrics.bokantajEditorial.value, 1);
    assert.equal(kpis.metrics.bokantajUnknown.value, 2);
});

test('finance.refund never grants analytic finance read', async () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'api/admin-control-center.js'), 'utf8');
    assert.equal(source.includes("verifyAdminPermission(req, 'finance.refund')"), false);
    assert.match(source, /SUPER_ADMIN.*OWNER|OWNER.*SUPER_ADMIN/);
});
