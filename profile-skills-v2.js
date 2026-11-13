/* LYANN — Édition des compétences V2 (phase 3.2D).
 * Recherche progressive, précision des compétences historiques, écriture par les RPC déjà en place.
 * Inerte hors Staging. Ne change ni les forfaits ni les quotas : le refus vient du serveur. */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LYANN_PROFILE_SKILLS_V2 = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const STAGING = 'tdktfbtqceldlaeqjtow';
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function planAdd(nodes, code, entitlements) {
        const list = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
        if (!/^[a-z0-9_]{2,80}$/.test(String(code || ''))) return { ok: false, message: 'Ce métier ne peut pas être ajouté.' };
        if (list.includes(code)) return { ok: false, duplicate: true, message: 'Cette compétence est déjà sur votre profil.' };
        const limit = entitlements && entitlements.limits ? entitlements.limits.categories : null;
        const used = entitlements && entitlements.usage ? Number(entitlements.usage.categories) : null;
        if (limit != null && used != null && used >= Number(limit)) return { ok: false, quota: true, message: 'Votre formule ne permet pas d’ajouter une compétence de plus.' };
        return { ok: true, nodes: [...list, code] };
    }

    function mount() {
        if (!root || root.LYANN_SUPABASE_LOCK !== STAGING) return { mounted: false };
        const slot = root.document && root.document.getElementById('cpSkillsTagsContainer');
        if (!slot || !root.LYANN_MARKETPLACE_TAXONOMY || !root.LYANN_TAXONOMY_UX) return { mounted: false };
        const client = root.LYANN_API_CLIENT || root.apiClient;
        const userId = client && client.getCurrentUserId && client.getCurrentUserId();
        if (!userId || !client.supabase) return { mounted: false };
        let host = root.document.getElementById('lyannSkillEditor');
        if (!host) {
            host = root.document.createElement('div');
            host.id = 'lyannSkillEditor';
            slot.insertAdjacentElement('beforebegin', host);
        }
        slot.hidden = true;
        const custom = root.document.getElementById('cpCustomSkill');
        if (custom) custom.closest('div').hidden = true;
        host.innerHTML = '<p class="lyann-skill-intro">Recherchez un métier. Une spécialité n’apparaît que si vous en avez besoin.</p><label class="sr-only" for="lyannSkillSearch">Rechercher un métier</label><input id="lyannSkillSearch" type="search" enterkeyhint="search" autocomplete="off" placeholder="Ex. plomberie, élagage, ménage" style="width:100%;box-sizing:border-box;font-size:16px;min-height:44px;border:1px solid #c5d5c8;border-radius:12px;padding:10px 12px"><div id="lyannSkillChoices"></div><div id="lyannSkillStatus" role="status" style="min-height:1.2em;margin:8px 0;color:#3d5c49"></div><div id="lyannSkillList"></div>';
        const search = host.querySelector('#lyannSkillSearch');
        const choices = host.querySelector('#lyannSkillChoices');
        const status = host.querySelector('#lyannSkillStatus');
        const list = host.querySelector('#lyannSkillList');
        let services = [];
        let index = null;
        let entitlements = null;
        const say = (text) => { status.textContent = text || ''; };

        async function reload() {
            const { data, error } = await client.supabase.from('services').select('id,title,category,description,taxonomy_node_code,taxonomy_node_source,base_price,indicative_price,price_type,pricing_model').eq('owner_id', userId);
            if (error) { say('Les compétences n’ont pas pu être relues.'); return; }
            services = data || [];
            try { entitlements = (await client.supabase.rpc('lyann_my_entitlements')).data; } catch (_) { entitlements = null; }
            draw();
            root.LYANN_EXPLORER && root.LYANN_EXPLORER.refresh && root.LYANN_EXPLORER.refresh();
        }
        function draw() {
            list.innerHTML = services.map((service) => {
                const described = root.LYANN_TAXONOMY_UX.describeSkill(service, { features: { taxonomySkills: true }, ctx: { nodes: index && index.byCode }, candidates: candidatesFor(service) });
                const note = described.needsPrecision ? '<span style="display:block;font-weight:500;color:#6a5a28">À préciser</span>' : '';
                return `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid #e4eee6"><span><strong>${esc(described.label || service.title || 'Compétence')}</strong>${note}</span><button type="button" data-remove="${esc(service.id)}" style="min-height:44px">Retirer</button></div>${precision(service, described)}`;
            }).join('') || '<p>Aucune compétence pour l’instant.</p>';
        }
        function candidatesFor(service) {
            if (!index || service.taxonomy_node_code) return [];
            const match = root.LYANN_MARKETPLACE_TAXONOMY.matchQuery(index, service.title || '');
            return (match.codes || []).slice(0, 4).map((code) => {
                const node = index.byCode.get(code);
                return node && { code, label: node.label_fr, selectable: node.selectable !== false, active: true };
            }).filter(Boolean);
        }
        function precision(service, described) {
            if (!described.needsPrecision) return '';
            const buttons = (described.candidates || []).map((c) => `<button type="button" data-resolve="${esc(service.id)}" data-node="${esc(c.code)}" style="min-height:44px;margin:4px 4px 0 0">${esc(c.label)}</button>`).join('');
            return `<div style="margin:0 0 8px"><p style="margin:4px 0;color:#5c6b60;font-size:.9rem">Le libellé d’origine est conservé. Choisissez le métier qui correspond.</p>${buttons || '<p>Recherchez le métier dans le champ ci-dessus, puis ajoutez-le.</p>'}</div>`;
        }
        async function add(code) {
            const nodes = services.map((s) => s.taxonomy_node_code).filter(Boolean);
            const plan = planAdd(nodes, code, entitlements);
            if (!plan.ok) { say(plan.message); return; }
            say('Enregistrement…');
            const { error } = await client.supabase.rpc('lyann_sync_profile_skills_v2', { p_user: userId, p_nodes: plan.nodes });
            if (error) { say(/QUOTA|catégorie/i.test(error.message || '') ? 'Votre formule ne permet pas d’ajouter une compétence de plus.' : 'La compétence n’a pas été ajoutée. Réessayez.'); return; }
            say('Compétence ajoutée.');
            await reload();
        }
        search.addEventListener('input', () => {
            if (!index) { choices.innerHTML = ''; return; }
            const match = root.LYANN_MARKETPLACE_TAXONOMY.matchQuery(index, search.value);
            const shown = [];
            const seen = new Set();
            for (const code of match.codes || []) {
                const node = index.byCode.get(code);
                if (!node || node.kind === 'specialty' || seen.has(node.code)) continue;
                seen.add(node.code);
                shown.push(node);
                if (shown.length === 6) break;
            }
            if (match.level === 'family') {
                const family = index.families[match.family];
                (family ? family.groups.flatMap((g) => g.trades) : []).slice(0, 6).forEach((trade) => { if (!seen.has(trade.code)) shown.push({ code: trade.code, label_fr: trade.label, kind: 'trade' }); });
            }
            choices.innerHTML = shown.map((node) => `<button type="button" data-add="${esc(node.code)}" style="min-height:44px;margin:6px 6px 0 0">${esc(node.label_fr || node.label)}</button>`).join('');
            if (match.question) say(match.question);
        });
        host.addEventListener('click', async (event) => {
            const addBtn = event.target.closest('[data-add]');
            if (addBtn) {
                const node = index && index.byCode.get(addBtn.dataset.add);
                const trade = node && node.kind === 'trade' && [...index.byCode.values()].filter((item) => item.parent_code === node.code);
                if (trade && trade.length && !addBtn.dataset.confirm) {
                    choices.innerHTML = `<button type="button" data-add="${esc(node.code)}" data-confirm="1" style="min-height:44px;margin:6px 6px 0 0">Tout le métier</button>`
                        + trade.map((item) => `<button type="button" data-add="${esc(item.code)}" data-confirm="1" style="min-height:44px;margin:6px 6px 0 0">${esc(item.label_fr)}</button>`).join('');
                    say('Choisissez une spécialité, ou tout le métier.');
                    return;
                }
                await add(addBtn.dataset.add);
                return;
            }
            const resolveBtn = event.target.closest('[data-resolve]');
            if (resolveBtn) {
                const service = services.find((s) => s.id === resolveBtn.dataset.resolve);
                const call = root.LYANN_TAXONOMY_UX.resolveSkillArgs(service, resolveBtn.dataset.node);
                if (!call) { say('Ce choix n’est pas disponible.'); return; }
                const { error } = await client.supabase.rpc(call.rpc, call.args);
                say(error ? 'La précision n’a pas été enregistrée.' : 'Compétence précisée.');
                if (!error) await reload();
                return;
            }
            const removeBtn = event.target.closest('[data-remove]');
            if (!removeBtn) return;
            const service = services.find((s) => s.id === removeBtn.dataset.remove);
            if (!service) return;
            const priced = service.base_price != null || service.indicative_price != null || service.price_type || service.pricing_model;
            if (priced) { say('Cette compétence a un tarif : elle reste sur le profil.'); return; }
            if (service.taxonomy_node_code) {
                const nodes = services.map((s) => s.taxonomy_node_code).filter((code) => code && code !== service.taxonomy_node_code);
                const { error } = await client.supabase.rpc('lyann_sync_profile_skills_v2', { p_user: userId, p_nodes: nodes });
                say(error ? 'Le retrait a échoué.' : 'Compétence retirée.');
                if (!error) await reload();
                return;
            }
            const { error } = await client.supabase.from('services').delete().eq('id', service.id).eq('owner_id', userId);
            say(error ? 'Le retrait a échoué.' : 'Compétence retirée.');
            if (!error) await reload();
        });
        root.LYANN_MARKETPLACE_TAXONOMY.load(client.supabase).then((loaded) => { index = loaded; reload(); });
        return { mounted: true, controlsSave: true };
    }

    const api = { mount, planAdd, STAGING };
    Object.defineProperty(api, 'controlsSave', { get() { return root && root.LYANN_SUPABASE_LOCK === STAGING && root.document && !!root.document.getElementById('lyannSkillEditor'); } });
    return api;
});
