'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    createModerationCenter,
    normalizeDecision,
    displayStatus,
    restrictionFromSanctions,
    restrictionLabel,
    isUserId,
    authBanDuration
} = require('../api/admin-moderation-center');
const { applyDecision } = require('../api/moderation-worker');

const sql = fs.readFileSync(path.join(__dirname, '..', '73_moderation_center.sql'), 'utf8');
const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'api/server.js'), 'utf8');
const adminSrc = fs.readFileSync(path.join(__dirname, '..', 'admin-script.js'), 'utf8');

function createFakeSupabase(store) {
    store.writes = store.writes || [];
    store.authUpdates = store.authUpdates || [];
    function matches(row, filters) {
        return filters.every((filter) => {
            const value = row[filter.col];
            if (filter.type === 'eq') return value === filter.val;
            if (filter.type === 'in') return (filter.val || []).includes(value);
            if (filter.type === 'gte') return value >= filter.val;
            return true;
        });
    }
    function chain(table) {
        const query = {
            _filters: [],
            _payload: null,
            _op: 'select',
            select(_cols, opts) { query._count = opts && opts.count; return query; },
            eq(col, val) { query._filters.push({ type: 'eq', col, val }); return query; },
            in(col, val) { query._filters.push({ type: 'in', col, val }); return query; },
            gte(col, val) { query._filters.push({ type: 'gte', col, val }); return query; },
            or() { return query; },
            order() { return query; },
            limit() { return query; },
            range(from, to) { query._from = from; query._to = to; return query; },
            update(payload) { query._op = 'update'; query._payload = payload; return query; },
            insert(payload) {
                const rows = Array.isArray(payload) ? payload : [payload];
                store[table] = (store[table] || []).concat(rows);
                store.writes.push({ table, op: 'insert', payload });
                return Promise.resolve({ data: payload, error: null });
            },
            maybeSingle() { return Promise.resolve(execute(true)); },
            then(resolve, reject) { return Promise.resolve(execute(false)).then(resolve, reject); }
        };
        function execute(single) {
            if (store.errors && store.errors[table]) {
                return { data: single ? null : null, error: { message: store.errors[table] } };
            }
            let rows = (store[table] || []).filter((row) => matches(row, query._filters));
            if (query._op === 'update') {
                store.writes.push({ table, op: 'update', payload: query._payload, filters: query._filters });
                rows.forEach((row) => Object.assign(row, query._payload));
            }
            const count = rows.length;
            if (query._from != null) rows = rows.slice(query._from, (query._to || query._from) + 1);
            return { data: single ? (rows[0] || null) : rows, error: null, count };
        }
        return query;
    }
    return {
        from: chain,
        auth: {
            admin: {
                updateUserById(id, patch) {
                    store.authUpdates.push({ id, patch });
                    if (store.authFail) return Promise.resolve({ data: null, error: { message: 'auth down' } });
                    return Promise.resolve({ data: { id }, error: null });
                },
                signOut(id) {
                    store.authUpdates.push({ id, signOut: 'global' });
                    return Promise.resolve({ error: null });
                }
            }
        }
    };
}

test('human hide is distinct from a pending rejection', () => {
    assert.deepEqual(displayStatus({ public_moderation_status: 'rejected', human_decision: 'hide' }), {
        key: 'hidden', label: 'Masqué', visible: false
    });
    assert.equal(displayStatus({ public_moderation_status: 'approved' }).visible, true);
    assert.equal(normalizeDecision('approve'), 'approved');
    assert.equal(normalizeDecision('hide'), 'hide');
});

test('SQL keeps human lock above an automatic approve', () => {
    assert.match(sql, /human_moderation_lock/);
    assert.match(sql, /lyann_preserve_human_moderation_lock/);
    assert.match(sql, /lyann_account_is_restricted/);
    assert.match(sql, /lyann_block_restricted_writes/);
    assert.match(sql, /IF NEW.human_moderation_lock IS TRUE/);
    assert.match(sql, /trg_block_restricted_quotes/);
    const rollback = fs.readFileSync(path.join(__dirname, '..', '73_moderation_center_rollback.sql'), 'utf8');
    assert.match(rollback, /DROP FUNCTION IF EXISTS public.lyann_account_is_restricted/);
    assert.match(sql, /account_sanctions/);
    assert.doesNotMatch(sql, /gzispjfoywklpqatjyop/);
});

