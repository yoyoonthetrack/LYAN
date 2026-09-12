/** LYANN notifications UI — extracted from legacy script.js without behavior changes. */

// === NOTIFICATIONS MODAL & BADGE SYSTEM ===
function updateHeaderNotificationBadge() {
    const currentUserId = window.LYANN_CURRENT_USER?.id || 'demo_user';
    const badge = document.querySelector('.notif-badge-count');
    if (!badge) return;

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
    const currentUserId = window.LYANN_CURRENT_USER?.id || 'demo_user';
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
                        : (n.type.startsWith('MISSION') ? '🎯' 
                        : (n.type.startsWith('PAYMENT') ? '💳' : '🔔')));
                    
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
            if (entityType === 'conversation' && entityId) {
                if (typeof window.openConversation === 'function') window.openConversation(entityId);
            } else if (entityType === 'request' && entityId) {
                if (typeof window.openRequestDetails === 'function') window.openRequestDetails(entityId);
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
