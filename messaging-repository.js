(() => {
  'use strict';

  if (window.LYANN_MESSAGING_REPOSITORY) return;

  const CONVERSATION_TTL_MS = 30_000;
  const MESSAGES_TTL_MS = 0;
  const SUPPORT_NAME = 'Support LYANN';
  const QUOTE_CONTEXT_TTL_MS = 10_000;
  const LIST_TTL_MS = 10_000;

  const warm = { userId: null, conversations: null, messages: new Map(), byConversation: new Map(), at: 0 };
  let warmPromise = null;

  function bindWarmUser(userId) {
    if (warm.userId === userId) return;
    warm.userId = userId;
    warm.conversations = null;
    warm.messages = new Map();
    warm.byConversation = new Map();
    warm.at = 0;
  }

  function peekConversations(userId) {
    return warm.userId === userId ? warm.conversations : null;
  }

  function peekMessages(userId, contactId) {
    if (warm.userId !== userId || !contactId) return null;
    return warm.messages.get(String(contactId)) || null;
  }

  function rememberMessages(userId, contactId, conversationId, rows) {
    bindWarmUser(userId);
    warm.messages.set(String(contactId), rows || []);
    if (conversationId) warm.byConversation.set(String(conversationId), String(contactId));
    warm.at = Date.now();
  }

  function forgetWarmMessages(userId, contactId, conversationId) {
    if (conversationId && warm.byConversation.has(String(conversationId))) {
      const mapped = warm.byConversation.get(String(conversationId));
      warm.messages.delete(mapped);
      warm.byConversation.delete(String(conversationId));
    }
    if (contactId && (!userId || warm.userId === userId)) warm.messages.delete(String(contactId));
  }

  function api() { return window.LYANN_API_CLIENT || window.apiClient || null; }
  function cache() { return window.LYANN_DATA_CACHE || null; }
  function pairKey(userId, contactId) { return [String(userId || ''), String(contactId || '')].sort().join(':'); }

  const TIMELINE_PREVIEW = {
    visit_proposed: '📅 Visite proposée',
    visit_accepted: '✓ Visite acceptée',
    visit_declined: 'Visite refusée',
    visit_rescheduled: '📅 Visite proposée',
    quote_created: '📄 Devis proposé',
    quote_updated: '📄 Devis proposé',
    quote_accepted: '✅ Devis accepté',
    quote_declined: 'Devis refusé',
    payment_requested: '💳 Paiement demandé',
    payment_secured: '🔒 Fonds sécurisés',
    payment_failed: '❌ Paiement échoué',
    milestone_created: '🔨 Jalon',
    milestone_completed: '✓ Travail déclaré terminé',
    milestone_approved: '✅ Jalon validé',
    funds_released: '💶 Fonds libérés',
    mission_started: 'Mission commencée',
    mission_completed: 'Mission terminée',
    mission_cancelled: 'Mission annulée',
    review_requested: 'Avis demandé',
    review_submitted: 'Avis publié'
  };

  function formatMessagePreview(input) {
    const row = input && typeof input === 'object' ? input : { content: input };
    const messageType = row.message_type || row.messageType || '';
    if (TIMELINE_PREVIEW[messageType]) return TIMELINE_PREVIEW[messageType];
    const attachmentType = row.attachment_type || row.attachmentType || '';
    if (attachmentType === 'photo') return '📷 Photo';
    if (attachmentType === 'document') {
      const name = String(row.attachment_name || row.attachmentName || '').replace(/[\r\n\t]+/g, ' ').trim();
      return name ? ('📄 ' + name.slice(0, 80)) : '📄 Document';
    }
    const raw = typeof row.content === 'string' ? row.content.trim() : '';
    if (!raw) return 'Nouveau message';
    if (raw.startsWith('📅')) return '📅 Rendez-vous proposé';
    if (!raw.startsWith('{')) return raw.replace(/\s+/g, ' ').slice(0, 140);
    let data = null;
    try { data = JSON.parse(raw); } catch (_) { data = null; }
    if (!data || typeof data !== 'object') return 'Nouveau message';
    const kind = String(data.type || data.cardType || data.event || data.status || '').toLowerCase();
    if (/devis|quote/.test(kind)) return '📄 Devis proposé';
    if (/rendez|date|visit|appointment/.test(kind)) return '📅 Rendez-vous proposé';
    if (/pay/.test(kind)) return 'Paiement effectué';
    if (/jalon|milestone/.test(kind)) return 'Jalon mis à jour';
    if (/propos|price|offer/.test(kind)) return 'Proposition';
    return 'Nouveau message';
  }

  function messageCursorValue(cursor) {
    if (!cursor) return null;
    if (typeof cursor === 'string' || typeof cursor === 'number') return { createdAt: new Date(cursor).toISOString(), id: '' };
    const createdAt = cursor.createdAt || cursor.created_at || '';
    const id = cursor.id ? String(cursor.id) : '';
    if (!createdAt) return null;
    return { createdAt: String(createdAt), id: id };
  }

  function applyMessageCursor(query, cursor, direction) {
    const point = messageCursorValue(cursor);
    if (!point) return query;
    const op = direction === 'after' ? 'gt' : 'lt';
    if (!point.id) return direction === 'after' ? query.gt('created_at', point.createdAt) : query.lt('created_at', point.createdAt);
    const ts = point.createdAt.replace(/"/g, '');
    const id = point.id.replace(/[^0-9a-f-]/gi, '');
    return query.or('created_at.' + op + '."' + ts + '",and(created_at.eq."' + ts + '",id.' + op + '.' + id + ')');
  }

  function compareMappedMessages(a, b) {
    const ta = Date.parse(a.createdAt || '') || 0;
    const tb = Date.parse(b.createdAt || '') || 0;
    if (ta !== tb) return ta - tb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  }

  function mapMessage(row, userId) {
    const raw = row && typeof row.content === 'string' ? row.content : '';
    let txData = null;
    let type = 'text';
    const attachmentType = row.attachment_type || '';
    const messageType = row.message_type || '';
    if (messageType && messageType !== 'text') type = messageType;
    else if (attachmentType === 'photo' || attachmentType === 'document') type = attachmentType;
    else if (raw.startsWith('{')) {
      try { txData = JSON.parse(raw); type = 'transactional'; } catch (_) { txData = null; }
    }
    return {
      id: row.id,
      text: raw,
      sender: row.sender_id === userId ? 'me' : 'them',
      timestamp: new Date(row.created_at).getTime(),
      createdAt: row.created_at || null,
      type,
      txData,
      status: row.is_read ? 'read' : 'sent',
      attachmentPath: row.attachment_url || '',
      attachmentType: attachmentType,
      attachmentName: row.attachment_name || '',
      attachmentSize: row.attachment_size,
      attachmentMime: row.attachment_mime || '',
      messageType: messageType || (attachmentType === 'photo' || attachmentType === 'document' ? attachmentType : 'text'),
      entityType: row.entity_type || '',
      entityId: row.entity_id || '',
      metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
    };
  }

  async function findConversationId(userId, contactId, options = {}) {
    const client = api();
    if (!client?.supabase || !userId || !contactId) return null;
    const c = cache();
    const key = pairKey(userId, contactId);
    if (options.fresh && c) c.invalidate('chat-conversation', key);
    const loader = async () => {
      const { data: mine, error: mineError } = await client.supabase.from('conversation_participants').select('conversation_id').eq('user_id', userId);
      if (mineError) throw mineError;
      const ids = (mine || []).map((row) => row.conversation_id).filter(Boolean);
      if (!ids.length) return null;
      const { data: shared, error: sharedError } = await client.supabase.from('conversation_participants').select('conversation_id').eq('user_id', contactId).in('conversation_id', ids).limit(1);
      if (sharedError) throw sharedError;
      return shared?.[0]?.conversation_id || null;
    };
    const id = c ? await c.dedupe('chat-conversation', key, loader, CONVERSATION_TTL_MS) : await loader();
    // A missing conversation must not stay cached, or the first real message
    // is read back as an empty thread.
    if (!id && c) c.invalidate('chat-conversation', key);
    return id;
  }

  async function listConversations(userId, options = {}) {
    const client = api();
    if (!client?.supabase || !userId) return [];
    const warmedList = peekConversations(userId);
    if (warmedList && !options.fresh) return warmedList;
    const c = cache();
    const key = String(userId);
    if (options.fresh && c) c.invalidate('chat-conversation-list', key);

    const loader = async () => {
      const { data: mine, error: mineError } = await client.supabase.from('conversation_participants').select('conversation_id').eq('user_id', userId);
      if (mineError) throw mineError;
      const conversationIds = [...new Set((mine || []).map((row) => row.conversation_id).filter(Boolean))];
      if (!conversationIds.length) return [];

      const [participantResult, messageResult] = await Promise.all([
        client.supabase.from('conversation_participants').select('conversation_id,user_id').in('conversation_id', conversationIds),
        client.supabase.from('messages').select('id,conversation_id,sender_id,content,created_at,is_read,attachment_type,attachment_name,message_type').in('conversation_id', conversationIds).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(Math.min(conversationIds.length * 4, 160))
      ]);
      if (participantResult.error) throw participantResult.error;
      let messageRows = messageResult.data || [];
      if (messageResult.error && /attachment_type|attachment_name|message_type/.test(messageResult.error.message || '')) {
        const fallback = await client.supabase.from('messages').select('id,conversation_id,sender_id,content,created_at,is_read').in('conversation_id', conversationIds).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(Math.min(conversationIds.length * 4, 160));
        if (fallback.error) throw fallback.error;
        messageRows = fallback.data || [];
      } else if (messageResult.error) throw messageResult.error;

      const contactByConversation = new Map();
      const latestByConversation = new Map();
      for (const row of participantResult.data || []) {
        if (row.user_id && row.user_id !== userId && !contactByConversation.has(row.conversation_id)) contactByConversation.set(row.conversation_id, row.user_id);
      }
      const unreadConversations = new Set();
      for (const row of messageRows) {
        const current = latestByConversation.get(row.conversation_id);
        const newer = !current || String(row.created_at || '') > String(current.created_at || '') || (row.created_at === current.created_at && String(row.id) > String(current.id));
        if (newer) latestByConversation.set(row.conversation_id, row);
        if (row.is_read === false && row.sender_id && row.sender_id !== userId) unreadConversations.add(row.conversation_id);
        if (!contactByConversation.has(row.conversation_id) && row.sender_id && row.sender_id !== userId) contactByConversation.set(row.conversation_id, row.sender_id);
      }

      const contactIds = [...new Set([...contactByConversation.values()].filter(Boolean))];
      const profilesById = new Map();
      if (contactIds.length) {
        try {
          const { data: profiles } = await client.supabase.from('public_profiles').select('id,first_name,last_name,avatar_url').in('id', contactIds);
          for (const profile of profiles || []) profilesById.set(profile.id, profile);
        } catch (_) {}
        const missing = contactIds.filter((id) => !profilesById.has(id));
        if (missing.length) {
          try {
            const { data: ownProfiles } = await client.supabase.from('profiles').select('id,first_name,last_name,avatar_url').in('id', missing);
            for (const profile of ownProfiles || []) profilesById.set(profile.id, profile);
          } catch (_) {}
        }
      }

      function contactLabel(profile, isSupport) {
        if (isSupport) return SUPPORT_NAME;
        if (!profile) return 'Membre LYANN';
        if (typeof window.formatPublicName === 'function') {
          const formatted = window.formatPublicName(profile, null, '');
          if (formatted && formatted !== 'Lyanneur' && formatted !== 'Membre') return formatted;
        }
        const firstName = profile.first_name || '';
        const lastInitial = profile.last_name ? ` ${String(profile.last_name).charAt(0)}.` : '';
        return `${firstName}${lastInitial}`.trim() || 'Membre LYANN';
      }

      const rows = conversationIds.map((conversationId) => {
        const contactId = contactByConversation.get(conversationId);
        if (!contactId) return null;
        const profile = profilesById.get(contactId) || null;
        const latest = latestByConversation.get(conversationId) || null;
        const supportId = window.LYANN_SUPPORT_USER_ID;
        const isSupport = supportId && contactId === supportId;
        const name = contactLabel(profile, isSupport);
        const avatar = typeof window.getLyannAvatarUrl === 'function' ? window.getLyannAvatarUrl(profile?.avatar_url) : (profile?.avatar_url || '');
        const preview = latest ? formatMessagePreview(latest) : (isSupport ? 'Écrivez-nous ici' : '');
        return { conversationId, contactId, name, avatar, preview, lastMessageAt: latest?.created_at || null, pinned: !!isSupport, unread: unreadConversations.has(conversationId) };
      }).filter(Boolean).sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0);
      });
      bindWarmUser(userId);
      warm.conversations = rows;
      warm.at = Date.now();
      return rows;
    };

    const listed = c ? await c.dedupe('chat-conversation-list', key, loader, LIST_TTL_MS) : await loader();
    bindWarmUser(userId);
    warm.conversations = listed || [];
    warm.at = Date.now();
    return listed || [];
  }

  function messagePageSize(options) {
    const requested = Number(options && options.limit);
    if (Number.isFinite(requested) && requested > 0) return Math.min(Math.floor(requested), 200);
    return 50;
  }

  async function getMessages(userId, contactId, options = {}) {
    const client = api();
    if (!client?.supabase || !userId || !contactId) return [];
    const before = options.before || null;
    const after = options.after || null;
    const limit = messagePageSize(options);
    const cached = peekMessages(userId, contactId);
    if (Array.isArray(cached) && !options.fresh && !before && !after) return cached;
    const conversationId = await findConversationId(userId, contactId, options);
    if (!conversationId) return (before || after) ? [] : (cached || []);
    const c = cache();
    if (options.fresh && !before && !after && c) c.invalidate('chat-messages', conversationId);
    const loader = async () => {
      const ascending = Boolean(after);
      let query = client.supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending }).order('id', { ascending }).limit(limit);
      if (after) query = applyMessageCursor(query, after, 'after');
      else if (before) query = applyMessageCursor(query, before, 'before');
      const { data, error } = await query;
      if (error) throw error;
      const mapped = (data || []).map((row) => mapMessage(row, userId));
      if (!ascending) mapped.reverse();
      mapped.sort(compareMappedMessages);
      return mapped;
    };
    const cursorKey = after ? 'after' : before ? 'before' : 'latest';
    const cursor = messageCursorValue(after || before);
    const cacheKey = cursor ? `${conversationId}:${cursorKey}:${cursor.createdAt}:${cursor.id}:${limit}` : conversationId;
    const rows = c ? await c.dedupe('chat-messages', cacheKey, loader, MESSAGES_TTL_MS) : await loader();
    if (!before && !after) rememberMessages(userId, contactId, conversationId, rows);
    return rows;
  }

  function sortWarmConversations() {
    if (!Array.isArray(warm.conversations)) return;
    warm.conversations.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0);
    });
  }

  function noteIncomingPreview(userId, conversationId, content, createdAt, extra) {
    if (!userId || warm.userId !== userId || !conversationId || !Array.isArray(warm.conversations)) return null;
    const row = warm.conversations.find((item) => item.conversationId === conversationId);
    if (!row) return null;
    const payload = extra && typeof extra === 'object' ? { content, ...extra } : { content };
    row.preview = formatMessagePreview(payload);
    row.lastMessageAt = createdAt || new Date().toISOString();
    if (extra && Object.prototype.hasOwnProperty.call(extra, 'unread')) row.unread = !!extra.unread;
    sortWarmConversations();
    return row;
  }

  const inboxEnsure = new Map();

  async function ensureInboxConversation(userId, conversationId, detail) {
    if (!userId || !conversationId) return null;
    bindWarmUser(userId);
    if (!Array.isArray(warm.conversations)) warm.conversations = [];
    const existing = noteIncomingPreview(userId, conversationId, detail?.content || '', detail?.createdAt, detail);
    if (existing) return existing;
    if (inboxEnsure.has(conversationId)) return inboxEnsure.get(conversationId);
    const pending = (async () => {
      const client = api();
      if (!client?.supabase) return null;
      const { data: participants, error } = await client.supabase.from('conversation_participants').select('user_id').eq('conversation_id', conversationId);
      if (error) return null;
      const contactId = (participants || []).map((item) => item.user_id).find((id) => id && id !== userId);
      if (!contactId) return null;
      let profile = null;
      try {
        const { data } = await client.supabase.from('public_profiles').select('id,first_name,last_name,avatar_url').eq('id', contactId).maybeSingle();
        profile = data || null;
      } catch (_) {}
      const supportId = window.LYANN_SUPPORT_USER_ID;
      const isSupport = supportId && contactId === supportId;
      const name = isSupport ? 'Support LYANN' : (typeof window.formatPublicName === 'function' ? (window.formatPublicName(profile, null, 'Membre LYANN') || 'Membre LYANN') : ((profile?.first_name || 'Membre') + (profile?.last_name ? ' ' + String(profile.last_name).charAt(0) + '.' : '')));
      const avatar = typeof window.getLyannAvatarUrl === 'function' ? window.getLyannAvatarUrl(profile?.avatar_url) : (profile?.avatar_url || '');
      const row = {
        conversationId,
        contactId,
        name: name || 'Membre LYANN',
        avatar,
        preview: formatMessagePreview(detail || {}),
        lastMessageAt: detail?.createdAt || new Date().toISOString(),
        pinned: !!isSupport,
        unread: !!(detail && detail.unread)
      };
      const again = warm.conversations.find((item) => item.conversationId === conversationId);
      if (again) return noteIncomingPreview(userId, conversationId, detail?.content || '', detail?.createdAt, detail) || again;
      warm.conversations.push(row);
      sortWarmConversations();
      return row;
    })().finally(() => { inboxEnsure.delete(conversationId); });
    inboxEnsure.set(conversationId, pending);
    return pending;
  }

  async function warmInbox(userId) {
    if (!userId) return [];
    if (warmPromise) return warmPromise;
    if (warm.userId === userId && warm.conversations && Date.now() - warm.at < 20000) return warm.conversations;
    warmPromise = (async () => {
      const rows = await listConversations(userId, { fresh: true });
      const recent = [...rows].sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)).slice(0, 5);
      if (recent[0]) await getMessages(userId, recent[0].contactId, { fresh: true, limit: 50 }).catch(() => []);
      await Promise.all(recent.slice(1).map((row) => getMessages(userId, row.contactId, { fresh: true, limit: 50 }).catch(() => [])));
      return rows;
    })().finally(() => { warmPromise = null; });
    return warmPromise;
  }

  async function getQuoteContext(userId, contactId, options = {}) {
    const client = api();
    if (!client?.supabase || !userId || !contactId) return [];
    const c = cache();
    const key = pairKey(userId, contactId);
    if (options.fresh && c) c.invalidate('chat-quote-context', key);
    const loader = async () => {
      const invitation = typeof client.getActiveInvitationBetween === 'function' ? await client.getActiveInvitationBetween(userId, contactId) : null;
      if (!invitation?.id) return [];
      const { data: quotes, error: quoteError } = await client.supabase.from('quotes').select('*').eq('request_invitation_id', invitation.id).order('created_at', { ascending: false });
      if (quoteError) throw quoteError;
      if (!quotes?.length) return [];
      const quoteIds = quotes.map((quote) => quote.id).filter(Boolean);
      let milestones = [];
      if (quoteIds.length) {
        const primary = await client.supabase.from('milestones').select('*').in('quote_id', quoteIds).order('position', { ascending: true });
        if (primary.error) {
          const fallback = await client.supabase.from('milestones').select('*').in('quote_id', quoteIds).order('created_at', { ascending: true });
          if (fallback.error) throw fallback.error;
          milestones = fallback.data || [];
        } else milestones = primary.data || [];
      }
      const byQuote = new Map();
      for (const milestone of milestones) {
        if (!byQuote.has(milestone.quote_id)) byQuote.set(milestone.quote_id, []);
        byQuote.get(milestone.quote_id).push(milestone);
      }
      return quotes.map((quote) => ({ ...quote, milestones: byQuote.get(quote.id) || [] }));
    };
    return c ? c.dedupe('chat-quote-context', key, loader, QUOTE_CONTEXT_TTL_MS) : loader();
  }

  function invalidateConversation(userId, contactId, conversationId) {
    forgetWarmMessages(userId, contactId, conversationId);
    const c = cache();
    if (!c) return;
    if (userId && contactId) {
      const key = pairKey(userId, contactId);
      c.invalidate('chat-conversation', key);
      c.invalidate('chat-quote-context', key);
      c.invalidate('chat-conversation-list', String(userId));
    }
    if (conversationId) c.invalidate('chat-messages', conversationId);
  }
  function invalidateMessages(conversationId) {
    forgetWarmMessages(null, null, conversationId);
    const c = cache();
    if (c && conversationId) c.invalidate('chat-messages', conversationId);
  }
  function invalidateQuoteContext(userId, contactId) { const c = cache(); if (c && userId && contactId) c.invalidate('chat-quote-context', pairKey(userId, contactId)); }

  async function markConversationRead(userId, contactId) {
    const client = api();
    if (!client?.supabase || !userId || !contactId) return false;
    const conversationId = await findConversationId(userId, contactId);
    if (!conversationId) return false;
    const { error } = await client.supabase.from('messages').update({ is_read: true }).eq('conversation_id', conversationId).neq('sender_id', userId).eq('is_read', false);
    if (error) {
      console.warn('[messages] read receipt', error.message);
      return false;
    }
    if (Array.isArray(warm.conversations)) {
      warm.conversations.forEach((item) => {
        if (item.conversationId === conversationId || item.contactId === contactId) item.unread = false;
      });
    }
    window.dispatchEvent(new CustomEvent('lyann:chat-read', { detail: { userId, contactId, conversationId } }));
    if (typeof window.refreshMessageBadge === 'function') window.refreshMessageBadge(userId);
    return true;
  }

  window.LYANN_MESSAGING_REPOSITORY = { findConversationId, listConversations, getMessages, getQuoteContext, invalidateConversation, invalidateMessages, invalidateQuoteContext, peekConversations, peekMessages, warmInbox, markConversationRead, noteIncomingPreview, ensureInboxConversation, formatMessagePreview };
})();