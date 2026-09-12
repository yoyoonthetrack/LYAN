(() => {
  'use strict';

  if (window.LYANN_MESSAGING_REPOSITORY) return;

  const CONVERSATION_TTL_MS = 30_000;
  const MESSAGES_TTL_MS = 5_000;
  const QUOTE_CONTEXT_TTL_MS = 10_000;

  function api() {
    return window.LYANN_API_CLIENT || window.apiClient || null;
  }

  function cache() {
    return window.LYANN_DATA_CACHE || null;
  }

  function pairKey(userId, contactId) {
    return [String(userId || ''), String(contactId || '')].sort().join(':');
  }

  function mapMessage(row, userId) {
    const raw = row && typeof row.content === 'string' ? row.content : '';
    let txData = null;
    let type = 'text';
    if (raw.startsWith('{')) {
      try {
        txData = JSON.parse(raw);
        type = 'transactional';
      } catch (_) {
        txData = null;
        type = 'text';
      }
    }
    return {
      id: row.id,
      text: raw,
      sender: row.sender_id === userId ? 'me' : 'them',
      timestamp: new Date(row.created_at).getTime(),
      type,
      txData,
      status: 'read'
    };
  }

  async function findConversationId(userId, contactId, options = {}) {
    const client = api();
    if (!client || !client.supabase || !userId || !contactId) return null;

    const c = cache();
    const key = pairKey(userId, contactId);
    if (options.fresh && c) c.invalidate('chat-conversation', key);

    const loader = async () => {
      const { data: mine, error: mineError } = await client.supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId);
      if (mineError) throw mineError;
      if (!mine || mine.length === 0) return null;

      const conversationIds = mine.map((row) => row.conversation_id).filter(Boolean);
      if (conversationIds.length === 0) return null;

      const { data: shared, error: sharedError } = await client.supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', contactId)
        .in('conversation_id', conversationIds)
        .limit(1);
      if (sharedError) throw sharedError;
      return shared && shared[0] ? shared[0].conversation_id : null;
    };

    return c
      ? c.dedupe('chat-conversation', key, loader, CONVERSATION_TTL_MS)
      : loader();
  }

  async function getMessages(userId, contactId, options = {}) {
    const client = api();
    if (!client || !client.supabase || !userId || !contactId) return [];

    const conversationId = await findConversationId(userId, contactId, options);
    if (!conversationId) return [];

    const c = cache();
    if (options.fresh && c) c.invalidate('chat-messages', conversationId);

    const loader = async () => {
      const { data, error } = await client.supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []).map((row) => mapMessage(row, userId));
    };

    return c
      ? c.dedupe('chat-messages', conversationId, loader, MESSAGES_TTL_MS)
      : loader();
  }

  async function getQuoteContext(userId, contactId, options = {}) {
    const client = api();
    if (!client || !client.supabase || !userId || !contactId) return [];

    const c = cache();
    const key = pairKey(userId, contactId);
    if (options.fresh && c) c.invalidate('chat-quote-context', key);

    const loader = async () => {
      const invitation = typeof client.getActiveInvitationBetween === 'function'
        ? await client.getActiveInvitationBetween(userId, contactId)
        : null;
      if (!invitation || !invitation.id) return [];

      const { data: quotes, error: quoteError } = await client.supabase
        .from('quotes')
        .select('*')
        .eq('request_invitation_id', invitation.id)
        .order('created_at', { ascending: false });
      if (quoteError) throw quoteError;
      if (!quotes || quotes.length === 0) return [];

      const quoteIds = quotes.map((quote) => quote.id).filter(Boolean);
      let milestones = [];
      if (quoteIds.length > 0) {
        const { data: milestoneRows, error: milestoneError } = await client.supabase
          .from('milestones')
          .select('*')
          .in('quote_id', quoteIds)
          .order('position', { ascending: true });
        if (milestoneError) {
          const fallback = await client.supabase
            .from('milestones')
            .select('*')
            .in('quote_id', quoteIds)
            .order('created_at', { ascending: true });
          if (fallback.error) throw fallback.error;
          milestones = fallback.data || [];
        } else {
          milestones = milestoneRows || [];
        }
      }

      const byQuote = new Map();
      for (const milestone of milestones) {
        if (!byQuote.has(milestone.quote_id)) byQuote.set(milestone.quote_id, []);
        byQuote.get(milestone.quote_id).push(milestone);
      }

      return quotes.map((quote) => ({
        ...quote,
        milestones: byQuote.get(quote.id) || []
      }));
    };

    return c
      ? c.dedupe('chat-quote-context', key, loader, QUOTE_CONTEXT_TTL_MS)
      : loader();
  }

  function invalidateConversation(userId, contactId, conversationId) {
    const c = cache();
    if (!c) return;
    if (userId && contactId) {
      const key = pairKey(userId, contactId);
      c.invalidate('chat-conversation', key);
      c.invalidate('chat-quote-context', key);
    }
    if (conversationId) c.invalidate('chat-messages', conversationId);
  }

  function invalidateMessages(conversationId) {
    const c = cache();
    if (c && conversationId) c.invalidate('chat-messages', conversationId);
  }

  function invalidateQuoteContext(userId, contactId) {
    const c = cache();
    if (c && userId && contactId) c.invalidate('chat-quote-context', pairKey(userId, contactId));
  }

  window.LYANN_MESSAGING_REPOSITORY = {
    findConversationId,
    getMessages,
    getQuoteContext,
    invalidateConversation,
    invalidateMessages,
    invalidateQuoteContext
  };
})();