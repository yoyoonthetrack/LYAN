/**
 * LYANN - Onboarding Logic (Single Account Flow)
 */

function runOnDomReady(fn) {
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        fn();
    } else {
        document.addEventListener('DOMContentLoaded', fn);
    }
}

runOnDomReady(() => {

    // === ELEMENTS ===
    const onboardingModal = document.getElementById('onboardingModal');
    const closeOnboardingBtn = document.getElementById('closeOnboardingBtn');
    
    // Login Modal Elements
    const loginModal = document.getElementById('loginModal');
    const closeLoginModalBtn = document.getElementById('closeLoginModalBtn');
    const switchToSignupBtn = document.getElementById('switchToSignupBtn');
    const loginForm = document.getElementById('loginForm');

    // Global Login toggle function
    window.openLogin = function() {
        if (loginModal) {
            loginModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    };

    // Attach Login Triggers
    const loginTriggers = document.querySelectorAll('.open-login-trigger, .open-login-modal, #btnWelcomeLogin');
    loginTriggers.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            window.openLogin();
        });
    });

    if (closeLoginModalBtn) {
        closeLoginModalBtn.addEventListener('click', () => {
            if (loginModal) {
                loginModal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    // Registered users database helper
    function getRegisteredUsers() {
        try {
            const raw = localStorage.getItem('lyan_registered_users');
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function registerUser(userData) {
        const users = getRegisteredUsers();
        const existingIdx = users.findIndex(u => u.email.toLowerCase() === userData.email.toLowerCase());
        if (existingIdx >= 0) {
            users[existingIdx] = { ...users[existingIdx], ...userData };
        } else {
            users.push(userData);
        }
        localStorage.setItem('lyan_registered_users', JSON.stringify(users));
    }

    if (switchToSignupBtn) {
        switchToSignupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (loginModal) loginModal.classList.remove('active');
            window.openOnboarding();
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emInput = document.getElementById('loginEmail') || loginForm.querySelector('input[type="email"]');
            const pwInput = document.getElementById('loginPassword') || loginForm.querySelector('input[type="password"]');

            const email = emInput ? emInput.value.trim() : '';
            const password = pwInput ? pwInput.value.trim() : '';

            if (!email || !password) {
                if (window.lyannAlert) window.lyannAlert('Veuillez saisir votre e-mail et votre mot de passe.');
                else alert('Veuillez saisir votre e-mail et votre mot de passe.');
                return;
            }

            // Authenticate with Supabase
            if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
                try {
                    const { data, error } = await window.LYANN_API_CLIENT.login(email, password);
                    if (error) {
                        const errorMsg = error.message || 'Erreur lors de la connexion.';
                        if (window.lyannAlert) window.lyannAlert(errorMsg);
                        else alert(errorMsg);
                        return;
                    }
                    if (data && data.session) {
                        // Purge any stale mock/cached local profile
                        if (typeof safeStorage !== 'undefined') {
                            safeStorage.removeItem('lyan_user_profile');
                        }
                        localStorage.removeItem('lyan_user_profile');

                        if (loginModal) loginModal.classList.remove('active');
                        document.body.style.overflow = '';

                        if (window.NotificationService) {
                            window.NotificationService.showToast('success', 'Connexion réussie !');
                        } else if (window.lyannAlert) {
                            window.lyannAlert('Connexion réussie !');
                        }

                        if (typeof window.updateHeaderAuthState === 'function') {
                            await window.updateHeaderAuthState();
                        } else {
                            window.location.reload();
                        }
                        return;
                    }
                } catch(err) {
                    console.error("[LYANN AUTH] Supabase login error:", err);
                    if (window.lyannAlert) window.lyannAlert(err.message || 'Erreur de connexion.');
                    else alert(err.message || 'Erreur de connexion.');
                    return;
                }
                return;
            }

            if (window.lyannAlert) window.lyannAlert('Authentification Supabase indisponible.');
        });
    }

    // Canonical Native OAuth Callback URL
    const CANONICAL_NATIVE_CALLBACK = 'app.lyann.dom://google-auth';

    // Google OAuth Handler (Delegated Event Listener for static & dynamic buttons)
    if (!window.__googleAuthDelegatorBound__) {
        window.__googleAuthDelegatorBound__ = true;
        document.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-google-auth, #btnGoogleLogin, #btnGoogleSignup, #googleAuthBtn, .btn-google, #btnWelcomeGoogle');
            if (btn) {
                e.preventDefault();
                console.log('[Google Auth] Initiating OAuth trigger from button:', btn.id || btn.className);
                if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
                    try {
                        const isNative = (typeof window.isNativePlatform === 'function' && window.isNativePlatform()) || (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
                        const redirectUrl = isNative ? CANONICAL_NATIVE_CALLBACK : window.location.origin;
                        console.log('[Google Auth] Initiating OAuth with redirectTo:', redirectUrl);
                        const { data, error } = await window.LYANN_API_CLIENT.supabase.auth.signInWithOAuth({
                            provider: 'google',
                            options: { redirectTo: redirectUrl }
                        });
                        if (error) {
                            console.warn("[Google Auth] Supabase Google OAuth error:", error);
                            if (window.NotificationService) {
                                window.NotificationService.showToast('warning', 'Connexion Google : configuration du fournisseur requise dans Supabase.');
                            } else if (window.lyannAlert) {
                                window.lyannAlert('Connexion Google : configuration du fournisseur requise dans Supabase.');
                            }
                        }
                    } catch(err) {
                        console.warn("[Google Auth] Error:", err);
                        if (window.lyannAlert) window.lyannAlert('Erreur lors de la connexion Google: ' + err.message);
                    }
                } else {
                    if (window.lyannAlert) window.lyannAlert('Client Supabase indisponible pour la connexion Google.');
                }
            }
        });
    }

    // Native Capacitor App Deep Link Listener for Google OAuth Return
    if (!window.__nativeOAuthListenerBound__ && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
        window.__nativeOAuthListenerBound__ = true;
        try {
            window.Capacitor.Plugins.App.addListener('appUrlOpen', async (data) => {
                console.log('[NATIVE_OAUTH] appUrlOpen received URL:', data?.url);
                if (data && data.url && (data.url.includes('google-auth') || data.url.startsWith('app.lyann.dom'))) {
                    try {
                        const normalizedUrl = data.url.replace(/^app\.lyann\.dom:\/\//i, 'https://app.lyann.dom/');
                        const urlObj = new URL(normalizedUrl);
                        const code = urlObj.searchParams.get('code');
                        
                        if (code && window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
                            console.log('[NATIVE_OAUTH] Exchanging PKCE code for session...');
                            const { data: sessionData, error: sessionErr } = await window.LYANN_API_CLIENT.supabase.auth.exchangeCodeForSession(code);
                            if (sessionErr) {
                                console.error('[NATIVE_OAUTH] exchangeCodeForSession error:', sessionErr);
                            } else {
                                console.log('[NATIVE_OAUTH] Session established via PKCE code exchange!', sessionData?.session?.user?.id);
                            }
                        } else if (urlObj.hash && window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
                            const hashParams = new URLSearchParams(urlObj.hash.substring(1));
                            const accessToken = hashParams.get('access_token');
                            const refreshToken = hashParams.get('refresh_token');
                            if (accessToken && refreshToken) {
                                console.log('[NATIVE_OAUTH] Setting Supabase session from hash tokens...');
                                await window.LYANN_API_CLIENT.supabase.auth.setSession({
                                    access_token: accessToken,
                                    refresh_token: refreshToken
                                });
                            }
                        }

                        if (typeof window.checkAuthState === 'function') {
                            await window.checkAuthState();
                        } else {
                            window.location.reload();
                        }
                    } catch (err) {
                        console.error('[NATIVE_OAUTH] Error processing callback URL:', err);
                    }
                }
            });
            console.log('[NATIVE_OAUTH] Capacitor appUrlOpen listener successfully attached.');
        } catch (err) {
            console.warn('[NATIVE_OAUTH] Failed to attach Capacitor appUrlOpen listener:', err);
        }
    }

    // Attach Signup Triggers
    const signupTriggers = document.querySelectorAll('.open-signup-trigger, .open-register-modal, #btnWelcomeSignup');
    signupTriggers.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            window.openOnboarding();
        });
    });
    
    // Steps (Single unified profile: starts at Personal Info -> Engagement -> Finalisation)
    const steps = [
        document.getElementById('obStep2'),
        document.getElementById('obStep3'),
        document.getElementById('obStep4')
    ].filter(Boolean);

    // Hide old obStep1 if present
    const oldStep1 = document.getElementById('obStep1');
    if (oldStep1) oldStep1.style.display = 'none';

    const obStepCountText = document.getElementById('obStepCountText');
    const obProgressBarFill = document.getElementById('obProgressBarFill');
    const obNextBtn = document.getElementById('obNextBtn');
    const obPrevBtn = document.getElementById('obPrevBtn');
    const obModalFooter = document.getElementById('obModalFooter');
    
    // State
    let currentStep = 0; // 0: Infos, 1: Engagement, 2: Succès
    let onboardingData = {
        intent: 'unified_profile',
        firstName: '',
        lastName: '',
        email: '',
        password: ''
    };

    // Global toggle function
    window.openOnboarding = function() {
        if (onboardingModal) {
            onboardingModal.classList.add('active');
            document.body.style.overflow = 'hidden';
            resetOnboarding();
        }
    };
    
    if (closeOnboardingBtn) {
        closeOnboardingBtn.addEventListener('click', () => {
            if (onboardingModal) onboardingModal.classList.remove('active');
            document.body.style.overflow = '';
        });
    }

    // === NAVIGATION LOGIC ===
    function updateStepsUI() {
        // Hide all steps
        steps.forEach((step, idx) => {
            if (step) {
                if (idx === currentStep) {
                    step.classList.add('active');
                    step.style.display = 'block';
                    step.style.opacity = '0';
                    setTimeout(() => { step.style.opacity = '1'; }, 50);
                } else {
                    step.classList.remove('active');
                    step.style.display = 'none';
                }
            }
        });

        // Update progress bar & indicator text (2-step registration)
        if (currentStep === 0) {
            if (obProgressBarFill) obProgressBarFill.style.width = '50%';
            if (obStepCountText) obStepCountText.textContent = 'Étape 1 sur 2';
            if (obPrevBtn) obPrevBtn.style.visibility = 'hidden';
            if (obNextBtn) obNextBtn.textContent = 'Continuer';
            if (obModalFooter) obModalFooter.style.display = 'flex';
        } else if (currentStep === 1) {
            if (obProgressBarFill) obProgressBarFill.style.width = '100%';
            if (obStepCountText) obStepCountText.textContent = 'Étape 2 sur 2';
            if (obPrevBtn) obPrevBtn.style.visibility = 'visible';
            if (obNextBtn) obNextBtn.textContent = 'Créer mon compte';
            if (obModalFooter) obModalFooter.style.display = 'flex';
        } else if (currentStep === 2) {
            if (obProgressBarFill) obProgressBarFill.style.width = '100%';
            if (obStepCountText) obStepCountText.textContent = 'Finalisation';
            if (obModalFooter) obModalFooter.style.display = 'none';
            const nameSpan = document.getElementById('obSuccessName');
            if (nameSpan) nameSpan.textContent = onboardingData.firstName || 'Membre';
        }
    }

    if (obNextBtn) {
        obNextBtn.addEventListener('click', async () => {
            // Validation Step 1 (Personal Info)
            if (currentStep === 0) {
                const fnEl = document.getElementById('obFirstName');
                const lnEl = document.getElementById('obLastName');
                const emEl = document.getElementById('obEmail');
                const pwEl = document.getElementById('obPassword');

                let fn = fnEl ? fnEl.value.trim() : '';
                let ln = lnEl ? lnEl.value.trim() : '';
                let em = emEl ? emEl.value.trim() : '';
                let pw = pwEl ? pwEl.value.trim() : '';

                if (!fn) {
                    if (window.lyannAlert) window.lyannAlert('Veuillez indiquer votre prénom.');
                    else alert('Veuillez indiquer votre prénom.');
                    if (fnEl) fnEl.focus();
                    return;
                }

                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!em || !emailRegex.test(em)) {
                    if (window.lyannAlert) window.lyannAlert('Veuillez indiquer une adresse e-mail valide (ex: vous@domaine.com).');
                    else alert('Veuillez indiquer une adresse e-mail valide (ex: vous@domaine.com).');
                    if (emEl) emEl.focus();
                    return;
                }

                if (!pw || pw.length < 6) {
                    if (window.lyannAlert) window.lyannAlert('Le mot de passe doit contenir au moins 6 caractères.');
                    else alert('Le mot de passe doit contenir au moins 6 caractères.');
                    if (pwEl) pwEl.focus();
                    return;
                }

                // Check duplicate email
                const users = getRegisteredUsers();
                const duplicate = users.find(u => u.email.toLowerCase() === em.toLowerCase());
                if (pw.length < 8) {
                    if (window.lyannAlert) window.lyannAlert('Le mot de passe doit comporter au moins 8 caractères.');
                    else alert('Le mot de passe doit comporter au moins 8 caractères.');
                    if (pwEl) pwEl.focus();
                    return;
                }

                if (duplicate) {
                    if (window.lyannAlert) window.lyannAlert(`L'adresse email ${em} est déjà enregistrée. Veuillez vous connecter.`);
                    else alert(`L'adresse email ${em} est déjà enregistrée. Veuillez vous connecter.`);
                    if (emEl) emEl.focus();
                    return;
                }

                onboardingData.firstName = fn;
                onboardingData.lastName = ln || 'Lyann';
                onboardingData.email = em;
                onboardingData.password = pw;

                currentStep = 1;
                updateStepsUI();
                return;
            }

            // Submit on Step 2 (Engagement) -> Click "Créer mon compte"
            if (currentStep === 1) {
                obNextBtn.disabled = true;
                obNextBtn.textContent = 'Création en cours...';

                try {
                    if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
                        const { data, error } = await window.LYANN_API_CLIENT.signUp(
                            onboardingData.email, 
                            onboardingData.password, 
                            { 
                                first_name: onboardingData.firstName, 
                                last_name: onboardingData.lastName 
                            }
                        );

                        if (error) throw error;
                    }

                    const userProfile = {
                        firstName: onboardingData.firstName || 'Membre',
                        lastName: onboardingData.lastName || '',
                        email: onboardingData.email || '',
                        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
                        role: 'unified_member',
                        createdAt: new Date().toISOString()
                    };

                    if (typeof safeStorage !== 'undefined') {
                        safeStorage.setItem('lyan_user_profile', JSON.stringify(userProfile));
                    }
                    localStorage.setItem('lyan_user_profile', JSON.stringify(userProfile));

                    // Show Email Verification Notice
                    if (window.lyannAlert) {
                        window.lyannAlert(`📩 Inscription enregistrée ! Un email de confirmation a été envoyé à ${onboardingData.email}. Veuillez valider votre adresse email avant de vous connecter.`);
                    }

                    currentStep = 2;
                    updateStepsUI();
                } catch (err) {
                    const normErr = (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.normalizeAuthError)
                        ? window.LYANN_API_CLIENT.normalizeAuthError(err)
                        : err;
                    if (window.lyannAlert) window.lyannAlert('Erreur lors de l’inscription : ' + (normErr.message || err.message));
                    else alert('Erreur lors de l’inscription : ' + (normErr.message || err.message));
                } finally {
                    obNextBtn.disabled = false;
                    obNextBtn.textContent = 'Créer mon compte';
                }
                return;
            }
        });
    }

    if (obPrevBtn) {
        obPrevBtn.addEventListener('click', () => {
            if (currentStep > 0) {
                currentStep--;
                updateStepsUI();
            }
        });
    }

    function resetOnboarding() {
        currentStep = 0;
        const fnEl = document.getElementById('obFirstName');
        const lnEl = document.getElementById('obLastName');
        const emEl = document.getElementById('obEmail');
        const pwEl = document.getElementById('obPassword');

        if (fnEl) fnEl.value = '';
        if (lnEl) lnEl.value = '';
        if (emEl) emEl.value = '';
        if (pwEl) pwEl.value = '';
        
        onboardingData = { intent: 'unified_profile', firstName: '', lastName: '', email: '', password: '' };
        updateStepsUI();
    }

    // Final actions
    const finalizeOnboarding = async () => {
        if (onboardingModal) {
            onboardingModal.classList.remove('active');
            onboardingModal.style.display = 'none';
        }
        document.body.style.overflow = '';
        
        if (typeof window.updateHeaderAuthState === 'function') {
            await window.updateHeaderAuthState();
        } else {
            window.dispatchEvent(new Event('lyann_auth_changed'));
        }
    };

    const obBtnFinalAction = document.getElementById('obBtnFinalAction');
    const obBtnFinalProfile = document.getElementById('obBtnFinalProfile');

    if (obBtnFinalAction) {
        obBtnFinalAction.addEventListener('click', (e) => {
            e.preventDefault();
            finalizeOnboarding();
            if (window.NotificationService) {
                window.NotificationService.showToast('info', 'Profil complété à 40%. N\'oubliez pas d\'ajouter vos compétences dans Mon Espace.');
            } else if (window.lyannAlert) {
                window.lyannAlert('Profil complété à 40%. N\'oubliez pas d\'ajouter vos compétences dans Mon Espace.');
            }
        });
    }

    if (obBtnFinalProfile) {
        obBtnFinalProfile.addEventListener('click', (e) => {
            e.preventDefault();
            finalizeOnboarding();
            setTimeout(() => {
                if (typeof window.openCompleteProfileModal === 'function') {
                    window.openCompleteProfileModal();
                } else {
                    const userAccountModal = document.getElementById('userAccountModal');
                    if (userAccountModal) {
                        userAccountModal.style.display = 'flex';
                        userAccountModal.classList.add('active');
                        document.body.style.overflow = 'hidden';
                    }
                }
            }, 50);
        });
    }

});
