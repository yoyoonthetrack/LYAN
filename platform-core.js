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
