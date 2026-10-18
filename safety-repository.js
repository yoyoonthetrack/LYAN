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

  const REPORT_DAILY_LIMIT = 10;
  const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

  function reportError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function composeReportDetails(details, context) {
    const lines = [];
    const body = String(details || '').trim();
    if (body) lines.push(body);
    const source = context && context.source === 'conversation' ? 'conversation' : 'profil';
    lines.push('Origine : ' + source);
    if (context && context.conversationId) lines.push('Conversation : ' + context.conversationId);
    return lines.join('\n');
  }

  function missingReportRpc(error) {
    const message = String(error && (error.message || error.details || error.code) || '');
    return error && (error.code === 'PGRST202' || /submit_user_report|could not find the function|schema cache/i.test(message));
  }

  async function assertReportAllowed(client, reporterId, targetUserId) {
    const { data: openRows, error: openError } = await client.supabase
      .from('user_reports')
      .select('id')
      .eq('reporter_id', reporterId)
      .eq('target_user_id', targetUserId)
      .in('status', ['OPEN', 'IN_REVIEW'])
      .limit(1);
    if (openError) throw openError;
    if (openRows && openRows.length) throw reportError('Un signalement est déjà en cours pour ce membre.', 'duplicate_report');
    const since = new Date(Date.now() - REPORT_WINDOW_MS).toISOString();
    const { count, error: countError } = await client.supabase
      .from('user_reports')
      .select('id', { count: 'exact', head: true })
      .eq('reporter_id', reporterId)
      .gte('created_at', since);
    if (countError) throw countError;
    if ((count || 0) >= REPORT_DAILY_LIMIT) {
      throw reportError('Vous avez atteint la limite de signalements pour aujourd’hui.', 'rate_limited');
    }
  }

  async function listBlockedProfiles() {
    await refresh({ fresh: true });
    const ids = [...blockedIds];
    if (!ids.length) return [];
    const client = api();
    if (!client?.supabase) throw new Error('Supabase indisponible');
    const { data, error } = await client.supabase
      .from('profiles')
      .select('id, first_name, last_name, avatar_url')
      .in('id', ids);
    const byId = new Map();
    if (!error && Array.isArray(data)) data.forEach((row) => byId.set(row.id, row));
    return ids.map((id) => byId.get(id) || { id });
  }

  async function report(targetUserId, reason, details = '', context = {}) {
    const reporterId = await currentUserId();
    if (!reporterId || !targetUserId || reporterId === targetUserId) throw reportError('Signalement invalide', 'invalid');
    const client = api();
    if (!client?.supabase) throw new Error('Supabase indisponible');
    const source = context && context.source === 'conversation' ? 'conversation' : 'profile';
    const conversationId = context && context.conversationId ? context.conversationId : null;
    const composed = composeReportDetails(details, { source, conversationId });
    const reasonText = String(reason || '').trim() || 'Autre';
    const { data, error } = await client.supabase.rpc('submit_user_report', {
      p_target_user_id: targetUserId,
      p_reason: reasonText,
      p_details: composed,
      p_conversation_id: conversationId,
      p_source: source
    });
    if (!error) return data;
    if (!missingReportRpc(error)) throw error;
    await assertReportAllowed(client, reporterId, targetUserId);
    const payload = {
      reporter_id: reporterId,
      target_user_id: targetUserId,
      reason: reasonText,
      details: composed || null
    };
    const inserted = await client.supabase.from('user_reports').insert(payload).select('id,status,created_at').single();
    if (inserted.error) {
      if (inserted.error.code === '23505') throw reportError('Un signalement est déjà en cours pour ce membre.', 'duplicate_report');
      throw inserted.error;
    }
    return inserted.data;
  }

  const EVIDENCE_MIME = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif'
  };

  async function attachReportEvidence(reportId, files) {
    const reporterId = await currentUserId();
    const list = Array.from(files || []).filter(Boolean).slice(0, 4);
    if (!reporterId || !reportId || !list.length) return [];
    const client = api();
    if (!client?.supabase) throw new Error('Supabase indisponible');
    const saved = [];
    for (const file of list) {
      const mime = EVIDENCE_MIME[file.type] ? file.type : '';
      if (!mime) throw new Error('La preuve doit être une image JPEG, PNG, WebP ou HEIC.');
      if (file.size > 8 * 1024 * 1024) throw new Error('Chaque preuve doit faire moins de 8 Mo.');
      const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : null;
      if (!id) throw new Error('Preuve indisponible sur cet appareil.');
      const path = reporterId + '/' + reportId + '/' + id + '.' + EVIDENCE_MIME[mime];
      const uploaded = await client.supabase.storage.from('report-evidence').upload(path, file, {
        contentType: mime,
        upsert: false
      });
      if (uploaded.error) throw uploaded.error;
      const row = await client.supabase.from('report_evidence').insert({
        report_id: reportId,
        reporter_id: reporterId,
        storage_path: path,
        mime_type: mime,
        byte_size: file.size
      }).select('id').single();
      if (row.error) throw row.error;
      saved.push(row.data);
    }
    return saved;
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
    attachReportEvidence,
    listBlockedProfiles,
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
