'use strict';

const TICKET_STATUSES = Object.freeze(['open', 'in_progress', 'waiting', 'resolved', 'closed']);
const TICKET_PRIORITIES = Object.freeze(['low', 'medium', 'high', 'critical']);
const TRANSITIONS = Object.freeze({
    open: ['in_progress', 'waiting', 'resolved', 'closed'],
    in_progress: ['waiting', 'resolved', 'closed', 'open'],
    waiting: ['in_progress', 'resolved', 'closed', 'open'],
    resolved: ['open', 'closed'],
    closed: ['open']
});
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
    return UUID_RE.test(String(value || '').trim());
}

function escapeLike(value) {
    return String(value || '').replace(/[%_\\]/g, '\\$&');
}

function nextReference(now = Date.now()) {
    return `HD-${String(now).slice(-8)}`;
}

function ageMs(from, to) {
    if (!from) return null;
    return Math.max(0, new Date(to).getTime() - new Date(from).getTime());
}

function canTransition(from, to) {
    return (TRANSITIONS[from] || []).includes(to);
}

function taskRunnable(task, killSwitchOn) {
    if (!task) return { ok: false, code: 'NOT_FOUND' };
    if (killSwitchOn) return { ok: false, code: 'KILL_SWITCH' };
    if (task.archived_at || task.status === 'ARCHIVED') return { ok: false, code: 'ARCHIVED' };
    if (task.status === 'SUSPENDED') return { ok: false, code: 'SUSPENDED' };
    if (task.status === 'RUNNING') return { ok: false, code: 'ALREADY_RUNNING' };
    if (task.requires_approval && task.approval_status === 'PENDING') return { ok: false, code: 'APPROVAL_REQUIRED' };
    return { ok: true };
}

