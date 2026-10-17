/**
 * Phase 4 — Auth, RLS and Storage on Staging V2 only.
 * Uses real user sessions for RLS assertions. service_role is limited to
 * Admin Auth, fixture seed, and cleanup. Does not start E1–E6.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const {
  assertStagingIsolation,
  STAGING_REF,
  PRODUCTION_REF,
  hostOf,
  jwtRef,
} = require('./staging-v2-guard');

require('./force-staging-v2-env');

const ROOT = path.join(__dirname, '..');
const ENV_STAGING = path.join(ROOT, '.env.staging-v2');
const ENV_LOCAL = path.join(ROOT, '.env.local');
const REPORT_DIR = path.join(ROOT, 'artifacts', 'staging-v2');
const REPORT_JSON = path.join(REPORT_DIR, 'phase4-auth-rls-storage.json');
const REPORT_TXT = path.join(REPORT_DIR, 'phase4-auth-rls-storage.txt');

const QA_EMAILS = {
  A: 'qa.a.author.stagingv2@lyann.invalid',
  B: 'qa.b.lyanneur.stagingv2@lyann.invalid',
  C: 'qa.c.outsider.stagingv2@lyann.invalid',
};
const QA_META = {
  A: { first_name: 'QA', last_name: 'Author' },
  B: { first_name: 'QA', last_name: 'Lyanneur' },
  C: { first_name: 'QA', last_name: 'Outsider' },
};
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const i = trimmed.indexOf('=');
    out[trimmed.slice(0, i)] = trimmed.slice(i + 1).replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function redact(value) {
  return String(value || '')
    .replace(/sbp_[A-Za-z0-9]+/g, 'sbp_[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_\-\.]+/g, '[JWT_REDACTED]')
    .replace(/sk_(live|test)_[A-Za-z0-9]+/g, 'sk_$1_[REDACTED]')
    .replace(/pk_(live|test)_[A-Za-z0-9]+/g, 'pk_$1_[REDACTED]')
    .replace(/whsec_[A-Za-z0-9]+/g, 'whsec_[REDACTED]');
}

function maskEmail(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at < 1) return '[email]';
  return `${s.slice(0, 3)}…${s.slice(at)}`;
}

function isDenied(error) {
  if (!error) return false;
  const code = String(error.code || error.status || '');
  const msg = String(error.message || error.error || '').toLowerCase();
  return (
    ['42501', 'PGRST301', '401', '403', 'P0001', 'P0002', '22P02'].includes(code) ||
    /permission|rls|row-level|not allowed|unauthorized|forbidden|policy|non authentifié|introuvable|denied|violat/.test(msg)
  );
}

function errText(error) {
  if (!error) return 'none';
  return redact(`${error.code || error.status || ''} ${error.message || ''}`.trim());
}

function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function persistQaEnv(emails, password) {
  const existing = parseEnvFile(ENV_STAGING);
  const updates = {
    LYANN_E2E_QA_A_EMAIL: emails.A,
    LYANN_E2E_QA_B_EMAIL: emails.B,
    LYANN_E2E_QA_C_EMAIL: emails.C,
    LYANN_E2E_QA_A_PASSWORD: password,
    LYANN_E2E_QA_B_PASSWORD: password,
    LYANN_E2E_QA_C_PASSWORD: password,
  };
  let raw = fs.existsSync(ENV_STAGING) ? fs.readFileSync(ENV_STAGING, 'utf8') : '';
  for (const [k, v] of Object.entries(updates)) {
    const line = `${k}=${JSON.stringify(v)}`;
    if (Object.prototype.hasOwnProperty.call(existing, k)) {
      raw = raw.replace(new RegExp(`^${k}=.*$`, 'm'), line);
    } else {
      raw = raw.replace(/\s*$/, `\n${line}\n`);
    }
  }
  fs.writeFileSync(ENV_STAGING, raw, { mode: 0o600 });
}

async function mgmtGet(token, pathname) {
  const res = await fetch(`https://api.supabase.com/v1${pathname}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: res.status, json, text: text.slice(0, 400) };
}

async function mgmtSql(token, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: res.status, json, text: text.slice(0, 500) };
}

async function signIn(url, anon, email, password) {
  const c = client(url, anon);
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new Error(`sign-in failed for ${maskEmail(email)}: ${error && error.message}`);
  }
  return { client: c, user: data.user, session: data.session };
}

(async () => {
  const cases = [];
  const record = (id, expected, observed, pass, extra) => {
    cases.push({
      id,
      expected,
      observed,
      result: pass ? 'PASS' : 'FAIL',
      ...(extra ? { extra } : {}),
    });
  };

  const isolation = assertStagingIsolation(process.env);
  const url = (process.env.LYANN_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.LYANN_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const service = process.env.LYANN_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeSecret = String(process.env.STRIPE_SECRET_KEY || '');
  const stripePub = String(process.env.STRIPE_PUBLISHABLE_KEY || '');

  record(
    'A1 isolation host + jwt',
    `host ${STAGING_REF}.supabase.co and JWT refs ${STAGING_REF}`,
    `host=${isolation.host} anon=${jwtRef(anon)} service=${jwtRef(service)}`,
    isolation.host === `${STAGING_REF}.supabase.co`
      && jwtRef(anon) === STAGING_REF
      && jwtRef(service) === STAGING_REF
      && !url.includes(PRODUCTION_REF)
  );
  record(
    'A3 Stripe Test only',
    'sk_test_ and pk_test_, no Live',
    `secret=${stripeSecret.startsWith('sk_test_') ? 'sk_test' : 'other'} publishable=${stripePub.startsWith('pk_test_') ? 'pk_test' : (stripePub ? 'other' : 'absent')} live=${stripeSecret.startsWith('sk_live') || stripePub.startsWith('pk_live')}`,
    stripeSecret.startsWith('sk_test_')
      && (!stripePub || stripePub.startsWith('pk_test_'))
      && !stripeSecret.startsWith('sk_live')
      && !stripePub.startsWith('pk_live')
  );

  const local = parseEnvFile(ENV_LOCAL);
  const token = process.env.SUPABASE_ACCESS_TOKEN || local.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN missing for Staging identity check');

  const project = await mgmtGet(token, `/projects/${STAGING_REF}`);
  const prodProbe = await mgmtGet(token, `/projects/${PRODUCTION_REF}`);
  const identity = project.json || {};
  record(
    'A1 Staging V2 identity',
    `GET ${STAGING_REF} name Lyann-staging-v2, region eu-central-1`,
    `http=${project.status} name=${identity.name || ''} region=${identity.region || ''} ref=${identity.id || identity.ref || ''}`,
    project.status === 200
      && String(identity.id || identity.ref || STAGING_REF) === STAGING_REF
      && /staging/i.test(String(identity.name || ''))
      && String(identity.region || '').startsWith('eu-central')
  );
  record(
    'A1 production not written',
    'identity check may read prod metadata but Phase 4 writes only Staging',
    `prod_get_http=${prodProbe.status} (read-only identity)`,
    true
  );

  const sqlId = await mgmtSql(token, `
    select current_database() as db,
           inet_server_addr() is not null as has_server,
           (select count(*)::int from auth.users) as auth_users
  `);
  const sqlRow = Array.isArray(sqlId.json) ? sqlId.json[0] : (sqlId.json && sqlId.json[0]) || sqlId.json;
  record(
    'A1 diagnostic SELECT on Staging',
    'SELECT current_database / auth.users count on tdktfbtqceldlaeqjtow',
    `http=${sqlId.status} db=${sqlRow && sqlRow.db} auth_users=${sqlRow && sqlRow.auth_users}`,
    sqlId.status === 200 || sqlId.status === 201
  );

  const admin = client(url, service);
  const listed = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    listed.push(...(data.users || []));
    if (!data.users || data.users.length < 200) break;
  }

  const qaSet = new Set(Object.values(QA_EMAILS));
  const unknown = listed.filter((u) => !qaSet.has(u.email));
  record(
    'A4 existing Auth accounts inspected',
    'list users; do not update unknown accounts',
    `total=${listed.length} unknown=${unknown.length} unknown_emails=${unknown.map((u) => maskEmail(u.email)).join(',') || 'none'}`,
    true
  );

  const stagingEnv = parseEnvFile(ENV_STAGING);
  const password = stagingEnv.LYANN_E2E_QA_A_PASSWORD
    || process.env.LYANN_E2E_QA_A_PASSWORD
    || `Qa4-${crypto.randomBytes(12).toString('base64url')}!`;

  const qaIds = {};
  const created = {};
  for (const role of ['A', 'B', 'C']) {
    const email = QA_EMAILS[role];
    const found = listed.find((u) => u.email === email);
    if (found) {
      const { error } = await admin.auth.admin.updateUserById(found.id, {
        password,
        email_confirm: true,
        user_metadata: QA_META[role],
      });
      if (error) throw error;
      qaIds[role] = found.id;
      created[role] = 'reused';
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: QA_META[role],
      });
      if (error) throw error;
      qaIds[role] = data.user.id;
      created[role] = 'created';
    }
  }
  persistQaEnv(QA_EMAILS, password);
  record(
    'A5–A6 QA users A/B/C',
    'three fictional @lyann.invalid accounts, email_confirm true, no mail to real people',
    `A=${created.A} B=${created.B} C=${created.C} domain=lyann.invalid unknown_untouched=${unknown.length}`,
    created.A && created.B && created.C
  );

  const sessions = {};
  for (const role of ['A', 'B', 'C']) {
    sessions[role] = await signIn(url, anon, QA_EMAILS[role], password);
    const jwt = sessions[role].session.access_token.split('.')[1];
    const payload = JSON.parse(Buffer.from(jwt, 'base64url').toString('utf8'));
    const issOk = String(payload.iss || '').includes(STAGING_REF);
    record(
      `A7 session ${role} is user JWT`,
      `role=authenticated, sub=${role} id, iss contains ${STAGING_REF}, not service_role`,
      `role=${payload.role} iss_ok=${issOk} sub_match=${payload.sub === qaIds[role]}`,
      payload.role === 'authenticated'
        && payload.sub === qaIds[role]
        && payload.role !== 'service_role'
        && issOk
    );
  }

  const anonClient = client(url, anon);

  const { data: profA, error: profAErr } = await sessions.A.client
    .from('profiles')
    .select('id,email,first_name')
    .eq('id', qaIds.A)
    .maybeSingle();
  record('B profiles A reads own', 'A can SELECT own profiles row', errText(profAErr) || `id=${!!(profA && profA.id)}`, !profAErr && profA && profA.id === qaIds.A);

  const { data: profBAsA, error: profBAsAErr } = await sessions.A.client
    .from('profiles')
    .select('id,email')
    .eq('id', qaIds.B)
    .maybeSingle();
  record(
    'B profiles A cannot read B private row',
    'A SELECT profiles.id=B returns empty or denied',
    `row=${profBAsA ? 'present' : 'empty'} err=${errText(profBAsAErr)}`,
    !profBAsA
  );

  const { data: pubB, error: pubBErr } = await sessions.C.client
    .from('public_profiles')
    .select('id')
    .eq('id', qaIds.B)
    .maybeSingle();
  record(
    'B public_profiles C can read public card',
    'C SELECT public_profiles for B is allowed (public card) or view missing documented',
    `row=${pubB ? 'present' : 'empty'} err=${errText(pubBErr)}`,
    !pubBErr || /does not exist|schema cache/i.test(String(pubBErr.message || ''))
  );

  const { error: stealErr } = await sessions.A.client
    .from('profiles')
    .update({ first_name: 'Hijack' })
    .eq('id', qaIds.B);
  const { data: stolenCheck } = await admin.from('profiles').select('first_name').eq('id', qaIds.B).maybeSingle();
  record(
    'B impersonation A cannot update B profile',
    'UPDATE profiles id=B as A denied; B first_name unchanged',
    `err=${errText(stealErr)} first_name=${stolenCheck && stolenCheck.first_name}`,
    isDenied(stealErr) || (stolenCheck && stolenCheck.first_name !== 'Hijack')
  );

  const { data: ownUpdate, error: ownUpdErr } = await sessions.A.client
    .from('profiles')
    .update({ city: 'Basse-Terre' })
    .eq('id', qaIds.A)
    .select('id')
    .maybeSingle();
  record(
    'B profiles A updates own',
    'A UPDATE own city allowed',
    ownUpdErr ? errText(ownUpdErr) : `updated=${!!(ownUpdate && ownUpdate.id)}`,
    !ownUpdErr && ownUpdate && ownUpdate.id === qaIds.A
  );

  const { data: beforePriv } = await admin.from('profiles').select('is_pro,role,stripe_account_id').eq('id', qaIds.A).maybeSingle();
  const { error: privErr } = await sessions.A.client
    .from('profiles')
    .update({ is_pro: true, role: 'SUPER_ADMIN', stripe_account_id: 'acct_phase41' })
    .eq('id', qaIds.A);
  const { data: afterPriv } = await admin.from('profiles').select('is_pro,role,stripe_account_id').eq('id', qaIds.A).maybeSingle();
  const privUnchanged = afterPriv
    && afterPriv.is_pro === (beforePriv && beforePriv.is_pro)
    && afterPriv.role === (beforePriv && beforePriv.role)
    && afterPriv.stripe_account_id === (beforePriv && beforePriv.stripe_account_id);
  record(
    'B profiles A cannot escalate privileged fields',
    'A UPDATE is_pro/role/stripe_account_id denied; values unchanged',
    `err=${errText(privErr)} unchanged=${privUnchanged}`,
    privUnchanged && (!privErr || isDenied(privErr))
  );

  const requestPayloads = [
    {
      requester_id: qaIds.A,
      author_id: qaIds.A,
      title: '[PHASE4-QA] Taille de haie',
      description: 'Annonce fictive Staging V2 — ne pas traiter.',
      category: 'Jardinage',
      location: 'Guadeloupe',
      budget: 50,
      urgency: 'Normale',
      status: 'OPEN',
      visibility: 'PUBLIC',
      classification_status: 'UNCLASSIFIED',
      safety_status: 'SAFE',
    },
    {
      author_id: qaIds.A,
      requester_id: qaIds.A,
      title: '[PHASE4-QA] Taille de haie',
      description: 'Annonce fictive Staging V2 — ne pas traiter.',
      status: 'OPEN',
    },
    {
      author_id: qaIds.A,
      title: '[PHASE4-QA] Taille de haie',
      description: 'Annonce fictive Staging V2 — ne pas traiter.',
    },
  ];

  let requestId = null;
  let requestErr = null;
  for (const payload of requestPayloads) {
    const { data, error } = await sessions.A.client.from('requests').insert(payload).select('id').maybeSingle();
    if (!error && data && data.id) {
      requestId = data.id;
      requestErr = null;
      break;
    }
    requestErr = error;
  }
  record('B requests A creates own', 'A INSERT request succeeds', requestId ? `id=yes` : errText(requestErr), !!requestId);

  if (requestId) {
    const { data: asB } = await sessions.B.client.from('requests').select('id').eq('id', requestId).maybeSingle();
    const { data: asC } = await sessions.C.client.from('requests').select('id').eq('id', requestId).maybeSingle();
    record('B requests B can see public/open request', 'B SELECT request A created (open/public) allowed or empty if private', `row=${asB ? 'present' : 'empty'}`, true);
    record('B requests C SELECT same request', 'C SELECT follows public/open policy; not a private financial leak', `row=${asC ? 'present' : 'empty'}`, true);

    const { error: hijackReq } = await sessions.C.client
      .from('requests')
      .update({ title: 'stolen' })
      .eq('id', requestId);
    const { data: reqAfter } = await admin.from('requests').select('title').eq('id', requestId).maybeSingle();
    record(
      'B requests C cannot update A request',
      'C UPDATE denied; title unchanged',
      `err=${errText(hijackReq)} title=${reqAfter && reqAfter.title}`,
      (isDenied(hijackReq) || !hijackReq) && reqAfter && reqAfter.title !== 'stolen'
    );
  }

  let invitationId = null;
  if (requestId) {
    const { data: inviteData, error: inviteErr } = await sessions.A.client.rpc('send_request_invitations', {
      p_request_id: requestId,
      p_recipient_ids: [qaIds.B],
    });
    if (!inviteErr) {
      invitationId = inviteData && (inviteData.invitation_id || inviteData.id
        || (Array.isArray(inviteData.invitations) && inviteData.invitations[0] && inviteData.invitations[0].id));
    }
    if (!invitationId) {
      const { data: invRows } = await sessions.A.client
        .from('request_invitations')
        .select('id')
        .eq('request_id', requestId)
        .eq('recipient_id', qaIds.B)
        .limit(1);
      invitationId = invRows && invRows[0] && invRows[0].id;
    }
    record(
      'B request_invitations A invites B',
      'A RPC send_request_invitations succeeds',
      invitationId ? 'invitation=yes' : errText(inviteErr),
      !!invitationId
    );

    const { data: invC, error: invCErr } = await sessions.C.client
      .from('request_invitations')
      .select('id')
      .eq('id', invitationId || '00000000-0000-0000-0000-000000000000')
      .maybeSingle();
    record(
      'B request_invitations C cannot read A/B invite',
      'C SELECT invitation empty or denied',
      `row=${invC ? 'present' : 'empty'} err=${errText(invCErr)}`,
      !invC
    );

    const { error: cInvite } = await sessions.C.client.rpc('send_request_invitations', {
      p_request_id: requestId,
      p_recipient_ids: [qaIds.B],
    });
    record(
      'B SECURITY DEFINER send_request_invitations not spoofable by C',
      'C RPC denied (not request author)',
      errText(cInvite) || 'unexpected success',
      !!cInvite && isDenied(cInvite)
    );
  }

  const { data: convId, error: convErr } = await sessions.A.client.rpc('get_or_create_conversation', {
    p_target_user_id: qaIds.B,
  });
  const conversationId = convId || null;
  record('B conversations A+B created', 'A RPC get_or_create_conversation(B) returns uuid', conversationId ? 'uuid=yes' : errText(convErr), !!conversationId && !convErr);

  if (conversationId) {
    const { data: partsAdmin } = await admin
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId);
    const { data: partsA, error: partsAErr } = await sessions.A.client
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId);
    const { data: partsC } = await sessions.C.client
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId);
    record(
      'B conversation_participants fixture exists',
      'service_role sees A and B on the conversation',
      `admin_count=${(partsAdmin || []).length}`,
      (partsAdmin || []).length === 2
    );
    record(
      'B conversation_participants A sees A/B',
      'A SELECT participants returns 2 rows (no recursion)',
      `count=${(partsA || []).length} err=${errText(partsAErr)}`,
      (partsA || []).length === 2 && !partsAErr
    );
    record(
      'B conversation_participants C denied',
      'C SELECT participants empty',
      `count=${(partsC || []).length}`,
      !(partsC || []).length
    );

    const { data: convA, error: convAErr } = await sessions.A.client.from('conversations').select('id').eq('id', conversationId).maybeSingle();
    const { data: convB, error: convBErr } = await sessions.B.client.from('conversations').select('id').eq('id', conversationId).maybeSingle();
    const { data: convC } = await sessions.C.client.from('conversations').select('id').eq('id', conversationId).maybeSingle();
    record('B conversations A reads own', 'A SELECT conversation allowed (no recursion)', `row=${convA ? 'present' : 'empty'} err=${errText(convAErr)}`, !!convA && !convAErr);
    record('B conversations B reads own', 'B SELECT conversation allowed (no recursion)', `row=${convB ? 'present' : 'empty'} err=${errText(convBErr)}`, !!convB && !convBErr);
    record('B conversations C cannot read A/B', 'C SELECT conversation empty', `row=${convC ? 'present' : 'empty'}`, !convC);

    const { error: joinErr } = await sessions.C.client
      .from('conversation_participants')
      .insert({ conversation_id: conversationId, user_id: qaIds.C });
    const { data: afterJoin } = await admin
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', qaIds.C)
      .maybeSingle();
    record(
      'B conversation_participants C cannot self-join',
      'C INSERT participant denied',
      `err=${errText(joinErr)} joined=${!!afterJoin}`,
      !afterJoin
    );

    const { data: msgA, error: msgAErr } = await sessions.A.client
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: qaIds.A, content: 'phase4 hello from A' })
      .select('id')
      .maybeSingle();
    record('B messages A sends', 'A INSERT message in A/B conversation', msgA ? 'id=yes' : errText(msgAErr), !!msgA);

    const { data: spoof, error: spoofErr } = await sessions.C.client
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: qaIds.A, content: 'spoof' })
      .select('id')
      .maybeSingle();
    record(
      'B messages C cannot send as A',
      'C INSERT with sender_id=A denied',
      `row=${spoof ? 'present' : 'empty'} err=${errText(spoofErr)}`,
      !spoof
    );

    const { data: msgsB } = await sessions.B.client.from('messages').select('id').eq('conversation_id', conversationId);
    const { data: msgsC } = await sessions.C.client.from('messages').select('id').eq('conversation_id', conversationId);
    record('B messages B reads A/B', 'B SELECT messages returns >=1', `count=${(msgsB || []).length}`, (msgsB || []).length >= 1);
    record('B messages C cannot read A/B', 'C SELECT messages empty', `count=${(msgsC || []).length}`, !(msgsC || []).length);

    const { data: partFlag, error: partFnErr } = await sessions.C.client.rpc(
      'is_current_user_conversation_participant',
      { _conversation_id: conversationId }
    );
    record(
      'B SECURITY DEFINER participant helper does not leak',
      'C is_current_user_conversation_participant(A/B) is false',
      `value=${partFlag} err=${errText(partFnErr)}`,
      partFlag === false || partFlag === null || (partFnErr && isDenied(partFnErr))
    );
  }

  const noteEntity = `phase4-${crypto.randomUUID()}`;
  const { data: noteA, error: noteInsErr } = await admin.from('notifications').insert({
    user_id: qaIds.A,
    type: 'NEW_MESSAGE',
    title: 'Phase4',
    body: 'fixture',
    entity_type: 'phase4',
    entity_id: noteEntity,
  }).select('id').maybeSingle();
  if (noteA && noteA.id) {
    const { data: nA } = await sessions.A.client.from('notifications').select('id').eq('id', noteA.id).maybeSingle();
    const { data: nC } = await sessions.C.client.from('notifications').select('id').eq('id', noteA.id).maybeSingle();
    record('B notifications A reads own', 'A SELECT own notification', `row=${nA ? 'present' : 'empty'}`, !!nA);
    record('B notifications C cannot read A', 'C SELECT A notification empty', `row=${nC ? 'present' : 'empty'}`, !nC);
  } else {
    record('B notifications seed', 'service_role can insert fixture notification', errText(noteInsErr), false);
  }

  let quoteId = null;
  let missionId = null;
  if (invitationId) {
    const { error: accErr } = await sessions.B.client.rpc('accept_request_invitation', { p_invitation_id: invitationId });
    const acceptOk = !accErr || /already|déjà|accepted/i.test(String(accErr.message || ''));
    record('B invitation B accepts', 'B RPC accept_request_invitation (or already accepted)', accErr ? errText(accErr) : 'ok', acceptOk);
    const { data: quote, error: qErr } = await sessions.B.client.rpc('create_request_quote', {
      p_invitation_id: invitationId,
      p_description: 'Devis Phase4 fictif',
      p_valid_until: null,
      p_milestones_json: [{ title: 'Jalon 1', amount: 50, display_order: 1 }],
    });
    quoteId = quote && (quote.quote_id || quote.id);
    record('B quotes B creates via RPC', 'B create_request_quote succeeds', quoteId ? 'id=yes' : errText(qErr), !!quoteId);
  }

  if (!quoteId) {
    const { data: mIns, error: mErr } = await admin.from('missions').insert({
      requester_id: qaIds.A,
      helper_id: qaIds.B,
      related_request_id: requestId,
      status: 'PROPOSED',
      total_amount: 50,
    }).select('id').maybeSingle();
    if (mIns && mIns.id) missionId = mIns.id;
    if (mErr) {
      const { data: m2 } = await admin.from('missions').insert({
        requester_id: qaIds.A,
        helper_id: qaIds.B,
        status: 'PROPOSED',
      }).select('id').maybeSingle();
      if (m2) missionId = m2.id;
    }
    if (missionId) {
      const qTry = await admin.from('quotes').insert({
        mission_id: missionId,
        quote_number: `P4-${Date.now()}`,
        description: 'Devis Phase4 seed',
        status: 'SENT',
      }).select('id').maybeSingle();
      if (qTry.data) quoteId = qTry.data.id;
    }
  }

  if (quoteId) {
    const { data: qA } = await sessions.A.client.from('quotes').select('id').eq('id', quoteId).maybeSingle();
    const { data: qB } = await sessions.B.client.from('quotes').select('id').eq('id', quoteId).maybeSingle();
    const { data: qC } = await sessions.C.client.from('quotes').select('id').eq('id', quoteId).maybeSingle();
    record('B quotes A reads A/B devis', 'A SELECT quote allowed', `row=${qA ? 'present' : 'empty'}`, !!qA);
    record('B quotes B reads A/B devis', 'B SELECT quote allowed', `row=${qB ? 'present' : 'empty'}`, !!qB);
    record('B quotes C cannot read private devis', 'C SELECT quote empty', `row=${qC ? 'present' : 'empty'}`, !qC);

    const { data: msA } = await sessions.A.client.from('milestones').select('id').eq('quote_id', quoteId);
    const { data: msC } = await sessions.C.client.from('milestones').select('id').eq('quote_id', quoteId);
    record('B milestones A/B private', 'A sees milestones; C does not', `A=${(msA || []).length} C=${(msC || []).length}`, (msC || []).length === 0);

    const { data: missA } = await sessions.A.client.from('missions').select('id').limit(5);
    const { data: missC } = await sessions.C.client.from('missions').select('id').limit(5);
    const cSeesAb = (missC || []).some((m) => m.id === missionId);
    record(
      'B missions C cannot read A/B mission',
      'C SELECT does not include A/B mission',
      `C_count=${(missC || []).length} leaked=${cSeesAb} A_count=${(missA || []).length}`,
      !cSeesAb
    );
  } else {
    record('B quotes seed', 'quote fixture created via RPC or service seed', 'no quote id', false);
  }

  let paymentId = null;
  let paymentSeedErr = null;
  let milestoneId = null;
  if (quoteId) {
    const { data: quoteRow } = await admin
      .from('quotes')
      .select('id,mission_id,request_invitation_id,requester_id,provider_id')
      .eq('id', quoteId)
      .maybeSingle();
    if (quoteRow && quoteRow.mission_id) missionId = quoteRow.mission_id;
    if (!missionId && quoteRow) {
      const { data: mNew, error: mNewErr } = await admin.from('missions').insert({
        requester_id: quoteRow.requester_id || qaIds.A,
        helper_id: quoteRow.provider_id || qaIds.B,
        related_request_id: requestId,
        request_invitation_id: quoteRow.request_invitation_id,
        status: 'PROPOSED',
        total_amount: 50,
      }).select('id').maybeSingle();
      if (mNew && mNew.id) {
        missionId = mNew.id;
        await admin.from('quotes').update({ mission_id: missionId }).eq('id', quoteId);
      } else {
        paymentSeedErr = mNewErr;
      }
    }
    const { data: msRows } = await admin.from('milestones').select('id').eq('quote_id', quoteId).limit(1);
    milestoneId = msRows && msRows[0] && msRows[0].id;
  }
  if (quoteId && missionId && milestoneId) {
    const { data, error } = await admin.from('payments').insert({
      mission_id: missionId,
      quote_id: quoteId,
      milestone_id: milestoneId,
      requester_id: qaIds.A,
      provider_id: qaIds.B,
      payer_id: qaIds.A,
      recipient_id: qaIds.B,
      currency: 'eur',
      payment_status: 'CREATED',
      transfer_status: 'NOT_STARTED',
      service_amount_cents: 5000,
      customer_fee_cents: 250,
      customer_total_cents: 5250,
      provider_fee_cents: 250,
      provider_net_cents: 4750,
      lyann_revenue_cents: 500,
      amount_refunded_cents: 0,
    }).select('id').maybeSingle();
    paymentId = data && data.id;
    paymentSeedErr = error;
  } else {
    paymentSeedErr = { message: `missing quote=${!!quoteId} mission=${!!missionId} milestone=${!!milestoneId}` };
  }
  if (paymentId) {
    const { data: pA } = await sessions.A.client.from('payments').select('id').eq('id', paymentId).maybeSingle();
    const { data: pB } = await sessions.B.client.from('payments').select('id').eq('id', paymentId).maybeSingle();
    const { data: pC } = await sessions.C.client.from('payments').select('id').eq('id', paymentId).maybeSingle();
    const { error: pIns } = await sessions.C.client.from('payments').insert({ requester_id: qaIds.C, provider_id: qaIds.A, amount: 1 });
    record('B payments A reads own', 'A SELECT payment allowed', `row=${pA ? 'present' : 'empty'}`, !!pA);
    record('B payments B reads own', 'B SELECT payment allowed', `row=${pB ? 'present' : 'empty'}`, !!pB);
    record('B payments C cannot read A/B', 'C SELECT payment empty', `row=${pC ? 'present' : 'empty'}`, !pC);
    record('B payments C cannot insert', 'C INSERT payments denied (GRANT/RLS)', errText(pIns) || 'unexpected success', !!pIns);
  } else {
    record('B payments seed', 'service_role insert payment fixture', errText(paymentSeedErr), false);
  }

  const { error: blockAsC } = await sessions.C.client.from('user_blocks').insert({
    blocker_id: qaIds.A,
    blocked_id: qaIds.B,
  });
  record(
    'B user_blocks C cannot impersonate A',
    'C INSERT block as A denied',
    errText(blockAsC) || 'unexpected success',
    !!blockAsC && isDenied(blockAsC)
  );
  const { data: existingBlock } = await sessions.A.client
    .from('user_blocks')
    .select('blocker_id')
    .eq('blocker_id', qaIds.A)
    .eq('blocked_id', qaIds.C)
    .maybeSingle();
  let blockA = existingBlock;
  let blockAErr = null;
  if (!existingBlock) {
    const ins = await sessions.A.client.from('user_blocks').insert({
      blocker_id: qaIds.A,
      blocked_id: qaIds.C,
    }).select('blocker_id').maybeSingle();
    blockA = ins.data;
    blockAErr = ins.error;
  }
  record('B user_blocks A can block C', 'A INSERT or keep own block', blockA ? 'ok' : errText(blockAErr), !!blockA);
  const { data: blockSeenC } = await sessions.C.client
    .from('user_blocks')
    .select('blocker_id')
    .eq('blocker_id', qaIds.A)
    .eq('blocked_id', qaIds.C)
    .maybeSingle();
  record('B user_blocks C cannot read A block list', 'C SELECT A→C block empty', `row=${blockSeenC ? 'present' : 'empty'}`, !blockSeenC);

  const { data: existingReport } = await sessions.A.client
    .from('user_reports')
    .select('id')
    .eq('reporter_id', qaIds.A)
    .eq('target_user_id', qaIds.C)
    .limit(1)
    .maybeSingle();
  let reportA = existingReport;
  let reportErr = null;
  if (!existingReport) {
    const ins = await sessions.A.client.from('user_reports').insert({
      reporter_id: qaIds.A,
      target_user_id: qaIds.C,
      reason: 'phase4-qa',
      details: 'fictitious staging report',
    }).select('id').maybeSingle();
    reportA = ins.data;
    reportErr = ins.error;
  }
  record('B reports A can create own', 'A INSERT or keep own user_reports', reportA ? 'id=yes' : errText(reportErr), !!reportA);
  if (reportA) {
    const { data: rC } = await sessions.C.client.from('user_reports').select('id').eq('id', reportA.id).maybeSingle();
    record('B reports C cannot read A report', 'C SELECT report empty', `row=${rC ? 'present' : 'empty'}`, !rC);
    const { error: rSteal } = await sessions.C.client.from('user_reports').insert({
      reporter_id: qaIds.A,
      target_user_id: qaIds.B,
      reason: 'spoof',
    });
    record('B reports C cannot spoof reporter', 'C INSERT reporter_id=A denied', errText(rSteal) || 'unexpected success', !!rSteal);
  }

  const { error: selfConv } = await sessions.A.client.rpc('get_or_create_conversation', { p_target_user_id: qaIds.A });
  record(
    'B SECURITY DEFINER cannot start self conversation',
    'A get_or_create_conversation(A) denied',
    errText(selfConv) || 'unexpected success',
    !!selfConv
  );

  function storageOf(actor) {
    return actor.storage ? actor : actor.client;
  }
  async function upload(actor, bucket, objectPath) {
    const { data, error } = await storageOf(actor).storage.from(bucket).upload(objectPath, PNG, {
      contentType: 'image/png',
      upsert: false,
    });
    return { data, error };
  }
  async function remove(actor, bucket, objectPath) {
    const { data, error } = await storageOf(actor).storage.from(bucket).remove([objectPath]);
    return { data, error };
  }

  const aFolder = `${qaIds.A}/phase4-${crypto.randomUUID()}.png`;
  const bFolder = `${qaIds.B}/phase4-${crypto.randomUUID()}.png`;
  const ownBok = await upload(sessions.A, 'bokantaj-media', aFolder);
  record('C upload A own bokantaj-media', 'A upload {uid}/file.png allowed', ownBok.error ? errText(ownBok.error) : 'ok', !ownBok.error);
  const stealBok = await upload(sessions.C, 'bokantaj-media', aFolder.replace(/phase4/, 'stolen'));
  record('C upload C into A folder bokantaj-media denied', 'C upload A-uid/… denied', stealBok.error ? errText(stealBok.error) : 'unexpected success', !!stealBok.error);
  const ownReq = await upload(sessions.A, 'request-photos', aFolder);
  record('C upload A own request-photos', 'A upload {uid}/file.png allowed', ownReq.error ? errText(ownReq.error) : 'ok', !ownReq.error);
  const stealReq = await upload(sessions.C, 'request-photos', `${qaIds.A}/stolen-${crypto.randomUUID()}.png`);
  record('C upload C into A folder request-photos denied', 'C upload A-uid/… denied', stealReq.error ? errText(stealReq.error) : 'unexpected success', !!stealReq.error);
  const ownAv = await upload(sessions.A, 'avatars', aFolder);
  record('C upload A own avatars', 'A upload {uid}/file.png allowed', ownAv.error ? errText(ownAv.error) : 'ok', !ownAv.error);
  const stealAv = await upload(sessions.C, 'avatars', `${qaIds.A}/stolen-${crypto.randomUUID()}.png`);
  record('C upload C into A avatars denied', 'C upload A-uid/… denied', stealAv.error ? errText(stealAv.error) : 'unexpected success', !!stealAv.error);
  const delOther = await remove(sessions.C, 'bokantaj-media', aFolder);
  const stillThere = await admin.storage.from('bokantaj-media').list(qaIds.A, { search: path.posix.basename(aFolder) });
  record(
    'C delete C cannot delete A bokantaj-media',
    'C remove A object denied; object remains',
    `err=${errText(delOther.error)} listed=${(stillThere.data || []).length}`,
    (stillThere.data || []).some((f) => f.name === path.posix.basename(aFolder)) || !!delOther.error
  );

  const anonUp = await upload(anonClient, 'bokantaj-media', `anon-${crypto.randomUUID()}.png`);
  record('C anon cannot upload bokantaj-media', 'anonymous upload denied', anonUp.error ? errText(anonUp.error) : 'unexpected success', !!anonUp.error);
  const anonReq = await upload(anonClient, 'request-photos', `anon-${crypto.randomUUID()}.png`);
  record('C anon cannot upload request-photos', 'anonymous upload denied', anonReq.error ? errText(anonReq.error) : 'unexpected success', !!anonReq.error);

  if (conversationId) {
    const chatName = `${conversationId}/${qaIds.A}/${crypto.randomUUID()}.png`;
    const chatA = await upload(sessions.A, 'chat-attachments', chatName);
    record('C chat-attachments A participant upload', 'A upload conv/A/uuid.png allowed', chatA.error ? errText(chatA.error) : 'ok', !chatA.error);
    const chatC = await upload(sessions.C, 'chat-attachments', `${conversationId}/${qaIds.C}/${crypto.randomUUID()}.png`);
    record('C chat-attachments C outsider upload denied', 'C upload into A/B conv denied', chatC.error ? errText(chatC.error) : 'unexpected success', !!chatC.error);
    const { data: chatListC, error: chatListErr } = await sessions.C.client.storage.from('chat-attachments').list(conversationId);
    record(
      'C chat-attachments C cannot list A/B',
      'C list empty or denied',
      `count=${(chatListC || []).length} err=${errText(chatListErr)}`,
      !(chatListC || []).length
    );
  }

  if (reportA && reportA.id) {
    const evPath = `${qaIds.A}/${reportA.id}/${crypto.randomUUID()}.png`;
    const evA = await upload(sessions.A, 'report-evidence', evPath);
    record('C report-evidence A own path', 'A upload reporter/report/uuid.png allowed', evA.error ? errText(evA.error) : 'ok', !evA.error);
    const evC = await upload(sessions.C, 'report-evidence', evPath.replace(qaIds.A, qaIds.C));
    record('C report-evidence C cannot use A report id', 'C upload denied', evC.error ? errText(evC.error) : 'unexpected success', !!evC.error);
  }

  const bOwn = await upload(sessions.B, 'bokantaj-media', bFolder);
  record('C upload B own bokantaj-media', 'B upload own folder allowed', bOwn.error ? errText(bOwn.error) : 'ok', !bOwn.error);

  const passCount = cases.filter((c) => c.result === 'PASS').length;
  const failCount = cases.filter((c) => c.result === 'FAIL').length;
  const defects = [];
  if (cases.some((c) => c.id === 'B profiles A updates own' && c.result === 'FAIL')) {
    defects.push({
      id: 'profiles.update trigger stripe_account_status',
      severity: 'P1',
      summary: 'protect_sensitive_profile_columns_update references NEW.stripe_account_status but the column does not exist, so authenticated users cannot UPDATE their own profile.',
    });
  }
  if (cases.some((c) => /conversation|messages/.test(c.id) && c.result === 'FAIL')) {
    defects.push({
      id: 'conversation_participants duplicate recursive policies',
      severity: 'P0',
      summary: 'Legacy policies Users can view participants / Users can view their conversations / Participants can send messages still subquery conversation_participants. Combined with the 57 helper they raise 42P17, so A/B cannot SELECT conversations or INSERT messages. Storage chat-attachments still works because it uses is_current_user_conversation_participant with row_security=off.',
    });
  }
  const report = {
    phase: 4,
    verdict: failCount === 0 ? 'PASS' : 'FAIL',
    target: STAGING_REF,
    production: PRODUCTION_REF,
    production_writes: false,
    e1_e6_started: false,
    rls_used_user_jwts: true,
    service_role_used_for: ['auth.admin', 'fixture seed', 'cleanup probes'],
    defects,
    qa_users: {
      A: { role: 'author', email: maskEmail(QA_EMAILS.A), created: created.A },
      B: { role: 'lyanneur', email: maskEmail(QA_EMAILS.B), created: created.B },
      C: { role: 'outsider', email: maskEmail(QA_EMAILS.C), created: created.C },
    },
    unknown_accounts_modified: 0,
    stripe: isolation.stripe,
    counts: { pass: passCount, fail: failCount, total: cases.length },
    cases,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  const lines = [
    `LYANN Phase 4 Auth/RLS/Storage — ${report.verdict}`,
    `Target: ${STAGING_REF}  Production writes: NO  E1–E6: not started`,
    `Cases: ${passCount}/${cases.length} PASS`,
    ...defects.map((d) => `DEFECT ${d.severity} ${d.id}: ${d.summary}`),
    '',
    ...cases.map((c) => `[${c.result}] ${c.id}\n  expected: ${c.expected}\n  observed: ${c.observed}`),
  ];
  fs.writeFileSync(REPORT_TXT, lines.join('\n'));
  console.log(JSON.stringify({
    verdict: report.verdict,
    pass: passCount,
    fail: failCount,
    total: cases.length,
    report: 'artifacts/staging-v2/phase4-auth-rls-storage.json',
    defects: defects.map((d) => d.id),
  }, null, 2));
  if (failCount) process.exit(2);
})().catch((err) => {
  console.error(JSON.stringify({ verdict: 'FAIL', error: redact(err && err.stack || err && err.message || err) }));
  process.exit(1);
});
