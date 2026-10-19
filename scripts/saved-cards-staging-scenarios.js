/**
 * Stripe test scenarios for optional saved cards.
 * Staging Supabase tdktfbtqceldlaeqjtow only. Stripe test keys only.
 * Does not target production and does not use Stripe live.
 */
'use strict';

const { createClient } = require('@supabase/supabase-js');
const { assertStagingIsolation } = require('./staging-v2-guard');

require('./force-staging-v2-env');

const BASE = process.env.LYANN_SCENARIO_BASE || process.env.LYANN_E2E_BASE_URL || 'http://127.0.0.1:8098';
const results = [];

function record(name, ok, detail) {
    results.push({ name, ok: !!ok, detail: detail || '' });
    console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
}

function gate() {
    assertStagingIsolation(process.env);
    if (!String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_')) {
        throw new Error('Stripe test secret required');
    }
}

async function signIn(email, password) {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error('sign-in failed: ' + (error && error.message));
    return { client, token: data.session.access_token, user: data.user };
}

async function api(token, method, path, body) {
    const response = await fetch(BASE + path, {
        method,
        headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.status, payload };
}

async function freshMilestone(a, b, label) {
    const { data: requestRow, error: reqErr } = await a.client.from('requests').insert({
        requester_id: a.user.id,
        visibility: 'PUBLIC',
        title: 'QA cartes ' + label,
        description: 'Parcours Stripe test, sans paiement réel.',
        category: 'Jardinage',
        location: 'Le Gosier',
        urgency: 'Normale',
        status: 'OPEN',
        price_mode: 'QUOTE',
        date_mode: 'FLEXIBLE'
    }).select('id').single();
    if (reqErr) throw new Error('request: ' + reqErr.message);
    const invite = await a.client.rpc('send_request_invitations', {
        p_request_id: requestRow.id,
        p_recipient_ids: [b.user.id]
    });
    if (invite.error) throw new Error('invite: ' + invite.error.message);
    let invitationId = invite.data && (invite.data.invitation_id || invite.data.id);
    if (!invitationId && invite.data && Array.isArray(invite.data.invitations)) {
        invitationId = invite.data.invitations[0] && invite.data.invitations[0].id;
    }
    if (!invitationId) {
        const lookup = await a.client.from('request_invitations').select('id').eq('request_id', requestRow.id).eq('recipient_id', b.user.id).limit(1);
        invitationId = lookup.data && lookup.data[0] && lookup.data[0].id;
    }
    if (!invitationId) throw new Error('invitation missing');
    const accepted = await b.client.rpc('accept_request_invitation', { p_invitation_id: invitationId });
    if (accepted.error && !/already|déjà|accepted/i.test(accepted.error.message || '')) {
        throw new Error('accept invite: ' + accepted.error.message);
    }
    const quote = await b.client.rpc('create_request_quote', {
        p_invitation_id: invitationId,
        p_description: 'Devis test cartes',
        p_valid_until: null,
        p_milestones_json: [{ title: label, amount: 40, display_order: 1 }]
    });
    if (quote.error) throw new Error('quote: ' + quote.error.message);
    const quoteId = quote.data && (quote.data.quote_id || quote.data.id);
    if (!quoteId) throw new Error('quote id missing');
    let acceptedQuote = await a.client.rpc('accept_request_quote', { p_quote_id: quoteId, p_expected_version: 1 });
    if (acceptedQuote.error) {
        acceptedQuote = await a.client.rpc('accept_request_quote', { p_quote_id: quoteId });
    }
    if (acceptedQuote.error) throw new Error('accept quote: ' + acceptedQuote.error.message);
    const milestones = await a.client.from('milestones').select('id,status,amount').eq('quote_id', quoteId);
    if (milestones.error || !milestones.data || !milestones.data[0]) throw new Error('milestone missing');
    return milestones.data[0].id;
}

async function postWebhook(stripe, paymentIntent) {
    const event = {
        id: 'evt_savedcards_' + Date.now() + '_' + Math.random().toString(16).slice(2, 8),
        object: 'event',
        type: 'payment_intent.succeeded',
        data: { object: paymentIntent }
    };
    const payload = JSON.stringify(event);
    const header = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: process.env.STRIPE_WEBHOOK_SECRET
    });
    const response = await fetch(BASE + '/v1/payments/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'stripe-signature': header },
        body: payload
    });
    const text = await response.text();
    if (!response.ok) throw new Error('webhook ' + response.status + ' ' + text.slice(0, 180));
}

