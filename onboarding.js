/**
 * LYANN - Onboarding Logic (Single Account Flow)
 */

document.addEventListener('DOMContentLoaded', () => {

    // === ELEMENTS ===
    const onboardingModal = document.getElementById('onboardingModal');
    const closeOnboardingBtn = document.getElementById('closeOnboardingBtn');
    
    // Steps
    const steps = [
        document.getElementById('obStep1'),
        document.getElementById('obStep2'),
        document.getElementById('obStep3'),
        document.getElementById('obStep4')
    ];
    const obStepCountText = document.getElementById('obStepCountText');
    const obProgressBarFill = document.getElementById('obProgressBarFill');
    const obNextBtn = document.getElementById('obNextBtn');
    const obPrevBtn = document.getElementById('obPrevBtn');
    const obModalFooter = document.getElementById('obModalFooter');
    
    // State
    let currentStep = 0; // 0, 1, 2, 3
    let onboardingData = {
        intent: 'discover', // default
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
            onboardingModal.classList.remove('active');
            document.body.style.overflow = '';
        });
    }

    // Step 1 : Intent selection
    const intentCards = document.querySelectorAll('.choice-card');
    intentCards.forEach(card => {
        card.addEventListener('click', () => {
            intentCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            onboardingData.intent = card.getAttribute('data-intent');
        });
    });

    // === NAVIGATION LOGIC ===
    function updateStepsUI() {
        // Hide all steps
        steps.forEach((step, idx) => {
            if (step) {
                if (idx === currentStep) {
                    step.classList.add('active');
                    // simple fade animation
                    step.style.opacity = '0';
                    setTimeout(() => { step.style.opacity = '1'; }, 50);
                } else {
                    step.classList.remove('active');
                }
            }
        });

        // Update progress bar
        const progressPercent = ((currentStep) / (steps.length - 1)) * 100;
        if (obProgressBarFill) obProgressBarFill.style.width = `${progressPercent}%`;

        // Update Text
        if (obStepCountText && currentStep < 3) {
            obStepCountText.textContent = `Étape ${currentStep + 1} sur 3`;
        } else if (obStepCountText && currentStep === 3) {
            obStepCountText.textContent = `Finalisation`;
        }

        // Hide/Show footer buttons
        if (currentStep === 0) {
            obPrevBtn.style.visibility = 'hidden';
            obNextBtn.textContent = 'Continuer';
            obModalFooter.style.display = 'flex';
        } else if (currentStep === 1) {
            obPrevBtn.style.visibility = 'visible';
            obNextBtn.textContent = "Je m'engage";
            obModalFooter.style.display = 'flex';
        } else if (currentStep === 2) {
            obPrevBtn.style.visibility = 'visible';
            obNextBtn.textContent = 'Créer mon compte';
            obModalFooter.style.display = 'flex';
        } else if (currentStep === 3) {
            // Success step: hide footer
            obModalFooter.style.display = 'none';
            const nameSpan = document.getElementById('obSuccessName');
            if (nameSpan) nameSpan.textContent = onboardingData.firstName || 'Membre';
        }
    }

    if (obNextBtn) {
        obNextBtn.addEventListener('click', async () => {
            // Validation step 1
            if (currentStep === 0) {
                if (!document.querySelector('.choice-card.selected')) {
                    window.lyannAlert('Veuillez sélectionner une raison pour continuer.');
                    return;
                }
            }

            // Validation step 2
            if (currentStep === 1) {
                const fn = document.getElementById('obFirstName').value.trim();
                const ln = document.getElementById('obLastName').value.trim();
                const em = document.getElementById('obEmail').value.trim();
                const pw = document.getElementById('obPassword').value.trim();

                if (!fn || !ln || !em || !pw) {
                    window.lyannAlert('Veuillez remplir tous les champs obligatoires.');
                    return;
                }
                onboardingData.firstName = fn;
                onboardingData.lastName = ln;
                onboardingData.email = em;
                onboardingData.password = pw;
            }

            // Submit on Step 3
            if (currentStep === 2) {
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
                    
                    // Proceed to step 4
                    currentStep++;
                    updateStepsUI();

                } catch (err) {
                    window.lyannAlert('Erreur lors de la création du compte : ' + err.message);
                } finally {
                    obNextBtn.disabled = false;
                    obNextBtn.textContent = 'Créer mon compte';
                }
                return;
            }

            if (currentStep < 3) {
                currentStep++;
                updateStepsUI();
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
        document.getElementById('obFirstName').value = '';
        document.getElementById('obLastName').value = '';
        document.getElementById('obEmail').value = '';
        document.getElementById('obPassword').value = '';
        intentCards.forEach(c => c.classList.remove('selected'));
        onboardingData = { intent: 'discover', firstName: '', lastName: '', email: '', password: '' };
        updateStepsUI();
    }

    // Final actions
    const finalizeOnboarding = () => {
        onboardingModal.classList.remove('active');
        document.body.style.overflow = '';
        
        // Mock login
        if (typeof safeStorage !== 'undefined') {
            safeStorage.setItem('lyan_user_logged_in', 'true');
        } else {
            localStorage.setItem('lyan_user_logged_in', 'true');
        }
        
        // Let main script.js update the header if the function is global
        if (typeof window.updateHeaderAuthState === 'function') {
            window.updateHeaderAuthState();
        } else {
            // Trigger a custom event to notify script.js
            window.dispatchEvent(new Event('lyann_auth_changed'));
            window.location.reload(); // Fallback
        }

        if (onboardingData.intent === 'need_help') {
            const searchInput = document.querySelector('.search-container input');
            if (searchInput) searchInput.focus();
        }
    };

    const obBtnFinalAction = document.getElementById('obBtnFinalAction');
    const obBtnFinalProfile = document.getElementById('obBtnFinalProfile');

    if (obBtnFinalAction) obBtnFinalAction.addEventListener('click', finalizeOnboarding);
    if (obBtnFinalProfile) {
        obBtnFinalProfile.addEventListener('click', () => {
            finalizeOnboarding();
            const profileModal = document.getElementById('profileDashboardModal');
            if (profileModal) {
                profileModal.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        });
    }

});
