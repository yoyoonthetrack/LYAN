(() => {
  'use strict';

  if (window.LYANN_MESSAGING_REPOSITORY) return;

  const CONVERSATION_TTL_MS = 30_000;
  const MESSAGES_TTL_MS = 5_000;

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

  function invalidateConversation(userId, contactId, conversationId) {
    const c = cache();
    if (!c) return;
    if (userId && contactId) c.invalidate('chat-conversation', pairKey(userId, contactId));
    if (conversationId) c.invalidate('chat-messages', conversationId);
  }

  function invalidateMessages(conversationId) {
    const c = cache();
    if (c && conversationId) c.invalidate('chat-messages', conversationId);
  }

  window.LYANN_MESSAGING_REPOSITORY = {
    findConversationId,
    getMessages,
    invalidateConversation,
    invalidateMessages
  };
})();
