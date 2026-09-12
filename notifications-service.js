/**
 * LYANN - Client Notification Service (SendGrid & Twilio Orchestrator Client)
 * Handles client-side triggering, simulation, audit logs, and secure API requests.
 */

(function() {
    // Safe storage wrapper to prevent crashes under file:// when localStorage is disabled or blocked
    const safeStorage = {
        _cache: {},
        getItem(key) {
            try {
                return window.localStorage.getItem(key);
            } catch (e) {
                return this._cache[key] || null;
            }
        },
        setItem(key, value) {
            try {
                window.localStorage.setItem(key, value);
            } catch (e) {
                this._cache[key] = String(value);
            }
        }
    };

    const STORAGE_KEY_NOTIFS = 'lyann_notifications_log';

    const NotifService = {
        // Obtenir l'historique des notifications
        getLogs: function() {
            try {
                const data = safeStorage.getItem(STORAGE_KEY_NOTIFS);
                return data ? JSON.parse(data) : [];
            } catch (e) {
                console.error("Erreur de lecture de l'historique des notifications", e);
                return [];
            }
        },

        // Effacer l'historique des notifications
        clearLogs: function() {
            try {
                safeStorage.removeItem(STORAGE_KEY_NOTIFS);
            } catch (e) {
                console.error("Erreur d'effacement de l'historique des notifications", e);
            }
        },

        // Enregistrer une notification dans l'historique
        logNotification: function(recipientName, recipientContact, channel, status, subject, content) {
            const logs = this.getLogs();
            const newLog = {
                id: 'NTF-' + Date.now() + Math.floor(Math.random() * 1000),
                timestamp: new Date().toISOString(),
                recipientName: recipientName,
                recipientContact: recipientContact,
                channel: channel,
                status: status,
                subject: subject || 'Notification automatique',
                content: content
            };

            logs.unshift(newLog);
            if (logs.length > 100) logs.pop();

            try {
                safeStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(logs));
                window.dispatchEvent(new CustomEvent('lyann_notification_sent', { detail: newLog }));
            } catch (e) {
                console.error("Erreur d'écriture de la notification", e);
            }

            if (typeof window.showLyanToast === 'function') {
                const icon = channel === 'email' ? '✉️' : '💬';
                window.showLyanToast(`${channel.toUpperCase()} ${status === 'sent' ? 'envoyé' : 'simulé'} pour ${recipientName}`, icon);
            }
        },

        // Envoyer un SMS
        sendSMS: async function(toPhone, toName, message) {
            console.log(`[Notification SMS Twilio] Destinataire: ${toName} (${toPhone}) | Message: "${message}"`);

            let status = 'simulated';
            try {
                const response = await fetch('/api/notifications/send-sms', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to: toPhone, body: message })
                });

                if (response.ok) {
                    status = 'sent';
                    console.log('✅ SMS transmis avec succès via l\'API Twilio.');
                } else {
                    console.warn('⚠️ Le serveur backend a retourné une erreur de transmission SMS, basculement en mode simulation.');
                }
            } catch (e) {
                console.log('ℹ️ Serveur backend injoignable ou en local, SMS traité en simulation locale.');
            }

            this.logNotification(toName, toPhone, 'sms', status, 'Alerte SMS Twilio', message);
        },

        // Envoyer un Email
        sendEmail: async function(toEmail, toName, subject, htmlContent) {
            console.log(`[Notification Email SendGrid] Destinataire: ${toName} (${toEmail}) | Sujet: "${subject}"`);

            let status = 'simulated';
            try {
                const response = await fetch('/api/notifications/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to: toEmail, name: toName, subject: subject, html: htmlContent })
                });

                if (response.ok) {
                    status = 'sent';
                    console.log('✅ E-mail transmis avec succès via l\'API SendGrid.');
                } else {
                    console.warn('⚠️ Le serveur backend a retourné une erreur de transmission Email, basculement en mode simulation.');
                }
            } catch (e) {
                console.log('ℹ️ Serveur backend injoignable ou en local, E-mail traité en simulation locale.');
            }

            this.logNotification(toName, toEmail, 'email', status, subject, htmlContent);
        }
    };

    window.LYANN_NOTIFICATIONS = NotifService;
})();

