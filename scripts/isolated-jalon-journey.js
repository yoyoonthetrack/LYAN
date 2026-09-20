/**
 * Isolated jalon journey against pcmvagiuvleeciktligz only.
 * Request → invite → quote → accept → Stripe test PI → webhook FUNDED → complete → release.
 * Never targets production. Stripe live keys are rejected.
 */
'use strict';

const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config();

const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const ISOLATED_REF = 'pcmvagiuvleeciktligz';
const BASE = process.env.LYANN_E2E_BASE_URL || 'http://127.0.0.1:8080';

function hostRef(url) {
  try {
    return new URL(url).hostname.replace('.supabase.co', '');
  } catch (e) {
    return '';
  }
}

function jwtRef(token) {
  try {
    const payload = token.split('.')[1];
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64url').toString()).ref || '';
  } catch (e) {
    return '';
  }
}

function gate() {
  const url = (process.env.LYANN_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.LYANN_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  const service = process.env.LYANN_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const writeRef = process.env.LYANN_E2E_WRITE_PROJECT_REF || '';
  const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
  const ref = hostRef(url);
  if (process.env.LYANN_E2E_ALLOW_WRITES !== '1') {
    throw new Error('LYANN_E2E_ALLOW_WRITES must be 1');
  }
  if (ref !== ISOLATED_REF || writeRef !== ISOLATED_REF) {
    throw new Error('Refusing journey: target is not the isolated QA project');
  }
  if (ref === PRODUCTION_REF || jwtRef(anon) === PRODUCTION_REF || jwtRef(service) === PRODUCTION_REF) {
    throw new Error('Refusing production Supabase');
  }
  if (!stripeSecret.startsWith('sk_test_')) {
    throw new Error('Stripe test secret required (sk_test_)');
  }
  return { url, anon, service };
}

async function signIn(url, anon, email, password) {
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed for ${email.replace(/@.*$/, '@…')}: ${error && error.message}`);
  return { client, session: data.session, user: data.user };
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function main() {
  const cfg = gate();
  const password = process.env.LYANN_E2E_QA_A_PASSWORD || 'Password123!';
  const emailA = process.env.LYANN_E2E_QA_A_EMAIL || 'req_user_a@lyann.app';
  const emailB = process.env.LYANN_E2E_QA_B_EMAIL || 'req_user_b@lyann.app';

  const a = await signIn(cfg.url, cfg.anon, emailA, password);
  const b = await signIn(cfg.url, cfg.anon, emailB, password);
  console.log('auth_ok', { a: true, b: true });

  const { data: requestRow, error: reqErr } = await a.client.from('requests').insert({
    requester_id: a.user.id,
    author_id: a.user.id,
    title: 'QA isolé — besoin jardinage',
    description: 'Taille de haie test isolé, sans adresse précise.',
    category: 'Jardinage',
    location: 'Guadeloupe',
    budget: 50,
    urgency: 'Normale',
    status: 'OPEN',
    visibility: 'PUBLIC',
    classification_status: 'UNCLASSIFIED',
    safety_status: 'SAFE'
  }).select('id').single();
  if (reqErr) throw new Error(`create request: ${reqErr.message}`);
  console.log('request_ok', !!requestRow.id);

  const invite = await rpc(a.client, 'send_request_invitations', {
    p_request_id: requestRow.id,
    p_recipient_ids: [b.user.id]
  });
  const invitationId = invite && (invite.invitation_id || invite.id || (Array.isArray(invite.invitations) && invite.invitations[0] && invite.invitations[0].id));
  let resolvedInvitationId = invitationId;
  if (!resolvedInvitationId) {
    const { data: invRows, error: invErr } = await a.client
      .from('request_invitations')
      .select('id,status')
      .eq('request_id', requestRow.id)
      .eq('recipient_id', b.user.id)
      .order('created_at', { ascending: false })
      .limit(1);
    if (invErr || !invRows || !invRows[0]) throw new Error(`invitation lookup: ${invErr && invErr.message}`);
    resolvedInvitationId = invRows[0].id;
  }
  console.log('invite_ok', !!resolvedInvitationId);

  await rpc(b.client, 'accept_request_invitation', { p_invitation_id: resolvedInvitationId });
  console.log('invite_accepted');

  const quote = await rpc(b.client, 'create_request_quote', {
    p_invitation_id: resolvedInvitationId,
    p_description: 'Devis test isolé',
    p_valid_until: null,
    p_milestones_json: [{ title: 'Taille', amount: 50, display_order: 1 }]
  });
  const quoteId = quote && (quote.quote_id || quote.id);
  if (!quoteId) throw new Error('create_request_quote returned no id: ' + JSON.stringify(quote));
  console.log('quote_ok', !!quoteId);

  await rpc(a.client, 'accept_request_quote', { p_quote_id: quoteId });
  const { data: milestones, error: msErr } = await a.client
    .from('milestones')
    .select('id,status,amount')
    .eq('quote_id', quoteId);
  if (msErr || !milestones || !milestones[0]) throw new Error(`milestones: ${msErr && msErr.message}`);
  const milestoneId = milestones[0].id;
  console.log('quote_accepted', { milestoneId: true, status: milestones[0].status });

  const intentRes = await fetch(`${BASE}/v1/payments/create-milestone-intent`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${a.session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ milestone_id: milestoneId })
  });
  const intentBody = await intentRes.json();
  if (!intentRes.ok) throw new Error(`create-milestone-intent ${intentRes.status}: ${JSON.stringify(intentBody)}`);
  if (!intentBody.client_secret || !intentBody.payment_intent_id) {
    throw new Error('create-milestone-intent missing client_secret');
  }
  console.log('intent_ok', { livemode: false, status: intentRes.status });

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const confirmed = await stripe.paymentIntents.confirm(intentBody.payment_intent_id, {
    payment_method: 'pm_card_visa',
    return_url: 'http://127.0.0.1:8080/feed.html'
  });
  if (confirmed.livemode) throw new Error('Stripe live is forbidden');
  if (confirmed.status !== 'succeeded') throw new Error(`PI status ${confirmed.status}`);
  console.log('stripe_confirm_ok', { livemode: confirmed.livemode, status: confirmed.status });

  const event = {
    id: `evt_isolated_${Date.now()}`,
    object: 'event',
    type: 'payment_intent.succeeded',
    data: { object: confirmed }
  };
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET
  });
  const hookRes = await fetch(`${BASE}/v1/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': header },
    body: payload
  });
  const hookText = await hookRes.text();
  if (!hookRes.ok) throw new Error(`webhook ${hookRes.status}: ${hookText.slice(0, 200)}`);
  console.log('webhook_ok', hookRes.status);

  const { data: funded, error: fundedErr } = await a.client
    .from('milestones')
    .select('id,status')
    .eq('id', milestoneId)
    .single();
  if (fundedErr) throw fundedErr;
  if (funded.status !== 'FUNDED') throw new Error(`expected FUNDED, got ${funded.status}`);
  console.log('milestone_funded');

  const completeRes = await fetch(`${BASE}/v1/milestones/submit-completion`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${b.session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ milestone_id: milestoneId })
  });
  const completeBody = await completeRes.json().catch(() => ({}));
  if (!completeRes.ok) throw new Error(`submit-completion ${completeRes.status}: ${JSON.stringify(completeBody)}`);
  console.log('submit_completion_ok');

  const releaseRes = await fetch(`${BASE}/v1/milestones/release-payment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${a.session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ milestone_id: milestoneId })
  });
  const releaseBody = await releaseRes.json().catch(() => ({}));
  if (!releaseRes.ok) throw new Error(`release-payment ${releaseRes.status}: ${JSON.stringify(releaseBody)}`);
  console.log('release_ok', releaseBody.code || releaseBody.status || releaseRes.status);

  console.log(JSON.stringify({
    STATUS: 'runtime_verified_isolated_jalon',
    target: ISOLATED_REF,
    production: false,
    stripe_live: false
  }));
}

main().catch((err) => {
  console.error('JOURNEY FAIL', err.message);
  process.exit(1);
});