test('hiding a visible post locks it and an IA approve cannot win', async () => {
    const store = {
        bokantaj_posts: [{
            id: 'post-1',
            author_id: 'u1',
            content: 'Lyann QA',
            public_moderation_status: 'approved',
            human_moderation_lock: false,
            created_at: '2026-10-22T00:00:00Z'
        }],
        moderation_jobs: [],
        admin_audit_events: []
    };
    const center = createModerationCenter({ supabaseAdmin: createFakeSupabase(store) });
    const hidden = await center.applyContentDecision({
        subject: 'post',
        id: 'post-1',
        decision: 'hide',
        reason: 'QA hide',
        actorId: 'admin-1'
    });
    assert.equal(hidden.ok, true);
    assert.equal(hidden.visible, false);
    assert.equal(store.bokantaj_posts[0].human_moderation_lock, true);
    assert.equal(store.bokantaj_posts[0].human_decision, 'hide');

    const ai = await applyDecision(createFakeSupabase(store), {
        id: 'job-1',
        subject_type: 'post',
        subject_id: 'post-1'
    }, { row: store.bokantaj_posts[0], pendingEdit: null }, { decision: 'approved' });
    assert.equal(ai, 'human_lock');
    assert.equal(store.bokantaj_posts[0].public_moderation_status, 'rejected');
});

test('a human hide stays labelled hidden even if status is still approved', () => {
    const shown = displayStatus({
        public_moderation_status: 'approved',
        human_decision: 'hide',
        human_moderation_lock: true
    });
    assert.equal(shown.key, 'hidden');
    assert.equal(shown.visible, false);
});

test('a hide that stays approved is a failure, not a fake success', async () => {
    const store = {
        bokantaj_posts: [{
            id: 'post-1',
            public_moderation_status: 'approved',
            content: 'visible'
        }],
        moderation_jobs: [],
        admin_audit_events: []
    };
    const supabase = createFakeSupabase(store);
    const originalFrom = supabase.from;
    supabase.from = (table) => {
        const query = originalFrom(table);
        const innerUpdate = query.update.bind(query);
        query.update = (payload) => {
            const next = innerUpdate(payload);
            const innerMaybe = next.maybeSingle.bind(next);
            next.maybeSingle = async () => {
                const result = await innerMaybe();
                if (table === 'bokantaj_posts' && result.data) {
                    result.data.public_moderation_status = 'approved';
                }
                return result;
            };
            return next;
        };
        return query;
    };
    const center = createModerationCenter({ supabaseAdmin: supabase });
    const hidden = await center.applyContentDecision({
        subject: 'post', id: 'post-1', decision: 'hide', reason: 'QA', actorId: 'admin-1'
    });
    assert.equal(hidden.ok, false);
    assert.equal(hidden.status, 409);
});

test('restoring a hidden post republishes it', async () => {
    const store = {
        bokantaj_posts: [{
            id: 'post-1',
            public_moderation_status: 'rejected',
            human_moderation_lock: true,
            human_decision: 'hide',
            previous_public_status: 'pending',
            content: 'Lyann'
        }],
        moderation_jobs: [],
        admin_audit_events: []
    };
    const center = createModerationCenter({ supabaseAdmin: createFakeSupabase(store) });
    const restored = await center.applyContentDecision({
        subject: 'post', id: 'post-1', decision: 'restore', reason: 'QA', actorId: 'admin-1'
    });
    assert.equal(restored.ok, true);
    assert.equal(restored.visible, true);
    assert.equal(store.bokantaj_posts[0].public_moderation_status, 'approved');
});

test('failed content action does not mark a report resolved', async () => {
    const store = {
        bokantaj_posts: [],
        bokantaj_reports: [{ id: 'rep-1', status: 'OPEN' }],
        user_reports: [],
        admin_audit_events: [],
        moderation_jobs: []
    };
    const app = {
        routes: {},
        get() {},
        post(path, handler) { this.routes[path] = handler; }
    };
    createModerationCenter({
        supabaseAdmin: createFakeSupabase(store),
        verifyAdminPermission: async () => ({ authorized: true, userId: 'admin-1' })
    }).register(app);
    const req = {
        params: { id: 'rep-1' },
        body: { source: 'bokantaj', status: 'RESOLVED', content_action: 'hide', subject: 'post', target_id: 'missing' }
    };
    const res = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; }
    };
    await app.routes['/v1/admin/moderation-center/reports/:id'](req, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.report_updated, false);
    assert.equal(store.bokantaj_reports[0].status, 'OPEN');
});

