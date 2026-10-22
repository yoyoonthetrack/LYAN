'use strict';

(function () {
    const STATUS_LABEL = {
        open: 'Ouvert',
        in_progress: 'En cours',
        waiting: 'En attente',
        resolved: 'Résolu',
        closed: 'Fermé'
    };

    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function client() {
        return window.LYANN_API_CLIENT || window.apiClient || null;
    }

    function root() {
        let el = document.getElementById('lyannHelpdeskRoot');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'lyannHelpdeskRoot';
        el.className = 'lyann-helpdesk-root';
        el.hidden = true;
        document.body.appendChild(el);
        return el;
    }

    function notice(el, message, isError) {
        if (!el) return;
        el.hidden = !message;
        el.textContent = message || '';
        el.classList.toggle('is-error', !!isError);
    }

    async function api(method, path, body) {
        const apiClient = client();
        if (!apiClient || typeof apiClient.memberHelpdeskRequest !== 'function') {
            return { success: false, error: 'Assistance indisponible.' };
        }
        const res = await apiClient.memberHelpdeskRequest(path, { method, body });
        return res.json().catch(() => ({ success: false, error: 'Réponse illisible.' }));
    }

    function renderList(host, payload) {
        const tickets = payload.tickets || [];
        const subjects = payload.subjects || ['Compte', 'Paiement', 'Mission', 'Profil', 'Technique', 'Autre'];
        host.innerHTML = `
            <section class="lyann-helpdesk-sheet" role="dialog" aria-labelledby="lyannHelpdeskTitle">
                <header class="lyann-helpdesk-head">
                    <div>
                        <p class="lyann-helpdesk-kicker">Aide LYANN</p>
                        <h2 id="lyannHelpdeskTitle">On est là.</h2>
                        <p>Décrivez votre souci. L’équipe vous répond dans ce dossier.</p>
                    </div>
                    <button type="button" class="lyann-helpdesk-close" data-helpdesk-close aria-label="Fermer">✕</button>
                </header>
                <p class="lyann-helpdesk-notice" id="lyannHelpdeskNotice" hidden></p>
                <form id="lyannHelpdeskForm" class="lyann-helpdesk-form">
                    <label>Sujet
                        <select name="subject" required>
                            ${subjects.map((item) => `<option value="${esc(item)}">${esc(item)}</option>`).join('')}
                        </select>
                    </label>
                    <label>Votre message
                        <textarea name="body" rows="4" required minlength="8" placeholder="Expliquez ce qui se passe, simplement."></textarea>
                    </label>
                    <button type="submit" class="lyann-helpdesk-primary" id="lyannHelpdeskSend">Envoyer la demande</button>
                </form>
                <h3>Vos dossiers</h3>
                <div id="lyannHelpdeskList">${tickets.length ? tickets.map((row) => `
                    <button type="button" class="lyann-helpdesk-ticket" data-ticket-id="${esc(row.id)}">
                        <strong>${esc(row.subject)}</strong>
                        <span>${esc(row.reference)} · ${esc(STATUS_LABEL[row.status] || row.status)}</span>
                    </button>
                `).join('') : '<p class="lyann-helpdesk-empty">Aucun dossier pour le moment.</p>'}</div>
            </section>
        `;
    }

    function renderDetail(host, payload) {
        const ticket = payload.ticket || {};
        const messages = payload.messages || [];
        host.innerHTML = `
            <section class="lyann-helpdesk-sheet" role="dialog" aria-labelledby="lyannHelpdeskTitle">
                <header class="lyann-helpdesk-head">
                    <div>
                        <button type="button" class="lyann-helpdesk-back" data-helpdesk-back>← Mes dossiers</button>
                        <h2 id="lyannHelpdeskTitle">${esc(ticket.subject || 'Dossier')}</h2>
                        <p>${esc(ticket.reference || '')} · ${esc(STATUS_LABEL[ticket.status] || ticket.status || '')}</p>
                    </div>
                    <button type="button" class="lyann-helpdesk-close" data-helpdesk-close aria-label="Fermer">✕</button>
                </header>
                <p class="lyann-helpdesk-notice" id="lyannHelpdeskNotice" hidden></p>
                <div class="lyann-helpdesk-thread">${messages.length ? messages.map((msg) => `
                    <div class="lyann-helpdesk-msg ${msg.from_team ? 'is-team' : 'is-me'}">
                        <small>${msg.from_team ? 'Équipe LYANN' : 'Vous'}</small>
                        <p>${esc(msg.body)}</p>
                    </div>
                `).join('') : '<p class="lyann-helpdesk-empty">Aucun message pour l’instant.</p>'}</div>
                ${ticket.can_reply ? `
                    <form id="lyannHelpdeskReplyForm" class="lyann-helpdesk-form">
                        <label>Votre réponse
                            <textarea name="body" rows="3" required minlength="2" placeholder="Écrire à l’équipe"></textarea>
                        </label>
                        <button type="submit" class="lyann-helpdesk-primary">Envoyer</button>
                    </form>
                ` : '<p class="lyann-helpdesk-empty">Ce dossier est fermé. L’historique reste ici.</p>'}
            </section>
        `;
    }

    async function showList() {
        const host = root();
        host.hidden = false;
        host.innerHTML = '<section class="lyann-helpdesk-sheet"><p class="lyann-helpdesk-empty">Chargement de vos dossiers…</p></section>';
        const data = await api('GET', '/v1/me/helpdesk');
        if (!data.success) {
            host.innerHTML = `<section class="lyann-helpdesk-sheet"><p class="lyann-helpdesk-notice is-error">${esc(data.error || 'Assistance indisponible.')}</p><button type="button" class="lyann-helpdesk-close" data-helpdesk-close>Fermer</button></section>`;
            return;
        }
        renderList(host, data);
        bindList(host);
    }

    function bindList(host) {
        host.querySelector('[data-helpdesk-close]')?.addEventListener('click', close);
        host.querySelectorAll('[data-ticket-id]').forEach((btn) => {
            btn.addEventListener('click', () => showDetail(btn.getAttribute('data-ticket-id')));
        });
        const form = host.querySelector('#lyannHelpdeskForm');
        form?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const submit = host.querySelector('#lyannHelpdeskSend');
            const body = String(new FormData(form).get('body') || '').trim();
            const subject = String(new FormData(form).get('subject') || '').trim();
            const box = host.querySelector('#lyannHelpdeskNotice');
            if (body.length < 8) {
                notice(box, 'Expliquez un peu plus pour que l’équipe puisse vous aider.', true);
                return;
            }
            if (submit) submit.disabled = true;
            notice(box, 'Envoi en cours…', false);
            const data = await api('POST', '/v1/me/helpdesk', { subject, body });
            if (!data.success || !data.ticket) {
                notice(box, data.error || 'La demande n’a pas été enregistrée.', true);
                if (submit) submit.disabled = false;
                return;
            }
            await showDetail(data.ticket.id);
        });
    }

    async function showDetail(id) {
        const host = root();
        host.hidden = false;
        host.innerHTML = '<section class="lyann-helpdesk-sheet"><p class="lyann-helpdesk-empty">Ouverture du dossier…</p></section>';
        const data = await api('GET', `/v1/me/helpdesk/${id}`);
        if (!data.success) {
            notice(null, data.error, true);
            await showList();
            notice(host.querySelector('#lyannHelpdeskNotice'), data.error || 'Dossier introuvable.', true);
            return;
        }
        renderDetail(host, data);
        host.querySelector('[data-helpdesk-close]')?.addEventListener('click', close);
        host.querySelector('[data-helpdesk-back]')?.addEventListener('click', showList);
        const form = host.querySelector('#lyannHelpdeskReplyForm');
        form?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const submit = form.querySelector('button[type="submit"]');
            const body = String(new FormData(form).get('body') || '').trim();
            const box = host.querySelector('#lyannHelpdeskNotice');
            if (!body) {
                notice(box, 'Écrivez un message avant d’envoyer.', true);
                return;
            }
            if (submit) submit.disabled = true;
            notice(box, 'Envoi en cours…', false);
            const posted = await api('POST', `/v1/me/helpdesk/${id}/messages`, { body });
            if (!posted.success) {
                notice(box, posted.error || 'Message non enregistré.', true);
                if (submit) submit.disabled = false;
                return;
            }
            await showDetail(id);
        });
    }

    function close() {
        const host = document.getElementById('lyannHelpdeskRoot');
        if (host) host.hidden = true;
    }

    function ensureBar() {
        if (document.getElementById('lyannHelpdeskBar')) return;
        const after = document.getElementById('chatContextualActionsBar');
        if (!after || !after.parentNode) return;
        const bar = document.createElement('div');
        bar.id = 'lyannHelpdeskBar';
        bar.className = 'lyann-helpdesk-bar';
        bar.innerHTML = `
            <div>
                <strong>Vos demandes d’aide</strong>
                <span>Suivez un dossier ou écrivez à l’équipe.</span>
            </div>
            <button type="button" class="lyann-helpdesk-primary" id="lyannHelpdeskOpenBtn">Ouvrir</button>
        `;
        after.parentNode.insertBefore(bar, after.nextSibling);
        bar.querySelector('#lyannHelpdeskOpenBtn')?.addEventListener('click', open);
    }

    function syncBar(isSupport) {
        const bar = document.getElementById('lyannHelpdeskBar');
        if (bar) bar.hidden = !isSupport;
        if (isSupport) ensureBar();
        const existing = document.getElementById('lyannHelpdeskBar');
        if (existing) existing.hidden = !isSupport;
    }

    async function open() {
        ensureBar();
        await showList();
    }

    window.LYANN_MEMBER_HELPDESK = { open, close, showDetail, syncBar, ensureBar };
})();
