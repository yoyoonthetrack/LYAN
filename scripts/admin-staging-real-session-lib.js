'use strict';

require('./force-staging-v2-env');

const { createClient } = require('@supabase/supabase-js');

const STAGING_REF = 'tdktfbtqceldlaeqjtow';
const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const OWNER_EMAIL = 'yoann.danier@gmail.com';

function mustStaging() {
  const url = process.env.SUPABASE_URL || process.env.LYANN_SUPABASE_URL || '';
  if (!url.includes(STAGING_REF) || url.includes(PRODUCTION_REF)) {
    throw new Error('Refus : Staging V2 uniquement.');
  }
}

function clients() {
  const url = process.env.SUPABASE_URL || process.env.LYANN_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.LYANN_SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.LYANN_SUPABASE_ANON_KEY || process.env.LYANN_SUPABASE_PUBLISHABLE_KEY;
  return {
    admin: createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } }),
    anon: createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  };
}

async function resolveAdminAndJwt() {
  mustStaging();
  const { admin, anon } = clients();
  const { data: members, error } = await admin
    .from('admin_members')
    .select('user_id, status, role_id')
    .eq('status', 'ACTIVE')
    .limit(40);
  if (error) throw new Error(error.message);
  const rows = members || [];
  let chosen = null;
  for (const row of rows) {
    const { data } = await admin.auth.admin.getUserById(row.user_id);
    const email = data && data.user && data.user.email;
    if (email && email.toLowerCase() === OWNER_EMAIL) {
      chosen = { userId: row.user_id, email, source: 'owner-email' };
      break;
    }
  }
  if (!chosen) {
    if (!rows[0]) throw new Error('Aucun admin_members ACTIVE sur Staging.');
    const first = await admin.auth.admin.getUserById(rows[0].user_id);
    chosen = {
      userId: rows[0].user_id,
      email: first.data && first.data.user && first.data.user.email,
      source: 'first-active-member'
    };
  }
  if (!chosen.email) throw new Error('Email admin introuvable.');
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: chosen.email });
  const tokenHash = link.data && link.data.properties && link.data.properties.hashed_token;
  if (!tokenHash) throw new Error('Magic link Staging indisponible.');
  const verified = await anon.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  const session = verified.data && verified.data.session;
  if (!session || !session.access_token) {
    throw new Error(verified.error && verified.error.message ? verified.error.message : 'JWT admin introuvable.');
  }
  return {
    userId: chosen.userId,
    email: chosen.email,
    emailDomain: chosen.email.split('@')[1],
    source: chosen.source,
    jwt: session.access_token,
    refresh: session.refresh_token
  };
}

module.exports = { resolveAdminAndJwt, mustStaging, STAGING_REF };
