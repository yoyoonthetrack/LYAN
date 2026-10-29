'use strict';

require('./force-staging-v2-env');

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('@playwright/test');
const { assertStagingIsolation, STAGING_REF } = require('./staging-v2-guard');
const { resolveAdminAndJwt } = require('./admin-staging-real-session-lib');
const { effectivePlan } = require('../lyann-plans');

const API = process.env.LYANN_OPS_API || 'http://127.0.0.1:8098';
const OUT = path.join(__dirname, '..', 'artifacts', 'rc-v14', 'pass.json');
const RESOURCES = ['users', 'lyanneurs', 'requests', 'services', 'missions', 'quotes', 'payments', 'invoices', 'payouts', 'disputes', 'reviews', 'bokantaj', 'reports', 'conversations', 'team', 'health', 'territories', 'feature-flags'];
const report = { environment: 'staging', supabase_ref: STAGING_REF, cases: [], sections: [] };

function record(id, ok, detail) {
    report.cases.push({ id, ok: !!ok, detail: String(detail || '').slice(0, 240) });
    console.log((ok ? 'PASS' : 'FAIL') + ' ' + id + (detail ? ' — ' + detail : ''));
}

function db(token) {
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: token ? { headers: { Authorization: 'Bearer ' + token } } : {}
    });
}

async function signIn(email, password) {
    const anon = db();
    const signed = await anon.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session) throw new Error(signed.error ? signed.error.message : 'signin');
    return { id: signed.data.user.id, token: signed.data.session.access_token, client: db(signed.data.session.access_token) };
}