function createOperationsEngine({ db, now = () => new Date().toISOString(), notify } = {}) {
    if (!db) throw new Error('db required');

    async function listTickets(query = {}) {
        const rows = await db.listTickets(query);
        return (rows || []).map((row) => ({
            ...row,
            age_ms: ageMs(row.created_at, now()),
            first_response_ms: ageMs(row.created_at, row.first_response_at),
            resolution_ms: ageMs(row.created_at, row.resolved_at)
        }));
    }

    async function createTicket(actorId, input) {
        const subject = String(input.subject || '').trim();
        if (subject.length < 3) return { ok: false, status: 400, error: 'Le sujet doit contenir au moins 3 caractères.' };
        const priority = TICKET_PRIORITIES.includes(input.priority) ? input.priority : 'medium';
        const memberId = isUuid(input.member_id) ? input.member_id : null;
        const ticket = await db.insertTicket({
            reference: nextReference(Date.parse(now()) || Date.now()),
            member_id: memberId,
            created_by: actorId || null,
            assigned_to: isUuid(input.assigned_to) ? input.assigned_to : null,
            subject,
            status: 'open',
            priority,
            conversation_id: isUuid(input.conversation_id) ? input.conversation_id : null,
            report_id: isUuid(input.report_id) ? input.report_id : null,
            created_at: now(),
            updated_at: now()
        });
        if (String(input.body || '').trim()) {
            await db.insertMessage({
                ticket_id: ticket.id,
                author_id: actorId || null,
                kind: 'public',
                body: String(input.body).trim(),
                created_at: now()
            });
        }
        await db.insertEvent({
            ticket_id: ticket.id,
            actor_id: actorId || null,
            action: 'created',
            payload: { subject, priority },
            created_at: now()
        });
        return { ok: true, ticket };
    }

    async function getTicket(id) {
        const ticket = await db.getTicket(id);
        if (!ticket) return { ok: false, status: 404, error: 'Ticket introuvable.' };
        const messages = await db.listMessages(id);
        const events = await db.listEvents(id);
        return {
            ok: true,
            ticket: {
                ...ticket,
                age_ms: ageMs(ticket.created_at, now()),
                first_response_ms: ageMs(ticket.created_at, ticket.first_response_at),
                resolution_ms: ageMs(ticket.created_at, ticket.resolved_at)
            },
            messages: messages || [],
            events: events || []
        };
    }

    async function addMessage(actorId, id, input) {
        const ticket = await db.getTicket(id);
        if (!ticket) return { ok: false, status: 404, error: 'Ticket introuvable.' };
        const body = String(input.body || '').trim();
        if (!body) return { ok: false, status: 400, error: 'Le message est vide.' };
        const kind = input.kind === 'internal' ? 'internal' : 'public';
        const message = await db.insertMessage({
            ticket_id: id,
            author_id: actorId || null,
            kind,
            body,
            created_at: now()
        });
        const patch = { updated_at: now() };
        if (kind === 'public' && !ticket.first_response_at) patch.first_response_at = now();
        if (kind === 'public' && ticket.status === 'open') patch.status = 'in_progress';
        await db.updateTicket(id, patch);
        await db.insertEvent({
            ticket_id: id,
            actor_id: actorId || null,
            action: kind === 'internal' ? 'note' : 'reply',
            payload: { kind },
            created_at: now()
        });
        if (kind === 'public' && typeof notify === 'function' && ticket.member_id) {
            await notify({
                userId: ticket.member_id,
                type: 'SUPPORT_REPLY',
                title: 'Réponse de l’équipe LYANN',
                body: body.slice(0, 140),
                entityType: 'helpdesk_ticket',
                entityId: id
            });
        }
        return { ok: true, message };
    }

    async function setStatus(actorId, id, status) {
        if (!TICKET_STATUSES.includes(status)) return { ok: false, status: 400, error: 'Statut inconnu.' };
        const ticket = await db.getTicket(id);
        if (!ticket) return { ok: false, status: 404, error: 'Ticket introuvable.' };
        if (ticket.status === status) return { ok: true, ticket };
        if (!canTransition(ticket.status, status)) {
            return { ok: false, status: 409, error: `Passage de ${ticket.status} à ${status} interdit.` };
        }
        const patch = { status, updated_at: now() };
        if (status === 'resolved' || status === 'closed') patch.resolved_at = ticket.resolved_at || now();
        if (status === 'open') patch.resolved_at = null;
        const updated = await db.updateTicket(id, patch);
        await db.insertEvent({
            ticket_id: id,
            actor_id: actorId || null,
            action: status === 'open' && (ticket.status === 'resolved' || ticket.status === 'closed') ? 'reopened' : 'status',
            payload: { from: ticket.status, to: status },
            created_at: now()
        });
        return { ok: true, ticket: updated };
    }

    async function assign(actorId, id, assigneeId) {
        const ticket = await db.getTicket(id);
        if (!ticket) return { ok: false, status: 404, error: 'Ticket introuvable.' };
        const assignedTo = isUuid(assigneeId) ? assigneeId : null;
        const updated = await db.updateTicket(id, {
            assigned_to: assignedTo,
            status: ticket.status === 'open' ? 'in_progress' : ticket.status,
            updated_at: now()
        });
        await db.insertEvent({
            ticket_id: id,
            actor_id: actorId || null,
            action: 'assigned',
            payload: { assigned_to: assignedTo },
            created_at: now()
        });
        return { ok: true, ticket: updated };
    }

    async function getTask(id) {
        const task = await db.getTask(id);
        if (!task) return { ok: false, status: 404, error: 'Tâche introuvable.' };
        const runs = await db.listTaskRuns(id);
        const history = await db.listTaskHistory(id);
        return { ok: true, task, runs: runs || [], history: history || [] };
    }

    async function updateTask(actorId, id, input, killSwitchOn) {
        const current = await db.getTask(id);
        if (!current) return { ok: false, status: 404, error: 'Tâche introuvable.' };
        if (current.status === 'ARCHIVED' || current.archived_at) {
            return { ok: false, status: 409, error: 'Une tâche archivée ne peut plus être modifiée.' };
        }
        const patch = { updated_at: now() };
        if (input.title != null) patch.title = String(input.title).trim();
        if (input.instruction != null) patch.instruction = String(input.instruction).trim();
        if (input.priority != null) patch.priority = String(input.priority);
        if (!patch.title && input.title != null) return { ok: false, status: 400, error: 'Le titre est vide.' };
        if (!patch.instruction && input.instruction != null) return { ok: false, status: 400, error: 'Les instructions sont vides.' };
        const updated = await db.updateTask(id, patch);
        await db.recordTaskHistory(id, actorId, 'updated', { before: current, after: updated });
        return { ok: true, task: updated, kill_switch: !!killSwitchOn };
    }

    async function setTaskStatus(actorId, id, status, killSwitchOn) {
        const current = await db.getTask(id);
        if (!current) return { ok: false, status: 404, error: 'Tâche introuvable.' };
        if ((current.status === 'ARCHIVED' || current.archived_at) && status !== 'ARCHIVED') {
            return { ok: false, status: 409, error: 'Une tâche archivée ne peut plus être réactivée.', code: 'ARCHIVED' };
        }
        if (status === 'QUEUED' && killSwitchOn) {
            return { ok: false, status: 409, error: 'Le kill switch global bloque toute reprise.', code: 'KILL_SWITCH' };
        }
        const updated = await db.updateTask(id, {
            status,
            archived_at: status === 'ARCHIVED' ? now() : current.archived_at,
            updated_at: now()
        });
        await db.recordTaskHistory(id, actorId, status.toLowerCase(), { from: current.status, to: status });
        return { ok: true, task: updated, runnable: taskRunnable(updated, killSwitchOn) };
    }

    async function retryTask(actorId, id, killSwitchOn) {
        const current = await db.getTask(id);
        const gate = taskRunnable(current, killSwitchOn);
        if (!current) return { ok: false, status: 404, error: 'Tâche introuvable.' };
        if (current.status !== 'FAILED') return { ok: false, status: 409, error: 'Seule une tâche en échec peut être relancée.' };
        if (!gate.ok && gate.code !== 'APPROVAL_REQUIRED') {
            return { ok: false, status: 409, error: 'Relance bloquée.', code: gate.code };
        }
        if (gate.code === 'APPROVAL_REQUIRED') {
            return { ok: false, status: 409, error: 'Une validation humaine est encore requise.', code: gate.code };
        }
        const updated = await db.updateTask(id, {
            status: 'QUEUED',
            error: null,
            updated_at: now()
        });
        await db.insertTaskRun({
            task_id: id,
            status: 'blocked',
            error: 'Relance enregistrée. Le worker n’a pas encore exécuté la tâche.',
            started_at: now(),
            finished_at: now()
        });
        await db.recordTaskHistory(id, actorId, 'retry_queued', { from: current.status });
        return { ok: true, task: updated, executed: false };
    }

    return {
        listTickets,
        createTicket,
        getTicket,
        addMessage,
        setStatus,
        assign,
        getTask,
        updateTask,
        setTaskStatus,
        retryTask,
        canTransition,
        taskRunnable,
        TICKET_STATUSES,
        TICKET_PRIORITIES
    };
}

