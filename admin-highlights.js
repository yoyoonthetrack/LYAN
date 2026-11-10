/* LYANN — back-office « À la une près de chez vous ».
 * Toutes les écritures passent par /v1/admin/editorial/highlights* (droits vérifiés côté serveur, audit, image contrôlée).
 * Aucune donnée de démonstration n'est jamais présentée comme une vraie actualité. */
(function () {
    'use strict';
    const view = window.LYANN_HIGHLIGHTS;
    const $ = (id) => document.getElementById(id);
    const STATE_LABEL = { draft: 'Brouillon', published: 'Publiée', archived: 'Archivée', live: 'En ligne', scheduled: 'Planifiée', expired: 'Terminée' };
    const THEME_LABEL = { rentree: 'Rentrée', toussaint: 'Toussaint', noel: 'Noël', carnaval: 'Carnaval', careme: 'Carême / sécheresse', paques: 'Pâques', vacances: 'Grandes vacances', saison: 'Saison', autre: 'Autre' };
    const TARGET_LABEL = {
        lyanneurs: 'Lyanneurs (tous)', lyanneurs_category: 'Lyanneurs : une catégorie',
        annonces: 'Annonces (liste)', annonces_category: 'Annonces : une catégorie', annonces_map: 'Annonces : carte'
    };
    let rows = [];
    let editingId = null;
    let imageUrl = null;

    const say = (text, bad) => { const n = $('hlNotice'); if (n) { n.textContent = text || ''; n.style.color = bad ? '#B3261E' : '#1F5A3D'; } };
    const toLocalInput = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);

    async function api(path, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (options.body) headers['Content-Type'] = 'application/json';
        const response = await window.fetchWithAdminAuth(`/v1/admin/editorial/highlights${path}`, { ...options, headers });
        let json = null;
        try { json = await response.json(); } catch (_) { json = null; }
        if (!response.ok || !json || json.success === false) {
            const error = new Error((json && json.error) || 'Action impossible.');
            error.field = json && json.field;
            throw error;
        }
        return json;
    }

    function formValue() {
        const target = $('hlTarget').value;
        return {
            title: $('hlTitle').value, teaser: $('hlTeaser').value, label: $('hlLabel').value,
            image_url: imageUrl, image_alt: $('hlAlt').value,
            territory: $('hlTerritory').value, theme: $('hlTheme').value || null,
            cta_target: target, cta_value: /_category$/.test(target) ? $('hlCategory').value : null,
            starts_at: fromLocalInput($('hlStart').value), ends_at: fromLocalInput($('hlEnd').value),
            priority: $('hlPriority').value, status: $('hlStatus').value
        };
    }

    function renderPreview() {
        const host = $('hlPreview');
        if (!host) return;
        const v = formValue();
        const hasText = v.title.trim() && v.teaser.trim();
        host.innerHTML = hasText ? `<div class="lyann-highlight-rail is-few" style="margin:0;padding:0;">${view.renderCard({ ...v, id: 'preview' }, { asLink: false })}</div>` : '<p class="admin-page-sub">Saisissez un titre et une accroche pour voir l’aperçu.</p>';
        $('hlCategoryRow').hidden = !/_category$/.test($('hlTarget').value);
    }

    function resetForm(row) {
        editingId = row ? row.id : null;
        imageUrl = row ? row.image_url : null;
        $('hlFormTitle').textContent = row ? 'Modifier la carte' : 'Nouvelle carte';
        $('hlTitle').value = row ? row.title : '';
        $('hlTeaser').value = row ? row.teaser : '';
        $('hlLabel').value = row ? row.label || '' : '';
        $('hlAlt').value = row ? row.image_alt || '' : '';
        $('hlTerritory').value = row ? row.territory : 'all';
        $('hlTheme').value = row ? row.theme || '' : '';
        $('hlTarget').value = row ? row.cta_target : 'lyanneurs';
        $('hlCategory').value = row ? row.cta_value || '' : '';
        $('hlStart').value = row ? toLocalInput(row.starts_at) : '';
        $('hlEnd').value = row ? toLocalInput(row.ends_at) : '';
        $('hlPriority').value = row ? row.priority : 100;
        $('hlStatus').value = row ? row.status : 'draft';
        $('hlFile').value = '';
        $('hlImageInfo').textContent = imageUrl ? 'Image enregistrée.' : 'Aucune image. JPEG, PNG ou WebP, 1 Mo maximum.';
        $('hlForm').hidden = false;
        renderPreview();
        $('hlTitle').focus();
    }

    function stateBadge(row) {
        const colors = { live: '#1F5A3D', scheduled: '#8A6A00', expired: '#6B6B6B', draft: '#6B6B6B', archived: '#6B6B6B', published: '#1F5A3D' };
        return `<span class="admin-badge" style="color:${colors[row.state] || '#444'};font-weight:800;">${view.escapeText(STATE_LABEL[row.state] || row.state)}</span>`;
    }

    function renderList() {
        const host = $('hlList');
        if (!rows.length) { host.innerHTML = '<p class="admin-page-sub" style="padding:16px;">Aucune carte. Rien n’est affiché dans « À la une » tant qu’aucune carte n’est publiée.</p>'; return; }
        host.innerHTML = rows.map((row) => {
            const dates = [row.starts_at && `du ${new Date(row.starts_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`, row.ends_at && `au ${new Date(row.ends_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`].filter(Boolean).join(' ') || 'Sans limite de dates';
            const thumb = row.image_url ? `<img src="${view.escapeText(row.image_url)}" alt="" width="64" height="48" style="width:64px;height:48px;object-fit:cover;border-radius:8px;">` : '<span style="display:block;width:64px;height:48px;border-radius:8px;background:#E4EFDF;"></span>';
            const publishLabel = row.status === 'published' ? 'Dépublier' : 'Publier';
            return `<div class="hl-row" data-id="${view.escapeText(row.id)}" style="display:flex;gap:12px;align-items:center;padding:12px 16px;border-top:1px solid rgba(0,0,0,0.06);flex-wrap:wrap;">
                ${thumb}
                <div style="flex:1;min-width:200px;"><strong>${view.escapeText(row.title)}</strong> ${stateBadge(row)}<div class="admin-page-sub">${view.escapeText(row.teaser)}</div>
                <div class="admin-page-sub">${view.escapeText(view.TERRITORY_LABEL[row.territory] || row.territory)} · ${view.escapeText(row.theme ? THEME_LABEL[row.theme] || row.theme : 'Sans thème')} · priorité ${row.priority} · ${view.escapeText(dates)}</div></div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button type="button" class="admin-btn" data-hl="edit">Modifier</button>
                    <button type="button" class="admin-btn" data-hl="toggle" data-next="${row.status === 'published' ? 'draft' : 'published'}">${publishLabel}</button>
                    <button type="button" class="admin-btn" data-hl="archive"${row.status === 'archived' ? ' disabled' : ''}>Archiver</button>
                    <button type="button" class="admin-btn" data-hl="delete">Supprimer</button>
                </div></div>`;
        }).join('');
    }

    async function load() {
        say('');
        try {
            const json = await api('');
            rows = json.highlights || [];
            renderList();
        } catch (e) {
            $('hlList').innerHTML = '';
            say(e.message === 'Accès refusé.' ? 'Accès refusé : cette section demande le droit de validation éditoriale.' : e.message, true);
        }
    }

    async function save(event) {
        event.preventDefault();
        const button = $('hlSave');
        button.disabled = true;
        try {
            const payload = formValue();
            if (editingId) await api(`/${encodeURIComponent(editingId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
            else await api('', { method: 'POST', body: JSON.stringify(payload) });
            say(payload.status === 'published' ? 'Carte enregistrée. Elle apparaît selon ses dates.' : 'Carte enregistrée.');
            $('hlForm').hidden = true;
            await load();
        } catch (e) { say(e.message, true); } finally { button.disabled = false; }
    }

    function uploadImage() {
        const file = $('hlFile').files && $('hlFile').files[0];
        if (!file) return;
        if (file.size > 1024 * 1024) { say('Image : 1 Mo maximum.', true); $('hlFile').value = ''; return; }
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                $('hlImageInfo').textContent = 'Envoi…';
                const json = await api('/image', { method: 'POST', body: JSON.stringify({ data: String(reader.result) }) });
                imageUrl = json.url;
                $('hlImageInfo').textContent = `Image envoyée (${Math.round(json.bytes / 1024)} Ko).`;
                say('');
                renderPreview();
            } catch (e) { $('hlImageInfo').textContent = 'Échec de l’envoi.'; say(e.message, true); }
        };
        reader.readAsDataURL(file);
    }

    async function onListClick(event) {
        const button = event.target.closest('[data-hl]');
        const row = button && rows.find((r) => r.id === button.closest('.hl-row').dataset.id);
        if (!row) return;
        try {
            if (button.dataset.hl === 'edit') return resetForm(row);
            if (button.dataset.hl === 'toggle') await api(`/${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.next }) });
            if (button.dataset.hl === 'archive') await api(`/${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'archived' }) });
            if (button.dataset.hl === 'delete') {
                if (!window.confirm(`Supprimer définitivement « ${row.title} » ?`)) return;
                await api(`/${row.id}`, { method: 'DELETE' });
            }
            await load();
        } catch (e) { say(e.message, true); }
    }

    function init() {
        const section = $('sec-highlights');
        if (!section || section.dataset.ready) return;
        section.dataset.ready = '1';
        $('hlTarget').innerHTML = Object.keys(TARGET_LABEL).map((k) => `<option value="${k}">${TARGET_LABEL[k]}</option>`).join('');
        $('hlTerritory').innerHTML = Object.keys(view.TERRITORY_LABEL).map((k) => `<option value="${k}">${view.TERRITORY_LABEL[k]}</option>`).join('');
        $('hlTheme').innerHTML = '<option value="">Sans thème</option>' + Object.keys(THEME_LABEL).map((k) => `<option value="${k}">${THEME_LABEL[k]}</option>`).join('');
        $('hlNew').addEventListener('click', () => resetForm(null));
        $('hlCancel').addEventListener('click', () => { $('hlForm').hidden = true; });
        $('hlForm').addEventListener('submit', save);
        $('hlForm').addEventListener('input', renderPreview);
        $('hlFile').addEventListener('change', uploadImage);
        $('hlList').addEventListener('click', onListClick);
        document.querySelectorAll('.admin-nav-item[data-section="sec-highlights"]').forEach((item) => item.addEventListener('click', load));
        if (section.classList.contains('active')) load();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
