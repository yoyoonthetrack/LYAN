/**
 * Financial journey checks on Supabase Staging with Stripe TEST only.
 * Tarif direct + milestone quote, declined card, 3DS, retry, double click,
 * webhook replay / out of order / wrong amount, dispute, release, Finances ledger.
 *
 * LYANN_FINANCE_API   API under test (default http://127.0.0.1:8098).
 * LYANN_FINANCE_HOOK  API that receives signed replayed events with the local
 *                     STRIPE_WEBHOOK_SECRET (default: same as API). Empty = skip.
 * Real Stripe test events also reach the Staging endpoint configured in Stripe.
 * Prints statuses and id prefixes only.
 */
'use strict';

require('./force-staging-v2-env');
const { createClient } = require('@supabase/supabase-js');
const { assertStagingIsolation } = require('./staging-v2-guard');
const { calculateMilestonePricing } = require('../api/stripe-policy');
const financeUi = require('../finance-policy-ui');

const API = (process.env.LYANN_FINANCE_API || 'http://127.0.0.1:8098').replace(/\/$/, '');
const HOOK = process.env.LYANN_FINANCE_HOOK === undefined ? API : process.env.LYANN_FINANCE_HOOK.replace(/\/$/, '');
const RUN = 'QA finance ' + new Date().toISOString().slice(0, 16).replace('T', ' ');
const results = [];
const p8 = (id) => String(id || '').slice(0, 8);

function record(name, ok, detail) {
    results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail != null && detail !== '' ? ' — ' + detail : ''));
}