test('suspend writes a real restriction and Auth ban, not is_verified', async () => {
    const store = {
        profiles: [{ id: 'user-1', restriction_status: 'none', restricted_until: null }],
        admin_members: [],
        missions: [],
        account_sanctions: [],
        admin_audit_events: []
    };
    const supabase = createFakeSupabase(store);
    const center = createModerationCenter({ supabaseAdmin: supabase });
    const result = await center.applySanction({
        userId: 'user-1',
        kind: 'suspend',
        reason: 'QA suspend',
        duration: '24h',
        actorId: 'admin-1'
    });
    assert.equal(result.ok, true);
    assert.equal(result.restriction.restricted, true);
    assert.equal(store.profiles[0].restriction_status, 'suspended');
    assert.equal(store.authUpdates.some((row) => row.patch && row.patch.ban_duration === '24h'), true);
    assert.equal(restrictionFromSanctions(store.profiles[0]).restricted, true);
    assert.equal(authBanDuration('ban'), '876000h');
    assert.match(serverSrc, /is_verified n’est pas une suspension/);
    assert.doesNotMatch(adminSrc, /adminUpdateUserStatus\(userId, \{ is_verified: false \}\)/);
});

test('non-admin callers receive 403 and no write', async () => {
    const store = { bokantaj_posts: [{ id: 'post-1', public_moderation_status: 'approved' }] };
    const app = { routes: {}, get(path, handler) { this.routes[path] = handler; }, post(path, handler) { this.routes[path] = handler; } };
    createModerationCenter({
        supabaseAdmin: createFakeSupabase(store),
        verifyAdminPermission: async () => ({ authorized: false, status: 403, error: 'Droits insuffisants' })
    }).register(app);
    const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; } };
    await app.routes['/v1/admin/moderation-center/content/:subject/:id']({ params: { subject: 'post', id: 'post-1' }, body: { decision: 'hide' } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(store.bokantaj_posts[0].public_moderation_status, 'approved');
});

test('self and admin accounts cannot be sanctioned', async () => {
    const store = {
        profiles: [{ id: 'admin-1', restriction_status: 'none' }],
        admin_members: [{ id: 'm1', user_id: 'admin-1', status: 'ACTIVE' }],
        missions: [],
        account_sanctions: []
    };
    const center = createModerationCenter({ supabaseAdmin: createFakeSupabase(store) });
    const self = await center.applySanction({
        userId: 'admin-1',
        kind: 'ban',
        reason: 'nope',
        actorId: 'admin-1'
    });
    assert.equal(self.status, 403);
    const otherAdmin = await center.applySanction({
        userId: 'admin-1',
        kind: 'ban',
        reason: 'nope',
        actorId: 'other'
    });
    assert.equal(otherAdmin.status, 403);
});

test('Auth failure after a profile write is a partial result, not a full success', async () => {
    const store = {
        profiles: [{ id: 'user-1', first_name: 'QA', last_name: 'One', restriction_status: 'none', restricted_until: null }],
        admin_members: [],
        missions: [],
        account_sanctions: [],
        admin_audit_events: [],
        authFail: true
    };
    const result = await createModerationCenter({ supabaseAdmin: createFakeSupabase(store) }).applySanction({
        userId: 'user-1',
        kind: 'suspend',
        reason: 'QA partial',
        duration: '24h',
        actorId: 'admin-1'
    });
    assert.equal(result.ok, true);
    assert.equal(result.complete, false);
    assert.equal(result.partial, true);
    assert.equal(result.status, 207);
    assert.equal(result.retry_auth, true);
    assert.equal(store.profiles[0].restriction_status, 'suspended');
    assert.match(result.note, /Auth/);
    assert.equal(restrictionLabel('suspended'), 'Suspendu');
    assert.equal(isUserId('2c1e7c3a-6c0a-4f2d-9c1b-0a1b2c3d4e5f'), true);
});

test('users tab finds a member by exact id beyond the first page', async () => {
    const target = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const profiles = Array.from({ length: 90 }, (_, i) => ({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        first_name: 'Membre',
        last_name: `N${i}`,
        restriction_status: 'none',
        created_at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`
    }));
    profiles.push({
        id: target,
        first_name: 'QA',
        last_name: 'Hidden',
        restriction_status: 'none',
        created_at: '2025-01-01T00:00:00Z'
    });
    const app = { routes: {}, get(path, handler) { this.routes[path] = handler; }, post() {} };
    createModerationCenter({
        supabaseAdmin: createFakeSupabase({ profiles, account_sanctions: [], moderation_jobs: [] }),
        verifyAdminPermission: async () => ({ authorized: true, userId: 'admin-1' })
    }).register(app);
    const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; } };
    await app.routes['/v1/admin/moderation-center']({ query: { tab: 'users', q: target } }, res);
    assert.equal(res.body.success, true);
    assert.equal(res.body.rows.length, 1);
    assert.equal(res.body.rows[0].id, target);
    assert.equal(res.body.rows[0].restriction.label, 'Normal');
    const detail = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; } };
    await app.routes['/v1/admin/moderation-center/users/:id']({ params: { id: target } }, detail);
    assert.equal(detail.body.user.id, target);
});
