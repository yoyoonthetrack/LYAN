/** LYANN notifications UI — extracted from legacy script.js without behavior changes. */

// === NOTIFICATIONS MODAL & BADGE SYSTEM ===
function updateHeaderNotificationBadge() {
    const currentUserId = window.LYANN_AUTH_STATE?.getSnapshot?.().userId || window.LYANN_CURRENT_USER?.id || null;
    const badge = document.querySelector('.notif-badge-count');
    if (!badge) return;
    if (!currentUserId) {
        badge.style.display = 'none';
        return;
    }

    if (window.LyannNotificationEngine) {
        const unreadCount = window.LyannNotificationEngine.getUnreadCount(currentUserId, currentUserId);
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

function openNotificationsModal() {
    const currentUserId = window.LYANN_AUTH_STATE?.getSnapshot?.().userId || window.LYANN_CURRENT_USER?.id || null;
    if (window.LyannNotificationEngine?.hydrateFromServer && currentUserId) {
        window.LyannNotificationEngine.hydrateFromServer(currentUserId).then(() => renderNotificationsModal());
        return;
    }
    renderNotificationsModal();
}

function renderNotificationsModal() {
    const currentUserId = window.LYANN_AUTH_STATE?.getSnapshot?.().userId || window.LYANN_CURRENT_USER?.id || null;
    let modal = document.getElementById('notificationsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'notificationsModal';
        document.body.appendChild(modal);
    }

    const notifs = window.LyannNotificationEngine 
        ? window.LyannNotificationEngine.getUserNotifications(currentUserId, currentUserId) 
        : [];
    const unreadCount = notifs.filter(n => !n.read).length;

    modal.innerHTML = `
        <div class="modal-card modal-card-notifications" style="max-width: 520px; width: 92%; border-radius: var(--radius-xl); padding: 20px; background: #FFFFFF; margin: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.3); position: relative;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid var(--border-light); padding-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <h3 style="font-size: 1.15rem; font-weight: 800; margin: 0; color: var(--text);">Notifications 🔔</h3>
                    ${unreadCount > 0 ? `<span style="background: var(--primary); color: #FFF; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 12px;">${unreadCount} non lue(s)</span>` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    ${unreadCount > 0 ? `<button type="button" id="btnMarkAllNotifsRead" style="background: none; border: none; font-size: 0.8rem; color: var(--primary); font-weight: 700; cursor: pointer;">Tout marquer lu</button>` : ''}
                    <button type="button" id="closeNotificationsModalBtn" class="modal-close-btn" aria-label="Fermer" style="position: static; opacity: 1;"><i class="ph ph-x"></i></button>
                </div>
            </div>
            <div class="notifications-list" style="display: flex; flex-direction: column; gap: 10px; max-height: 55vh; overflow-y: auto;">
                ${notifs.length === 0 ? `
                    <div style="text-align: center; padding: 32px 16px; color: var(--text-muted);">
                        <i class="ph ph-bell-slash" style="font-size: 2.5rem; opacity: 0.5; margin-bottom: 8px;"></i>
                        <p style="margin: 0; font-weight: 600;">Rien de nouveau pour le moment.</p>
                        <span style="font-size: 0.8rem;">Vos opportunités et messages apparaîtront ici.</span>
                    </div>
                ` : notifs.map(n => {
                    const icon = n.type === 'OPPORTUNITY' ? '🤝' 
                        : (n.type === 'NEW_MESSAGE' ? '💬' 
                        : (n.type === 'BOKANTAJ' ? '📣'
                        : (n.type.startsWith('MISSION') ? '🎯' 
                        : (n.type.startsWith('PAYMENT') ? '💳' : '🔔'))));
                    
                    const timeAgo = formatRelativeTime(n.created_at);
                    const isUnread = !n.read;
                    
                    return `
                        <div class="notif-item-card" data-notif-id="${n.id}" data-entity-type="${n.entity_type || ''}" data-entity-id="${n.entity_id || ''}" style="display: flex; gap: 12px; padding: 12px 14px; background: ${isUnread ? 'rgba(74, 124, 89, 0.06)' : 'var(--bg-alt)'}; border-radius: var(--radius-lg); border-left: 4px solid ${isUnread ? 'var(--primary)' : 'transparent'}; cursor: pointer; transition: all 0.2s ease;">
                            <span style="font-size: 1.4rem;">${icon}</span>
                            <div style="flex: 1;">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2px;">
                                    <strong style="font-size: 0.88rem; color: var(--text); font-weight: 700;">${n.title}</strong>
                                    <span style="font-size: 0.72rem; color: var(--text-muted); white-space: nowrap;">${timeAgo}</span>
                                </div>
                                <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0 0 6px 0; line-height: 1.3;">${n.body}</p>
                                ${n.cta ? `<span style="font-size: 0.76rem; font-weight: 700; color: var(--primary); display: inline-flex; align-items: center; gap: 4px;">${n.cta.label} &rarr;</span>` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    const closeBtn = document.getElementById('closeNotificationsModalBtn');
    const closeModal = () => {
        modal.classList.remove('active');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        updateHeaderNotificationBadge();
    };

    closeBtn?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.getElementById('btnMarkAllNotifsRead')?.addEventListener('click', () => {
        if (window.LyannNotificationEngine) {
            window.LyannNotificationEngine.markAllAsRead(currentUserId);
            openNotificationsModal();
            updateHeaderNotificationBadge();
        }
    });

    // Deep link action handler for item clicks
    modal.querySelectorAll('.notif-item-card').forEach(card => {
        card.addEventListener('click', () => {
            const notifId = card.getAttribute('data-notif-id');
            const entityType = card.getAttribute('data-entity-type');
            const entityId = card.getAttribute('data-entity-id');
            const nType = (window.LyannNotificationEngine?.getUserNotifications?.(currentUserId, currentUserId) || [])
                .find((item) => String(item.id) === String(notifId))?.type;

            if (window.LyannNotificationEngine && notifId) {
                window.LyannNotificationEngine.markAsRead(notifId, currentUserId);
            }

            closeModal();

            // Closed Opportunity Handling Check (TEST G)
            if (entityType === 'request' && entityId && window.LyannNotificationEngine) {
                const oppState = window.LyannNotificationEngine.getOpportunityState(entityId, card.getAttribute('data-request-status') || 'ACTIVE');
                if (!oppState.available) {
                    if (typeof window.showLyanToast === 'function') {
                        window.showLyanToast(oppState.human_message, 'ℹ️');
                    } else {
                        alert(oppState.human_message);
                    }
                    return;
                }
            }

            // Deep link actions (TEST F)
            if (entityType === 'conversation' || nType === 'NEW_MESSAGE') {
                window.LYANN_ROUTER?.go?.('messages', { contactId: entityId, name: entityId === window.LYANN_SUPPORT_USER_ID ? 'Support LYANN' : undefined });
            } else if (entityType === 'request' && entityId) {
                if (window.LYANN_ROUTER) window.LYANN_ROUTER.go('mission', { requestId: entityId });
                else if (typeof window.openRequestDetails === 'function') window.openRequestDetails(entityId);
            } else if (entityType === 'post' || nType === 'BOKANTAJ') {
                window.LYANN_ROUTER?.go?.('bokantaj');
            } else if (entityType === 'mission' && entityId) {
                if (typeof window.openMissionDetails === 'function') window.openMissionDetails(entityId);
            }
        });
    });

    modal.classList.add('active');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
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

function stopLyannNotificationLiveFeed() {
    const client = window.LYANN_API_CLIENT || window.apiClient;
    if (lyannNotificationChannel && client?.supabase) {
        try { client.supabase.removeChannel(lyannNotificationChannel); } catch (_) {}
    }
    lyannNotificationChannel = null;
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
        .subscribe();

    lyannNotificationPoll = setInterval(() => {
        if (document.hidden) return;
        if (window.LyannNotificationEngine?.hydrateFromServer) {
            window.LyannNotificationEngine.hydrateFromServer(userId).then(() => updateHeaderNotificationBadge());
        }
    }, 20000);
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
document.addEventListener('pointerdown', unlockLyannNotificationSound, { once: true, capture: true });
document.addEventListener('keydown', unlockLyannNotificationSound, { once: true, capture: true });
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountNotificationPreferenceControls);
} else {
    mountNotificationPreferenceControls();
}
