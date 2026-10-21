'use strict';

/**
 * Staging-only runtime validation for admin editorial + maison + public feed.
 * Refuses Production. Does not enable Production collect.
 */
require('./force-staging-v2-env');

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { collectEditorial, publishEditorialTask, providerConfig } = require('../api/editorial-run');
const { EDITORIAL_BOTS } = require('../api/editorial-engine');

const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const STAGING_REF = 'tdktfbtqceldlaeqjtow';
const MARKER = `[LYANN-QA-BO ${new Date().toISOString().slice(0, 16)}]`;
const OUT = path.join(__dirname, '..', 'artifacts', 'admin-backoffice', 'staging-e2e-report.json');

function mustStaging() {
  const url = process.env.SUPABASE_URL || process.env.LYANN_SUPABASE_URL || '';
  if (!url.includes(STAGING_REF) || url.includes(PRODUCTION_REF)) {
    throw new Error('Refus : cet script n’accepte que Staging V2 (tdktfbtqceldlaeqjtow).');
  }
}

function admin() {
  const url = process.env.SUPABASE_URL || process.env.LYANN_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.LYANN_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Clés Staging manquantes.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function anon() {
  const url = process.env.SUPABASE_URL || process.env.LYANN_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.LYANN_SUPABASE_ANON_KEY || process.env.LYANN_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Clé anon Staging manquante.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function publicFeedContains(client, postId) {
  const { data, error } = await client
    .from('bokantaj_posts')
    .select('id, author_id, content, city, territory, media_urls, public_moderation_status, created_at')
    .eq('id', postId)
    .maybeSingle();
  if (error) return { visible: false, error: error.message, row: null };
  return { visible: Boolean(data), row: data, error: null };
}

async function publicFeedListContains(client, postId) {
  const { data, error } = await client
    .from('bokantaj_posts')
    .select('id, content, public_moderation_status, author_id, city, territory, media_urls, created_at')
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) return { visible: false, error: error.message };
  return { visible: (data || []).some((row) => row.id === postId), error: null, count: (data || []).length };
}

(async () => {
  mustStaging();
  const report = {
    environment: 'staging',
    supabase_ref: STAGING_REF,
    started_at: new Date().toISOString(),
    provider: (() => {
      const cfg = providerConfig(process.env);
      return { mode: cfg.mode || null, model: cfg.model || null, configured: Boolean(cfg.apiKey), error: cfg.error || null };
    })(),
    agents: [],
    maison: {},
    rbac: {},
    errors: []
  };

  const sb = admin();
  const publicClient = anon();

  const { data: members, error: membersErr } = await sb
    .from('admin_members')
    .select('id, email, role, status, user_id')
    .eq('status', 'ACTIVE')
    .limit(20);
  report.rbac.admin_members_active = (members || []).length;
  report.rbac.admin_members_error = membersErr ? membersErr.message : null;
  report.rbac.roles = [...new Set((members || []).map((m) => m.role))];

  const { data: agents, error: agentsErr } = await sb
    .from('lyann_agents')
    .select('id, agent_name, status, linked_profile_id')
    .in('agent_name', EDITORIAL_BOTS.map((b) => b.name));
  if (agentsErr) report.errors.push(agentsErr.message);

  for (const bot of EDITORIAL_BOTS) {
    const row = (agents || []).find((a) => a.agent_name === bot.name);
    report.agents.push({
      slug: bot.slug,
      name: bot.name,
      configured: Boolean(row),
      status: row?.status || 'ABSENT',
      linked_profile_id: row?.linked_profile_id || null,
      sources: (bot.sources || []).map((s) => s.name)
    });
  }

  let collect;
  try {
    collect = await collectEditorial(sb, { now: new Date() });
    report.collect = {
      created: (collect.created || []).map((c) => ({ id: c.id, bot: c.bot || c.agent_name, slug: c.slug })),
      skipped: collect.skipped || [],
      diagnoses: collect.diagnoses || []
    };
  } catch (err) {
    report.collect = { error: err.message };
    report.errors.push(`collect: ${err.message}`);
  }

  const agentIds = (agents || []).map((a) => a.id);
  const { data: pendingTasks } = agentIds.length
    ? await sb
      .from('lyann_agent_tasks')
      .select('id, agent_id, title, instruction, approval_status, status, metadata, created_at')
      .in('agent_id', agentIds)
      .eq('approval_status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(20)
    : { data: [] };
  report.pending_proposals = (pendingTasks || []).map((t) => ({
    id: t.id,
    agent_name: (agents || []).find((a) => a.id === t.agent_id)?.agent_name || null,
    title: t.title,
    source: t.metadata?.source_name || t.metadata?.source_url || null,
    created_at: t.created_at
  }));

  const { data: seedProfiles, error: seedErr } = await sb
    .from('profiles')
    .select('id, first_name, last_name, city, territory, account_type, bio')
    .eq('account_type', 'seed')
    .limit(10);
  report.maison.seed_error = seedErr ? seedErr.message : null;
  report.maison.seed_profiles = (seedProfiles || []).map((p) => ({
    id: p.id,
    name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
    city: p.city,
    territory: p.territory
  }));

  const seed = (seedProfiles || [])[0];
  if (seed) {
    const content = `${MARKER} Message de test interne maison. Compte relais LYANN, pas un habitant indépendant.`;
    const { data: inserted, error: insertErr } = await sb
      .from('bokantaj_posts')
      .insert({
        author_id: seed.id,
        type: 'info',
        content,
        city: seed.city || 'Le Gosier',
        territory: seed.territory || 'guadeloupe',
        media_urls: [],
        public_moderation_status: 'pending'
      })
      .select('id, author_id, content, city, territory, public_moderation_status, created_at')
      .single();
    if (insertErr) {
      report.maison.insert_error = insertErr.message;
      report.errors.push(`maison insert: ${insertErr.message}`);
    } else {
      report.maison.created = inserted;
      const pendingAnon = await publicFeedContains(publicClient, inserted.id);
      const pendingList = await publicFeedListContains(publicClient, inserted.id);
      report.maison.pending_anon_direct = pendingAnon;
      report.maison.pending_anon_feed = pendingList;

      await sb.from('moderation_jobs').insert({
        subject_type: 'post',
        subject_id: inserted.id,
        status: 'pending',
        source: 'admin-staging-e2e'
      }).then(() => null).catch(() => null);

      const { error: approveErr } = await sb
        .from('bokantaj_posts')
        .update({ public_moderation_status: 'approved' })
        .eq('id', inserted.id);
      report.maison.approve_error = approveErr ? approveErr.message : null;

      const approvedAdmin = await sb.from('bokantaj_posts').select('*').eq('id', inserted.id).maybeSingle();
      const approvedAnon = await publicFeedContains(publicClient, inserted.id);
      const approvedList = await publicFeedListContains(publicClient, inserted.id);
      report.maison.after_approve_admin = {
        status: approvedAdmin.data?.public_moderation_status,
        author_id: approvedAdmin.data?.author_id,
        city: approvedAdmin.data?.city,
        territory: approvedAdmin.data?.territory
      };
      report.maison.after_approve_anon_direct = approvedAnon;
      report.maison.after_approve_anon_feed = approvedList;
      report.maison.visible_to_member_feed = Boolean(approvedList.visible || approvedAnon.visible);
      report.maison.author_matches_seed = approvedAdmin.data?.author_id === seed.id;

      const rejectContent = `${MARKER} contenu refusé — ne doit pas apparaître.`;
      const { data: rejected } = await sb
        .from('bokantaj_posts')
        .insert({
          author_id: seed.id,
          type: 'info',
          content: rejectContent,
          city: seed.city || 'Le Gosier',
          territory: seed.territory || 'guadeloupe',
          media_urls: [],
          public_moderation_status: 'rejected'
        })
        .select('id')
        .single();
      if (rejected) {
        const rejectedAnon = await publicFeedContains(publicClient, rejected.id);
        report.maison.rejected_anon = rejectedAnon;
        report.maison.rejected_invisible = !rejectedAnon.visible;
      }
    }
  } else {
    report.maison.note = 'Aucun profil account_type=seed sur Staging.';
  }

  const { data: activity } = agentIds.length
    ? await sb
      .from('lyann_agent_activity')
      .select('id, agent_id, event_type, description, created_at')
      .in('agent_id', agentIds)
      .order('created_at', { ascending: false })
      .limit(15)
    : { data: [] };
  report.history = activity || [];

  report.finished_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  process.stdout.write(`${OUT}\n`);
  const createdCount = (report.collect && report.collect.created && report.collect.created.length) || 0;
  const maisonOk = Boolean(report.maison.visible_to_member_feed);
  process.stdout.write(JSON.stringify({
    agents_configured: report.agents.filter((a) => a.configured && a.status === 'ACTIVE').length,
    collect_created: createdCount,
    collect_error: report.collect && report.collect.error,
    maison_visible: maisonOk,
    pending_hidden: report.maison.pending_anon_direct ? !report.maison.pending_anon_direct.visible : null,
    rejected_hidden: report.maison.rejected_invisible,
    errors: report.errors
  }, null, 2) + '\n');
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
