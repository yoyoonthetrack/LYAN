'use strict';

/**
 * Real Staging JWT circuit: local patched server + Staging DB.
 * QA writes only. Does not print tokens or passwords.
 */
require('./force-staging-v2-env');
process.env.PORT = '8098';

const { spawn } = require('child_process');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { resolveAdminAndJwt, STAGING_REF } = require('./admin-staging-real-session-lib');

const PORT = process.env.PORT;
const MARKER = `[LYANN-QA-BO ${new Date().toISOString().slice(0, 16)}]`;

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      '-r', './scripts/force-staging-v2-env.js',
      'api/server.js'
    ], {
      cwd: path.join(__dirname, '..'),
      env: Object.assign({}, process.env, { PORT: '8098' }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let ready = false;
    const buf = [];
    const onData = (chunk) => {
      const text = String(chunk);
      buf.push(text);
      if (/écoute/i.test(text) && !ready) {
        ready = true;
        resolve(child);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      if (!ready) reject(new Error(`Serveur arrêté (${code}): ${buf.join('').slice(-400)}`));
    });
    setTimeout(() => {
      if (!ready) reject(new Error(`Serveur non prêt: ${buf.join('').slice(-400)}`));
    }, 12000);
  });
}

async function api(jwt, method, urlPath, body) {
  const res = await fetch(`http://127.0.0.1:${PORT}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

(async () => {
  const url = process.env.SUPABASE_URL || '';
  if (!url.includes(STAGING_REF)) throw new Error('Staging V2 uniquement.');
  const { jwt, emailDomain, userId } = await resolveAdminAndJwt();
  const server = await startServer();
  await new Promise((r) => setTimeout(r, 800));
  const anon = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY || process.env.LYANN_SUPABASE_ANON_KEY || process.env.LYANN_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const out = {
    admin_email_domain: emailDomain,
    admin_user_id_prefix: String(userId).slice(0, 8),
    steps: {}
  };
  try {
    const me = await api(jwt, 'GET', '/v1/admin/me');
    out.steps.me = { status: me.status, role: me.json.role, authorized: me.json.success === true };

    const bots = await api(jwt, 'GET', '/v1/admin/editorial/bots');
    out.steps.bots = {
      status: bots.status,
      names: (bots.json.bots || []).map((b) => b.agent_name),
      count: (bots.json.bots || []).length
    };

    const collect = await api(jwt, 'POST', '/v1/admin/editorial/collect', {});
    out.steps.collect = {
      status: collect.status,
      created: (collect.json.created || []).length,
      skipped: (collect.json.skipped || collect.json.skippedRows || []).length,
      error: collect.json.error || null,
      provider: collect.json.provider || null
    };

    const proposals = await api(jwt, 'GET', '/v1/admin/editorial/proposals');
    const pending = (proposals.json.proposals || []).filter((p) => p.approval_status === 'PENDING');
    out.steps.proposals = { status: proposals.status, total: (proposals.json.proposals || []).length, pending: pending.length };

    if (pending[0]) {
      const revised = `${pending[0].instruction || ''}\n\n${MARKER} révision QA.`.trim();
      const revise = await api(jwt, 'POST', `/v1/admin/editorial/proposals/${pending[0].id}/revise`, { content: revised });
      out.steps.revise = { status: revise.status, success: revise.json.success === true, error: revise.json.error || null };
      const publish = await api(jwt, 'POST', `/v1/admin/editorial/proposals/${pending[0].id}/publish`, { content: revised });
      out.steps.publish = {
        status: publish.status,
        success: publish.json.success === true,
        post_id: publish.json.post_id || null,
        error: publish.json.error || null
      };
      if (publish.json.post_id) {
        const feed = await anon.from('bokantaj_posts').select('id, public_moderation_status').eq('id', publish.json.post_id).maybeSingle();
        out.steps.editorial_feed = {
          visible: Boolean(feed.data),
          moderation: feed.data && feed.data.public_moderation_status,
          error: feed.error ? feed.error.message : null
        };
      }
    }

    const profiles = await api(jwt, 'GET', '/v1/admin/maison/profiles');
    const qaProfile = (profiles.json.profiles || []).find((p) => /qa|test|maison/i.test(`${p.first_name || ''} ${p.last_name || ''}`))
      || (profiles.json.profiles || [])[0];
    out.steps.maison_profiles = { status: profiles.status, count: (profiles.json.profiles || []).length, used: qaProfile ? `${qaProfile.first_name} ${qaProfile.last_name}` : null };

    if (qaProfile) {
      const post = await api(jwt, 'POST', `/v1/admin/maison/profiles/${qaProfile.id}/bokantaj`, {
        content: `${MARKER} publication maison QA — circuit éditorial.`,
        type: 'info'
      });
      out.steps.maison_publish = {
        status: post.status,
        post_id: post.json.post_id || null,
        visible: post.json.visible,
        moderation_status: post.json.moderation_status || null,
        lifecycle_label: post.json.lifecycle_label || null,
        message: post.json.message || post.json.error || null
      };
      if (post.json.post_id) {
        const feed = await anon.from('bokantaj_posts').select('id, public_moderation_status').eq('id', post.json.post_id).maybeSingle();
        out.steps.maison_feed = {
          visible: Boolean(feed.data),
          moderation: feed.data && feed.data.public_moderation_status,
          error: feed.error ? feed.error.message : null
        };
        const desk = await api(jwt, 'GET', `/v1/admin/maison/profiles/${qaProfile.id}/desk`);
        const deskPost = (desk.json.posts || []).find((p) => p.id === post.json.post_id);
        out.steps.maison_desk = {
          status: desk.status,
          found: Boolean(deskPost),
          visible: deskPost && deskPost.visible,
          lifecycle_label: deskPost && deskPost.lifecycle_label
        };
      }
    }

    const kyc = await api(jwt, 'GET', '/v1/admin/taxonomy');
    out.steps.taxonomy = { status: kyc.status, rows: (kyc.json.rows || kyc.json.taxonomy || []).length, error: kyc.json.error || null };
    const mika = await api(jwt, 'GET', '/v1/admin/agents/mika');
    out.steps.mika = { status: mika.status, success: mika.json.success === true, error: mika.json.error || null };
    const live = await fetch('https://staging.lyann.app/v1/admin/me', {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    const liveJson = await live.json().catch(() => ({}));
    out.steps.live_staging_me = { status: live.status, role: liveJson.role || null, success: liveJson.success === true };

    const ok = out.steps.me.authorized
      && out.steps.bots.count === 5
      && out.steps.maison_publish
      && out.steps.maison_publish.status === 200;
    out.ok = ok;
    console.log(JSON.stringify(out, null, 2));
    if (!ok) process.exitCode = 2;
  } finally {
    server.kill('SIGTERM');
  }
})().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