async function api(token, method, pathname, body) {
    const res = await fetch(API + pathname, {
        method,
        headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    const payload = await res.json().catch(() => ({}));
    return { status: res.status, payload };
}

(async () => {
    assertStagingIsolation(process.env);
    if (!String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_')) throw new Error('Stripe test requis');
    const identity = await fetch(API + '/v1/runtime/identity').then((res) => res.json());
    if (identity.supabase_ref !== STAGING_REF || identity.isolation !== 'STAGING_ISOLATED') throw new Error('API non isolée');
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const owner = await resolveAdminAndJwt();
    const member = await signIn(process.env.LYANN_E2E_QA_C_EMAIL, process.env.LYANN_E2E_QA_C_PASSWORD);
    const A = await signIn(process.env.LYANN_E2E_QA_A_EMAIL, process.env.LYANN_E2E_QA_A_PASSWORD);
    const B = await signIn(process.env.LYANN_E2E_QA_B_EMAIL, process.env.LYANN_E2E_QA_B_PASSWORD);

    for (const resource of RESOURCES) {
        const allowed = await api(owner.jwt, 'GET', '/v1/admin/ops?resource=' + resource);
        const denied = await api(member.token, 'GET', '/v1/admin/ops?resource=' + resource);
        record('admin lit ' + resource, allowed.status === 200 && allowed.payload.success === true, 'status=' + allowed.status);
        record('membre refusé sur ' + resource, denied.status === 401 || denied.status === 403, 'status=' + denied.status);
    }
    const territories = await api(owner.jwt, 'GET', '/v1/admin/ops?resource=territories');
    record('territoires renvoie des comptes', territories.status === 200 && territories.payload.counts && typeof territories.payload.counts === 'object', 'cles=' + Object.keys(territories.payload.counts || {}).length);
    const flags = await api(owner.jwt, 'GET', '/v1/admin/ops?resource=feature-flags');
    record('feature flags listés', flags.status === 200 && Array.isArray(flags.payload.rows), 'lignes=' + ((flags.payload.rows || []).length));

    const center = await api(owner.jwt, 'GET', '/v1/admin/control-center?period=30d&territory=all');
    const market = await api(owner.jwt, 'GET', '/v1/admin/marketplace-stats?period=30d&territory=all');
    const users = await api(owner.jwt, 'GET', '/v1/admin/ops?resource=users');
    const maison = await api(owner.jwt, 'GET', '/v1/admin/maison/profiles');
    record('rubrique action', center.status === 200 && center.payload.success === true, 'status=' + center.status);
    record('rubrique marketplace', market.status === 200 && market.payload.success === true, 'status=' + market.status);
    record('rubrique utilisateurs', users.status === 200 && Array.isArray(users.payload.rows) && users.payload.rows.length > 0, 'lignes=' + ((users.payload.rows || []).length));
    record('rubrique maison', maison.status === 200 && Array.isArray(maison.payload.profiles), 'profils=' + ((maison.payload.profiles || []).length));
    const maisonDenied = await api(member.token, 'GET', '/v1/admin/maison/profiles');
    record('membre refusé sur les profils maison', maisonDenied.status === 401 || maisonDenied.status === 403, 'status=' + maisonDenied.status);

    const stamp = 'RC14-' + Date.now().toString(36);
    const ticket = await api(owner.jwt, 'POST', '/v1/admin/operations/helpdesk', {
        subject: stamp,
        body: 'Ticket QA Staging, fermé dans le même passage.',
        priority: 'low',
        member_id: A.id
    });
    const ticketId = ticket.payload.ticket && ticket.payload.ticket.id;
    record('ticket support créé', ticket.status === 200 && !!ticketId, 'status=' + ticket.status);
    if (ticketId) {
        const read = await api(owner.jwt, 'GET', '/v1/admin/operations/helpdesk/' + ticketId);
        const closed = await api(owner.jwt, 'POST', '/v1/admin/operations/helpdesk/' + ticketId + '/status', { status: 'closed' });
        const again = await api(owner.jwt, 'GET', '/v1/admin/operations/helpdesk/' + ticketId);
        record('ticket relu puis fermé', read.payload.ticket && read.payload.ticket.subject === stamp && again.payload.ticket && again.payload.ticket.status === 'closed', 'statut=' + (again.payload.ticket && again.payload.ticket.status));
        record('fermeture idempotente', closed.status === 200, 'status=' + closed.status);
    }
    const ticketDenied = await api(member.token, 'POST', '/v1/admin/operations/helpdesk', { subject: stamp + '-refus', body: 'non' });
    record('membre ne crée pas de ticket admin', ticketDenied.status === 401 || ticketDenied.status === 403, 'status=' + ticketDenied.status);

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(API + '/admin.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase);
    await page.evaluate(async ({ accessToken, refreshToken }) => {
        await window.LYANN_API_CLIENT.supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (typeof window.runAdminAuthCheck === 'function') await window.runAdminAuthCheck('RC14');
    }, { accessToken: owner.jwt, refreshToken: owner.refresh });
    const watched = {
        'sec-action': '/v1/admin/control-center',
        'sec-marketplace': '/v1/admin/marketplace-stats',
        'sec-users': 'resource=users',
        'sec-maison': '/v1/admin/maison/profiles',
        'sec-territories': 'resource=territories',
        'sec-feature-flags': 'resource=feature-flags'
    };
    for (const [section, needle] of Object.entries(watched)) {
        const response = page.waitForResponse((res) => res.url().includes(needle), { timeout: 15000 }).catch(() => null);
        await page.evaluate((sectionId) => document.querySelector(`a.admin-nav-item[data-section="${sectionId}"]`)?.click(), section);
        const hit = await response;
        const status = hit ? hit.status() : 0;
        report.sections.push({ id: section, status, url: hit ? hit.url().split('?')[0] : '' });
        record('écran ' + section, status === 200, 'status=' + status);
    }
    const filtered = await page.evaluate(() => {
        const input = document.getElementById('userSearchInput');
        if (!input) return { present: false, rows: 0 };
        input.value = 'zzzz-aucun-membre';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return { present: true, rows: document.querySelectorAll('#usersAdminTableBody tr').length };
    });
    record('filtre utilisateurs vide une recherche inconnue', filtered.present && filtered.rows <= 1, 'lignes=' + filtered.rows);
    await browser.close();

    const label = stamp + '-devis';
    const request = await A.client.from('requests').insert({
        requester_id: A.id,
        visibility: 'PUBLIC',
        title: label,
        description: 'Devis QA création, révision, annulation.',
        category: 'Jardinage',
        location: 'Le Gosier',
        urgency: 'Normale',
        status: 'OPEN',
        price_mode: 'QUOTE',
        date_mode: 'FLEXIBLE'
    }).select('id').single();
    record('demande QA créée', !request.error && request.data, request.error && request.error.message);
    let quoteId = null;
    if (request.data) {
        const invite = await A.client.rpc('send_request_invitations', { p_request_id: request.data.id, p_recipient_ids: [B.id] });
        let invitationId = invite.data && (invite.data.invitation_id || invite.data.id);
        if (!invitationId && invite.data && Array.isArray(invite.data.invitations)) invitationId = invite.data.invitations[0] && invite.data.invitations[0].id;
        if (!invitationId) {
            const lookup = await A.client.from('request_invitations').select('id').eq('request_id', request.data.id).eq('recipient_id', B.id).limit(1);
            invitationId = lookup.data && lookup.data[0] && lookup.data[0].id;
        }
        const accepted = await B.client.rpc('accept_request_invitation', { p_invitation_id: invitationId });
        const quote = await B.client.rpc('create_request_quote', {
            p_invitation_id: invitationId,
            p_description: 'Devis initial RC14',
            p_valid_until: null,
            p_milestones_json: [{ title: label, amount: 40, display_order: 1 }]
        });
        quoteId = quote.data && (quote.data.quote_id || quote.data.id);
        record('devis créé', !quote.error && !!quoteId, quote.error && quote.error.message);
        const row = quoteId ? await admin.from('quotes').select('id, version, status, total_amount').eq('id', quoteId).single() : { data: null };
        const revised = quoteId ? await B.client.rpc('revise_sent_quote', {
            p_quote_id: quoteId,
            p_description: 'Devis révisé RC14',
            p_valid_until: null,
            p_milestones_json: [{ title: label, amount: 25, display_order: 1 }],
            p_expected_version: row.data && row.data.version
        }) : { error: { message: 'absent' } };
        const after = quoteId ? await admin.from('quotes').select('version, status, total_amount').eq('id', quoteId).single() : { data: null };
        record('devis modifié', !revised.error && after.data && Number(after.data.total_amount) === 25, revised.error ? revised.error.message : String(after.data && after.data.total_amount));
        const outsider = await A.client.rpc('revise_sent_quote', {
            p_quote_id: quoteId,
            p_description: 'Tentative client',
            p_valid_until: null,
            p_milestones_json: [{ title: label, amount: 10, display_order: 1 }],
            p_expected_version: after.data && after.data.version
        });
        record('le client ne modifie pas le devis', !!outsider.error, outsider.error && outsider.error.message);
        const migration = fs.readFileSync(path.join(__dirname, '..', '51_quote_modifications_and_safety.sql'), 'utf8');
        const reviseBody = migration.slice(migration.indexOf('FUNCTION public.revise_sent_quote'));
        record('révision périmée ne réessaie plus indéfiniment dans la source', /ERRCODE = 'P0001'/.test(reviseBody) && !/40001/.test(reviseBody), 'Staging non migré : PostgREST réessaie 40001');
        const rejected = await A.client.rpc('reject_request_quote', { p_quote_id: quoteId });
        const finalQuote = await admin.from('quotes').select('status').eq('id', quoteId).single();
        record('devis annulé par le client', !rejected.error && finalQuote.data && finalQuote.data.status !== 'SENT', finalQuote.data && finalQuote.data.status);
        const again = await A.client.rpc('reject_request_quote', { p_quote_id: quoteId });
        record('second refus refusé', !!again.error, again.error && again.error.message);
        record('invitation acceptée avant devis', !accepted.error || /already|déjà/i.test(accepted.error.message || ''), accepted.error && accepted.error.message);
    }

    const funded = await admin.from('milestones').select('id').eq('status', 'FUNDED').order('created_at', { ascending: false }).limit(1);
    if (funded.data && funded.data[0]) {
        const refund = await api(A.token, 'POST', '/v1/payments/refund-untransferred', { milestone_id: funded.data[0].id });
        record('remboursement hors grant reste bloqué', refund.status === 409 && refund.payload.code === 'EXECUTION_DISABLED', 'status=' + refund.status + ' code=' + (refund.payload.code || ''));
    } else {
        record('remboursement hors grant reste bloqué', false, 'aucun jalon FUNDED');
    }
    record('formule expirée retombe sur Gratuit', effectivePlan({ plan: 'PRO', status: 'active', expires_at: '2000-01-01T00:00:00Z' }).code === 'FREE', 'FREE');

    const email = 'rc14-' + Date.now().toString(36) + '@lyann.invalid';
    const password = 'Qa14-' + Date.now().toString(36) + '!';
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { first_name: 'RC14' } });
    if (created.error || !created.data.user) {
        record('compte jetable créé', false, created.error && created.error.message);
    } else {
        const userId = created.data.user.id;
        const first = await signIn(email, password);
        const second = await signIn(email, password);
        const ownerClient = db();
        await ownerClient.auth.setSession({ access_token: owner.jwt, refresh_token: owner.refresh });
        const rpcRole = await ownerClient.rpc('admin_update_profile_role', { p_target_user_id: userId, p_new_role: 'EMPLOYEE' });
        record('RPC profil refuse un admin dont le rôle métier n’est pas OWNER', !!rpcRole.error, rpcRole.error && rpcRole.error.message);
        const role = await api(owner.jwt, 'POST', '/v1/admin/ops/users/' + userId + '/role', { role: 'EMPLOYEE' });
        const readRole = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
        const memberRole = await api(first.token, 'POST', '/v1/admin/ops/users/' + userId + '/role', { role: 'ADMIN' });
        const ownerAttempt = await api(owner.jwt, 'POST', '/v1/admin/ops/users/' + userId + '/role', { role: 'OWNER' });
        record('changement de rôle par un admin', role.status === 200 && readRole.data && readRole.data.role === 'EMPLOYEE', 'status=' + role.status + ' role=' + (readRole.data && readRole.data.role));
        record('un membre ne change pas un rôle', memberRole.status === 401 || memberRole.status === 403, 'status=' + memberRole.status);
        record('OWNER ne s’accorde pas par cette opération', ownerAttempt.status === 400, 'status=' + ownerAttempt.status);
        await admin.storage.from('avatars').upload(userId + '/rc14.txt', Buffer.from('qa'), { contentType: 'text/plain', upsert: true });
        await admin.from('device_push_tokens').upsert({
            user_id: userId,
            installation_id: 'rc14-' + userId.slice(0, 8),
            token: 'rc14-token-' + userId.slice(0, 8),
            platform: 'ios',
            apns_environment: 'sandbox',
            active: true,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,installation_id' });
        const pushed = await admin.from('device_push_tokens').select('id, active').eq('user_id', userId);
        record('jeton push posé avant suppression', !!(pushed.data && pushed.data.some((row) => row.active === true)), pushed.error ? pushed.error.message : 'lignes=' + ((pushed.data || []).length));
        const removed = await api(first.token, 'POST', '/v1/auth/delete-account', {});
        record('suppression complète du compte QA', removed.status === 200 && removed.payload.ok === true, 'status=' + removed.status + ' sessions=' + (removed.payload.sessions || ''));
        const old = await admin.auth.getUser(first.token);
        const other = await admin.auth.getUser(second.token);
        record('les deux sessions sont closes', !!(old.error || !old.data.user) && !!(other.error || !other.data.user), old.error ? old.error.message : 'encore ouverte');
        const login = await db().auth.signInWithPassword({ email, password });
        record('reconnexion impossible', !!login.error, login.error && login.error.message);
        const files = await admin.storage.from('avatars').list(userId);
        const leftover = (files.data || []).some((entry) => entry.name === 'rc14.txt');
        record('média personnel retiré', !leftover, leftover ? 'fichier encore présent' : 'absent');
        const tokenRow = await admin.from('device_push_tokens').select('active').eq('user_id', userId);
        const stillActive = (tokenRow.data || []).some((row) => row.active === true);
        record('jeton push désactivé', !stillActive, 'lignes=' + ((tokenRow.data || []).length));
        const profile = await admin.from('profiles').select('first_name, email, phone').eq('id', userId).maybeSingle();
        const personal = profile.data && (profile.data.email || profile.data.phone || profile.data.first_name === 'RC14');
        record('données personnelles inaccessibles', !personal, profile.data ? 'profil anonymisé ou absent' : 'profil absent');
        const audit = await admin.from('admin_audit_events').select('id, action').eq('target_id', userId).eq('action', 'ACCOUNT_DELETED');
        record('journal de suppression', !!(audit.data && audit.data.length), audit.error ? audit.error.message : 'lignes=' + ((audit.data || []).length));
        if (!old.error && old.data.user) await admin.auth.admin.deleteUser(userId);
    }

    report.ok = report.cases.every((row) => row.ok);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: report.ok, cases: report.cases.length, failed: report.cases.filter((row) => !row.ok).map((row) => row.id) }, null, 2));
    if (!report.ok) process.exit(1);
})().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
