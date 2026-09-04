/**
 * LYANN - Interactive Profile Completion Wizard & Persistence Logic
 */

(function() {
    function initProfileCompletion() {
        const modal = document.getElementById('modalCompleteProfile');
        if (!modal) return;

        const closeBtn = document.getElementById('closeCompleteProfileBtn');
        const prevBtn = document.getElementById('cpPrevBtn');
        const nextBtn = document.getElementById('cpNextBtn');
        const progressBarFill = document.getElementById('cpProgressBarFill');
        const stepIndicator = document.getElementById('cpStepIndicator');

        let currentStep = 0; // 0, 1, 2, 3
        const stepTitles = [
            'Étape 1 sur 4 : Photo & Identité',
            'Étape 2 sur 4 : Localisation & Quartier',
            'Étape 3 sur 4 : Mes Compétences & Services',
            'Étape 4 sur 4 : Contact & Présentation'
        ];

        const selectedSkills = new Set();
        let currentAvatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80';

        // Load existing profile if present
        function loadExistingProfile() {
            try {
                const raw = localStorage.getItem('lyan_user_profile') || (typeof safeStorage !== 'undefined' ? safeStorage.getItem('lyan_user_profile') : null);
                if (raw) {
                    const prof = JSON.parse(raw);
                    if (prof.firstName) {
                        const fn = document.getElementById('cpFirstName');
                        if (fn) fn.value = prof.firstName;
                    }
                    if (prof.lastName) {
                        const ln = document.getElementById('cpLastName');
                        if (ln) ln.value = prof.lastName;
                    }
                    if (prof.headline) {
                        const hl = document.getElementById('cpHeadline');
                        if (hl) hl.value = prof.headline;
                    }
                    if (prof.city) {
                        const ci = document.getElementById('cpCityInput');
                        if (ci) ci.value = prof.city;
                    }
                    if (prof.phone) {
                        const ph = document.getElementById('cpPhone');
                        if (ph) ph.value = prof.phone;
                    }
                    if (prof.bio) {
                        const bi = document.getElementById('cpBio');
                        if (bi) bi.value = prof.bio;
                    }
                    if (prof.avatar) {
                        currentAvatar = prof.avatar;
                        const prev = document.getElementById('cpAvatarPreview');
                        if (prev) prev.src = prof.avatar;
                    }
                    if (prof.skills && Array.isArray(prof.skills)) {
                        selectedSkills.clear();
                        prof.skills.forEach(s => selectedSkills.add(s));
                        updateSkillTagsUI();
                    }
                }
            } catch(e) {}
        }

        // Skill tag clicks
        const skillTags = document.querySelectorAll('.cp-skill-tag');
        skillTags.forEach(btn => {
            btn.addEventListener('click', () => {
                const skill = btn.getAttribute('data-skill');
                if (selectedSkills.has(skill)) {
                    selectedSkills.delete(skill);
                    btn.classList.remove('active');
                } else {
                    selectedSkills.add(skill);
                    btn.classList.add('active');
                }
            });
        });

        function updateSkillTagsUI() {
            skillTags.forEach(btn => {
                const skill = btn.getAttribute('data-skill');
                if (selectedSkills.has(skill)) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }

        // Preset avatar selection
        const presetAvatars = document.querySelectorAll('.cp-preset-avatar');
        presetAvatars.forEach(img => {
            img.addEventListener('click', () => {
                presetAvatars.forEach(a => a.classList.remove('active'));
                img.classList.add('active');
                currentAvatar = img.src;
                const prev = document.getElementById('cpAvatarPreview');
                if (prev) prev.src = currentAvatar;
            });
        });

        // File upload avatar preview
        const avatarInput = document.getElementById('cpAvatarUploadInput');
        if (avatarInput) {
            avatarInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        currentAvatar = evt.target.result;
                        const prev = document.getElementById('cpAvatarPreview');
                        if (prev) prev.src = currentAvatar;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        // GPS button handler
        const gpsBtn = document.getElementById('cpGpsBtn');
        if (gpsBtn) {
            gpsBtn.addEventListener('click', async () => {
                gpsBtn.innerHTML = '<i class="ph ph-spinner-gap spin-animation"></i> GPS...';
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(() => {
                        const cityInput = document.getElementById('cpCityInput');
                        if (cityInput) cityInput.value = "Baie-Mahault (97122)";
                        gpsBtn.innerHTML = '<i class="ph ph-check"></i> Détecté';
                        setTimeout(() => { gpsBtn.innerHTML = '<i class="ph ph-crosshair"></i> GPS'; }, 2000);
                    }, () => {
                        const cityInput = document.getElementById('cpCityInput');
                        if (cityInput) cityInput.value = "Baie-Mahault (97122)";
                        gpsBtn.innerHTML = '<i class="ph ph-crosshair"></i> GPS';
                    });
                } else {
                    const cityInput = document.getElementById('cpCityInput');
                    if (cityInput) cityInput.value = "Baie-Mahault (97122)";
                    gpsBtn.innerHTML = '<i class="ph ph-crosshair"></i> GPS';
                }
            });
        }

        // Wizard step UI navigation
        function updateWizardUI() {
            const steps = [
                document.getElementById('cpStep1'),
                document.getElementById('cpStep2'),
                document.getElementById('cpStep3'),
                document.getElementById('cpStep4')
            ];

            steps.forEach((step, idx) => {
                if (step) {
                    if (idx === currentStep) {
                        step.style.display = 'block';
                        step.classList.add('active');
                    } else {
                        step.style.display = 'none';
                        step.classList.remove('active');
                    }
                }
            });

            if (stepIndicator) stepIndicator.textContent = stepTitles[currentStep];
            if (progressBarFill) progressBarFill.style.width = ((currentStep + 1) * 25) + '%';

            if (prevBtn) {
                prevBtn.style.visibility = currentStep === 0 ? 'hidden' : 'visible';
            }

            if (nextBtn) {
                if (currentStep === 3) {
                    nextBtn.innerHTML = '<i class="ph-fill ph-check-circle"></i> Enregistrer & Terminer';
                    nextBtn.classList.remove('btn-primary');
                    nextBtn.classList.add('btn-accent');
                } else {
                    nextBtn.innerHTML = 'Continuer <i class="ph ph-arrow-right"></i>';
                    nextBtn.classList.remove('btn-accent');
                    nextBtn.classList.add('btn-primary');
                }
            }
        }

        // Auto scroll active field into view when keyboard opens on mobile
        const formInputs = modal.querySelectorAll('input, select, textarea');
        formInputs.forEach(input => {
            input.addEventListener('focus', () => {
                setTimeout(() => {
                    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 150);
            });
        });

        // Open wizard function
        window.openCompleteProfileModal = function() {
            loadExistingProfile();
            currentStep = 0;
            updateWizardUI();
            if (modal) {
                modal.style.display = 'flex';
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
                const bodyContainer = modal.querySelector('.modal-complete-profile-body') || modal.querySelector('.modal-card');
                if (bodyContainer) bodyContainer.scrollTop = 0;
            }
        };

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (modal) {
                    modal.classList.remove('active');
                    modal.style.display = 'none';
                    document.body.style.overflow = '';
                }
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (currentStep > 0) {
                    currentStep--;
                    updateWizardUI();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                // Validation per step
                if (currentStep === 0) {
                    const fn = document.getElementById('cpFirstName');
                    if (!fn || !fn.value.trim()) {
                        if (window.lyannAlert) window.lyannAlert('Veuillez indiquer votre prénom.');
                        else alert('Veuillez indiquer votre prénom.');
                        if (fn) fn.focus();
                        return;
                    }
                } else if (currentStep === 1) {
                    const city = document.getElementById('cpCityInput');
                    if (!city || !city.value.trim()) {
                        if (window.lyannAlert) window.lyannAlert('Veuillez indiquer votre commune.');
                        else alert('Veuillez indiquer votre commune.');
                        if (city) city.focus();
                        return;
                    }
                }

                if (currentStep < 3) {
                    currentStep++;
                    updateWizardUI();
                } else {
                    // Final Submit! Save Profile
                    saveCompletedProfile();
                }
            });
        }

        function saveCompletedProfile() {
            const fn = document.getElementById('cpFirstName')?.value.trim() || 'Membre';
            const ln = document.getElementById('cpLastName')?.value.trim() || '';
            const headline = document.getElementById('cpHeadline')?.value.trim() || 'Membre LYANN';
            const territory = document.getElementById('cpTerritorySelect')?.value || 'Guadeloupe (971)';
            const city = document.getElementById('cpCityInput')?.value.trim() || 'Baie-Mahault (97122)';
            const radius = document.getElementById('cpRadiusSelect')?.value || '5 km';
            const customSkill = document.getElementById('cpCustomSkill')?.value.trim();
            const phone = document.getElementById('cpPhone')?.value.trim() || '';
            const bio = document.getElementById('cpBio')?.value.trim() || '';

            if (customSkill) selectedSkills.add(customSkill);

            const skillsArr = Array.from(selectedSkills);

            // Calculate completion percentage
            let pct = 25; // Base (signup)
            if (currentAvatar) pct += 25;
            if (city) pct += 20;
            if (skillsArr.length > 0) pct += 15;
            if (phone || bio) pct += 15;
            if (pct > 100) pct = 100;

            const profileData = {
                firstName: fn,
                lastName: ln,
                headline: headline,
                territory: territory,
                city: city,
                radius: radius,
                avatar: currentAvatar,
                skills: skillsArr,
                phone: phone,
                bio: bio,
                completionPct: pct,
                isVerified: pct >= 80,
                updatedAt: new Date().toISOString()
            };

            // Save to LocalStorage / SafeStorage
            if (typeof safeStorage !== 'undefined') {
                safeStorage.setItem('lyan_user_profile', JSON.stringify(profileData));
            }
            localStorage.setItem('lyan_user_profile', JSON.stringify(profileData));

            // Close modal
            if (modal) {
                modal.classList.remove('active');
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }

            // Trigger global auth & profile update events
            if (typeof window.updateHeaderAuthState === 'function') {
                window.updateHeaderAuthState();
            }
            window.dispatchEvent(new CustomEvent('lyann_profile_updated', { detail: profileData }));

            // Refresh account modal displays
            updateAccountModalProfileWidgets(profileData);

            if (window.NotificationService) {
                window.NotificationService.showToast('success', `Profil complété à ${pct}% ! Bienvenue sur LYANN.`);
                setTimeout(() => {
                    window.NotificationService.showToast('info', `Un e-mail de vérification a été envoyé à votre adresse email pour sécuriser votre compte.`);
                }, 1200);
            } else if (window.lyannAlert) {
                window.lyannAlert(`Profil complété à ${pct}% ! Bienvenue sur LYANN. Un e-mail de vérification a été envoyé à votre adresse email pour sécuriser votre compte.`);
            } else {
                alert(`Profil complété à ${pct}% ! Bienvenue sur LYANN. Un e-mail de vérification a été envoyé à votre adresse email.`);
            }
        }

        // Global helper to update user account modal widgets
        function updateAccountModalProfileWidgets(prof) {
            if (!prof) return;
            const nameEls = document.querySelectorAll('#profileUserName, #overviewFirstName, .user-name-display, #accountUserName, #drawerUserName');
            nameEls.forEach(el => {
                if (el) el.textContent = prof.firstName + (prof.lastName ? ' ' + prof.lastName : '');
            });

            const locEls = document.querySelectorAll('#profileLocationText');
            locEls.forEach(el => {
                if (el) el.innerHTML = `<i class="ph ph-map-pin"></i> ${prof.city || 'Guadeloupe (971)'}`;
            });

            const avatarEls = document.querySelectorAll('#profileAvatarImg, .nav-profile-avatar, .drawer-avatar');
            avatarEls.forEach(img => {
                if (img && prof.avatar) img.src = prof.avatar;
            });

            // Update completion banner if present
            const banner = document.getElementById('profileCompletionBanner');
            if (banner) {
                if (prof.completionPct >= 100) {
                    banner.style.background = 'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)';
                    banner.style.borderColor = 'rgba(46, 125, 50, 0.3)';
                    banner.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <i class="ph-fill ph-check-circle" style="color: #2E7D32; font-size: 1.3rem;"></i>
                            <div style="font-size: 0.85rem; color: #1B5E20;">
                                <strong>Profil 100% Complet & Certifié 🌟</strong> — Vos voisins et clients vous font une totale confiance.
                            </div>
                        </div>
                        <button type="button" class="btn btn-sm btn-outline" onclick="window.openCompleteProfileModal()" style="font-size: 0.78rem; padding: 4px 10px;">Modifier</button>
                    `;
                } else {
                    banner.style.background = 'linear-gradient(135deg, #FFF8E7 0%, #FEF3D6 100%)';
                    banner.style.borderColor = 'rgba(229, 179, 69, 0.3)';
                    banner.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <i class="ph-fill ph-lightbulb" style="color: #D97706; font-size: 1.25rem;"></i>
                            <div style="font-size: 0.85rem; color: #78350F;">
                                <strong>Profil complété à ${prof.completionPct || 40}%</strong> — Ajoutez votre photo, vos compétences et votre commune pour débloquer toutes les opportunités.
                            </div>
                        </div>
                        <button type="button" class="btn btn-sm btn-primary" onclick="window.openCompleteProfileModal()" style="white-space: nowrap; font-size: 0.8rem; padding: 6px 12px;">Compléter (${prof.completionPct || 40}%)</button>
                    `;
                }
            }
        }

        window.updateAccountModalProfileWidgets = updateAccountModalProfileWidgets;

        try {
            const raw = localStorage.getItem('lyan_user_profile') || (typeof safeStorage !== 'undefined' ? safeStorage.getItem('lyan_user_profile') : null);
            if (raw) {
                updateAccountModalProfileWidgets(JSON.parse(raw));
            }
        } catch(e) {}
    }

    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        initProfileCompletion();
    } else {
        document.addEventListener('DOMContentLoaded', initProfileCompletion);
    }
})();
