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
            return raw ? JSON.parse(raw) : [
                { email: 'david.jean-baptiste@lyann.app', password: 'password123', firstName: 'David', lastName: 'Jean-Baptiste' },
                { email: 'alex.dupont@lyann.app', password: 'password123', firstName: 'Alex', lastName: 'Dupont' }
            ];
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

            // Check Supabase first if available
            if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
                try {
                    const { data, error } = await window.LYANN_API_CLIENT.login(email, password);
                    if (error && error.message && !error.message.includes('non configuré')) {
                        console.warn("Supabase login notice:", error.message);
                    }
                } catch(e) {}
            }

            // Local Registered Users audit
            const users = getRegisteredUsers();
            const foundUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());

            if (foundUser && foundUser.password !== password) {
                if (window.lyannAlert) window.lyannAlert('Mot de passe incorrect. Veuillez vérifier votre saisie.');
                else alert('Mot de passe incorrect. Veuillez vérifier votre saisie.');
                if (pwInput) pwInput.focus();
                return;
            }

            // Store active session
            const activeProfile = foundUser ? {
                firstName: foundUser.firstName,
                lastName: foundUser.lastName,
                email: foundUser.email,
                avatar: foundUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
                createdAt: new Date().toISOString()
            } : {
                firstName: email.split('@')[0],
                lastName: '',
                email: email,
                avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
                createdAt: new Date().toISOString()
            };

            if (typeof safeStorage !== 'undefined') {
                safeStorage.setItem('lyan_user_logged_in', 'true');
                safeStorage.setItem('lyan_user_profile', JSON.stringify(activeProfile));
            }
            localStorage.setItem('lyan_user_logged_in', 'true');
            localStorage.setItem('lyan_user_profile', JSON.stringify(activeProfile));

            if (loginModal) loginModal.classList.remove('active');
            document.body.style.overflow = '';

            if (window.NotificationService) {
                window.NotificationService.showToast('success', `Connexion réussie ! Bienvenue ${activeProfile.firstName}.`);
            } else if (window.lyannAlert) {
                window.lyannAlert(`Connexion réussie ! Bienvenue ${activeProfile.firstName}.`);
            }

            if (typeof window.updateHeaderAuthState === 'function') {
                window.updateHeaderAuthState();
            } else {
                window.location.reload();
            }
        });
    }

    // Google OAuth Handler
    const googleAuthBtns = document.querySelectorAll('.btn-google-auth, #btnGoogleLogin, #btnGoogleSignup');
    googleAuthBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
                try {
                    await window.LYANN_API_CLIENT.supabase.auth.signInWithOAuth({
                        provider: 'google',
                        options: { redirectTo: window.location.origin }
                    });
                } catch(err) {
                    console.warn("Supabase Google OAuth fallback:", err);
                }
            }

            const googleUser = {
                firstName: 'Alexandre',
                lastName: 'Gouyette',
                email: 'alexandre.google@gmail.com',
                avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
                isGoogleAuth: true,
                createdAt: new Date().toISOString()
            };

            registerUser({ ...googleUser, password: 'google_oauth_protected' });

            if (typeof safeStorage !== 'undefined') {
                safeStorage.setItem('lyan_user_logged_in', 'true');
                safeStorage.setItem('lyan_user_profile', JSON.stringify(googleUser));
            }
            localStorage.setItem('lyan_user_logged_in', 'true');
            localStorage.setItem('lyan_user_profile', JSON.stringify(googleUser));

            if (loginModal) loginModal.classList.remove('active');
            if (onboardingModal) onboardingModal.classList.remove('active');
            document.body.style.overflow = '';

            if (window.NotificationService) {
                window.NotificationService.showToast('success', 'Connexion avec Google réussie ! Bienvenue Alexandre.');
            } else if (window.lyannAlert) {
                window.lyannAlert('Connexion avec Google réussie ! Bienvenue Alexandre.');
            }

            if (typeof window.updateHeaderAuthState === 'function') {
                window.updateHeaderAuthState();
            } else {
                window.location.reload();
            }
        });
    });

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

                // Save profile locally immediately
                const userProfile = {
                    firstName: onboardingData.firstName || 'Membre',
                    lastName: onboardingData.lastName || '',
                    email: onboardingData.email || '',
                    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
                    role: 'unified_member',
                    createdAt: new Date().toISOString()
                };

                registerUser({
                    email: onboardingData.email,
                    password: onboardingData.password,
                    firstName: onboardingData.firstName,
                    lastName: onboardingData.lastName
                });

                if (typeof safeStorage !== 'undefined') {
                    safeStorage.setItem('lyan_user_logged_in', 'true');
                    safeStorage.setItem('lyan_user_profile', JSON.stringify(userProfile));
                }
                localStorage.setItem('lyan_user_logged_in', 'true');
                localStorage.setItem('lyan_user_profile', JSON.stringify(userProfile));

                // Non-blocking Supabase signup attempt
                if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
                    try {
                        await window.LYANN_API_CLIENT.signUp(
                            onboardingData.email, 
                            onboardingData.password, 
                            { 
                                first_name: onboardingData.firstName, 
                                last_name: onboardingData.lastName 
                            }
                        );
                    } catch (err) {
                        console.warn("Supabase signup notice:", err);
                    }
                }

                // Update UI Auth State
                if (typeof window.updateHeaderAuthState === 'function') {
                    window.updateHeaderAuthState();
                } else {
                    window.dispatchEvent(new Event('lyann_auth_changed'));
                }
                
                // Proceed directly to Step 3 / Welcome Screen (#obStep4)
                currentStep = 2;
                updateStepsUI();
                obNextBtn.disabled = false;
                obNextBtn.textContent = 'Créer mon compte';
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
    const finalizeOnboarding = () => {
        if (onboardingModal) {
            onboardingModal.classList.remove('active');
            onboardingModal.style.display = 'none';
        }
        document.body.style.overflow = '';
        
        if (typeof safeStorage !== 'undefined') {
            safeStorage.setItem('lyan_user_logged_in', 'true');
        } else {
            localStorage.setItem('lyan_user_logged_in', 'true');
        }
        
        if (typeof window.updateHeaderAuthState === 'function') {
            window.updateHeaderAuthState();
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
