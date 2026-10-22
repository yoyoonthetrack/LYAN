'use strict';

require('./force-staging-v2-env');
const fs = require('fs');
const path = require('path');
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
    admin: createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }),
    anon: createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  };
}

function readEnvKey(file, key) {
  if (!fs.existsSync(file)) return '';
  const line = fs.readFileSync(file, 'utf8').split(/\n/).find((row) => row.startsWith(`${key}=`));
  if (!line) return '';
  return line.slice(key.length + 1).replace(/^["']|["']$/g, '').trim();
}

async function applySqlIfPossible() {
  const token = process.env.SUPABASE_ACCESS_TOKEN
    || process.env.LYANN_SUPABASE_ACCESS_TOKEN
    || readEnvKey(path.join(__dirname, '..', '.env.local'), 'SUPABASE_ACCESS_TOKEN')
    || readEnvKey(path.join(__dirname, '..', '.env.staging-v2'), 'SUPABASE_ACCESS_TOKEN');
  if (!token) return { applied: false, reason: 'Pas de jeton Management API. Migration à appliquer manuellement sur Staging.' };
  const sql = fs.readFileSync(path.join(__dirname, '..', '73_moderation_center.sql'), 'utf8');
  const res = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql })
  });
  const text = await res.text();
  return { applied: res.ok, status: res.status, body: text.slice(0, 400) };
}

