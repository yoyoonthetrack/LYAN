// LYANN chat surface stack manager
// Keeps proposal flows above contextual cards and child surfaces above the chat.
(function () {
    'use strict';

    const PROPOSAL_OVERLAY_IDS = [
        'chatActionChoicesOverlay',
        'chatDirectPriceForm',
        'chatMilestoneDevisForm'
    ];

    function getContextNodes() {
        return [
            document.getElementById('chatMissionContextBar'),
            document.getElementById('chatViewMissionBtn'),
            document.getElementById('chatContextualActionsBar')
        ].filter(Boolean);
    }

    function setProposalMode(active) {
        getContextNodes().forEach((node) => {
            if (active) {
                if (!node.dataset.lyannPreviousDisplay) {
                    node.dataset.lyannPreviousDisplay = node.style.display || '';
                }
                node.style.setProperty('display', 'none', 'important');
                node.setAttribute('aria-hidden', 'true');
            } else {
                const previous = node.dataset.lyannPreviousDisplay;
                node.style.removeProperty('display');
                if (previous) node.style.display = previous;
                delete node.dataset.lyannPreviousDisplay;
                node.removeAttribute('aria-hidden');
            }
        });
    }

    function isVisible(el) {
        if (!el) return false;
        return el.style.display !== 'none' && getComputedStyle(el).display !== 'none';
    }

    function syncProposalMode() {
        const active = PROPOSAL_OVERLAY_IDS.some((id) => isVisible(document.getElementById(id)));
        setProposalMode(active);
    }

    function promoteChatChildren() {
        const chat = document.getElementById('chatModal');
        if (!chat || !chat.classList.contains('active')) return;
        ['lyannDetailModal', 'publicMemberProfileModal', 'quickProfileModal'].forEach((id) => {
            const child = document.getElementById(id);
            if (!child) return;
            child.style.setProperty('z-index', '100002', 'important');
        });
    }

    function installManualDirectPriceValidation() {
        const form = document.getElementById('directPriceForm');
        if (!form || form.dataset.lyannValidationBound === 'true') return;
        form.dataset.lyannValidationBound = 'true';
        form.noValidate = true;

        form.addEventListener('submit', (event) => {
            const desc = document.getElementById('dpDescription');
            const amount = document.getElementById('dpAmount');
            const missing = !desc || !desc.value.trim() ? desc : (!amount || !amount.value ? amount : null);
            if (!missing) return;

            event.preventDefault();
            event.stopImmediatePropagation();
            if (missing) {
                missing.focus();
                missing.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
            const message = missing === desc
                ? 'Ajoute une description de la prestation avant d’envoyer l’offre.'
                : 'Indique le montant proposé avant d’envoyer l’offre.';
            if (typeof window.showToast === 'function') window.showToast(message, 'error');
            else if (typeof window.lyannAlert === 'function') window.lyannAlert(message);
        }, true);
    }

    function boot() {
        const style = document.createElement('style');
        style.id = 'lyann-chat-surface-stack-style';
        style.textContent = `
            #chatModal .chat-overlay-pane { z-index: 80 !important; }
            body.in-chat-active #lyannDetailModal,
            body.in-chat-active #publicMemberProfileModal,
            body.in-chat-active #quickProfileModal { z-index: 100002 !important; }
        `;
        if (!document.getElementById(style.id)) document.head.appendChild(style);

        installManualDirectPriceValidation();
        promoteChatChildren();
        syncProposalMode();

        document.addEventListener('click', (event) => {
            const target = event.target.closest('#btnCtxPropose, #btnChooseDirectPrice, #btnChooseMilestoneDevis, .close-overlay-btn, #btnViewLyannFromChat');
            if (!target) return;

            if (target.matches('#btnCtxPropose, #btnChooseDirectPrice, #btnChooseMilestoneDevis')) {
                queueMicrotask(() => {
                    setProposalMode(true);
                    installManualDirectPriceValidation();
                });
                return;
            }

            if (target.id === 'btnViewLyannFromChat') {
                queueMicrotask(promoteChatChildren);
                setTimeout(promoteChatChildren, 0);
                return;
            }

            queueMicrotask(syncProposalMode);
        }, true);

        document.addEventListener('submit', (event) => {
            if (event.target && event.target.id === 'directPriceForm') {
                queueMicrotask(syncProposalMode);
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();

    window.LYANN_CHAT_SURFACE_STACK = {
        sync: syncProposalMode,
        promoteChildren: promoteChatChildren,
        setProposalMode
    };
})();
