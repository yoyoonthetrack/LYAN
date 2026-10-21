/** LYANN platform core — extracted from legacy script.js without behavior changes. */

// === LYANN SINGLE SOURCE OF TRUTH DEFAULT USER AVATAR ===
if (!window.getLyannDefaultAvatar) {
    (function() {
        const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><circle cx="50" cy="50" r="50" fill="#FAF7F2"/><circle cx="50" cy="50" r="48" fill="#EBF2ED" stroke="rgba(74,124,89,0.25)" stroke-width="2"/><circle cx="50" cy="38" r="16" fill="#4A7C59"/><path d="M 22 84 C 22 66, 34 58, 50 58 C 66 58, 78 66, 78 84 Z" fill="#4A7C59"/></svg>`;
        window.LYANN_DEFAULT_AVATAR_SVG = 'data:image/svg+xml,' + encodeURIComponent(rawSvg);
        window.LYANN_DEFAULT_AVATAR_PATH = window.LYANN_DEFAULT_AVATAR_SVG;
    })();

    window.getLyannDefaultAvatar = function() {
        return window.LYANN_DEFAULT_AVATAR_SVG;
    };

    window.escapeHtmlAttr = function(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    };

    window.resolveLyannAvatarSrc = function(input) {
        if (!input) return window.getLyannDefaultAvatar();

        let raw = input;
        if (typeof input === 'object') {
            raw = input.avatar_url || input.author_avatar || input.authorAvatar || input.avatar || input.profile_photo || '';
        }

        if (typeof raw !== 'string') return window.getLyannDefaultAvatar();

        let clean = raw.trim();
        if (!clean) return window.getLyannDefaultAvatar();

        // Extract URL if caller passed raw <img> tag
        if (clean.includes('<') || clean.includes('>')) {
            const match = clean.match(/src=["']([^"']+)["']/i);
            if (match && match[1]) {
                clean = match[1].trim();
            } else {
                return window.getLyannDefaultAvatar();
            }
        }

        if (clean === 'null' || clean === 'undefined' || 
            clean.includes('dicebear.com') || clean.includes('bottts') || 
            clean.includes('avataaars') || clean.includes('avatar_01.png') || 
            clean.includes('david-34.png') || clean === 'default-avatar.svg') {
            return window.getLyannDefaultAvatar();
        }

        return clean;
    };

    window.getLyannAvatarUrl = window.resolveLyannAvatarSrc;

    window.handleAvatarError = function(imgEl) {
        if (imgEl && !imgEl.dataset.fallbackDone) {
            imgEl.dataset.fallbackDone = 'true';
            imgEl.onerror = null;
            imgEl.src = window.LYANN_DEFAULT_AVATAR_SVG;
        }
    };
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

    const nativePlatform = window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform();
    if (nativePlatform === 'android') {
        document.documentElement.classList.add('lyann-android');
        window.lyannHandleAndroidBack = function () {
            const openDialog = document.querySelector('dialog[open]');
            if (openDialog) {
                openDialog.close();
                return true;
            }
            if (document.body.classList.contains('keyboard-open')) {
                const active = document.activeElement;
                if (active && typeof active.blur === 'function') active.blur();
                return true;
            }
            const activeModal = document.querySelector('.modal-overlay.active');
            if (activeModal) {
                if (activeModal.id === 'chatModal' && document.body.classList.contains('chat-conversation-open') && typeof window.backToChatContacts === 'function') {
                    window.backToChatContacts();
                } else if (activeModal.id === 'chatModal' && typeof window.closeLyannChatModal === 'function') {
                    window.closeLyannChatModal();
                } else {
                    activeModal.classList.remove('active');
                    activeModal.style.display = 'none';
                    document.body.style.overflow = '';
                }
                return true;
            }
            if (window.history.length > 1 && !window.__lyannBackStuck) {
                const before = window.location.href;
                window.history.back();
                window.setTimeout(() => {
                    window.__lyannBackStuck = window.location.href === before;
                }, 220);
                return true;
            }
            return false;
        };
        window.addEventListener('offline', () => {
            if (typeof window.showLyanToast === 'function') {
                window.showLyanToast('Connexion interrompue. LYANN reprendra dès le retour du réseau.', '📡');
            }
        });
        window.addEventListener('online', () => {
            if (typeof window.showLyanToast === 'function') window.showLyanToast('Connexion rétablie.', '📡');
        });
    }

    // Android Back Button listener
    const appPlugin = getNativePlugin('App');
    if (appPlugin) {
        appPlugin.addListener('backButton', (data) => {
            if (typeof window.lyannHandleAndroidBack === 'function' && window.lyannHandleAndroidBack()) return;
            if (data && data.canGoBack) {
                const before = window.location.href;
                window.history.back();
                window.setTimeout(() => {
                    if (window.location.href === before) appPlugin.exitApp();
                }, 280);
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
    if (!push) return;
    window.LYANN_PUSH = {
        deactivate: deactivatePushDevice,
        sync: function () { return registerPushDevice(latestPushToken); },
        openPending: openPendingPushNotification
    };
    try {
        let perm = await push.checkPermissions();
        if (perm.receive === 'denied') return;
        if (perm.receive !== 'granted') perm = await push.requestPermissions();
        if (perm.receive !== 'granted') return;
        await push.addListener('registration', (event) => {
            latestPushToken = (event && event.value) || '';
            registerPushDevice(latestPushToken).catch(() => {});
        });
        await push.addListener('registrationError', () => {
            console.warn('Push registration failed');
        });
        await push.register();
        push.addListener('pushNotificationReceived', (event) => {
            const data = event && (event.data || (event.notification && event.notification.data));
            if (shouldSkipForegroundPushToast(data)) return;
            if (typeof window.showLyanToast === 'function') {
                window.showLyanToast('Nouvelle notification LYANN', '🔔');
            }
        });
        push.addListener('pushNotificationActionPerformed', (event) => {
            const data = event && event.notification && (event.notification.data || event.notification);
            openPushNotification(data);
        });
    } catch (error) {
        console.warn('Push setup failed');
    }
}

let latestPushToken = '';

function pushInstallationId() {
    const key = 'lyann_install_id';
    try {
        const existing = localStorage.getItem(key);
        if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
        const created = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : '';
        if (!created) return '';
        localStorage.setItem(key, created);
        return created;
    } catch (_) {
        return '';
    }
}

function pushEnvironment() {
    const debug = window.Capacitor && window.Capacitor.DEBUG;
    return debug ? 'sandbox' : 'production';
}

async function pushAuthHeader() {
    const supabase = window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase;
    const session = supabase ? await supabase.auth.getSession() : null;
    const token = session && session.data && session.data.session && session.data.session.access_token;
    if (!token) return null;
    return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
}

async function registerPushDevice(deviceToken, attempt) {
    const installationId = pushInstallationId();
    if (!installationId || !deviceToken) return;
    const headers = await pushAuthHeader();
    if (!headers) {
        if ((attempt || 0) < 8) {
            setTimeout(() => { registerPushDevice(deviceToken, (attempt || 0) + 1).catch(() => {}); }, 1500);
        }
        return;
    }
    const fetcher = window.lyannBackendFetch || window.fetch.bind(window);
    let response = null;
    try {
        response = await fetcher('/v1/notifications/devices', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                installation_id: installationId,
                token: deviceToken,
                apns_environment: pushEnvironment(),
                platform: 'ios'
            })
        });
    } catch (_) {
        response = null;
    }
    if ((!response || !response.ok) && (attempt || 0) < 8) {
        setTimeout(() => { registerPushDevice(deviceToken, (attempt || 0) + 1).catch(() => {}); }, 1500);
    }
}

function pushThreadAlreadyOpen(data) {
    return shouldSkipForegroundPushToast(data);
}

function shouldSkipForegroundPushToast(data) {
    const policy = window.LYANN_DEAL_NOTIFICATION_POLICY;
    const active = window.LYANN_ACTIVE_CHAT_CONTACT;
    const chatOpen = document.body.classList.contains('lyann-messaging-open');
    const context = {
        appVisible: typeof document === 'undefined' || !document.hidden,
        realtimeLive: window.LYANN_NOTIFICATION_LIVE === true
    };
    const surface = {
        chatOpen,
        contactId: active && (active.id || active.contactId),
        requestId: active && active.requestId
    };
    if (policy && typeof policy.shouldSkipForegroundToast === 'function') {
        return policy.shouldSkipForegroundToast(data, surface, context);
    }
    if (policy && typeof policy.parseNotificationTarget === 'function' && typeof policy.isTargetDisplayed === 'function') {
        return policy.isTargetDisplayed(policy.parseNotificationTarget(data), surface);
    }
    const contactId = data && data.contactId;
    return Boolean(contactId && active && String(contactId) === String(active.id) && chatOpen);
}

async function pushResourceVisible(route, targetId, sessionUserId) {
    const supabase = window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase;
    if (!supabase || !targetId) return false;
    if (route === 'messages') {
        if (sessionUserId) {
            const mine = await supabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', sessionUserId);
            if (mine.error || !Array.isArray(mine.data) || !mine.data.length) return false;
            const ids = mine.data.map((row) => row.conversation_id).filter(Boolean);
            const peer = await supabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', targetId)
                .in('conversation_id', ids)
                .limit(1);
            return !peer.error && Array.isArray(peer.data) && peer.data.length > 0;
        }
        const { data, error } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', targetId)
            .limit(1);
        return !error && Array.isArray(data) && data.length > 0;
    }
    if (route === 'mission') {
        const { data, error } = await supabase
            .from('requests')
            .select('id')
            .eq('id', targetId)
            .limit(1);
        return !error && Array.isArray(data) && data.length > 0;
    }
    return false;
}

async function notificationResourceAllowed(plan, sessionUserId) {
    if (!plan || !plan.open || !plan.target) return false;
    if (plan.target.access && plan.target.access.authorized === true) return false;
    if (plan.route === 'finances') return true;
    if (plan.route === 'messages') {
        if (!plan.payload || !plan.payload.contactId) return false;
        if (!await pushResourceVisible('messages', plan.payload.contactId, sessionUserId)) return false;
        if (plan.payload.requestId && !await pushResourceVisible('mission', plan.payload.requestId, sessionUserId)) return false;
        return true;
    }
    if (plan.route === 'mission') {
        return pushResourceVisible('mission', plan.payload && plan.payload.requestId, sessionUserId);
    }
    return false;
}

async function openPushNotification(data) {
    const policy = window.LYANN_DEAL_NOTIFICATION_POLICY;
    const sessionUser = window.CURRENT_USER_ID
        || window.LYANN_AUTH_STATE?.getSnapshot?.().userId
        || null;
    if (!sessionUser) {
        try {
            const raw = policy && typeof policy.serializePendingPushTarget === 'function'
                ? policy.serializePendingPushTarget(data)
                : JSON.stringify({
                    route: (data && data.route) || '',
                    contactId: (data && data.contactId) || '',
                    requestId: (data && data.requestId) || '',
                    invitationId: (data && data.invitationId) || '',
                    quoteId: (data && data.quoteId) || '',
                    missionId: (data && data.missionId) || '',
                    milestoneId: (data && data.milestoneId) || ''
                });
            sessionStorage.setItem('lyann_push_target', raw);
        } catch (_) {}
        if (typeof window.openLoginModal === 'function') window.openLoginModal();
        return false;
    }
    if (!window.LYANN_ROUTER || typeof window.LYANN_ROUTER.go !== 'function') return false;
    const plan = policy && typeof policy.planNotificationNavigation === 'function'
        ? policy.planNotificationNavigation(data, { viewerId: sessionUser })
        : null;
    if (plan) {
        if (!plan.open) return false;
        if (!await notificationResourceAllowed(plan, sessionUser)) return false;
        if (plan.route === 'finances') return window.LYANN_ROUTER.go('finances');
        if (plan.route === 'messages') return window.LYANN_ROUTER.go('messages', plan.payload);
        if (plan.route === 'mission') return window.LYANN_ROUTER.go('mission', plan.payload);
        return false;
    }
    const route = data && data.route;
    const contactId = data && data.contactId;
    const requestId = data && data.requestId;
    if (contactId && String(contactId) === String(sessionUser)) return false;
    if (route === 'finances') return window.LYANN_ROUTER.go('finances');
    if (route === 'messages') {
        if (!await pushResourceVisible('messages', contactId, sessionUser)) return false;
        return window.LYANN_ROUTER.go('messages', { contactId, requestId: requestId || undefined, scopeSource: 'notification' });
    }
    if (route === 'mission') {
        if (!await pushResourceVisible('mission', requestId, sessionUser)) return false;
        return window.LYANN_ROUTER.go('mission', { requestId });
    }
    return false;
}

function openPendingPushNotification() {
    const policy = window.LYANN_DEAL_NOTIFICATION_POLICY;
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem('lyann_push_target') || 'null'); } catch (_) {}
    if (policy && typeof policy.parsePendingPushTarget === 'function') {
        pending = policy.parsePendingPushTarget(pending);
    }
    if (!pending || !pending.route) return false;
    try { sessionStorage.removeItem('lyann_push_target'); } catch (_) {}
    return openPushNotification(pending);
}

async function deactivatePushDevice() {
    const installationId = pushInstallationId();
    if (!installationId) return;
    const headers = await pushAuthHeader();
    if (!headers) return;
    const fetcher = window.lyannBackendFetch || window.fetch.bind(window);
    await fetcher('/v1/notifications/devices/deactivate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ installation_id: installationId })
    });
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
