// LYANN — member-owned stored card management (masked metadata only).
(function () {
    'use strict';

    function boot() {
        const output = document.getElementById('lyannSavedCardsList');
        const section = document.getElementById('lyannSavedCardsSettings');
        if (!output || !section) return;
        let loading = false;

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
            output.replaceChildren();
            const note = document.createElement('p');
            note.style.cssText = 'margin:0;color:var(--text-muted);';
            note.textContent = value;
            output.appendChild(note);
        }

        async function refresh() {
            if (loading) return;
            loading = true;
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
                    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:12px 0;border-bottom:1px solid var(--border);';
                    const info = document.createElement('span');
                    const brand = String(card.brand || 'Carte').replace(/[^a-z0-9 -]/gi, '').slice(0, 20);
                    const pretty = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Carte';
                    const tail = String(card.last4 || '').replace(/\D/g, '').slice(-4);
                    const month = String(card.exp_month || '').padStart(2, '0');
                    info.textContent = pretty + ' •••• ' + tail + ' — exp. ' + month + '/' + card.exp_year;
                    const remove = document.createElement('button');
                    remove.type = 'button';
                    remove.className = 'btn btn-outline';
                    remove.textContent = 'Supprimer';
                    remove.style.color = '#B42318';
                    remove.setAttribute('aria-label', 'Supprimer la carte se terminant par ' + tail);
                    remove.addEventListener('click', async () => {
                        const confirmed = window.confirm('Supprimer la carte se terminant par ' + tail + ' de vos futurs paiements LYANN ?');
                        if (!confirmed) return;
                        remove.disabled = true;
                        try {
                            await request('/v1/payments/saved-cards/' + encodeURIComponent(card.id), 'DELETE');
                            await refresh();
                        } catch (err) {
                            message(err.message || 'Suppression indisponible.');
                        }
                    });
                    row.append(info, remove);
                    output.appendChild(row);
                });
            } catch (err) {
                message(err.message || 'Cartes indisponibles.');
            } finally {
                loading = false;
            }
        }

        const button = document.getElementById('lyannLoadSavedCards');
        if (button) button.addEventListener('click', refresh);
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                if (entries.some((entry) => entry.isIntersecting)) refresh();
            }, { threshold: 0.2 });
            observer.observe(section);
        } else {
            refresh();
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
