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

// === NOTIFICATIONS MODAL ===
function openNotificationsModal() {
    let modal = document.getElementById('notificationsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'notificationsModal';
        modal.innerHTML = `
            <div class="modal-card modal-card-notifications" style="max-width: 480px; width: 92%; border-radius: var(--radius-xl); padding: 20px; background: #FFFFFF; margin: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.3); position: relative;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid var(--border-light); padding-bottom: 12px;">
                    <h3 style="font-size: 1.15rem; font-weight: 800; margin: 0; color: var(--text);">Notifications 🔔</h3>
                    <button type="button" id="closeNotificationsModalBtn" class="modal-close-btn" aria-label="Fermer" style="position: static; opacity: 1;"><i class="ph ph-x"></i></button>
                </div>
                <div class="notifications-list" style="display: flex; flex-direction: column; gap: 12px; max-height: 60vh; overflow-y: auto;">
                    <div style="display: flex; gap: 12px; padding: 14px; background: var(--bg-alt); border-radius: var(--radius-lg); border-left: 4px solid var(--primary);">
                        <span style="font-size: 1.5rem;">🤝</span>
                        <div>
                            <strong style="font-size: 0.88rem; display: block; color: var(--text);">David Jean-Baptiste a accepté votre demande</strong>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">Il y a 15 minutes • Baie-Mahault</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 12px; padding: 14px; background: var(--bg-alt); border-radius: var(--radius-lg); border-left: 4px solid var(--sand-yellow);">
                        <span style="font-size: 1.5rem;">⚡</span>
                        <div>
                            <strong style="font-size: 0.88rem; display: block; color: var(--text);">Nouvelle disponibilité à proximité</strong>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">Marc D. propose une révision clim à Baie-Mahault.</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 12px; padding: 14px; background: var(--bg-alt); border-radius: var(--radius-lg);">
                        <span style="font-size: 1.5rem;">💬</span>
                        <div>
                            <strong style="font-size: 0.88rem; display: block; color: var(--text);">Nouveau message de Sarah M.</strong>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">Hier à 18:42</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const closeBtn = document.getElementById('closeNotificationsModalBtn');
        const closeModal = () => {
            modal.classList.remove('active');
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        };
        closeBtn?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    modal.classList.add('active');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const badge = document.querySelector('.notif-badge-count');
    if (badge) badge.style.display = 'none';
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
    const isBokantaj = path.includes('feed.html') || isHome;
    const isLoggedIn = document.body.classList.contains('user-is-logged-in');

    // BOKANTAJ EST L'ACCUEIL PAR DÉFAUT DE LYANN MOBILE
    if (isHome && isLoggedIn) {
        window.location.href = 'feed.html';
        return;
    } else if (isHome && !isLoggedIn) {
        showAppWelcomeScreen();
    }

    // 1. Bottom Navigation à 5 Onglets (Bokantaj | Explorer | + | Messages | Moi)
    if (!document.querySelector('.mobile-bottom-nav')) {
        const bottomNav = document.createElement('div');
        bottomNav.className = 'mobile-bottom-nav';

        bottomNav.innerHTML = `
            <a href="feed.html" class="nav-tab ${isBokantaj ? 'active' : ''}" id="tab-bokantaj">
                <i class="ph ph-broadcast"></i>
                <span>Bokantaj</span>
            </a>
            <a href="results.html" class="nav-tab ${isExplorer ? 'active' : ''}" id="tab-explorer">
                <i class="ph ph-magnifying-glass"></i>
                <span>Explorer</span>
            </a>
            <div class="nav-tab nav-tab-central-item" id="tab-create-item">
                <button type="button" class="btn-central-action" id="tab-create" aria-label="Créer">
                    <i class="ph ph-plus"></i>
                </button>
                <span class="central-tab-label">Créer</span>
            </div>
            <button type="button" class="nav-tab" id="tab-messages" aria-label="Messages">
                <i class="ph ph-chat-circle-dots"></i>
                <span>Messages</span>
            </button>
            <button type="button" class="nav-tab" id="tab-moi" aria-label="Moi">
                <i class="ph ph-user"></i>
                <span>Moi</span>
            </button>
        `;
        document.body.appendChild(bottomNav);

        bottomNav.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                triggerHaptic('light');
            });
        });

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

    // 3. Affichage garanti du menu hamburger web & mobile sur native
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    if (mobileMenuBtn) {
        mobileMenuBtn.style.display = 'flex';
    }

    // 4. En-tête natif mobile avec bouton Hamburger conservé
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        const container = navbar.querySelector('.nav-container') || navbar;
        if (isBokantaj) {
            container.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0 12px; box-sizing: border-box;">
                    <span style="font-weight: 900; font-size: 1.2rem; color: var(--primary-dark); display: flex; align-items: center; gap: 8px;">
                        <img src="logo-app.png" style="width: 28px; height: 28px; border-radius: 6px; object-fit: cover;">
                        LYANN
                    </span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button type="button" class="nav-msg-btn" id="btnHeaderChat" aria-label="Messagerie" style="background: none; border: none; font-size: 1.3rem; color: var(--text); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px;">
                            <i class="ph ph-chat-circle-dots"></i>
                        </button>
                        <button type="button" class="nav-msg-btn" id="btnHeaderNotif" aria-label="Notifications" style="background: none; border: none; font-size: 1.3rem; color: var(--text); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px; position: relative;">
                            <i class="ph ph-bell"></i>
                            <span class="notif-badge-count">3</span>
                        </button>
                        <button type="button" class="hamburger-menu-btn" id="btnHeaderHamburger" aria-label="Menu Principal" style="background: rgba(74, 124, 89, 0.12); border: 1.5px solid rgba(74, 124, 89, 0.25); border-radius: 12px; width: 38px; height: 38px; font-size: 1.3rem; color: var(--primary-dark); cursor: pointer; display: flex; align-items: center; justify-content: center;">
                            <i class="ph ph-list"></i>
                        </button>
                    </div>
                </div>
            `;
            container.querySelector('#btnHeaderChat')?.addEventListener('click', (e) => {
                e.preventDefault();
                window.openLyannMessagesModal();
            });

            container.querySelector('#btnHeaderNotif')?.addEventListener('click', (e) => {
                e.preventDefault();
                triggerHaptic('light');
                openNotificationsModal();
            });

            container.querySelector('#btnHeaderHamburger')?.addEventListener('click', (e) => {
                e.preventDefault();
                triggerHaptic('light');
                if (typeof window.openLyannHamburgerDrawer === 'function') {
                    window.openLyannHamburgerDrawer();
                }
            });
        } else {
            let pageTitle = "LYANN";
            if (path.includes('results.html')) pageTitle = "Explorer";
            else if (path.includes('about.html')) pageTitle = "Notre Histoire";
            else if (path.includes('pricing.html')) pageTitle = "Abonnements";
            else if (path.includes('how-it-works.html')) pageTitle = "Comment ça marche";

            container.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0 12px; height: 44px; box-sizing: border-box;">
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
                window.history.back();
            });

            container.querySelector('#btnHeaderHamburger')?.addEventListener('click', (e) => {
                e.preventDefault();
                triggerHaptic('light');
                if (typeof window.openLyannHamburgerDrawer === 'function') {
                    window.openLyannHamburgerDrawer();
                }
            });
        }
    }
}

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
            name: "David Jean-Baptiste (34 ans)",
            role: "Plomberie & Clim Inverter",
            category: "plomberie",
            keywords: ["plomberie", "plombier", "fuite", "eau", "sanitaire", "robinet", "tuyau", "dépannage", "chauffe-eau", "clim"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Baie-Mahault",
            rating: 4.9,
            reviewsCount: 48,
            avatar: "david-34.png",
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
            avatar: "sarah-29.png",
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
            avatar: "david-34.png",
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
            avatar: "saint-louis-72.png",
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
            avatar: "sarah-29.png",
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
            avatar: "sarah-29.png",
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
            avatar: "huguette-68.png",
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
            avatar: "sarah-29.png",
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
            avatar: "sarah-29.png",
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
            avatar: "kevin-41.png",
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
            avatar: "kevin-41.png",
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
            avatar: "huguette-68.png",
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
            avatar: "kevin-41.png",
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
            avatar: "sarah-29.png",
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
            avatar: "david-34.png",
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
            avatar: "david-34.png",
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
            avatar: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80",
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
        { name: "Hugues Zami", age: 45, role: "Climatisation & Électricité", cat: "climatisation", city: "Les Abymes", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "40€/h", img: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&q=80", bio: "Technicien froid et électricité aux Abymes. Pose, entretien et dépannage clim.", skills: ["Clim Inverter", "Câblage", "Dépannage"] },
        { name: "Murielle Placide", age: 38, role: "Ménage & Repassage", cat: "menage", city: "Le Gosier", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "18€/h", img: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80", bio: "Ménage soigné à domicile sur Le Gosier. Repassage et entretien régulier.", skills: ["Ménage", "Repassage", "Lavage vitres"] },
        { name: "Clotilde Belair", age: 61, role: "Aide aux repas & Seniors", cat: "aide-personne", city: "Sainte-Anne", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "20€/h", img: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=150&q=80", bio: "Auxiliaire de vie bienveillante. Aide au quotidien pour seniors à Sainte-Anne.", skills: ["Aide repas", "Compagnie", "Courses"] },
        { name: "Marius Placide", age: 29, role: "Bricolage & Montage", cat: "bricolage", city: "Petit-Bourg", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "25€/h", img: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=150&q=80", bio: "Bricoleur minutieux. Montage de meubles, pose d'étagères et petits dépannages.", skills: ["Montage meuble", "Fixation", "Peinture"] },
        { name: "Thierry Vindex", age: 34, role: "Peinture & Rénovation", cat: "peinture", city: "Le Moule", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "28€/h", img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80", bio: "Peintre d'intérieur appliqué. Rénovation de pièces, murs et plafonds au Moule.", skills: ["Peinture", "Enduit", "Lissage"] },
        { name: "Chantal Gendrey", age: 47, role: "Baby-sitting & Sorties", cat: "babysitting", city: "Sainte-Rose", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "15€/h", img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80", bio: "Garde d'enfants bienveillante à Sainte-Rose. Sorties d'école et garde ponctuelle.", skills: ["Baby-sitting", "Jeux", "Goûter"] },
        { name: "Ludovic Clamy", age: 25, role: "Jardinage & Débroussaillage", cat: "jardin", city: "Lamentin", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "22€/h", img: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=150&q=80", bio: "Entretien de jardins, tonte de pelouse et désherbage régulier sur Lamentin.", skills: ["Tonte", "Taille de haie", "Débroussaillage"] },
        { name: "Mireille Sapotille", age: 54, role: "Habitante active (Entraide)", cat: "citoyen", city: "Saint-François", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "N/A", img: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&q=80", bio: "Citoyenne engagée à Saint-François. Disponible pour donner un coup de main ponctuel aux voisins sans rien attendre en retour.", skills: ["Bokantaj", "Entraide", "Discussion"] },
        { name: "Rodrigue Marie-Joseph", age: 31, role: "Menuiserie & Pose", cat: "menuiserie", city: "Capesterre-Belle-Eau", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "30€/h", img: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&q=80", bio: "Menuisier bois et alu. Réparation de portes, fenêtres et aménagements intérieurs.", skills: ["Menuiserie", "Pose de porte", "Aménagement"] },
        { name: "Fabrice Létang", age: 40, role: "Électricité générale", cat: "electricite", city: "Les Abymes", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "35€/h", img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80", bio: "Électricien professionnel aux Abymes. Tableau électrique, prises et mise en conformité.", skills: ["Tableau", "Câblage", "Dépannage"] },
        { name: "Ghislaine Rosalie", age: 50, role: "Aide à domicile & Compagnie", cat: "aide-personne", city: "Baie-Mahault", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "18€/h", img: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80", bio: "Accompagnement quotidien des personnes âgées à Baie-Mahault. Présence et écoute attentive.", skills: ["Compagnie", "Courses", "Loisirs"] },
        { name: "Wilfrid Rapon", age: 37, role: "Jardinier paysagiste", cat: "jardin", city: "Le Gosier", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "25€/h", img: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&q=80", bio: "Paysagiste passionné. Création de massifs, entretien général de jardin au Gosier.", skills: ["Taille", "Plantation", "Décoration"] },
        { name: "Christiane Fostin", age: 58, role: "Citoyenne engagée", cat: "citoyen", city: "Petit-Bourg", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "N/A", img: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=150&q=80", bio: "Résidente à Petit-Bourg. Toujours partante pour discuter d'initiatives solidaires locales.", skills: ["Partage", "Voisinage", "Rencontres"] },
        { name: "Lucien Cabort", age: 48, role: "Bricolage & Multi-services", cat: "bricolage", city: "Sainte-Anne", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "22€/h", img: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=150&q=80", bio: "Homme à tout faire à Sainte-Anne. Dépannages divers et montages en tous genres.", skills: ["Réparations", "Montage", "Pose rideaux"] },
        { name: "Roselyne Dacosta", age: 32, role: "Voisine de confiance", cat: "citoyen", city: "Le Moule", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "N/A", img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80", bio: "Citoyenne active au Moule. Passionnée d'environnement et de troc de plantes dans le quartier.", skills: ["Plantes", "Discussion", "Troc"] },
        { name: "Albert Lise", age: 65, role: "Cuisine & Repas créoles", cat: "divers", city: "Sainte-Rose", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "20€/h", img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80", bio: "Retraité de la restauration à Sainte-Rose. Préparation de plats traditionnels et pâtisseries locales.", skills: ["Colombo", "Accras", "Pâtisserie"] },
        { name: "Yveline Rosalie", age: 23, role: "Baby-sitting & Aide devoirs", cat: "babysitting", city: "Capesterre-Belle-Eau", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "14€/h", img: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&q=80", bio: "Étudiante en éducation à Capesterre-Belle-Eau. Aide aux devoirs et garde d'enfants après l'école.", skills: ["Devoirs", "Baby-sitting", "Jeux éducatifs"] },
        { name: "Gérard Zami", age: 55, role: "Plombier dépannage", cat: "plomberie", city: "Pointe-à-Pitre", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "30€/h", img: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&q=80", bio: "Plombier à Pointe-à-Pitre. Installation et réparation de réseaux d'eau, réparation robinets.", skills: ["Plomberie", "Sanitaire", "Chauffe-eau"] },
        { name: "Francine Moutoussamy", age: 44, role: "Repassage & Couture", cat: "menage", city: "Lamentin", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "18€/h", img: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=150&q=80", bio: "Couturière et repasseuse au Lamentin. Soin apporté au linge et petites retouches.", skills: ["Repassage", "Couture", "Ourlets"] },
        { name: "Guy-Albert Gace", age: 39, role: "Électricien dépannage", cat: "electricite", city: "Les Abymes", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "35€/h", img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80", bio: "Dépannage d'urgence aux Abymes. Électricité de maison, branchements et disjoncteurs.", skills: ["Dépannage", "Tableaux", "Mise aux normes"] },
        { name: "Solange Silvestre", age: 28, role: "Ménage & Nettoyage vitres", cat: "menage", city: "Baie-Mahault", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "18€/h", img: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80", bio: "Nettoyage en profondeur à Baie-Mahault. Sérieuse, rapide, organisée et de confiance.", skills: ["Nettoyage", "Vitres", "Linge"] },
        { name: "Firmin Monlouis", age: 51, role: "Jardinage & Élagage", cat: "jardin", city: "Le Gosier", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "25€/h", img: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&q=80", bio: "Jardinier sur Le Gosier. Taille de haies, tonte et élagage des petits arbres du jardin.", skills: ["Jardin", "Élagage", "Tondeuse"] },
        { name: "Monique Carpin", age: 59, role: "Voisine solidaire", cat: "citoyen", city: "Saint-Claude", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "N/A", img: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=150&q=80", bio: "Voisine solidaire à Saint-Claude. Disposée à aider pour récupérer des colis ou garder un animal.", skills: ["Entraide", "Garde chien", "Services"] },
        { name: "Martial Tinaut", age: 33, role: "Montage de meubles", cat: "bricolage", city: "Trois-Rivières", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "22€/h", img: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=150&q=80", bio: "Super bricoleur à Trois-Rivières. Assemblage de meubles en kit et fixations murales diverses.", skills: ["Montage meuble", "Fixation TV", "Petits travaux"] },
        { name: "Ginette Tacite", age: 64, role: "Aide aux repas & Seniors", cat: "aide-personne", city: "Goyave", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "18€/h", img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80", bio: "Accompagnatrice sociale retraitée. Aide à la personne et compagnie bienveillante à Goyave.", skills: ["Seniors", "Compagnie", "Aide administrative"] },
        { name: "Aimé Zéphir", age: 46, role: "Peintre d'intérieur", cat: "peinture", city: "Bouillante", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "25€/h", img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80", bio: "Peintre d'expérience à Bouillante. Travail propre et soigné pour vos murs et boiseries.", skills: ["Peinture", "Enduit", "Rénovation"] },
        { name: "Josiane Périac", age: 24, role: "Baby-sitting soirées", cat: "babysitting", city: "Pointe-Noire", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "14€/h", img: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&q=80", bio: "Garde d'enfants de confiance à Pointe-Noire. Jeux, dîner et accompagnement au coucher.", skills: ["Baby-sitting", "Éveil", "Sûreté"] },
        { name: "Pascal Agathe", age: 43, role: "Plomberie sanitaire", cat: "plomberie", city: "Port-Louis", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "28€/h", img: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&q=80", bio: "Dépannage plomberie à Port-Louis. Réparations robinetterie, fuites et siphons.", skills: ["Plomberie", "Robinets", "Canalisations"] },
        { name: "Sylviane Lurel", age: 53, role: "Habitante engagée", cat: "citoyen", city: "Deshaies", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "N/A", img: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=150&q=80", bio: "Habitante de Deshaies. Intéressée par les actions d'entraide et d'animation solidaire.", skills: ["Discussions", "Solidarité", "Projets"] },
        { name: "Max Hoarau", age: 42, role: "Climatisation & Froid", cat: "climatisation", city: "Les Abymes", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "35€/h", img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80", bio: "Expert climatisation aux Abymes. Entretien, désinfection et installation neuve de clim.", skills: ["Entretien", "Pose", "Climatiseur"] },
        { name: "Eliane Hoarau", age: 49, role: "Aide à domicile & Repas", cat: "aide-personne", city: "Baie-Mahault", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "18€/h", img: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80", bio: "Aide quotidienne à Baie-Mahault. Préparation de caris et repas typiques créoles.", skills: ["Cuisine", "Ménage", "Compagnie"] },
        { name: "Charles Payet", age: 36, role: "Jardinier & Entretien cour", cat: "jardin", city: "Anse-Bertrand", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "25€/h", img: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&q=80", bio: "Jardinier motivé sur Anse-Bertrand. Débroussaillage, tonte et nettoyage complet de cours.", skills: ["Tonte", "Taille de haie", "Nettoyage"] },
        { name: "Patricia Grondin", age: 57, role: "Habitante solidaire", cat: "citoyen", city: "Grand-Bourg", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "N/A", img: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=150&q=80", bio: "Lyanneuse passionnée à Grand-Bourg. Partage de boutures et conseils pour potager.", skills: ["Jardinage", "Troc", "Voisinage"] },
        { name: "Georges Payet", age: 48, role: "Petit Bricolage & Fixation", cat: "bricolage", city: "Gourbeyre", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "22€/h", img: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=150&q=80", bio: "Bricoleur à Gourbeyre. Montage meuble, pose tringles à rideaux, cadres et étagères.", skills: ["Bricolage", "Fixation", "Montage"] },
        { name: "Nicole Payet", age: 33, role: "Ménage & Repassage", cat: "menage", city: "Vieux-Habitants", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "18€/h", img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80", bio: "Prestation de ménage impeccable à Vieux-Habitants. Organisation, discrétion et efficacité.", skills: ["Ménage", "Repassage", "Rangement"] },
        { name: "Henri Payet", age: 60, role: "Dépannage électricité", cat: "electricite", city: "Pointe-à-Pitre", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "35€/h", img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80", bio: "Électricien d'expérience à Pointe-à-Pitre. Dépannage rapide de pannes de prises ou luminaires.", skills: ["Dépannage", "Mise aux normes", "Câblage"] },
        { name: "Claudette Payet", age: 25, role: "Baby-sitting & Sorties", cat: "babysitting", city: "Le Gosier", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "14€/h", img: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&q=80", bio: "Garde d'enfants douce et active au Gosier. Aide aux devoirs scolaires.", skills: ["Garde", "Aide devoirs", "Activités"] },
        { name: "René Payet", age: 51, role: "Peinture & Enduits", cat: "peinture", city: "Terre-de-Haut", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "25€/h", img: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&q=80", bio: "Artisan peintre à Terre-de-Haut. Rénovation de murs, façades et boiseries.", skills: ["Peinture", "Enduit", "Rénovation"] },
        { name: "Yolande Payet", age: 45, role: "Voisine active", cat: "citoyen", city: "Sainte-Anne", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "N/A", img: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=150&q=80", bio: "Voisine chaleureuse à Sainte-Anne. Toujours prête pour un coup de main amical ou prêter un outil.", skills: ["Entraide", "Covoiturage", "Café"] },
        { name: "Gaston Placide", age: 47, role: "Électricien dépanneur", cat: "electricite", city: "Les Abymes", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "35€/h", img: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=150&q=80", bio: "Électricien aux Abymes. Pose, diagnostic et réparation rapide de vos réseaux.", skills: ["Électricité", "Dépannage", "Luminaire"] },
        { name: "Marcelle Placide", age: 54, role: "Aide à la personne", cat: "aide-personne", city: "Baie-Mahault", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "18€/h", img: "https://images.unsplash.com/photo-1598550476439-6847785fce6e?auto=format&fit=crop&w=150&q=80", bio: "Aide à domicile attentionnée à Baie-Mahault. Accompagnement courses et ménage quotidien.", skills: ["Aide", "Courses", "Cuisine"] },
        { name: "Bruno Placide", age: 38, role: "Bricolage & Multi-services", cat: "bricolage", city: "Le Gosier", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "25€/h", img: "https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=150&q=80", bio: "Petit entretien de maison et jardin au Gosier. Polyvalent, ponctuel et soigné.", skills: ["Bricolage", "Montage", "Ajustement"] },
        { name: "Thérèse Placide", age: 63, role: "Voisine active", cat: "citoyen", city: "Petit-Bourg", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "N/A", img: "https://images.unsplash.com/photo-1601412436009-d964bd02edbc?auto=format&fit=crop&w=150&q=80", bio: "Retraitée active à Petit-Bourg. Organise des ateliers et de l'entraide de quartier.", skills: ["Tissage", "Partage", "Voisinage"] },
        { name: "Gilbert Placide", age: 52, role: "Jardinier & Entretien cour", cat: "jardin", city: "Sainte-Anne", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "25€/h", img: "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?auto=format&fit=crop&w=150&q=80", bio: "Entretien de jardins à Sainte-Anne. Tonte, taille et débroussaillage de terrain arboré.", skills: ["Taille", "Nettoyage", "Jardin"] },
        { name: "Jacqueline Placide", age: 29, role: "Ménage de vacances", cat: "menage", city: "Le Moule", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "18€/h", img: "https://images.unsplash.com/photo-1607746882042-944635dfe10e?auto=format&fit=crop&w=150&q=80", bio: "Ménage et préparation de locations saisonnières sur Le Moule. Réactive et rigoureuse.", skills: ["Ménage", "Location", "Préparation"] },
        { name: "Raymond Placide", age: 35, role: "Plomberie générale", cat: "plomberie", city: "Sainte-Rose", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "30€/h", img: "https://images.unsplash.com/photo-1579038773863-c05000830627?auto=format&fit=crop&w=150&q=80", bio: "Plombier disponible à Sainte-Rose. Changement de robinets, raccordements et débouchage.", skills: ["Robinetterie", "Débouchage", "Réparations"] },
        { name: "Marie-Andrée Placide", age: 41, role: "Baby-sitting à domicile", cat: "babysitting", city: "Capesterre-Belle-Eau", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "14€/h", img: "https://images.unsplash.com/photo-1609010697446-11f2155278f0?auto=format&fit=crop&w=150&q=80", bio: "Garde d'enfants expérimentée à Capesterre-Belle-Eau. Disponible en soirée et week-end.", skills: ["Baby-sitting", "Accompagnement", "Loisirs"] },
        { name: "Serge Placide", age: 55, role: "Peintre bâtiment", cat: "peinture", city: "Les Abymes", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "25€/h", img: "https://images.unsplash.com/photo-1581338834647-b0ae4070ab95?auto=format&fit=crop&w=150&q=80", bio: "Peintre d'expérience aux Abymes. Rénovations intérieures et extérieures, peintures façades.", skills: ["Peinture", "Façades", "Volets"] },
        { name: "Yveline Placide", age: 30, role: "Voisine solidaire", cat: "citoyen", city: "Pointe-à-Pitre", loc: "guadeloupe", locName: "Guadeloupe (971)", rate: "N/A", img: "https://images.unsplash.com/photo-1615022702135-77b5a420a5ee?auto=format&fit=crop&w=150&q=80", bio: "Habitante de Pointe-à-Pitre. Disponible pour aider à garder des animaux ou faire les courses de temps en temps.", skills: ["Garde chat", "Entraide", "Voisins"] }
    ];

    const memberOverrides = [
        // Index 0: Jocelyn Cabort (m, 52) - Plomberie
        { name: "Jocelyn Cabort", age: 52, avatar: "jocelyn-cabort.png" },
        // Index 1: Hugues Zami (m, 45) - Climatisation (Black)
        { name: "Hugues Zami", age: 45, avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&q=80" },
        // Index 2: Murielle Placide (f, 38) - Ménage (Chinese)
        { name: "Mei-Ling Wong", age: 38, avatar: "https://images.unsplash.com/photo-1541823709867-1b206113e597?auto=format&fit=crop&w=150&q=80" },
        // Index 3: Clotilde Belair (f, 61) - Aide Seniors (Black)
        { name: "Clotilde Belair", age: 61, avatar: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=150&q=80" },
        // Index 4: Marius Placide (m, 29) - Bricolage (Indian)
        { name: "Ramesh Rangasamy", age: 29, avatar: "https://images.unsplash.com/photo-1607990283143-e81e7a2c93ab?auto=format&fit=crop&w=150&q=80" },
        // Index 5: Thierry Vindex (m, 34) - Peinture (White)
        { name: "Sébastien Gautier", age: 34, avatar: "https://images.unsplash.com/photo-1552058544-f2b08422138a?auto=format&fit=crop&w=150&q=80" },
        // Index 6: Chantal Gendrey (f, 47) - Baby-sitting (Black)
        { name: "Chantal Gendrey", age: 47, avatar: "https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&w=150&q=80" },
        // Index 7: Ludovic Clamy (m, 25) - Jardinage (Chinese)
        { name: "Julien Wong", age: 25, avatar: "https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=150&q=80" },
        // Index 8: Mireille Sapotille (f, 54) - Citoyenne (Black)
        { name: "Mireille Sapotille", age: 54, avatar: "https://images.unsplash.com/photo-1589156280159-27698a70f29e?auto=format&fit=crop&w=150&q=80" },
        // Index 9: Rodrigue Marie-Joseph (m, 31) - Menuiserie (Black)
        { name: "Rodrigue Marie-Joseph", age: 31, avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=150&q=80" },

        // Index 10: Fabrice Létang (m, 40) - Électricité (Black)
        { name: "Fabrice Létang", age: 40, avatar: "https://images.unsplash.com/photo-1513956589380-bad6acb9b9d4?auto=format&fit=crop&w=150&q=80" },
        // Index 11: Ghislaine Rosalie (f, 50) - Aide Seniors (Indian)
        { name: "Devi Rangasamy", age: 50, avatar: "https://images.unsplash.com/photo-1602491453631-e2a5ad90a131?auto=format&fit=crop&w=150&q=80" },
        // Index 12: Wilfrid Rapon (m, 37) - Jardinier (Black)
        { name: "Wilfrid Rapon", age: 37, avatar: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=150&q=80" },
        // Index 13: Christiane Fostin (f, 58) - Citoyenne (White)
        { name: "Claire Huyghues-Despointes", age: 58, avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80" },
        // Index 14: Lucien Cabort (m, 48) - Bricolage (White)
        { name: "Benoît de Jaham", age: 48, avatar: "https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?auto=format&fit=crop&w=150&q=80" },
        // Index 15: Roselyne Dacosta (f, 32) - Citoyenne (Black)
        { name: "Roselyne Dacosta", age: 32, avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80" },
        // Index 16: Albert Lise (m, 65) - Cuisine (Indian)
        { name: "Sanjay Rangasamy", age: 65, avatar: "https://images.unsplash.com/photo-1598257006458-087169a1f08d?auto=format&fit=crop&w=150&q=80" },
        // Index 17: Yveline Rosalie (f, 23) - Baby-sitting (White)
        { name: "Mathilde Aubry", age: 23, avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&q=80" },
        // Index 18: Gérard Zami (m, 55) - Plomberie (Black)
        { name: "Gérard Zami", age: 55, avatar: "https://images.unsplash.com/photo-1512485694743-9c9538b4e6e0?auto=format&fit=crop&w=150&q=80" },
        // Index 19: Francine Moutoussamy (f, 44) - Couture (Black)
        { name: "Francine Moutoussamy", age: 44, avatar: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=150&q=80" },

        // Index 20: Guy-Albert Gace (m, 39) - Électricien (White)
        { name: "Pierre-Yves Lemoine", age: 39, avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80" },
        // Index 21: Solange Silvestre (f, 28) - Ménage (Black)
        { name: "Solange Silvestre", age: 28, avatar: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=150&q=80" },
        // Index 22: Firmin Monlouis (m, 51) - Jardinage (Black)
        { name: "Firmin Monlouis", age: 51, avatar: "https://images.unsplash.com/photo-1522529599102-193c0d76b5b6?auto=format&fit=crop&w=150&q=80" },
        // Index 23: Monique Carpin (f, 59) - Citoyenne (Black)
        { name: "Monique Carpin", age: 59, avatar: "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?auto=format&fit=crop&w=150&q=80" },
        // Index 24: Martial Tinaut (m, 33) - Bricolage (Black)
        { name: "Martial Tinaut", age: 33, avatar: "https://images.unsplash.com/photo-1489980508314-941910ded1f4?auto=format&fit=crop&w=150&q=80" },
        // Index 25: Ginette Tacite (f, 64) - Aide Seniors (Black)
        { name: "Ginette Tacite", age: 64, avatar: "https://images.unsplash.com/photo-1542206395-9feb3edaa68d?auto=format&fit=crop&w=150&q=80" },
        // Index 26: Aimé Zéphir (m, 46) - Peintre (Black)
        { name: "Aimé Zéphir", age: 46, avatar: "https://images.unsplash.com/photo-1530268729831-4b0b9e170218?auto=format&fit=crop&w=150&q=80" },
        // Index 27: Josiane Périac (f, 24) - Baby-sitting (Black)
        { name: "Josiane Périac", age: 24, avatar: "https://images.unsplash.com/photo-1509305717901-8414512c868f?auto=format&fit=crop&w=150&q=80" },
        // Index 28: Pascal Agathe (m, 43) - Plomberie (Black)
        { name: "Pascal Agathe", age: 43, avatar: "https://images.unsplash.com/photo-1514543258389-c5a2817e5752?auto=format&fit=crop&w=150&q=80" },
        // Index 29: Sylviane Lurel (f, 53) - Citoyenne (Black)
        { name: "Sylviane Lurel", age: 53, avatar: "https://images.unsplash.com/photo-1523824921871-d6f1a15151f1?auto=format&fit=crop&w=150&q=80" },

        // Index 30: Max Hoarau (m, 42) - Climatisation (Black)
        { name: "Max Hoarau", age: 42, avatar: "https://images.unsplash.com/photo-1496345875659-11f7dd282d1d?auto=format&fit=crop&w=150&q=80" },
        // Index 31: Eliane Hoarau (f, 49) - Aide (Black)
        { name: "Eliane Hoarau", age: 49, avatar: "https://images.unsplash.com/photo-1534751516642-a131ffd10b7f?auto=format&fit=crop&w=150&q=80" },
        // Index 32: Charles Payet (m, 36) - Jardinier (Black)
        { name: "Charles Payet", age: 36, avatar: "https://images.unsplash.com/photo-1520155707335-10b7b1ce2b14?auto=format&fit=crop&w=150&q=80" },
        // Index 33: Patricia Grondin (f, 57) - Citoyenne (Black)
        { name: "Patricia Grondin", age: 57, avatar: "https://images.unsplash.com/photo-1525134479668-1bee5c7c684a?auto=format&fit=crop&w=150&q=80" },
        // Index 34: Georges Payet (m, 48) - Bricolage (Black)
        { name: "Georges Payet", age: 48, avatar: "https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?auto=format&fit=crop&w=150&q=80" },
        // Index 35: Nicole Payet (f, 33) - Ménage (Black)
        { name: "Nicole Payet", age: 33, avatar: "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=150&q=80" },
        // Index 36: Henri Payet (m, 60) - Électricien (Black)
        { name: "Henri Payet", age: 60, avatar: "https://images.unsplash.com/photo-1534312527009-56c7016453e6?auto=format&fit=crop&w=150&q=80" },
        // Index 37: Claudette Payet (f, 25) - Baby-sitting (Black)
        { name: "Claudette Payet", age: 25, avatar: "https://images.unsplash.com/photo-1515023115689-589c33041d3c?auto=format&fit=crop&w=150&q=80" },
        // Index 38: René Payet (m, 51) - Peinture (Black)
        { name: "René Payet", age: 51, avatar: "https://images.unsplash.com/photo-1522384908269-26615b1404ac?auto=format&fit=crop&w=150&q=80" },
        // Index 39: Yolande Payet (f, 45) - Citoyenne (Black)
        { name: "Yolande Payet", age: 45, avatar: "https://images.unsplash.com/photo-1594744803329-e58b31de215f?auto=format&fit=crop&w=150&q=80" },

        // Index 40: Gaston Placide (m, 47) - Électricien (Black)
        { name: "Gaston Placide", age: 47, avatar: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=150&q=80" },
        // Index 41: Marcelle Placide (f, 54) - Aide (Black)
        { name: "Marcelle Placide", age: 54, avatar: "https://images.unsplash.com/photo-1598550476439-6847785fce6e?auto=format&fit=crop&w=150&q=80" },
        // Index 42: Bruno Placide (m, 38) - Bricolage (Black)
        { name: "Bruno Placide", age: 38, avatar: "https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=150&q=80" },
        // Index 43: Thérèse Placide (f, 63) - Citoyenne (Black)
        { name: "Thérèse Placide", age: 63, avatar: "https://images.unsplash.com/photo-1601412436009-d964bd02edbc?auto=format&fit=crop&w=150&q=80" },
        // Index 44: Gilbert Placide (m, 52) - Jardinier (Black)
        { name: "Gilbert Placide", age: 52, avatar: "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?auto=format&fit=crop&w=150&q=80" },
        // Index 45: Jacqueline Placide (f, 29) - Ménage (Black)
        { name: "Jacqueline Placide", age: 29, avatar: "https://images.unsplash.com/photo-1607746882042-944635dfe10e?auto=format&fit=crop&w=150&q=80" },
        // Index 46: Raymond Placide (m, 35) - Plomberie (Black)
        { name: "Raymond Placide", age: 35, avatar: "https://images.unsplash.com/photo-1579038773863-c05000830627?auto=format&fit=crop&w=150&q=80" },
        // Index 47: Marie-Andrée Placide (f, 41) - Baby-sitting (Black)
        { name: "Marie-Andrée Placide", age: 41, avatar: "https://images.unsplash.com/photo-1609010697446-11f2155278f0?auto=format&fit=crop&w=150&q=80" },
        // Index 48: Serge Placide (m, 55) - Peinture (Black)
        { name: "Serge Placide", age: 55, avatar: "https://images.unsplash.com/photo-1581338834647-b0ae4070ab95?auto=format&fit=crop&w=150&q=80" },
        // Index 49: Yveline Placide (f, 30) - Citoyenne (Black)
        { name: "Yveline Placide", age: 30, avatar: "https://images.unsplash.com/photo-1615022702135-77b5a420a5ee?auto=format&fit=crop&w=150&q=80" }
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

    LYANN_MEMBERS.push(...additionalMembers);

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
                            <span class="drawer-user-name" id="drawerUserName">David Jean-Baptiste</span>
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
                <div class="drawer-footer">
                    <button class="drawer-logout-btn" id="drawerLogoutBtn">
                        <i class="ph ph-sign-out"></i>
                        <span>Se déconnecter</span>
                    </button>
                </div>

            </div>
        `;
        document.body.appendChild(overlay);
    }
    initDrawerEvents(overlay);
}

window.openLyannHamburgerDrawer = function() {
    ensureMobileHamburgerDrawer();
    const overlay = document.getElementById('mobileHamburgerDrawerOverlay');
    if (overlay) {
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
};

window.closeLyannHamburgerDrawer = function() {
    const overlay = document.getElementById('mobileHamburgerDrawerOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
};

function initDrawerEvents(overlay) {
    const closeBtn = overlay.querySelector('#closeMobileDrawerBtn');
    const logoutBtn = overlay.querySelector('#drawerLogoutBtn');

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#openMobileDrawerBtn, .open-drawer-trigger, .hamburger-menu-btn, .mobile-menu-btn');
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            window.openLyannHamburgerDrawer();
        }
    }, true);

    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.closeLyannHamburgerDrawer();
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.closeLyannHamburgerDrawer();
            if (typeof safeStorage !== 'undefined') {
                safeStorage.removeItem('lyan_user_logged_in');
                safeStorage.removeItem('lyan_user_profile');
            }
            localStorage.removeItem('lyan_user_logged_in');
            localStorage.removeItem('lyan_user_profile');
            if (window.NotificationService) {
                window.NotificationService.showToast('info', 'Vous avez été déconnecté.');
            }
            if (typeof window.updateHeaderAuthState === 'function') {
                window.updateHeaderAuthState();
            } else {
                window.location.reload();
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

    // === HASHTAG QUICK-FILTERS ENGINE (#Réparer, #Maison, #Jardin, #Peinture, #Meuble, #JeNeSaisPas) ===
    (function initHashtagFiltersEngine() {
        const hashtagTags = document.querySelectorAll('.suggestion-tags .tag, .hashtag-tag');
        hashtagTags.forEach(tag => {
            tag.addEventListener('click', (e) => {
                e.preventDefault();
                const query = tag.getAttribute('data-query') || tag.getAttribute('data-hashtag') || tag.textContent.trim();
                
                // If hashtag is "#JeNeSaisPas" or "Je ne sais pas qui contacter" -> Open AI Need Classifier Wizard
                if (query.includes('Je ne sais pas') || tag.classList.contains('help-wizard-trigger') || tag.getAttribute('data-action') === 'help-wizard') {
                    if (typeof window.openLyannWizard === 'function') {
                        window.openLyannWizard();
                    } else {
                        const wizardModal = document.getElementById('modal-request-help');
                        if (wizardModal) wizardModal.classList.add('active');
                    }
                    return;
                }

                // Fill search input & trigger live filtering
                const searchInput = document.getElementById('searchInput') || document.getElementById('feedSearchInput') || document.getElementById('globalAdminSearch');
                if (searchInput) {
                    searchInput.value = query.replace(/^#/, '');
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                }

                // Highlight active hashtag tag
                hashtagTags.forEach(t => t.classList.remove('active'));
                tag.classList.add('active');

                // Smooth scroll to results
                const resultsSection = document.getElementById('results') || document.getElementById('feed-container') || document.querySelector('.feed-posts-container');
                if (resultsSection) {
                    resultsSection.scrollIntoView({ behavior: 'smooth' });
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

    let activeContactName = 'David Jean-Baptiste';
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

    function openPublicMemberProfile(memberId) {
        const member = LYANN_MEMBERS.find(m => String(m.id) === String(memberId)) || LYANN_MEMBERS[0];
        currentVisitingMember = member;

        const avatarEl = document.getElementById('publicMemberAvatar');
        const nameEl = document.getElementById('publicMemberName');
        const roleEl = document.getElementById('publicMemberRoleBadge');
        const locEl = document.getElementById('publicMemberLocationText');
        const bioEl = document.getElementById('publicMemberBioText');
        const rateEl = document.getElementById('publicMemberRate');
        const badgeEl = document.getElementById('publicMemberBadge');
        const skillsContainer = document.getElementById('publicMemberSkillsContainer');
        const reviewsCountEl = document.getElementById('publicReviewsCount');

        if (avatarEl) avatarEl.src = member.avatar;
        if (nameEl) nameEl.textContent = member.name;
        if (roleEl) roleEl.innerHTML = `🛠️ ${member.role}`;
        if (locEl) locEl.innerHTML = `<i class="ph ph-map-pin"></i> ${member.city}, ${member.locationName}`;
        if (bioEl) bioEl.textContent = `"${member.bio}"`;
        if (rateEl) rateEl.textContent = member.hourlyRate;
        // Render simplified badges (max 2)
        if (badgeEl) {
            let badgeHTML = '';
            if (member.badge) badgeHTML += '<span class="badge-pill badge-verified"><i class="ph-fill ph-seal-check"></i> Profil vérifié</span>';
            if (member.isPro) badgeHTML += ' <span class="badge-pill badge-pro">PRO</span>';
            badgeEl.innerHTML = badgeHTML;
        }
        if (reviewsCountEl) reviewsCountEl.textContent = member.reviewsCount;

        // Recommendation count — check if already recommended by this user
        const currentCount = memberRecommendations[member.id] || Math.floor(member.reviewsCount * 3.5);
        if (recommendCountBadge) recommendCountBadge.textContent = currentCount;
        const myRecos = JSON.parse(safeStorage.getItem('lyann_my_recommendations') || '[]');
        if (recommendMemberBtn) {
            if (myRecos.includes(member.id)) {
                recommendMemberBtn.classList.add('liked');
            } else {
                recommendMemberBtn.classList.remove('liked');
            }
        }

        // Skills pills
        if (skillsContainer) {
            skillsContainer.innerHTML = member.skills.map(s => `<span class="skill-tag">${s}</span>`).join('');
        }

        // Render Realizations
        renderPublicRealizations(member);

        // Open modal or fallback to quick profile
        if (searchResultsModal) searchResultsModal.classList.remove('active');
        if (publicMemberProfileModal) {
            publicMemberProfileModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        } else {
            openQuickProfileModal(memberId);
        }
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

    // Recommander member button
    const recommendBtn = document.getElementById('recommendMemberBtn');
    if (recommendBtn) {
        recommendBtn.addEventListener('click', () => {
            const badge = document.getElementById('recommendCountBadge');
            if (badge) {
                let currentCount = parseInt(badge.textContent, 10) || 142;
                badge.textContent = currentCount + 1;
                // Recommendation logic handled by main recommendMemberBtn handler
            }
        });
    }

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
    let INITIAL_FLASH_POSTS = [
        {
            id: 'flash-1',
            authorName: 'David Jean-Baptiste',
            authorRole: 'Artisan',
            authorAvatar: 'david-34.png',
            badge: '⚡ Disponibilité',
            type: 'dispo',
            location: 'Guadeloupe',
            territoryKey: 'guadeloupe',
            timeAgo: 'Il y a 14 min',
            content: 'Créneau disponible.',
            images: [],
            likes: 14,
            repliesCount: 3,
            memberId: 1
        }
    ];

    if (window.LYANN_API_CLIENT) {
        window.LYANN_API_CLIENT.getFeed().then(({ data }) => {
            if (data && data.length > 0) {
                INITIAL_FLASH_POSTS = data.map(post => ({
                    id: post.id,
                    authorName: `${post.profiles.first_name} ${post.profiles.last_name}`,
                    authorRole: 'Lyanneur',
                    authorAvatar: post.profiles.avatar_url || 'default-avatar.png',
                    badge: post.post_type === 'dispo' ? '⚡ Disponibilité' : (post.post_type === 'besoin' ? '🔍 Besoin' : '📢 Info Bokantaj'),
                    type: post.post_type,
                    location: post.territory,
                    territoryKey: post.territory.toLowerCase(),
                    timeAgo: 'Récemment',
                    content: post.content,
                    images: post.media_urls || [],
                    likes: 0,
                    repliesCount: 0,
                    memberId: post.author_id
                }));
                // Try to render if possible
                if (typeof renderFlashFeed === 'function') {
                    // Try to wait for the UI to be ready
                    setTimeout(() => renderFlashFeed(INITIAL_FLASH_POSTS), 1000);
                }
            }
        }).catch(console.error);
    }

    let currentFlashPosts = [...INITIAL_FLASH_POSTS];
    let activeFeedTypeFilter = 'all';
    let activeFeedTerritoryFilter = 'all';
    let attachedPhotos = [];
    let attachedVideo = null;

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
        if (!flashFeedContainer) return;

        let filtered = currentFlashPosts.filter(post => {
            const matchType = activeFeedTypeFilter === 'all' || post.type === activeFeedTypeFilter;
            const matchTerritory = activeFeedTerritoryFilter === 'all' || post.territoryKey === activeFeedTerritoryFilter;
            return matchType && matchTerritory;
        });

        if (filtered.length === 0) {
            flashFeedContainer.innerHTML = `
                <div class="text-center" style="padding: 40px 20px; background: #FFF; border-radius: var(--radius-xl); border: 1.5px dashed var(--border);">
                    <i class="ph ph-chats-teardrop" style="font-size: 2.5rem; color: var(--primary-light); margin-bottom: 10px;"></i>
                    <h4 style="font-weight: 800; font-size: 1.1rem; margin-bottom: 4px;">Aucun Lyann dans Bokantaj pour le moment</h4>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Soyez le premier à poster un Lyann dans Bokantaj !</p>
                </div>
            `;
            return;
        }

        flashFeedContainer.innerHTML = filtered.map(post => {
            let badgeClass = 'flash-badge-dispo';
            if (post.type === 'besoin') badgeClass = 'flash-badge-besoin';
            else if (post.type === 'reco') badgeClass = 'flash-badge-reco';
            else if (post.type === 'info') badgeClass = 'flash-badge-info';

            let mediaHTML = '';
            if (post.images && post.images.length > 0) {
                const gridClass = `grid-${Math.min(post.images.length, 3)}`;
                const imgsHTML = post.images.slice(0, 3).map(src => `<img src="${src}" alt="Médias Lyann LYANN" class="flash-media-img">`).join('');
                mediaHTML = `<div class="flash-card-media-gallery ${gridClass}">${imgsHTML}</div>`;
            } else if (post.video) {
                mediaHTML = `<div style="margin-top: 10px;"><video src="${post.video}" controls class="flash-video-player"></video></div>`;
            }

            let actionBtnHTML = `<button class="flash-action-btn btn-open-chat-direct" data-member-name="${post.authorName}" data-member-avatar="${post.authorAvatar}"><i class="ph ph-chat-circle-dots"></i> <span>Répondre</span></button>`;
            if (post.type === 'besoin') {
                actionBtnHTML = `<button class="flash-action-btn btn-open-chat-direct" data-member-name="${post.authorName}" data-member-avatar="${post.authorAvatar}" data-post-type="besoin" data-post-title="${(post.content || '').replace(/"/g, '&quot;')}"><i class="ph ph-hand-heart"></i> <span>Je peux aider</span></button>`;
            } else if (post.type === 'dispo') {
                actionBtnHTML = `<button class="flash-action-btn btn-open-chat-direct" data-member-name="${post.authorName}" data-member-avatar="${post.authorAvatar}" data-post-type="dispo" data-post-title="${(post.content || '').replace(/"/g, '&quot;')}"><i class="ph ph-hand-heart"></i> <span>Demander un coup de main</span></button>`;
            }

            return `
                <div class="flash-card" id="${post.id}">
                    <div class="flash-card-header">
                        <div class="flash-author-block trigger-quick-profile" data-member-id="${post.memberId || 1}" style="cursor: pointer;">
                            <img src="${post.authorAvatar}" alt="${post.authorName}" class="flash-avatar">
                            <div class="flash-author-info">
                                <strong>${post.authorName} <i class="ph-fill ph-check-circle" style="color: #4A7C59; font-size: 0.88rem;"></i></strong>
                                <span>${post.authorRole} • 📍 ${post.location}</span>
                            </div>
                        </div>
                        <div class="flash-meta-badges">
                            <span class="${badgeClass}">${post.badge}</span>
                        </div>
                    </div>

                    <div class="flash-card-body">
                        ${parseMentionsInText(post.content)}
                        ${mediaHTML}
                    </div>

                    <div class="flash-card-footer">
                        <span class="flash-time-tag"><i class="ph ph-clock"></i> ${post.timeAgo}</span>
                        <div class="flash-actions-bar">
                            <button class="flash-action-btn btn-like-flash" data-flash-id="${post.id}">
                                <i class="ph-fill ph-heart"></i> <span class="like-count">${post.likes}</span>
                            </button>
                            ${actionBtnHTML}
                            <button class="flash-action-btn btn-share-flash" data-flash-id="${post.id}">
                                <i class="ph ph-share-network"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        attachFlashFeedListeners();
    }

    function attachFlashFeedListeners() {
        document.querySelectorAll('.btn-like-flash').forEach(btn => {
            // Guard against double-binding listeners
            if (btn.dataset.listenersBound === 'true') return;
            btn.dataset.listenersBound = 'true';
            
            btn.addEventListener('click', () => {
                const countSpan = btn.querySelector('.like-count');
                if (countSpan) {
                    let count = parseInt(countSpan.textContent) || 0;
                    if (btn.classList.contains('liked')) {
                        btn.classList.remove('liked');
                        count = Math.max(0, count - 1);
                    } else {
                        btn.classList.add('liked');
                        count++;
                    }
                    countSpan.textContent = count;
                }
            });
        });

        document.querySelectorAll('.btn-open-chat-direct').forEach(btn => {
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
            element.addEventListener('click', () => {
                const memberId = parseInt(element.dataset.memberId) || 1;
                openQuickProfileModal(memberId);
            });
        });
    }

    if (createFlashForm) {
        createFlashForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = flashContentInput ? flashContentInput.value.trim() : '';
            const type = document.getElementById('flashTypeSelect')?.value || 'dispo';
            const location = document.getElementById('flashTerritorySelect')?.value || 'Guadeloupe (971)';

            if (!text && attachedPhotos.length === 0 && !attachedVideo) {
                window.lyannAlert('Veuillez écrire un message ou ajouter une photo/vidéo à votre Lyann.');
                return;
            }

            let badgeText = '⚡ Disponibilité';
            if (type === 'besoin') badgeText = '🔍 Besoin';
            else if (type === 'reco') badgeText = '⭐ Recommandation';
            else if (type === 'info') badgeText = '📢 Info Bokantaj';

            let territoryKey = 'guadeloupe';
            if (location.includes('Martinique')) territoryKey = 'martinique';
            else if (location.includes('Guyane')) territoryKey = 'guyane';
            else if (location.includes('Réunion')) territoryKey = 'reunion';

            const newFlash = {
                id: `flash-${Date.now()}`,
                authorName: 'Vous (Membre LYANN)',
                authorRole: 'Lyanneur Actif',
                authorAvatar: 'david-34.png',
                badge: badgeText,
                type: type,
                location: location,
                territoryKey: territoryKey,
                timeAgo: 'À l\'instant',
                content: text,
                images: attachedPhotos.length > 0 ? [...attachedPhotos] : null,
                video: attachedVideo ? attachedVideo : null,
                likes: 1,
                repliesCount: 0,
                memberId: 99
            };

            currentFlashPosts.unshift(newFlash);
            attachedPhotos = [];
            attachedVideo = null;
            if (flashMediaPreviewContainer) flashMediaPreviewContainer.innerHTML = '';
            if (mediaUploadBadge) mediaUploadBadge.style.display = 'none';

            renderFlashFeed();
            createFlashForm.reset();
            if (flashCharCount) flashCharCount.textContent = '0';
             window.lyannAlert('✨ Votre Lyann a été publié avec succès dans Bokantaj !');
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

    window.openQuickProfileModal = function(memberId) {
        const member = LYANN_MEMBERS.find(m => String(m.id) === String(memberId)) || LYANN_MEMBERS[0];
        currentQuickMember = member;

        if (quickAvatarImg) quickAvatarImg.src = member.avatar;
        if (quickProfileName) quickProfileName.textContent = member.name;
        if (quickProfileRole) quickProfileRole.textContent = member.role;
        if (quickProfileCity) quickProfileCity.innerHTML = `<i class="ph ph-map-pin"></i> ${member.city}, ${member.locationName}`;
        if (quickProfileBadge) quickProfileBadge.textContent = member.badge;
        if (quickProfileRating) quickProfileRating.textContent = `⭐ ${member.rating} (${member.reviewsCount} avis)`;
        if (quickProfileBio) quickProfileBio.textContent = member.bio;

        if (quickProfileSkills) {
            quickProfileSkills.innerHTML = member.skills.map(s => `<span class="quick-skill-pill">${s}</span>`).join('');
        }

        if (quickProfileModal) {
            quickProfileModal.classList.add('active');
            quickProfileModal.style.display = 'flex';
        }
        document.body.style.overflow = 'hidden';
    }

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
            const email = loginForm.querySelector('input[type="email"]')?.value;
            const password = loginForm.querySelector('input[type="password"]')?.value || 'password123';
            try {
                if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
                    const { data, error } = await window.LYANN_API_CLIENT.login(email, password);
                    if (error) throw error;
                }
                safeStorage.setItem('lyan_user_logged_in', 'true');
                await updateHeaderAuthState();
                window.lyannAlert('🎉 Connexion réussie ! Bienvenue sur votre espace LYANN.');
                closeLoginModal();
            } catch (err) {
                window.lyannAlert('Erreur de connexion : ' + err.message);
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
                    window.lyannAlert(`📩 Un lien de réinitialisation a été envoyé à ${email}.`);
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
        passwordResetForm.addEventListener('submit', (e) => {
            e.preventDefault();
            window.lyannAlert('📩 Un lien sécurisé de réinitialisation a été envoyé à votre adresse email.');
            if (passwordResetModal) passwordResetModal.classList.remove('active');
            passwordResetForm.reset();
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
            if (targetNameEl) targetNameEl.textContent = `Réserver avec ${memberName}`;
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
            
            // Récupérer le nom du prestataire ciblé
            const targetNameEl = document.getElementById('bookingTargetMemberName');
            let providerName = 'David Jean-Baptiste';
            if (targetNameEl && targetNameEl.textContent) {
                providerName = targetNameEl.textContent.replace('Réserver avec ', '');
            }

            // Déclencher les notifications de réservation via Twilio & SendGrid
            if (window.LYANN_NOTIFICATIONS) {
                // Notifier le prestataire (ex: David Jean-Baptiste) par SMS
                window.LYANN_NOTIFICATIONS.sendSMS(
                    '+590690001122', 
                    providerName, 
                    `Bonjour ${providerName}, vous avez reçu une nouvelle demande de réservation de la part de David. Connectez-vous à LYANN pour y répondre.`
                );

                // Notifier le prestataire par Email
                window.LYANN_NOTIFICATIONS.sendEmail(
                    'prestataire@lyann-dom.com',
                    providerName,
                    '🤝 Nouvelle demande de réservation sur LYANN DOM',
                    `
                    <p>Une nouvelle demande de rendez-vous a été déposée pour votre activité.</p>
                    <p><strong>Détails du client :</strong> David (Baie-Mahault, Guadeloupe)</p>
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
            window.lyannAlert('🛡️ Votre signalement a été transmis à l\'équipe de modération LYANN. Merci de contribuer à la sérénité du réseau !');
            if (reportModal) reportModal.classList.remove('active');
            reportForm.reset();
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
                    let targetName = 'David Jean-Baptiste';
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
            const fn = document.getElementById('accFirstName')?.value || 'David';
            const ln = document.getElementById('accLastName')?.value || 'Jean-Baptiste';
            const nameEl = document.getElementById('accountModalName');
            if (nameEl) nameEl.textContent = `${fn} ${ln}`;
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

    
    async function updateHeaderAuthState() {
        let isLoggedIn = safeStorage.getItem('lyan_user_logged_in') === 'true' || localStorage.getItem('lyan_user_logged_in') === 'true';
        let userId = "me";

        if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
            try {
                const { data } = await window.LYANN_API_CLIENT.getSession();
                if (data && data.session) {
                    isLoggedIn = true;
                    userId = data.session.user.id;
                }
            } catch (err) {
                console.warn("Supabase session check info:", err);
            }
        }

        if (isLoggedIn) {
            document.body.classList.add('user-is-logged-in');
            window.CURRENT_USER_ID = userId;
            
            // Update profile name displays
            try {
                const rawProfile = safeStorage.getItem('lyan_user_profile') || localStorage.getItem('lyan_user_profile');
                if (rawProfile) {
                    const prof = JSON.parse(rawProfile);
                    const nameEls = document.querySelectorAll('.user-name-display, #accountUserName, #drawerUserName');
                    nameEls.forEach(el => {
                        if (el) el.textContent = prof.firstName + (prof.lastName ? ' ' + prof.lastName : '');
                    });
                }
            } catch(e) {}
        } else {
            document.body.classList.remove('user-is-logged-in');
            window.CURRENT_USER_ID = null;
        }
    }

    // Subscribe to Supabase Auth Changes
    if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
        window.LYANN_API_CLIENT.supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
                updateHeaderAuthState();
            }
        });
    }

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

    function triggerLyannerDeal(memberName = 'David Jean-Baptiste', phone = '+590690001122') {
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
            const activeName = chatHeaderName ? chatHeaderName.textContent : 'David Jean-Baptiste';
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
    document.addEventListener('click', (e) => {
        const logoutBtn = e.target.closest('.btn-logout-trigger, .nav-logout-btn, .drawer-logout-btn');
        if (logoutBtn) {
            e.preventDefault();
            try {
                if (typeof safeStorage !== 'undefined') {
                    safeStorage.removeItem('lyan_user_logged_in');
                    safeStorage.removeItem('lyan_user_profile');
                }
                localStorage.removeItem('lyan_user_logged_in');
                localStorage.removeItem('lyan_user_profile');
                sessionStorage.clear();
            } catch (err) {}

            if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
                try {
                    window.LYANN_API_CLIENT.signOut();
                } catch (err) {}
            }

            document.body.classList.remove('user-is-logged-in');
            if (typeof updateHeaderAuthState === 'function') {
                updateHeaderAuthState();
            }

            if (window.NotificationService) {
                window.NotificationService.showToast('info', 'Vous avez été déconnecté.');
            } else if (typeof showLyanToast === 'function') {
                showLyanToast('info', 'Déconnexion réussie');
            }

            setTimeout(() => {
                window.location.href = 'index.html';
            }, 300);
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
            let targetName = 'David Jean-Baptiste';
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
                let targetName = 'David Jean-Baptiste';
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
                    openChatWithUser(log.recipientName || "David Jean-Baptiste", "david-34.png");
                } else {
                    window.location.href = `feed.html?action=openchat&name=${encodeURIComponent(log.recipientName || "David Jean-Baptiste")}`;
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
        document.querySelectorAll('#searchResultsContainer .talent-card-trigger').forEach(card => {
            card.addEventListener('click', (e) => {
                e.preventDefault();
                const memberId = card.getAttribute('data-member-id');
                if (memberId) {
                    openPublicMemberProfile(memberId);
                }
            });
        });
    }

    function performSearch(userTriggered = false) {
        const searchInput = document.getElementById('searchInput');
        const locationSelect = document.getElementById('locationSelect');
        const citySelect = document.getElementById('citySelect');
        const container = document.getElementById('searchResultsContainer');

        if (!container) return;

        const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const territory = locationSelect ? locationSelect.value : 'guadeloupe';
        const city = citySelect ? citySelect.value : '';

        // Filter members
        const matched = LYANN_MEMBERS.filter(m => {
            // Match territory
            if (m.location !== territory) return false;
            
            // Match city
            if (city && m.city !== city) return false;
            
            // Match query (name, role, or keywords)
            if (query) {
                const nameMatch = m.name.toLowerCase().includes(query);
                const roleMatch = m.role.toLowerCase().includes(query);
                const bioMatch = m.bio.toLowerCase().includes(query);
                const keywordMatch = m.keywords && m.keywords.some(k => k.toLowerCase().includes(query));
                if (!nameMatch && !roleMatch && !bioMatch && !keywordMatch) return false;
            }
            
            return true;
        });

        // Render cards
        if (matched.length === 0) {
            container.innerHTML = `<div class="empty-state-message" style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-muted);">Aucun lyanneur ne correspond à vos critères de recherche.</div>`;
        } else {
            container.innerHTML = matched.map(m => {
                const postalCode = m.location === 'guadeloupe' ? '971' : 
                                   (m.location === 'martinique' ? '972' : 
                                   (m.location === 'guyane' ? '973' : 
                                   (m.location === 'reunion' ? '974' : '978')));
                return `
                    <div class="talent-card talent-card-trigger" data-member-id="${m.id}" style="cursor: pointer;">
                        <div class="talent-photo">
                            <img src="${m.avatar}" alt="${m.name}">
                        </div>
                        <h3>${m.name.split(' (')[0]}</h3>
                        <span class="talent-role">${m.role} · ${m.city} (${postalCode})</span>
                        <div class="talent-stars">★★★★★</div>
                        <blockquote>"${m.bio}"</blockquote>
                    </div>
                `;
            }).join('');
            
            bindDynamicTalentCards();
        }

        // Open modal if on index.html and user triggered
        const path = window.location.pathname || '';
        if (userTriggered && (path.includes('index.html') || path === '/' || path.endsWith('/'))) {
            const searchResultsModal = document.getElementById('searchResultsModal');
            if (searchResultsModal) {
                searchResultsModal.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        }
    }

    // Bind location select change
    const locationSelect = document.getElementById('locationSelect');
    if (locationSelect) {
        locationSelect.addEventListener('change', updateCityDropdown);
        updateCityDropdown();
    }

    // Bind form submit
    const heroSearchForm = document.getElementById('heroSearchForm');
    if (heroSearchForm) {
        heroSearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            performSearch(true);
        });
    }

    // Bind close button of search modal
    const closeSearchResultsModalBtn = document.getElementById('closeSearchResultsModalBtn');
    if (closeSearchResultsModalBtn) {
        closeSearchResultsModalBtn.addEventListener('click', () => {
            if (searchResultsModal) searchResultsModal.classList.remove('active');
            document.body.style.overflow = '';
        });
    }

    // Pre-fill search inputs on load if present in query string
    // Pre-fill search inputs on load if present in query string
    const searchUrlParams = new URLSearchParams(window.location.search);
    if (searchUrlParams.has('searchInput') || searchUrlParams.has('locationSelect') || searchUrlParams.has('citySelect') || searchUrlParams.has('category')) {
        const q = searchUrlParams.get('searchInput') || '';
        const loc = searchUrlParams.get('locationSelect') || searchUrlParams.get('category') || '';
        const city = searchUrlParams.get('citySelect') || '';
        
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = q;
        
        if (locationSelect && loc) {
            const options = Array.from(locationSelect.options).map(o => o.value);
            if (options.includes(loc.toLowerCase())) {
                locationSelect.value = loc.toLowerCase();
                updateCityDropdown();
            }
        }
        
        setTimeout(() => {
            const citySelect = document.getElementById('citySelect');
            if (citySelect && city) citySelect.value = city;
            performSearch(false);
        }, 100);
    } else {
        // Initial search to display all members on results.html by default
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

    window.openLyannWizard = function() {
        if(modalRequestHelp) {
            modalRequestHelp.classList.add('active');
            document.body.style.overflow = 'hidden';
            goToStep(1);
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
                const desc = document.getElementById('wizardDescInput').value.trim();
                if (!desc) {
                    alert("Veuillez décrire votre besoin.");
                    return;
                }
                
                // Show loader
                const originalText = btnNext.innerHTML;
                btnNext.innerHTML = '<i class="ph ph-spinner ph-spin"></i> LYANN organise...';
                btnNext.disabled = true;

                try {
                    const result = await window.LyanAI.classifyNeed(desc);
                    
                    if (result.needs_clarification && desc.length < 5) {
                        alert("Précision requise : " + (result.clarification_question || "Veuillez donner quelques précisions sur votre besoin."));
                        btnNext.innerHTML = originalText;
                        btnNext.disabled = false;
                        return; // stay on step 1
                    }

                    // Auto-select if confidence is high
                    if (result.confidence >= 0.5) {
                        const domainSelect = document.getElementById('wizardDomain');
                        const catSelect = document.getElementById('wizardCategory');
                        const subCatSelect = document.getElementById('wizardSubCat');
                        
                        if(result.domain_slug && domainSelect.querySelector(`option[value="${result.domain_slug}"]`)) {
                            domainSelect.value = result.domain_slug;
                        }
                        if(result.category_slug && catSelect.querySelector(`option[value="${result.category_slug}"]`)) {
                            catSelect.value = result.category_slug;
                        }
                        if(result.subcategory_slug && subCatSelect.querySelector(`option[value="${result.subcategory_slug}"]`)) {
                            subCatSelect.value = result.subcategory_slug;
                        }
                        
                        // Inject dynamic questions for step 3 based on taxonomy
                        if (window.LyanAI && window.LyanAI.taxonomy && result.subcategory_slug) {
                            const dom = window.LyanAI.taxonomy.domains.find(d => d.slug === result.domain_slug);
                            if (dom) {
                                const cat = dom.categories.find(c => c.slug === result.category_slug);
                                if (cat) {
                                    const sub = cat.subcategories.find(s => s.slug === result.subcategory_slug);
                                    if (sub && sub.questions) {
                                        const step3 = document.querySelector('.wizard-step[data-step="3"]');
                                        let qHTML = `<div class="dynamic-questions" style="margin-bottom: 20px;">`;
                                        sub.questions.forEach((q, i) => {
                                            qHTML += `<label>${q}</label><input type="text" class="modal-input" style="margin-bottom: 12px;">`;
                                        });
                                        qHTML += `</div>`;
                                        
                                        const existingQs = step3.querySelector('.dynamic-questions');
                                        if (existingQs) existingQs.remove();
                                        step3.insertAdjacentHTML('afterbegin', qHTML);
                                    }
                                }
                            }
                        }
                        
                        // Show AI banner
                        const step2 = document.querySelector('.wizard-step[data-step="2"]');
                        const bannerId = 'ai-classification-banner';
                        let banner = document.getElementById(bannerId);
                        if (!banner) {
                            banner = document.createElement('div');
                            banner.id = bannerId;
                            banner.style = "background: #EBF3EE; border: 1px solid var(--primary); padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 0.9rem; color: var(--primary-dark); display: flex; align-items: center; gap: 8px;";
                            step2.insertBefore(banner, step2.firstChild);
                        }
                        
                        if (result.confidence >= 0.8) {
                            banner.innerHTML = `<i class="ph-fill ph-magic-wand"></i> <b>Nous avons compris :</b> ${result.title || "Votre demande"} (Confiance: ${(result.confidence*100).toFixed(0)}%)`;
                        } else {
                            banner.innerHTML = `<i class="ph-fill ph-warning-circle" style="color: #E5B345;"></i> <b>Est-ce bien cela ?</b> ${result.title || "Veuillez vérifier"} (Confiance: ${(result.confidence*100).toFixed(0)}%)`;
                            banner.style.background = "#FFFCF5";
                            banner.style.borderColor = "#E5B345";
                        }
                    }

                    btnNext.innerHTML = originalText;
                    btnNext.disabled = false;
                    goToStep(2);
                } catch (e) {
                    console.error("AI Error:", e);
                    btnNext.innerHTML = originalText;
                    btnNext.disabled = false;
                    goToStep(2); // Fallback to manual selection
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
        btnSubmit.addEventListener('click', () => {
            // Close modal
            modalRequestHelp.classList.remove('active');
            document.body.style.overflow = '';
            
            // Show toast
            if (window.NotificationService) {
                window.NotificationService.showToast('success', "Votre demande a été publiée dans Bokantaj !");
            }
            
            // Trigger AI Artisan response after 3 seconds
            setTimeout(() => {
                if (window.NotificationService) {
                    window.NotificationService.showNotification({
                        id: 'artisan-offer-1',
                        title: 'Proposition reçue !',
                        message: 'Marc (Plombier) a répondu à votre besoin.',
                        icon: 'ph-fill ph-wrench',
                        time: 'À l\'instant',
                        action: 'openChat'
                    });
                }
                // Inject the chat if possible
                triggerSimulatedTransactionChat();
            }, 3500);
        });
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