function supabaseOperationsDb(supabaseAdmin) {
    return {
        async listTickets(query) {
            let q = supabaseAdmin.from('helpdesk_tickets').select('*').order('created_at', { ascending: false }).limit(80);
            if (query.status && query.status !== 'all') q = q.eq('status', query.status);
            if (query.priority && query.priority !== 'all') q = q.eq('priority', query.priority);
            if (query.assigned_to) q = q.eq('assigned_to', query.assigned_to);
            if (query.since) q = q.gte('created_at', query.since);
            if (query.q) {
                const term = escapeLike(query.q);
                q = q.or(`subject.ilike.%${term}%,reference.ilike.%${term}%,member_id.eq.${isUuid(query.q) ? query.q : '00000000-0000-0000-0000-000000000000'}`);
            }
            const { data, error } = await q;
            if (error) throw error;
            return data || [];
        },
        async insertTicket(row) {
            const { data, error } = await supabaseAdmin.from('helpdesk_tickets').insert(row).select('*').single();
            if (error) throw error;
            return data;
        },
        async getTicket(id) {
            const { data, error } = await supabaseAdmin.from('helpdesk_tickets').select('*').eq('id', id).maybeSingle();
            if (error) throw error;
            return data;
        },
        async updateTicket(id, patch) {
            const { data, error } = await supabaseAdmin.from('helpdesk_tickets').update(patch).eq('id', id).select('*').single();
            if (error) throw error;
            return data;
        },
        async listMessages(id) {
            const { data, error } = await supabaseAdmin.from('helpdesk_messages').select('*').eq('ticket_id', id).order('created_at', { ascending: true });
            if (error) throw error;
            return data || [];
        },
        async insertMessage(row) {
            const { data, error } = await supabaseAdmin.from('helpdesk_messages').insert(row).select('*').single();
            if (error) throw error;
            return data;
        },
        async listEvents(id) {
            const { data, error } = await supabaseAdmin.from('helpdesk_events').select('*').eq('ticket_id', id).order('created_at', { ascending: true });
            if (error) throw error;
            return data || [];
        },
        async insertEvent(row) {
            const { data, error } = await supabaseAdmin.from('helpdesk_events').insert(row).select('*').maybeSingle();
            if (error) throw error;
            return data;
        },
        async getTask(id) {
            const { data, error } = await supabaseAdmin.from('lyann_agent_tasks').select('*').eq('id', id).maybeSingle();
            if (error) throw error;
            return data;
        },
        async updateTask(id, patch) {
            const { data, error } = await supabaseAdmin.from('lyann_agent_tasks').update(patch).eq('id', id).select('*').single();
            if (error) throw error;
            return data;
        },
        async listTaskRuns(id) {
            const { data, error } = await supabaseAdmin.from('lyann_agent_task_runs').select('*').eq('task_id', id).order('created_at', { ascending: false }).limit(20);
            if (error) return [];
            return data || [];
        },
        async insertTaskRun(row) {
            await supabaseAdmin.from('lyann_agent_task_runs').insert(row);
        },
        async listTaskHistory(id) {
            const { data, error } = await supabaseAdmin
                .from('admin_audit_events')
                .select('id, action, actor_id, reason, created_at, after_state')
                .eq('target_id', id)
                .eq('target_type', 'lyann_agent_task')
                .order('created_at', { ascending: false })
                .limit(30);
            if (error) return [];
            return data || [];
        },
        async recordTaskHistory(id, actorId, action, payload) {
            await supabaseAdmin.from('admin_audit_events').insert({
                actor_type: 'ADMIN',
                actor_id: actorId || null,
                actor_name: 'admin',
                action,
                module_name: 'agents',
                target_type: 'lyann_agent_task',
                target_id: id,
                after_state: payload || {},
                reason: action
            });
        }
    };
}

