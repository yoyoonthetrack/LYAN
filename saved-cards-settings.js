// LYANN — member-owned stored card management (masked metadata only).
(function () {
    'use strict';
    document.addEventListener('DOMContentLoaded', () => {
        const button = document.getElementById('lyannLoadSavedCards');
        const output = document.getElementById('lyannSavedCardsList');
        if (!button || !output) return;

        async function request(path, method) {
            const api = window.LYANN_API_CLIENT;
            const session = api && typeof api.getSession === 'function' ? await api.getSession() : null;
            const token = session?.data?.session?.access_token;
            if (!token) throw new Error('Connectez-vous pour gérer vos cartes.');
            const fetcher = window.lyannBackendFetch || fetch;
            const response = await fetcher(path, {
                method: method || 'GET',
                headers: { Authorization: 'Bearer ' + token }
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || 'Service temporairement indisponible.');
            return body;
        }

        function message(value) {
            output.textContent = value;
        }

        async function refresh() {
            button.disabled = true;
            message('Chargement des cartes enregistrées…');
            try {
                const data = await request('/v1/payments/saved-cards', 'GET');
                output.replaceChildren();
                const cards = Array.isArray(data.cards) ? data.cards : [];
                if (!cards.length) {
                    message('Aucune carte enregistrée pour le moment.');
                    return;
                }
                cards.forEach((card) => {
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);';
                    const info = document.createElement('span');
                    const brand = String(card.brand || 'Carte').replace(/[^a-z0-9 -]/gi, '').slice(0, 20);
                    const tail = String(card.last4 || '').replace(/[^0-9]/g, '').slice(-4);
                    info.textContent = brand.toUpperCase() + ' •••• ' + tail + ' — exp. ' + card.exp_month + '/' + card.exp_year;
                    const remove = document.createElement('button');
                    remove.type = 'button';
                    remove.className = 'btn btn-outline';
                    remove.textContent = 'Supprimer';
                    remove.setAttribute('aria-label', 'Supprimer la carte se terminant par ' + tail);
                    remove.addEventListener('click', async () => {
                        if (!window.confirm('Supprimer cette carte de vos futurs paiements LYANN ?')) return;
                        remove.disabled = true;
                        try {
                            await request('/v1/payments/saved-cards/' + encodeURIComponent(card.id), 'DELETE');
                            await refresh();
                        } catch (err) {
                            message(err.message || 'Suppression indisponible.');
                            remove.disabled = false;
                        }
                    });
                    row.append(info, remove);
                    output.appendChild(row);
                });
            } catch (err) {
                message(err.message || 'Cartes indisponibles.');
            } finally {
                button.disabled = false;
            }
        }
        button.addEventListener('click', refresh);
    });
})();
