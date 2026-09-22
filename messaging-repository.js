(() => {
  'use strict';

  if (window.LYANN_MESSAGING_REPOSITORY) return;

  const CONVERSATION_TTL_MS = 30_000;
  const MESSAGES_TTL_MS = 5_000;
  const QUOTE_CONTEXT_TTL_MS = 10_000;
  const LIST_TTL_MS = 10_000;

  function api() { return window.LYANN_API_CLIENT || window.apiClient || null; }
  function cache() { return window.LYANN_DATA_CACHE || null; }
  function pairKey(userId, contactId) { return [String(userId || ''), String(contactId || '')].sort().join(':'); }

  function mapMessage(row, userId) {
    const raw = row && typeof row.content === 'string' ? row.content : '';
    let txData = null;
    let type = 'text';
    if (raw.startsWith('{')) {
      try { txData = JSON.parse(raw); type = 'transactional'; } catch (_) { txData = null; }
    }
    return { id: row.id, text: raw, sender: row.sender_id === userId ? 'me' : 'them', timestamp: new Date(row.created_at).getTime(), type, txData, status: 'read' };
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
    return c ? c.dedupe('chat-conversation', key, loader, CONVERSATION_TTL_MS) : loader();
  }

  async function listConversations(userId, options = {}) {
    const client = api();
    if (!client?.supabase || !userId) return [];
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
        client.supabase.from('messages').select('id,conversation_id,sender_id,content,created_at').in('conversation_id', conversationIds).order('created_at', { ascending: false })
      ]);
      if (participantResult.error) throw participantResult.error;
      if (messageResult.error) throw messageResult.error;

      const contactByConversation = new Map();
      const latestByConversation = new Map();
      for (const row of participantResult.data || []) {
        if (row.user_id && row.user_id !== userId && !contactByConversation.has(row.conversation_id)) contactByConversation.set(row.conversation_id, row.user_id);
      }
      for (const row of messageResult.data || []) {
        if (!latestByConversation.has(row.conversation_id)) latestByConversation.set(row.conversation_id, row);
        if (!contactByConversation.has(row.conversation_id) && row.sender_id && row.sender_id !== userId) contactByConversation.set(row.conversation_id, row.sender_id);
      }

      const contactIds = [...new Set([...contactByConversation.values()].filter(Boolean))];
      const profilesById = new Map();
      if (contactIds.length) {
        try {
          const { data: profiles } = await client.supabase.from('profiles').select('id,first_name,last_name,display_name,avatar_url').in('id', contactIds);
          for (const profile of profiles || []) profilesById.set(profile.id, profile);
        } catch (_) {}
      }

      return conversationIds.map((conversationId) => {
        const contactId = contactByConversation.get(conversationId);
        if (!contactId) return null;
        const profile = profilesById.get(contactId) || null;
        const latest = latestByConversation.get(conversationId) || null;
        const supportId = window.LYANN_SUPPORT_USER_ID;
        const isSupport = supportId && contactId === supportId;
        const firstName = isSupport ? 'Aide' : (profile?.first_name || profile?.display_name || 'Membre');
        const lastName = isSupport ? ' LYANN' : (profile?.last_name ? ` ${String(profile.last_name).charAt(0)}.` : '');
        const name = isSupport ? 'Aide LYANN' : (`${firstName}${lastName}`.trim() || 'Membre LYANN');
        const avatar = typeof window.getLyannAvatarUrl === 'function' ? window.getLyannAvatarUrl(profile?.avatar_url) : (profile?.avatar_url || '');
        return { conversationId, contactId, name, avatar, preview: latest?.content || (isSupport ? 'Écrivez-nous ici' : ''), lastMessageAt: latest?.created_at || null, pinned: !!isSupport };
      }).filter(Boolean).sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0);
      });
    };

    return c ? c.dedupe('chat-conversation-list', key, loader, LIST_TTL_MS) : loader();
  }

  async function getMessages(userId, contactId, options = {}) {
    const client = api();
    if (!client?.supabase || !userId || !contactId) return [];
    const conversationId = await findConversationId(userId, contactId, options);
    if (!conversationId) return [];
    const c = cache();
    if (options.fresh && c) c.invalidate('chat-messages', conversationId);
    const loader = async () => {
      const { data, error } = await client.supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []).map((row) => mapMessage(row, userId));
    };
    return c ? c.dedupe('chat-messages', conversationId, loader, MESSAGES_TTL_MS) : loader();
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
  function invalidateMessages(conversationId) { const c = cache(); if (c && conversationId) c.invalidate('chat-messages', conversationId); }
  function invalidateQuoteContext(userId, contactId) { const c = cache(); if (c && userId && contactId) c.invalidate('chat-quote-context', pairKey(userId, contactId)); }

  window.LYANN_MESSAGING_REPOSITORY = { findConversationId, listConversations, getMessages, getQuoteContext, invalidateConversation, invalidateMessages, invalidateQuoteContext };
})();