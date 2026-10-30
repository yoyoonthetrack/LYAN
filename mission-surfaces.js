/**
 * LYANN 6.27 — Chat mission picker + dossier sheet.
 * Messages stay in the thread. Deal cards live in the dossier surface.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.LYANN_MISSION_SURFACES = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const PICKER_ID = 'chatMissionPickerOverlay';
    const DOSSIER_ID = 'chatTrackingOverlay';
    let pickerState = { query: '', bucket: 'open' };
    let paintingDossier = false;
    let cachedContact = null;

    function dossierApi() {
        return (typeof window !== 'undefined' && window.LYANN_MISSION_DOSSIER) || null;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function liveContact() {
        const named = (typeof window !== 'undefined' && window.__lyannChatContact) || null;
        const active = (typeof window !== 'undefined' && window.LYANN_ACTIVE_CHAT_CONTACT) || null;
        const namedCount = named && Array.isArray(named.dossiers) ? named.dossiers.length : 0;
        const activeCount = active && Array.isArray(active.dossiers) ? active.dossiers.length : 0;
        const cachedCount = cachedContact && Array.isArray(cachedContact.dossiers) ? cachedContact.dossiers.length : 0;
        if (namedCount) return named;
        if (activeCount) return active;
        if (cachedCount) return cachedContact;
        return named || active || cachedContact || null;
    }

    function contactDossiers() {
        const contact = liveContact();
        return (contact && Array.isArray(contact.dossiers)) ? contact.dossiers : [];
    }

    function ensurePickerDom() {
        const main = document.querySelector('.chat-main-area');
        if (!main || document.getElementById(PICKER_ID)) return document.getElementById(PICKER_ID);
        const overlay = document.createElement('div');
        overlay.id = PICKER_ID;
        overlay.className = 'chat-overlay-pane chat-mission-picker';
        overlay.style.display = 'none';
        overlay.innerHTML = [
            '<div class="chat-mission-picker-head">',
            '  <button type="button" class="chat-mission-picker-back" data-picker-back aria-label="Retour au chat"><i class="ph ph-arrow-left"></i></button>',
            '  <div>',
            '    <h4 class="chat-mission-picker-title">Missions ensemble</h4>',
            '    <p class="chat-mission-picker-sub" data-picker-count></p>',
            '  </div>',
            '</div>',
            '<div class="chat-mission-picker-tools">',
            '  <label class="sr-only" for="chatMissionPickerSearch">Rechercher une mission</label>',
            '  <input id="chatMissionPickerSearch" class="chat-mission-picker-search" type="search" placeholder="Rechercher une mission" autocomplete="off">',
            '  <div class="chat-mission-picker-filters" role="tablist" aria-label="Filtrer les missions">',
            '    <button type="button" class="chat-mission-filter is-active" data-bucket="open">Ouvertes</button>',
            '    <button type="button" class="chat-mission-filter" data-bucket="active">En cours</button>',
            '    <button type="button" class="chat-mission-filter" data-bucket="waiting">En attente</button>',
            '    <button type="button" class="chat-mission-filter" data-bucket="done">Terminées</button>',
            '  </div>',
            '</div>',
            '<div class="chat-mission-picker-list" data-picker-list></div>'
        ].join('');
        overlay.addEventListener('click', (event) => {
            if (event.target.closest('[data-picker-back]')) {
                closePicker();
                return;
            }
            const filter = event.target.closest('[data-bucket]');
            if (filter) {
                pickerState.bucket = filter.getAttribute('data-bucket') || 'open';
                paintPicker();
                return;
            }
            const row = event.target.closest('[data-picker-request]');
            if (row) {
                openDossier({
                    requestId: row.getAttribute('data-picker-request'),
                    invitationId: row.getAttribute('data-picker-invitation')
                });
            }
        });
        const search = overlay.querySelector('#chatMissionPickerSearch');
        if (search) {
            search.addEventListener('input', () => {
                pickerState.query = search.value || '';
                paintPicker();
            });
        }
        const inputArea = main.querySelector('.chat-input-area');
        if (inputArea) main.insertBefore(overlay, inputArea);
        else main.appendChild(overlay);
        return overlay;
    }

    function openChild(id) {
        const messaging = window.LYANN_MESSAGING;
        if (messaging && typeof messaging.openChildSurface === 'function') {
            messaging.openChildSurface(id);
            return;
        }
        if (typeof window.openChatChildSurface === 'function') {
            window.openChatChildSurface(id);
            return;
        }
        const node = document.getElementById(id);
        if (!node) return;
        node.classList.add('is-open');
        node.style.display = 'flex';
    }

    function closePicker() {
        const overlay = document.getElementById(PICKER_ID);
        if (overlay) {
            overlay.classList.remove('is-open');
            overlay.style.setProperty('display', 'none', 'important');
        }
        const main = document.querySelector('#chatModal .chat-main-area');
        if (main && !dossierOverlayOpen()) {
            main.classList.remove('lyann-child-surface-open', 'chat-child-surface-active');
            delete main.dataset.lyannChildSurface;
            document.body.classList.remove('lyann-messaging-child-open');
            main.querySelectorAll('#chatMessagesContainer, .chat-input-area, #chatReplyBar').forEach((node) => {
                node.style.removeProperty('display');
            });
        }
        if (!dossierOverlayOpen() && window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.hideAllChildSurfaces === 'function') {
            window.LYANN_MESSAGING.hideAllChildSurfaces();
        }
        const thread = document.getElementById('chatMessagesContainer');
        if (thread && !thread.querySelector('.chat-msg-bubble-wrap') && typeof window.refreshChatUI === 'function') {
            window.refreshChatUI();
        }
    }

    function paintTogetherButton(contact) {
        if (contact) cachedContact = contact;
        const host = document.getElementById('chatHeaderActions')
            || document.querySelector('#chatModal .chat-header-info')
            || document.querySelector('.chat-header-info');
        if (!host) return 0;
        let button = document.getElementById('chatMissionsTogetherBtn');
        const dossiers = (contact && Array.isArray(contact.dossiers)) ? contact.dossiers : contactDossiers();
        const count = dossiers.length;
        if (!count) {
            if (button) button.hidden = true;
            return 0;
        }
        if (!button) {
            button = document.createElement('button');
            button.type = 'button';
            button.id = 'chatMissionsTogetherBtn';
            button.className = 'chat-missions-together';
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                openPicker();
            });
            host.insertBefore(button, host.firstChild);
        }
        button.hidden = false;
        button.innerHTML = '<i class="ph ph-briefcase" aria-hidden="true"></i> Missions (' + count + ')';
        button.setAttribute('aria-label', 'Missions, ' + count);
        return count;
    }

    function paintPicker() {
        const overlay = ensurePickerDom();
        if (!overlay) return;
        const api = dossierApi();
        const all = contactDossiers();
        const filtered = api && typeof api.filterDossiers === 'function'
            ? api.filterDossiers(all, pickerState)
            : all;
        overlay.querySelectorAll('[data-bucket]').forEach((node) => {
            node.classList.toggle('is-active', node.getAttribute('data-bucket') === pickerState.bucket);
        });
        const countEl = overlay.querySelector('[data-picker-count]');
        if (countEl) countEl.textContent = all.length ? (filtered.length + ' sur ' + all.length) : 'Aucune mission';
        const list = overlay.querySelector('[data-picker-list]');
        if (!list) return;
        list.replaceChildren();
        if (!all.length) {
            list.innerHTML = '<div class="chat-mission-empty"><strong>Pas encore de mission ensemble</strong><p>Le chat reste disponible. Une mission apparaîtra ici dès qu’une demande sera acceptée.</p></div>';
            return;
        }
        if (!filtered.length) {
            list.innerHTML = '<div class="chat-mission-empty"><strong>Aucun résultat</strong><p>Modifiez la recherche ou le filtre. Les missions terminées restent accessibles via « Terminées ».</p></div>';
            return;
        }
        filtered.forEach((row) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'chat-mission-pick';
            item.setAttribute('data-picker-request', row.requestId || '');
            item.setAttribute('data-picker-invitation', row.invitationId || '');
            item.setAttribute('data-picker-status', row.statusCode || '');
            item.innerHTML = [
                '<span class="chat-mission-pick-title">' + escapeHtml(row.title || 'Mission') + '</span>',
                '<span class="chat-mission-pick-meta">' + escapeHtml(row.roleLabel || '') + '</span>',
                '<span class="chat-mission-pick-status">' + escapeHtml(row.statusLabel || '') + '</span>',
                row.nextAction ? ('<span class="chat-mission-pick-next">' + escapeHtml(row.nextAction) + '</span>') : ''
            ].join('');
            list.appendChild(item);
        });
    }

    function openPicker() {
        ensurePickerDom();
        pickerState.query = '';
        const search = document.getElementById('chatMissionPickerSearch');
        if (search) search.value = '';
        paintPicker();
        openChild(PICKER_ID);
    }

    function quoteStamp(quote) {
        const raw = quote && (quote.updated_at || quote.created_at || quote.createdAt);
        const n = Date.parse(raw || '') || 0;
        return n;
    }

    function relevantQuote(dossier) {
        const quotes = (dossier && Array.isArray(dossier.quotes)) ? dossier.quotes.slice() : [];
        quotes.sort((a, b) => quoteStamp(b) - quoteStamp(a));
        const pending = quotes.find((quote) => quote && ['SENT', 'VIEWED', 'REVISED'].includes(String(quote.status || '')));
        if (pending) return pending;
        if (dossier && dossier.retainedQuote) return dossier.retainedQuote;
        const rejected = quotes.filter((quote) => quote && quote.status === 'REJECTED');
        return rejected[0] || quotes[0] || null;
    }

    let dossierPaintPending = null;

    function paintDossierSheet(dossier, quotes) {
        if (paintingDossier) {
            dossierPaintPending = { dossier: dossier, quotes: quotes };
            return;
        }
        paintingDossier = true;
        try {
        const overlay = document.getElementById(DOSSIER_ID);
        const list = document.getElementById('trackingMilestonesList');
        const heading = overlay && overlay.querySelector('h4');
        if (heading) heading.innerHTML = 'Dossier de mission';
        const exit = overlay && overlay.querySelector('#btnExitTracking');
        if (exit) {
            exit.textContent = 'Retour au chat';
            exit.setAttribute('aria-label', 'Fermer le dossier');
        }
        if (!list) return;
        list.replaceChildren();
        if (!dossier) {
            list.innerHTML = '<div class="chat-mission-empty"><strong>Choisissez une mission</strong><p>Le chat reste général. Ouvrez un dossier depuis Missions ensemble.</p></div>';
            return;
        }
        const api = dossierApi();
        const scopedQuotes = (quotes || dossier.quotes || []).filter((item) => {
            if (!item) return false;
            if (!api || typeof api.quoteBelongsToDossier !== 'function') return true;
            return api.quoteBelongsToDossier(item, dossier);
        });
        const quote = relevantQuote(Object.assign({}, dossier, { quotes: scopedQuotes }));
        const amount = quote && quote.total_amount != null ? (Number(quote.total_amount) + ' €') : '';
        const description = String(dossier.description || (dossier.request && dossier.request.description) || '').trim();
        const quoteLabel = !quote
            ? 'Pas encore de devis'
            : (quote.status === 'REJECTED' ? 'Devis refusé' : quote.status === 'ACCEPTED' ? 'Devis accepté' : 'Devis en attente');
        const shell = document.createElement('div');
        shell.className = 'chat-dossier-sheet';
        shell.setAttribute('data-dossier-request', dossier.requestId || '');
        shell.setAttribute('data-dossier-invitation', dossier.invitationId || '');
        shell.innerHTML = [
            '<header class="chat-dossier-card-head">',
            '<h3 class="chat-dossier-sheet-title">' + escapeHtml(dossier.title || 'Mission') + '</h3>',
            description ? ('<p class="chat-dossier-sheet-desc">' + escapeHtml(description) + '</p>') : '',
            '<div class="chat-dossier-meta">',
            '<span class="chat-dossier-pill chat-dossier-sheet-role">' + escapeHtml(dossier.roleLabel || '') + '</span>',
            '<span class="chat-dossier-pill chat-dossier-sheet-status">' + escapeHtml(dossier.statusLabel || '') + '</span>',
            '</div>',
            amount ? ('<p class="chat-dossier-sheet-amount">' + escapeHtml(amount) + '</p>') : '',
            '<p class="chat-dossier-sheet-quote">' + escapeHtml(quoteLabel) + '</p>',
            '</header>',
            '<section class="chat-dossier-next" aria-label="Prochaine étape"><h4>Prochaine étape</h4><p data-dossier-next></p></section>',
            '<div data-dossier-actions></div>',
            '<details class="chat-dossier-history"><summary>Historique et jalons</summary><div data-dossier-history></div></details>'
        ].join('');
        list.appendChild(shell);
        const actionsHost = shell.querySelector('[data-dossier-actions]');
        const historyHost = shell.querySelector('[data-dossier-history]');
        if (typeof window.paintDossierActions === 'function' && actionsHost) {
            window.paintDossierActions(actionsHost, dossier, scopedQuotes);
        } else if (typeof window.paintDealRecaps === 'function' && actionsHost) {
            window.paintDealRecaps(actionsHost, scopedQuotes, { allowThreadPanel: true });
        }
        const previous = (quotes || dossier.quotes || []).filter((item) => item && item.status === 'REJECTED');
        if (historyHost && previous.length) {
            previous.forEach((item) => {
                const line = document.createElement('p');
                line.textContent = 'Devis précédent · ' + (item.total_amount != null ? item.total_amount + ' €' : '') + ' · refusé';
                historyHost.appendChild(line);
            });
        }
        const milestones = quote && Array.isArray(quote.milestones) ? quote.milestones : [];
        if (historyHost && milestones.length) {
            const total = milestones.length;
            milestones.forEach((milestone, idx) => {
                const line = document.createElement('p');
                const stepNum = total > 1 ? 'Paiement ' + (idx + 1) + ' sur ' + total : 'Paiement';
                const rawTitle = String(milestone.title || 'Paiement par étape').trim();
                const statusStr = typeof window.milestoneStatusLabel === 'function'
                    ? window.milestoneStatusLabel(milestone.status)
                    : (window.LYANN_QUOTE_PAYMENT && typeof window.LYANN_QUOTE_PAYMENT.milestoneStatusLabel === 'function'
                        ? window.LYANN_QUOTE_PAYMENT.milestoneStatusLabel(milestone.status)
                        : (milestone.status || ''));
                line.textContent = [
                    (total > 1 ? stepNum + ' : ' + rawTitle : rawTitle),
                    (milestone.amount != null ? milestone.amount + ' €' : null),
                    statusStr
                ].filter(Boolean).join(' · ');
                historyHost.appendChild(line);
            });
        }
        } finally {
            paintingDossier = false;
            if (dossierPaintPending) {
                const next = dossierPaintPending;
                dossierPaintPending = null;
                paintDossierSheet(next.dossier, next.quotes);
            }
        }
    }

    function dossierOverlayOpen() {
        const overlay = document.getElementById(DOSSIER_ID);
        if (!overlay) return false;
        if (overlay.classList.contains('is-open')) return true;
        if (overlay.style.display && overlay.style.display !== 'none') return true;
        if (typeof window.getComputedStyle === 'function') {
            return window.getComputedStyle(overlay).display !== 'none';
        }
        return false;
    }

    function revealDossier(picked) {
        if (!picked || !picked.ok || !picked.dossier) return false;
        if (typeof window.selectChatDossier === 'function') {
            void window.selectChatDossier({ requestId: picked.dossier.requestId, invitationId: picked.dossier.invitationId });
        }
        paintDossierSheet(picked.dossier, picked.dossier.quotes);
        openChild(DOSSIER_ID);
        const overlay = document.getElementById(DOSSIER_ID);
        if (overlay) {
            overlay.classList.add('is-open');
            overlay.style.setProperty('display', 'flex', 'important');
        }
        closePicker();
        return true;
    }

    function pickDossier(hint) {
        const contact = liveContact();
        const api = dossierApi();
        if (!api || !contact) return { ok: false, dossier: null };
        return api.selectActiveDossier(contact.dossiers || [], hint || {
            requestId: contact.requestId,
            invitationId: contact.invitationId
        });
    }

    let openDossierGeneration = 0;

    async function openDossier(hint) {
        const generation = ++openDossierGeneration;
        const cached = pickDossier(hint);
        const shown = revealDossier(cached);
        if (typeof window.reloadPairDossiers === 'function') {
            try { await window.reloadPairDossiers(); } catch (_) {}
        }
        if (generation !== openDossierGeneration) {
            return { ok: shown, superseded: true, dossier: cached.ok ? cached.dossier : null };
        }
        const picked = pickDossier(hint);
        if (!picked.ok || !picked.dossier) {
            if (shown) return { ok: true, dossier: cached.dossier, stale: true };
            openPicker();
            return { ok: false, ambiguous: !!(picked && picked.ambiguous), code: (picked && picked.code) || 'missing' };
        }
        revealDossier(picked);
        return { ok: true, dossier: picked.dossier };
    }

    function syncOpenDossier(quotes) {
        if (!dossierOverlayOpen()) return;
        const contact = liveContact();
        const dossier = contact && contact.activeDossier;
        if (!dossier) return;
        paintDossierSheet(dossier, quotes || dossier.quotes);
    }

    return {
        paintTogetherButton,
        openPicker,
        closePicker,
        openDossier,
        paintPicker,
        paintDossierSheet,
        syncOpenDossier,
        relevantQuote,
        ensurePickerDom
    };
});