async function main() {
    gate();
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const a = await signIn(process.env.LYANN_E2E_QA_A_EMAIL, process.env.LYANN_E2E_QA_A_PASSWORD);
    const b = await signIn(process.env.LYANN_E2E_QA_B_EMAIL, process.env.LYANN_E2E_QA_B_PASSWORD);
    const c = await signIn(process.env.LYANN_E2E_QA_C_EMAIL, process.env.LYANN_E2E_QA_C_PASSWORD);
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
    });

    const health = await fetch(BASE + '/v1/payments/config');
    const config = await health.json().catch(() => ({}));
    record('env stripe test + staging config', health.ok && config.stripe_mode === 'test' && String(config.publishableKey || '').startsWith('pk_test_'), 'mode=' + (config.stripe_mode || health.status));

    async function pay(label, options) {
        const milestoneId = await freshMilestone(a, b, label);
        const first = await api(a.token, 'POST', '/v1/payments/create-milestone-intent', { milestone_id: milestoneId });
        const second = await api(a.token, 'POST', '/v1/payments/create-milestone-intent', { milestone_id: milestoneId });
        if (!first.payload.payment_intent_id) {
            throw new Error('intent ' + first.status + ' ' + (first.payload.error || first.payload.code || ''));
        }
        return { milestoneId, first, second };
    }

    let opened;
    try {
        opened = await pay('sans-enregistrement');
    } catch (error) {
        record('paiement classique sans enregistrement', false, error.message);
        console.log(JSON.stringify(results, null, 2));
        process.exit(1);
    }
    record('double appel create-milestone-intent', opened.first.payload.payment_intent_id === opened.second.payload.payment_intent_id, 'same intent');
    const intentId = opened.first.payload.payment_intent_id;
    const amount = opened.first.payload.amounts && opened.first.payload.amounts.customer_total_cents;

    const sessionOff = await api(a.token, 'POST', '/v1/payments/customer-session', {
        payment_intent_id: intentId,
        save_card: false
    });
    record('session client sans consentement', sessionOff.status === 200 && sessionOff.payload.save_available === true, 'status=' + sessionOff.status);
    let intent = await stripe.paymentIntents.retrieve(intentId);
    record('case décochée ne pose pas setup_future_usage', !intent.setup_future_usage, String(intent.setup_future_usage || 'absent'));
    record('montant du PaymentIntent inchangé', intent.amount === amount && intent.livemode === false, 'cents=' + intent.amount);

    const classic = await stripe.paymentIntents.confirm(intentId, {
        payment_method: 'pm_card_visa',
        return_url: BASE + '/index.html'
    });
    record('confirmation Stripe test sans live', classic.status === 'succeeded' && classic.livemode === false, classic.status);
    const again = await stripe.paymentIntents.confirm(intentId, {
        payment_method: 'pm_card_visa',
        return_url: BASE + '/index.html'
    }).then((value) => value).catch((error) => error);
    const againStatus = again.status || (again.payment_intent && again.payment_intent.status) || again.code;
    record('second confirm ne crée pas un second débit', classic.id === (again.id || (again.payment_intent && again.payment_intent.id) || intentId) && (againStatus === 'succeeded' || again.code === 'payment_intent_unexpected_state'), String(againStatus));
    await postWebhook(stripe, classic);
    const funded = await admin.from('milestones').select('status').eq('id', opened.milestoneId).single();
    const payment = await admin.from('payments').select('payment_status, customer_total_cents').eq('stripe_payment_intent_id', intentId).single();
    record('webhook passe le jalon à FUNDED', funded.data && funded.data.status === 'FUNDED', funded.data && funded.data.status);
    record('webhook passe le paiement à SUCCEEDED sans changer le montant', payment.data && payment.data.payment_status === 'SUCCEEDED' && payment.data.customer_total_cents === amount, payment.data && payment.data.payment_status);

    const beforeCards = await api(a.token, 'GET', '/v1/payments/saved-cards');
    const beforeCount = Array.isArray(beforeCards.payload.cards) ? beforeCards.payload.cards.length : -1;
    record('paiement sans case n’ajoute pas de carte', beforeCount === 0, 'count=' + beforeCount);

    const savedOpen = await pay('avec-enregistrement');
    const saveSession = await api(a.token, 'POST', '/v1/payments/customer-session', {
        payment_intent_id: savedOpen.first.payload.payment_intent_id,
        save_card: true
    });
    const savedIntent = await stripe.paymentIntents.retrieve(savedOpen.first.payload.payment_intent_id);
    record('case cochée active on_session', saveSession.status === 200 && savedIntent.setup_future_usage === 'on_session' && savedIntent.metadata.lyann_save_card === '1', savedIntent.setup_future_usage || saveSession.status);
    const savedConfirm = await stripe.paymentIntents.confirm(savedIntent.id, {
        payment_method: 'pm_card_visa',
        return_url: BASE + '/index.html'
    });
    await postWebhook(stripe, savedConfirm);
    const savedList = await api(a.token, 'GET', '/v1/payments/saved-cards');
    const savedCard = (savedList.payload.cards || [])[0];
    record('carte enregistrée visible (marque, 4 chiffres)', !!savedCard && !!savedCard.last4 && !!savedCard.brand && !JSON.stringify(savedCard).includes('cvc'), savedCard ? savedCard.brand + ' ' + savedCard.last4 : 'absente');
    const method = savedCard ? await stripe.paymentMethods.retrieve(savedCard.id) : null;
    record('Stripe conserve allow_redisplay always', method && method.allow_redisplay === 'always' && method.customer === savedIntent.customer, method && method.allow_redisplay);

    const reuse = await pay('reutilisation');
    const reuseSession = await api(a.token, 'POST', '/v1/payments/customer-session', {
        payment_intent_id: reuse.first.payload.payment_intent_id,
        save_card: false
    });
    const offered = (reuseSession.payload.cards || []).some((card) => card.id === savedCard.id);
    record('paiement suivant propose la carte enregistrée', offered, 'offertes=' + ((reuseSession.payload.cards || []).length));
    const reuseIntentBefore = await stripe.paymentIntents.retrieve(reuse.first.payload.payment_intent_id);
    record('réutilisation ne passe pas hors session', !reuseIntentBefore.setup_future_usage, String(reuseIntentBefore.setup_future_usage || 'absent'));
    const reuseConfirm = await stripe.paymentIntents.confirm(reuseIntentBefore.id, {
        payment_method: savedCard.id,
        return_url: BASE + '/index.html'
    });
    record('réutilisation confirmée par action explicite', reuseConfirm.status === 'succeeded' && reuseConfirm.livemode === false, reuseConfirm.status);
    await postWebhook(stripe, reuseConfirm);
    const reuseMilestone = await admin.from('milestones').select('status').eq('id', reuse.milestoneId).single();
    record('webhook du second paiement', reuseMilestone.data && reuseMilestone.data.status === 'FUNDED', reuseMilestone.data && reuseMilestone.data.status);

    const outsider = await api(c.token, 'GET', '/v1/payments/saved-cards');
    const outsiderDelete = await api(c.token, 'DELETE', '/v1/payments/saved-cards/' + savedCard.id);
    record('un autre membre ne voit pas la carte', outsider.status === 200 && (outsider.payload.cards || []).length === 0, 'count=' + ((outsider.payload.cards || []).length));
    record('un autre membre ne peut pas supprimer la carte', outsiderDelete.status === 404, 'status=' + outsiderDelete.status);

    const removed = await api(a.token, 'DELETE', '/v1/payments/saved-cards/' + savedCard.id);
    const afterDelete = await api(a.token, 'GET', '/v1/payments/saved-cards');
    const detached = await stripe.paymentMethods.retrieve(savedCard.id);
    record('suppression détache la carte Stripe', removed.status === 200 && (afterDelete.payload.cards || []).length === 0 && !detached.customer, 'status=' + removed.status);

    const declinedOpen = await pay('refus');
    await api(a.token, 'POST', '/v1/payments/customer-session', {
        payment_intent_id: declinedOpen.first.payload.payment_intent_id,
        save_card: false
    });
    let declinedStatus = '';
    try {
        const declined = await stripe.paymentIntents.confirm(declinedOpen.first.payload.payment_intent_id, {
            payment_method: 'pm_card_chargeDeclined',
            return_url: BASE + '/index.html'
        });
        declinedStatus = declined.status;
    } catch (error) {
        declinedStatus = error.code || error.message;
    }
    const declinedMilestone = await admin.from('milestones').select('status').eq('id', declinedOpen.milestoneId).single();
    record('carte refusée ne sécurise pas le jalon', declinedStatus !== 'succeeded' && declinedMilestone.data && declinedMilestone.data.status === 'PENDING', declinedStatus);

    const secureOpen = await pay('3ds');
    let secureStatus = '';
    try {
        const secure = await stripe.paymentIntents.confirm(secureOpen.first.payload.payment_intent_id, {
            payment_method: 'pm_card_authenticationRequired',
            return_url: BASE + '/index.html'
        });
        secureStatus = secure.status;
    } catch (error) {
        secureStatus = error.code || 'error';
    }
    const secureMilestone = await admin.from('milestones').select('status').eq('id', secureOpen.milestoneId).single();
    record('3DS reste en attente et ne marque pas FUNDED', secureStatus === 'requires_action' && secureMilestone.data && secureMilestone.data.status === 'PENDING', secureStatus);

    const toggle = await pay('fermeture');
    await api(a.token, 'POST', '/v1/payments/customer-session', {
        payment_intent_id: toggle.first.payload.payment_intent_id,
        save_card: true
    });
    const toggledOn = await stripe.paymentIntents.retrieve(toggle.first.payload.payment_intent_id);
    await api(a.token, 'POST', '/v1/payments/customer-session', {
        payment_intent_id: toggle.first.payload.payment_intent_id,
        save_card: false
    });
    const toggledOff = await stripe.paymentIntents.retrieve(toggle.first.payload.payment_intent_id);
    record('fermeture puis réouverture retire le consentement', toggledOn.setup_future_usage === 'on_session' && !toggledOff.setup_future_usage, 'after=' + (toggledOff.setup_future_usage || 'absent'));

    const failed = results.filter((item) => !item.ok);
    console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, target: 'tdktfbtqceldlaeqjtow', stripe: 'test' }));
    if (failed.length) process.exit(1);
}

main().catch((error) => {
    console.error('SCENARIO FAIL', error.message);
    process.exit(1);
});
