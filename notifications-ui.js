/** LYANN notifications UI — extracted from legacy script.js without behavior changes. */

// === NOTIFICATIONS MODAL & BADGE SYSTEM ===
function updateHeaderNotificationBadge(options = {}) {
    const currentUserId = window.LYANN_AUTH_STATE?.getSnapshot?.().userId || window.LYANN_CURRENT_USER?.id || null;
    const badge = document.querySelector('.notif-badge-count');
    if (badge) {
        if (!currentUserId || !window.LyannNotificationEngine) {
            badge.style.display = 'none';
        } else {
            const unreadCount = window.LyannNotificationEngine.getUnreadCount(currentUserId, currentUserId);
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }
    if (options.messages !== false) refreshMessageBadge(currentUserId);
}

function paintMessageBadge(count) {
    document.querySelectorAll('#tab-messages, #btnHeaderChat, .nav-msg-btn').forEach((el) => {
        if (el.id === 'btnHeaderNotif') return;
        if (!el.querySelector('.msg-badge-count')) {
            const span = document.createElement('span');
            span.className = 'msg-badge-count';
            span.setAttribute('aria-hidden', 'true');
            el.appendChild(span);
        }
    });
    const total = Number(count) || 0;
    document.querySelectorAll('.msg-badge-count').forEach((badge) => {
        if (total > 0) {
            badge.textContent = total > 99 ? '99+' : String(total);
            badge.classList.add('is-on');
            badge.style.display = 'inline-flex';
        } else {
            badge.textContent = '';
            badge.classList.remove('is-on');
            badge.style.display = 'none';
        }
    });
}

async function refreshMessageBadge(currentUserId) {
    const userId = currentUserId || window.LYANN_AUTH_STATE?.getSnapshot?.().userId || window.LYANN_CURRENT_USER?.id || null;
    if (!userId || !window.LYANN_API_CLIENT?.supabase) {
        paintMessageBadge(0);
        return;
    }
    try {
        const { data: parts, error: partsError } = await window.LYANN_API_CLIENT.supabase.from('conversation_participants').select('conversation_id').eq('user_id', userId);
        if (partsError) throw partsError;
        const ids = (parts || []).map((row) => row.conversation_id).filter(Boolean);
        if (!ids.length) {
            paintMessageBadge(0);
            return;
        }
        const { data: unread, error } = await window.LYANN_API_CLIENT.supabase.from('messages').select('conversation_id').in('conversation_id', ids).eq('is_read', false).neq('sender_id', userId);
        if (error) throw error;
        paintMessageBadge(new Set((unread || []).map((row) => row.conversation_id)).size);
    } catch (err) {
        console.warn('[messages] badge', err?.message || err);
    }
}
window.refreshMessageBadge = refreshMessageBadge;

let lyannNotifEscapeHandler = null;

function clearNotificationEscape() {
    if (!lyannNotifEscapeHandler) return;
    document.removeEventListener('keydown', lyannNotifEscapeHandler);
    lyannNotifEscapeHandler = null;
}

function lyannNotificationUserId() {
    return window.LYANN_AUTH_STATE?.getSnapshot?.().userId || window.LYANN_CURRENT_USER?.id || null;
}

function lyannNotificationsSignedIn() {
    return document.body.classList.contains('user-is-logged-in')
        || window.LYANN_AUTH_STATE?.isAuthenticated?.() === true;
}

function escapeNotificationText(value) {
    if (typeof window.escapeHtmlAttr === 'function') return window.escapeHtmlAttr(value);
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function notificationKind(type) {
    const key = String(type || '').toUpperCase();
    const exact = {
        LIKE: ['J’aime', 'ph-heart'],
        POST_LIKE: ['J’aime', 'ph-heart'],
        BOKANTAJ_LIKE: ['J’aime', 'ph-heart'],
        REACTION: ['J’aime', 'ph-heart'],
        COMMENT: ['Commentaire', 'ph-chat-circle'],
        POST_COMMENT: ['Commentaire', 'ph-chat-circle'],
        BOKANTAJ_COMMENT: ['Commentaire', 'ph-chat-circle'],
        OPPORTUNITY: ['Mission correspondante', 'ph-handshake'],
        MATCHING_REQUEST: ['Mission correspondante', 'ph-handshake'],
        QUOTE: ['Proposition de devis', 'ph-file-text'],
        QUOTE_SENT: ['Proposition de devis', 'ph-file-text'],
        QUOTE_PROPOSAL: ['Proposition de devis', 'ph-file-text'],
        QUOTE_REVISED: ['Proposition de devis', 'ph-file-text'],
        QUOTE_ACCEPTED: ['Devis accepté', 'ph-check-circle'],
        BOKANTAJ: ['Bokantaj', 'ph-broadcast'],
        NEW_MESSAGE: ['Message', 'ph-chat-circle-dots'],
        REQUEST_CLOSING: ['Annonce', 'ph-clock'],
        MILESTONE: ['Mission', 'ph-flag-checkered'],
        MISSION_UPDATE: ['Mission', 'ph-flag-checkered'],
        REVIEW: ['Avis', 'ph-star'],
        SAFETY_REPORT_CONFIRMATION: ['Signalement', 'ph-warning-circle'],
        SANCTION_NOTICE: ['Modération', 'ph-warning-circle'],
        SYSTEM: ['LYANN', 'ph-bell'],
        PAYOUT_READY: ['Compte de versement', 'ph-bank']
    };
    if (exact[key]) return { label: exact[key][0], icon: exact[key][1] };
    if (key.startsWith('PAYMENT')) return { label: 'Paiement', icon: 'ph-credit-card' };
    if (key.startsWith('QUOTE')) return { label: 'Proposition de devis', icon: 'ph-file-text' };
    if (key.startsWith('MISSION')) return { label: 'Mission', icon: 'ph-flag-checkered' };
    if (key.includes('LIKE')) return { label: 'J’aime', icon: 'ph-heart' };
    if (key.includes('COMMENT')) return { label: 'Commentaire', icon: 'ph-chat-circle' };
    return null;
}

function openNotificationTarget(notif) {
    const entityType = String(notif?.entity_type || '').toLowerCase();
    const entityId = notif?.entity_id ? String(notif.entity_id) : '';
    const nType = String(notif?.type || '');
    if (nType === 'REQUEST_CLOSING') return false;
    if ((entityType === 'conversation' || nType === 'NEW_MESSAGE') && entityId) {
        window.LYANN_ROUTER?.go?.('messages', {
            contactId: entityId,
            name: entityId === window.LYANN_SUPPORT_USER_ID ? 'Support LYANN' : undefined
        });
        return true;
    }
    if (entityType === 'request' && entityId) {
        if (window.LYANN_ROUTER) window.LYANN_ROUTER.go('mission', { requestId: entityId });
        else if (typeof window.openLyannDetailModal === 'function') window.openLyannDetailModal(entityId);
        else if (typeof window.openRequestDetails === 'function') window.openRequestDetails(entityId);
        return true;
    }
    if (entityType === 'post' || entityType === 'bokantaj_post' || nType === 'BOKANTAJ') {
        const onFeed = /feed\.html/i.test(window.location.pathname);
        const card = entityId ? document.getElementById(entityId) : null;
        if (onFeed && card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return true;
        }
        if (!onFeed) {
            window.LYANN_ROUTER?.go?.('bokantaj');
            return true;
        }
        return false;
    }
    if (entityType === 'mission' && entityId) {
        if (typeof window.openMissionDetailsModal === 'function') window.openMissionDetailsModal(entityId);
        else if (typeof window.openMissionDetails === 'function') window.openMissionDetails(entityId);
        return true;
    }
    return false;
}

function openNotificationsModal() {
    const currentUserId = lyannNotificationUserId();
    if (!lyannNotificationsSignedIn() || !currentUserId) {
        if (typeof window.openLoginModal === 'function') window.openLoginModal();
        else document.querySelector('.open-login-trigger')?.click();
        return;
    }
    renderNotificationsModal();
    if (window.LyannNotificationEngine?.hydrateFromServer) {
        window.LyannNotificationEngine.hydrateFromServer(currentUserId).then(() => {
            if (document.getElementById('notificationsModal')?.classList.contains('active')) renderNotificationsModal();
        });
    }
}

function renderNotificationsModal() {
    const currentUserId = lyannNotificationUserId();
    if (!lyannNotificationsSignedIn() || !currentUserId) {
        if (typeof window.openLoginModal === 'function') window.openLoginModal();
        return;
    }

    const previous = document.getElementById('notificationsModal');
    const wasOpen = !!previous?.classList.contains('active');
    clearNotificationEscape();
    previous?.remove();

    const modal = document.createElement('div');
    modal.className = 'sheet-backdrop lyann-notif-backdrop';
    modal.id = 'notificationsModal';
    document.body.appendChild(modal);

    let notifs = [];
    try {
        notifs = window.LyannNotificationEngine
            ? window.LyannNotificationEngine.getUserNotifications(currentUserId, currentUserId)
            : [];
    } catch (_) {
        notifs = [];
    }
    notifs = notifs
        .filter((n) => n && n.user_id === currentUserId && n.type !== 'NEW_MESSAGE')
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const unreadCount = notifs.filter((n) => !n.read).length;

    modal.innerHTML = `
        <div class="lyann-notif-sheet" role="dialog" aria-modal="true" aria-labelledby="lyannNotifTitle">
            <div class="lyann-notif-handle" aria-hidden="true"></div>
            <div class="lyann-notif-head">
                <div class="lyann-notif-head-row">
                    <h3 id="lyannNotifTitle">Notifications</h3>
                    ${unreadCount > 0 ? `<span class="lyann-notif-unread">${unreadCount} non lue${unreadCount > 1 ? 's' : ''}</span>` : ''}
                    <button type="button" id="closeNotificationsModalBtn" class="modal-close-btn" aria-label="Fermer"><i class="ph ph-x"></i></button>
                </div>
                ${unreadCount > 0 ? `<button type="button" id="btnMarkAllNotifsRead" class="lyann-notif-mark-all">Tout marquer lu</button>` : ''}
            </div>
            <div class="notifications-list lyann-notif-list">
                ${notifs.length === 0 ? `
                    <div class="lyann-notif-empty">
                        <i class="ph ph-bell-slash" aria-hidden="true"></i>
                        <p>Aucune notification pour le moment.</p>
                        <span>Les j’aime, commentaires, missions et devis apparaîtront ici.</span>
                    </div>
                ` : notifs.map((n) => {
                    const kind = notificationKind(n.type);
                    const icon = kind?.icon || 'ph-bell';
                    const timeAgo = escapeNotificationText(formatRelativeTime(n.created_at));
                    const isUnread = !n.read;
                    const title = escapeNotificationText(n.title || kind?.label || 'Notification');
                    const body = escapeNotificationText(n.body || '');
                    const cta = n.cta?.label ? escapeNotificationText(n.cta.label) : '';
                    const notifId = escapeNotificationText(n.id);
                    const entityType = escapeNotificationText(n.entity_type || '');
                    const entityId = escapeNotificationText(n.entity_id || '');
                    return `
                        <div class="notif-item-card${isUnread ? ' is-unread' : ''}" role="button" tabindex="0" data-notif-id="${notifId}" data-entity-type="${entityType}" data-entity-id="${entityId}">
                            <span class="lyann-notif-icon" aria-hidden="true"><i class="ph ${icon}"></i></span>
                            <div class="lyann-notif-copy">
                                ${kind ? `<span class="lyann-notif-kind">${escapeNotificationText(kind.label)}</span>` : ''}
                                <div class="lyann-notif-title-row">
                                    <strong>${title}</strong>
                                    <span>${timeAgo}</span>
                                </div>
                                ${body ? `<p>${body}</p>` : ''}
                                ${cta ? `<span class="lyann-notif-cta">${cta} →</span>` : ''}
                                ${n.type === 'REQUEST_CLOSING' && n.entity_id ? `
                                    <div class="request-lifecycle-actions">
                                        <button type="button" data-lifecycle="reopen" data-request-id="${entityId}">Rouvrir</button>
                                        <button type="button" data-lifecycle="pause" data-request-id="${entityId}">Mettre en pause</button>
                                        <button type="button" data-lifecycle="leave" data-request-id="${entityId}">Laisser fermer</button>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    const closeModal = () => {
        clearNotificationEscape();
        modal.classList.remove('active');
        if (typeof window.unlockBodyScroll === 'function') window.unlockBodyScroll();
        else document.body.style.overflow = '';
        updateHeaderNotificationBadge();
        window.setTimeout(() => {
            if (!modal.classList.contains('active')) modal.remove();
        }, 220);
    };
    lyannNotifEscapeHandler = (event) => {
        if (event.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', lyannNotifEscapeHandler);

    document.getElementById('closeNotificationsModalBtn')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    modal.querySelectorAll('[data-lifecycle]').forEach(btn => {
        btn.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const client = window.LYANN_API_CLIENT || window.apiClient;
            const requestId = btn.dataset.requestId;
            const action = btn.dataset.lifecycle;
            if (!client?.applyRequestLifecycle || !requestId || !action) return;
            try {
                await client.applyRequestLifecycle(requestId, action);
                const notifId = btn.closest('.notif-item-card')?.getAttribute('data-notif-id');
                if (window.LyannNotificationEngine && notifId) {
                    window.LyannNotificationEngine.markAsRead(notifId, currentUserId);
                }
                const label = action === 'reopen' ? 'Annonce rouverte.' : (action === 'pause' ? 'Annonce laissée en pause.' : 'Elle se fermera à la date prévue.');
                if (window.NotificationService) window.NotificationService.showToast('success', label);
                closeModal();
            } catch (err) {
                if (window.lyannAlert) window.lyannAlert(err.message || 'Action impossible pour le moment.');
            }
        });
    });

    document.getElementById('btnMarkAllNotifsRead')?.addEventListener('click', () => {
        if (window.LyannNotificationEngine) {
            window.LyannNotificationEngine.markAllAsRead(currentUserId);
            renderNotificationsModal();
            updateHeaderNotificationBadge();
        }
    });

    // Deep link action handler for item clicks
    modal.querySelectorAll('.notif-item-card').forEach(card => {
        card.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            card.click();
        });
        card.addEventListener('click', () => {
            const notifId = card.getAttribute('data-notif-id');
            const entityType = card.getAttribute('data-entity-type');
            const entityId = card.getAttribute('data-entity-id');
            const nType = (window.LyannNotificationEngine?.getUserNotifications?.(currentUserId, currentUserId) || [])
                .find((item) => String(item.id) === String(notifId))?.type;

            if (nType === 'REQUEST_CLOSING') return;

            if (window.LyannNotificationEngine && notifId) {
                window.LyannNotificationEngine.markAsRead(notifId, currentUserId);
            }

            const notif = (window.LyannNotificationEngine?.getUserNotifications?.(currentUserId, currentUserId) || [])
                .find((item) => String(item.id) === String(notifId));

            if (entityType === 'request' && entityId && window.LyannNotificationEngine) {
                const oppState = window.LyannNotificationEngine.getOpportunityState(entityId, card.getAttribute('data-request-status') || 'ACTIVE');
                if (!oppState.available) {
                    closeModal();
                    if (typeof window.showLyanToast === 'function') window.showLyanToast(oppState.human_message, 'ℹ️');
                    else alert(oppState.human_message);
                    return;
                }
            }

            const opened = openNotificationTarget(notif || { type: nType, entity_type: entityType, entity_id: entityId });
            if (opened) closeModal();
            else renderNotificationsModal();
        });
    });

    modal.classList.add('active');
    if (!wasOpen) {
        if (typeof window.lockBodyScroll === 'function') window.lockBodyScroll();
        else document.body.style.overflow = 'hidden';
    }
}

function formatRelativeTime(isoString) {
    if (!isoString) return 'Récemment';
    const date = new Date(isoString);
    const now = new Date();
    const diffMin = Math.floor((now - date) / 60000);
    if (diffMin < 1) return 'À l\'instant';
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    return date.toLocaleDateString('fr-FR');
}

function mountNotificationPreferenceControls() {
    document.querySelectorAll('#tab-acc-settings-sec .profile-section-card').forEach((card) => {
        const title = card.querySelector('.profile-section-title');
        if (!title || !/Notifications/.test(title.textContent || '')) return;
        if (card.querySelector('.lyann-pref-messages')) return;
        card.innerHTML = `
            <h4 class="profile-section-title">🔔 Notifications</h4>
            <p style="font-size:0.8rem;color:var(--text-muted);margin:0 0 12px;">Choisissez ce que LYANN vous signale dans l’application.</p>
            <label style="display:flex;align-items:center;gap:10px;font-size:0.88rem;margin-bottom:8px;">
                <input type="checkbox" class="lyann-pref-messages"> Messages reçus
            </label>
            <label style="display:flex;align-items:center;gap:10px;font-size:0.88rem;margin-bottom:8px;">
                <input type="checkbox" class="lyann-pref-matching"> Besoins qui correspondent à mes compétences
            </label>
            <label style="display:flex;align-items:center;gap:10px;font-size:0.88rem;">
                <input type="checkbox" class="lyann-pref-bokantaj"> Nouveaux lyann sur Bokantaj
            </label>
        `;
    });
    bindNotificationPreferenceControls();
}

function bindNotificationPreferenceControls() {
    const userId = window.LYANN_AUTH_STATE?.getSnapshot?.().userId || window.LYANN_CURRENT_USER?.id || null;
    const engine = window.LyannNotificationEngine;
    const prefs = engine && userId ? engine.getUserPreferences(userId) : null;
    const enabled = (key) => {
        const value = prefs?.[key];
        if (typeof value === 'boolean') return value;
        if (value && typeof value === 'object') return value.in_app !== false;
        return true;
    };
    const persistFrom = (root) => {
        if (!engine || !userId) return;
        const messages = root.querySelector('.lyann-pref-messages');
        const matching = root.querySelector('.lyann-pref-matching');
        const bokantaj = root.querySelector('.lyann-pref-bokantaj');
        if (!messages || !matching || !bokantaj) return;
        engine.updateUserPreferences(userId, userId, {
            messages: { in_app: messages.checked, push: messages.checked, email: messages.checked },
            matching_requests: { in_app: matching.checked },
            opportunities: { in_app: matching.checked, push: matching.checked, email: matching.checked },
            bokantaj: { in_app: bokantaj.checked },
            news: { in_app: bokantaj.checked, push: false, email: false }
        });
    };
    document.querySelectorAll('.lyann-pref-messages').forEach((input) => {
        const root = input.closest('.profile-section-card, .account-group-box, section') || input.parentElement;
        const matching = root.querySelector('.lyann-pref-matching');
        const bokantaj = root.querySelector('.lyann-pref-bokantaj');
        input.checked = enabled('messages');
        if (matching) matching.checked = enabled('matching_requests') && enabled('opportunities');
        if (bokantaj) bokantaj.checked = enabled('bokantaj') && enabled('news');
        [input, matching, bokantaj].filter(Boolean).forEach((el) => {
            el.onchange = () => persistFrom(root);
        });
    });
}

async function syncLyannNotificationsFromServer() {
    const userId = window.LYANN_AUTH_STATE?.getSnapshot?.().userId || null;
    const client = window.LYANN_API_CLIENT || window.apiClient;
    if (client?.getSupportUserId) {
        try { await client.getSupportUserId(); } catch (_) {}
    }
    if (userId && window.LyannNotificationEngine?.hydrateFromServer) {
        await window.LyannNotificationEngine.hydrateFromServer(userId);
    }
    updateHeaderNotificationBadge();
    bindNotificationPreferenceControls();
}

let lyannNotificationChannel = null;
let lyannNotificationPoll = null;
let lyannNotificationChannelLive = false;

function stopLyannNotificationLiveFeed() {
    const client = window.LYANN_API_CLIENT || window.apiClient;
    if (lyannNotificationChannel && client?.supabase) {
        try { client.supabase.removeChannel(lyannNotificationChannel); } catch (_) {}
    }
    lyannNotificationChannel = null;
    lyannNotificationChannelLive = false;
    if (lyannNotificationPoll) {
        clearInterval(lyannNotificationPoll);
        lyannNotificationPoll = null;
    }
}

function startLyannNotificationLiveFeed() {
    const userId = window.LYANN_AUTH_STATE?.getSnapshot?.().userId || null;
    const client = window.LYANN_API_CLIENT || window.apiClient;
    stopLyannNotificationLiveFeed();
    if (!userId || !client?.supabase) return;

    lyannNotificationChannel = client.supabase
        .channel('lyann-user-notifications')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`
        }, (payload) => {
            if (window.LyannNotificationEngine?.ingestServerNotification) {
                window.LyannNotificationEngine.ingestServerNotification(payload.new, userId, { chime: true });
            }
            updateHeaderNotificationBadge();
        })
        .subscribe((status) => {
            lyannNotificationChannelLive = status === 'SUBSCRIBED';
        });

    // Realtime is the primary path; the poll only covers a channel that is down.
    lyannNotificationPoll = setInterval(() => {
        if (document.hidden || lyannNotificationChannelLive) return;
        hydrateLyannNotifications(userId);
    }, 30000);
}

function hydrateLyannNotifications(userId) {
    if (!userId || !window.LyannNotificationEngine?.hydrateFromServer) return;
    window.LyannNotificationEngine.hydrateFromServer(userId).then(() => updateHeaderNotificationBadge({ messages: false }));
}

function unlockLyannNotificationSound() {
    window.LyannNotificationEngine?.primeNotificationSound?.();
}

document.addEventListener('lyann:auth-state', (event) => {
    mountNotificationPreferenceControls();
    const authenticated = event.detail?.authenticated === true;
    if (authenticated) {
        syncLyannNotificationsFromServer().then(() => startLyannNotificationLiveFeed());
    } else {
        stopLyannNotificationLiveFeed();
    }
});
document.addEventListener('lyann_notifications_updated', () => updateHeaderNotificationBadge());
window.addEventListener('focus', () => updateHeaderNotificationBadge({ messages: false }));
document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    updateHeaderNotificationBadge();
    hydrateLyannNotifications(window.LYANN_AUTH_STATE?.getSnapshot?.().userId || null);
});
document.addEventListener('pointerdown', unlockLyannNotificationSound, { once: true, capture: true });
document.addEventListener('keydown', unlockLyannNotificationSound, { once: true, capture: true });
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountNotificationPreferenceControls);
} else {
    mountNotificationPreferenceControls();
}
