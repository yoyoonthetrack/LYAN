(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const state = window.__LYANN_SHARED_NAV_CHAT__ = window.__LYANN_SHARED_NAV_CHAT__ || {
    conversationId: null,
    requestId: null,
    targetUserId: null,
    targetName: null,
    realtime: null,
    poll: null,
    accountParent: null
  };

  const api = () => window.LYANN_API_CLIENT || window.apiClient || null;
  const sb = () => api()?.supabase || null;

  async function user() {
    const client = sb();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data?.session?.user || null;
  }

  function toast(message, type = 'success') {
    if (window.NotificationService?.showToast) window.NotificationService.showToast(type, message);
    else if (window.showLyanToast) window.showLyanToast(message, type === 'success' ? '✓' : '⚠');
    else if (window.lyannAlert) window.lyannAlert(message);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function injectStyles() {
    if ($('#lyannNavChatFixesStyle')) return;
    const style = document.createElement('style');
    style.id = 'lyannNavChatFixesStyle';
    style.textContent = `
      /* Strong mobile login/search spacing: icons never sit on entered text. */
      #loginModal .input-with-icon, #loginForm .input-with-icon,
      #chatModal .input-with-icon, #chatModal [class*="search"] { position:relative!important; }
      #loginModal .input-with-icon>i, #loginForm .input-with-icon>i,
      #chatModal .input-with-icon>i { left:18px!important; width:22px!important; text-align:center!important; pointer-events:none!important; }
      #loginModal .input-with-icon input, #loginForm .input-with-icon input,
      #loginForm #loginEmail, #loginForm #loginPassword { padding-left:58px!important; text-indent:0!important; }
      #chatSearchInput, #chatModal input[type="search"] { padding-left:48px!important; }

      .lyann-inner-page { position:absolute; inset:0; z-index:80; background:#F8FAF8; display:flex; flex-direction:column; min-height:100%; }
      .lyann-inner-head { min-height:64px; padding:calc(10px + env(safe-area-inset-top)) 16px 10px; display:flex; align-items:center; gap:12px; background:#fff; border-bottom:1px solid #E5E7EB; flex:0 0 auto; }
      .lyann-inner-back { width:44px; height:44px; border-radius:50%; border:1px solid #DDE5E0; background:#fff; color:#1F3827; display:grid; place-items:center; font-size:1.2rem; }
      .lyann-inner-title { font-weight:800; color:#1F3827; font-size:1.08rem; }
      .lyann-inner-body { padding:18px 16px calc(28px + env(safe-area-inset-bottom)); overflow:auto; -webkit-overflow-scrolling:touch; flex:1; }
      .lyann-setting-card { background:#fff; border:1px solid #E4EAE6; border-radius:18px; padding:16px; margin-bottom:12px; }
      .lyann-setting-row { display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:52px; }
      .lyann-setting-row label { font-weight:700; color:#25372B; }
      .lyann-sheet-overlay { position:fixed; inset:0; z-index:200000; background:rgba(15,23,18,.52); display:flex; align-items:flex-end; justify-content:center; padding:12px; box-sizing:border-box; }
      .lyann-sheet { width:min(560px,100%); max-height:88dvh; overflow:auto; background:#fff; border-radius:24px; padding:18px; box-sizing:border-box; box-shadow:0 20px 60px rgba(0,0,0,.22); }
      .lyann-sheet-actions { display:flex; gap:10px; margin-top:16px; flex-wrap:wrap; }
      .lyann-refresh-indicator { position:fixed; z-index:190000; top:calc(10px + env(safe-area-inset-top)); left:50%; transform:translate(-50%,-150%); background:#fff; color:#315A3D; border:1px solid #DDE5E0; border-radius:999px; padding:8px 13px; font-size:.82rem; font-weight:800; box-shadow:0 8px 24px rgba(0,0,0,.12); transition:transform .2s ease; pointer-events:none; }
      .lyann-refresh-indicator.show { transform:translate(-50%,0); }
      .lyann-favorite-active { color:#E5B345!important; border-color:#E5B345!important; background:#FFF9E8!important; }
      #chatModal .chat-main-area { padding-left:4px!important; padding-right:4px!important; }
      #chatModal [data-action*="chantier"], #chatModal .btn-project-tracking { position:static!important; margin:8px 0!important; transform:none!important; }
      @media (max-width:768px) {
        #loginModal .input-with-icon input, #loginForm .input-with-icon input,
        #loginForm #loginEmail, #loginForm #loginPassword { padding-left:60px!important; }
        #chatModal .chat-modal-layout { margin-left:auto!important; margin-right:auto!important; width:calc(100% - 18px)!important; }
      }
    `;
    document.head.appendChild(style);
  }

  // ---------- Nested navigation: closing a child returns to its parent surface ----------
  function bindHierarchy() {
    document.addEventListener('click', (event) => {
      const openDetail = event.target.closest('.btn-open-lyann-detail, [onclick*="openLyannDetailModal"], [onclick*="openHelpDetailModal"]');
      if (openDetail) {
        const account = $('#userAccountModal');
        if (account?.classList.contains('active')) state.accountParent = account;
      }

      const closeDetail = event.target.closest('#closeLyannDetailModalBtn, #lyannDetailModal .modal-close-btn');
      if (closeDetail && state.accountParent) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const child = $('#lyannDetailModal');
        if (child) { child.classList.remove('active'); child.style.display = 'none'; }
        state.accountParent.classList.add('active');
        state.accountParent.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        state.accountParent = null;
      }
    }, true);
  }

  // ---------- Account settings: real internal subpages, preserving parent ----------
  function accountCard() {
    return $('#userAccountModal .modal-card-user-account') || $('#userAccountModal .modal-card');
  }

  function closeInnerPage() { $('#lyannAccountInnerPage')?.remove(); }

  function innerPage(title, html) {
    closeInnerPage();
    const host = accountCard();
    if (!host) return null;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const page = document.createElement('section');
    page.id = 'lyannAccountInnerPage';
    page.className = 'lyann-inner-page';
    page.innerHTML = `<div class="lyann-inner-head"><button type="button" class="lyann-inner-back" aria-label="Retour"><i class="ph ph-arrow-left"></i></button><div class="lyann-inner-title">${esc(title)}</div></div><div class="lyann-inner-body">${html}</div>`;
    host.appendChild(page);
    page.querySelector('.lyann-inner-back')?.addEventListener('click', closeInnerPage);
    return page;
  }

  async function preferences() {
    const client = sb(); const u = await user();
    if (!client || !u) return { notify_messages:true, notify_email:true, incognito:false };
    const { data } = await client.from('user_preferences').select('*').eq('user_id', u.id).maybeSingle();
    return data || { user_id:u.id, notify_messages:true, notify_email:true, incognito:false };
  }

  async function savePreferences(patch) {
    const client = sb(); const u = await user();
    if (!client || !u) return;
    const current = await preferences();
    const payload = { ...current, ...patch, user_id:u.id, updated_at:new Date().toISOString() };
    const { error } = await client.from('user_preferences').upsert(payload, { onConflict:'user_id' });
    if (error) { console.error('[LYANN settings]', error); toast('Impossible d’enregistrer ce réglage.', 'warning'); }
    else toast('Réglage enregistré.');
  }

  async function openSettingsPage(kind) {
    if (kind === 'notifications') {
      const p = await preferences();
      const page = innerPage('Notifications', `<div class="lyann-setting-card"><div class="lyann-setting-row"><label for="lyannNotifyMessages">Nouveaux messages</label><input id="lyannNotifyMessages" type="checkbox" ${p.notify_messages ? 'checked' : ''}></div><div class="lyann-setting-row"><label for="lyannNotifyEmail">Emails LYANN</label><input id="lyannNotifyEmail" type="checkbox" ${p.notify_email ? 'checked' : ''}></div></div><p style="color:#64748B;font-size:.86rem;">Choisis les alertes que tu souhaites recevoir.</p>`);
      page?.querySelector('#lyannNotifyMessages')?.addEventListener('change', e => savePreferences({notify_messages:e.target.checked}));
      page?.querySelector('#lyannNotifyEmail')?.addEventListener('change', e => savePreferences({notify_email:e.target.checked}));
    } else if (kind === 'privacy') {
      const p = await preferences();
      const page = innerPage('Confidentialité', `<div class="lyann-setting-card"><div class="lyann-setting-row"><div><label for="lyannIncognito">Mode discret</label><div style="font-size:.8rem;color:#64748B;margin-top:3px;">Masquer ta présence en ligne.</div></div><input id="lyannIncognito" type="checkbox" ${p.incognito ? 'checked' : ''}></div></div><div class="lyann-setting-card"><strong>Gestion de tes données</strong><p style="color:#64748B;font-size:.86rem;line-height:1.45;">Tes informations restent liées à ton compte LYANN et sont protégées par les règles d’accès de la plateforme.</p></div>`);
      page?.querySelector('#lyannIncognito')?.addEventListener('change', e => savePreferences({incognito:e.target.checked}));
    } else if (kind === 'security') {
      const page = innerPage('Sécurité', `<form id="lyannSecurityPageForm" class="lyann-setting-card"><label style="font-weight:700;display:block;margin-bottom:7px;">Nouveau mot de passe</label><input id="lyannNewPassword" class="modal-input" type="password" minlength="8" autocomplete="new-password" placeholder="8 caractères minimum" style="width:100%;box-sizing:border-box;margin-bottom:10px;"><label style="font-weight:700;display:block;margin-bottom:7px;">Confirmer</label><input id="lyannConfirmPassword" class="modal-input" type="password" minlength="8" autocomplete="new-password" placeholder="Confirme le mot de passe" style="width:100%;box-sizing:border-box;margin-bottom:14px;"><button class="btn btn-primary" type="submit" style="width:100%;justify-content:center;">Mettre à jour le mot de passe</button></form>`);
      page?.querySelector('#lyannSecurityPageForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const a = page.querySelector('#lyannNewPassword').value;
        const b = page.querySelector('#lyannConfirmPassword').value;
        if (a.length < 8 || a !== b) { toast('Vérifie les deux mots de passe (8 caractères minimum).', 'warning'); return; }
        const { error } = await sb().auth.updateUser({password:a});
        if (error) toast('Le mot de passe n’a pas pu être modifié.', 'warning');
        else { toast('Mot de passe mis à jour.'); page.querySelector('#lyannSecurityPageForm').reset(); }
      });
    } else {
      innerPage('Conditions & confidentialité', `<div class="lyann-setting-card"><h3 style="margin-top:0;">Conditions d’utilisation</h3><p style="color:#526057;line-height:1.55;">Les services LYANN doivent être utilisés de bonne foi, avec des informations exactes et dans le respect des autres membres.</p></div><div class="lyann-setting-card"><h3 style="margin-top:0;">Confidentialité</h3><p style="color:#526057;line-height:1.55;">Les données de compte et de conversation ne sont accessibles qu’aux personnes autorisées par le fonctionnement du service. Les besoins privés ciblés restent limités à leurs participants.</p></div>`);
    }
  }

  function bindSettings() {
    document.addEventListener('click', (event) => {
      const root = $('#userAccountModal');
      if (!root?.contains(event.target)) return;
      const control = event.target.closest('button,a,[role="button"]');
      if (!control || control.closest('#lyannAccountInnerPage')) return;
      const text = (control.textContent || '').replace(/\s+/g,' ').trim().toLowerCase();
      let kind = null;
      if (/notification/.test(text)) kind = 'notifications';
      else if (/conditions/.test(text)) kind = 'terms';
      else if (/confidentialit/.test(text)) kind = 'privacy';
      else if (/s[ée]curit/.test(text)) kind = 'security';
      if (!kind) return;
      event.preventDefault(); event.stopImmediatePropagation();
      openSettingsPage(kind);
    }, true);
  }

  // ---------- Conversation state + realtime ----------
  async function resolveConversation(targetUserId) {
    const client = sb(); const u = await user();
    if (!client || !u || !targetUserId || targetUserId === u.id) return null;
    const { data, error } = await client.rpc('get_or_create_conversation', { p_user_a:u.id, p_user_b:targetUserId });
    if (error) { console.warn('[LYANN chat] conversation resolve', error); return null; }
    return typeof data === 'string' ? data : (data?.id || data);
  }

  async function refreshMessages() {
    const client = sb(); const u = await user(); const box = $('#chatMessages');
    if (!client || !u || !box || !state.conversationId) return;
    const { data, error } = await client.from('messages').select('id,sender_id,content,attachment_url,attachment_type,attachment_name,created_at').eq('conversation_id',state.conversationId).order('created_at',{ascending:true}).limit(200);
    if (error) return;
    const existing = new Set($$('[data-message-id]', box).map(x => x.dataset.messageId));
    (data || []).forEach(m => {
      if (existing.has(m.id)) return;
      const row = document.createElement('div');
      row.className = `chat-message-row ${m.sender_id === u.id ? 'sent' : 'received'}`;
      row.dataset.messageId = m.id;
      const attachment = m.attachment_url ? `<a href="${esc(m.attachment_url)}" target="_blank" rel="noopener" style="display:block;margin-top:7px;">${m.attachment_type?.startsWith('image/') ? `<img src="${esc(m.attachment_url)}" alt="${esc(m.attachment_name || 'Image')}" style="max-width:220px;max-height:260px;border-radius:12px;object-fit:cover;display:block;">` : `📎 ${esc(m.attachment_name || 'Pièce jointe')}`}</a>` : '';
      row.innerHTML = `<div class="chat-message-bubble">${esc(m.content || '')}${attachment}<div class="chat-message-time">${new Date(m.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div></div>`;
      box.appendChild(row);
    });
    box.scrollTop = box.scrollHeight;
  }

  async function subscribeConversation() {
    const client = sb();
    if (!client || !state.conversationId) return;
    if (state.realtime) { try { await client.removeChannel(state.realtime); } catch (_) {} }
    state.realtime = client.channel(`lyann-messages-${state.conversationId}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`conversation_id=eq.${state.conversationId}`}, refreshMessages)
      .subscribe();
    clearInterval(state.poll);
    state.poll = setInterval(() => {
      if ($('#chatModal')?.classList.contains('active')) refreshMessages();
    }, 4000);
    refreshMessages();
  }

  function patchOpenChat() {
    const fn = window.openChatWithUser;
    if (typeof fn !== 'function' || fn.__lyannNavChatWrapped) return false;
    const wrapped = async function(name, avatar, targetId, initialNeed, ...rest) {
      state.targetUserId = targetId || state.targetUserId;
      state.targetName = name || state.targetName;
      state.requestId = initialNeed?.requestId || state.requestId;
      const result = await fn.call(this, name, avatar, targetId, initialNeed, ...rest);
      if (targetId) {
        state.conversationId = await resolveConversation(targetId);
        if (state.conversationId) await subscribeConversation();
      }
      return result;
    };
    wrapped.__lyannNavChatWrapped = true;
    window.openChatWithUser = wrapped;
    return true;
  }

  async function secureRequestContext() {
    const client = sb();
    if (!client) return null;
    if (state.conversationId) {
      const { data } = await client.rpc('get_conversation_request_context_secure', { p_conversation_id:state.conversationId });
      const ctx = Array.isArray(data) ? data[0] : data;
      if (ctx?.request_id) state.requestId = ctx.request_id;
    }
    if (!state.requestId) return null;
    const { data } = await client.from('requests').select('id,title,description,category,budget,location,urgency,status,requester_id,created_at').eq('id',state.requestId).maybeSingle();
    return data || null;
  }

  function showSheet(title, body, actions = '') {
    $('#lyannSharedActionSheet')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'lyannSharedActionSheet';
    overlay.className = 'lyann-sheet-overlay';
    overlay.innerHTML = `<div class="lyann-sheet" role="dialog" aria-modal="true"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;"><strong style="font-size:1.08rem;color:#1F3827;">${esc(title)}</strong><button type="button" data-close style="width:44px;height:44px;border-radius:50%;border:1px solid #DDE5E0;background:#fff;font-size:1.2rem;">×</button></div>${body}${actions}</div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('[data-close]')) overlay.remove(); });
    return overlay;
  }

  async function viewMission() {
    const req = await secureRequestContext();
    if (!req) { toast('Aucun besoin associé à cette conversation.', 'warning'); return; }
    showSheet('Le besoin', `<div class="lyann-setting-card"><div style="font-weight:800;font-size:1.05rem;margin-bottom:8px;">${esc(req.title)}</div><div style="color:#526057;line-height:1.5;white-space:pre-wrap;">${esc(req.description || '')}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;font-size:.82rem;color:#526057;"><span>📍 ${esc(req.location || 'Localisation non précisée')}</span>${req.budget ? `<span>· ${esc(req.budget)} €</span>` : ''}<span>· ${esc(req.status || '')}</span></div></div>`);
  }

  async function proposeDate() {
    const u = await user(); const client = sb(); const req = await secureRequestContext();
    if (!u || !client || !state.conversationId) { toast('Ouvre d’abord une conversation liée au besoin.', 'warning'); return; }
    const min = new Date(Date.now()+5*60*1000); min.setMinutes(min.getMinutes()-min.getTimezoneOffset());
    const overlay = showSheet('Proposer une date', `<label style="display:block;font-weight:700;margin-bottom:8px;">Date et heure</label><input id="lyannDateProposalInput" type="datetime-local" class="modal-input" min="${min.toISOString().slice(0,16)}" style="width:100%;box-sizing:border-box;">`, `<div class="lyann-sheet-actions"><button type="button" class="btn btn-outline" data-close style="flex:1;justify-content:center;">Annuler</button><button type="button" id="lyannSendDateProposal" class="btn btn-primary" style="flex:1;justify-content:center;">Envoyer</button></div>`);
    overlay.querySelector('#lyannSendDateProposal')?.addEventListener('click', async () => {
      const raw = overlay.querySelector('#lyannDateProposalInput').value;
      if (!raw) return;
      const when = new Date(raw);
      const { error } = await client.from('mission_date_proposals').insert({conversation_id:state.conversationId,request_id:req?.id || state.requestId || null,proposed_by:u.id,proposed_at:when.toISOString()});
      if (error) { console.error(error); toast('La date n’a pas pu être proposée.', 'warning'); return; }
      const label = when.toLocaleString('fr-FR',{dateStyle:'long',timeStyle:'short'});
      await client.from('messages').insert({conversation_id:state.conversationId,sender_id:u.id,content:`📅 Proposition de date : ${label}`});
      overlay.remove(); toast('Date proposée.'); refreshMessages();
    });
  }

  async function projectTracking() {
    const req = await secureRequestContext(); const client = sb();
    if (!req || !client) { toast('Aucun suivi disponible pour cette conversation.', 'warning'); return; }
    const { data: proposals } = state.conversationId ? await client.from('mission_date_proposals').select('*').eq('conversation_id',state.conversationId).order('created_at',{ascending:false}).limit(10) : {data:[]};
    const { data: missions } = await client.from('missions').select('id,title,status,agreed_date,created_at').or(`request_id.eq.${req.id},related_request_id.eq.${req.id}`).order('created_at',{ascending:false}).limit(3);
    const mission = missions?.[0];
    const proposalsHtml = (proposals || []).map(p => `<div style="padding:10px 0;border-top:1px solid #EEF1EF;">📅 ${new Date(p.proposed_at).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'})} <strong style="float:right;">${esc(p.status)}</strong></div>`).join('') || '<div style="color:#64748B;">Aucune date proposée.</div>';
    showSheet('Suivi du chantier', `<div class="lyann-setting-card"><strong>${esc(req.title)}</strong><div style="margin-top:8px;color:#526057;">${mission ? `Mission : ${esc(mission.status || 'EN COURS')}` : 'Discussion / proposition en cours'}</div>${mission?.agreed_date ? `<div style="margin-top:6px;">Date convenue : ${new Date(mission.agreed_date).toLocaleString('fr-FR')}</div>` : ''}</div><div class="lyann-setting-card"><strong>Dates proposées</strong><div style="margin-top:8px;">${proposalsHtml}</div></div>`);
  }

  function bindMissionActions() {
    document.addEventListener('click', (event) => {
      const btn = event.target.closest('button,a'); if (!btn) return;
      const text = (btn.textContent || '').replace(/\s+/g,' ').trim().toLowerCase();
      if (/voir (la )?mission|voir (le )?besoin/.test(text)) { event.preventDefault(); event.stopImmediatePropagation(); viewMission(); }
      else if (/proposer une date/.test(text)) { event.preventDefault(); event.stopImmediatePropagation(); proposeDate(); }
      else if (/suivi du chantier/.test(text)) { event.preventDefault(); event.stopImmediatePropagation(); projectTracking(); }
    }, true);
  }

  // ---------- Favorites ----------
  function favoriteContext(btn) {
    const host = btn.closest('[data-post-id],[data-request-id],[data-member-id],[data-user-id],[data-profile-id],article,.flash-card,.result-card,.talent-card');
    const explicitType = btn.dataset.favoriteType || btn.dataset.favType;
    const explicitId = btn.dataset.favoriteId || btn.dataset.favId;
    if (explicitId) return {type:String(explicitType || 'PROFILE').toUpperCase(),id:explicitId};
    if (host?.dataset.postId) return {type:'POST',id:host.dataset.postId};
    if (host?.dataset.requestId) return {type:'REQUEST',id:host.dataset.requestId};
    const profileId = host?.dataset.memberId || host?.dataset.userId || host?.dataset.profileId;
    return profileId ? {type:'PROFILE',id:profileId} : null;
  }

  async function toggleFavorite(btn) {
    const client = sb(); const u = await user(); const ctx = favoriteContext(btn);
    if (!client || !u) { toast('Connecte-toi pour utiliser les favoris.', 'warning'); return; }
    if (!ctx?.id || !/^[0-9a-f-]{36}$/i.test(ctx.id)) { toast('Cet élément ne peut pas encore être ajouté aux favoris.', 'warning'); return; }
    const { data } = await client.from('user_favorites').select('target_id').eq('user_id',u.id).eq('target_type',ctx.type).eq('target_id',ctx.id).maybeSingle();
    if (data) {
      const { error } = await client.from('user_favorites').delete().eq('user_id',u.id).eq('target_type',ctx.type).eq('target_id',ctx.id);
      if (!error) { btn.classList.remove('lyann-favorite-active'); toast('Retiré des favoris.'); }
    } else {
      const { error } = await client.from('user_favorites').insert({user_id:u.id,target_type:ctx.type,target_id:ctx.id});
      if (!error) { btn.classList.add('lyann-favorite-active'); toast('Ajouté aux favoris.'); }
      else { console.error('[LYANN favorite]',error); toast('Impossible d’ajouter ce favori.', 'warning'); }
    }
  }

  function bindFavorites() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('.btn-fav-toggle,.lyann-favorite-btn,[data-favorite-id],[data-fav-id],[aria-label*="favori" i],[title*="favori" i]');
      if (!btn) return;
      e.preventDefault(); e.stopImmediatePropagation(); toggleFavorite(btn);
    }, true);
  }

  // ---------- Pull to refresh ----------
  function attachPullRefresh(surface, refresh) {
    if (!surface || surface.dataset.pullRefreshBound === 'true') return;
    surface.dataset.pullRefreshBound = 'true';
    let startY = 0, pulling = false;
    const indicator = document.createElement('div'); indicator.className='lyann-refresh-indicator'; indicator.textContent='↓ Tirer pour actualiser'; document.body.appendChild(indicator);
    surface.addEventListener('touchstart', e => {
      const scrollTop = surface === document.body || surface === document.documentElement ? window.scrollY : surface.scrollTop;
      if (scrollTop <= 0 && e.touches?.length === 1) { startY=e.touches[0].clientY; pulling=true; }
    }, {passive:true});
    surface.addEventListener('touchmove', e => {
      if (!pulling) return; const dy=e.touches[0].clientY-startY;
      if (dy > 18) { indicator.classList.add('show'); indicator.textContent = dy > 72 ? '↻ Relâcher pour actualiser' : '↓ Tirer pour actualiser'; }
    }, {passive:true});
    surface.addEventListener('touchend', async e => {
      if (!pulling) return; pulling=false;
      const dy=(e.changedTouches?.[0]?.clientY || startY)-startY;
      if (dy > 72) { indicator.textContent='↻ Actualisation…'; try { await refresh(); } catch (_) {} indicator.textContent='✓ À jour'; }
      setTimeout(() => indicator.classList.remove('show'), 550);
    }, {passive:true});
  }

  function bindPullRefresh() {
    if (document.body.classList.contains('feed-page')) attachPullRefresh(document.body, async () => { if (typeof window.loadBokantajFeedFromSupabase === 'function') await window.loadBokantajFeedFromSupabase(); else location.reload(); });
    const messages = $('#chatMessages'); if (messages) attachPullRefresh(messages, refreshMessages);
  }

  // ---------- Bokantaj media: replace ephemeral blob URLs with durable Storage URLs ----------
  async function uploadComposerFiles() {
    const client = sb(); const u = await user(); const input = $('#flashPhotoInput');
    if (!client || !u || !input?.files?.length) return [];
    const files = Array.from(input.files).slice(0,3); const urls=[];
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) throw new Error('MEDIA_TOO_LARGE');
      const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi,'').toLowerCase();
      const path = `${u.id}/${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await client.storage.from('bokantaj-media').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
      if (error) throw error;
      const { data } = client.storage.from('bokantaj-media').getPublicUrl(path);
      if (data?.publicUrl) urls.push(data.publicUrl);
    }
    return urls;
  }

  function patchCreatePost() {
    const a = api(); if (!a || typeof a.createPost !== 'function' || a.createPost.__lyannMediaWrapped) return false;
    const original = a.createPost.bind(a);
    const wrapped = async payload => {
      const hasBlob = Array.isArray(payload?.media_urls) && payload.media_urls.some(x => /^blob:/i.test(String(x)));
      if (hasBlob) {
        try {
          const urls = await uploadComposerFiles();
          payload = {...payload, media_urls:urls, image_url:urls[0] || null};
        } catch (error) {
          console.error('[LYANN media upload]',error);
          toast(error?.message === 'MEDIA_TOO_LARGE' ? 'Le média dépasse 10 Mo.' : 'La photo n’a pas pu être envoyée. Réessaie.', 'warning');
          throw error;
        }
      }
      return original(payload);
    };
    wrapped.__lyannMediaWrapped=true; a.createPost=wrapped; return true;
  }

  // Repair rendering for valid stored media URLs; never pretend a blob URL is recoverable.
  function repairMediaRendering(root=document) {
    root.querySelectorAll?.('img[src^="blob:"],video[src^="blob:"],a[href^="blob:"]').forEach(el => {
      const card=el.closest('.flash-card,.feed-card,.bokantaj-card,article');
      if (card && !card.querySelector('.lyann-expired-media-note')) {
        const note=document.createElement('div'); note.className='lyann-expired-media-note'; note.style.cssText='padding:10px 12px;margin:8px 0;border-radius:12px;background:#FFF8E8;color:#775A16;font-size:.82rem;'; note.textContent='Ce média temporaire a expiré. Son auteur peut le republier.'; el.replaceWith(note);
      }
    });
  }

  function start() {
    injectStyles(); bindHierarchy(); bindSettings(); bindMissionActions(); bindFavorites(); bindPullRefresh(); repairMediaRendering(document);
    let attempts=0;
    const timer=setInterval(() => {
      patchOpenChat(); patchCreatePost(); bindPullRefresh();
      if (++attempts > 60) clearInterval(timer);
    },500);
    const obs=new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType===1) { repairMediaRendering(n); bindPullRefresh(); } })));
    obs.observe(document.documentElement,{childList:true,subtree:true});
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
