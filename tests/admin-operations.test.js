'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createOperationsEngine, canTransition, taskRunnable, registerAdminOperations } = require('../api/admin-operations');

function memoryDb() {
    const tickets = new Map();
    const messages = [];
    const events = [];
    const tasks = new Map();
    const runs = [];
    const history = [];
    return {
        tickets,
        async listTickets(query) {
            return [...tickets.values()].filter((row) => {
                if (query.status && query.status !== 'all' && row.status !== query.status) return false;
                if (query.q && !`${row.subject} ${row.reference} ${row.member_id || ''}`.includes(query.q)) return false;
                return true;
            });
        },
        async insertTicket(row) {
            const ticket = Object.assign({ id: `t${tickets.size + 1}` }, row);
            tickets.set(ticket.id, ticket);
            return ticket;
        },
        async getTicket(id) { return tickets.get(id) || null; },
        async updateTicket(id, patch) {
            const next = Object.assign({}, tickets.get(id), patch);
            tickets.set(id, next);
            return next;
        },
        async listMessages(id) { return messages.filter((row) => row.ticket_id === id); },
        async insertMessage(row) { messages.push(row); return row; },
        async listEvents(id) { return events.filter((row) => row.ticket_id === id); },
        async insertEvent(row) { events.push(row); return row; },
        async getTask(id) { return tasks.get(id) || null; },
        async updateTask(id, patch) {
            const next = Object.assign({}, tasks.get(id), patch);
            tasks.set(id, next);
            return next;
        },
        async listTaskRuns(id) { return runs.filter((row) => row.task_id === id); },
        async insertTaskRun(row) { runs.push(row); },
        async listTaskHistory(id) { return history.filter((row) => row.id === id); },
        async recordTaskHistory(id, actorId, action) { history.push({ id, actorId, action }); },
        seedTask(task) { tasks.set(task.id, task); }
    };
}

test('helpdesk persists create, reply, resolve and reopen', async () => {
    const db = memoryDb();
    const engine = createOperationsEngine({ db, now: () => '2026-10-22T08:00:00.000Z' });
    const created = await engine.createTicket('admin-1', { subject: 'Compte bloqué', member_id: 'a3401c97-c68f-4e2f-8b92-b920632b4c50', body: 'Bonjour' });
    assert.equal(created.ok, true);
    const listed = await engine.listTickets({});
    assert.equal(listed.length, 1);
    const replied = await engine.addMessage('admin-1', created.ticket.id, { body: 'Nous regardons cela.', kind: 'public' });
    assert.equal(replied.ok, true);
    const detail = await engine.getTicket(created.ticket.id);
    assert.equal(detail.ticket.status, 'in_progress');
    assert.ok(detail.ticket.first_response_at);
    const resolved = await engine.setStatus('admin-1', created.ticket.id, 'resolved');
    assert.equal(resolved.ok, true);
    const reopened = await engine.setStatus('admin-1', created.ticket.id, 'open');
    assert.equal(reopened.ticket.status, 'open');
    assert.equal(canTransition('closed', 'resolved'), false);
});

test('helpdesk rejects a fake success without persistence', async () => {
    const db = memoryDb();
    const engine = createOperationsEngine({ db });
    const created = await engine.createTicket('admin-1', { subject: 'ab' });
    assert.equal(created.ok, false);
    assert.equal((await engine.listTickets({})).length, 0);
});

test('RBAC-like task gates block archive, kill switch and concurrent run', () => {
    assert.equal(taskRunnable({ status: 'ARCHIVED' }, false).code, 'ARCHIVED');
    assert.equal(taskRunnable({ status: 'QUEUED' }, true).code, 'KILL_SWITCH');
    assert.equal(taskRunnable({ status: 'RUNNING' }, false).code, 'ALREADY_RUNNING');
    assert.equal(taskRunnable({ status: 'FAILED', requires_approval: true, approval_status: 'PENDING' }, false).code, 'APPROVAL_REQUIRED');
    assert.equal(taskRunnable({ status: 'FAILED' }, false).ok, true);
});

test('archived tasks cannot be resumed', async () => {
    const db = memoryDb();
    db.seedTask({ id: 'task-2', status: 'ARCHIVED', archived_at: '2026-10-22T08:00:00.000Z' });
    const engine = createOperationsEngine({ db });
    const resumed = await engine.setTaskStatus('admin-1', 'task-2', 'QUEUED', false);
    assert.equal(resumed.ok, false);
    assert.equal(resumed.code, 'ARCHIVED');
});

test('retry queues a failed task without claiming execution', async () => {
    const db = memoryDb();
    db.seedTask({ id: 'task-1', status: 'FAILED', requires_approval: false });
    const engine = createOperationsEngine({ db });
    const retried = await engine.retryTask('admin-1', 'task-1', false);
    assert.equal(retried.ok, true);
    assert.equal(retried.executed, false);
    assert.equal(retried.task.status, 'QUEUED');
});

function captureApp() {
    const routes = {};
    const add = (method) => (path, handler) => {
        routes[`${method} ${path}`] = handler;
    };
    return {
        routes,
        get: add('GET'),
        post: add('POST'),
        patch: add('PATCH')
    };
}

function mockRes() {
    const out = {};
    return {
        out,
        status(code) {
            out.status = code;
            return this;
        },
        json(body) {
            out.body = body;
            return this;
        }
    };
}

test('API RBAC refuses helpdesk and task writes without permission', async () => {
    const app = captureApp();
    registerAdminOperations(app, {
        supabaseAdmin: { from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null }) }; } },
        verifyAdminPermission: async () => ({ authorized: false, status: 403, error: 'Accès refusé.' })
    });
    const helpdesk = mockRes();
    await app.routes['GET /v1/admin/operations/helpdesk']({ query: {} }, helpdesk);
    assert.equal(helpdesk.out.status, 403);
    const retry = mockRes();
    await app.routes['POST /v1/admin/operations/tasks/:id/retry']({ params: { id: 'task-1' }, body: {} }, retry);
    assert.equal(retry.out.status, 403);
});

test('API returns 503 when helpdesk tables are missing', async () => {
    const app = captureApp();
    registerAdminOperations(app, {
        supabaseAdmin: {
            from() {
                return {
                    select() { return this; },
                    order() { return this; },
                    limit() { return this; },
                    then(resolve) { return resolve({ data: null, error: { code: 'PGRST205', message: 'schema cache' } }); }
                };
            }
        },
        verifyAdminPermission: async () => ({ authorized: true, userId: 'admin-1' })
    });
    const res = mockRes();
    await app.routes['GET /v1/admin/operations/helpdesk']({ query: {} }, res);
    assert.equal(res.out.status, 503);
    assert.match(res.out.body.error, /migration 75/);
});
