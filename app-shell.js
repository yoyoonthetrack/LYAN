/** LYANN application shell — extracted from legacy script.js without behavior changes. */

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

// === APP WELCOME SCREEN (GUEST MODE / ONBOARDING / LOGIN) ===
function showAppWelcomeScreen() {
    console.log('[AUTH_REAL] welcome/login screen mounted = true');
    if (window.__LYANN_AUTH_REAL__) window.__LYANN_AUTH_REAL__.loginScreenMounted = true;

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

            <div style="display: flex; align-items: center; gap: 8px; margin: 2px 0;">
                <div style="flex: 1; height: 1px; background: rgba(0, 0, 0, 0.12);"></div>
                <span style="font-size: 0.78rem; color: #64748B; font-weight: 500;">ou</span>
                <div style="flex: 1; height: 1px; background: rgba(0, 0, 0, 0.12);"></div>
            </div>

            <button type="button" class="btn btn-google btn-google-auth btn-lg" id="btnWelcomeGoogle" style="justify-content: center; background: #FFFFFF; border: 1px solid #CBD5E1; color: #1E293B; font-weight: 600; min-height: 48px; border-radius: 12px; gap: 10px;">
                <svg width="20" height="20" viewBox="0 0 48 48" class="google-svg-icon">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.66 0 6.6 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.6 42.62 14.66 48 24 48z"/>
                </svg>
                Continuer avec Google
            </button>

            <button class="btn btn-outline btn-lg" id="btnWelcomeGuest" style="justify-content: center; border: none; font-size: 0.85rem; padding: 6px; color: #64748B;">Découvrir en mode invité</button>
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
        console.log('[AUTH_REAL] welcome/login screen mounted = false');
        if (window.__LYANN_AUTH_REAL__) window.__LYANN_AUTH_REAL__.loginScreenMounted = false;
        screen.remove(); // Dismiss welcome view
    });
}

// === MOBILE APP ACCUEIL HOME DASHBOARD ===
async function initMobileHomeDashboard() {
    const isLoggedIn = document.body.classList.contains('user-is-logged-in');

    if (!isLoggedIn) {
        console.log('[AUTH_REAL] App Home mounted = false');
        if (window.__LYANN_AUTH_REAL__) window.__LYANN_AUTH_REAL__.appHomeMounted = false;
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
                <img src="${window.getLyannDefaultAvatar ? window.getLyannDefaultAvatar() : ''}" alt="Mon Profil" class="dashboard-welcome-avatar" id="btnDashboardAvatar">
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
                    openChatWithUser(contact, window.getLyannDefaultAvatar ? window.getLyannDefaultAvatar() : '');
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
    console.log("⚡ [BOOT 05] injectMobileInterface entered");
    if (window.__LYANN_RUNTIME_DIAG__) window.__LYANN_RUNTIME_DIAG__.injectMobileInterfaceEntered = true;
    logLyannTrace("injectMobileInterface_entered");

    const nativeActive = isNativePlatform();
    if (!nativeActive) {
        if (window.__LYANN_RUNTIME_DIAG__) window.__LYANN_RUNTIME_DIAG__.injectMobileInterfaceEarlyReturn = true;
        logLyannTrace("injectMobileInterface_early_return", { reason: "isNativePlatform false" });
        return;
    }
    console.log("⚡ [BOOT 06] native detected: true");
    logLyannTrace("injectMobileInterface_native_detected");

    document.body.classList.add('is-native-app');
    if (window.__LYANN_RUNTIME_DIAG__) window.__LYANN_RUNTIME_DIAG__.bodyIsNativeAppApplied = document.body.classList.contains('is-native-app');

    const path = window.location.pathname;
    const isHome = path.endsWith('index.html') || path.endsWith('/') || (!path.includes('.html'));
    const isExplorer = path.includes('results.html');
    const isBokantaj = path.includes('feed.html');
    const isLoggedIn = document.body.classList.contains('user-is-logged-in') || localStorage.getItem('lyan_user_logged_in') === 'true';

    // DEEP LINK CHECK: Deep links bypass Accueil App and route directly
    const hasDeepLink = window.location.search && (
        window.location.search.includes('view=') ||
        window.location.search.includes('action=') ||
        window.location.search.includes('post_id=') ||
        window.location.search.includes('chat=')
    );

    // Ensure deterministic native app header is applied immediately for ALL native routes
    if (typeof window.ensureDeterministicAppHeader === 'function') {
        window.ensureDeterministicAppHeader();
    }

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
        if (window.__LYANN_RUNTIME_DIAG__) window.__LYANN_RUNTIME_DIAG__.bottomNavCreated = true;
        logLyannTrace("bottomNav_created");
        console.log("⚡ [BOOT 10] bottom nav listeners attached");

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
                if (typeof window.openAccountModalSubView === 'function') {
                    window.openAccountModalSubView('account');
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
                        <h4>Publier un besoin</h4>
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
window.injectMobileInterface = injectMobileInterface;
