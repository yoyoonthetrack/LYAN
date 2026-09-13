// LYANN shared user-safety repository.
// Authoritative blocks/reports live in Supabase for Web and Capacitor.
(function () {
  'use strict';

  if (window.LYANN_SAFETY_REPOSITORY) return;

  const blockedIds = new Set();
  let loadedForUserId = null;
  let loadingPromise = null;

  function api() {
    return window.LYANN_API_CLIENT || window.apiClient || null;
  }

  async function currentUserId() {
    if (window.LYANN_AUTH_STATE) {
      try {
        await window.LYANN_AUTH_STATE.ready();
        return window.LYANN_AUTH_STATE.getSnapshot?.().userId || null;
      } catch (_) {}
    }
    if (window.LYANN_SESSION) {
      try { return (await window.LYANN_SESSION.getUser())?.id || null; } catch (_) {}
    }
    return window.CURRENT_USER_ID || null;
  }

  async function refresh(options = {}) {
    const userId = await currentUserId();
    if (!userId) {
      blockedIds.clear();
      loadedForUserId = null;
      return blockedIds;
    }
    if (!options.fresh && loadedForUserId === userId) return blockedIds;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      const client = api();
      if (!client?.supabase) throw new Error('Supabase indisponible');
      const { data, error } = await client.supabase
        .from('user_blocks')
        .select('blocked_id')
        .eq('blocker_id', userId);
      if (error) throw error;
      blockedIds.clear();
      (data || []).forEach((row) => row.blocked_id && blockedIds.add(row.blocked_id));
      loadedForUserId = userId;
      return blockedIds;
    })().finally(() => { loadingPromise = null; });

    return loadingPromise;
  }

  function isBlocked(userId) {
    return !!userId && blockedIds.has(userId);
  }

  async function block(userId) {
    const blockerId = await currentUserId();
    if (!blockerId || !userId || blockerId === userId) throw new Error('Blocage invalide');
    const client = api();
    if (!client?.supabase) throw new Error('Supabase indisponible');
    const { error } = await client.supabase
      .from('user_blocks')
      .upsert({ blocker_id: blockerId, blocked_id: userId }, { onConflict: 'blocker_id,blocked_id' });
    if (error) throw error;
    blockedIds.add(userId);
    loadedForUserId = blockerId;
    return true;
  }

  async function unblock(userId) {
    const blockerId = await currentUserId();
    if (!blockerId || !userId) throw new Error('Déblocage invalide');
    const client = api();
    if (!client?.supabase) throw new Error('Supabase indisponible');
    const { error } = await client.supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', userId);
    if (error) throw error;
    blockedIds.delete(userId);
    loadedForUserId = blockerId;
    return true;
  }

  async function report(targetUserId, reason, details = '') {
    const reporterId = await currentUserId();
    if (!reporterId || !targetUserId || reporterId === targetUserId) throw new Error('Signalement invalide');
    const client = api();
    if (!client?.supabase) throw new Error('Supabase indisponible');
    const payload = {
      reporter_id: reporterId,
      target_user_id: targetUserId,
      reason: String(reason || '').trim() || 'OTHER',
      details: String(details || '').trim() || null
    };
    const { data, error } = await client.supabase.from('user_reports').insert(payload).select('id,status,created_at').single();
    if (error) throw error;
    return data;
  }

  function reset() {
    blockedIds.clear();
    loadedForUserId = null;
  }

  const repository = Object.freeze({
    refresh,
    isBlocked,
    block,
    unblock,
    report,
    reset,
    getBlockedIds: () => [...blockedIds]
  });

  window.LYANN_SAFETY_REPOSITORY = repository;

  window.addEventListener('lyann:auth-changed', () => {
    reset();
    refresh().catch((error) => console.warn('[SAFETY] refresh failed', error));
  });
  window.addEventListener('lyann:auth-ready', () => {
    refresh().catch((error) => console.warn('[SAFETY] initial refresh failed', error));
  }, { once: true });
})();
