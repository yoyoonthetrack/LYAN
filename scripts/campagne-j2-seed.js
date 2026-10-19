'use strict';

/**
 * Staging-only campaign data. Does not update rows whose title does not
 * start with [CAMPAGNE-J2]. Re-running reuses those requests.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const PREFIX = '[CAMPAGNE-J2]';
const OUT = path.join(__dirname, '..', 'tests', 'fixtures', 'campagne-j2.json');

function client() {
  const url = process.env.SUPABASE_URL || process.env.LYANN_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.LYANN_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('missing staging supabase url/anon');
  if (!url.includes('tdktfbtqceldlaeqjtow')) throw new Error('refusing non-staging url');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function sign(email, password) {
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('login ' + email + ': ' + error.message);
  return { supabase, id: data.user.id };
}

async function existing(supabase, title) {
  const { data, error } = await supabase.from('requests').select('id, title, status').eq('title', title).limit(1);
  if (error) throw new Error(error.message);
  return data && data[0];
}

async function publish(a, title, description) {
  const found = await existing(a.supabase, title);
  if (found) return found.id;
  const { data, error } = await a.supabase.from('requests').insert({
    requester_id: a.id,
    visibility: 'PUBLIC',
    title,
    description,
    category: 'Jardinage',
    location: 'Le Gosier',
    urgency: 'Normale',
    status: 'OPEN',
    price_mode: 'QUOTE',
    date_mode: 'FLEXIBLE'
  }).select('id').single();
  if (error) throw new Error('request ' + title + ': ' + error.message);
  return data.id;
}

async function invite(a, requestId, recipientId) {
  const { data: rows, error: readErr } = await a.supabase
    .from('request_invitations')
    .select('id, status')
    .eq('request_id', requestId)
    .eq('recipient_id', recipientId)
    .limit(1);
  if (readErr) throw new Error(readErr.message);
  if (rows && rows[0]) return rows[0];
  const { error } = await a.supabase.rpc('send_request_invitations', {
    p_request_id: requestId,
    p_recipient_ids: [recipientId]
  });
  if (error) throw new Error('invite: ' + error.message);
  const { data: created, error: again } = await a.supabase
    .from('request_invitations')
    .select('id, status')
    .eq('request_id', requestId)
    .eq('recipient_id', recipientId)
    .limit(1);
  if (again || !created || !created[0]) throw new Error('invite: invitation absente après envoi');
  return created[0];
}

async function acceptInvite(b, invitationId) {
  const { error } = await b.supabase.rpc('accept_request_invitation', { p_invitation_id: invitationId });
  if (error) throw new Error('accept invite: ' + error.message);
}

async function quoteFor(b, invitationId) {
  const { data, error } = await b.supabase.from('quotes').select('id, status, version').eq('request_invitation_id', invitationId).order('created_at', { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return data && data[0];
}

async function createQuote(b, invitationId, description, milestones) {
  const existingQuote = await quoteFor(b, invitationId);
  if (existingQuote) return existingQuote;
  const { data, error } = await b.supabase.rpc('create_request_quote', {
    p_invitation_id: invitationId,
    p_description: description,
    p_valid_until: null,
    p_milestones_json: milestones
  });
  if (error) throw new Error('quote: ' + error.message);
  const id = data && (data.id || data.quote_id || data);
  const row = await quoteFor(b, invitationId);
  return row || { id, status: 'SENT' };
}

async function main() {
  const a = await sign(process.env.LYANN_E2E_QA_A_EMAIL, process.env.LYANN_E2E_QA_A_PASSWORD);
  const b = await sign(process.env.LYANN_E2E_QA_B_EMAIL, process.env.LYANN_E2E_QA_B_PASSWORD);
  const cases = [
    {
      key: 'direct',
      title: PREFIX + ' Tarif Direct',
      description: 'Campagne J2. Tonte ponctuelle. Ne pas confondre avec les fixtures QA historiques.',
      milestones: [{ title: 'Tonte', description: 'Tarif direct', amount: 18, percentage: 100 }],
      final: 'ACCEPTED'
    },
    {
      key: 'jalons',
      title: PREFIX + ' Devis par jalons',
      description: 'Campagne J2. Deux jalons indépendants. Laisser le devis en attente.',
      milestones: [
        { title: 'Préparation', description: 'Premier jalon', amount: 20, percentage: 40 },
        { title: 'Plantation', description: 'Second jalon', amount: 30, percentage: 60 }
      ],
      final: 'SENT'
    },
    {
      key: 'refus',
      title: PREFIX + ' Devis à refuser',
      description: 'Campagne J2. Ce devis doit rester refusé.',
      milestones: [{ title: 'Offre', description: 'À refuser', amount: 9, percentage: 100 }],
      final: 'REJECTED'
    }
  ];
  const result = { prefix: PREFIX, requesterId: a.id, helperId: b.id, cases: {} };
  for (const item of cases) {
    const requestId = await publish(a, item.title, item.description);
    const invitation = await invite(a, requestId, b.id);
    if (invitation.status !== 'ACCEPTED') await acceptInvite(b, invitation.id);
    const created = await createQuote(b, invitation.id, item.description, item.milestones);
    if (item.final === 'ACCEPTED' && created.status !== 'ACCEPTED') {
      const { error } = await a.supabase.rpc('accept_request_quote', {
        p_quote_id: created.id,
        p_expected_version: created.version || 1
      });
      if (error) throw new Error('accept quote: ' + error.message);
    }
    if (item.final === 'REJECTED' && created.status !== 'REJECTED') {
      const { error } = await a.supabase.rpc('reject_request_quote', { p_quote_id: created.id });
      if (error) throw new Error('reject quote: ' + error.message);
    }
    const fresh = await quoteFor(b, invitation.id);
    result.cases[item.key] = {
      title: item.title,
      requestId,
      invitationId: invitation.id,
      quoteId: fresh && fresh.id,
      quoteStatus: fresh && fresh.status
    };
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
