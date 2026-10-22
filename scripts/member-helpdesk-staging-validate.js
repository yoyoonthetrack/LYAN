'use strict';

require('./force-staging-v2-env');

const { createClient } = require('@supabase/supabase-js');
const { resolveAdminAndJwt, STAGING_REF } = require('./admin-staging-real-session-lib');

const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const API = process.env.LYANN_OPS_API || 'http://127.0.0.1:8298';
const MARKER = `QA-V33-${Date.now()}`;

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

async function memberSession(email, password) {
    const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const signed = await anon.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session) throw new Error(signed.error ? signed.error.message : 'Session membre impossible.');
    return { userId: signed.data.user.id, token: signed.data.session.access_token };
}

async function call(path, { method = 'GET', token, body } = {}) {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json().catch(() => ({})) };
}

(async () => {
    assertStaging();
    const report = { environment: 'staging', supabase_ref: STAGING_REF, api: API, ok: false };
    const identity = await call('/v1/runtime/identity');
    report.identity = { status: identity.status, supabase_ref: identity.json && identity.json.supabase_ref };
    if (identity.json && identity.json.supabase_ref && identity.json.supabase_ref !== STAGING_REF) {
        throw new Error('API non isolée.');
    }
    const member = await memberSession(process.env.LYANN_E2E_QA_A_EMAIL, process.env.LYANN_E2E_QA_A_PASSWORD);
    const other = await memberSession(process.env.LYANN_E2E_QA_B_EMAIL, process.env.LYANN_E2E_QA_B_PASSWORD);
    const owner = await resolveAdminAndJwt();
    const created = await call('/v1/me/helpdesk', {
        method: 'POST',
        token: member.token,
        body: { subject: 'Compte', body: `${MARKER} accès membre`, member_id: other.userId, priority: 'critical' }
    });
    report.create = { status: created.status, ok: created.json.success === true, id: created.json.ticket && created.json.ticket.id, member_id: created.json.ticket && created.json.ticket.member_id };
    if (!created.json.ticket) throw new Error(created.json.error || 'Création membre échouée.');
    if (created.json.ticket.member_id && created.json.ticket.member_id !== member.userId) {
        throw new Error('member_id client a été accepté.');
    }
    const ticketId = created.json.ticket.id;
    const listedAdmin = await call('/v1/admin/operations/helpdesk', { token: owner.jwt });
    report.admin_sees_ticket = Array.isArray(listedAdmin.json.tickets) && listedAdmin.json.tickets.some((row) => row.id === ticketId);
    const replied = await call(`/v1/admin/operations/helpdesk/${ticketId}/messages`, {
        method: 'POST',
        token: owner.jwt,
        body: { kind: 'public', body: `${MARKER} réponse admin` }
    });
    report.admin_reply = { status: replied.status, ok: replied.json.success === true, notified: replied.json.notified === true };
    const sb = adminClient();
    const { data: notes } = await sb.from('notifications').select('id, title, body, entity_id').eq('user_id', member.userId).eq('entity_id', ticketId).order('created_at', { ascending: false }).limit(3);
    report.notification = { found: Array.isArray(notes) && notes.length > 0, count: (notes || []).length };
    const memberRead = await call(`/v1/me/helpdesk/${ticketId}`, { token: member.token });
    const memberReply = await call(`/v1/me/helpdesk/${ticketId}/messages`, {
        method: 'POST',
        token: member.token,
        body: { body: `${MARKER} réponse membre` }
    });
    report.member_read = { status: memberRead.status, ok: memberRead.json.success === true, public: (memberRead.json.messages || []).length };
    report.member_reply = { status: memberReply.status, ok: memberReply.json.success === true };
    const noted = await call(`/v1/admin/operations/helpdesk/${ticketId}/messages`, {
        method: 'POST',
        token: owner.jwt,
        body: { kind: 'internal', body: `${MARKER} note interne` }
    });
    const afterNote = await call(`/v1/me/helpdesk/${ticketId}`, { token: member.token });
    report.internal_hidden = !(afterNote.json.messages || []).some((row) => /note interne/.test(row.body || ''));
    report.admin_note = { status: noted.status, ok: noted.json.success === true };
    const otherRead = await call(`/v1/me/helpdesk/${ticketId}`, { token: other.token });
    report.other_blocked = otherRead.status === 404 || otherRead.json.success !== true;
    const resolved = await call(`/v1/admin/operations/helpdesk/${ticketId}/status`, {
        method: 'POST',
        token: owner.jwt,
        body: { status: 'resolved' }
    });
    const history = await call(`/v1/me/helpdesk/${ticketId}`, { token: member.token });
    report.resolved_history = {
        status: resolved.json.ticket && resolved.json.ticket.status,
        still_readable: history.json.success === true,
        messages: (history.json.messages || []).length
    };
    const anon = await call('/v1/me/helpdesk');
    report.rbac_anonymous = anon.status === 401;
    report.ok = Boolean(
        report.create.ok
        && report.admin_sees_ticket
        && report.admin_reply.ok
        && report.member_reply.ok
        && report.internal_hidden
        && report.other_blocked
        && report.resolved_history.still_readable
        && report.rbac_anonymous
    );
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 2);
})().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
});
