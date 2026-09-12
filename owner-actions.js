(() => {
  'use strict';

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function client() {
    return window.LYANN_API_CLIENT || window.apiClient || null;
  }

  async function activeUser() {
    const c = client();
    if (!c || !c.supabase) return null;
    const { data } = await c.supabase.auth.getSession();
    return data?.session?.user || null;
  }

  function notify(type, message) {
    if (window.NotificationService?.showToast) {
      window.NotificationService.showToast(type, message);
    } else if (window.showLyanToast) {
      window.showLyanToast(message, type === 'success' ? '✓' : '⚠');
    } else if (window.lyannAlert) {
      window.lyannAlert(message);
    }
  }

  async function confirmDelete() {
    const message = 'Supprimer définitivement ce besoin ? Cette action est irréversible.';
    if (window.lyannConfirm) return !!(await window.lyannConfirm(message));
    return window.confirm(message);
  }

  async function hasActiveMission(requestId) {
    const c = client();
    if (!c?.supabase) return false;
    const { data, error } = await c.supabase
      .from('missions')
      .select('id,status')
      .or(`request_id.eq.${requestId},related_request_id.eq.${requestId}`)
      .limit(20);
    if (error) return false;
    return (data || []).some((mission) => !['COMPLETED', 'CANCELLED', 'CANCELED', 'CLOSED'].includes(String(mission.status || '').toUpperCase()));
  }

  async function deleteOwnRequest(requestId) {
    if (!UUID_RE.test(String(requestId || ''))) return;
    const c = client();
    const user = await activeUser();
    if (!c?.supabase || !user) {
      notify('warning', 'Connectez-vous pour gérer ce besoin.');
      return;
    }

    const { data: request, error: readError } = await c.supabase
      .from('requests')
      .select('id,requester_id,description,title,status')
      .eq('id', requestId)
      .maybeSingle();

    if (readError || !request) {
      notify('warning', 'Ce besoin est introuvable ou a déjà été supprimé.');
      return;
    }
    if (request.requester_id !== user.id) {
      notify('warning', 'Seul l’auteur de ce besoin peut le supprimer.');
      return;
    }
    if (await hasActiveMission(requestId)) {
      notify('warning', 'Ce besoin est lié à une mission en cours. Terminez ou annulez la mission avant de le supprimer.');
      return;
    }
    if (!(await confirmDelete())) return;

    const { data: deleted, error } = await c.supabase
      .from('requests')
      .delete()
      .eq('id', requestId)
      .eq('requester_id', user.id)
      .select('id');

    if (error || !deleted?.length) {
      console.error('[OWNER_ACTIONS] delete request failed', error);
      notify('warning', 'La suppression n’a pas pu être effectuée.');
      return;
    }

    document.getElementById(requestId)?.remove();
    document.querySelectorAll(`[data-request-id="${requestId}"]`).forEach((el) => el.closest('.flash-card, .activity-card-row')?.remove());
    notify('success', 'Besoin supprimé définitivement.');

    if (typeof window.loadBokantajFeedFromSupabase === 'function') {
      try { await window.loadBokantajFeedFromSupabase(); } catch (_) {}
    }
    if (typeof window.switchActivityTab === 'function') {
      try { await window.switchActivityTab('requests', user.id); } catch (_) {}
    }
  }

  function openManager(requestId) {
    document.getElementById('lyannOwnerActionsModal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'lyannOwnerActionsModal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(15,23,18,.55);display:flex;align-items:flex-end;justify-content:center;padding:16px;box-sizing:border-box;';
    overlay.innerHTML = `
      <div role="dialog" aria-modal="true" aria-label="Gérer mon besoin" style="width:min(520px,100%);background:#fff;border-radius:24px;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:Outfit,sans-serif;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;">
          <strong style="font-size:1.1rem;color:#17231C;">Gérer mon besoin</strong>
          <button type="button" data-owner-action="close" aria-label="Fermer" style="width:44px;height:44px;border-radius:50%;border:1px solid #D9E2DC;background:#F7FAF8;font-size:1.25rem;cursor:pointer;">×</button>
        </div>
        <button type="button" data-owner-action="view" style="width:100%;min-height:48px;border:1px solid #4A7C59;border-radius:14px;background:#fff;color:#1F3827;font-weight:800;font-size:.95rem;cursor:pointer;margin-bottom:10px;">Voir le besoin</button>
        <button type="button" data-owner-action="delete" style="width:100%;min-height:48px;border:1px solid #E11D48;border-radius:14px;background:#FFF1F2;color:#BE123C;font-weight:800;font-size:.95rem;cursor:pointer;">Supprimer définitivement</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-owner-action]')?.dataset.ownerAction;
      if (!action && event.target !== overlay) return;
      if (!action || action === 'close') { overlay.remove(); return; }
      if (action === 'view') {
        overlay.remove();
        if (typeof window.openLyannDetailModal === 'function') window.openLyannDetailModal(requestId);
        else if (typeof window.openHelpDetailModal === 'function') window.openHelpDetailModal(requestId);
        return;
      }
      if (action === 'delete') {
        overlay.remove();
        await deleteOwnRequest(requestId);
      }
    });
  }

  function requestIdFromActivityRow(row) {
    const raw = row.getAttribute('onclick') || '';
    const match = raw.match(/open(?:LyannDetailModal|HelpDetailModal)\(['"]([0-9a-f-]{36})['"]\)/i);
    return match?.[1] || '';
  }

  function decorateActivityRows(root = document) {
    root.querySelectorAll?.('.activity-card-row:not([data-owner-actions-ready])').forEach((row) => {
      const requestId = requestIdFromActivityRow(row);
      if (!UUID_RE.test(requestId)) return;
      row.dataset.ownerActionsReady = 'true';
      const controls = row.querySelector('.row-right-badge') || row;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'owner-request-manage-btn';
      button.dataset.requestId = requestId;
      button.innerHTML = '<i class="ph ph-sliders"></i> Gérer';
      button.style.cssText = 'min-height:44px;padding:7px 12px;border:1px solid #4A7C59;border-radius:12px;background:#fff;color:#1F3827;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:6px;';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openManager(requestId);
      });
      controls.appendChild(button);
    });
  }

  document.addEventListener('click', (event) => {
    const manage = event.target.closest('.btn-open-lyann-detail[data-request-id]');
    if (!manage || !/gérer/i.test(manage.textContent || '')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openManager(manage.dataset.requestId);
  }, true);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) decorateActivityRows(node);
      });
    }
  });

  function start() {
    decorateActivityRows(document);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.LYANN_OWNER_ACTIONS = { deleteOwnRequest, openManager };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
