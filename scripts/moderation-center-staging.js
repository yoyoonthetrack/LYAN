'use strict';

require('./force-staging-v2-env');
const { createClient } = require('@supabase/supabase-js');
const { createModerationCenter } = require('../api/admin-moderation-center');
const { applyDecision } = require('../api/moderation-worker');
const { resolveAdminAndJwt, mustStaging, STAGING_REF } = require('./admin-staging-real-session-lib');

const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const MARKER = '[QA-MODCENTER]';

function clients() {
  const url = process.env.SUPABASE_URL || process.env.LYANN_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.LYANN_SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.LYANN_SUPABASE_ANON_KEY || process.env.LYANN_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !url.includes(STAGING_REF) || url.includes(PRODUCTION_REF)) {
    throw new Error('Refus : Staging V2 uniquement.');
  }
  return {
    url,
    anonKey: anon,
    admin: createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }),
    anon: createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  };
}

async function restWrite(url, anonKey, jwt, table, payload) {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: res.status, ok: res.ok, body: json, text: text.slice(0, 180) };
}

async function storageWrite(url, anonKey, jwt, pathName, bytes) {
  const res = await fetch(`${url}/storage/v1/object/bokantaj-media/${pathName}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true'
    },
    body: bytes
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, text: text.slice(0, 180) };
}

async function main() {
  mustStaging();
  const { url, anonKey, admin, anon } = clients();
  const report = { target: STAGING_REF, applied_migration: false, steps: [] };
  const note = (id, ok, extra) => report.steps.push({ id, ok, ...extra });

  const columns = await admin.from('bokantaj_posts').select('id, human_moderation_lock, human_decision').limit(1);
  const sanctionsTable = await admin.from('account_sanctions').select('id').limit(1);
  const schemaReady = !columns.error && !sanctionsTable.error;
  note('schema', schemaReady, {
    posts: columns.error && columns.error.message,
    sanctions: sanctionsTable.error && sanctionsTable.error.message
  });
  if (!schemaReady) {
    report.go = false;
    report.limit = 'Schéma de modération absent. Aucune migration n’a été relancée.';
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  const adminSession = await resolveAdminAndJwt();
  const center = createModerationCenter({
    supabaseAdmin: admin,
    verifyAdminPermission: async (_req, perm) => ({ authorized: true, userId: adminSession.userId, permission: perm })
  });

  const noAuth = await fetch(`${url}/rest/v1/bokantaj_posts?select=id&limit=1`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
  });
  note('anon-can-read-approved', noAuth.ok, { status: noAuth.status });

  const qaPassword = `QaMod${Date.now()}!aA1`;
  const qaEmail = `qa.modcenter.${Date.now()}@lyann.test`;
  const qaUser = await admin.auth.admin.createUser({
    email: qaEmail,
    password: qaPassword,
    email_confirm: true
  });
  if (qaUser.error || !qaUser.data.user) throw new Error(qaUser.error && qaUser.error.message || 'QA user');
  const userId = qaUser.data.user.id;
  await admin.from('profiles').upsert({
    id: userId,
    first_name: 'QA',
    last_name: 'ModCenter',
    city: 'Pointe-à-Pitre',
    territory: 'guadeloupe',
    account_type: 'real',
    restriction_status: 'none'
  });

  const post = await admin.from('bokantaj_posts').insert({
    author_id: userId,
    type: 'info',
    content: `${MARKER} post visible`,
    territory: 'guadeloupe',
    city: 'Pointe-à-Pitre',
    public_moderation_status: 'approved',
    human_moderation_lock: false
  }).select('id, public_moderation_status, human_moderation_lock').single();
  if (post.error) throw new Error(post.error.message);
  await admin.from('bokantaj_posts').update({
    public_moderation_status: 'approved',
    human_moderation_lock: false
  }).eq('id', post.data.id);

  const comment = await admin.from('bokantaj_comments').insert({
    author_id: userId,
    post_id: post.data.id,
    content: `${MARKER} commentaire visible`,
    public_moderation_status: 'approved',
    human_moderation_lock: false
  }).select('id').single();
  if (comment.data) {
    await admin.from('bokantaj_comments').update({
      public_moderation_status: 'approved',
      human_moderation_lock: false
    }).eq('id', comment.data.id);
  }

  const pendingComment = await admin.from('bokantaj_comments').insert({
    author_id: userId,
    post_id: post.data.id,
    content: `${MARKER} commentaire pending`,
    public_moderation_status: 'pending',
    human_moderation_lock: false
  }).select('id').single();

  const publicBefore = await anon.from('bokantaj_posts').select('id').eq('id', post.data.id).maybeSingle();
  note('public-visible', !!publicBefore.data, { postId: post.data.id });

  const hidden = await center.applyContentDecision({
    subject: 'post', id: post.data.id, decision: 'hide', reason: `${MARKER} hide`, actorId: adminSession.userId
  });
  const publicHidden = await anon.from('bokantaj_posts').select('id').eq('id', post.data.id).maybeSingle();
  const hiddenById = await anon.from('bokantaj_posts').select('id, content').eq('id', post.data.id).maybeSingle();
  note('admin-hide', hidden.ok && !publicHidden.data && !hiddenById.data, {
    visible: hidden.visible,
    public: !!publicHidden.data,
    byId: !!hiddenById.data,
    error: hidden.error
  });

  const forceApprove = await admin.from('bokantaj_posts').update({
    public_moderation_status: 'approved'
  }).eq('id', post.data.id).select('public_moderation_status, human_moderation_lock').maybeSingle();
  const stillLocked = forceApprove.data
    && forceApprove.data.public_moderation_status !== 'approved'
    && forceApprove.data.human_moderation_lock === true;
  note('db-trigger-blocks-ia-approve', stillLocked || (!forceApprove.data && !!forceApprove.error), {
    status: forceApprove.data && forceApprove.data.public_moderation_status,
    lock: forceApprove.data && forceApprove.data.human_moderation_lock,
    error: forceApprove.error && forceApprove.error.message
  });

  const ai = await applyDecision(admin, { id: 'qa-job', subject_type: 'post', subject_id: post.data.id }, {
    row: { ...(forceApprove.data || post.data), public_moderation_status: 'rejected', human_moderation_lock: true },
    pendingEdit: null
  }, { decision: 'approved' });
  const stillHidden = await anon.from('bokantaj_posts').select('id').eq('id', post.data.id).maybeSingle();
  note('ia-cannot-unhide', ai === 'human_lock' && !stillHidden.data, { ai });

  const restored = await center.applyContentDecision({
    subject: 'post', id: post.data.id, decision: 'restore', reason: `${MARKER} restore`, actorId: adminSession.userId
  });
  const publicRestored = await anon.from('bokantaj_posts').select('id').eq('id', post.data.id).maybeSingle();
  note('restore', restored.ok && !!publicRestored.data, { public: !!publicRestored.data, error: restored.error });

  if (comment.data) {
    const hideComment = await center.applyContentDecision({
      subject: 'comment', id: comment.data.id, decision: 'hide', reason: `${MARKER} hide comment`, actorId: adminSession.userId
    });
    const publicComment = await anon.from('bokantaj_comments').select('id').eq('id', comment.data.id).maybeSingle();
    note('comment-hide', hideComment.ok && !publicComment.data, { public: !!publicComment.data, error: hideComment.error });
    const restoreComment = await center.applyContentDecision({
      subject: 'comment', id: comment.data.id, decision: 'restore', reason: `${MARKER} restore comment`, actorId: adminSession.userId
    });
    const publicCommentBack = await anon.from('bokantaj_comments').select('id').eq('id', comment.data.id).maybeSingle();
    note('comment-restore', restoreComment.ok && !!publicCommentBack.data, { public: !!publicCommentBack.data });
  }
  if (pendingComment.data) {
    const approved = await center.applyContentDecision({
      subject: 'comment', id: pendingComment.data.id, decision: 'approved', reason: `${MARKER} approve comment`, actorId: adminSession.userId
    });
    note('comment-approve', approved.ok && approved.visible, { visible: approved.visible, error: approved.error });
  }

  const userClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await userClient.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
  const session = signed.data && signed.data.session;
  note('qa-signin', !!session, { error: signed.error && signed.error.message });
  const oldJwt = session && session.access_token;
  const oldRefresh = session && session.refresh_token;

  const allowedWrite = await restWrite(url, anonKey, oldJwt, 'bokantaj_posts', {
    author_id: userId,
    type: 'info',
    content: `${MARKER} write before sanction`,
    territory: 'guadeloupe'
  });
  note('write-before-sanction', allowedWrite.status === 201 || allowedWrite.ok, { status: allowedWrite.status, text: allowedWrite.text });

  const suspended = await center.applySanction({
    userId, kind: 'suspend', reason: `${MARKER} suspend 24h`, duration: '24h', actorId: adminSession.userId
  });
  note('suspend', suspended.ok && suspended.restriction && suspended.restriction.restricted, {
    auth: suspended.auth,
    missions: suspended.open_missions,
    error: suspended.error
  });

  const suspendedJwtWrite = await restWrite(url, anonKey, oldJwt, 'bokantaj_posts', {
    author_id: userId,
    type: 'info',
    content: `${MARKER} should fail after suspend`,
    territory: 'guadeloupe'
  });
  note('suspended-old-jwt-post', !suspendedJwtWrite.ok && suspendedJwtWrite.status !== 201, {
    status: suspendedJwtWrite.status,
    text: suspendedJwtWrite.text
  });

  const suspendedComment = await restWrite(url, anonKey, oldJwt, 'bokantaj_comments', {
    author_id: userId,
    post_id: post.data.id,
    content: `${MARKER} comment after suspend`
  });
  note('suspended-old-jwt-comment', !suspendedComment.ok, { status: suspendedComment.status, text: suspendedComment.text });

  const suspendedRequest = await restWrite(url, anonKey, oldJwt, 'requests', {
    requester_id: userId,
    title: `${MARKER} request after suspend`,
    description: 'QA',
    status: 'OPEN'
  });
  note('suspended-old-jwt-request', !suspendedRequest.ok, { status: suspendedRequest.status, text: suspendedRequest.text });

  const quoteProbe = await admin.from('quotes').select('*').limit(1);
  const quoteCols = quoteProbe.error ? [] : Object.keys((quoteProbe.data && quoteProbe.data[0]) || {});
  const quotePayload = quoteCols.includes('provider_id')
    ? { provider_id: userId, status: 'DRAFT' }
    : { status: 'DRAFT' };
  const suspendedQuote = await restWrite(url, anonKey, oldJwt, 'quotes', quotePayload);
  const quoteBlockedByRestriction = /Compte restreint|P0001|row-level security/i.test(String(suspendedQuote.text || ''));
  note('suspended-old-jwt-quote', !suspendedQuote.ok && (quoteBlockedByRestriction || suspendedQuote.status === 401 || suspendedQuote.status === 403), {
    status: suspendedQuote.status,
    text: suspendedQuote.text,
    restriction: quoteBlockedByRestriction
  });

  const suspendedMessage = await restWrite(url, anonKey, oldJwt, 'messages', {
    sender_id: userId,
    content: `${MARKER} message after suspend`
  });
  note('suspended-old-jwt-message', !suspendedMessage.ok, { status: suspendedMessage.status, text: suspendedMessage.text });

  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
  const storageSuspended = await storageWrite(url, anonKey, oldJwt, `${userId}/qa-suspend.png`, png);
  note('suspended-old-jwt-storage', !storageSuspended.ok, { status: storageSuspended.status, text: storageSuspended.text });

  let realtimeWrite = { attempted: true, ok: false, note: 'pas de canal d’écriture Realtime distinct ; insert REST déjà testé' };
  try {
    const rt = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await rt.auth.setSession({ access_token: oldJwt, refresh_token: oldRefresh });
    const channel = rt.channel(`qa-mod-${Date.now()}`);
    const joined = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), 4000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          resolve(status);
        }
      });
    });
    const rtInsert = await rt.from('bokantaj_posts').insert({
      author_id: userId,
      type: 'info',
      content: `${MARKER} realtime insert after suspend`,
      territory: 'guadeloupe'
    }).select('id').maybeSingle();
    realtimeWrite = {
      attempted: true,
      subscribe: joined,
      insertBlocked: !rtInsert.data,
      error: rtInsert.error && rtInsert.error.message
    };
    await rt.removeChannel(channel);
  } catch (err) {
    realtimeWrite = { attempted: true, error: err.message };
  }
  note('suspended-realtime-insert', realtimeWrite.insertBlocked !== false, realtimeWrite);

  const banned = await center.applySanction({
    userId, kind: 'ban', reason: `${MARKER} ban`, actorId: adminSession.userId
  });
  note('ban', banned.ok && banned.restriction && banned.restriction.status === 'banned', { auth: banned.auth, error: banned.error });

  const bannedJwtWrite = await restWrite(url, anonKey, oldJwt, 'bokantaj_posts', {
    author_id: userId,
    type: 'info',
    content: `${MARKER} should fail after ban`,
    territory: 'guadeloupe'
  });
  note('banned-old-jwt-post', !bannedJwtWrite.ok, { status: bannedJwtWrite.status, text: bannedJwtWrite.text });

  const relogin = await createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    .auth.signInWithPassword({ email: qaEmail, password: qaPassword });
  note('banned-relogin-refused', !!(relogin.error || !(relogin.data && relogin.data.session)), {
    error: relogin.error && relogin.error.message
  });

  const selfLift = await createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  if (oldJwt) await selfLift.auth.setSession({ access_token: oldJwt, refresh_token: oldRefresh }).catch(() => {});
  const selfUnban = await selfLift.from('profiles').update({ restriction_status: 'none' }).eq('id', userId).select('id, restriction_status').maybeSingle();
  const stillBanned = await admin.from('profiles').select('restriction_status').eq('id', userId).maybeSingle();
  note('cannot-self-unban', stillBanned.data && stillBanned.data.restriction_status === 'banned', {
    client: selfUnban.data,
    error: selfUnban.error && selfUnban.error.message
  });

  const nonAdminSanction = createModerationCenter({
    supabaseAdmin: admin,
    verifyAdminPermission: async () => ({ authorized: false, status: 403, error: 'Droits insuffisants' })
  });
  const fakeApp = { routes: {}, get() {}, post(path, handler) { this.routes[path] = handler; } };
  nonAdminSanction.register(fakeApp);
  const denied = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; } };
  await fakeApp.routes['/v1/admin/moderation-center/users/:id/sanction']({ params: { id: userId }, body: { kind: 'ban', reason: 'nope' } }, denied);
  note('non-admin-403', denied.statusCode === 403, { status: denied.statusCode });

  const lifted = await center.applySanction({
    userId, kind: 'lift', reason: `${MARKER} lift after QA`, actorId: adminSession.userId
  });
  note('lift', lifted.ok && lifted.restriction && !lifted.restriction.restricted, { auth: lifted.auth, error: lifted.error });

  const afterLift = await createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    .auth.signInWithPassword({ email: qaEmail, password: qaPassword });
  const liftJwt = afterLift.data && afterLift.data.session && afterLift.data.session.access_token;
  const writeAfterLift = liftJwt ? await restWrite(url, anonKey, liftJwt, 'bokantaj_posts', {
    author_id: userId,
    type: 'info',
    content: `${MARKER} write after lift`,
    territory: 'guadeloupe'
  }) : { ok: false, status: 0, text: 'no session' };
  note('write-after-lift', writeAfterLift.ok || writeAfterLift.status === 201, { status: writeAfterLift.status, text: writeAfterLift.text });

  const hiddenAgain = await center.applyContentDecision({
    subject: 'post', id: post.data.id, decision: 'hide', reason: `${MARKER} hide stays after lift`, actorId: adminSession.userId
  });
  const publicAfterLift = await anon.from('bokantaj_posts').select('id').eq('id', post.data.id).maybeSingle();
  note('moderated-content-stays-hidden-after-lift', hiddenAgain.ok && !publicAfterLift.data, { public: !!publicAfterLift.data });

  const self = await center.applySanction({
    userId: adminSession.userId, kind: 'ban', reason: 'should fail', actorId: adminSession.userId
  });
  note('self-protect', self.status === 403, { error: self.error });

  const audit = await admin.from('admin_audit_events').select('id, action, target_id').in('target_id', [post.data.id, userId]).limit(20);
  note('audit', !audit.error && (audit.data || []).length > 0, { count: (audit.data || []).length });

  report.go = report.steps.every((step) => step.ok);
  report.open_paths = report.steps.filter((step) => !step.ok).map((step) => step.id);
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) {
  main().then((report) => {
    process.exit(report && report.go ? 0 : 1);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
