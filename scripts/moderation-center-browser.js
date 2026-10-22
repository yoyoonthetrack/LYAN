'use strict';

require('./force-staging-v2-env');
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('@playwright/test');
const { createModerationCenter } = require('../api/admin-moderation-center');
const { runModerationOnce } = require('../api/moderation-worker');
const { resolveAdminAndJwt, mustStaging, STAGING_REF } = require('./admin-staging-real-session-lib');

const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const MARKER = '[QA-MODCENTER-BROWSER]';

function env() {
  const url = process.env.SUPABASE_URL || process.env.LYANN_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.LYANN_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url.includes(STAGING_REF) || url.includes(PRODUCTION_REF)) throw new Error('Staging only');
  return { url, anon, admin: createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }) };
}

async function main() {
  mustStaging();
  const { url, anon, admin } = env();
  const report = { target: STAGING_REF, steps: [] };
  const note = (id, ok, extra) => report.steps.push({ id, ok, ...extra });

  const adminSession = await resolveAdminAndJwt();
  const center = createModerationCenter({
    supabaseAdmin: admin,
    verifyAdminPermission: async () => ({ authorized: true, userId: adminSession.userId })
  });

  const post = await admin.from('bokantaj_posts').insert({
    author_id: adminSession.userId,
    type: 'info',
    content: `${MARKER} ${Date.now()}`,
    territory: 'guadeloupe',
    public_moderation_status: 'approved',
    human_moderation_lock: false
  }).select('id, content').single();
  if (post.error) throw new Error(post.error.message);
  await admin.from('bokantaj_posts').update({ public_moderation_status: 'approved', human_moderation_lock: false }).eq('id', post.data.id);

  const comment = await admin.from('bokantaj_comments').insert({
    author_id: adminSession.userId,
    post_id: post.data.id,
    content: `${MARKER} comment ${Date.now()}`,
    public_moderation_status: 'approved',
    human_moderation_lock: false
  }).select('id').single();
  if (comment.data) {
    await admin.from('bokantaj_comments').update({ public_moderation_status: 'approved', human_moderation_lock: false }).eq('id', comment.data.id);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('about:blank');

  async function publicSees(kind, id) {
    return page.evaluate(async ({ url, anon, kind, id }) => {
      const table = kind === 'post' ? 'bokantaj_posts' : 'bokantaj_comments';
      const res = await fetch(`${url}/rest/v1/${table}?id=eq.${id}&select=id`, {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` }
      });
      const rows = await res.json();
      return { status: res.status, visible: Array.isArray(rows) && rows.length > 0 };
    }, { url, anon, kind, id });
  }

  const before = await publicSees('post', post.data.id);
  note('browser-post-visible', before.visible, before);

  const hidden = await center.applyContentDecision({
    subject: 'post', id: post.data.id, decision: 'hide', reason: MARKER, actorId: adminSession.userId
  });
  await page.reload();
  const afterHide = await publicSees('post', post.data.id);
  note('browser-post-hidden', hidden.ok && !afterHide.visible, afterHide);

  const restored = await center.applyContentDecision({
    subject: 'post', id: post.data.id, decision: 'restore', reason: MARKER, actorId: adminSession.userId
  });
  await page.reload();
  const afterRestore = await publicSees('post', post.data.id);
  note('browser-post-restored', restored.ok && afterRestore.visible, afterRestore);

  if (comment.data) {
    const beforeC = await publicSees('comment', comment.data.id);
    const hideC = await center.applyContentDecision({
      subject: 'comment', id: comment.data.id, decision: 'hide', reason: MARKER, actorId: adminSession.userId
    });
    await page.reload();
    const afterC = await publicSees('comment', comment.data.id);
    note('browser-comment-hidden', beforeC.visible && hideC.ok && !afterC.visible, { before: beforeC, after: afterC });
  }

  const denied = await fetch(`${url}/rest/v1/bokantaj_posts?select=id&limit=1`, {
    headers: { apikey: anon, Authorization: 'Bearer invalid' }
  });
  note('browser-invalid-jwt-read-fails-or-anon', denied.status === 200 || denied.status === 401, { status: denied.status });

  const pending = await admin.from('bokantaj_posts').insert({
    author_id: adminSession.userId,
    type: 'info',
    content: `${MARKER} pending ia ${Date.now()}`,
    territory: 'guadeloupe',
    public_moderation_status: 'pending'
  }).select('id, created_at').single();
  const started = Date.now();
  let worker = { processed: 0 };
  try {
    const outcomes = await runModerationOnce({
      supabaseAdmin: admin,
      apiKey: process.env.OPENAI_API_KEY || '',
      fetchImpl: global.fetch,
      limit: 2
    });
    worker = { processed: outcomes.length, results: outcomes.map((row) => row.result) };
  } catch (err) {
    worker = { processed: 0, error: err.message };
  }
  const live = await admin.from('bokantaj_posts').select('public_moderation_status').eq('id', pending.data.id).maybeSingle();
  note('ia-worker-run', true, {
    ms: Date.now() - started,
    worker,
    pending_status: live.data && live.data.public_moderation_status,
    still_hidden_if_pending: live.data && live.data.public_moderation_status !== 'approved' ? true : live.data && live.data.public_moderation_status === 'approved'
  });
  if (live.data && live.data.public_moderation_status === 'pending') {
    note('ia-outage-keeps-pending', true, { status: 'pending' });
  } else {
    note('ia-decision-recorded', ['approved', 'rejected'].includes(live.data && live.data.public_moderation_status), {
      status: live.data && live.data.public_moderation_status
    });
  }

  await browser.close();
  report.go = report.steps.filter((s) => s.id.startsWith('browser-') || s.id === 'ia-outage-keeps-pending' || s.id === 'ia-decision-recorded').every((s) => s.ok);
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) {
  main().then((report) => process.exit(report && report.go ? 0 : 1)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
