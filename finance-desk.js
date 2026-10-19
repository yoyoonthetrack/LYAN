'use strict';

(function (root) {
    const policy = root.LYANN_FINANCE_POLICY_UI || {};
    const cents = policy.cents || function (n) { return String(n); };

    const DEMO_NOTICE = 'Démonstration — données fictives. Aucune écriture Supabase, aucun appel Stripe, aucune notification réelle.';

    const CASES = {
        funded_not_started: fixture('funded_not_started', 'FUNDED', 'SUCCEEDED', 'PENDING_VALIDATION', null, null),
        work_started: fixture('work_started', 'IN_PROGRESS', 'SUCCEEDED', 'PENDING_VALIDATION', null, null),
        work_done: fixture('work_done', 'COMPLETED', 'SUCCEEDED', 'PENDING_VALIDATION', null, null),
        disputed: fixture('disputed', 'DISPUTED', 'DISPUTED', 'PENDING_VALIDATION', null, null),
        refunded: fixture('refunded', 'CANCELLED', 'REFUNDED', 'PENDING_VALIDATION', null, 're_demo_4349'),
        transferred: fixture('transferred', 'RELEASED', 'SUCCEEDED', 'TRANSFERRED', 'tr_demo_keep', null)
    };

    function fixture(id, milestoneStatus, paymentStatus, transferStatus, transferId, refundId) {
        return {
            demo: true,
            roleAllowed: ['client', 'provider', 'admin'],
            mission: { id: 'demo-mission-' + id, status: 'AGREED', title: 'Aide jardinage — démonstration' },
            milestone: { id: 'demo-ms-' + id, status: milestoneStatus, title: 'Jalon 42 €' },
            payment: {
                id: 'demo-pay-' + id,
                payment_status: paymentStatus,
                transfer_status: transferStatus,
                stripe_transfer_id: transferId,
                stripe_refund_id: refundId,
                stripe_payment_intent_id: refundId || transferId ? 'pi_demo' : 'pi_demo_open',
                client_validated_at: milestoneStatus === 'RELEASED' ? '2026-10-14T10:00:00.000Z' : null,
                customer_total_cents: 4349,
                service_amount_cents: 4200,
                customer_fee_cents: 149,
                provider_net_cents: 4074
            },
            requester: { id: 'demo-A', name: 'Client QA' },
            provider: { id: 'demo-B', name: 'Lyanneur QA' },
            events: [
                { at: 'Paiement reçu', detail: '4349 cents conservés par Stripe.' },
                { at: 'Jalon ' + milestoneStatus, detail: 'État technique, pas un droit contractuel automatique.' }
            ],
            cancellation: { requested: id === 'work_started', accepted: false },
            refundRequest: { status: id === 'refunded' ? 'CONFIRMED' : (id === 'work_started' ? 'OPEN' : null), amount_cents: 4349 },
            dispute: id === 'disputed' ? { status: 'OPEN', reason: 'Prestation non conforme (démonstration).', replies: [{ by: 'Lyanneur', text: 'Je prépare une réponse.' }] } : null
        };
    }

    let state = {
        role: 'client',
        screen: 'payment',
        caseId: 'funded_not_started',
        filter: 'all',
        syncHash: true,
        lab: false
    };

    function currentCase() {
        return CASES[state.caseId] || CASES.funded_not_started;
    }

    function classified() {
        const row = currentCase();
        return policy.classifyFinanceDisplay(row);
    }

    function applyHash() {
        const loc = root.location;
        if (!loc || !loc.hash) return;
        const m = String(loc.hash).match(/#\/?finance\/(client|provider|admin|guest|third)\/([a-z0-9_]+)\/([a-z-]+)/i);
        if (!m) return;
        state.role = m[1];
        if (CASES[m[2]]) state.caseId = m[2];
        state.screen = m[3];
    }

    function writeHash() {
        if (!state.syncHash) return;
        const loc = root.location;
        if (!loc || typeof loc.replace !== 'function') return;
        const next = '#/finance/' + state.role + '/' + state.caseId + '/' + state.screen;
        if (loc.hash !== next) loc.replace(next);
    }

    function blockedAction(label) {
        const text = DEMO_NOTICE + ' Action « ' + label + ' » non exécutée.';
        if (typeof root.showLyanToast === 'function') root.showLyanToast(text, 'ℹ️');
        const toast = document.getElementById('portalToastText');
        const box = document.getElementById('portalToast');
        if (toast && box) {
            toast.textContent = text;
            box.classList.add('active');
            setTimeout(() => box.classList.remove('active'), 4200);
        }
        const live = document.getElementById('financeDeskLive');
        if (live) live.textContent = text;
        return { ok: false, demo: true, executed: false, stripe: false, supabase: false };
    }

    function navBtn(screen, label) {
        return '<button type="button" class="' + (state.screen === screen ? 'is-on' : '') + '" data-finance-screen="' + screen + '">' + label + '</button>';
    }

    function renderPayment() {
        const row = currentCase();
        const cls = classified();
        const stripeRefund = row.payment.stripe_refund_id
            ? ('Confirmation Stripe affichée car un identifiant existe : ' + row.payment.stripe_refund_id)
            : 'Aucune confirmation Stripe à afficher.';
        const transferNote = row.payment.stripe_transfer_id
            ? 'Un Transfer Stripe est enregistré (' + row.payment.stripe_transfer_id + '). Cela ne signifie pas qu’un virement bancaire a été reçu.'
            : 'Aucun Transfer Stripe.';
        return (
            '<article class="finance-card">' +
            '<p class="finance-status">' + cls.title + '</p>' +
            '<h2 style="margin:10px 0 6px;">Détail du paiement</h2>' +
            '<p class="finance-muted">' + row.mission.title + ' · ' + row.milestone.title + '</p>' +
            '<div class="finance-kpis">' +
            '<div class="finance-kpi"><span>Prestation</span><strong>' + cents(row.payment.service_amount_cents) + '</strong></div>' +
            '<div class="finance-kpi"><span>Protection</span><strong>' + cents(row.payment.customer_fee_cents) + '</strong></div>' +
            '<div class="finance-kpi"><span>Total payé</span><strong>' + cents(row.payment.customer_total_cents) + '</strong></div>' +
            '</div>' +
            '<p><strong>Fonds :</strong> ' + cls.funds + '</p>' +
            '<p><strong>Prestation :</strong> ' + row.milestone.status + '</p>' +
            '<p class="finance-muted">' + (policy.policyCopy(cls.code) || '') + (cls.note ? ' ' + cls.note : '') + '</p>' +
            '<p class="finance-muted">' + transferNote + '</p>' +
            '<p class="finance-muted">' + stripeRefund + '</p>' +
            '<h3>Historique</h3><ul class="finance-timeline">' +
            row.events.map(function (ev) { return '<li><strong>' + ev.at + '</strong><div class="finance-muted">' + ev.detail + '</div></li>'; }).join('') +
            '</ul></article>'
        );
    }

    function renderCancel() {
        const row = currentCase();
        const cls = classified();
        const asked = row.cancellation.requested ? 'Annulation demandée' : 'Aucune demande en cours';
        const accepted = row.cancellation.accepted ? 'acceptée' : 'pas encore acceptée';
        return (
            '<article class="finance-card"><h2>Annulation</h2>' +
            '<p>' + asked + ' — ' + accepted + '.</p>' +
            '<p class="finance-muted">' + (policy.policyCopy(cls.code) || '') + '</p>' +
            '<p>Remboursement automatique affiché comme possible : <strong>' + (cls.autoRefund ? 'oui, sous conditions' : 'non') + '</strong>.</p>' +
            '<div class="finance-actions"><button type="button" class="btn btn-primary" data-finance-act="cancel">Demander une annulation</button></div></article>'
        );
    }

    function renderRefund() {
        const row = currentCase();
        const cls = classified();
        const req = row.refundRequest.status || 'aucune';
        const stripe = row.payment.stripe_refund_id
            ? ('Remboursement Stripe : ' + row.payment.stripe_refund_id)
            : 'Pas de confirmation Stripe (l’exécution financière est désactivée).';
        return (
            '<article class="finance-card"><h2>Remboursement</h2>' +
            '<p>Montant demandé : <strong>' + cents(row.refundRequest.amount_cents) + '</strong></p>' +
            '<p>État : <strong>' + req + '</strong></p>' +
            '<p class="finance-muted">' + (policy.policyCopy(cls.code) || '') + '</p>' +
            '<p class="finance-muted">' + stripe + '</p>' +
            '<div class="finance-actions"><button type="button" class="btn btn-primary" data-finance-act="refund">Demander un remboursement</button></div></article>'
        );
    }

    function renderDispute() {
        const row = currentCase();
        const d = row.dispute;
        return (
            '<article class="finance-card"><h2>Litige</h2>' +
            (d
                ? ('<p>État : <strong>' + d.status + '</strong></p><p>' + d.reason + '</p><p class="finance-muted">Réponses : ' + d.replies.map(function (r) { return r.by + ' — ' + r.text; }).join(' · ') + '</p>')
                : '<p class="finance-muted">Aucun litige ouvert sur ce dossier de démonstration.</p>') +
            '<div class="finance-field"><label for="financeDisputeText">Décrire le problème</label><textarea id="financeDisputeText" rows="4" maxlength="600" placeholder="Décrivez uniquement les faits."></textarea></div>' +
            '<div class="finance-field"><label for="financeDisputeFile">Justificatif (démonstration locale, non envoyé)</label><input id="financeDisputeFile" type="file" accept="image/jpeg,image/png,application/pdf"></div>' +
            '<div class="finance-actions"><button type="button" class="btn btn-primary" data-finance-act="dispute">Signaler un problème</button></div></article>'
        );
    }

    function renderProvider() {
        const row = currentCase();
        const cls = classified();
        return (
            '<article class="finance-card"><h2>Vue Lyanneur</h2>' +
            '<p>Fonds : ' + cls.funds + '</p>' +
            '<p>Prestation : ' + row.milestone.status + '</p>' +
            '<p>Demande d’annulation reçue : <strong>' + (row.cancellation.requested ? 'oui' : 'non') + '</strong></p>' +
            '<p>Demande de remboursement : <strong>' + (row.refundRequest.status || 'aucune') + '</strong></p>' +
            '<p class="finance-muted">Ne jamais considérer un Transfer Stripe comme un virement reçu.</p>' +
            '<div class="finance-actions">' +
            '<button type="button" class="btn btn-outline" data-finance-act="start">Débuter la prestation</button>' +
            '<button type="button" class="btn btn-outline" data-finance-act="finish">Déclarer la fin</button>' +
            '<button type="button" class="btn btn-primary" data-finance-act="reply-refund">Répondre au remboursement</button>' +
            '</div></article>'
        );
    }

    function renderAdmin() {
        const rows = Object.keys(CASES).map(function (id) {
            const row = CASES[id];
            const cls = policy.classifyFinanceDisplay(row);
            if (state.filter === 'refunds' && !row.refundRequest.status) return '';
            if (state.filter === 'disputes' && !row.dispute) return '';
            return '<button type="button" class="finance-row" data-finance-case="' + id + '"><strong>' + row.mission.title + '</strong><div class="finance-muted">' + cls.title + ' · ' + cents(row.payment.customer_total_cents) + ' · ' + row.requester.name + ' / ' + row.provider.name + '</div></button>';
        }).join('');
        const row = currentCase();
        const cls = classified();
        return (
            '<article class="finance-card"><h2>Administration</h2>' +
            '<div class="finance-toolbar" style="display:flex;gap:8px;margin-bottom:12px;">' +
            '<button type="button" class="finance-chip' + (state.filter === 'all' ? ' is-on' : '') + '" data-finance-filter="all">Tous</button>' +
            '<button type="button" class="finance-chip' + (state.filter === 'refunds' ? ' is-on' : '') + '" data-finance-filter="refunds">Remboursements</button>' +
            '<button type="button" class="finance-chip' + (state.filter === 'disputes' ? ' is-on' : '') + '" data-finance-filter="disputes">Litiges</button>' +
            '</div>' +
            '<div class="finance-list">' + (rows || '<p class="finance-empty">Aucune ligne pour ce filtre.</p>') + '</div>' +
            '<hr style="border:none;border-top:1px solid var(--border,#E2E8F0);margin:18px 0;">' +
            '<h3>Dossier</h3>' +
            '<p>' + row.requester.name + ' → ' + row.provider.name + '</p>' +
            '<p>' + cls.title + ' · ' + cents(row.payment.customer_total_cents) + '</p>' +
            '<p class="finance-muted">Journal : lecture démonstration. Décision serveur requise ; Stripe restera inactif.</p>' +
            '<div class="finance-actions">' +
            '<button type="button" class="btn btn-outline" data-finance-act="admin-refuse">Refuser</button>' +
            '<button type="button" class="btn btn-primary" data-finance-act="admin-approve">Proposer une décision</button>' +
            '</div></article>'
        );
    }

    function renderGuest() {
        return '<article class="finance-card"><h2>Connexion requise</h2><p class="finance-muted">Les dossiers paiement ne sont pas publics. Connectez-vous avec le compte concerné.</p></article>';
    }

    function renderThird() {
        return '<article class="finance-card"><h2>Accès refusé</h2><p class="finance-muted">Un membre non partie à la mission ne voit pas ce dossier.</p></article>';
    }

    function bodyHtml() {
        if (state.role === 'guest') return renderGuest();
        if (state.role === 'third') return renderThird();
        if (state.role === 'provider') {
            if (state.screen === 'payment') return renderProvider();
            if (state.screen === 'dispute') return renderDispute();
            return renderRefund();
        }
        if (state.role === 'admin') return renderAdmin();
        if (state.screen === 'cancel') return renderCancel();
        if (state.screen === 'refund') return renderRefund();
        if (state.screen === 'dispute') return renderDispute();
        return renderPayment();
    }

    function paint(rootEl) {
        const nav = state.role === 'admin'
            ? navBtn('payment', 'Dossiers')
            : (state.role === 'provider'
                ? navBtn('payment', 'Mission') + navBtn('refund', 'Remboursements') + navBtn('dispute', 'Litiges')
                : navBtn('payment', 'Paiement') + navBtn('cancel', 'Annulation') + navBtn('refund', 'Remboursement') + navBtn('dispute', 'Litige'));
        const toolbars = state.lab
            ? (
                '<div class="finance-desk-toolbar" role="tablist" aria-label="Profil de démonstration">' +
                ['client', 'provider', 'admin', 'guest', 'third'].map(function (role) {
                    const names = { client: 'Client', provider: 'Lyanneur', admin: 'Admin', guest: 'Invité', third: 'Tiers' };
                    return '<button type="button" class="finance-chip' + (state.role === role ? ' is-on' : '') + '" data-finance-role="' + role + '">' + names[role] + '</button>';
                }).join('') +
                '</div>' +
                '<div class="finance-desk-toolbar" aria-label="Cas">' +
                Object.keys(CASES).map(function (id) {
                    return '<button type="button" class="finance-chip' + (state.caseId === id ? ' is-on' : '') + '" data-finance-case="' + id + '">' + id.replace(/_/g, ' ') + '</button>';
                }).join('') +
                '</div>'
            )
            : '';
        const compact = (policy.renderCompactStrip && !state.lab && state.role !== 'admin')
            ? policy.renderCompactStrip(currentCase(), { demo: true })
            : '';
        rootEl.innerHTML =
            '<div class="finance-desk-banner" role="status">' + DEMO_NOTICE + '</div>' +
            toolbars +
            compact +
            '<div class="finance-layout"><nav class="finance-nav">' + nav + '</nav><div>' + bodyHtml() + '</div></div>' +
            '<p id="financeDeskLive" class="finance-muted" aria-live="polite"></p>';
        writeHash();
        bind(rootEl);
    }

    function bind(rootEl) {
        rootEl.querySelectorAll('[data-finance-role]').forEach(function (btn) {
            btn.addEventListener('click', function () { state.role = btn.getAttribute('data-finance-role'); paint(rootEl); });
        });
        rootEl.querySelectorAll('[data-finance-case]').forEach(function (btn) {
            btn.addEventListener('click', function () { state.caseId = btn.getAttribute('data-finance-case'); paint(rootEl); });
        });
        rootEl.querySelectorAll('[data-finance-screen]').forEach(function (btn) {
            btn.addEventListener('click', function () { state.screen = btn.getAttribute('data-finance-screen'); paint(rootEl); });
        });
        rootEl.querySelectorAll('[data-finance-filter]').forEach(function (btn) {
            btn.addEventListener('click', function () { state.filter = btn.getAttribute('data-finance-filter'); paint(rootEl); });
        });
        rootEl.querySelectorAll('[data-finance-act]').forEach(function (btn) {
            btn.addEventListener('click', function () { blockedAction(btn.getAttribute('data-finance-act')); });
        });
    }

    function mount(selector, options) {
        const rootEl = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!rootEl) return false;
        const opts = options || {};
        if (opts.role) state.role = opts.role;
        if (opts.caseId && CASES[opts.caseId]) state.caseId = opts.caseId;
        if (opts.screen) state.screen = opts.screen;
        if (opts.filter) state.filter = opts.filter;
        if (opts.syncHash === false) state.syncHash = false;
        if (opts.lab === true) state.lab = true;
        if (state.syncHash) applyHash();
        paint(rootEl);
        if (state.syncHash && root.addEventListener) {
            root.addEventListener('hashchange', function () {
                applyHash();
                paint(rootEl);
            });
        }
        return true;
    }

    root.LYANN_FINANCE_DESK = {
        mount: mount,
        blockedAction: blockedAction,
        cases: CASES,
        classify: classified,
        classifyFor: function (id) { return policy.classifyFinanceDisplay(CASES[id] || {}); },
        demoNotice: DEMO_NOTICE,
        compactHtml: function (row) { return policy.renderCompactStrip ? policy.renderCompactStrip(row || {}) : ''; }
    };
}(typeof window !== 'undefined' ? window : globalThis));