// Production UI repair shared by Web and Capacitor bundles.
(function installLyannProductionRuntimeRepair() {
    if (window.__LYANN_PRODUCTION_RUNTIME_REPAIR_V2__) return;
    window.__LYANN_PRODUCTION_RUNTIME_REPAIR_V2__ = true;

    function isUuid(value) {
        return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    }

    // 1) Bokantaj: the whole author identity block opens the real member profile.
    document.addEventListener('click', function(event) {
        if (!event.target || typeof event.target.closest !== 'function') return;
        const authorBlock = event.target.closest('.trigger-quick-profile, .flash-author-block, [data-member-id]');
        if (!authorBlock) return;

        const memberId = authorBlock.dataset && (authorBlock.dataset.memberId || authorBlock.dataset.authorId || authorBlock.dataset.userId);
        if (!memberId) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        if (typeof window.openPublicMemberProfile === 'function') {
            window.openPublicMemberProfile(memberId, 'bokantaj');
            return;
        }
        if (typeof window.openPublicProfileModal === 'function') {
            window.openPublicProfileModal(memberId, 'bokantaj');
            return;
        }
        if (typeof window.openQuickProfileModal === 'function') {
            window.openQuickProfileModal(memberId);
        }
    }, true);

    // 2) Chat: remove obsolete tracking buttons.
    function hideObsoleteTrackingButtons(root) {
        const scope = root && root.querySelectorAll ? root : document;
        ['#chatTrackingBtn', '#btnCtxViewMissionDetails'].forEach(function(selector) {
            scope.querySelectorAll(selector).forEach(function(button) {
                button.style.setProperty('display', 'none', 'important');
                button.setAttribute('aria-hidden', 'true');
                button.tabIndex = -1;
            });
        });
    }

    // 3) Chat: repair the current core renderer contract.
    // getChatMessages() maps DB rows to sender='me'/'them', while renderMessages()
    // currently compares sender against the UUID. We re-apply alignment from the DB sender_id.
    let alignmentTimer = null;
    let alignmentRunning = false;

    function scheduleChatAlignment() {
        clearTimeout(alignmentTimer);
        alignmentTimer = setTimeout(repairChatAlignment, 80);
    }

    async function getAuthenticatedUserId(supabase) {
        try {
            if (supabase && supabase.auth && typeof supabase.auth.getUser === 'function') {
                const result = await supabase.auth.getUser();
                if (result && result.data && result.data.user && result.data.user.id) return result.data.user.id;
            }
        } catch (e) {}
        try {
            if (supabase && supabase.auth && typeof supabase.auth.getSession === 'function') {
                const result = await supabase.auth.getSession();
                const session = result && result.data ? result.data.session : null;
                if (session && session.user && session.user.id) return session.user.id;
            }
        } catch (e) {}
        return null;
    }

    async function repairChatAlignment() {
        if (alignmentRunning) return;
        const container = document.getElementById('chatMessagesContainer');
        const api = window.LYANN_API_CLIENT;
        const supabase = api && api.supabase;
        if (!container || !supabase) return;

        let lastContact = null;
        try {
            lastContact = JSON.parse(localStorage.getItem('lyann_last_active_contact') || 'null');
        } catch (e) {}
        const contactId = lastContact && lastContact.id;
        if (!isUuid(contactId)) return;

        alignmentRunning = true;
        try {
            const myId = await getAuthenticatedUserId(supabase);
            if (!isUuid(myId)) return;

            const mine = await supabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', myId);
            if (mine.error || !Array.isArray(mine.data) || mine.data.length === 0) return;

            const convIds = mine.data.map(function(row) { return row.conversation_id; }).filter(Boolean);
            const shared = await supabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', contactId)
                .in('conversation_id', convIds);
            if (shared.error || !Array.isArray(shared.data) || shared.data.length === 0) return;

            const conversationId = shared.data[0].conversation_id;
            const messagesResult = await supabase
                .from('messages')
                .select('id,sender_id,content,created_at')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true });
            if (messagesResult.error || !Array.isArray(messagesResult.data)) return;

            const visualMessages = messagesResult.data.filter(function(message) {
                return typeof message.content === 'string' && !message.content.trim().startsWith('{');
            });
            const wrappers = Array.from(container.querySelectorAll('.chat-msg-bubble-wrap'));
            if (!wrappers.length) return;

            const offset = Math.max(0, visualMessages.length - wrappers.length);
            wrappers.forEach(function(wrapper, index) {
                const message = visualMessages[index + offset];
                if (!message) return;
                const sent = message.sender_id === myId;

                wrapper.classList.toggle('sent', sent);
                wrapper.classList.toggle('received', !sent);
                wrapper.style.setProperty('display', 'flex', 'important');
                wrapper.style.setProperty('width', '100%', 'important');
                wrapper.style.setProperty('justify-content', sent ? 'flex-end' : 'flex-start', 'important');
                wrapper.style.setProperty('box-sizing', 'border-box', 'important');

                const bubble = wrapper.querySelector('.chat-msg-bubble');
                if (bubble) {
                    bubble.classList.toggle('sent', sent);
                    bubble.classList.toggle('received', !sent);
                    bubble.style.setProperty('margin-left', sent ? 'auto' : '0', 'important');
                    bubble.style.setProperty('margin-right', sent ? '0' : 'auto', 'important');
                    bubble.style.setProperty('text-align', 'left', 'important');
                }
            });
        } catch (error) {
            console.warn('[LYANN CHAT ALIGNMENT REPAIR]', error);
        } finally {
            alignmentRunning = false;
        }
    }

    hideObsoleteTrackingButtons(document);

    const observer = new MutationObserver(function(mutations) {
        let chatChanged = false;
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (!node || node.nodeType !== 1) return;
                if (node.matches && (node.matches('#chatTrackingBtn') || node.matches('#btnCtxViewMissionDetails'))) {
                    node.style.setProperty('display', 'none', 'important');
                    node.setAttribute('aria-hidden', 'true');
                    node.tabIndex = -1;
                }
                hideObsoleteTrackingButtons(node);
                if ((node.id === 'chatMessagesContainer') || (node.closest && node.closest('#chatMessagesContainer')) || (node.querySelector && node.querySelector('#chatMessagesContainer, .chat-msg-bubble-wrap'))) {
                    chatChanged = true;
                }
            });
        });
        if (chatChanged) scheduleChatAlignment();
    });
    if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('lyann_chat_opened', function() {
        scheduleChatAlignment();
        setTimeout(scheduleChatAlignment, 350);
    });

    document.addEventListener('click', function(event) {
        if (event.target && event.target.closest && event.target.closest('#chatSendBtn, .chat-send-btn, [data-chat-send]')) {
            setTimeout(scheduleChatAlignment, 200);
            setTimeout(scheduleChatAlignment, 700);
        }
    }, true);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            hideObsoleteTrackingButtons(document);
            scheduleChatAlignment();
        }, { once: true });
    } else {
        scheduleChatAlignment();
    }
})();