function gate() {
    assertStagingIsolation(process.env);
    if (!String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_')) throw new Error('Stripe test secret required');
    for (const base of [API, HOOK].filter(Boolean)) {
        const host = new URL(base).hostname;
        if (host === 'lyann.app' || host === 'www.lyann.app') throw new Error('Production refused');
    }
}

async function signIn(email, password) {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error('sign-in failed');
    return { client, token: data.session.access_token, user: data.user };
}

async function api(token, path, body) {
    const response = await fetch(API + path, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(read, accept, timeoutMs) {
    const end = Date.now() + (timeoutMs || 45000);
    let last = null;
    while (Date.now() < end) {
        last = await read();
        if (accept(last)) return { ok: true, value: last };
        await sleep(1500);
    }
    return { ok: false, value: last };
}

async function freshDeal(a, b, label, milestones) {
    const { data: requestRow, error: reqErr } = await a.client.from('requests').insert({
        requester_id: a.user.id,
        visibility: 'PUBLIC',
        title: RUN + ' ' + label,
        description: 'Parcours financier Stripe test. Aucun paiement réel.',
        category: 'Jardinage',
        location: 'Le Gosier',
        urgency: 'Normale',
        status: 'OPEN',
        price_mode: 'QUOTE',
        date_mode: 'FLEXIBLE'
    }).select('id').single();
    if (reqErr) throw new Error('request: ' + reqErr.message);
    const invite = await a.client.rpc('send_request_invitations', { p_request_id: requestRow.id, p_recipient_ids: [b.user.id] });
    if (invite.error) throw new Error('invite: ' + invite.error.message);
    const lookup = await a.client.from('request_invitations').select('id').eq('request_id', requestRow.id).eq('recipient_id', b.user.id).limit(1);
    const invitationId = lookup.data && lookup.data[0] && lookup.data[0].id;
    if (!invitationId) throw new Error('invitation missing');
    const accepted = await b.client.rpc('accept_request_invitation', { p_invitation_id: invitationId });
    if (accepted.error && !/already|déjà|accepted/i.test(accepted.error.message || '')) throw new Error('accept invite: ' + accepted.error.message);
    const quote = await b.client.rpc('create_request_quote', {
        p_invitation_id: invitationId,
        p_description: label,
        p_valid_until: null,
        p_milestones_json: milestones
    });
    if (quote.error) throw new Error('quote: ' + quote.error.message);
    const quoteId = quote.data && (quote.data.quote_id || quote.data.id);
    return { requestId: requestRow.id, invitationId, quoteId, version: quote.data.version || 1 };
}

async function milestonesOf(admin, quoteId) {
    const { data } = await admin.from('milestones').select('id,status,amount,display_order').eq('quote_id', quoteId).order('display_order');
    return data || [];
}

async function paymentRows(admin, milestoneId) {
    const { data } = await admin.from('payments')
        .select('id,payment_status,transfer_status,stripe_payment_intent_id,stripe_transfer_id,customer_total_cents,service_amount_cents,customer_fee_cents,provider_fee_cents,provider_net_cents,lyann_revenue_cents,requester_id,provider_id,created_at,milestone_id')
        .eq('milestone_id', milestoneId)
        .order('created_at');
    return data || [];
}

async function postEvent(stripe, type, object, eventId) {
    if (!HOOK) return { status: 0, skipped: true };
    const event = { id: eventId || ('evt_lyann_qa_' + Date.now() + '_' + Math.random().toString(16).slice(2, 8)), object: 'event', type, livemode: false, data: { object } };
    const payload = JSON.stringify(event);
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
    const response = await fetch(HOOK + '/v1/payments/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'stripe-signature': header },
        body: payload
    });
    const text = await response.text();
    let body = {};
    try { body = JSON.parse(text); } catch (_) {}
    return { status: response.status, body, id: event.id };
}

async function confirm(stripe, intentId, paymentMethod) {
    try {
        return await stripe.paymentIntents.confirm(intentId, { payment_method: paymentMethod, return_url: 'https://staging.lyann.app/index.html' });
    } catch (error) {
        return { error, status: error.payment_intent && error.payment_intent.status, id: intentId, code: error.code };
    }
}

async function main() {
    gate();
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const a = await signIn(process.env.LYANN_E2E_QA_A_EMAIL, process.env.LYANN_E2E_QA_A_PASSWORD);
    const b = await signIn(process.env.LYANN_E2E_QA_B_EMAIL, process.env.LYANN_E2E_QA_B_PASSWORD);
    const c = await signIn(process.env.LYANN_E2E_QA_C_EMAIL, process.env.LYANN_E2E_QA_C_PASSWORD);
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const identity = await fetch(API + '/v1/runtime/identity').then((r) => r.json()).catch(() => ({}));
    record('API cible Staging isolée', identity.supabase_ref === 'tdktfbtqceldlaeqjtow' && identity.production !== true, (identity.commit || '').slice(0, 7) + ' ' + (identity.isolation || ''));
    const config = await fetch(API + '/v1/payments/config').then((r) => r.json()).catch(() => ({}));
    record('Stripe en mode test', config.stripe_mode === 'test' && String(config.publishableKey || '').startsWith('pk_test_'), config.stripe_mode);

    // ---------- A. Tarif direct ----------
    const direct = await freshDeal(a, b, 'tarif direct', [{ title: 'Tonte', description: 'Tarif direct', amount: 25, percentage: 100 }]);
    const acceptDirect = await a.client.rpc('accept_request_quote', { p_quote_id: direct.quoteId, p_expected_version: direct.version });
    record('A. tarif direct accepté par le demandeur', !acceptDirect.error, acceptDirect.error && acceptDirect.error.message);
    const acceptAgain = await a.client.rpc('accept_request_quote', { p_quote_id: direct.quoteId, p_expected_version: direct.version });
    record('A. second accept refusé (invariant 4)', !!acceptAgain.error, acceptAgain.error && acceptAgain.error.code);
    const [directMs] = await milestonesOf(admin, direct.quoteId);

    const providerTry = await api(b.token, '/v1/payments/create-milestone-intent', { milestone_id: directMs.id });
    const strangerTry = await api(c.token, '/v1/payments/create-milestone-intent', { milestone_id: directMs.id });
    record('A. le Lyanneur ne peut pas payer', providerTry.status === 403, providerTry.status);
    record('A. un tiers ne peut pas payer', strangerTry.status === 403, strangerTry.status);

    const triple = await Promise.all([1, 2, 3].map(() => api(a.token, '/v1/payments/create-milestone-intent', { milestone_id: directMs.id })));
    const firstOk = triple.find((r) => r.status === 200);
    if (!firstOk) {
        record('A. création du paiement', false, triple.map((r) => r.status + ':' + (r.payload.code || r.payload.error || '')).join(' | '));
        return finish();
    }
    const directPi = firstOk.payload.payment_intent_id;
    const tripleIds = new Set(triple.filter((r) => r.status === 200).map((r) => r.payload.payment_intent_id));
    const tripleOthers = triple.filter((r) => r.status !== 200).map((r) => r.status + ':' + (r.payload.code || ''));
    record('A. triple clic Payer : un seul PaymentIntent', tripleIds.size === 1 && tripleOthers.every((s) => s.startsWith('409:PAIEMENT_EN_PREPARATION')), [...tripleIds].map(p8).join(',') + ' ' + tripleOthers.join(','));
    let rows = await paymentRows(admin, directMs.id);
    record('A. une seule ligne de paiement', rows.length === 1, rows.length);
    const expected = calculateMilestonePricing(directMs.amount);
    const amounts = firstOk.payload.amounts || {};
    record('A. frais affichés = frais appliqués (25,00 € → 1,49 € plancher)', amounts.customer_fee_cents === Number(expected.customer_fee_cents) && amounts.customer_total_cents === 2649 && rows[0].customer_total_cents === 2649, JSON.stringify(amounts));
    let intent = await stripe.paymentIntents.retrieve(directPi);
    record('A. montant Stripe = montant accepté + frais (invariant 9)', intent.amount === 2649 && intent.currency === 'eur' && intent.livemode === false, intent.amount);

    const declined = await confirm(stripe, directPi, 'pm_card_chargeDeclined');
    record('A. carte refusée (Stripe test)', declined.error && declined.code === 'card_declined', declined.code || declined.status);
    intent = await stripe.paymentIntents.retrieve(directPi);
    if (HOOK) {
        const hook = await postEvent(stripe, 'payment_intent.payment_failed', intent);
        record('A. webhook payment_failed accepté', hook.status === 200, hook.status);
    }
    const failedSeen = await waitFor(() => paymentRows(admin, directMs.id), (list) => list[0] && list[0].payment_status === 'FAILED', 45000);
    record('A. refus → ligne FAILED, jalon toujours PENDING', failedSeen.ok && (await milestonesOf(admin, direct.quoteId))[0].status === 'PENDING', failedSeen.value && failedSeen.value[0] && failedSeen.value[0].payment_status);

    const retry = await api(a.token, '/v1/payments/create-milestone-intent', { milestone_id: directMs.id });
    record('A. nouvelle tentative après refus : même PaymentIntent, pas de 500', retry.status === 200 && retry.payload.payment_intent_id === directPi, retry.status + ' ' + (retry.payload.code || '') + ' ' + p8(retry.payload.payment_intent_id));
    rows = await paymentRows(admin, directMs.id);
    record('A. toujours une seule ligne après la nouvelle tentative', rows.length === 1, rows.map((r) => r.payment_status).join('+'));

    const paid = await confirm(stripe, directPi, 'pm_card_visa');
    record('A. carte valide sur le même PaymentIntent', paid.status === 'succeeded', paid.status || paid.code);
    let successEvent = null;
    if (HOOK && paid.status === 'succeeded') {
        successEvent = await postEvent(stripe, 'payment_intent.succeeded', paid);
        record('A. webhook succeeded accepté', successEvent.status === 200, successEvent.status);
        const replay = await postEvent(stripe, 'payment_intent.succeeded', paid, successEvent.id);
        record('A. même événement rejoué : doublon ignoré', replay.status === 200 && replay.body.duplicate === true, JSON.stringify(replay.body));
        const second = await postEvent(stripe, 'payment_intent.succeeded', paid);
        record('A. second événement succeeded (autre id) : idempotent', second.status === 200, second.status);
        const late = await postEvent(stripe, 'payment_intent.payment_failed', { ...paid, status: 'requires_payment_method' });
        record('A. payment_failed tardif (désordre) accepté sans effet', late.status === 200, late.status);
    }
    const fundedSeen = await waitFor(async () => ({ rows: await paymentRows(admin, directMs.id), ms: (await milestonesOf(admin, direct.quoteId))[0] }),
        (v) => v.rows[0] && v.rows[0].payment_status === 'SUCCEEDED' && v.ms.status === 'FUNDED', 45000);
    record('A. paiement SUCCEEDED + jalon FUNDED après webhook', fundedSeen.ok, fundedSeen.value && (fundedSeen.value.rows[0] || {}).payment_status + '/' + (fundedSeen.value.ms || {}).status);
    await sleep(2000);
    rows = await paymentRows(admin, directMs.id);
    record('A. le désordre ne repasse pas en FAILED', rows.length === 1 && rows[0].payment_status === 'SUCCEEDED', rows.map((r) => r.payment_status).join('+'));
    const charges = await stripe.charges.list({ payment_intent: directPi, limit: 10 });
    const succeededCharges = charges.data.filter((ch) => ch.status === 'succeeded');
    record('A. un seul débit réussi chez Stripe (invariant 1)', succeededCharges.length === 1 && succeededCharges[0].amount === 2649, charges.data.map((ch) => ch.status).join('+'));
    const payAgain = await api(a.token, '/v1/payments/create-milestone-intent', { milestone_id: directMs.id });
    record('A. repayer un jalon payé est refusé', payAgain.status === 400 || payAgain.status === 409, payAgain.status + ' ' + (payAgain.payload.code || ''));
    const { data: directReq } = await admin.from('requests').select('status').eq('id', direct.requestId).single();
    record('A. annonce passée IN_PROGRESS après paiement', directReq && directReq.status === 'IN_PROGRESS', directReq && directReq.status);

    // ---------- B. Devis avec jalons ----------
    const multi = await freshDeal(a, b, 'devis jalons', [
        { title: 'Acompte', description: 'Phase 1', amount: 60, percentage: 59.7 },
        { title: 'Solde', description: 'Phase 2', amount: 40.5, percentage: 40.3 }
    ]);
    const { data: multiQuote } = await admin.from('quotes').select('total_amount,status').eq('id', multi.quoteId).single();
    let multiMs = await milestonesOf(admin, multi.quoteId);
    const sumCents = multiMs.reduce((s, m) => s + Math.round(Number(m.amount) * 100), 0);
    record('B. somme des jalons = total du devis (invariant 6)', sumCents === Math.round(Number(multiQuote.total_amount) * 100) && sumCents === 10050, sumCents + ' / ' + multiQuote.total_amount);
    const acceptMulti = await a.client.rpc('accept_request_quote', { p_quote_id: multi.quoteId, p_expected_version: multi.version });
    record('B. devis à jalons accepté', !acceptMulti.error, acceptMulti.error && acceptMulti.error.message);
    const reviseAfter = await b.client.rpc('revise_sent_quote', {
        p_quote_id: multi.quoteId, p_description: 'tentative', p_valid_until: null,
        p_milestones_json: [{ title: 'Acompte', amount: 1, display_order: 1 }], p_expected_version: multi.version
    });
    record('B. devis accepté non modifiable (invariant 5)', !!reviseAfter.error, reviseAfter.error && reviseAfter.error.code);
    multiMs = await milestonesOf(admin, multi.quoteId);
    record('B. montants des jalons inchangés après tentative', multiMs.map((m) => Number(m.amount)).join('+') === '60+40.5', multiMs.map((m) => m.amount).join('+'));

    const first = await api(a.token, '/v1/payments/create-milestone-intent', { milestone_id: multiMs[0].id });
    record('B. jalon 1 : paiement préparé', first.status === 200, first.status + ' ' + (first.payload.code || ''));
    if (first.status !== 200) return finish();
    record('B. jalon 1 : frais 3 % (60,00 € → 1,80 €)', first.payload.amounts.customer_fee_cents === 180 && first.payload.amounts.provider_fee_cents === 180 && first.payload.amounts.provider_net_cents === 5820 && first.payload.amounts.lyann_revenue_cents === 360, JSON.stringify(first.payload.amounts));
    const threeDs = await confirm(stripe, first.payload.payment_intent_id, 'pm_card_authenticationRequired');
    record('B. 3DS requis : pas de FUNDED', threeDs.status === 'requires_action', threeDs.status || threeDs.code);
    await sleep(3000);
    record('B. 3DS abandonné : jalon PENDING', (await milestonesOf(admin, multi.quoteId))[0].status === 'PENDING');
    const resume = await api(a.token, '/v1/payments/create-milestone-intent', { milestone_id: multiMs[0].id });
    record('B. reprise après 3DS abandonné : même PaymentIntent', resume.status === 200 && resume.payload.payment_intent_id === first.payload.payment_intent_id, resume.status + ' ' + (resume.payload.code || ''));
    const afterThreeDs = await confirm(stripe, first.payload.payment_intent_id, 'pm_card_visa');
    record('B. paiement finalisé avec une autre carte', afterThreeDs.status === 'succeeded', afterThreeDs.status || afterThreeDs.code);
    if (HOOK && afterThreeDs.status === 'succeeded') await postEvent(stripe, 'payment_intent.succeeded', afterThreeDs);
    const ms1Funded = await waitFor(() => milestonesOf(admin, multi.quoteId), (list) => list[0].status === 'FUNDED', 45000);
    record('B. jalon 1 FUNDED, jalon 2 toujours PENDING', ms1Funded.ok && ms1Funded.value[1].status === 'PENDING', ms1Funded.value && ms1Funded.value.map((m) => m.status).join('+'));

    // Wrong amount on a real intent: the webhook must refuse and change nothing.
    const second = await api(a.token, '/v1/payments/create-milestone-intent', { milestone_id: multiMs[1].id });
    record('B. jalon 2 : paiement préparé (40,50 € → 1,49 € plancher)', second.status === 200 && second.payload.amounts.customer_total_cents === 4199, second.status + ' ' + JSON.stringify(second.payload.amounts || {}));
    if (HOOK && second.status === 200) {
        const realIntent = await stripe.paymentIntents.retrieve(second.payload.payment_intent_id);
        const forged = await postEvent(stripe, 'payment_intent.succeeded', { ...realIntent, status: 'succeeded', amount: realIntent.amount - 100 });
        const after = await paymentRows(admin, multiMs[1].id);
        record('B. succeeded avec montant différent refusé (AMOUNT_MISMATCH)', forged.status === 500 && after[0].payment_status !== 'SUCCEEDED' && (await milestonesOf(admin, multi.quoteId))[1].status === 'PENDING', forged.status + ' ' + after.map((r) => r.payment_status).join('+'));
    }

    // Release milestone 1: provider declares done, requester validates twice at once.
    const done = await api(b.token, '/v1/milestones/start-work', { milestone_id: multiMs[0].id });
    const completion = await api(b.token, '/v1/milestones/submit-completion', { milestone_id: multiMs[0].id });
    record('B. le Lyanneur déclare la prestation terminée', completion.status === 200, done.status + '/' + completion.status + ' ' + (completion.payload.code || completion.payload.error || ''));
    const strangerRelease = await api(c.token, '/v1/milestones/release-payment', { milestone_id: multiMs[0].id });
    const providerRelease = await api(b.token, '/v1/milestones/release-payment', { milestone_id: multiMs[0].id });
    record('B. seul le demandeur peut libérer', strangerRelease.status === 403 && providerRelease.status === 403, strangerRelease.status + '/' + providerRelease.status);
    const releases = await Promise.all([1, 2].map(() => api(a.token, '/v1/milestones/release-payment', { milestone_id: multiMs[0].id })));
    const releaseStates = releases.map((r) => r.status + ':' + (r.payload.status || r.payload.code || ''));
    const rowsReleased = await paymentRows(admin, multiMs[0].id);
    const transferId = rowsReleased[0] && rowsReleased[0].stripe_transfer_id;
    let transferCount = 0;
    if (transferId) {
        const transfer = await stripe.transfers.retrieve(transferId);
        const list = await stripe.transfers.list({ destination: transfer.destination, limit: 100 });
        transferCount = list.data.filter((t) => t.metadata && t.metadata.milestone_id === multiMs[0].id).length;
        record('B. versement = net Lyanneur (58,20 €)', transfer.amount === 5820 && transfer.livemode === false, transfer.amount);
    }
    record('B. double validation : un seul transfert', transferId ? transferCount === 1 : false, releaseStates.join(' | ') + ' transfers=' + transferCount);
    const ms1 = (await milestonesOf(admin, multi.quoteId))[0];
    record('B. jalon 1 RELEASED après transfert', ms1.status === 'RELEASED', ms1.status);

    // Dispute: Stripe test card that always opens a dispute after the charge.
    const disputeDeal = await freshDeal(a, b, 'litige', [{ title: 'Peinture', description: 'Tarif direct', amount: 30, percentage: 100 }]);
    await a.client.rpc('accept_request_quote', { p_quote_id: disputeDeal.quoteId, p_expected_version: disputeDeal.version });
    const [disputeMs] = await milestonesOf(admin, disputeDeal.quoteId);
    const disputeIntent = await api(a.token, '/v1/payments/create-milestone-intent', { milestone_id: disputeMs.id });
    if (disputeIntent.status === 200) {
        const disputed = await confirm(stripe, disputeIntent.payload.payment_intent_id, 'pm_card_createDispute');
        if (HOOK && disputed.status === 'succeeded') await postEvent(stripe, 'payment_intent.succeeded', disputed);
        // The real Stripe dispute can reach Staging before this check: DISPUTED is also a funded state.
        const fundedDispute = await waitFor(() => paymentRows(admin, disputeMs.id), (list) => list[0] && ['SUCCEEDED', 'DISPUTED'].includes(list[0].payment_status), 45000);
        record('C. paiement litigieux encaissé une seule fois', fundedDispute.ok && fundedDispute.value.length === 1, fundedDispute.value && fundedDispute.value.map((r) => r.payment_status).join('+'));
        const disputeObj = await waitFor(async () => (await stripe.disputes.list({ payment_intent: disputeIntent.payload.payment_intent_id, limit: 1 })).data[0], (d) => !!d, 60000);
        if (HOOK && disputeObj.ok) {
            const hook = await postEvent(stripe, 'charge.dispute.created', disputeObj.value);
            record('C. webhook charge.dispute.created répond 200 (plus de ReferenceError)', hook.status === 200, hook.status);
            const replay = await postEvent(stripe, 'charge.dispute.created', disputeObj.value, hook.id);
            record('C. litige rejoué : doublon', replay.status === 200 && replay.body.duplicate === true, JSON.stringify(replay.body));
        }
        // Whatever the webhook order, a contested charge must never reach the Lyanneur.
        await api(b.token, '/v1/milestones/submit-completion', { milestone_id: disputeMs.id });
        const disputedRelease = await api(a.token, '/v1/milestones/release-payment', { milestone_id: disputeMs.id });
        const disputedTransfers = (await stripe.transfers.list({ limit: 100 })).data.filter((t) => t.metadata && t.metadata.milestone_id === disputeMs.id);
        record('C. aucun versement sur un paiement contesté', disputedRelease.status !== 200 && disputedTransfers.length === 0, disputedRelease.status + ':' + (disputedRelease.payload.code || '') + ' transfers=' + disputedTransfers.length);
        // Without local replays, Stripe re-sends a dispute that arrived before the payment was settled.
        const frozen = await waitFor(async () => ({ rows: await paymentRows(admin, disputeMs.id), ms: (await milestonesOf(admin, disputeDeal.quoteId))[0] }),
            (v) => v.rows[0] && v.rows[0].payment_status === 'DISPUTED' && v.ms.status === 'DISPUTED', HOOK ? 90000 : 900000);
        record('C. litige Stripe → paiement et jalon DISPUTED, aucun remboursement auto', frozen.ok && !frozen.value.rows[0].stripe_transfer_id, frozen.value && (frozen.value.rows[0] || {}).payment_status + '/' + (frozen.value.ms || {}).status);
        const { data: hookRows } = await admin.from('stripe_webhook_events').select('event_type,status').eq('event_type', 'charge.dispute.created');
        record('C. événement litige enregistré traité (pas de boucle 500)', (hookRows || []).some((r) => r.status === 'processed'), (hookRows || []).map((r) => r.status).join(','));
    } else {
        record('C. litige : paiement préparé', false, disputeIntent.status + ' ' + (disputeIntent.payload.code || ''));
    }

    // ---------- E. Annulation (migration 87) ----------
    // Without migration 87 the RPC would really cancel the paid QA mission: only run once it is applied.
    if (process.env.LYANN_FINANCE_EXPECT_M87 === '1') {
        const { data: directQuote } = await admin.from('quotes').select('mission_id').eq('id', direct.quoteId).single();
        const paidCancel = await a.client.rpc('cancel_mission_secure', { p_mission_id: directQuote.mission_id, p_reason: RUN + ' annulation après paiement' });
        const helperCancel = await b.client.rpc('cancel_mission_secure', { p_mission_id: directQuote.mission_id, p_reason: RUN + ' annulation après paiement' });
        const { data: paidMission } = await admin.from('missions').select('status').eq('id', directQuote.mission_id).single();
        record('E. mission payée : annulation refusée, orientation Aide LYANN', !!paidCancel.error && /Aide LYANN/.test(paidCancel.error.message) && !!helperCancel.error && paidMission.status === 'AGREED', paidMission.status);
        const unpaid = await freshDeal(a, b, 'annulation avant paiement', [{ title: 'Taille', description: 'Sans paiement', amount: 20, percentage: 100 }]);
        await a.client.rpc('accept_request_quote', { p_quote_id: unpaid.quoteId, p_expected_version: unpaid.version });
        const { data: unpaidQuote } = await admin.from('quotes').select('mission_id').eq('id', unpaid.quoteId).single();
        const unpaidCancel = await a.client.rpc('cancel_mission_secure', { p_mission_id: unpaidQuote.mission_id, p_reason: RUN + ' annulation avant paiement' });
        record('E. mission non payée : annulation possible', !unpaidCancel.error, unpaidCancel.error && unpaidCancel.error.message);
    } else {
        console.log('NON TESTÉ E. annulation : migration 87 non appliquée (LYANN_FINANCE_EXPECT_M87=1 après application)');
    }

    // ---------- Finances ----------
    const { data: aPayments } = await a.client.from('payments').select('id, created_at, requester_id, provider_id, payment_status, transfer_status, stripe_transfer_id, service_amount_cents, customer_fee_cents, customer_total_cents, provider_fee_cents, provider_net_cents').or('requester_id.eq.' + a.user.id + ',provider_id.eq.' + a.user.id);
    const { data: bPayments } = await b.client.from('payments').select('id, created_at, requester_id, provider_id, payment_status, transfer_status, stripe_transfer_id, service_amount_cents, customer_fee_cents, customer_total_cents, provider_fee_cents, provider_net_cents').or('requester_id.eq.' + b.user.id + ',provider_id.eq.' + b.user.id);
    const aLines = financeUi.ledgerLines(a.user.id, aPayments || []);
    const bLines = financeUi.ledgerLines(b.user.id, bPayments || []);
    const ids = new Set(aLines.map((l) => l.id));
    record('D. Finances demandeur : pas de doublon', ids.size === aLines.length, aLines.length + ' lignes');
    record('D. Finances : aucune ligne pour une tentative échouée', aLines.every((l) => l.label !== 'Paiement échoué') && bLines.every((l) => !/échou/.test(l.label)));
    const runIds = new Set([...(await paymentRows(admin, directMs.id)), ...(await paymentRows(admin, multiMs[0].id)), ...(await paymentRows(admin, disputeMs.id))].map((r) => r.id));
    const aRun = aLines.filter((l) => runIds.has(l.id));
    const bRun = bLines.filter((l) => runIds.has(l.id));
    record('D. demandeur : dépenses = total payé frais inclus', aRun.every((l) => l.kind === 'expense') && aRun.filter((l) => l.label === 'Paiement sécurisé').reduce((s, l) => s + l.cents, 0) === 2649 + 6180, aRun.map((l) => l.cents + ':' + l.label).join(' | '));
    record('D. Lyanneur : gains nets après commission', bRun.every((l) => l.kind === 'gain') && bRun.some((l) => l.cents === 5820 && /Transfert Stripe créé/.test(l.label)), bRun.map((l) => l.cents + ':' + l.label).join(' | '));

    return finish();
}

function finish() {
    const failed = results.filter((item) => !item.ok);
    console.log(JSON.stringify({ run: RUN, passed: results.length - failed.length, failed: failed.length, api: API.replace(/^https?:\/\//, ''), hook: HOOK ? HOOK.replace(/^https?:\/\//, '') : 'none', target: 'tdktfbtqceldlaeqjtow', stripe: 'test' }));
    if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
    console.error('SCENARIO FAIL', error.message);
    finish();
    process.exit(1);
});
