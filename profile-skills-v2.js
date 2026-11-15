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
        if (entitlements && entitlements.enforced === true && limit != null && used != null && used >= Number(limit)) return { ok: false, quota: true, message: 'Votre formule ne permet pas d’ajouter une compétence de plus.' };
        return { ok: true, nodes: [...list, code] };
    }

    async function resolveUserId(client) {
        if (root.LYANN_AUTH_STATE && typeof root.LYANN_AUTH_STATE.ready === 'function') {
            try { await root.LYANN_AUTH_STATE.ready(); } catch (_) {}
        }
        const snapshot = root.LYANN_AUTH_STATE && root.LYANN_AUTH_STATE.getSnapshot && root.LYANN_AUTH_STATE.getSnapshot();
        if (snapshot && snapshot.userId) return String(snapshot.userId);
        if (client && typeof client.getCurrentUser === 'function') {
            try {
                const user = await client.getCurrentUser();
                if (user && user.id) return String(user.id);
            } catch (_) {}
        }
        return '';
    }

    async function mount() {
        if (!root || root.LYANN_SUPABASE_LOCK !== STAGING) return { mounted: false, reason: 'lock' };
        const slot = root.document && root.document.getElementById('cpSkillsTagsContainer');
        if (!slot || !root.LYANN_MARKETPLACE_TAXONOMY || !root.LYANN_TAXONOMY_UX) return { mounted: false, reason: 'missing' };
        const client = root.LYANN_API_CLIENT || root.apiClient;
        const userId = await resolveUserId(client);
        if (!userId || !client || !client.supabase) return { mounted: false, reason: userId ? 'client' : 'anonymous' };
        let host = root.document.getElementById('lyannSkillEditor');
        if (!host) {
            host = root.document.createElement('div');
            host.id = 'lyannSkillEditor';
            slot.insertAdjacentElement('beforebegin', host);
        }
        if (host.dataset.bound === userId) return { mounted: true, controlsSave: true };
        host.dataset.bound = userId;
        slot.hidden = true;
        const custom = root.document.getElementById('cpCustomSkill');
        if (custom) custom.closest('div').hidden = true;
        host.innerHTML = '<div id="lyannSkillList"></div><button type="button" id="lyannSkillAdd" style="min-height:44px;margin-top:8px">Ajouter une compétence</button><div id="lyannSkillDrawer" hidden><button type="button" data-skill-back style="min-height:44px">Retour</button><div id="lyannSkillSteps"></div><div id="lyannSkillOther" hidden><label for="lyannSkillOtherInput">Autre compétence</label><input id="lyannSkillOtherInput" type="text" maxlength="80" autocomplete="off" placeholder="Écrivez la compétence" style="width:100%;box-sizing:border-box;font-size:16px;min-height:44px;border:1px solid #c5d5c8;border-radius:12px;padding:10px 12px"><button type="button" id="lyannSkillOtherSave" style="min-height:44px;margin-top:8px">Ajouter</button></div></div><div id="lyannSkillStatus" role="status" style="min-height:1.2em;margin:8px 0;color:#3d5c49"></div>';
        const drawer = host.querySelector('#lyannSkillDrawer');
        const steps = host.querySelector('#lyannSkillSteps');
        const other = host.querySelector('#lyannSkillOther');
        const status = host.querySelector('#lyannSkillStatus');
        const list = host.querySelector('#lyannSkillList');
        let trail = [];
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
            return `<div style="margin:0 0 8px"><p style="margin:4px 0;color:#5c6b60;font-size:.9rem">Le libellé d’origine est conservé. Choisissez le métier qui correspond.</p>${buttons || '<p>Ouvrez Ajouter une compétence, puis choisissez le métier.</p>'}</div>`;
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
        function paintSteps() {
            other.hidden = true;
            const tax = root.LYANN_MARKETPLACE_TAXONOMY;
            const button = (attrs, label) => `<button type="button" ${attrs} style="display:block;width:100%;text-align:left;min-height:44px;margin:6px 0">${esc(label)}</button>`;
            if (!trail.length) {
                const families = tax && tax.FAMILIES ? tax.FAMILIES : [];
                steps.innerHTML = families.map((family) => button(`data-family="${esc(family.code)}"`, family.short)).join('')
                    + button('data-other="1"', 'Autre');
                say('Choisissez une catégorie.');
                return;
            }
            const family = index && index.families[trail[0].code];
            if (trail.length === 1) {
                const groups = family && family.groups.length ? family.groups : [];
                steps.innerHTML = groups.map((group) => button(`data-group="${esc(group.code)}"`, group.label || group.code)).join('')
                    + button('data-other="1"', 'Autre');
                say(groups.length ? 'Choisissez une sous-catégorie.' : 'Aucune sous-catégorie : précisez la compétence.');
                if (!groups.length) { other.hidden = false; }
                return;
            }
            const group = family && family.groups.find((item) => item.code === trail[1].code);
            const trades = group ? group.trades : [];
            steps.innerHTML = trades.map((trade) => button(`data-add="${esc(trade.code)}"`, trade.label)).join('')
                + button('data-other="1"', 'Autre');
            say('Choisissez une compétence.');
        }
        host.querySelector('#lyannSkillAdd').addEventListener('click', () => {
            trail = [];
            drawer.hidden = false;
            paintSteps();
        });
        host.addEventListener('click', async (event) => {
            if (event.target.closest('[data-skill-back]')) {
                trail.pop();
                paintSteps();
                return;
            }
            const familyBtn = event.target.closest('[data-family]');
            if (familyBtn) {
                const meta = root.LYANN_MARKETPLACE_TAXONOMY.FAMILIES.find((item) => item.code === familyBtn.dataset.family);
                trail = [{ code: familyBtn.dataset.family, label: meta ? meta.short : familyBtn.dataset.family }];
                paintSteps();
                return;
            }
            const groupBtn = event.target.closest('[data-group]');
            if (groupBtn) {
                trail = trail.slice(0, 1).concat([{ code: groupBtn.dataset.group, label: groupBtn.textContent.trim() }]);
                paintSteps();
                return;
            }
            const otherBtn = event.target.closest('[data-other]');
            if (otherBtn) {
                other.hidden = false;
                host.querySelector('#lyannSkillOtherInput').focus();
                say('Écrivez la compétence qui n’est pas dans la liste.');
                return;
            }
            const addBtn = event.target.closest('[data-add]');
            if (addBtn) {
                const node = index && index.byCode.get(addBtn.dataset.add);
                const trade = node && node.kind === 'trade' && [...index.byCode.values()].filter((item) => item.parent_code === node.code);
                if (trade && trade.length && !addBtn.dataset.confirm) {
                    steps.innerHTML = `<button type="button" data-add="${esc(node.code)}" data-confirm="1" style="display:block;width:100%;text-align:left;min-height:44px;margin:6px 0">Tout le métier</button>`
                        + trade.map((item) => `<button type="button" data-add="${esc(item.code)}" data-confirm="1" style="display:block;width:100%;text-align:left;min-height:44px;margin:6px 0">${esc(item.label_fr)}</button>`).join('');
                    say('Choisissez une spécialité, ou tout le métier.');
                    return;
                }
                await add(addBtn.dataset.add);
                drawer.hidden = true;
                return;
            }
            if (event.target.closest('#lyannSkillOtherSave')) {
                const text = host.querySelector('#lyannSkillOtherInput').value.replace(/\s+/g, ' ').trim();
                if (text.length < 2) { say('Écrivez la compétence.'); return; }
                const family = trail[0] ? trail[0].label : 'Autre';
                say('Enregistrement…');
                try {
                    await client.addUserService(userId, text, 'Sur devis', 'Sur devis', family);
                    host.querySelector('#lyannSkillOtherInput').value = '';
                    drawer.hidden = true;
                    say('Compétence ajoutée.');
                    await reload();
                } catch (_) { say('La compétence n’a pas été ajoutée. Réessayez.'); }
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
        if (typeof root.document.addEventListener === 'function') {
            root.document.addEventListener('lyann-skills-changed', () => { if (host.isConnected) reload(); });
        }
        say('Chargement des compétences…');
        root.LYANN_MARKETPLACE_TAXONOMY.load(client.supabase).then((loaded) => {
            index = loaded;
            drawer.hidden = false;
            paintSteps();
            if (!loaded) say('Le référentiel des métiers est indisponible.');
            return reload();
        }).catch(() => say('Les compétences n’ont pas pu être chargées.'));
        return { mounted: true, controlsSave: true };
    }

    async function remove(serviceId) {
        if (!root || root.LYANN_SUPABASE_LOCK !== STAGING || !serviceId) return { ok: false };
        const client = root.LYANN_API_CLIENT || root.apiClient;
        const userId = await resolveUserId(client);
        if (!userId || !client || !client.supabase) return { ok: false };
        const { data, error } = await client.supabase.from('services').select('id,taxonomy_node_code,base_price,indicative_price,price_type,pricing_model').eq('id', serviceId).eq('owner_id', userId).maybeSingle();
        if (error || !data) return { ok: false };
        const priced = data.base_price != null || data.indicative_price != null || data.price_type || data.pricing_model;
        if (priced) return { ok: false, message: 'Cette compétence a un tarif : elle reste sur le profil.' };
        if (data.taxonomy_node_code) {
            const { data: rows } = await client.supabase.from('services').select('taxonomy_node_code').eq('owner_id', userId);
            const nodes = (rows || []).map((row) => row.taxonomy_node_code).filter((code) => code && code !== data.taxonomy_node_code);
            const result = await client.supabase.rpc('lyann_sync_profile_skills_v2', { p_user: userId, p_nodes: nodes });
            if (result.error) return { ok: false };
        } else {
            const result = await client.supabase.from('services').delete().eq('id', serviceId).eq('owner_id', userId);
            if (result.error) return { ok: false };
        }
        root.document.dispatchEvent(new Event('lyann-skills-changed'));
        return { ok: true };
    }

    const api = { mount, planAdd, remove, STAGING };
    Object.defineProperty(api, 'controlsSave', { get() { return root && root.LYANN_SUPABASE_LOCK === STAGING && root.document && !!root.document.getElementById('lyannSkillEditor'); } });
    return api;
});
