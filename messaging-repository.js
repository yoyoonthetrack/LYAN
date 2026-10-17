(() => {
  'use strict';

  if (window.LYANN_MESSAGING_REPOSITORY) return;

  const CONVERSATION_TTL_MS = 30_000;
  const MESSAGES_TTL_MS = 0;
  const SUPPORT_NAME = 'Support LYANN';
  const QUOTE_CONTEXT_TTL_MS = 10_000;
  const LIST_TTL_MS = 10_000;

  const warm = { userId: null, conversations: null, messages: new Map(), byConversation: new Map(), at: 0 };
  const messageEpoch = new Map();
  let warmPromise = null;

  function bumpMessageEpoch(contactId) {
    if (!contactId) return 0;
    const key = String(contactId);
    const next = (messageEpoch.get(key) || 0) + 1;
    messageEpoch.set(key, next);
    return next;
  }

  function currentMessageEpoch(contactId) {
    return messageEpoch.get(String(contactId || '')) || 0;
  }

  function bindWarmUser(userId) {
    if (warm.userId === userId) return;
    warm.userId = userId;
    warm.conversations = null;
    warm.messages = new Map();
    warm.byConversation = new Map();
    warm.at = 0;
  }

  function releaseWarmCache() {
    warm.userId = null;
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
    const next = Array.isArray(rows) ? rows.slice() : [];
    const cached = warm.messages.get(String(contactId));
    if (Array.isArray(cached) && cached.length) {
      const byId = new Map();
      cached.forEach((row) => { if (row && row.id) byId.set(String(row.id), row); });
      next.forEach((row) => { if (row && row.id) byId.set(String(row.id), row); });
      const merged = [...byId.values()].sort(compareMappedMessages);
      warm.messages.set(String(contactId), merged);
    } else {
      warm.messages.set(String(contactId), next);
    }
    if (conversationId) warm.byConversation.set(String(conversationId), String(contactId));
    warm.at = Date.now();
  }

  function ingestIncomingMessage(userId, contactId, conversationId, row) {
    if (!row || !userId || !contactId) return null;
    bindWarmUser(userId);
    bumpMessageEpoch(contactId);
    const mapped = mapMessage(row, userId);
    const current = warm.messages.get(String(contactId)) || [];
    if (!current.some((item) => String(item.id) === String(mapped.id))) {
      rememberMessages(userId, contactId, conversationId || row.conversation_id, current.concat(mapped));
    } else if (conversationId) {
      warm.byConversation.set(String(conversationId), String(contactId));
    }
    return mapped;
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
    if (attachmentType === 'video') return '🎬 Vidéo';
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
    else if (attachmentType === 'photo' || attachmentType === 'video' || attachmentType === 'document') type = attachmentType;
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
      messageType: messageType || (attachmentType === 'photo' || attachmentType === 'video' || attachmentType === 'document' ? attachmentType : 'text'),
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

      const [participantResult, messageResult, conversationMeta] = await Promise.all([
        client.supabase.from('conversation_participants').select('conversation_id,user_id').in('conversation_id', conversationIds),
        client.supabase.from('messages').select('id,conversation_id,sender_id,content,created_at,is_read,attachment_type,attachment_name,message_type,entity_type,entity_id').in('conversation_id', conversationIds).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(Math.min(conversationIds.length * 4, 160)),
        client.supabase.from('conversations').select('id,mission_id,context_mode').in('id', conversationIds)
      ]);
      if (participantResult.error) throw participantResult.error;
      let messageRows = messageResult.data || [];
      if (messageResult.error && /attachment_type|attachment_name|message_type|entity_type/.test(messageResult.error.message || '')) {
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
      const unreadCounts = new Map();
      const annonceIds = new Set();
      const devisIds = new Set();
      for (const row of messageRows) {
        const current = latestByConversation.get(row.conversation_id);
        const newer = !current || String(row.created_at || '') > String(current.created_at || '') || (row.created_at === current.created_at && String(row.id) > String(current.id));
        if (newer) latestByConversation.set(row.conversation_id, row);
        if (row.is_read === false && row.sender_id && row.sender_id !== userId) {
          unreadConversations.add(row.conversation_id);
          unreadCounts.set(row.conversation_id, (unreadCounts.get(row.conversation_id) || 0) + 1);
        }
        const messageType = row.message_type || '';
        const entity = String(row.entity_type || '').toLowerCase();
        if (messageType.indexOf('quote') === 0 || entity === 'quote') devisIds.add(row.conversation_id);
        if (messageType.indexOf('visit_') === 0 || entity === 'request' || entity === 'mission') annonceIds.add(row.conversation_id);
        if (!contactByConversation.has(row.conversation_id) && row.sender_id && row.sender_id !== userId) contactByConversation.set(row.conversation_id, row.sender_id);
      }

      const contactIds = [...new Set([...contactByConversation.values()].filter(Boolean))];
      const profilesById = new Map();
      async function loadProfiles(select) {
        const { data, error } = await client.supabase.from('public_profiles').select(select).in('id', contactIds);
        if (error) return null;
        return data || [];
      }
      if (contactIds.length) {
        try {
          const detailed = await loadProfiles('id,first_name,last_name,avatar_url,is_pro_verified,is_verified');
          const profiles = detailed || await loadProfiles('id,first_name,last_name,avatar_url') || [];
          for (const profile of profiles) profilesById.set(profile.id, profile);
        } catch (_) {}
        const missing = contactIds.filter((id) => !profilesById.has(id));
        if (missing.length) {
          try {
            const { data: ownProfiles } = await client.supabase.from('profiles').select('id,first_name,last_name,avatar_url,is_pro_verified,is_verified').in('id', missing);
            for (const profile of ownProfiles || []) profilesById.set(profile.id, profile);
          } catch (_) {}
        }
      }

      const invitationsByConversation = new Map();
      try {
        const invitationResult = await client.supabase.from('request_invitations').select('id,conversation_id,request_id,requester_id,recipient_id,status').in('conversation_id', conversationIds);
        if (!invitationResult.error) {
          for (const invitation of invitationResult.data || []) {
            if (!invitation.conversation_id) continue;
            const list = invitationsByConversation.get(invitation.conversation_id) || [];
            list.push(invitation);
            invitationsByConversation.set(invitation.conversation_id, list);
          }
        }
      } catch (_) {}
      const requestTitle = new Map();
      const requestIds = [...new Set([...invitationsByConversation.values()].flat().map((item) => item.request_id).filter(Boolean))];
      if (requestIds.length) {
        try {
          const requestResult = await client.supabase.from('requests').select('id,title').in('id', requestIds);
          if (!requestResult.error) {
            for (const request of requestResult.data || []) requestTitle.set(request.id, request.title || '');
          }
        } catch (_) {}
      }
      const quoteStatusByInvitation = new Map();
      let quotesById = new Map();
      const invitationIds = [...invitationsByConversation.values()].flat().map((item) => item.id).filter(Boolean);
      if (invitationIds.length) {
        try {
          const quoteResult = await client.supabase.from('quotes').select('id,request_id,request_invitation_id,status,created_at,requester_id,provider_id').in('request_invitation_id', invitationIds).order('created_at', { ascending: false });
          if (!quoteResult.error) {
            for (const quote of quoteResult.data || []) {
              if (quote.request_invitation_id && !quoteStatusByInvitation.has(quote.request_invitation_id)) {
                quoteStatusByInvitation.set(quote.request_invitation_id, quote.status);
              }
            }
            quotesById = new Map((quoteResult.data || []).filter((row) => row && row.id).map((row) => [String(row.id), row]));
          }
        } catch (_) {}
      }
      try {
        const unreadResult = await client.supabase.from('messages').select('conversation_id').in('conversation_id', conversationIds).eq('is_read', false).neq('sender_id', userId);
        if (!unreadResult.error && Array.isArray(unreadResult.data)) {
          unreadCounts.clear();
          for (const row of unreadResult.data) {
            unreadConversations.add(row.conversation_id);
            unreadCounts.set(row.conversation_id, (unreadCounts.get(row.conversation_id) || 0) + 1);
          }
        }
      } catch (_) {}

      const missionStatus = new Map();
      const missionIds = conversationMeta.error ? [] : [...new Set((conversationMeta.data || []).map((item) => item.mission_id).filter(Boolean))];
      if (missionIds.length) {
        try {
          const missionResult = await client.supabase.from('missions').select('id,status').in('id', missionIds);
          if (!missionResult.error) {
            for (const mission of missionResult.data || []) missionStatus.set(mission.id, mission.status);
          }
        } catch (_) {}
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
        const meta = conversationMeta.error ? null : (conversationMeta.data || []).find((item) => item.id === conversationId);
        const invitations = invitationsByConversation.get(conversationId) || [];
        const requestIdsForConv = [...new Set(invitations.map((item) => item.request_id).filter(Boolean))];
        const multiRequest = requestIdsForConv.length > 1;
        const dossiers = invitations.map((item) => ({
          requestId: item.request_id || null,
          invitationId: item.id || null,
          title: requestTitle.get(item.request_id) || '',
          requesterId: item.requester_id || null,
          providerId: item.recipient_id || null
        }));
        const invitation = multiRequest ? null : (invitations[0] || null);
        const latestQuote = latest && latest.entity_id ? quotesById.get(String(latest.entity_id)) : null;
        const latestMissionTitle = latestQuote
          ? (requestTitle.get(latestQuote.request_id) || '')
          : '';
        const annonceTitle = latestMissionTitle
          || (invitation ? (requestTitle.get(invitation.request_id) || '') : '');
        const rawQuote = latestQuote
          ? latestQuote.status
          : (invitation ? (quoteStatusByInvitation.get(invitation.id) || '') : '');
        const quoteStatus = rawQuote && meta?.mission_id && missionStatus.get(meta.mission_id) === 'COMPLETED'
          ? 'COMPLETED'
          : rawQuote;
        const previewBase = latest ? formatMessagePreview(latest) : (isSupport ? 'Écrivez-nous ici pour toute question ou aide sur l\'application.' : '');
        const preview = latestMissionTitle && previewBase && TIMELINE_PREVIEW[latest.message_type || '']
          ? (previewBase + ' · ' + latestMissionTitle)
          : previewBase;
        const hasAnnonce = Boolean(annonceTitle) || Boolean(meta?.mission_id) || (meta?.context_mode && meta.context_mode !== 'direct') || annonceIds.has(conversationId);
        const hasDevis = Boolean(quoteStatus) || devisIds.has(conversationId);
        const pendingQuote = latestQuote && ['SENT', 'VIEWED', 'REVISED'].includes(String(latestQuote.status || ''));
        const pendingAction = !!(pendingQuote && String(latestQuote.requester_id) === String(userId));
        return {
          conversationId, contactId, name, avatar, preview,
          lastMessageAt: latest?.created_at || null,
          pinned: !!isSupport,
          isSupport: !!isSupport,
          unread: unreadConversations.has(conversationId),
          unreadCount: unreadCounts.get(conversationId) || 0,
          hasAnnonce, hasDevis, annonceTitle,
          pendingAction,
          multiRequest,
          dossiers: dossiers,
          requestId: multiRequest ? null : (invitation && invitation.request_id) || null,
          quoteStatus,
          attachmentType: latest?.attachment_type || '',
          attachmentName: latest?.attachment_name || '',
          isProVerified: profile?.is_pro_verified === true,
          isVerified: profile?.is_verified === true
        };
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
    const hinted = options.conversationId ? String(options.conversationId) : '';
    const conversationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(hinted)
      ? hinted
      : await findConversationId(userId, contactId, options);
    if (!conversationId) return (before || after) ? [] : (cached || []);
    const c = cache();
    if (options.fresh) {
      bumpMessageEpoch(contactId);
      if (c) c.invalidate('chat-messages', conversationId);
    }
    const epoch = currentMessageEpoch(contactId);
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
    if (!before && !after && currentMessageEpoch(contactId) === epoch) {
      rememberMessages(userId, contactId, conversationId, rows);
    }
    if (!before && !after) {
      const live = peekMessages(userId, contactId);
      if (Array.isArray(live) && live.length) {
        const byId = new Map();
        (rows || []).forEach((row) => { if (row && row.id) byId.set(String(row.id), row); });
        live.forEach((row) => { if (row && row.id) byId.set(String(row.id), row); });
        return [...byId.values()].sort(compareMappedMessages);
      }
    }
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
    const row = warm.conversations.find((item) => String(item.conversationId || '') === String(conversationId || ''));
    if (!row) return null;
    const payload = extra && typeof extra === 'object' ? { content, ...extra } : { content };
    row.preview = formatMessagePreview(payload);
    row.lastMessageAt = createdAt || new Date().toISOString();
    if (extra && Object.prototype.hasOwnProperty.call(extra, 'unread')) {
      row.unread = !!extra.unread;
      row.unreadCount = extra.unread ? (Number(row.unreadCount) || 0) + 1 : 0;
    }
    if (payload.attachment_type) row.attachmentType = payload.attachment_type;
    const messageType = payload.message_type || payload.messageType || '';
    if (String(messageType).indexOf('quote') === 0) row.hasDevis = true;
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

  const quoteContextKeysByPair = new Map();

  function quoteContextCacheId(userId, contactId, options = {}) {
    const base = pairKey(userId, contactId);
    const requestId = options.requestId ? String(options.requestId) : '';
    const invitationId = options.invitationId ? String(options.invitationId) : '';
    const missionId = options.missionId ? String(options.missionId) : '';
    return `${base}|r:${requestId}|i:${invitationId}|m:${missionId}`;
  }

  function rememberQuoteContextKey(userId, contactId, cacheId) {
    const pair = pairKey(userId, contactId);
    if (!quoteContextKeysByPair.has(pair)) quoteContextKeysByPair.set(pair, new Set());
    quoteContextKeysByPair.get(pair).add(cacheId);
  }

  function tagQuoteContext(quotes, meta) {
    const list = Array.isArray(quotes) ? quotes.slice() : [];
    list.ambiguous = Boolean(meta && meta.ambiguous);
    list.requestId = (meta && meta.requestId) || null;
    list.invitationId = (meta && meta.invitationId) || null;
    list.missionId = (meta && meta.missionId) || null;
    list.selectionCode = (meta && meta.code) || null;
    return list;
  }

  async function enrichQuotes(client, quotes) {
    if (!quotes?.length) return [];
    const quoteIds = quotes.map((quote) => quote.id).filter(Boolean);
    let milestones = [];
    if (quoteIds.length) {
      const primary = await client.supabase.from('milestones').select('*').in('quote_id', quoteIds).order('display_order', { ascending: true });
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
    const missionIds = [...new Set(quotes.map((quote) => quote.mission_id).filter(Boolean))];
    const missionStatus = new Map();
    if (missionIds.length) {
      const missionResult = await client.supabase.from('missions').select('id,status,related_request_id,request_invitation_id').in('id', missionIds);
      if (!missionResult.error) {
        (missionResult.data || []).forEach((mission) => missionStatus.set(mission.id, mission));
      }
    }
    const revisionsByQuote = new Map();
    if (quoteIds.length) {
      const revisionResult = await client.supabase
        .from('quote_revisions')
        .select('quote_id, version, description, total_amount, milestones, created_at')
        .in('quote_id', quoteIds)
        .order('version', { ascending: false });
      if (!revisionResult.error) {
        (revisionResult.data || []).forEach((revision) => {
          if (!revisionsByQuote.has(revision.quote_id)) revisionsByQuote.set(revision.quote_id, []);
          revisionsByQuote.get(revision.quote_id).push(revision);
        });
      }
    }
    const paymentsByQuote = new Map();
    if (quoteIds.length) {
      const paymentResult = await client.supabase.from('payments').select('id,quote_id,milestone_id,payment_status').in('quote_id', quoteIds);
      if (!paymentResult.error) {
        (paymentResult.data || []).forEach((payment) => {
          if (!paymentsByQuote.has(payment.quote_id)) paymentsByQuote.set(payment.quote_id, []);
          paymentsByQuote.get(payment.quote_id).push(payment);
        });
      }
    }
    return quotes.map((quote) => {
      const currentVersion = Number(quote.version) || 1;
      const history = revisionsByQuote.get(quote.id) || [];
      const previousRevision = history.find((revision) => Number(revision.version) < currentVersion) || null;
      const missionRow = quote.mission_id ? missionStatus.get(quote.mission_id) : null;
      return {
        ...quote,
        mission_status: missionRow ? missionRow.status : null,
        mission_related_request_id: missionRow
          ? (missionRow.related_request_id || missionRow.request_id || null)
          : null,
        payments: paymentsByQuote.get(quote.id) || [],
        milestones: byQuote.get(quote.id) || [],
        previousRevision
      };
    });
  }

  async function loadQuotesForSelection(client, userId, contactId, selection) {
    if (!selection || !selection.ok) return [];
    const pairFilter = `and(requester_id.eq.${userId},provider_id.eq.${contactId}),and(requester_id.eq.${contactId},provider_id.eq.${userId})`;
    let quotes = [];
    if (selection.requestId) {
      const { data, error } = await client.supabase
        .from('quotes')
        .select('*')
        .eq('request_id', selection.requestId)
        .or(pairFilter)
        .order('created_at', { ascending: false });
      if (error) throw error;
      quotes = data || [];
    } else if (selection.invitationIds && selection.invitationIds.length) {
      const { data, error } = await client.supabase
        .from('quotes')
        .select('*')
        .in('request_invitation_id', selection.invitationIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      quotes = data || [];
    }
    if (selection.invitationId) {
      quotes = quotes.filter((quote) => {
        if (!quote.request_invitation_id) return true;
        if (selection.invitationIds && selection.invitationIds.length) {
          return selection.invitationIds.includes(quote.request_invitation_id);
        }
        return String(quote.request_invitation_id) === String(selection.invitationId);
      });
    }
    if (selection.requestId) {
      quotes = quotes.filter((quote) => !quote.request_id || String(quote.request_id) === String(selection.requestId));
    }
    if (selection.missionId) {
      const linked = quotes.filter((quote) => quote.mission_id && String(quote.mission_id) === String(selection.missionId));
      if (linked.length) quotes = linked;
    }
    return enrichQuotes(client, quotes);
  }

  /**
   * Quote/mission context for a chat pair.
   * Prefer options.requestId (and invitationId / missionId when known).
   * Never silently replace with the last invitation between two users when several annonces exist.
   */
  async function getQuoteContext(userId, contactId, options = {}) {
    const client = api();
    if (!client?.supabase || !userId || !contactId) return tagQuoteContext([], { code: 'missing' });
    const c = cache();
    const cacheId = quoteContextCacheId(userId, contactId, options);
    rememberQuoteContextKey(userId, contactId, cacheId);
    if (options.fresh && c) {
      c.invalidate('chat-quote-context', cacheId);
      c.invalidate('chat-quote-context', pairKey(userId, contactId));
    }
    const loader = async () => {
      const invitationsPromise = typeof client.listAcceptedInvitationsBetween === 'function'
        ? client.listAcceptedInvitationsBetween(userId, contactId, { limit: 20 })
        : (typeof client.getActiveInvitationBetween === 'function'
          ? client.getActiveInvitationBetween(userId, contactId).then((row) => (row ? [row] : []))
          : Promise.resolve([]));
      const missionsPromise = typeof client.listMissionsBetween === 'function'
        ? client.listMissionsBetween(userId, contactId)
        : Promise.resolve([]);
      const [invitations, missions] = await Promise.all([invitationsPromise, missionsPromise]);
      const selector = window.LYANN_QUOTE_REVISION && typeof window.LYANN_QUOTE_REVISION.resolveQuoteContextSelection === 'function'
        ? window.LYANN_QUOTE_REVISION.resolveQuoteContextSelection
        : null;
      const selection = selector
        ? selector({
          invitations: invitations || [],
          missions: missions || [],
          requestId: options.requestId || null,
          invitationId: options.invitationId || null,
          missionId: options.missionId || null
        })
        : null;

      if (!selection) {
        // Legacy fallback only when revision selector is unavailable: unique invitation only.
        const accepted = Array.isArray(invitations) ? invitations : [];
        if (accepted.length !== 1) {
          return tagQuoteContext([], {
            ambiguous: accepted.length > 1,
            code: accepted.length > 1 ? 'ambiguous' : 'missing'
          });
        }
        const legacy = {
          ok: true,
          ambiguous: false,
          code: 'legacy_unique',
          requestId: accepted[0].request_id || null,
          invitationId: accepted[0].id,
          invitationIds: [accepted[0].id],
          missionId: null
        };
        const quotes = await loadQuotesForSelection(client, userId, contactId, legacy);
        return tagQuoteContext(quotes, legacy);
      }

      if (selection.ambiguous || !selection.ok) {
        return tagQuoteContext([], selection);
      }

      // Verify invitation ↔ request ↔ mission correspondence before painting.
      if (selection.missionId && selection.requestId) {
        const mission = (missions || []).find((row) => String(row.id) === String(selection.missionId));
        const missionRequest = mission
          ? (mission.related_request_id || mission.request_id || null)
          : null;
        if (missionRequest && String(missionRequest) !== String(selection.requestId)) {
          return tagQuoteContext([], {
            ok: false,
            ambiguous: false,
            code: 'mission_request_mismatch',
            requestId: selection.requestId,
            invitationId: selection.invitationId,
            missionId: selection.missionId
          });
        }
      }
      if (selection.invitationId && selection.requestId) {
        const invitation = (invitations || []).find((row) => String(row.id) === String(selection.invitationId));
        if (invitation && invitation.request_id && String(invitation.request_id) !== String(selection.requestId)) {
          return tagQuoteContext([], {
            ok: false,
            ambiguous: false,
            code: 'invitation_request_mismatch',
            requestId: selection.requestId,
            invitationId: selection.invitationId,
            missionId: selection.missionId
          });
        }
      }

      const quotes = await loadQuotesForSelection(client, userId, contactId, selection);
      const verified = quotes.filter((quote) => {
        if (selection.requestId && quote.request_id && String(quote.request_id) !== String(selection.requestId)) {
          return false;
        }
        if (selection.requestId && quote.mission_related_request_id
          && String(quote.mission_related_request_id) !== String(selection.requestId)) {
          return false;
        }
        if (selection.missionId && quote.mission_id && String(quote.mission_id) !== String(selection.missionId)) {
          // Keep quotes for the same request that are not yet linked to this mission (SENT).
          if (quote.status === 'ACCEPTED') return false;
        }
        return true;
      });
      return tagQuoteContext(verified, selection);
    };
    return c ? c.dedupe('chat-quote-context', cacheId, loader, QUOTE_CONTEXT_TTL_MS) : loader();
  }

  function invalidateConversation(userId, contactId, conversationId) {
    forgetWarmMessages(userId, contactId, conversationId);
    const c = cache();
    if (!c) return;
    if (userId && contactId) {
      const key = pairKey(userId, contactId);
      c.invalidate('chat-conversation', key);
      invalidateQuoteContext(userId, contactId);
      c.invalidate('chat-conversation-list', String(userId));
    }
    if (conversationId) c.invalidate('chat-messages', conversationId);
  }
  function invalidateMessages(conversationId) {
    const mapped = conversationId && warm.byConversation.has(String(conversationId))
      ? warm.byConversation.get(String(conversationId))
      : null;
    if (mapped) bumpMessageEpoch(mapped);
    forgetWarmMessages(null, null, conversationId);
    const c = cache();
    if (c && conversationId) c.invalidate('chat-messages', conversationId);
  }
  function invalidateQuoteContext(userId, contactId) {
    const c = cache();
    if (!c || !userId || !contactId) return;
    const pair = pairKey(userId, contactId);
    const keys = quoteContextKeysByPair.get(pair);
    if (keys) {
      keys.forEach((id) => c.invalidate('chat-quote-context', id));
      keys.clear();
    }
    c.invalidate('chat-quote-context', pair);
  }

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
        if (item.conversationId === conversationId || item.contactId === contactId) {
          item.unread = false;
          item.unreadCount = 0;
        }
      });
    }
    window.dispatchEvent(new CustomEvent('lyann:chat-read', { detail: { userId, contactId, conversationId } }));
    if (typeof window.refreshMessageBadge === 'function') window.refreshMessageBadge(userId);
    return true;
  }

  window.LYANN_MESSAGING_REPOSITORY = { findConversationId, listConversations, getMessages, getQuoteContext, invalidateConversation, invalidateMessages, invalidateQuoteContext, peekConversations, peekMessages, ingestIncomingMessage, warmInbox, markConversationRead, noteIncomingPreview, ensureInboxConversation, formatMessagePreview, enrichQuotes, releaseWarmCache };
})();