async function readKillSwitch(supabaseAdmin) {
    const { data } = await supabaseAdmin.from('system_settings').select('value').eq('key', 'agents_global_kill_switch').maybeSingle();
    return Boolean(data && data.value && data.value.suspended);
}

function missingTable(error) {
    return error && (error.code === 'PGRST205' || /helpdesk_|lyann_agent_task_runs|schema cache/i.test(error.message || ''));
}

function registerAdminOperations(app, { supabaseAdmin, verifyAdminPermission }) {
    const engine = createOperationsEngine({
        db: supabaseOperationsDb(supabaseAdmin),
        notify: async ({ userId, type, title, body, entityType, entityId }) => {
            try {
                await supabaseAdmin.rpc('lyann_insert_notification', {
                    p_user_id: userId,
                    p_type: type,
                    p_title: title,
                    p_body: body,
                    p_entity_type: entityType,
                    p_entity_id: entityId
                });
            } catch (_) {}
        }
    });

    async function authorizeHelpdesk(req) {
        const support = await verifyAdminPermission(req, 'support.manage');
        if (support.authorized || support.status === 401) return support;
        return verifyAdminPermission(req, 'users.manage');
    }

    function sendEngine(res, result) {
        if (!result.ok) return res.status(result.status || 400).json({ success: false, error: result.error, code: result.code || null });
        const payload = Object.assign({ success: true }, result);
        delete payload.ok;
        return res.json(payload);
    }

    app.get('/v1/admin/operations/helpdesk', async (req, res) => {
        const auth = await authorizeHelpdesk(req);
        if (!auth.authorized) return res.status(auth.status).json({ success: false, error: auth.error });
        try {
            const tickets = await engine.listTickets({
                q: req.query.q,
                status: req.query.status,
                priority: req.query.priority,
                assigned_to: req.query.assigned_to,
                since: req.query.since
            });
            return res.json({ success: true, tickets });
        } catch (error) {
            if (missingTable(error)) {
                return res.status(503).json({ success: false, error: 'Helpdesk indisponible : appliquez la migration 75 sur Staging.' });
            }
            return res.status(500).json({ success: false, error: error.message || 'Helpdesk indisponible.' });
        }
    });

    app.post('/v1/admin/operations/helpdesk', async (req, res) => {
        const auth = await authorizeHelpdesk(req);
        if (!auth.authorized) return res.status(auth.status).json({ success: false, error: auth.error });
        try {
            return sendEngine(res, await engine.createTicket(auth.userId, req.body || {}));
        } catch (error) {
            if (missingTable(error)) return res.status(503).json({ success: false, error: 'Helpdesk indisponible : appliquez la migration 75 sur Staging.' });
            return res.status(500).json({ success: false, error: error.message || 'Création impossible.' });
        }
    });

    app.get('/v1/admin/operations/helpdesk/:id', async (req, res) => {
        const auth = await authorizeHelpdesk(req);
        if (!auth.authorized) return res.status(auth.status).json({ success: false, error: auth.error });
        try {
            return sendEngine(res, await engine.getTicket(req.params.id));
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message || 'Ticket indisponible.' });
        }
    });

    app.post('/v1/admin/operations/helpdesk/:id/messages', async (req, res) => {
        const auth = await authorizeHelpdesk(req);
        if (!auth.authorized) return res.status(auth.status).json({ success: false, error: auth.error });
        try {
            return sendEngine(res, await engine.addMessage(auth.userId, req.params.id, req.body || {}));
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message || 'Message non enregistré.' });
        }
    });

    app.post('/v1/admin/operations/helpdesk/:id/status', async (req, res) => {
        const auth = await authorizeHelpdesk(req);
        if (!auth.authorized) return res.status(auth.status).json({ success: false, error: auth.error });
        try {
            return sendEngine(res, await engine.setStatus(auth.userId, req.params.id, req.body && req.body.status));
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message || 'Statut non modifié.' });
        }
    });

    app.post('/v1/admin/operations/helpdesk/:id/assign', async (req, res) => {
        const auth = await authorizeHelpdesk(req);
        if (!auth.authorized) return res.status(auth.status).json({ success: false, error: auth.error });
        try {
            return sendEngine(res, await engine.assign(auth.userId, req.params.id, req.body && req.body.assigned_to));
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message || 'Attribution impossible.' });
        }
    });

    app.get('/v1/admin/operations/tasks/:id', async (req, res) => {
        const auth = await verifyAdminPermission(req, 'agents.approve');
        if (!auth.authorized) return res.status(auth.status).json({ success: false, error: auth.error });
        try {
            return sendEngine(res, await engine.getTask(req.params.id));
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message || 'Tâche indisponible.' });
        }
    });

    app.patch('/v1/admin/operations/tasks/:id', async (req, res) => {
        const auth = await verifyAdminPermission(req, 'agents.approve');
        if (!auth.authorized) return res.status(auth.status).json({ success: false, error: auth.error });
        try {
            return sendEngine(res, await engine.updateTask(auth.userId, req.params.id, req.body || {}, await readKillSwitch(supabaseAdmin)));
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message || 'Tâche non enregistrée.' });
        }
    });

    app.post('/v1/admin/operations/tasks/:id/suspend', async (req, res) => {
        const auth = await verifyAdminPermission(req, 'agents.approve');
        if (!auth.authorized) return res.status(auth.status).json({ success: false, error: auth.error });
        return sendEngine(res, await engine.setTaskStatus(auth.userId, req.params.id, 'SUSPENDED', await readKillSwitch(supabaseAdmin)));
    });

    app.post('/v1/admin/operations/tasks/:id/resume', async (req, res) => {
        const auth = await verifyAdminPermission(req, 'agents.approve');
        if (!auth.authorized) return res.status(auth.status).json({ success: false, error: auth.error });
        return sendEngine(res, await engine.setTaskStatus(auth.userId, req.params.id, 'QUEUED', await readKillSwitch(supabaseAdmin)));
    });

    app.post('/v1/admin/operations/tasks/:id/archive', async (req, res) => {
        const auth = await verifyAdminPermission(req, 'agents.approve');
        if (!auth.authorized) return res.status(auth.status).json({ success: false, error: auth.error });
        return sendEngine(res, await engine.setTaskStatus(auth.userId, req.params.id, 'ARCHIVED', await readKillSwitch(supabaseAdmin)));
    });

    app.post('/v1/admin/operations/tasks/:id/retry', async (req, res) => {
        const auth = await verifyAdminPermission(req, 'agents.approve');
        if (!auth.authorized) return res.status(auth.status).json({ success: false, error: auth.error });
        try {
            return sendEngine(res, await engine.retryTask(auth.userId, req.params.id, await readKillSwitch(supabaseAdmin)));
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message || 'Relance impossible.' });
        }
    });
}

module.exports = {
    createOperationsEngine,
    registerAdminOperations,
    canTransition,
    taskRunnable,
    TICKET_STATUSES
};
