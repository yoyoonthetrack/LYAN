/**
 * LYANN — STEP 12 NOTIFICATIONS & OPPORTUNITY DELIVERY ENGINE
 * Production-grade notification orchestrator with idempotency, user preferences,
 * burst anti-spam, deep linking, wave control, and admin inspector capabilities.
 */

(function(global) {
    'use strict';

    const STORAGE_KEY_NOTIFS = 'lyann_user_notifications_v1';
    const STORAGE_KEY_PREFS = 'lyann_user_notif_prefs_v1';
    const STORAGE_KEY_LOGS = 'lyann_notifications_log';
    const STORAGE_KEY_BURST = 'lyann_notif_burst_tracker';

    // Safe storage wrapper
    const safeStorage = {
        _cache: {},
        getItem(key) {
            try {
                if (typeof window !== 'undefined' && window.localStorage) {
                    return window.localStorage.getItem(key);
                }
            } catch (e) {}
            return this._cache[key] || null;
        },
        setItem(key, value) {
            const strVal = String(value);
            try {
                if (typeof window !== 'undefined' && window.localStorage) {
                    window.localStorage.setItem(key, strVal);
                }
            } catch (e) {}
            this._cache[key] = strVal;
        }
    };

    // 1. DEFAULT USER PREFERENCES
    const DEFAULT_PREFERENCES = {
        opportunities: { in_app: true, push: true, email: true },
        messages: { in_app: true, push: true, email: true },
        missions: { in_app: true, push: true, email: true },
        payments: { in_app: true, push: true, email: true }, // Essential
        news: { in_app: true, push: false, email: false },
        matching_requests: { in_app: true },
        bokantaj: { in_app: true }
    };

    function inAppPrefEnabled(prefs, key) {
        const value = prefs?.[key];
        if (typeof value === 'boolean') return value;
        if (value && typeof value === 'object') return value.in_app !== false;
        return true;
    }

    function toServerPrefs(prefs) {
        const merged = { ...DEFAULT_PREFERENCES, ...(prefs || {}) };
        return {
            messages: inAppPrefEnabled(merged, 'messages'),
            matching_requests: inAppPrefEnabled(merged, 'matching_requests') && inAppPrefEnabled(merged, 'opportunities'),
            bokantaj: inAppPrefEnabled(merged, 'bokantaj') && inAppPrefEnabled(merged, 'news')
        };
    }

    function fromServerPrefs(row) {
        const flags = row && typeof row === 'object' ? row : {};
        return {
            ...DEFAULT_PREFERENCES,
            messages: { in_app: flags.messages !== false, push: flags.messages !== false, email: flags.messages !== false },
            opportunities: { in_app: flags.matching_requests !== false, push: flags.matching_requests !== false, email: flags.matching_requests !== false },
            matching_requests: { in_app: flags.matching_requests !== false },
            news: { in_app: flags.bokantaj !== false, push: false, email: false },
            bokantaj: { in_app: flags.bokantaj !== false }
        };
    }

    const SOUND_URL = 'sounds/lyann-notif.mp3';
    const SOUND_COOLDOWN_MS = 2500;
    let notificationAudio = null;
    let lastChimeAt = 0;
    let knownNotificationIds = new Set();
    const hydratedUsers = new Set();

    function ensureNotificationAudio() {
        if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
        if (!notificationAudio) {
            notificationAudio = new Audio(SOUND_URL);
            notificationAudio.preload = 'auto';
            notificationAudio.setAttribute('playsinline', '');
            notificationAudio.volume = 0.85;
        }
        return notificationAudio;
    }

    function primeNotificationSound() {
        const el = ensureNotificationAudio();
        if (!el) return;
        const play = el.play();
        if (play && typeof play.then === 'function') {
            play.then(() => {
                el.pause();
                el.currentTime = 0;
            }).catch(() => {});
        }
    }

    function shouldSkipChime(notif) {
        if (!notif || notif.read) return true;
        const activeId = (typeof window !== 'undefined' && (window.LYANN_ACTIVE_CHAT_CONTACT?.id || window.LYANN_ACTIVE_CHAT_CONTACT?.contactId)) || null;
        if (notif.type === 'NEW_MESSAGE' && activeId && String(notif.entity_id) === String(activeId)) return true;
        return false;
    }

    function playNotificationSound() {
        if (typeof window === 'undefined') return;
        const now = Date.now();
        if (now - lastChimeAt < SOUND_COOLDOWN_MS) return;
        const el = ensureNotificationAudio();
        if (!el) return;
        lastChimeAt = now;
        try {
            el.currentTime = 0;
            const play = el.play();
            if (play && typeof play.catch === 'function') play.catch(() => {});
        } catch (_) {}
    }

    function rememberNotificationIds(notifs, { chime } = {}) {
        let shouldChime = false;
        (notifs || []).forEach((notif) => {
            if (!notif?.id) return;
            if (knownNotificationIds.has(notif.id)) return;
            knownNotificationIds.add(notif.id);
            if (chime && !shouldSkipChime(notif)) shouldChime = true;
        });
        if (shouldChime) playNotificationSound();
    }

    function ingestServerNotification(row, userId, { chime } = {}) {
        if (!row) return;
        const mapped = mapServerNotification(row, userId);
        const others = getAllNotifications().filter((n) => n.id !== mapped.id);
        saveAllNotifications([mapped, ...others].slice(0, 200));
        rememberNotificationIds([mapped], { chime: chime !== false });
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('lyann_notifications_updated', { detail: mapped }));
        }
        return mapped;
    }

    function mapServerNotification(row, userId) {
        return {
            id: row.id,
            user_id: row.user_id || userId,
            type: row.type,
            title: row.title,
            body: row.body,
            entity_type: row.entity_type,
            entity_id: row.entity_id,
            read: !!row.read,
            created_at: row.created_at,
            cta: row.type === 'NEW_MESSAGE'
                ? { label: 'Ouvrir la conversation' }
                : (row.type === 'OPPORTUNITY'
                    ? { label: 'Voir le besoin' }
                    : (row.type === 'BOKANTAJ' ? { label: 'Voir Bokantaj' } : null))
        };
    }

    function getUserPreferences(userId) {
        if (!userId) return { ...DEFAULT_PREFERENCES };
        try {
            const raw = safeStorage.getItem(`${STORAGE_KEY_PREFS}_${userId}`);
            if (raw) return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
        } catch (e) {}
        return { ...DEFAULT_PREFERENCES };
    }

    function updateUserPreferences(userId, callerId, newPrefs) {
        if (callerId !== userId) {
            throw new Error("SECURITY_VIOLATION: Cannot modify another user's preferences.");
        }
        const current = getUserPreferences(userId);
        const updated = { ...current, ...newPrefs };
        safeStorage.setItem(`${STORAGE_KEY_PREFS}_${userId}`, JSON.stringify(updated));
        const client = typeof window !== 'undefined' ? (window.LYANN_API_CLIENT || window.apiClient) : null;
        if (client?.updateProfile) {
            client.updateProfile(userId, { notification_prefs: toServerPrefs(updated) }).catch(() => {});
        }
        return updated;
    }

    async function hydrateFromServer(userId) {
        const client = typeof window !== 'undefined' ? (window.LYANN_API_CLIENT || window.apiClient) : null;
        if (!client || !userId) return { notifications: getUserNotifications(userId, userId), prefs: getUserPreferences(userId) };

        try {
            if (typeof client.getProfile === 'function') {
                const { data: profile } = await client.getProfile(userId);
                if (profile?.notification_prefs) {
                    const mapped = fromServerPrefs(profile.notification_prefs);
                    safeStorage.setItem(`${STORAGE_KEY_PREFS}_${userId}`, JSON.stringify(mapped));
                }
            }
        } catch (_) {}

        try {
            const { data } = await client.listMyNotifications();
            if (Array.isArray(data)) {
                const mapped = data.map((row) => mapServerNotification(row, userId));
                const others = getAllNotifications().filter((n) => n.user_id !== userId);
                saveAllNotifications([...mapped, ...others].slice(0, 200));
                const firstLoad = !hydratedUsers.has(userId);
                hydratedUsers.add(userId);
                rememberNotificationIds(mapped, { chime: !firstLoad });
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('lyann_notifications_updated'));
                }
            }
        } catch (_) {}

        return { notifications: getUserNotifications(userId, userId), prefs: getUserPreferences(userId) };
    }

    // 2. GET USER NOTIFICATIONS (WITH SECURITY ACCESS CONTROL - TEST H)
    function getAllNotifications() {
        try {
            const raw = safeStorage.getItem(STORAGE_KEY_NOTIFS);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveAllNotifications(notifs) {
        safeStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(notifs));
    }

    function getUserNotifications(userId, callerId) {
        if (!userId) return [];
        // Security check: caller must match requested user OR be system/admin
        if (callerId && callerId !== userId && callerId !== 'system' && callerId !== 'admin_owner') {
            throw new Error("SECURITY_VIOLATION: Access denied to user notifications.");
        }
        const all = getAllNotifications();
        return all.filter(n => n.user_id === userId);
    }

    function getUnreadCount(userId, callerId) {
        const notifs = getUserNotifications(userId, callerId);
        return notifs.filter(n => !n.read).length;
    }

    // 3. LOGGING FOR ADMIN INSPECTOR
    function logDeliveryAudit(entry) {
        try {
            const raw = safeStorage.getItem(STORAGE_KEY_LOGS);
            const logs = raw ? JSON.parse(raw) : [];
            const logEntry = {
                id: 'LOG-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                timestamp: new Date().toISOString(),
                notification_id: entry.id,
                user_id: entry.user_id,
                recipient_contact: entry.recipient_contact || entry.user_id,
                type: entry.type,
                channel: entry.channel || 'in_app',
                status: entry.status || 'delivered',
                subject: entry.title,
                content: entry.body,
                entity_id: entry.entity_id || null,
                failure_reason: entry.failure_reason || null
            };
            logs.unshift(logEntry);
            if (logs.length > 200) logs.pop();
            safeStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs));

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('lyann_notification_sent', { detail: logEntry }));
            }
        } catch (e) {}
    }

    // 4. CREATE NOTIFICATION (WITH IDEMPOTENCY, SECURITY & ANTI-SPAM)
    function createNotification(params, callerContext = {}) {
        const {
            user_id,
            type,
            priority = 'NORMAL',
            title,
            body,
            entity_type,
            entity_id,
            wave_number = 1,
            cta = null,
            event_id = null,
            created_by = 'system'
        } = params;

        if (!user_id || !type || !title || !body) {
            throw new Error("INVALID_PARAMS: user_id, type, title, and body are required.");
        }

        // SECURITY CHECK 1: System Spoofing Protection (TEST I)
        const callerRole = callerContext.role || 'user';
        const isSystemCaller = Boolean(callerContext.is_service_role || callerRole === 'admin' || callerRole === 'owner');

        if ((type === 'SYSTEM' || priority === 'CRITICAL') && !isSystemCaller) {
            throw new Error("SECURITY_VIOLATION: Only system or admin callers can produce SYSTEM or CRITICAL notifications.");
        }

        // SECURITY CHECK 2: Payment Payload Isolation (TEST L)
        // Ensure notification payload cannot mutate financial data or execute money transfers
        if (params.payment_amount || params.release_funds || params.action === 'execute_transfer') {
            delete params.payment_amount;
            delete params.release_funds;
            delete params.action;
        }

        // IDEMPOTENCY CHECK (TEST C)
        const idempotencyKey = `${user_id}_${type}_${entity_type || 'none'}_${entity_id || 'none'}_${event_id || 'v1'}`;
        const allNotifs = getAllNotifications();
        const existing = allNotifs.find(n => n.idempotency_key === idempotencyKey);
        if (existing) {
            return { notification: existing, duplicated: true };
        }

        // USER PREFERENCES CHECK (TEST E)
        const prefs = getUserPreferences(user_id);
        const categoryKey = type === 'OPPORTUNITY' ? 'opportunities'
            : (type === 'NEW_MESSAGE' ? 'messages'
            : (type.startsWith('QUOTE') || type.startsWith('MISSION') ? 'missions'
            : (type.startsWith('PAYMENT') ? 'payments' : 'news')));
        
        const catPrefs = prefs[categoryKey] || { in_app: true, push: true, email: true };

        // MESSAGE BURST / COOLDOWN CHECK (TEST J)
        let emailSuppressedForBurst = false;
        let pushSuppressedForBurst = false;
        if (type === 'NEW_MESSAGE' && entity_id) {
            const burstKey = `burst_${user_id}_${entity_id}`;
            const lastBurst = safeStorage.getItem(burstKey);
            const now = Date.now();
            if (lastBurst && (now - parseInt(lastBurst, 10)) < 300000) { // 5-minute cooldown for external push/email
                emailSuppressedForBurst = true;
                pushSuppressedForBurst = true;
            } else {
                safeStorage.setItem(burstKey, String(now));
            }
        }

        // IN-APP IS PRIMARY SOURCE OF TRUTH (Section 7)
        const notifId = 'NTF-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
        const newNotif = {
            id: notifId,
            user_id,
            type,
            priority,
            title,
            body,
            entity_type: entity_type || null,
            entity_id: entity_id || null,
            wave_number,
            idempotency_key: idempotencyKey,
            created_at: new Date().toISOString(),
            status: 'delivered',
            read: false,
            opened: false,
            cta: cta || getDefaultCTA(type, entity_type, entity_id),
            channel_status: {
                in_app: 'delivered',
                push: catPrefs.push && !pushSuppressedForBurst ? 'delivered' : (pushSuppressedForBurst ? 'burst_suppressed' : 'disabled'),
                email: catPrefs.email && !emailSuppressedForBurst ? 'sent' : (emailSuppressedForBurst ? 'burst_suppressed' : 'disabled')
            }
        };

        allNotifs.unshift(newNotif);
        saveAllNotifications(allNotifs);
        rememberNotificationIds([newNotif], { chime: true });

        // Audit Log
        logDeliveryAudit({
            id: notifId,
            user_id,
            type,
            channel: 'in_app',
            status: 'delivered',
            title,
            body,
            entity_id
        });

        // Trigger External Channels if configured & allowed
        if (catPrefs.email && !emailSuppressedForBurst && typeof window !== 'undefined' && window.LYANN_NOTIFICATIONS) {
            window.LYANN_NOTIFICATIONS.sendEmail(
                `user_${user_id}@lyann.app`,
                `Membre LYANN`,
                title,
                `<div style="font-family: sans-serif; padding: 20px;"><h2>${title}</h2><p>${body}</p></div>`
            ).catch(() => {});
        }

        return { notification: newNotif, duplicated: false };
    }

    // DEFAULT DEEP LINK CTA MAPPER (TEST F)
    function getDefaultCTA(type, entity_type, entity_id) {
        if (type === 'OPPORTUNITY' || entity_type === 'request') {
            return { label: 'Voir le besoin', action: 'openRequestDetails', params: { request_id: entity_id } };
        }
        if (type === 'NEW_MESSAGE' || entity_type === 'conversation') {
            return { label: 'Répondre au message', action: 'openConversation', params: { conversation_id: entity_id } };
        }
        if (type.startsWith('QUOTE') || type.startsWith('MISSION') || entity_type === 'mission') {
            return { label: 'Voir la mission', action: 'openMissionDetails', params: { mission_id: entity_id } };
        }
        if (type.startsWith('PAYMENT') || entity_type === 'payment') {
            return { label: 'Voir le paiement', action: 'openPaymentPortal', params: { payment_id: entity_id } };
        }
        if (type === 'REVIEW') {
            return { label: 'Laisser un avis', action: 'openReviewModal', params: { entity_id } };
        }
        return { label: 'Ouvrir LYANN', action: 'openAppHome', params: {} };
    }

    // 5. STEP 11 WAVE INTEGRATION (TEST A, TEST B, TEST K)
    function dispatchOpportunityNotifications(need, dispatchResult) {
        if (!need || !dispatchResult || !dispatchResult.dispatched_candidates) {
            return { notified_count: 0, notifications: [] };
        }

        const currentWave = dispatchResult.wave_number || 1;
        const candidates = dispatchResult.dispatched_candidates;
        const results = [];

        for (const candidate of candidates) {
            // Privacy protection: No scores or breakdown in notification body
            const cityPart = need.city || candidate.city || 'Guadeloupe';
            const title = "Nouveau besoin près de chez vous";
            const body = `Quelqu'un à ${cityPart} cherche de l'aide : "${need.title || need.description || 'Demande de service'}".`;

            const notifResult = createNotification({
                user_id: candidate.candidate_id || candidate.id,
                type: 'OPPORTUNITY',
                priority: 'NORMAL',
                title,
                body,
                entity_type: 'request',
                entity_id: need.id,
                wave_number: currentWave,
                cta: {
                    label: 'Voir le besoin',
                    action: 'openRequestDetails',
                    params: { request_id: need.id }
                },
                event_id: `need_${need.id}_wave_${currentWave}`
            }, { is_service_role: true });

            results.push(notifResult.notification);
        }

        return {
            notified_count: results.length,
            wave_number: currentWave,
            notifications: results
        };
    }

    // 6. MARK AS READ / SEEN SYNC (TEST D)
    function markAsRead(notificationId, userId) {
        const all = getAllNotifications();
        let updatedCount = 0;
        for (const n of all) {
            if (n.id === notificationId && n.user_id === userId) {
                n.read = true;
                n.status = 'read';
                updatedCount++;
            }
        }
        if (updatedCount > 0) saveAllNotifications(all);
        const client = typeof window !== 'undefined' ? (window.LYANN_API_CLIENT || window.apiClient) : null;
        if (client?.markNotificationRead && notificationId) {
            client.markNotificationRead(notificationId).catch(() => {});
        }
        return { success: true, updated_count: updatedCount };
    }

    function markAllAsRead(userId) {
        const all = getAllNotifications();
        let updatedCount = 0;
        for (const n of all) {
            if (n.user_id === userId && !n.read) {
                n.read = true;
                n.status = 'read';
                updatedCount++;
            }
        }
        if (updatedCount > 0) saveAllNotifications(all);
        const client = typeof window !== 'undefined' ? (window.LYANN_API_CLIENT || window.apiClient) : null;
        if (client?.markAllNotificationsRead) {
            client.markAllNotificationsRead().catch(() => {});
        }
        return { success: true, updated_count: updatedCount };
    }

    // 7. CLOSED OPPORTUNITY HANDLING (TEST G)
    function getOpportunityState(requestId, requestStatus = 'ACTIVE') {
        const closedStatuses = ['CLOSED', 'ASSIGNED', 'CANCELLED', 'EXPIRED', 'COMPLETED'];
        if (closedStatuses.includes(requestStatus.toUpperCase())) {
            return {
                available: false,
                human_message: "Ce coup de main n'est plus disponible."
            };
        }
        return {
            available: true,
            human_message: "Ce coup de main est toujours ouvert."
        };
    }

    // 8. ADMIN BROADCAST ENGINE (Section 21)
    function sendAdminBroadcast(params, adminContext) {
        const { target_audience = 'ALL', title, body, preview_only = false } = params;

        // RBAC check
        const callerRole = adminContext?.role || 'user';
        if (callerRole !== 'admin' && callerRole !== 'owner') {
            throw new Error("SECURITY_VIOLATION: Admin broadcast requires ADMIN or OWNER role.");
        }

        // Mika isolation check (Section 22)
        if (adminContext?.is_agent || adminContext?.agent_id) {
            throw new Error("SECURITY_VIOLATION: AI Agents (Mika) cannot send autonomous broadcasts.");
        }

        if (preview_only) {
            return {
                preview: true,
                target_audience,
                title,
                body,
                estimated_recipients: target_audience === 'ALL' ? 100 : 25
            };
        }

        // Broadcast audit log
        logDeliveryAudit({
            id: 'BROADCAST-' + Date.now(),
            user_id: 'broadcast_group_' + target_audience,
            type: 'SYSTEM',
            channel: 'in_app',
            status: 'sent',
            title,
            body
        });

        return {
            success: true,
            broadcast_id: 'BROADCAST-' + Date.now(),
            target_audience,
            dispatched_at: new Date().toISOString()
        };
    }

    // Export module API
    const LyannNotificationEngine = {
        getUserPreferences,
        updateUserPreferences,
        hydrateFromServer,
        ingestServerNotification,
        playNotificationSound,
        primeNotificationSound,
        toServerPrefs,
        getUserNotifications,
        getUnreadCount,
        createNotification,
        dispatchOpportunityNotifications,
        markAsRead,
        markAllAsRead,
        getOpportunityState,
        sendAdminBroadcast,
        getAllNotifications,
        saveAllNotifications
    };

    if (typeof globalThis !== 'undefined') {
        globalThis.LyannNotificationEngine = LyannNotificationEngine;
    }
    if (typeof window !== 'undefined') {
        window.LyannNotificationEngine = LyannNotificationEngine;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = LyannNotificationEngine;
    }

})(typeof globalThis !== 'undefined' ? globalThis : this);
