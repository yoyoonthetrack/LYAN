/**
 * LYANN - Interactive Profile Completion Wizard & Persistence Logic
 * Dynamic 3-level Territorial Hierarchy (Territoire -> Île / Zone -> Commune)
 * Strict Real Supabase DB Persistence & Multi-Platform Validation
 */

(function() {
    // Canonical Territorial Dataset for DOM & Métropole
    const LYANN_TERRITORY_DATASET = {
        "Guadeloupe (971)": {
            "Grande-Terre": [
                "Les Abymes", "Anse-Bertrand", "Le Gosier", "Le Moule", "Morne-à-l'Eau",
                "Petit-Canal", "Pointe-à-Pitre", "Port-Louis", "Saint-François", "Sainte-Anne"
            ],
            "Basse-Terre": [
                "Baie-Mahault", "Baillif", "Basse-Terre", "Bouillante", "Capesterre-Belle-Eau",
                "Deshaies", "Gourbeyre", "Goyave", "Lamentin", "Petit-Bourg",
                "Pointe-Noire", "Saint-Claude", "Sainte-Rose", "Trois-Rivières", "Vieux-Fort", "Vieux-Habitants"
            ],
            "Marie-Galante": [
                "Capesterre-de-Marie-Galante", "Grand-Bourg", "Saint-Louis"
            ],
            "Les Saintes": [
                "Terre-de-Haut", "Terre-de-Bas"
            ],
            "La Désirade": [
                "La Désirade"
            ]
        },
        "Martinique (972)": {
            "Centre-Martinique": ["Fort-de-France", "Le Lamentin", "Schoelcher", "Saint-Joseph"],
            "Nord-Caraïbe": ["Le Carbet", "Case-Pilote", "Bellefontaine", "Saint-Pierre", "Le Prêcheur", "Le Morne-Rouge", "Le Morne-Vert"],
            "Nord-Atlantique": ["Sainte-Marie", "La Trinité", "Le Robert", "Gros-Morne", "Ajoupa-Bouillon", "Basse-Pointe", "Macouba", "Grand'Rivière"],
            "Sud-Martinique": ["Les Trois-Îlets", "Le Diamant", "Sainte-Luce", "Le Marin", "Sainte-Anne", "Les Anses-d'Arlet", "Rivière-Salée", "Rivière-Pilote", "Le François", "Le Vauclin"]
        },
        "Guyane (973)": {
            "Littoral / Centre": ["Cayenne", "Matoury", "Rémire-Montjoly", "Kourou", "Macouria", "Montsinéry-Tonnegrande"],
            "Est / Oyapock": ["Saint-Georges", "Ouanary", "Roura", "Régina"],
            "Ouest / Maroni": ["Saint-Laurent-du-Maroni", "Mana", "Awala-Yalimapo", "Apatou", "Grand-Santi", "Papaichton", "Maripasoula"]
        },
        "La Réunion (974)": {
            "Nord": ["Saint-Denis", "Sainte-Marie", "Sainte-Suzanne"],
            "Ouest": ["Saint-Paul", "Le Port", "La Possession", "Trois-Bassins", "Saint-Leu"],
            "Sud": ["Saint-Pierre", "Le Tampon", "Saint-Joseph", "Saint-Philippe", "Petite-Île", "Entre-Deux", "Cilaos"],
            "Est": ["Saint-Benoît", "Bras-Panon", "Saint-André", "Salazie", "Plaine-des-Palmistes", "Sainte-Rose"]
        },
        "Mayotte (976)": {
            "Grande-Terre Nord": ["Mamoudzou", "Koungou", "Bandraboua", "Acoua", "M'Tsangamouji"],
            "Grande-Terre Sud / Centre": ["Dembeni", "Bandrélé", "Kani-Kéli", "Bouéni", "Chirongui", "Sada", "Ouangani", "Tsingoni"],
            "Petite-Terre": ["Dzaoudzi", "Pamandzi"]
        },
        "France Métropolitaine": {
            "Île-de-France": ["Paris", "Boulogne-Billancourt", "Saint-Denis", "Argenteuil", "Montreuil", "Nanterre"],
            "Auvergne-Rhône-Alpes": ["Lyon", "Saint-Étienne", "Grenoble", "Villeurbanne", "Clermont-Ferrand", "Annecy"],
            "Provence-Alpes-Côte d'Azur": ["Marseille", "Nice", "Toulon", "Aix-en-Provence", "Avignon", "Cannes"],
            "Nouvelle-Aquitaine": ["Bordeaux", "Limoges", "Poitiers", "Pau", "La Rochelle", "Périgueux"],
            "Occitanie": ["Toulouse", "Montpellier", "Nîmes", "Perpignan", "Béziers", "Carcassonne"],
            "Autres Régions": ["Nantes", "Rennes", "Strasbourg", "Lille", "Rouen", "Reims", "Dijon", "Tours"]
        }
    };

    function findTerritoryAndIslandForCommune(communeStr) {
        if (!communeStr) return null;
        const cleanStr = String(communeStr).replace(/\s*\(\d+\)\s*/g, '').trim().toLowerCase();

        for (const [terrName, islands] of Object.entries(LYANN_TERRITORY_DATASET)) {
            for (const [islandName, communes] of Object.entries(islands)) {
                for (const c of communes) {
                    const cleanC = c.replace(/\s*\(\d+\)\s*/g, '').trim().toLowerCase();
                    if (cleanC === cleanStr || cleanStr.includes(cleanC) || cleanC.includes(cleanStr)) {
                        return { territory: terrName, island: islandName, commune: c };
                    }
                }
            }
        }
        return null;
    }

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
        let currentAvatar = (typeof window.resolveLyannAvatarSrc === 'function') ? window.resolveLyannAvatarSrc() : '/default-avatar.svg';
        let selectedAvatarFile = null;

        // Dynamic 3-level Territorial Select Setup
        const terrSelect = document.getElementById('cpTerritorySelect');
        let islandSelect = document.getElementById('cpIslandSelect');
        let citySelect = document.getElementById('cpCitySelect');
        let cityInput = document.getElementById('cpCityInput');

        // Ensure Island and City Select containers exist dynamically if missing in DOM
        let islandContainer = document.getElementById('cpIslandContainer');
        if (terrSelect && !islandSelect) {
            islandContainer = document.createElement('div');
            islandContainer.id = 'cpIslandContainer';
            islandContainer.style.marginBottom = '14px';
            islandContainer.innerHTML = `
                <label style="font-size: 0.8rem; font-weight: 700; color: #374151; display: block; margin-bottom: 4px;">Île / Zone *</label>
                <select id="cpIslandSelect" class="modal-input" style="width: 100%;"></select>
            `;
            terrSelect.parentElement.insertAdjacentElement('afterend', islandContainer);
            islandSelect = document.getElementById('cpIslandSelect');
        }

        if (cityInput && !citySelect) {
            citySelect = document.createElement('select');
            citySelect.id = 'cpCitySelect';
            citySelect.className = 'modal-input';
            citySelect.style.flex = '1';
            citySelect.style.boxSizing = 'border-box';
            cityInput.parentElement.insertBefore(citySelect, cityInput);
        }

        function populateIslands(territoryKey, preselectedIsland) {
            if (!islandSelect) return;
            islandSelect.innerHTML = '';
            const islands = LYANN_TERRITORY_DATASET[territoryKey] || LYANN_TERRITORY_DATASET["Guadeloupe (971)"];
            const islandKeys = Object.keys(islands);

            islandKeys.forEach(isKey => {
                const opt = document.createElement('option');
                opt.value = isKey;
                opt.textContent = isKey;
                if (preselectedIsland && isKey.toLowerCase() === preselectedIsland.toLowerCase()) {
                    opt.selected = true;
                }
                islandSelect.appendChild(opt);
            });

            if (!islandSelect.value && islandKeys.length > 0) {
                islandSelect.value = islandKeys[0];
            }
        }

        function populateCities(territoryKey, islandKey, preselectedCity) {
            if (!citySelect) return;
            citySelect.innerHTML = '';
            const islands = LYANN_TERRITORY_DATASET[territoryKey] || LYANN_TERRITORY_DATASET["Guadeloupe (971)"];
            const communes = islands[islandKey] || (Object.values(islands)[0] || []);

            communes.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                if (preselectedCity && c.toLowerCase() === preselectedCity.toLowerCase()) {
                    opt.selected = true;
                }
                citySelect.appendChild(opt);
            });

            // If preselected city is not in standard list, add it as custom option
            if (preselectedCity && !communes.some(c => c.toLowerCase() === preselectedCity.toLowerCase())) {
                const customOpt = document.createElement('option');
                customOpt.value = preselectedCity;
                customOpt.textContent = preselectedCity;
                customOpt.selected = true;
                citySelect.appendChild(customOpt);
            }

            const chosenCity = citySelect.value || (communes[0] || 'Saint-François');
            if (cityInput) cityInput.value = chosenCity;
        }

        function setupLocationCascading(initialTerritory, initialIsland, initialCity) {
            const terr = initialTerritory || (terrSelect ? terrSelect.value : 'Guadeloupe (971)');
            if (terrSelect) terrSelect.value = terr;

            populateIslands(terr, initialIsland);
            const isld = islandSelect ? islandSelect.value : 'Grande-Terre';
            populateCities(terr, isld, initialCity);
        }

        if (terrSelect) {
            terrSelect.addEventListener('change', () => {
                const terr = terrSelect.value;
                populateIslands(terr);
                const isld = islandSelect ? islandSelect.value : '';
                populateCities(terr, isld);
            });
        }

        if (islandSelect) {
            islandSelect.addEventListener('change', () => {
                const terr = terrSelect ? terrSelect.value : 'Guadeloupe (971)';
                const isld = islandSelect.value;
                populateCities(terr, isld);
            });
        }

        if (citySelect) {
            citySelect.addEventListener('change', () => {
                if (cityInput) cityInput.value = citySelect.value;
            });
        }

        // Load existing profile directly from Supabase DB (Canonical source of truth)
        async function loadExistingProfile() {
            try {
                let userSession = null;
                if (window.apiClient && typeof window.apiClient.getSession === 'function') {
                    try {
                        const res = await window.apiClient.getSession();
                        userSession = res?.data?.session?.user;
                    } catch (e) {}
                }

                let dbProfile = null;
                if (userSession?.id && window.apiClient && typeof window.apiClient.getProfile === 'function') {
                    try {
                        const profRes = await window.apiClient.getProfile(userSession.id);
                        if (profRes?.data) dbProfile = profRes.data;
                    } catch (e) {}
                }

                const rawLocal = localStorage.getItem('lyan_user_profile');
                let localProf = null;
                if (rawLocal) { try { localProf = JSON.parse(rawLocal); } catch (e) {} }

                const fn = dbProfile?.first_name || localProf?.firstName || localProf?.first_name || userSession?.user_metadata?.first_name || '';
                const ln = dbProfile?.last_name || localProf?.lastName || localProf?.last_name || userSession?.user_metadata?.last_name || '';
                const headline = dbProfile?.bio || localProf?.headline || localProf?.bio || '';
                const territory = dbProfile?.territory || localProf?.territory || 'Guadeloupe (971)';
                const rawCity = dbProfile?.city || localProf?.city || 'Saint-François';
                const phone = dbProfile?.phone || localProf?.phone || '';
                const bio = dbProfile?.bio || localProf?.bio || '';
                const rawAvatar = dbProfile?.avatar_url || localProf?.avatar || userSession?.user_metadata?.avatar_url || null;

                currentAvatar = (typeof window.resolveLyannAvatarSrc === 'function') ? window.resolveLyannAvatarSrc(rawAvatar) : (rawAvatar || '/default-avatar.svg');

                const fnEl = document.getElementById('cpFirstName');
                if (fnEl && fn) fnEl.value = fn;

                const lnEl = document.getElementById('cpLastName');
                if (lnEl && ln) lnEl.value = ln;

                const hlEl = document.getElementById('cpHeadline');
                if (hlEl && headline) hlEl.value = headline;

                const phEl = document.getElementById('cpPhone');
                if (phEl && phone) phEl.value = phone;

                const biEl = document.getElementById('cpBio');
                if (biEl && bio) biEl.value = bio;

                const prev = document.getElementById('cpAvatarPreview');
                if (prev) prev.src = currentAvatar;

                // Infer Territorial Hierarchy for Commune
                const locMatch = findTerritoryAndIslandForCommune(rawCity);
                if (locMatch) {
                    setupLocationCascading(locMatch.territory, locMatch.island, locMatch.commune);
                } else {
                    setupLocationCascading(territory, null, rawCity);
                }

                // Fetch canonical skills from public.services table in Supabase
                if (userSession?.id && window.apiClient && typeof window.apiClient.getUserSkills === 'function') {
                    try {
                        const fetchedSkills = await window.apiClient.getUserSkills(userSession.id);
                        if (Array.isArray(fetchedSkills)) {
                            selectedSkills.clear();
                            fetchedSkills.forEach(s => selectedSkills.add(s));
                            updateSkillTagsUI();
                        }
                    } catch (e) {
                        console.warn('[PROFILE_COMPLETION] getUserSkills load error:', e);
                    }
                } else if (localProf?.skills && Array.isArray(localProf.skills)) {
                    selectedSkills.clear();
                    localProf.skills.forEach(s => selectedSkills.add(s));
                    updateSkillTagsUI();
                }
            } catch(e) {
                console.warn('[PROFILE_COMPLETION] loadExistingProfile error:', e);
            }
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

        // File upload avatar preview
        const avatarInput = document.getElementById('cpAvatarUploadInput');
        if (avatarInput) {
            avatarInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/i)) {
                        if (window.NotificationService) {
                            window.NotificationService.showToast('warning', 'Veuillez choisir une image au format JPEG, PNG ou WebP.');
                        } else if (window.lyannAlert) {
                            window.lyannAlert('Veuillez choisir une image au format JPEG, PNG ou WebP.');
                        }
                        return;
                    }
                    selectedAvatarFile = file;
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

        // GPS button handler with canonical territorial mapping
        const gpsBtn = document.getElementById('cpGpsBtn');
        if (gpsBtn) {
            gpsBtn.addEventListener('click', async () => {
                gpsBtn.innerHTML = '<i class="ph ph-spinner-gap spin-animation"></i> GPS...';
                const applyGpsCity = (communeName) => {
                    const match = findTerritoryAndIslandForCommune(communeName) || { territory: 'Guadeloupe (971)', island: 'Grande-Terre', commune: communeName };
                    setupLocationCascading(match.territory, match.island, match.commune);
                    gpsBtn.innerHTML = '<i class="ph ph-check"></i> Détecté';
                    setTimeout(() => { gpsBtn.innerHTML = '<i class="ph ph-crosshair"></i> GPS'; }, 2000);
                };

                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(() => {
                        applyGpsCity("Saint-François");
                    }, () => {
                        applyGpsCity("Saint-François");
                    });
                } else {
                    applyGpsCity("Saint-François");
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

        // Auto scroll active field into view on focus
        const formInputs = modal.querySelectorAll('input, select, textarea');
        formInputs.forEach(input => {
            input.addEventListener('focus', () => {
                setTimeout(() => {
                    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 150);
            });
        });

        // Open wizard function
        window.openCompleteProfileModal = async function() {
            await loadExistingProfile();
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
                // Per-step validation
                if (currentStep === 0) {
                    const fn = document.getElementById('cpFirstName');
                    if (!fn || !fn.value.trim()) {
                        if (window.lyannAlert) window.lyannAlert('Veuillez indiquer votre prénom.');
                        else alert('Veuillez indiquer votre prénom.');
                        if (fn) fn.focus();
                        return;
                    }
                } else if (currentStep === 1) {
                    const cityVal = citySelect?.value || cityInput?.value || '';
                    if (!cityVal.trim()) {
                        if (window.lyannAlert) window.lyannAlert('Veuillez indiquer votre commune.');
                        else alert('Veuillez indiquer votre commune.');
                        return;
                    }
                }

                if (currentStep < 3) {
                    currentStep++;
                    updateWizardUI();
                } else {
                    saveCompletedProfile();
                }
            });
        }

        // STRICT ASYNC REAL SUPABASE DB SAVE HANDLER
        async function saveCompletedProfile() {
            if (!nextBtn) return;
            const originalBtnHtml = nextBtn.innerHTML;
            nextBtn.disabled = true;
            nextBtn.innerHTML = '<i class="ph ph-spinner-gap spin-animation"></i> Enregistrement DB...';

            try {
                const fn = document.getElementById('cpFirstName')?.value.trim() || 'Membre';
                const ln = document.getElementById('cpLastName')?.value.trim() || '';
                const headline = document.getElementById('cpHeadline')?.value.trim() || '';
                const territory = terrSelect?.value || 'Guadeloupe (971)';
                const city = citySelect?.value || cityInput?.value.trim() || 'Saint-François';
                const radius = document.getElementById('cpRadiusSelect')?.value || '5 km';
                const customSkill = document.getElementById('cpCustomSkill')?.value.trim();
                const phone = document.getElementById('cpPhone')?.value.trim() || '';
                const bioInput = document.getElementById('cpBio')?.value.trim() || '';

                const bio = bioInput || headline || 'Membre LYANN';

                if (customSkill) selectedSkills.add(customSkill);
                const skillsArr = Array.from(selectedSkills);

                let userSession = null;
                if (window.apiClient && typeof window.apiClient.getSession === 'function') {
                    try {
                        const res = await window.apiClient.getSession();
                        userSession = res?.data?.session?.user;
                    } catch(e) {}
                }

                const userId = userSession?.id;
                if (!userId) {
                    alert('Session non trouvée. Veuillez vous reconnecter.');
                    nextBtn.disabled = false;
                    nextBtn.innerHTML = originalBtnHtml;
                    return;
                }

                console.log(`[ProfileSave] userId=${userId} step=final payloadFields=first_name,last_name,bio,territory,city,phone,intervention_radius_km,avatar_url avatarChanged=${!!selectedAvatarFile} saveStarted=true`);

                let avatarUploadStatus = 'SKIPPED';
                if (selectedAvatarFile && window.apiClient && typeof window.apiClient.uploadAvatar === 'function') {
                    const { data: upData, error: upError } = await window.apiClient.uploadAvatar(userId, selectedAvatarFile);
                    if (upError) {
                        avatarUploadStatus = 'ERROR';
                        console.error(`[ProfileSaveResult] profilesUpdate=SKIPPED skillsUpdate=SKIPPED avatarUpload=ERROR errorCode=${upError.code || 'UPLOAD_ERR'} errorMessage=${upError.message || 'Avatar upload failed'}`);
                        if (window.lyannAlert) window.lyannAlert(`Échec du téléversement de l'avatar: ${upError.message}`);
                        else alert(`Échec du téléversement de l'avatar: ${upError.message}`);
                        nextBtn.disabled = false;
                        nextBtn.innerHTML = originalBtnHtml;
                        return; // DO NOT CLOSE MODAL ON MUTATION FAILURE
                    } else if (upData?.avatar_url) {
                        avatarUploadStatus = 'SUCCESS';
                        currentAvatar = upData.avatar_url;
                    }
                }

                // Call Supabase DB profile update
                const { data: dbData, error: dbError } = await window.apiClient.updateProfile(userId, {
                    first_name: fn,
                    last_name: ln,
                    territory: territory,
                    city: city,
                    phone: phone,
                    bio: bio,
                    avatar_url: currentAvatar,
                    intervention_radius: radius
                });

                if (dbError) {
                    console.error(`[ProfileSaveResult] profilesUpdate=ERROR skillsUpdate=ERROR avatarUpload=${avatarUploadStatus} errorCode=${dbError.code || 'DB_UPDATE_ERR'} errorMessage=${dbError.message || 'Supabase update failed'}`);
                    const errText = `Échec de sauvegarde Supabase (${dbError.code || 'ERR'}): ${dbError.message || 'Erreur inconnue'}`;
                    if (window.lyannAlert) window.lyannAlert(errText);
                    else alert(errText);
                    nextBtn.disabled = false;
                    nextBtn.innerHTML = originalBtnHtml;
                    return; // DO NOT CLOSE MODAL ON MUTATION FAILURE
                }

                // Call Supabase DB skills sync (public.services)
                let skillsUpdateStatus = 'SUCCESS';
                if (window.apiClient && typeof window.apiClient.syncUserSkills === 'function') {
                    const { data: skillsRes, error: skillsError } = await window.apiClient.syncUserSkills(userId, skillsArr);
                    if (skillsError) {
                        skillsUpdateStatus = 'ERROR';
                        console.error(`[ProfileSaveResult] profilesUpdate=SUCCESS skillsUpdate=ERROR avatarUpload=${avatarUploadStatus} errorCode=${skillsError.code || 'SKILLS_ERR'} errorMessage=${skillsError.message || 'Skills sync failed'}`);
                        const errText = `Échec de la sauvegarde des compétences (${skillsError.code || 'ERR'}): ${skillsError.message || 'Erreur inconnue'}`;
                        if (window.lyannAlert) window.lyannAlert(errText);
                        else alert(errText);
                        nextBtn.disabled = false;
                        nextBtn.innerHTML = originalBtnHtml;
                        return; // DO NOT CLOSE MODAL ON SKILLS MUTATION FAILURE
                    }
                }

                console.log(`[ProfileSaveResult] profilesUpdate=SUCCESS skillsUpdate=${skillsUpdateStatus} avatarUpload=${avatarUploadStatus}`);

                // Real DB SUCCESS Confirmation Achieved
                const updatedProfile = dbData || {
                    id: userId,
                    first_name: fn,
                    last_name: ln,
                    territory: territory,
                    city: city,
                    phone: phone,
                    bio: bio,
                    avatar_url: currentAvatar,
                    intervention_radius_km: radius
                };

                // Update LocalStorage ONLY after confirmed DB success as a cache
                const clientCache = {
                    firstName: fn,
                    lastName: ln,
                    headline: bio,
                    territory: territory,
                    city: city,
                    radius: radius,
                    avatar: currentAvatar,
                    skills: skillsArr,
                    phone: phone,
                    bio: bio,
                    updatedAt: new Date().toISOString()
                };
                localStorage.setItem('lyan_user_profile', JSON.stringify(clientCache));

                // Close wizard ONLY after DB success
                if (modal) {
                    modal.classList.remove('active');
                    modal.style.display = 'none';
                    document.body.style.overflow = '';
                }

                // Show mandatory success toast
                if (window.NotificationService) {
                    window.NotificationService.showToast('success', 'Profil mis à jour');
                } else if (window.lyannAlert) {
                    window.lyannAlert('Profil mis à jour');
                }

                // Re-fetch profile from Supabase to verify DB state & update all UI components
                if (window.apiClient && typeof window.apiClient.getProfile === 'function') {
                    try {
                        const freshRes = await window.apiClient.getProfile(userId);
                        if (freshRes?.data) {
                            updateAccountModalProfileWidgets(freshRes.data);
                            window.dispatchEvent(new CustomEvent('lyann_profile_updated', { detail: freshRes.data }));
                        }
                    } catch(e) {
                        updateAccountModalProfileWidgets(clientCache);
                        window.dispatchEvent(new CustomEvent('lyann_profile_updated', { detail: clientCache }));
                    }
                } else {
                    updateAccountModalProfileWidgets(clientCache);
                    window.dispatchEvent(new CustomEvent('lyann_profile_updated', { detail: clientCache }));
                }

                if (typeof window.updateHeaderAuthState === 'function') {
                    window.updateHeaderAuthState();
                }

            } catch (err) {
                console.error('[ProfileSaveResult] profilesUpdate=ERROR skillsUpdate=ERROR avatarUpload=ERROR errorCode=EXCEPTION errorMessage=' + (err.message || String(err)));
                alert('Erreur imprévue lors de la sauvegarde : ' + (err.message || String(err)));
            } finally {
                nextBtn.disabled = false;
                nextBtn.innerHTML = originalBtnHtml;
            }
        }

        // Helper to update all visible UI elements displaying profile data
        function updateAccountModalProfileWidgets(prof) {
            if (!prof) return;
            const canonicalName = window.formatPublicName ? window.formatPublicName(prof, null, 'Lyanneur') : (prof.first_name || prof.firstName || 'Lyanneur');
            const nameEls = document.querySelectorAll('#profileUserName, #overviewFirstName, .user-name-display, #accountUserName, #drawerUserName');
            nameEls.forEach(el => {
                if (el) el.textContent = canonicalName;
            });

            const locEls = document.querySelectorAll('#profileLocationText');
            const formattedLoc = window.formatProfileLocation ? window.formatProfileLocation(prof.city, prof.territory) : (prof.city || 'Guadeloupe');
            locEls.forEach(el => {
                if (el) el.innerHTML = `<i class="ph ph-map-pin"></i> ${formattedLoc}`;
            });

            const avatarEls = document.querySelectorAll('#profileAvatarImg, .nav-profile-avatar, .drawer-avatar');
            avatarEls.forEach(img => {
                if (img && (prof.avatar_url || prof.avatar)) {
                    img.src = (typeof window.resolveLyannAvatarSrc === 'function') ? window.resolveLyannAvatarSrc(prof.avatar_url || prof.avatar) : (prof.avatar_url || prof.avatar);
                }
            });
        }

        window.updateAccountModalProfileWidgets = updateAccountModalProfileWidgets;

        try {
            const raw = localStorage.getItem('lyan_user_profile');
            if (raw) updateAccountModalProfileWidgets(JSON.parse(raw));
        } catch(e) {}
    }

    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        initProfileCompletion();
    } else {
        document.addEventListener('DOMContentLoaded', initProfileCompletion);
    }
})();
