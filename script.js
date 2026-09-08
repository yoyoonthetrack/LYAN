/**
 * LYANN - Script (Community, Trust, Member Search & Interactive Signup Workflow)
 */

// === CAPACITOR MOBILE DETECTOR & DYNAMIC BRIDGE INJECTION ===
(function() {
    const isCapacitorOrigin = window.location.origin.includes('capacitor://') || 
                              window.location.origin.includes('http://localhost') || 
                              window.location.href.startsWith('file://');
    if (isCapacitorOrigin && !window.Capacitor) {
        const script = document.createElement('script');
        script.src = 'capacitor.js';
        script.onload = () => {
            console.log("⚡ Capacitor Native Bridge Loaded Dynamically!");
            if (typeof initializeNativeFeatures === 'function') {
                initializeNativeFeatures();
            }
        };
    }
})();

let lyannActiveOverlayCount = 0;

window.lockBodyScroll = function() {
    lyannActiveOverlayCount++;
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
};

window.unlockBodyScroll = function() {
    lyannActiveOverlayCount = Math.max(0, lyannActiveOverlayCount - 1);
    const activeModals = document.querySelectorAll('.modal-overlay.active, .mobile-menu-overlay.active, #mobileHamburgerDrawerOverlay.active, .mobile-bottom-sheet.active');
    if (activeModals.length === 0 || lyannActiveOverlayCount === 0) {
        lyannActiveOverlayCount = 0;
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
    }
};

function isNativePlatform() {
    return window.Capacitor !== undefined && window.Capacitor.isNativePlatform();
}

// === LYANN OFFICIAL DOM COMMUNES DICTIONARY ===
window.LYANN_DOM_COMMUNES = {
    'Guadeloupe (971)': [
        'Baie-Mahault (97122)', 'Les Abymes (97139)', 'Pointe-à-Pitre (97110)', 'Le Gosier (97190)', 
        'Sainte-Anne (97180)', 'Saint-François (97118)', 'Sainte-Rose (97115)', 'Le Moule (97160)', 
        'Petit-Bourg (97170)', 'Capesterre-Belle-Eau (97130)', 'Morne-à-l\'Eau (97111)', 'Lamentin (97129)', 
        'Saint-Claude (97120)', 'Basse-Terre (97100)', 'Trois-Rivières (97114)', 'Gourbeyre (97113)', 
        'Goyave (97128)', 'Anse-Bertrand (97121)', 'Port-Louis (97131)', 'Deshaies (97126)', 
        'Pointe-Noire (97116)', 'Bouillante (97125)', 'Vieux-Habitants (97125)', 'Terre-de-Haut (97137)', 
        'Terre-de-Bas (97136)', 'Grand-Bourg (Marie-Galante) (97112)', 'Capesterre-de-Marie-Galante (97140)', 
        'Saint-Louis (Marie-Galante) (97134)', 'Désirade (97127)'
    ],
    'Martinique (972)': [
        'Fort-de-France (97200)', 'Le Lamentin (97232)', 'Le Robert (97231)', 'Schoelcher (97233)', 
        'Le François (97240)', 'Sainte-Marie (97230)', 'Saint-Joseph (97212)', 'Ducos (97224)', 
        'La Trinité (97220)', 'Rivière-Pilote (97211)', 'Rivière-Salée (97215)', 'Gros-Morne (97213)', 
        'Sainte-Luce (97228)', 'Saint-Esprit (97270)', 'Les Anses-d\'Arlet (97217)', 'Le Marin (97290)', 
        'Le Vauclin (97280)', 'Trois-Îlets (97229)', 'Case-Pilote (97222)', 'Saint-Pierre (97250)', 
        'Le Carbet (97221)', 'Basse-Pointe (97218)', 'Le Lorrain (97214)'
    ],
    'Guyane (973)': [
        'Cayenne (97300)', 'Matoury (97351)', 'Saint-Laurent-du-Maroni (97320)', 'Kourou (97310)', 
        'Remire-Montjoly (97354)', 'Mana (97360)', 'Macouria (97355)', 'Apatou (97317)', 
        'Maripasoula (97370)', 'Grand-Santi (97340)', 'Saint-Georges (97313)', 'Sinnamary (97315)'
    ],
    'La Réunion (974)': [
        'Saint-Denis (97400)', 'Saint-Paul (97460)', 'Saint-Pierre (97410)', 'Le Tampon (97430)', 
        'Saint-André (97440)', 'Saint-Louis (97450)', 'Le Port (97420)', 'Saint-Joseph (97480)', 
        'Saint-Benoît (97470)', 'Sainte-Marie (97438)', 'Saint-Leu (97416)', 'La Possession (97419)', 
        'Sainte-Suzanne (97441)', 'Petite-Île (97429)', 'Salazie (97433)'
    ],
    'France Métropolitaine': [
        'Paris (75000)', 'Marseille (13000)', 'Lyon (69000)', 'Toulouse (31000)', 
        'Nice (06000)', 'Nantes (44000)', 'Montpellier (34000)', 'Strasbourg (67000)', 
        'Bordeaux (33000)', 'Lille (59000)', 'Rennes (35000)'
    ]
};

// Global helper to bind datalist to all commune inputs
function initLyannCommunesAutocomplete() {
    let datalist = document.getElementById('lyannCommunesDatalist');
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = 'lyannCommunesDatalist';
        document.body.appendChild(datalist);
    }

    let allCommunes = [];
    Object.values(window.LYANN_DOM_COMMUNES).forEach(list => {
        allCommunes = allCommunes.concat(list);
    });

    datalist.innerHTML = allCommunes.map(c => `<option value="${c}"></option>`).join('');

    const cityInputs = document.querySelectorAll('#cpCityInput, #obCityInput, #needCityInput, #filterCityInput, input[placeholder*="Commune"], input[placeholder*="Ville"]');
    cityInputs.forEach(input => {
        if (input) input.setAttribute('list', 'lyannCommunesDatalist');
    });
}
window.initLyannCommunesAutocomplete = initLyannCommunesAutocomplete;

function getNativePlugin(name) {
    if (isNativePlatform() && window.Capacitor.Plugins) {
        return window.Capacitor.Plugins[name];
    }
    return null;
}

// 📷 Appareil Photo & Galerie
async function getPhotoNative() {
    const cameraPlugin = getNativePlugin('Camera');
    if (cameraPlugin) {
        try {
            const image = await cameraPlugin.getPhoto({
                quality: 80,
                allowEditing: false,
                resultType: 'dataUrl', // base64 data url
                source: 'PROMPT' // Camera or Gallery prompt
            });
            return image.dataUrl;
        } catch (e) {
            console.warn("Camera cancelled or failed:", e);
            return null;
        }
    }
    return null;
}

// 📍 Géolocalisation & Reverse Geocoding
async function getNativeCoordinates() {
    const geo = getNativePlugin('Geolocation');
    if (geo) {
        try {
            const position = await geo.getCurrentPosition({
                enableHighAccuracy: true,
                timeout: 6000
            });
            return position.coords;
        } catch (e) {
            console.warn("Failed to get coordinates:", e);
            return null;
        }
    }
    return null;
}

async function getCityNameFromCoords(lat, lon) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`);
        const data = await response.json();
        if (data && data.address) {
            return data.address.city || data.address.town || data.address.village || data.address.suburb || data.address.county || "Guadeloupe";
        }
    } catch (e) {
        console.warn("Reverse geocoding failed:", e);
    }
    return null;
}

// 🔗 Partage Natif
async function shareNative(title, text, url) {
    const sharePlugin = getNativePlugin('Share');
    if (sharePlugin) {
        try {
            await sharePlugin.share({
                title: title,
                text: text,
                url: url,
                dialogTitle: 'Partager avec la communauté'
            });
            return true;
        } catch (e) {
            console.warn("Share cancelled or failed:", e);
            return false;
        }
    }
    return false;
}

// 📲 initialisation des plugins et gestion Android Back Button / Status Bar
function initializeNativeFeatures() {
    console.log("⚡ Initializing native features...");
    document.body.classList.add('is-native-app');
    
    // Status Bar Style
    const statusBar = getNativePlugin('StatusBar');
    if (statusBar) {
        statusBar.setStyle({ style: 'DARK' }).catch(() => {});
        statusBar.setBackgroundColor({ color: '#4A7C59' }).catch(() => {});
    }

    // Android Back Button listener
    const appPlugin = getNativePlugin('App');
    if (appPlugin) {
        appPlugin.addListener('backButton', (data) => {
            const activeModal = document.querySelector('.modal-overlay.active');
            if (activeModal) {
                if (activeModal.id === 'chatModal' && typeof window.closeLyannChatModal === 'function') {
                    window.closeLyannChatModal();
                } else {
                    activeModal.classList.remove('active');
                    activeModal.style.display = 'none';
                    document.body.style.overflow = '';
                }
            } else {
                appPlugin.exitApp();
            }
        });
    }

    // Keyboard Accessory Bar
    const keyboard = getNativePlugin('Keyboard');
    if (keyboard) {
        keyboard.setAccessoryBarVisible({ visible: true }).catch(() => {});
    }
    
    // Request initial push permissions
    setupNativePushNotifications();
}

async function setupNativePushNotifications() {
    const push = getNativePlugin('PushNotifications');
    if (push) {
        try {
            let perm = await push.checkPermissions();
            if (perm.receive !== 'granted') {
                perm = await push.requestPermissions();
            }
            if (perm.receive === 'granted') {
                await push.register();
                
                push.addListener('registration', (token) => {
                    console.log('📲 Device Token registered:', token.value);
                });
                
                push.addListener('registrationError', (err) => {
                    console.error('📲 Device Token registration error:', err);
                });
                
                push.addListener('pushNotificationReceived', (notification) => {
                    console.log('📲 Notification received:', notification);
                    if (window.lyannAlert) {
                        window.lyannAlert(`🔔 ${notification.title}: ${notification.body}`);
                    }
                });
            }
        } catch(e) {
            console.warn("Push setup failed or not supported in simulator/browser:", e);
        }
    }
}

// === HAPTIC VIBRATION UTILITY ===
async function triggerHaptic(type = 'light') {
    const haptics = getNativePlugin('Haptics');
    if (haptics) {
        try {
            if (type === 'success') {
                await haptics.notification({ type: 'SUCCESS' });
            } else if (type === 'warning') {
                await haptics.notification({ type: 'WARNING' });
            } else if (type === 'error') {
                await haptics.notification({ type: 'ERROR' });
            } else {
                await haptics.impact({ style: 'LIGHT' });
            }
        } catch(e) {
            console.warn("Haptics trigger failed:", e);
        }
    }
}

// === PENDING ACTIONS FINDER FOR MOBILE DASHBOARD ===
function getPendingActions() {
    const actions = [];
    const msgsKey = 'lyann_mock_chat_msgs';
    try {
        const stored = localStorage.getItem(msgsKey);
        if (stored) {
            const data = JSON.parse(stored);
            Object.keys(data).forEach(contactName => {
                const msgs = data[contactName];
                if (msgs && msgs.length > 0) {
                    const lastMsg = msgs[msgs.length - 1];
                    if (lastMsg.type === 'system_card') {
                        if (lastMsg.cardType === 'PRICE_PROPOSAL' && lastMsg.sender !== getMyId()) {
                            actions.push({
                                type: 'proposal',
                                contactName: contactName,
                                message: `${contactName} vous propose ${lastMsg.amount}€.`
                            });
                        } else if (lastMsg.cardType === 'WORK_DONE' && lastMsg.sender !== getMyId()) {
                            actions.push({
                                type: 'work_done',
                                contactName: contactName,
                                message: `${contactName} indique avoir terminé la mission.`
                            });
                        }
                    }
                }
            });
        }
    } catch(e) {}
    return actions;
}

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

// === APP WELCOME SCREEN (GUEST MODE / ONBOARDING / LOGIN) ===
function showAppWelcomeScreen() {
    if (document.querySelector('.app-welcome-screen')) return;

    const screen = document.createElement('div');
    screen.className = 'app-welcome-screen';
    screen.innerHTML = `
        <div class="welcome-logo-container">
            <img src="logo-app.png" style="width: 90px; height: 90px; border-radius: 20px; box-shadow: 0 10px 25px rgba(74, 124, 89, 0.15); object-fit: cover;">
            <h1 class="welcome-title">Bienvenue sur<br>LYANN</h1>
            <p class="welcome-subtitle">Le réseau d'entraide locale et de confiance. Sé Lyann a lot.</p>
        </div>

        <div class="welcome-actions">
            <button class="btn btn-primary btn-lg" id="btnWelcomeRegister" style="justify-content: center;">Créer un compte</button>
            <button class="btn btn-outline btn-lg" id="btnWelcomeLogin" style="justify-content: center; background: white;">Se connecter</button>
            <button class="btn btn-outline btn-lg" id="btnWelcomeGuest" style="justify-content: center; border: none; font-size: 0.85rem; padding: 6px;">Découvrir en mode invité</button>
        </div>
    `;

    document.body.appendChild(screen);

    // Bindings
    document.getElementById('btnWelcomeRegister')?.addEventListener('click', () => {
        triggerHaptic('light');
        if (typeof window.openOnboarding === 'function') {
            window.openOnboarding();
        }
    });

    document.getElementById('btnWelcomeLogin')?.addEventListener('click', () => {
        triggerHaptic('light');
        document.querySelector('.open-login-trigger')?.click();
    });

    document.getElementById('btnWelcomeGuest')?.addEventListener('click', () => {
        triggerHaptic('light');
        screen.remove(); // Dismiss welcome view
    });
}

// === MOBILE APP ACCUEIL HOME DASHBOARD ===
async function initMobileHomeDashboard() {
    const isLoggedIn = document.body.classList.contains('user-is-logged-in');

    if (!isLoggedIn) {
        showAppWelcomeScreen();
        return;
    }

    // Hide marketing blocks
    const elementsToHide = [
        document.querySelector('.hero'),
        document.getElementById('about'),
        document.getElementById('how-it-works'),
        document.getElementById('testimonials'),
        document.getElementById('join')
    ];
    elementsToHide.forEach(el => {
        if (el) el.style.display = 'none';
    });

    // Inject Dashboard
    if (!document.getElementById('mobileDashboard')) {
        let firstName = "Lyanneur";
        if (window.CURRENT_USER_ID && window.LYANN_API_CLIENT) {
            try {
                const { data } = await window.LYANN_API_CLIENT.getProfile(window.CURRENT_USER_ID);
                if (data && data.first_name) {
                    firstName = data.first_name;
                }
            } catch(e) {}
        }

        const dashboard = document.createElement('div');
        dashboard.id = 'mobileDashboard';
        
        let alertsHtml = '';
        const pendingActions = getPendingActions();
        pendingActions.forEach(act => {
            alertsHtml += `
                <div class="dashboard-alert-card">
                    <span class="dashboard-alert-card-text">🔔 ${act.message}</span>
                    <button class="dashboard-alert-card-btn" data-contact="${act.contactName}">Voir</button>
                </div>
            `;
        });

        dashboard.innerHTML = `
            <div class="dashboard-welcome">
                <div>
                    <h2>Bonjour ${firstName} 👋</h2>
                    <p>Réseau d'entraide local & sécurisé</p>
                </div>
                <img src="david-34.png" alt="Mon Profil" class="dashboard-welcome-avatar" id="btnDashboardAvatar">
            </div>

            ${alertsHtml}

            <div class="dashboard-search-bar">
                <i class="ph ph-magnifying-glass"></i>
                <input type="text" id="dbSearchInput" placeholder="Plombier, clim, jardinage, peintre...">
            </div>

            <div class="dashboard-quick-actions">
                <a href="results.html?category=plomberie" class="action-pill"><i class="ph ph-drop"></i> Plomberie</a>
                <a href="results.html?category=menage" class="action-pill"><i class="ph ph-wind"></i> Ménage</a>
                <a href="results.html?category=jardinage" class="action-pill"><i class="ph ph-leaf"></i> Jardinage</a>
                <a href="results.html?category=electricite" class="action-pill"><i class="ph ph-lightning"></i> Électricité</a>
            </div>
        `;

        document.body.insertBefore(dashboard, document.body.firstChild);

        // Bindings
        document.getElementById('btnDashboardAvatar')?.addEventListener('click', () => {
            triggerHaptic('light');
            document.querySelector('.open-account-modal-trigger')?.click();
        });

        dashboard.querySelectorAll('.dashboard-alert-card-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                triggerHaptic('light');
                const contact = btn.getAttribute('data-contact');
                if (typeof openChatWithUser === 'function') {
                    openChatWithUser(contact, 'david-34.png');
                }
            });
        });

        const dbSearchInput = document.getElementById('dbSearchInput');
        if (dbSearchInput) {
            dbSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const val = dbSearchInput.value.trim();
                    if (val) {
                        window.location.href = `results.html?query=${encodeURIComponent(val)}`;
                    }
                }
            });
        }
    }
}

// === INTERFACE INJECTION ENTRY POINT ===
// Global messaging modal opener
window.openLyannMessagesModal = function() {
    try { triggerHaptic('light'); } catch(e) {}
    const modal = document.getElementById('chatModal');
    if (modal) {
        modal.removeAttribute('style');
        modal.style.display = 'flex';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        document.body.classList.add('hide-bottom-nav');
        if (typeof window.renderMessages === 'function') {
            try { window.renderMessages(); } catch(e) {}
        }
        if (typeof window.renderContactsList === 'function') {
            try { window.renderContactsList(); } catch(e) {}
        }
    } else {
        window.location.href = 'feed.html?action=openchat';
    }
};

function injectMobileInterface() {
    if (!isNativePlatform()) return;

    document.body.classList.add('is-native-app');

    const path = window.location.pathname;
    const isHome = path.endsWith('index.html') || path.endsWith('/') || (!path.includes('.html'));
    const isExplorer = path.includes('results.html');
    const isBokantaj = path.includes('feed.html');
    const isLoggedIn = document.body.classList.contains('user-is-logged-in');

    // DEEP LINK CHECK: Deep links bypass Accueil App and route directly
    const hasDeepLink = window.location.search && (
        window.location.search.includes('view=') ||
        window.location.search.includes('action=') ||
        window.location.search.includes('post_id=') ||
        window.location.search.includes('chat=')
    );

    // NATIVE APP CONNECTED HOMEPAGE: Render App Home View on index.html when logged in
    if (isHome && isLoggedIn && !hasDeepLink) {
        document.querySelector('.app-welcome-screen')?.remove();
        if (typeof window.renderAppHomeConnectedView === 'function') {
            window.renderAppHomeConnectedView();
        }
    } else if (isHome && !isLoggedIn && !hasDeepLink && typeof authInitializationComplete !== 'undefined' && authInitializationComplete) {
        if (typeof showAppWelcomeScreen === 'function') {
            showAppWelcomeScreen();
        }
    }

    // 1. Mobile Bottom Navigation à 5 Onglets (Accueil | Explorer | + | Bokantaj | Messages)
    if (!document.querySelector('.mobile-bottom-nav')) {
        const bottomNav = document.createElement('div');
        bottomNav.className = 'mobile-bottom-nav';

        bottomNav.innerHTML = `
            <a href="index.html" class="nav-tab ${isHome ? 'active' : ''}" id="tab-home">
                <i class="ph ph-house"></i>
                <span>Accueil</span>
            </a>
            <a href="results.html" class="nav-tab ${isExplorer ? 'active' : ''}" id="tab-explorer">
                <i class="ph ph-magnifying-glass"></i>
                <span>Explorer</span>
            </a>
            <div class="nav-tab nav-tab-central-item" id="tab-create-item">
                <button type="button" class="btn-central-action" id="tab-create" aria-label="Publier">
                    <i class="ph ph-plus"></i>
                </button>
                <span class="central-tab-label">Publier</span>
            </div>
            <a href="feed.html" class="nav-tab ${isBokantaj ? 'active' : ''}" id="tab-bokantaj">
                <i class="ph ph-broadcast"></i>
                <span>Bokantaj</span>
            </a>
            <button type="button" class="nav-tab" id="tab-messages" aria-label="Messages">
                <i class="ph ph-chat-circle-dots"></i>
                <span>Messages</span>
            </button>
        `;
        document.body.appendChild(bottomNav);

        bottomNav.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                try { if (typeof triggerHaptic === 'function') triggerHaptic('light'); } catch(e) {}
            });
        });

        // Tab "+" (Publier) click
        const tabCreate = document.getElementById('tab-create');
        if (tabCreate) {
            tabCreate.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof window.openLyannWizard === 'function') {
                    window.openLyannWizard();
                } else if (typeof window.openCentralActionSheet === 'function') {
                    window.openCentralActionSheet();
                }
            });
        }

        // Messages tab click -> Open Chat Modal
        const tabMessages = document.getElementById('tab-messages');
        if (tabMessages) {
            tabMessages.addEventListener('click', (e) => {
                e.preventDefault();
                window.openLyannMessagesModal();
            });
        }

        // Moi tab click
        const tabMoi = document.getElementById('tab-moi');
        if (tabMoi) {
            tabMoi.addEventListener('click', (e) => {
                e.preventDefault();
                const profileTrigger = document.querySelector('.open-account-modal-trigger');
                if (profileTrigger) {
                    profileTrigger.click();
                } else {
                    const userAccountModal = document.getElementById('userAccountModal');
                    if (userAccountModal) {
                        userAccountModal.style.display = 'flex';
                        userAccountModal.classList.add('active');
                    }
                }
            });
        }
    }

    // 2. Central Action Bottom Sheet (3 grandes actions)
    if (!document.getElementById('centralActionSheet')) {
        const backdrop = document.createElement('div');
        backdrop.className = 'sheet-backdrop';
        backdrop.id = 'sheetBackdrop';
        document.body.appendChild(backdrop);

        const sheet = document.createElement('div');
        sheet.className = 'mobile-bottom-sheet';
        sheet.id = 'centralActionSheet';
        sheet.innerHTML = `
            <div class="sheet-handle"></div>
            <h3 class="sheet-title">Que souhaitez-vous faire ?</h3>
            <div class="sheet-options-grid">
                <button type="button" class="sheet-option-btn" id="btnSheetNeedHelp">
                    <span class="sheet-option-icon"><i class="ph ph-magnifying-glass"></i></span>
                    <div class="sheet-option-info">
                        <h4>Besoin d'un coup de main</h4>
                        <p>Publiez ce dont vous avez besoin.</p>
                    </div>
                </button>
                <button type="button" class="sheet-option-btn" id="btnSheetOfferHelp">
                    <span class="sheet-option-icon"><i class="ph ph-hand-heart"></i></span>
                    <div class="sheet-option-info">
                        <h4>Proposer quelque chose</h4>
                        <p>Partagez un service, une compétence ou une disponibilité.</p>
                    </div>
                </button>
                <button type="button" class="sheet-option-btn" id="btnSheetBokantaj">
                    <span class="sheet-option-icon"><i class="ph ph-broadcast"></i></span>
                    <div class="sheet-option-info">
                        <h4>Publier sur Bokantaj</h4>
                        <p>Partagez quelque chose avec la communauté.</p>
                    </div>
                </button>
            </div>
            <button type="button" class="btn btn-outline" id="btnCloseSheet" style="margin-top: 15px; width: 100%; justify-content: center;">Fermer</button>
        `;
        document.body.appendChild(sheet);

        const tabCreate = document.getElementById('tab-create');
        if (tabCreate) {
            tabCreate.addEventListener('click', (e) => {
                e.preventDefault();
                backdrop.classList.add('active');
                sheet.classList.add('active');
            });
        }

        const closeSheet = () => {
            backdrop.classList.remove('active');
            sheet.classList.remove('active');
        };

        backdrop.addEventListener('click', closeSheet);
        document.getElementById('btnCloseSheet')?.addEventListener('click', closeSheet);

        // Action 1: Besoin d'un coup de main → ouvre le Wizard IA
        document.getElementById('btnSheetNeedHelp')?.addEventListener('click', () => {
            closeSheet();
            triggerHaptic('light');
            if (typeof window.openLyannWizard === 'function') {
                window.openLyannWizard();
            } else {
                const wizardModal = document.getElementById('modal-request-help');
                if (wizardModal) {
                    wizardModal.classList.add('active');
                    document.body.style.overflow = 'hidden';
                } else {
                    window.location.href = 'feed.html?openWizard=true';
                }
            }
        });

        // Action 2: Proposer
        document.getElementById('btnSheetOfferHelp')?.addEventListener('click', () => {
            closeSheet();
            triggerHaptic('light');
            if (document.body.classList.contains('user-is-logged-in')) {
                const addServiceBtn = document.querySelector('.btn-add-service') || document.getElementById('btnAddService');
                if (addServiceBtn) {
                    addServiceBtn.click();
                } else if (typeof window.openAddServiceModal === 'function') {
                    window.openAddServiceModal();
                } else {
                    window.location.href = 'index.html?action=add-service';
                }
            } else {
                window.lyannAlert("🔑 Veuillez vous connecter pour proposer vos services.");
                document.querySelector('.open-login-trigger')?.click();
            }
        });

        // Action 3: Bokantaj
        document.getElementById('btnSheetBokantaj')?.addEventListener('click', () => {
            closeSheet();
            triggerHaptic('light');
            if (window.location.pathname.includes('feed.html')) {
                const textInput = document.getElementById('flashContentInput');
                if (textInput) {
                    textInput.focus();
                    textInput.scrollIntoView({ behavior: 'smooth' });
                }
            } else {
                window.location.href = 'feed.html?action=new-post';
            }
        });
    }
}

// === APP HOME V1 CONNECTED VIEW RENDERER (APP NATIVE ONLY) ===
window.renderAppHomeConnectedView = function() {
    const mainHero = document.querySelector('.hero');
    if (!mainHero) return;

    // Remove legacy appHomeView element if present to avoid duplicate action cards
    document.getElementById('appHomeView')?.remove();

    // Ensure hero section remains visible
    mainHero.style.display = '';

    // Hide the hero visual illustration (SVG) on native — it takes too much space
    const heroVisual = mainHero.querySelector('.hero-visual');
    if (heroVisual) heroVisual.style.display = 'none';

    // Hide web-only marketing sections on native app connected home
    document.querySelectorAll('.trust-section, .how-section, .categories-section, .testimonials-section, .final-cta, .lyann-footer, .cta-section').forEach(sec => {
        if (sec) sec.style.display = 'none';
    });
    document.querySelectorAll('#about, #how-it-works').forEach(sec => {
        if (sec && (sec.classList.contains('trust-section') || sec.classList.contains('how-section'))) {
            sec.style.display = 'none';
        }
    });

    // Populate and display personalized greeting badge inside hero
    const greetingBadge = document.getElementById('heroGreetingBadge');
    const firstNameEl = document.getElementById('heroUserFirstName');

    if (greetingBadge) {
        greetingBadge.style.display = 'inline-flex';
    }

    try {
        if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
            window.LYANN_API_CLIENT.getCurrentUser().then(user => {
                if (user) {
                    let firstName = user.user_metadata?.first_name || '';
                    if (!firstName) {
                        window.LYANN_API_CLIENT.supabase.from('profiles').select('first_name').eq('id', user.id).single()
                            .then(({ data }) => {
                                if (data && data.first_name && firstNameEl) {
                                    firstNameEl.textContent = ' ' + data.first_name;
                                }
                            }).catch(() => {});
                    } else if (firstNameEl) {
                        firstNameEl.textContent = ' ' + firstName;
                    }
                }
            }).catch(() => {});
        }
    } catch(e) {}

    // Header Natif Déterministe Mobile
    if (typeof window.ensureDeterministicAppHeader === 'function') {
        window.ensureDeterministicAppHeader();
    }
};

// === HEADER NATIVE DÉTERMINISTE (APP MOBILE) ===
window.ensureDeterministicAppHeader = function(overrideViewType) {
    if (!isNativePlatform()) return;

    const path = window.location.pathname;
    let viewType = overrideViewType;
    
    if (!viewType) {
        if (path.includes('feed.html')) viewType = 'BOKANTAJ';
        else if (path.includes('results.html')) viewType = 'EXPLORER';
        else if (path.includes('pricing.html')) viewType = 'PRICING';
        else if (path.includes('about.html')) viewType = 'ABOUT';
        else if (path.includes('how-it-works.html')) viewType = 'HOW_IT_WORKS';
        else if (path.includes('payment-portal.html')) viewType = 'PAYMENT';
        else viewType = 'ACCUEIL';
    }

    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    
    // STABILIZATION V1: Sentinel — skip re-render if header already set for this view type
    if (navbar.getAttribute('data-native-header-active') === viewType) {
        return;
    }
    const container = navbar.querySelector('.nav-container') || navbar;

    const isHomeOrBokantaj = (viewType === 'ACCUEIL' || viewType === 'BOKANTAJ');

    if (isHomeOrBokantaj) {
        container.innerHTML = `
            <div class="native-header-row" style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0 14px; box-sizing: border-box; height: 44px;">
                <span class="native-header-logo" style="font-weight: 900; font-size: 1.2rem; color: var(--primary-dark); display: flex; align-items: center; gap: 8px;">
                    <img src="logo-app.png" style="width: 28px; height: 28px; border-radius: 6px; object-fit: cover;">
                    LYANN
                </span>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button type="button" class="nav-msg-btn" id="btnHeaderChat" aria-label="Messagerie" style="background: none; border: none; font-size: 1.3rem; color: var(--text); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px;">
                        <i class="ph ph-chat-circle-dots"></i>
                    </button>
                    <button type="button" class="nav-msg-btn" id="btnHeaderNotif" aria-label="Notifications" style="background: none; border: none; font-size: 1.3rem; color: var(--text); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px; position: relative;">
                        <i class="ph ph-bell"></i>
                    </button>
                    <button type="button" class="hamburger-menu-btn" id="btnHeaderHamburger" aria-label="Menu Principal" style="background: rgba(74, 124, 89, 0.12); border: 1.5px solid rgba(74, 124, 89, 0.25); border-radius: 12px; width: 38px; height: 38px; font-size: 1.3rem; color: var(--primary-dark); cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <i class="ph ph-list"></i>
                    </button>
                </div>
            </div>
        `;
    } else {
        let pageTitle = "LYANN";
        if (viewType === 'EXPLORER') pageTitle = "Explorer";
        else if (viewType === 'ABOUT') pageTitle = "Notre Histoire";
        else if (viewType === 'PRICING') pageTitle = "Abonnements";
        else if (viewType === 'HOW_IT_WORKS') pageTitle = "Comment ça marche";
        else if (viewType === 'PROFIL') pageTitle = "Mon Compte";
        else if (viewType === 'MESSAGES') pageTitle = "Messagerie";

        container.innerHTML = `
            <div class="native-header-row" style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0 12px; height: 44px; box-sizing: border-box;">
                <button type="button" id="btnNativeBack" style="background: none; border: none; font-size: 1.35rem; color: var(--text); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px;">
                    <i class="ph ph-caret-left" style="font-weight: bold;"></i>
                </button>
                <div style="font-weight: 800; font-size: 1rem; color: var(--text); flex: 1; text-align: center;">${pageTitle}</div>
                <button type="button" class="hamburger-menu-btn" id="btnHeaderHamburger" aria-label="Menu Principal" style="background: rgba(74, 124, 89, 0.12); border: 1.5px solid rgba(74, 124, 89, 0.25); border-radius: 12px; width: 38px; height: 38px; font-size: 1.3rem; color: var(--primary-dark); cursor: pointer; display: flex; align-items: center; justify-content: center;">
                    <i class="ph ph-list"></i>
                </button>
            </div>
        `;

        document.getElementById('btnNativeBack')?.addEventListener('click', (e) => {
            e.preventDefault();
            triggerHaptic('light');
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = 'index.html';
            }
        });
    }

    container.querySelector('#btnHeaderChat')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.openLyannMessagesModal();
    });

    container.querySelector('#btnHeaderNotif')?.addEventListener('click', (e) => {
        e.preventDefault();
        triggerHaptic('light');
        if (typeof openNotificationsModal === 'function') openNotificationsModal();
    });

    container.querySelector('#btnHeaderHamburger')?.addEventListener('click', (e) => {
        e.preventDefault();
        triggerHaptic('light');
        if (typeof window.openLyannHamburgerDrawer === 'function') {
            window.openLyannHamburgerDrawer();
        }
    });
    
    // STABILIZATION V1: Set sentinel marker after successful header injection
    navbar.setAttribute('data-native-header-active', viewType);
    navbar.style.display = '';
    navbar.style.visibility = 'visible';
};

    window.isExplicitDemoMode = function() {
        if (typeof window === 'undefined' || !window.location) return false;
        const host = window.location.hostname;
        
        // HARD PRODUCTION LOCK: Never allow demo mode on production domains
        if (host === 'lyann.app' || host === 'www.lyann.app' || host === 'admin.lyann.app' || host.endsWith('.lyann.app')) {
            return false;
        }
        
        // Require explicit demo mode flag
        if (typeof window.LYANN_DEMO_MODE !== 'undefined' && window.LYANN_DEMO_MODE === true) return true;
        if (window.location.search && window.location.search.includes('demo=true')) return true;
        return false;
    };

    const LYANN_MEMBERS = [
        // GUADELOUPE (971) - MEMBRE RÉFÉRENT
        {
            id: 100,
            name: "Jocelyn Cabort (52 ans)",
            role: "Plomberie & Fuites d'eau PRO",
            category: "plomberie",
            keywords: ["plomberie", "plombier", "fuite", "eau", "sanitaire", "jocelyn", "cabort", "dépannage", "chauffe-eau"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Baie-Mahault",
            rating: 5.0,
            reviewsCount: 64,
            avatar: "jocelyn-cabort.png",
            bio: "Plombier chevronné et membre référent à Baie-Mahault. Dépannage rapide de fuites d'eau, débouchage et installation sanitaire.",
            skills: ["Détection de fuite", "Pose robinet", "Sanitaires", "Dépannage 24/7"],
            badge: "Artisan Vérifié",
            hourlyRate: "À partir de 30€/h"
        },
        {
            id: 1,
            name: "David M. (34 ans)",
            role: "Plomberie & Clim Inverter",
            category: "plomberie",
            keywords: ["plomberie", "plombier", "fuite", "eau", "sanitaire", "robinet", "tuyau", "dépannage", "chauffe-eau", "clim"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Baie-Mahault",
            rating: 4.9,
            reviewsCount: 48,
            avatar: "avatar-male-blue.png",
            bio: "Plombier et technicien clim passionné à Baie-Mahault. Dépannage rapide de fuites d'eau, entretien clim et chauffe-eau.",
            skills: ["Détection de fuite", "Entretien Clim Inverter", "Remplacement chauffe-eau", "Débouchage express"],
            badge: "Artisan Vérifié",
            hourlyRate: "À partir de 35€/h"
        },
        {
            id: 2,
            name: "Marie-Line Popotte (39 ans)",
            role: "Peinture Intérieure & Rénovation",
            category: "peinture",
            keywords: ["peinture", "peintre", "mural", "rénovation", "décoration", "enduit", "plâtre"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Les Abymes",
            rating: 5.0,
            reviewsCount: 36,
            avatar: "avatar-female-pink.png",
            bio: "Peintre d'intérieur minutieuse aux Abymes. Je redonne des couleurs et de la fraîcheur tropicale à vos pièces de vie.",
            skills: ["Peinture mur & plafond", "Enduit lissage", "Protection anti-humidité", "Conseil couleurs"],
            badge: "Voisine Recommandée",
            hourlyRate: "À partir de 30€/h"
        },
        {
            id: 3,
            name: "Jean-Michel Télèphe (45 ans)",
            role: "Électricité & Rénovation Moteurs",
            category: "electricite",
            keywords: ["électricité", "électricien", "panne", "tableau", "prise", "lumière", "câblage", "réparer"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Le Gosier",
            rating: 4.8,
            reviewsCount: 31,
            avatar: "avatar-male-blue.png",
            bio: "Mise aux normes, rénovation électrique globale et dépannage rapide sur Le Gosier et environs.",
            skills: ["Tableau électrique", "Dépannage d'urgence", "Éclairage LED", "Mise aux normes"],
            badge: "Électricien Vérifié",
            hourlyRate: "À partir de 40€/h"
        },
        {
            id: 4,
            name: "Man Saint-Louis (72 ans)",
            role: "Jardinier & Plantes Créoles",
            category: "jardin",
            keywords: ["jardin", "jardinier", "élagage", "pelouse", "tonte", "haie", "entretien", "plantes", "palmier"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Sainte-Anne",
            rating: 4.9,
            reviewsCount: 25,
            avatar: "avatar-male-blue.png",
            bio: "Sage du jardin et passionné de botanique créole à Sainte-Anne. Entretien doux, taille de palmiers et conseils de terre.",
            skills: ["Taille de haies", "Élagage palmiers", "Jardin médicinal créole", "Arrosage"],
            badge: "Membre Doyen Réputé",
            hourlyRate: "À partir de 25€/h"
        },
        {
            id: 5,
            name: "Élodie Rutil (27 ans)",
            role: "Ménage & Entretien Maison",
            category: "menage",
            keywords: ["ménage", "nettoyage", "maison", "propreté", "entretien", "vitres", "repassage"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Le Moule",
            rating: 5.0,
            reviewsCount: 22,
            avatar: "avatar-female-pink.png",
            bio: "Ménage à domicile et entretien méticuleux de votre intérieur au Moule. Ponctuelle et de confiance.",
            skills: ["Ménage régulier", "Lavage de vitres", "Repassage", "Désinfection"],
            badge: "Membre Recommandé",
            hourlyRate: "À partir de 20€/h"
        },
        {
            id: 15,
            name: "Clarisse Vatin (31 ans)",
            role: "Baby-sitting & Garde d'enfants",
            category: "babysitting",
            keywords: ["baby-sitting", "babysitting", "garde d'enfants", "enfant", "bébé", "sortie d'école", "aide aux devoirs"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Baie-Mahault",
            rating: 5.0,
            reviewsCount: 32,
            avatar: "avatar-female-pink.png",
            bio: "Diplômée de la petite enfance. Garde bienveillante, activités créatives et aide aux devoirs.",
            skills: ["Garde périscolaire", "Bébés & Enfants", "Secourisme PSC1", "Aide aux devoirs"],
            badge: "Nounou Vérifiée",
            hourlyRate: "À partir de 15€/h"
        },
        {
            id: 16,
            name: "Tati Rosalie Théophile (63 ans)",
            role: "Aide à la personne & Seniors",
            category: "aide-personne",
            keywords: ["aide à la personne", "aide aux seniors", "compagnie", "courses", "repas", "autonomie", "auxiliaire"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Le Gosier",
            rating: 4.9,
            reviewsCount: 28,
            avatar: "avatar-female-pink.png",
            bio: "Accompagnement bienveillant pour personnes âgées ou en perte d'autonomie. Présence chaleureuse et aide au quotidien.",
            skills: ["Aide aux repas créoles", "Accompagnement courses", "Lecture & Compagnie", "Stimulation douce"],
            badge: "Auxiliaire Recommandée",
            hourlyRate: "À partir de 18€/h"
        },
        {
            id: 6,
            name: "Sarah Manicon (29 ans)",
            role: "Coiffure & Rénovation",
            category: "peinture",
            keywords: ["peinture", "peintre", "mural", "rénovation", "décoration", "coup de neuf", "coiffure"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Les Abymes",
            rating: 5.0,
            reviewsCount: 29,
            avatar: "avatar-female-pink.png",
            bio: "Artisan passionnée par la beauté et la rénovation des intérieurs aux Abymes. Garantie satisfaction !",
            skills: ["Peinture acrylique", "Coiffure & Tresses", "Ravalement", "Décoration"],
            badge: "Artisan Vérifié",
            hourlyRate: "Devis gratuit"
        },
        {
            id: 17,
            name: "Aurélie Bellerose (26 ans)",
            role: "Baby-sitting & Sortie d'école",
            category: "babysitting",
            keywords: ["baby-sitting", "babysitting", "garde d'enfants", "enfant", "sortie d'école", "nounou"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Baie-Mahault",
            rating: 5.0,
            reviewsCount: 21,
            avatar: "avatar-female-pink.png",
            bio: "Garde d'enfants à Baie-Mahault en soirée et les week-ends. Jeux d'éveil, goûters et sérénité pour les parents.",
            skills: ["Soirées & Week-ends", "Jeux ludiques", "Garde à domicile", "Préparation repas"],
            badge: "Baby-sitter Vérifiée",
            hourlyRate: "À partir de 14€/h"
        },
        {
            id: 7,
            name: "Nicolas Bellerose (36 ans)",
            role: "Bricolage & Multi-services",
            category: "bricolage",
            keywords: ["bricolage", "bricoleur", "monter un meuble", "meuble", "étagère", "fixation", "ikea", "petit travail"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Pointe-à-Pitre",
            rating: 4.9,
            reviewsCount: 35,
            avatar: "avatar-male-blue.png",
            bio: "Polyvalent et minutieux à Pointe-à-Pitre pour tous vos petits travaux de maison et montages de meubles en kit.",
            skills: ["Montage meuble", "Fixation TV mural", "Pose de rideaux", "Petits dépannages"],
            badge: "Super Bricoleur",
            hourlyRate: "À partir de 25€/h"
        },
        {
            id: 8,
            name: "Christophe Vatin (42 ans)",
            role: "Climatisation & Frigoriste",
            category: "climatisation",
            keywords: ["climatisation", "clim", "froid", "frigoriste", "entretien clim", "dépannage clim", "nettoyage clim"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Petit-Bourg",
            rating: 4.9,
            reviewsCount: 42,
            avatar: "avatar-male-blue.png",
            bio: "Pose, entretien et désinfection complète de climatiseurs Split sur Petit-Bourg pour particuliers et pros.",
            skills: ["Nettoyage antibactérien", "Recharge gaz", "Dépannage fuite", "Installation neuve"],
            badge: "Climaticien Agréé",
            hourlyRate: "À partir de 45€/h"
        },
        {
            id: 9,
            name: "Tati Huguette Cazeau (68 ans)",
            role: "Jardinage & Cuisine Créole",
            category: "jardin",
            keywords: ["jardin", "jardinier", "plantes", "entretien", "fleurs", "cour", "cuisine"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Morne-à-l'Eau",
            rating: 5.0,
            reviewsCount: 19,
            avatar: "avatar-female-pink.png",
            bio: "Transmission et passion des vergers et jardins créoles à Morne-à-l'Eau. Entretien doux, recettes traditionnelles et partage.",
            skills: ["Plantes tropicales", "Taille arbres fruitiers", "Conseils botaniques", "Cuisine créole"],
            badge: "Membre Senior Réputé",
            hourlyRate: "À partir de 20€/h"
        },
        {
            id: 10,
            name: "Kevin Bellerose (41 ans)",
            role: "Électricité Pro & Dépannage",
            category: "electricite",
            keywords: ["déménagement", "déménager", "transport", "camion", "carton", "portage", "manutention", "électricité"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Les Abymes",
            rating: 4.9,
            reviewsCount: 27,
            avatar: "avatar-male-blue.png",
            bio: "Électricien professionnel et technicien généraliste aux Abymes. Dépannage de tableaux, éclairage et moteurs en sécurité.",
            skills: ["Habilitation électrique", "Rénovation atelier", "Dépannage d'urgence", "Objets lourds"],
            badge: "Technicien PRO Vérifié",
            hourlyRate: "À partir de 38€/h"
        },
        {
            id: 11,
            name: "Corinne Narcisse (33 ans)",
            role: "Menuiserie & Aménagement Bois",
            category: "menuiserie",
            keywords: ["menuiserie", "menuisier", "bois", "porte", "fenêtre", "placard", "terrasse", "sur mesure"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Basse-Terre",
            rating: 5.0,
            reviewsCount: 20,
            avatar: "avatar-female-pink.png",
            bio: "Création et rénovation d'ouvrages en bois, terrasses créoles et agencements d'intérieur à Basse-Terre.",
            skills: ["Terrasse bois", "Pose portes/fenêtres", "Dressing sur mesure", "Réparation meuble"],
            badge: "Artisan Bois Vérifié",
            hourlyRate: "Devis sous 24h"
        },
        {
            id: 12,
            name: "Cédric Flavien (38 ans)",
            role: "Bricolage & Multi-services",
            category: "bricolage",
            keywords: ["bricolage", "bricoleur", "monter un meuble", "réparer", "étagère", "électricité", "plomberie"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Sainte-Rose",
            rating: 5.0,
            reviewsCount: 38,
            avatar: "avatar-male-blue.png",
            bio: "Montage de meubles, étagères, fixation, petits dépannages à Sainte-Rose... Toujours avec le sourire et le soin !",
            skills: ["Montage meuble", "Fixation lourde", "Petite électricité", "Peinture retouches"],
            badge: "Talent Recommandé",
            hourlyRate: "À partir de 28€/h"
        },
        {
            id: 13,
            name: "Romain Payet (35 ans)",
            role: "Entretien Jardin & Paysage",
            category: "jardin",
            keywords: ["jardin", "jardinier", "élagage", "gazon", "taille", "entretien", "plantes", "cour"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Capesterre-Belle-Eau",
            rating: 4.9,
            reviewsCount: 45,
            avatar: "avatar-male-blue.png",
            bio: "Entretien régulier ou ponctuel de vos jardins, débroussaillage et taille à Capesterre-Belle-Eau.",
            skills: ["Débroussaillage", "Taille de haies", "Création massif fleurs", "Nettoyage terrasse"],
            badge: "Jardinier Pro",
            hourlyRate: "À partir de 26€/h"
        },
        {
            id: 14,
            name: "Guillaume Saint-Martin (44 ans)",
            role: "Climatisation & Électricité Villa",
            category: "climatisation",
            keywords: ["climatisation", "clim", "électricité", "panne", "maintenance", "villa"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Saint-François",
            rating: 5.0,
            reviewsCount: 12,
            avatar: "avatar-male-blue.png",
            bio: "Maintenance haute qualité de climatiseurs et réseaux électriques pour villas et habitations à Saint-François.",
            skills: ["Clim Inverter", "Maintenance préventive", "Dépannage express", "Tableau électrique"],
            badge: "Expert Vérifié",
            hourlyRate: "À partir de 50€/h"
        }
    ];
    window.LYANN_MEMBERS = LYANN_MEMBERS;

    // ==========================================================================
    // BASE COMPLÈTE MEMBRES / PROFILERS EN GUADELOUPE (971) - PAR DENSITÉ
    // ==========================================================================
    const ADDITIONAL_MEMBERS_DATA = [
        { name: "Jocelyn Cabort", age: 52, role: "Plomberie & Fuites d'eau", cat: "plomberie", city: "Baie-Mahault", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "30€/h", img: "jocelyn-cabort.png", bio: "Plombier chevronné à Baie-Mahault. Dépannage rapide de fuites d'eau, débouchage et installation sanitaire.", skills: ["Détection de fuite", "Pose robinet", "Sanitaires"] },
        { name: "Hugues Zami", age: 45, role: "Climatisation & Électricité", cat: "climatisation", city: "Les Abymes", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "40€/h", img: "hugues-zami.png", bio: "Technicien froid et électricité aux Abymes. Pose, entretien et dépannage clim.", skills: ["Clim Inverter", "Câblage", "Dépannage"] },
        { name: "Murielle Placide", age: 38, role: "Ménage & Repassage", cat: "menage", city: "Le Gosier", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "18€/h", img: "murielle-placide.png", bio: "Ménage soigné à domicile sur Le Gosier. Repassage et entretien régulier.", skills: ["Ménage", "Repassage", "Lavage vitres"] },
        { name: "Clotilde Belair", age: 61, role: "Aide aux repas & Seniors", cat: "aide-personne", city: "Sainte-Anne", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "20€/h", img: "clotilde-belair.png", bio: "Auxiliaire de vie bienveillante. Aide au quotidien pour seniors à Sainte-Anne.", skills: ["Aide repas", "Compagnie", "Courses"] },
        { name: "Marius Placide", age: 29, role: "Bricolage & Montage meuble", cat: "bricolage", city: "Petit-Bourg", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "25€/h", img: "marius-placide.png", bio: "Bricoleur minutieux. Montage de meubles, pose d'étagères et petits dépannages.", skills: ["Montage meuble", "Fixation", "Peinture"] },
        { name: "Thierry Vindex", age: 34, role: "Peinture & Rénovation", cat: "peinture", city: "Le Moule", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "28€/h", img: "thierry-vindex.png", bio: "Peintre d'intérieur appliqué. Rénovation de pièces, murs et plafonds au Moule.", skills: ["Peinture", "Enduit", "Lissage"] },
        { name: "Chantal Gendrey", age: 47, role: "Baby-sitting & Sorties d'école", cat: "babysitting", city: "Sainte-Rose", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "15€/h", img: "chantal-gendrey.png", bio: "Garde d'enfants bienveillante à Sainte-Rose. Sorties d'école et garde ponctuelle.", skills: ["Baby-sitting", "Jeux", "Goûter"] },
        { name: "Ludovic Clamy", age: 25, role: "Jardinage & Débroussaillage", cat: "jardin", city: "Lamentin", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "22€/h", img: "ludovic-clamy.png", bio: "Entretien de jardins, tonte de pelouse et désherbage régulier sur Lamentin.", skills: ["Tonte", "Taille de haie", "Débroussaillage"] },
        { name: "Mireille Sapotille", age: 54, role: "Habitante active", cat: "citoyen", city: "Saint-François", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "N/A", img: "mireille-sapotille.png", bio: "Citoyenne engagée à Saint-François. Disponible pour donner un coup de main ponctuel aux voisins.", skills: ["Bokantaj", "Entraide", "Discussion"] },
        { name: "Rodrigue Marie-Joseph", age: 31, role: "Menuiserie & Pose", cat: "menuiserie", city: "Capesterre-Belle-Eau", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "30€/h", img: "rodrigue-marie-joseph.png", bio: "Menuisier bois et alu. Réparation de portes, fenêtres et aménagements intérieurs.", skills: ["Menuiserie", "Pose de porte", "Aménagement"] },

        { name: "Fabrice Létang", age: 40, role: "Électricité générale", cat: "electricite", city: "Les Abymes", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "35€/h", img: "fabrice-letang.png", bio: "Électricien professionnel aux Abymes. Tableau électrique, prises et mise en conformité.", skills: ["Tableau", "Câblage", "Dépannage"] },
        { name: "Ghislaine Rosalie", age: 50, role: "Aide à domicile & Compagnie", cat: "aide-personne", city: "Baie-Mahault", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "18€/h", img: "ghislaine-rosalie.png", bio: "Accompagnement quotidien des personnes âgées à Baie-Mahault. Présence et écoute attentive.", skills: ["Compagnie", "Courses", "Loisirs"] },
        { name: "Wilfrid Rapon", age: 37, role: "Jardinier paysagiste", cat: "jardin", city: "Le Gosier", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "25€/h", img: "wilfrid-rapon.png", bio: "Paysagiste passionné. Création de massifs, entretien général de jardin au Gosier.", skills: ["Taille", "Plantation", "Décoration"] },
        { name: "Christiane Fostin", age: 58, role: "Citoyenne engagée", cat: "citoyen", city: "Petit-Bourg", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "N/A", img: "christiane-fostin.png", bio: "Résidente à Petit-Bourg. Toujours partante pour discuter d'initiatives solidaires locales.", skills: ["Partage", "Voisinage", "Rencontres"] },
        { name: "Lucien Cabort", age: 48, role: "Bricolage & Multi-services", cat: "bricolage", city: "Sainte-Anne", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "22€/h", img: "lucien-cabort.png", bio: "Homme à tout faire à Sainte-Anne. Dépannages divers et montages en tous genres.", skills: ["Réparations", "Montage", "Pose rideaux"] },
        { name: "Roselyne Dacosta", age: 32, role: "Voisine de confiance", cat: "citoyen", city: "Le Moule", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "N/A", img: "roselyne-dacosta.png", bio: "Citoyenne active au Moule. Passionnée d'environnement et de troc de plantes dans le quartier.", skills: ["Plantes", "Discussion", "Troc"] },
        { name: "Albert Lise", age: 65, role: "Cuisine & Repas créoles", cat: "divers", city: "Sainte-Rose", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "20€/h", img: "albert-lise.png", bio: "Retraité de la restauration à Sainte-Rose. Préparation de plats traditionnels et pâtisseries locales.", skills: ["Colombo", "Accras", "Pâtisserie"] },
        { name: "Yveline Rosalie", age: 23, role: "Baby-sitting & Devoirs", cat: "babysitting", city: "Capesterre-Belle-Eau", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "14€/h", img: "yveline-rosalie.png", bio: "Étudiante en éducation à Capesterre-Belle-Eau. Aide aux devoirs et garde d'enfants après l'école.", skills: ["Devoirs", "Baby-sitting", "Jeux éducatifs"] },
        { name: "Gérard Zami", age: 55, role: "Plombier dépannage", cat: "plomberie", city: "Pointe-à-Pitre", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "30€/h", img: "gerard-zami.png", bio: "Plombier à Pointe-à-Pitre. Installation et réparation de réseaux d'eau, réparation robinets.", skills: ["Plomberie", "Sanitaire", "Chauffe-eau"] },
        { name: "Francine Moutoussamy", age: 44, role: "Repassage & Couture", cat: "menage", city: "Lamentin", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "18€/h", img: "francine-moutoussamy.png", bio: "Couturière et repasseuse au Lamentin. Soin apporté au linge et petites retouches.", skills: ["Repassage", "Couture", "Ourlets"] },

        { name: "Guy-Albert Gace", age: 39, role: "Électricien dépannage", cat: "electricite", city: "Les Abymes", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "35€/h", img: "guy-albert-gace.png", bio: "Dépannage d'urgence aux Abymes. Électricité de maison, branchements et disjoncteurs.", skills: ["Dépannage", "Tableaux", "Mise aux normes"] },
        { name: "Solange Silvestre", age: 28, role: "Ménage & Nettoyage vitres", cat: "menage", city: "Baie-Mahault", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "18€/h", img: "solange-silvestre.png", bio: "Nettoyage en profondeur à Baie-Mahault. Sérieuse, rapide, organisée et de confiance.", skills: ["Nettoyage", "Vitres", "Linge"] },
        { name: "Firmin Monlouis", age: 51, role: "Jardinage & Élagage", cat: "jardin", city: "Le Gosier", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "25€/h", img: "firmin-monlouis.png", bio: "Jardinier sur Le Gosier. Taille de haies, tonte et élagage des petits arbres du jardin.", skills: ["Jardin", "Élagage", "Tondeuse"] },
        { name: "Monique Carpin", age: 59, role: "Voisine solidaire", cat: "citoyen", city: "Saint-Claude", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "N/A", img: "monique-carpin.png", bio: "Voisine solidaire à Saint-Claude. Disposée à aider pour récupérer des colis ou garder un animal.", skills: ["Entraide", "Garde chien", "Services"] },
        { name: "Martial Tinaut", age: 33, role: "Montage de meubles", cat: "bricolage", city: "Trois-Rivières", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "22€/h", img: "martial-tinaut.png", bio: "Super bricoleur à Trois-Rivières. Assemblage de meubles en kit et fixations murales diverses.", skills: ["Montage meuble", "Fixation TV", "Petits travaux"] },
        { name: "Ginette Tacite", age: 64, role: "Aide aux repas & Seniors", cat: "aide-personne", city: "Goyave", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "18€/h", img: "ginette-tacite.png", bio: "Accompagnatrice sociale retraitée. Aide à la personne et compagnie bienveillante à Goyave.", skills: ["Seniors", "Compagnie", "Aide administrative"] },
        { name: "Aimé Zéphir", age: 46, role: "Peintre d'intérieur", cat: "peinture", city: "Bouillante", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "25€/h", img: "aime-zephir.png", bio: "Peintre d'expérience à Bouillante. Travail propre et soigné pour vos murs et boiseries.", skills: ["Peinture", "Enduit", "Rénovation"] },
        { name: "Josiane Périac", age: 24, role: "Baby-sitting soirées", cat: "babysitting", city: "Pointe-Noire", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "14€/h", img: "josiane-periac.png", bio: "Garde d'enfants de confiance à Pointe-Noire. Jeux, dîner et accompagnement au coucher.", skills: ["Baby-sitting", "Éveil", "Sûreté"] },
        { name: "Pascal Agathe", age: 43, role: "Plomberie sanitaire", cat: "plomberie", city: "Port-Louis", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "28€/h", img: "pascal-agathe.png", bio: "Dépannage plomberie à Port-Louis. Réparations robinetterie, fuites et siphons.", skills: ["Plomberie", "Robinets", "Canalisations"] },
        { name: "Sylviane Lurel", age: 53, role: "Habitante engagée", cat: "citoyen", city: "Deshaies", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "N/A", img: "sylviane-lurel.png", bio: "Habitante de Deshaies. Intéressée par les actions d'entraide et d'animation solidaire.", skills: ["Discussions", "Solidarité", "Projets"] },

        { name: "Max Hoarau", age: 42, role: "Climatisation & Froid", cat: "climatisation", city: "Les Abymes", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "35€/h", img: "max-hoarau.png", bio: "Expert climatisation aux Abymes. Entretien, désinfection et installation neuve de clim.", skills: ["Entretien", "Pose", "Climatiseur"] },
        { name: "Eliane Hoarau", age: 49, role: "Aide à domicile & Repas", cat: "aide-personne", city: "Baie-Mahault", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "18€/h", img: "eliane-hoarau.png", bio: "Aide quotidienne à Baie-Mahault. Préparation de caris et repas typiques créoles.", skills: ["Cuisine", "Ménage", "Compagnie"] },
        { name: "Jean-René Payet", age: 47, role: "Jardinage & Entretien kour", cat: "jardin", city: "Anse-Bertrand", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "25€/h", img: "jean-rene-payet.png", bio: "Jardinier motivé sur Anse-Bertrand. Débroussaillage, tonte et entretien complet de cour.", skills: ["Tonte", "Taille de haie", "Entretien kour"] },
        { name: "Bernadette Grondin", age: 57, role: "Voisine chaleureuse", cat: "citoyen", city: "Grand-Bourg", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "N/A", img: "bernadette-grondin.png", bio: "Lyanneuse passionnée à Grand-Bourg. Partage de conseils, jardinage et entraide amicale.", skills: ["Jardinage", "Troc", "Voisinage"] },
        { name: "Cédric Rivière", age: 48, role: "Bricolage & Réparations", cat: "bricolage", city: "Gourbeyre", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "22€/h", img: "cedric-riviere.png", bio: "Bricoleur à Gourbeyre. Réparations diverses, montage meuble et fixations murales.", skills: ["Bricolage", "Fixation", "Réparations"] },
        { name: "Marie-Thérèse Fontaine", age: 33, role: "Garde d'enfants", cat: "babysitting", city: "Vieux-Habitants", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "14€/h", img: "marie-therese-fontaine.png", bio: "Garde d'enfants à Vieux-Habitants. Organisation d'activités manuelles et éveil.", skills: ["Garde", "Activités", "Sûreté"] },
        { name: "Yolande Payet", age: 45, role: "Voisine active", cat: "citoyen", city: "Sainte-Anne", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "N/A", img: "yolande-payet.png", bio: "Voisine chaleureuse à Sainte-Anne. Toujours prête pour un coup de main amical.", skills: ["Entraide", "Covoiturage", "Café"] },
        { name: "Stéphane Bégue", age: 38, role: "Peinture & Finitions", cat: "peinture", city: "Pointe-à-Pitre", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "25€/h", img: "stephane-begue.png", bio: "Artisan peintre à Pointe-à-Pitre. Rénovation de murs, façades et retouches.", skills: ["Peinture", "Finitions", "Rénovation"] },
        { name: "Chantal Dijoux", age: 44, role: "Repassage & Entretien linge", cat: "menage", city: "Le Gosier", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "18€/h", img: "chantal-dijoux.png", bio: "Repassage soigné et entretien du linge sur Le Gosier.", skills: ["Repassage", "Linge", "Soin"] },
        { name: "Guillaume Morel", age: 35, role: "Dépannage informatique", cat: "divers", city: "Les Abymes", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "30€/h", img: "guillaume-morel.png", bio: "Technicien informatique aux Abymes. Configuration PC/Smartphone, Wifi et cours.", skills: ["Informatique", "Dépannage", "Wifi"] }
    ];

    const memberOverrides = [
        { name: "Jocelyn Cabort", age: 52, avatar: "jocelyn-cabort.png" },
        { name: "Hugues Zami", age: 45, avatar: "hugues-zami.png" },
        { name: "Murielle Placide", age: 38, avatar: "murielle-placide.png" },
        { name: "Clotilde Belair", age: 61, avatar: "clotilde-belair.png" },
        { name: "Marius Placide", age: 29, avatar: "marius-placide.png" },
        { name: "Thierry Vindex", age: 34, avatar: "thierry-vindex.png" },
        { name: "Chantal Gendrey", age: 47, avatar: "chantal-gendrey.png" },
        { name: "Ludovic Clamy", age: 25, avatar: "ludovic-clamy.png" },
        { name: "Mireille Sapotille", age: 54, avatar: "mireille-sapotille.png" },
        { name: "Rodrigue Marie-Joseph", age: 31, avatar: "rodrigue-marie-joseph.png" },

        { name: "Fabrice Létang", age: 40, avatar: "fabrice-letang.png" },
        { name: "Ghislaine Rosalie", age: 50, avatar: "ghislaine-rosalie.png" },
        { name: "Wilfrid Rapon", age: 37, avatar: "wilfrid-rapon.png" },
        { name: "Christiane Fostin", age: 58, avatar: "christiane-fostin.png" },
        { name: "Lucien Cabort", age: 48, avatar: "lucien-cabort.png" },
        { name: "Roselyne Dacosta", age: 32, avatar: "roselyne-dacosta.png" },
        { name: "Albert Lise", age: 65, avatar: "albert-lise.png" },
        { name: "Yveline Rosalie", age: 23, avatar: "yveline-rosalie.png" },
        { name: "Gérard Zami", age: 55, avatar: "gerard-zami.png" },
        { name: "Francine Moutoussamy", age: 44, avatar: "francine-moutoussamy.png" },

        { name: "Guy-Albert Gace", age: 39, avatar: "guy-albert-gace.png" },
        { name: "Solange Silvestre", age: 28, avatar: "solange-silvestre.png" },
        { name: "Firmin Monlouis", age: 51, avatar: "firmin-monlouis.png" },
        { name: "Monique Carpin", age: 59, avatar: "monique-carpin.png" },
        { name: "Martial Tinaut", age: 33, avatar: "martial-tinaut.png" },
        { name: "Ginette Tacite", age: 64, avatar: "ginette-tacite.png" },
        { name: "Aimé Zéphir", age: 46, avatar: "aime-zephir.png" },
        { name: "Josiane Périac", age: 24, avatar: "josiane-periac.png" },
        { name: "Pascal Agathe", age: 43, avatar: "pascal-agathe.png" },
        { name: "Sylviane Lurel", age: 53, avatar: "sylviane-lurel.png" },

        { name: "Max Hoarau", age: 42, avatar: "max-hoarau.png" },
        { name: "Eliane Hoarau", age: 49, avatar: "eliane-hoarau.png" },
        { name: "Jean-René Payet", age: 47, avatar: "jean-rene-payet.png" },
        { name: "Bernadette Grondin", age: 57, avatar: "bernadette-grondin.png" },
        { name: "Cédric Rivière", age: 48, avatar: "cedric-riviere.png" },
        { name: "Marie-Thérèse Fontaine", age: 33, avatar: "marie-therese-fontaine.png" },
        { name: "Yolande Payet", age: 45, avatar: "yolande-payet.png" },
        { name: "Stéphane Bégue", age: 38, avatar: "stephane-begue.png" },
        { name: "Chantal Dijoux", age: 44, avatar: "chantal-dijoux.png" },
        { name: "Guillaume Morel", age: 35, avatar: "guillaume-morel.png" }
    ];

    const additionalMembers = ADDITIONAL_MEMBERS_DATA.map((m, index) => {
        const override = memberOverrides[index % memberOverrides.length];

        return {
            id: 200 + index,
            name: `${override.name} (${override.age} ans)`,
            role: m.role,
            category: m.cat,
            keywords: [m.cat, m.role.toLowerCase(), m.city.toLowerCase(), override.name.toLowerCase(), ...m.skills.map(s => s.toLowerCase())],
            location: m.loc,
            locationName: m.locName,
            city: m.city,
            rating: +(4.5 + Math.random() * 0.5).toFixed(1),
            reviewsCount: Math.floor(5 + Math.random() * 45),
            avatar: override.avatar,
            bio: m.bio,
            skills: m.skills,
            badge: m.cat === 'citoyen' ? "Voisin Solidaire" : "Lyanneur Vérifié",
            hourlyRate: m.rate === 'N/A' ? "Entraide gratuite" : `À partir de ${m.rate}`
        };
    });

    LYANN_MEMBERS.unshift(...additionalMembers);
    window.LYANN_MEMBERS = window.isExplicitDemoMode() ? LYANN_MEMBERS : [];

function ensureMobileHamburgerDrawer() {
    let overlay = document.getElementById('mobileHamburgerDrawerOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'hamburger-drawer-overlay';
        overlay.id = 'mobileHamburgerDrawerOverlay';
        overlay.innerHTML = `
            <div class="hamburger-drawer-card" id="mobileHamburgerDrawer">
                
                <!-- EN-TÊTE PROFIL -->
                <div class="drawer-profile-header">
                    <a href="#" class="drawer-profile-link open-account-modal-trigger">
                        <img src="david-34.png" alt="Profil Utilisateur" class="drawer-avatar" id="drawerUserAvatar">
                        <div class="drawer-user-info">
                            <span class="drawer-user-name" id="drawerUserName">Mon Compte</span>
                            <span class="drawer-user-badge" id="drawerUserBadge"><i class="ph-fill ph-check-circle"></i> Membre Pro Vérifié</span>
                            <span class="drawer-view-profile">Voir mon profil <i class="ph ph-arrow-right"></i></span>
                        </div>
                    </a>
                    <button class="drawer-close-btn" id="closeMobileDrawerBtn" aria-label="Fermer le menu"><i class="ph ph-x"></i></button>
                </div>

                <!-- CORPS DU MENU ACCORDÉON -->
                <div class="drawer-body">
                    
                    <!-- 1. MON COMPTE -->
                    <div class="drawer-menu-group">
                        <button class="drawer-accordion-btn" data-target="submenuAccount">
                            <span class="drawer-accordion-label">
                                <i class="ph ph-user-circle"></i>
                                <span>Mon compte</span>
                            </span>
                            <i class="ph ph-caret-right drawer-chevron"></i>
                        </button>
                        <div class="drawer-submenu" id="submenuAccount">
                            <a href="#" class="drawer-sub-link open-account-modal-trigger"><i class="ph ph-user"></i> Mon profil</a>
                            <a href="pricing.html" class="drawer-sub-link"><i class="ph ph-sparkle"></i> Mon abonnement</a>
                            <a href="payment-portal.html" class="drawer-sub-link"><i class="ph ph-credit-card"></i> Mes paiements</a>
                            <a href="#" class="drawer-sub-link open-account-modal-trigger"><i class="ph ph-gear"></i> Réglages</a>
                        </div>
                    </div>

                    <!-- 2. MON ACTIVITÉ -->
                    <div class="drawer-menu-group">
                        <button class="drawer-accordion-btn" data-target="submenuActivity">
                            <span class="drawer-accordion-label">
                                <i class="ph ph-clock-counter-clockwise"></i>
                                <span>Mon activité</span>
                            </span>
                            <i class="ph ph-caret-right drawer-chevron"></i>
                        </button>
                        <div class="drawer-submenu" id="submenuActivity">
                            <a href="#" class="drawer-sub-link open-account-modal-trigger" data-tab="demandes"><i class="ph ph-tray"></i> Mes demandes</a>
                            <a href="#" class="drawer-sub-link open-account-modal-trigger" data-tab="prestations"><i class="ph ph-briefcase"></i> Mes prestations</a>
                            <a href="#" class="drawer-sub-link open-account-modal-trigger" data-tab="missions"><i class="ph ph-check-square"></i> Mes missions</a>
                            <a href="#" class="drawer-sub-link open-account-modal-trigger" data-tab="devis"><i class="ph ph-file-text"></i> Mes devis</a>
                        </div>
                    </div>

                    <!-- 3. FAVORIS -->
                    <div class="drawer-menu-group">
                        <a href="feed.html#fav" class="drawer-direct-link">
                            <span class="drawer-accordion-label">
                                <i class="ph ph-heart" style="color: var(--primary);"></i>
                                <span>Favoris</span>
                            </span>
                            <i class="ph ph-arrow-up-right drawer-chevron"></i>
                        </a>
                    </div>

                    <!-- 4. AIDE & LYANN -->
                    <div class="drawer-menu-group">
                        <button class="drawer-accordion-btn" data-target="submenuHelp">
                            <span class="drawer-accordion-label">
                                <i class="ph ph-question"></i>
                                <span>Aide & LYANN</span>
                            </span>
                            <i class="ph ph-caret-right drawer-chevron"></i>
                        </button>
                        <div class="drawer-submenu" id="submenuHelp">
                            <a href="how-it-works.html" class="drawer-sub-link"><i class="ph ph-book-open"></i> Comment ça marche</a>
                            <a href="about.html#support" class="drawer-sub-link"><i class="ph ph-headset"></i> Aide & support</a>
                            <a href="#" class="drawer-sub-link open-signup-trigger"><i class="ph ph-user-plus"></i> Inviter quelqu'un</a>
                            <a href="about.html" class="drawer-sub-link"><i class="ph ph-info"></i> À propos de LYANN</a>
                        </div>
                    </div>

                    <!-- 5. PLUS -->
                    <div class="drawer-menu-group">
                        <button class="drawer-accordion-btn" data-target="submenuPlus">
                            <span class="drawer-accordion-label">
                                <i class="ph ph-dots-three-circle"></i>
                                <span>Plus</span>
                            </span>
                            <i class="ph ph-caret-right drawer-chevron"></i>
                        </button>
                        <div class="drawer-submenu" id="submenuPlus">
                            <a href="#" class="drawer-sub-link open-account-modal-trigger"><i class="ph ph-bell"></i> Notifications</a>
                            <a href="about.html#privacy" class="drawer-sub-link"><i class="ph ph-shield-check"></i> Confidentialité</a>
                            <a href="about.html#cgu" class="drawer-sub-link"><i class="ph ph-file-lock"></i> CGU</a>
                            <a href="about.html#legal" class="drawer-sub-link"><i class="ph ph-scales"></i> Mentions légales</a>
                        </div>
                    </div>

                </div>

                <!-- PIED DE PAGE DRAWER -->
                <div class="drawer-footer logged-in-only">
                    <button class="drawer-logout-btn btn-logout-trigger" id="drawerLogoutBtn">
                        <i class="ph ph-sign-out"></i>
                        <span>Se déconnecter</span>
                    </button>
                </div>
                <div class="drawer-footer logged-out-only" style="display: flex; flex-direction: column; gap: 8px;">
                    <button class="btn btn-primary open-login-trigger" style="width: 100%; justify-content: center;">
                        <i class="ph ph-sign-in"></i> Se connecter
                    </button>
                    <button class="btn btn-outline open-signup-trigger" style="width: 100%; justify-content: center;">
                        S'inscrire
                    </button>
                </div>

            </div>
        `;
        document.body.appendChild(overlay);
    }
    initDrawerEvents(overlay);
}

window.openLyannHamburgerDrawer = function() {
    // Remove static legacy mobileMenu overlay if present to prevent dual-drawer conflicts
    const legacyMenu = document.getElementById('mobileMenu');
    if (legacyMenu && legacyMenu.parentNode) {
        legacyMenu.remove();
    }

    if (typeof ensureMobileHamburgerDrawer === 'function') {
        ensureMobileHamburgerDrawer();
    }

    const overlay = document.getElementById('mobileHamburgerDrawerOverlay');
    if (overlay) {
        overlay.classList.add('active');
        document.body.classList.add('drawer-open');
        document.body.style.overflow = 'hidden';
    }
};

window.closeLyannHamburgerDrawer = function() {
    document.querySelectorAll('.mobile-menu-overlay, #mobileHamburgerDrawerOverlay, .hamburger-drawer-overlay').forEach(menu => {
        menu.classList.remove('active');
    });
    document.body.classList.remove('drawer-open', 'modal-open', 'sheet-open');
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
};

// Master Hamburger Drawer & Global Header Click Delegator
document.addEventListener('click', (e) => {
    // 1. Open Drawer Button
    const openBtn = e.target.closest('.mobile-menu-btn, #openMobileDrawerBtn, .open-drawer-trigger, .hamburger-menu-btn, #btnHeaderHamburger');
    if (openBtn) {
        e.preventDefault();
        e.stopPropagation();
        window.openLyannHamburgerDrawer();
        return;
    }

    // 2. Close Drawer Button or Backdrop
    const closeBtn = e.target.closest('.mobile-menu-close, #closeMobileDrawerBtn, .drawer-close-btn');
    const overlayBackdrop = (e.target.classList.contains('mobile-menu-overlay') || e.target.classList.contains('hamburger-drawer-overlay') || e.target.id === 'mobileHamburgerDrawerOverlay') ? e.target : null;
    if (closeBtn || overlayBackdrop) {
        e.preventDefault();
        e.stopPropagation();
        window.closeLyannHamburgerDrawer();
        return;
    }

    // 3. Global Login Triggers (Navbar, Drawer, Footer, Body)
    const loginTrigger = e.target.closest('.open-login-trigger, a[href="#login"], .open-login-modal');
    if (loginTrigger) {
        e.preventDefault();
        e.stopPropagation();
        window.closeLyannHamburgerDrawer();
        if (typeof window.openLoginModal === 'function') {
            window.openLoginModal();
        } else if (typeof window.openLogin === 'function') {
            window.openLogin();
        } else {
            const lm = document.getElementById('loginModal');
            if (lm) {
                lm.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        }
        return;
    }

    // 4. Global Signup Triggers
    const signupTrigger = e.target.closest('.open-signup-trigger');
    if (signupTrigger) {
        e.preventDefault();
        e.stopPropagation();
        window.closeLyannHamburgerDrawer();
        const signupModal = document.getElementById('onboardingModal') || document.getElementById('loginModal');
        if (signupModal) {
            signupModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
        return;
    }

    // 5. Link or Button click inside Mobile Hamburger Drawer
    const drawerLink = e.target.closest('.mobile-menu-overlay a, #mobileHamburgerDrawerOverlay a, .mobile-nav-list a, .mobile-menu-docked-footer button, .drawer-logout-btn, .btn-logout-trigger');
    if (drawerLink) {
        const href = drawerLink.getAttribute('href');

        // Always close the drawer overlay immediately on link/button click
        window.closeLyannHamburgerDrawer();

        if (drawerLink.classList.contains('btn-logout-trigger') || drawerLink.classList.contains('drawer-logout-btn')) {
            return;
        }

        // Handle specific modal triggers
        if (drawerLink.classList.contains('open-account-modal-trigger')) {
            e.preventDefault();
            const userAccountModal = document.getElementById('userAccountModal');
            if (userAccountModal) {
                userAccountModal.classList.add('active');
            } else {
                window.location.href = 'index.html?action=account';
            }
            return;
        }

        if (drawerLink.classList.contains('open-chat-trigger')) {
            e.preventDefault();
            if (typeof window.openLyannChatModal === 'function') {
                window.openLyannChatModal();
            } else if (typeof window.openChatWithUser === 'function') {
                window.openChatWithUser('Prestataire LYANN', 'david-34.png', '1');
            } else {
                window.location.href = 'index.html?action=openchat';
            }
            return;
        }

        // Handle real page navigation links
        if (href && href !== '#' && !href.startsWith('javascript:')) {
            e.preventDefault();
            window.location.href = href;
            return;
        }
    }
});

function initDrawerEvents(overlay) {
    const closeBtn = overlay.querySelector('#closeMobileDrawerBtn') || overlay.querySelector('.drawer-close-btn') || overlay.querySelector('.mobile-menu-close');
    const logoutBtn = overlay.querySelector('#drawerLogoutBtn');

    if (closeBtn) {
        const handleClose = (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.closeLyannHamburgerDrawer();
        };
        closeBtn.addEventListener('click', handleClose);
        closeBtn.addEventListener('touchstart', handleClose, { passive: false });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            window.closeLyannHamburgerDrawer();
            
            try {
                if (typeof safeStorage !== 'undefined') {
                    safeStorage.removeItem('lyan_user_logged_in');
                    safeStorage.removeItem('lyan_user_id');
                    safeStorage.removeItem('lyan_user_profile');
                }
                localStorage.removeItem('lyan_user_logged_in');
                localStorage.removeItem('lyan_user_id');
                localStorage.removeItem('lyan_user_profile');
                sessionStorage.clear();
            } catch (err) {}

            if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
                try {
                    await window.LYANN_API_CLIENT.signOut();
                } catch (err) {}
            }

            document.body.classList.remove('user-is-logged-in');
            if (typeof updateHeaderAuthState === 'function') {
                await updateHeaderAuthState();
            }

            if (window.NotificationService) {
                window.NotificationService.showToast('info', 'Vous avez été déconnecté.');
            } else if (typeof showLyanToast === 'function') {
                showLyanToast('info', 'Déconnexion réussie');
            }
        });
    }

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            window.closeLyannHamburgerDrawer();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('active')) {
            window.closeLyannHamburgerDrawer();
        }
    });

    overlay.querySelectorAll('.drawer-accordion-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-target');
            const targetSubmenu = overlay.querySelector(`#${targetId}`);
            const isOpen = targetSubmenu && targetSubmenu.classList.contains('open');

            overlay.querySelectorAll('.drawer-submenu').forEach(sub => sub.classList.remove('open'));
            overlay.querySelectorAll('.drawer-accordion-btn').forEach(b => b.classList.remove('active'));

            if (!isOpen && targetSubmenu) {
                targetSubmenu.classList.add('open');
                btn.classList.add('active');
            }
        });
    });

    overlay.querySelectorAll('.drawer-sub-link, .drawer-direct-link, .drawer-profile-link').forEach(link => {
        link.addEventListener('click', () => {
            window.closeLyannHamburgerDrawer();
            const targetTab = link.getAttribute('data-tab');
            if (targetTab && typeof window.switchUserAccountTab === 'function') {
                window.switchUserAccountTab(targetTab);
            }
        });
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.closeLyannHamburgerDrawer();
            if (typeof safeStorage !== 'undefined') safeStorage.removeItem('lyan_user_logged_in');
            else localStorage.removeItem('lyan_user_logged_in');
            if (window.lyannAlert) window.lyannAlert('Vous avez été déconnecté de LYANN.');
            setTimeout(() => { window.location.href = 'index.html'; }, 500);
        });
    }
}

function safeDomReady(fn) {
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        fn();
    } else {
        document.addEventListener('DOMContentLoaded', fn);
    }
}

safeDomReady(() => {
    // Initialize official DOM communes autocomplete engine
    initLyannCommunesAutocomplete();

    // === SEARCH EXAMPLE SUGGESTIONS & FILTERS ENGINE ===
    (function initHashtagFiltersEngine() {
        const hashtagTags = document.querySelectorAll('.suggestion-tags .tag, .hashtag-tag, .example-search-tag');
        hashtagTags.forEach(tag => {
            tag.addEventListener('click', (e) => {
                e.preventDefault();
                const query = tag.getAttribute('data-query') || tag.getAttribute('data-hashtag') || tag.textContent.trim();
                
                if (query.includes('Je ne sais pas') || tag.classList.contains('help-wizard-trigger') || tag.getAttribute('data-action') === 'help-wizard') {
                    if (typeof window.openLyannWizard === 'function') {
                        window.openLyannWizard();
                    } else {
                        const wizardModal = document.getElementById('modal-request-help');
                        if (wizardModal) wizardModal.classList.add('active');
                    }
                    return;
                }

                // Fill search input & trigger search
                const searchInput = document.getElementById('searchInput') || document.getElementById('feedSearchInput') || document.getElementById('globalAdminSearch');
                if (searchInput) {
                    searchInput.value = query.replace(/^#/, '');
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                }

                // Highlight active tag
                hashtagTags.forEach(t => t.classList.remove('active'));
                tag.classList.add('active');

                // Execute search if performSearch exists
                if (typeof performSearch === 'function') {
                    performSearch(true);
                }

                // Smooth scroll to results
                const resultsSection = document.getElementById('results') || document.getElementById('searchResultsContainer') || document.querySelector('.results-main-section');
                if (resultsSection) {
                    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    })();

    // === GLOBAL KEYBOARD AVOIDANCE & INPUT FOCUS ENGINE ===
    (function initKeyboardAvoidanceEngine() {
        let isKeyboardOpen = false;

        document.addEventListener('focusin', (e) => {
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                isKeyboardOpen = true;
                document.body.classList.add('keyboard-open');

                // Smooth scroll active field to center of viewport with 16px breathing room
                setTimeout(() => {
                    if (e.target && typeof e.target.scrollIntoView === 'function') {
                        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 150);
            }
        }, true);

        document.addEventListener('focusout', (e) => {
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                setTimeout(() => {
                    const activeTag = document.activeElement ? document.activeElement.tagName : '';
                    if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA' && activeTag !== 'SELECT') {
                        isKeyboardOpen = false;
                        document.body.classList.remove('keyboard-open');
                    }
                }, 150);
            }
        }, true);

        // VisualViewport API support for iOS Safari & Android WebViews
        if (window.visualViewport) {
            let originalHeight = window.visualViewport.height;
            window.visualViewport.addEventListener('resize', () => {
                const currentHeight = window.visualViewport.height;
                if (currentHeight < originalHeight * 0.8) {
                    document.body.classList.add('keyboard-open');
                } else if (currentHeight >= originalHeight * 0.95 && !isKeyboardOpen) {
                    document.body.classList.remove('keyboard-open');
                }
            });
        }
    })();

    // Injecter le menu Hamburger Mobile latéral
    ensureMobileHamburgerDrawer();

    // Injecter l'interface native mobile Capacitor
    if (typeof injectMobileInterface === 'function') {
        injectMobileInterface();
    }

    let activeContactName = 'Prestataire LYANN';
    let activeContactAvatar = 'david-34.png';

    // === SCROLL REVEAL ANIMATION (IntersectionObserver) ===
    const revealElements = document.querySelectorAll('.reveal');
    if (revealElements.length > 0) {
        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

        revealElements.forEach(el => revealObserver.observe(el));
    }

    // === ONBOARDING TRIGGERS ===
    document.querySelectorAll('.open-signup-trigger').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.openOnboarding === 'function') {
                window.openOnboarding();
            }
        });
    });

    // === GPS GEOLOCATION INTERACTION ===
    const btnBookingGPS = document.getElementById('btnBookingGPS');
    if (btnBookingGPS) {
        btnBookingGPS.addEventListener('click', async (e) => {
            e.preventDefault();
            btnBookingGPS.className = 'ph ph-spinner-gap spin-animation';
            
            const coords = await getNativeCoordinates();
            if (coords) {
                const cityName = await getCityNameFromCoords(coords.latitude, coords.longitude);
                if (cityName) {
                    const input = document.getElementById('bookingLocation');
                    if (input) input.value = cityName;
                    window.lyannAlert(`📍 Localisation réussie : ${cityName}`);
                } else {
                    window.lyannAlert('❌ Impossible de convertir les coordonnées GPS en commune.');
                }
            } else {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        async (position) => {
                            const cityName = await getCityNameFromCoords(position.coords.latitude, position.coords.longitude);
                            if (cityName) {
                                const input = document.getElementById('bookingLocation');
                                if (input) input.value = cityName;
                                window.lyannAlert(`📍 Localisation réussie (Web) : ${cityName}`);
                            } else {
                                window.lyannAlert('❌ Impossible de convertir les coordonnées GPS en commune.');
                            }
                        },
                        (err) => {
                            window.lyannAlert('❌ Accès GPS refusé ou indisponible.');
                        }
                    );
                } else {
                    window.lyannAlert('❌ La géolocalisation n\'est pas supportée par votre appareil.');
                }
            }
            
            btnBookingGPS.className = 'ph ph-map-pin';
        });
    }
    // Safe storage wrapper to prevent crashes under file:// when localStorage is disabled or blocked
    const safeStorage = {
        _cache: {},
        getItem(key) {
            try { return localStorage.getItem(key) || this._cache[key] || null; } catch (e) { return this._cache[key] || null; }
        },
        setItem(key, value) {
            try { localStorage.setItem(key, value); } catch (e) {}
            this._cache[key] = value;
        }
    };

    // --- Profile Tabs Switcher ---
    const profileTabBtns = document.querySelectorAll('.profile-tab-btn');
    const profileTabContents = document.querySelectorAll('.profile-tab-content');

    profileTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            const targetEl = document.getElementById(targetTab);
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    const profileModalBody = document.querySelector('#profileDashboardModal .modal-body');
    if (profileModalBody) {
        const profileObserver = new IntersectionObserver((entries) => {
            let activeId = null;
            let maxRatio = 0;
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
                    maxRatio = entry.intersectionRatio;
                    activeId = entry.target.id;
                }
            });
            if (activeId) {
                const btn = document.querySelector(`.profile-tab-btn[data-tab="${activeId}"]`);
                if (btn && !btn.classList.contains('active')) {
                    profileTabBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }
            }
        }, { root: profileModalBody, threshold: [0.1, 0.3, 0.6, 0.9] });
        
        profileTabContents.forEach(c => profileObserver.observe(c));
    }

    const logoutBtn = document.getElementById('logoutBtn');
    const searchResultsModal = document.getElementById('searchResultsModal');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            safeStorage.setItem('lyan_user_logged_in', 'false');
            updateHeaderAuthState();
            closeProfileDashboard();
            window.lyannAlert('Vous êtes déconnecté.');
        });
    }

    // ==========================================================================
    // LOGIQUE DE PROFIL PUBLIC RÉSEAU SOCIAL & GALERIE DE RÉALISATIONS
    // ==========================================================================
    const DEFAULT_REALIZATIONS = [
        {
            title: "Rénovation Chauffe-Eau Solaire",
            city: "Baie-Mahault",
            img: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80",
            desc: "Installation complète d'un système solaire avec tuyauterie cuivre et raccordement sanitaire."
        },
        {
            title: "Aménagement Douche à l'Italienne",
            city: "Le Gosier",
            img: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80",
            desc: "Pose de sanitaire encastré, carrelage anti-dérapant et étanchéité de douche."
        },
        {
            title: "Ravalement & Peinture Façade Villa",
            city: "Les Abymes",
            img: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80",
            desc: "Traitement anti-moisissure et peinture hydrofuge haute durabilité."
        }
    ];

    const publicMemberProfileModal = document.getElementById('publicMemberProfileModal');
    const closePublicProfileModalBtn = document.getElementById('closePublicProfileModalBtn');
    const recommendMemberBtn = document.getElementById('recommendMemberBtn');
    const recommendCountBadge = document.getElementById('recommendCountBadge');
    const publicContactBtn = document.getElementById('publicContactBtn');
    const shareProfileBtn = document.getElementById('shareProfileBtn');
    const publicRealizationsGrid = document.getElementById('publicRealizationsGrid');

    const addRealizationModal = document.getElementById('addRealizationModal');
    const openAddRealizationBtn = document.getElementById('openAddRealizationBtn');
    const closeAddRealizationModalBtn = document.getElementById('closeAddRealizationModalBtn');
    const addRealizationForm = document.getElementById('addRealizationForm');
    const realizationFileInput = document.getElementById('realizationFileInput');
    const triggerFileInputBtn = document.getElementById('triggerFileInputBtn');
    const realizationImageUrl = document.getElementById('realizationImageUrl');
    const realizationImagePreview = document.getElementById('realizationImagePreview');

    let currentVisitingMember = null;
    let memberRecommendations = {};

    async function openPublicMemberProfile(memberId) {
        const fallbackMember = LYANN_MEMBERS.find(m => String(m.id) === String(memberId)) || LYANN_MEMBERS[0];
        currentVisitingMember = fallbackMember;

        let activeUserId = null;
        if (window.apiClient && window.apiClient.getSession) {
            try {
                const s = await window.apiClient.getSession();
                activeUserId = s?.data?.session?.user?.id || null;
            } catch (e) {}
        }
        const isSelf = activeUserId && (String(activeUserId) === String(memberId));

        // Fetch real Trust & Reputation data
        let profileData = {
            id: memberId,
            display_name: fallbackMember.name,
            first_name: fallbackMember.name ? fallbackMember.name.split(' ')[0] : 'Membre',
            last_name_initial: fallbackMember.name && fallbackMember.name.split(' ')[1] ? fallbackMember.name.split(' ')[1].substring(0, 1) + '.' : '',
            city: fallbackMember.city || 'Guadeloupe',
            territory: fallbackMember.locationName || 'Guadeloupe (971)',
            bio: fallbackMember.bio || '',
            avatar_url: fallbackMember.avatar,
            is_verified: !!fallbackMember.badge,
            is_pro_verified: !!fallbackMember.isPro,
            completion_pct: 75,
            member_since: '2026',
            metrics: {
                average_rating: fallbackMember.rating || null,
                reviews_count: fallbackMember.reviewsCount || 0,
                completed_missions: 0,
                response_rate_percent: null,
                avg_response_time_label: '—',
                repeat_users_count: 0
            }
        };

        if (window.apiClient && window.apiClient.getUserTrustAndReputation && memberId && String(memberId).includes('-')) {
            try {
                const trustRes = await window.apiClient.getUserTrustAndReputation(memberId);
                if (trustRes && trustRes.data && !trustRes.data.error) {
                    const t = trustRes.data;
                    profileData = {
                        ...profileData,
                        ...t,
                        display_name: t.display_name || profileData.display_name,
                        city: t.city || profileData.city,
                        territory: t.territory || profileData.territory,
                        bio: t.bio || profileData.bio,
                        avatar_url: t.avatar_url || profileData.avatar_url,
                        is_verified: !!t.is_verified,
                        is_pro_verified: !!t.is_pro_verified,
                        completion_pct: t.completion_pct || 40,
                        metrics: {
                            ...profileData.metrics,
                            ...(t.metrics || {})
                        }
                    };
                }
            } catch (err) {
                console.warn('Trust Engine RPC query notice:', err);
            }
        }

        // Fetch real portfolio
        let portfolioItems = [];
        if (window.apiClient && window.apiClient.getUserPortfolio && memberId && String(memberId).includes('-')) {
            try {
                const portRes = await window.apiClient.getUserPortfolio(memberId, isSelf);
                if (portRes && portRes.data) portfolioItems = portRes.data;
            } catch (e) {}
        }

        // Fetch real services
        let userServices = [];
        if (window.apiClient && window.apiClient.getUserServices && memberId && String(memberId).includes('-')) {
            try {
                const servRes = await window.apiClient.getUserServices(memberId);
                if (servRes && servRes.data) userServices = servRes.data;
            } catch (e) {}
        }

        // Fetch real reviews
        let reviewsList = [];
        if (window.apiClient && window.apiClient.supabase && memberId && String(memberId).includes('-')) {
            try {
                const { data: dbReviews } = await window.apiClient.supabase
                    .from('reviews')
                    .select('*, author:profiles!author_id(first_name, last_name, avatar_url, city)')
                    .eq('target_id', memberId)
                    .order('created_at', { ascending: false });

                if (dbReviews && dbReviews.length > 0) {
                    reviewsList = dbReviews.map(r => ({
                        name: `${r.author?.first_name || 'Membre'} ${r.author?.last_name ? r.author.last_name.substring(0, 1) + '.' : ''}`,
                        city: r.author?.city || 'Guadeloupe',
                        date: new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
                        rating: Number(r.rating).toFixed(1),
                        comment: r.comment || 'Coup de main réalisé avec succès.'
                    }));
                }
            } catch (e) {}
        }

        // Populate DOM elements in publicMemberProfileModal
        renderStep9ProfileModalDOM(profileData, isSelf, portfolioItems, userServices, reviewsList);

        // Open modal
        if (searchResultsModal) searchResultsModal.classList.remove('active');
        if (publicMemberProfileModal) {
            publicMemberProfileModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        } else {
            openQuickProfileModal(memberId);
        }
    }

    function renderStep9ProfileModalDOM(pData, isSelf, portfolioItems, userServices, reviewsList) {
        const modalCard = document.querySelector('#publicMemberProfileModal .modal-card') || document.querySelector('#publicMemberProfileModal');
        if (!modalCard) return;

        const metrics = pData.metrics || {};
        const avgRating = metrics.average_rating ? Number(metrics.average_rating).toFixed(1) : null;
        const reviewsCount = metrics.reviews_count || reviewsList.length || 0;
        const completedMissions = metrics.completed_missions || 0;

        // Build Compact Trust Line
        let trustLineHTML = '';
        if (avgRating || reviewsCount > 0 || completedMissions > 0) {
            trustLineHTML = `
                <div class="lyann-trust-line-compact">
                    <span class="lyann-trust-line-star"><i class="ph-fill ph-star"></i> ${avgRating || '5.0'}</span>
                    <span class="lyann-trust-dot">•</span>
                    <span>${reviewsCount} ${reviewsCount > 1 ? 'retours' : 'retour'}</span>
                    <span class="lyann-trust-dot">•</span>
                    <span>${completedMissions} ${completedMissions > 1 ? 'coups de main réalisés' : 'coup de main réalisé'}</span>
                </div>
            `;
        } else {
            trustLineHTML = `
                <div class="lyann-trust-line-compact">
                    <span class="lyann-badge lyann-badge-verified"><i class="ph ph-sparkle"></i> Nouveau sur LYANN</span>
                    <span class="lyann-trust-dot">•</span>
                    <span>Pas encore de retour</span>
                </div>
            `;
        }

        // Build Badges
        let badgesHTML = '';
        if (pData.is_verified) badgesHTML += '<span class="lyann-badge lyann-badge-verified"><i class="ph-fill ph-seal-check"></i> Profil vérifié</span> ';
        if (pData.is_pro_verified) badgesHTML += '<span class="lyann-badge lyann-badge-pro"><i class="ph ph-briefcase"></i> PRO</span>';

        // Build CTA Group
        let ctaHTML = '';
        if (isSelf) {
            ctaHTML = `
                <div class="lyann-profile-cta-group">
                    <button type="button" class="btn btn-outline btn-sm" onclick="if(typeof window.openCompleteProfileModal==='function') window.openCompleteProfileModal();"><i class="ph ph-pencil-simple"></i> Modifier mon profil</button>
                </div>
            `;
        } else {
            ctaHTML = `
                <div class="lyann-profile-cta-group">
                    <button type="button" class="btn btn-primary" onclick="window.openHelpRequestWithTarget('${pData.id}', '${pData.display_name}')"><i class="ph ph-hand-heart"></i> Demander un coup de main</button>
                    <button type="button" class="btn btn-outline" onclick="window.openChatWithUser('${pData.display_name}', '${pData.avatar_url || ''}')"><i class="ph ph-chat-circle"></i> Écrire</button>
                </div>
            `;
        }

        // Build Completion Card (Self View Only)
        let completionCardHTML = '';
        if (isSelf) {
            const completionPct = pData.completion_pct || 40;
            completionCardHTML = `
                <div class="lyann-completion-card">
                    <div class="lyann-completion-header">
                        <span class="lyann-completion-title"><i class="ph ph-check-circle"></i> Ton profil est complet à</span>
                        <span class="lyann-completion-pct-badge">${completionPct}%</span>
                    </div>
                    <div class="lyann-completion-bar-bg">
                        <div class="lyann-completion-bar-fill" style="width: ${completionPct}%;"></div>
                    </div>
                    <div class="lyann-completion-items">
                        <span class="lyann-completion-chip" onclick="window.lyannOpenAvatarModal()"><i class="ph ph-camera"></i> Photo de profil</span>
                        <span class="lyann-completion-chip" onclick="if(typeof window.openCompleteProfileModal==='function') window.openCompleteProfileModal();"><i class="ph ph-user-focus"></i> Bio & Présentation</span>
                        <span class="lyann-completion-chip" onclick="window.lyannOpenAddPortfolioModal()"><i class="ph ph-image"></i> Ajouter une réalisation</span>
                    </div>
                </div>
            `;
        }

        // Build Services ("Ce que je peux faire")
        let servicesHTML = '';
        if (userServices.length > 0) {
            servicesHTML = `
                <div class="lyann-profile-section">
                    <div class="lyann-section-header">
                        <h4 class="lyann-section-title"><i class="ph ph-hand-waving"></i> Ce que je peux faire</h4>
                    </div>
                    <div class="lyann-services-grid">
                        ${userServices.map(s => `
                            <div class="lyann-service-chip">
                                <div class="lyann-service-icon"><i class="ph ph-wrench"></i></div>
                                <div class="lyann-service-info">
                                    <h5>${s.title}</h5>
                                    <p>${s.description || 'Coup de main disponible.'}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else if (isSelf) {
            servicesHTML = `
                <div class="lyann-profile-section">
                    <div class="lyann-section-header">
                        <h4 class="lyann-section-title"><i class="ph ph-hand-waving"></i> Ce que je peux faire</h4>
                    </div>
                    <div class="lyann-zero-data">
                        <i class="ph ph-plus-circle lyann-zero-data-icon"></i>
                        <span class="lyann-zero-data-title">Ajoute ce pour quoi tu peux donner un coup de main</span>
                        <span class="lyann-zero-data-sub">Jardinage, entretien, petits travaux, garde...</span>
                    </div>
                </div>
            `;
        }

        // Build Relocation Card ("Je me déplace")
        const relocationHTML = `
            <div class="lyann-profile-section">
                <div class="lyann-section-header">
                    <h4 class="lyann-section-title"><i class="ph ph-navigation-arrow"></i> Je me déplace</h4>
                </div>
                <div class="lyann-relocation-card">
                    <div class="lyann-relocation-icon"><i class="ph ph-map-pin"></i></div>
                    <div class="lyann-relocation-text">
                        <strong>Autour de ${pData.city || 'Guadeloupe'}</strong>
                        <span>Jusqu'à ${pData.intervention_radius_km || 10} km aux alentours</span>
                    </div>
                </div>
            </div>
        `;

        // Build Portfolio ("Mes réalisations")
        let portfolioHTML = '';
        if (portfolioItems.length > 0) {
            portfolioHTML = `
                <div class="lyann-profile-section">
                    <div class="lyann-section-header">
                        <h4 class="lyann-section-title"><i class="ph ph-images"></i> Mes réalisations</h4>
                        ${isSelf ? '<button type="button" class="lyann-block-edit-btn" onclick="window.lyannOpenAddPortfolioModal()"><i class="ph ph-plus"></i> Ajouter</button>' : ''}
                    </div>
                    <div class="lyann-portfolio-grid">
                        ${portfolioItems.map((item, idx) => `
                            <div class="lyann-portfolio-card" onclick="window.lyannOpenLightbox('${item.image_url}', '${(item.title || '').replace(/'/g, "\\'")}', '${(item.caption || '').replace(/'/g, "\\'")}')">
                                <img src="${item.image_url}" alt="${item.title || 'Réalisation'}" class="lyann-portfolio-img">
                                ${isSelf ? `<span class="lyann-portfolio-privacy-badge ${item.is_public ? 'public' : 'private'}">${item.is_public ? 'Public' : 'Privé'}</span>` : ''}
                                <div class="lyann-portfolio-info">
                                    <h5 class="lyann-portfolio-title">${item.title || 'Réalisation'}</h5>
                                    ${item.caption ? `<p class="lyann-portfolio-caption">${item.caption}</p>` : ''}
                                </div>
                                ${isSelf ? `<button type="button" style="position:absolute; bottom:8px; right:8px; background:rgba(201,81,64,0.9); color:white; border:none; border-radius:8px; padding:4px 8px; font-size:0.75rem; cursor:pointer;" onclick="event.stopPropagation(); window.lyannDeletePortfolioItem('${item.id}');"><i class="ph ph-trash"></i></button>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else if (isSelf) {
            portfolioHTML = `
                <div class="lyann-profile-section">
                    <div class="lyann-section-header">
                        <h4 class="lyann-section-title"><i class="ph ph-images"></i> Mes réalisations</h4>
                        <button type="button" class="lyann-block-edit-btn" onclick="window.lyannOpenAddPortfolioModal()"><i class="ph ph-plus"></i> Ajouter</button>
                    </div>
                    <div class="lyann-zero-data" onclick="window.lyannOpenAddPortfolioModal()" style="cursor:pointer;">
                        <i class="ph ph-image lyann-zero-data-icon"></i>
                        <span class="lyann-zero-data-title">Aucune réalisation pour le moment</span>
                        <span class="lyann-zero-data-sub">Clique ici pour ajouter tes premières photos de réalisations.</span>
                    </div>
                </div>
            `;
        }

        // Build Reviews ("Les retours")
        let reviewsHTML = `
            <div class="lyann-profile-section">
                <div class="lyann-section-header">
                    <h4 class="lyann-section-title"><i class="ph ph-chat-circle-dots"></i> Les retours (${reviewsCount})</h4>
                </div>
        `;
        if (reviewsList.length > 0) {
            reviewsHTML += reviewsList.map(r => `
                <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:14px; padding:14px 18px; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div style="width:32px; height:32px; border-radius:50%; background:#E6EFE9; color:#2D6A4F; font-weight:800; display:flex; align-items:center; justify-content:center; font-size:0.8rem;">${r.name.charAt(0)}</div>
                            <div>
                                <strong style="font-size:0.88rem; color:#1E293B; display:block;">${r.name}</strong>
                                <span style="font-size:0.75rem; color:#64748B;"><i class="ph ph-map-pin"></i> ${r.city} • ${r.date}</span>
                            </div>
                        </div>
                        <div style="color:#F59E0B; font-weight:700; font-size:0.85rem; display:flex; align-items:center; gap:3px;">
                            <i class="ph-fill ph-star"></i> ${r.rating}
                        </div>
                    </div>
                    <p style="font-size:0.88rem; color:#475569; margin:0; line-height:1.4;">${r.comment}</p>
                </div>
            `).join('');
        } else {
            reviewsHTML += `
                <div class="lyann-zero-data">
                    <i class="ph ph-chat-circle-dots lyann-zero-data-icon"></i>
                    <span class="lyann-zero-data-title">Pas encore de retour</span>
                    <span class="lyann-zero-data-sub">Ce membre n'a pas encore reçu d'avis post-mission.</span>
                </div>
            `;
        }
        reviewsHTML += `</div>`;

        // Build Activity Metrics ("Son activité sur LYANN")
        const activityTitle = isSelf ? "Mon activité sur LYANN" : "Son activité sur LYANN";
        const activityHTML = `
            <div class="lyann-profile-section">
                <div class="lyann-section-header">
                    <h4 class="lyann-section-title"><i class="ph ph-chart-line-up"></i> ${activityTitle}</h4>
                </div>
                <div class="lyann-activity-grid">
                    <div class="lyann-activity-card">
                        <span class="lyann-activity-val">${metrics.completed_missions || '0'}</span>
                        <span class="lyann-activity-label">Coups de main réalisés</span>
                    </div>
                    <div class="lyann-activity-card">
                        <span class="lyann-activity-val">${metrics.response_rate_percent !== null && metrics.response_rate_percent !== undefined ? metrics.response_rate_percent + ' %' : '—'}</span>
                        <span class="lyann-activity-label">Taux de réponse</span>
                    </div>
                    <div class="lyann-activity-card">
                        <span class="lyann-activity-val" style="font-size:0.88rem;">${metrics.avg_response_time_label || '—'}</span>
                        <span class="lyann-activity-label">Temps de réponse</span>
                    </div>
                    <div class="lyann-activity-card">
                        <span class="lyann-activity-val">${metrics.repeat_users_count || '0'}</span>
                        <span class="lyann-activity-label">Habitués</span>
                    </div>
                    <div class="lyann-activity-card">
                        <span class="lyann-activity-val" style="font-size:0.95rem;">${pData.member_since || '2026'}</span>
                        <span class="lyann-activity-label">Membre depuis</span>
                    </div>
                    ${isSelf ? `
                        <div class="lyann-activity-card">
                            <span class="lyann-activity-val">${pData.completion_pct || 40} %</span>
                            <span class="lyann-activity-label">Taux de complétion</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        // Inject Full Layout into Modal
        modalCard.innerHTML = `
            <button class="modal-close-btn" id="closePublicProfileModalBtn" aria-label="Fermer" onclick="if(document.getElementById('publicMemberProfileModal')) document.getElementById('publicMemberProfileModal').classList.remove('active'); document.body.style.overflow='auto';" style="top:16px; right:16px; z-index:10;"><i class="ph ph-x"></i></button>

            <div class="lyann-profile-hero">
                <div class="lyann-profile-hero-content">
                    <div class="lyann-profile-avatar-wrapper">
                        <img src="${pData.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(pData.display_name || 'LyannUser')}" alt="${pData.display_name}" class="lyann-profile-avatar-img">
                        ${isSelf ? '<button type="button" class="lyann-avatar-edit-btn" onclick="window.lyannOpenAvatarModal()" title="Changer la photo"><i class="ph ph-camera"></i></button>' : ''}
                    </div>
                    <div class="lyann-profile-hero-details">
                        <div class="lyann-profile-name-row">
                            <h3 class="lyann-profile-display-name">${pData.display_name}</h3>
                            ${badgesHTML}
                        </div>
                        <div class="lyann-profile-location">
                            <i class="ph ph-map-pin"></i> ${pData.city} • ${pData.territory}
                        </div>
                        ${trustLineHTML}
                        <p class="lyann-profile-bio">${pData.bio ? '"' + pData.bio + '"' : '"Membre actif de la communauté LYANN."'}</p>
                        ${ctaHTML}
                    </div>
                </div>
            </div>

            ${completionCardHTML}
            ${servicesHTML}
            ${relocationHTML}
            ${portfolioHTML}
            ${reviewsHTML}
            ${activityHTML}
        `;
    }

    async function renderPublicReviews(member) {
        const reviewsContainer = document.getElementById('publicMemberReviewsList');
        if (!reviewsContainer) return;

        let reviews = [];

        // Try querying Supabase public.reviews if real user
        if (window.apiClient && window.apiClient.supabase && member && member.id && String(member.id).includes('-')) {
            try {
                const { data: dbReviews } = await window.apiClient.supabase
                    .from('reviews')
                    .select('*, author:profiles!author_id(first_name, last_name, avatar_url, city)')
                    .eq('target_id', member.id)
                    .order('created_at', { ascending: false });

                if (dbReviews && dbReviews.length > 0) {
                    reviews = dbReviews.map(r => ({
                        name: `${r.author?.first_name || 'Membre'} ${r.author?.last_name ? r.author.last_name.substring(0, 1) + '.' : ''}`,
                        city: r.author?.city || 'Guadeloupe',
                        date: new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
                        rating: Number(r.rating).toFixed(1),
                        comment: r.comment || 'Coup de main réalisé avec succès.'
                    }));
                }
            } catch (e) {
                console.warn('Real reviews query error:', e);
            }
        }

        if (reviews.length === 0) {
            reviewsContainer.innerHTML = `
                <div style="text-align:center; padding:32px 16px; background:#F8FAFC; border:1px dashed #CBD5E1; border-radius:16px;">
                    <i class="ph ph-chat-circle-dots" style="font-size:2rem; color:#94A3B8; margin-bottom:8px; display:block;"></i>
                    <strong style="color:#475569; display:block; font-size:0.95rem;">Pas encore de retour</strong>
                    <span style="color:#64748B; font-size:0.85rem;">Ce membre n'a pas encore reçu d'avis post-mission.</span>
                </div>
            `;
            return;
        }

        reviewsContainer.innerHTML = reviews.map(r => `
            <div class="review-card-item" style="background:#FFFFFF; border:1px solid #E6EFE9; border-radius:16px; padding:16px 20px; margin-bottom:12px; box-shadow:0 2px 8px rgba(0,0,0,0.03);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:36px; height:36px; border-radius:50%; background:#E6EFE9; color:#2D6A4F; font-weight:800; display:flex; align-items:center; justify-content:center; font-size:0.85rem;">
                            ${r.name.charAt(0)}
                        </div>
                        <div>
                            <strong style="font-size:0.92rem; color:#1E3A2B; display:block;">${r.name}</strong>
                            <span style="font-size:0.78rem; color:#6B8577;"><i class="ph ph-map-pin"></i> ${r.city} • ${r.date}</span>
                        </div>
                    </div>
                    <div style="color:#F59E0B; font-weight:700; font-size:0.88rem; display:flex; align-items:center; gap:4px;">
                        <i class="ph-fill ph-star"></i> ${r.rating}
                    </div>
                </div>
                <p style="font-size:0.88rem; color:#334E40; margin:0; line-height:1.4;">${r.comment}</p>
            </div>
        `).join('');
    }

    function renderPublicRealizations(member) {
        if (!publicRealizationsGrid) return;

        const realizations = member.realizations && member.realizations.length > 0
            ? member.realizations
            : DEFAULT_REALIZATIONS;

        publicRealizationsGrid.innerHTML = realizations.map((item, idx) => `
            <div class="realization-card" data-project-idx="${idx}" onclick="window.LYANN_openProjectDetail(${idx})">
                <div class="realization-img-wrapper">
                    <img src="${item.coverImg || item.img}" alt="${item.title}" class="realization-img">
                    <span class="realization-tag-city">📍 ${item.city}</span>
                    ${(item.photos && item.photos.length > 1) ? '<span class="realization-photo-count" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);color:white;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:700;"><i class="ph ph-images"></i> ' + item.photos.length + '</span>' : ''}
                </div>
                <div class="realization-info">
                    <h5 class="realization-title">${item.title}</h5>
                    ${item.category ? '<span class="realization-category-pill">' + item.category + '</span>' : ''}
                    ${item.date ? '<span class="realization-date">' + item.date + '</span>' : ''}
                    <p class="realization-desc">${item.desc}</p>
                </div>
            </div>
        `).join('');

        // Store realizations for project detail modal
        window._currentProfileRealizations = realizations;
    }

    // ===== PROJECT DETAIL MODAL (Lightbox Multi-Photos) =====
    window.LYANN_openProjectDetail = function(idx) {
        const realizations = window._currentProfileRealizations || DEFAULT_REALIZATIONS;
        const project = realizations[idx];
        if (!project) return;

        const photos = project.photos || [project.coverImg || project.img];
        let currentPhotoIdx = 0;

        // Create or get overlay
        let overlay = document.getElementById('projectDetailOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'project-detail-overlay';
            overlay.id = 'projectDetailOverlay';
            document.body.appendChild(overlay);
        }

        const dotsHTML = photos.map((_, i) => `<button class="carousel-dot${i === 0 ? ' active' : ''}" data-dot="${i}"></button>`).join('');

        overlay.innerHTML = `
            <div class="project-detail-card">
                <button class="project-detail-close" id="closeProjectDetail"><i class="ph ph-x"></i></button>
                <div class="project-carousel" id="projectCarousel">
                    ${photos.map((p, i) => `<img src="${p}" alt="${project.title} - Photo ${i+1}" class="${i === 0 ? 'active' : ''}" data-photo-idx="${i}">`).join('')}
                    ${photos.length > 1 ? `
                        <button class="carousel-btn prev" id="carouselPrev"><i class="ph ph-caret-left"></i></button>
                        <button class="carousel-btn next" id="carouselNext"><i class="ph ph-caret-right"></i></button>
                        <div class="carousel-dots">${dotsHTML}</div>
                    ` : ''}
                    <span class="project-carousel-counter" id="carouselCounter">1 / ${photos.length}</span>
                    <button class="btn-fullscreen-photo" id="btnFullscreenPhoto"><i class="ph ph-arrows-out"></i> Plein écran</button>
                </div>
                <div class="project-detail-body">
                    <h3>${project.title}</h3>
                    <div class="project-detail-meta">
                        ${project.city ? '<span><i class="ph ph-map-pin"></i> ' + project.city + '</span>' : ''}
                        ${project.category ? '<span><i class="ph ph-tag"></i> ' + project.category + '</span>' : ''}
                        ${project.date ? '<span><i class="ph ph-calendar"></i> ' + project.date + '</span>' : ''}
                    </div>
                    <p class="project-detail-desc">${project.desc}</p>
                </div>
            </div>
        `;

        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        function showPhoto(idx) {
            currentPhotoIdx = idx;
            overlay.querySelectorAll('.project-carousel img').forEach((img, i) => {
                img.classList.toggle('active', i === idx);
            });
            overlay.querySelectorAll('.carousel-dot').forEach((dot, i) => {
                dot.classList.toggle('active', i === idx);
            });
            const counter = overlay.querySelector('#carouselCounter');
            if (counter) counter.textContent = (idx + 1) + ' / ' + photos.length;
        }

        // Navigation
        const prevBtn = overlay.querySelector('#carouselPrev');
        const nextBtn = overlay.querySelector('#carouselNext');
        if (prevBtn) prevBtn.onclick = () => showPhoto((currentPhotoIdx - 1 + photos.length) % photos.length);
        if (nextBtn) nextBtn.onclick = () => showPhoto((currentPhotoIdx + 1) % photos.length);

        // Dots
        overlay.querySelectorAll('.carousel-dot').forEach(dot => {
            dot.onclick = () => showPhoto(parseInt(dot.dataset.dot));
        });

        // Swipe mobile
        let touchStartX = 0;
        const carousel = overlay.querySelector('#projectCarousel');
        if (carousel) {
            carousel.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
            carousel.addEventListener('touchend', (e) => {
                const diff = touchStartX - e.changedTouches[0].clientX;
                if (Math.abs(diff) > 50) {
                    if (diff > 0) showPhoto((currentPhotoIdx + 1) % photos.length);
                    else showPhoto((currentPhotoIdx - 1 + photos.length) % photos.length);
                }
            });
        }

        // Fullscreen
        const fsBtn = overlay.querySelector('#btnFullscreenPhoto');
        if (fsBtn) {
            fsBtn.onclick = () => {
                let fsOverlay = document.getElementById('fullscreenPhotoOverlay');
                if (!fsOverlay) {
                    fsOverlay = document.createElement('div');
                    fsOverlay.className = 'fullscreen-photo-overlay';
                    fsOverlay.id = 'fullscreenPhotoOverlay';
                    document.body.appendChild(fsOverlay);
                }
                fsOverlay.innerHTML = '<img src="' + photos[currentPhotoIdx] + '" alt="Plein écran">';
                fsOverlay.classList.add('active');
                fsOverlay.onclick = () => fsOverlay.classList.remove('active');
            };
        }

        // Close
        overlay.querySelector('#closeProjectDetail').onclick = () => {
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        };
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    };

    function renderMyDashboardRealizations() {
        const myRealizationsGrid = document.getElementById('myRealizationsGrid');
        if (!myRealizationsGrid) return;

        myRealizationsGrid.innerHTML = DEFAULT_REALIZATIONS.map((item, idx) => `
            <div class="realization-card" onclick="window.LYANN_openProjectDetail(${idx})">
                <div class="realization-img-wrapper">
                    <img src="${item.coverImg || item.img}" alt="${item.title}" class="realization-img">
                    <span class="realization-tag-city">📍 ${item.city}</span>
                    ${(item.photos && item.photos.length > 1) ? '<span class="realization-photo-count" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);color:white;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:700;"><i class="ph ph-images"></i> ' + item.photos.length + '</span>' : ''}
                </div>
                <div class="realization-info">
                    <h5 class="realization-title">${item.title}</h5>
                    ${item.category ? '<span class="realization-category-pill">' + item.category + '</span>' : ''}
                    <p class="realization-desc">${item.desc}</p>
                </div>
            </div>
        `).join('');

        window._currentProfileRealizations = DEFAULT_REALIZATIONS;
    }

    // Attach profile click events to search results and talents cards
    document.addEventListener('click', (e) => {
        const viewProfileBtn = e.target.closest('.view-member-profile-btn');
        if (viewProfileBtn) {
            const memberId = viewProfileBtn.getAttribute('data-member-id');
            openPublicMemberProfile(memberId);
        }

        const talentCard = e.target.closest('.talent-card');
        if (talentCard && !e.target.closest('a') && !e.target.closest('button')) {
            const memberId = talentCard.getAttribute('data-member-id') || 1;
            openPublicMemberProfile(memberId);
        }
    });

    if (closePublicProfileModalBtn) {
        closePublicProfileModalBtn.addEventListener('click', () => {
            if (publicMemberProfileModal) {
                publicMemberProfileModal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    // Recommend button — 1 recommandation unique par utilisateur (toggle)
    if (recommendMemberBtn) {
        recommendMemberBtn.addEventListener('click', () => {
            if (!currentVisitingMember) return;
            
            // Empêcher de se recommander soi-même (userId simulé = 0)
            const simulatedUserId = 0;
            if (currentVisitingMember.id === simulatedUserId) return;

            const myRecos = JSON.parse(safeStorage.getItem('lyann_my_recommendations') || '[]');
            let currentCount = parseInt(recommendCountBadge.textContent, 10) || 0;

            if (myRecos.includes(currentVisitingMember.id)) {
                // Déjà recommandé → retirer
                myRecos.splice(myRecos.indexOf(currentVisitingMember.id), 1);
                currentCount = Math.max(0, currentCount - 1);
                memberRecommendations[currentVisitingMember.id] = currentCount;
                recommendCountBadge.textContent = currentCount;
                recommendMemberBtn.classList.remove('liked');
            } else {
                // Nouvelle recommandation
                myRecos.push(currentVisitingMember.id);
                currentCount++;
                memberRecommendations[currentVisitingMember.id] = currentCount;
                recommendCountBadge.textContent = currentCount;
                recommendMemberBtn.classList.add('liked');
            }
            safeStorage.setItem('lyann_my_recommendations', JSON.stringify(myRecos));
        });
    }

    // Direct contact from public profile -> Open Live Chat Direct
    if (publicContactBtn) {
        publicContactBtn.addEventListener('click', () => {
            if (currentVisitingMember) {
                if (publicMemberProfileModal) publicMemberProfileModal.classList.remove('active');
                openChatWithUser(currentVisitingMember.name, currentVisitingMember.avatar);
            }
        });
    }

    // Share profile
    if (shareProfileBtn) {
        shareProfileBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (currentVisitingMember) {
                const text = `Découvrez le profil de ${currentVisitingMember.name} (${currentVisitingMember.role}) sur LYANN !`;
                const url = window.location.href;
                const shared = await shareNative("Profil LYANN", text, url);
                if (!shared && navigator.clipboard) {
                    navigator.clipboard.writeText(url);
                    window.lyannAlert(`🔗 Lien du profil de ${currentVisitingMember.name} copié dans votre presse-papier !`);
                }
            }
        });
    }

    // Public tabs switcher
    const publicTabBtns = document.querySelectorAll('.public-tab-btn');
    const publicTabContents = document.querySelectorAll('.public-tab-content');

    publicTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-public-tab');
            publicTabBtns.forEach(b => b.classList.remove('active'));
            publicTabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const targetEl = document.getElementById(targetTab);
            if (targetEl) targetEl.classList.add('active');
        });
    });

    // Add Realization Handlers
    if (openAddRealizationBtn) {
        openAddRealizationBtn.addEventListener('click', () => {
            if (addRealizationModal) {
                addRealizationModal.classList.add('active');
            }
        });
    }

    if (closeAddRealizationModalBtn) {
        closeAddRealizationModalBtn.addEventListener('click', () => {
            if (addRealizationModal) {
                addRealizationModal.classList.remove('active');
            }
        });
    }

    if (triggerFileInputBtn && realizationFileInput) {
        triggerFileInputBtn.addEventListener('click', async (e) => {
            if (isNativePlatform()) {
                e.preventDefault();
                const photo = await getPhotoNative();
                if (photo) {
                    const imgPreview = realizationImagePreview.querySelector('img');
                    if (imgPreview) imgPreview.src = photo;
                    realizationImagePreview.style.display = 'block';
                }
            } else {
                realizationFileInput.click();
            }
        });
    }

    if (realizationFileInput) {
        realizationFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const imgPreview = realizationImagePreview.querySelector('img');
                    if (imgPreview) imgPreview.src = event.target.result;
                    realizationImagePreview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (realizationImageUrl) {
        realizationImageUrl.addEventListener('input', () => {
            const url = realizationImageUrl.value.trim();
            if (url) {
                const imgPreview = realizationImagePreview.querySelector('img');
                if (imgPreview) imgPreview.src = url;
                realizationImagePreview.style.display = 'block';
            }
        });
    }

    if (addRealizationForm) {
        addRealizationForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const title = document.getElementById('realizationTitle')?.value || 'Nouvelle Réalisation';
            const city = document.getElementById('realizationCity')?.value || 'Baie-Mahault';
            const desc = document.getElementById('realizationDesc')?.value || 'Projet réalisé avec soin.';
            const imgPreview = realizationImagePreview.querySelector('img');
            const imgSrc = imgPreview?.src || 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80';

            DEFAULT_REALIZATIONS.unshift({ title, city, img: imgSrc, desc });
            renderMyDashboardRealizations();

            if (addRealizationModal) addRealizationModal.classList.remove('active');
            window.lyannAlert('🎉 Votre réalisation a été publiée avec succès sur votre profil LYANN !');
            addRealizationForm.reset();
            realizationImagePreview.style.display = 'none';
        });
    }

    // ==========================================================================
    // DESTINATION ET INTERACTIONS DE TOUS LES BOUTONS DU SITE
    // ==========================================================================

    // 1. Clic sur les tuiles de catégories -> Redirige vers la page dédiée Recherche results.html
    document.querySelectorAll('.category-card-trigger').forEach(card => {
        card.addEventListener('click', (e) => {
            e.preventDefault();
            const cat = card.getAttribute('data-category');
            if (cat) {
                window.location.href = `results.html?category=${encodeURIComponent(cat)}`;
            }
        });
    });

    // 2. Clic sur les cartes de talents (David, Sarah, Kevin) -> Ouvre le profil public
    document.querySelectorAll('.talent-card-trigger').forEach(card => {
        card.addEventListener('click', (e) => {
            e.preventDefault();
            const memberId = card.getAttribute('data-member-id');
            if (memberId) {
                openPublicMemberProfile(memberId);
            }
        });
    });

    // 3. Gestionnaire FAQ Accordéon
    document.querySelectorAll('.faq-question').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = btn.closest('.faq-item');
            if (item) {
                item.classList.toggle('active');
            }
        });
    });

    // 4. Modales Légales (Confidentialité, Conditions, Contact)
    const privacyModal = document.getElementById('privacyModal');
    const termsModal = document.getElementById('termsModal');
    const contactModal = document.getElementById('contactModal');

    document.querySelectorAll('.open-privacy-trigger').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            if (privacyModal) privacyModal.classList.add('active');
        });
    });

    document.querySelectorAll('.open-terms-trigger').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            if (termsModal) termsModal.classList.add('active');
        });
    });

    document.querySelectorAll('.open-contact-trigger').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            if (contactModal) contactModal.classList.add('active');
        });
    });

    document.getElementById('closePrivacyModalBtn')?.addEventListener('click', () => {
        if (privacyModal) privacyModal.classList.remove('active');
    });

    document.getElementById('closeTermsModalBtn')?.addEventListener('click', () => {
        if (termsModal) termsModal.classList.remove('active');
    });

    document.getElementById('closeContactModalBtn')?.addEventListener('click', () => {
        if (contactModal) contactModal.classList.remove('active');
    });

    // Formulaire de contact
    document.getElementById('contactForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (contactModal) contactModal.classList.remove('active');
        window.lyannAlert('📩 Votre message a été transmis avec succès à l\'équipe LYANN ! Nous vous répondrons sous 24h.');
        e.target.reset();
    });

    // Bouton "Ouvrir les Paramètres Détaillés" dans l'ancien dashboard
    document.getElementById('btnOpenFullSettings')?.addEventListener('click', () => {
        // Ferme l'ancien profileDashboardModal s'il est ouvert
        const oldModal = document.getElementById('profileDashboardModal');
        if (oldModal) oldModal.classList.remove('active');
        // Ouvre le nouveau userAccountModal sur l'onglet Réglages
        if (typeof openAccountTab === 'function') {
            openAccountTab('tab-acc-settings-sec');
        }
    });



    // --- GESTION DE LA MODALE TOUTES LES CATÉGORIES & PROPOSITION D'ACTIVITÉ ---
    const allCategoriesModal = document.getElementById('allCategoriesModal');
    const openAllCategoriesBtn = document.getElementById('openAllCategoriesBtn');
    const closeAllCategoriesModalBtn = document.getElementById('closeAllCategoriesModalBtn');
    const mobileCategorySelect = document.getElementById('mobileCategorySelect');
    const proposeActivityForm = document.getElementById('proposeActivityForm');
    const proposeSuccessMsg = document.getElementById('proposeSuccessMsg');

    if (openAllCategoriesBtn) {
        openAllCategoriesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (allCategoriesModal) allCategoriesModal.classList.add('active');
        });
    }

    if (closeAllCategoriesModalBtn) {
        closeAllCategoriesModalBtn.addEventListener('click', () => {
            if (allCategoriesModal) allCategoriesModal.classList.remove('active');
        });
    }

    // Sélection via le menu déroulant mobile
    if (mobileCategorySelect) {
        mobileCategorySelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (!val) return;

            if (val === 'open-modal-all') {
                if (allCategoriesModal) allCategoriesModal.classList.add('active');
                mobileCategorySelect.value = '';
            } else {
                window.location.href = `results.html?category=${encodeURIComponent(val)}`;
                mobileCategorySelect.value = '';
            }
        });
    }

    // Soumission du formulaire de proposition d'activité
    if (proposeActivityForm) {
        proposeActivityForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const activityInput = document.getElementById('proposeActivityName');
            if (activityInput && activityInput.value.trim()) {
                if (proposeSuccessMsg) {
                    proposeSuccessMsg.style.display = 'flex';
                }
                proposeActivityForm.reset();
                setTimeout(() => {
                    if (proposeSuccessMsg) proposeSuccessMsg.style.display = 'none';
                    if (allCategoriesModal) allCategoriesModal.classList.remove('active');
                }, 3500);
            }
        });
    }

    // --- GESTION DU TOGGLE DE FACTURATION (MENSUEL / ANNUEL -20%) ---
    const billingToggleInput = document.getElementById('billingToggleInput');
    const monthlyBillingLabel = document.getElementById('monthlyBillingLabel');
    const yearlyBillingLabel = document.getElementById('yearlyBillingLabel');
    const priceElements = document.querySelectorAll('.price-val[data-monthly]');

    if (billingToggleInput) {
        billingToggleInput.addEventListener('change', () => {
            const isYearly = billingToggleInput.checked;

            if (monthlyBillingLabel) monthlyBillingLabel.classList.toggle('active', !isYearly);
            if (yearlyBillingLabel) yearlyBillingLabel.classList.toggle('active', isYearly);

            priceElements.forEach(el => {
                const monthlyPrice = el.getAttribute('data-monthly');
                const yearlyPrice = el.getAttribute('data-yearly');
                el.textContent = isYearly ? yearlyPrice : monthlyPrice;
            });
        });
    }

    // ==========================================================================
    // MOTEUR EN DIRECT DU BOKANTAJ (POSTER UN LYANN & ÉCHOS DU QUARTIER)
    // ==========================================================================
    // ==========================================================================
    // MOTEUR EN DIRECT DU BOKANTAJ (POSTER UN LYANN & ÉCHOS DU QUARTIER)
    // ==========================================================================
    let INITIAL_FLASH_POSTS = [
        {
            id: 'flash-1',
            item_type: 'POST',
            author_id: 'mock-1',
            authorName: 'Jocelyn Cabort',
            authorRole: 'Plomberie & Fuites d\'eau',
            authorAvatar: 'jocelyn-cabort.png',
            badge: '⚡ Disponibilité',
            type: 'dispo',
            location: 'Guadeloupe',
            territoryKey: 'guadeloupe',
            timeAgo: 'Il y a 14 min',
            content: 'Disponible aujourd\'hui pour dépannages de plomberie d\'urgence et recherche de fuite sur Baie-Mahault et environs ! 💧🔧',
            images: [],
            likes: 18,
            repliesCount: 4,
            memberId: 200
        },
        {
            id: 'flash-2',
            item_type: 'POST',
            author_id: 'mock-2',
            authorName: 'Hugues Zami',
            authorRole: 'Climatisation & Électricité',
            authorAvatar: 'hugues-zami.png',
            badge: '⭐ Recommandation',
            type: 'reco',
            location: 'Guadeloupe',
            territoryKey: 'guadeloupe',
            timeAgo: 'Il y a 45 min',
            content: 'Entretien préventif clim Inverter et contrôle électrique avant les fortes chaleurs. Devis gratuit sur Les Abymes.',
            images: [],
            likes: 24,
            repliesCount: 6,
            memberId: 201
        }
    ];

    let currentFlashPosts = [];
    let activeFeedTypeFilter = 'all';
    let activeFeedTerritoryFilter = 'all';
    let attachedPhotos = [];
    let attachedVideo = null;
    let bokantajFeedState = 'LOADING'; // 'LOADING' | 'ERROR' | 'EMPTY' | 'READY'

    const flashFeedContainer = document.getElementById('flashFeedContainer');
    const createFlashForm = document.getElementById('createFlashForm');
    const flashContentInput = document.getElementById('flashContentInput');
    const flashCharCount = document.getElementById('flashCharCount');
    const feedTerritoryFilterSelect = document.getElementById('feedTerritoryFilterSelect');
    const feedPills = document.querySelectorAll('.feed-pill');

    const flashPhotoInput = document.getElementById('flashPhotoInput');
    const flashVideoInput = document.getElementById('flashVideoInput');
    const flashMediaPreviewContainer = document.getElementById('flashMediaPreviewContainer');
    const mediaUploadBadge = document.getElementById('mediaUploadBadge');

    window.renderTalentsSidebar = async function(isDemo = false) {
        const container = document.getElementById('topTalentsSidebarContainer');
        if (!container) return;

        if (isDemo) {
            container.innerHTML = `
                <div class="top-talent-item view-member-profile-btn" data-member-id="200">
                    <div class="talent-avatar-sm"><img src="jocelyn-cabort.png" alt="Jocelyn Cabort"></div>
                    <div class="talent-mini-info">
                        <strong>Jocelyn Cabort <i class="ph-fill ph-check-circle" style="color: #4A7C59;"></i></strong>
                        <span>Plomberie & Fuites • Baie-Mahault</span>
                    </div>
                    <span class="mini-score">⭐ 5.0</span>
                </div>
                <div class="top-talent-item view-member-profile-btn" data-member-id="201">
                    <div class="talent-avatar-sm"><img src="hugues-zami.png" alt="Hugues Zami"></div>
                    <div class="talent-mini-info">
                        <strong>Hugues Zami <i class="ph-fill ph-check-circle" style="color: #4A7C59;"></i></strong>
                        <span>Climatisation & Électricité • Les Abymes</span>
                    </div>
                    <span class="mini-score">⭐ 4.9</span>
                </div>
                <div class="top-talent-item view-member-profile-btn" data-member-id="202">
                    <div class="talent-avatar-sm"><img src="murielle-placide.png" alt="Murielle Placide"></div>
                    <div class="talent-mini-info">
                        <strong>Murielle Placide <span class="badge-pro-mini">PRO</span></strong>
                        <span>Ménage & Repassage • Le Gosier</span>
                    </div>
                    <span class="mini-score">⭐ 5.0</span>
                </div>
            `;
            return;
        }

        if (!window.LYANN_API_CLIENT || !window.LYANN_API_CLIENT.supabase) {
            container.innerHTML = '';
            return;
        }

        try {
            const { data: realProfiles, error } = await window.LYANN_API_CLIENT.supabase
                .from('profiles')
                .select('id, first_name, last_name, avatar_url, city, territory, role, primary_activity, rating')
                .limit(3);

            if (error || !realProfiles || realProfiles.length === 0) {
                container.innerHTML = `<p style="font-size: 0.82rem; color: var(--text-muted); padding: 8px 0;">Aucun membre recommandé pour le moment.</p>`;
                return;
            }

            container.innerHTML = realProfiles.map(p => {
                const name = `${p.first_name || 'Lyanneur'} ${p.last_name ? p.last_name.trim().charAt(0) + '.' : ''}`;
                const avatar = p.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.id}`;
                const location = p.city || p.territory || '';

                let displayActivity = p.primary_activity || p.role || '';
                if (typeof displayActivity === 'string' && /^(user|client|admin|system|member|membre)$/i.test(displayActivity.trim())) {
                    displayActivity = '';
                }

                let subText = location;
                if (displayActivity && location) {
                    subText = `${displayActivity} • ${location}`;
                } else if (displayActivity) {
                    subText = displayActivity;
                } else if (!location) {
                    subText = 'Guadeloupe';
                }

                const scoreHTML = (p.rating && !isNaN(p.rating) && Number(p.rating) > 0)
                    ? `<span class="mini-score">⭐ ${Number(p.rating).toFixed(1)}</span>`
                    : '';

                return `
                    <div class="top-talent-item view-member-profile-btn" data-member-id="${p.id}">
                        <div class="talent-avatar-sm"><img src="${avatar}" alt="${name}"></div>
                        <div class="talent-mini-info">
                            <strong>${name} <i class="ph-fill ph-check-circle" style="color: #4A7C59;"></i></strong>
                            <span>${subText}</span>
                        </div>
                        ${scoreHTML}
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.warn("Talents sidebar query error:", e);
            container.innerHTML = '';
        }
    };

    window.loadBokantajFeedFromSupabase = async function() {
        console.log("[BOKANTAJ] init start");
        bokantajFeedState = 'LOADING';
        
        const isExplicitDemoMode = typeof window !== 'undefined' && (
            window.LYANN_FORCE_DEMO_DATA === true ||
            (window.location && window.location.search && (
                window.location.search.includes('demo=true') ||
                window.location.search.includes('dev_fixtures=true')
            ))
        );

        let client = window.LYANN_API_CLIENT;
        if (client && !client.supabase && window.supabase) {
            const _sp = client.supabase;
        }

        if (client && client.supabase) {
            console.log("[BOKANTAJ] supabase ready");
        } else {
            console.warn("[BOKANTAJ] supabase client NOT ready");
        }

        console.log("[BOKANTAJ] load start");
        renderFlashFeed();

        try {
            if (!client || !client.supabase) {
                if (!isExplicitDemoMode) {
                    console.warn("[BOKANTAJ] Supabase client not ready -> ERROR state");
                    bokantajFeedState = 'ERROR';
                    currentFlashPosts = [];
                    return;
                }
                currentFlashPosts = [...INITIAL_FLASH_POSTS];
                bokantajFeedState = 'READY';
                return;
            }

            const { data, error } = await client.getFeed();
            console.log("[BOKANTAJ] getFeed resolved", { error, count: data ? data.length : 0 });
            console.log("[BOKANTAJ] item count", data ? data.length : 0);

            if (error || !data) {
                console.warn("[Bokantaj Feed] Supabase fetch error:", error);
                if (!isExplicitDemoMode) {
                    bokantajFeedState = 'ERROR';
                    currentFlashPosts = [];
                } else {
                    currentFlashPosts = [...INITIAL_FLASH_POSTS];
                    bokantajFeedState = 'READY';
                }
            } else {
                currentFlashPosts = data;
                bokantajFeedState = (data.length === 0) ? 'EMPTY' : 'READY';

                // DEV Logger
                if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || (window.location.search && window.location.search.includes('dev=true')))) {
                    console.log(`[BOKANTAJ FEED DEV LOG] Loaded ${data.length} unified items from SUPABASE:`);
                    data.forEach(item => {
                        console.log(`  - [${item.item_type}] id=${item.id} | source=SUPABASE | location="${item.location}" | territoryKey="${item.territoryKey}" | created_at=${item.created_at}`);
                    });
                }
            }
        } catch (err) {
            console.error("[BOKANTAJ] Error during load:", err);
            if (!isExplicitDemoMode) {
                bokantajFeedState = 'ERROR';
                currentFlashPosts = [];
            } else {
                currentFlashPosts = [...INITIAL_FLASH_POSTS];
                bokantajFeedState = 'READY';
            }
        } finally {
            console.log("[BOKANTAJ] render start");
            renderFlashFeed();
            window.renderTalentsSidebar(isExplicitDemoMode);
            console.log("[BOKANTAJ] loading removed");
        }
    };

    // Initial feed trigger
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.loadBokantajFeedFromSupabase();
        });
    } else {
        window.loadBokantajFeedFromSupabase();
    }

    if (flashPhotoInput) {
        flashPhotoInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files).slice(0, 3);
            attachedPhotos = files.map(file => URL.createObjectURL(file));
            updateMediaPreview();
        });
    }

    if (flashVideoInput) {
        flashVideoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                attachedVideo = URL.createObjectURL(file);
                updateMediaPreview();
            }
        });
    }

    function updateMediaPreview() {
        if (!flashMediaPreviewContainer) return;
        flashMediaPreviewContainer.innerHTML = '';

        if (attachedPhotos.length > 0) {
            if (mediaUploadBadge) {
                mediaUploadBadge.style.display = 'inline';
                mediaUploadBadge.textContent = `📷 ${attachedPhotos.length} photo(s) jointe(s)`;
            }
            attachedPhotos.forEach(src => {
                const img = document.createElement('img');
                img.src = src;
                img.className = 'flash-media-preview-thumb';
                flashMediaPreviewContainer.appendChild(img);
            });
        } else if (attachedVideo) {
            if (mediaUploadBadge) {
                mediaUploadBadge.style.display = 'inline';
                mediaUploadBadge.textContent = `🎥 Vidéo 30s jointe`;
            }
            const vid = document.createElement('video');
            vid.src = attachedVideo;
            vid.className = 'flash-media-preview-thumb';
            vid.controls = true;
            flashMediaPreviewContainer.appendChild(vid);
        } else {
            if (mediaUploadBadge) mediaUploadBadge.style.display = 'none';
        }
    }

    if (flashContentInput && flashCharCount) {
        flashContentInput.addEventListener('input', () => {
            flashCharCount.textContent = flashContentInput.value.length;
        });
    }

    function renderFlashFeed() {
        const feedContainer = document.getElementById('flashFeedContainer');
        if (!feedContainer) {
            console.warn("[BOKANTAJ] feed container NOT found (#flashFeedContainer)");
            return;
        }
        console.log("[BOKANTAJ] feed container found (#flashFeedContainer)");

        if (bokantajFeedState === 'LOADING') {
            feedContainer.innerHTML = `
                <div class="text-center" style="padding: 50px 20px; background: #FFF; border-radius: var(--radius-xl); border: 1.5px solid #E2E8F0;">
                    <i class="ph ph-spinner spinner" style="font-size: 2.2rem; color: var(--primary); margin-bottom: 12px; display: inline-block;"></i>
                    <h4 style="font-weight: 800; font-size: 1.05rem; color: #1E293B; margin-bottom: 4px;">Chargement du Bokantaj…</h4>
                    <p style="color: var(--text-muted); font-size: 0.88rem;">Connexion au réseau communautaire LYANN en cours.</p>
                </div>
            `;
            return;
        }

        if (bokantajFeedState === 'ERROR') {
            feedContainer.innerHTML = `
                <div class="text-center" style="padding: 45px 20px; background: #FFF; border-radius: var(--radius-xl); border: 1.5px dashed #FCA5A5;">
                    <i class="ph ph-warning-circle" style="font-size: 2.5rem; color: #DC2626; margin-bottom: 12px;"></i>
                    <h4 style="font-weight: 800; font-size: 1.1rem; margin-bottom: 6px; color: #1E293B;">Impossible de charger le Bokantaj pour le moment.</h4>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 18px;">Veuillez vérifier votre connexion Supabase ou réessayer plus tard.</p>
                    <button class="btn btn-primary" onclick="window.loadBokantajFeedFromSupabase()" style="font-weight: 700; gap: 6px;">
                        <i class="ph ph-arrows-clockwise"></i> Réessayer
                    </button>
                </div>
            `;
            return;
        }

        if (bokantajFeedState === 'EMPTY') {
            feedContainer.innerHTML = `
                <div class="text-center" style="padding: 50px 20px; background: #FFF; border-radius: var(--radius-xl); border: 1.5px dashed var(--border);">
                    <i class="ph ph-chats-teardrop" style="font-size: 2.5rem; color: var(--primary-light); margin-bottom: 12px;"></i>
                    <h4 style="font-weight: 800; font-size: 1.1rem; margin-bottom: 6px; color: #1E293B;">Le Bokantaj est encore calme…</h4>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Soyez parmi les premiers à partager quelque chose.</p>
                </div>
            `;
            return;
        }

        try {
            let filtered = currentFlashPosts.filter(post => {
                if (!post) return false;
                const pType = post.item_type === 'LYANN' ? 'besoin' : post.type;

                // V2 filter handling
                let matchType = true;
                if (activeFeedTypeFilter === 'post') {
                    matchType = post.item_type === 'POST';
                } else if (activeFeedTypeFilter === 'lyann') {
                    matchType = post.item_type === 'LYANN';
                } else if (activeFeedTypeFilter === 'dispo' || activeFeedTypeFilter === 'besoin' || activeFeedTypeFilter === 'reco' || activeFeedTypeFilter === 'info') {
                    matchType = pType === activeFeedTypeFilter;
                }

                const matchTerritory = activeFeedTerritoryFilter === 'all' || (post.territoryKey && post.territoryKey.includes(activeFeedTerritoryFilter)) || activeFeedTerritoryFilter === post.territoryKey;
                
                // Step 14 Safety Filter: Exclude content from blocked users safely (browser compatible)
                const activeUserId = window.CURRENT_USER_ID || window.LYANN_CURRENT_USER?.id;
                const safetyEngine = (typeof window !== 'undefined' ? window.LyannSafetyEngine : (typeof globalThis !== 'undefined' ? globalThis.LyannSafetyEngine : null));
                if (activeUserId && safetyEngine && typeof safetyEngine.isUserBlocked === 'function') {
                    const authorId = post.author_id || post.memberId;
                    if (authorId && safetyEngine.isUserBlocked(activeUserId, authorId)) {
                        return false;
                    }
                }
                return matchType && matchTerritory;
            });

            if (filtered.length === 0) {
                feedContainer.innerHTML = `
                    <div class="text-center" style="padding: 40px 20px; background: #FFF; border-radius: var(--radius-xl); border: 1.5px dashed var(--border);">
                        <i class="ph ph-funnel" style="font-size: 2.2rem; color: var(--text-muted); margin-bottom: 10px;"></i>
                        <h4 style="font-weight: 800; font-size: 1.05rem; margin-bottom: 4px; color: #1E293B;">Aucun contenu pour les filtres sélectionnés</h4>
                        <p style="color: var(--text-muted); font-size: 0.88rem;">Essayez de modifier votre territoire ou type de publication.</p>
                    </div>
                `;
                console.log("[BOKANTAJ] render complete (0 filtered items)");
                return;
            }

            const safeMembers = window.LYANN_MEMBERS || [];
            function safeMentions(text) {
                if (!text) return '';
                return String(text).replace(/@([A-Za-z0-9_À-ÿ-]+)/g, (match, username) => {
                    const cleanName = username.replace(/_/g, ' ');
                    const matched = safeMembers.find(m => m && m.name && m.name.toLowerCase().includes(cleanName.toLowerCase()));
                    const memberId = matched ? matched.id : 1;
                    return `<a href="#" class="user-mention-tag trigger-quick-profile" data-member-id="${memberId}">${match}</a>`;
                });
            }

            const currentAuthUserId = window.CURRENT_USER_ID || window.LYANN_CURRENT_USER?.id;

            // Fault Isolation: Individual item render with try/catch
            feedContainer.innerHTML = filtered.map((post, postIdx) => {
                try {
                    console.debug('[BOKANTAJ ITEM]', {
                        index: postIdx,
                        id: post?.id,
                        item_type: post?.item_type
                    });

                    const isLyann = post.item_type === 'LYANN' || post.type === 'lyann';
                    const targetType = isLyann ? 'LYANN' : 'POST';
                    const targetId = post.request_id || post.id || '';
                    const authorId = post.author_id || post.memberId || '';
                    const isOwnLyann = isLyann && currentAuthUserId && (authorId === currentAuthUserId);
                    
                    let mediaHTML = '';
                    if (post.images && Array.isArray(post.images) && post.images.length > 0) {
                        mediaHTML = `<div class="flash-media-box" style="margin-top: 10px; border-radius: 12px; overflow: hidden;"><img src="${post.images[0]}" alt="Media Post" class="flash-media-img" style="max-height: 320px; width: 100%; object-fit: cover;"></div>`;
                    } else if (post.image) {
                        mediaHTML = `<div class="flash-media-box" style="margin-top: 10px; border-radius: 12px; overflow: hidden;"><img src="${post.image}" alt="Media Post" class="flash-media-img" style="max-height: 320px; width: 100%; object-fit: cover;"></div>`;
                    }

                    let actionBtnHTML = '';
                    if (isLyann) {
                        if (isOwnLyann) {
                            actionBtnHTML = `<button class="flash-action-btn btn-open-lyann-detail" data-request-id="${targetId}" style="background: rgba(74, 124, 89, 0.12); color: #2D5A39; font-weight: 800; border-radius: 20px; min-height: 40px;"><i class="ph ph-sliders"></i> <span>Voir / Gérer</span></button>`;
                        } else {
                            actionBtnHTML = `
                                <button class="flash-action-btn btn-open-lyann-detail" data-request-id="${targetId}" style="background: #F1F5F9; color: #334155; font-weight: 700; border-radius: 20px; min-height: 40px;"><i class="ph ph-eye"></i> <span>Voir le Lyann</span></button>
                                <button class="flash-action-btn btn-help-lyann" data-request-id="${targetId}" data-requester-id="${authorId}" data-requester-name="${(post.author_name || post.authorName || '').replace(/"/g, '&quot;')}" data-requester-avatar="${post.author_avatar || post.authorAvatar || ''}" data-title="${(post.title || post.content || '').replace(/"/g, '&quot;')}" style="background: var(--primary); color: #FFF; font-weight: 800; border-radius: 20px; min-height: 40px;"><i class="ph ph-hand-heart"></i> <span>Je peux aider</span></button>
                            `;
                        }
                    } else {
                        actionBtnHTML = '';
                    }

                    const userHasLiked = !!post.user_has_liked;
                    const displayLikes = post.likes || 0;
                    
                    // Clean category badge
                    let cleanCat = (post.category || 'Demande').trim();
                    if (cleanCat.includes(' - ')) cleanCat = cleanCat.split(' - ')[0].trim();
                    if (cleanCat.includes(' — ')) cleanCat = cleanCat.split(' — ')[0].trim();
                    if (cleanCat.includes(' > ')) cleanCat = cleanCat.split(' > ')[0].trim();

                    const badgeText = isLyann ? `LYANN · ${cleanCat}` : (post.badge || 'PUBLICATION');
                    
                    let authorDisplayName = post.author_name || post.authorName;
                    if ((!authorDisplayName || authorDisplayName === 'Lyanneur' || isUUID(authorDisplayName)) && authorId && isUUID(authorId) && window.LYANN_PROFILES_CACHE && window.LYANN_PROFILES_CACHE[authorId]) {
                        authorDisplayName = window.LYANN_PROFILES_CACHE[authorId].displayName;
                    }
                    if (!authorDisplayName || isUUID(authorDisplayName)) authorDisplayName = 'Lyanneur';

                    const locationText = post.author_city || post.location || 'Guadeloupe';
                    const timeAgoText = post.created_at ? new Date(post.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : (post.timeAgo || 'Récemment');
                    
                    const rawTitle = (post.title || '').trim();
                    const rawContent = (post.content || '').trim();
                    const isTitleTaxonomy = isLyann && (rawTitle.includes(' - ') || rawTitle.includes(' — ') || rawTitle === post.category || (rawTitle.length > 45 && rawTitle.includes('&')));
                    
                    let cardHeadline = '';
                    let cardBody = '';

                    if (isLyann) {
                        if (rawTitle && !isTitleTaxonomy && rawTitle !== rawContent) {
                            cardHeadline = rawTitle;
                            cardBody = rawContent;
                        } else {
                            cardHeadline = rawContent || rawTitle || 'Besoin d\'aide';
                            cardBody = (rawTitle && !isTitleTaxonomy && rawTitle !== cardHeadline) ? rawTitle : '';
                        }
                    } else {
                        cardHeadline = rawTitle;
                        cardBody = rawContent;
                    }

                    const cardTitleHTML = cardHeadline ? `<div class="lyann-card-title" style="font-family: 'Outfit', 'Plus Jakarta Sans', sans-serif; font-weight: 650; font-size: 1.15rem; color: #17231C; line-height: 1.3; letter-spacing: -0.015em; margin-bottom: 4px; word-break: break-word;">${cardHeadline}</div>` : '';
                    const cardBodyHTML = cardBody ? `<div class="lyann-card-description" style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 450; font-size: 0.95rem; color: #334155; line-height: 1.5; word-break: break-word; margin-top: 2px;">${safeMentions(cardBody)}</div>` : '';
                    const budgetHTML = (isLyann && post.budget) ? ` · Budget : ${post.budget} €` : '';

                    let hasBodyContent = cardHeadline || cardBody || mediaHTML;
                    let bodyBlockHTML = hasBodyContent ? `<div class="flash-card-body" style="margin-top: 6px; margin-bottom: 8px; width: 100%; box-sizing: border-box;">${cardTitleHTML}${cardBodyHTML}${mediaHTML}</div>` : '';

                    let ctaRowHTML = '';

                    if (isLyann) {
                        const viewLabel = isOwnLyann ? 'Gérer' : 'Voir';
                        const viewIcon = isOwnLyann ? 'ph-sliders' : 'ph-eye';
                        
                        const secondaryCtaHTML = `<button class="flash-action-btn btn-open-lyann-detail lyann-cta-secondary" data-request-id="${targetId}"><i class="ph ${viewIcon}"></i> <span>${viewLabel}</span></button>`;
                        
                        if (!isOwnLyann) {
                            const primaryCtaHTML = `<button class="flash-action-btn btn-help-lyann lyann-cta-primary" data-request-id="${targetId}" data-requester-id="${authorId}" data-requester-name="${authorDisplayName.replace(/"/g, '&quot;')}" data-requester-avatar="${post.author_avatar || post.authorAvatar || ''}" data-title="${(post.title || post.content || '').replace(/"/g, '&quot;')}"><i class="ph ph-hand-heart"></i> <span>Je peux aider</span></button>`;
                            
                            ctaRowHTML = `
                                <div class="lyann-cta-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; box-sizing: border-box; margin-top: 8px;">
                                    ${secondaryCtaHTML}
                                    ${primaryCtaHTML}
                                </div>
                            `;
                        } else {
                            ctaRowHTML = `
                                <div class="lyann-cta-row" style="display: grid; grid-template-columns: 1fr; width: 100%; box-sizing: border-box; margin-top: 8px;">
                                    ${secondaryCtaHTML}
                                </div>
                            `;
                        }
                    }

                    return `
                        <div class="flash-card ${isLyann ? 'lyann-card' : ''}" id="${post.id || ''}" style="${isLyann ? 'background: #FAF7F2; border-radius: 20px; padding: 12px 14px; margin-bottom: 10px; border: 1px solid rgba(74, 124, 89, 0.18); box-shadow: 0 2px 8px rgba(0,0,0,0.02); width: 100%; max-width: 100%; box-sizing: border-box; overflow: hidden;' : 'background: #FFFFFF; border-radius: 20px; padding: 12px 14px; margin-bottom: 10px; border: 1px solid #E2E8F0; box-shadow: 0 2px 8px rgba(0,0,0,0.02); width: 100%; max-width: 100%; box-sizing: border-box; overflow: hidden;'}">
                            <!-- HEADER NORMAL FLOW: IDENTITY (ROW 1) + CATEGORY BADGE (ROW 2) FOR ZERO OVERFLOW -->
                            <div class="flash-card-header" style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; width: 100%; box-sizing: border-box;">
                                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; box-sizing: border-box;">
                                    <div class="flash-author-block trigger-quick-profile" data-member-id="${authorId}" style="cursor: pointer; display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                                        <img src="${post.author_avatar || post.authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${authorId}`}" alt="${authorDisplayName}" class="flash-avatar" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">
                                        <div class="flash-author-info" style="line-height: 1.25; min-width: 0; flex: 1;">
                                            <strong class="lyann-author-name" style="font-family: 'Plus Jakarta Sans', sans-serif; color: #17231C; font-size: 0.98rem; font-weight: 600; display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${authorDisplayName} <i class="ph-fill ph-check-circle" style="color: #4A7C59; font-size: 0.82rem; flex-shrink: 0;"></i></strong>
                                            <span class="lyann-author-meta" style="display: block; font-size: 0.76rem; font-weight: 500; color: #64748B; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><i class="ph ph-map-pin" style="font-size: 0.74rem;"></i> ${locationText} · ${timeAgoText}${budgetHTML}</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="flash-meta-badges" style="display: flex; align-items: center; width: 100%; box-sizing: border-box; margin-top: 2px;">
                                    <span class="flash-badge-default" style="${isLyann ? 'background: rgba(74, 124, 89, 0.12); color: #1F3827; font-weight: 700; padding: 3px 10px; border-radius: 12px; font-size: 0.72rem; text-transform: uppercase; display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box; letter-spacing: 0.02em;' : 'background: #F1F5F9; color: #475569; font-weight: 600; padding: 3px 10px; border-radius: 12px; font-size: 0.72rem; display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box;'}">${badgeText}</span>
                                </div>
                            </div>

                            <!-- BODY BLOCK: HERO TITLE & CONTENT (CONDITIONNEL, SANS GAP SI VIDE) -->
                            ${bodyBlockHTML}

                            <!-- FOOTER / ACTIONS ROW: SOCIAL ROW (L1) + METIER CTA ROW (L2) -->
                            <div class="flash-card-footer" style="display: flex; flex-direction: column; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,0,0,0.06); width: 100%; box-sizing: border-box;">
                                <!-- L1: SOCIAL ROW (DISCRÈTE, LÉGÈRE, SANS BOUTON VOIR) -->
                                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; box-sizing: border-box;">
                                    <div class="flash-actions-bar" style="display: flex; align-items: center; gap: 16px; min-width: 0; width: 100%;">
                                        <button class="flash-action-btn btn-like-flash ${userHasLiked ? 'liked' : ''}" data-target-id="${targetId}" data-target-type="${targetType}" style="background: none; border: none; color: ${userHasLiked ? '#E76F51' : '#64748B'}; font-weight: 700; font-size: 0.82rem; cursor: pointer; padding: 2px 0; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;">
                                            <i class="ph-fill ph-heart" style="color: ${userHasLiked ? '#E76F51' : '#94A3B8'}; font-size: 1.05rem;"></i> <span class="like-count">${displayLikes} J'aime</span>
                                        </button>
                                        <button class="flash-action-btn btn-comments-toggle" data-target-id="${targetId}" data-target-type="${targetType}" style="background: none; border: none; color: #64748B; font-weight: 700; font-size: 0.82rem; cursor: pointer; padding: 2px 0; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;">
                                            <i class="ph ph-chat-circle" style="font-size: 1.05rem;"></i> <span class="comments-count-label">Commenter ${(post.comments_count || 0) > 0 ? `(${post.comments_count})` : ''}</span>
                                        </button>
                                        <button class="flash-action-btn btn-share-post" data-target-id="${targetId}" data-title="${(post.title || post.content || '').replace(/"/g, '&quot;')}" style="background: none; border: none; color: #64748B; font-weight: 700; font-size: 0.82rem; cursor: pointer; padding: 2px 0; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;">
                                            <i class="ph ph-share-network" style="font-size: 1.05rem;"></i> <span>Partager</span>
                                        </button>
                                    </div>
                                </div>

                                <!-- L2: METIER CTA ROW (2 EQUAL WIDTH BUTTONS: VOIR + JE PEUX AIDER) -->
                                ${ctaRowHTML}
                            </div>


                            <div class="comments-drawer" id="comments-drawer-${targetId}" style="display: none; padding: 10px 12px; border-top: 1px solid #E2E8F0; background: #F8FAFC; border-bottom-left-radius: 14px; border-bottom-right-radius: 14px; margin-top: 8px; width: 100%; box-sizing: border-box;">
                                <div class="comments-list" id="comments-list-${targetId}" style="margin-bottom: 8px; display: flex; flex-direction: column; gap: 8px;">
                                    <div style="font-size: 0.82rem; color: #64748B; text-align: center;"><i class="ph ph-spinner spin"></i> Chargement des commentaires...</div>
                                </div>
                                <div class="comment-input-row" style="display: flex; gap: 6px;">
                                    <input type="text" class="input-field comment-text-input" id="comment-input-${targetId}" placeholder="Écrire un commentaire..." style="font-size: 0.85rem; padding: 6px 12px; border-radius: 18px; border: 1px solid #CBD5E1; flex: 1;">
                                    <button type="button" class="btn btn-primary btn-send-comment" data-target-id="${targetId}" data-target-type="${targetType}" style="padding: 6px 12px; border-radius: 18px; font-weight: 700; font-size: 0.82rem; min-height: 36px;">
                                        <i class="ph ph-paper-plane-right"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                } catch (itemErr) {
                    console.error(`[BOKANTAJ ITEM RENDER CRASH] Item #${postIdx} (id: ${post?.id}) failed:`, itemErr);
                    console.error(`[BOKANTAJ ITEM STACK]`, itemErr?.stack);
                    return '';
                }
            }).join('');

            attachFlashFeedListeners();
            console.log(`[BOKANTAJ] render complete (${filtered.length} items rendered)`);
        } catch (renderErr) {
            console.error('[BOKANTAJ RENDER FATAL]', renderErr);
            console.error('[BOKANTAJ RENDER STACK]', renderErr?.stack);
            feedContainer.innerHTML = `
                <div class="text-center" style="padding: 40px 20px; background: #FFF; border-radius: var(--radius-xl); border: 1.5px dashed #FCA5A5;">
                    <i class="ph ph-warning-circle" style="font-size: 2.2rem; color: #DC2626; margin-bottom: 10px;"></i>
                    <h4 style="font-weight: 800; font-size: 1.05rem; color: #1E293B; margin-bottom: 4px;">Erreur lors de l'affichage du feed</h4>
                    <p style="color: var(--text-muted); font-size: 0.88rem;">Veuillez rafraîchir la page ou modifier vos filtres.</p>
                </div>
            `;
        }
    }

    function attachFlashFeedListeners() {
        // Real Supabase Likes
        document.querySelectorAll('.btn-like-flash').forEach(btn => {
            if (btn.dataset.listenersBound === 'true') return;
            btn.dataset.listenersBound = 'true';
            btn.addEventListener('click', async () => {
                const targetId = btn.dataset.targetId;
                const targetType = btn.dataset.targetType || 'POST';
                if (!targetId || !window.LYANN_API_CLIENT) return;

                const res = await window.LYANN_API_CLIENT.toggleLike(targetId, targetType);
                const countSpan = btn.querySelector('.like-count');
                if (countSpan) countSpan.textContent = res.likesCount;
                if (res.liked) {
                    btn.classList.add('liked');
                    btn.style.background = 'rgba(231, 111, 81, 0.12)';
                    btn.style.borderColor = '#E76F51';
                    btn.style.color = '#E76F51';
                } else {
                    btn.classList.remove('liked');
                    btn.style.background = '#FFF';
                    btn.style.borderColor = '#E2E8F0';
                    btn.style.color = '#475569';
                }
            });
        });

        // Comments Drawer Toggle & Fetch
        document.querySelectorAll('.btn-comments-toggle').forEach(btn => {
            if (btn.dataset.listenersBound === 'true') return;
            btn.dataset.listenersBound = 'true';
            btn.addEventListener('click', async () => {
                const targetId = btn.dataset.targetId;
                const targetType = btn.dataset.targetType || 'POST';
                const drawer = document.getElementById(`comments-drawer-${targetId}`);
                if (!drawer) return;

                const isHidden = drawer.style.display === 'none';
                drawer.style.display = isHidden ? 'block' : 'none';

                if (isHidden && window.LYANN_API_CLIENT) {
                    const listEl = document.getElementById(`comments-list-${targetId}`);
                    if (!listEl) return;

                    const comments = await window.LYANN_API_CLIENT.getComments(targetId, targetType);
                    function renderCommentItems(cmts) {
                        if (cmts.length === 0) {
                            return `<div style="font-size: 0.84rem; color: #94A3B8; text-align: center; padding: 6px 0;">Aucun commentaire pour le moment. Soyez le premier à répondre !</div>`;
                        }
                        return cmts.map(c => {
                            const author = c.profiles;
                            const name = author ? `${author.first_name || 'Lyanneur'} ${(author.last_name || '').charAt(0)}.` : 'Lyanneur';
                            const avatar = author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.author_id}`;
                            const date = new Date(c.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                            const isChild = !!c.parent_comment_id;
                            return `
                                <div class="comment-item-row" style="display: flex; gap: 10px; font-size: 0.86rem; background: #FFF; padding: 8px 12px; border-radius: 12px; border: 1px solid #E2E8F0; ${isChild ? 'margin-left: 20px; border-left: 3px solid var(--primary);' : ''}">
                                    <img src="${avatar}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">
                                    <div style="flex: 1;">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <strong style="color: #1E2822;">${escapeSearchHtml(name)}</strong>
                                            <span style="font-size: 0.75rem; color: #94A3B8;">${date}</span>
                                        </div>
                                        <div style="color: #334155; margin-top: 2px;">${escapeSearchHtml(c.content)}</div>
                                        <div style="margin-top: 4px; display: flex; align-items: center; gap: 12px;">
                                            <button type="button" class="btn-reply-comment" data-comment-id="${c.id}" data-target-id="${targetId}" data-author-name="${escapeSearchHtml(name)}" style="background: none; border: none; padding: 0; color: #4A7C59; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                                                <i class="ph ph-arrow-u-up-left"></i> Répondre
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('');
                    }

                    listEl.innerHTML = renderCommentItems(comments);
                }
            });
        });

        // Comment Level Reply Trigger Delegator
        if (!window.commentReplyDelegatorBound) {
            window.commentReplyDelegatorBound = true;
            document.addEventListener('click', (e) => {
                const replyBtn = e.target.closest('.btn-reply-comment');
                if (replyBtn) {
                    e.preventDefault();
                    const commentId = replyBtn.dataset.commentId;
                    const targetId = replyBtn.dataset.targetId;
                    const authorName = replyBtn.dataset.authorName;
                    const input = document.getElementById(`comment-input-${targetId}`);
                    if (input) {
                        input.dataset.parentCommentId = commentId;
                        if (!input.value.startsWith(`@${authorName}`)) {
                            input.value = `@${authorName} ` + input.value.replace(/^@[^ ]+\s*/, '');
                        }
                        input.focus();
                    }
                }
            });
        }

        // Send Comment Submit
        document.querySelectorAll('.btn-send-comment').forEach(btn => {
            if (btn.dataset.listenersBound === 'true') return;
            btn.dataset.listenersBound = 'true';
            btn.addEventListener('click', async () => {
                const targetId = btn.dataset.targetId;
                const targetType = btn.dataset.targetType || 'POST';
                const input = document.getElementById(`comment-input-${targetId}`);
                const content = input ? input.value.trim() : '';
                const parentCommentId = input ? (input.dataset.parentCommentId || null) : null;

                if (!content || !window.LYANN_API_CLIENT) return;

                btn.disabled = true;
                try {
                    await window.LYANN_API_CLIENT.addComment({ targetId, targetType, content, parentCommentId });
                    input.value = '';
                    if (input.dataset.parentCommentId) delete input.dataset.parentCommentId;

                    // Refresh comments list
                    const listEl = document.getElementById(`comments-list-${targetId}`);
                    const comments = await window.LYANN_API_CLIENT.getComments(targetId, targetType);
                    const toggleBtnLabel = document.querySelector(`.btn-comments-toggle[data-target-id="${targetId}"] .comments-count-label`);
                    if (toggleBtnLabel) {
                        toggleBtnLabel.textContent = comments.length > 0 ? `Commenter (${comments.length})` : 'Commenter';
                    }
                    if (listEl) {
                        listEl.innerHTML = comments.map(c => {
                            const author = c.profiles;
                            const name = author ? `${author.first_name || 'Lyanneur'} ${(author.last_name || '').charAt(0)}.` : 'Lyanneur';
                            const avatar = author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.author_id}`;
                            const date = new Date(c.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                            const isChild = !!c.parent_comment_id;
                            return `
                                <div class="comment-item-row" style="display: flex; gap: 10px; font-size: 0.86rem; background: #FFF; padding: 8px 12px; border-radius: 12px; border: 1px solid #E2E8F0; ${isChild ? 'margin-left: 20px; border-left: 3px solid var(--primary);' : ''}">
                                    <img src="${avatar}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;">
                                    <div style="flex: 1;">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <strong style="color: #1E2822;">${escapeSearchHtml(name)}</strong>
                                            <span style="font-size: 0.75rem; color: #94A3B8;">${date}</span>
                                        </div>
                                        <div style="color: #334155; margin-top: 2px;">${escapeSearchHtml(c.content)}</div>
                                        <div style="margin-top: 4px; display: flex; align-items: center; gap: 12px;">
                                            <button type="button" class="btn-reply-comment" data-comment-id="${c.id}" data-target-id="${targetId}" data-author-name="${escapeSearchHtml(name)}" style="background: none; border: none; padding: 0; color: #4A7C59; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                                                <i class="ph ph-arrow-u-up-left"></i> Répondre
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('');
                    }
                } catch (err) {
                    if (window.NotificationService) {
                        window.NotificationService.showToast('warning', err.message || "Impossible d'envoyer le commentaire.");
                    }
                } finally {
                    btn.disabled = false;
                }
            });
        });

        // Share Action
        document.querySelectorAll('.btn-share-post').forEach(btn => {
            if (btn.dataset.listenersBound === 'true') return;
            btn.dataset.listenersBound = 'true';
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.targetId;
                const title = btn.dataset.title || 'Bokantaj LYANN';
                const isLyannCard = btn.closest('.flash-card')?.classList.contains('lyann-card');
                const paramName = isLyannCard ? 'request' : 'post';
                const shareUrl = `${window.location.origin}/feed.html?${paramName}=${targetId}`;

                if (navigator.share) {
                    navigator.share({ title: title, text: `Découvrez cette publication sur Bokantaj LYANN :`, url: shareUrl }).catch(() => {});
                } else {
                    navigator.clipboard.writeText(shareUrl).then(() => {
                        if (window.NotificationService) {
                            window.NotificationService.showToast('success', "Lien copié dans le presse-papier !");
                        }
                    }).catch(() => {
                        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(title + ' ' + shareUrl)}`, '_blank');
                    });
                }
            });
        });

        document.querySelectorAll('.btn-open-lyann-detail').forEach(btn => {
            if (btn.dataset.listenersBound === 'true') return;
            btn.dataset.listenersBound = 'true';
            btn.addEventListener('click', () => {
                const reqId = btn.dataset.requestId;
                if (reqId && typeof window.openLyannDetailModal === 'function') {
                    window.openLyannDetailModal(reqId);
                }
            });
        });

        document.querySelectorAll('.btn-help-lyann').forEach(btn => {
            if (btn.dataset.listenersBound === 'true') return;
            btn.dataset.listenersBound = 'true';
            btn.addEventListener('click', () => {
                const reqId = btn.dataset.requestId;
                const requesterId = btn.dataset.requesterId;
                const requesterName = btn.dataset.requesterName || 'Lyanneur';
                const requesterAvatar = btn.dataset.requesterAvatar || 'david-34.png';
                const title = btn.dataset.title || 'Lyann d\'entraide';

                const currentAuthUserId = window.CURRENT_USER_ID || window.LYANN_CURRENT_USER?.id || window.LYANN_API_CLIENT?.getCurrentUserId?.();
                if (!currentAuthUserId) {
                    try {
                        sessionStorage.setItem('pending_lyann_help', JSON.stringify({ reqId, requesterId, requesterName, requesterAvatar, title }));
                    } catch(e) {}
                    const loginModal = document.getElementById('loginModal');
                    if (loginModal) loginModal.classList.add('active');
                    return;
                }

                const myId = currentAuthUserId;
                const initialNeed = { requestId: reqId, requesterId, helperId: myId, title };

                if (typeof window.openChatWithUser === 'function') {
                    window.openChatWithUser(requesterName, requesterAvatar, requesterId, initialNeed);
                }
            });
        });

        document.querySelectorAll('.btn-open-chat-direct').forEach(btn => {
            if (btn.dataset.listenersBound === 'true') return;
            btn.dataset.listenersBound = 'true';
            btn.addEventListener('click', () => {
                const name = btn.dataset.memberName || 'Lyanneur';
                const avatar = btn.dataset.memberAvatar || 'david-34.png';
                const postType = btn.dataset.postType;
                const postTitle = btn.dataset.postTitle;

                let initialNeed = null;
                if (postType === 'besoin') {
                    initialNeed = { requesterId: name, helperId: getMyId(), title: postTitle || "Besoin d'entraide" };
                } else if (postType === 'dispo') {
                    initialNeed = { requesterId: getMyId(), helperId: name, title: postTitle || "Proposition de service" };
                }
                openChatWithUser(name, avatar, name, initialNeed);
            });
        });

        document.querySelectorAll('.trigger-quick-profile').forEach(element => {
            if (element.dataset.listenersBound === 'true') return;
            element.dataset.listenersBound = 'true';
            element.addEventListener('click', () => {
                const memberId = element.dataset.memberId;
                if (memberId && typeof openQuickProfileModal === 'function') {
                    openQuickProfileModal(memberId);
                }
            });
        });
    }

    if (createFlashForm) {
        createFlashForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = flashContentInput ? flashContentInput.value.trim() : '';
            const type = document.getElementById('flashTypeSelect')?.value || 'dispo';
            const location = document.getElementById('flashTerritorySelect')?.value || 'Guadeloupe (971)';

            if (!text && attachedPhotos.length === 0 && !attachedVideo) {
                window.lyannAlert('Veuillez écrire un message ou ajouter une photo/vidéo à votre Lyann.');
                return;
            }

            let territoryKey = 'guadeloupe';
            if (location.includes('Martinique')) territoryKey = 'martinique';
            else if (location.includes('Guyane')) territoryKey = 'guyane';
            else if (location.includes('Réunion')) territoryKey = 'reunion';

            const submitBtn = createFlashForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="ph ph-spinner spin"></i> Publication...';
            }

            try {
                if (window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.createPost === 'function') {
                    await window.LYANN_API_CLIENT.createPost({
                        content: text,
                        type: type,
                        territory: territoryKey,
                        city: location,
                        media_urls: attachedPhotos
                    });
                }

                attachedPhotos = [];
                attachedVideo = null;
                if (flashMediaPreviewContainer) flashMediaPreviewContainer.innerHTML = '';
                if (mediaUploadBadge) mediaUploadBadge.style.display = 'none';

                if (typeof window.loadBokantajFeedFromSupabase === 'function') {
                    await window.loadBokantajFeedFromSupabase();
                }

                createFlashForm.reset();
                if (flashCharCount) flashCharCount.textContent = '0';
                if (window.NotificationService) {
                    window.NotificationService.showToast('success', "✨ Votre publication a été enregistrée dans Bokantaj !");
                }
            } catch (err) {
                if (window.NotificationService) {
                    window.NotificationService.showToast('warning', err.message || "Veuillez vous connecter pour publier.");
                }
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'Publier dans Bokantaj <i class="ph ph-paper-plane-right"></i>';
                }
            }
        });
    }

    const btnComposerNeedShortcut = document.getElementById('btnComposerNeedShortcut');
    if (btnComposerNeedShortcut) {
        btnComposerNeedShortcut.addEventListener('click', (e) => {
            e.preventDefault();
            const modalRequestHelp = document.getElementById('modal-request-help');
            if (modalRequestHelp) {
                modalRequestHelp.classList.add('active');
                document.body.style.overflow = 'hidden';
                if (typeof window.showWizardStep === 'function') {
                    window.showWizardStep(1);
                }
            }
        });
    }

    // LOGIQUE DU DOSSIER FILTRES BOKANTAJ (SINGLE ROW)
    const feedFilterFolderBtn = document.getElementById('feedFilterFolderBtn');
    const feedFilterDropdownMenu = document.getElementById('feedFilterDropdownMenu');
    const feedFilterFolderWrapper = document.getElementById('feedFilterFolderWrapper');
    const feedActiveFilterBadge = document.getElementById('feedActiveFilterBadge');
    const filterDropdownItems = document.querySelectorAll('.filter-dropdown-item');

    if (feedFilterFolderBtn && feedFilterDropdownMenu) {
        feedFilterFolderBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            feedFilterDropdownMenu.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (feedFilterFolderWrapper && !feedFilterFolderWrapper.contains(e.target)) {
                feedFilterDropdownMenu.classList.remove('active');
            }
        });
    }

    filterDropdownItems.forEach(item => {
        item.addEventListener('click', () => {
            filterDropdownItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            activeFeedTypeFilter = item.dataset.filterType;
            
            const titleEl = item.querySelector('strong');
            if (feedActiveFilterBadge && titleEl) {
                feedActiveFilterBadge.textContent = titleEl.textContent;
            }
            
            if (feedFilterDropdownMenu) {
                feedFilterDropdownMenu.classList.remove('active');
            }

            renderFlashFeed();
        });
    });

    if (feedTerritoryFilterSelect) {
        feedTerritoryFilterSelect.addEventListener('change', (e) => {
            activeFeedTerritoryFilter = e.target.value;
            renderFlashFeed();
        });
    }

    // === BOKANTAJ FILTER BOTTOM SHEET & COMPACT PILLS LOGIC (MOBILE UX POLISH V2) ===
    const btnOpenFilterSheet = document.getElementById('btnOpenBokantajFilterSheet');
    const filterSheetModal = document.getElementById('bokantajFilterSheetModal');
    const closeFilterSheetBtn = document.getElementById('closeBokantajFilterSheetBtn');
    const btnApplySheetFilters = document.getElementById('btnApplyBokantajSheetFilters');
    const btnResetSheetFilters = document.getElementById('btnResetBokantajSheetFilters');
    const sheetNearbyToggle = document.getElementById('sheetNearbyToggle');

    // 1. Open Filter Sheet
    if (btnOpenFilterSheet && filterSheetModal) {
        btnOpenFilterSheet.addEventListener('click', (e) => {
            e.preventDefault();
            filterSheetModal.classList.add('active');
            filterSheetModal.style.display = 'flex';
            document.body.classList.add('sheet-open');
        });
    }

    // 2. Close Filter Sheet
    if (closeFilterSheetBtn && filterSheetModal) {
        const closeSheet = () => {
            filterSheetModal.classList.remove('active');
            filterSheetModal.style.display = 'none';
            document.body.classList.remove('sheet-open');
        };
        closeFilterSheetBtn.addEventListener('click', closeSheet);
        filterSheetModal.addEventListener('click', (e) => {
            if (e.target === filterSheetModal) closeSheet();
        });
    }

    // 3. Sheet Type Buttons Toggle
    const sheetTypeBtns = document.querySelectorAll('.sheet-type-btn');
    sheetTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sheetTypeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // 4. Sheet Topic Tags Toggle
    const sheetTopicTags = document.querySelectorAll('.sheet-topic-tag');
    sheetTopicTags.forEach(tag => {
        tag.addEventListener('click', () => {
            tag.classList.toggle('active');
        });
    });

    // 5. Apply Sheet Filters
    if (btnApplySheetFilters) {
        btnApplySheetFilters.addEventListener('click', () => {
            // Apply selected type
            const activeTypeBtn = document.querySelector('.sheet-type-btn.active');
            if (activeTypeBtn) {
                activeFeedTypeFilter = activeTypeBtn.dataset.type || 'all';
                // Sync row 1 segment buttons
                document.querySelectorAll('.bokantaj-segment-group .feed-pill').forEach(btn => {
                    if (btn.dataset.filterV2 === activeFeedTypeFilter) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
            }

            // Apply nearby toggle
            if (sheetNearbyToggle && sheetNearbyToggle.checked) {
                activeFeedTerritoryFilter = 'nearby';
                const nearbyChip = document.querySelector('.bokantaj-topic-scroller .chip-pill[data-filter-v2="nearby"]');
                if (nearbyChip) nearbyChip.classList.add('active');
            } else if (sheetNearbyToggle && !sheetNearbyToggle.checked && activeFeedTerritoryFilter === 'nearby') {
                activeFeedTerritoryFilter = 'all';
                const nearbyChip = document.querySelector('.bokantaj-topic-scroller .chip-pill[data-filter-v2="nearby"]');
                if (nearbyChip) nearbyChip.classList.remove('active');
            }

            // Close sheet and re-render feed
            if (filterSheetModal) {
                filterSheetModal.classList.remove('active');
                filterSheetModal.style.display = 'none';
                document.body.classList.remove('sheet-open');
            }

            if (typeof renderFlashFeed === 'function') {
                renderFlashFeed();
            }
        });
    }

    // 6. Reset Sheet Filters
    if (btnResetSheetFilters) {
        btnResetSheetFilters.addEventListener('click', () => {
            activeFeedTypeFilter = 'all';
            activeFeedTerritoryFilter = 'all';
            if (sheetNearbyToggle) sheetNearbyToggle.checked = false;
            sheetTypeBtns.forEach((b, i) => b.classList.toggle('active', i === 0));
            sheetTopicTags.forEach(t => t.classList.remove('active'));
            
            document.querySelectorAll('.bokantaj-segment-group .feed-pill').forEach((btn, i) => {
                btn.classList.toggle('active', i === 0);
            });
            document.querySelectorAll('.bokantaj-topic-scroller .chip-pill').forEach(chip => {
                chip.classList.remove('active');
            });

            if (filterSheetModal) {
                filterSheetModal.classList.remove('active');
                filterSheetModal.style.display = 'none';
                document.body.classList.remove('sheet-open');
            }

            if (typeof renderFlashFeed === 'function') {
                renderFlashFeed();
            }
        });
    }

    // 7. Directly bind Row 1 & Row 2 Bokantaj segment & scroller buttons
    document.querySelectorAll('.bokantaj-segment-group .feed-pill, .bokantaj-topic-scroller .chip-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filterVal = btn.dataset.filterV2;
            if (filterVal === 'nearby') {
                btn.classList.toggle('active');
                activeFeedTerritoryFilter = btn.classList.contains('active') ? 'nearby' : 'all';
                if (sheetNearbyToggle) sheetNearbyToggle.checked = btn.classList.contains('active');
            } else if (filterVal) {
                document.querySelectorAll('.bokantaj-segment-group .feed-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeFeedTypeFilter = filterVal;
            }
            if (typeof renderFlashFeed === 'function') {
                renderFlashFeed();
            }
        });
    });


    // [Old Chat Logic Removed - Now in chat-logic.js]

    // ==========================================================================
    // LOGIQUE DE LA MINI-FENÊTRE PROFIL EXPRESS (#quickProfileModal)
    // ==========================================================================
    const quickProfileModal = document.getElementById('quickProfileModal');
    const closeQuickProfileModalBtn = document.getElementById('closeQuickProfileModalBtn');
    const quickAvatarImg = document.getElementById('quickAvatarImg');
    const quickProfileName = document.getElementById('quickProfileName');
    const quickProfileRole = document.getElementById('quickProfileRole');
    const quickProfileCity = document.getElementById('quickProfileCity');
    const quickProfileBadge = document.getElementById('quickProfileBadge');
    const quickProfileRating = document.getElementById('quickProfileRating');
    const quickProfileBio = document.getElementById('quickProfileBio');
    const quickProfileSkills = document.getElementById('quickProfileSkills');
    const quickStartChatBtn = document.getElementById('quickStartChatBtn');
    const quickStartBookingBtn = document.getElementById('quickStartBookingBtn');

    let currentQuickMember = null;

    function closeQuickProfile() {
        if (quickProfileModal) {
            quickProfileModal.classList.remove('active');
            quickProfileModal.style.display = 'none';
        }
        document.body.style.overflow = 'auto';
    }

    if (closeQuickProfileModalBtn) {
        closeQuickProfileModalBtn.addEventListener('click', closeQuickProfile);
    }
    if (quickProfileModal) {
        quickProfileModal.addEventListener('click', (e) => {
            if (e.target === quickProfileModal) closeQuickProfile();
        });
    }

    window.openQuickProfileModal = async function(memberId) {
        let member = null;

        // Fetch from Supabase API if UUID
        if (window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.getUserProfile === 'function' && memberId && isUUID(memberId)) {
            try {
                member = await window.LYANN_API_CLIENT.getUserProfile(memberId);
            } catch(e) {}
        }

        if (!member && window.LYANN_MEMBERS && Array.isArray(window.LYANN_MEMBERS)) {
            member = window.LYANN_MEMBERS.find(m => String(m.id) === String(memberId) || m.name === memberId) || null;
        }

        if (!member) {
            member = {
                id: memberId,
                name: "Membre LYANN",
                role: "Membre Communauté",
                city: "Guadeloupe",
                bio: "Membre engagé de la communauté LYANN.",
                badge: "Profil Vérifié",
                rating: null,
                skills: []
            };
        }

        currentQuickMember = member;

        let displayName = member.name || member.full_name;
        if (member.first_name) {
            const ln = (member.last_name || '').trim();
            const init = ln ? ` ${ln.charAt(0).toUpperCase()}.` : '';
            displayName = `${member.first_name.trim()}${init}`;
        }

        const avatarSrc = member.avatar_url || member.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.id || memberId}`;
        const cityText = member.commune || member.city || member.locationName || 'Guadeloupe';
        const roleText = member.role || (member.is_pro ? 'Professionnel' : 'Membre LYANN');
        const badgeText = member.badge || (member.is_pro ? 'Artisan PRO' : 'Profil Vérifié');
        const bioText = member.bio || member.description || 'Membre actif de la communauté LYANN.';
        const skillsList = Array.isArray(member.skills) ? member.skills : (typeof member.skills === 'string' ? member.skills.split(',') : []);

        if (quickAvatarImg) quickAvatarImg.src = avatarSrc;
        if (quickProfileName) quickProfileName.textContent = displayName;
        if (quickProfileRole) quickProfileRole.textContent = roleText;
        if (quickProfileCity) quickProfileCity.innerHTML = `<i class="ph ph-map-pin"></i> ${cityText}`;
        if (quickProfileBadge) quickProfileBadge.textContent = badgeText;
        
        if (quickProfileRating) {
            if (member.rating && member.reviewsCount) {
                quickProfileRating.textContent = `⭐ ${member.rating} (${member.reviewsCount} avis)`;
                quickProfileRating.style.display = 'inline';
            } else {
                quickProfileRating.style.display = 'none';
            }
        }
        
        if (quickProfileBio) quickProfileBio.textContent = bioText;

        if (quickProfileSkills) {
            if (skillsList.length > 0) {
                quickProfileSkills.innerHTML = skillsList.map(s => `<span class="quick-skill-pill">${s.trim()}</span>`).join('');
                quickProfileSkills.style.display = 'flex';
            } else {
                quickProfileSkills.style.display = 'none';
            }
        }

        if (quickProfileModal) {
            quickProfileModal.classList.add('active');
            quickProfileModal.style.display = 'flex';
        }
        document.body.style.overflow = 'hidden';
    };

    if (quickStartChatBtn) {
        quickStartChatBtn.addEventListener('click', async () => {
            closeQuickProfile();
            if (currentQuickMember) {
                const needTitle = await window.lyannPrompt(`De quoi avez-vous besoin avec ${currentQuickMember.name} ?`);
                if (needTitle) {
                    openChatWithUser(currentQuickMember.name, currentQuickMember.avatar, currentQuickMember.name, {
                        requesterId: getMyId(),
                        helperId: currentQuickMember.name,
                        title: needTitle
                    });
                } else {
                    openChatWithUser(currentQuickMember.name, currentQuickMember.avatar);
                }
            }
        });
    }

    if (quickStartBookingBtn) {
        quickStartBookingBtn.addEventListener('click', () => {
            if (quickProfileModal) quickProfileModal.classList.remove('active');
            const bookingModal = document.getElementById('bookingModal');
            const targetNameEl = document.getElementById('bookingTargetMemberName');
            if (targetNameEl && currentQuickMember) {
                targetNameEl.textContent = `Réserver avec ${currentQuickMember.name}`;
            }
            if (bookingModal) bookingModal.classList.add('active');
        });
    }

    // ==========================================================================
    // LOGIQUE DE LA MODALE DE CONNEXION (#loginModal)
    // ==========================================================================
    const loginModal = document.getElementById('loginModal');
    const closeLoginModalBtn = document.getElementById('closeLoginModalBtn');
    const loginTriggers = document.querySelectorAll('a[href="#login"], .open-login-trigger');
    const loginForm = document.getElementById('loginForm');

    function openLoginModal() {
        const onboardingModal = document.getElementById('onboardingModal');
        if (onboardingModal) onboardingModal.classList.remove('active');
        if (loginModal) {
            loginModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }
    window.openLoginModal = openLoginModal;

    function closeLoginModal() {
        if (loginModal) {
            loginModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
    window.closeLoginModal = closeLoginModal;

    if (closeLoginModalBtn) {
        closeLoginModalBtn.addEventListener('click', closeLoginModal);
    }

    loginTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            openLoginModal();
        });
    });

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            const emailInput = loginForm.querySelector('#loginEmail, input[type="email"], input[type="text"]');
            const passwordInput = loginForm.querySelector('#loginPassword, input[type="password"]');
            
            const email = emailInput?.value?.trim();
            const password = passwordInput?.value;

            if (!email || !password) {
                window.lyannAlert('Veuillez saisir votre adresse email et votre mot de passe.');
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="ph ph-spinner spin"></i> Connexion...';
            }

            try {
                if (!window.LYANN_API_CLIENT || !window.LYANN_API_CLIENT.supabase) {
                    throw new Error('Supabase client non disponible.');
                }

                const { data, error } = await window.LYANN_API_CLIENT.login(email, password);
                if (error) throw error;

                if (!data || !data.session) {
                    throw new Error('Session invalide. Identifiants incorrects.');
                }

                // Confirm that a valid session exists via getSession() before proceeding
                const { data: sessionData } = await window.LYANN_API_CLIENT.getSession();
                const activeSession = sessionData?.session;

                console.log('[LYANN AUTH DEBUG]', {
                    event: 'LOGIN_VERIFIED',
                    sessionPresent: !!activeSession,
                    userId: activeSession?.user?.id || null,
                    origin: window.location.origin
                });

                if (!activeSession) {
                    throw new Error('Impossible de confirmer la persistance de la session active.');
                }

                // Log unconfirmed email warning if applicable, but keep valid session
                if (data.user && !data.user.email_confirmed_at && data.user.confirmation_sent_at) {
                    console.warn('[LYANN AUTH] User logged in with unconfirmed email:', data.user.email);
                }

                if (typeof safeStorage !== 'undefined') {
                    safeStorage.setItem('lyan_user_logged_in', 'true');
                    if (data.user) safeStorage.setItem('lyan_user_id', data.user.id);
                }
                localStorage.setItem('lyan_user_logged_in', 'true');
                if (data.user) localStorage.setItem('lyan_user_id', data.user.id);

                closeLoginModal();
                loginForm.reset();

                document.querySelector('.app-welcome-screen')?.remove();

                if (isNativePlatform()) {
                    await updateHeaderAuthState();
                    const path = window.location.pathname;
                    const isHome = path.endsWith('index.html') || path.endsWith('/') || (!path.includes('.html'));
                    if (isHome && typeof window.renderAppHomeConnectedView === 'function') {
                        window.renderAppHomeConnectedView();
                    }
                } else {
                    const currentPath = window.location.pathname;
                    if (!currentPath.includes('feed.html') && !currentPath.includes('results.html') && !currentPath.includes('payment-portal.html')) {
                        window.location.href = 'feed.html';
                    } else {
                        await updateHeaderAuthState();
                    }
                }

                try {
                    const pendingHelpStr = sessionStorage.getItem('pending_lyann_help');
                    if (pendingHelpStr) {
                        sessionStorage.removeItem('pending_lyann_help');
                        const p = JSON.parse(pendingHelpStr);
                        const myId = window.CURRENT_USER_ID || window.LYANN_CURRENT_USER?.id || window.LYANN_API_CLIENT?.getCurrentUserId?.();
                        const initialNeed = { requestId: p.reqId, requesterId: p.requesterId, helperId: myId, title: p.title };
                        if (typeof window.openChatWithUser === 'function') {
                            window.openChatWithUser(p.requesterName, p.requesterAvatar, p.requesterId, initialNeed);
                        }
                    }
                } catch(e) {}
            } catch (err) {
                console.error('[LYANN AUTH DEBUG]', {
                    event: 'LOGIN_FAILED',
                    message: err ? err.message : 'Erreur inconnue',
                    status: err ? err.status : undefined,
                    code: err ? err.code : undefined
                });
                const normErr = (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.normalizeAuthError) 
                    ? window.LYANN_API_CLIENT.normalizeAuthError(err) 
                    : err;
                window.lyannAlert(normErr.message || 'Adresse email ou mot de passe incorrect.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'Se connecter';
                }
            }
        });
    }

    const switchToSignupBtn = document.getElementById('switchToSignupBtn');
    if (switchToSignupBtn) {
        switchToSignupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeLoginModal();
            if (typeof window.openOnboarding === 'function') {
                window.openOnboarding();
            }
        });
    }

    // ==========================================================================
    // LOGIQUE MARKETPLACE END-TO-END (BOOKING, MOT DE PASSE OUBLIÉ, SIGNALEMENT)
    // ==========================================================================
    const passwordResetModal = document.getElementById('passwordResetModal');
    const closePasswordResetModalBtn = document.getElementById('closePasswordResetModalBtn');
    const passwordResetForm = document.getElementById('passwordResetForm');
    const forgotLinks = document.querySelectorAll('.forgot-link');

    forgotLinks.forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const loginModal = document.getElementById('loginModal');
            if (loginModal) loginModal.classList.remove('active');
            if (passwordResetModal) {
                passwordResetModal.classList.add('active');
            } else if (window.lyannPrompt) {
                const email = await window.lyannPrompt("Veuillez saisir votre adresse email pour recevoir un lien de réinitialisation :");
                if (email) {
                    if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.resetPasswordForEmail) {
                        await window.LYANN_API_CLIENT.resetPasswordForEmail(email);
                    }
                    window.lyannAlert(`📩 Si l'adresse ${email} correspond à un compte LYANN, un lien sécurisé a été envoyé.`);
                }
            } else {
                window.lyannAlert('📩 Un lien de réinitialisation a été envoyé à votre adresse email.');
            }
        });
    });

    if (closePasswordResetModalBtn) {
        closePasswordResetModalBtn.addEventListener('click', () => {
            if (passwordResetModal) passwordResetModal.classList.remove('active');
        });
    }

    if (passwordResetForm) {
        passwordResetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = passwordResetForm.querySelector('input[type="email"]');
            const email = emailInput?.value?.trim();
            if (!email) {
                window.lyannAlert('Veuillez saisir votre adresse email.');
                return;
            }

            const submitBtn = passwordResetForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="ph ph-spinner spin"></i> Envoi en cours...';
            }

            try {
                if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.resetPasswordForEmail) {
                    const { error } = await window.LYANN_API_CLIENT.resetPasswordForEmail(email);
                    if (error) throw error;
                }
                window.lyannAlert(`📩 Si l'adresse ${email} est inscrite sur LYANN, un lien sécurisé vous a été envoyé.`);
                if (passwordResetModal) passwordResetModal.classList.remove('active');
                passwordResetForm.reset();
            } catch (err) {
                const normErr = (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.normalizeAuthError)
                    ? window.LYANN_API_CLIENT.normalizeAuthError(err)
                    : err;
                window.lyannAlert(normErr.message || 'Erreur lors de l’envoi de l’email.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'Envoyer le lien de réinitialisation';
                }
            }
        });
    }

    // Modal Booking (Prise de RDV)
    const bookingModal = document.getElementById('bookingModal');
    const closeBookingModalBtn = document.getElementById('closeBookingModalBtn');
    const bookingForm = document.getElementById('bookingForm');
    const contactMemberBtns = document.querySelectorAll('.contact-member-trigger, .booking-trigger-btn');

    contactMemberBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const memberName = btn.dataset.memberName || 'ce Lyanneur';
            const targetNameEl = document.getElementById('bookingTargetMemberName');
            if (targetNameEl) targetNameEl.textContent = `Proposer une mission à ${memberName}`;
            if (bookingModal) bookingModal.classList.add('active');
        });
    });

    if (closeBookingModalBtn) {
        closeBookingModalBtn.addEventListener('click', () => {
            if (bookingModal) bookingModal.classList.remove('active');
        });
    }

    if (bookingForm) {
        bookingForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const targetNameEl = document.getElementById('bookingTargetMemberName');
            let providerName = 'Prestataire LYANN';
            if (targetNameEl && targetNameEl.textContent) {
                providerName = targetNameEl.textContent.replace('Proposer une mission à ', '').replace('Réserver avec ', '');
            }

            // Déclencher les notifications de réservation via Twilio & SendGrid
            if (window.LYANN_NOTIFICATIONS) {
                // Notifier le prestataire par SMS
                window.LYANN_NOTIFICATIONS.sendSMS(
                    '+590690001122', 
                    providerName, 
                    `Bonjour ${providerName}, vous avez reçu une nouvelle demande de réservation. Connectez-vous à LYANN pour y répondre.`
                );

                // Notifier le prestataire par Email
                window.LYANN_NOTIFICATIONS.sendEmail(
                    'prestataire@lyann-dom.com',
                    providerName,
                    '🤝 Nouvelle demande de réservation sur LYANN DOM',
                    `
                    <p>Une nouvelle demande de rendez-vous a été déposée pour votre activité.</p>
                    <p><strong>Détails du client :</strong> Client LYANN (Guadeloupe)</p>
                    <p>Rendez-vous dans votre Espace Prestataire sur LYANN DOM pour envoyer votre devis par jalon et sécuriser le paiement.</p>
                    `
                );
            }

            window.lyannAlert('🎉 Votre demande de réservation et de devis a été transmise avec succès ! Vous recevrez une confirmation sous 2h.');
            if (bookingModal) bookingModal.classList.remove('active');
            bookingForm.reset();
        });
    }

    // Modal Report (Signalement)
    const reportModal = document.getElementById('reportModal');
    const closeReportModalBtn = document.getElementById('closeReportModalBtn');
    const reportForm = document.getElementById('reportForm');
    const reportTriggers = document.querySelectorAll('.report-trigger-btn');

    reportTriggers.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (reportModal) reportModal.classList.add('active');
        });
    });

    if (closeReportModalBtn) {
        closeReportModalBtn.addEventListener('click', () => {
            if (reportModal) reportModal.classList.remove('active');
        });
    }

    if (reportForm) {
        reportForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const reasonSelect = document.getElementById('reportReason');
            const detailsInput = document.getElementById('reportDetails');
            const reasonVal = reasonSelect ? reasonSelect.value : 'inapproprie';
            const detailsVal = detailsInput ? detailsInput.value : '';
            
            const targetUser = (reportModal && reportModal.getAttribute('data-target-user')) ? reportModal.getAttribute('data-target-user') : 'Membre Signalé';
            
            const reasonLabels = {
                'inapproprie': 'Propos inappropriés / Harcèlement',
                'fausse_info': 'Profil inexact / Faux profil',
                'spam': 'Démarchage abusif / Spam',
                'fraude': 'Arnaque / Suspicion de fraude',
                'autre': 'Autre problème de sérénité'
            };
            
            const newReport = {
                id: 'REP-' + Math.floor(100000 + Math.random() * 900000),
                reporterName: 'Utilisateur Connecté',
                targetName: targetUser,
                reason: reasonVal,
                reasonLabel: reasonLabels[reasonVal] || 'Signalement de litige',
                details: detailsVal || 'Aucune précision fournie',
                timestamp: new Date().toLocaleDateString('fr-FR') + ' à ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'En cours'
            };
            
            try {
                const existing = JSON.parse(localStorage.getItem('LYANN_REPORTS') || '[]');
                existing.unshift(newReport);
                localStorage.setItem('LYANN_REPORTS', JSON.stringify(existing));
            } catch(err) {}

            if (window.lyannAlert) {
                window.lyannAlert(`🛡️ Votre signalement concernant ${targetUser} a été transmis à l'équipe de modération LYANN. Merci de contribuer à la sérénité du réseau !`);
            }
            if (reportModal) {
                reportModal.classList.remove('active');
                reportModal.style.display = 'none';
            }
            reportForm.reset();
            window.dispatchEvent(new CustomEvent('lyann_report_added', { detail: newReport }));
        });
    }

    // ==========================================================================
    // LOGIQUE ESPACE MON COMPTE (#userAccountModal)
    // ==========================================================================
    const userAccountModal = document.getElementById('userAccountModal');
    const closeUserAccountModalBtn = document.getElementById('closeUserAccountModalBtn');
    const openAccountModalTriggers = document.querySelectorAll('.open-account-modal-trigger');
    const accountTabBtns = document.querySelectorAll('.account-tab-btn');
    const accountTabContents = document.querySelectorAll('.account-tab-content');

    // Helper pour ouvrir un onglet spécifique du modal Mon Profil
    function openAccountTab(tabId) {
        if (userAccountModal) {
            userAccountModal.classList.add('active');
            document.body.style.overflow = 'hidden';

            setTimeout(() => {
                const targetEl = document.getElementById(tabId);
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
        }
    }
    window.openAccountTab = openAccountTab;

    const accountModalBody = document.querySelector('#userAccountModal .modal-body');
    if (accountModalBody) {
        const accountObserver = new IntersectionObserver((entries) => {
            let activeId = null;
            let maxRatio = 0;
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
                    maxRatio = entry.intersectionRatio;
                    activeId = entry.target.id;
                }
            });
            if (activeId) {
                const btn = document.querySelector(`.account-tab-btn[data-account-tab="${activeId}"]`);
                if (btn && !btn.classList.contains('active')) {
                    accountTabBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }
            }
        }, { root: accountModalBody, threshold: [0.1, 0.3, 0.6, 0.9] });
        
        accountTabContents.forEach(c => accountObserver.observe(c));
    }

    // --- GESTION DYNAMIQUE DES SERVICES DE L'UTILISATEUR ---
    // --- GESTION DYNAMIQUE DES SERVICES DE L'UTILISATEUR (SUPABASE CONNECTED) ---
    async function renderUserServices() {
        const serviceContainers = [];
        
        // 1. Unified account modal container
        const btnHub = document.getElementById('btnAddNewServiceHub');
        if (btnHub) {
            const card = btnHub.closest('.profile-section-card');
            if (card) {
                const listDiv = card.querySelector('div:not(.profile-section-title)');
                if (listDiv) serviceContainers.push(listDiv);
            }
        }
        
        // 2. Legacy dashboard modal container
        const legacyList = document.getElementById('myServicesList');
        if (legacyList) serviceContainers.push(legacyList);
        
        if (serviceContainers.length === 0) return;

        const userId = (typeof getMyId === 'function') ? getMyId() : 'me';
        let servicesList = [];
        try {
            if (window.LYANN_API_CLIENT) {
                servicesList = await window.LYANN_API_CLIENT.getUserServices(userId);
            }
        } catch(e) {
            console.error("Failed to fetch user services:", e);
        }

        serviceContainers.forEach(container => {
            if (servicesList.length === 0) {
                container.innerHTML = `<div class="empty-state-message">Vous ne proposez aucun service pour le moment.</div>`;
            } else {
                container.innerHTML = servicesList.map(service => {
                    const priceText = service.price === "Sur devis" ? "Sur devis" : `${parseFloat(service.price).toFixed(2)} €`;
                    const billingText = service.price === "Sur devis" ? "" : ` ${service.billing}`;
                    const detailsText = service.details ? ` • ${service.details}` : "";
                    
                    return `
                        <div style="background: #F8F9FA; padding: 12px 16px; border-radius: var(--radius-md); border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div>
                                <strong style="font-size: 0.92rem; color: var(--primary-dark);">${service.title}</strong>
                                <div style="font-size: 0.78rem; color: var(--text-muted);">${priceText}${billingText}${detailsText}</div>
                            </div>
                            <span class="pill-badge pill-green">${service.status} ●</span>
                        </div>
                    `;
                }).join('');
            }
        });
    }

    // Modal creation & handling for Add Service
    function ensureAddServiceModal() {
        let modal = document.getElementById('addServiceModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.id = 'addServiceModal';
            modal.style.zIndex = '9999';
            modal.innerHTML = `
                <div class="modal-card">
                    <button class="modal-close-btn" id="closeAddServiceModalBtn" aria-label="Fermer"><i class="ph ph-x"></i></button>

                    <div class="modal-header">
                        <div class="modal-logo">
                            <i class="ph-fill ph-briefcase" style="font-size: 2rem; color: var(--primary);"></i>
                            <span style="font-weight: 800; font-size: 1.2rem; color: #4A7C59; margin-left: 8px;">Nouveau Service</span>
                        </div>
                        <h3 class="step-title" style="font-size: 1.4rem; margin-top: 10px; margin-bottom: 4px;">Proposez votre talent</h3>
                        <p class="step-desc" style="margin-bottom: 0;">Ajoutez un nouveau service à proposer à la communauté.</p>
                    </div>

                    <div class="modal-body">
                        <form id="addServiceForm">
                            <div class="form-group" style="margin-bottom: 14px;">
                                <label for="serviceTitle" style="font-size: 0.85rem; font-weight: 700; display: block; margin-bottom: 6px;">Nom du service / Compétence</label>
                                <div class="input-with-icon" style="position: relative;">
                                    <i class="ph ph-wrench" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted);"></i>
                                    <input type="text" id="serviceTitle" class="modal-input" placeholder="Ex: Réparation de clim, Tonte de pelouse..." required style="width: 100%; box-sizing: border-box; padding-left: 38px;">
                                </div>
                            </div>

                            <div class="form-group-row" style="display: flex; gap: 12px; margin-bottom: 14px;">
                                <div class="form-group flex-1" style="margin-bottom: 0; flex: 1;">
                                    <label for="servicePrice" style="font-size: 0.85rem; font-weight: 700; display: block; margin-bottom: 6px;">Tarif (€) ou "Sur devis"</label>
                                    <div class="input-with-icon" style="position: relative;">
                                        <i class="ph ph-currency-eur" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted);"></i>
                                        <input type="text" id="servicePrice" class="modal-input" placeholder="Ex: 50" required style="width: 100%; box-sizing: border-box; padding-left: 38px;">
                                    </div>
                                </div>
                                <div class="form-group flex-1" style="margin-bottom: 0; flex: 1;">
                                    <label for="serviceBilling" style="font-size: 0.85rem; font-weight: 700; display: block; margin-bottom: 6px;">Facturation</label>
                                    <select id="serviceBilling" class="modal-input" style="width: 100%; box-sizing: border-box; padding-left: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: white; height: 42px;" required>
                                        <option value="/ heure">Par heure</option>
                                        <option value="/ unité">Par unité</option>
                                        <option value="/ chantier">Par chantier</option>
                                        <option value="Sur devis">Sur devis</option>
                                    </select>
                                </div>
                            </div>

                            <div class="form-group" style="margin-bottom: 14px;">
                                <label for="serviceDesc" style="font-size: 0.85rem; font-weight: 700; display: block; margin-bottom: 6px;">Description / Conditions</label>
                                <textarea id="serviceDesc" class="modal-input" style="width: 100%; box-sizing: border-box; padding-left: 16px; padding-top: 10px; height: 80px; resize: none;" placeholder="Détails du service, matériel inclus ou non, conditions..."></textarea>
                            </div>

                            <button type="submit" class="btn btn-primary btn-lg" style="width: 100%; margin-top: 12px; justify-content: center; display: inline-flex; align-items: center;">Enregistrer ce service 🚀</button>
                        </form>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById('closeAddServiceModalBtn').addEventListener('click', () => {
                modal.classList.remove('active');
            });

            document.getElementById('addServiceForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const title = document.getElementById('serviceTitle').value.trim();
                let price = document.getElementById('servicePrice').value.trim();
                const billing = document.getElementById('serviceBilling').value;
                const desc = document.getElementById('serviceDesc').value.trim();

                if (!title) return;

                if (price.toLowerCase() === 'sur devis' || isNaN(parseFloat(price))) {
                    price = 'Sur devis';
                }

                const userId = (typeof getMyId === 'function') ? getMyId() : 'me';
                try {
                    if (window.LYANN_API_CLIENT) {
                        await window.LYANN_API_CLIENT.addUserService(userId, title, price, billing, desc);
                    }
                } catch (err) {
                    console.error("Failed to save service to DB:", err);
                }

                await renderUserServices();
                modal.classList.remove('active');
                window.lyannAlert('🎉 Votre nouveau service a été ajouté avec succès !');
                e.target.reset();
            });
        }
    }

    // Initial service rendering
    renderUserServices();

    // Wire up "+ Nouveau service" triggers
    document.addEventListener('click', (e) => {
        const target = e.target;
        const isAddBtn = target.id === 'btnAddNewServiceHub' || 
                          target.closest('#btnAddNewServiceHub') || 
                          (target.tagName === 'BUTTON' && target.textContent.includes('Ajouter un service'));
        if (isAddBtn) {
            e.preventDefault();
            ensureAddServiceModal();
            const modal = document.getElementById('addServiceModal');
            if (modal) modal.classList.add('active');
        }
    });

    openAccountModalTriggers.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (userAccountModal) {
                userAccountModal.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        });
    });

    if (closeUserAccountModalBtn) {
        closeUserAccountModalBtn.addEventListener('click', () => {
            if (userAccountModal) {
                userAccountModal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    // Gestion des onglets Mon Compte (15 Onglets)
    accountTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-account-tab');
            openAccountTab(targetTab);
        });
    });

    // ==========================================================================
    // LOGIQUE BOUTON FLOTTANT SPEED-DIAL (ACTIONS RAPIDES)
    // ==========================================================================
    const speedDialWrapper = document.getElementById('speedDialWrapper');
    const speedDialTrigger = document.getElementById('speedDialTrigger');

    if (speedDialTrigger && speedDialWrapper) {
        speedDialTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            speedDialWrapper.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!speedDialWrapper.contains(e.target)) {
                speedDialWrapper.classList.remove('active');
            }
        });

        // Helper pour ouvrir un onglet spécifique du modal Mon Profil
        // (La fonction globale window.openAccountTab est utilisée à la place)

        // Raccourci 0 : Ouvrir mon profil & réglages
        const sdActionOpenProfile = document.getElementById('sdActionOpenProfile');
        if (sdActionOpenProfile) {
            sdActionOpenProfile.addEventListener('click', (e) => {
                e.preventDefault();
                speedDialWrapper.classList.remove('active');
                openAccountTab('tab-acc-dashboard');
            });
        }

        // Raccourci 1 : Publier un Bokantaj → Redirige vers la page Bokantaj (feed.html) ou active l'éditeur
        const sdActionBokantaj = document.getElementById('sdActionBokantaj');
        if (sdActionBokantaj) {
            sdActionBokantaj.addEventListener('click', (e) => {
                speedDialWrapper.classList.remove('active');
                if (window.location.pathname.endsWith('feed.html')) {
                    e.preventDefault();
                    const flashInput = document.getElementById('flashContentInput');
                    if (flashInput) {
                        flashInput.scrollIntoView({ behavior: 'smooth' });
                        flashInput.focus();
                    }
                }
            });
        }

        // Raccourci 2 : Créer un service
        const sdActionCreateService = document.getElementById('sdActionCreateService');
        if (sdActionCreateService) {
            sdActionCreateService.addEventListener('click', (e) => {
                e.preventDefault();
                speedDialWrapper.classList.remove('active');
                openAccountTab('tab-acc-profile-services');
            });
        }

        // Raccourci 3 : Besoin d'un coup de main → ouvre le wizard directement
        const sdActionMakeRequest = document.getElementById('sdActionMakeRequest');
        if (sdActionMakeRequest) {
            sdActionMakeRequest.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                speedDialWrapper.classList.remove('active');
                
                const wizardModal = document.getElementById('modal-request-help');
                if (wizardModal) {
                    wizardModal.classList.add('active');
                    document.body.style.overflow = 'hidden';
                    // Reset au step 1
                    const allSteps = wizardModal.querySelectorAll('.wizard-step');
                    allSteps.forEach((s, i) => {
                        s.style.display = (i === 0) ? 'block' : 'none';
                    });
                    const prevBtn = document.getElementById('wizardBtnPrev');
                    const nextBtn = document.getElementById('wizardBtnNext');
                    const submitBtn = document.getElementById('wizardBtnSubmit');
                    if (prevBtn) prevBtn.style.visibility = 'hidden';
                    if (nextBtn) nextBtn.style.display = 'block';
                    if (submitBtn) submitBtn.style.display = 'none';
                    const progressFill = wizardModal.querySelector('.wizard-progress-fill');
                    if (progressFill) progressFill.style.width = '16.66%';
                } else {
                    // Page sans modale → rediriger
                    window.location.href = 'feed.html';
                }
            });
        }

        // Raccourci 4 : Scanner un QR Code
        const sdActionScanQR = document.getElementById('sdActionScanQR');
        if (sdActionScanQR) {
            sdActionScanQR.addEventListener('click', (e) => {
                e.preventDefault();
                speedDialWrapper.classList.remove('active');
                window.lyannAlert('📷 Scanner QR Code activé ! Placez le QR Code du lyanneur en face de la caméra.');
            });
        }

        // Raccourci 5 : Contacter un lyanneur
        const sdActionContactUser = document.getElementById('sdActionContactUser');
        if (sdActionContactUser) {
            sdActionContactUser.addEventListener('click', (e) => {
                e.preventDefault();
                speedDialWrapper.classList.remove('active');
                const chatModal = document.getElementById('chatModal');
                if (chatModal) {
                    let targetName = 'Prestataire LYANN';
                    let targetAvatar = 'david-34.png';
                    try {
                        const stored = localStorage.getItem('lyann_last_active_contact');
                        if (stored) {
                            const parsed = JSON.parse(stored);
                            targetName = parsed.name;
                            targetAvatar = parsed.avatar;
                        }
                    } catch(e) {}
                    openChatWithUser(targetName, targetAvatar, targetName);
                } else {
                    window.location.href = 'feed.html?action=openchat';
                }
            });
        }
    }

    // Formulaire Sécurité
    const accountSecurityForm = document.getElementById('accountSecurityForm');
    if (accountSecurityForm) {
        accountSecurityForm.addEventListener('submit', (e) => {
            e.preventDefault();
            window.lyannAlert('🔑 Votre mot de passe a été mis à jour avec succès !');
            accountSecurityForm.reset();
        });
    }

    // Formulaire Réglages
    const accountSettingsForm = document.getElementById('accountSettingsForm');
    if (accountSettingsForm) {
        accountSettingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const fn = document.getElementById('accFirstName')?.value || '';
            const ln = document.getElementById('accLastName')?.value || '';
            const nameEl = document.getElementById('accountModalName');
            if (nameEl && (fn || ln)) nameEl.textContent = `${fn} ${ln}`.trim();
            window.lyannAlert('💾 Vos modifications de profil et préférences ont bien été enregistrées !');
        });
    }

    // Télécharger factures & Déconnexion
    const downloadInvoicesBtn = document.getElementById('downloadInvoicesBtn');
    if (downloadInvoicesBtn) {
        downloadInvoicesBtn.addEventListener('click', () => {
            window.lyannAlert('📄 Votre dernier relevé de facturation (PDF) a été généré et téléchargé.');
        });
    }

    
    async function loadAndApplyUserProfile(userId, forcedSession) {
        if (!userId) return null;
        
        let profileData = null;
        let profileSource = 'none';

        if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
            try {
                const { data: dbProfile, error } = await window.LYANN_API_CLIENT.getProfile(userId);
                if (dbProfile && !error) {
                    profileData = dbProfile;
                    profileSource = 'supabase';
                }
            } catch (e) {
                console.warn('[LYANN PROFILE DEBUG] Supabase profile fetch failed:', e);
            }
        }

        if (profileData) {
            const storedProfileObj = {
                id: profileData.id,
                firstName: profileData.first_name || '',
                lastName: profileData.last_name || '',
                email: profileData.email || '',
                avatar_url: profileData.avatar_url || '',
                role: profileData.role || 'USER'
            };
            if (typeof safeStorage !== 'undefined') {
                safeStorage.setItem('lyan_user_profile', JSON.stringify(storedProfileObj));
            }
            localStorage.setItem('lyan_user_profile', JSON.stringify(storedProfileObj));
        } else {
            try {
                const stored = (typeof safeStorage !== 'undefined' ? safeStorage.getItem('lyan_user_profile') : null) || localStorage.getItem('lyan_user_profile');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (parsed.id === userId) {
                        profileData = parsed;
                        profileSource = 'localStorage';
                    }
                }
            } catch (e) {}
        }

        let displayName = '';
        if (profileData) {
            const fn = profileData.first_name || profileData.firstName || '';
            const ln = profileData.last_name || profileData.lastName || '';
            displayName = (fn + ' ' + ln).trim();
            if (!displayName && profileData.email) {
                displayName = profileData.email.split('@')[0];
            }
        }

        if (!displayName && forcedSession && forcedSession.user) {
            displayName = forcedSession.user.user_metadata?.first_name || forcedSession.user.email?.split('@')[0] || 'Membre LYANN';
            profileSource = 'session_metadata';
        }

        if (!displayName) {
            displayName = 'Membre LYANN';
        }

        console.log('[LYANN PROFILE DEBUG]', {
            sessionUserId: userId,
            loadedProfileId: profileData?.id || userId,
            loadedProfileName: displayName,
            profileSource: profileSource
        });

        function getInitialsAvatarSvg(name) {
            const parts = (name || 'Membre').trim().split(' ');
            const first = parts[0] ? parts[0][0].toUpperCase() : 'M';
            const last = parts[1] ? parts[1][0].toUpperCase() : '';
            const initials = (first + last).substring(0, 2);
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="#4A7C59"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#FFFFFF" font-size="42" font-family="sans-serif" font-weight="bold">${initials}</text></svg>`;
            return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
        }

        const avatarUrl = (profileData && profileData.avatar_url && !profileData.avatar_url.includes('david-34.png'))
            ? profileData.avatar_url
            : getInitialsAvatarSvg(displayName);

        const avatarEls = document.querySelectorAll('.nav-profile-avatar, .drawer-profile-avatar, #accountModalAvatar, #drawerProfileAvatar');
        avatarEls.forEach(img => {
            if (img) {
                img.src = avatarUrl;
                img.alt = displayName;
                img.title = displayName;
            }
        });

        const nameEls = document.querySelectorAll('.user-name-display, #accountUserName, #accountModalName, #drawerUserName, #accountModalTitle, #profileUserName, #quickProfileName, #publicMemberName');
        nameEls.forEach(el => {
            if (el) el.textContent = displayName;
        });

        const fn = (profileData?.first_name || profileData?.firstName || (forcedSession?.user?.user_metadata?.first_name) || displayName.split(' ')[0] || 'Membre').trim();
        const firstNameEls = document.querySelectorAll('#overviewFirstName');
        firstNameEls.forEach(el => {
            if (el) el.textContent = fn;
        });

        const accFnInput = document.getElementById('accFirstName');
        const accLnInput = document.getElementById('accLastName');
        const accEmailInput = document.getElementById('accEmail');
        if (accFnInput && profileData) accFnInput.value = profileData.first_name || profileData.firstName || '';
        if (accLnInput && profileData) accLnInput.value = profileData.last_name || profileData.lastName || '';
        if (accEmailInput && profileData) accEmailInput.value = profileData.email || forcedSession?.user?.email || '';

        // --------------------------------------------------------------------------
        // DYNAMIC USER ACTIVITY METRICS & CLEAN EMPTY STATE (STRICTLY BY SESSION USER ID)
        // --------------------------------------------------------------------------
        const userEmail = profileData?.email || forcedSession?.user?.email || '';

        // Calculate dynamic transactions & wallets for active userId
        let availableBal = 0;
        let pendingBal = 0;
        let revenueMonth = 0;
        let expensesMonth = 0;
        let completedMissionsCount = 0;
        let requestedMissionsCount = 0;

        if (window.LYANN_PAYMENTS && typeof window.LYANN_PAYMENTS.getWallets === 'function') {
            try {
                const wallets = window.LYANN_PAYMENTS.getWallets() || {};
                const userWallet = wallets[userId];
                if (userWallet) {
                    availableBal = userWallet.availableBalance ?? 0;
                    pendingBal = userWallet.pendingBalance ?? 0;
                }
                const txs = (window.LYANN_PAYMENTS.getTransactions ? window.LYANN_PAYMENTS.getTransactions() : []) || [];
                txs.forEach(t => {
                    if (t.providerId === userId && t.status === 'completed') {
                        revenueMonth += t.amount ?? 0;
                        completedMissionsCount++;
                    }
                    if (t.customerId === userId) {
                        expensesMonth += t.amount ?? 0;
                        requestedMissionsCount++;
                    }
                });
            } catch (e) {}
        }

        // Update KPI card elements dynamically
        const kpiRatingVal = document.getElementById('accountKpiRating');
        const kpiRatingLabel = document.getElementById('accountKpiRatingLabel');
        const kpiMissionsVal = document.getElementById('accountKpiMissions');
        const kpiDemandesVal = document.getElementById('accountKpiDemandes');
        const kpiRespTimeVal = document.getElementById('accountKpiResponseTime');
        const kpiRevenueVal = document.getElementById('accountKpiRevenue');
        const kpiExpensesVal = document.getElementById('accountKpiExpenses');
        const kpiAvailBalVal = document.getElementById('accountKpiAvailableBalance');
        const kpiPendBalVal = document.getElementById('accountKpiPendingBalance');

        if (kpiRatingVal) kpiRatingVal.textContent = 'Non noté';
        if (kpiRatingLabel) kpiRatingLabel.textContent = '0 avis';
        if (kpiMissionsVal) kpiMissionsVal.textContent = String(completedMissionsCount);
        if (kpiDemandesVal) kpiDemandesVal.textContent = String(requestedMissionsCount);
        if (kpiRespTimeVal) kpiRespTimeVal.textContent = 'N/A';
        if (kpiRevenueVal) kpiRevenueVal.textContent = (revenueMonth).toFixed(2).replace('.', ',') + ' €';
        if (kpiExpensesVal) kpiExpensesVal.textContent = (expensesMonth).toFixed(2).replace('.', ',') + ' €';
        if (kpiAvailBalVal) kpiAvailBalVal.textContent = (availableBal).toFixed(2).replace('.', ',') + ' €';
        if (kpiPendBalVal) kpiPendBalVal.textContent = (pendingBal).toFixed(2).replace('.', ',') + ' €';

        // Render Clean Empty State Containers for logged-in user with no activity
        const servicesContainer = document.getElementById('accountServicesContainer');
        if (servicesContainer) {
            servicesContainer.innerHTML = '<p class="account-empty-state" style="font-size: 0.88rem; color: var(--text-muted); text-align: center; padding: 16px;">Vous n\'avez encore créé aucune offre de service.</p>';
        }

        const requestsContainer = document.getElementById('accountRequestsContainer');
        if (requestsContainer) {
            requestsContainer.innerHTML = '<p class="account-empty-state" style="font-size: 0.88rem; color: var(--text-muted); text-align: center; padding: 16px;">Vous n\'avez publié aucune demande d\'intervention.</p>';
        }

        const missionsContainer = document.getElementById('accountMissionsContainer');
        if (missionsContainer) {
            missionsContainer.innerHTML = '<p class="account-empty-state" style="font-size: 0.88rem; color: var(--text-muted); text-align: center; padding: 16px;">Vous n\'avez encore réalisé aucune mission.</p>';
        }

        const bokantajContainer = document.getElementById('accountBokantajContainer');
        if (bokantajContainer) {
            bokantajContainer.innerHTML = '<p class="account-empty-state" style="font-size: 0.85rem; color: var(--text-muted);">Aucune publication active sur Bokantaj.</p>';
        }

        const reviewsContainer = document.getElementById('accountReviewsContainer');
        if (reviewsContainer) {
            reviewsContainer.innerHTML = '<p class="account-empty-state" style="font-size: 0.88rem; color: var(--text-muted); text-align: center; padding: 16px;">Aucun avis pour le moment.</p>';
        }

        const kycList = document.getElementById('accountKycList');
        if (kycList) {
            const isEmailConf = forcedSession?.user?.email_confirmed_at ? '✅ Email vérifié (' + userEmail + ')' : '⏳ Email en attente de confirmation (' + userEmail + ')';
            kycList.innerHTML = `
                <li>${isEmailConf}</li>
                <li>⏳ Numéro mobile non certifié</li>
                <li>⏳ Pièce d'identité non transmise</li>
            `;
        }

        return profileData;
    }

    let authInitializationComplete = false;

    async function updateHeaderAuthState() {
        let isLoggedIn = false;
        let userId = null;
        let currentSession = null;

        if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
            try {
                const { data } = await window.LYANN_API_CLIENT.getSession();
                if (data && data.session && data.session.user) {
                    isLoggedIn = true;
                    userId = data.session.user.id;
                    currentSession = data.session;
                } else {
                    // Fallback UX state while loading or if offline
                    const storedLoggedIn = (typeof safeStorage !== 'undefined' ? safeStorage.getItem('lyan_user_logged_in') : localStorage.getItem('lyan_user_logged_in')) === 'true';
                    const storedUserId = (typeof safeStorage !== 'undefined' ? safeStorage.getItem('lyan_user_id') : localStorage.getItem('lyan_user_id'));
                    
                    if (!authInitializationComplete && storedLoggedIn && storedUserId) {
                        isLoggedIn = true;
                        userId = storedUserId;
                    } else if (authInitializationComplete && !data?.session) {
                        isLoggedIn = false;
                    } else {
                        isLoggedIn = storedLoggedIn && !!storedUserId;
                        userId = storedUserId;
                    }
                }
                console.log('[AUTH] state check:', {
                    event: 'UPDATE_HEADER_AUTH_STATE',
                    hasSession: !!currentSession,
                    userId: userId || null,
                    initializationComplete: authInitializationComplete
                });
            } catch (err) {
                console.warn("[AUTH] Supabase session verification error:", err);
                const storedLoggedIn = (typeof safeStorage !== 'undefined' ? safeStorage.getItem('lyan_user_logged_in') : localStorage.getItem('lyan_user_logged_in')) === 'true';
                const storedUserId = (typeof safeStorage !== 'undefined' ? safeStorage.getItem('lyan_user_id') : localStorage.getItem('lyan_user_id'));
                isLoggedIn = storedLoggedIn && !!storedUserId;
                userId = storedUserId;
            }
        } else {
            const storedLoggedIn = (typeof safeStorage !== 'undefined' ? safeStorage.getItem('lyan_user_logged_in') : localStorage.getItem('lyan_user_logged_in')) === 'true';
            const storedUserId = (typeof safeStorage !== 'undefined' ? safeStorage.getItem('lyan_user_id') : localStorage.getItem('lyan_user_id'));
            isLoggedIn = storedLoggedIn && !!storedUserId;
            userId = storedUserId;
        }

        if (isLoggedIn && userId) {
            document.body.classList.add('user-is-logged-in');
            document.querySelector('.app-welcome-screen')?.remove();
            window.CURRENT_USER_ID = userId;
            if (typeof safeStorage !== 'undefined') safeStorage.setItem('lyan_user_logged_in', 'true');
            localStorage.setItem('lyan_user_logged_in', 'true');
            
            await loadAndApplyUserProfile(userId, currentSession);

            if (isNativePlatform()) {
                const path = window.location.pathname;
                const isHome = path.endsWith('index.html') || path.endsWith('/') || (!path.includes('.html'));
                
                // STABILIZATION V1: Only render App Home if not already rendered
                // Prevents race condition where TOKEN_REFRESHED events rebuild the header
                const nativeHeaderActive = document.querySelector('.navbar[data-native-header-active]');
                if (isHome && typeof window.renderAppHomeConnectedView === 'function' && !nativeHeaderActive) {
                    window.renderAppHomeConnectedView();
                } else if (isHome && nativeHeaderActive) {
                    // Header already active — just ensure it stays visible
                    if (typeof window.ensureDeterministicAppHeader === 'function') {
                        window.ensureDeterministicAppHeader();
                    }
                }
            }
        } else if (authInitializationComplete) {
            document.body.classList.remove('user-is-logged-in');
            window.CURRENT_USER_ID = null;
            if (typeof safeStorage !== 'undefined') {
                safeStorage.removeItem('lyan_user_logged_in');
                safeStorage.removeItem('lyan_user_id');
                safeStorage.removeItem('lyan_user_profile');
            }
            localStorage.removeItem('lyan_user_logged_in');
            localStorage.removeItem('lyan_user_id');
            localStorage.removeItem('lyan_user_profile');

            if (isNativePlatform()) {
                const path = window.location.pathname;
                const isHome = path.endsWith('index.html') || path.endsWith('/') || (!path.includes('.html'));
                if (isHome && typeof showAppWelcomeScreen === 'function') {
                    showAppWelcomeScreen();
                }
            }

            const nameEls = document.querySelectorAll('.user-name-display, #accountUserName, #accountModalName, #drawerUserName, #profileUserName, #quickProfileName, #publicMemberName');
            nameEls.forEach(el => {
                if (el) el.textContent = 'Connexion / Inscription';
            });
            const firstNameEls = document.querySelectorAll('#overviewFirstName');
            firstNameEls.forEach(el => {
                if (el) el.textContent = 'Membre';
            });

            // Reset Account KPI elements on logout
            const kpiRatingVal = document.getElementById('accountKpiRating');
            const kpiMissionsVal = document.getElementById('accountKpiMissions');
            const kpiDemandesVal = document.getElementById('accountKpiDemandes');
            const kpiRevenueVal = document.getElementById('accountKpiRevenue');
            const kpiExpensesVal = document.getElementById('accountKpiExpenses');
            const kpiAvailBalVal = document.getElementById('accountKpiAvailableBalance');
            const kpiPendBalVal = document.getElementById('accountKpiPendingBalance');

            if (kpiRatingVal) kpiRatingVal.textContent = '0.0 ★';
            if (kpiMissionsVal) kpiMissionsVal.textContent = '0';
            if (kpiDemandesVal) kpiDemandesVal.textContent = '0';
            if (kpiRevenueVal) kpiRevenueVal.textContent = '0,00 €';
            if (kpiExpensesVal) kpiExpensesVal.textContent = '0,00 €';
            if (kpiAvailBalVal) kpiAvailBalVal.textContent = '0,00 €';
            if (kpiPendBalVal) kpiPendBalVal.textContent = '0,00 €';
        }
    }

    // Subscribe to Supabase Auth Changes
    if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
        window.LYANN_API_CLIENT.supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('[AUTH] event:', event, '| hasSession:', !!session, '| userId:', session?.user?.id || null);

            // MANDATORY GUARD: Do not purge or force logged-out state on transient INITIAL_SESSION with null session
            if (event === 'INITIAL_SESSION' && !session) {
                console.log('[AUTH] INITIAL_SESSION null transient state -> Skipping premature purge');
                return;
            }

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || (event === 'INITIAL_SESSION' && session)) {
                authInitializationComplete = true;
                if (session && session.user) {
                    if (window.CURRENT_USER_ID && window.CURRENT_USER_ID !== session.user.id) {
                        if (typeof safeStorage !== 'undefined') safeStorage.removeItem('lyan_user_profile');
                        localStorage.removeItem('lyan_user_profile');
                    }

                    window.CURRENT_USER_ID = session.user.id;
                    if (typeof safeStorage !== 'undefined') {
                        safeStorage.setItem('lyan_user_logged_in', 'true');
                        safeStorage.setItem('lyan_user_id', session.user.id);
                    }
                    localStorage.setItem('lyan_user_logged_in', 'true');
                    localStorage.setItem('lyan_user_id', session.user.id);

                    await loadAndApplyUserProfile(session.user.id, session);
                }
                await updateHeaderAuthState();
            } else if (event === 'SIGNED_OUT') {
                authInitializationComplete = true;
                window.CURRENT_USER_ID = null;
                if (typeof safeStorage !== 'undefined') {
                    safeStorage.removeItem('lyan_user_logged_in');
                    safeStorage.removeItem('lyan_user_id');
                    safeStorage.removeItem('lyan_user_profile');
                }
                localStorage.removeItem('lyan_user_logged_in');
                localStorage.removeItem('lyan_user_id');
                localStorage.removeItem('lyan_user_profile');
                await updateHeaderAuthState();
                if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
                    window.location.href = 'index.html';
                }
            }
        });
    }

    // Canonical Auth Bootstrap on startup
    (async function bootstrapAuth() {
        if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
            try {
                const { data } = await window.LYANN_API_CLIENT.getSession();
                const session = data?.session;
                console.log('[AUTH] bootstrap getSession:', { hasSession: !!session, userId: session?.user?.id || null });
                if (session && session.user) {
                    window.CURRENT_USER_ID = session.user.id;
                    if (typeof safeStorage !== 'undefined') {
                        safeStorage.setItem('lyan_user_logged_in', 'true');
                        safeStorage.setItem('lyan_user_id', session.user.id);
                    }
                    localStorage.setItem('lyan_user_logged_in', 'true');
                    localStorage.setItem('lyan_user_id', session.user.id);
                    await loadAndApplyUserProfile(session.user.id, session);
                }
            } catch (e) {
                console.warn('[AUTH] bootstrap getSession error:', e);
            } finally {
                authInitializationComplete = true;
                await updateHeaderAuthState();
            }
        } else {
            authInitializationComplete = true;
            await updateHeaderAuthState();
        }
    })();

    const accountLogoutBtn = document.getElementById('accountLogoutBtn');
    if (accountLogoutBtn) {
        
        accountLogoutBtn.addEventListener('click', () => {
            window.lyannConfirm('Êtes-vous sûr de vouloir vous déconnecter de votre espace LYANN ?').then(async confirmed => { 
                if (confirmed) {
                    if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
                        await window.LYANN_API_CLIENT.logout();
                    }
                    safeStorage.setItem('lyan_user_logged_in', 'false');
                    await updateHeaderAuthState();
                    if (userAccountModal) userAccountModal.classList.remove('active');
                    document.body.style.overflow = '';
                    window.lyannAlert('🚪 Vous êtes désormais déconnecté. Les boutons Connexion & S\'inscrire sont de nouveau affichés.');
                }
            });
        });
    }

    // Initialisation au chargement de la page
    updateHeaderAuthState();

    // ==========================================================================
    // SYSTÈME DE TAG UTILISATEUR (@mention) & AUTOCOMPLÉTION
    // ==========================================================================
    function setupMentionAutocomplete(inputEl) {
        if (!inputEl) return;

        let dropdown = document.createElement('div');
        dropdown.className = 'mention-autocomplete-dropdown';
        document.body.appendChild(dropdown);

        inputEl.addEventListener('input', () => {
            const val = inputEl.value;
            const cursorPos = inputEl.selectionStart;
            const textBeforeCursor = val.slice(0, cursorPos);
            const lastAtPos = textBeforeCursor.lastIndexOf('@');

            if (lastAtPos !== -1 && lastAtPos < cursorPos) {
                const query = textBeforeCursor.slice(lastAtPos + 1).toLowerCase();
                const matchedMembers = LYANN_MEMBERS.filter(m => 
                    m.name.toLowerCase().includes(query) || m.role.toLowerCase().includes(query)
                );

                if (matchedMembers.length > 0) {
                    const rect = inputEl.getBoundingClientRect();
                    dropdown.style.top = `${window.scrollY + rect.bottom + 4}px`;
                    dropdown.style.left = `${window.scrollX + rect.left}px`;
                    dropdown.style.display = 'block';

                    dropdown.innerHTML = matchedMembers.map(m => `
                        <div class="mention-autocomplete-item" data-member-name="${m.name}">
                            <img src="${m.avatar}" alt="${m.name}" class="mention-item-avatar">
                            <div>
                                <div class="mention-item-name">@${m.name.replace(/\s+/g, '_')}</div>
                                <div class="mention-item-role">${m.role} • ${m.city}</div>
                            </div>
                        </div>
                    `).join('');

                    dropdown.querySelectorAll('.mention-autocomplete-item').forEach(item => {
                        item.addEventListener('click', () => {
                            const name = item.dataset.memberName;
                            const tagText = `@${name.replace(/\s+/g, '_')} `;
                            inputEl.value = val.slice(0, lastAtPos) + tagText + val.slice(cursorPos);
                            dropdown.style.display = 'none';
                            inputEl.focus();
                        });
                    });
                    return;
                }
            }
            dropdown.style.display = 'none';
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && e.target !== inputEl) {
                dropdown.style.display = 'none';
            }
        });
    }

    // Attach mention autocomplete to main text inputs
    document.querySelectorAll('#flashContentInput, #chatInputField, #searchInput, #modalSearchInput, .modal-input').forEach(el => {
        setupMentionAutocomplete(el);
    });

    // Helper to parse @mentions into clickable tags in rendered content
    function parseMentionsInText(text) {
        if (!text) return '';
        return text.replace(/@([A-Za-z0-9_À-ÿ-]+)/g, (match, username) => {
            const cleanName = username.replace(/_/g, ' ');
            const matched = LYANN_MEMBERS.find(m => m.name.toLowerCase().includes(cleanName.toLowerCase()));
            const memberId = matched ? matched.id : 1;
            return `<a href="#" class="user-mention-tag trigger-quick-profile" data-member-id="${memberId}">${match}</a>`;
        });
    }

    // ==========================================================================
    // LOGIQUE BOUTON "🤝 LYANNER" & RACCOURCIS WHATSAPP / PHONE
    // ==========================================================================
    const lyannedConfirmationModal = document.getElementById('lyannedConfirmationModal');
    const closeLyannedModalBtn = document.getElementById('closeLyannedModalBtn');
    const lyannedMemberName = document.getElementById('lyannedMemberName');
    const whatsappShortcutBtn = document.getElementById('whatsappShortcutBtn');
    const phoneShortcutBtn = document.getElementById('phoneShortcutBtn');

    if (closeLyannedModalBtn) {
        closeLyannedModalBtn.addEventListener('click', () => {
            if (lyannedConfirmationModal) lyannedConfirmationModal.classList.remove('active');
        });
    }

    function triggerLyannerDeal(memberName = 'Prestataire LYANN', phone = '+590690001122') {
        if (lyannedMemberName) lyannedMemberName.textContent = memberName;

        if (whatsappShortcutBtn) {
            const encodedMsg = encodeURIComponent(`Bonjour ${memberName} ! Nous sommes Lyannés sur LYANN pour nos travaux / échanges.`);
            whatsappShortcutBtn.href = `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodedMsg}`;
        }

        if (phoneShortcutBtn) {
            phoneShortcutBtn.href = `tel:${phone}`;
        }

        // Ajout à l'historique Mes LYANN
        const tabLyannHistory = document.getElementById('tab-account-lyann');
        if (tabLyannHistory) {
            const newItem = document.createElement('div');
            newItem.className = 'lyann-history-item';
            newItem.innerHTML = `
                <div class="lyann-history-info">
                    <div class="lyann-history-icon"><i class="ph ph-handshake"></i></div>
                    <div>
                        <div class="lyann-history-title">Accord LYANN conclu — ${memberName}</div>
                        <div class="lyann-history-sub">Mise en relation directe • À l'instant</div>
                    </div>
                </div>
                <span class="pill-badge pill-green">Lyannés 🤝</span>
            `;
            tabLyannHistory.appendChild(newItem);
        }

        if (chatModal) chatModal.classList.remove('active');
        if (quickProfileModal) quickProfileModal.classList.remove('active');
        if (lyannedConfirmationModal) lyannedConfirmationModal.classList.add('active');
    }

    document.querySelectorAll('.trigger-lyanner-deal, #chatLyannerBtn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const activeName = chatHeaderName ? chatHeaderName.textContent : 'Prestataire LYANN';
            triggerLyannerDeal(activeName);
        });
    });

    // Écouteurs de Gestion des Bots IA sur le Web
    document.querySelectorAll('.btn-approve-ai').forEach(btn => {
        btn.addEventListener('click', () => {
            const postId = btn.getAttribute('data-post-id');
            window.lyannConfirm('Approuver cette publication IA et la diffuser immédiatement sur Bokantaj public ?').then(confirmed => { if (confirmed) {
                if (window.LYANN_AI_ECOSYSTEM) {
                    window.LYANN_AI_ECOSYSTEM.approvePendingPost(postId);
                }
                const item = btn.closest('.web-ai-pending-item');
                if (item) item.remove();
                window.lyannAlert('✅ Publication IA approuvée et diffusée en direct sur Bokantaj !');
            }});
        });
    });

    document.querySelectorAll('.btn-reject-ai').forEach(btn => {
        btn.addEventListener('click', () => {
            const postId = btn.getAttribute('data-post-id');
            window.lyannConfirm('Rejeter et supprimer cette proposition de contenu IA ?').then(confirmed => { if (confirmed) {
                if (window.LYANN_AI_ECOSYSTEM) {
                    window.LYANN_AI_ECOSYSTEM.rejectPendingPost(postId);
                }
                const item = btn.closest('.web-ai-pending-item');
                if (item) item.remove();
                window.lyannAlert('🚫 Proposition IA rejetée.');
            }});
        });
    });

    document.querySelectorAll('.btn-toggle-agent').forEach(btn => {
        btn.addEventListener('click', () => {
            const agentId = btn.getAttribute('data-agent-id');
            if (window.LYANN_AI_ECOSYSTEM) {
                const newStatus = window.LYANN_AI_ECOSYSTEM.toggleAgentStatus(agentId);
                if (newStatus === 'PAUSED') {
                    btn.textContent = 'Reprendre ▶️';
                    window.lyannAlert(`⏸️ Agent IA mis en pause avec succès.`);
                } else {
                    btn.textContent = 'Pause ⏸️';
                    window.lyannAlert(`▶️ Agent IA réactivé.`);
                }
            }
        });
    });

    // System Toast Notification
    function showLyanToast(message, icon = '✨') {
        let toastContainer = document.getElementById('lyanToastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'lyanToastContainer';
            toastContainer.style.cssText = `
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                pointer-events: none;
            `;
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        toast.style.cssText = `
            background: #1E2822;
            color: #FAF7F2;
            padding: 14px 20px;
            border-radius: 9999px;
            font-weight: 700;
            font-size: 0.88rem;
            box-shadow: 0 10px 30px rgba(0,0,0,0.25);
            display: flex;
            align-items: center;
            gap: 10px;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.35s cubic-bezier(0.25, 1, 0.5, 1);
            border: 1px solid rgba(255,255,255,0.15);
            pointer-events: auto;
        `;
        toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
        toastContainer.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 400);
        }, 3200);
    }
    window.showLyanToast = showLyanToast;

    // Navbar Scroll Listener (Transparent at Top -> Opaque Fixed Sticky on Scroll)
    function updateNavbarScrollState() {
        const navbar = document.querySelector('.navbar') || document.querySelector('.bokantaj-native-header');
        if (navbar) {
            if (window.scrollY > 20) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        }
    }
    window.addEventListener('scroll', updateNavbarScrollState, { passive: true });
    updateNavbarScrollState();

    // Global Logout Handler ("Se déconnecter")
    document.addEventListener('click', async (e) => {
        const logoutBtn = e.target.closest('.btn-logout-trigger, .nav-logout-btn, .drawer-logout-btn');
        if (logoutBtn) {
            e.preventDefault();

            if (typeof window.closeLyannHamburgerDrawer === 'function') window.closeLyannHamburgerDrawer();
            const userAccountModal = document.getElementById('userAccountModal');
            if (userAccountModal) {
                userAccountModal.classList.remove('active');
                userAccountModal.style.display = 'none';
            }

            try {
                if (typeof safeStorage !== 'undefined') {
                    safeStorage.removeItem('lyan_user_logged_in');
                    safeStorage.removeItem('lyan_user_id');
                    safeStorage.removeItem('lyan_user_profile');
                }
                localStorage.removeItem('lyan_user_logged_in');
                localStorage.removeItem('lyan_user_id');
                localStorage.removeItem('lyan_user_profile');
                sessionStorage.clear();
            } catch (err) {}

            if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
                try {
                    await window.LYANN_API_CLIENT.signOut();
                } catch (err) {}
            }

            document.body.classList.remove('user-is-logged-in');
            if (typeof updateHeaderAuthState === 'function') {
                await updateHeaderAuthState();
            }

            if (window.NotificationService) {
                window.NotificationService.showToast('info', 'Vous avez été déconnecté.');
            } else if (typeof showLyanToast === 'function') {
                showLyanToast('info', 'Déconnexion réussie');
            }

            const path = window.location.pathname;
            const isHome = path.endsWith('index.html') || path.endsWith('/') || (!path.includes('.html'));
            if (!isHome) {
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 300);
            }
        }
    });

    // ==========================================================================
    // BOUTON FLOTTANT DE MESSAGERIE (BOKANTAJ) & SYSTÈME DE NOTIFICATIONS
    // ==========================================================================
    // 1. Bouton Flottant Messagerie (en bas à droite)
    const floatingChat = document.createElement('div');
    floatingChat.className = 'floating-chat-badge';
    floatingChat.title = 'Ouvrir Bokantaj (Messagerie)';
    floatingChat.innerHTML = `
        <i class="ph ph-chat-circle-dots"></i>
        <span class="floating-chat-badge-notif" id="floatingChatNotif"></span>
    `;
    document.body.appendChild(floatingChat);

    floatingChat.addEventListener('click', () => {
        const chatModal = document.getElementById('chatModal');
        if (chatModal) {
            let targetName = 'Prestataire LYANN';
            let targetAvatar = 'david-34.png';
            try {
                const stored = localStorage.getItem('lyann_last_active_contact');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    targetName = parsed.name;
                    targetAvatar = parsed.avatar;
                }
            } catch(e) {}
            openChatWithUser(targetName, targetAvatar, targetName);
            const notif = document.getElementById('floatingChatNotif');
            if (notif) notif.classList.remove('active');
        } else {
            window.location.href = 'feed.html?action=openchat';
        }
    });

    // Auto-ouvrir la discussion si le paramètre URL est présent
    const urlParams = new URLSearchParams(window.location.search);
    const chatActionParam = urlParams.get('action');
    if (chatActionParam === 'openchat') {
        const nameParam = urlParams.get('name');
        setTimeout(() => {
            if (nameParam) {
                openChatWithUser(decodeURIComponent(nameParam), "david-34.png");
            } else {
                let targetName = 'Prestataire LYANN';
                let targetAvatar = 'david-34.png';
                try {
                    const stored = localStorage.getItem('lyann_last_active_contact');
                    if (stored) {
                        const parsed = JSON.parse(stored);
                        targetName = parsed.name;
                        targetAvatar = parsed.avatar;
                    }
                } catch(e) {}
                openChatWithUser(targetName, targetAvatar, targetName);
            }
        }, 500);
    } else if (chatActionParam === 'email_confirmed' || urlParams.has('confirmed')) {
        setTimeout(() => {
            window.lyannAlert('✅ Adresse email confirmée avec succès ! Vous pouvez maintenant vous connecter à votre compte LYANN.');
            const loginModal = document.getElementById('loginModal');
            if (loginModal) loginModal.classList.add('active');
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 400);
    } else if (chatActionParam === 'open_login') {
        setTimeout(() => {
            const loginModal = document.getElementById('loginModal');
            if (loginModal) loginModal.classList.add('active');
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 400);
    } else if (chatActionParam === 'resend_confirmation') {
        setTimeout(async () => {
            const email = await window.lyannPrompt('Veuillez saisir votre adresse email pour recevoir un nouveau lien de confirmation :');
            if (email && window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
                const { error } = await window.LYANN_API_CLIENT.supabase.auth.resend({
                    type: 'signup',
                    email: email,
                    options: {
                        emailRedirectTo: window.location.origin + '/confirm-signup.html'
                    }
                });
                if (error) {
                    console.error('[LYANN AUTH DEBUG]', error);
                    window.lyannAlert('❌ ' + (error.message || 'Erreur lors du renvoi de l’email.'));
                } else {
                    window.lyannAlert(`📩 Un nouveau lien de confirmation a été envoyé à l'adresse ${email}.`);
                }
            }
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 400);
    }

    // 2. Bouton & Dropdown de Notifications (dans la Navbar)
    const navLinksContainer = document.querySelector('.nav-links');
    if (navLinksContainer) {
        const notifLi = document.createElement('div');
        notifLi.className = 'nav-notif-container logged-in-only';
        notifLi.style.position = 'relative';
        notifLi.style.marginRight = '12px';
        notifLi.style.display = 'flex';
        notifLi.style.alignItems = 'center';
        notifLi.innerHTML = `
            <button class="nav-notif-btn" id="navNotifBtn" title="Notifications" style="background: none; border: none; font-size: 1.35rem; cursor: pointer; color: var(--text); position: relative; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; transition: background 0.3s; padding: 0;">
                <i class="ph ph-bell"></i>
                <span class="nav-notif-badge" id="navNotifBadge" style="position: absolute; top: 4px; right: 4px; background: #C95140; color: white; font-size: 0.68rem; font-weight: 700; width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1.5px solid white; display: none;">0</span>
            </button>
            
            <div class="nav-notif-dropdown" id="navNotifDropdown" style="display: none; position: absolute; top: 50px; right: 0; width: 360px; max-width: 92vw; background: white; border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: 0 10px 30px rgba(0,0,0,0.15); z-index: 1000; overflow: hidden; padding: 12px 0;">
                <div style="padding: 0 16px 8px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 800; font-size: 0.95rem; color: var(--primary-dark);">Notifications</span>
                    <button type="button" id="clearAllNotifsBtn" style="background: none; border: none; font-size: 0.75rem; color: var(--primary); cursor: pointer; font-weight: 700; padding: 0;">Tout effacer</button>
                </div>
                <div class="nav-notif-list" id="navNotifList" style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column;">
                    <div style="padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
                        <i class="ph ph-bell-slash" style="font-size: 1.6rem; display: block; margin-bottom: 6px; opacity: 0.6;"></i>
                        Aucune nouvelle notification
                    </div>
                </div>
            </div>
        `;
        
        const profileBtn = navLinksContainer.querySelector('.open-account-modal-trigger');
        if (profileBtn) {
            navLinksContainer.insertBefore(notifLi, profileBtn);
        } else {
            navLinksContainer.appendChild(notifLi);
        }

        // Toggle dropdown listener
        const navNotifBtn = document.getElementById('navNotifBtn');
        const navNotifDropdown = document.getElementById('navNotifDropdown');
        if (navNotifBtn && navNotifDropdown) {
            navNotifBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                navNotifDropdown.style.display = navNotifDropdown.style.display === 'none' ? 'block' : 'none';
            });
            document.addEventListener('click', () => {
                navNotifDropdown.style.display = 'none';
            });
            navNotifDropdown.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // Action Effacer
        const clearAllNotifsBtn = document.getElementById('clearAllNotifsBtn');
        if (clearAllNotifsBtn) {
            clearAllNotifsBtn.addEventListener('click', () => {
                if (window.LYANN_NOTIFICATIONS && typeof window.LYANN_NOTIFICATIONS.clearLogs === 'function') {
                    window.LYANN_NOTIFICATIONS.clearLogs();
                } else {
                    safeStorage.removeItem('lyann_notifications_log');
                }
                loadAndRenderNotifs();
                const notif = document.getElementById('floatingChatNotif');
                if (notif) notif.classList.remove('active');
            });
        }
    }

    // Fonction de rendu des notifications
    function loadAndRenderNotifs() {
        const navNotifList = document.getElementById('navNotifList');
        const navNotifBadge = document.getElementById('navNotifBadge');
        if (!navNotifList) return;

        let logs = [];
        if (window.LYANN_NOTIFICATIONS && typeof window.LYANN_NOTIFICATIONS.getLogs === 'function') {
            logs = window.LYANN_NOTIFICATIONS.getLogs();
        }

        if (logs.length === 0) {
            navNotifList.innerHTML = `
                <div style="padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
                    <i class="ph ph-bell-slash" style="font-size: 1.6rem; display: block; margin-bottom: 6px; opacity: 0.6;"></i>
                    Aucune nouvelle notification
                </div>
            `;
            if (navNotifBadge) navNotifBadge.style.display = 'none';
            return;
        }

        if (navNotifBadge) {
            navNotifBadge.textContent = logs.length;
            navNotifBadge.style.display = 'flex';
        }

        navNotifList.innerHTML = '';
        logs.forEach(log => {
            const item = document.createElement('div');
            item.className = 'notif-item';
            
            let icon = '<i class="ph ph-envelope"></i>';
            let title = 'Notification';
            if (log.channel === 'sms') {
                icon = '<i class="ph ph-chat-text"></i>';
                title = `💬 SMS à ${log.recipientName}`;
            } else {
                icon = '<i class="ph ph-envelope"></i>';
                title = `✉️ E-mail à ${log.recipientName}`;
            }

            const dateObj = new Date(log.timestamp);
            const dateStr = isNaN(dateObj.getTime()) ? 'À l\'instant' : dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            item.innerHTML = `
                <div class="notif-item-icon">${icon}</div>
                <div class="notif-item-body">
                    <div class="notif-item-title" style="font-weight: 700; font-size: 0.82rem; color: var(--primary-dark);">${title}</div>
                    <div class="notif-item-text" style="font-size: 0.76rem; color: var(--text); margin-top: 2px;">${log.content}</div>
                    <div class="notif-item-time" style="font-size: 0.68rem; color: #888; margin-top: 4px;">${dateStr}</div>
                </div>
            `;
            
            item.addEventListener('click', () => {
                const chatModal = document.getElementById('chatModal');
                if (chatModal) {
                    openChatWithUser(log.recipientName || "Prestataire LYANN", "david-34.png");
                } else {
                    window.location.href = `feed.html?action=openchat&name=${encodeURIComponent(log.recipientName || "Prestataire LYANN")}`;
                }
                if (navNotifDropdown) navNotifDropdown.style.display = 'none';
            });
            
            navNotifList.appendChild(item);
        });
    }

    // Écouteur d'envoi de notification
    window.addEventListener('lyann_notification_sent', () => {
        loadAndRenderNotifs();
        const notif = document.getElementById('floatingChatNotif');
        if (notif) notif.classList.add('active');
    });

    // Chargement initial au bout de 600ms
    setTimeout(() => {
        loadAndRenderNotifs();
    }, 600);

    renderFlashFeed();
    renderMyDashboardRealizations();


    // ==========================================================================
    // DEVIS AUDIT TRAIL & VERSIONING SYSTEM
    // ==========================================================================

    // Audit Trail Logger
    window.LYANN_logDevisEvent = function(devisId, action, userId, oldValue, newValue) {
        const trail = JSON.parse(safeStorage.getItem('lyann_devis_audit_trail') || '{}');
        if (!trail[devisId]) trail[devisId] = [];
        trail[devisId].push({
            action: action,
            userId: userId,
            timestamp: new Date().toISOString(),
            oldValue: oldValue,
            newValue: newValue
        });
        safeStorage.setItem('lyann_devis_audit_trail', JSON.stringify(trail));
    };

    // Revise Devis (provider side)
    window.LYANN_reviseDevis = function(contactName, msgIdx, newAmount, newMilestones, motif) {
        const convs = getConversations();
        const msg = convs[contactName] && convs[contactName][msgIdx];
        if (!msg || msg.type !== 'devis') return false;

        const devisData = msg.devisData;
        const oldAmount = devisData.amount;
        const oldVersion = devisData.currentVersion || 1;
        const newVersion = oldVersion + 1;

        // Save new version
        if (!devisData.versions) devisData.versions = [];
        devisData.versions.push({
            version: newVersion,
            amount: newAmount,
            milestones: newMilestones,
            motif: motif,
            createdAt: new Date().toISOString(),
            createdBy: 'provider'
        });

        devisData.currentVersion = newVersion;
        devisData.amount = newAmount;
        devisData.milestones = newMilestones;
        devisData.status = 'pending_revision';

        // Add revision message to conversation
        const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const diff = newAmount - oldAmount;
        const diffStr = diff >= 0 ? '+' + diff.toFixed(0) + ' €' : diff.toFixed(0) + ' €';

        convs[contactName].push({
            senderRole: 'provider',
            text: `📋 Devis révisé — ${devisData.devisId}`,
            type: 'devis-revision',
            timestamp: timeNow,
            revisionData: {
                devisId: devisData.devisId,
                oldAmount: oldAmount,
                newAmount: newAmount,
                diff: diff,
                diffStr: diffStr,
                motif: motif,
                version: newVersion,
                msgIdx: msgIdx
            }
        });

        saveConversations(convs);

        // Audit trail
        LYANN_logDevisEvent(devisData.devisId, 'devis_revised', 'provider', { amount: oldAmount, version: oldVersion }, { amount: newAmount, version: newVersion, motif: motif });

        return true;
    };

    // Accept Devis Revision (client side)
    window.LYANN_acceptRevision = function(contactName, devisMsgIdx) {
        const convs = getConversations();
        const msg = convs[contactName] && convs[contactName][devisMsgIdx];
        if (!msg || msg.type !== 'devis') return;

        msg.devisData.status = 'accepted';

        const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        convs[contactName].push({
            senderRole: 'client',
            text: '✅ Nouveau devis accepté (v' + msg.devisData.currentVersion + ') — ' + msg.devisData.amount.toFixed(0) + ' €',
            type: 'status',
            timestamp: timeNow
        });

        saveConversations(convs);
        LYANN_logDevisEvent(msg.devisData.devisId, 'devis_revision_accepted', 'client', null, { version: msg.devisData.currentVersion });

        if (typeof renderActiveConversation === 'function') renderActiveConversation();
    };

    // Milestone Management Functions
    window.LYANN_addMilestone = function(contactName, devisMsgIdx, milestone) {
        const convs = getConversations();
        const msg = convs[contactName] && convs[contactName][devisMsgIdx];
        if (!msg || msg.type !== 'devis') return;

        const ms = msg.devisData.milestones || [];
        milestone.id = 'ms-' + (ms.length + 1);
        milestone.status = 'pending';
        milestone.order = ms.length + 1;
        ms.push(milestone);
        msg.devisData.milestones = ms;

        // Recalculate total
        msg.devisData.amount = ms.reduce((sum, m) => sum + (m.amount || 0), 0);
        msg.devisData.status = 'pending_revision';

        saveConversations(convs);
        LYANN_logDevisEvent(msg.devisData.devisId, 'milestone_added', 'provider', null, { milestone: milestone.title, amount: milestone.amount });
    };

    window.LYANN_removeMilestone = function(contactName, devisMsgIdx, milestoneId) {
        const convs = getConversations();
        const msg = convs[contactName] && convs[contactName][devisMsgIdx];
        if (!msg || msg.type !== 'devis') return false;

        const ms = msg.devisData.milestones || [];
        const msIdx = ms.findIndex(m => m.id === milestoneId);
        if (msIdx === -1) return false;

        // Protection: cannot remove paid/validated/completed milestones
        const milestone = ms[msIdx];
        if (['paid', 'validated', 'completed'].includes(milestone.status)) {
            return false; // Protected milestone
        }

        ms.splice(msIdx, 1);
        // Reorder
        ms.forEach((m, i) => m.order = i + 1);
        msg.devisData.milestones = ms;
        msg.devisData.amount = ms.reduce((sum, m) => sum + (m.amount || 0), 0);
        msg.devisData.status = 'pending_revision';

        saveConversations(convs);
        LYANN_logDevisEvent(msg.devisData.devisId, 'milestone_removed', 'provider', { milestone: milestone.title, amount: milestone.amount }, null);
        return true;
    };

    window.LYANN_updateMilestone = function(contactName, devisMsgIdx, milestoneId, updates) {
        const convs = getConversations();
        const msg = convs[contactName] && convs[contactName][devisMsgIdx];
        if (!msg || msg.type !== 'devis') return false;

        const ms = msg.devisData.milestones || [];
        const milestone = ms.find(m => m.id === milestoneId);
        if (!milestone) return false;

        // Protection: cannot modify paid/validated/completed milestones
        if (['paid', 'validated', 'completed'].includes(milestone.status)) {
            return false;
        }

        const oldValues = { title: milestone.title, amount: milestone.amount };
        if (updates.title !== undefined) milestone.title = updates.title;
        if (updates.amount !== undefined) milestone.amount = updates.amount;
        if (updates.order !== undefined) milestone.order = updates.order;

        msg.devisData.amount = ms.reduce((sum, m) => sum + (m.amount || 0), 0);
        msg.devisData.status = 'pending_revision';

        saveConversations(convs);
        LYANN_logDevisEvent(msg.devisData.devisId, 'milestone_updated', 'provider', oldValues, updates);
        return true;
    };

    // Get Devis Audit Trail
    window.LYANN_getDevisAuditTrail = function(devisId) {
        const trail = JSON.parse(safeStorage.getItem('lyann_devis_audit_trail') || '{}');
        return trail[devisId] || [];
    };

    // ==========================================================================
    // SYSTEME DE RECHERCHE ACTIF PAR COMMUNE & DEPARTEMENT DES ILES
    // ==========================================================================

    const TERRITORY_CITIES = {
        guadeloupe: [
            "Les Abymes", "Baie-Mahault", "Le Gosier", "Sainte-Anne", "Petit-Bourg", 
            "Le Moule", "Sainte-Rose", "Capesterre-Belle-Eau", "Pointe-à-Pitre", 
            "Morne-à-l'Eau", "Lamentin", "Saint-François", "Basse-Terre", 
            "Saint-Claude", "Trois-Rivières", "Gourbeyre", "Vieux-Habitants", 
            "Bouillante", "Port-Louis", "Grand-Bourg", "Petit-Canal", "Deshaies", 
            "Anse-Bertrand", "Capesterre-de-Marie-Galante", "Pointe-Noire", 
            "Saint-Louis", "Goyave", "Vieux-Fort", "La Désirade", 
            "Terre-de-Haut", "Terre-de-Bas"
        ],
        martinique: [
            "Fort-de-France", "Le Lamentin", "Le Robert", "Schœlcher", "Sainte-Marie", 
            "Ducos", "Saint-Joseph", "La Trinité", "Rivière-Pilote", "Le François", 
            "Rivière-Salée", "Gros-Morne", "Sainte-Luce", "Saint-Esprit", "Le Marin", 
            "Les Trois-Îlets", "Le Vauclin", "Case-Pilote", "Saint-Pierre", 
            "Les Anses-d'Arlet", "Le Carbet", "Basse-Pointe", "Lorrain", 
            "Bellefontaine", "Morne-Rouge", "Ajoupa-Bouillon", "Macouba", 
            "Grand'Rivière", "Prêcheur", "Fond-Saint-Denis", "Marigot", "Sainte-Anne", 
            "Diamant", "Morne-Vert"
        ],
        guyane: [
            "Cayenne", "Saint-Laurent-du-Maroni", "Kourou", "Matoury", "Remire-Montjoly", 
            "Macouria", "Maripasoula", "Mana", "Apatou", "Grand-Santi", "Sinnamary", 
            "Roura", "Saint-Georges", "Iracoubo", "Camopi", "Awala-Yalimapo", 
            "Montsinéry-Tonnegrande", "Regina", "Ouanary", "Saül", "Saint-Élie"
        ],
        reunion: [
            "Saint-Denis", "Saint-Paul", "Saint-Pierre", "Le Tampon", "Saint-André", 
            "Saint-Louis", "Le Port", "Saint-Joseph", "Saint-Benoît", "Sainte-Marie", 
            "Possession", "Sainte-Suzanne", "L'Étang-Salé", "Petite-Île", "Bras-Panon", 
            "Les Avirons", "Salazie", "Cilaos", "Entre-Deux", "Plaine-des-Palmistes", 
            "Trois-Bassins", "Sainte-Rose", "Saint-Philippe"
        ],
        "saint-martin": [
            "Marigot", "Grand-Case", "Quartier-d'Orléans", "Gustavia", "Saint-Jean"
        ]
    };

    function updateCityDropdown() {
        const locationSelect = document.getElementById('locationSelect');
        const citySelect = document.getElementById('citySelect');
        if (!locationSelect || !citySelect) return;

        const selectedTerritory = locationSelect.value;
        const cities = TERRITORY_CITIES[selectedTerritory] || [];

        // Save selected city
        const oldVal = citySelect.value;

        // Keep "Toutes les communes" option
        citySelect.innerHTML = '<option value="" selected>Toutes les communes</option>';

        cities.forEach(city => {
            const opt = document.createElement('option');
            opt.value = city;
            opt.textContent = city;
            citySelect.appendChild(opt);
        });

        // Restore value if still valid
        if (cities.includes(oldVal)) {
            citySelect.value = oldVal;
        }
    }

    function bindDynamicTalentCards() {
        document.querySelectorAll('#searchResultsContainer .trigger-quick-profile').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const memberId = el.getAttribute('data-member-id');
                if (memberId && typeof openPublicMemberProfile === 'function') {
                    openPublicMemberProfile(memberId);
                }
            });
        });

        document.querySelectorAll('#searchResultsContainer .trigger-contact-lyanneur').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const memberId = el.getAttribute('data-member-id');
                if (memberId) {
                    const chatModal = document.getElementById('modal-chat');
                    if (chatModal) {
                        chatModal.classList.add('active');
                        document.body.style.overflow = 'hidden';
                    }
                }
            });
        });

        document.querySelectorAll('#searchResultsContainer .btn-propose-need').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const memberId = el.getAttribute('data-member-id');
                if (typeof window.openLyannWizard === 'function') {
                    window.openLyannWizard(null, memberId);
                }
            });
        });
    }

    function setSelectValueSafely(selectElem, targetValue, fallbackValue) {
        if (!selectElem) return;
        let found = Array.from(selectElem.options).find(opt => opt.value === targetValue || opt.value === escapeSearchHtml(targetValue));
        if (found) {
            selectElem.value = found.value;
        } else if (fallbackValue) {
            let fallbackFound = Array.from(selectElem.options).find(opt => opt.value === fallbackValue || opt.value === escapeSearchHtml(fallbackValue));
            if (fallbackFound) selectElem.value = fallbackFound.value;
            else if (selectElem.options.length > 0) selectElem.options[0].selected = true;
        }
    }

(function setupWizardDomObserver() {
    function observeSelect(id) {
        const elem = document.getElementById(id);
        if (!elem) return;

        const observer = new MutationObserver((mutations) => {
            console.log('[STEP17 DOM MUTATION]', {
                time: performance.now(),
                field: id,
                value: elem.value,
                selectedIndex: elem.selectedIndex,
                optionsCount: elem.options.length,
                options: Array.from(elem.options).map(o => [o.value, o.selected]),
                mutations: mutations.map(m => m.type),
                stack: new Error().stack
            });
        });

        observer.observe(elem, { childList: true, attributes: true, subtree: true, characterData: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            observeSelect('wizardDomain');
            observeSelect('wizardCategory');
            observeSelect('wizardSubCat');
        });
    } else {
        observeSelect('wizardDomain');
        observeSelect('wizardCategory');
        observeSelect('wizardSubCat');
    }
})();

    async function syncWizardTaxonomyDropdowns(result) {
        const domainSelect = document.getElementById('wizardDomain');
        const catSelect = document.getElementById('wizardCategory');
        const subCatSelect = document.getElementById('wizardSubCat');

        if (!domainSelect || !catSelect || !subCatSelect) return { taxonomyLength: 0 };

        // Temporarily detach interactive change handlers to avoid intermediate resets
        domainSelect.onchange = null;
        catSelect.onchange = null;

        let taxonomyList = [];
        if (window.LyanAI && typeof window.LyanAI.fetchTaxonomyFromDB === 'function') {
            taxonomyList = await window.LyanAI.fetchTaxonomyFromDB();
        } else if (window.LyanAI && window.LyanAI.baselineTaxonomy) {
            taxonomyList = window.LyanAI.baselineTaxonomy;
        }

        if (!result || !result.universe || result.universe === "Autres Besoins") {
            console.trace('[REAL FALLBACK WRITE]', {
                source: 'syncWizardTaxonomyDropdowns_fallback',
                result: result
            });
        }

        const targetUniverse = (result && result.universe) || "Autres Besoins";
        const targetCat = (result && result.category) || null;
        const targetSub = (result && result.subcategory) || null;

        // 1. POPULATE DOMAINS
        const universes = Array.from(new Set(taxonomyList.map(t => t.universe))).filter(Boolean);
        if (!universes.includes("Autres Besoins")) universes.push("Autres Besoins");

        domainSelect.innerHTML = universes.map(u => 
            `<option value="${escapeSearchHtml(u)}">${escapeSearchHtml(u)}</option>`
        ).join('');

        // 2. SET DOMAIN
        setSelectValueSafely(domainSelect, targetUniverse, "Autres Besoins");
        const activeUniverse = domainSelect.value;

        // 3. POPULATE CATEGORIES FOR SELECTED DOMAIN
        const matchingCatItems = taxonomyList.filter(t => t.universe === activeUniverse);
        const categories = Array.from(new Set(matchingCatItems.map(t => t.category))).filter(Boolean);
        if (!categories.includes("Autre / Je ne trouve pas")) categories.push("Autre / Je ne trouve pas");

        catSelect.innerHTML = categories.map(c => 
            `<option value="${escapeSearchHtml(c)}">${escapeSearchHtml(c)}</option>`
        ).join('');

        // 4. SET CATEGORY
        const defaultCat = categories[0] || "Général";
        setSelectValueSafely(catSelect, targetCat || defaultCat, defaultCat);
        const activeCategory = catSelect.value;

        // 5. POPULATE SUBCATEGORIES FOR SELECTED CATEGORY
        const matchingSubItems = taxonomyList.filter(t => t.universe === activeUniverse && t.category === activeCategory);
        const subcategories = Array.from(new Set(matchingSubItems.map(t => t.subcategory))).filter(Boolean);
        if (!subcategories.includes("Demande libre")) subcategories.push("Demande libre");

        subCatSelect.innerHTML = subcategories.map(s => 
            `<option value="${escapeSearchHtml(s)}">${escapeSearchHtml(s)}</option>`
        ).join('');

        // 6. SET SUBCATEGORY
        const defaultSub = subcategories[0] || "Demande libre";
        setSelectValueSafely(subCatSelect, targetSub || defaultSub, defaultSub);

        // 7. ATTACH INTERACTIVE USER CHANGE HANDLERS
        domainSelect.onchange = () => {
            console.trace('[REAL FALLBACK WRITE]', { source: 'domainSelect_user_onchange', value: domainSelect.value });
            const selectedUniv = domainSelect.value;
            const univItems = taxonomyList.filter(t => t.universe === selectedUniv);
            const univCats = Array.from(new Set(univItems.map(t => t.category))).filter(Boolean);
            if (!univCats.includes("Autre / Je ne trouve pas")) univCats.push("Autre / Je ne trouve pas");

            catSelect.innerHTML = univCats.map(c => `<option value="${escapeSearchHtml(c)}">${escapeSearchHtml(c)}</option>`).join('');
            catSelect.value = univCats[0] || "Général";

            const selectedCat = catSelect.value;
            const catItems = taxonomyList.filter(t => t.universe === selectedUniv && t.category === selectedCat);
            const catSubs = Array.from(new Set(catItems.map(t => t.subcategory))).filter(Boolean);
            if (!catSubs.includes("Demande libre")) catSubs.push("Demande libre");

            subCatSelect.innerHTML = catSubs.map(s => `<option value="${escapeSearchHtml(s)}">${escapeSearchHtml(s)}</option>`).join('');
            subCatSelect.value = catSubs[0] || "Demande libre";
        };

        catSelect.onchange = () => {
            console.trace('[REAL FALLBACK WRITE]', { source: 'catSelect_user_onchange', value: catSelect.value });
            const selectedUniv = domainSelect.value;
            const selectedCat = catSelect.value;
            const catItems = taxonomyList.filter(t => t.universe === selectedUniv && t.category === selectedCat);
            const catSubs = Array.from(new Set(catItems.map(t => t.subcategory))).filter(Boolean);
            if (!catSubs.includes("Demande libre")) catSubs.push("Demande libre");

            subCatSelect.innerHTML = catSubs.map(s => `<option value="${escapeSearchHtml(s)}">${escapeSearchHtml(s)}</option>`).join('');
            subCatSelect.value = catSubs[0] || "Demande libre";
        };

        return { taxonomyLength: taxonomyList.length };
    }
    // Expose to window so the wizard scope (second safeDomReady) can access it
    window.syncWizardTaxonomyDropdowns = syncWizardTaxonomyDropdowns;
    window.escapeSearchHtml = escapeSearchHtml;
    window.setSelectValueSafely = setSelectValueSafely;

    function escapeSearchHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function renderZeroResultUI(container, rawQuery) {
        const safeQuery = rawQuery ? escapeSearchHtml(rawQuery) : '';
        container.innerHTML = `
            <div class="zero-result-card" style="grid-column: 1/-1; background: #FFFFFF; border: 2px dashed rgba(74, 124, 89, 0.25); border-radius: 20px; padding: 44px 24px; text-align: center; max-width: 680px; margin: 20px auto; box-shadow: 0 8px 24px rgba(0,0,0,0.04);">
                <div style="width: 54px; height: 54px; background: rgba(229, 179, 69, 0.15); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 14px;">
                    <i class="ph-bold ph-sparkle" style="font-size: 26px; color: #C69222;"></i>
                </div>
                <h3 style="font-size: 1.35rem; font-weight: 800; color: #1F3827; margin-bottom: 8px; line-height: 1.3;">
                    Aucun Lyanneur trouvé pour le moment.
                </h3>
                <p style="font-size: 0.95rem; color: #556B5D; margin-bottom: 24px; line-height: 1.5; max-width: 500px; margin-left: auto; margin-right: auto;">
                    Publiez votre besoin : les personnes correspondant à votre recherche pourront le découvrir.
                </p>
                
                <div style="display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; align-items: center;">
                    <button type="button" class="btn btn-primary btn-lg" id="zeroResultPublishBtn" style="font-weight: 800; padding: 12px 24px; border-radius: 12px; font-size: 0.96rem;">
                        J’ai un besoin <i class="ph-bold ph-arrow-right" style="margin-left: 6px;"></i>
                    </button>
                    
                    <button type="button" class="btn btn-outline" id="zeroResultWidenBtn" style="padding: 12px 20px; border-radius: 12px; font-size: 0.9rem; color: #4A7C59; border-color: rgba(74, 124, 89, 0.3);">
                        Modifier ma recherche
                    </button>
                </div>
            </div>
        `;

        // Bind CTA "J'ai un besoin"
        const publishBtn = document.getElementById('zeroResultPublishBtn');
        if (publishBtn) {
            publishBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof window.openLyannWizard === 'function') {
                    window.openLyannWizard(rawQuery);
                }
            });
        }

        // Bind CTA "Modifier ma recherche"
        const widenBtn = document.getElementById('zeroResultWidenBtn');
        if (widenBtn) {
            widenBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
            });
        }
    }

    function renderTalentCard(c) {
        const candId = c.id || c.user_id;
        const name = escapeSearchHtml(c.display_name || (c.name ? c.name.split(' (')[0] : 'Lyanneur'));
        const avatar = escapeSearchHtml(c.avatar || c.avatar_url || 'david-34.png');
        const role = escapeSearchHtml(c.role || c.category || 'Services & Entraide');
        const city = escapeSearchHtml(c.city || c.public_location || 'Guadeloupe');
        const rating = (c.rating || 5.0).toFixed(1);
        const reviewsCount = c.reviews_count || c.reviewsCount || 0;
        const bio = escapeSearchHtml(c.bio || (c.human_reasons && c.human_reasons[0]) || 'Disponible et à votre service.');
        
        let badgeHtml = '';
        if (c.is_verified_pro || c.public_badge) {
            badgeHtml = `<span class="badge badge-verified" style="display: inline-flex; align-items: center; gap: 4px; background: rgba(74, 124, 89, 0.12); color: #4A7C59; padding: 4px 10px; border-radius: 12px; font-size: 0.78rem; font-weight: 700; margin-bottom: 8px;"><i class="ph-fill ph-seal-check"></i> ${escapeSearchHtml(c.public_badge || 'Professionnel vérifié')}</span>`;
        } else if (c.pro_subscription_badge) {
            badgeHtml = `<span class="badge badge-pro" style="display: inline-flex; align-items: center; gap: 4px; background: rgba(229, 179, 69, 0.15); color: #B38210; padding: 4px 10px; border-radius: 12px; font-size: 0.78rem; font-weight: 700; margin-bottom: 8px;"><i class="ph-fill ph-crown"></i> PRO</span>`;
        }

        return `
            <div class="talent-card" data-member-id="${candId}" style="background: #FFF; border: 1px solid var(--border); border-radius: 16px; padding: 20px; transition: transform 0.2s ease, box-shadow 0.2s ease; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <div class="talent-card-header" style="display: flex; align-items: center; gap: 14px; margin-bottom: 12px;">
                        <div class="talent-photo trigger-quick-profile" data-member-id="${candId}" style="cursor: pointer; width: 54px; height: 54px; border-radius: 50%; overflow: hidden; flex-shrink: 0; border: 2px solid var(--primary-light);">
                            <img src="${avatar}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover;">
                        </div>
                        <div>
                            <h3 class="trigger-quick-profile" data-member-id="${candId}" style="cursor: pointer; font-size: 1.1rem; font-weight: 800; color: var(--primary-dark); margin: 0 0 2px 0;">${name}</h3>
                            <span class="talent-role" style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500; display: block;">${role} · ${city}</span>
                        </div>
                    </div>

                    ${badgeHtml}

                    <div class="talent-stars" style="display: flex; align-items: center; gap: 6px; margin-bottom: 10px; font-size: 0.88rem; color: #E5B345; font-weight: 700;">
                        <i class="ph-fill ph-star"></i> <span>${rating}</span>
                        <span style="color: var(--text-muted); font-weight: 400;">(${reviewsCount} avis)</span>
                    </div>

                    <blockquote style="font-size: 0.88rem; color: var(--text-dark); font-style: italic; background: rgba(247, 245, 240, 0.7); padding: 10px 12px; border-radius: 10px; margin: 0 0 16px 0; border-left: 3px solid var(--primary);">
                        "${bio}"
                    </blockquote>
                </div>

                <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <button type="button" class="btn btn-outline btn-sm trigger-quick-profile" data-member-id="${candId}" style="justify-content: center; font-weight: 700; border-radius: 10px; padding: 8px 0; font-size: 0.82rem;">
                            <i class="ph ph-user"></i> Voir le profil
                        </button>
                        <button type="button" class="btn btn-outline btn-sm trigger-contact-lyanneur" data-member-id="${candId}" style="justify-content: center; font-weight: 700; border-radius: 10px; padding: 8px 0; font-size: 0.82rem; color: #4A7C59; border-color: rgba(74, 124, 89, 0.3);">
                            <i class="ph ph-chat-circle"></i> Contacter
                        </button>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm btn-propose-need" data-member-id="${candId}" style="width: 100%; justify-content: center; font-weight: 800; border-radius: 10px; padding: 9px 0; font-size: 0.85rem; background: var(--primary);">
                        <i class="ph-bold ph-paper-plane-tilt"></i> Lui proposer mon besoin
                    </button>
                </div>
            </div>
        `;
    }

    async function performSearch(userTriggered = false) {
        const searchInput = document.getElementById('searchInput');
        const locationSelect = document.getElementById('locationSelect');
        const citySelect = document.getElementById('citySelect');
        const container = document.getElementById('searchResultsContainer');
        const summaryBadge = document.getElementById('searchSummaryBadge');
        const sortSelect = document.getElementById('searchSortSelect');
        const categorySelect = document.getElementById('modalCategoryFilterSelect');

        if (!container) return;

        // Loading Skeleton
        container.innerHTML = `
            <div class="search-loading-skeleton" style="grid-column: 1/-1; padding: 50px 20px; text-align: center;">
                <div style="display: inline-block; width: 36px; height: 36px; border: 4px solid rgba(74, 124, 89, 0.2); border-top-color: #4A7C59; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                <p style="margin-top: 14px; font-weight: 600; color: #1F3827; font-size: 0.95rem;">Recherche des lyanneurs en cours...</p>
            </div>
        `;

        const rawQuery = searchInput ? searchInput.value.trim() : '';
        const territoryVal = locationSelect ? locationSelect.value : 'guadeloupe';
        const cityVal = citySelect ? citySelect.value : '';
        const selectedCategory = categorySelect ? categorySelect.value : 'all';
        const selectedSort = sortSelect ? sortSelect.value : 'recommended';

        // 1. Fetch Candidates (Supabase DB profiles with DEV/DEMO isolation)
        let candidatesList = [];
        let callingUserId = null;
        let searchHasError = false;

        const isExplicitDemoMode = typeof window !== 'undefined' && (
            window.LYANN_FORCE_DEMO_DATA === true ||
            (window.location && window.location.search && (
                window.location.search.includes('demo=true') ||
                window.location.search.includes('dev_fixtures=true')
            ))
        );

        const isDevDebug = typeof window !== 'undefined' && (
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.protocol === 'file:' ||
            (window.location && window.location.search && (
                window.location.search.includes('debug=true') ||
                window.location.search.includes('demo=true') ||
                window.location.search.includes('dev=true')
            ))
        );

        try {
            if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
                const currentUser = await window.LYANN_API_CLIENT.getCurrentUser().catch(() => null);
                if (currentUser) callingUserId = currentUser.id;

                const { data: dbProfiles, error } = await window.LYANN_API_CLIENT.supabase
                    .from('profiles')
                    .select('*')
                    .neq('id', callingUserId || '00000000-0000-0000-0000-000000000000');

                if (error) {
                    console.error("❌ [LYANN SEARCH] Supabase profiles fetch error:", error);
                    searchHasError = true;
                } else if (dbProfiles) {
                    // Strict UUID Deduplication
                    const seenIds = new Set();
                    candidatesList = dbProfiles.filter(p => {
                        if (!p.id || seenIds.has(p.id)) return false;
                        seenIds.add(p.id);
                        return true;
                    }).map(p => ({
                        id: p.id,
                        user_id: p.id,
                        name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Lyanneur',
                        avatar: p.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.id}`,
                        role: p.headline || p.activity || p.role || 'Services & Entraide',
                        category: p.category || p.activity || 'general',
                        city: p.city || p.location || 'Guadeloupe',
                        location: p.territory || p.location || 'guadeloupe',
                        rating: p.rating || 5.0,
                        reviewsCount: p.reviews_count || 0,
                        completed_missions_count: p.completed_missions_count || 0,
                        is_verified_pro: p.is_verified || p.account_type === 'pro',
                        skills: p.skills || [],
                        bio: p.bio || p.headline || '',
                        subscription_plan: p.subscription_plan || 'FREE',
                        source: 'SUPABASE'
                    }));
                }
            } else {
                if (!isExplicitDemoMode) searchHasError = true;
            }
        } catch (err) {
            console.error("❌ [LYANN SEARCH] Supabase client exception:", err);
            searchHasError = true;
        }

        // Error vs Mock Fixtures Handling
        if (searchHasError) {
            container.innerHTML = `
                <div class="search-error-state" style="grid-column: 1/-1; padding: 40px 20px; text-align: center; background: #FFF; border-radius: var(--radius-xl); border: 1.5px dashed #E2E8F0;">
                    <i class="ph ph-warning-circle" style="font-size: 2.5rem; color: #DC2626; margin-bottom: 10px;"></i>
                    <h4 style="font-weight: 800; font-size: 1.1rem; margin-bottom: 4px; color: #1E293B;">Impossible de charger les Lyanneurs pour le moment.</h4>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Veuillez vérifier votre connexion Supabase ou réessayer plus tard.</p>
                </div>
            `;
            return;
        }

        // DEMO mode ONLY: populate mock fixtures if explicitly requested AND candidatesList is empty
        if (isExplicitDemoMode && candidatesList.length === 0 && window.LYANN_MEMBERS && Array.isArray(window.LYANN_MEMBERS)) {
            const seenIds = new Set();
            window.LYANN_MEMBERS.forEach(m => {
                const memberId = String(m.id || m.user_id || m.name);
                if (seenIds.has(memberId)) return;
                seenIds.add(memberId);
                candidatesList.push({
                    id: memberId,
                    user_id: memberId,
                    name: m.name,
                    avatar: m.avatar || 'david-34.png',
                    role: m.role || 'Services & Entraide',
                    category: m.category || 'general',
                    city: m.city || 'Baie-Mahault',
                    location: m.location || 'guadeloupe',
                    rating: m.rating || 4.9,
                    reviewsCount: m.reviewsCount || 12,
                    completed_missions_count: m.completedMissions || 15,
                    is_verified_pro: m.badge === 'Artisan Vérifié' || m.isVerified === true,
                    skills: m.skills || m.keywords || [],
                    bio: m.bio || '',
                    subscription_plan: m.subscription_plan || 'FREE',
                    source: 'DEMO'
                });
            });
        }

        // 2. Invoke LyannSearchEngine.performUniversalSearch
        let publicCards = [];
        let isZeroResult = false;

        if (window.LyannSearchEngine && typeof window.LyannSearchEngine.performUniversalSearch === 'function') {
            const searchOptions = {
                location: cityVal || territoryVal,
                verifiedProOnly: false
            };
            const searchRes = window.LyannSearchEngine.performUniversalSearch(rawQuery, candidatesList, searchOptions, callingUserId);
            publicCards = searchRes.results || [];
            isZeroResult = searchRes.is_zero_result === true;
        } else {
            // Fallback filtering if LyannSearchEngine script is absent
            const normQ = rawQuery.toLowerCase();
            publicCards = candidatesList.filter(m => {
                if (!normQ) return true;
                const candText = `${m.name} ${m.role} ${m.bio} ${(m.skills || []).join(' ')}`.toLowerCase();
                return candText.includes(normQ);
            }).map(c => ({
                id: c.id,
                display_name: c.name,
                avatar: c.avatar,
                role: c.role,
                city: c.city,
                rating: c.rating,
                reviews_count: c.reviewsCount,
                bio: c.bio,
                is_verified_pro: c.is_verified_pro,
                source: c.source || 'SUPABASE',
                relevance_score: normQ ? 40 : 0,
                matched_fields: ['text_fallback'],
                total_score: 50
            }));
            isZeroResult = publicCards.length === 0;
        }

        // Filter by DOM category select if selected
        if (selectedCategory && selectedCategory !== 'all') {
            publicCards = publicCards.filter(c => {
                const candCat = (c.category || c.role || '').toLowerCase();
                return candCat.includes(selectedCategory.toLowerCase());
            });
        }

        // Filter by location (territory/city)
        if (territoryVal) {
            const territoryMap = {
                'guadeloupe': ['guadeloupe', '971', 'baie-mahault', 'les abymes', 'le gosier', 'sainte-anne', 'pointe-à-pitre', 'basse-terre', 'le moule', 'petit-bourg', 'trois-rivières', 'sainte-rose'],
                'martinique': ['martinique', '972', 'fort-de-france', 'le lamentin', 'schœlcher', 'le robert', 'sainte-marie'],
                'guyane': ['guyane', '973', 'cayenne', 'kourou', 'saint-laurent-du-maroni'],
                'reunion': ['reunion', 'réunion', '974', 'saint-denis', 'saint-paul', 'saint-pierre'],
                'saint-martin': ['saint-martin', 'st-martin', '978', 'marigot']
            };
            const allowedCities = territoryMap[territoryVal.toLowerCase()] || [territoryVal.toLowerCase()];
            publicCards = publicCards.filter(c => {
                const candCity = (c.city || c.location || '').toLowerCase();
                return allowedCities.some(loc => candCity.includes(loc) || loc.includes(candCity));
            });
        }

        if (cityVal) {
            publicCards = publicCards.filter(c => {
                const candCity = (c.city || '').toLowerCase();
                return candCity.includes(cityVal.toLowerCase()) || cityVal.toLowerCase().includes(candCity);
            });
        }

        // Apply Sorting
        if (selectedSort === 'reviews') {
            publicCards.sort((a, b) => (b.reviews_count || 0) - (a.reviews_count || 0));
        } else if (selectedSort === 'city') {
            publicCards.sort((a, b) => (a.city || '').localeCompare(b.city || ''));
        } else if (selectedSort === 'name') {
            publicCards.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
        }

        // SEARCH DEBUG — DEV ONLY
        if (isDevDebug && publicCards.length > 0) {
            console.group(`🔍 [SEARCH DEBUG] Query: "${rawQuery}" | Found: ${publicCards.length}`);
            publicCards.forEach(c => {
                console.log(`[SEARCH DEBUG] profile_id: ${c.id} | source: ${c.source || 'SUPABASE'} | relevance_score: ${c.relevance_score || 0} | matched_fields: ${JSON.stringify(c.matched_fields || [])} | total_score: ${c.total_score || 0}`);
            });
            console.groupEnd();
        }

        // Update Summary Badge
        if (summaryBadge) {
            const locLabel = locationSelect ? locationSelect.options[locationSelect.selectedIndex].text : 'Guadeloupe';
            const cityLabel = cityVal ? `, ${cityVal}` : '';
            const qLabel = rawQuery ? ` pour « <strong>${escapeSearchHtml(rawQuery)}</strong> »` : '';
            summaryBadge.innerHTML = `<i class="ph ph-sliders"></i> <strong>${publicCards.length}</strong> membre(s) trouvé(s) à <strong>${escapeSearchHtml(locLabel)}${escapeSearchHtml(cityLabel)}</strong>${qLabel}`;
        }

        // 3. Render Results or Zero Result UI
        if (publicCards.length === 0) {
            renderZeroResultUI(container, rawQuery);
        } else {
            container.innerHTML = publicCards.map(c => renderTalentCard(c)).join('');
            bindDynamicTalentCards();
        }

        // Scroll to results section on manual search click
        const path = window.location.pathname || '';
        if (userTriggered && path.includes('results.html')) {
            const resultsSection = document.querySelector('.results-main-section');
            if (resultsSection) {
                resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }


    // Bind location select change
    const locationSelect = document.getElementById('locationSelect');
    if (locationSelect) {
        locationSelect.addEventListener('change', () => {
            updateCityDropdown();
            performSearch(false);
        });
        updateCityDropdown();
    }

    // Bind city select change
    const citySelect = document.getElementById('citySelect');
    if (citySelect) {
        citySelect.addEventListener('change', () => performSearch(false));
    }

    // Bind search toolbar selects
    const searchSortSelect = document.getElementById('searchSortSelect');
    if (searchSortSelect) {
        searchSortSelect.addEventListener('change', () => performSearch(false));
    }

    const modalCategoryFilterSelect = document.getElementById('modalCategoryFilterSelect');
    if (modalCategoryFilterSelect) {
        modalCategoryFilterSelect.addEventListener('change', () => performSearch(false));
    }

    // Bind form submit (Click "Trouver" or Press Enter)
    const heroSearchForm = document.getElementById('heroSearchForm');
    if (heroSearchForm) {
        heroSearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            performSearch(true);
        });
    }

    // Bind Enter key in search input explicitly
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performSearch(true);
            }
        });
    }

    // STEP 17 DUAL INTENT & EXAMPLE CHIPS BINDINGS
    function setupStep17SearchV2() {
        document.querySelectorAll('#btnIntentSearch, [data-intent="search"]').forEach(btnSearch => {
            btnSearch.addEventListener('click', () => {
                const parentContainer = btnSearch.closest('.hero-content, .results-hero-content') || document;
                const btnNeed = parentContainer.querySelector('#btnIntentNeed, [data-intent="need"]');
                const searchPanel = parentContainer.querySelector('#parcoursSearchPanel') || document.getElementById('parcoursSearchPanel');
                const needPanel = parentContainer.querySelector('#parcoursNeedPanel') || document.getElementById('parcoursNeedPanel');

                btnSearch.classList.add('active');
                if (btnNeed) btnNeed.classList.remove('active');
                if (searchPanel) searchPanel.style.display = 'block';
                if (needPanel) needPanel.style.display = 'none';
            });
        });

        document.querySelectorAll('#btnIntentNeed, [data-intent="need"]').forEach(btnNeed => {
            btnNeed.addEventListener('click', () => {
                const parentContainer = btnNeed.closest('.hero-content, .results-hero-content') || document;
                const btnSearch = parentContainer.querySelector('#btnIntentSearch, [data-intent="search"]');
                const searchPanel = parentContainer.querySelector('#parcoursSearchPanel') || document.getElementById('parcoursSearchPanel');
                const needPanel = parentContainer.querySelector('#parcoursNeedPanel') || document.getElementById('parcoursNeedPanel');

                btnNeed.classList.add('active');
                if (btnSearch) btnSearch.classList.remove('active');
                if (needPanel) needPanel.style.display = 'block';
                if (searchPanel) searchPanel.style.display = 'none';
            });
        });

        // Bind example chips in Parcours A
        document.querySelectorAll('.example-chip').forEach(chip => {
            if (chip.dataset.bound === 'true') return;
            chip.dataset.bound = 'true';
            chip.addEventListener('click', () => {
                const query = chip.getAttribute('data-search');
                const searchInput = document.getElementById('searchInput');
                if (searchInput && query) {
                    searchInput.value = query;
                    performSearch(true);
                }
            });
        });

        // Bind need quick chips in Parcours B
        document.querySelectorAll('.need-example-chip').forEach(chip => {
            if (chip.dataset.bound === 'true') return;
            chip.dataset.bound = 'true';
            chip.addEventListener('click', () => {
                const needText = chip.getAttribute('data-need');
                if (typeof window.openLyannWizard === 'function') {
                    window.openLyannWizard(needText);
                }
            });
        });

        // Bind launch need wizard button
        document.querySelectorAll('#btnLaunchNeedWizard').forEach(btnLaunchNeed => {
            if (btnLaunchNeed.dataset.bound === 'true') return;
            btnLaunchNeed.dataset.bound = 'true';
            btnLaunchNeed.addEventListener('click', () => {
                if (typeof window.openLyannWizard === 'function') {
                    window.openLyannWizard();
                }
            });
        });

    }

    setupStep17SearchV2();

    // Pre-fill search inputs on load if present in query string
    const searchUrlParams = new URLSearchParams(window.location.search);
    if (searchUrlParams.has('searchInput') || searchUrlParams.has('locationSelect') || searchUrlParams.has('citySelect') || searchUrlParams.has('category')) {
        const q = searchUrlParams.get('searchInput') || '';
        const loc = searchUrlParams.get('locationSelect') || searchUrlParams.get('category') || '';
        const city = searchUrlParams.get('citySelect') || '';
        
        if (searchInput) searchInput.value = q;
        
        if (locationSelect && loc) {
            const options = Array.from(locationSelect.options).map(o => o.value);
            if (options.includes(loc.toLowerCase())) {
                locationSelect.value = loc.toLowerCase();
                updateCityDropdown();
            }
        }
        
        setTimeout(() => {
            if (citySelect && city) citySelect.value = city;
            performSearch(false);
        }, 100);
    } else {
        // Initial search to display members on results.html by default
        const path = window.location.pathname || '';
        if (path.includes('results.html')) {
            performSearch(false);
        }
    }

});
// --- TEST ZONE: Reset Local Data ---
window.resetLocalData = function() {
    window.lyannConfirm("Voulez-vous vraiment effacer TOUTES les données locales pour repartir à zéro ?").then(confirmed => { if (confirmed) {
        localStorage.clear();
        sessionStorage.clear();
        window.lyannAlert("Tout a été effacé avec succès. La page va se recharger.");
        window.location.reload();
    }});
};

/* ==========================================================================
   WIZARD : BESOIN D'UN COUP DE MAIN
   ========================================================================== */
safeDomReady(() => {
    const modalRequestHelp = document.getElementById('modal-request-help');
    const openRequestTriggers = document.querySelectorAll('.open-request-help-trigger');
    const closeBtn = modalRequestHelp ? modalRequestHelp.querySelector('.modal-close-btn') : null;
    
    if(!modalRequestHelp) return;

    let currentStep = 1;
    const totalSteps = 6;
    const btnNext = document.getElementById('wizardBtnNext');
    const btnPrev = document.getElementById('wizardBtnPrev');
    const btnSubmit = document.getElementById('wizardBtnSubmit');
    const progressBar = modalRequestHelp.querySelector('.wizard-progress-fill');
    
    const steps = modalRequestHelp.querySelectorAll('.wizard-step');

    window.openLyannWizard = function(prefillQuery = null) {
        if(modalRequestHelp) {
            modalRequestHelp.classList.add('active');
            document.body.style.overflow = 'hidden';
            goToStep(1);
            if (prefillQuery && typeof prefillQuery === 'string') {
                const wizardDescInput = document.getElementById('wizardDescInput');
                if (wizardDescInput) {
                    wizardDescInput.value = prefillQuery;
                }
            }
        }
    };

    openRequestTriggers.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            window.openLyannWizard();
        });
    });

    if (window.location.search.includes('openWizard=true')) {
        setTimeout(() => {
            if (window.openLyannWizard) window.openLyannWizard();
        }, 300);
    }

    if(closeBtn) {
        closeBtn.addEventListener('click', () => {
            modalRequestHelp.classList.remove('active');
            document.body.style.overflow = '';
        });
    }

    function goToStep(step) {
        // Hide all
        steps.forEach(s => {
            s.style.display = 'none';
            s.classList.remove('active', 'fade-in');
        });
        
        // Show target
        const target = modalRequestHelp.querySelector(`.wizard-step[data-step="${step}"]`);
        if(target) {
            target.style.display = 'block';
            // slight delay for animation
            setTimeout(() => target.classList.add('active', 'fade-in'), 10);
        }

        currentStep = step;
        
        // Update progress bar
        if(progressBar) {
            progressBar.style.width = `${(currentStep / totalSteps) * 100}%`;
        }

        // Update buttons
        btnPrev.style.visibility = currentStep > 1 ? 'visible' : 'hidden';
        
        if (currentStep === totalSteps) {
            btnNext.style.display = 'none';
            btnSubmit.style.display = 'block';
            
            // Populate summary
            const desc = document.getElementById('wizardDescInput').value;
            const summaryDesc = document.getElementById('wizardSummaryDesc');
            if(summaryDesc) summaryDesc.textContent = desc ? `"${desc}"` : `"J'ai besoin d'aide pour..."`;

            const wizardCitySelect = document.getElementById('wizardCitySelect');
            const wizardTerritorySelect = document.getElementById('wizardTerritorySelect');
            const summaryCity = document.getElementById('wizardSummaryCity');
            if (summaryCity && wizardCitySelect) {
                const city = wizardCitySelect.value || 'Les Abymes';
                const terrName = (wizardTerritorySelect && wizardTerritorySelect.options[wizardTerritorySelect.selectedIndex]) 
                    ? wizardTerritorySelect.options[wizardTerritorySelect.selectedIndex].text 
                    : 'Guadeloupe (971)';
                summaryCity.innerHTML = `<i class="ph ph-map-pin"></i> ${city} (${terrName})`;
            }
            
        } else {
            btnNext.style.display = 'block';
            btnSubmit.style.display = 'none';
        }
    }

    // --- BUG 2 FIX : PHOTOS ---
    const wizardPhotoUploadZone = document.getElementById('wizardPhotoUploadZone');
    const wizardPhotoInput = document.getElementById('wizardPhotoInput');
    const wizardPhotoPlaceholder = document.getElementById('wizardPhotoPlaceholder');
    const wizardPhotoPreviewContainer = document.getElementById('wizardPhotoPreviewContainer');
    
    if (wizardPhotoUploadZone && wizardPhotoInput) {
        wizardPhotoUploadZone.addEventListener('click', (e) => {
            // Prevent triggering again if clicking on the input itself or remove buttons
            if (e.target !== wizardPhotoInput && !e.target.closest('.photo-remove-btn')) {
                wizardPhotoInput.click();
            }
        });

        wizardPhotoInput.addEventListener('change', () => {
            wizardPhotoPreviewContainer.innerHTML = '';
            if (wizardPhotoInput.files && wizardPhotoInput.files.length > 0) {
                wizardPhotoPlaceholder.style.display = 'none';
                wizardPhotoPreviewContainer.style.display = 'flex';
                
                Array.from(wizardPhotoInput.files).forEach((file) => {
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const imgContainer = document.createElement('div');
                            imgContainer.style.position = 'relative';
                            
                            const img = document.createElement('img');
                            img.src = e.target.result;
                            img.style.cssText = "width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border);";
                            
                            const removeBtn = document.createElement('div');
                            removeBtn.innerHTML = '&times;';
                            removeBtn.className = 'photo-remove-btn';
                            removeBtn.style.cssText = "position: absolute; top: -5px; right: -5px; background: #E74C3C; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; cursor: pointer; line-height: 1;";
                            removeBtn.onclick = (ev) => {
                                ev.stopPropagation(); // prevent opening file picker
                                imgContainer.remove();
                                if (wizardPhotoPreviewContainer.children.length === 0) {
                                    wizardPhotoPlaceholder.style.display = 'block';
                                    wizardPhotoPreviewContainer.style.display = 'none';
                                    wizardPhotoInput.value = ''; // clear input
                                }
                            };
                            
                            imgContainer.appendChild(img);
                            imgContainer.appendChild(removeBtn);
                            wizardPhotoPreviewContainer.appendChild(imgContainer);
                        };
                        reader.readAsDataURL(file);
                    }
                });
            } else {
                wizardPhotoPlaceholder.style.display = 'block';
                wizardPhotoPreviewContainer.style.display = 'none';
            }
        });
    }

    // --- BUG 3 FIX : BUDGET ---
    const budgetRadios = document.getElementsByName('wizardBudget');
    const wizardBudgetInputContainer = document.getElementById('wizardBudgetInputContainer');
    const wizardBudgetInput = document.getElementById('wizardBudgetInput');
    
    if (budgetRadios && budgetRadios.length > 0 && wizardBudgetInput) {
        budgetRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === 'fixe') {
                    wizardBudgetInput.disabled = false;
                    if (wizardBudgetInputContainer) wizardBudgetInputContainer.style.opacity = '1';
                } else {
                    wizardBudgetInput.disabled = true;
                    wizardBudgetInput.value = '';
                    if (wizardBudgetInputContainer) wizardBudgetInputContainer.style.opacity = '0.5';
                }
            });
        });
        
        // Prevent negative values
        wizardBudgetInput.addEventListener('input', () => {
            if (wizardBudgetInput.value < 0) {
                wizardBudgetInput.value = '';
            }
        });
    }

    // Dynamic Commune selector for Wizard
    const wizardTerritorySelect = document.getElementById('wizardTerritorySelect');
    const wizardCitySelect = document.getElementById('wizardCitySelect');
    if (wizardTerritorySelect && wizardCitySelect) {
        wizardTerritorySelect.addEventListener('change', () => {
            const terr = wizardTerritorySelect.value || 'guadeloupe';
            const cities = TERRITORY_CITIES[terr] || TERRITORY_CITIES.guadeloupe;
            wizardCitySelect.innerHTML = '';
            cities.forEach((c, idx) => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                if (idx === 0) opt.selected = true;
                wizardCitySelect.appendChild(opt);
            });
        });
    }

    if(btnNext) {
        btnNext.addEventListener('click', async () => {
            if (currentStep === 1) {
                const rawDomDesc = document.getElementById('wizardDescInput')?.value;
                const desc = (rawDomDesc || '').trim();

                console.log('[REAL NEXT] step before =', currentStep);
                console.log('[REAL NEXT] description DOM =', rawDomDesc);
                console.log('[REAL NEXT] stored description =', desc);
                console.log('[REAL NEXT] LyanAI =', !!window.LyanAI);

                if (!desc) {
                    alert("Veuillez décrire votre besoin.");
                    return;
                }
                
                // Show loader
                const originalText = btnNext.innerHTML;
                btnNext.innerHTML = '<i class="ph ph-spinner ph-spin"></i> LYANN organise...';
                btnNext.disabled = true;

                try {
                    window.__REAL_CLASSIFY_COUNT = (window.__REAL_CLASSIFY_COUNT || 0) + 1;
                    console.log('[REAL CLASSIFY COUNT]', window.__REAL_CLASSIFY_COUNT);
                    console.log('[REAL CLASSIFY INPUT]', desc);

                    const result = await window.LyanAI.classifyNeed(desc);
                    console.log('[REAL CLASSIFY OUTPUT]', result);

                    if (result.needs_clarification && desc.length < 5) {
                        alert("Précision requise : " + (result.clarification_question || "Veuillez donner quelques précisions sur votre besoin."));
                        btnNext.innerHTML = originalText;
                        btnNext.disabled = false;
                        return; // stay on step 1
                    }

                    const domainSelect = document.getElementById('wizardDomain');
                    const catSelect = document.getElementById('wizardCategory');
                    const subCatSelect = document.getElementById('wizardSubCat');

                    window.__REAL_SYNC_COUNT = (window.__REAL_SYNC_COUNT || 0) + 1;
                    console.log('[REAL SYNC COUNT]', window.__REAL_SYNC_COUNT);
                    console.log('[REAL SYNC INPUT]', result);

                    // Dynamically synchronize Step 10 taxonomy dropdowns
                    const syncRes = await window.syncWizardTaxonomyDropdowns(result);

                    console.log('[REAL SYNC OUTPUT]', {
                        domain: domainSelect ? domainSelect.value : null,
                        category: catSelect ? catSelect.value : null,
                        subcategory: subCatSelect ? subCatSelect.value : null
                    });

                    // Show Step 10 classification banner (WITHOUT PUBLIC CONFIDENCE PERCENTAGE)
                    const step2 = document.querySelector('#modal-request-help .wizard-step[data-step="2"]');
                    if (step2) {
                        const bannerId = 'ai-classification-banner';
                        let banner = document.getElementById(bannerId);
                        if (!banner) {
                            banner = document.createElement('div');
                            banner.id = bannerId;
                            banner.style.cssText = "background: rgba(74, 124, 89, 0.08); border: 1px solid rgba(74, 124, 89, 0.3); padding: 14px 16px; border-radius: 12px; margin-bottom: 20px; font-size: 0.92rem; color: #1F3827; display: flex; align-items: center; gap: 10px;";
                            step2.insertBefore(banner, step2.firstChild);
                        }

                        if (result && result.classification_status === 'CLASSIFIED') {
                            banner.style.background = "rgba(74, 124, 89, 0.08)";
                            banner.style.borderColor = "rgba(74, 124, 89, 0.3)";
                            banner.style.color = "#1F3827";
                            banner.innerHTML = `<i class="ph-fill ph-check-circle" style="color: #4A7C59; font-size: 1.25rem; flex-shrink: 0;"></i> <div><b>Nous avons compris :</b> ${window.escapeSearchHtml(result.title)}</div>`;
                        } else {
                            banner.style.background = "#FFF9EC";
                            banner.style.borderColor = "rgba(229, 179, 69, 0.4)";
                            banner.style.color = "#8A6405";
                            banner.innerHTML = `<i class="ph-fill ph-info" style="color: #E5B345; font-size: 1.25rem; flex-shrink: 0;"></i> <div><b>Demande enregistrée :</b> ${window.escapeSearchHtml(result ? result.title : desc)} <span style="font-size:0.85rem; color: var(--text-muted); font-weight:400; display: block; margin-top:2px;">Vous pouvez adapter le domaine ci-dessous si souhaité.</span></div>`;
                        }
                    }

                    btnNext.innerHTML = originalText;
                    btnNext.disabled = false;
                    goToStep(2);

                    if (domainSelect) console.log('[STEP17 OPTIONS DOMAIN]', Array.from(domainSelect.options).map(o => [o.value, o.selected]));
                    if (catSelect) console.log('[STEP17 OPTIONS CATEGORY]', Array.from(catSelect.options).map(o => [o.value, o.selected]));
                    if (subCatSelect) console.log('[STEP17 OPTIONS SUBCAT]', Array.from(subCatSelect.options).map(o => [o.value, o.selected]));

                    setTimeout(() => {
                        console.log('FINAL +500ms :', (domainSelect ? domainSelect.value : ''), '/', (catSelect ? catSelect.value : ''), '/', (subCatSelect ? subCatSelect.value : ''));
                    }, 500);

                    setTimeout(() => {
                        console.log('FINAL +1500ms :', (domainSelect ? domainSelect.value : ''), '/', (catSelect ? catSelect.value : ''), '/', (subCatSelect ? subCatSelect.value : ''));
                    }, 1500);
                } catch (e) {
                    console.error("AI Error:", e);
                    btnNext.innerHTML = originalText;
                    btnNext.disabled = false;

                    // Distinguish classification failure from JS runtime error
                    if (e instanceof ReferenceError || e instanceof TypeError || e instanceof SyntaxError) {
                        // Runtime/code bug — do NOT silently fall back to wrong taxonomy
                        console.error('[WIZARD RUNTIME ERROR] A code error occurred after classification. NOT masking with fallback taxonomy.', e);
                        if (window.NotificationService) {
                            window.NotificationService.showToast('error', "Erreur technique interne. Veuillez réessayer.");
                        } else {
                            alert("Erreur technique interne. Veuillez réessayer.");
                        }
                        // Stay on current step — do NOT goToStep(2) with wrong values
                    } else {
                        // Classification failure or network error — proceed with fallback
                        console.warn('[WIZARD CLASSIFICATION FALLBACK]', { source: 'btnNext_catch', error: e.message || e });
                        goToStep(2);
                    }
                }
            } else if (currentStep < totalSteps) {
                goToStep(currentStep + 1);
            }
        });
    }

    if(btnPrev) {
        btnPrev.addEventListener('click', () => {
            if (currentStep > 1) goToStep(currentStep - 1);
        });
    }

    if(btnSubmit) {
        btnSubmit.addEventListener('click', async (e) => {
            e.preventDefault();
            
            // Check API Client
            if (!window.LYANN_API_CLIENT) {
                alert("Erreur système : API Client indisponible.");
                return;
            }

            const currentUser = await window.LYANN_API_CLIENT.getCurrentUser();
            if (!currentUser) {
                if (window.NotificationService) {
                    window.NotificationService.showToast('warning', "Veuillez vous connecter pour publier votre besoin.");
                }
                modalRequestHelp.classList.remove('active');
                document.body.style.overflow = '';
                const authModal = document.getElementById('authModal');
                if (authModal) authModal.classList.add('active');
                return;
            }

            // Extract form inputs
            const desc = document.getElementById('wizardDescInput')?.value?.trim() || '';
            const categorySelect = document.getElementById('wizardCategory');
            const categoryText = categorySelect ? (categorySelect.options[categorySelect.selectedIndex]?.text || categorySelect.value) : 'Général';

            const subCatSelect = document.getElementById('wizardSubCat');
            const subCatText = subCatSelect ? (subCatSelect.options[subCatSelect.selectedIndex]?.text || subCatSelect.value) : '';
            
            const territorySelect = document.getElementById('wizardTerritorySelect');
            const territoryVal = territorySelect ? (territorySelect.options[territorySelect.selectedIndex]?.text || territorySelect.value) : '971 - Guadeloupe';
            
            const citySelect = document.getElementById('wizardCitySelect');
            const cityVal = citySelect ? citySelect.value : 'Le Gosier';

            const urgencySelect = document.getElementById('wizardDateType');
            const urgencyVal = urgencySelect ? urgencySelect.value : 'flexible';

            // Budget handling
            let budgetVal = null;
            const budgetRadios = document.getElementsByName('wizardBudget');
            let selectedBudgetChoice = 'devis';
            for (const r of budgetRadios) {
                if (r.checked) {
                    selectedBudgetChoice = r.value;
                    break;
                }
            }

            if (selectedBudgetChoice === 'fixe') {
                const budgetInput = document.querySelector('#modal-request-help input[type="number"]');
                if (budgetInput && budgetInput.value) {
                    budgetVal = parseFloat(budgetInput.value);
                }
            }

            const title = subCatText ? `${categoryText} - ${subCatText}` : categoryText;
            const location = `${cityVal} (${territoryVal})`;

            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<i class="ph ph-spinner spin"></i> Publication...';

            try {
                // Call real Supabase DB API
                const createdRequest = await window.LYANN_API_CLIENT.createRequest({
                    title: title,
                    description: desc,
                    category: categoryText,
                    location: location,
                    budget: budgetVal,
                    urgency: urgencyVal,
                    status: 'OPEN'
                });

                console.log("✅ Real Request successfully inserted into Supabase DB:", createdRequest);

                const descInput = document.getElementById('wizardDescInput');
                if (descInput) descInput.value = '';

                // Automatic invitation dispatch to matching candidates or targeted candidate
                let insertedCount = 0;
                try {
                    let recipientIds = [];
                    if (window._lyannTargetLyanneurId) {
                        recipientIds = [window._lyannTargetLyanneurId];
                        window._lyannTargetLyanneurId = null;
                    } else {
                        const candidates = await fetchCandidatesForPostPublishMatching();
                        if (window.LyannMatchingEngine) {
                            const matchRes = window.LyannMatchingEngine.findMatchingLyanneursForNeed(createdRequest, candidates);
                            if (matchRes && matchRes.lyanneurs) {
                                recipientIds = matchRes.lyanneurs.map(c => c.user_id || c.candidate_id).filter(Boolean);
                            }
                        }
                    }

                    if (recipientIds.length > 0 && createdRequest && createdRequest.id) {
                        const inviteRes = await window.LYANN_API_CLIENT.sendRequestInvitations(createdRequest.id, recipientIds);
                        insertedCount = inviteRes ? (inviteRes.inserted_count || 0) : 0;
                    }
                } catch (inviteErr) {
                    console.warn("Notice: Invitation dispatch info:", inviteErr);
                }

                // Show success toast
                if (window.NotificationService) {
                    window.NotificationService.showToast('success', "Ton besoin a été publié avec succès !");
                }

                // Dispatch global event and update UI
                window.dispatchEvent(new CustomEvent('lyann_request_created', { detail: createdRequest }));

                if (typeof window.loadUserRequestsUI === 'function') {
                    await window.loadUserRequestsUI();
                }

                // ÉCRAN APRÈS PUBLICATION V2 : RÉSUMÉ ET CONFIRMATION BDD
                await showWizardPostPublishStep(createdRequest, insertedCount);

            } catch (err) {
                console.error("❌ Erreur publication demande Supabase:", err);
                if (window.NotificationService) {
                    window.NotificationService.showToast('error', "Erreur lors de la publication : " + (err.message || "Erreur serveur"));
                } else {
                    alert("Erreur lors de la publication : " + (err.message || "Erreur serveur"));
                }
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = 'Publier mon besoin <i class="ph ph-paper-plane-right"></i>';
            }
        });
    }
});

// --- HELPER CANDIDATES FETCH FOR POST PUBLISH MATCHING ---
async function fetchCandidatesForPostPublishMatching() {
    let list = [];
    try {
        if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
            const currentUser = await window.LYANN_API_CLIENT.getCurrentUser().catch(() => null);
            const currentUserId = currentUser ? currentUser.id : null;

            const { data: dbProfiles } = await window.LYANN_API_CLIENT.supabase
                .from('profiles')
                .select('*')
                .neq('id', currentUserId || '00000000-0000-0000-0000-000000000000');

            if (dbProfiles && dbProfiles.length > 0) {
                list = dbProfiles.map(p => ({
                    id: p.id,
                    candidate_id: p.id,
                    user_id: p.id,
                    name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Lyanneur',
                    display_name: `${p.first_name || 'Lyanneur'} ${(p.last_name || '').charAt(0)}.`.trim(),
                    avatar: p.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.id}`,
                    role: p.headline || p.activity || 'Services',
                    category: p.category || p.activity || 'general',
                    city: p.city || p.location || 'Guadeloupe',
                    rating: p.rating || 5.0,
                    reviewsCount: p.reviews_count || 0,
                    skills: p.skills || [],
                    bio: p.bio || ''
                }));
            }
        }
    } catch (e) {
        console.warn("Candidates fetch error:", e);
    }
    return list;
}

// --- ÉCRAN APRÈS PUBLICATION V2 : RÉSUMÉ & STATUT INVITATIONS REAL BDD ---
async function showWizardPostPublishStep(createdRequest, insertedCount = 0) {
    const wizardModal = document.getElementById('modal-request-help') || document.getElementById('wizardModal');
    if (!wizardModal) return;

    const modalBody = wizardModal.querySelector('.modal-body') || document.getElementById('wizardModalBody');
    const modalFooter = wizardModal.querySelector('.modal-footer') || document.getElementById('wizardModalFooter');
    if (!modalBody || !modalFooter) return;

    const steps = modalBody.querySelectorAll('.wizard-step, .wiz-step');
    steps.forEach(s => s.style.display = 'none');

    let stepPost = modalBody.querySelector('.wizard-step[data-step="post-publish"], #wizStepPostPublish');
    if (!stepPost) {
        stepPost = document.createElement('div');
        stepPost.className = 'wizard-step';
        stepPost.setAttribute('data-step', 'post-publish');
        stepPost.style.padding = '24px';
        modalBody.appendChild(stepPost);
    }
    stepPost.style.display = 'block';

    const progressFill = wizardModal.querySelector('.wizard-progress-fill');
    if (progressFill) progressFill.style.width = '100%';

    const titleStr = createdRequest.title || createdRequest.description || 'Besoin';
    const budgetStr = createdRequest.budget ? `${createdRequest.budget} €` : 'Sur devis';
    const locStr = createdRequest.location || 'Guadeloupe';

    const countNum = Number(insertedCount) || 0;
    const notificationMsg = countNum > 0
        ? `Nous l'avons également partagé à <strong>${countNum} Lyanneur${countNum > 1 ? 's' : ''}</strong> correspondant à ton besoin.`
        : `Ton besoin est maintenant visible dans le Bokantaj. Aucun Lyanneur direct n'a encore été notifié.`;

    stepPost.innerHTML = `
        <div style="text-align: center; padding: 10px 0;">
            <div style="width: 60px; height: 60px; background: rgba(74, 124, 89, 0.14); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 14px;">
                <i class="ph-fill ph-check-circle" style="font-size: 36px; color: var(--primary);"></i>
            </div>
            <h3 style="font-size: 1.35rem; font-weight: 800; color: var(--primary-dark); margin: 0 0 6px 0;">Ton Lyann est publié !</h3>
            <p style="font-size: 0.88rem; color: var(--text-muted); margin: 0 0 20px 0;">Ton besoin est maintenant partagé dans le Bokantaj.</p>
            
            <div style="background: #FFFFFF; border: 1.5px solid #E2E8F0; border-radius: 16px; padding: 18px; text-align: left; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <h5 style="margin: 0; font-size: 1.05rem; font-weight: 800; color: #1E2822;">${escapeSearchHtml(titleStr)}</h5>
                    <span style="font-weight: 800; font-size: 1.1rem; color: var(--primary);">${budgetStr}</span>
                </div>
                <div style="font-size: 0.84rem; color: #64748B; display: flex; gap: 14px; align-items: center;">
                    <span><i class="ph ph-map-pin"></i> ${escapeSearchHtml(locStr)}</span>
                    <span class="status-pill" style="font-weight: 700; color: var(--primary);">● ${createdRequest.status || 'OPEN'}</span>
                </div>
            </div>

            <div style="background: ${countNum > 0 ? '#EBF3EE' : '#FAF7F2'}; border: 1px solid ${countNum > 0 ? 'rgba(74, 124, 89, 0.3)' : '#E5DFD5'}; border-radius: 14px; padding: 14px; margin-bottom: 24px; font-size: 0.92rem; color: ${countNum > 0 ? '#2D5A39' : '#5C6E62'}; font-weight: 600;">
                <i class="${countNum > 0 ? 'ph-bold ph-paper-plane-tilt' : 'ph-bold ph-info'}" style="margin-right: 6px;"></i>
                ${notificationMsg}
            </div>
        </div>
    `;

    modalFooter.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
            <button type="button" class="btn btn-primary" id="btnPostPublishViewMyLyann" style="width: 100%; justify-content: center; font-weight: 800; font-size: 1rem; padding: 12px;">
                Voir mon Lyann <i class="ph ph-arrow-right"></i>
            </button>
            <button type="button" class="btn btn-outline" id="btnPostPublishGoBokantaj" style="width: 100%; justify-content: center; font-weight: 600; font-size: 0.9rem; padding: 10px;">
                Voir le Bokantaj
            </button>
        </div>
    `;

    const btnViewMyLyann = document.getElementById('btnPostPublishViewMyLyann');
    if (btnViewMyLyann) {
        btnViewMyLyann.onclick = (e) => {
            if (e) e.preventDefault();
            wizardModal.classList.remove('active');
            document.body.style.overflow = '';
            const targetReqId = createdRequest ? (createdRequest.id || createdRequest.request_id) : null;
            if (targetReqId && typeof window.openLyannDetailModal === 'function') {
                window.openLyannDetailModal(targetReqId);
            }
        };
    }

    const btnGoBokantaj = document.getElementById('btnPostPublishGoBokantaj');
    if (btnGoBokantaj) {
        btnGoBokantaj.onclick = (e) => {
            if (e) e.preventDefault();
            wizardModal.classList.remove('active');
            document.body.style.overflow = '';
            
            const feedSection = document.getElementById('flashFeedContainer') || document.querySelector('.feed-preview-section');
            if (feedSection) {
                if (typeof window.loadBokantajFeedFromSupabase === 'function') {
                    window.loadBokantajFeedFromSupabase();
                }
                feedSection.scrollIntoView({ behavior: 'smooth' });
            } else {
                window.location.assign('feed.html');
            }
        };
    }
}

// --- FICHE DÉTAILLÉE DU LYANN (MODAL FICHE LYANN) ---
window.openLyannDetailModal = async function(requestId) {
    let modal = document.getElementById('lyannDetailModal');
    if (!modal) {
        // Dynamically create modal if not present on page
        modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'lyannDetailModal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="modal-card" style="max-width: 540px; width: 90%; background: #FFF; border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.15); overflow: hidden; position: relative;">
                <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #E2E8F0; background: #FAFDFB;">
                    <div>
                        <span class="badge" id="lyannDetailBadge" style="background: rgba(74,124,89,0.12); color: var(--primary); font-weight: 700; font-size: 0.78rem; padding: 4px 10px; border-radius: 20px;">LYANN</span>
                        <h4 id="lyannDetailTitle" style="margin: 6px 0 0 0; font-size: 1.15rem; font-weight: 800; color: #1E2822;">Besoin d'entraide</h4>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span id="lyannDetailStatus" style="font-size: 0.8rem; font-weight: 700; color: var(--primary);">● OPEN</span>
                        <button type="button" class="modal-close" id="closeLyannDetailModalBtn" style="background: none; border: none; font-size: 1.4rem; cursor: pointer; color: #64748B;">&times;</button>
                    </div>
                </div>
                <div class="modal-body" id="lyannDetailBody" style="padding: 20px; max-height: 70vh; overflow-y: auto;"></div>
                <div class="modal-footer" id="lyannDetailFooter" style="padding: 14px 20px; border-top: 1px solid #E2E8F0; background: #F8FAFC;"></div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    const titleEl = document.getElementById('lyannDetailTitle');
    const badgeEl = document.getElementById('lyannDetailBadge');
    const statusEl = document.getElementById('lyannDetailStatus');
    const bodyEl = document.getElementById('lyannDetailBody');
    const footerEl = document.getElementById('lyannDetailFooter');

    if (bodyEl) {
        bodyEl.innerHTML = `
            <div style="text-align: center; padding: 30px;">
                <i class="ph ph-spinner spinner" style="font-size: 2rem; color: var(--primary);"></i>
                <p style="margin-top: 10px; color: var(--text-muted);">Chargement du Lyann...</p>
            </div>
        `;
    }

    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Close button handler
    const closeBtn = document.getElementById('closeLyannDetailModalBtn');
    if (closeBtn && !closeBtn.dataset.bound) {
        closeBtn.dataset.bound = 'true';
        closeBtn.onclick = () => {
            modal.style.display = 'none';
            modal.classList.remove('active');
            document.body.style.overflow = '';
        };
    }

    let requestData = null;
    let authorProf = null;

    if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
        try {
            const { data, error } = await window.LYANN_API_CLIENT.supabase
                .from('requests')
                .select('*, profiles:requester_id(first_name, last_name, avatar_url, city, territory)')
                .eq('id', requestId)
                .single();

            if (data && !error) {
                requestData = data;
                authorProf = data.profiles;
            }
        } catch (e) {
            console.warn("Detail Lyann Supabase error:", e);
        }
    }

    if (!requestData && typeof currentFlashPosts !== 'undefined') {
        const found = currentFlashPosts.find(p => (p.request_id === requestId || p.id === requestId));
        if (found) {
            requestData = {
                id: found.request_id || found.id,
                title: found.title || 'Besoin d\'entraide',
                description: found.content || found.description,
                category: found.category || 'Général',
                location: found.location || found.author_city,
                budget: found.budget,
                status: found.status || 'OPEN',
                created_at: found.created_at,
                requester_id: found.author_id
            };
            authorProf = {
                first_name: (found.author_name || '').split(' ')[0],
                last_name: (found.author_name || '').split(' ')[1] || '',
                avatar_url: found.author_avatar,
                city: found.author_city
            };
        }
    }

    if (!requestData) {
        if (bodyEl) bodyEl.innerHTML = '<div style="color: #DC2626; text-align: center; padding: 20px;">Impossible de charger ce Lyann.</div>';
        return;
    }

    const firstName = authorProf ? (authorProf.first_name || 'Lyanneur') : 'Lyanneur';
    const lastNameInit = authorProf && authorProf.last_name ? ` ${authorProf.last_name.charAt(0)}.` : '';
    const authorName = `${firstName}${lastNameInit}`;
    const authorAvatar = authorProf?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${requestData.requester_id}`;
    const locationStr = requestData.location || authorProf?.city || 'Guadeloupe';
    const dateStr = requestData.created_at ? new Date(requestData.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Récemment';

    if (titleEl) titleEl.textContent = requestData.title || 'Demande d\'entraide';
    if (badgeEl) badgeEl.innerHTML = `<i class="ph ph-hand-heart"></i> LYANN · ${requestData.category || 'Général'}`;
    if (statusEl) statusEl.textContent = `● ${requestData.status || 'OPEN'}`;

    const currentUserId = window.LYANN_API_CLIENT?.getCurrentUserId?.() || null;
    const isOwnLyann = currentUserId && requestData.requester_id === currentUserId;

    if (bodyEl) {
        let photosHTML = '';
        if (requestData.media_urls && requestData.media_urls.length > 0) {
            photosHTML = `
                <div style="display: flex; gap: 10px; margin-top: 14px; overflow-x: auto;">
                    ${requestData.media_urls.map(url => `<img src="${url}" style="max-height: 140px; border-radius: 10px; object-fit: cover;">`).join('')}
                </div>
            `;
        }

        let budgetHTML = '';
        if (requestData.budget) {
            budgetHTML = `
                <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 12px 16px; margin: 14px 0; display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: #64748B; font-weight: 600; font-size: 0.9rem;"><i class="ph ph-wallet"></i> Budget estimé</span>
                    <span style="font-size: 1.15rem; font-weight: 800; color: var(--primary-dark);">${requestData.budget} €</span>
                </div>
            `;
        }

        bodyEl.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #F1F5F9;">
                <img src="${authorAvatar}" alt="${authorName}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">
                <div>
                    <strong style="font-size: 1rem; color: #1E2822; display: block;">${authorName} <i class="ph-fill ph-check-circle" style="color: #4A7C59; font-size: 0.9rem;"></i></strong>
                    <span style="font-size: 0.85rem; color: #64748B;">📍 ${locationStr} • 🗓️ ${dateStr}</span>
                </div>
            </div>

            <div style="color: #334155; font-size: 0.96rem; line-height: 1.6; white-space: pre-wrap; margin-bottom: 12px;">
                ${escapeSearchHtml(requestData.description || requestData.title || '')}
            </div>

            ${budgetHTML}
            ${photosHTML}
        `;
    }

    if (footerEl) {
        if (isOwnLyann) {
            footerEl.innerHTML = `
                <button type="button" class="btn btn-outline" id="closeLyannDetailFooterBtn" style="flex: 1; justify-content: center;">Fermer</button>
                <button type="button" class="btn btn-primary" id="btnManageMyLyann" style="flex: 2; justify-content: center; font-weight: 800;">
                    <i class="ph ph-note-pencil"></i> Gérer mon Lyann
                </button>
            `;
            document.getElementById('closeLyannDetailFooterBtn')?.addEventListener('click', () => {
                modal.style.display = 'none';
                modal.classList.remove('active');
                document.body.style.overflow = '';
            });
            document.getElementById('btnManageMyLyann')?.addEventListener('click', () => {
                modal.style.display = 'none';
                modal.classList.remove('active');
                document.body.style.overflow = '';
                const requestsTabBtn = document.querySelector('[data-profile-tab="tab-requests"]');
                if (requestsTabBtn) requestsTabBtn.click();
                const userProfileModal = document.getElementById('modal-user-profile');
                if (userProfileModal) userProfileModal.classList.add('active');
            });
        } else {
            footerEl.innerHTML = `
                <button type="button" class="btn btn-outline" id="closeLyannDetailFooterBtn" style="flex: 1; justify-content: center;">Fermer</button>
                <button type="button" class="btn btn-primary" id="btnHelpLyannFromModal" style="flex: 2; justify-content: center; font-weight: 800;">
                    <i class="ph ph-hand-heart"></i> Je peux aider
                </button>
            `;
            document.getElementById('closeLyannDetailFooterBtn')?.addEventListener('click', () => {
                modal.style.display = 'none';
                modal.classList.remove('active');
                document.body.style.overflow = '';
            });
            document.getElementById('btnHelpLyannFromModal')?.addEventListener('click', () => {
                modal.style.display = 'none';
                modal.classList.remove('active');
                document.body.style.overflow = '';
                const currentAuthUserId = window.CURRENT_USER_ID || window.LYANN_CURRENT_USER?.id || window.LYANN_API_CLIENT?.getCurrentUserId?.();
                if (!currentAuthUserId) {
                    try {
                        sessionStorage.setItem('pending_lyann_help', JSON.stringify({
                            reqId: requestData.id,
                            requesterId: requestData.requester_id,
                            requesterName: authorName,
                            requesterAvatar: authorAvatar,
                            title: requestData.title
                        }));
                    } catch(e) {}
                    const loginModal = document.getElementById('loginModal');
                    if (loginModal) loginModal.classList.add('active');
                    return;
                }
                const myId = currentAuthUserId;
                const initialNeed = { requestId: requestData.id, requesterId: requestData.requester_id, helperId: myId, title: requestData.title };
                if (typeof window.openChatWithUser === 'function') {
                    window.openChatWithUser(authorName, authorAvatar, requestData.requester_id, initialNeed);
                }
            });
        }
    }
};


// --- RENDER USER REAL REQUESTS UNDER 'MES DEMANDES' ---
window.loadUserRequestsUI = async function() {
    const container = document.getElementById('myRequestsList');
    if (!container) return;

    if (!window.LYANN_API_CLIENT) return;

    const user = await window.LYANN_API_CLIENT.getCurrentUser();
    if (!user) {
        container.innerHTML = '<div class="empty-state-message">Connectez-vous pour voir vos demandes.</div>';
        return;
    }

    try {
        const requests = await window.LYANN_API_CLIENT.getRequests({ requester_id: user.id });
        if (!requests || requests.length === 0) {
            container.innerHTML = '<div class="empty-state-message">Vous n\'avez pas encore publié de demande.</div>';
            return;
        }

        let html = '<div class="user-requests-grid" style="display: grid; gap: 12px; margin-top: 10px;">';
        for (const req of requests) {
            const dateStr = req.created_at ? new Date(req.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Récemment';
            const budgetStr = req.budget ? `${req.budget} €` : 'Sur devis';

            html += `
                <div class="request-card-item" data-id="${req.id}" style="background: var(--surface, #fff); border: 1px solid var(--border, #e2e8f0); border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <div>
                            <span class="badge" style="background: #EBF3EE; color: #2D5A39; font-weight: 700; font-size: 0.75rem; padding: 4px 8px; border-radius: 6px; text-transform: uppercase;">${req.category || 'Besoin'}</span>
                            <h5 style="margin: 6px 0 2px 0; font-size: 1.05rem; font-weight: 700;">${req.title || 'Sans titre'}</h5>
                        </div>
                        <span style="font-weight: 800; font-size: 1.1rem; color: var(--primary, #2D5A39);">${budgetStr}</span>
                    </div>
                    <p style="font-size: 0.9rem; color: #4a5568; margin-bottom: 12px; line-height: 1.4;">${req.description || 'Pas de description'}</p>
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #718096; border-top: 1px solid #f0f0f0; padding-top: 8px;">
                        <span><i class="ph ph-map-pin"></i> ${req.location || 'Guadeloupe'}</span>
                        <span><i class="ph ph-clock"></i> ${dateStr}</span>
                        <span class="status-pill" style="font-weight: 700; color: #2b6cb0;">● ${req.status || 'OPEN'}</span>
                    </div>
                </div>
            `;
        }
        html += '</div>';
        container.innerHTML = html;

    } catch (e) {
        console.error("Erreur chargement demandes utilisateur:", e);
        container.innerHTML = '<div class="empty-state-message">Erreur de chargement des demandes.</div>';
    }
};

// --- RENDER LYANNEUR RECEIVED INVITATIONS UNDER 'DEMANDES REÇUES' ---
window.loadUserReceivedInvitationsUI = async function() {
    const container = document.getElementById('accountReceivedInvitationsContainer');
    const badgeSpan = document.getElementById('accountReceivedInvitationsBadge');

    if (!window.LYANN_API_CLIENT) return;

    try {
        const invitations = await window.LYANN_API_CLIENT.getReceivedInvitations();

        if (badgeSpan) {
            const pendingCount = invitations.filter(i => i.status === 'PENDING').length;
            badgeSpan.textContent = `${pendingCount} nouvelle(s) / ${invitations.length} au total`;
        }

        if (!container) return;

        if (!invitations || invitations.length === 0) {
            container.innerHTML = '<div class="empty-state-message" style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.88rem;">Vous n\'avez reçu aucune invitation pour le moment.</div>';
            return;
        }

        let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
        for (const inv of invitations) {
            const req = inv.requests || {};
            const requester = inv.requester || {};
            const requesterName = `${requester.first_name || 'Un utilisateur'} ${(requester.last_name || '').charAt(0)}.`.trim();
            const dateStr = inv.created_at ? new Date(inv.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
            const budgetStr = req.budget ? `${req.budget} €` : 'Sur devis';

            let statusBadgeHtml = '';
            let actionsHtml = '';

            if (inv.status === 'PENDING') {
                statusBadgeHtml = '<span style="background: #FFF8E1; color: #D4A843; font-weight: 700; font-size: 0.75rem; padding: 4px 8px; border-radius: 6px;">● En attente</span>';
                actionsHtml = `
                    <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
                        <button class="btn btn-outline btn-sm btn-inv-decline" data-inv-id="${inv.id}" style="color: #C95140; border-color: #CBD5E1; font-size: 0.82rem; padding: 6px 12px;">
                            <i class="ph ph-x"></i> Décliner
                        </button>
                        <button class="btn btn-primary btn-sm btn-inv-accept" data-inv-id="${inv.id}" data-req-title="${req.title || 'Demande'}" data-requester-name="${requesterName}" data-requester-id="${inv.requester_id}" style="background: var(--primary); font-weight: 800; font-size: 0.85rem; padding: 6px 14px;">
                            <i class="ph ph-hand-waving"></i> Je peux aider
                        </button>
                    </div>
                `;
            } else if (inv.status === 'ACCEPTED') {
                statusBadgeHtml = '<span style="background: #E8F5E9; color: #2E7D32; font-weight: 700; font-size: 0.75rem; padding: 4px 8px; border-radius: 6px;">✔ Acceptée</span>';
                actionsHtml = `
                    <div style="margin-top: 10px;">
                        <button class="btn btn-outline btn-sm btn-inv-open-chat" data-conv-id="${inv.conversation_id}" data-requester-name="${requesterName}" data-requester-id="${inv.requester_id}" style="font-size: 0.82rem; padding: 6px 12px; border-color: var(--primary); color: var(--primary);">
                            <i class="ph ph-chats-teardrop"></i> Ouvrir le Chat
                        </button>
                    </div>
                `;
            } else if (inv.status === 'DECLINED') {
                statusBadgeHtml = '<span style="background: #FFEBEE; color: #C95140; font-weight: 700; font-size: 0.75rem; padding: 4px 8px; border-radius: 6px;">✖ Déclinée</span>';
            }

            html += `
                <div class="received-invitation-card" style="background: #FFFFFF; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <img src="${requester.avatar_url || 'david-34.png'}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                            <div>
                                <strong style="font-size: 0.95rem; color: var(--text-dark);">${requesterName} a besoin d'un coup de main</strong>
                                <div style="font-size: 0.78rem; color: var(--text-muted);"><i class="ph ph-map-pin"></i> ${req.location || requester.city || 'Guadeloupe'} · ${dateStr}</div>
                            </div>
                        </div>
                        ${statusBadgeHtml}
                    </div>

                    <div style="background: #F8FAFC; border-radius: 8px; padding: 10px 12px; margin: 8px 0; border: 1px solid #F1F5F9;">
                        <div style="font-weight: 700; font-size: 0.95rem; color: var(--primary-dark);">${req.title || 'Besoin d\'aide'}</div>
                        <p style="font-size: 0.85rem; color: #475569; margin: 4px 0 0 0; line-height: 1.4;">${req.description || 'Description non renseignée'}</p>
                        <div style="display: flex; gap: 16px; font-size: 0.8rem; font-weight: 600; color: #334155; margin-top: 6px;">
                            <span>Budget: <strong style="color: var(--primary);">${budgetStr}</strong></span>
                            <span>Urgence: <strong>${req.urgency || 'Flexible'}</strong></span>
                        </div>
                    </div>

                    ${actionsHtml}
                </div>
            `;
        }
        html += '</div>';
        container.innerHTML = html;

        // Attach Accept handlers
        container.querySelectorAll('.btn-inv-accept').forEach(btn => {
            btn.addEventListener('click', async () => {
                const invId = btn.getAttribute('data-inv-id');
                const reqTitle = btn.getAttribute('data-req-title');
                const requesterName = btn.getAttribute('data-requester-name');
                const requesterId = btn.getAttribute('data-requester-id');

                btn.disabled = true;
                btn.innerHTML = '<i class="ph ph-spinner spin"></i> Acceptation...';

                try {
                    const res = await window.LYANN_API_CLIENT.acceptInvitation(invId);
                    console.log("✅ Invitation acceptée avec succès:", res);

                    if (window.NotificationService) {
                        window.NotificationService.showToast('success', `Vous avez accepté la demande de ${requesterName} !`);
                    }

                    await window.loadUserReceivedInvitationsUI();

                    // Open chat with user
                    if (typeof window.openChatWithUser === 'function') {
                        await window.openChatWithUser(requesterName, 'david-34.png', requesterId, { title: reqTitle });
                    }

                } catch (err) {
                    console.error("❌ Erreur acceptation invitation:", err);
                    if (window.NotificationService) {
                        window.NotificationService.showToast('error', "Erreur d'acceptation : " + (err.message || "Erreur serveur"));
                    }
                } finally {
                    btn.disabled = false;
                }
            });
        });

        // Attach Decline handlers
        container.querySelectorAll('.btn-inv-decline').forEach(btn => {
            btn.addEventListener('click', async () => {
                const invId = btn.getAttribute('data-inv-id');

                btn.disabled = true;

                try {
                    await window.LYANN_API_CLIENT.declineInvitation(invId);
                    if (window.NotificationService) {
                        window.NotificationService.showToast('info', "Demande déclinée.");
                    }
                    await window.loadUserReceivedInvitationsUI();
                } catch (err) {
                    console.error("❌ Erreur refus invitation:", err);
                } finally {
                    btn.disabled = false;
                }
            });
        });

        // Attach Open Chat handlers
        container.querySelectorAll('.btn-inv-open-chat').forEach(btn => {
            btn.addEventListener('click', async () => {
                const requesterName = btn.getAttribute('data-requester-name');
                const requesterId = btn.getAttribute('data-requester-id');
                if (typeof window.openChatWithUser === 'function') {
                    await window.openChatWithUser(requesterName, 'david-34.png', requesterId);
                }
            });
        });

    } catch (e) {
        console.error("Erreur chargement invitations reçues:", e);
        if (container) container.innerHTML = '<div class="empty-state-message">Erreur de chargement des invitations.</div>';
    }
};

// Automatically trigger loadUserRequestsUI & loadUserReceivedInvitationsUI when tabs are clicked
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.profile-tab-btn[data-tab="tab-requests"], .account-tab-btn[data-account-tab="tab-acc-activities"]');
    if (btn) {
        if (typeof window.loadUserRequestsUI === 'function') window.loadUserRequestsUI();
        if (typeof window.loadUserReceivedInvitationsUI === 'function') window.loadUserReceivedInvitationsUI();
    }
});



/* ==========================================================================
   SIMULATED TRANSACTION CHAT (BOKANTAJ JOB FLOW)
   ========================================================================== */
window.triggerSimulatedTransactionChat = function() {
    const chatModal = document.getElementById('chatModal');
    if(chatModal) {
        // Open the chat modal
        if (typeof window.openLyannMessagesModal === 'function') {
            window.openLyannMessagesModal();
        } else {
            chatModal.classList.add('active');
            chatModal.style.display = 'flex';
        }
        
        // Open conversation with Marc
        if(typeof window.openChatWithUser === 'function') {
            window.openChatWithUser('Marc (Plombier)', 'david-34.png'); // using existing avatar for mockup
        }
        
        // Inject the simulated flow into the message area
        const chatMessages = document.getElementById('chatMessages');
        if(!chatMessages) return;
        
        // Clear previous messages for this demo
        chatMessages.innerHTML = `
            <div class="chat-message-row received">
                <div class="chat-message-bubble">
                    Bonjour ! Je viens de voir votre annonce pour la fuite sous l'évier. Je suis artisan plombier dans le quartier (Didier). Je peux intervenir cet après-midi vers 16h.
                    <div class="chat-message-time">10:42</div>
                </div>
            </div>
        `;
        
        // Delay 1: He sends an offer
        setTimeout(() => {
            chatMessages.insertAdjacentHTML('beforeend', `
                <div class="chat-message-row received">
                    <div class="chat-message-bubble">
                        <div class="chat-tx-card offer">
                            <div class="chat-tx-header">
                                <i class="ph-fill ph-file-text"></i> Proposition de service
                            </div>
                            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0;">Réparation de fuite évier + changement de joint</p>
                            <div class="chat-tx-price">60 €</div>
                            <div class="chat-tx-actions">
                                <button class="btn btn-primary chat-tx-btn" onclick="acceptOffer(this)">Accepter</button>
                                <button class="btn btn-outline chat-tx-btn">Négocier</button>
                            </div>
                        </div>
                        <div class="chat-message-time">10:44</div>
                    </div>
                </div>
            `);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 1500);
    }
};

window.acceptOffer = function(btn) {
    const chatMessages = document.getElementById('chatMessages');
    const card = btn.closest('.chat-tx-card');
    
    // Morph the card to accepted
    card.innerHTML = `
        <div class="chat-tx-header" style="color: var(--primary);">
            <i class="ph-fill ph-check-circle"></i> Offre acceptée
        </div>
        <div class="chat-tx-price">60 €</div>
        <p style="font-size: 0.85rem; color: var(--text-muted);">En attente du paiement sécurisé pour bloquer la mission.</p>
    `;
    
    // Inject payment request
    setTimeout(() => {
        chatMessages.insertAdjacentHTML('beforeend', `
            <div class="chat-message-row system" style="justify-content: center;">
                <div class="chat-message-bubble" style="background: transparent; box-shadow: none; padding: 0;">
                    <div class="chat-tx-card payment" style="max-width: 320px; text-align: center; margin: 16px auto;">
                        <i class="ph-fill ph-lock-key" style="font-size: 2rem; color: var(--sand-yellow); margin-bottom: 8px;"></i>
                        <div style="font-weight: 800; margin-bottom: 8px;">Paiement sécurisé LYANN</div>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">Les fonds seront bloqués jusqu'à la fin de la mission.</p>
                        <button class="btn btn-primary" style="width: 100%; background: var(--sand-yellow); color: #fff; border-color: var(--sand-yellow);" onclick="payMission(this)">Payer 60€</button>
                    </div>
                </div>
            </div>
        `);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 1000);
};

window.payMission = function(btn) {
    const chatMessages = document.getElementById('chatMessages');
    const card = btn.closest('.chat-tx-card');
    
    card.innerHTML = `
        <i class="ph-fill ph-check-circle" style="font-size: 2rem; color: #4CAF50; margin-bottom: 8px;"></i>
        <div style="font-weight: 800; margin-bottom: 8px; color: #4CAF50;">Paiement bloqué</div>
        <p style="font-size: 0.8rem; color: var(--text-muted);">La mission est confirmée.</p>
        <button class="btn btn-outline" style="width: 100%; margin-top: 12px;" onclick="validateMission(this)">Valider la fin de mission</button>
    `;
    
    chatMessages.insertAdjacentHTML('beforeend', `
        <div class="chat-message-row received">
            <div class="chat-message-bubble">
                Super, j'ai reçu la notification de paiement ! J'arrive tout de suite.
                <div class="chat-message-time">10:50</div>
            </div>
        </div>
    `);
    chatMessages.scrollTop = chatMessages.scrollHeight;
};

window.validateMission = function(btn) {
    const chatMessages = document.getElementById('chatMessages');
    const card = btn.closest('.chat-tx-card');
    
    card.innerHTML = `
        <div class="chat-tx-header" style="color: #4CAF50;">
            <i class="ph-fill ph-flag-checkered"></i> Mission terminée
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted);">Les fonds (60€) ont été versés à l'artisan.</p>
    `;
    
    setTimeout(() => {
        chatMessages.insertAdjacentHTML('beforeend', `
            <div class="chat-message-row system" style="justify-content: center;">
                <div class="chat-message-bubble" style="background: transparent; box-shadow: none; padding: 0;">
                    <div class="chat-tx-card success" style="max-width: 320px; text-align: center; margin: 16px auto;">
                        <img src="david-34.png" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-bottom: 8px;">
                        <div style="font-weight: 800;">Laissez un avis à Marc</div>
                        <div class="star-rating">
                            <i class="ph-fill ph-star" onclick="rateStar(this)"></i>
                            <i class="ph-fill ph-star" onclick="rateStar(this)"></i>
                            <i class="ph-fill ph-star" onclick="rateStar(this)"></i>
                            <i class="ph-fill ph-star" onclick="rateStar(this)"></i>
                            <i class="ph-fill ph-star" onclick="rateStar(this)"></i>
                        </div>
                        <textarea class="modal-input" placeholder="Écrire un mot..." style="margin-bottom: 12px; font-size: 0.85rem; height: 60px;"></textarea>
                        <button class="btn btn-primary" style="width: 100%;" onclick="this.closest('.chat-tx-card').innerHTML='<div style=\\'font-weight:800; color: #4CAF50;\\'><i class=\\'ph-fill ph-check-circle\\'></i> Merci pour votre avis !</div>'">Envoyer</button>
                    </div>
                </div>
            </div>
        `);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 1000);
};

window.rateStar = function(star) {
    const stars = Array.from(star.parentElement.children);
    const index = stars.indexOf(star);
    stars.forEach((s, i) => {
        if(i <= index) s.classList.add('active');
        else s.classList.remove('active');
    });
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof ensureMobileHamburgerDrawer === 'function') ensureMobileHamburgerDrawer();
    });
} else {
    if (typeof ensureMobileHamburgerDrawer === 'function') ensureMobileHamburgerDrawer();
}

// ==========================================================================
// LYANN STEP 9 — HELPER MODALS & HANDLERS (AVATAR, PORTFOLIO & LIGHTBOX)
// ==========================================================================

// 1. Lightbox Viewer
window.lyannOpenLightbox = function(imgUrl, title, caption) {
    let overlay = document.getElementById('lyannLightboxOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'lyannLightboxOverlay';
        overlay.className = 'lyann-lightbox-overlay';
        overlay.innerHTML = `
            <div class="lyann-lightbox-card">
                <button type="button" class="modal-close-btn" onclick="document.getElementById('lyannLightboxOverlay').classList.remove('active')" style="top:12px; right:12px; z-index:10; background:rgba(0,0,0,0.5); color:white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center;"><i class="ph ph-x"></i></button>
                <img id="lyannLightboxImg" src="" alt="Réalisation" class="lyann-lightbox-img">
                <div class="lyann-lightbox-details">
                    <h3 id="lyannLightboxTitle" style="margin:0 0 6px 0; font-size:1.15rem; color:#1D2A44;"></h3>
                    <p id="lyannLightboxCaption" style="margin:0; font-size:0.9rem; color:#475569; line-height:1.5;"></p>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.onclick = function(e) {
            if (e.target === overlay) overlay.classList.remove('active');
        };
    }

    const imgEl = document.getElementById('lyannLightboxImg');
    const titleEl = document.getElementById('lyannLightboxTitle');
    const captionEl = document.getElementById('lyannLightboxCaption');
    if (imgEl) imgEl.src = imgUrl;
    if (titleEl) titleEl.textContent = title || 'Réalisation';
    if (captionEl) captionEl.textContent = caption || '';
    overlay.classList.add('active');
};

// 2. Avatar Management Modal
window.lyannOpenAvatarModal = function() {
    let modal = document.getElementById('lyannAvatarModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'lyannAvatarModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-card" style="max-width:420px; padding:24px; border-radius:20px; text-align:center; position:relative;">
                <button type="button" class="modal-close-btn" onclick="document.getElementById('lyannAvatarModal').classList.remove('active')"><i class="ph ph-x"></i></button>
                <h4 style="margin:0 0 16px 0; font-size:1.1rem; color:#1D2A44;"><i class="ph ph-camera"></i> Photo de profil</h4>
                <div style="margin-bottom:20px;">
                    <input type="file" id="lyannAvatarFileInput" accept="image/*" style="display:none;" onchange="window.lyannHandleAvatarFileSelected(event)">
                    <button type="button" class="btn btn-primary" style="width:100%; justify-content:center; margin-bottom:10px;" onclick="document.getElementById('lyannAvatarFileInput').click()"><i class="ph ph-upload-simple"></i> Changer ma photo</button>
                    <button type="button" class="btn btn-outline" style="width:100%; justify-content:center; color:#C95140; border-color:#FCA5A5;" onclick="window.lyannHandleAvatarDelete()"><i class="ph ph-trash"></i> Supprimer ma photo</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.classList.add('active');
};

window.lyannHandleAvatarFileSelected = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (window.showLyanToast) window.showLyanToast("Envoi de la photo...", "⏳");
    const modal = document.getElementById('lyannAvatarModal');
    if (modal) modal.classList.remove('active');

    try {
        const sessionRes = await window.apiClient.getSession();
        const userId = sessionRes?.data?.session?.user?.id;
        if (!userId) {
            if (window.showLyanToast) window.showLyanToast("Session non trouvée", "⚠️");
            return;
        }

        const res = await window.apiClient.uploadAvatar(userId, file);
        if (res.error) {
            if (window.showLyanToast) window.showLyanToast(res.error.message || "Erreur d'upload", "❌");
        } else {
            if (window.showLyanToast) window.showLyanToast("Photo de profil mise à jour ✨", "📸");
            if (typeof window.openPublicMemberProfile === 'function') {
                window.openPublicMemberProfile(userId);
            }
        }
    } catch(e) {
        console.error('Avatar upload error:', e);
    }
};

window.lyannHandleAvatarDelete = async function() {
    if (window.showLyanToast) window.showLyanToast("Suppression en cours...", "⏳");
    const modal = document.getElementById('lyannAvatarModal');
    if (modal) modal.classList.remove('active');

    try {
        const sessionRes = await window.apiClient.getSession();
        const userId = sessionRes?.data?.session?.user?.id;
        if (!userId) return;

        await window.apiClient.deleteAvatar(userId);
        if (window.showLyanToast) window.showLyanToast("Photo de profil supprimée", "🗑️");
        if (typeof window.openPublicMemberProfile === 'function') {
            window.openPublicMemberProfile(userId);
        }
    } catch(e) {}
};

// 3. Add Portfolio Item Modal
window.lyannOpenAddPortfolioModal = function() {
    let modal = document.getElementById('lyannAddPortfolioModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'lyannAddPortfolioModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-card" style="max-width:480px; padding:24px; border-radius:20px; position:relative;">
                <button type="button" class="modal-close-btn" onclick="document.getElementById('lyannAddPortfolioModal').classList.remove('active')"><i class="ph ph-x"></i></button>
                <h4 style="margin:0 0 16px 0; font-size:1.1rem; color:#1D2A44;"><i class="ph ph-image"></i> Ajouter une réalisation</h4>
                <form id="lyannAddPortfolioForm" onsubmit="window.lyannHandleAddPortfolioSubmit(event)">
                    <div style="margin-bottom:14px;">
                        <label style="display:block; font-size:0.85rem; font-weight:700; color:#334155; margin-bottom:6px;">Titre de la réalisation</label>
                        <input type="text" id="lyannPortTitle" class="modal-input" placeholder="Ex: Taille de haie et entretien jardin" required>
                    </div>
                    <div style="margin-bottom:14px;">
                        <label style="display:block; font-size:0.85rem; font-weight:700; color:#334155; margin-bottom:6px;">Description / Légende</label>
                        <textarea id="lyannPortCaption" class="modal-input" style="height:70px;" placeholder="Ex: Remise en état complète d'un espace extérieur au Gosier."></textarea>
                    </div>
                    <div style="margin-bottom:14px;">
                        <label style="display:block; font-size:0.85rem; font-weight:700; color:#334155; margin-bottom:6px;">Photo</label>
                        <input type="file" id="lyannPortFileInput" accept="image/*" class="modal-input" required>
                    </div>
                    <div style="margin-bottom:20px; display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" id="lyannPortPublicToggle" checked style="width:18px; height:18px; accent-color:#2D6A4F;">
                        <label for="lyannPortPublicToggle" style="font-size:0.88rem; font-weight:600; color:#334155;">Rendre cette réalisation publique sur mon profil</label>
                    </div>
                    <button type="submit" class="btn btn-primary" style="width:100%; justify-content:center;"><i class="ph ph-plus-circle"></i> Publier la réalisation</button>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.classList.add('active');
};

window.lyannHandleAddPortfolioSubmit = async function(event) {
    event.preventDefault();
    const title = document.getElementById('lyannPortTitle').value;
    const caption = document.getElementById('lyannPortCaption').value;
    const fileInput = document.getElementById('lyannPortFileInput');
    const isPublic = document.getElementById('lyannPortPublicToggle').checked;

    const file = fileInput.files[0];
    if (!file) return;

    if (window.showLyanToast) window.showLyanToast("Envoi de la réalisation...", "⏳");
    document.getElementById('lyannAddPortfolioModal').classList.remove('active');

    try {
        const sessionRes = await window.apiClient.getSession();
        const userId = sessionRes?.data?.session?.user?.id;
        if (!userId) return;

        const upRes = await window.apiClient.uploadPortfolioImage(userId, file);
        if (upRes.error) {
            if (window.showLyanToast) window.showLyanToast(upRes.error.message || "Erreur d'upload photo", "❌");
            return;
        }

        const imgUrl = upRes.data.image_url;
        await window.apiClient.addPortfolioItem(userId, {
            image_url: imgUrl,
            title: title,
            caption: caption,
            is_public: isPublic
        });

        if (window.showLyanToast) window.showLyanToast("Réalisation ajoutée ✨", "🖼️");
        if (typeof window.openPublicMemberProfile === 'function') {
            window.openPublicMemberProfile(userId);
        }
    } catch(e) {
        console.error('Portfolio submit error:', e);
    }
};

window.lyannDeletePortfolioItem = async function(itemId) {
    if (!confirm('Voulez-vous vraiment supprimer cette réalisation ?')) return;
    try {
        await window.apiClient.deletePortfolioItem(itemId);
        if (window.showLyanToast) window.showLyanToast("Réalisation supprimée", "🗑️");
        const sessionRes = await window.apiClient.getSession();
        const userId = sessionRes?.data?.session?.user?.id;
        if (userId && typeof window.openPublicMemberProfile === 'function') {
            window.openPublicMemberProfile(userId);
        }
    } catch(e) {}
};

// 4. Open Help Request with Target helper
window.openHelpRequestWithTarget = function(targetUserId, targetName) {
    if (document.getElementById('publicMemberProfileModal')) {
        document.getElementById('publicMemberProfileModal').classList.remove('active');
    }
    const bookingModal = document.getElementById('bookingModal');
    const reqModal = document.getElementById('modal-request-help');
    if (bookingModal) {
        const targetNameEl = document.getElementById('bookingTargetMemberName');
        if (targetNameEl) targetNameEl.textContent = `Demander un coup de main à ${targetName}`;
        bookingModal.classList.add('active');
    } else if (reqModal) {
        reqModal.classList.add('active');
    }
};