async function main() {
  mustStaging();
  const { admin, anon } = clients();
  const report = { target: STAGING_REF, steps: [] };
  const note = (id, ok, extra) => report.steps.push({ id, ok, ...extra });

  const sqlResult = await applySqlIfPossible();
  note('migration', sqlResult.applied, sqlResult);

  const columns = await admin.from('bokantaj_posts').select('id, human_moderation_lock, human_decision').limit(1);
  const sanctionsTable = await admin.from('account_sanctions').select('id').limit(1);
  const schemaReady = !columns.error && !sanctionsTable.error;
  note('schema', schemaReady, { posts: columns.error && columns.error.message, sanctions: sanctionsTable.error && sanctionsTable.error.message });
  report.limit = schemaReady
    ? null
    : '73_moderation_center.sql n’est pas encore appliqué. Hide/restore utilisent rejected/approved. Le verrou IA passe par l’audit. Les écritures RLS d’un JWT encore valide ne sont bloquées qu’après la migration.';

  const adminSession = await resolveAdminAndJwt();
  const center = createModerationCenter({
    supabaseAdmin: admin,
    verifyAdminPermission: async (_req, perm) => ({ authorized: true, userId: adminSession.userId, permission: perm })
  });

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
    account_type: 'real'
  });

  const post = await admin.from('bokantaj_posts').insert({
    author_id: userId,
    type: 'info',
    content: `${MARKER} post visible`,
    territory: 'guadeloupe',
    city: 'Pointe-à-Pitre',
    public_moderation_status: 'approved'
  }).select('id').single();
  if (post.error) throw new Error(post.error.message);
  await admin.from('bokantaj_posts').update({ public_moderation_status: 'approved' }).eq('id', post.data.id);

  const comment = await admin.from('bokantaj_comments').insert({
    author_id: userId,
    post_id: post.data.id,
    content: `${MARKER} commentaire visible`,
    public_moderation_status: 'approved'
  }).select('id').single();

  const pendingComment = await admin.from('bokantaj_comments').insert({
    author_id: userId,
    post_id: post.data.id,
    content: `${MARKER} commentaire pending`,
    public_moderation_status: 'pending'
  }).select('id').single();

  const publicBefore = await anon.from('bokantaj_posts').select('id').eq('id', post.data.id).maybeSingle();
  note('public-visible', !!publicBefore.data, { postId: post.data.id });

  const hidden = await center.applyContentDecision({
    subject: 'post', id: post.data.id, decision: 'hide', reason: `${MARKER} hide`, actorId: adminSession.userId
  });
  const publicHidden = await anon.from('bokantaj_posts').select('id').eq('id', post.data.id).maybeSingle();
  note('admin-hide', hidden.ok && !publicHidden.data, { visible: hidden.visible, public: !!publicHidden.data });

  const ai = await applyDecision(admin, { id: 'qa-job', subject_type: 'post', subject_id: post.data.id }, {
    row: { ...post.data, public_moderation_status: 'rejected', human_moderation_lock: true },
    pendingEdit: null
  }, { decision: 'approved' });
  const stillHidden = await anon.from('bokantaj_posts').select('id').eq('id', post.data.id).maybeSingle();
  note('ia-cannot-unhide', ai === 'human_lock' && !stillHidden.data, { ai });

  const restored = await center.applyContentDecision({
    subject: 'post', id: post.data.id, decision: 'restore', reason: `${MARKER} restore`, actorId: adminSession.userId
  });
  const publicRestored = await anon.from('bokantaj_posts').select('id').eq('id', post.data.id).maybeSingle();
  note('restore', restored.ok && !!publicRestored.data, { public: !!publicRestored.data });

  if (comment.data) {
    const hideComment = await center.applyContentDecision({
      subject: 'comment', id: comment.data.id, decision: 'hide', reason: `${MARKER} hide comment`, actorId: adminSession.userId
    });
    const publicComment = await anon.from('bokantaj_comments').select('id').eq('id', comment.data.id).maybeSingle();
    note('comment-hide', hideComment.ok && !publicComment.data, { public: !!publicComment.data });
  }
  if (pendingComment.data) {
    const approved = await center.applyContentDecision({
      subject: 'comment', id: pendingComment.data.id, decision: 'approved', reason: `${MARKER} approve comment`, actorId: adminSession.userId
    });
    note('comment-approve', approved.ok && approved.visible, { visible: approved.visible });
  }

  const userClient = createClient(process.env.SUPABASE_URL || process.env.LYANN_SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.LYANN_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const signed = await userClient.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
  note('qa-signin', !!(signed.data && signed.data.session), { error: signed.error && signed.error.message });

  const suspended = await center.applySanction({
    userId, kind: 'suspend', reason: `${MARKER} suspend 24h`, duration: '24h', actorId: adminSession.userId
  });
  note('suspend', suspended.ok && suspended.restriction && suspended.restriction.restricted, { auth: suspended.auth, missions: suspended.open_missions, error: suspended.error });

  const blockedWrite = await userClient.from('bokantaj_posts').insert({
    author_id: userId,
    type: 'info',
    content: `${MARKER} should fail after suspend`,
    territory: 'guadeloupe'
  }).select('id').maybeSingle();
  note('suspended-write-blocked', !blockedWrite.data, { error: blockedWrite.error && blockedWrite.error.message });

  const banned = await center.applySanction({
    userId, kind: 'ban', reason: `${MARKER} ban`, actorId: adminSession.userId
  });
  note('ban', banned.ok && banned.restriction && banned.restriction.status === 'banned', { auth: banned.auth, error: banned.error });

  const lifted = await center.applySanction({
    userId, kind: 'lift', reason: `${MARKER} lift after QA`, actorId: adminSession.userId
  });
  note('lift', lifted.ok && lifted.restriction && !lifted.restriction.restricted, { auth: lifted.auth, error: lifted.error });

  const self = await center.applySanction({
    userId: adminSession.userId, kind: 'ban', reason: 'should fail', actorId: adminSession.userId
  });
  note('self-protect', self.status === 403, { error: self.error });

  const audit = await admin.from('admin_audit_events').select('id, action, target_id').in('target_id', [post.data.id, userId]).limit(20);
  note('audit', !audit.error && (audit.data || []).length > 0, { count: (audit.data || []).length });

  report.go = report.steps.every((s) => s.ok);
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
