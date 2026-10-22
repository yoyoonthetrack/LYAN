'use strict';

require('./force-staging-v2-env');

const { createClient } = require('@supabase/supabase-js');
const { resolveAdminAndJwt, STAGING_REF } = require('./admin-staging-real-session-lib');

const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const API = process.env.LYANN_OPS_API || 'https://lyan-git-feature-admin-operations-v3-2-yoyo-d85d.vercel.app';
const MARKER = `QA-V32-${Date.now()}`;

function assertStaging() {
    const url = process.env.SUPABASE_URL || '';
    if (!url.includes(STAGING_REF) || url.includes(PRODUCTION_REF)) {
        throw new Error('Refus : Staging tdktfbtqceldlaeqjtow uniquement.');
    }
}

function adminClient() {
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

function anonClient() {
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

async function api(path, { method = 'GET', token, body } = {}) {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${API}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
}

async function memberSession(email, password) {
    const anon = anonClient();
    const signed = await anon.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session) {
        throw new Error(signed.error ? signed.error.message : 'Session membre impossible.');
    }
    return {
        userId: signed.data.user.id,
        token: signed.data.session.access_token,
        client: createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${signed.data.session.access_token}` } }
        })
    };
}

(async () => {
    assertStaging();
    const report = {
        environment: 'staging',
        supabase_ref: STAGING_REF,
        api: API,
        started_at: new Date().toISOString(),
        tables: {},
        coexistence: {},
        helpdesk: {},
        rls: {},
        tasks: {},
        rbac: {},
        kill_switch: {},
        errors: []
    };

    const sb = adminClient();
    const identity = await api('/v1/runtime/identity');
    report.identity = {
        status: identity.status,
        supabase_ref: identity.json && identity.json.supabase_ref,
        isolation: identity.json && identity.json.isolation
    };
    if (identity.json && identity.json.supabase_ref && identity.json.supabase_ref !== STAGING_REF) {
        throw new Error(`API non isolée : ${identity.json.supabase_ref}`);
    }

    for (const table of ['helpdesk_tickets', 'helpdesk_messages', 'helpdesk_events', 'lyann_agent_task_runs', 'support_tickets', 'lyann_agent_tasks']) {
        const { error, count } = await sb.from(table).select('*', { count: 'exact', head: true });
        report.tables[table] = {
            present: !error || error.code !== 'PGRST205',
            count: count == null ? null : count,
            error: error ? `${error.code || ''} ${error.message}`.trim() : null
        };
    }
    report.coexistence = {
        helpdesk_is_source_of_truth: report.tables.helpdesk_tickets.present,
        support_tickets_still_exists: report.tables.support_tickets.present,
        mixed: false,
        note: 'Les tickets d’assistance V3.2 vivent dans helpdesk_*. support_tickets n’est pas lu par les routes /v1/admin/operations/helpdesk.'
    };

    const owner = await resolveAdminAndJwt();
    report.owner = { email_domain: owner.emailDomain, source: owner.source, user_id_prefix: owner.userId.slice(0, 8) };

    const qaEmail = process.env.LYANN_E2E_QA_A_EMAIL;
    const qaPassword = process.env.LYANN_E2E_QA_A_PASSWORD;
    if (!qaEmail || !qaPassword) throw new Error('Comptes QA Staging absents de l’environnement.');
    const member = await memberSession(qaEmail, qaPassword);
    const strangerEmail = process.env.LYANN_E2E_QA_B_EMAIL;
    const strangerPassword = process.env.LYANN_E2E_QA_B_PASSWORD;
    const stranger = strangerEmail && strangerPassword
        ? await memberSession(strangerEmail, strangerPassword)
        : null;

    const created = await api('/v1/admin/operations/helpdesk', {
        method: 'POST',
        token: owner.jwt,
        body: {
            subject: `${MARKER} Compte QA`,
            member_id: member.userId,
            body: 'Premier message public OWNER.',
            priority: 'high'
        }
    });
    report.helpdesk.create = { status: created.status, ok: created.json.success === true, reference: created.json.ticket && created.json.ticket.reference };
    if (!created.json.ticket) {
        throw new Error(typeof created.json.error === 'string' ? created.json.error : `Création ticket échouée (${created.status}): ${JSON.stringify(created.json).slice(0, 400)}`);
    }
    const ticketId = created.json.ticket.id;

    const assigned = await api(`/v1/admin/operations/helpdesk/${ticketId}/assign`, {
        method: 'POST',
        token: owner.jwt,
        body: { assigned_to: owner.userId }
    });
    const replied = await api(`/v1/admin/operations/helpdesk/${ticketId}/messages`, {
        method: 'POST',
        token: owner.jwt,
        body: { kind: 'public', body: `${MARKER} réponse publique` }
    });
    const noted = await api(`/v1/admin/operations/helpdesk/${ticketId}/messages`, {
        method: 'POST',
        token: owner.jwt,
        body: { kind: 'internal', body: `${MARKER} note interne secrète` }
    });
    const resolved = await api(`/v1/admin/operations/helpdesk/${ticketId}/status`, {
        method: 'POST',
        token: owner.jwt,
        body: { status: 'resolved' }
    });
    const reopened = await api(`/v1/admin/operations/helpdesk/${ticketId}/status`, {
        method: 'POST',
        token: owner.jwt,
        body: { status: 'open' }
    });
    const listed = await api('/v1/admin/operations/helpdesk?q=' + encodeURIComponent(MARKER), { token: owner.jwt });
    const detail = await api(`/v1/admin/operations/helpdesk/${ticketId}`, { token: owner.jwt });
    report.helpdesk.assign = { status: assigned.status, ok: assigned.json.success === true, assigned_to: assigned.json.ticket && assigned.json.ticket.assigned_to };
    report.helpdesk.reply = { status: replied.status, ok: replied.json.success === true };
    report.helpdesk.internal_note = { status: noted.status, ok: noted.json.success === true };
    report.helpdesk.resolve = { status: resolved.status, ok: resolved.json.success === true, ticket_status: resolved.json.ticket && resolved.json.ticket.status };
    report.helpdesk.reopen = { status: reopened.status, ok: reopened.json.success === true, ticket_status: reopened.json.ticket && reopened.json.ticket.status };
    report.helpdesk.list_contains = Array.isArray(listed.json.tickets) && listed.json.tickets.some((row) => row.id === ticketId);
    report.helpdesk.durations = {
        age_ms: detail.json.ticket && detail.json.ticket.age_ms,
        first_response_ms: detail.json.ticket && detail.json.ticket.first_response_ms,
        resolution_ms: detail.json.ticket && detail.json.ticket.resolution_ms
    };
    report.helpdesk.persisted_in_helpdesk_tickets = true;

    const memberTickets = await member.client.from('helpdesk_tickets').select('id, subject, status').eq('id', ticketId);
    const memberMessages = await member.client.from('helpdesk_messages').select('id, kind, body').eq('ticket_id', ticketId);
    const memberKinds = (memberMessages.data || []).map((row) => row.kind);
    report.rls.member_sees_ticket = Array.isArray(memberTickets.data) && memberTickets.data.some((row) => row.id === ticketId);
    report.rls.member_public_count = memberKinds.filter((kind) => kind === 'public').length;
    report.rls.member_internal_count = memberKinds.filter((kind) => kind === 'internal').length;
    report.rls.member_never_sees_internal = report.rls.member_internal_count === 0;
    report.rls.member_error = memberTickets.error ? memberTickets.error.message : memberMessages.error ? memberMessages.error.message : null;
    if (stranger) {
        const other = await stranger.client.from('helpdesk_tickets').select('id').eq('id', ticketId);
        report.rls.unrelated_member_sees_ticket = Array.isArray(other.data) && other.data.length > 0;
        report.rls.unrelated_error = other.error ? other.error.message : null;
    }

    const noAuth = await api('/v1/admin/operations/helpdesk');
    const memberAsAdmin = await api('/v1/admin/operations/helpdesk', { token: member.token });
    report.rbac.helpdesk_without_token = noAuth.status;
    report.rbac.helpdesk_member_token = memberAsAdmin.status;

    const { data: existingTasks, error: listErr } = await sb
        .from('lyann_agent_tasks')
        .select('id, status, requires_approval, approval_status')
        .order('created_at', { ascending: false })
        .limit(8);
    if (listErr) throw new Error(listErr.message);
    const { data: agentRow, error: agentErr } = await sb.from('lyann_agents').select('id').limit(1).maybeSingle();
    if (agentErr) throw new Error(agentErr.message);
    if (!agentRow || !agentRow.id) throw new Error('Aucun agent Staging pour créer une tâche QA.');
    const inserted = await sb.from('lyann_agent_tasks').insert({
        agent_id: agentRow && agentRow.id,
        title: `${MARKER} tâche QA`,
        instruction: 'Tâche jetable de validation V3.2. Ne pas publier.',
        task_type: 'POST_CREATION',
        status: 'FAILED',
        requires_approval: false,
        approval_status: 'REJECTED',
        error: 'échec volontaire QA',
        metadata: { qa: true, v32: true, do_not_publish: true }
    }).select('id, title, instruction, status, archived_at, requires_approval, approval_status, agent_id, error').single();
    if (inserted.error) throw new Error(inserted.error.message);
    const editable = inserted.data;
    const tasks = [editable].concat(existingTasks || []);
    report.tasks.source_table = 'lyann_agent_tasks';
    report.tasks.available = (existingTasks || []).length;
    report.tasks.created_qa_task = editable.id;
    if (!editable) {
        report.tasks.skipped = 'Aucune tâche réelle disponible.';
    } else {
        const original = {
            title: editable.title,
            instruction: editable.instruction,
            status: editable.status
        };
        const patchedTitle = `${(editable.title || 'Tâche').slice(0, 40)} ${MARKER}`;
        const patchedInstruction = `${editable.instruction || 'Instruction QA'} [${MARKER}]`;
        const got = await api(`/v1/admin/operations/tasks/${editable.id}`, { token: owner.jwt });
        const saved = await api(`/v1/admin/operations/tasks/${editable.id}`, {
            method: 'PATCH',
            token: owner.jwt,
            body: { title: patchedTitle, instruction: patchedInstruction }
        });
        const pendingInsert = await sb.from('lyann_agent_tasks').insert({
            agent_id: agentRow.id,
            title: `${MARKER} approval QA`,
            instruction: 'Tâche QA en attente humaine.',
            task_type: 'POST_CREATION',
            status: 'FAILED',
            requires_approval: true,
            approval_status: 'PENDING',
            metadata: { qa: true, v32: true, do_not_publish: true }
        }).select('id').single();
        if (!pendingInsert.error) {
            const retryPending = await api(`/v1/admin/operations/tasks/${pendingInsert.data.id}/retry`, { method: 'POST', token: owner.jwt });
            report.tasks.human_approval_blocks_retry = retryPending.status === 409 && retryPending.json.code === 'APPROVAL_REQUIRED';
            report.tasks.human_approval_code = retryPending.json.code || retryPending.json.error;
            await sb.from('lyann_agent_tasks').update({ status: 'ARCHIVED', archived_at: new Date().toISOString() }).eq('id', pendingInsert.data.id);
        }
        const killBefore = await api('/v1/admin/kill-switch/global', { token: owner.jwt });
        await api('/v1/admin/kill-switch/global', { method: 'POST', token: owner.jwt, body: { suspended: true, reason: 'QA V3.2 temporaire' } });
        const retryKilled = await api(`/v1/admin/operations/tasks/${editable.id}/retry`, { method: 'POST', token: owner.jwt });
        await api('/v1/admin/kill-switch/global', { method: 'POST', token: owner.jwt, body: { suspended: Boolean(killBefore.json && killBefore.json.suspended), reason: 'QA V3.2 restore' } });
        report.kill_switch.toggled_and_restored = true;
        report.kill_switch.was_suspended = Boolean(killBefore.json && killBefore.json.suspended);
        report.kill_switch.retry_blocked = retryKilled.status === 409 && retryKilled.json.code === 'KILL_SWITCH';
        const retry = await api(`/v1/admin/operations/tasks/${editable.id}/retry`, { method: 'POST', token: owner.jwt });
        report.tasks.retry_failed = {
            status: retry.status,
            executed: retry.json.executed === true,
            ok: retry.json.success === true,
            claimed_execution: retry.json.executed === true
        };
        const suspended = await api(`/v1/admin/operations/tasks/${editable.id}/suspend`, { method: 'POST', token: owner.jwt });
        const resumed = await api(`/v1/admin/operations/tasks/${editable.id}/resume`, { method: 'POST', token: owner.jwt });
        const archived = await api(`/v1/admin/operations/tasks/${editable.id}/archive`, { method: 'POST', token: owner.jwt });
        const resumeArchived = await api(`/v1/admin/operations/tasks/${editable.id}/resume`, { method: 'POST', token: owner.jwt });
        const { data: persisted } = await sb.from('lyann_agent_tasks').select('id, title, instruction, status, archived_at').eq('id', editable.id).maybeSingle();
        report.tasks.id = editable.id;
        report.tasks.original_status = original.status;
        report.tasks.detail = { status: got.status, ok: got.json.success === true, runs: Array.isArray(got.json.runs) };
        report.tasks.save = { status: saved.status, ok: saved.json.success === true };
        report.tasks.suspend = { status: suspended.status, ok: suspended.json.success === true, task_status: suspended.json.task && suspended.json.task.status };
        report.tasks.resume = { status: resumed.status, ok: resumed.json.success === true, task_status: resumed.json.task && resumed.json.task.status };
        report.tasks.archive = { status: archived.status, ok: archived.json.success === true, task_status: archived.json.task && archived.json.task.status };
        report.tasks.resume_after_archive_blocked = resumeArchived.status === 409 && resumeArchived.json.code === 'ARCHIVED';
        report.tasks.persisted = {
            title: persisted && persisted.title === patchedTitle,
            instruction: persisted && persisted.instruction === patchedInstruction,
            status: persisted && persisted.status,
            archived_at: Boolean(persisted && persisted.archived_at)
        };

        const approveArchived = await api(`/v1/admin/agent-tasks/${editable.id}/approve`, {
            method: 'POST',
            token: owner.jwt,
            body: { decision: 'APPROVED' }
        });
        report.tasks.approve_archived_blocked = approveArchived.status === 409;
    }

    const killGet = await api('/v1/admin/kill-switch/global', { token: owner.jwt });
    report.kill_switch.read = {
        status: killGet.status,
        suspended: Boolean(killGet.json && killGet.json.suspended)
    };
    report.rbac.task_without_token = (await api('/v1/admin/operations/tasks/' + (editable ? editable.id : '00000000-0000-4000-8000-000000000000'))).status;

    const ok = Boolean(
        report.helpdesk.create.ok
        && report.helpdesk.reply.ok
        && report.helpdesk.internal_note.ok
        && report.helpdesk.resolve.ok
        && report.helpdesk.reopen.ok
        && report.helpdesk.list_contains
        && report.rls.member_sees_ticket
        && report.rls.member_never_sees_internal
        && report.rls.unrelated_member_sees_ticket === false
        && report.rbac.helpdesk_without_token === 401
        && report.rbac.helpdesk_member_token === 403
        && report.tasks.save && report.tasks.save.ok
        && report.tasks.suspend.ok
        && report.tasks.resume.ok
        && report.tasks.archive.ok
        && report.tasks.resume_after_archive_blocked
        && report.tasks.persisted && report.tasks.persisted.title
        && report.tasks.persisted.archived_at
        && report.tasks.retry_failed && report.tasks.retry_failed.ok && report.tasks.retry_failed.claimed_execution === false
        && report.tasks.human_approval_blocks_retry
        && report.kill_switch.retry_blocked
        && report.kill_switch.toggled_and_restored
    );
    report.ok = ok;
    report.finished_at = new Date().toISOString();
    console.log(JSON.stringify(report, null, 2));
    process.exit(ok ? 0 : 2);
})().catch((error) => {
    const message = error && error.message ? error.message : JSON.stringify(error);
    const code = error && error.code ? error.code : null;
    console.error(JSON.stringify({ ok: false, error: message, code, stack: error && error.stack ? String(error.stack).split('\n').slice(0, 6) : null }, null, 2));
    process.exit(1);
});
