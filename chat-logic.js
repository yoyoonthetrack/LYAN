// ---------------------------------------------------------
// CHAT LOGIC (NO ROLES)
// ---------------------------------------------------------

const BLOCKED_USERS_KEY = 'LYANN_BLOCKED_USERS';

window.getBlockedUsers = function() {
    try {
        const stored = localStorage.getItem(BLOCKED_USERS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch(e) {
        return [];
    }
};

function isLyannSupportContact(contactId) {
    const id = contactId || currentChatContact?.id || window.LYANN_ACTIVE_CHAT_CONTACT?.id;
    return Boolean(id && window.LYANN_SUPPORT_USER_ID && String(id) === String(window.LYANN_SUPPORT_USER_ID));
}

function threadStatusLabel(status) {
    const labels = {
        OPEN: 'Ouverte',
        PENDING: 'En attente',
        AGREED: 'Acceptée',
        PAUSED: 'En pause',
        ASSIGNED: 'Attribuée',
        FUNDED: 'Payée',
        IN_PROGRESS: 'En cours',
        WORK_MARKED_COMPLETE: 'À valider',
        COMPLETED: 'Terminée',
        CLOSED: 'Fermée',
        RELEASED: 'Terminée',
        VALIDATED: 'Validée',
        CANCELLED: 'Annulée',
        CANCELED: 'Annulée',
        DISPUTED: 'Litige'
    };
    const key = String(status || '').toUpperCase();
    return labels[key] || '';
}

function milestoneStatusLabel(status) {
    const labels = {
        PENDING: 'En attente de paiement',
        FUNDED: 'Paiement sécurisé',
        IN_PROGRESS: 'Travaux en cours',
        COMPLETED: 'Travail déclaré terminé',
        VALIDATED: 'Travail validé',
        RELEASED: 'Paiement libéré',
        CANCELLED: 'Annulé',
        CANCELED: 'Annulé',
        DISPUTED: 'Litige en cours'
    };
    const key = String(status || '').toUpperCase();
    return labels[key] || 'En cours';
}

function openThreadMission(event, requestId) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (window.LYANN_ROUTER && requestId) window.LYANN_ROUTER.go('mission', { requestId });
    else if (window.LYANN_MESSAGING) window.LYANN_MESSAGING.openMissionFromChat(event, { dataset: { requestId } });
}

function paintCompactThreadBanner(banner, { kicker, title, meta, requestId, onOpen, primary }) {
    if (!banner) return;
    banner.style.display = 'flex';
    banner.className = 'chat-mission-banner lyann-thread-context';
    banner.replaceChildren();
    if (requestId) banner.setAttribute('data-request-context', requestId);
    const info = document.createElement('div');
    info.className = 'chat-mission-banner-info';
    if (kicker) {
        const tag = document.createElement('span');
        tag.className = 'lyann-thread-context-kicker';
        tag.textContent = kicker;
        info.appendChild(tag);
    }
    const titleEl = document.createElement('span');
    titleEl.className = 'chat-mission-banner-title';
    titleEl.id = 'chatBannerTitle';
    titleEl.textContent = title || '';
    info.appendChild(titleEl);
    if (meta) {
        const metaEl = document.createElement('span');
        metaEl.className = 'chat-mission-banner-meta';
        metaEl.id = 'chatBannerMeta';
        metaEl.textContent = meta;
        info.appendChild(metaEl);
    }
    banner.appendChild(info);
    const actions = document.createElement('div');
    actions.className = 'lyann-thread-context-actions';
    if (primary && primary.label && typeof primary.run === 'function') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'lyann-thread-context-primary';
        button.id = primary.id || 'lyannThreadPrimaryAction';
        button.textContent = primary.label;
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            primary.run(event);
        });
        actions.appendChild(button);
    }
    if (onOpen) {
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'lyann-thread-context-open';
        open.textContent = 'Voir';
        open.addEventListener('click', (event) => {
            event.stopPropagation();
            onOpen(event);
        });
        actions.appendChild(open);
        banner.onclick = (event) => {
            if (event.target.closest('button')) return;
            onOpen(event);
        };
    }
    if (actions.childElementCount) banner.appendChild(actions);
    const contactForStrip = currentChatContact;
    paintDossierStrip(
        banner,
        contactForStrip && Array.isArray(contactForStrip.dossiers) ? contactForStrip.dossiers : [],
        contactForStrip && contactForStrip.activeDossier
    );
    const viewMissionBtn = document.getElementById('chatViewMissionBtn');
    if (viewMissionBtn) {
        viewMissionBtn.style.display = 'none';
        if (requestId) viewMissionBtn.dataset.requestId = requestId;
    }
    // Banner already carries mission context — keep header jump from overlapping it.
    syncMissionJump(false);
}

function paintDossierStrip(banner, dossiers, active) {
    if (!banner) return;
    banner.querySelectorAll('.chat-dossier-strip').forEach((node) => node.remove());
    if (!Array.isArray(dossiers) || dossiers.length < 2) return;
    const strip = document.createElement('div');
    strip.className = 'chat-dossier-strip';
    strip.setAttribute('role', 'tablist');
    strip.setAttribute('aria-label', 'Dossiers de mission');
    dossiers.forEach((row) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chat-dossier-chip' + (active && active.key === row.key ? ' is-active' : '');
        chip.setAttribute('role', 'tab');
        chip.setAttribute('aria-selected', active && active.key === row.key ? 'true' : 'false');
        chip.dataset.requestId = row.requestId || '';
        chip.dataset.invitationId = row.invitationId || '';
        chip.dataset.dossierKey = row.key || '';
        const title = document.createElement('span');
        title.className = 'chat-dossier-chip-title';
        title.textContent = row.title || 'Mission';
        const meta = document.createElement('span');
        meta.className = 'chat-dossier-chip-meta';
        meta.textContent = [row.roleLabel, row.statusLabel].filter(Boolean).join(' · ');
        chip.append(title, meta);
        chip.addEventListener('click', (event) => {
            event.stopPropagation();
            void selectChatDossier({ requestId: row.requestId, invitationId: row.invitationId });
        });
        strip.appendChild(chip);
    });
    banner.insertBefore(strip, banner.firstChild);
}

async function selectChatDossier(hint) {
    if (!currentChatContact) return false;
    const dossiers = Array.isArray(currentChatContact.dossiers) ? currentChatContact.dossiers : [];
    const api = window.LYANN_MISSION_DOSSIER;
    const picked = api && typeof api.selectActiveDossier === 'function'
        ? api.selectActiveDossier(dossiers, hint || {})
        : { ok: false, ambiguous: dossiers.length > 1, dossier: null };
    const nextKey = picked.dossier && api ? api.dossierKey(picked.dossier) : '';
    const prevKey = currentChatContact.activeDossier && api
        ? api.dossierKey(currentChatContact.activeDossier)
        : (currentChatContact.requestId ? ('req:' + currentChatContact.requestId + '|inv:' + (currentChatContact.invitationId || '')) : '');
    if (nextKey && nextKey !== prevKey && typeof resetDossierCaches === 'function') {
        resetDossierCaches();
        if (typeof dossierSession !== 'undefined' && dossierSession.begin) dossierSession.begin(nextKey);
        cancelDealContextRefresh();
    }
    applyDossierToContact(currentChatContact, picked.ok ? picked.dossier : null, picked.ambiguous);
    if (window.LYANN_ACTIVE_CHAT_CONTACT) {
        window.LYANN_ACTIVE_CHAT_CONTACT.requestId = currentChatContact.requestId;
        window.LYANN_ACTIVE_CHAT_CONTACT.invitationId = currentChatContact.invitationId;
        window.LYANN_ACTIVE_CHAT_CONTACT.missionAmbiguous = currentChatContact.missionAmbiguous;
    }
    noteDealContextConversation(currentChatContact);
    paintThreadBusinessBanner();
    const box = document.getElementById('chatMessagesContainer');
    if (picked.ok && picked.dossier) {
        // Drop the previous dossier's ActionPanel immediately so amounts/CTAs cannot linger
        // while the request-scoped refresh is in flight.
        if (box) {
            paintDealRecaps(box, [], {
                panel: 'loading',
                panelMeta: {
                    requestId: picked.dossier.requestId || null,
                    requestTitle: picked.dossier.title || ''
                },
                skipWatch: true
            });
        }
        void (async () => {
            if (typeof renderMessages === 'function') await renderMessages(null, { fresh: false });
            await refreshDealContext('dossier-switch');
        })();
    } else if (box) {
        paintDealRecaps(box, [], { panel: 'ambiguous' });
    }
    return picked.ok;
}
window.selectChatDossier = selectChatDossier;

function hideChatFinanceStrip() {
    const strip = document.getElementById('chatFinanceStrip');
    if (strip) strip.style.display = 'none';
}

function attachChatFinanceStrip(banner, row) {
    const policy = window.LYANN_FINANCE_POLICY_UI;
    if (!banner || !policy || typeof policy.renderCompactStrip !== 'function') return;
    let host = document.getElementById('chatFinanceStrip');
    if (!host) {
        host = document.createElement('div');
        host.id = 'chatFinanceStrip';
        host.className = 'lyann-finance-strip';
        banner.insertAdjacentElement('afterend', host);
    }
    host.innerHTML = policy.renderCompactStrip(row || {});
    host.style.display = '';
}

function financeRowFromThread(quotes, mission, request) {
    const policy = window.LYANN_FINANCE_POLICY_UI;
    if (policy && typeof policy.rowFromQuoteContext === 'function') {
        return policy.rowFromQuoteContext(quotes, mission, request);
    }
    return { demo: false, quote: {}, mission: mission || {}, milestone: {}, payment: {} };
}

function hideChatMissionChrome() {
    hideChatFinanceStrip();
    const banner = document.getElementById('chatMissionContextBar') || document.getElementById('chatMissionContext');
    if (banner) {
        banner.style.display = 'none';
        banner.removeAttribute('data-request-context');
        banner.innerHTML = '';
    }
    const dropViewMission = document.getElementById('chatDropViewMission');
    if (dropViewMission) {
        dropViewMission.style.display = 'none';
        delete dropViewMission.dataset.requestId;
    }
    const directAction = document.getElementById('chatDropDirectAction');
    if (directAction) directAction.style.display = 'none';
    const dateAction = document.getElementById('chatDropProposeDate');
    if (dateAction) dateAction.style.display = 'none';
    const viewMissionBtn = document.getElementById('chatViewMissionBtn');
    if (viewMissionBtn) {
        viewMissionBtn.style.display = 'none';
        delete viewMissionBtn.dataset.requestId;
    }
    const actionContainer = document.getElementById('chatContextualActionsBar');
    if (actionContainer) actionContainer.style.display = 'none';
    syncMissionJump(false);
}

function renderDirectThreadAction(banner) {
    if (banner) {
        banner.style.display = 'none';
        banner.innerHTML = '';
    }
    const menu = document.getElementById('chatHeaderDropdownMenu');
    if (!menu || !currentChatContact) return;
    let button = document.getElementById('chatDropDirectAction');
    if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.id = 'chatDropDirectAction';
        button.className = 'chat-dropdown-item';
        const divider = menu.querySelector('.chat-dropdown-divider');
        menu.insertBefore(button, divider || null);
    }
    const myId = typeof getMyId === 'function' ? getMyId() : null;
    const startedBy = currentChatContact.startedBy;
    const iStarted = !startedBy || String(startedBy) === String(myId);
    const action = iStarted ? 'DIRECT_ASK' : 'DIRECT_OFFER';
    button.style.display = 'flex';
    button.innerHTML = iStarted
        ? '<i class="ph ph-hand-heart"></i> Demander un service'
        : '<i class="ph ph-tag"></i> Faire une offre';
    button.onclick = (event) => {
        event.stopPropagation();
        menu.classList.remove('active');
        menu.style.setProperty('display', 'none', 'important');
        handleChatAction(action);
    };
}

function setThreadMenuAction(id, label, icon, run, visible) {
    const menu = document.getElementById('chatHeaderDropdownMenu');
    if (!menu) return;
    let button = document.getElementById(id);
    if (!visible) {
        if (button) button.style.display = 'none';
        return;
    }
    if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.id = id;
        button.className = 'chat-dropdown-item';
        const divider = menu.querySelector('.chat-dropdown-divider');
        menu.insertBefore(button, divider || null);
    }
    button.style.display = 'flex';
    button.innerHTML = '<i class="ph ' + icon + '"></i> ' + label;
    button.onclick = (event) => {
        event.stopPropagation();
        menu.classList.remove('active');
        menu.style.setProperty('display', 'none', 'important');
        run(event);
    };
}

function scrollToThreadQuote(quoteId) {
    const box = document.getElementById('chatMessagesContainer');
    if (!box) return;
    const pendingId = quoteId || (() => {
        let found = null;
        if (typeof timelineQuotes !== 'undefined' && timelineQuotes) {
            timelineQuotes.forEach((quote) => {
                if (found || !quote || !quote.id || quote.id.toString().startsWith('milestone:')) return;
                if (['SENT', 'VIEWED', 'REVISED'].includes(String(quote.status || ''))) found = quote.id;
            });
        }
        return found;
    })();
    let node = null;
    if (pendingId) {
        node = box.querySelector(quoteTimelineSelector(pendingId))
            || box.querySelector('[data-live-quote-id="' + CSS.escape(String(pendingId)) + '"]');
    }
    if (!node) {
        node = box.querySelector('[data-entity-type="quote"][data-entity-id], [data-live-quote="1"], [data-live-quote-id]');
    }
    if (!node && pendingId && typeof window.__lyannAppendLiveQuote === 'function' && typeof timelineQuotes !== 'undefined') {
        const quote = timelineQuotes.get(String(pendingId));
        if (quote) {
            window.__lyannAppendLiveQuote(box, quote);
            node = box.querySelector('[data-live-quote-id="' + CSS.escape(String(pendingId)) + '"]');
        }
    }
    if (!node || typeof node.scrollIntoView !== 'function') return;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    node.classList.add('lyann-quote-highlight');
    window.setTimeout(() => node.classList.remove('lyann-quote-highlight'), 1600);
}

function openMissionDossier(hint) {
    if (window.LYANN_MISSION_SURFACES && typeof window.LYANN_MISSION_SURFACES.openDossier === 'function') {
        return window.LYANN_MISSION_SURFACES.openDossier(hint || {});
    }
    const contact = currentChatContact;
    const dossierApi = window.LYANN_MISSION_DOSSIER;
    const picked = dossierApi && contact
        ? dossierApi.selectActiveDossier(contact.dossiers || [], hint || {
            requestId: contact.requestId,
            invitationId: contact.invitationId,
            missionId: contact.missionId
        })
        : { ok: false, dossier: null };
    if (picked.ok && picked.dossier && (!contact.requestId || String(contact.requestId) !== String(picked.dossier.requestId))) {
        void selectChatDossier({ requestId: picked.dossier.requestId, invitationId: picked.dossier.invitationId });
    }
    const dossier = (picked.ok && picked.dossier) || (contact && contact.activeDossier) || null;
    const mission = (dossier && dossier.mission) || (contact && contact.threadMission) || hint || null;
    const overlay = document.getElementById('chatTrackingOverlay');
    const heading = overlay && overlay.querySelector('h4');
    if (heading) heading.innerHTML = '<i class="ph ph-folder"></i> Dossier de mission';
    openMissionTracking(mission && mission.id ? mission : {
        id: (mission && mission.id) || (dossier && dossier.missionId) || '',
        title: (dossier && dossier.title) || (hint && hint.title) || 'Mission',
        status: (dossier && dossier.statusLabel) || '',
        dossier
    });
}
window.openMissionDossier = openMissionDossier;

function openMissionTracking(mission) {
    const overlay = document.getElementById('chatTrackingOverlay');
    const list = document.getElementById('trackingMilestonesList');
    if (!overlay) return;
    if (typeof openChatChildSurface === 'function') openChatChildSurface('chatTrackingOverlay');
    else {
        closeAllOverlays();
        overlay.style.display = 'flex';
    }
    overlay.style.color = '#1B4332';
    overlay.style.background = '#FFFFFF';
    if (!mission || (!mission.id && !(mission.dossier && mission.dossier.requestId) && !(currentChatContact && currentChatContact.requestId))) {
        if (list) {
            list.style.color = '#1B4332';
            list.textContent = 'Choisissez un dossier pour voir le devis et le suivi.';
        }
        return;
    }
    overlay.dataset.missionId = String(mission.id || (mission.dossier && mission.dossier.requestId) || '');
    overlay.dataset.requestId = String((mission.dossier && mission.dossier.requestId) || (currentChatContact && currentChatContact.requestId) || '');
    if (list) {
        list.style.color = '#1B4332';
        list.textContent = 'Chargement du dossier…';
    }
    const paintTracking = (row, extraMilestones) => {
        if (!list) return;
        list.replaceChildren();
        const dossierNow = (mission && mission.dossier) || (currentChatContact && currentChatContact.activeDossier) || null;
        if (dossierNow) {
            const roleLine = document.createElement('p');
            roleLine.className = 'chat-dossier-role';
            roleLine.textContent = [dossierNow.roleLabel, dossierNow.statusLabel, dossierNow.title].filter(Boolean).join(' · ');
            list.appendChild(roleLine);
        }
        const policy = window.LYANN_FINANCE_POLICY_UI;
        const wrap = document.createElement('div');
        wrap.className = 'lyann-tracking-sheet';
        if (policy && typeof policy.renderMissionTracking === 'function') {
            wrap.innerHTML = policy.renderMissionTracking(row || {});
        } else {
            wrap.textContent = (row && row.quote && row.quote.description) || (mission.title || 'Mission');
        }
        list.appendChild(wrap);
        const milestones = Array.isArray(extraMilestones) ? extraMilestones : [];
        if (milestones.length > 1) {
            const more = document.createElement('ol');
            more.className = 'lyann-tracking-milestones';
            milestones.forEach((milestone) => {
                const item = document.createElement('li');
                item.textContent = (milestone.title || 'Étape') + ' — ' + milestoneStatusLabel(milestone.status);
                more.appendChild(item);
            });
            list.appendChild(more);
        }
    };
    const fallbackRow = financeRowFromThread(collectThreadQuotes(), mission, currentChatContact && currentChatContact.threadRequest && currentChatContact.threadRequest.request);
    const dossier = (mission && mission.dossier) || (currentChatContact && currentChatContact.activeDossier) || null;
    const missionUuid = mission && mission.id && (typeof window.isUUID === 'function' ? window.isUUID(mission.id) : false);
    if (!missionUuid || !window.LYANN_API_CLIENT || typeof window.LYANN_API_CLIENT.getMissionDetailsSecure !== 'function') {
        paintTracking(fallbackRow, collectThreadQuotes().flatMap((quote) => quote && quote.milestones ? quote.milestones : []));
        return;
    }
    window.LYANN_API_CLIENT.getMissionDetailsSecure(mission.id).then((res) => {
        if (overlay.dataset.missionId !== String(mission.id) && overlay.dataset.requestId !== String((dossier && dossier.requestId) || '')) return;
        if (!list) return;
        if (!res || res.error || !res.data) {
            paintTracking(fallbackRow, []);
            return;
        }
        const milestones = Array.isArray(res.data.milestones) ? res.data.milestones : [];
        const quote = res.data.quote || fallbackRow.quote || {};
        const payment = (res.data.payment || (res.data.payments && res.data.payments[0]) || fallbackRow.payment) || {};
        paintTracking({
            demo: false,
            mission: res.data.mission || mission,
            milestone: milestones[0] || fallbackRow.milestone || {},
            payment: payment,
            quote: quote
        }, milestones);
    }).catch(() => {
        paintTracking(fallbackRow, []);
    });
}

function threadPrimaryAction(requestContext, mission, quotes, myUserId) {
    const request = requestContext && requestContext.request;
    const list = Array.isArray(quotes) ? quotes : [];
    if (threadDealIsFinished(mission, list, request)) return null;
    const pending = list.find((quote) => quote && ['SENT', 'VIEWED', 'REVISED'].includes(quote.status));
    // Suivi seulement tant que la mission est encore active (jamais une fois terminée).
    if (mission && mission.id && ['IN_PROGRESS', 'WORK_MARKED_COMPLETE', 'AGREED'].includes(String(mission.status || ''))) {
        return { id: 'lyannThreadPrimaryAction', label: 'Suivi', run: () => openMissionTracking(mission) };
    }
    if (pending) {
        const requestId = (requestContext && requestContext.requestId) || (currentChatContact && currentChatContact.requestId) || null;
        return { id: 'lyannThreadPrimaryAction', label: 'Voir le dossier', run: () => openMissionDossier({ requestId }) };
    }
    const gate = threadQuoteProposalGate(requestContext, mission, list, myUserId);
    if (gate.ok) {
        return {
            id: 'btnCtxPropose',
            label: 'Proposer un devis',
            run: () => handleChatAction('MAKE_PROPOSAL', mission)
        };
    }
    return null;
}

function threadQuoteProposalGate(requestContext, mission, quotes, myUserId) {
    const request = requestContext && requestContext.request;
    const requesterId = requestContext && (requestContext.requesterId || request?.requester_id);
    const mine = Boolean(request && myUserId && String(requesterId) === String(myUserId));
    if (!request) {
        return { ok: false, reason: 'Choisissez l’annonce avant de proposer un devis.' };
    }
    if (mine) {
        return { ok: false, reason: 'C’est le Lyanneur invité qui envoie le devis pour cette annonce.' };
    }
    const reqStatus = String(request.status || '').toUpperCase();
    if (['COMPLETED', 'CLOSED', 'CANCELLED', 'CANCELED'].includes(reqStatus)) {
        return { ok: false, reason: 'Cette demande est close. Impossible de proposer un nouveau devis.' };
    }
    const missionStatus = mission && String(mission.status || '').toUpperCase();
    if (missionStatus && ['COMPLETED', 'CANCELLED', 'CANCELED'].includes(missionStatus)) {
        return { ok: false, reason: 'Cette mission est terminée. Impossible de proposer un nouveau devis.' };
    }
    const list = Array.isArray(quotes) ? quotes : [];
    const acceptedOpen = list.some((quote) => quote && quote.status === 'ACCEPTED' && !quoteIsClosedDeal(quote));
    if (acceptedOpen) {
        return { ok: false, reason: 'Un devis a déjà été accepté pour cette demande.' };
    }
    const pending = list.find((quote) => quote && ['SENT', 'VIEWED', 'REVISED'].includes(String(quote.status || '')));
    if (pending) {
        return { ok: false, reason: 'Un devis est déjà en attente de réponse.', pending: pending };
    }
    return { ok: true, reason: '' };
}

function collectThreadQuotes() {
    const out = [];
    if (typeof timelineQuotes === 'undefined' || !timelineQuotes || typeof timelineQuotes.forEach !== 'function') {
        return out;
    }
    const contact = currentChatContact;
    const requestId = contact && contact.requestId ? String(contact.requestId) : null;
    const dossiers = contact && Array.isArray(contact.dossiers) ? contact.dossiers : [];
    if (!requestId && (contact && contact.missionAmbiguous || dossiers.length > 1)) {
        return out;
    }
    const dossierApi = window.LYANN_MISSION_DOSSIER;
    timelineQuotes.forEach((value, key) => {
        if (String(key || '').startsWith('milestone:')) return;
        if (!value || !value.id) return;
        const status = String(value.status || '');
        if (!['SENT', 'VIEWED', 'REVISED', 'ACCEPTED', 'REJECTED'].includes(status)) return;
        if (requestId && dossierApi && typeof dossierApi.quoteBelongsToDossier === 'function') {
            if (!dossierApi.quoteBelongsToDossier(value, { requestId, invitationId: contact && contact.invitationId })) return;
        } else if (requestId && value.request_id && String(value.request_id) !== requestId) {
            return;
        }
        out.push(value);
    });
    return out;
}

function dealEventBelongsToActiveDossier(quote, row) {
    const contact = currentChatContact;
    if (!contact) return false;
    const dossiers = Array.isArray(contact.dossiers) ? contact.dossiers : [];
    if (dossiers.length < 2) return true;
    if (!contact.requestId) return false;
    const meta = (row && (row.metadata || row.meta)) || {};
    const inferred = {
        id: (quote && quote.id) || (row && (row.entity_id || row.entityId)) || null,
        request_id: (quote && (quote.request_id || quote.requestId)) || meta.request_id || meta.requestId || (row && (row.request_id || row.requestId)) || null,
        request_invitation_id: (quote && quote.request_invitation_id) || meta.request_invitation_id || (row && row.request_invitation_id) || null
    };
    const dossierApi = window.LYANN_MISSION_DOSSIER;
    if (dossierApi && typeof dossierApi.quoteBelongsToDossier === 'function'
        && (inferred.request_id || inferred.request_invitation_id)) {
        return dossierApi.quoteBelongsToDossier(inferred, {
            requestId: contact.requestId,
            invitationId: contact.invitationId
        });
    }
    if (inferred.request_id) return String(inferred.request_id) === String(contact.requestId);
    return false;
}

function quoteIsClosedDeal(quote) {
    const payment = window.LYANN_QUOTE_PAYMENT;
    if (!quote || !payment) return false;
    if (quote.status === 'REJECTED') return true;
    if (quote.status !== 'ACCEPTED') return false;
    if (typeof payment.quoteSettled === 'function' && payment.quoteSettled(quote.milestones || [])) return true;
    if (typeof payment.missionPhase === 'function' && payment.missionPhase(quote) === 'closed') return true;
    const view = typeof payment.missionCard === 'function'
        ? payment.missionCard(quote, (typeof getMyId === 'function' ? getMyId() : null) || quote.requester_id, 'active')
        : null;
    return !!(view && view.closed);
}

function threadDealIsFinished(mission, quotes, request) {
    if (mission && ['COMPLETED', 'CANCELLED', 'CANCELED'].includes(String(mission.status || '').toUpperCase())) {
        return true;
    }
    if (request && ['COMPLETED', 'CLOSED', 'CANCELLED', 'CANCELED'].includes(String(request.status || '').toUpperCase())) {
        return true;
    }
    const list = Array.isArray(quotes) && quotes.length ? quotes : collectThreadQuotes();
    if (!list.length) return false;
    const accepted = list.filter((quote) => quote && quote.status === 'ACCEPTED');
    if (!accepted.length) return false;
    return accepted.every((quote) => quoteIsClosedDeal(quote));
}

function hasViewableThreadMission(mission, quotes, request) {
    if (!mission || !mission.id) return false;
    if (threadDealIsFinished(mission, quotes, request)) return false;
    return true;
}

function paintThreadBusinessBanner() {
    const banner = document.getElementById('chatMissionContextBar') || document.getElementById('chatMissionContext');
    const contact = currentChatContact;
    window.__lyannChatContact = contact || null;
    hideChatMissionChrome();
    if (window.LYANN_MISSION_SURFACES && typeof window.LYANN_MISSION_SURFACES.paintTogetherButton === 'function') {
        window.LYANN_MISSION_SURFACES.paintTogetherButton(contact);
    }
    if (banner) banner.style.display = 'none';
}

window.isUserBlocked = function(idOrName) {
    if (!idOrName) return false;
    if (window.LYANN_SAFETY_REPOSITORY && window.LYANN_SAFETY_REPOSITORY.isBlocked(idOrName)) return true;
    const list = window.getBlockedUsers();
    return list.some(item => (typeof item === 'string' ? item === idOrName : (item.id === idOrName || item.name === idOrName)));
};

function rememberLocalBlock(id, name, blocked) {
    let list = window.getBlockedUsers().filter(item => (typeof item === 'string' ? item !== id : item.id !== id));
    if (blocked) list.push({ id, name, timestamp: new Date().toISOString() });
    localStorage.setItem(BLOCKED_USERS_KEY, JSON.stringify(list));
}

window.blockUser = async function(contactId, contactName) {
    const name = contactName || (currentChatContact ? currentChatContact.name : 'Ce membre');
    const id = contactId || (currentChatContact ? currentChatContact.id : null);
    if (!id || !(typeof window.isUUID === 'function' && window.isUUID(id))) {
        if (window.lyannAlert) window.lyannAlert('Ce membre ne peut pas être bloqué pour le moment.');
        return false;
    }
    try {
        if (!window.LYANN_SAFETY_REPOSITORY) throw new Error('safety repository unavailable');
        await window.LYANN_SAFETY_REPOSITORY.block(id);
    } catch (err) {
        console.warn('[SAFETY] block failed', err);
        if (window.lyannAlert) window.lyannAlert('Le blocage n’a pas pu être enregistré. Vérifiez votre connexion et réessayez.');
        return false;
    }
    rememberLocalBlock(id, name, true);

    if (window.lyannAlert) {
        window.lyannAlert(`${name} est désormais bloqué. Vous ne pourrez plus échanger de messages ensemble. Vous pouvez le débloquer à tout moment depuis cette conversation.`);
    }

    if (typeof renderMessages === 'function') renderMessages();
    if (typeof window.renderChatContacts === 'function') window.renderChatContacts();
    return true;
};

window.unblockUser = async function(contactId) {
    if (!contactId) return false;
    if (typeof window.isUUID === 'function' && window.isUUID(contactId)) {
        try {
            if (!window.LYANN_SAFETY_REPOSITORY) throw new Error('safety repository unavailable');
            await window.LYANN_SAFETY_REPOSITORY.unblock(contactId);
        } catch (err) {
            console.warn('[SAFETY] unblock failed', err);
            if (window.lyannAlert) window.lyannAlert('Le déblocage n’a pas pu être enregistré. Réessayez dans un instant.');
            return false;
        }
    }
    rememberLocalBlock(contactId, null, false);
    let list = window.getBlockedUsers().filter(item => (typeof item === 'string' ? item !== contactId : item.name !== contactId));
    localStorage.setItem(BLOCKED_USERS_KEY, JSON.stringify(list));

    if (typeof window.lyannToast === 'function') window.lyannToast('Le membre a été débloqué.', 'success');

    if (typeof renderMessages === 'function') renderMessages();
    if (typeof window.renderChatContacts === 'function') window.renderChatContacts();
    return true;
};

window.openReportModal = function(targetName = null, targetUserId = null, context = {}) {
    const reportModal = document.getElementById('reportModal');
    const nameToReport = targetName || (currentChatContact ? currentChatContact.name : 'ce membre');
    const userId = targetUserId || (currentChatContact ? currentChatContact.id : '');
    if (!reportModal) {
        console.error('[REPORT] report surface unavailable; no local fallback is permitted');
        if (window.lyannAlert) window.lyannAlert('Le signalement est momentanément indisponible. Réessayez plus tard.');
        return false;
    }
    reportModal.setAttribute('data-target-user', nameToReport);
    if (userId) reportModal.setAttribute('data-target-user-id', userId);
    else reportModal.removeAttribute('data-target-user-id');
    const conversationId = (context && context.conversationId) || (currentChatContact && currentChatContact.conversationId) || '';
    if (conversationId) reportModal.setAttribute('data-conversation-id', conversationId);
    else reportModal.removeAttribute('data-conversation-id');
    reportModal.setAttribute('data-report-source', (context && context.source) || (currentChatContact ? 'conversation' : 'profile'));
    const modalTitle = reportModal.querySelector('.step-title');
    if (modalTitle) modalTitle.textContent = `Signaler ${nameToReport}`;
    if (window.LYANN_SURFACES) {
        window.LYANN_SURFACES.register('report', { element: 'reportModal', mode: 'major', hideBottomNav: true, lockBody: true });
        window.LYANN_SURFACES.open('report');
    } else {
        reportModal.classList.add('active');
        reportModal.style.display = 'flex';
    }
    return true;
};
let currentChatContact = null;

/** E4 — coalesced deal/ActionPanel refresh (generation drops stale responses). */
const dealContextSyncApi = window.LYANN_DEAL_CONTEXT_SYNC || null;
const dealContextRefresh = dealContextSyncApi && typeof dealContextSyncApi.createDealContextRefreshController === 'function'
    ? dealContextSyncApi.createDealContextRefreshController({
        debounceMs: dealContextSyncApi.DEBOUNCE_MS != null ? dealContextSyncApi.DEBOUNCE_MS : 80
    })
    : null;
/** E5 — per-action mutex + scope checks for accept/refuse/revise/pay/done/validate. */
const dealMutationGuard = dealContextSyncApi && typeof dealContextSyncApi.createDealMutationGuard === 'function'
    ? dealContextSyncApi.createDealMutationGuard()
    : null;

function dealContextScopeFromContact(contact) {
    const c = contact || currentChatContact || window.LYANN_ACTIVE_CHAT_CONTACT || {};
    const threadRequest = c.threadRequest || null;
    const dossier = c.activeDossier || null;
    return {
        contactId: c.id || null,
        requestId: c.requestId || (dossier && dossier.requestId) || (threadRequest && threadRequest.requestId) || null,
        invitationId: c.invitationId || (dossier && dossier.invitationId) || (threadRequest && threadRequest.invitationId) || null,
        missionId: (c.threadMission && c.threadMission.id) || c.missionId || (dossier && dossier.missionId) || null,
        conversationId: c.conversationId || (dossier && dossier.conversationId) || null
    };
}

function applyDossierToContact(contact, dossier, ambiguous) {
    if (!contact) return;
    contact.missionAmbiguous = Boolean(ambiguous) || (!dossier && Array.isArray(contact.dossiers) && contact.dossiers.length > 1);
    contact.activeDossier = dossier || null;
    if (!dossier) {
        if (contact.missionAmbiguous) {
            contact.requestId = null;
            contact.invitationId = null;
            contact.threadMission = null;
            contact.missionId = null;
        }
        return;
    }
    contact.requestId = dossier.requestId || null;
    contact.invitationId = dossier.invitationId || null;
    contact.missionId = dossier.missionId || null;
    contact.threadMission = dossier.mission && ['AGREED', 'IN_PROGRESS', 'WORK_MARKED_COMPLETE'].includes(String(dossier.mission.status || ''))
        ? dossier.mission
        : null;
    if (dossier.request) {
        contact.requestData = dossier.request;
        contact.threadRequest = {
            requestId: dossier.requestId,
            invitationId: dossier.invitationId,
            requesterId: dossier.requesterId,
            request: dossier.request
        };
    }
    window.__lyannChatRequestId = dossier.requestId || null;
}

function cancelDealContextRefresh() {
    if (dealContextRefresh) dealContextRefresh.cancel();
    if (dealMutationGuard) dealMutationGuard.cancel();
}

function noteDealContextConversation(contact) {
    const scope = dealContextScopeFromContact(contact);
    if (dealContextRefresh) dealContextRefresh.setScope(scope);
    if (dealMutationGuard) dealMutationGuard.setScope(scope);
}

function getMyId() {
    const authId = window.LYANN_AUTH_STATE?.getSnapshot?.().userId;
    return authId || window.CURRENT_USER_ID || null;
}

function closeAllOverlays() {
    if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.hideAllChildSurfaces === 'function') {
        window.LYANN_MESSAGING.hideAllChildSurfaces();
        setChatContextCoveredByOverlay(false);
        return;
    }
    const ids = [
        'chatActionChoicesOverlay', 'chatDirectPriceForm', 'chatMilestoneDevisForm',
        'chatCheckoutOverlay', 'chatTrackingOverlay', 'chatSubmitProofOverlay',
        'chatProposeDateForm', 'chatLeaveReviewForm'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    setChatContextCoveredByOverlay(false);
}

function openChatChildSurface(id) {
    if (!id) return false;
    let opened = false;
    if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.openChildSurface === 'function') {
        opened = window.LYANN_MESSAGING.openChildSurface(id);
    }
    const el = document.getElementById(id);
    if (!el) return !!opened;
    el.classList.add('is-open');
    el.style.setProperty('display', 'flex', 'important');
    setChatContextCoveredByOverlay(true);
    return true;
}

function setChatContextCoveredByOverlay(isCovered) {
    const mainArea = document.querySelector('.chat-main-area');
    if (!mainArea) return;
    mainArea.classList.toggle('chat-child-surface-active', !!isCovered);
}

// Chat child-surface state is owned by messaging-ui.js / LYANN_MESSAGING.
// Legacy MutationObserver synchronization has been retired.

async function getChatMessages(contactId, options = {}) {
    const userId = getMyId();
    if (!userId || !isUUID(userId) || !isUUID(contactId) || !window.LYANN_MESSAGING_REPOSITORY) return [];
    try {
        const conversationId = currentChatContact && currentChatContact.id === contactId
            ? currentChatContact.conversationId
            : options.conversationId;
        return await window.LYANN_MESSAGING_REPOSITORY.getMessages(userId, contactId, Object.assign({}, options, {
            conversationId: options.conversationId || conversationId || null
        }));
    } catch (error) {
        console.warn('[MESSAGING] canonical message query failed', error);
        return [];
    }
}

const CHAT_NEAR_BOTTOM_PX = 140;
const inflightOptimistic = [];
const parkedLiveRows = new Map();
const outgoingSends = new Map();
let optimisticClientSeq = 0;

function createOptimisticClientId() {
    optimisticClientSeq += 1;
    return 'optimistic_' + Date.now().toString(36) + '_' + optimisticClientSeq.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function chatMessageSelector(id) {
    const value = String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return '[data-message-id="' + value + '"]';
}

function escapeChatHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function threadIsNearBottom(container) {
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight <= CHAT_NEAR_BOTTOM_PX;
}

function bottomRefreshGesture(input) {
    const nearBottom = Boolean(input && input.nearBottom);
    const dy = Number(input && input.dy) || 0;
    const dx = Number(input && input.dx) || 0;
    const pulling = Boolean(input && input.pulling);
    const up = -dy;
    if (!nearBottom) return { pull: false, refresh: false, block: false };
    if (!pulling) {
        if (up < 12) return { pull: false, refresh: false, block: false };
        if (Math.abs(dx) > up) return { pull: false, refresh: false, block: false };
        return { pull: true, refresh: false, block: false };
    }
    const distance = Math.min(88, up);
    return { pull: true, refresh: distance >= 72, block: distance > 18 };
}

function scrollThreadToBottom(container, smooth) {
    if (!container) return;
    const top = container.scrollHeight;
    if (smooth && typeof container.scrollTo === 'function') container.scrollTo({ top: top, behavior: 'smooth' });
    else container.scrollTop = top;
}

function chatTimeLabel(value) {
    if (typeof value === 'number') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return typeof value === 'string' ? value : '';
}

function setOptimisticState(node, state) {
    if (!node) return;
    if (state !== 'sending') {
        node.querySelector('.chat-attach-progress')?.remove();
        node.querySelector('.chat-upload-cancel')?.remove();
    }
    const status = node.querySelector('[data-optimistic-status]');
    if (!status) return;
    status.dataset.optimisticStatus = state;
    const time = status.dataset.timeLabel || '';
    if (state === 'sending') {
        status.textContent = time ? time + ' · Envoi…' : 'Envoi…';
        node.classList.remove('chat-message-send-failed');
        return;
    }
    if (state === 'failed' || state === 'offline') {
        const label = state === 'offline' ? 'Hors connexion' : 'Échec de l\'envoi';
        status.textContent = time ? time + ' · ' + label : label;
        node.classList.add('chat-message-send-failed');
        ensureRetryControl(node);
        return;
    }
    status.textContent = time;
    node.classList.remove('chat-message-send-failed');
    node.querySelector('[data-chat-retry]')?.remove();
    let marker = node.querySelector('.chat-msg-status');
    if (!marker) {
        marker = document.createElement('span');
        status.after(marker);
    }
    marker.className = 'chat-msg-status sent';
    marker.title = 'Envoyé';
    marker.replaceChildren();
    const icon = document.createElement('i');
    icon.className = 'ph ph-check';
    marker.append(icon, document.createTextNode(' Envoyé'));
}

function ensureRetryControl(node) {
    if (!node || node.querySelector('[data-chat-retry]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-msg-retry';
    button.dataset.chatRetry = '1';
    button.textContent = 'Réessayer';
    button.addEventListener('click', () => retryOutgoing(node.dataset.optimisticMessageId || ''));
    const bubble = node.querySelector('.chat-msg-bubble') || node;
    bubble.appendChild(button);
}

function markOwnBubbleRead(messageId) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container || !messageId) return false;
    const node = container.querySelector(chatMessageSelector(messageId));
    if (!node || !node.classList.contains('sent')) return false;
    let marker = node.querySelector('.chat-msg-status');
    if (marker && marker.classList.contains('read')) return true;
    if (!marker) {
        const time = node.querySelector('.chat-msg-time');
        marker = document.createElement('span');
        if (time) time.appendChild(marker);
        else node.appendChild(marker);
    }
    marker.className = 'chat-msg-status read';
    marker.title = 'Vu';
    marker.replaceChildren();
    const icon = document.createElement('i');
    icon.className = 'ph ph-checks';
    marker.append(icon, document.createTextNode(' Vu'));
    return true;
}

function pendingOptimisticFor(contactId) {
    const key = String(contactId || '');
    return inflightOptimistic.filter((item) => {
        return item.contactId === key && item.node && item.node.isConnected && !item.node.dataset.messageId;
    });
}

function trackOptimistic(contactId, node, text, clientId) {
    inflightOptimistic.push({
        clientId: String(clientId || ''),
        contactId: String(contactId || ''),
        node: node,
        text: String(text || '')
    });
}

function forgetOptimistic(node) {
    const index = inflightOptimistic.findIndex((item) => item.node === node);
    if (index >= 0) inflightOptimistic.splice(index, 1);
}

function claimUniqueOptimistic(contactId, text) {
    const key = String(contactId || '');
    const value = String(text || '');
    const matches = pendingOptimisticFor(key).filter((item) => item.text === value);
    return matches.length === 1 ? matches[0].node : null;
}

function exceptionalParkedId(item) {
    if (!item) return '';
    const pending = pendingOptimisticFor(item.contactId).filter((entry) => entry.text === item.text);
    if (pending.length !== 1) return '';
    const ids = [];
    parkedLiveRows.forEach((row) => {
        const text = typeof row.content === 'string' ? row.content : '';
        if (text === item.text && row.id) ids.push(String(row.id));
    });
    return ids.length === 1 ? ids[0] : '';
}

function bindOptimisticSend(clientId, serverId) {
    const item = inflightOptimistic.find((entry) => entry.clientId === String(clientId || ''));
    if (!item) return;
    settleOptimisticNode(item.node, serverId ? String(serverId) : exceptionalParkedId(item));
}

function flushParkedLiveRows() {
    if (!currentChatContact || pendingOptimisticFor(currentChatContact.id).length) return;
    const openId = currentChatContact.conversationId || '';
    const ready = [];
    parkedLiveRows.forEach((row, id) => {
        if (openId && row.conversation_id && row.conversation_id !== openId) return;
        if (row.sender_id && getMyId() && row.sender_id !== getMyId()) return;
        ready.push(row);
        parkedLiveRows.delete(id);
    });
    ready.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
    const container = document.getElementById('chatMessagesContainer');
    const stick = threadIsNearBottom(container);
    ready.forEach((row) => {
        const messageId = row.id ? String(row.id) : '';
        if (messageId && container && container.querySelector(chatMessageSelector(messageId))) return;
        appendLiveChatMessage(row, { stickToBottom: stick, quiet: true });
    });
}

function settleOptimisticNode(node, serverId) {
    if (!node) return;
    forgetOptimistic(node);
    const id = serverId ? String(serverId) : '';
    const parked = id ? parkedLiveRows.get(id) : null;
    if (id) parkedLiveRows.delete(id);
    if (node.isConnected && id) {
        const container = node.parentElement;
        const duplicate = container ? container.querySelector(chatMessageSelector(id)) : null;
        if (duplicate && duplicate !== node) duplicate.remove();
        node.dataset.messageId = id;
    }
    if (node.isConnected) setOptimisticState(node, 'sent');
    if (parked && parked.is_read && id) markOwnBubbleRead(id);
    flushParkedLiveRows();
}

function inboxPreviewText(content) {
    const raw = typeof content === 'string' ? content.trim() : '';
    if (!raw || raw.charAt(0) === '{') return 'Nouveau message';
    return raw.replace(/\s+/g, ' ').slice(0, 140);
}

function publishChatActivity(detail) {
    window.dispatchEvent(new CustomEvent('lyann:chat-activity', { detail: detail || {} }));
}

function buildChatActionBar(msgId, isMe, authorName, text) {
    const bar = document.createElement('div');
    bar.className = 'chat-msg-action-bar';
    const reply = document.createElement('button');
    reply.type = 'button';
    reply.className = 'chat-msg-act-btn';
    reply.title = 'Répondre';
    reply.innerHTML = '<i class="ph ph-arrow-u-up-left"></i>';
    reply.addEventListener('click', () => window.quoteMessage(msgId, authorName, text));
    bar.appendChild(reply);
    if (isMe) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'chat-msg-act-btn danger';
        remove.title = 'Supprimer ce message';
        remove.innerHTML = '<i class="ph ph-trash"></i>';
        remove.addEventListener('click', () => window.deleteMessage(msgId));
        bar.appendChild(remove);
    }
    return bar;
}

function renderOptimisticChatMessage(msgObj) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container || !msgObj || msgObj.type !== 'text' || !currentChatContact) return null;

    const empty = container.querySelector('.chat-empty-state');
    if (empty) empty.remove();

    if (!container.querySelector('.chat-date-separator')) {
        const dateSep = document.createElement('div');
        dateSep.className = 'chat-date-separator';
        const span = document.createElement('span');
        span.textContent = "Aujourd'hui";
        dateSep.appendChild(span);
        container.appendChild(dateSep);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'chat-msg-bubble-wrap sent';
    wrapper.dataset.optimisticMessageId = msgObj.id || '';

    const bubble = document.createElement('div');
    bubble.className = 'chat-msg-bubble sent';

    const textNode = document.createElement('div');
    textNode.className = 'chat-msg-text';
    textNode.textContent = msgObj.text || '';
    bubble.appendChild(textNode);

    const meta = document.createElement('div');
    meta.className = 'chat-msg-time';
    const time = chatTimeLabel(msgObj.timestamp);
    meta.dataset.timeLabel = time;
    meta.dataset.optimisticStatus = 'sending';
    meta.textContent = time ? time + ' · Envoi…' : 'Envoi…';
    bubble.appendChild(meta);

    wrapper.appendChild(bubble);
    container.appendChild(wrapper);
    trackOptimistic(currentChatContact.id, wrapper, msgObj.text || '', msgObj.id || '');
    scrollThreadToBottom(container, false);
    return wrapper;
}

function renderOptimisticVisitCard(msgObj) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container || !msgObj || !currentChatContact) return null;
    container.querySelector('.chat-empty-state')?.remove();
    const node = renderTimelineCard({
        text: msgObj.text || '',
        sender: 'me',
        messageType: 'visit_proposed',
        type: 'visit_proposed',
        metadata: msgObj.metadata || {},
        createdAt: new Date().toISOString()
    });
    if (!node) return null;
    node.dataset.optimisticMessageId = msgObj.id || '';
    const status = document.createElement('div');
    status.className = 'chat-timeline-time';
    status.dataset.optimisticStatus = 'sending';
    const time = chatTimeLabel(msgObj.timestamp);
    status.dataset.timeLabel = time;
    status.textContent = time ? time + ' · Envoi…' : 'Envoi…';
    node.appendChild(status);
    container.appendChild(node);
    trackOptimistic(currentChatContact.id, node, msgObj.text || '', msgObj.id || '');
    scrollThreadToBottom(container, false);
    return node;
}

async function addMessageToContact(contactId, msgObj) {
    const userId = getMyId();
    const normalizedMsg = {
        ...msgObj,
        id: msgObj && msgObj.id ? msgObj.id : createOptimisticClientId(),
        sender: (msgObj && msgObj.sender) || 'me',
        timestamp: (msgObj && msgObj.timestamp) || Date.now()
    };

    const optimisticNode = normalizedMsg.messageType === 'visit_proposed'
        ? renderOptimisticVisitCard(normalizedMsg)
        : (normalizedMsg.type === 'text' ? renderOptimisticChatMessage(normalizedMsg) : null);
    if (optimisticNode) console.log('[CHAT] optimistic message');

    if (!userId || !isUUID(userId) || !isUUID(contactId) || !window.LYANN_API_CLIENT?.supabase) {
        forgetOptimistic(optimisticNode);
        setOptimisticState(optimisticNode, 'failed');
        flushParkedLiveRows();
        return;
    }

    await deliverTextMessage(contactId, normalizedMsg, optimisticNode);
}
window.addMessageToContact = addMessageToContact;

async function deliverTextMessage(contactId, normalizedMsg, optimisticNode) {
    const userId = getMyId();
    outgoingSends.set(normalizedMsg.id, {
        kind: 'text',
        contactId,
        clientId: normalizedMsg.id,
        text: normalizedMsg.text || '',
        node: optimisticNode
    });
    if (chatIsOffline()) {
        forgetOptimistic(optimisticNode);
        setOptimisticState(optimisticNode, 'offline');
        flushParkedLiveRows();
        return;
    }
    if (optimisticNode && !optimisticNode.dataset.messageId) {
        forgetOptimistic(optimisticNode);
        trackOptimistic(contactId, optimisticNode, normalizedMsg.text || '', normalizedMsg.id);
    }
    try {
        const { data: convRes } = await window.LYANN_API_CLIENT.getOrCreateConversation(userId, contactId);
        if (!convRes || !convRes.id) throw new Error("Impossible d'initialiser la conversation.");
        const sharedConvId = convRes.id;
        const contentToSave = normalizedMsg.type === 'transactional' ? JSON.stringify(normalizedMsg.txData) : normalizedMsg.text;
        const { data: sentRow, error: sendErr } = await window.LYANN_API_CLIENT.sendMessage(sharedConvId, userId, contentToSave, {
            clientMessageId: normalizedMsg.id,
            messageType: normalizedMsg.messageType || null,
            entityType: normalizedMsg.entityType || null,
            entityId: normalizedMsg.entityId || null,
            metadata: normalizedMsg.metadata || null
        });
        if (sendErr) throw sendErr;
        if (window.LYANN_MESSAGING_REPOSITORY) {
            window.LYANN_MESSAGING_REPOSITORY.invalidateConversation(userId, contactId, sharedConvId);
        }
        if (currentChatContact && currentChatContact.id === contactId) currentChatContact.conversationId = sharedConvId;
        console.log('[CHAT] insert confirmed');
        bindOptimisticSend(normalizedMsg.id, sentRow?.id);
        if (optimisticNode && sentRow?.created_at) optimisticNode.dataset.createdAt = sentRow.created_at;
        if (optimisticNode) console.log('[CHAT] reconciled');
        outgoingSends.delete(normalizedMsg.id);
        const noted = window.LYANN_MESSAGING_REPOSITORY?.noteIncomingPreview?.(userId, sharedConvId, contentToSave, sentRow?.created_at, { unread: false, message_type: normalizedMsg.messageType || null });
        publishChatActivity({
            contactId: noted?.contactId || contactId,
            preview: noted?.preview || inboxPreviewText(contentToSave),
            conversationId: sharedConvId,
            lastMessageAt: sentRow?.created_at || null,
            unread: false,
            name: noted?.name || currentChatContact?.name || '',
            avatar: noted?.avatar || ''
        });
    } catch (e) {
        console.warn('Supabase message send failed:', e?.message || e);
        const refused = /ne peut pas recevoir|user_blocked/i.test(String(e?.message || e?.hint || ''));
        if (refused && typeof chatToast === 'function') chatToast('Ce message n’a pas été envoyé.');
        forgetOptimistic(optimisticNode);
        setOptimisticState(optimisticNode, 'failed');
        flushParkedLiveRows();
    }
}

window.openPhotoLightbox = function (url) {
    const modal = document.getElementById('chatPhotoViewerModal');
    const img = document.getElementById('chatPhotoViewerImg');
    if (modal && img) {
        img.src = url;
        modal.style.display = 'flex';
    }
};

window.__LYANN_CHAT_CORE_OPEN = async function (name, avatar, contactId = name, initialNeed = null) {
    const openedAt = performance.now();
    const generation = ++threadGeneration;
    cancelDealContextRefresh();
    const isUUID = (str) => typeof window.isUUID === 'function' ? window.isUUID(str) : (typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));
    const openingDirect = Boolean(initialNeed && initialNeed.direct && !initialNeed.requestId);

    const myId = getMyId();
    if (contactId && myId && contactId === myId && contactId !== "me") {
        if (window.showToast) window.showToast("⚠️ Vous ne pouvez pas démarrer une mise en relation avec vous-même.", "warning");
        else if (window.lyannAlert) window.lyannAlert("⚠️ Vous ne pouvez pas démarrer une mise en relation avec vous-même.");
        return false;
    }

    const modal = document.getElementById('chatModal');
    if (!modal) {
        console.error('[MESSAGING] chat shell unavailable');
        return false;
    }

    let displayName = name;
    let displayAvatar = avatar;

    // Hydrate header immediately, but do not reveal the shell. The canonical
    // messaging controller owns when the fully prepared surface becomes visible.
    const initialHeaderName = document.getElementById('chatHeaderName');
    const initialHeaderAvatar = document.getElementById('chatHeaderAvatar');
    if (initialHeaderName) initialHeaderName.textContent = displayName || 'Membre LYANN';
    if (initialHeaderAvatar && (displayName === 'Support LYANN' || displayName === 'Aide LYANN')) initialHeaderAvatar.src = 'logo-app-256.png';
    else if (initialHeaderAvatar && displayAvatar) initialHeaderAvatar.src = displayAvatar;

    currentChatContact = { id: contactId, name: displayName, avatar: displayAvatar };
    if (typeof resetDossierCaches === 'function') resetDossierCaches();
    if (typeof dossierSession !== 'undefined' && dossierSession.clear) dossierSession.clear();
    noteDealContextConversation(currentChatContact);
    document.querySelectorAll('.chat-modal-layout').forEach(l => {
        l.classList.add('mobile-conversation-active', 'has-active-conversation');
    });
    const messageBox = document.getElementById('chatMessagesContainer');
    const warmedMessages = window.LYANN_MESSAGING_REPOSITORY?.peekMessages?.(myId, contactId);
    if (Array.isArray(warmedMessages)) {
        renderMessages(warmedMessages);
    } else if (messageBox) {
        messageBox.innerHTML = '<div class="chat-thread-pending" role="status">Chargement…</div>';
    }
    const paintedMs = Math.round(performance.now() - openedAt);
    window.__LYANN_THREAD_TIMING = Object.assign(window.__LYANN_THREAD_TIMING || {}, { paintedMs });
    console.info('[MESSAGING] thread shell ' + paintedMs + 'ms');

    const supportPromise = window.LYANN_SUPPORT_USER_ID || !window.LYANN_API_CLIENT?.getSupportUserId
        ? Promise.resolve(window.LYANN_SUPPORT_USER_ID || null)
        : window.LYANN_API_CLIENT.getSupportUserId().catch(() => null);
    const profilePromise = (async () => {
        const client = window.LYANN_API_CLIENT;
        if (!client || !contactId || !isUUID(contactId)) return null;
        if (typeof client.getPublicProfileWithReputation === 'function') {
            const pub = await client.getPublicProfileWithReputation(contactId).catch(() => null);
            if (pub && (pub.first_name || pub.last_name)) return pub;
        }
        if (typeof client.getUserProfile === 'function') {
            return client.getUserProfile(contactId).catch(() => null);
        }
        return null;
    })();
    const requestPromise = !openingDirect && contactId && isUUID(contactId) && window.LYANN_API_CLIENT?.supabase
        ? window.LYANN_API_CLIENT.supabase.from('requests').select('id, requester_id, title').eq('id', contactId).maybeSingle().then((res) => res && res.data).catch(() => null)
        : Promise.resolve(null);
    const [, prof, reqData] = await Promise.all([supportPromise, profilePromise, requestPromise]);
    if (generation !== threadGeneration) return false;

    if (reqData && reqData.requester_id && String(reqData.requester_id) !== String(contactId)) {
        if (!initialNeed) initialNeed = { requestId: reqData.id, requesterId: reqData.requester_id, title: reqData.title };
        contactId = reqData.requester_id;
        const switched = window.LYANN_MESSAGING_REPOSITORY?.peekMessages?.(getMyId(), contactId);
        if (Array.isArray(switched)) renderMessages(switched);
        else if (messageBox) messageBox.innerHTML = '<div class="chat-thread-pending" role="status">Chargement…</div>';
    }
    if (isLyannSupportContact(contactId)) {
        displayName = 'Support LYANN';
        displayAvatar = 'logo-app-256.png';
        initialNeed = null;
        currentChatContact.requestId = null;
        hideChatMissionChrome();
    } else if (prof) {
        displayName = window.formatPublicName ? window.formatPublicName(prof, null, 'Contact') : (prof.first_name || 'Contact');
        displayAvatar = window.getLyannAvatarUrl(prof.avatar_url);
    }

    if ((!displayName || displayName === "Lyanneur" || displayName === "Membre LYANN" || isUUID(displayName)) && isUUID(contactId)) {
        const warm = window.LYANN_MESSAGING_REPOSITORY && typeof window.LYANN_MESSAGING_REPOSITORY.peekConversations === 'function'
            ? window.LYANN_MESSAGING_REPOSITORY.peekConversations(getMyId())
            : null;
        const known = Array.isArray(warm) ? warm.find((row) => row && String(row.contactId) === String(contactId)) : null;
        if (known && known.name && known.name !== "Membre LYANN" && known.name !== "Lyanneur") displayName = known.name;
        else if (!displayName || displayName === "Lyanneur" || isUUID(displayName)) displayName = "Membre LYANN";
    }

    currentChatContact = { id: contactId, name: displayName, avatar: displayAvatar };
    if (initialNeed && initialNeed.requestId && !openingDirect) {
        currentChatContact.requestId = initialNeed.requestId;
        if (initialNeed.invitationId) currentChatContact.invitationId = initialNeed.invitationId;
        if (initialNeed.missionId) currentChatContact.missionId = initialNeed.missionId;
    }
    noteDealContextConversation(currentChatContact);
    if (openingDirect) {
        currentChatContact.direct = true;
        currentChatContact.requestId = null;
        try {
            const opened = await window.LYANN_API_CLIENT?.openDirectConversation?.(contactId);
            currentChatContact.startedBy = opened?.started_by || getMyId();
            if (opened?.conversation_id) currentChatContact.conversationId = opened.conversation_id;
        } catch (err) {
            currentChatContact.startedBy = getMyId();
        }
        hideChatMissionChrome();
    }
    if (isLyannSupportContact(contactId)) {
        currentChatContact.requestId = null;
        hideChatMissionChrome();
    }
    window.LYANN_ACTIVE_CHAT_CONTACT = { ...currentChatContact };
    
    try {
        localStorage.setItem('lyann_last_active_contact', JSON.stringify({ id: contactId, name: displayName, avatar: displayAvatar }));
    } catch(e) {}

    // Link conversation to request in DB safely via initiateLyannHelp (Step 17.4 Security Gate)
    if (!isLyannSupportContact(contactId) && initialNeed && initialNeed.requestId && window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.initiateLyannHelp === 'function') {
        try {
            const helpRes = await window.LYANN_API_CLIENT.initiateLyannHelp(initialNeed.requestId);
            if (helpRes && helpRes.error) {
                console.warn('[INITIATE HELP REJECTED]', helpRes.error.message || helpRes.error);
                if (typeof window.showToast === 'function') {
                    window.showToast(helpRes.error.message || 'Action non autorisée sur ce Lyann', 'error');
                }
            } else if (helpRes && helpRes.data && helpRes.data.conversation_id) {
                currentChatContact.conversationId = helpRes.data.conversation_id;
                currentChatContact.requestId = initialNeed.requestId;
                if (helpRes.data.invitation_id) currentChatContact.invitationId = helpRes.data.invitation_id;
            }
        } catch (e) {
            console.warn('[OPEN CHAT INITIATE HELP ERR]', e);
        }
    }

    const headerName = document.getElementById('chatHeaderName');
    const headerAvatar = document.getElementById('chatHeaderAvatar');
    if (headerName) headerName.textContent = displayName;
    if (headerAvatar) headerAvatar.src = displayAvatar;

    document.querySelectorAll('.chat-contact-item').forEach(item => {
        const cid = item.getAttribute('data-chat-member-id');
        if (cid === contactId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    if (document.body.classList.contains('chat-conversation-open')) {
        document.querySelectorAll('.chat-modal-layout').forEach(l => {
            l.classList.add('mobile-conversation-active');
        });
    }
    document.querySelectorAll('.chat-main-area, .chat-main-pane').forEach(m => {
        m.style.removeProperty('display');
    });

    window.dispatchEvent(new CustomEvent('lyann_chat_opened', { detail: { contactId } }));

    if (typeof window.renderChatContacts === 'function') {
        const inbox = document.getElementById('chatContactsList');
        if (!inbox || !inbox.querySelector('.chat-contact-item')) window.renderChatContacts();
    }

    if (typeof initChatCloseBtn === 'function') {
        initChatCloseBtn();
    }

    await refreshChatUI();
    if (generation === threadGeneration) {
        const readyMs = Math.round(performance.now() - openedAt);
        window.__LYANN_THREAD_TIMING = Object.assign(window.__LYANN_THREAD_TIMING || {}, { readyMs });
        console.info('[MESSAGING] thread ready ' + readyMs + 'ms');
    }
};

let chatRefreshInFlight = false;
let chatRefreshToken = 0;
let threadGeneration = 0;

async function loadPairDossiers(contact) {
    const api = window.LYANN_API_CLIENT;
    const dossierApi = window.LYANN_MISSION_DOSSIER;
    const myUserId = typeof getMyId === 'function' ? getMyId() : null;
    if (!api || !dossierApi || !contact || !myUserId || isLyannSupportContact(contact.id)) {
        if (contact) contact.dossiers = [];
        return [];
    }
    try {
        const invitationsPromise = typeof api.listAcceptedInvitationsBetween === 'function'
            ? api.listAcceptedInvitationsBetween(myUserId, contact.id, { limit: 50 })
            : Promise.resolve([]);
        const missionsPromise = typeof api.listMissionsBetween === 'function'
            ? api.listMissionsBetween(myUserId, contact.id)
            : Promise.resolve([]);
        const [invitations, missions] = await Promise.all([invitationsPromise, missionsPromise]);
        const invitationIds = (invitations || []).map((row) => row.id).filter(Boolean);
        const requestIds = [...new Set((invitations || []).map((row) => row.request_id).filter(Boolean)
            .concat((missions || []).map((row) => row.related_request_id || row.request_id).filter(Boolean)))];
        let quotes = [];
        let requests = [];
        if (api.supabase) {
            const seenQuotes = new Set();
            async function collectQuotes(column, ids) {
                if (!ids.length) return;
                const quoteRes = await api.supabase.from('quotes').select('*').in(column, ids).order('created_at', { ascending: false });
                if (quoteRes.error) return;
                (quoteRes.data || []).forEach((row) => {
                    if (!row || !row.id || seenQuotes.has(row.id)) return;
                    seenQuotes.add(row.id);
                    quotes.push(row);
                });
            }
            await collectQuotes('request_invitation_id', invitationIds);
            await collectQuotes('request_id', requestIds);
            const repo = window.LYANN_MESSAGING_REPOSITORY;
            if (quotes.length && repo && typeof repo.enrichQuotes === 'function') {
                try {
                    quotes = await repo.enrichQuotes(api, quotes);
                } catch (_) {}
            }
        }
        if (api.supabase && requestIds.length) {
            const reqRes = await api.supabase.from('requests').select('id,title,description,status,requester_id,visibility,target_user_id,location').in('id', requestIds);
            if (!reqRes.error) requests = reqRes.data || [];
        }
        const dossiers = dossierApi.listDossiers({
            viewerId: myUserId,
            conversationId: contact.conversationId,
            invitations: invitations || [],
            missions: missions || [],
            quotes,
            requests
        });
        contact.dossiers = dossiers;
        if (contact.activeDossier && dossierApi && typeof dossierApi.selectActiveDossier === 'function') {
            const kept = dossierApi.selectActiveDossier(dossiers, {
                requestId: contact.activeDossier.requestId,
                invitationId: contact.activeDossier.invitationId
            });
            if (kept.ok) contact.activeDossier = kept.dossier;
        }
        if (window.LYANN_ACTIVE_CHAT_CONTACT && window.LYANN_ACTIVE_CHAT_CONTACT.id === contact.id) {
            window.LYANN_ACTIVE_CHAT_CONTACT.dossiers = dossiers;
            window.LYANN_ACTIVE_CHAT_CONTACT.activeDossier = contact.activeDossier || null;
        }
        window.__lyannChatContact = contact;
        return dossiers;
    } catch (_) {
        contact.dossiers = contact.dossiers || [];
        return contact.dossiers;
    }
}

window.reloadPairDossiers = function () {
    if (!currentChatContact) return Promise.resolve([]);
    return loadPairDossiers(currentChatContact);
};

window.refreshChatUI = async function () {
    if (!currentChatContact) return;
    const token = ++chatRefreshToken;
    const contactId = currentChatContact.id;
    chatRefreshInFlight = true;
    try {
    // Re-arm only when switching threads — not on in-thread refreshes.
    if (dealRecapArmedForContactId !== String(contactId)) armDealRecapOpenBump(contactId);

    if (typeof window.updateChatFavHeaderUI === 'function') {
        window.updateChatFavHeaderUI();
    }

    if (!window.LYANN_SUPPORT_USER_ID && window.LYANN_API_CLIENT?.getSupportUserId) {
        try { await window.LYANN_API_CLIENT.getSupportUserId(); } catch (_) {}
    }
    const supportThread = isLyannSupportContact(currentChatContact.id);
    if (supportThread) {
        currentChatContact.requestId = null;
        currentChatContact.requestData = null;
        hideChatMissionChrome();
    }

    const myUserId = getMyId();
    let sharedConvId = currentChatContact.conversationId;
    if (supportThread && window.LYANN_API_CLIENT?.openSupportConversation) {
        try {
            const opened = await window.LYANN_API_CLIENT.openSupportConversation();
            if (opened?.data?.id) {
                sharedConvId = opened.data.id;
                currentChatContact.conversationId = sharedConvId;
            }
        } catch (_) {}
    } else if (!sharedConvId && window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.getOrCreateConversation === 'function' && currentChatContact.id && currentChatContact.id !== 'me') {
        try {
            const convRes = await window.LYANN_API_CLIENT.getOrCreateConversation(myUserId, currentChatContact.id);
            if (convRes && convRes.data && convRes.data.id) {
                sharedConvId = convRes.data.id;
                currentChatContact.conversationId = sharedConvId;
            }
        } catch(e) {}
    }
    if (token !== chatRefreshToken || currentChatContact?.id !== contactId) return;
    if (sharedConvId) {
        currentChatContact.conversationId = sharedConvId;
        if (window.LYANN_ACTIVE_CHAT_CONTACT) window.LYANN_ACTIVE_CHAT_CONTACT.conversationId = sharedConvId;
        void bindChatFanout(sharedConvId);
    }

    const messagesPromise = renderMessages(null, { fresh: true });

    // Context and mission are independent. Load them together so the banner
    // does not wait for a second round trip after the messages are visible.
    let requestContext = null;
    let mission = null;
    const reqHint = (currentChatContact && currentChatContact.requestId) ? currentChatContact.requestId : null;
    if (!supportThread && window.LYANN_API_CLIENT) {
        const contextPromise = typeof window.LYANN_API_CLIENT.getConversationRequestContext === 'function'
            ? window.LYANN_API_CLIENT.getConversationRequestContext(sharedConvId, reqHint)
            : null;
        const missionPromise = typeof window.LYANN_API_CLIENT.listMissionsBetween === 'function'
            ? window.LYANN_API_CLIENT.listMissionsBetween(myUserId, currentChatContact.id)
            : null;
        [requestContext, mission] = await Promise.all([contextPromise, missionPromise]);
        await loadPairDossiers(currentChatContact);
        paintPendingActionBanner();
        (currentChatContact.dossiers || []).forEach((dossier) => {
            (dossier.quotes || []).forEach((quote) => {
                if (!quote || String(quote.status || '').toUpperCase() !== 'ACCEPTED') return;
                const providerId = quote.provider_id || quote.helper_id;
                if (!providerId) return;
                ensurePayoutReadiness(providerId).then(() => {
                    if (token !== chatRefreshToken) return;
                    paintPendingActionBanner();
                    if (window.LYANN_MISSION_SURFACES && typeof window.LYANN_MISSION_SURFACES.syncOpenDossier === 'function') {
                        window.LYANN_MISSION_SURFACES.syncOpenDossier();
                    }
                }).catch(() => {});
            });
        });
    }
    if (token !== chatRefreshToken || currentChatContact?.id !== contactId) return;

    const explicitRequestId = currentChatContact.requestId || null;
    const listedThread = (window.LYANN_MESSAGING_REPOSITORY && typeof window.LYANN_MESSAGING_REPOSITORY.peekConversations === 'function')
        ? (window.LYANN_MESSAGING_REPOSITORY.peekConversations(myUserId) || []).find((item) => item && String(item.conversationId || '') === String(sharedConvId || ''))
        : null;
    const multiRequestThread = Boolean(listedThread && listedThread.multiRequest)
        || (Array.isArray(currentChatContact.dossiers) && currentChatContact.dossiers.length > 1);
    if (requestContext && requestContext.mismatchedHint) {
        requestContext = null;
    }
    if (multiRequestThread && !explicitRequestId) {
        requestContext = null;
    }
    if (requestContext && requestContext.startedBy) currentChatContact.startedBy = requestContext.startedBy;
    if (requestContext && requestContext.direct && !requestContext.request && !explicitRequestId) {
        currentChatContact.direct = true;
        currentChatContact.requestId = null;
        requestContext = null;
    }
    const privateRequest = Boolean(requestContext && requestContext.request && (requestContext.request.visibility === 'DIRECT' || requestContext.request.target_user_id));
    if (!explicitRequestId && currentChatContact?.direct && requestContext?.request && !privateRequest) {
        requestContext = null;
    }

    const banner = document.getElementById('chatMissionContextBar') || document.getElementById('chatMissionContext');
    const bannerTitle = document.getElementById('chatBannerTitle');
    const bannerMeta = document.getElementById('chatBannerMeta');
    const dropViewMission = document.getElementById('chatDropViewMission');

    if (!supportThread && explicitRequestId && (!requestContext || String(requestContext.requestId) !== String(explicitRequestId)) && window.LYANN_API_CLIENT?.supabase) {
        try {
            const hinted = await window.LYANN_API_CLIENT.supabase.from('requests').select('id, title, description, category, location, status, requester_id, visibility, target_user_id').eq('id', explicitRequestId).maybeSingle();
            if (hinted && hinted.data && hinted.data.id) {
                requestContext = {
                    requestId: hinted.data.id,
                    requesterId: hinted.data.requester_id,
                    request: hinted.data,
                    direct: hinted.data.visibility === 'DIRECT' || Boolean(hinted.data.target_user_id)
                };
            }
        } catch (_) {}
    }
    if (!supportThread && requestContext && requestContext.request) {
        if (!explicitRequestId && !multiRequestThread) currentChatContact.requestId = requestContext.requestId;
        currentChatContact.requestData = requestContext.request;
        if (privateRequest || (requestContext.request.visibility === 'DIRECT' || requestContext.request.target_user_id)) currentChatContact.direct = true;
    }
    if (!supportThread) {
        const chosenRequestId = explicitRequestId || (requestContext && requestContext.requestId) || null;
        let selection = window.LYANN_QUOTE_REVISION && window.LYANN_QUOTE_REVISION.selectThreadContext
            ? window.LYANN_QUOTE_REVISION.selectThreadContext({
                missions: Array.isArray(mission) ? mission : [],
                requestId: chosenRequestId
            })
            : { mission: null, ambiguous: false, requestId: chosenRequestId || null };
        // Unique open deal only. Several dossiers stay ambiguous — never the latest invitation.
        if (!chosenRequestId && !multiRequestThread && window.LYANN_QUOTE_REVISION && typeof window.LYANN_QUOTE_REVISION.resolveQuoteContextSelection === 'function') {
            const deal = window.LYANN_QUOTE_REVISION.resolveQuoteContextSelection({
                invitations: (currentChatContact.dossiers || []).map((row) => row.invitation).filter(Boolean),
                missions: Array.isArray(mission) ? mission : [],
                requestId: null
            });
            if (deal.ambiguous) {
                selection = { mission: null, ambiguous: true, requestId: null };
            } else if (deal.requestId) {
                selection = window.LYANN_QUOTE_REVISION.selectThreadContext({
                    missions: Array.isArray(mission) ? mission : [],
                    requestId: deal.requestId
                });
                if (!currentChatContact.requestId) currentChatContact.requestId = deal.requestId;
            }
        }
        currentChatContact.threadRequest = requestContext && requestContext.request ? requestContext : null;
        if (requestContext && requestContext.invitationId && (!multiRequestThread || explicitRequestId)) {
            currentChatContact.invitationId = requestContext.invitationId;
        }
        currentChatContact.threadMission = selection.mission || null;
        const dossierApi = window.LYANN_MISSION_DOSSIER;
        const dossierPick = dossierApi && typeof dossierApi.selectActiveDossier === 'function'
            ? dossierApi.selectActiveDossier(currentChatContact.dossiers || [], {
                requestId: explicitRequestId || currentChatContact.requestId || null,
                invitationId: currentChatContact.invitationId || null,
                missionId: currentChatContact.missionId || null
            })
            : { ok: false, ambiguous: multiRequestThread && !explicitRequestId, dossier: null };
        applyDossierToContact(
            currentChatContact,
            dossierPick.ok ? dossierPick.dossier : null,
            Boolean(selection.ambiguous) || Boolean(dossierPick.ambiguous) || (multiRequestThread && !explicitRequestId && !dossierPick.ok)
        );
        if (currentChatContact.missionAmbiguous) currentChatContact.threadMission = null;
        if (dossierPick.ok && dossierPick.dossier && dossierSession && dossierSession.begin) {
            dossierSession.begin(dossierPick.dossier.key);
        }
        paintThreadBusinessBanner();
    } else {
        hideChatMissionChrome();
    }

    // Hide floating separate actions toolbar completely (actions are integrated into the Context Card)
    const actionContainer = document.getElementById('chatContextualActionsBar');
    if (actionContainer) {
        actionContainer.style.display = 'none';
    }

    if (token !== chatRefreshToken || currentChatContact?.id !== contactId) return;
    await messagesPromise;
    if (token !== chatRefreshToken || currentChatContact?.id !== contactId) return;
    // E5.1: always rebuild ActionPanel from explicit E1 scope + server quote state.
    // Banner alone must never be the only chrome after context switch / empty thread.
    if (!supportThread) {
        noteDealContextConversation(currentChatContact);
        void refreshDealContext('thread-open');
    }
    if (currentChatContact && currentChatContact.conversationId) void bindChatFanout(currentChatContact.conversationId);
    } finally {
        if (token === chatRefreshToken) chatRefreshInFlight = false;
    }
}

const quoteActionLocks = new Set();

/**
 * E5 — run a deal mutation under mutex + conversation/request scope.
 * Late responses after switch are ignored (stale). On error, refresh server state before unlocking CTAs.
 */
async function runDealMutation(action, entityId, options = {}) {
    const opts = options || {};
    const scope = dealContextScopeFromContact(currentChatContact);
    if (dealMutationGuard) dealMutationGuard.setScope(scope);
    const handle = dealMutationGuard
        ? dealMutationGuard.begin(action, entityId, scope)
        : { key: String(action) + ':' + String(entityId || ''), token: 1, scope: '', generation: 0 };
    if (!handle) return { started: false, busy: true, apply: false, stale: false };

    const quoteId = opts.quoteId || null;
    const button = opts.button || null;
    const keepLockedOnSuccess = opts.keepLockedOnSuccess === true;
    if (quoteId) {
        quoteActionLocks.add(String(quoteId));
        disableCardButtons(quoteId);
    }
    if (button) setButtonBusy(button, true);

    let success = false;
    try {
        const result = await opts.execute(handle);
        const apply = !dealMutationGuard || dealMutationGuard.shouldApply(handle);
        if (!apply) return { started: true, busy: false, apply: false, stale: true, result };
        if (typeof opts.apply === 'function') await opts.apply(result, handle);
        success = true;
        return { started: true, busy: false, apply: true, stale: false, result };
    } catch (err) {
        const cancelled = !!(err && (err.dealMutationCancelled || err.message === '__deal_mutation_cancelled__'));
        const staleErr = !!(err && (err.dealMutationStale || err.message === '__deal_mutation_stale__'));
        if (!cancelled && !staleErr) {
            try {
                await refreshDealContext('mutation-error:' + action);
            } catch (_) { /* refresh best-effort before re-offer */ }
        }
        throw err;
    } finally {
        if (dealMutationGuard) dealMutationGuard.end(handle);
        const stillHere = !dealMutationGuard || dealMutationGuard.getActiveScope() === (handle.scope || dealMutationGuard.getActiveScope());
        if (!success || !keepLockedOnSuccess) {
            if (quoteId) quoteActionLocks.delete(String(quoteId));
            if (quoteId && stillHere) enableCardButtons(quoteId);
            if (button && button.isConnected) setButtonBusy(button, false);
        }
    }
}
window.__lyannRunDealMutation = runDealMutation;

function loadedQuoteForAccept(quoteId, source) {
    const id = String(quoteId || '');
    const cached = timelineQuotes.get(id);
    if (cached && cached.version != null && cached.version !== '') return cached;
    if (source && String(source.id || '') === id && source.version != null && source.version !== '') return source;
    const lists = [];
    const contact = currentChatContact;
    if (contact && Array.isArray(contact.dossiers)) {
        contact.dossiers.forEach((dossier) => {
            if (dossier && Array.isArray(dossier.quotes)) lists.push.apply(lists, dossier.quotes);
        });
    }
    if (contact && contact.activeDossier && Array.isArray(contact.activeDossier.quotes)) {
        lists.push.apply(lists, contact.activeDossier.quotes);
    }
    return lists.find((quote) => quote && String(quote.id) === id && quote.version != null && quote.version !== '') || cached || null;
}

window.handleAcceptQuote = async function(quoteId, sourceQuote) {
    if (!quoteId) return;
    if (quoteActionLocks.has(String(quoteId)) || (dealMutationGuard && dealMutationGuard.isBusy('accept', quoteId))) return;
    if (!await window.LYANN_ROUTER.requireAuthForInteraction('proposal', { quoteId, contactId: currentChatContact?.id })) {
        return;
    }
    try {
        const outcome = await runDealMutation('accept', quoteId, {
            quoteId,
            keepLockedOnSuccess: true,
            execute: async (handle) => {
                const knownVersion = loadedQuoteForAccept(quoteId, sourceQuote);
                if (knownVersion && knownVersion.status && String(knownVersion.status).toUpperCase() !== 'SENT') {
                    throw new Error('Ce devis ne peut plus être accepté.');
                }
                const version = knownVersion ? knownVersion.version : null;
                const acceptance = window.LYANN_QUOTE_REVISION && window.LYANN_QUOTE_REVISION.planQuoteAcceptance
                    ? window.LYANN_QUOTE_REVISION.planQuoteAcceptance(version)
                    : { ok: Number.isInteger(Number(version)) && Number(version) >= 1, version: Number(version) };
                if (!acceptance.ok) {
                    throw new Error(acceptance.message || 'Rechargez le devis avant de l’accepter.');
                }
                const forecast = window.LYANN_FINANCE_POLICY_UI && typeof window.LYANN_FINANCE_POLICY_UI.forecastQuoteCharges === 'function'
                    ? window.LYANN_FINANCE_POLICY_UI.forecastQuoteCharges(knownVersion && knownVersion.milestones)
                    : null;
                const eurosLabel = (cents) => (Number(cents) / 100).toFixed(2).replace('.', ',') + ' €';
                const amount = knownVersion && knownVersion.total_amount != null ? knownVersion.total_amount + ' €' : 'le montant affiché';
                const feeSentence = forecast && forecast.lines.length
                    ? ' Prestation ' + eurosLabel(forecast.serviceCents) + '. Frais de protection ' + eurosLabel(forecast.customerFeeCents) + (forecast.minimumCount ? ' (minimum 1,49 € par jalon).' : '.') + ' Total à régler ' + eurosLabel(forecast.customerTotalCents) + '.'
                    : '';
                if (window.lyannConfirm) {
                    const ok = await window.lyannConfirm('Accepter la version ' + acceptance.version + ' à ' + amount + ' ?' + feeSentence + ' Une mission sera créée. Une version plus ancienne ne peut plus être acceptée.');
                    if (!ok) {
                        const abort = new Error('__deal_mutation_cancelled__');
                        abort.dealMutationCancelled = true;
                        throw abort;
                    }
                }
                if (dealMutationGuard && !dealMutationGuard.shouldApply(handle)) {
                    const stale = new Error('__deal_mutation_stale__');
                    stale.dealMutationStale = true;
                    throw stale;
                }
                return window.LYANN_API_CLIENT.acceptRequestQuote(quoteId, acceptance.version);
            },
            apply: async (res) => {
                const known = timelineQuotes.get(String(quoteId)) || { id: quoteId };
                known.status = 'ACCEPTED';
                if (res && res.mission_id) known.mission_id = res.mission_id;
                timelineQuotes.set(String(quoteId), known);
                const contact = currentChatContact;
                const mark = (quote) => {
                    if (quote && String(quote.id) === String(quoteId)) quote.status = 'ACCEPTED';
                };
                if (contact && Array.isArray(contact.dossiers)) {
                    contact.dossiers.forEach((dossier) => (dossier.quotes || []).forEach(mark));
                }
                if (contact && contact.activeDossier && Array.isArray(contact.activeDossier.quotes)) {
                    contact.activeDossier.quotes.forEach(mark);
                }
                applyQuoteStatusToDom(quoteId, 'ACCEPTED');
                if (window.LYANN_MISSION_SURFACES && typeof window.LYANN_MISSION_SURFACES.syncOpenDossier === 'function') {
                    window.LYANN_MISSION_SURFACES.syncOpenDossier();
                }
                await refreshOpenBusinessCards();
            }
        });
        if (outcome && outcome.busy) return;
    } catch (err) {
        if (err && (err.dealMutationCancelled || err.message === '__deal_mutation_cancelled__')) return;
        if (err && (err.dealMutationStale || err.message === '__deal_mutation_stale__')) return;
        console.error("Erreur lors de l'acceptation du devis:", err);
        const message = String(err && err.message || '');
        const stale = /changé|version|Rechargez le devis|déjà été créée/i.test(message);
        const blocked = /ne peut plus être accepté|user_blocked/i.test(message);
        const readable = message && message.length < 180 && !/PGRST|schema cache|function/i.test(message);
        const shown = blocked ? 'Ce devis ne peut plus être accepté.' : (readable && stale ? message : (stale ? 'Ce devis a changé. Rechargez-le avant de l’accepter.' : 'Le devis n’a pas pu être accepté. Réessayez.'));
        if (window.lyannToast) window.lyannToast(shown, 'warning');
        else chatToast(shown);
    }
};

window.handleRejectQuote = async function(quoteId) {
    if (!quoteId) return;
    if (quoteActionLocks.has(quoteId) || (dealMutationGuard && dealMutationGuard.isBusy('decline', quoteId))) return;
    if (!await window.LYANN_ROUTER.requireAuthForInteraction('proposal', { quoteId, contactId: currentChatContact?.id })) {
        return;
    }
    try {
        const outcome = await runDealMutation('decline', quoteId, {
            quoteId,
            keepLockedOnSuccess: true,
            execute: async (handle) => {
                if (window.lyannConfirm) {
                    const ok = await window.lyannConfirm("Êtes-vous sûr de vouloir refuser ce devis ?");
                    if (!ok) {
                        const abort = new Error('__deal_mutation_cancelled__');
                        abort.dealMutationCancelled = true;
                        throw abort;
                    }
                }
                if (dealMutationGuard && !dealMutationGuard.shouldApply(handle)) {
                    const stale = new Error('__deal_mutation_stale__');
                    stale.dealMutationStale = true;
                    throw stale;
                }
                return window.LYANN_API_CLIENT.rejectRequestQuote(quoteId);
            },
            apply: async (res) => {
                console.log("⚡ Devis refusé via RPC Supabase:", res);
                const known = timelineQuotes.get(String(quoteId)) || { id: quoteId };
                known.status = 'REJECTED';
                timelineQuotes.set(String(quoteId), known);
                applyQuoteStatusToDom(quoteId, 'REJECTED');
                ensureQuoteDeclinedNotice(known);
                if (typeof paintThreadBusinessBanner === 'function') paintThreadBusinessBanner();
                await refreshOpenBusinessCards();
            }
        });
        if (outcome && outcome.busy) return;
    } catch (err) {
        if (err && (err.dealMutationCancelled || err.message === '__deal_mutation_cancelled__')) return;
        if (err && (err.dealMutationStale || err.message === '__deal_mutation_stale__')) return;
        console.error("Erreur lors du refus du devis:", err);
        chatToast('Le devis n’a pas pu être refusé. Réessayez.');
    }
};

window.openPreviousQuoteVersion = function(quoteId) {
    const quote = timelineQuotes.get(String(quoteId));
    const previous = quote && quote.previousRevision;
    if (!previous) {
        if (window.lyannAlert) window.lyannAlert('La version précédente n’est pas disponible.');
        return;
    }
    const existing = document.getElementById('quotePreviousVersion');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'quotePreviousVersion';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:10040; background:rgba(15,23,42,0.45); display:flex; align-items:flex-end; justify-content:center; padding:12px;';
    const panel = document.createElement('div');
    panel.className = 'chat-timeline-card';
    panel.style.cssText = 'width:min(520px, 100%); background:#fff; border-radius:18px; padding:16px;';
    const heading = document.createElement('div');
    heading.className = 'chat-timeline-title';
    heading.textContent = 'Version ' + (previous.version || 1);
    const amount = document.createElement('div');
    amount.className = 'chat-timeline-amount';
    amount.textContent = (previous.total_amount != null ? previous.total_amount : '—') + ' €';
    const description = document.createElement('div');
    description.className = 'chat-timeline-meta';
    description.textContent = previous.description || '';
    panel.append(heading, amount, description);
    (Array.isArray(previous.milestones) ? previous.milestones : []).forEach((milestone) => {
        const line = document.createElement('div');
        line.className = 'chat-timeline-meta';
        line.textContent = (milestone.title || 'Partie') + (milestone.amount != null ? ' · ' + milestone.amount + ' €' : '');
        panel.appendChild(line);
    });
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-outline';
    close.style.marginTop = '12px';
    close.textContent = 'Fermer';
    close.addEventListener('click', () => overlay.remove());
    panel.appendChild(close);
    overlay.appendChild(panel);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
};

function quoteRevisionRows(quote) {
    return (quote && quote.milestones || [])
        .slice()
        .sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0))
        .map((milestone) => ({
            title: milestone.title || '',
            description: milestone.description || '',
            amount: milestone.amount != null ? String(milestone.amount) : ''
        }));
}

function closeQuoteRevision() {
    const overlay = document.getElementById('quoteRevisionOverlay');
    if (overlay) overlay.remove();
}

window.openQuoteRevision = function(quoteId) {
    const quote = timelineQuotes.get(String(quoteId));
    const revision = window.LYANN_QUOTE_REVISION;
    if (!revision) {
        if (window.lyannAlert) window.lyannAlert('La modification du devis est indisponible.');
        return;
    }
    const decision = revision.assessRevision(quote, getMyId());
    if (!decision.ok) {
        if (window.lyannAlert) window.lyannAlert(decision.message);
        return;
    }
    closeQuoteRevision();
    const rows = quoteRevisionRows(quote);
    if (!rows.length) rows.push({ title: '', description: '', amount: '' });
    const overlay = document.createElement('div');
    overlay.id = 'quoteRevisionOverlay';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:10040; background:rgba(15,23,42,0.45); display:flex; align-items:flex-end; justify-content:center; padding:12px;';
    const panel = document.createElement('form');
    panel.style.cssText = 'width:min(560px, 100%); max-height:min(88vh, 760px); overflow:auto; background:#fff; border-radius:18px; padding:16px; display:flex; flex-direction:column; gap:10px;';
    const title = document.createElement('h3');
    title.style.margin = '0';
    title.textContent = rows.length > 1 ? 'Modifier le devis par jalons' : 'Modifier le devis';
    const hint = document.createElement('p');
    hint.style.cssText = 'margin:0; font-size:0.82rem; color:#64748b;';
    hint.textContent = 'Version ' + decision.version + '. Le client devra voir cette version avant toute acceptation. Aucun paiement n’est lancé.';
    const descriptionLabel = document.createElement('label');
    descriptionLabel.textContent = 'Description et conditions';
    descriptionLabel.style.fontWeight = '700';
    const description = document.createElement('textarea');
    description.required = true;
    description.rows = 3;
    description.value = quote.description || '';
    description.style.cssText = 'width:100%; box-sizing:border-box; border:1px solid #e2e8f0; border-radius:12px; padding:8px;';
    const dateLabel = document.createElement('label');
    dateLabel.textContent = 'Valable jusqu’au';
    dateLabel.style.fontWeight = '700';
    const validUntil = document.createElement('input');
    validUntil.type = 'date';
    if (quote.valid_until) validUntil.value = String(quote.valid_until).slice(0, 10);
    validUntil.style.cssText = 'width:100%; box-sizing:border-box; border:1px solid #e2e8f0; border-radius:12px; padding:8px; min-height:44px;';
    const list = document.createElement('div');
    const totalLine = document.createElement('p');
    totalLine.style.cssText = 'margin:0; font-weight:800;';
    function readRows() {
        return [...list.querySelectorAll('[data-revision-row]')].map((row) => ({
            title: row.querySelector('[data-field="title"]').value,
            description: row.querySelector('[data-field="description"]').value,
            amount: row.querySelector('[data-field="amount"]').value
        }));
    }
    function paintRows(nextRows) {
        list.replaceChildren();
        nextRows.forEach((row, index) => {
            const card = document.createElement('div');
            card.dataset.revisionRow = '1';
            card.style.cssText = 'border:1px solid #e2e8f0; border-radius:12px; padding:10px; margin-bottom:8px; display:flex; flex-direction:column; gap:6px;';
            const head = document.createElement('div');
            head.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:8px;';
            const label = document.createElement('strong');
            label.textContent = nextRows.length === 1 ? 'Prestation' : 'Jalon ' + (index + 1);
            const moves = document.createElement('div');
            moves.style.display = 'flex';
            const up = document.createElement('button');
            up.type = 'button';
            up.textContent = 'Monter';
            up.disabled = index === 0;
            up.style.minHeight = '36px';
            const down = document.createElement('button');
            down.type = 'button';
            down.textContent = 'Descendre';
            down.disabled = index === nextRows.length - 1;
            down.style.minHeight = '36px';
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = 'Retirer';
            remove.disabled = nextRows.length === 1;
            remove.style.minHeight = '36px';
            up.addEventListener('click', () => {
                const current = readRows();
                const swap = current[index - 1];
                current[index - 1] = current[index];
                current[index] = swap;
                paintRows(current);
            });
            down.addEventListener('click', () => {
                const current = readRows();
                const swap = current[index + 1];
                current[index + 1] = current[index];
                current[index] = swap;
                paintRows(current);
            });
            remove.addEventListener('click', () => {
                const current = readRows();
                current.splice(index, 1);
                paintRows(current);
            });
            moves.append(up, down, remove);
            head.append(label, moves);
            const titleInput = document.createElement('input');
            titleInput.dataset.field = 'title';
            titleInput.placeholder = 'Titre';
            titleInput.value = row.title || '';
            titleInput.required = true;
            titleInput.style.cssText = 'min-height:40px; border:1px solid #e2e8f0; border-radius:10px; padding:6px 8px;';
            const detailInput = document.createElement('input');
            detailInput.dataset.field = 'description';
            detailInput.placeholder = 'Détail, facultatif';
            detailInput.value = row.description || '';
            detailInput.style.cssText = titleInput.style.cssText;
            const amountInput = document.createElement('input');
            amountInput.dataset.field = 'amount';
            amountInput.type = 'number';
            amountInput.min = '0.01';
            amountInput.step = '0.01';
            amountInput.inputMode = 'decimal';
            amountInput.placeholder = 'Montant €';
            amountInput.value = row.amount || '';
            amountInput.required = true;
            amountInput.style.cssText = titleInput.style.cssText;
            amountInput.addEventListener('input', updateTotal);
            card.append(head, titleInput, detailInput, amountInput);
            list.appendChild(card);
        });
        updateTotal();
    }
    function updateTotal() {
        const checked = revision.validateMilestones(readRows());
        totalLine.textContent = checked.ok ? 'Total : ' + checked.totalAmount.toFixed(2) + ' €' : 'Le total suit la somme des montants.';
    }
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-outline';
    add.textContent = 'Ajouter un jalon';
    add.addEventListener('click', () => {
        const current = readRows();
        if (current.length >= revision.MAX_MILESTONES) return;
        current.push({ title: '', description: '', amount: '' });
        paintRows(current);
    });
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex; gap:8px;';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-outline';
    cancel.style.flex = '1';
    cancel.textContent = 'Annuler';
    cancel.addEventListener('click', closeQuoteRevision);
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'btn btn-primary';
    save.style.flex = '1';
    save.textContent = 'Enregistrer la nouvelle version';
    actions.append(cancel, save);
    panel.append(title, hint, descriptionLabel, description, dateLabel, validUntil, list, totalLine, add, actions);
    overlay.appendChild(panel);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeQuoteRevision();
    });
    panel.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (save.disabled || (dealMutationGuard && dealMutationGuard.isBusy('revise', quoteId))) return;
        const latest = timelineQuotes.get(String(quoteId)) || quote;
        const payload = revision.validateRevision({
            quote: latest,
            callerId: getMyId(),
            description: description.value,
            milestones: readRows(),
            expectedVersion: Number(latest.version) || decision.version
        });
        if (!payload.ok) {
            if (window.lyannAlert) window.lyannAlert(payload.message);
            return;
        }
        try {
            await runDealMutation('revise', quoteId, {
                quoteId,
                button: save,
                execute: async (handle) => {
                    if (!window.LYANN_API_CLIENT || typeof window.LYANN_API_CLIENT.reviseSentQuote !== 'function') {
                        throw new Error('La modification du devis n’est pas encore activée.');
                    }
                    const validUntilValue = validUntil.value ? new Date(validUntil.value + 'T23:59:59').toISOString() : null;
                    if (dealMutationGuard && !dealMutationGuard.shouldApply(handle)) {
                        const stale = new Error('__deal_mutation_stale__');
                        stale.dealMutationStale = true;
                        throw stale;
                    }
                    return window.LYANN_API_CLIENT.reviseSentQuote(
                        quoteId,
                        payload.description,
                        validUntilValue,
                        payload.milestones,
                        payload.version
                    );
                },
                apply: async () => {
                    closeQuoteRevision();
                    await refreshOpenBusinessCards();
                    if (typeof chatToast === 'function') chatToast('Devis mis à jour. Le client voit la nouvelle version.');
                }
            });
        } catch (err) {
            if (err && (err.dealMutationStale || err.message === '__deal_mutation_stale__')) return;
            const message = String(err && err.message || '');
            const friendly = /revise_sent_quote|could not find the function|schema cache/i.test(message)
                ? 'La modification du devis n’est pas encore activée.'
                : (message || 'Le devis n’a pas pu être modifié.');
            if (window.lyannAlert) window.lyannAlert(friendly);
            if (save.isConnected) {
                save.disabled = false;
                save.textContent = 'Enregistrer la nouvelle version';
            }
        }
    });
    document.body.appendChild(overlay);
    paintRows(rows);
    description.focus();
};

function isRpcNoiseMessage(text) {
    const raw = String(text || '');
    return /n['’]est plus ouvert aux propositions|La demande liée n['’]est plus ouverte|statut actuel:\s*[A-Z_]+/i.test(raw);
}

function notifyQuoteUnavailable(err) {
    const raw = (err && err.message) ? String(err.message) : 'Proposition indisponible.';
    if (isRpcNoiseMessage(raw)) {
        const human = 'Cette demande n’accepte plus de nouvelles propositions pour le moment.';
        if (window.showToast) window.showToast(human, 'info');
        else if (window.lyannAlert) window.lyannAlert(human);
        return;
    }
    const msg = (typeof window.lyannSanitizeUserMessage === 'function')
        ? window.lyannSanitizeUserMessage(raw)
        : raw;
    if (window.showToast) window.showToast(msg, 'error');
    else if (window.lyannAlert) window.lyannAlert(msg);
    else alert(msg);
}

async function createProductionQuoteForContact(contactId, description, amount, milestones) {
    if (!window.LYANN_API_CLIENT || typeof window.LYANN_API_CLIENT.createRequestQuote !== 'function') {
        throw new Error('Proposition indisponible : le contrat de devis n’est pas disponible.');
    }
    const myId = typeof getMyId === 'function' ? getMyId() : null;
    if (!myId || !contactId) {
        throw new Error('Proposition indisponible : aucun interlocuteur identifié.');
    }
    const requestId = currentChatContact && currentChatContact.requestId;
    let activeInv = null;
    if (requestId) {
        if (typeof window.LYANN_API_CLIENT.getAcceptedInvitationForRequest !== 'function') {
            throw new Error('Proposition indisponible : cette annonce ne peut pas recevoir de devis.');
        }
        const found = await window.LYANN_API_CLIENT.getAcceptedInvitationForRequest(requestId, myId, contactId);
        if (found && found.ambiguous) {
            throw new Error('Plusieurs échanges existent pour cette annonce. Rechargez la conversation avant de proposer un devis.');
        }
        if (!found || !found.id || String(found.request_id) !== String(requestId) || String(found.recipient_id) !== String(myId)) {
            const requesterId = currentChatContact.requestData?.requester_id || currentChatContact.threadRequest?.requesterId;
            if (requesterId && String(requesterId) === String(myId)) {
                throw new Error('C’est le Lyanneur invité qui envoie le devis pour cette annonce.');
            }
            throw new Error('Aucun échange accepté pour vous sur cette annonce. Rouvrez-la avec Lyanner, puis proposez le devis.');
        }
        activeInv = found;
    } else if (currentChatContact?.direct && typeof window.LYANN_API_CLIENT.prepareDirectOffer === 'function') {
        activeInv = await window.LYANN_API_CLIENT.prepareDirectOffer(contactId).then((prepared) => prepared?.invitation_id ? { id: prepared.invitation_id, request_id: prepared.request_id || null } : null);
    }
    if (!activeInv || !activeInv.id) {
        throw new Error('Choisissez l’annonce avant de proposer un devis.');
    }
    const parsedAmount = Number(amount);
    const milestonePayload = milestones || [{
        title: description || 'Tarif proposé',
        description: description || 'Tarif convenu',
        amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
        percentage: 100
    }];
    const created = await window.LYANN_API_CLIENT.createRequestQuote(activeInv.id, description, null, milestonePayload);
    invalidateActiveQuoteContext();
    return created;
}

function invalidateActiveQuoteContext() {
    const contact = currentChatContact || window.LYANN_ACTIVE_CHAT_CONTACT;
    if (window.LYANN_MESSAGING_REPOSITORY && contact && contact.id && typeof getMyId === 'function') {
        window.LYANN_MESSAGING_REPOSITORY.invalidateQuoteContext(getMyId(), contact.id);
    }
}

/** Options for getQuoteContext — always pass the thread's request/invitation when known. */
function threadQuoteContextOptions(extra = {}) {
    const contact = currentChatContact || window.LYANN_ACTIVE_CHAT_CONTACT || {};
    const threadRequest = contact.threadRequest || null;
    return Object.assign({}, extra, {
        requestId: contact.requestId || (threadRequest && threadRequest.requestId) || null,
        invitationId: contact.invitationId
            || (threadRequest && threadRequest.invitationId)
            || null,
        missionId: (contact.threadMission && contact.threadMission.id) || contact.missionId || null,
        conversationId: contact.conversationId || null
    });
}

function applyQuoteContextMeta(quotes, contact) {
    if (!contact || !quotes) return quotes;
    if (quotes.ambiguous) {
        contact.missionAmbiguous = true;
        contact.threadMission = null;
        return quotes;
    }
    if (quotes.requestId && !contact.requestId && !contact.missionAmbiguous) {
        contact.requestId = quotes.requestId;
    }
    if (quotes.invitationId && !contact.invitationId && !contact.missionAmbiguous) contact.invitationId = quotes.invitationId;
    return quotes;
}

function quoteLooksFunded(quotes) {
    const list = Array.isArray(quotes) ? quotes : [];
    const payment = window.LYANN_QUOTE_PAYMENT;
    if (payment && typeof payment.missionPhase === 'function') {
        if (list.some((quote) => {
            const phase = payment.missionPhase(quote);
            return phase === 'prestation' || phase === 'validation' || phase === 'closed';
        })) return true;
    }
    return list.some((quote) => {
        const milestoneFunded = (quote.milestones || []).some((m) => {
            const st = m && m.status;
            return st === 'FUNDED' || st === 'IN_PROGRESS' || st === 'COMPLETED' || st === 'VALIDATED' || st === 'RELEASED';
        });
        const paymentSucceeded = (quote.payments || []).some((p) => p && p.payment_status === 'SUCCEEDED');
        return milestoneFunded || paymentSucceeded;
    });
}

window.lyannAwaitPaidQuote = async function lyannAwaitPaidQuote() {
    // E5: never invent FUNDED — re-read server deal state after Stripe, including webhook lag.
    const waits = [0, 450, 900, 1600, 2400];
    let outcome = null;
    let funded = false;
    for (let i = 0; i < waits.length; i += 1) {
        if (waits[i]) await new Promise((resolve) => setTimeout(resolve, waits[i]));
        if (currentChatContact && typeof loadPairDossiers === 'function') {
            try { await loadPairDossiers(currentChatContact); } catch (_) {}
        }
        outcome = await refreshDealContext('payment-confirm');
        const quotes = outcome && Array.isArray(outcome.quotes) ? outcome.quotes : [];
        const dossierQuotes = (currentChatContact && Array.isArray(currentChatContact.dossiers))
            ? currentChatContact.dossiers.flatMap((row) => row && Array.isArray(row.quotes) ? row.quotes : [])
            : [];
        funded = quoteLooksFunded(quotes.length ? quotes : dossierQuotes);
        syncLiveDealActions(quotes.length ? quotes : dossierQuotes);
        if (funded) break;
        if (typeof openConversationIsVisible === 'function' && !openConversationIsVisible()) break;
    }
    return { outcome, funded: !!funded, serverValidated: !!funded };
};

function isPersistedUuid(id) {
    return typeof window.isUUID === 'function'
        ? window.isUUID(id)
        : (typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
}

async function resolveChatMilestoneId(preferredId, statuses) {
    const contact = currentChatContact || window.LYANN_ACTIVE_CHAT_CONTACT;
    if (!window.LYANN_MESSAGING_REPOSITORY || !contact || !contact.id) return null;
    const quotes = applyQuoteContextMeta(
        await window.LYANN_MESSAGING_REPOSITORY.getQuoteContext(getMyId(), contact.id, threadQuoteContextOptions({ fresh: true })),
        contact
    );
    const milestones = (quotes || []).flatMap((quote) => (quote.milestones || []).map((milestone) => ({
        ...milestone,
        quoteId: quote.id,
        quoteStatus: quote.status
    })));
    const wanted = Array.isArray(statuses) && statuses.length ? statuses : null;
    const eligible = milestones.filter((milestone) => milestone && isPersistedUuid(milestone.id) && (!wanted || wanted.includes(milestone.status)));
    if (isPersistedUuid(preferredId)) {
        const explicit = eligible.find((milestone) => milestone.id === preferredId);
        return explicit ? explicit.id : null;
    }
    if (eligible.length === 1) return eligible[0].id;
    const accepted = eligible.filter((milestone) => milestone.quoteStatus === 'ACCEPTED');
    if (accepted.length === 1) return accepted[0].id;
    return null;
}
window.resolveChatMilestoneId = resolveChatMilestoneId;

function notifyActionUnavailable(err) {
    const msg = (err && err.message) ? String(err.message) : 'Action indisponible.';
    if (window.showToast) window.showToast(msg, 'error');
    else if (window.lyannAlert) window.lyannAlert(msg);
    else alert(msg);
}

async function handleChatAction(actionId, missionOrExtra = null, extraDataInput = null) {
    if (!await window.LYANN_ROUTER.requireAuthForInteraction('proposal', { actionId, contactId: currentChatContact?.id, requestId: currentChatContact?.requestId })) return;
    const extraData = (missionOrExtra && missionOrExtra.quoteId) ? missionOrExtra : (extraDataInput || {});
    const mission = (missionOrExtra && !missionOrExtra.quoteId) ? missionOrExtra : null;
    const contactId = currentChatContact ? currentChatContact.id : null;
    if (!contactId) return;
    const isMissionUuid = (id) => typeof window.isUUID === 'function'
        ? window.isUUID(id)
        : (typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
        const refuseUnlinkedMission = (label) => {
        if (window.lyannAlert) {
            window.lyannAlert(`${label} indisponible : cette action n’est pas liée à un jalon enregistré.`);
        }
        return false;
    };

    if (actionId === 'DIRECT_ASK') {
        if (typeof window.openLyannWizard === 'function') {
            window.openLyannWizard({ directContactId: contactId, directContactName: currentChatContact?.name || 'cette personne' });
        }
        return;
    }
    if (actionId === 'DIRECT_OFFER') {
        return handleChatAction('MAKE_PROPOSAL', mission);
    }

    if (actionId === 'MAKE_PROPOSAL' || actionId === 'PROPOSE_PRICE') {
        closeAllOverlays();
        const chatActionChoicesOverlay = document.getElementById('chatActionChoicesOverlay');
        if (chatActionChoicesOverlay) {
            openChatChildSurface('chatActionChoicesOverlay');
            setChatContextCoveredByOverlay(true);
        } else {
            const amount = await window.lyannPrompt("Quel montant proposez-vous (en €) ?");
            if (!amount) return;
            const desc = await window.lyannPrompt("Description de votre proposition (ex: Réparation portail) :");
            if (!desc) return;
            const amountCheck = window.LYANN_QUOTE_REVISION && window.LYANN_QUOTE_REVISION.validateQuoteAmount
                ? window.LYANN_QUOTE_REVISION.validateQuoteAmount(amount)
                : { ok: Number(amount) > 0, amount: Number(amount) };
            if (!amountCheck.ok) {
                notifyQuoteUnavailable(new Error(amountCheck.message || 'Indiquez un montant supérieur à 0 €.'));
                return;
            }

            try {
                await createProductionQuoteForContact(contactId, desc, amountCheck.amount);
            } catch (err) {
                notifyQuoteUnavailable(err);
                return;
            }
            if (typeof refreshChatUI === 'function') refreshOpenBusinessCards();
        }
    }
    else if (actionId === 'PROPOSE_DATE') {
        closeAllOverlays();
        const overlay = document.getElementById('chatProposeDateForm');
        if (overlay) {
            openChatChildSurface('chatProposeDateForm');
            setChatContextCoveredByOverlay(true);
            const firstRequired = overlay.querySelector('[required]');
            if (firstRequired) requestAnimationFrame(() => firstRequired.focus());
        } else {
            const dateStr = await window.lyannPrompt("Proposer une date d'intervention (ex: Demain 14h, ou 25 Octobre) :");
            if (!dateStr) return;
            addMessageToContact(contactId, {
                type: 'text',
                sender: getMyId(),
                text: `📅 Proposition de rendez-vous : ${dateStr}`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            refreshOpenBusinessCards();
        }
        return;
    }

    else if (actionId === 'REQUEST_HELP') {
        return handleChatAction('DIRECT_ASK', mission);
    }

    else if (actionId === 'DISCUSS_PRICE' || actionId === 'COUNTER_OFFER') {
        closeAllOverlays();
        const overlay = document.getElementById('chatDirectPriceForm');
        if (overlay) {
            openChatChildSurface(overlay.id);
            setChatContextCoveredByOverlay(true);
            const titleEl = overlay.querySelector('.mobile-form-title');
            if (titleEl) titleEl.textContent = "Discuter du prix";
        }
        return;
    }

    else if (actionId === 'ACCEPT_PROPOSAL' || actionId === 'ACCEPT_PRICE' || actionId === 'ACCEPT_QUOTE') {
        const quoteId = extraData.quoteId || (missionOrExtra && missionOrExtra.quoteId) || null;
        const proposalId = extraData.proposalId || (missionOrExtra && missionOrExtra.proposalId) || null;
        if (quoteId) {
            await window.handleAcceptQuote(quoteId);
            return;
        }
        if (proposalId && window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.acceptProposalSecure === 'function') {
            try {
                const res = await window.LYANN_API_CLIENT.acceptProposalSecure(proposalId);
                if (res && res.error) {
                    if (window.lyannAlert) window.lyannAlert(res.error.message || res.error);
                    return;
                }
                console.log("⚡ Proposition acceptée via RPC Supabase Production:", res);
                if (typeof window.showToast === 'function') window.showToast("Proposition acceptée ! La mission est activée.", "success");
                refreshOpenBusinessCards();
                return;
            } catch (err) {
                console.warn("Erreur acceptation Proposition Supabase:", err);
                if (window.lyannAlert) window.lyannAlert("Erreur lors de l'acceptation : " + (err.message || err));
                return;
            }
        }
        return refuseUnlinkedMission('Acceptation');
    }
    else if (actionId === 'REJECT_QUOTE') {
        const rejectId = extraData && extraData.quoteId;
        if (rejectId) {
            await window.handleRejectQuote(rejectId);
            return;
        }
        refreshOpenBusinessCards();
    }

    else if (actionId === 'PAY_MISSION') {
        const payingQuote = quoteForPayAction(extraData);
        const payEntity = (extraData && extraData.milestoneId) || (mission && mission.id) || 'pay';
        if (dealMutationGuard && dealMutationGuard.isBusy('pay', payEntity)) return;
        if (payingQuote && payoutBlocksPayment(payingQuote)) {
            const prompt = payoutPromptForQuote(payingQuote);
            chatToast(prompt && prompt.title ? prompt.title : 'Le compte de versement n’est pas encore prêt.');
            return;
        }
        const payableMilestoneId = extraData && extraData.milestoneId;
        if (!isMissionUuid(payableMilestoneId) && !(mission && isMissionUuid(mission.id))) {
            return refuseUnlinkedMission('Paiement');
        }
        try {
            await runDealMutation('pay', payEntity, {
                quoteId: payingQuote && payingQuote.id,
                execute: async (handle) => {
                    const coPrestationTitle = document.getElementById('coPrestationTitle');
                    const coDevisAmount = document.getElementById('coDevisAmount');
                    const coLyannFee = document.getElementById('coLyannFee');
                    const coTotalAmount = document.getElementById('coTotalAmount');

                    const title = mission.title || 'Intervention LYANN';
                    if (coPrestationTitle) coPrestationTitle.textContent = title;
                    if (coDevisAmount) coDevisAmount.textContent = 'Calcul…';
                    if (coLyannFee) coLyannFee.textContent = 'Calcul…';
                    if (coTotalAmount) coTotalAmount.textContent = 'Calcul…';

                    closeAllOverlays();
                    const chatCheckoutOverlay = document.getElementById('chatCheckoutOverlay');
                    if (!chatCheckoutOverlay) {
                        throw new Error('Paiement indisponible : le portail de paiement n’est pas disponible sur cet écran.');
                    }
                    const milestoneId = await resolveChatMilestoneId(
                        extraData.milestoneId || (mission && mission.milestoneId),
                        ['PENDING']
                    );
                    if (dealMutationGuard && !dealMutationGuard.shouldApply(handle)) {
                        const stale = new Error('__deal_mutation_stale__');
                        stale.dealMutationStale = true;
                        throw stale;
                    }
                    if (milestoneId) chatCheckoutOverlay.dataset.milestoneId = milestoneId;
                    else delete chatCheckoutOverlay.dataset.milestoneId;
                    openChatChildSurface('chatCheckoutOverlay');
                    const ensureStripeCheckout = () => {
                        if (window.LYANN_STRIPE && typeof window.LYANN_STRIPE.prepareCheckout === 'function') {
                            return Promise.resolve();
                        }
                        if (window.LYANN_FEATURES && typeof window.LYANN_FEATURES.ensure === 'function') {
                            return window.LYANN_FEATURES.ensure('stripeCheckout');
                        }
                        return new Promise((resolve, reject) => {
                            const script = document.createElement('script');
                            script.src = 'lyann-stripe.js?v=20260922v';
                            script.addEventListener('load', resolve, { once: true });
                            script.addEventListener('error', () => reject(new Error('Stripe checkout unavailable')), { once: true });
                            document.head.appendChild(script);
                        });
                    };
                    await ensureStripeCheckout();
                    if (!window.LYANN_STRIPE || typeof window.LYANN_STRIPE.prepareCheckout !== 'function') {
                        throw new Error('Paiement indisponible.');
                    }
                    const payBtn = document.getElementById('btnConfirmCheckoutPay');
                    if (payBtn) payBtn.disabled = true;
                    const prepared = await window.LYANN_STRIPE.prepareCheckout(milestoneId);
                    if (dealMutationGuard && !dealMutationGuard.shouldApply(handle)) {
                        const stale = new Error('__deal_mutation_stale__');
                        stale.dealMutationStale = true;
                        throw stale;
                    }
                    const amounts = prepared && prepared.data && prepared.data.amounts;
                    if (amounts) applyServerCheckoutAmounts(amounts);
                    else clearCheckoutAmountPlaceholders();
                    if (prepared && prepared.error && !(prepared.data && prepared.data.client_secret)) throw prepared.error;
                    return prepared;
                }
            });
        } catch (err) {
            if (err && (err.dealMutationStale || err.message === '__deal_mutation_stale__')) return;
            notifyActionUnavailable(err && err.message ? err : { message: err && err.message ? err.message : 'Paiement indisponible.' });
        }
        return;
    }

    else if (actionId === 'MARK_DONE') {
        const preferred = extraData.milestoneId || (mission && mission.milestoneId);
        const lockKey = preferred || (mission && mission.id) || 'done';
        if (dealMutationGuard && dealMutationGuard.isBusy('done', lockKey)) return;
        try {
            await runDealMutation('done', lockKey, {
                execute: async (handle) => {
                    const milestoneId = await resolveChatMilestoneId(preferred, ['FUNDED', 'IN_PROGRESS']);
                    if (!milestoneId || !window.LYANN_API_CLIENT || typeof window.LYANN_API_CLIENT.submitMilestoneCompletion !== 'function') {
                        throw new Error('Clôture indisponible : cette action n’est pas liée à un jalon enregistré.');
                    }
                    if (dealMutationGuard && !dealMutationGuard.shouldApply(handle)) {
                        const stale = new Error('__deal_mutation_stale__');
                        stale.dealMutationStale = true;
                        throw stale;
                    }
                    const result = await window.LYANN_API_CLIENT.submitMilestoneCompletion(milestoneId);
                    if (result && result.error) throw result.error;
                    return result;
                },
                apply: async (result) => {
                    if (typeof window.showToast === 'function') {
                        window.showToast((result && result.data && result.data.message) || 'Prestation déclarée réalisée, en attente de validation.', 'success');
                    }
                    invalidateActiveQuoteContext();
                    await refreshOpenBusinessCards();
                }
            });
        } catch (err) {
            if (err && (err.dealMutationStale || err.message === '__deal_mutation_stale__')) return;
            notifyActionUnavailable(err);
        }
        return;
    }

    else if (actionId === 'CONFIRM_DONE') {
        const preferred = extraData.milestoneId || (mission && mission.milestoneId);
        const lockKey = preferred || (mission && mission.id) || 'confirm';
        if (dealMutationGuard && dealMutationGuard.isBusy('confirm', lockKey)) return;
        try {
            await runDealMutation('confirm', lockKey, {
                execute: async (handle) => {
                    const milestoneId = await resolveChatMilestoneId(preferred, ['COMPLETED']);
                    if (!milestoneId || !window.LYANN_API_CLIENT || typeof window.LYANN_API_CLIENT.releaseMilestonePayment !== 'function') {
                        throw new Error('Validation indisponible : cette action n’est pas liée à un jalon enregistré.');
                    }
                    if (dealMutationGuard && !dealMutationGuard.shouldApply(handle)) {
                        const stale = new Error('__deal_mutation_stale__');
                        stale.dealMutationStale = true;
                        throw stale;
                    }
                    return window.LYANN_API_CLIENT.releaseMilestonePayment(milestoneId);
                },
                apply: async (result) => {
                    if (typeof window.showToast === 'function') {
                        window.showToast((result && result.message) || 'Validation enregistrée.', 'success');
                    }
                    invalidateActiveQuoteContext();
                    await refreshOpenBusinessCards();
                }
            });
        } catch (err) {
            if (err && (err.dealMutationStale || err.message === '__deal_mutation_stale__')) return;
            notifyActionUnavailable(err);
        }
        return;
    }

    else if (actionId === 'LEAVE_REVIEW') {
        closeAllOverlays();
        const overlay = document.getElementById('chatLeaveReviewForm');
        if (overlay) {
            openChatChildSurface('chatLeaveReviewForm');
            setChatContextCoveredByOverlay(true);
        }
        return;
    }

    else if (actionId === 'RECOMMEND') {
        addMessageToContact(contactId, {
            type: 'text',
            sender: getMyId(),
            text: `⭐ Je recommande vivement ${currentChatContact ? currentChatContact.name : 'ce membre'} pour son professionnalisme sur LYANN !`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        if (window.lyannAlert) window.lyannAlert("Recommandation publiée dans la discussion !");
    }

    else if (actionId === 'REPORT_PROBLEM') {
        const reason = await window.lyannPrompt("Quel est le problème ?");
        if (!reason) return;
        const milestoneId = await resolveChatMilestoneId(
            extraData.milestoneId || (mission && mission.milestoneId),
            null
        );
        if (!milestoneId || !window.LYANN_API_CLIENT || typeof window.LYANN_API_CLIENT.raiseMilestoneDispute !== 'function') {
            return refuseUnlinkedMission('Signalement');
        }
        try {
            await window.LYANN_API_CLIENT.raiseMilestoneDispute(milestoneId, reason);
        } catch (err) {
            notifyActionUnavailable(err);
            return;
        }
        refreshOpenBusinessCards();
        return;
    }

    refreshOpenBusinessCards();
    window.dispatchEvent(new CustomEvent('lyann_chat_action_taken', { detail: { actionId, contactId } }));
}

window.deleteMessage = async function(msgId) {
    if (!currentChatContact || !msgId) return;
    if (!isPersistedUuid(msgId) || !window.LYANN_API_CLIENT?.supabase) {
        notifyActionUnavailable({ message: 'Suppression indisponible : ce message n’est pas enregistré côté serveur.' });
        return;
    }
    const { error } = await window.LYANN_API_CLIENT.supabase.from('messages').delete().eq('id', msgId);
    if (error) {
        notifyActionUnavailable({ message: 'Suppression indisponible : le contrat messages autorise l’envoi et la lecture, pas l’effacement.' });
        return;
    }
    const conversationId = window.LYANN_MESSAGING_REPOSITORY && typeof window.LYANN_MESSAGING_REPOSITORY.findConversationId === 'function'
        ? await window.LYANN_MESSAGING_REPOSITORY.findConversationId(getMyId(), currentChatContact.id)
        : null;
    if (window.LYANN_MESSAGING_REPOSITORY) {
        window.LYANN_MESSAGING_REPOSITORY.invalidateMessages(conversationId);
    }
    if (typeof renderMessages === 'function') await renderMessages();
};

let activeReplyTo = null;

window.quoteMessage = function(msgId, author, text) {
    activeReplyTo = { id: msgId, author: author, text: text };
    const replyBar = document.getElementById('chatReplyBar');
    const replyAuthor = document.getElementById('chatReplyAuthor');
    const replyText = document.getElementById('chatReplyText');
    if (replyBar && replyAuthor && replyText) {
        replyAuthor.textContent = `Réponse à ${author}`;
        replyText.textContent = text;
        replyBar.style.display = 'flex';
    }
    const inputField = document.getElementById('chatInputField');
    if (inputField) inputField.focus();
};

window.cancelQuoteMessage = function() {
    activeReplyTo = null;
    const replyBar = document.getElementById('chatReplyBar');
    if (replyBar) replyBar.style.display = 'none';
};

window.toggleMessageReaction = function(msgId, emoji) {
    notifyActionUnavailable({ message: 'Réaction indisponible : aucun champ de réaction n’existe sur les messages serveur.' });
};

function renderEmptyConversationState(container) {
    if (!container) return;
    const supportThread = isLyannSupportContact();
    const title = supportThread ? 'Support LYANN' : 'Aucun message';
    const text = supportThread
        ? 'Écrivez-nous ici pour toute question ou aide sur l’application.'
        : 'Écrivez le premier message.';
    container.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'chat-empty-state is-compact';
    const heading = document.createElement('p');
    heading.className = 'chat-empty-title';
    heading.textContent = title;
    const detail = document.createElement('p');
    detail.textContent = text;
    empty.append(heading, detail);
    container.appendChild(empty);
}

let chatRenderGeneration = 0;

function clearCheckoutAmountPlaceholders() {
    ['coDevisAmount', 'coLyannFee', 'coTotalAmount'].forEach((id) => {
        const node = document.getElementById(id);
        if (!node) return;
        const text = node.textContent.trim();
        if (text === '…' || text === 'Calcul…') node.textContent = '—';
    });
}

function applyServerCheckoutAmounts(amounts) {
    if (!amounts) return;
    const euros = (cents) => (Number(cents) / 100).toFixed(2) + ' €';
    const base = document.getElementById('coDevisAmount');
    const fee = document.getElementById('coLyannFee');
    const total = document.getElementById('coTotalAmount');
    if (base && amounts.service_amount_cents != null) base.textContent = euros(amounts.service_amount_cents);
    if (fee && amounts.customer_fee_cents != null) fee.textContent = euros(amounts.customer_fee_cents);
    if (total && amounts.customer_total_cents != null) total.textContent = euros(amounts.customer_total_cents);
    const service = Number(amounts.service_amount_cents);
    const customerFee = Number(amounts.customer_fee_cents);
    const rawFee = Number.isFinite(service) ? Math.floor((service * 3 + 50) / 100) : null;
    let note = document.getElementById('coLyannFeeNote');
    if (fee && !note) {
        note = document.createElement('p');
        note.id = 'coLyannFeeNote';
        note.style.cssText = 'margin:6px 0 0;font-size:0.78rem;line-height:1.35;color:#3F5C49;';
        const row = fee.closest('div');
        if (row && row.parentNode) row.parentNode.insertBefore(note, row.nextSibling);
    }
    if (note) {
        note.textContent = customerFee === 149 && rawFee != null && rawFee < 149
            ? 'Le minimum de 1,49 € s’applique à ce jalon. Il n’est pas calculé une seule fois pour tout le devis.'
            : 'Ces frais sont calculés sur ce jalon seulement.';
    }
}
window.applyServerCheckoutAmounts = applyServerCheckoutAmounts;

function isQuoteAcceptedNotice(text) {
    return String(text || '').trim().toLowerCase() === 'devis accepté';
}

function appendQuoteAcceptedNotice(container, messageId) {
    if (!container) return;
    if (messageId && container.querySelector(`[data-message-id="${messageId}"]`)) return;
    const notice = document.createElement('div');
    notice.className = 'chat-msg-card align-left';
    notice.style.cssText = 'margin: 12px auto; max-width: 440px; width: 100%;';
    if (messageId) notice.dataset.messageId = String(messageId);
    notice.innerHTML = `
        <div class="chat-card-header"><i class="ph-fill ph-check-circle" style="color:#15803d"></i> Devis accepté</div>
        <div class="chat-card-body">
            <div>Le paiement est validé. Le devis est accepté.</div>
        </div>
    `;
    container.appendChild(notice);
}

const TIMELINE_LABELS = {
    visit_proposed: '📅 Visite proposée',
    visit_accepted: '✓ Visite acceptée',
    visit_declined: 'Visite refusée',
    visit_rescheduled: '📅 Visite proposée',
    quote_created: '📄 Devis proposé',
    quote_updated: '📄 Devis proposé',
    quote_accepted: '✅ Devis accepté',
    quote_declined: 'Devis refusé',
    payment_requested: '💳 Paiement demandé',
    payment_secured: '🔒 Fonds sécurisés',
    payment_failed: '❌ Paiement échoué',
    milestone_created: '🔨 Jalon',
    milestone_completed: '✓ Travail déclaré terminé',
    milestone_approved: '✅ Jalon validé',
    funds_released: '💶 Fonds libérés',
    mission_started: 'Mission commencée',
    mission_completed: 'Mission terminée',
    mission_cancelled: 'Mission annulée',
    review_requested: 'Avis demandé',
    review_submitted: 'Avis publié'
};
const timelineQuotes = new Map();
const dossierSession = (window.LYANN_MISSION_DOSSIER && typeof window.LYANN_MISSION_DOSSIER.createDossierSession === 'function')
    ? window.LYANN_MISSION_DOSSIER.createDossierSession()
    : { begin() { return 1; }, clear() { return 1; }, isCurrent() { return true; }, generation() { return 1; }, activeKey() { return ''; } };

function resetDossierCaches() {
    timelineQuotes.clear();
    window.__lyannChatRequestId = null;
}

function isTimelineMessage(msg) {
    const type = msg && (msg.messageType || msg.type);
    return !!(type && Object.prototype.hasOwnProperty.call(TIMELINE_LABELS, type) && type !== 'text' && type !== 'photo' && type !== 'document');
}

function quoteTimelineSelector(quoteId) {
    return '[data-entity-type="quote"][data-entity-id="' + CSS.escape(String(quoteId)) + '"]';
}

function placeThreadNode(container, node) {
    if (!container || !node) return;
    if (!node.dataset.createdAt) {
        container.appendChild(node);
        return;
    }
    const cursor = { createdAt: node.dataset.createdAt, id: node.dataset.messageId || '' };
    const next = [...container.querySelectorAll('[data-message-id][data-created-at]')]
        .find((item) => compareCursor({ createdAt: item.dataset.createdAt, id: item.dataset.messageId }, cursor) > 0);
    if (next) container.insertBefore(node, next);
    else container.appendChild(node);
}

function setButtonBusy(button, busy) {
    if (!button) return;
    if (busy) {
        if (!button.isConnected) return;
        if (button.dataset.lyannBusyLabel == null) {
            button.dataset.lyannBusyLabel = button.innerHTML;
        }
        button.disabled = true;
        button.classList.add('is-busy');
        button.setAttribute('aria-busy', 'true');
        if (!button.querySelector('.lyann-btn-spin')) {
            button.innerHTML = '<i class="ph ph-circle-notch lyann-btn-spin" aria-hidden="true"></i>';
        }
        return;
    }
    button.disabled = false;
    button.classList.remove('is-busy');
    button.removeAttribute('aria-busy');
    if (button.dataset.lyannBusyLabel != null) {
        button.innerHTML = button.dataset.lyannBusyLabel;
        delete button.dataset.lyannBusyLabel;
    }
}

function quoteActionButtons(quoteId) {
    const box = document.getElementById('chatMessagesContainer');
    if (!box || !quoteId) return [];
    const id = CSS.escape(String(quoteId));
    return [...box.querySelectorAll(
        '[data-live-quote-id="' + id + '"] button, ' +
        quoteTimelineSelector(quoteId) + ' button, ' +
        '[data-deal-recap="' + id + '"] button'
    )];
}

function disableCardButtons(quoteId) {
    quoteActionButtons(quoteId).forEach((button) => setButtonBusy(button, true));
}

function enableCardButtons(quoteId) {
    quoteActionButtons(quoteId).forEach((button) => setButtonBusy(button, false));
}

function quoteDeclineNodeSelector(quoteId) {
    return '[data-message-type="quote_declined"][data-entity-id="' + CSS.escape(String(quoteId)) + '"]';
}

function ensureQuoteDeclinedNotice(quote, row) {
    const box = document.getElementById('chatMessagesContainer');
    const quoteId = quote && quote.id;
    if (!box || !quoteId) return;
    if (!dealEventBelongsToActiveDossier(quote, row)) return;
    const copy = window.LYANN_QUOTE_PAYMENT && typeof window.LYANN_QUOTE_PAYMENT.quoteDeclineCopy === 'function'
        ? window.LYANN_QUOTE_PAYMENT.quoteDeclineCopy(quote, typeof getMyId === 'function' ? getMyId() : null)
        : { headline: 'Le devis a été refusé.', next: '' };
    const existing = box.querySelector(quoteDeclineNodeSelector(quoteId));
    if (existing) {
        const state = existing.querySelector('.chat-timeline-state');
        if (state) state.textContent = copy.headline;
        let next = existing.querySelector('.chat-timeline-meta');
        if (copy.next && !next) {
            next = document.createElement('div');
            next.className = 'chat-timeline-meta';
            const body = existing.querySelector('.chat-timeline-body') || existing;
            body.appendChild(next);
        }
        if (next && copy.next) next.textContent = copy.next;
        return;
    }
    const createdAt = (row && (row.created_at || row.createdAt)) || new Date().toISOString();
    const node = renderTimelineCard({
        id: (row && row.id) || ('quote-declined-' + quoteId),
        createdAt: createdAt,
        timestamp: createdAt ? Date.parse(createdAt) : Date.now(),
        messageType: 'quote_declined',
        entityType: 'quote',
        entityId: quoteId,
        sender: 'them',
        metadata: Object.assign({}, (row && row.metadata) || {}, {
            amount: quote.total_amount,
            status: 'REJECTED',
            provider_id: quote.provider_id || quote.helper_id
        })
    });
    if (!node) return;
    placeThreadNode(box, node);
    if (threadIsNearBottom(box)) scrollThreadToBottom(box, false);
}

function applyQuoteStatusToDom(quoteId, status) {
    const box = document.getElementById('chatMessagesContainer');
    if (!box || !quoteId) return;
    box.querySelectorAll('[data-live-quote-id="' + CSS.escape(String(quoteId)) + '"], ' + quoteTimelineSelector(quoteId)).forEach((node) => {
        node.dataset.quoteStatus = status;
        let state = node.querySelector('.chat-timeline-state');
        if (!state) {
            state = document.createElement('div');
            state.className = 'chat-timeline-state';
            node.appendChild(state);
        }
        state.textContent = status === 'ACCEPTED' ? '✓ Accepté' : status === 'REJECTED' ? 'Devis refusé' : '';
    });
    window.dispatchEvent(new CustomEvent('lyann:quote-status', {
        detail: { status, contactId: window.LYANN_ACTIVE_CHAT_CONTACT?.id || null }
    }));
}

async function respondVisit(messageId, decision, button) {
    const actions = button && button.parentElement;
    if (actions) actions.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    const result = await window.LYANN_API_CLIENT?.respondToVisit?.(messageId, decision);
    if (result?.error) {
        if (actions) actions.querySelectorAll('button').forEach((item) => { item.disabled = false; });
        chatToast('Cette action n’a pas abouti. Réessayez.');
        console.warn('[CHAT] visit reply failed');
    }
}

function fundingActionForOpenQuotes() {
    const payment = window.LYANN_QUOTE_PAYMENT;
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    if (!payment || !userId) return null;
    let found = null;
    timelineQuotes.forEach((quote) => {
        if (found || !quote || !quote.milestones) return;
        const next = payment.nextFundingAction(quote, userId);
        if (next) found = next;
    });
    return found;
}

function appendFundingAction(parent) {
    // E2: keep waiting copy on timeline; MARK_DONE / CONFIRM_DONE live only on missionCard.
    const next = fundingActionForOpenQuotes();
    if (!next || !parent || !next.waiting) return;
    const line = document.createElement('div');
    line.className = 'chat-timeline-meta';
    line.textContent = next.waiting;
    parent.appendChild(line);
}

function repaintFundingCards(box) {
    if (!box) return;
    box.querySelectorAll('[data-message-type="payment_secured"], [data-message-type="milestone_completed"]').forEach((node) => {
        const replacement = renderTimelineCard({
            id: node.dataset.messageId,
            createdAt: node.dataset.createdAt,
            timestamp: node.dataset.createdAt ? Date.parse(node.dataset.createdAt) : null,
            messageType: node.dataset.messageType || 'payment_secured',
            entityType: node.dataset.entityType,
            entityId: node.dataset.entityId,
            sender: 'them'
        });
        node.replaceWith(replacement);
    });
}

function renderDealRecapCard(quote) {
    const payment = window.LYANN_QUOTE_PAYMENT;
    if (!payment || !quote) return null;
    const recap = payment.dealRecap(quote);
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-timeline-card';
    wrapper.dataset.dealRecap = String(quote.id);
    const title = document.createElement('div');
    title.className = 'chat-timeline-title';
    title.textContent = recap.title;
    wrapper.appendChild(title);
    recap.lines.forEach((line) => {
        const row = document.createElement('div');
        row.className = 'chat-timeline-meta';
        row.textContent = line.label + ' · ' + line.value;
        wrapper.appendChild(row);
    });
    // E2: informational history only — pay / done / validate live on missionCard.
    const next = payment.nextFundingAction(quote, userId);
    if (next && next.waiting && !recap.released) {
        const wait = document.createElement('div');
        wait.className = 'chat-timeline-meta';
        wait.textContent = next.waiting;
        wrapper.appendChild(wait);
    }
    return wrapper;
}

function actionPanelRequestMeta(quote) {
    const contact = currentChatContact || window.LYANN_ACTIVE_CHAT_CONTACT || {};
    const request = (contact.threadRequest && contact.threadRequest.request) || contact.requestData || null;
    return {
        requestTitle: (request && request.title)
            || contact.annonceTitle
            || (quote && quote.request_title)
            || '',
        requestId: (quote && quote.request_id)
            || contact.requestId
            || (contact.threadRequest && contact.threadRequest.requestId)
            || null
    };
}

function renderActionPanelShell(view, quote) {
    const card = document.createElement('article');
    card.className = 'chat-mission-card chat-action-panel';
    if (view.panelKind && view.panelKind !== 'action') card.classList.add('is-neutral');
    if (view.mode) card.dataset.panelMode = view.mode;
    if (view.panelKind) card.dataset.panelKind = view.panelKind;
    card.dataset.actionPanel = '1';
    if (view.quoteId) card.dataset.dealRecap = String(view.quoteId);
    if (view.requestId) card.dataset.requestId = String(view.requestId);
    if (view.missionId) card.dataset.missionId = String(view.missionId);
    if (view.dealType) card.dataset.dealType = view.dealType;
    if (view.phase) card.dataset.phase = view.phase;
    if (view.actorToAct) card.dataset.actor = view.actorToAct;

    const kickerBits = [];
    if (view.dealTypeLabel) kickerBits.push(view.dealTypeLabel);
    if (view.annonceTitle) kickerBits.push(view.annonceTitle);
    if (kickerBits.length) {
        const kicker = document.createElement('p');
        kicker.className = 'chat-mission-kicker';
        kicker.textContent = kickerBits.join(' · ');
        card.appendChild(kicker);
    }

    const head = document.createElement('div');
    head.className = 'chat-mission-head';
    const title = document.createElement('h3');
    title.textContent = view.title || 'Suivi de mission';
    head.appendChild(title);
    if (view.amount) {
        const amount = document.createElement('strong');
        amount.textContent = view.amount;
        head.appendChild(amount);
    }
    card.appendChild(head);

    const status = document.createElement('p');
    status.className = 'chat-mission-status';
    status.textContent = view.status || '';
    card.appendChild(status);

    if (view.actorLabel) {
        const actor = document.createElement('p');
        actor.className = 'chat-mission-actor';
        actor.textContent = view.actorLabel;
        card.appendChild(actor);
    }

    if (view.showSteps && Array.isArray(view.steps) && view.steps.length) {
        const steps = document.createElement('ol');
        steps.className = 'chat-mission-steps';
        view.steps.forEach((step) => {
            const item = document.createElement('li');
            item.dataset.state = step.state;
            item.textContent = step.label;
            steps.appendChild(item);
        });
        card.appendChild(steps);
    }

    if (view.context) {
        const context = document.createElement('p');
        context.className = 'chat-mission-context';
        context.textContent = view.context;
        card.appendChild(context);
    }

    const actionList = [];
    if (view.primaryAction) actionList.push(view.primaryAction);
    (view.secondaryActions || []).forEach((action) => actionList.push(action));
    if (!actionList.length && Array.isArray(view.actions)) {
        view.actions.forEach((action) => actionList.push(action));
    }
    if (quote && actionList.length) {
        const actions = document.createElement('div');
        actions.className = 'chat-mission-actions';
        actionList.forEach((action) => bindMissionAction(actions, quote, action));
        card.appendChild(actions);
    }

    if (quote && Array.isArray(view.details) && view.details.length > 1) {
        const details = document.createElement('details');
        details.className = 'chat-mission-details';
        const summary = document.createElement('summary');
        summary.textContent = 'Voir les jalons';
        details.appendChild(summary);
        view.details.forEach((line) => {
            const row = document.createElement('div');
            row.className = 'chat-mission-milestone';
            if (line.paymentState) row.dataset.paymentState = line.paymentState;
            const label = document.createElement('span');
            label.textContent = line.title + (line.amount ? ' · ' + line.amount : '');
            row.appendChild(label);
            if (line.action) bindMissionAction(row, quote, line.action);
            details.appendChild(row);
        });
        card.appendChild(details);
    }
    return card;
}

function renderNeutralActionPanel(kind, meta) {
    const payment = window.LYANN_QUOTE_PAYMENT;
    if (!payment || typeof payment.actionPanelNeutral !== 'function') return null;
    const view = payment.actionPanelNeutral(kind, meta || {});
    return renderActionPanelShell(view, null);
}

function renderMissionCard(quote) {
    const payment = window.LYANN_QUOTE_PAYMENT;
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    if (!payment || !payment.missionCard || !quote || !userId) return null;
    const providerId = quote.provider_id || quote.helper_id;
    const readiness = payoutReadinessByUser.get(String(providerId || '')) || 'unknown';
    const revision = window.LYANN_QUOTE_REVISION;
    const reviseOk = !!(revision && typeof revision.assessRevision === 'function' && revision.assessRevision(quote, userId).ok);
    const meta = actionPanelRequestMeta(quote);
    const view = payment.missionCard(quote, userId, readiness, Object.assign({}, meta, { reviseOk }));
    if (!view) return null;
    // E3: revise is modeled as secondary CTA in the ActionPanel view model when reviseOk.
    // Compat: if an older payment module omitted it, keep the secondary revise home on missionCard only.
    if (reviseOk && !view.actions.some((action) => action.id === 'revise')) {
        const revise = { id: 'revise', label: 'Modifier le devis', tone: 'secondary' };
        view.actions.push(revise);
        view.secondaryActions = (view.secondaryActions || []).concat([revise]);
    }
    return renderActionPanelShell(view, quote);
}

function reportableMilestone(quotes) {
    const list = Array.isArray(quotes) ? quotes : [];
    for (let i = 0; i < list.length; i += 1) {
        const milestones = (list[i] && list[i].milestones) || [];
        for (let j = 0; j < milestones.length; j += 1) {
            const status = String(milestones[j] && milestones[j].status || '').toUpperCase();
            if (['FUNDED', 'IN_PROGRESS', 'COMPLETED'].includes(status) && milestones[j].id) return milestones[j];
        }
    }
    return null;
}

function hydrateQuoteForDossier(quote, dossier) {
    if (!quote) return null;
    const next = Object.assign({}, quote);
    if (!next.mission_id && dossier && dossier.mission && dossier.mission.id) next.mission_id = dossier.mission.id;
    if (!next.mission_status && dossier && dossier.mission && dossier.mission.status) next.mission_status = dossier.mission.status;
    if (!Array.isArray(next.milestones)) next.milestones = [];
    if (!Array.isArray(next.payments)) next.payments = [];
    if (!next.request_id && dossier && dossier.requestId) next.request_id = dossier.requestId;
    if (!next.request_title && dossier && dossier.title) next.request_title = dossier.title;
    return next;
}

function paintDossierActions(host, dossier, quotes) {
    if (!host || !dossier) return;
    host.replaceChildren();
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    const dossierApi = window.LYANN_MISSION_DOSSIER;
    const scoped = (quotes || dossier.quotes || []).filter((quote) => {
        if (!quote) return false;
        if (!dossierApi || typeof dossierApi.quoteBelongsToDossier !== 'function') return true;
        return dossierApi.quoteBelongsToDossier(quote, dossier);
    });
    const rawQuote = window.LYANN_MISSION_SURFACES && typeof window.LYANN_MISSION_SURFACES.relevantQuote === 'function'
        ? window.LYANN_MISSION_SURFACES.relevantQuote(Object.assign({}, dossier, { quotes: scoped }))
        : scoped[0] || null;
    const quote = hydrateQuoteForDossier(rawQuote, dossier);
    const requestContext = {
        request: dossier.request || null,
        requesterId: dossier.requesterId,
        requestId: dossier.requestId,
        invitationId: dossier.invitationId
    };
    const gate = threadQuoteProposalGate(requestContext, dossier.mission, scoped, userId);
    const revision = window.LYANN_QUOTE_REVISION;
    const reviseOk = !!(quote && revision && typeof revision.assessRevision === 'function' && revision.assessRevision(quote, userId).ok);
    const payment = window.LYANN_QUOTE_PAYMENT;
    const providerId = quote ? String(quote.provider_id || quote.helper_id || '') : '';
    const accepted = quote && String(quote.status || '').toUpperCase() === 'ACCEPTED';
    const readinessKnown = !!(providerId && payoutReadinessByUser.has(providerId));
    const checking = !!(accepted && providerId && !readinessKnown);
    if (checking) {
        ensurePayoutReadiness(providerId).then(() => {
            if (!host.isConnected) return;
            paintDossierActions(host, dossier, quotes);
            paintPendingActionBanner();
        }).catch(() => {});
    }
    let view = null;
    const readiness = readinessKnown ? payoutReadinessByUser.get(providerId) : (accepted ? null : 'active');
    if (quote && payment && typeof payment.missionCard === 'function' && userId && readiness) {
        view = payment.missionCard(quote, userId, readiness, {
            reviseOk,
            requestId: dossier.requestId,
            requestTitle: dossier.title
        });
    }
    const cardActionIds = view && Array.isArray(view.actions) ? view.actions.map((action) => action && action.id).filter(Boolean) : [];
    const planned = dossierApi && typeof dossierApi.dossierActionIds === 'function'
        ? dossierApi.dossierActionIds({
            roleCode: dossier.roleCode,
            quoteStatus: quote && quote.status,
            canPropose: gate.ok,
            reviseOk,
            hasReportableMilestone: dossier.roleCode === 'requester' && !!reportableMilestone(scoped),
            cardActionIds
        })
        : cardActionIds;
    const nextCopy = dossierApi && typeof dossierApi.explainNextStep === 'function'
        ? dossierApi.explainNextStep({
            roleCode: dossier.roleCode,
            quote,
            view,
            readiness: readiness || '',
            checking
        })
        : '';
    const sheet = host.closest('.chat-dossier-sheet');
    const nextHost = sheet && sheet.querySelector('[data-dossier-next]');
    if (nextHost) nextHost.textContent = nextCopy || '';
    if (sheet && quote && userId && window.LYANN_FINANCE_POLICY_UI && typeof window.LYANN_FINANCE_POLICY_UI.dossierMoney === 'function') {
        let money = sheet.querySelector('[data-dossier-money]');
        if (!money) {
            money = document.createElement('p');
            money.setAttribute('data-dossier-money', '1');
            money.style.margin = '8px 0 0';
            money.style.fontSize = '0.85rem';
            money.style.color = '#3F5C49';
            if (nextHost && nextHost.parentNode) nextHost.parentNode.appendChild(money);
        }
        const policy = window.LYANN_FINANCE_POLICY_UI;
        const summaryQuote = Object.assign({}, quote);
        if (!summaryQuote.requester_id && dossier.roleCode === 'requester') summaryQuote.requester_id = userId;
        if (!summaryQuote.provider_id && !summaryQuote.helper_id && dossier.roleCode === 'lyanneur') summaryQuote.provider_id = userId;
        const text = typeof policy.dossierSummary === 'function'
            ? policy.dossierSummary(userId, summaryQuote)
            : policy.dossierMoney(userId, quote.payments || []);
        money.textContent = text;
        money.hidden = !text;
    }
    const prompts = window.LYANN_PAYOUT_PROMPT;
    const guidance = prompts && typeof prompts.payoutGuidance === 'function' && accepted && readiness
        ? prompts.payoutGuidance({
            role: dossier.roleCode === 'lyanneur' ? 'provider' : 'requester',
            readiness,
            requestTitle: dossier.title
        })
        : null;
    if (guidance && guidance.alert) {
        const alertBox = document.createElement('div');
        alertBox.className = 'chat-dossier-payout-alert';
        alertBox.setAttribute('data-payout-state', guidance.kind || readiness || '');
        const head = document.createElement('strong');
        head.textContent = guidance.headline || '';
        alertBox.appendChild(head);
        const body = document.createElement('p');
        body.textContent = guidance.body || '';
        alertBox.appendChild(body);
        host.appendChild(alertBox);
    }
    const wrap = document.createElement('div');
    wrap.className = 'chat-dossier-cta';
    wrap.setAttribute('data-dossier-request', dossier.requestId || '');
    wrap.setAttribute('data-dossier-invitation', dossier.invitationId || '');
    let hasPrimary = false;
    if (view && view.primaryAction && planned.includes(view.primaryAction.id)) {
        bindMissionAction(wrap, quote, view.primaryAction);
        hasPrimary = true;
    }
    (view && view.secondaryActions ? view.secondaryActions : []).forEach((action) => {
        if (action && planned.includes(action.id)) bindMissionAction(wrap, quote, action);
    });
    if (planned.includes('propose')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = hasPrimary ? 'btn btn-outline' : 'btn btn-primary';
        button.dataset.dealAction = 'propose';
        button.textContent = 'Proposer un devis';
        button.addEventListener('click', () => handleChatAction('MAKE_PROPOSAL', dossier.mission));
        wrap.appendChild(button);
        hasPrimary = true;
    }
    if (planned.includes('report')) {
        const milestone = reportableMilestone(scoped);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-outline';
        button.dataset.dealAction = 'report';
        button.textContent = 'Signaler un problème';
        button.addEventListener('click', () => handleChatAction('REPORT_PROBLEM', { milestoneId: milestone && milestone.id }));
        wrap.appendChild(button);
    }
    if (checking && !wrap.querySelector('button')) {
        const wait = document.createElement('p');
        wait.className = 'chat-dossier-wait';
        wait.textContent = 'Vérification du compte de versement. Les actions s’affichent dès que cet état est connu.';
        wrap.appendChild(wait);
    } else if (!wrap.querySelector('button') && !nextHost) {
        const wait = document.createElement('p');
        wait.className = 'chat-dossier-wait';
        wait.textContent = nextCopy || 'Le chat reste disponible pour cette mission.';
        wrap.appendChild(wait);
    }
    host.appendChild(wrap);
    if (view && Array.isArray(view.details) && view.details.length) {
        const jalons = document.createElement('div');
        jalons.className = 'chat-dossier-jalons';
        jalons.setAttribute('data-dossier-jalons', '1');
        view.details.forEach((detail) => {
            const row = document.createElement('div');
            row.className = 'chat-dossier-jalon';
            row.setAttribute('data-milestone-id', detail.id || '');
            const label = document.createElement('span');
            label.textContent = [detail.title, detail.amount].filter(Boolean).join(' · ');
            row.appendChild(label);
            if (detail.action) bindMissionAction(row, quote, detail.action);
            jalons.appendChild(row);
        });
        host.appendChild(jalons);
    }
}
window.paintDossierActions = paintDossierActions;

let pendingActionsPanelUserOpen = null;

function chatTodoPanelDefaultOpen() {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches) return false;
    return true;
}

function pendingActionCopy(row, userId) {
    const dossier = row && row.dossier;
    const quote = row && row.quote;
    const title = (dossier && dossier.title) || (quote && (quote.request_title || quote.requestTitle)) || 'Mission';
    if (!row || row.actionId === 'propose' || !quote) {
        return {
            title,
            status: (dossier && dossier.statusLabel) || 'En discussion',
            context: 'Vous pouvez proposer un devis pour cette mission.',
            label: 'Proposer un devis'
        };
    }
    const payment = window.LYANN_QUOTE_PAYMENT;
    const providerId = String(quote.provider_id || quote.helper_id || '');
    const status = String(quote.status || '').toUpperCase();
    let readiness = 'active';
    if (status === 'ACCEPTED' && providerId && payoutReadinessByUser.has(providerId)) {
        readiness = payoutReadinessByUser.get(providerId);
    } else if (status === 'ACCEPTED') {
        readiness = 'active';
    }
    const view = payment && typeof payment.missionCard === 'function'
        ? payment.missionCard(quote, userId, readiness, {
            requestId: dossier && dossier.requestId,
            requestTitle: title
        })
        : null;
    const action = view && (view.primaryAction || ((view.actions || []).find((item) => item && item.tone !== 'secondary')));
    return {
        title,
        status: (view && view.status) || (dossier && dossier.statusLabel) || status || '',
        context: (view && view.context) || '',
        label: (action && action.label) || 'Voir le dossier'
    };
}

function pendingDossierActions(contact, userId) {
    const payment = window.LYANN_QUOTE_PAYMENT;
    const surfaces = window.LYANN_MISSION_SURFACES;
    const rows = [];
    if (!contact || !userId) return rows;
    (contact.dossiers || []).forEach((dossier) => {
        const quote = hydrateQuoteForDossier(
            surfaces && typeof surfaces.relevantQuote === 'function'
                ? surfaces.relevantQuote(dossier)
                : (dossier.quotes && dossier.quotes[0]) || null,
            dossier
        );
        if (!quote) {
            if (dossier.roleCode === 'lyanneur' && dossier.statusCode === 'discussing') {
                rows.push({ dossier, actionId: 'propose' });
            }
            return;
        }
        const status = String(quote.status || '').toUpperCase();
        const providerId = String(quote.provider_id || quote.helper_id || '');
        let readiness = null;
        if (status === 'SENT' || status === 'VIEWED' || status === 'REVISED') readiness = 'active';
        else if (providerId && payoutReadinessByUser.has(providerId)) readiness = payoutReadinessByUser.get(providerId);
        else return;
        if (payment && typeof payment.quoteNeedsViewerAction === 'function' && payment.quoteNeedsViewerAction(quote, userId, readiness)) {
            rows.push({ dossier, quote, actionId: 'card' });
            return;
        }
        if (dossier.roleCode === 'lyanneur' && (status === 'REJECTED' || !status)) {
            const gate = threadQuoteProposalGate({
                request: dossier.request || null,
                requesterId: dossier.requesterId,
                requestId: dossier.requestId,
                invitationId: dossier.invitationId
            }, dossier.mission, dossier.quotes || [], userId);
            if (gate && gate.ok) rows.push({ dossier, quote, actionId: 'propose' });
        }
    });
    return rows;
}

function ensurePendingActionBanner() {
    const area = document.querySelector('#chatModal .chat-input-area');
    if (!area || !area.parentNode) return null;
    let bar = document.getElementById('chatPendingActionsBanner');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'chatPendingActionsBanner';
    bar.className = 'chat-pending-actions-banner';
    bar.hidden = true;
    area.parentNode.insertBefore(bar, area);
    return bar;
}

function paintPendingActionBanner() {
    const bar = ensurePendingActionBanner();
    if (!bar) return;
    const contact = currentChatContact;
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    const pending = pendingDossierActions(contact, userId);
    if (!pending.length) {
        bar.replaceChildren();
        bar.hidden = true;
        return;
    }
    bar.hidden = false;
    bar.replaceChildren();
    const details = document.createElement('details');
    details.className = 'chat-todo-panel';
    details.open = pendingActionsPanelUserOpen === null ? chatTodoPanelDefaultOpen() : pendingActionsPanelUserOpen;
    details.addEventListener('toggle', () => {
        pendingActionsPanelUserOpen = details.open;
    });
    const summary = document.createElement('summary');
    summary.className = 'chat-todo-summary';
    const count = pending.length;
    summary.textContent = 'Vos actions à faire (' + count + ')';
    details.appendChild(summary);
    const list = document.createElement('div');
    list.className = 'chat-todo-list';
    pending.forEach((row) => {
        const copy = pendingActionCopy(row, userId);
        const item = document.createElement('article');
        item.className = 'chat-todo-item';
        item.setAttribute('data-dossier-request', (row.dossier && row.dossier.requestId) || '');
        item.setAttribute('data-dossier-invitation', (row.dossier && row.dossier.invitationId) || '');
        const head = document.createElement('div');
        head.className = 'chat-todo-item-head';
        const name = document.createElement('strong');
        name.className = 'chat-todo-title';
        name.textContent = copy.title;
        const status = document.createElement('span');
        status.className = 'chat-todo-status';
        status.textContent = copy.status;
        head.appendChild(name);
        if (copy.status) head.appendChild(status);
        item.appendChild(head);
        if (copy.context) {
            const context = document.createElement('p');
            context.className = 'chat-todo-context';
            context.textContent = copy.context;
            item.appendChild(context);
        }
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'btn btn-primary chat-todo-action';
        action.setAttribute('data-dossier-request', (row.dossier && row.dossier.requestId) || '');
        action.setAttribute('data-dossier-invitation', (row.dossier && row.dossier.invitationId) || '');
        action.textContent = copy.label;
        action.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            void openMissionDossier({
                requestId: row.dossier.requestId,
                invitationId: row.dossier.invitationId
            });
        });
        item.appendChild(action);
        list.appendChild(item);
    });
    list.addEventListener('pointerdown', (event) => event.stopPropagation());
    details.appendChild(list);
    bar.appendChild(details);
}

function applyLiveQuotesToDossiers(quotes) {
    const contact = currentChatContact;
    if (!contact || !Array.isArray(contact.dossiers) || !contact.dossiers.length) return;
    const list = Array.isArray(quotes) ? quotes : [];
    const dossierApi = window.LYANN_MISSION_DOSSIER;
    contact.dossiers.forEach((dossier) => {
        if (!dossier) return;
        const matching = list.filter((quote) => {
            if (!quote) return false;
            if (dossierApi && typeof dossierApi.quoteBelongsToDossier === 'function') {
                return dossierApi.quoteBelongsToDossier(quote, dossier);
            }
            return String(quote.request_id || quote.requestId || '') === String(dossier.requestId || '');
        });
        if (!matching.length) return;
        const byId = new Map((dossier.quotes || []).map((row) => [String(row && row.id || ''), row]).filter((entry) => entry[0]));
        matching.forEach((quote) => {
            if (quote && quote.id) byId.set(String(quote.id), quote);
        });
        dossier.quotes = [...byId.values()];
    });
    if (contact.activeDossier && contact.activeDossier.requestId) {
        const next = contact.dossiers.find((row) => String(row.requestId) === String(contact.activeDossier.requestId));
        if (next) contact.activeDossier = next;
    }
    if (window.LYANN_ACTIVE_CHAT_CONTACT && window.LYANN_ACTIVE_CHAT_CONTACT.id === contact.id) {
        window.LYANN_ACTIVE_CHAT_CONTACT.dossiers = contact.dossiers;
        window.LYANN_ACTIVE_CHAT_CONTACT.activeDossier = contact.activeDossier || null;
    }
}

function syncLiveDealActions(quotes) {
    applyLiveQuotesToDossiers(quotes);
    if (window.LYANN_MISSION_SURFACES && typeof window.LYANN_MISSION_SURFACES.syncOpenDossier === 'function') {
        window.LYANN_MISSION_SURFACES.syncOpenDossier(quotes);
    }
    paintPendingActionBanner();
}
window.paintPendingActionBanner = paintPendingActionBanner;
window.syncLiveDealActions = syncLiveDealActions;

function payoutNoticeStorageKey(userId, quoteId, kind) {
    return 'lyann.payoutNotice.v1.' + String(userId || '') + '.' + String(quoteId || '') + '.' + String(kind || '');
}

function payoutNoticeSeen(userId, quoteId, kind) {
    try { return localStorage.getItem(payoutNoticeStorageKey(userId, quoteId, kind)) === '1'; } catch (_) { return false; }
}

function markPayoutNoticeSeen(userId, quoteId, kind) {
    try { localStorage.setItem(payoutNoticeStorageKey(userId, quoteId, kind), '1'); } catch (_) {}
}

function payoutPrevKey(userId, providerId) {
    return 'lyann.payoutPrev.v1.' + String(userId || '') + '.' + String(providerId || '');
}

function appendOncePayoutNotice(box, quote, kind, role) {
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    if (!box || !quote || !quote.id || !userId) return;
    if (payoutNoticeSeen(userId, quote.id, kind)) return;
    if (kind === 'payout_ready' && box.querySelector('.chat-payout-ready')) {
        markPayoutNoticeSeen(userId, quote.id, kind);
        return;
    }
    if (kind === 'payment_secured' && box.querySelector('[data-message-type="payment_secured"]')) {
        markPayoutNoticeSeen(userId, quote.id, kind);
        return;
    }
    const prompts = window.LYANN_PAYOUT_PROMPT;
    const copy = prompts && typeof prompts.payoutChatNotice === 'function'
        ? prompts.payoutChatNotice({
            kind,
            role,
            requestTitle: dossierTitleForEvent(quote)
        })
        : null;
    if (!copy) return;
    const card = document.createElement('div');
    card.className = 'chat-timeline-card chat-dossier-event chat-payout-context chat-notice-compact';
    card.dataset.payoutNotice = kind;
    card.dataset.quoteId = String(quote.id);
    const title = document.createElement('div');
    title.className = 'chat-timeline-title';
    title.textContent = copy.title;
    card.appendChild(title);
    const body = document.createElement('div');
    body.className = 'chat-timeline-body';
    const meta = document.createElement('div');
    meta.className = 'chat-timeline-meta';
    meta.textContent = copy.body;
    body.appendChild(meta);
    card.appendChild(body);
    attachDossierEventCta(card, quote);
    box.appendChild(card);
    markPayoutNoticeSeen(userId, quote.id, kind);
}

function paintPayoutContextNotices(box, quotes) {
    if (!box) return;
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    (quotes || []).forEach((quote) => {
        if (!quote || !userId) return;
        const providerId = String(quote.provider_id || quote.helper_id || '');
        const role = String(providerId) === String(userId) ? 'provider' : (String(quote.requester_id) === String(userId) ? 'requester' : '');
        if (!role) return;
        const status = String(quote.status || '').toUpperCase();
        const readiness = providerId && payoutReadinessByUser.has(providerId)
            ? payoutReadinessByUser.get(providerId)
            : null;
        if (status === 'ACCEPTED' && (readiness === 'none' || readiness === 'incomplete' || readiness === 'pending')) {
            appendOncePayoutNotice(box, quote, 'accepted_wait', role);
        }
        let prev = '';
        try { prev = localStorage.getItem(payoutPrevKey(userId, providerId)) || ''; } catch (_) {}
        if (readiness === 'active' && prev && prev !== 'active') {
            appendOncePayoutNotice(box, quote, 'payout_ready', role);
        }
        if (box.querySelector('[data-message-type="payment_secured"]')) {
            markPayoutNoticeSeen(userId, quote.id, 'payment_secured');
        }
        if (readiness) {
            try { localStorage.setItem(payoutPrevKey(userId, providerId), readiness); } catch (_) {}
        }
    });
}

async function restorePayoutDossier(hint) {
    const payout = window.LYANN_PAYOUT_ACCOUNT;
    const clear = () => {
        if (payout && typeof payout.clearPayoutReturn === 'function') payout.clearPayoutReturn();
        try { sessionStorage.removeItem('lyann_payout_setup'); } catch (_) {}
    };
    if (!hint || (!hint.requestId && !hint.invitationId)) {
        clear();
        return { ok: false, code: 'missing_hint' };
    }
    if (typeof window.closeUserAccountModal === 'function') {
        try { window.closeUserAccountModal(); } catch (_) {}
    }
    const contactId = hint.contactId;
    const chatModal = document.getElementById('chatModal');
    const chatVisible = !!(chatModal && (
        chatModal.classList.contains('active')
        || chatModal.classList.contains('lyann-surface-active')
        || (window.LYANN_SURFACES && typeof window.LYANN_SURFACES.isOpen === 'function' && window.LYANN_SURFACES.isOpen('messaging'))
    ));
    const alreadyOpen = currentChatContact && contactId && String(currentChatContact.id) === String(contactId);
    if (contactId && (!alreadyOpen || !chatVisible)) {
        if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.openConversation === 'function') {
            try {
                await window.LYANN_MESSAGING.openConversation({
                    contactId,
                    name: hint.contactName || '',
                    requestId: hint.requestId || null
                });
            } catch (_) {}
        } else if (typeof window.openChatWithUser === 'function') {
            window.openChatWithUser(hint.contactName || '', '', contactId, { requestId: hint.requestId || null });
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }
    if (typeof window.reloadPairDossiers === 'function') {
        try { await window.reloadPairDossiers(); } catch (_) {}
    }
    const surfaces = window.LYANN_MISSION_SURFACES;
    let opened = { ok: false };
    if (surfaces && typeof surfaces.openDossier === 'function') {
        try {
            opened = await surfaces.openDossier({
                requestId: hint.requestId || null,
                invitationId: hint.invitationId || null
            }) || { ok: false };
        } catch (_) {
            opened = { ok: false };
        }
    } else {
        openMissionDossier({ requestId: hint.requestId, invitationId: hint.invitationId });
        opened = { ok: true };
    }
    const overlay = document.getElementById('chatTrackingOverlay');
    if (overlay && opened && opened.ok) {
        overlay.classList.add('is-open');
        overlay.style.setProperty('display', 'flex', 'important');
    }
    const sheet = document.querySelector('.chat-dossier-sheet');
    const requestMatch = !hint.requestId || (sheet && sheet.getAttribute('data-dossier-request') === String(hint.requestId));
    const overlayOpen = !!(overlay && (
        overlay.classList.contains('is-open')
        || (overlay.style.display && overlay.style.display !== 'none')
        || (typeof window.getComputedStyle === 'function' && window.getComputedStyle(overlay).display !== 'none')
    ));
    if (opened && opened.ok && overlayOpen && requestMatch) {
        clear();
        return { ok: true, code: 'restored', requestId: hint.requestId, invitationId: hint.invitationId };
    }
    if (surfaces && typeof surfaces.openPicker === 'function') {
        try { surfaces.openPicker(); } catch (_) {}
    }
    clear();
    return { ok: false, code: 'inaccessible', requestId: hint.requestId, invitationId: hint.invitationId };
}
window.restorePayoutDossier = restorePayoutDossier;

function refreshDealChrome() {
    try {
        window.__lyannReminderQuotes = typeof timelineQuotes !== 'undefined' ? Array.from(timelineQuotes.values()) : [];
        const readiness = {};
        if (typeof payoutReadinessByUser !== 'undefined') {
            payoutReadinessByUser.forEach((state, id) => { readiness[id] = state; });
        }
        window.__lyannReminderReadiness = readiness;
    } catch (_) {}
    const box = document.getElementById('chatMessagesContainer');
    if (box) {
        const current = quotesWithCurrentContact();
        repaintQuoteTimelineCards(box);
        paintDealRecaps(box, current, { skipWatch: true, softEmpty: !current.length });
        paintPayoutContextNotices(box, current);
    }
    if (window.LYANN_MISSION_SURFACES && typeof window.LYANN_MISSION_SURFACES.syncOpenDossier === 'function') {
        window.LYANN_MISSION_SURFACES.syncOpenDossier();
    }
    paintPendingActionBanner();
}

function bindMissionAction(parent, quote, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = action.tone === 'secondary' ? 'btn btn-outline' : 'btn btn-primary';
    button.textContent = action.label;
    button.dataset.dealAction = String(action.id || '');
    button.addEventListener('click', () => {
        // E5: handlers own busy/mutex; ignore second click while action or quote is locked.
        if (button.disabled || button.classList.contains('is-busy')) return;
        const entityForGuard = action.milestoneId || quote.id;
        if (dealMutationGuard && dealMutationGuard.isBusy(action.id, entityForGuard)) return;
        if ((action.id === 'accept' || action.id === 'decline') && quoteActionLocks.has(String(quote.id))) return;

        if (action.id === 'accept') {
            setButtonBusy(button, true);
            Promise.resolve(window.handleAcceptQuote(quote.id, quote)).finally(() => {
                if (button.isConnected && !quoteActionLocks.has(String(quote.id))) setButtonBusy(button, false);
            });
            return;
        }
        if (action.id === 'decline') {
            setButtonBusy(button, true);
            Promise.resolve(window.handleRejectQuote(quote.id)).finally(() => {
                if (button.isConnected && !quoteActionLocks.has(String(quote.id))) setButtonBusy(button, false);
            });
            return;
        }
        if (action.id === 'revise') {
            if (typeof window.openQuoteRevision === 'function') window.openQuoteRevision(quote.id);
            return;
        }
        if (action.id === 'retry') {
            const providerId = quote && (quote.provider_id || quote.helper_id);
            setButtonBusy(button, true);
            Promise.resolve(refreshPayoutReadiness(providerId)).finally(() => {
                if (button.isConnected) setButtonBusy(button, false);
            });
            return;
        }
        if (action.id === 'setup') {
            const setup = window.LYANN_PAYOUT_ACCOUNT && window.LYANN_PAYOUT_ACCOUNT.beginPayoutSetup;
            const contact = currentChatContact || window.LYANN_ACTIVE_CHAT_CONTACT || {};
            const hint = {
                requestId: quote && (quote.request_id || quote.requestId) || contact.requestId || null,
                invitationId: quote && quote.request_invitation_id || contact.invitationId || null,
                contactId: contact.id || null,
                conversationId: contact.conversationId || null,
                contactName: contact.name || ''
            };
            Promise.resolve(runDealMutation('setup', quote.id || 'setup', {
                button,
                execute: async () => (setup ? setup(hint) : null)
            })).catch(() => {});
            return;
        }
        const run = () => handleChatAction(action.id === 'pay' ? 'PAY_MISSION' : action.id === 'done' ? 'MARK_DONE' : 'CONFIRM_DONE', {
            id: quote.mission_id,
            milestoneId: action.milestoneId,
            title: quote.description
        });
        if (action.id === 'pay') {
            const payload = window.LYANN_QUOTE_PAYMENT.payMissionPayload(quote, (quote.milestones || []).find((milestone) => milestone.id === action.milestoneId));
            setButtonBusy(button, true);
            Promise.resolve(handleChatAction(payload.action, payload)).finally(() => {
                if (button.isConnected) setButtonBusy(button, false);
            });
            return;
        }
        if (action.confirm && window.lyannConfirm) {
            window.lyannConfirm('Valider le travail et libérer le paiement ? Cette action est définitive.').then((ok) => {
                if (!ok) return;
                setButtonBusy(button, true);
                Promise.resolve(run()).finally(() => {
                    if (button.isConnected) setButtonBusy(button, false);
                });
            });
            return;
        }
        setButtonBusy(button, true);
        Promise.resolve(run()).finally(() => {
            if (button.isConnected) setButtonBusy(button, false);
        });
    });
    parent.appendChild(button);
}

function renderMissionHistory(quotes) {
    const payment = window.LYANN_QUOTE_PAYMENT;
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    if (!payment || !quotes || !quotes.length || !userId) return null;
    const block = document.createElement('details');
    block.className = 'chat-mission-history';
    block.dataset.dealRecap = 'history';
    const historyRequestId = (quotes[0] && (quotes[0].request_id || quotes[0].requestId))
        || (currentChatContact && currentChatContact.requestId)
        || '';
    if (historyRequestId) block.dataset.requestId = String(historyRequestId);
    const summary = document.createElement('summary');
    summary.textContent = 'Propositions précédentes';
    block.appendChild(summary);
    quotes.forEach((quote) => {
        const providerId = quote.provider_id || quote.helper_id;
        const view = payment.missionCard(quote, userId, payoutReadinessByUser.get(String(providerId || '')) || 'active');
        if (!view) return;
        const row = document.createElement('p');
        row.textContent = [view.title, view.amount, view.status].filter(Boolean).join(' · ');
        block.appendChild(row);
    });
    return block;
}

function syncMissionJump(visible) {
    const info = document.querySelector('#chatModal .chat-header-info') || document.querySelector('.chat-header-info');
    if (!info) return;
    const banner = document.getElementById('chatMissionContextBar') || document.getElementById('chatMissionContext');
    const bannerOpen = !!(banner && banner.style.display !== 'none' && banner.classList.contains('lyann-thread-context'));
    // Compact mission banner already occupies the slot under the header.
    if (bannerOpen) visible = false;
    let button = document.getElementById('chatMissionJump');
    if (!visible) {
        if (button) button.hidden = true;
        return;
    }
    if (!button) {
        button = document.createElement('button');
        button.id = 'chatMissionJump';
        button.type = 'button';
        button.className = 'chat-mission-jump';
        button.textContent = 'Suivi de la mission';
        button.addEventListener('click', () => {
            const card = document.querySelector('#chatMessagesContainer [data-mission-focus="1"]');
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        info.appendChild(button);
    }
    button.hidden = false;
}

let dealRecapOpenBumpContactId = null;
let dealRecapArmedForContactId = null;

function armDealRecapOpenBump(contactId) {
    const id = contactId ? String(contactId) : null;
    dealRecapOpenBumpContactId = id;
    dealRecapArmedForContactId = id;
}
window.armDealRecapOpenBump = armDealRecapOpenBump;

function dealRecapSeenKey(contactId) {
    return 'lyann_deal_fp_' + String(contactId || '');
}

function readDealRecapFingerprints(contactId) {
    try {
        return JSON.parse(sessionStorage.getItem(dealRecapSeenKey(contactId)) || '{}') || {};
    } catch (_) {
        return {};
    }
}

function writeDealRecapFingerprints(contactId, quotes) {
    if (!contactId || !window.LYANN_QUOTE_PAYMENT?.quoteFingerprint) return;
    const map = {};
    (quotes || []).forEach((quote) => {
        if (!quote || !quote.id) return;
        map[String(quote.id)] = window.LYANN_QUOTE_PAYMENT.quoteFingerprint(quote);
    });
    try { sessionStorage.setItem(dealRecapSeenKey(contactId), JSON.stringify(map)); } catch (_) {}
}

function shouldRevealDealRecapOnOpen(quotes) {
    const contactId = currentChatContact && currentChatContact.id;
    if (!contactId || dealRecapOpenBumpContactId !== String(contactId)) return false;
    const payment = window.LYANN_QUOTE_PAYMENT;
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    if (!payment || !userId) return false;
    const board = payment.missionBoard ? payment.missionBoard(quotes) : { active: [] };
    if (!board.active.length) return false;
    const seen = readDealRecapFingerprints(contactId);
    const needsMe = board.active.some((quote) => {
        const readiness = payoutReadinessByUser.get(String(quote.provider_id || quote.helper_id || '')) || 'active';
        return payment.quoteNeedsViewerAction(quote, userId, readiness);
    });
    const peerChanged = board.active.some((quote) => {
        const next = payment.quoteFingerprint(quote);
        const prev = seen[String(quote.id)];
        return prev != null && prev !== next;
    });
    // First open with an action waiting for me also counts as a reveal.
    const firstOpenNeedsMe = needsMe && board.active.every((quote) => seen[String(quote.id)] == null);
    return needsMe || peerChanged || firstOpenNeedsMe;
}

function insertDealRecapCard(box, card, quote) {
    if (!box || !card) return;
    card.dataset.dealRecap = String(quote.id);
    if (quote.mission_id) card.dataset.missionId = String(quote.mission_id);
    else card.dataset.missionId = String(quote.id);
    const anchor = (typeof quoteTimelineSelector === 'function' ? box.querySelector(quoteTimelineSelector(quote.id)) : null)
        || box.querySelector('[data-live-quote-id="' + CSS.escape(String(quote.id)) + '"]')
        || box.querySelector('[data-entity-type="quote"][data-entity-id="' + CSS.escape(String(quote.id)) + '"]');
    if (anchor && anchor.parentNode === box) {
        if (anchor.nextSibling) box.insertBefore(card, anchor.nextSibling);
        else box.appendChild(card);
        return;
    }
    const payment = window.LYANN_QUOTE_PAYMENT;
    const stamp = payment && typeof payment.quoteTime === 'function' ? payment.quoteTime(quote) : 0;
    if (stamp) {
        const nodes = Array.from(box.children);
        for (let i = 0; i < nodes.length; i += 1) {
            const created = Date.parse(nodes[i].dataset.createdAt || '') || 0;
            if (created && created > stamp) {
                box.insertBefore(card, nodes[i]);
                return;
            }
        }
    }
    // Active deals without a timeline seat: once at the end for CTA focus only.
    // Never append closed/history cards after newer messages (omit if unseated).
    if (card.dataset.missionFocus === '1') box.appendChild(card);
}

function paintDealRecaps(box, quotes, options) {
    if (!box) return;
    const optsEarly = options || {};
    if (box.id === 'chatMessagesContainer' && optsEarly.allowThreadPanel !== true) {
        box.querySelectorAll('[data-action-panel]').forEach((node) => node.remove());
        if (window.LYANN_MISSION_SURFACES && typeof window.LYANN_MISSION_SURFACES.syncOpenDossier === 'function') {
            window.LYANN_MISSION_SURFACES.syncOpenDossier(quotes);
        }
        if (!optsEarly.skipWatch) watchPayoutReadiness(quotes);
        return;
    }
    const stick = threadIsNearBottom(box);
    const previousTop = box.scrollTop;
    const payment = window.LYANN_QUOTE_PAYMENT;
    const opts = options || {};
    const panelMode = opts.panel || null;
    const board = payment && payment.missionBoard ? payment.missionBoard(quotes) : { active: [], history: [] };
    const fpBase = (quotes || []).map((quote) => (payment && payment.quoteFingerprint ? payment.quoteFingerprint(quote) : '')).join('|');
    const fp = panelMode ? ('neutral:' + panelMode + '|' + fpBase) : fpBase;
    const reveal = !panelMode && shouldRevealDealRecapOnOpen(quotes);
    const existingRecaps = box.querySelectorAll('[data-deal-recap], [data-action-panel]');

    // E3 neutral ActionPanel: ambiguous / loading / error / empty — no active CTAs, no invented mission.
    if (panelMode === 'ambiguous' || panelMode === 'loading' || panelMode === 'error' || panelMode === 'empty') {
        existingRecaps.forEach((node) => node.remove());
        const neutral = renderNeutralActionPanel(panelMode, opts.panelMeta || actionPanelRequestMeta(null));
        if (neutral) {
            neutral.dataset.dealRecap = 'neutral-' + panelMode;
            neutral.dataset.missionFocus = '1';
            box.appendChild(neutral);
        }
        box.dataset.dealRecapFp = fp;
        syncMissionJump(!!neutral);
        if (typeof paintThreadBusinessBanner === 'function') paintThreadBusinessBanner();
        if (!opts.skipWatch) watchPayoutReadiness(quotes);
        if (stick) scrollThreadToBottom(box, false);
        else box.scrollTop = previousTop;
        return;
    }

    // Closed-only / server-confirmed empty: strip leftover active recap.
    // Local cache paints with zero matching quotes must not wipe the panel while a
    // request-scoped server rebuild is in flight (context switch / empty thread).
    // Never keep a panel whose data-request-id belongs to another dossier.
    if (!board.active.length) {
        const scopedReq = (currentChatContact && currentChatContact.requestId)
            || (opts.panelMeta && opts.panelMeta.requestId)
            || null;
        const leftoverPanel = box.querySelector('[data-action-panel], [data-deal-recap]');
        const leftoverReq = leftoverPanel && leftoverPanel.dataset.requestId ? String(leftoverPanel.dataset.requestId) : '';
        const leftoverKind = leftoverPanel && leftoverPanel.dataset.panelKind ? String(leftoverPanel.dataset.panelKind) : '';
        const leftoverIsLiveDeal = leftoverPanel
            && leftoverReq
            && scopedReq
            && leftoverReq === String(scopedReq)
            && leftoverKind !== 'loading'
            && leftoverKind !== 'empty'
            && leftoverKind !== 'error'
            && leftoverKind !== 'ambiguous';
        if (opts.softEmpty && leftoverIsLiveDeal) {
            syncMissionJump(true);
            if (!opts.skipWatch) watchPayoutReadiness(quotes);
            return;
        }
        existingRecaps.forEach((node) => node.remove());
        if (board.history && board.history.length) {
            const history = renderMissionHistory(board.history);
            if (history) box.appendChild(history);
        }
        box.dataset.dealRecapFp = fp;
        syncMissionJump(false);
        if (typeof paintThreadBusinessBanner === 'function') paintThreadBusinessBanner();
        if (!opts.skipWatch) watchPayoutReadiness(quotes);
        if (stick) scrollThreadToBottom(box, false);
        else box.scrollTop = previousTop;
        return;
    }
    // Same active deal state while already in the thread → keep current seat (no reshuffle to bottom).
    if (!reveal && box.dataset.dealRecapFp === fp && existingRecaps.length) {
        syncMissionJump(true);
        if (!opts.skipWatch) watchPayoutReadiness(quotes);
        return;
    }
    const tracked = (quotes || []).filter((quote) => quote && (quote.status === 'SENT' || quote.status === 'ACCEPTED' || quote.status === 'REJECTED'));
    if (tracked.length && payment) {
        const hidden = payment.hiddenTimelineTypes([], tracked);
        box.querySelectorAll('[data-message-type]').forEach((node) => {
            if (hidden.has(node.dataset.messageType)) node.remove();
        });
        box.querySelectorAll('.chat-payout-ready, [data-live-quote]').forEach((node) => node.remove());
    }
    box.querySelectorAll('[data-deal-recap], [data-action-panel]').forEach((node) => node.remove());
    if (reveal) dealRecapOpenBumpContactId = null;
    board.active.forEach((quote, index) => {
        const card = renderMissionCard(quote);
        if (!card) return;
        if (index === 0) card.dataset.missionFocus = '1';
        // À l’ouverture si action attendue / action adverse → carte en bas pour le CTA.
        if (reveal && index === 0) box.appendChild(card);
        else insertDealRecapCard(box, card, quote);
    });
    // Previous / closed deals: consultable history under the active ActionPanel (not as active CTAs).
    if (board.history && board.history.length) {
        const history = renderMissionHistory(board.history);
        if (history) {
            const focus = box.querySelector('[data-mission-focus="1"]');
            if (focus && focus.parentNode === box) {
                if (focus.nextSibling) box.insertBefore(history, focus.nextSibling);
                else box.appendChild(history);
            } else {
                box.appendChild(history);
            }
        }
    }
    box.dataset.dealRecapFp = fp;
    syncMissionJump(true);
    const contactId = currentChatContact && currentChatContact.id;
    if (contactId) writeDealRecapFingerprints(contactId, quotes);
    if (reveal) {
        const focus = box.querySelector('[data-mission-focus="1"]');
        if (focus && typeof focus.scrollIntoView === 'function') {
            focus.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } else {
            scrollThreadToBottom(box, false);
        }
    } else if (stick) {
        scrollThreadToBottom(box, false);
    } else {
        box.scrollTop = previousTop;
    }
    if (!opts.skipWatch) watchPayoutReadiness(quotes);
}
window.paintDealRecaps = paintDealRecaps;

const payoutReadinessByUser = new Map();
const payoutReadinessPending = new Map();
let payoutWatchSerial = 0;

window.lyannApplyPayoutReadiness = function (userId, state) {
    const key = String(userId || '');
    if (!key) return;
    if (state == null || state === '') {
        payoutReadinessByUser.delete(key);
        payoutReadinessPending.delete(key);
        return;
    }
    payoutReadinessByUser.set(key, state);
};

window.lyannClearPayoutReadiness = function () {
    payoutReadinessByUser.clear();
    payoutReadinessPending.clear();
};

function rememberPayoutReady(providerId) {
    if (!providerId) return;
    payoutReadinessByUser.set(String(providerId), 'active');
}

function notePayoutReadyMessage(msg) {
    const meta = msg && msg.metadata;
    if (meta && meta.kind === 'payout_ready') rememberPayoutReady(meta.provider_id);
}

function payoutPromptForQuote(quote) {
    const prompts = window.LYANN_PAYOUT_PROMPT;
    if (!prompts || !quote || !prompts.quoteStillNeedsPayout(quote)) return null;
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    const providerId = quote.provider_id || quote.helper_id;
    const role = String(providerId) === String(userId) ? 'provider' : (String(quote.requester_id) === String(userId) ? 'requester' : '');
    if (!role) return null;
    const contactName = currentChatContact && currentChatContact.name ? currentChatContact.name : '';
    return prompts.payoutPrompt({
        role,
        status: quote.status,
        readiness: payoutReadinessByUser.get(String(providerId || '')) || 'unknown',
        providerName: role === 'requester' ? contactName : '',
        requesterName: role === 'provider' ? contactName : ''
    });
}

function payoutBlocksPayment(quote) {
    const prompt = payoutPromptForQuote(quote);
    return !!(prompt && prompt.blockPay);
}

function quotesWithCurrentContact() {
    const contactId = currentChatContact && currentChatContact.id;
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    const requestId = currentChatContact && currentChatContact.requestId
        ? String(currentChatContact.requestId)
        : null;
    const list = [];
    timelineQuotes.forEach((quote) => {
        if (!quote || !quote.id || !quote.status) return;
        if (requestId) {
            const quoteRequest = quote.request_id || quote.mission_related_request_id || null;
            if (quoteRequest && String(quoteRequest) !== requestId) return;
        }
        const providerId = quote.provider_id || quote.helper_id;
        const involved = String(providerId) === String(userId) || String(quote.requester_id) === String(userId);
        const withContact = contactId && (String(providerId) === String(contactId) || String(quote.requester_id) === String(contactId));
        if (involved && withContact) list.push(quote);
    });
    return list;
}

function ensurePayoutReadiness(userId) {
    const key = String(userId || '');
    if (!key) return Promise.resolve('unknown');
    if (payoutReadinessByUser.has(key)) return Promise.resolve(payoutReadinessByUser.get(key));
    if (payoutReadinessPending.has(key)) return payoutReadinessPending.get(key);
    const payout = window.LYANN_PAYOUT_ACCOUNT;
    if (!payout || typeof payout.fetchReadiness !== 'function') return Promise.resolve('unknown');
    const job = payout.fetchReadiness(key).then((state) => {
        payoutReadinessByUser.set(key, state || 'error');
        payoutReadinessPending.delete(key);
        return payoutReadinessByUser.get(key);
    }).catch(() => {
        payoutReadinessByUser.set(key, 'error');
        payoutReadinessPending.delete(key);
        return 'error';
    });
    payoutReadinessPending.set(key, job);
    return job;
}

function refreshPayoutReadiness(userId) {
    const key = String(userId || '');
    payoutReadinessByUser.delete(key);
    payoutReadinessPending.delete(key);
    return ensurePayoutReadiness(key).then((state) => {
        const box = document.getElementById('chatMessagesContainer');
        if (box) {
            refreshDealChrome();
        }
        return state;
    });
}

function appendPayoutPrompt(parent, quote) {
    if (!parent || !quote) return;
    if (parent.querySelector('[data-payout-prompt="' + CSS.escape(String(quote.id)) + '"]')) return;
    const prompt = payoutPromptForQuote(quote);
    if (!prompt) return;
    const box = document.createElement('div');
    box.className = 'chat-payout-prompt';
    box.dataset.payoutPrompt = String(quote.id);
    const title = document.createElement('p');
    title.className = 'chat-payout-prompt-title';
    title.textContent = prompt.title;
    box.appendChild(title);
    if (prompt.body) {
        const body = document.createElement('p');
        body.textContent = prompt.body;
        box.appendChild(body);
    }
    if (prompt.action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-primary';
        button.textContent = prompt.action;
        button.addEventListener('click', () => {
            button.disabled = true;
            const providerId = quote.provider_id || quote.helper_id;
            const contact = currentChatContact || {};
            const run = prompt.intent === 'retry'
                ? refreshPayoutReadiness(providerId)
                : (window.LYANN_PAYOUT_ACCOUNT && window.LYANN_PAYOUT_ACCOUNT.beginPayoutSetup
                    ? window.LYANN_PAYOUT_ACCOUNT.beginPayoutSetup({
                        requestId: quote.request_id || contact.requestId || null,
                        invitationId: quote.request_invitation_id || contact.invitationId || null,
                        contactId: contact.id || null,
                        conversationId: contact.conversationId || null,
                        contactName: contact.name || ''
                    })
                    : Promise.reject());
            Promise.resolve(run()).catch(() => { button.disabled = false; });
        });
        box.appendChild(button);
    }
    parent.appendChild(box);
}

window.addEventListener('lyann:payout-return', (event) => {
    const hint = event && event.detail && event.detail.hint;
    if (!hint) return;
    Promise.resolve(restorePayoutDossier(hint)).catch(() => {});
});

window.addEventListener('lyann:payout-readiness', (event) => {
    const state = event && event.detail && event.detail.state;
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    if (userId && state) payoutReadinessByUser.set(String(userId), state);
    const box = document.getElementById('chatMessagesContainer');
    if (!box || !currentChatContact) return;
    refreshDealChrome();
});

function watchPayoutReadiness(quotes) {
    const contactId = currentChatContact && currentChatContact.id;
    const missing = [];
    (quotes || []).forEach((quote) => {
        const accepted = quote && String(quote.status || '').toUpperCase() === 'ACCEPTED';
        if (!accepted && (!window.LYANN_PAYOUT_PROMPT || !window.LYANN_PAYOUT_PROMPT.quoteStillNeedsPayout(quote))) return;
        const providerId = quote.provider_id || quote.helper_id;
        if (providerId && !payoutReadinessByUser.has(String(providerId))) missing.push(String(providerId));
    });
    if (!missing.length) return;
    const serial = ++payoutWatchSerial;
    Promise.all([...new Set(missing)].map((id) => ensurePayoutReadiness(id))).then(() => {
        if (serial !== payoutWatchSerial) return;
        if (!currentChatContact || currentChatContact.id !== contactId) return;
        const box = document.getElementById('chatMessagesContainer');
        if (!box) return;
        refreshDealChrome();
        if (typeof window.__lyannAppendLiveQuote === 'function') {
            const current = quotesWithCurrentContact();
            box.querySelectorAll('[data-live-quote="1"]').forEach((node) => node.remove());
            current.forEach((quote) => window.__lyannAppendLiveQuote(box, quote));
        }
    }).catch(() => {});
}

function isPayoutReadyNotice(msg) {
    return !!(msg && msg.metadata && msg.metadata.kind === 'payout_ready');
}

function renderPayoutReadyNotice(msg) {
    const node = document.createElement('div');
    node.className = 'chat-payout-ready';
    if (msg.id) node.dataset.messageId = String(msg.id);
    if (msg.createdAt) node.dataset.createdAt = String(msg.createdAt);
    const text = document.createElement('p');
    text.textContent = msg.text || '';
    node.appendChild(text);
    return node;
}

function quoteForPayAction(extraData) {
    let found = null;
    timelineQuotes.forEach((quote) => {
        if (found || !quote || !quote.id) return;
        const milestoneId = extraData && extraData.milestoneId;
        if (milestoneId && (quote.milestones || []).some((milestone) => milestone && milestone.id === milestoneId)) found = quote;
        else if (!milestoneId && extraData && quote.mission_id && quote.mission_id === extraData.id) found = quote;
    });
    return found;
}

function appendPayableQuoteAction(parent, quote) {
    if (payoutBlocksPayment(quote)) {
        appendPayoutPrompt(parent, quote);
        return;
    }
    const payment = window.LYANN_QUOTE_PAYMENT;
    const payable = payment && payment.payableMilestoneForQuote(quote, getMyId());
    if (!parent || !payable) return;
    const actions = document.createElement('div');
    actions.className = 'chat-timeline-actions';
    const pay = document.createElement('button');
    pay.type = 'button';
    pay.className = 'btn btn-primary';
    pay.dataset.quotePay = '1';
    pay.style.background = '#2E7D32';
    pay.textContent = payment.payButtonLabel(payable.amount);
    pay.addEventListener('click', () => {
        if (pay.disabled || pay.classList.contains('is-busy')) return;
        const payKey = (quote.milestones || []).find((m) => m && m.status === 'PENDING')?.id || quote.id;
        if (dealMutationGuard && dealMutationGuard.isBusy('pay', payKey)) return;
        setButtonBusy(pay, true);
        Promise.resolve(payment.dispatchQuotePay(quote, getMyId(), (action, payload) => handleChatAction(action, payload)))
            .finally(() => { if (pay.isConnected) setButtonBusy(pay, false); });
    });
    actions.appendChild(pay);
    parent.appendChild(actions);
}

function repaintQuoteTimelineCards(box) {
    if (!box) return;
    box.querySelectorAll('[data-entity-type="quote"][data-entity-id]').forEach((node) => {
        const quote = timelineQuotes.get(node.dataset.entityId || '');
        if (!quote) return;
        const replacement = renderTimelineCard({
            id: node.dataset.messageId,
            createdAt: node.dataset.createdAt,
            timestamp: node.dataset.createdAt ? Date.parse(node.dataset.createdAt) : null,
            messageType: node.dataset.messageType,
            entityType: 'quote',
            entityId: quote.id,
            sender: 'them'
        });
        node.replaceWith(replacement);
    });
}

function resolveChatEventDossier(quote) {
    const api = window.LYANN_MISSION_DOSSIER;
    const contact = currentChatContact;
    if (api && typeof api.resolveEventDossier === 'function') {
        return api.resolveEventDossier(quote, contact && contact.dossiers);
    }
    return { ok: false, title: '', requestId: '', invitationId: '', reason: 'no_api' };
}

function dossierTitleForEvent(quote) {
    const resolved = resolveChatEventDossier(quote);
    return resolved.ok ? (resolved.title || '') : '';
}

function viewerMaySeeQuoteAmount(quote) {
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    if (!quote || !userId) return false;
    return String(quote.requester_id) === String(userId)
        || String(quote.provider_id || quote.helper_id) === String(userId);
}

function attachDossierEventCta(wrapper, quote) {
    if (!wrapper || wrapper.querySelector('.chat-dossier-event-open')) return;
    const resolved = resolveChatEventDossier(quote);
    if (!resolved.ok || (!resolved.requestId && !resolved.invitationId)) return;
    const actions = document.createElement('div');
    actions.className = 'chat-dossier-event-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-outline chat-dossier-event-open';
    button.textContent = 'Voir le dossier';
    button.setAttribute('data-dossier-request', resolved.requestId || '');
    button.setAttribute('data-dossier-invitation', resolved.invitationId || '');
    button.addEventListener('click', (event) => {
        event.stopPropagation();
        void openMissionDossier({ requestId: resolved.requestId, invitationId: resolved.invitationId });
    });
    actions.appendChild(button);
    wrapper.appendChild(actions);
}

function attachGuidedEventBody(wrapper, type, quote) {
    const dossierApi = window.LYANN_MISSION_DOSSIER;
    const resolved = resolveChatEventDossier(quote);
    const missionTitle = resolved.ok ? resolved.title : '';
    let eventType = type;
    if (type === 'quote_updated' && quote && Number(quote.version) > 1) eventType = 'quote_replaced';
    const eventTitle = dossierApi && typeof dossierApi.compactEventLabel === 'function'
        ? dossierApi.compactEventLabel(eventType, '')
        : (TIMELINE_LABELS[eventType] || TIMELINE_LABELS[type] || 'Mise à jour');
    const titleNode = wrapper.querySelector('.chat-timeline-title');
    if (titleNode) titleNode.textContent = eventTitle;
    wrapper.classList.add('chat-dossier-event', 'chat-notice-compact');
    if (!resolved.ok) wrapper.classList.add('chat-notice-neutral');
    if (wrapper.querySelector('.chat-timeline-body')) {
        if (resolved.ok) attachDossierEventCta(wrapper, quote);
        return;
    }
    if (!quote) return;
    const body = document.createElement('div');
    body.className = 'chat-timeline-body';
    if (missionTitle) {
        const name = document.createElement('div');
        name.className = 'chat-timeline-mission';
        name.textContent = missionTitle;
        body.appendChild(name);
    }
    if (quote && quote.total_amount != null && viewerMaySeeQuoteAmount(quote)) {
        const amount = document.createElement('div');
        amount.className = 'chat-timeline-amount';
        amount.textContent = Number(quote.total_amount) + ' €';
        body.appendChild(amount);
    }
    const next = document.createElement('div');
    next.className = 'chat-timeline-meta';
    const payment = window.LYANN_QUOTE_PAYMENT;
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    const providerId = quote ? String(quote.provider_id || quote.helper_id || '') : '';
    const readiness = providerId && payoutReadinessByUser.has(providerId)
        ? payoutReadinessByUser.get(providerId)
        : null;
    const view = quote && userId && payment && readiness
        ? payment.missionCard(quote, userId, readiness, { requestTitle: missionTitle })
        : null;
    next.textContent = (dossierApi && typeof dossierApi.explainNextStep === 'function')
        ? dossierApi.explainNextStep({
            roleCode: quote && userId && String(quote.requester_id) === String(userId) ? 'requester' : 'lyanneur',
            quote,
            view,
            readiness: readiness || ''
        })
        : '';
    if (next.textContent) body.appendChild(next);
    if (body.childElementCount) wrapper.appendChild(body);
    attachDossierEventCta(wrapper, quote);
}

function renderTimelineCard(msg) {
    const type = msg.messageType || msg.type;
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-timeline-card';
    if (msg.id) wrapper.dataset.messageId = String(msg.id);
    if (msg.createdAt) wrapper.dataset.createdAt = String(msg.createdAt);
    wrapper.dataset.messageType = type;
    if (msg.entityType) wrapper.dataset.entityType = msg.entityType;
    if (msg.entityId) wrapper.dataset.entityId = String(msg.entityId);
    const title = document.createElement('div');
    title.className = 'chat-timeline-title';
    title.textContent = TIMELINE_LABELS[type] || 'Nouveau message';
    wrapper.appendChild(title);
    const meta = msg.metadata && typeof msg.metadata === 'object' ? msg.metadata : {};
    if (type === 'visit_proposed' || type === 'visit_accepted' || type === 'visit_declined' || type === 'visit_rescheduled') {
        const when = document.createElement('div');
        when.className = 'chat-timeline-meta';
        when.textContent = [meta.label, meta.slot, meta.note].filter(Boolean).join(' · ') || (msg.text || '');
        wrapper.appendChild(when);
        const mine = msg.sender === 'me' || msg.sender === getMyId();
        if (type === 'visit_proposed' && !mine && msg.id) {
            const actions = document.createElement('div');
            actions.className = 'chat-timeline-actions';
            const accept = document.createElement('button');
            accept.type = 'button';
            accept.className = 'btn btn-primary';
            accept.textContent = 'Accepter';
            accept.addEventListener('click', () => respondVisit(msg.id, 'accept', accept));
            const decline = document.createElement('button');
            decline.type = 'button';
            decline.className = 'btn btn-outline';
            decline.textContent = 'Refuser';
            decline.addEventListener('click', () => respondVisit(msg.id, 'decline', decline));
            actions.append(accept, decline);
            wrapper.appendChild(actions);
        }
    } else if (type === 'quote_created' || type === 'quote_updated') {
        const quote = timelineQuotes.get(String(msg.entityId || ''));
        const dossierApi = window.LYANN_MISSION_DOSSIER;
        const resolved = resolveChatEventDossier(quote);
        const replaced = !!(quote && (Number(quote.version) > 1 || type === 'quote_updated'));
        const eventType = replaced ? 'quote_replaced' : type;
        const eventTitle = dossierApi && typeof dossierApi.compactEventLabel === 'function'
            ? dossierApi.compactEventLabel(eventType, '')
            : (replaced ? 'Devis remplacé' : (TIMELINE_LABELS[type] || 'Devis'));
        title.textContent = eventTitle;
        wrapper.classList.add('chat-dossier-event', 'chat-notice-compact');
        if (!resolved.ok) wrapper.classList.add('chat-notice-neutral');
        const body = document.createElement('div');
        body.className = 'chat-timeline-body';
        if (resolved.ok && resolved.title) {
            const name = document.createElement('div');
            name.className = 'chat-timeline-mission';
            name.textContent = resolved.title;
            body.appendChild(name);
        }
        if (quote && quote.total_amount != null && viewerMaySeeQuoteAmount(quote)) {
            const amount = document.createElement('div');
            amount.className = 'chat-timeline-amount';
            amount.textContent = Number(quote.total_amount) + ' €';
            body.appendChild(amount);
        }
        const description = document.createElement('div');
        description.textContent = ((quote && quote.description) || '').slice(0, 140);
        if (description.textContent) body.appendChild(description);
        const revisionSummary = window.LYANN_QUOTE_REVISION && window.LYANN_QUOTE_REVISION.describeRevision
            ? window.LYANN_QUOTE_REVISION.describeRevision(quote)
            : { changed: false };
        if (revisionSummary.changed) {
            title.textContent = 'Devis remplacé';
            const change = document.createElement('div');
            change.className = 'chat-timeline-state';
            change.textContent = 'Devis modifié · version ' + revisionSummary.nextVersion;
            body.appendChild(change);
            const amounts = document.createElement('div');
            amounts.className = 'chat-timeline-meta';
            const previousAmount = revisionSummary.previousAmount != null ? revisionSummary.previousAmount + ' €' : 'montant précédent';
            const nextAmount = revisionSummary.nextAmount != null ? revisionSummary.nextAmount + ' €' : 'nouveau montant';
            amounts.textContent = 'Ancien montant : ' + previousAmount + ' · Nouveau montant : ' + nextAmount;
            body.appendChild(amounts);
            revisionSummary.lines.forEach((line) => {
                const item = document.createElement('div');
                item.className = 'chat-timeline-meta';
                item.textContent = line.text;
                body.appendChild(item);
            });
            const history = document.createElement('button');
            history.type = 'button';
            history.className = 'btn btn-outline';
            history.textContent = 'Voir la version précédente';
            history.addEventListener('click', () => window.openPreviousQuoteVersion(quote.id));
            body.appendChild(history);
        } else if (quote && Number(quote.version) > 1) {
            const version = document.createElement('div');
            version.className = 'chat-timeline-meta';
            version.textContent = 'Version ' + quote.version;
            body.appendChild(version);
        }
        if (quote && (quote.status === 'ACCEPTED' || quote.status === 'REJECTED')) {
            const state = document.createElement('div');
            state.className = 'chat-timeline-state';
            state.textContent = quote.status === 'ACCEPTED' ? '✓ Accepté' : 'Devis refusé';
            body.appendChild(state);
        } else if (quote && quote.status === 'SENT') {
            const state = document.createElement('div');
            state.className = 'chat-timeline-state';
            state.textContent = quote.requester_id === getMyId()
                ? (revisionSummary.changed ? 'Nouvelle version à traiter sur le suivi de mission' : 'Devis en attente de votre réponse')
                : 'Devis envoyé · en attente de réponse';
            body.appendChild(state);
        }
        // E2: accept / refuse / modify / pay live only on missionCard — timeline stays informational.
        wrapper.appendChild(body);
        attachDossierEventCta(wrapper, quote);
    } else if (type === 'milestone_completed') {
        const quote = timelineQuotes.get(String(msg.entityId || ''))
            || [...timelineQuotes.values()].find((row) => Array.isArray(row && row.milestones) && row.milestones.some((item) => String(item.id) === String(msg.entityId || '')))
            || null;
        attachGuidedEventBody(wrapper, type, quote);
        if (!quote) {
            const body = document.createElement('div');
            body.className = 'chat-timeline-body';
            const line = document.createElement('div');
            line.className = 'chat-timeline-meta';
            line.textContent = 'La prestation est déclarée terminée.';
            body.appendChild(line);
            wrapper.appendChild(body);
        }
    } else if (type === 'payment_requested') {
        // The title is enough. The raw status (CREATED) stays off the card.
    } else if (type === 'payment_secured') {
        const quote = timelineQuotes.get(String(msg.entityId || ''))
            || [...timelineQuotes.values()].find((row) => Array.isArray(row && row.payments) && row.payments.some((item) => String(item.id) === String(msg.entityId || '')))
            || null;
        if (quote) {
            attachGuidedEventBody(wrapper, type, quote);
        } else {
        const body = document.createElement('div');
        body.className = 'chat-timeline-body';
        const line = document.createElement('div');
        line.className = 'chat-timeline-meta';
        line.textContent = 'Le montant est encaissé.';
        body.appendChild(line);
        wrapper.appendChild(body);
        }
    } else if (type === 'quote_declined') {
        const quote = timelineQuotes.get(String(msg.entityId || '')) || null;
        attachGuidedEventBody(wrapper, type, quote);
        if (!quote) {
            const body = document.createElement('div');
            body.className = 'chat-timeline-body';
            const headline = document.createElement('div');
            headline.className = 'chat-timeline-state';
            headline.textContent = 'Le devis a été refusé.';
            body.appendChild(headline);
            wrapper.appendChild(body);
        }
    } else if (type === 'quote_accepted') {
        attachGuidedEventBody(wrapper, type, timelineQuotes.get(String(msg.entityId || '')) || null);
    } else if (meta.title || meta.status) {
        const line = document.createElement('div');
        line.className = 'chat-timeline-meta';
        line.textContent = [meta.title, meta.status].filter(Boolean).join(' · ');
        wrapper.appendChild(line);
    }
    const time = document.createElement('div');
    time.className = 'chat-timeline-time';
    time.textContent = typeof msg.timestamp === 'number' ? chatTimeLabel(msg.timestamp) : '';
    wrapper.appendChild(time);
    return wrapper;
}

/**
 * E4 — Re-read server deal state (E1-scoped) and re-paint ActionPanel only.
 * Never infers payment/mission phase from the wake message alone.
 */
async function paintDealContextFromServer(contact, userId, token, scopeSnap) {
    const contactId = contact && contact.id;
    if (!contactId || !userId) return { applied: false };
    // Capture E1 options from the contact that started this refresh — never the live
    // currentChatContact, which may have switched mid-flight.
    const scoped = dealContextScopeFromContact(contact);
    const fetchOptions = {
        fresh: true,
        requestId: scoped.requestId || null,
        invitationId: scoped.invitationId || null,
        missionId: scoped.missionId || null,
        conversationId: scoped.conversationId || null
    };
    if (window.LYANN_MESSAGING_REPOSITORY && typeof window.LYANN_MESSAGING_REPOSITORY.invalidateQuoteContext === 'function') {
        window.LYANN_MESSAGING_REPOSITORY.invalidateQuoteContext(userId, contactId);
    }
    let quotes;
    try {
        quotes = applyQuoteContextMeta(
            await window.LYANN_MESSAGING_REPOSITORY?.getQuoteContext?.(userId, contactId, fetchOptions),
            contact
        );
    } catch (err) {
        console.warn('[DEAL CONTEXT] refresh failed', err);
        if (dealContextRefresh && !dealContextRefresh.shouldAccept(token, scopeSnap)) return { applied: false, stale: true };
        if (!currentChatContact || currentChatContact.id !== contactId) return { applied: false, stale: true };
        const errBox = document.getElementById('chatMessagesContainer');
        // E5.1: honest error state instead of a vanished panel or a stuck loader.
        if (errBox) paintDealRecaps(errBox, [], { panel: 'error' });
        return { applied: true, error: true };
    }
    if (dealContextRefresh && !dealContextRefresh.shouldAccept(token, scopeSnap)) {
        return { applied: false, stale: true };
    }
    if (!currentChatContact || currentChatContact.id !== contactId) {
        return { applied: false, stale: true };
    }
    const box = document.getElementById('chatMessagesContainer');
    if (!box || !Array.isArray(quotes)) return { applied: false };
    if (quotes.ambiguous || (contact.missionAmbiguous && !scoped.requestId)) {
        paintDealRecaps(box, [], { panel: 'ambiguous' });
        if (typeof paintThreadBusinessBanner === 'function') paintThreadBusinessBanner();
        return { applied: true, ambiguous: true };
    }
    if (!quotes.length) {
        // E5.1: an empty server list must not wipe a just-rebuilt panel while the
        // request-scoped deal still exists in the thread cache (switch / reopen).
        const scopedRequest = scoped.requestId ? String(scoped.requestId) : '';
        const cached = [];
        timelineQuotes.forEach((quote) => {
            if (!quote || !quote.id || String(quote.id).startsWith('milestone:')) return;
            const quoteRequest = String(quote.request_id || quote.requestId || '');
            if (scopedRequest && quoteRequest && quoteRequest !== scopedRequest) return;
            if (scopedRequest && !quoteRequest && quote.mission_related_request_id && String(quote.mission_related_request_id) !== scopedRequest) return;
            cached.push(quote);
        });
        if (cached.length) {
            paintDealRecaps(box, cached);
            if (typeof paintThreadBusinessBanner === 'function') paintThreadBusinessBanner();
            syncLiveDealActions(cached);
            return { applied: true, quotes: cached, fromCache: true };
        }
        if (scopedRequest || scoped.invitationId || scoped.missionId) {
            const leftover = box.querySelector('[data-action-panel], [data-deal-recap]');
            const leftoverReq = leftover && leftover.dataset.requestId ? String(leftover.dataset.requestId) : '';
            const leftoverKind = leftover && leftover.dataset.panelKind ? String(leftover.dataset.panelKind) : '';
            const sameLiveDeal = leftover
                && leftoverReq
                && leftoverReq === scopedRequest
                && leftoverKind !== 'loading'
                && leftoverKind !== 'empty'
                && leftoverKind !== 'error'
                && leftoverKind !== 'ambiguous';
            if (sameLiveDeal) {
                paintDealRecaps(box, [], { softEmpty: true });
            } else {
                paintDealRecaps(box, [], {
                    panel: 'empty',
                    panelMeta: {
                        requestId: scoped.requestId || null,
                        requestTitle: (contact.activeDossier && contact.activeDossier.title)
                            || (contact.requestData && contact.requestData.title)
                            || ''
                    }
                });
            }
            if (typeof paintThreadBusinessBanner === 'function') paintThreadBusinessBanner();
            paintPendingActionBanner();
            return { applied: true, empty: true };
        }
    }
    if (scoped.requestId) {
        timelineQuotes.forEach((value, key) => {
            if (String(key || '').startsWith('milestone:')) return;
            const dossierApi = window.LYANN_MISSION_DOSSIER;
            if (dossierApi && typeof dossierApi.quoteBelongsToDossier === 'function') {
                if (!dossierApi.quoteBelongsToDossier(value, { requestId: scoped.requestId, invitationId: scoped.invitationId })) {
                    timelineQuotes.delete(key);
                }
            } else if (value && value.request_id && String(value.request_id) !== String(scoped.requestId)) {
                timelineQuotes.delete(key);
            }
        });
    }
    quotes.forEach((quote) => {
        let next = quote;
        const previous = timelineQuotes.get(String(quote.id));
        if (previous && (previous.status === 'ACCEPTED' || previous.status === 'REJECTED') && quote.status === 'SENT') {
            // Keep a just-confirmed local terminal status if the list read is momentarily stale.
            next = Object.assign({}, quote, { status: previous.status });
        }
        timelineQuotes.set(String(next.id), next);
        (next.milestones || []).forEach((milestone) => timelineQuotes.set('milestone:' + milestone.id, milestone));
        if (next.status === 'ACCEPTED') {
            const proposeRow = document.getElementById('btnCtxPropose');
            if (proposeRow && proposeRow.parentElement) proposeRow.parentElement.style.display = 'none';
        }
        const covered = box.querySelector(quoteTimelineSelector(next.id));
        if (covered) {
            box.querySelectorAll('[data-live-quote-id="' + CSS.escape(String(next.id)) + '"]').forEach((node) => node.remove());
            repaintQuoteTimelineCards(box);
            repaintFundingCards(box);
            if (next.status === 'REJECTED' || next.status === 'DECLINED') ensureQuoteDeclinedNotice(next);
            return;
        }
        applyQuoteStatusToDom(next.id, next.status);
        if (next.status === 'REJECTED' || next.status === 'DECLINED') ensureQuoteDeclinedNotice(next);
    });
    // ActionPanel / missionCard only — payment phase from server quote fields (E3 + E4).
    paintDealRecaps(box, quotes);
    if (typeof paintThreadBusinessBanner === 'function') paintThreadBusinessBanner();
    syncLiveDealActions(quotes);
    return { applied: true, quotes };
}

async function refreshDealContext(reason) {
    const contact = currentChatContact;
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    if (!contact?.id || !userId) return null;
    const scope = dealContextScopeFromContact(contact);
    if (dealContextRefresh) {
        dealContextRefresh.setScope(scope);
        return dealContextRefresh.request(reason || 'manual', async ({ token, scope: scopeSnap }) => (
            paintDealContextFromServer(contact, userId, token, scopeSnap)
        ));
    }
    return paintDealContextFromServer(
        contact,
        userId,
        0,
        dealContextSyncApi && typeof dealContextSyncApi.scopeKey === 'function'
            ? dealContextSyncApi.scopeKey(scope)
            : ''
    );
}
window.refreshDealContext = refreshDealContext;

async function refreshOpenBusinessCards() {
    return refreshDealContext('legacy');
}

/**
 * E5.1 — single ActionPanel owner after a thread DOM rebuild.
 * renderMessages() wipes the container; the panel must never silently vanish.
 * Show a neutral loading panel when a deal context is known/expected, then let the
 * generation-guarded refreshDealContext() repaint from E1 scope + server state.
 * While refreshChatUI() is resolving the thread scope, it triggers the refresh itself
 * ('thread-open') once the explicit request context is known.
 */
function scheduleActionPanelRebuild(box, hadPanel) {
    if (!box || !currentChatContact || !isUUID(currentChatContact.id)) return;
    if (isLyannSupportContact(currentChatContact.id)) return;
    if (box.id === 'chatMessagesContainer') {
        box.querySelectorAll('[data-action-panel]').forEach((node) => node.remove());
        if (!chatRefreshInFlight) void refreshDealContext('render');
        return;
    }
    if (currentChatContact.missionAmbiguous && !currentChatContact.requestId) {
        if (!box.querySelector('[data-action-panel]')) paintDealRecaps(box, [], { panel: 'ambiguous', skipWatch: true });
        return;
    }
    const expectsDeal = hadPanel || !!(currentChatContact.requestId || currentChatContact.invitationId || currentChatContact.threadMission);
    if (expectsDeal && !box.querySelector('[data-action-panel]')) {
        paintDealRecaps(box, [], { panel: 'loading', skipWatch: true });
    }
    if (!chatRefreshInFlight) void refreshDealContext('render');
}

async function renderMessages(passedMessages = null, options = {}) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container) return;

    // ATOMIC CHAT RENDER: keep the current conversation visible while fresh data is loading.
    // Only the newest render is allowed to commit, preventing overlapping refreshes from flickering.
    const renderGeneration = ++chatRenderGeneration;

    if (!currentChatContact) {
        container.innerHTML = '';
        syncMissionJump(false);
        renderEmptyConversationState(container);
        return;
    }
    syncMissionJump(false);

    let msgs = passedMessages;
    const canRefresh = !Array.isArray(passedMessages);
    let paintedFromCache = false;
    if (!Array.isArray(msgs)) {
        const cached = window.LYANN_MESSAGING_REPOSITORY?.peekMessages?.(getMyId(), currentChatContact.id);
        if (Array.isArray(cached)) {
            msgs = cached;
            paintedFromCache = options.fresh === true;
        } else {
            msgs = await getChatMessages(currentChatContact.id, { ...options, limit: options.limit || 50 });
        }
    }

    // Quotes load after the text is on screen. They must not hold the first paint.
    let realQuotes = Array.isArray(options.quotes) ? options.quotes : [];

    // Ignore stale async renders. A newer refresh already owns the DOM.
    if (renderGeneration !== chatRenderGeneration) return;
    if (!Array.isArray(passedMessages) && window.LYANN_MESSAGING_REPOSITORY?.markConversationRead && typeof getMyId === 'function' && isUUID(currentChatContact?.id)) {
        window.LYANN_MESSAGING_REPOSITORY.markConversationRead(getMyId(), currentChatContact.id).catch(() => {});
    }

    // Full rebuild is reserved for the first paint and a conversation change.
    // Pending outgoing bubbles are put back afterwards so a refresh cannot erase them.
    const pendingOptimistic = [...container.querySelectorAll('[data-optimistic-status="sending"], [data-optimistic-status="failed"], [data-optimistic-status="offline"]')]
        .map((status) => status.closest('.chat-msg-bubble-wrap'))
        .filter((node) => node && !node.dataset.messageId);
    pendingOptimistic.forEach((node) => node.remove());
    const hadActionPanel = !!container.querySelector('[data-action-panel]');
    container.innerHTML = '';
    delete container.dataset.dealRecapFp;

    if (!Array.isArray(msgs) || (msgs.length === 0 && realQuotes.length === 0)) {
        renderEmptyConversationState(container);
        armThreadHistory(0);
        // E5.1: empty chat text must not skip ActionPanel — same single owner as non-empty threads.
        scheduleActionPanelRebuild(container, hadActionPanel);
        return;
    }

    // Add Date Separator at top
    const dateSep = document.createElement('div');
    dateSep.className = 'chat-date-separator';
    dateSep.innerHTML = `<span>Aujourd'hui</span>`;
    container.appendChild(dateSep);

    msgs.forEach(msg => {
        // Skip legacy local PRICE_PROPOSAL cards if we have real Supabase quotes
        if (msg.cardType === 'PRICE_PROPOSAL' && realQuotes.length > 0) return;

        const wrapper = document.createElement('div');
        const isMe = msg.sender === 'me' || msg.sender === getMyId();
        const msgId = msg.id || ('msg_' + Math.random().toString(36).substr(2, 9));
        msg.id = msgId;

        let timeStr = msg.timestamp;
        if (typeof msg.timestamp === 'number') {
            const d = new Date(msg.timestamp);
            timeStr = isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        const authorName = isMe ? 'Vous' : (currentChatContact ? currentChatContact.name : 'Membre');

        wrapper.className = `chat-msg-bubble-wrap ${isMe ? 'sent' : 'received'}`;
        wrapper.dataset.messageId = String(msgId);

        notePayoutReadyMessage(msg);
        const timelineType = msg.messageType || msg.type;
        const knownQuotes = [];
        timelineQuotes.forEach((quote) => { if (quote && quote.status) knownQuotes.push(quote); });
        const hiddenTimeline = window.LYANN_QUOTE_PAYMENT && window.LYANN_QUOTE_PAYMENT.hiddenTimelineTypes
            ? window.LYANN_QUOTE_PAYMENT.hiddenTimelineTypes(msgs, knownQuotes)
            : new Set();
        if (isTimelineMessage(msg)) {
            const payment = window.LYANN_QUOTE_PAYMENT;
            const visibleNotice = payment && typeof payment.isVisibleDealNotice === 'function'
                ? payment.isVisibleDealNotice(timelineType)
                : timelineType === 'quote_declined';
            if (!visibleNotice && payment && payment.isDealTimeline && payment.isDealTimeline(timelineType)) return;
            if (!visibleNotice && hiddenTimeline.has(timelineType)) return;
            const entityQuote = timelineQuotes.get(String(msg.entityId || msg.entity_id || ''));
            if ((visibleNotice || (payment && payment.isDealTimeline && payment.isDealTimeline(timelineType)))
                && !dealEventBelongsToActiveDossier(entityQuote, msg)) {
                return;
            }
            const node = renderTimelineCard(msg);
            if (node) container.appendChild(node);
        }
        else if (msg.type === 'text' && (isQuoteAcceptedNotice(msg.text) || isRpcNoiseMessage(msg.text))) {
            return;
        }
        else if (isPayoutReadyNotice(msg)) {
            return;
        }
        else if (msg.type === 'text' || msg.type === 'photo' || msg.type === 'video' || msg.type === 'document') {
            const node = createThreadBubble(msg, { timeStr, isMe, authorName, msgId });
            if (node) container.appendChild(node);
        }
        else if (msg.type === 'system_card') {
            const div = document.createElement('div');
            div.className = `chat-msg-card ${isMe ? 'align-right' : 'align-left'}`;

            if (msg.cardType === 'PRICE_PROPOSAL') {
                const name = isMe ? 'Vous proposez' : `${currentChatContact.name} vous propose`;
                const inlineActions = !isMe ? `
                    <div class="chat-card-inline-actions">
                        <button type="button" class="btn btn-primary btn-accept-inline"><i class="ph ph-check-circle"></i> Accepter (${msg.amount} €)</button>
                        <button type="button" class="btn btn-outline btn-counter-inline">Contre-proposer</button>
                    </div>
                ` : `<div style="font-size:0.85rem; color:var(--text-muted); margin-top:8px; font-weight:600;"><i class="ph ph-clock"></i> En attente d'acceptation</div>`;

                div.innerHTML = `
                    <div class="chat-card-header"><i class="ph ph-lightning"></i> PROPOSITION · ${escapeChatHtml(name).toUpperCase()}</div>
                    <div class="chat-card-body">
                        <div style="font-size: 1.05rem; font-weight: 700; color: var(--text);">${escapeChatHtml(msg.title)}</div>
                        <div class="chat-card-price">${msg.amount} €</div>
                        ${inlineActions}
                    </div>
                `;

                setTimeout(() => {
                    const accBtn = div.querySelector('.btn-accept-inline');
                    const ctrBtn = div.querySelector('.btn-counter-inline');
                    if (accBtn) {
                        accBtn.onclick = () => {
                            setButtonBusy(accBtn, true);
                            Promise.resolve(handleChatAction('ACCEPT_PRICE', { title: msg.title, agreed_price: msg.amount, id: msg.missionId || null, quoteId: msg.quoteId || null }))
                                .catch(() => setButtonBusy(accBtn, false))
                                .finally(() => { if (accBtn.isConnected && !quoteActionLocks.has(msg.quoteId)) setButtonBusy(accBtn, false); });
                        };
                    }
                    if (ctrBtn) {
                        ctrBtn.onclick = () => handleChatAction('COUNTER_OFFER');
                    }
                }, 0);
            }
            else if (msg.cardType === 'AGREEMENT_REACHED') {
                const inlinePay = !isMe ? `
                    <div class="chat-card-inline-actions">
                        <button type="button" class="btn btn-primary btn-pay-inline" style="background:#2E7D32;"><i class="ph ph-lock-key"></i> Payer & Bloquer (${msg.amount}€)</button>
                    </div>
                ` : '';
                div.innerHTML = `
                    <div class="chat-card-header"><i class="ph-fill ph-check-circle" style="color:#2E7D32"></i> Accord trouvé !</div>
                    <div class="chat-card-body">
                        <div>${escapeChatHtml(msg.title)}</div>
                        <div class="chat-card-price">${msg.amount} €</div>
                        ${inlinePay}
                    </div>
                `;
                setTimeout(() => {
                    const payBtn = div.querySelector('.btn-pay-inline');
                    if (payBtn) payBtn.onclick = () => handleChatAction('PAY_MISSION', { title: msg.title, agreed_price: msg.amount, id: msg.missionId || null });
                }, 0);
            }
            else if (msg.cardType === 'PAYMENT_CONFIRMED') {
                div.className = 'chat-msg-card align-left';
                div.style.margin = '10px auto';
                div.innerHTML = `
                    <div class="chat-card-header"><i class="ph-fill ph-lock-key" style="color:#E63B2E"></i> Paiement sécurisé</div>
                    <div class="chat-card-body">
                        <div>Les fonds (${msg.amount}€) sont mis sous séquestre. La mission peut commencer !</div>
                    </div>
                `;
            }
            else if (msg.cardType === 'WORK_DONE') {
                const name = isMe ? 'Vous avez terminé' : `${currentChatContact.name} indique avoir terminé`;
                const confirmBtn = !isMe ? `
                    <div class="chat-card-inline-actions">
                        <button type="button" class="btn btn-primary btn-confirm-work"><i class="ph ph-check"></i> Valider & Libérer les fonds</button>
                    </div>
                ` : '';
                div.innerHTML = `
                    <div class="chat-card-header"><i class="ph ph-flag-checkered"></i> ${escapeChatHtml(name)}</div>
                    <div class="chat-card-body">
                        <div>Veuillez valider la fin de la mission pour déclencher le versement.</div>
                        ${confirmBtn}
                    </div>
                `;
                setTimeout(() => {
                    const cBtn = div.querySelector('.btn-confirm-work');
                    if (cBtn) {
                        cBtn.onclick = () => {
                            setButtonBusy(cBtn, true);
                            Promise.resolve(handleChatAction('CONFIRM_DONE', { id: msg.missionId || null, milestoneId: msg.milestoneId || null }))
                                .catch(() => setButtonBusy(cBtn, false))
                                .finally(() => setButtonBusy(cBtn, false));
                        };
                    }
                }, 0);
            }
            else if (msg.cardType === 'MISSION_COMPLETED') {
                div.className = 'chat-msg-card align-left';
                div.style.margin = '10px auto';
                div.style.background = 'rgba(46,125,50,0.1)';
                div.innerHTML = `
                    <div class="chat-card-header"><i class="ph-fill ph-confetti" style="color:#2E7D32"></i> Mission Terminée !</div>
                    <div class="chat-card-body">
                        <div>Merci d'avoir fait vivre le réseau LYANN. Le versement est en cours.</div>
                    </div>
                `;
            }
            container.appendChild(div);
        }
    });

    // Render Production Supabase Real Quote Cards
    function appendLiveQuoteCard(container, q) {
        if (!q || !q.id || !container) return;
        // Timeline message cards already cover the quote — avoid a duplicate live card.
        if (container.querySelector(quoteTimelineSelector(q.id))) return;
        // Mission terminée : pas de carte devis ni deal-recap collés après les messages récents.
        if (quoteIsClosedDeal(q)) {
            container.querySelectorAll('[data-live-quote-id="' + CSS.escape(String(q.id)) + '"]').forEach((node) => node.remove());
            return;
        }
        if (container.querySelector('[data-deal-recap="' + CSS.escape(String(q.id)) + '"]')) return;
        const status = String(q.status || '');
        if (!['SENT', 'VIEWED', 'REVISED', 'ACCEPTED'].includes(status)) return;
        const isMyQuote = (q.provider_id || q.helper_id) === getMyId();
        const quoteDiv = document.createElement('div');
        quoteDiv.dataset.liveQuote = '1';
        quoteDiv.dataset.liveQuoteId = q.id;
        let statusBadgeLabel = 'Devis';
        if (q.status === 'REJECTED') statusBadgeLabel = 'Refusé';
        else if (q.status === 'ACCEPTED') statusBadgeLabel = 'Accepté';
        else if (q.status === 'SENT' || q.status === 'VIEWED' || q.status === 'REVISED') statusBadgeLabel = 'Envoyé';
        window.__lyannAppendLiveQuote = appendLiveQuoteCard;
        const dossierApi = window.LYANN_MISSION_DOSSIER;
        const compactLabel = dossierApi && typeof dossierApi.compactEventLabel === 'function'
            ? dossierApi.compactEventLabel(q.status === 'REJECTED' ? 'quote_declined' : (q.status === 'ACCEPTED' ? 'quote_accepted' : 'quote_created'), dossierTitleForEvent(q))
            : (q.description || 'Devis');
        const amountHtml = (q.total_amount != null && viewerMaySeeQuoteAmount(q))
            ? ('<div class="chat-timeline-amount">' + Number(q.total_amount) + ' €</div>')
            : '';
        quoteDiv.className = 'chat-timeline-card chat-dossier-event';
        quoteDiv.style.cssText = '';
        quoteDiv.innerHTML = [
            '<div class="chat-timeline-title">' + escapeChatHtml(compactLabel) + '</div>',
            '<div class="chat-timeline-meta">' + escapeChatHtml(statusBadgeLabel) + (isMyQuote ? ' · Vous' : '') + '</div>',
            amountHtml,
            '<button type="button" class="btn btn-outline chat-dossier-event-open">Voir le dossier</button>'
        ].join('');
        const openBtn = quoteDiv.querySelector('.chat-dossier-event-open');
        if (openBtn) {
            openBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                openMissionDossier({
                    requestId: q.request_id || null,
                    invitationId: q.request_invitation_id || null
                });
            });
        }
        container.appendChild(quoteDiv);
    }
    realQuotes.forEach((quote) => timelineQuotes.set(String(quote.id), quote));
    if (realQuotes.length) paintDealRecaps(container, realQuotes);
    realQuotes.forEach((quote) => appendLiveQuoteCard(container, quote));

    if (window.LYANN_MESSAGING_REPOSITORY && isUUID(currentChatContact.id)) {
        const generation = renderGeneration;
        const contactId = currentChatContact.id;
        const userId = getMyId();
        const painted = Array.isArray(msgs) ? msgs : [];
        if (canRefresh && paintedFromCache) {
            window.LYANN_MESSAGING_REPOSITORY.getMessages(userId, contactId, { fresh: true, limit: 50 }).then((fresh) => {
                if (generation !== chatRenderGeneration || currentChatContact?.id !== contactId || !Array.isArray(fresh)) return;
                const box = document.getElementById('chatMessagesContainer');
                const stick = threadIsNearBottom(box);
                fresh.forEach((msg) => {
                    if (!msg || msg.type === 'transactional') return;
                    appendLiveChatMessage({
                        id: msg.id,
                        sender_id: msg.sender === 'me' ? userId : contactId,
                        content: msg.text || '',
                        created_at: msg.createdAt || (typeof msg.timestamp === 'number' ? new Date(msg.timestamp).toISOString() : null),
                        is_read: msg.status === 'read',
                        attachment_type: (msg.attachmentType || msg.type === 'photo' || msg.type === 'video' || msg.type === 'document') ? (msg.attachmentType || msg.type) : null,
                        attachment_url: msg.attachmentPath || msg.photoUrl || '',
                        attachment_name: msg.attachmentName || msg.docName || '',
                        attachment_size: msg.attachmentSize,
                        attachment_mime: msg.attachmentMime || '',
                        message_type: msg.messageType || null,
                        metadata: msg.metadata || null
                    }, { stickToBottom: stick, quiet: true });
                });
            }).catch(() => {});
        }
        if (!realQuotes.length) {
            // E5.1: single ActionPanel owner (generation + E1 scope guarded). No parallel
            // pair-scoped fetch that could repaint/strip the panel after a context switch.
            scheduleActionPanelRebuild(container, hadActionPanel);
        }
    }

    // Dynamic Blocked User UI Check
    const inputArea = document.querySelector('.chat-input-area');
    const existingBlockedBanner = document.getElementById('chatBlockedBanner');

    if (window.isUserBlocked && currentChatContact && (window.isUserBlocked(currentChatContact.id) || window.isUserBlocked(currentChatContact.name))) {
        if (!existingBlockedBanner) {
            const b = document.createElement('div');
            b.id = 'chatBlockedBanner';
            b.className = 'chat-blocked-banner';
            b.style.cssText = 'margin: 16px auto; padding: 16px 20px; background: #FEF2F2; border: 1.5px solid #FCA5A5; border-radius: 16px; text-align: center; color: #991B1B; font-weight: 600; font-size: 0.95rem; max-width: 90%; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.08); display: flex; flex-direction: column; align-items: center; gap: 10px; z-index: 10;';
            b.innerHTML = `
                <div>🚫 <strong>${escapeChatHtml(currentChatContact.name)}</strong> est désormais bloqué.</div>
                <div style="font-size: 0.85rem; font-weight: 400; color: #7F1D1D;">Vous avez bloqué cet utilisateur. Vous ne pouvez plus lui envoyer de messages.</div>
                <button type="button" class="btn btn-sm" onclick="window.unblockUser('${currentChatContact.id}')" style="background: #DC2626; color: #FFFFFF; border: none; border-radius: 20px; padding: 8px 18px; font-weight: 700; cursor: pointer; transition: all 0.2s;">🔓 Débloquer cet utilisateur</button>
            `;
            container.appendChild(b);
        }
        if (inputArea) inputArea.style.display = 'none';
    } else {
        if (existingBlockedBanner) existingBlockedBanner.remove();
        if (inputArea) inputArea.style.display = 'flex';
    }

    pendingOptimistic.forEach((node) => {
        if (!node.isConnected) container.appendChild(node);
    });
    armThreadHistory(Array.isArray(msgs) ? msgs.length : 0);
    scrollThreadToBottom(container, false);
}

const threadHistory = { contactId: null, hasMore: false, loading: false };
const PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const DOC_MIMES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation'
]);
const PHOTO_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);
const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'm4v']);
const DOC_EXT = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'odt', 'ods', 'odp']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_DOC_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 60;

function chatIsOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function formatFileSize(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '';
    if (n < 1024) return Math.round(n) + ' o';
    if (n < 1024 * 1024) {
        const value = n / 1024;
        return (value >= 10 ? value.toFixed(0) : value.toFixed(1)).replace('.', ',') + ' Ko';
    }
    return (n / (1024 * 1024)).toFixed(1).replace('.', ',') + ' Mo';
}

function fileExtension(file) {
    const name = String(file?.name || '');
    const match = name.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : '';
}

function validateChatFile(file, kind) {
    if (!file) return { ok: false, message: 'Choisissez un fichier.' };
    const rawMime = String(file.type || '').toLowerCase();
    const ext = fileExtension(file);
    const photo = kind === 'photo';
    const video = kind === 'video';
    const mime = video && (rawMime === 'video/x-m4v' || rawMime === 'video/m4v') ? 'video/mp4' : rawMime;
    // iOS renvoie souvent un type vide / octet-stream pour les MOV de la galerie.
    const looseNativeVideo = video && (!mime || mime === 'application/octet-stream') && (!ext || VIDEO_EXT.has(ext));
    const mimeOk = photo
        ? (PHOTO_MIMES.has(mime) || (!mime && PHOTO_EXT.has(ext)))
        : video
            ? (VIDEO_MIMES.has(mime) || VIDEO_EXT.has(ext) || looseNativeVideo)
            : (DOC_MIMES.has(mime) || (!mime && DOC_EXT.has(ext)));
    if (!mimeOk) {
        return { ok: false, message: photo ? 'Cette photo n’est pas acceptée. Utilisez JPEG, PNG, WebP ou HEIC.' : (video ? 'Cette vidéo n’est pas acceptée. Utilisez MP4, MOV ou WebM.' : 'Ce document n’est pas accepté.') };
    }
    const limit = photo ? MAX_PHOTO_BYTES : (video ? MAX_VIDEO_BYTES : MAX_DOC_BYTES);
    if (file.size > limit) {
        return { ok: false, message: photo ? 'Cette photo dépasse 10 Mo.' : (video ? 'Cette vidéo dépasse 50 Mo.' : 'Ce document dépasse 20 Mo.') };
    }
    const fallback = photo ? 'image/jpeg' : (video ? (ext === 'mov' ? 'video/quicktime' : 'video/mp4') : 'application/pdf');
    return { ok: true, mime: (VIDEO_MIMES.has(mime) || PHOTO_MIMES.has(mime) || DOC_MIMES.has(mime)) ? mime : fallback, ext: ext || (photo ? 'jpg' : (video ? 'mp4' : 'pdf')) };
}

function safeAttachmentExt(ext, kind) {
    const value = String(ext || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const allowed = kind === 'document' ? DOC_EXT : (kind === 'video' ? VIDEO_EXT : PHOTO_EXT);
    if (value === 'jpeg') return 'jpg';
    return allowed.has(value) ? value : (kind === 'document' ? 'pdf' : (kind === 'video' ? 'mp4' : 'jpg'));
}

function attachmentObjectPath(conversationId, senderId, ext, kind) {
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : createOptimisticClientId().replace(/^optimistic_/, '');
    return conversationId + '/' + senderId + '/' + id + '.' + safeAttachmentExt(ext, kind);
}

function chatToast(message) {
    if (window.NotificationService?.showToast) window.NotificationService.showToast('info', message);
    else if (window.showToast) window.showToast(message, 'info');
    else if (window.lyannAlert) window.lyannAlert(message);
}

function createThreadBubble(msg, hints) {
    const isMe = hints && Object.prototype.hasOwnProperty.call(hints, 'isMe') ? hints.isMe : (msg.sender === 'me' || msg.sender === getMyId());
    const msgId = (hints && hints.msgId) || msg.id || '';
    let timeStr = hints && hints.timeStr;
    if (timeStr == null) timeStr = typeof msg.timestamp === 'number' ? chatTimeLabel(msg.timestamp) : (typeof msg.timestamp === 'string' ? msg.timestamp : '');
    const authorName = (hints && hints.authorName) || (isMe ? 'Vous' : (currentChatContact ? currentChatContact.name : 'Membre'));
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-msg-bubble-wrap ' + (isMe ? 'sent' : 'received');
    if (msgId) wrapper.dataset.messageId = String(msgId);
    if (msg.createdAt) wrapper.dataset.createdAt = String(msg.createdAt);
    const path = msg.attachmentPath || '';
    if (path && !/^https?:/i.test(path) && !String(path).startsWith('blob:')) wrapper.dataset.attachmentPath = path;
    const bubble = document.createElement('div');
    bubble.className = 'chat-msg-bubble ' + (isMe ? 'sent' : 'received');
    if (msg.type === 'photo') {
        const frame = document.createElement('div');
        frame.className = 'chat-msg-photo-wrap';
        const image = document.createElement('img');
        image.className = 'chat-msg-photo';
        image.alt = 'Photo';
        image.loading = 'lazy';
        image.decoding = 'async';
        const direct = msg.photoUrl || (/^(https?:|blob:)/i.test(path) ? path : '');
        if (direct) image.src = direct;
        frame.appendChild(image);
        frame.addEventListener('click', () => { if (image.src) window.openPhotoLightbox(image.src); });
        image.addEventListener('error', () => refreshAttachmentImage(wrapper, image));
        bubble.appendChild(frame);
    } else if (msg.type === 'video') {
        const video = document.createElement('video');
        video.className = 'chat-msg-video';
        video.controls = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.preload = 'metadata';
        video.autoplay = false;
        video.addEventListener('error', () => markVideoUnplayable(video));
        const direct = /^(https?:|blob:)/i.test(path) ? path : '';
        if (direct) video.src = direct;
        bubble.appendChild(video);
    } else if (msg.type === 'document') {
        const card = document.createElement('div');
        card.className = 'chat-msg-doc-card';
        const icon = document.createElement('i');
        icon.className = 'ph ph-file-pdf chat-msg-doc-icon';
        icon.setAttribute('aria-hidden', 'true');
        const info = document.createElement('div');
        const docName = document.createElement('div');
        docName.className = 'chat-msg-doc-name';
        docName.textContent = msg.attachmentName || msg.docName || 'Document';
        const docMeta = document.createElement('div');
        docMeta.className = 'chat-msg-doc-meta';
        docMeta.textContent = msg.docSize || formatFileSize(msg.attachmentSize) || 'Document';
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'chat-msg-doc-open';
        open.textContent = 'Ouvrir';
        open.addEventListener('click', () => openChatDocument(wrapper.dataset.attachmentPath || path));
        info.append(docName, docMeta, open);
        card.append(icon, info);
        bubble.appendChild(card);
    } else {
        if (msg.replyToAuthor || msg.replyToText) {
            const quote = document.createElement('div');
            quote.className = 'chat-quoted-block';
            const who = document.createElement('strong');
            who.textContent = msg.replyToAuthor || '';
            quote.append(who, document.createTextNode(': ' + (msg.replyToText || '')));
            bubble.appendChild(quote);
        }
        const sharedProfileId = String(msg.entityType || msg.entity_type || '').toLowerCase() === 'profile'
            ? String(msg.entityId || msg.entity_id || '')
            : '';
        if (sharedProfileId) {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'lyann-shared-profile-card';
            card.setAttribute('data-open-shared-profile', sharedProfileId);
            const kicker = document.createElement('div');
            kicker.className = 'lyann-shared-profile-kicker';
            kicker.textContent = 'Profil LYANN';
            const title = document.createElement('div');
            title.className = 'lyann-shared-profile-name';
            const meta = msg.metadata && typeof msg.metadata === 'object' ? msg.metadata : {};
            title.textContent = meta.name || meta.displayName || 'Voir ce Lyanneur';
            const cta = document.createElement('div');
            cta.className = 'lyann-shared-profile-cta';
            cta.textContent = 'Ouvrir le profil';
            card.append(kicker, title, cta);
            card.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (typeof window.openPublicMemberProfile === 'function') window.openPublicMemberProfile(sharedProfileId);
            });
            bubble.appendChild(card);
        } else {
            const textNode = document.createElement('div');
            textNode.className = 'chat-msg-text';
            textNode.textContent = msg.text || '';
            bubble.appendChild(textNode);
        }
    }
    const meta = document.createElement('div');
    meta.className = 'chat-msg-time';
    if (timeStr) meta.append(document.createTextNode(String(timeStr) + ' '));
    if (isMe) {
        const marker = document.createElement('span');
        const seen = msg.status === 'read';
        marker.className = 'chat-msg-status ' + (seen ? 'read' : 'sent');
        marker.title = seen ? 'Vu' : 'Envoyé';
        const icon = document.createElement('i');
        icon.className = seen ? 'ph ph-checks' : 'ph ph-check';
        marker.append(icon, document.createTextNode(seen ? ' Vu' : ' Envoyé'));
        meta.appendChild(marker);
    }
    bubble.appendChild(meta);
    wrapper.append(bubble, buildChatActionBar(msgId, isMe, authorName, msg.type === 'text' ? (msg.text || '') : (msg.attachmentName || '')));
    if (msg.type === 'photo' || msg.type === 'video' || msg.type === 'document') queueMicrotask(() => { if (wrapper.isConnected) void hydrateAttachmentNode(wrapper); });
    return wrapper;
}

async function hydrateAttachmentNode(node) {
    const path = node?.dataset?.attachmentPath;
    if (!path || !window.LYANN_API_CLIENT?.signedChatAttachmentUrl) return;
    const url = await window.LYANN_API_CLIENT.signedChatAttachmentUrl(path);
    if (!url || !node.isConnected) return;
    const image = node.querySelector('img.chat-msg-photo');
    if (image) image.src = url;
    const video = node.querySelector('video.chat-msg-video');
    if (video) video.src = url;
    node.dataset.signedReady = '1';
}

async function refreshAttachmentImage(node, image) {
    if (!node || !image || image.dataset.refreshed === '1') return;
    const path = node.dataset.attachmentPath;
    if (!path) return;
    image.dataset.refreshed = '1';
    window.LYANN_API_CLIENT?.clearSignedChatAttachmentUrl?.(path);
    const url = await window.LYANN_API_CLIENT?.signedChatAttachmentUrl?.(path);
    if (url) image.src = url;
}

async function openChatDocument(path) {
    if (!path) return;
    const url = /^https?:/i.test(path) ? path : await window.LYANN_API_CLIENT?.signedChatAttachmentUrl?.(path);
    if (!url) {
        chatToast('Impossible d’ouvrir ce document pour le moment.');
        return;
    }
    window.open(url, '_blank', 'noopener');
}

function renderOptimisticAttachment(detail) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container || !currentChatContact) return null;
    container.querySelector('.chat-empty-state')?.remove();
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-msg-bubble-wrap sent';
    wrapper.dataset.optimisticMessageId = detail.clientId;
    const bubble = document.createElement('div');
    bubble.className = 'chat-msg-bubble sent';
    if (detail.kind === 'photo') {
        const frame = document.createElement('div');
        frame.className = 'chat-msg-photo-wrap';
        const image = document.createElement('img');
        image.className = 'chat-msg-photo';
        image.alt = 'Photo';
        image.src = detail.localUrl || '';
        frame.appendChild(image);
        frame.addEventListener('click', () => { if (image.src) window.openPhotoLightbox(image.src); });
        bubble.appendChild(frame);
    } else if (detail.kind === 'video') {
        const video = document.createElement('video');
        video.className = 'chat-msg-video';
        video.controls = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.src = detail.localUrl || '';
        bubble.appendChild(video);
    } else {
        const card = document.createElement('div');
        card.className = 'chat-msg-doc-card';
        const icon = document.createElement('i');
        icon.className = 'ph ph-file-pdf chat-msg-doc-icon';
        const info = document.createElement('div');
        const docName = document.createElement('div');
        docName.className = 'chat-msg-doc-name';
        docName.textContent = detail.name || 'Document';
        const docMeta = document.createElement('div');
        docMeta.className = 'chat-msg-doc-meta';
        docMeta.textContent = formatFileSize(detail.size) || 'Document';
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'chat-msg-doc-open';
        open.textContent = 'Ouvrir';
        open.addEventListener('click', () => openChatDocument(wrapper.dataset.attachmentPath || ''));
        info.append(docName, docMeta, open);
        card.append(icon, info);
        bubble.appendChild(card);
    }
    const meta = document.createElement('div');
    meta.className = 'chat-msg-time';
    const time = chatTimeLabel(Date.now());
    meta.dataset.timeLabel = time;
    meta.dataset.optimisticStatus = 'sending';
    meta.textContent = time ? time + ' · Envoi…' : 'Envoi…';
    const progress = document.createElement('div');
    progress.className = 'chat-attach-progress';
    const fill = document.createElement('span');
    fill.dataset.uploadProgress = '1';
    progress.appendChild(fill);
    const cancelUpload = document.createElement('button');
    cancelUpload.type = 'button';
    cancelUpload.className = 'chat-upload-cancel';
    cancelUpload.textContent = 'Annuler l’envoi';
    cancelUpload.addEventListener('click', () => {
        const job = outgoingSends.get(detail.clientId);
        if (!job) return;
        job.cancelled = true;
        job.abortController?.abort();
    });
    bubble.append(progress, cancelUpload, meta);
    wrapper.appendChild(bubble);
    container.appendChild(wrapper);
    trackOptimistic(currentChatContact.id, wrapper, '', detail.clientId);
    scrollThreadToBottom(container, false);
    console.log('[CHAT] optimistic message');
    return wrapper;
}

const orphanAttachmentPaths = new Set();

function discardUploadedAttachment(path) {
    if (!path || /^https?:/i.test(path)) return;
    const pending = window.LYANN_API_CLIENT?.removeChatAttachment?.(path);
    if (!pending || typeof pending.then !== 'function') {
        orphanAttachmentPaths.add(path);
        return;
    }
    pending.then((result) => {
        if (result?.error) orphanAttachmentPaths.add(path);
    }).catch(() => orphanAttachmentPaths.add(path));
}

function flushOrphanAttachments() {
    [...orphanAttachmentPaths].forEach((path) => {
        const pending = window.LYANN_API_CLIENT?.removeChatAttachment?.(path);
        if (!pending || typeof pending.then !== 'function') return;
        pending.then((result) => {
            if (!result?.error) orphanAttachmentPaths.delete(path);
        }).catch(() => {});
    });
}

function markVideoUnplayable(video) {
    if (!video || video.dataset.playbackError === '1') return;
    video.dataset.playbackError = '1';
    const note = document.createElement('p');
    note.className = 'bokantaj-video-error';
    note.textContent = 'Cette vidéo ne peut pas être lue sur cet appareil.';
    video.after(note);
}

function setAttachmentProgress(node, ratio) {
    if (!node) return;
    const bar = node.querySelector('[data-upload-progress]');
    if (bar) bar.style.width = Math.max(0, Math.min(100, Math.round(ratio * 100))) + '%';
}

function videoDuration(file) {
    return new Promise((resolve) => {
        if (!file) {
            resolve(NaN);
            return;
        }
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            URL.revokeObjectURL(url);
            resolve(value);
        };
        const timer = setTimeout(() => finish(NaN), 8000);
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        video.onloadedmetadata = () => finish(video.duration);
        video.onerror = () => finish(NaN);
        video.src = url;
    });
}

async function enforceVideoDuration(file, knownSeconds) {
    let duration = Number(knownSeconds);
    if (!Number.isFinite(duration) || duration <= 0) {
        duration = await videoDuration(file);
    }
    if (Number.isFinite(duration) && duration > 0) {
        if (duration > MAX_VIDEO_SECONDS) {
            chatToast('La vidéo doit durer 60 secondes au plus.');
            return false;
        }
        return true;
    }
    // iOS WKWebView ne lit souvent pas la durée d’un blob local — la limite taille reste en place.
    return true;
}

function capacitorMediaUrl(path) {
    if (!path) return '';
    if (/^(https?:|blob:|data:|capacitor:)/i.test(path)) return path;
    if (window.Capacitor && typeof window.Capacitor.convertFileSrc === 'function') {
        return window.Capacitor.convertFileSrc(path);
    }
    return path;
}

function videoMimeFromFormat(format, fallback) {
    const value = String(format || '').toLowerCase().replace(/^\./, '');
    if (value === 'mov' || value === 'quicktime') return 'video/quicktime';
    if (value === 'webm') return 'video/webm';
    if (value === 'm4v') return 'video/mp4';
    if (value === 'mp4' || value === 'mpeg4') return 'video/mp4';
    return fallback || 'video/mp4';
}

function videoExtFromFormat(format, mime) {
    const value = String(format || '').toLowerCase().replace(/^\./, '');
    if (VIDEO_EXT.has(value)) return value === 'jpeg' ? 'mp4' : value;
    if (value === 'quicktime') return 'mov';
    if (String(mime || '').includes('quicktime')) return 'mov';
    if (String(mime || '').includes('webm')) return 'webm';
    return 'mp4';
}

async function fileFromNativeMedia(item, kind) {
    const meta = item && item.metadata ? item.metadata : {};
    const format = meta.format || '';
    const src = capacitorMediaUrl(item.webPath || item.uri || '');
    if (!src) throw new Error('Fichier introuvable.');
    const response = await fetch(src);
    if (!response.ok) throw new Error('Impossible de lire le fichier sélectionné.');
    const blob = await response.blob();
    if (kind === 'video') {
        const mime = videoMimeFromFormat(format, blob.type || 'video/mp4');
        const ext = videoExtFromFormat(format, mime);
        return new File([blob], 'video.' + ext, { type: mime });
    }
    const mime = blob.type || 'image/jpeg';
    const ext = mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg');
    return new File([blob], 'photo.' + ext, { type: mime });
}

async function pickChatVideo() {
    const camera = typeof window.isNativePlatform === 'function'
        && window.isNativePlatform()
        && window.Capacitor?.Plugins?.Camera;
    if (!camera || typeof camera.chooseFromGallery !== 'function') {
        chatPicker('video').click();
        return;
    }
    try {
        if (typeof camera.requestPermissions === 'function') {
            await camera.requestPermissions({ permissions: ['photos'] });
        }
        const picked = await camera.chooseFromGallery({
            // MediaTypeSelection.Video === 1
            mediaType: 1,
            limit: 1,
            includeMetadata: true
        });
        const item = Array.isArray(picked?.results) ? picked.results[0] : null;
        if (!item) return;
        const file = await fileFromNativeMedia(item, 'video');
        const knownDuration = item.metadata && item.metadata.duration;
        if (!(await enforceVideoDuration(file, knownDuration))) return;
        await stageChatAttachment(file, 'video', { skipDurationCheck: true });
    } catch (error) {
        const message = String(error?.message || error || '');
        if (/cancel|dismiss|user cancelled|User cancelled/i.test(message)) return;
        console.warn('[CHAT] video pick', message);
        chatToast('Impossible d’ouvrir cette vidéo. Réessayez depuis votre galerie.');
    }
}

function renderAttachPreview(file, kind, localUrl) {
    const area = document.querySelector('#chatModal .chat-input-area') || document.querySelector('.chat-input-area');
    if (!area) return null;
    let bar = document.getElementById('chatAttachPreview');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'chatAttachPreview';
        bar.className = 'chat-attach-preview';
        area.prepend(bar);
    }
    bar.replaceChildren();
    if (kind === 'photo') {
        const img = document.createElement('img');
        img.src = localUrl;
        img.alt = 'Aperçu';
        bar.appendChild(img);
    } else if (kind === 'video') {
        const video = document.createElement('video');
        video.src = localUrl;
        video.controls = true;
        video.playsInline = true;
        video.muted = true;
        bar.appendChild(video);
    } else {
        const name = document.createElement('strong');
        name.textContent = file.name || 'Document';
        bar.appendChild(name);
    }
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;margin-left:auto;';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-outline btn-sm';
    cancel.textContent = 'Annuler';
    cancel.addEventListener('click', () => clearAttachPreview());
    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'btn btn-primary btn-sm';
    send.textContent = 'Envoyer';
    send.addEventListener('click', () => {
        const staged = bar._file;
        const stagedKind = bar._kind;
        clearAttachPreview();
        if (staged) void sendChatAttachment(staged, stagedKind);
    });
    actions.append(cancel, send);
    bar.appendChild(actions);
    bar._file = file;
    bar._kind = kind;
    bar._url = localUrl;
    return bar;
}

function clearAttachPreview() {
    const bar = document.getElementById('chatAttachPreview');
    if (!bar) return;
    if (bar._url) URL.revokeObjectURL(bar._url);
    bar.remove();
}

async function stageChatAttachment(file, kind, options) {
    if (!currentChatContact?.id) {
        chatToast('Ouvrez une conversation avant d’ajouter un fichier.');
        return;
    }
    const check = validateChatFile(file, kind);
    if (!check.ok) {
        chatToast(check.message);
        return;
    }
    if (kind === 'video' && !(options && options.skipDurationCheck)) {
        if (!(await enforceVideoDuration(file))) return;
    }
    clearAttachPreview();
    const localUrl = kind === 'photo' || kind === 'video' ? URL.createObjectURL(file) : '';
    renderAttachPreview(file, kind, localUrl);
}

async function sendChatAttachment(file, kind, options) {
    if (!currentChatContact?.id) return;
    const check = validateChatFile(file, kind);
    if (!check.ok) {
        chatToast(check.message);
        return;
    }
    if (kind === 'video' && !(options && options.skipDurationCheck)) {
        if (!(await enforceVideoDuration(file))) return;
    }
    const clientId = createOptimisticClientId();
    const localUrl = kind === 'photo' || kind === 'video' ? URL.createObjectURL(file) : '';
    const node = renderOptimisticAttachment({ clientId, kind, file, localUrl, name: file.name, size: file.size });
    outgoingSends.set(clientId, { kind, contactId: currentChatContact.id, clientId, file, node, localUrl, name: file.name, size: file.size, mime: check.mime, ext: check.ext, abortController: typeof AbortController !== 'undefined' ? new AbortController() : null });
    await deliverAttachment(clientId);
}

async function deliverAttachment(clientId) {
    const job = outgoingSends.get(clientId);
    if (!job?.node) return;
    const userId = getMyId();
    if (!userId || !isUUID(userId) || !isUUID(job.contactId) || !window.LYANN_API_CLIENT?.supabase) {
        forgetOptimistic(job.node);
        setOptimisticState(job.node, 'failed');
        return;
    }
    if (!(job.file instanceof Blob)) {
        forgetOptimistic(job.node);
        setOptimisticState(job.node, 'failed');
        const button = job.node.querySelector('[data-chat-retry]');
        if (button) button.textContent = 'Choisir à nouveau';
        job.needsFile = true;
        return;
    }
    if (job.cancelled) {
        setOptimisticState(job.node, 'failed');
        return;
    }
    if (chatIsOffline()) {
        forgetOptimistic(job.node);
        setOptimisticState(job.node, 'offline');
        flushParkedLiveRows();
        return;
    }
    forgetOptimistic(job.node);
    trackOptimistic(job.contactId, job.node, '', clientId);
    setOptimisticState(job.node, 'sending');
    let uploadedPath = '';
    try {
        const { data: convRes } = await window.LYANN_API_CLIENT.getOrCreateConversation(userId, job.contactId);
        if (!convRes?.id) throw new Error("Impossible d'initialiser la conversation.");
        const sharedConvId = convRes.id;
        if (currentChatContact && currentChatContact.id === job.contactId) currentChatContact.conversationId = sharedConvId;
        uploadedPath = attachmentObjectPath(sharedConvId, userId, job.ext, job.kind);
        const uploaded = await window.LYANN_API_CLIENT.uploadChatAttachment(uploadedPath, job.file, job.mime, {
            signal: job.abortController?.signal,
            onProgress: (ratio) => setAttachmentProgress(job.node, ratio)
        });
        if (job.cancelled || job.droppedOffline || uploaded?.error?.cancelled) {
            discardUploadedAttachment(uploadedPath);
            setOptimisticState(job.node, job.droppedOffline ? 'offline' : 'failed');
            return;
        }
        if (uploaded?.error) throw uploaded.error;
        const { data: sentRow, error: sendErr } = await window.LYANN_API_CLIENT.sendMessage(sharedConvId, userId, '', {
            clientMessageId: clientId,
            path: uploadedPath,
            type: job.kind === 'photo' ? 'photo' : (job.kind === 'video' ? 'video' : 'document'),
            name: job.name,
            size: job.size,
            mime: job.mime
        });
        if (sendErr) throw sendErr;
        window.LYANN_MESSAGING_REPOSITORY?.invalidateConversation?.(userId, job.contactId, sharedConvId);
        console.log('[CHAT] insert confirmed');
        bindOptimisticSend(clientId, sentRow?.id);
        if (job.node && sentRow?.created_at) job.node.dataset.createdAt = sentRow.created_at;
        const remotePath = sentRow?.attachment_url || uploadedPath;
        if (remotePath && !/^https?:/i.test(remotePath)) job.node.dataset.attachmentPath = remotePath;
        if (job.localUrl) URL.revokeObjectURL(job.localUrl);
        job.localUrl = '';
        await hydrateAttachmentNode(job.node);
        console.log('[CHAT] reconciled');
        outgoingSends.delete(clientId);
        const noted = window.LYANN_MESSAGING_REPOSITORY?.noteIncomingPreview?.(userId, sharedConvId, '', sentRow?.created_at, {
            attachment_type: job.kind === 'photo' ? 'photo' : (job.kind === 'video' ? 'video' : 'document'),
            attachment_name: job.name,
            unread: false
        });
        publishChatActivity({
            contactId: noted?.contactId || job.contactId,
            preview: noted?.preview || (job.kind === 'photo' ? '📷 Photo' : (job.kind === 'video' ? '🎬 Vidéo' : ('📄 ' + (job.name || 'Document')))),
            conversationId: sharedConvId,
            lastMessageAt: sentRow?.created_at || null,
            unread: false,
            name: noted?.name || '',
            avatar: noted?.avatar || ''
        });
    } catch (error) {
        console.warn('[CHAT] attachment send failed', error?.message || error);
        discardUploadedAttachment(uploadedPath);
        forgetOptimistic(job.node);
        setOptimisticState(job.node, 'failed');
        flushParkedLiveRows();
    }
}

async function retryOutgoing(clientId) {
    const job = outgoingSends.get(clientId);
    if (!job?.node?.isConnected) return;
    if (job.needsFile) {
        const retryKind = job.kind === 'document' ? 'document' : (job.kind === 'video' ? 'video' : 'photo');
        const input = chatPicker(retryKind);
        input.onchange = async () => {
            const file = input.files && input.files[0];
            input.value = '';
            if (!file) return;
            const check = validateChatFile(file, retryKind);
            if (!check.ok) {
                chatToast(check.message);
                return;
            }
            if (retryKind === 'video' && !(await enforceVideoDuration(file))) return;
            job.file = file;
            job.needsFile = false;
            job.mime = check.mime;
            job.ext = check.ext;
            job.name = file.name;
            job.size = file.size;
            if (job.kind === 'photo' || job.kind === 'video') {
                if (job.localUrl) URL.revokeObjectURL(job.localUrl);
                job.localUrl = URL.createObjectURL(file);
                const image = job.node.querySelector('img.chat-msg-photo');
                if (image) image.src = job.localUrl;
                const video = job.node.querySelector('video.chat-msg-video');
                if (video) video.src = job.localUrl;
            }
            const nameNode = job.node.querySelector('.chat-msg-doc-name');
            if (nameNode) nameNode.textContent = file.name;
            const sizeNode = job.node.querySelector('.chat-msg-doc-meta');
            if (sizeNode) sizeNode.textContent = formatFileSize(file.size);
            void deliverAttachment(clientId);
        };
        input.click();
        return;
    }
    if (job.kind === 'text') {
        setOptimisticState(job.node, 'sending');
        await deliverTextMessage(job.contactId, { id: job.clientId, type: 'text', text: job.text, sender: 'me', timestamp: Date.now() }, job.node);
        return;
    }
    await deliverAttachment(clientId);
}

function chatPicker(kind) {
    const id = 'chatAttachmentInput-' + kind;
    let input = document.getElementById(id);
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = id;
        input.hidden = true;
        if (kind === 'photo') input.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png,.webp';
        if (kind === 'camera') {
            input.accept = 'image/*';
            input.setAttribute('capture', 'environment');
        }
        if (kind === 'video') input.accept = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v';
        if (kind === 'document') input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.odt,.ods,.odp,application/pdf';
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            input.value = '';
            if (!file) return;
            void stageChatAttachment(file, kind === 'document' ? 'document' : (kind === 'video' ? 'video' : 'photo'));
        });
        document.body.appendChild(input);
    }
    return input;
}

async function dataUrlToFile(dataUrl) {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const type = blob.type || 'image/jpeg';
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], 'photo.' + ext, { type });
}

async function captureChatPhoto() {
    const native = typeof window.isNativePlatform === 'function' && window.isNativePlatform() && window.Capacitor?.Plugins?.Camera;
    if (native) {
        try {
            const image = await window.Capacitor.Plugins.Camera.getPhoto({
                quality: 80,
                allowEditing: false,
                resultType: 'dataUrl',
                source: 'CAMERA',
                correctOrientation: true
            });
            if (!image?.dataUrl) return;
            const file = await dataUrlToFile(image.dataUrl);
            await sendChatAttachment(file, 'photo');
        } catch (error) {
            const message = String(error?.message || error || '');
            if (!/cancel/i.test(message)) console.warn('[CHAT] camera', message);
        }
        return;
    }
    chatPicker('camera').click();
}

function compareCursor(a, b) {
    const ta = Date.parse(a.createdAt || '') || 0;
    const tb = Date.parse(b.createdAt || '') || 0;
    if (ta !== tb) return ta < tb ? -1 : 1;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
}

function serverNodes(container) {
    return [...container.querySelectorAll('[data-message-id][data-created-at]')].filter((node) => node.dataset.messageId && !String(node.dataset.messageId).startsWith('optimistic_'));
}

function newestServerCursor(container) {
    let best = null;
    serverNodes(container).forEach((node) => {
        const cursor = { createdAt: node.dataset.createdAt, id: node.dataset.messageId };
        if (!best || compareCursor(cursor, best) > 0) best = cursor;
    });
    return best;
}

function oldestServerNode(container) {
    let best = null;
    serverNodes(container).forEach((node) => {
        const cursor = { createdAt: node.dataset.createdAt, id: node.dataset.messageId };
        if (!best || compareCursor(cursor, { createdAt: best.dataset.createdAt, id: best.dataset.messageId }) < 0) best = node;
    });
    return best;
}

function compensateScroll(container, previousHeight, previousTop) {
    container.scrollTop = previousTop + (container.scrollHeight - previousHeight);
}

function armThreadHistory(loadedCount) {
    if (!currentChatContact?.id) return;
    threadHistory.contactId = currentChatContact.id;
    threadHistory.hasMore = loadedCount >= 50;
    threadHistory.loading = false;
    const container = document.getElementById('chatMessagesContainer');
    if (!container || container.dataset.historyArmed === '1') return;
    container.dataset.historyArmed = '1';
    container.addEventListener('scroll', () => {
        if (container.scrollTop < 160) void loadOlderMessages();
    }, { passive: true });
}

async function loadOlderMessages() {
    const container = document.getElementById('chatMessagesContainer');
    if (!container || !currentChatContact?.id) return;
    if (threadHistory.loading || !threadHistory.hasMore || threadHistory.contactId !== currentChatContact.id) return;
    if (container.scrollHeight <= container.clientHeight + 8) return;
    const oldest = oldestServerNode(container);
    if (!oldest) {
        threadHistory.hasMore = false;
        return;
    }
    threadHistory.loading = true;
    const contactId = currentChatContact.id;
    const loader = document.createElement('div');
    loader.className = 'chat-history-loader';
    loader.textContent = 'Chargement…';
    const loaderBefore = container.scrollHeight;
    const loaderTop = container.scrollTop;
    container.insertBefore(loader, container.firstChild);
    compensateScroll(container, loaderBefore, loaderTop);
    try {
        const page = await getChatMessages(contactId, {
            fresh: true,
            limit: 50,
            before: { createdAt: oldest.dataset.createdAt, id: oldest.dataset.messageId }
        });
        if (!currentChatContact || currentChatContact.id !== contactId) return;
        const fresh = (Array.isArray(page) ? page : []).filter((msg) => msg && msg.id && msg.type !== 'transactional' && !container.querySelector(chatMessageSelector(msg.id)));
        if (!Array.isArray(page) || page.length < 50) threadHistory.hasMore = false;
        if (!fresh.length) {
            threadHistory.hasMore = false;
            return;
        }
        const beforeHeight = container.scrollHeight;
        const beforeTop = container.scrollTop;
        const fragment = document.createDocumentFragment();
        fresh.forEach((msg) => {
            const node = createThreadBubble(msg);
            if (node) fragment.appendChild(node);
        });
        container.insertBefore(fragment, loader.nextSibling);
        compensateScroll(container, beforeHeight, beforeTop);
    } catch (error) {
        console.warn('[CHAT] older history', error?.message || error);
    } finally {
        const beforeHeight = container.scrollHeight;
        const beforeTop = container.scrollTop;
        loader.remove();
        compensateScroll(container, beforeHeight, beforeTop);
        threadHistory.loading = false;
    }
}

// Intercept form submit and initialize chat contacts
function initChatSubmitAndContacts() {
    const form = document.getElementById('chatInputForm');
    const input = document.getElementById('chatInputField');

    // Auto-expanding textarea & fluid focus behavior
    if (input) {
        input.addEventListener('input', function () {
            this.style.height = '44px';
            const nextH = Math.min(this.scrollHeight, 120);
            this.style.height = nextH + 'px';
            const container = document.getElementById('chatMessagesContainer');
            if (container && threadIsNearBottom(container)) scrollThreadToBottom(container, false);
        });

        input.addEventListener('focus', function () {
            const container = document.getElementById('chatMessagesContainer');
            if (container && threadIsNearBottom(container)) {
                setTimeout(() => {
                    if (threadIsNearBottom(container)) scrollThreadToBottom(container, false);
                }, 120);
            }
        });
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = input ? input.value.trim() : '';
            if (!text || !currentChatContact) return;

            addMessageToContact(currentChatContact.id, {
                type: 'text',
                sender: getMyId(),
                text: text,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            if (input) {
                input.value = '';
                input.style.height = '44px';
            }

            window.dispatchEvent(new CustomEvent('lyann_chat_message_sent', { detail: { text, contactId: currentChatContact.id } }));
        });
    }

    // Submit on Enter key (unless Shift is pressed)
    if (input && form) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                form.dispatchEvent(new Event('submit'));
            }
        });
    }

    // Header "Proposer un prix" button click
    const chatHeaderProposeBtn = document.getElementById('chatHeaderProposeBtn');
    if (chatHeaderProposeBtn) {
        chatHeaderProposeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeAllOverlays();
            const overlay = document.getElementById('chatActionChoicesOverlay');
            if (overlay) overlay.style.display = 'flex';
        });
    }

    // Open Bottom Sheet (+)
    const chatAttachBtn = document.getElementById('chatAttachBtn');
    const bottomSheet = document.getElementById('chatActionsBottomSheet');
    const closeBottomSheetBtn = document.getElementById('closeBottomSheetBtn');

    if (chatAttachBtn && !chatAttachBtn.getAttribute('aria-label')) {
        chatAttachBtn.setAttribute('aria-label', 'Ajouter une pièce jointe');
    }
    if (chatAttachBtn && !chatAttachBtn.getAttribute('onclick')) {
        chatAttachBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.openChatAttachSheet(e);
        });
    }
    if (closeBottomSheetBtn && bottomSheet) {
        closeBottomSheetBtn.addEventListener('click', () => {
            bottomSheet.style.display = 'none';
        });
    }
    if (bottomSheet) {
        bottomSheet.addEventListener('click', (e) => {
            if (e.target === bottomSheet) bottomSheet.style.display = 'none';
        });
    }

    // Bottom Sheet Action Buttons
    const bsActionRequestHelp = document.getElementById('bsActionRequestHelp');
    const bsActionPhoto = document.getElementById('bsActionPhoto');
    const bsActionCamera = document.getElementById('bsActionCamera');
    const bsActionPrice = document.getElementById('bsActionPrice');
    const bsActionDate = document.getElementById('bsActionDate');
    const bsActionDevis = document.getElementById('bsActionDevis');
    const bsActionDocument = document.getElementById('bsActionDocument');
    const fileInput = document.getElementById('chatFileInput');

    if (bsActionRequestHelp) {
        bsActionRequestHelp.addEventListener('click', () => {
            if (bottomSheet) bottomSheet.style.display = 'none';
            handleChatAction('REQUEST_HELP', null);
        });
    }

    if (bsActionPhoto) {
        bsActionPhoto.addEventListener('click', () => {
            if (bottomSheet) bottomSheet.style.display = 'none';
            chatPicker('photo').click();
        });
    }
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file || !currentChatContact) return;
            const kind = file.type.startsWith('image/') || PHOTO_EXT.has(fileExtension(file)) ? 'photo' : 'document';
            void sendChatAttachment(file, kind);
        });
    }
    if (bsActionCamera) {
        bsActionCamera.addEventListener('click', () => {
            if (bottomSheet) bottomSheet.style.display = 'none';
            void captureChatPhoto();
        });
    }
    if (bsActionPrice) {
        bsActionPrice.addEventListener('click', () => {
            if (bottomSheet) bottomSheet.style.display = 'none';
            closeAllOverlays();
            const overlay = document.getElementById('chatActionChoicesOverlay');
            if (overlay) overlay.style.display = 'flex';
        });
    }
    if (bsActionDate) {
        bsActionDate.addEventListener('click', () => {
            if (bottomSheet) bottomSheet.style.display = 'none';
            closeAllOverlays();
            const overlay = document.getElementById('chatProposeDateForm');
            if (overlay) openChatChildSurface('chatProposeDateForm');
        });
    }
    if (bsActionDevis) {
        bsActionDevis.addEventListener('click', () => {
            if (bottomSheet) bottomSheet.style.display = 'none';
            closeAllOverlays();
            const overlay = document.getElementById('chatMilestoneDevisForm');
            if (overlay) openChatChildSurface('chatMilestoneDevisForm');
        });
    }
    if (bsActionDocument) {
        bsActionDocument.addEventListener('click', () => {
            if (bottomSheet) bottomSheet.style.display = 'none';
            chatPicker('document').click();
        });
    }
    const bsActionVideo = document.getElementById('bsActionVideo');
    if (bsActionVideo && bsActionVideo.dataset.bound !== '1') {
        bsActionVideo.dataset.bound = '1';
        bsActionVideo.addEventListener('click', () => {
            if (bottomSheet) bottomSheet.style.display = 'none';
            void pickChatVideo();
        });
    }

let chatHeaderMenuToggleAt = 0;
function seatChatHeaderDropdown(menu, anchor) {
    if (!menu) return;
    const host = document.getElementById('chatModal') || document.body;
    if (menu.parentElement !== host) host.appendChild(menu);
    const btn = anchor
        || document.querySelector('#chatModal #chatMoreOptionsBtn')
        || document.getElementById('chatMoreOptionsBtn');
    const rect = btn && typeof btn.getBoundingClientRect === 'function' ? btn.getBoundingClientRect() : null;
    menu.classList.add('active');
    menu.style.setProperty('display', 'block', 'important');
    menu.style.setProperty('position', 'fixed', 'important');
    menu.style.setProperty('z-index', '2147483640', 'important');
    menu.style.setProperty('left', 'auto', 'important');
    if (rect && rect.width) {
        menu.style.setProperty('top', Math.round(rect.bottom + 8) + 'px', 'important');
        menu.style.setProperty('right', Math.max(8, Math.round(window.innerWidth - rect.right)) + 'px', 'important');
    } else {
        menu.style.setProperty('top', '72px', 'important');
        menu.style.setProperty('right', '12px', 'important');
    }
}
function hideChatHeaderDropdown() {
    const dropdownMenu = document.getElementById('chatHeaderDropdownMenu');
    if (!dropdownMenu) return;
    dropdownMenu.classList.remove('active');
    dropdownMenu.style.setProperty('display', 'none', 'important');
}
window.toggleChatHeaderDropdown = function (e) {
    if (e) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        // onclick + capture click / touchstart + click : un seul toggle
        if (e.__lyannChatMenuToggled) return;
        e.__lyannChatMenuToggled = true;
    }
    const now = Date.now();
    if (now - chatHeaderMenuToggleAt < 320) return;
    chatHeaderMenuToggleAt = now;
    const dropdownMenu = document.getElementById('chatHeaderDropdownMenu');
    if (!dropdownMenu) return;
    const isCurrentlyActive = dropdownMenu.classList.contains('active') || dropdownMenu.style.display === 'block';
    if (isCurrentlyActive) {
        hideChatHeaderDropdown();
        return;
    }
    const anchor = e && e.target && e.target.closest
        ? (e.target.closest('#chatMoreOptionsBtn') || e.target.closest('.chat-more-btn'))
        : null;
    seatChatHeaderDropdown(dropdownMenu, anchor);
};

window.backToChatContacts = function (e) {
    if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.backToList === 'function') {
        return window.LYANN_MESSAGING.backToList(e);
    }
    if (e) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    if (typeof triggerHaptic === 'function') {
        try { triggerHaptic('light'); } catch (err) {}
    }
    document.body.classList.remove('in-chat-active', 'hide-bottom-nav');
    document.querySelectorAll('.chat-modal-layout').forEach(l => {
        l.classList.remove('mobile-conversation-active');
    });
    document.querySelectorAll('.chat-contacts-sidebar').forEach(s => {
        s.style.removeProperty('display');
        s.classList.remove('hidden');
    });
    document.querySelectorAll('.chat-main-area, .chat-main-pane').forEach(m => {
        m.style.setProperty('display', 'none', 'important');
    });
    hideChatHeaderDropdown();
};

// Global Delegated Interaction Handler (Click + Touch) for Chat Header Buttons
const handleChatHeaderClicks = async (e) => {
    const backBtn = e.target.closest('.chat-back-to-contacts-btn');
    if (backBtn) {
        window.backToChatContacts(e);
        return;
    }

    const moreBtn = e.target.closest('#chatMoreOptionsBtn') || e.target.closest('.chat-more-btn');
    if (moreBtn) {
        window.toggleChatHeaderDropdown(e);
        return;
    }

    // Handle dropdown items directly via delegation
    const dropViewProfile = e.target.closest('#chatDropViewProfile');
    const dropShareProfile = e.target.closest('#chatDropShareProfile');
    const dropBlockUser = e.target.closest('#chatDropBlockUser');
    const dropReportUser = e.target.closest('#chatDropReportUser');

    if (dropViewProfile || dropShareProfile || dropBlockUser || dropReportUser) {
        if (e) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
        }
        
        hideChatHeaderDropdown();

        if (dropViewProfile) {
            if (currentChatContact && typeof window.openQuickProfileModal === 'function') {
                window.openQuickProfileModal(currentChatContact.id || currentChatContact.name);
            } else if (window.lyannAlert) {
                window.lyannAlert(`Profil de ${currentChatContact ? currentChatContact.name : 'ce membre'}`);
            }
        } else if (dropShareProfile) {
            if (e && e.type === 'touchstart') return;
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
            window.shareProfile(currentChatContact, null, { trigger: dropShareProfile });
        } else if (dropBlockUser) {
            if (!currentChatContact) return;
            if (window.lyannConfirm) {
                const confirmBlock = await window.lyannConfirm(`🚫 Bloquer ${currentChatContact.name} ?\nCet utilisateur ne pourra plus vous contacter ni échanger avec vous.`);
                if (confirmBlock) {
                    window.blockUser(currentChatContact.id, currentChatContact.name);
                }
            } else {
                window.blockUser(currentChatContact.id, currentChatContact.name);
            }
        } else if (dropReportUser) {
            window.openReportModal(
                currentChatContact ? currentChatContact.name : null,
                currentChatContact ? currentChatContact.id : null,
                { source: 'conversation', conversationId: currentChatContact ? currentChatContact.conversationId : null }
            );
        }
        return;
    }

    // Close dropdown menu if clicking outside
    if (!e.target.closest('#chatHeaderDropdownMenu') && !e.target.closest('#chatMoreOptionsBtn') && !e.target.closest('.chat-more-btn')) {
        hideChatHeaderDropdown();
    }
};

document.addEventListener('click', handleChatHeaderClicks, true);
document.addEventListener('touchstart', (e) => {
    const backBtn = e.target.closest('.chat-back-to-contacts-btn');
    const moreBtn = e.target.closest('#chatMoreOptionsBtn') || e.target.closest('.chat-more-btn');
    const dropItem = e.target.closest('.chat-dropdown-item');
    if (backBtn || moreBtn || dropItem) {
        handleChatHeaderClicks(e);
    }
}, { passive: true });

    // Close Photo Viewer Lightbox
    const closePhotoViewerBtn = document.getElementById('closePhotoViewerBtn');
    const photoViewerModal = document.getElementById('chatPhotoViewerModal');
    if (closePhotoViewerBtn && photoViewerModal) {
        closePhotoViewerBtn.addEventListener('click', () => {
            photoViewerModal.style.display = 'none';
        });
        photoViewerModal.addEventListener('click', (event) => {
            if (event.target === photoViewerModal) photoViewerModal.style.display = 'none';
        });
    }

    // Real-time Contact Search Filter
    const searchInput = document.getElementById('chatSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (typeof window.applyLyannInboxView === 'function') {
                window.applyLyannInboxView();
                return;
            }
            document.querySelectorAll('#chatContactsList .chat-contact-item').forEach(item => {
                const nameEl = item.querySelector('.chat-contact-name');
                const name = nameEl ? nameEl.textContent.toLowerCase() : '';
                if (name.includes(query)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    // Setup overlays click listeners
    const chatProposeBtn = document.getElementById('chatProposeBtn');
    const chatActionChoicesOverlay = document.getElementById('chatActionChoicesOverlay');
    const chatDirectPriceForm = document.getElementById('chatDirectPriceForm');
    const chatMilestoneDevisForm = document.getElementById('chatMilestoneDevisForm');

    if (chatProposeBtn) {
        chatProposeBtn.addEventListener('click', () => {
            closeAllOverlays();
            if (chatActionChoicesOverlay) {
                openChatChildSurface('chatActionChoicesOverlay');
            }
        });
    }

    const btnChooseDirectPrice = document.getElementById('btnChooseDirectPrice');
    if (btnChooseDirectPrice) {
        btnChooseDirectPrice.addEventListener('click', () => {
            closeAllOverlays();
            if (chatDirectPriceForm) {
                openChatChildSurface('chatDirectPriceForm');
                const firstRequired = chatDirectPriceForm.querySelector('[required]');
                if (firstRequired) requestAnimationFrame(() => firstRequired.focus());
            }
        });
    }

    const btnChooseMilestoneDevis = document.getElementById('btnChooseMilestoneDevis');
    if (btnChooseMilestoneDevis) {
        btnChooseMilestoneDevis.addEventListener('click', () => {
            closeAllOverlays();
            if (chatMilestoneDevisForm) {
                openChatChildSurface('chatMilestoneDevisForm');
                if (typeof window.lyannRefreshMilestoneAllocation === 'function') window.lyannRefreshMilestoneAllocation();
                const firstRequired = chatMilestoneDevisForm.querySelector('[required]');
                if (firstRequired) requestAnimationFrame(() => firstRequired.focus());
            }
        });
    }

    // Cancel / Close buttons on overlays
    document.querySelectorAll('.chat-overlay-pane .cancel-overlay-btn, .chat-overlay-pane .close-overlay-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            closeAllOverlays();
        });
    });

    // SUBMIT DIRECT PRICE
    async function handleDirectPriceFormSubmit(e) {
        if (e && typeof e.preventDefault === 'function') {
            e.preventDefault();
        }
        try {
            const descInput = document.getElementById('dpDescription');
            const amountInput = document.getElementById('dpAmount');
            const desc = descInput ? descInput.value.trim() : '';
            const amount = amountInput ? parseFloat(amountInput.value) : 0;

            let contact = currentChatContact || window.LYANN_ACTIVE_CHAT_CONTACT;
            if (!contact || !contact.id) {
                try {
                    const saved = localStorage.getItem('lyann_last_active_contact');
                    if (saved) contact = JSON.parse(saved);
                } catch(e) {}
            }

            if (!contact || !contact.id) {
                throw new Error("Aucun contact sélectionné pour la discussion.");
            }

            const amountCheck = window.LYANN_QUOTE_REVISION && window.LYANN_QUOTE_REVISION.validateQuoteAmount
                ? window.LYANN_QUOTE_REVISION.validateQuoteAmount(amount)
                : { ok: Number.isFinite(amount) && amount > 0, amount };
            if (!desc || !amountCheck.ok) {
                const alertMsg = amountCheck.message || "Veuillez remplir la description et indiquer un montant valide.";
                if (window.showToast) window.showToast(alertMsg, 'error');
                else if (window.lyannAlert) window.lyannAlert(alertMsg);
                else alert(alertMsg);
                return;
            }

            try {
                await createProductionQuoteForContact(contact.id, desc, amountCheck.amount);
            } catch (invErr) {
                notifyQuoteUnavailable(invErr);
                return;
            }

            if (descInput) descInput.value = '';
            if (amountInput) amountInput.value = '';
            closeAllOverlays();
            if (typeof refreshChatUI === 'function') {
                await refreshOpenBusinessCards();
            }

            window.dispatchEvent(new CustomEvent('lyann_chat_action_taken', { detail: { actionId: 'PROPOSE_PRICE', contactId: contact.id } }));
        } catch (err) {
            console.error("Error in directPriceForm submit:", err);
            if (window.showToast) window.showToast("Erreur lors de l'envoi de l'offre : " + err.message, 'error');
            else if (window.lyannAlert) window.lyannAlert("Erreur lors de l'envoi de l'offre : " + err.message);
        }
    }
    window.handleDirectPriceFormSubmit = handleDirectPriceFormSubmit;

    const directPriceForm = document.getElementById('directPriceForm');
    if (directPriceForm) {
        directPriceForm.addEventListener('submit', handleDirectPriceFormSubmit);
    }
    document.addEventListener('submit', (e) => {
        if (e.target && (e.target.id === 'directPriceForm' || e.target.closest('#directPriceForm'))) {
            handleDirectPriceFormSubmit(e);
        }
    });

    // SUBMIT PROPOSE DATE
    async function handleProposeDateFormSubmit(e) {
        if (e && typeof e.preventDefault === 'function') {
            e.preventDefault();
        }
        try {
            let contact = currentChatContact || window.LYANN_ACTIVE_CHAT_CONTACT;
            if (!contact || !contact.id) {
                try {
                    const saved = localStorage.getItem('lyann_last_active_contact');
                    if (saved) contact = JSON.parse(saved);
                } catch(e) {}
            }

            if (!contact || !contact.id) {
                throw new Error("Aucun contact sélectionné pour la discussion.");
            }

            const dateInput = document.getElementById('pdDate');
            const dateVal = dateInput ? dateInput.value : '';
            const slotVal = document.getElementById('pdTimeSlot')?.value || '';
            const noteVal = document.getElementById('pdNote')?.value || '';

            if (!dateVal) {
                const alertMsg = "Veuillez sélectionner une date d'intervention.";
                if (window.showToast) window.showToast(alertMsg, 'error');
                else if (window.lyannAlert) window.lyannAlert(alertMsg);
                else alert(alertMsg);
                return;
            }

            const dateParts = String(dateVal).split('-').map(Number);
            const localDate = dateParts.length === 3
                ? new Date(dateParts[0], dateParts[1] - 1, dateParts[2])
                : new Date(dateVal);
            const formattedDate = localDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            const msgText = `📅 Visite proposée · ${formattedDate}${slotVal ? ' · ' + slotVal : ''}`;

            await addMessageToContact(contact.id, {
                type: 'text',
                messageType: 'visit_proposed',
                metadata: { label: formattedDate, slot: slotVal, note: noteVal },
                sender: getMyId(),
                text: msgText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            if (dateInput) dateInput.value = '';
            const noteInput = document.getElementById('pdNote');
            if (noteInput) noteInput.value = '';

            closeAllOverlays();
            if (typeof refreshChatUI === 'function') {
                await refreshOpenBusinessCards();
            }

            window.dispatchEvent(new CustomEvent('lyann_chat_action_taken', { detail: { actionId: 'PROPOSE_DATE', contactId: contact.id } }));
        } catch (err) {
            console.error("Error in proposeDateForm submit:", err);
            if (window.showToast) window.showToast("Erreur lors de la proposition : " + err.message, 'error');
            else if (window.lyannAlert) window.lyannAlert("Erreur lors de la proposition : " + err.message);
        }
    }
    window.handleProposeDateFormSubmit = handleProposeDateFormSubmit;

    const proposeDateForm = document.getElementById('proposeDateForm');
    if (proposeDateForm) {
        proposeDateForm.addEventListener('submit', handleProposeDateFormSubmit);
    }
    document.addEventListener('submit', (e) => {
        if (e.defaultPrevented) return;
        if (e.target && (e.target.id === 'proposeDateForm' || e.target.closest('#proposeDateForm'))) {
            handleProposeDateFormSubmit(e);
        }
    });

    // SUBMIT LEAVE REVIEW
    const leaveReviewForm = document.getElementById('leaveReviewForm');
    if (leaveReviewForm) {
        leaveReviewForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentChatContact) return;

            const rating = document.getElementById('revRating')?.value || '5';
            const comment = document.getElementById('revComment')?.value || '';

            const stars = '⭐'.repeat(parseInt(rating));
            const msgText = `${stars} Avis laissé : "${comment}"`;

            await addMessageToContact(currentChatContact.id, {
                type: 'text',
                sender: getMyId(),
                text: msgText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            if (window.lyannAlert) window.lyannAlert("Merci ! Votre avis a été publié.");
            closeAllOverlays();
            refreshOpenBusinessCards();
        });
    }

    const milestoneEditorApi = window.LYANN_MILESTONE_EDITOR;
    let milestoneEditorState = milestoneEditorApi ? milestoneEditorApi.createState() : null;

    function milestoneTotal() {
        const parsed = milestoneEditorApi && typeof milestoneEditorApi.parseDecimal === 'function'
            ? milestoneEditorApi.parseDecimal(document.getElementById('mdTotalAmount')?.value)
            : { ok: true, value: parseFloat(document.getElementById('mdTotalAmount')?.value) || 0 };
        return parsed && parsed.ok ? Math.max(0, parsed.value) : 0;
    }

    function paintMilestoneSummary() {
        if (!milestoneEditorApi || !milestoneEditorState) return;
        const total = milestoneTotal();
        const view = milestoneEditorApi.summary(milestoneEditorState, total);
        const quoteEl = document.getElementById('mdAllocationQuoteTotal');
        const pctEl = document.getElementById('mdAllocationPercentTotal');
        const amtEl = document.getElementById('mdAllocationAmountTotal');
        const remEl = document.getElementById('mdAllocationRemaining');
        if (quoteEl) quoteEl.textContent = milestoneEditorApi.formatMoney(view.total) + ' €';
        if (pctEl) pctEl.textContent = milestoneEditorApi.formatPercent(view.percentSum) + ' %';
        if (amtEl) amtEl.textContent = milestoneEditorApi.formatMoney(view.allocated) + ' €';
        if (remEl) {
            remEl.textContent = (view.remainingCents < 0 ? 'Dépassement ' : '') + milestoneEditorApi.formatMoney(Math.abs(view.remaining)) + ' €';
            remEl.style.color = view.balanced ? 'var(--primary)' : (view.remainingCents < 0 ? '#B91C1C' : '#475569');
        }
        const live = document.getElementById('mdAllocationLive');
        if (live) {
            live.style.color = view.balanced ? 'var(--primary-dark, #1B4332)' : '#B91C1C';
            live.textContent = view.balanced
                ? 'Répartition complète : ' + milestoneEditorApi.formatPercent(view.percentSum) + ' % · ' + milestoneEditorApi.formatMoney(view.allocated) + ' €'
                : 'La somme des montants doit égaler exactement le total.';
        }
        document.querySelectorAll('[data-assign-remainder]').forEach((button) => {
            button.hidden = view.remainingCents === 0 || !(total > 0);
        });
    }

    function paintMilestoneRows() {
        const list = document.getElementById('mdMilestoneList');
        if (!list || !milestoneEditorApi || !milestoneEditorState) return;
        const focused = document.activeElement && list.contains(document.activeElement)
            ? { name: document.activeElement.getAttribute('data-field'), start: document.activeElement.selectionStart, id: document.activeElement.closest('[data-milestone-id]') && document.activeElement.closest('[data-milestone-id]').getAttribute('data-milestone-id') }
            : null;
        const scroll = list.scrollTop;
        list.replaceChildren();
        milestoneEditorState.rows.forEach((row, index) => {
            const card = document.createElement('article');
            card.className = 'md-milestone-card';
            card.setAttribute('data-milestone-id', row.id);
            const head = document.createElement('div');
            head.className = 'md-milestone-head';
            const label = document.createElement('strong');
            label.textContent = 'Jalon ' + (index + 1);
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn btn-outline md-milestone-remove';
            remove.textContent = 'Supprimer';
            remove.disabled = milestoneEditorState.rows.length <= 1;
            remove.addEventListener('click', () => {
                if (milestoneEditorApi.rowHasData(row) && !window.confirm('Supprimer ce jalon et conserver les autres tels quels ?')) return;
                milestoneEditorApi.removeRow(milestoneEditorState, row.id);
                paintMilestoneRows();
            });
            head.append(label, remove);
            const title = document.createElement('input');
            title.type = 'text';
            title.className = 'modal-input';
            title.placeholder = 'Nom du jalon';
            title.value = row.title;
            title.setAttribute('data-field', 'title');
            title.addEventListener('input', () => { row.title = title.value; });
            const grid = document.createElement('div');
            grid.className = 'md-milestone-grid';
            const percentLabel = document.createElement('label');
            percentLabel.textContent = 'Pourcentage';
            const percent = document.createElement('input');
            percent.type = 'text';
            percent.inputMode = 'decimal';
            percent.autocomplete = 'off';
            percent.className = 'modal-input';
            percent.setAttribute('data-field', 'percent');
            percent.setAttribute('aria-label', 'Pourcentage du jalon ' + (index + 1));
            percent.value = milestoneEditorApi.formatPercent(row.percent);
            percent.addEventListener('input', () => {
                const parsed = milestoneEditorApi.parseDecimal(percent.value);
                if (!parsed.ok || parsed.incomplete) return;
                milestoneEditorApi.applyPercent(milestoneEditorState, row.id, parsed.value, milestoneTotal());
                const amountInput = card.querySelector('[data-field="amount"]');
                if (amountInput && document.activeElement !== amountInput) amountInput.value = milestoneEditorApi.formatMoney(milestoneEditorApi.fromCents(row.amountCents));
                paintMilestoneSummary();
            });
            percentLabel.appendChild(percent);
            const amountLabel = document.createElement('label');
            amountLabel.textContent = 'Montant';
            const amount = document.createElement('input');
            amount.type = 'text';
            amount.inputMode = 'decimal';
            amount.autocomplete = 'off';
            amount.className = 'modal-input';
            amount.setAttribute('data-field', 'amount');
            amount.setAttribute('aria-label', 'Montant du jalon ' + (index + 1));
            amount.value = milestoneEditorApi.formatMoney(milestoneEditorApi.fromCents(row.amountCents));
            amount.addEventListener('input', () => {
                const parsed = milestoneEditorApi.parseDecimal(amount.value);
                if (!parsed.ok || parsed.incomplete) return;
                milestoneEditorApi.applyAmount(milestoneEditorState, row.id, parsed.value, milestoneTotal());
                if (document.activeElement !== percent) percent.value = milestoneEditorApi.formatPercent(row.percent);
                paintMilestoneSummary();
            });
            amountLabel.appendChild(amount);
            grid.append(percentLabel, amountLabel);
            const remainder = document.createElement('button');
            remainder.type = 'button';
            remainder.className = 'btn btn-outline md-assign-remainder';
            remainder.setAttribute('data-assign-remainder', row.id);
            remainder.textContent = 'Affecter le reste à ce jalon';
            remainder.addEventListener('click', () => {
                milestoneEditorApi.assignRemainder(milestoneEditorState, row.id, milestoneTotal());
                paintMilestoneRows();
            });
            card.append(head, title, grid, remainder);
            list.appendChild(card);
        });
        list.scrollTop = scroll;
        if (focused && focused.id) {
            const restore = list.querySelector('[data-milestone-id="' + focused.id + '"] [data-field="' + focused.name + '"]');
            if (restore && typeof restore.focus === 'function') {
                restore.focus();
                if (typeof restore.setSelectionRange === 'function' && focused.start != null) {
                    try { restore.setSelectionRange(focused.start, focused.start); } catch (_) {}
                }
            }
        }
        paintMilestoneSummary();
    }

    function initMilestoneAllocationSync() {
        const totalInput = document.getElementById('mdTotalAmount');
        const form = document.getElementById('milestoneDevisForm');
        if (!totalInput || !form || !milestoneEditorApi || totalInput.dataset.allocationSyncBound === 'true') return;
        totalInput.dataset.allocationSyncBound = 'true';
        const add = document.getElementById('mdAddMilestoneBtn');
        if (add) {
            add.addEventListener('click', () => {
                milestoneEditorApi.addRow(milestoneEditorState);
                paintMilestoneRows();
            });
        }
        totalInput.addEventListener('input', () => {
            const parsed = milestoneEditorApi.parseDecimal(totalInput.value);
            if (!parsed.ok || parsed.incomplete) { paintMilestoneSummary(); return; }
            milestoneEditorApi.applyTotal(milestoneEditorState, parsed.value);
            document.querySelectorAll('#mdMilestoneList [data-milestone-id]').forEach((card) => {
                const id = card.getAttribute('data-milestone-id');
                const row = milestoneEditorState.rows.find((item) => item.id === id);
                if (!row) return;
                const percent = card.querySelector('[data-field="percent"]');
                const amount = card.querySelector('[data-field="amount"]');
                if (percent && document.activeElement !== percent) percent.value = milestoneEditorApi.formatPercent(row.percent);
                if (amount && document.activeElement !== amount) amount.value = milestoneEditorApi.formatMoney(milestoneEditorApi.fromCents(row.amountCents));
            });
            paintMilestoneSummary();
        });
        paintMilestoneRows();
    }

    window.lyannRefreshMilestoneAllocation = function lyannRefreshMilestoneAllocation() {
        if (!milestoneEditorApi) return;
        milestoneEditorApi.applyTotal(milestoneEditorState, milestoneTotal());
        paintMilestoneRows();
    };

    initMilestoneAllocationSync();

    // SUBMIT MILESTONE DEVIS
    const milestoneDevisForm = document.getElementById('milestoneDevisForm');
    if (milestoneDevisForm) {
        milestoneDevisForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const titleInput = document.getElementById('mdTitle');
                const totalInput = document.getElementById('mdTotalAmount');
                const title = titleInput ? titleInput.value.trim() : '';
                const total = milestoneTotal();

                if (!currentChatContact) {
                    throw new Error("Aucun contact sélectionné pour la discussion.");
                }

                const totalCheck = window.LYANN_QUOTE_REVISION && window.LYANN_QUOTE_REVISION.validateQuoteAmount
                    ? window.LYANN_QUOTE_REVISION.validateQuoteAmount(total)
                    : { ok: Number.isFinite(total) && total > 0, amount: total };
                if (!title || !totalCheck.ok) {
                    const alertMsg = totalCheck.message || "Indiquez le libellé et un montant total.";
                    if (window.lyannAlert) window.lyannAlert(alertMsg);
                    else alert(alertMsg);
                    return;
                }

                const checked = milestoneEditorApi && milestoneEditorState
                    ? milestoneEditorApi.validate(milestoneEditorState, total)
                    : { ok: false, message: 'Les jalons sont indisponibles.' };
                if (!checked.ok) {
                    if (window.lyannAlert) window.lyannAlert(checked.message);
                    else alert(checked.message);
                    return;
                }
                const milestonesPayload = checked.milestones;

                try {
                    await createProductionQuoteForContact(currentChatContact.id, title, total, milestonesPayload);
                } catch (quoteErr) {
                    notifyQuoteUnavailable(quoteErr);
                    return;
                }

                // Clean & close
                if (titleInput) titleInput.value = '';
                if (totalInput) totalInput.value = '';
                milestoneEditorState = milestoneEditorApi.createState();
                paintMilestoneRows();
                closeAllOverlays();
                await refreshOpenBusinessCards();

                window.dispatchEvent(new CustomEvent('lyann_chat_action_taken', { detail: { actionId: 'PROPOSE_PRICE', contactId: currentChatContact.id } }));
            } catch (err) {
                console.error("Error in milestoneDevisForm submit:", err);
                if (window.lyannAlert) window.lyannAlert("Erreur lors de l'envoi du devis : " + err.message);
                else alert("Erreur lors de l'envoi du devis : " + err.message);
            }
        });
    }

    // SUBMIT CHECKOUT PAYMENT
    const checkoutPaymentForm = document.getElementById('checkoutPaymentForm');
    if (checkoutPaymentForm) {
        checkoutPaymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const runConfirm = async () => {
                if (!window.LYANN_STRIPE || typeof window.LYANN_STRIPE.confirmCheckout !== 'function') {
                    notifyActionUnavailable({ message: 'Paiement indisponible : Stripe.js n’est pas chargé. Aucun versement n’a été confirmé.' });
                    return;
                }
                const confirmResult = await window.LYANN_STRIPE.confirmCheckout();
                if (confirmResult && confirmResult.error) notifyActionUnavailable(confirmResult.error);
            };
            if (!window.LYANN_STRIPE || typeof window.LYANN_STRIPE.confirmCheckout !== 'function') {
                try {
                    if (window.LYANN_FEATURES && typeof window.LYANN_FEATURES.ensure === 'function') {
                        await window.LYANN_FEATURES.ensure('stripeCheckout');
                    } else {
                        await new Promise((resolve, reject) => {
                            const script = document.createElement('script');
                            script.src = 'lyann-stripe.js?v=20260922v';
                            script.addEventListener('load', resolve, { once: true });
                            script.addEventListener('error', () => reject(new Error('Stripe checkout unavailable')), { once: true });
                            document.head.appendChild(script);
                        });
                    }
                } catch (err) {
                    notifyActionUnavailable({ message: 'Paiement indisponible : Stripe.js n’a pas pu être chargé.' });
                    return;
                }
            }
            await runConfirm();
        });
    }

    const btnCancelCheckout = document.getElementById('btnCancelCheckout');
    if (btnCancelCheckout) {
        btnCancelCheckout.addEventListener('click', (e) => {
            e.preventDefault();
            closeAllOverlays();
        });
    }

    const btnExitTracking = document.getElementById('btnExitTracking');
    if (btnExitTracking) {
        btnExitTracking.addEventListener('click', (e) => {
            e.preventDefault();
            closeAllOverlays();
        });
    }

    // Conversation-list ownership moved to LYANN_MESSAGING + messaging-repository.js.
    // Keep only a compatibility bridge for old internal call sites during migration.
    window.renderChatContacts = async function renderChatContactsCompatibility() {
        if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.renderConversationList === 'function') {
            return window.LYANN_MESSAGING.renderConversationList();
        }
    };

    window.deleteConversation = async function deleteConversationCompatibility() {
        if (window.NotificationService?.showToast) {
            window.NotificationService.showToast('info', 'La suppression de conversation sera réactivée avec le stockage serveur.');
        }
        return false;
    };

    window.openLyannChatModal = function openLyannChatModalCompatibility() {
        if (window.LYANN_ROUTER) return window.LYANN_ROUTER.go('messages');
        if (window.LYANN_MESSAGING) return window.LYANN_MESSAGING.openList();
        return false;
    };
}

window.openChatAttachSheet = function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const attachButton = document.getElementById('chatAttachBtn');
    if (attachButton && !attachButton.getAttribute('aria-label')) {
        attachButton.setAttribute('aria-label', 'Ajouter une pièce jointe');
    }
    if (typeof triggerHaptic === 'function') triggerHaptic('light');
    let sheet = document.getElementById('chatActionsBottomSheet');
    if (sheet && sheet.parentElement !== document.body) document.body.appendChild(sheet);
    if (!sheet) {
        sheet = document.createElement('div');
        sheet.id = 'chatActionsBottomSheet';
        sheet.className = 'chat-bottom-sheet-overlay';
        sheet.style.display = 'none';
        const choice = (kind, label, icon) => '<button type="button" class="chat-bs-action-btn" data-attach-kind="' + kind + '"><span class="chat-bs-icon-wrap"><i class="ph ' + icon + '"></i></span><span>' + label + '</span></button>';
        sheet.innerHTML = '<div class="chat-bottom-sheet-card"><div class="chat-bottom-sheet-handle"></div><div class="chat-bottom-sheet-header"><h3>Ajouter</h3><button type="button" class="chat-bottom-sheet-close" data-close-attach-sheet="1" aria-label="Fermer"><i class="ph ph-x"></i></button></div><div class="chat-bottom-sheet-grid lyann-attach-grid">' + choice('photo', 'Photo', 'ph-image') + choice('video', 'Vidéo', 'ph-play-circle') + choice('document', 'Document', 'ph-file-text') + choice('camera', 'Appareil photo', 'ph-camera') + '</div></div>';
        sheet.addEventListener('click', (event) => {
            if (event.target === sheet || event.target.closest('[data-close-attach-sheet]')) sheet.style.display = 'none';
            const choice = event.target.closest('[data-attach-kind]');
            if (!choice) return;
            const kind = choice.dataset.attachKind;
            sheet.style.display = 'none';
            if (kind === 'camera') {
                void captureChatPhoto();
                return;
            }
            if (kind === 'video') {
                void pickChatVideo();
                return;
            }
            chatPicker(kind).click();
        });
        document.body.appendChild(sheet);
    }
    if (!sheet.querySelector('#bsActionCamera') && !sheet.querySelector('[data-attach-kind="camera"]')) {
        const grid = sheet.querySelector('.chat-bottom-sheet-grid');
        if (grid) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'chat-bs-action-btn';
            button.id = 'bsActionCamera';
            button.innerHTML = '<div class="chat-bs-icon-wrap"><i class="ph ph-camera"></i></div><span>Appareil photo</span>';
            button.addEventListener('click', () => {
                sheet.style.display = 'none';
                void captureChatPhoto();
            });
            grid.appendChild(button);
        }
    }
    if (!sheet.querySelector('#bsActionVideo') && !sheet.querySelector('[data-attach-kind="video"]')) {
        const grid = sheet.querySelector('.chat-bottom-sheet-grid');
        if (grid) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'chat-bs-action-btn';
            button.id = 'bsActionVideo';
            button.innerHTML = '<div class="chat-bs-icon-wrap"><i class="ph ph-play-circle"></i></div><span>Vidéo</span>';
            button.addEventListener('click', () => {
                sheet.style.display = 'none';
                void pickChatVideo();
            });
            grid.appendChild(button);
        }
    }
    sheet.style.zIndex = '1000003';
    sheet.style.display = 'flex';
};

window.toggleChatAttachMenu = function(e) {
    window.openChatAttachSheet(e);
};

window.handleGuardedAttachment = function(type) {
    const menu = document.getElementById('chatAttachMenu');
    if (menu) menu.style.display = 'none';
    if (!currentChatContact) return;
    if (type === 'camera') {
        void captureChatPhoto();
        return;
    }
    if (type === 'video') {
        void pickChatVideo();
        return;
    }
    if (type === 'file' || type === 'document') {
        chatPicker('document').click();
        return;
    }
    chatPicker('photo').click();
};

document.addEventListener('click', (e) => {
    const menu = document.getElementById('chatAttachMenu');
    if (menu && !e.target.closest('#chatAttachMenu') && !e.target.closest('#chatAttachBtn')) {
        menu.style.display = 'none';
    }
});

window.closeLyannChatModal = function (e) {
    if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.close === 'function') {
        return window.LYANN_MESSAGING.close(e);
    }
    return false;
};

function initChatCloseBtn() {
    const closeTriggers = document.querySelectorAll('#closeChatModalBtn, .close-chat-modal-trigger, .chat-close-modal-btn');
    closeTriggers.forEach(btn => {
        if (btn.dataset.closeBound === 'true') return;
        btn.dataset.closeBound = 'true';
        btn.addEventListener('click', (e) => window.closeLyannChatModal(e));
    });
}

document.addEventListener('click', function(e) {
    const closeBtn = e.target.closest('#closeChatModalBtn, .close-chat-modal-trigger, .chat-close-modal-btn');
    if (closeBtn && closeBtn.closest('#chatModal')) {
        window.closeLyannChatModal(e);
    }
    // Conversation-list clicks are owned by LYANN_MESSAGING.renderConversationRows.
    // A second document listener here re-opened the chat with the visible name
    // whenever data-chat-member-id was absent, wiping the UUID conversation.
});

window.addEventListener('lyann_missions_updated', () => refreshOpenBusinessCards());

// === MOBILE KEYBOARD VISUAL VIEWPORT ADAPTATION ===
// Do not pin scrollTop on every visualViewport scroll/resize — on iOS that fires during
// thread pans and made the conversation feel stuck at the bottom.
if (window.visualViewport) {
    const handleVisualViewportResize = () => {
        const modal = document.getElementById('chatModal');
        if (!modal || !(modal.classList.contains('active') || modal.style.display === 'flex')) return;
        if (!document.body.classList.contains('chat-conversation-open')) return;
        const viewport = window.visualViewport;
        const keyboardOpen = window.innerHeight - viewport.height - viewport.offsetTop > 80;
        const modalCard = modal.querySelector('.modal-card-chat');
        if (modalCard) {
            if (keyboardOpen) modalCard.style.height = `${viewport.height}px`;
            else modalCard.style.removeProperty('height');
        }
        if (!keyboardOpen) return;
        const msgScroll = document.getElementById('chatMessagesContainer')
            || document.getElementById('chatMessagesScroll')
            || document.querySelector('.chat-messages-scroll');
        if (msgScroll && threadIsNearBottom(msgScroll)) {
            msgScroll.scrollTop = msgScroll.scrollHeight;
        }
    };
    window.visualViewport.addEventListener('resize', handleVisualViewportResize);
}

// Safe startup execution. No chat DOM MutationObserver is allowed.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initChatSubmitAndContacts();
        initChatCloseBtn();
    }, { once: true });
} else {
    initChatSubmitAndContacts();
    initChatCloseBtn();
}

// === FAVORITES MANAGEMENT FOR CHAT CONTACTS & MEMBERS ===
window.getLyannFavorites = function() {
    if (window.LyannFavoritesService && typeof window.LyannFavoritesService.getMyFavorites === 'function') {
        // Return active promise or cached state if needed
        return window.LyannFavoritesService.getMyFavorites();
    }
    return [];
};

function buildProfileShareUrl(memberId) {
    const id = encodeURIComponent(String(memberId || '').trim());
    const host = (typeof location !== 'undefined' && location.protocol === 'capacitor:')
        ? 'https://lyann.app'
        : ((typeof location !== 'undefined' && location.origin) ? location.origin : 'https://lyann.app');
    return `${String(host).replace(/\/$/, '')}/index.html?action=member&id=${id}`;
}
window.buildProfileShareUrl = buildProfileShareUrl;

function profileSharePayload(member) {
    const url = buildProfileShareUrl(member && member.id);
    const name = (member && member.name) || 'ce membre';
    const memberRole = (member && member.role) || 'Lyanneur';
    const shortText = `Découvrez le profil de ${name} sur LYANN`;
    return {
        title: 'Profil LYANN',
        url,
        shortText,
        text: `${shortText} (${memberRole}) : ${url}`
    };
}

function resolveShareMember(memberOrName, role, trigger) {
    const visiting = window.currentVisitingMember;
    const chat = (typeof currentChatContact !== 'undefined' ? currentChatContact : null) || window.LYANN_ACTIVE_CHAT_CONTACT;
    let member = null;
    if (trigger && trigger.closest && trigger.closest('#publicMemberProfileModal') && visiting && visiting.id) member = visiting;
    else if (memberOrName && typeof memberOrName === 'object') member = memberOrName;
    else if (visiting && visiting.id && !(trigger && trigger.id === 'chatDropShareProfile')) member = visiting;
    else if (chat && chat.id) member = chat;
    const name = (member && (member.name || member.first_name || member.display_name))
        || (typeof memberOrName === 'string' ? memberOrName : 'ce membre');
    return {
        id: (member && (member.id || member.user_id)) || '',
        name,
        role: (member && (member.role || member.primary_activity)) || role || 'Lyanneur',
        avatar: (member && (member.avatar || member.avatar_url)) || ''
    };
}

function closeProfileShareSheet() {
    const sheet = document.getElementById('lyannProfileShareSheet');
    if (sheet) sheet.remove();
}

function toastProfileShare(message, kind) {
    if (typeof window.showToast === 'function') window.showToast(message, kind || 'success');
    else if (typeof window.showLyanToast === 'function') window.showLyanToast(message, '🔗');
    else if (typeof window.lyannAlert === 'function') window.lyannAlert(message);
}

async function shareProfileExternally(payload) {
    const nativeShare = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
    if (nativeShare && typeof window.shareNative === 'function') {
        try {
            const ok = await window.shareNative(payload.title, payload.text, payload.url);
            return ok ? 'shared' : 'cancelled';
        } catch (error) {
            if (error && (error.name === 'AbortError' || /cancel/i.test(String(error.message || error)))) return 'cancelled';
        }
    }
    if (navigator.share) {
        try {
            await navigator.share({ title: payload.title, text: payload.shortText, url: payload.url });
            return 'shared';
        } catch (error) {
            if (error && (error.name === 'AbortError' || /cancel/i.test(String(error.message || error)))) return 'cancelled';
        }
    }
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(payload.url);
            return 'copied';
        }
    } catch (_) {}
    return 'failed';
}

async function listProfileShareRecipients(query, excludeIds) {
    const exclude = new Set((excludeIds || []).filter(Boolean).map(String));
    const me = String(getMyId() || '');
    if (me) exclude.add(me);
    const userId = getMyId();
    const repo = window.LYANN_MESSAGING_REPOSITORY;
    let rows = [];
    if (userId && repo) {
        rows = repo.peekConversations(userId) || [];
        if ((!rows || !rows.length) && typeof repo.listConversations === 'function') {
            try { rows = await repo.listConversations(userId); } catch (_) { rows = []; }
        }
    }
    const mapped = (rows || []).map((row) => ({
        id: row.contactId || row.id,
        name: row.name || 'Membre LYANN',
        avatar: row.avatar || '',
        fromInbox: true
    })).filter((row) => row.id && !exclude.has(String(row.id)));
    const q = String(query || '').trim().toLowerCase();
    let out = q ? mapped.filter((row) => String(row.name || '').toLowerCase().includes(q)) : mapped.slice();
    if (q.length >= 2) {
        const client = window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase;
        const safe = q.replace(/[^a-zA-ZÀ-ÿ0-9 '\-]/g, '').slice(0, 32);
        if (client && safe) {
            try {
                const { data } = await client.from('public_profiles')
                    .select('id,first_name,last_name,avatar_url')
                    .or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%`)
                    .limit(16);
                for (const profile of data || []) {
                    if (!profile || !profile.id || exclude.has(String(profile.id))) continue;
                    if (out.some((item) => String(item.id) === String(profile.id))) continue;
                    const name = typeof window.formatPublicName === 'function'
                        ? window.formatPublicName(profile, null, 'Lyanneur')
                        : String(profile.first_name || 'Lyanneur');
                    out.push({
                        id: profile.id,
                        name,
                        avatar: typeof window.getLyannAvatarUrl === 'function' ? window.getLyannAvatarUrl(profile.avatar_url) : (profile.avatar_url || ''),
                        fromInbox: false
                    });
                }
            } catch (_) {}
        }
    }
    return out.slice(0, 30);
}

async function sendSharedProfileToChat(member, recipient) {
    if (!member || !member.id || !recipient || !recipient.id) return false;
    const payload = profileSharePayload(member);
    const text = payload.text;
    if (typeof window.addMessageToContact === 'function') {
        await window.addMessageToContact(recipient.id, {
            type: 'text',
            text,
            entityType: 'profile',
            entityId: member.id,
            metadata: { name: member.name, role: member.role, url: payload.url }
        });
    }
    const profileModal = document.getElementById('publicMemberProfileModal');
    if (profileModal) {
        profileModal.classList.remove('active');
        document.body.style.overflow = '';
    }
    if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.openConversation === 'function') {
        await window.LYANN_MESSAGING.openConversation({
            contactId: recipient.id,
            name: recipient.name,
            avatar: recipient.avatar
        });
    } else if (window.LYANN_ROUTER && typeof window.LYANN_ROUTER.go === 'function') {
        window.LYANN_ROUTER.go('messages', { contactId: recipient.id, name: recipient.name });
    }
    toastProfileShare(`Profil envoyé à ${recipient.name}.`, 'success');
    return true;
}

function paintShareRecipientList(listEl, rows, onPick) {
    listEl.innerHTML = '';
    if (!rows.length) {
        const empty = document.createElement('p');
        empty.className = 'lyann-share-empty';
        empty.textContent = 'Aucun Lyanneur trouvé. Cherchez un prénom, ou choisissez une conversation.';
        listEl.appendChild(empty);
        return;
    }
    rows.forEach((row) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lyann-share-recipient';
        const img = document.createElement('img');
        img.alt = '';
        img.src = (typeof window.resolveLyannAvatarSrc === 'function' ? window.resolveLyannAvatarSrc(row.avatar) : row.avatar) || '';
        img.addEventListener('error', () => { if (typeof window.handleAvatarError === 'function') window.handleAvatarError(img); });
        const label = document.createElement('span');
        label.textContent = row.name;
        btn.append(img, label);
        btn.addEventListener('click', () => onPick(row));
        listEl.appendChild(btn);
    });
}

function openProfileShareSheet(member) {
    closeProfileShareSheet();
    const payload = profileSharePayload(member);
    const sheet = document.createElement('div');
    sheet.id = 'lyannProfileShareSheet';
    sheet.className = 'chat-bottom-sheet-overlay lyann-profile-share-overlay';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'lyannProfileShareTitle');
    sheet.innerHTML = [
        '<div class="chat-bottom-sheet-card lyann-profile-share-card">',
        '<div class="chat-bottom-sheet-handle"></div>',
        '<div class="chat-bottom-sheet-header">',
        '<h3 id="lyannProfileShareTitle">Partager le profil</h3>',
        '<button type="button" class="chat-bottom-sheet-close" data-close-profile-share="1" aria-label="Fermer"><i class="ph ph-x"></i></button>',
        '</div>',
        '<p class="lyann-share-subtitle"></p>',
        '<div class="lyann-share-dest-grid" data-share-step="dest">',
        '<button type="button" class="lyann-share-dest-btn" data-share-dest="external"><i class="ph ph-whatsapp-logo"></i><span>WhatsApp, Messages…</span></button>',
        '<button type="button" class="lyann-share-dest-btn" data-share-dest="lyann"><i class="ph ph-chat-circle-text"></i><span>Un Lyanneur</span></button>',
        '<button type="button" class="lyann-share-dest-btn" data-share-dest="copy"><i class="ph ph-link"></i><span>Copier le lien</span></button>',
        '</div>',
        '<div class="lyann-share-lyann-pane" data-share-step="lyann" hidden>',
        '<input type="search" class="lyann-share-search" placeholder="Rechercher un Lyanneur" autocomplete="off">',
        '<div class="lyann-share-recipient-list" role="list"></div>',
        '</div>',
        '</div>'
    ].join('');
    const subtitle = sheet.querySelector('.lyann-share-subtitle');
    if (subtitle) subtitle.textContent = member.name ? ('Profil de ' + member.name) : 'Choisir comment partager';
    const lyannPane = sheet.querySelector('[data-share-step="lyann"]');
    const destGrid = sheet.querySelector('[data-share-step="dest"]');
    const listEl = sheet.querySelector('.lyann-share-recipient-list');
    const searchEl = sheet.querySelector('.lyann-share-search');

    const pickRecipient = async (row) => {
        closeProfileShareSheet();
        await sendSharedProfileToChat(member, row);
    };

    const showLyannPicker = async () => {
        if (window.LYANN_ROUTER && typeof window.LYANN_ROUTER.requireAuthForInteraction === 'function') {
            const ok = await window.LYANN_ROUTER.requireAuthForInteraction('messages');
            if (!ok) return;
        }
        destGrid.hidden = true;
        lyannPane.hidden = false;
        const title = sheet.querySelector('#lyannProfileShareTitle');
        if (title) title.textContent = 'Envoyer à un Lyanneur';
        const rows = await listProfileShareRecipients('', [member.id]);
        paintShareRecipientList(listEl, rows, pickRecipient);
        if (searchEl) searchEl.focus();
    };

    sheet.addEventListener('click', async (event) => {
        if (event.target === sheet || event.target.closest('[data-close-profile-share]')) {
            closeProfileShareSheet();
            return;
        }
        const dest = event.target.closest('[data-share-dest]');
        if (!dest) return;
        const kind = dest.getAttribute('data-share-dest');
        if (kind === 'lyann') {
            showLyannPicker();
            return;
        }
        if (kind === 'copy') {
            const result = await (async () => {
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(payload.url);
                        return 'copied';
                    }
                } catch (_) {}
                return 'failed';
            })();
            closeProfileShareSheet();
            if (result === 'copied') toastProfileShare('Lien du profil copié.', 'success');
            else toastProfileShare('Impossible de copier le lien.', 'warning');
            return;
        }
        closeProfileShareSheet();
        const result = await shareProfileExternally(payload);
        if (result === 'copied') toastProfileShare('Lien du profil copié. Collez-le dans WhatsApp ou Messages.', 'success');
        else if (result === 'failed') toastProfileShare('Partage indisponible sur cet appareil.', 'warning');
    });

    let searchTimer = 0;
    if (searchEl) {
        searchEl.addEventListener('input', () => {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(async () => {
                const rows = await listProfileShareRecipients(searchEl.value, [member.id]);
                paintShareRecipientList(listEl, rows, pickRecipient);
            }, 180);
        });
    }

    document.body.appendChild(sheet);
}

let profileShareOpenAt = 0;
window.shareProfile = async function(memberOrName, role, options) {
    const now = Date.now();
    if (now - profileShareOpenAt < 500) return;
    profileShareOpenAt = now;
    const trigger = options && options.trigger;
    const member = resolveShareMember(memberOrName, role, trigger);
    if (!member.id) {
        toastProfileShare('Profil introuvable pour le partage.', 'warning');
        return;
    }
    openProfileShareSheet(member);
};

window.isContactFavorite = function(contactId) {
    if (!contactId) return false;
    if (window.LyannFavoritesService && typeof window.LyannFavoritesService.isFavorite === 'function') {
        try {
            const isFav = window.LyannFavoritesService.isFavorite('PROFILE', contactId);
            if (typeof isFav === 'boolean') return isFav;
        } catch(e) {}
    }
    try {
        const localFavs = JSON.parse(localStorage.getItem('lyann_local_favorites') || '[]');
        return localFavs.includes(contactId);
    } catch(e) {
        return false;
    }
};

window.toggleContactFavorite = async function(contactId, contactName) {
    if (!await window.LYANN_ROUTER.requireAuthForInteraction('favorite', { entityType: 'PROFILE', entityId: contactId || currentChatContact?.id })) return;
    const targetId = contactId || (currentChatContact ? currentChatContact.id : null);
    if (!targetId) return;
    const name = contactName || (currentChatContact ? currentChatContact.name : 'ce membre');
    let isNowFav = false;

    if (window.LyannFavoritesService && typeof window.LyannFavoritesService.toggleFavorite === 'function') {
        try {
            const res = await window.LyannFavoritesService.toggleFavorite('PROFILE', targetId);
            if (res && typeof res.isFavorite === 'boolean') {
                isNowFav = res.isFavorite;
            } else {
                isNowFav = !window.isContactFavorite(targetId);
            }
        } catch(e) {
            isNowFav = !window.isContactFavorite(targetId);
        }
    } else {
        isNowFav = !window.isContactFavorite(targetId);
    }

    try {
        let localFavs = JSON.parse(localStorage.getItem('lyann_local_favorites') || '[]');
        if (isNowFav) {
            if (!localFavs.includes(targetId)) localFavs.push(targetId);
        } else {
            localFavs = localFavs.filter(id => id !== targetId);
        }
        localStorage.setItem('lyann_local_favorites', JSON.stringify(localFavs));
    } catch(e) {}

    const msg = isNowFav ? `⭐ ${name} ajouté(e) à vos favoris.` : `💔 ${name} retiré(e) de vos favoris.`;
    if (window.showToast) window.showToast(msg, isNowFav ? 'success' : 'info');
    else if (window.NotificationService && typeof window.NotificationService.showToast === 'function') {
        window.NotificationService.showToast(isNowFav ? 'success' : 'info', msg);
    } else if (window.lyannAlert) window.lyannAlert(msg);
    else alert(msg);

    if (typeof window.updateChatFavHeaderUI === 'function') {
        window.updateChatFavHeaderUI();
    }
};

window.updateChatFavHeaderUI = function() {
    if (!currentChatContact) return;
    const isFav = window.isContactFavorite(currentChatContact.id);
    const favIcon = document.getElementById('chatFavHeaderIcon');
    const dropAddFavBtn = document.getElementById('chatDropAddFavorite');
    
    if (favIcon) {
        if (isFav) {
            favIcon.className = 'ph-fill ph-heart';
            favIcon.style.color = 'var(--primary)';
        } else {
            favIcon.className = 'ph ph-heart';
            favIcon.style.color = 'var(--primary)';
        }
    }
    
    if (dropAddFavBtn) {
        dropAddFavBtn.innerHTML = isFav 
            ? `<i class="ph-fill ph-heart" style="color: var(--primary);"></i> Retirer des favoris`
            : `<i class="ph ph-heart" style="color: var(--primary);"></i> Ajouter aux favoris`;
    }
};

document.addEventListener('click', (e) => {
    const favBtn = e.target.closest('#chatToggleFavoriteBtn, #chatDropAddFavorite, #shareFavoriteBtn, .btn-favorite, [data-action="favorite"]');
    if (favBtn) {
        e.preventDefault();
        e.stopPropagation();
        const contact = currentChatContact || window.LYANN_ACTIVE_CHAT_CONTACT;
        const targetId = favBtn.dataset.contactId || (contact ? contact.id : null);
        const targetName = favBtn.dataset.contactName || (contact ? contact.name : 'ce membre');
        if (targetId) {
            window.toggleContactFavorite(targetId, targetName);
        }
    }

    const shareBtn = e.target.closest('#shareProfileBtn, .btn-share-profile, #chatDropShareProfile');
    if (shareBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        window.shareProfile(null, null, { trigger: shareBtn });
    }

    const dateBtn = e.target.closest('#btnCtxDate, #bsActionDate, #btnChooseDate, #btnProposeDate, .btn-propose-date');
    if (dateBtn) {
        e.preventDefault();
        e.stopPropagation();
        closeAllOverlays();
        const overlay = document.getElementById('chatProposeDateForm');
        if (overlay) {
            openChatChildSurface('chatProposeDateForm');
            setChatContextCoveredByOverlay(true);
            const firstRequired = overlay.querySelector('[required]');
            if (firstRequired) requestAnimationFrame(() => firstRequired.focus());
        }
    }
});


// ---------------------------------------------------------
// SUPABASE REALTIME SUBSCRIPTIONS
// ---------------------------------------------------------
let chatSubscription = null;
let chatRealtimeGeneration = 0;
let realtimeEverConnected = false;
let realtimeDropped = false;
let chatRealtimeAuthed = false;
let chatAuthWatchInstalled = false;
let catchUpPromise = null;
let chatRealtimeRecyclePromise = null;
let lastChatRealtimeRecycleAt = 0;
let lastVisibleCatchupAt = 0;
const chatRealtimeSlot = window.LYANN_REALTIME_SESSION
    ? window.LYANN_REALTIME_SESSION.createRealtimeSlot()
    : null;
let readReceiptLogQueued = false;
let readBadgeQueued = false;

function isJsonMessageContent(text) {
    const raw = typeof text === 'string' ? text.trim() : '';
    if (!raw.startsWith('{')) return false;
    try { JSON.parse(raw); return true; } catch (_) { return false; }
}

function reconcileLiveRow(row) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container || !row) return false;
    const messageId = row.id ? String(row.id) : '';
    if (messageId && container.querySelector(chatMessageSelector(messageId))) {
        if (row.is_read && row.sender_id === getMyId()) markOwnBubbleRead(messageId);
        return true;
    }
    const text = typeof row.content === 'string' ? row.content : '';
    const mine = row.sender_id && row.sender_id === getMyId();
    if (mine && currentChatContact) {
        if (messageId && pendingOptimisticFor(currentChatContact.id).length) {
            parkedLiveRows.set(messageId, row);
            return 'parked';
        }
        if (!messageId) {
            const pending = claimUniqueOptimistic(currentChatContact.id, text);
            if (pending) {
                settleOptimisticNode(pending, '');
                return true;
            }
        }
    }
    return false;
}

function appendLiveChatMessage(row, options = {}) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container || !row || !currentChatContact) return false;
    const messageId = row.id ? String(row.id) : '';
    if (messageId && container.querySelector(chatMessageSelector(messageId))) return true;
    const mine = row.sender_id && row.sender_id === getMyId();
    const text = typeof row.content === 'string' ? row.content : '';
    const attachmentType = row.attachment_type === 'photo' || row.attachment_type === 'video' || row.attachment_type === 'document' ? row.attachment_type : '';
    if (!attachmentType && isJsonMessageContent(text)) return false;
    const stick = Object.prototype.hasOwnProperty.call(options, 'stickToBottom') ? options.stickToBottom : threadIsNearBottom(container);
    if (!attachmentType && (isQuoteAcceptedNotice(text) || isRpcNoiseMessage(text))) {
        return false;
    }
    if (row.metadata && row.metadata.kind === 'payout_ready') return false;
    const messageType = row.message_type || row.messageType || '';
    const visibleNotice = window.LYANN_QUOTE_PAYMENT && typeof window.LYANN_QUOTE_PAYMENT.isVisibleDealNotice === 'function'
        ? window.LYANN_QUOTE_PAYMENT.isVisibleDealNotice(messageType)
        : messageType === 'quote_declined';
    const dealWake = dealContextSyncApi && typeof dealContextSyncApi.isDealWakeMessage === 'function'
        ? dealContextSyncApi.isDealWakeMessage(row, window.LYANN_QUOTE_PAYMENT && window.LYANN_QUOTE_PAYMENT.isDealTimeline)
        : (window.LYANN_QUOTE_PAYMENT && window.LYANN_QUOTE_PAYMENT.isDealTimeline
            && window.LYANN_QUOTE_PAYMENT.isDealTimeline(messageType));
    if (dealWake) {
        const quote = timelineQuotes.get(String(row.entity_id || '')) || {
            id: row.entity_id,
            request_id: row.metadata && (row.metadata.request_id || row.metadata.requestId),
            request_invitation_id: row.metadata && row.metadata.request_invitation_id,
            total_amount: row.metadata && row.metadata.amount,
            provider_id: row.metadata && row.metadata.provider_id
        };
        const belongs = dealEventBelongsToActiveDossier(quote, row);
        if (belongs) void refreshDealContext('realtime-timeline');
        if (messageType === 'quote_declined') {
            if (belongs) ensureQuoteDeclinedNotice(quote, row);
            return belongs;
        }
        if (!visibleNotice) return false;
        if (!belongs) return false;
    }
    container.querySelector('.chat-empty-state')?.remove();
    if (!container.querySelector('.chat-date-separator')) {
        const dateSep = document.createElement('div');
        dateSep.className = 'chat-date-separator';
        const span = document.createElement('span');
        span.textContent = "Aujourd'hui";
        dateSep.appendChild(span);
        container.appendChild(dateSep);
    }
    const mapped = {
        id: row.id,
        text: text,
        sender: mine ? 'me' : 'them',
        timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        createdAt: row.created_at || null,
        type: row.message_type || attachmentType || 'text',
        messageType: row.message_type || '',
        entityType: row.entity_type || '',
        entityId: row.entity_id || '',
        metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
        status: row.is_read ? 'read' : 'sent',
        attachmentPath: row.attachment_url || '',
        attachmentName: row.attachment_name || '',
        attachmentSize: row.attachment_size,
        attachmentMime: row.attachment_mime || ''
    };
    if (!attachmentType && isJsonMessageContent(text) && !isTimelineMessage(mapped)) return false;
    const node = isTimelineMessage(mapped) ? renderTimelineCard(mapped) : createThreadBubble(mapped);
    if (!node) return false;
    if (node.dataset.messageId && container.querySelector(chatMessageSelector(node.dataset.messageId))) return true;
    placeThreadNode(container, node);
    const followed = !node.nextElementSibling || !node.nextElementSibling.dataset || !node.nextElementSibling.dataset.messageId;
    if (stick && followed) scrollThreadToBottom(container, !options.quiet);
    return true;
}
window.appendLiveChatMessage = appendLiveChatMessage;

function liveRowFromMapped(msg, contactId) {
    return {
        id: msg.id,
        sender_id: msg.sender === 'me' ? getMyId() : contactId,
        content: msg.text || '',
        created_at: msg.createdAt || null,
        is_read: msg.status === 'read',
        attachment_type: msg.attachmentType || (msg.type === 'photo' || msg.type === 'video' || msg.type === 'document' ? msg.type : null),
        attachment_url: msg.attachmentPath || '',
        attachment_name: msg.attachmentName || '',
        attachment_size: msg.attachmentSize,
        attachment_mime: msg.attachmentMime || '',
        message_type: msg.messageType || (msg.type && msg.type !== 'text' ? msg.type : null),
        entity_type: msg.entityType || null,
        entity_id: msg.entityId || null,
        metadata: msg.metadata || null
    };
}

function placeLiveMessage(row, options = {}) {
    const outcome = reconcileLiveRow(row);
    if (outcome === 'parked') return 'parked';
    if (outcome) return 'reconciled';
    return appendLiveChatMessage(row, options) ? 'appended' : 'skipped';
}

let catchUpQueuedReason = null;

async function catchUpOpenThread(reason) {
    if (!currentChatContact?.id || !isUUID(currentChatContact.id)) return;
    if (catchUpPromise) {
        catchUpQueuedReason = reason || 'queued';
        return catchUpPromise;
    }
    const contactId = currentChatContact.id;
    if (reason === 'foreground') console.log('[CHAT] foreground catchup');
    catchUpPromise = (async () => {
        const container = document.getElementById('chatMessagesContainer');
        if (!container || !currentChatContact || currentChatContact.id !== contactId) return;
        const placePage = (msgs, stick) => {
            (msgs || []).forEach((msg) => {
                if (!msg || msg.type === 'transactional') return;
                placeLiveMessage(liveRowFromMapped(msg, contactId), { stickToBottom: stick, quiet: true });
            });
        };
        if (!container.querySelector('.chat-msg-bubble-wrap, .chat-msg-card, .chat-empty-state')) {
            const msgs = await getChatMessages(contactId, { fresh: true, limit: 50 });
            if (!currentChatContact || currentChatContact.id !== contactId) return;
            await renderMessages(msgs);
            return;
        }
        const stick = threadIsNearBottom(container);
        const reasonText = String(reason || '');
        if (/fanout|reconnect|subscribe|denied|recycle|postgres-dropped|realtime-miss/.test(reasonText)) {
            window.LYANN_MESSAGING_REPOSITORY?.invalidateMessages?.(currentChatContact.conversationId);
            placePage(await getChatMessages(contactId, { fresh: true, limit: 50 }), stick);
            return;
        }
        let cursor = newestServerCursor(container);
        let pages = 0;
        while (pages < 40 && currentChatContact && currentChatContact.id === contactId) {
            const batch = await getChatMessages(contactId, { fresh: true, limit: 50, after: cursor });
            pages += 1;
            if (!Array.isArray(batch) || !batch.length) break;
            placePage(batch, stick);
            const last = batch[batch.length - 1];
            if (!last?.id || !last.createdAt) break;
            const next = { createdAt: last.createdAt, id: String(last.id) };
            if (compareCursor(next, cursor) <= 0) break;
            cursor = next;
            if (batch.length < 50) break;
        }
    })().finally(() => {
        catchUpPromise = null;
        const again = catchUpQueuedReason;
        catchUpQueuedReason = null;
        if (again) void catchUpOpenThread(again);
    });
    return catchUpPromise;
}

let bottomRefreshPromise = null;

async function refreshOpenThreadFromBottom() {
    if (bottomRefreshPromise) return bottomRefreshPromise;
    const contactId = currentChatContact && currentChatContact.id;
    const container = document.getElementById('chatMessagesContainer');
    if (!contactId || !container) return null;
    bottomRefreshPromise = (async () => {
        await catchUpOpenThread('manual');
        await refreshOpenBusinessCards();
        const box = document.getElementById('chatMessagesContainer');
        if (box && currentChatContact && currentChatContact.id === contactId) scrollThreadToBottom(box, false);
    })().finally(() => { bottomRefreshPromise = null; });
    return bottomRefreshPromise;
}

function attachBottomChatRefresh() {
    const container = document.getElementById('chatMessagesContainer');
    if (!container || container.dataset.bottomRefresh === '1') return;
    container.dataset.bottomRefresh = '1';
    const indicator = document.createElement('div');
    indicator.className = 'chat-bottom-refresh';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.innerHTML = '<span class="chat-bottom-refresh-pill"><span class="chat-bottom-refresh-spin"></span></span>';
    const pill = indicator.querySelector('.chat-bottom-refresh-pill');
    container.parentElement && container.parentElement.appendChild(indicator);
    let startX = 0;
    let startY = 0;
    let pulling = false;
    let lastUp = 0;
    let refreshing = false;
    function paint(distance, busy) {
        indicator.classList.toggle('is-refreshing', busy);
        pill.style.opacity = busy ? '1' : String(Math.min(1, distance / 36));
        pill.style.transform = 'translateY(' + (busy ? -28 : -Math.min(distance, 36)) + 'px)';
    }
    function resetPaint() {
        indicator.classList.remove('is-refreshing');
        pill.style.opacity = '0';
        pill.style.transform = 'translateY(0)';
    }
    container.addEventListener('touchstart', (event) => {
        if (refreshing || !event.touches || event.touches.length !== 1) return;
        const target = event.target;
        if (target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (!threadIsNearBottom(container)) return;
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
        pulling = false;
        lastUp = 0;
    }, { passive: true });
    container.addEventListener('touchmove', (event) => {
        if (refreshing || !event.touches || event.touches.length !== 1) return;
        const gesture = bottomRefreshGesture({
            nearBottom: threadIsNearBottom(container),
            dy: event.touches[0].clientY - startY,
            dx: event.touches[0].clientX - startX,
            pulling: pulling
        });
        if (!gesture.pull) {
            pulling = false;
            lastUp = 0;
            resetPaint();
            return;
        }
        pulling = true;
        lastUp = Math.max(0, startY - event.touches[0].clientY);
        paint(lastUp, false);
        if (gesture.block && event.cancelable) event.preventDefault();
    }, { passive: false });
    container.addEventListener('touchend', () => {
        const gesture = bottomRefreshGesture({
            nearBottom: threadIsNearBottom(container),
            dy: -lastUp,
            dx: 0,
            pulling: pulling
        });
        const should = gesture.refresh && !refreshing;
        pulling = false;
        lastUp = 0;
        if (!should) {
            resetPaint();
            return;
        }
        refreshing = true;
        paint(72, true);
        Promise.resolve(refreshOpenThreadFromBottom()).finally(() => {
            refreshing = false;
            resetPaint();
        });
    });
    container.addEventListener('touchcancel', () => {
        pulling = false;
        lastUp = 0;
        resetPaint();
    });
    let wheelPull = 0;
    container.addEventListener('wheel', (event) => {
        if (refreshing || !threadIsNearBottom(container) || event.deltaY <= 0) {
            wheelPull = 0;
            return;
        }
        wheelPull += event.deltaY;
        if (wheelPull < 160) return;
        wheelPull = 0;
        refreshing = true;
        paint(72, true);
        Promise.resolve(refreshOpenThreadFromBottom()).finally(() => {
            refreshing = false;
            resetPaint();
        });
    }, { passive: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attachBottomChatRefresh);
else attachBottomChatRefresh();

async function noteChatPreview(userId, row, contactId) {
    const unread = !!(row.sender_id && row.sender_id !== userId && !contactId);
    const extra = {
        attachment_type: row.attachment_type || null,
        attachment_name: row.attachment_name || '',
        unread
    };
    let noted = window.LYANN_MESSAGING_REPOSITORY?.noteIncomingPreview?.(userId, row.conversation_id, row.content, row.created_at, extra);
    if (!noted && userId && row.conversation_id) {
        noted = await window.LYANN_MESSAGING_REPOSITORY?.ensureInboxConversation?.(userId, row.conversation_id, {
            content: row.content,
            createdAt: row.created_at,
            ...extra
        });
    }
    const preview = noted?.preview || window.LYANN_MESSAGING_REPOSITORY?.formatMessagePreview?.(row) || inboxPreviewText(row.content);
    publishChatActivity({
        contactId: (noted && noted.contactId) || contactId || null,
        preview,
        conversationId: row.conversation_id,
        lastMessageAt: row.created_at || null,
        unread: noted ? !!noted.unread : unread,
        unreadCount: noted && noted.unreadCount ? noted.unreadCount : (unread ? 1 : 0),
        name: noted?.name || '',
        avatar: noted?.avatar || ''
    });
}

let chatFanout = { conversationId: null, channel: null, generation: 0, subscribed: false, retries: 0, inboxIds: new Set() };
const inboxFanoutChannels = new Map();

function chatFanoutName(conversationId) {
    return 'lyann-chat-fanout:' + conversationId;
}

function chatFanoutChannelConfig() {
    return { config: { private: true, broadcast: { ack: false, self: false } } };
}

function chatFanoutWake(kind, conversationId, requestId) {
    const payload = {
        kind: kind === 'deal' ? 'deal' : 'wake',
        conversationId: String(conversationId || '')
    };
    if (requestId) payload.requestId = String(requestId);
    return payload;
}

function conversationAllowedForFanout(conversationId) {
    if (!conversationId || (typeof isUUID === 'function' && !isUUID(conversationId))) return false;
    if (chatFanout.conversationId && String(chatFanout.conversationId) === String(conversationId) && chatFanout.subscribed) return true;
    const open = currentChatContact && currentChatContact.conversationId
        ? String(currentChatContact.conversationId)
        : '';
    if (open && open === String(conversationId)) return true;
    if (chatFanout.inboxIds && typeof chatFanout.inboxIds.has === 'function' && chatFanout.inboxIds.has(String(conversationId))) return true;
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    const listed = window.LYANN_MESSAGING_REPOSITORY && typeof window.LYANN_MESSAGING_REPOSITORY.peekConversations === 'function'
        ? (window.LYANN_MESSAGING_REPOSITORY.peekConversations(userId) || [])
        : [];
    return listed.some((item) => item && String(item.conversationId || '') === String(conversationId));
}

async function unbindChatFanout() {
    const stale = chatFanout.channel;
    chatFanout = {
        conversationId: null,
        channel: null,
        generation: chatFanout.generation + 1,
        subscribed: false,
        retries: chatFanout.retries || 0,
        inboxIds: chatFanout.inboxIds || new Set()
    };
    const supabase = window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase;
    if (stale && supabase && typeof supabase.removeChannel === 'function') {
        try { await supabase.removeChannel(stale); } catch (_) {}
    }
}

async function ensureRealtimeAuth(supabase) {
    if (!supabase || !supabase.auth || !supabase.realtime) return '';
    try {
        const sessionResult = await supabase.auth.getSession();
        const token = (sessionResult && sessionResult.data && sessionResult.data.session && sessionResult.data.session.access_token) || '';
        if (token && typeof supabase.realtime.setAuth === 'function') await supabase.realtime.setAuth(token);
        console.log('[CHAT] realtime auth', token ? 'ok' : 'missing');
        return token;
    } catch (_) {
        return '';
    }
}

function scheduleCatchUpBurst(reason) {
    void catchUpOpenThread(reason);
    setTimeout(() => { void catchUpOpenThread(reason + '-b'); }, 400);
    setTimeout(() => { void catchUpOpenThread(reason + '-c'); }, 1500);
    setTimeout(() => { void catchUpOpenThread(reason + '-d'); }, 3500);
}

async function bindChatFanout(conversationId) {
    if (!conversationId || !isUUID(conversationId)) return;
    if (chatFanout.channel && String(chatFanout.conversationId) === String(conversationId)) return;
    const supabase = window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase;
    if (!supabase || typeof supabase.channel !== 'function') return;
    await ensureRealtimeAuth(supabase);
    if (String(chatFanout.conversationId || '') !== String(conversationId)) await unbindChatFanout();
    const generation = chatFanout.generation;
    const channel = supabase.channel(chatFanoutName(conversationId), chatFanoutChannelConfig())
        .on('broadcast', { event: 'lyann-chat' }, (msg) => {
            const payload = msg && (msg.payload || msg);
            applyIncomingChatEvent(payload, 'fanout');
        });
    chatFanout = {
        conversationId,
        channel,
        generation,
        subscribed: false,
        retries: chatFanout.retries || 0,
        inboxIds: chatFanout.inboxIds || new Set()
    };
    channel.subscribe((status, err) => {
        if (generation !== chatFanout.generation) return;
        console.log('[CHAT] realtime fanout', status);
        if (status === 'SUBSCRIBED') {
            chatFanout.subscribed = true;
            chatFanout.retries = 0;
            scheduleCatchUpBurst('fanout-subscribe');
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.log('[CHAT] realtime fanout denied', err && (err.message || err));
            chatFanout.subscribed = false;
            scheduleCatchUpBurst('fanout-denied');
            if ((chatFanout.retries || 0) < 3 && currentChatContact && String(currentChatContact.conversationId || '') === String(conversationId)) {
                chatFanout.retries = (chatFanout.retries || 0) + 1;
                const retries = chatFanout.retries;
                setTimeout(() => {
                    if (chatFanout.channel === channel) {
                        chatFanout.conversationId = null;
                        chatFanout.channel = null;
                    }
                    void bindChatFanout(conversationId);
                }, 700 * retries);
            }
        }
    });
}

async function waitFanoutSubscribed(conversationId, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 4000);
    while (Date.now() < deadline) {
        if (chatFanout.subscribed && chatFanout.channel && String(chatFanout.conversationId) === String(conversationId)) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return !!(chatFanout.channel && String(chatFanout.conversationId) === String(conversationId));
}

async function bindInboxChatFanouts(conversationIds) {
    const ids = (Array.isArray(conversationIds) ? conversationIds : [])
        .map((id) => String(id || ''))
        .filter((id) => id && (typeof isUUID !== 'function' || isUUID(id)));
    const wanted = new Set(ids.slice(0, 12));
    const open = currentChatContact && currentChatContact.conversationId ? String(currentChatContact.conversationId) : '';
    if (open) wanted.add(open);
    chatFanout.inboxIds = wanted;
    for (const [id, channel] of inboxFanoutChannels) {
        if (wanted.has(id)) continue;
        inboxFanoutChannels.delete(id);
        const supabase = window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase;
        if (channel && supabase && typeof supabase.removeChannel === 'function') {
            try { await supabase.removeChannel(channel); } catch (_) {}
        }
    }
    const supabase = window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase;
    if (!supabase || typeof supabase.channel !== 'function') return;
    await ensureRealtimeAuth(supabase);
    for (const id of wanted) {
        if (inboxFanoutChannels.has(id)) continue;
        if (chatFanout.channel && String(chatFanout.conversationId) === id) continue;
        const channel = supabase.channel(chatFanoutName(id), chatFanoutChannelConfig())
            .on('broadcast', { event: 'lyann-chat' }, (msg) => {
                const payload = msg && (msg.payload || msg);
                applyIncomingChatEvent(payload, 'fanout');
            });
        inboxFanoutChannels.set(id, channel);
        channel.subscribe((status) => {
            console.log('[CHAT] realtime inbox fanout', status);
        });
    }
}
window.bindInboxChatFanouts = bindInboxChatFanouts;

async function publishChatFanout(conversationId, kind, requestId) {
    if (!conversationId || !isUUID(conversationId)) return;
    const supabase = window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase;
    if (!supabase || typeof supabase.channel !== 'function') return;
    const payload = chatFanoutWake(kind, conversationId, requestId || (currentChatContact && currentChatContact.requestId) || null);
    if (payload.row || payload.content || payload.new) return;
    try {
        await ensureRealtimeAuth(supabase);
        await bindChatFanout(conversationId);
        await waitFanoutSubscribed(conversationId, 4000);
        const channel = (chatFanout.conversationId === conversationId && chatFanout.channel) ? chatFanout.channel : null;
        if (!channel) return;
        let sent;
        if (chatFanout.subscribed && typeof channel.send === 'function') {
            sent = await channel.send({ type: 'broadcast', event: 'lyann-chat', payload });
        }
        if (sent !== 'ok' && typeof channel.httpSend === 'function') {
            sent = await channel.httpSend('lyann-chat', payload);
        } else if (sent !== 'ok' && typeof channel.send === 'function') {
            sent = await channel.send({ type: 'broadcast', event: 'lyann-chat', payload });
        }
        console.log('[CHAT] realtime fanout send', sent);
    } catch (_) {}
}

function applyFanoutWake(payload) {
    const convId = payload && payload.conversationId ? String(payload.conversationId) : '';
    console.log('[CHAT] realtime fanout recv');
    if (!conversationAllowedForFanout(convId)) return;
    console.log('[CHAT] realtime insert');
    window.LYANN_MESSAGING_REPOSITORY?.invalidateMessages?.(convId);
    const openHere = openConversationIsVisible()
        && currentChatContact
        && String(currentChatContact.conversationId || '') === convId;
    if (openHere) {
        scheduleCatchUpBurst(payload.kind === 'deal' ? 'fanout-deal' : 'fanout-wake');
        if (payload.kind === 'deal') {
            void (async () => {
                if (typeof loadPairDossiers === 'function') await loadPairDossiers(currentChatContact);
                paintPendingActionBanner();
                const fanoutRequestId = payload.requestId ? String(payload.requestId) : '';
                const openRequestId = currentChatContact.requestId ? String(currentChatContact.requestId) : '';
                if (fanoutRequestId && openRequestId && fanoutRequestId !== openRequestId) {
                    if (Array.isArray(currentChatContact.dossiers)) {
                        currentChatContact.dossiers.forEach((row) => {
                            if (String(row.requestId) === fanoutRequestId) row.stale = true;
                        });
                    }
                    if (typeof paintThreadBusinessBanner === 'function') paintThreadBusinessBanner();
                    return;
                }
                if (!openRequestId && currentChatContact.missionAmbiguous) {
                    if (typeof paintThreadBusinessBanner === 'function') paintThreadBusinessBanner();
                    return;
                }
                void refreshDealContext('fanout');
            })();
        }
        return;
    }
    const userId = typeof getMyId === 'function' ? getMyId() : null;
    if (userId) {
        const noted = window.LYANN_MESSAGING_REPOSITORY?.noteIncomingPreview?.(userId, convId, 'Nouveau message', new Date().toISOString(), { unread: true });
        publishChatActivity({
            contactId: noted && noted.contactId ? noted.contactId : null,
            conversationId: convId,
            preview: (noted && noted.preview) || 'Nouveau message',
            unread: true,
            unreadCount: noted && noted.unreadCount ? noted.unreadCount : 1,
            lastMessageAt: new Date().toISOString(),
            name: noted && noted.name ? noted.name : '',
            avatar: noted && noted.avatar ? noted.avatar : ''
        });
    }
    if (typeof window.bumpMessageBadge === 'function') window.bumpMessageBadge();
    else if (typeof window.paintMessageBadge === 'function') window.paintMessageBadge(1);
    if (typeof window.refreshMessageBadge === 'function') window.refreshMessageBadge(userId);
}

function applyIncomingChatEvent(payload, source) {
    if (!payload) return;
    if (source === 'fanout') {
        applyFanoutWake({
            kind: payload.kind === 'deal' ? 'deal' : 'wake',
            conversationId: payload.conversationId || (payload.row && payload.row.conversation_id) || '',
            requestId: payload.requestId || ''
        });
        return;
    }
    const kind = payload.kind || (payload.row ? 'message' : '');
    if (kind === 'deal' || kind === 'wake') {
        applyFanoutWake({ kind: kind === 'deal' ? 'deal' : 'wake', conversationId: payload.conversationId, requestId: payload.requestId || '' });
        return;
    }
    const row = payload.row || payload.new || null;
    if (!row || !row.conversation_id) return;
    applyIncomingMessageRow(row, source);
}

function applyIncomingMessageRow(row, source) {
    if (!row) return;
    console.log('[CHAT] realtime insert');
    const userId = getMyId();
    const convId = row.conversation_id;
    const openHere = openConversationIsVisible() && incomingBelongsToOpenChat(row, currentChatContact, userId);
    if (openHere) {
        if (convId && currentChatContact && !currentChatContact.conversationId) {
            currentChatContact.conversationId = convId;
        }
        window.LYANN_DATA_CACHE?.invalidate?.('chat-messages', convId);
        window.LYANN_MESSAGING_REPOSITORY?.ingestIncomingMessage?.(userId, currentChatContact.id, convId, row);
        const placed = placeLiveMessage(row, { stickToBottom: true });
        if (placed === 'reconciled') console.log('[CHAT] reconciled');
        if (placed === 'skipped' || placed === 'parked') void catchUpOpenThread('realtime-miss');
        if (placed === 'appended') lastVisibleCatchupAt = Date.now();
        const wake = dealContextSyncApi && typeof dealContextSyncApi.isDealWakeMessage === 'function'
            ? dealContextSyncApi.isDealWakeMessage(row, window.LYANN_QUOTE_PAYMENT && window.LYANN_QUOTE_PAYMENT.isDealTimeline)
            : (window.LYANN_QUOTE_PAYMENT && window.LYANN_QUOTE_PAYMENT.isDealTimeline
                && window.LYANN_QUOTE_PAYMENT.isDealTimeline(row.message_type || ''));
        if (wake) void refreshDealContext(source === 'fanout' ? 'fanout' : 'realtime');
        if (typeof paintThreadBusinessBanner === 'function') paintThreadBusinessBanner();
    } else if (userId) {
        window.LYANN_MESSAGING_REPOSITORY?.invalidateMessages?.(convId);
    }
    void noteChatPreview(userId, row, openHere ? currentChatContact.id : null);
    if (row.sender_id && row.sender_id !== userId) {
        if (openHere && window.LYANN_MESSAGING_REPOSITORY?.markConversationRead && currentChatContact?.id) {
            window.LYANN_MESSAGING_REPOSITORY.markConversationRead(userId, currentChatContact.id).catch(() => {});
        } else if (typeof window.refreshMessageBadge === 'function') {
            if (typeof window.bumpMessageBadge === 'function') window.bumpMessageBadge();
            window.refreshMessageBadge(userId);
        }
    }
}

function incomingBelongsToOpenChat(row, contact, userId) {
    if (!row || !contact) return false;
    const conversationId = row.conversation_id ? String(row.conversation_id) : '';
    const openConversationId = contact.conversationId ? String(contact.conversationId) : '';
    if (openConversationId && conversationId) return openConversationId === conversationId;
    const senderId = row.sender_id ? String(row.sender_id) : '';
    const contactId = contact.id ? String(contact.id) : '';
    const me = userId ? String(userId) : '';
    if (senderId && contactId && senderId === contactId) return true;
    return Boolean(senderId && me && senderId === me && (!openConversationId || !conversationId || openConversationId === conversationId));
}

function openConversationIsVisible() {
    if (typeof document === 'undefined' || document.visibilityState === 'hidden') return false;
    if (!currentChatContact || typeof isUUID !== 'function' || !isUUID(currentChatContact.id)) return false;
    const bodyOpen = document.body && (
        document.body.classList.contains('lyann-messaging-open')
        || document.body.classList.contains('in-chat-active')
        || document.body.classList.contains('chat-conversation-open')
    );
    const modal = document.getElementById('chatModal');
    const modalOpen = !!(modal && (modal.classList.contains('active') || modal.style.display === 'flex'));
    if (!bodyOpen && !modalOpen) return false;
    const layout = document.querySelector('#chatModal .chat-modal-layout');
    if (!layout) return true;
    return layout.classList.contains('has-active-conversation') || layout.classList.contains('mobile-conversation-active');
}

async function reconnectRealtimeSocket(supabase) {
    if (!supabase || !supabase.realtime) return;
    const rt = supabase.realtime;
    const connected = typeof rt.isConnected === 'function' ? rt.isConnected() : false;
    if (connected) return;
    try {
        if (typeof rt.disconnect === 'function') rt.disconnect();
    } catch (_) {}
    try {
        const sessionResult = await supabase.auth.getSession();
        const token = (sessionResult && sessionResult.data && sessionResult.data.session && sessionResult.data.session.access_token) || '';
        if (token && typeof rt.setAuth === 'function') {
            await rt.setAuth(token);
        }
        if (typeof rt.connect === 'function') rt.connect();
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline) {
            if (typeof rt.isConnected === 'function' && rt.isConnected()) return;
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    } catch (_) {}
}

async function forceChatRealtimeResubscribe(reason) {
    if (chatRealtimeRecyclePromise) return chatRealtimeRecyclePromise;
    if (lastChatRealtimeRecycleAt && Date.now() - lastChatRealtimeRecycleAt < 2000) return;
    lastChatRealtimeRecycleAt = Date.now();
    const supabase = window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase;
    if (!supabase || !getMyId()) return;
    chatRealtimeRecyclePromise = (async () => {
        realtimeDropped = true;
        chatSubscription = null;
        if (chatRealtimeSlot) {
            await chatRealtimeSlot.release((channel) => (
                typeof supabase.removeChannel === 'function' ? supabase.removeChannel(channel) : null
            ), { keepAttempt: true });
        }
        await reconnectRealtimeSocket(supabase);
        if (!getMyId()) return;
        console.log('[CHAT] realtime recycle', reason || '');
        setupRealtime();
        const convId = currentChatContact && currentChatContact.conversationId;
        if (!convId) return;
        const socketDown = supabase.realtime && typeof supabase.realtime.isConnected === 'function'
            && !supabase.realtime.isConnected();
        const fanoutLive = chatFanout.channel
            && chatFanout.subscribed
            && String(chatFanout.conversationId) === String(convId);
        if (reason === 'online' || reason === 'foreground' || socketDown || !fanoutLive) {
            await unbindChatFanout();
            void bindChatFanout(convId);
        } else {
            scheduleCatchUpBurst('recycle');
        }
    })().finally(() => { chatRealtimeRecyclePromise = null; });
    return chatRealtimeRecyclePromise;
}

function setupRealtime() {
    if (!window.LYANN_API_CLIENT || !window.LYANN_API_CLIENT.supabase) return;
    if (chatSubscription && !realtimeDropped) return;
    const supabase = window.LYANN_API_CLIENT.supabase;
    if (chatSubscription) {
        const stale = chatSubscription;
        chatSubscription = null;
        if (typeof supabase.removeChannel === 'function') {
            Promise.resolve(supabase.removeChannel(stale)).catch(() => {});
        }
    }
    const generation = ++chatRealtimeGeneration;

    const channel = supabase.channel('lyann-messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            applyIncomingChatEvent({ kind: 'message', row: payload && payload.new }, 'postgres');
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
            const row = payload?.new;
            if (!row || row.is_read !== true || !row.id) return;
            const userId = getMyId();
            if (row.sender_id !== userId) {
                const listed = window.LYANN_MESSAGING_REPOSITORY?.peekConversations?.(userId) || [];
                listed.forEach((item) => {
                    if (item.conversationId === row.conversation_id) item.unread = false;
                });
                window.dispatchEvent(new CustomEvent('lyann:chat-read', { detail: { conversationId: row.conversation_id, userId } }));
                if (!readBadgeQueued && typeof window.refreshMessageBadge === 'function') {
                    readBadgeQueued = true;
                    const badgeUser = userId;
                    queueMicrotask(() => {
                        readBadgeQueued = false;
                        window.refreshMessageBadge(badgeUser);
                    });
                }
                return;
            }
            if (!currentChatContact) return;
            if (currentChatContact.conversationId && row.conversation_id !== currentChatContact.conversationId) return;
            if (!markOwnBubbleRead(row.id)) return;
            if (readReceiptLogQueued) return;
            readReceiptLogQueued = true;
            queueMicrotask(() => {
                readReceiptLogQueued = false;
                console.log('[CHAT] realtime update read');
            });
        });
    chatSubscription = channel;
    if (chatRealtimeSlot) chatRealtimeSlot.hold(channel);
    const join = async () => {
        let token = '';
        try {
            const sessionResult = await supabase.auth.getSession();
            token = (sessionResult && sessionResult.data && sessionResult.data.session && sessionResult.data.session.access_token) || '';
            if (token && supabase.realtime && typeof supabase.realtime.setAuth === 'function') {
                await supabase.realtime.setAuth(token);
            }
        } catch (_) {}
        if (generation !== chatRealtimeGeneration || chatSubscription !== channel) return;
        if (token) chatRealtimeAuthed = true;
        channel.subscribe((status) => {
            console.log('[CHAT] realtime status', status, generation, chatRealtimeGeneration);
            if (generation !== chatRealtimeGeneration) return;
            if (chatRealtimeSlot && chatRealtimeSlot.current() !== channel) return;
            if (status === 'SUBSCRIBED') {
                const recover = realtimeDropped;
                realtimeDropped = false;
                realtimeEverConnected = true;
                if (chatRealtimeSlot) chatRealtimeSlot.markHealthy();
                if (recover) console.log('[CHAT] realtime reconnected');
                catchUpOpenThread(recover ? 'reconnect' : 'subscribe');
                if (openConversationIsVisible()) {
                    void refreshDealContext(recover ? 'reconnect' : 'subscribe');
                }
                if (recover && typeof window.refreshMessageBadge === 'function') window.refreshMessageBadge(getMyId());
            } else             if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                realtimeDropped = true;
                scheduleCatchUpBurst('postgres-dropped');
                if (!chatRealtimeSlot) return;
                chatRealtimeSlot.scheduleRetry(async () => {
                    if (generation !== chatRealtimeGeneration) return;
                    if (chatRealtimeSlot.current() !== channel) return;
                    chatSubscription = null;
                    chatRealtimeGeneration += 1;
                    const nextGen = chatRealtimeGeneration;
                    chatRealtimeSlot.hold(null);
                    if (typeof supabase.removeChannel === 'function') {
                        try { await supabase.removeChannel(channel); } catch (_) {}
                    }
                    if (chatRealtimeGeneration !== nextGen) return;
                    if (!getMyId()) return;
                    setupRealtime();
                });
            }
        });
    };
    join();
}

function watchChatAuthForRealtime() {
    if (chatAuthWatchInstalled) return;
    const supabase = window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase;
    if (!supabase || !supabase.auth || typeof supabase.auth.onAuthStateChange !== 'function') return;
    chatAuthWatchInstalled = true;
    supabase.auth.onAuthStateChange((event, session) => {
        const nextId = session && session.user && session.user.id;
        if (event === 'SIGNED_OUT' || !nextId) {
            const stale = chatSubscription;
            chatSubscription = null;
            chatRealtimeAuthed = false;
            void unbindChatFanout();
            realtimeDropped = false;
            chatRealtimeGeneration += 1;
            if (chatRealtimeSlot) {
                void chatRealtimeSlot.release((channel) => (
                    typeof supabase.removeChannel === 'function' ? supabase.removeChannel(channel) : null
                ));
            } else if (stale && typeof supabase.removeChannel === 'function') {
                Promise.resolve(supabase.removeChannel(stale)).catch(() => {});
            }
            window.LYANN_MESSAGING_REPOSITORY?.releaseWarmCache?.();
            const box = document.getElementById('chatMessagesContainer');
            if (box) box.innerHTML = '';
            return;
        }
        if (event !== 'SIGNED_IN' || !session.access_token) return;
        if (chatRealtimeAuthed && chatSubscription) return;
        const stale = chatSubscription;
        chatSubscription = null;
        chatRealtimeGeneration += 1;
        if (chatRealtimeSlot) {
            chatRealtimeSlot.cancelRetry();
            chatRealtimeSlot.hold(null);
        }
        const switchGen = chatRealtimeGeneration;
        const openNext = async () => {
            if (stale && typeof supabase.removeChannel === 'function') {
                try { await supabase.removeChannel(stale); } catch (_) {}
            }
            if (chatRealtimeGeneration !== switchGen) return;
            if (!getMyId()) return;
            window.LYANN_MESSAGING_REPOSITORY?.releaseWarmCache?.();
            setupRealtime();
            const convId = currentChatContact && currentChatContact.conversationId;
            if (convId) void bindChatFanout(convId);
        };
        void openNext();
        return;
    });
}

if (window.LYANN_AUTH_STATE?.getSnapshot?.().status === 'ready') setupRealtime();
else window.addEventListener('lyann:auth-ready', setupRealtime, { once: true });
watchChatAuthForRealtime();
window.addEventListener('lyann:chat-persisted', (event) => {
    const row = event && event.detail;
    if (!row || !row.conversation_id) return;
    void publishChatFanout(row.conversation_id, 'wake');
});
window.addEventListener('lyann:deal-mutated', () => {
    const conversationId = currentChatContact && currentChatContact.conversationId;
    if (!conversationId) return;
    void publishChatFanout(conversationId, 'deal', currentChatContact && currentChatContact.requestId);
    if (openConversationIsVisible()) {
        void (async () => {
            await loadPairDossiers(currentChatContact);
            paintPendingActionBanner();
            if (window.LYANN_MISSION_SURFACES && typeof window.LYANN_MISSION_SURFACES.syncOpenDossier === 'function') {
                const active = currentChatContact && currentChatContact.activeDossier;
                window.LYANN_MISSION_SURFACES.syncOpenDossier(active && active.quotes);
            }
            void catchUpOpenThread('deal-mutated');
            void refreshDealContext('deal-mutated');
        })();
    }
});
setInterval(() => {
    if (chatRefreshInFlight || !openConversationIsVisible()) return;
    const pace = window.LYANN_REALTIME_SESSION || {};
    const droppedGap = pace.DROPPED_CATCHUP_MS || 8000;
    const healthyGap = pace.HEALTHY_CATCHUP_MS || 30000;
    const gap = realtimeDropped ? droppedGap : Math.min(healthyGap, 4000);
    const now = Date.now();
    if (now - lastVisibleCatchupAt < gap) return;
    lastVisibleCatchupAt = now;
    catchUpOpenThread('visible');
}, 2000);
// E4 fallback: light deal re-read only while Realtime is down and the thread is focused.
const dealFallbackMs = (dealContextSyncApi && dealContextSyncApi.FALLBACK_INTERVAL_MS) || 12000;
setInterval(() => {
    if (!realtimeDropped || !openConversationIsVisible()) return;
    void refreshDealContext('fallback');
}, dealFallbackMs);
function resumeChatRealtime(reason) {
    catchUpOpenThread(reason);
    if (reason === 'foreground' && openConversationIsVisible()) void refreshDealContext('foreground');
    if (!getMyId() || !realtimeDropped) return;
    if (chatRealtimeSlot && chatRealtimeSlot.hasRetry()) return;
    void forceChatRealtimeResubscribe(reason);
}
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    resumeChatRealtime('foreground');
});
(function watchNativeAppForegroundForDealSync() {
    const app = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (!app || typeof app.addListener !== 'function') return;
    app.addListener('appStateChange', (state) => {
        if (!state || !state.isActive) return;
        resumeChatRealtime('foreground');
    });
})();
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const photoViewerModal = document.getElementById('chatPhotoViewerModal');
    if (photoViewerModal && photoViewerModal.style.display !== 'none') photoViewerModal.style.display = 'none';
});
window.addEventListener('online', () => {
    const wasDropped = realtimeDropped;
    catchUpPromise = null;
    flushOrphanAttachments();
    scheduleCatchUpBurst('reconnect');
    if (openConversationIsVisible()) void refreshDealContext('online');
    if (typeof window.refreshMessageBadge === 'function') window.refreshMessageBadge(getMyId());
    if (wasDropped) void forceChatRealtimeResubscribe('online');
    setTimeout(() => { void catchUpOpenThread('reconnect'); }, 700);
});
window.addEventListener('offline', () => {
    realtimeDropped = true;
    catchUpPromise = null;
    outgoingSends.forEach((job) => {
        if (!job?.abortController || job.cancelled) return;
        job.droppedOffline = true;
        job.abortController.abort();
    });
});

// =============================================================================
// LYANN STEP 19 — ESPACE MISSION UI & JALONS CONTROLLER
// =============================================================================
window.openMissionDetailsModal = async function(missionId) {
    if (!missionId) return;
    const modal = document.getElementById('missionDetailsModal');
    if (!modal) return;

    modal.style.display = 'flex';

    const titleEl = document.getElementById('missionModalTitle');
    const badgeEl = document.getElementById('missionModalStatusBadge');
    const amountEl = document.getElementById('missionModalTotalAmount');
    const textEl = document.getElementById('missionModalProgressionText');
    const barEl = document.getElementById('missionModalProgressBar');
    const startPane = document.getElementById('missionStartActionPane');
    const listEl = document.getElementById('missionModalMilestonesList');

    if (listEl) listEl.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding:16px;">Chargement des jalons...</p>';

    if (!window.LYANN_API_CLIENT || typeof window.LYANN_API_CLIENT.getMissionDetailsSecure !== 'function') {
        if (listEl) listEl.innerHTML = '<p style="font-size:0.85rem; color:red;">Client API indisponible</p>';
        return;
    }

    const res = await window.LYANN_API_CLIENT.getMissionDetailsSecure(missionId);
    if (res.error || !res.data) {
        if (listEl) listEl.innerHTML = `<p style="font-size:0.85rem; color:red;">${res.error?.message || 'Erreur de chargement'}</p>`;
        return;
    }

    const { user_role, mission, milestones, stats } = res.data;

    if (titleEl) titleEl.textContent = mission.title || 'Mission LYANN';
    if (badgeEl) {
        badgeEl.textContent = mission.status === 'AGREED' ? 'ACCORD CONCLU' :
                              mission.status === 'IN_PROGRESS' ? 'EN COURS' :
                              mission.status === 'COMPLETED' ? 'TERMINÉE' : mission.status;
    }
    if (amountEl) amountEl.textContent = `${mission.total_amount || 0} €`;

    const total = stats.total || 0;
    const validated = stats.validated || 0;
    const percent = total > 0 ? Math.round((validated / total) * 100) : 0;

    if (textEl) textEl.textContent = `${validated} / ${total} validés`;
    if (barEl) barEl.style.width = `${percent}%`;

    // Start Mission Button (Helper + AGREED)
    if (startPane) {
        if (user_role === 'HELPER' && mission.status === 'AGREED') {
            startPane.style.display = 'block';
            const btnStart = document.getElementById('btnStartMissionAction');
            if (btnStart) {
                btnStart.onclick = async () => {
                    const startRes = await window.LYANN_API_CLIENT.startMissionSecure(missionId);
                    if (startRes.error) {
                        alert('⚠️ ' + startRes.error.message);
                    } else {
                        window.openMissionDetailsModal(missionId);
                    }
                };
            }
        } else {
            startPane.style.display = 'none';
        }
    }

    // Milestones Render
    if (listEl) {
        if (!milestones || milestones.length === 0) {
            listEl.innerHTML = '<p style="font-size:0.85rem; color:var(--text-muted); text-align:center;">Aucun jalon configuré sur ce devis.</p>';
            return;
        }

        listEl.innerHTML = milestones.map((m, idx) => {
            const isDone = m.status === 'COMPLETED' || m.status === 'VALIDATED' || m.status === 'RELEASED';
            const isValidated = m.status === 'VALIDATED' || m.status === 'RELEASED';

            let actionBtnHtml = '';
            if (user_role === 'HELPER' && (m.status === 'PENDING' || m.status === 'IN_PROGRESS')) {
                actionBtnHtml = `<button type="button" class="btn btn-outline" onclick="window.handleMarkMilestoneDone('${m.id}', '${missionId}')" style="font-size:0.8rem; padding:4px 10px; font-weight:700;"><i class="ph ph-check"></i> Marquer comme effectué</button>`;
            } else if (user_role === 'REQUESTER' && m.status === 'COMPLETED') {
                actionBtnHtml = `<button type="button" class="btn btn-primary" onclick="window.handleValidateMilestone('${m.id}', '${missionId}')" style="font-size:0.8rem; padding:4px 10px; font-weight:700; background:#10B981; border:none;"><i class="ph ph-check-circle"></i> Valider le travail</button>`;
            } else if (isValidated) {
                actionBtnHtml = `<span style="font-size:0.8rem; font-weight:800; color:#10B981;"><i class="ph ph-check-fat"></i> Validé ✔</span>`;
            } else if (isDone) {
                actionBtnHtml = `<span style="font-size:0.8rem; font-weight:700; color:#F59E0B;"><i class="ph ph-clock"></i> À valider par le client</span>`;
            } else {
                actionBtnHtml = `<span style="font-size:0.8rem; color:var(--text-muted);">À venir</span>`;
            }

            return `
                <div style="background:white; border:1px solid var(--border); border-radius:14px; padding:14px 16px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                    <div>
                        <div style="font-size:0.9rem; font-weight:800; color:#1F3827;">${idx + 1}. ${m.title}</div>
                        ${m.description ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">${m.description}</div>` : ''}
                        <div style="font-size:0.85rem; font-weight:700; color:#059669; margin-top:4px;">${m.amount} €</div>
                    </div>
                    <div>
                        ${actionBtnHtml}
                    </div>
                </div>
            `;
        }).join('');
    }
};

window.handleMarkMilestoneDone = async function(milestoneId, missionId) {
    if (!await window.LYANN_ROUTER.requireAuthForInteraction('missionAction', { missionId, milestoneId, contactId: currentChatContact?.id })) return;
    if (!milestoneId) return;
    if (dealMutationGuard && dealMutationGuard.isBusy('done', milestoneId)) return;
    try {
        await runDealMutation('done', milestoneId, {
            execute: async (handle) => {
                if (dealMutationGuard && !dealMutationGuard.shouldApply(handle)) {
                    const stale = new Error('__deal_mutation_stale__');
                    stale.dealMutationStale = true;
                    throw stale;
                }
                const res = await window.LYANN_API_CLIENT.markMilestoneDoneSecure(milestoneId);
                if (res && res.error) throw res.error;
                return res;
            },
            apply: async () => {
                window.openMissionDetailsModal(missionId);
            }
        });
    } catch (err) {
        if (err && (err.dealMutationStale || err.message === '__deal_mutation_stale__')) return;
        alert('⚠️ ' + (err && err.message ? err.message : 'Action indisponible'));
    }
};

window.handleValidateMilestone = async function(milestoneId, missionId) {
    if (!await window.LYANN_ROUTER.requireAuthForInteraction('missionAction', { missionId, milestoneId, contactId: currentChatContact?.id })) return;
    if (!milestoneId) return;
    if (dealMutationGuard && dealMutationGuard.isBusy('confirm', milestoneId)) return;
    try {
        await runDealMutation('confirm', milestoneId, {
            execute: async (handle) => {
                if (dealMutationGuard && !dealMutationGuard.shouldApply(handle)) {
                    const stale = new Error('__deal_mutation_stale__');
                    stale.dealMutationStale = true;
                    throw stale;
                }
                const res = await window.LYANN_API_CLIENT.validateMilestoneSecure(milestoneId);
                if (res && res.error) throw res.error;
                return res;
            },
            apply: async () => {
                window.openMissionDetailsModal(missionId);
            }
        });
    } catch (err) {
        if (err && (err.dealMutationStale || err.message === '__deal_mutation_stale__')) return;
        alert('⚠️ ' + (err && err.message ? err.message : 'Action indisponible'));
    }
};

