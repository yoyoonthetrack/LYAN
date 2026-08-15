/**
 * LYANN - Script (Community, Trust, Member Search & Interactive Signup Workflow)
 */

    const LYANN_MEMBERS = [
        // GUADELOUPE (971)
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

        // MARTINIQUE (972)
        {
            id: 6,
            name: "Sarah Manicon (29 ans)",
            role: "Coiffure & Rénovation",
            category: "peinture",
            keywords: ["peinture", "peintre", "mural", "rénovation", "décoration", "coup de neuf", "coiffure"],
            location: "martinique",
            locationName: "Martinique (972)",
            city: "Fort-de-France",
            rating: 5.0,
            reviewsCount: 29,
            avatar: "sarah-29.png",
            bio: "Artisan passionnée par la beauté et la rénovation des intérieurs antillais à Fort-de-France. Garantie satisfaction !",
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
            location: "martinique",
            locationName: "Martinique (972)",
            city: "Fort-de-France",
            rating: 5.0,
            reviewsCount: 21,
            avatar: "sarah-29.png",
            bio: "Garde d'enfants en soirée et les week-ends. Jeux d'éveil, goûters et sérénité pour les parents.",
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
            location: "martinique",
            locationName: "Martinique (972)",
            city: "Le Lamentin",
            rating: 4.9,
            reviewsCount: 35,
            avatar: "kevin-41.png",
            bio: "Polyvalent et minutieux au Lamentin pour tous vos petits travaux de maison et montages de meubles en kit.",
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
            location: "martinique",
            locationName: "Martinique (972)",
            city: "Schoelcher",
            rating: 4.9,
            reviewsCount: 42,
            avatar: "kevin-41.png",
            bio: "Pose, entretien et désinfection complète de climatiseurs Split pour particuliers et pros.",
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
            location: "martinique",
            locationName: "Martinique (972)",
            city: "Sainte-Luce",
            rating: 5.0,
            reviewsCount: 19,
            avatar: "huguette-68.png",
            bio: "Transmission et passion des vergers et jardins créoles à Sainte-Luce. Entretien doux, recettes traditionnelles et partage.",
            skills: ["Plantes tropicales", "Taille arbres fruitiers", "Conseils botaniques", "Cuisine créole"],
            badge: "Membre Senior Réputé",
            hourlyRate: "À partir de 20€/h"
        },

        // GUYANE (973)
        {
            id: 10,
            name: "Kevin Bellerose (41 ans)",
            role: "Électricité Pro & Dépannage",
            category: "electricite",
            keywords: ["déménagement", "déménager", "transport", "camion", "carton", "portage", "manutention", "électricité"],
            location: "guyane",
            locationName: "Guyane (973)",
            city: "Cayenne",
            rating: 4.9,
            reviewsCount: 27,
            avatar: "kevin-41.png",
            bio: "Électricien professionnel et technicien généraliste à Cayenne. Dépannage de tableaux, éclairage et moteurs en sécurité.",
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
            location: "guyane",
            locationName: "Guyane (973)",
            city: "Kourou",
            rating: 5.0,
            reviewsCount: 20,
            avatar: "sarah-29.png",
            bio: "Création et rénovation d'ouvrages en bois, terrasses créoles et agencements d'intérieur à Kourou.",
            skills: ["Terrasse bois", "Pose portes/fenêtres", "Dressing sur mesure", "Réparation meuble"],
            badge: "Artisan Bois Vérifié",
            hourlyRate: "Devis sous 24h"
        },

        // LA RÉUNION (974)
        {
            id: 12,
            name: "Cédric Flavien (38 ans)",
            role: "Bricolage & Multi-services",
            category: "bricolage",
            keywords: ["bricolage", "bricoleur", "monter un meuble", "réparer", "étagère", "électricité", "plomberie"],
            location: "reunion",
            locationName: "La Réunion (974)",
            city: "Saint-Denis",
            rating: 5.0,
            reviewsCount: 38,
            avatar: "david-34.png",
            bio: "Montage de meubles, étagères, fixation, petits dépannages à Saint-Denis... Toujours avec le sourire et le soin !",
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
            location: "reunion",
            locationName: "La Réunion (974)",
            city: "Saint-Paul",
            rating: 4.9,
            reviewsCount: 45,
            avatar: "david-34.png",
            bio: "Entretien régulier ou ponctuel de vos jardins réunionnais, débroussaillage et taille à Saint-Paul.",
            skills: ["Débroussaillage", "Taille de haies", "Création massif fleurs", "Nettoyage terrasse"],
            badge: "Jardinier Pro",
            hourlyRate: "À partir de 26€/h"
        },

        // ST-MARTIN / ST-BARTH
        {
            id: 14,
            name: "Guillaume Saint-Martin (44 ans)",
            role: "Climatisation & Électricité Villa",
            category: "climatisation",
            keywords: ["climatisation", "clim", "électricité", "panne", "maintenance", "villa"],
            location: "saint-martin",
            locationName: "St-Martin / St-Barth",
            city: "Marigot",
            rating: 5.0,
            reviewsCount: 12,
            avatar: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80",
            bio: "Maintenance haute qualité de climatiseurs et réseaux électriques pour villas et appartements.",
            skills: ["Clim Inverter", "Maintenance préventive", "Dépannage express", "Tableau électrique"],
            badge: "Expert Vérifié",
            hourlyRate: "À partir de 50€/h"
        }
    ];
    window.LYANN_MEMBERS = LYANN_MEMBERS;

document.addEventListener('DOMContentLoaded', () => {
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

            profileTabBtns.forEach(b => b.classList.remove('active'));
            profileTabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetEl = document.getElementById(targetTab);
            if (targetEl) targetEl.classList.add('active');
        });
    });

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
        const member = LYANN_MEMBERS.find(m => m.id == memberId) || LYANN_MEMBERS[0];
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
            openPublicMemberProfile(1); // Opens sample talent profile
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
        shareProfileBtn.addEventListener('click', () => {
            if (navigator.clipboard && currentVisitingMember) {
                navigator.clipboard.writeText(window.location.href);
                window.lyannAlert(`🔗 Lien du profil de ${currentVisitingMember.name} copié dans votre presse-papier !`);
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
        triggerFileInputBtn.addEventListener('click', () => realizationFileInput.click());
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
                            <button class="flash-action-btn btn-open-chat-direct" data-member-name="${post.authorName}" data-member-avatar="${post.authorAvatar}">
                                <i class="ph ph-chat-circle-dots"></i> <span>Répondre</span>
                            </button>
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
                openChatWithUser(name, avatar);
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

    feedPills.forEach(pill => {
        pill.addEventListener('click', () => {
            feedPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            activeFeedTypeFilter = pill.dataset.filterType;
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

    if (closeQuickProfileModalBtn) {
        closeQuickProfileModalBtn.addEventListener('click', () => {
            if (quickProfileModal) quickProfileModal.classList.remove('active');
        });
    }

    function openQuickProfileModal(memberId) {
        const member = LYANN_MEMBERS.find(m => m.id === memberId) || LYANN_MEMBERS[0];
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

        if (quickProfileModal) quickProfileModal.classList.add('active');
    }

    if (quickStartChatBtn) {
        quickStartChatBtn.addEventListener('click', () => {
            if (quickProfileModal) quickProfileModal.classList.remove('active');
            if (currentQuickMember) {
                openChatWithUser(currentQuickMember.name, currentQuickMember.avatar);
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
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const loginModal = document.getElementById('loginModal');
            if (loginModal) loginModal.classList.remove('active');
            if (passwordResetModal) passwordResetModal.classList.add('active');
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
            const allBtns = document.querySelectorAll('.account-tab-btn');
            const allContents = document.querySelectorAll('.account-tab-content');
            
            allBtns.forEach(b => b.classList.remove('active'));
            allContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetEl = document.getElementById(targetTab);
            if (targetEl) targetEl.classList.add('active');
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
        function openAccountTab(tabId) {
            if (userAccountModal) {
                userAccountModal.classList.add('active');
                document.body.style.overflow = 'hidden';

                const targetBtn = document.querySelector(`.account-tab-btn[data-account-tab="${tabId}"]`);
                if (targetBtn) targetBtn.click();
            }
        }

        // Raccourci 0 : Ouvrir mon profil & réglages
        const sdActionOpenProfile = document.getElementById('sdActionOpenProfile');
        if (sdActionOpenProfile) {
            sdActionOpenProfile.addEventListener('click', (e) => {
                e.preventDefault();
                speedDialWrapper.classList.remove('active');
                openAccountTab('tab-acc-dashboard');
            });
        }

        // Raccourci 1 : Publier un Bokantaj
        const sdActionBokantaj = document.getElementById('sdActionBokantaj');
        if (sdActionBokantaj) {
            sdActionBokantaj.addEventListener('click', (e) => {
                e.preventDefault();
                speedDialWrapper.classList.remove('active');
                openAccountTab('tab-acc-activities');
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

        // Raccourci 3 : Faire une demande
        const sdActionMakeRequest = document.getElementById('sdActionMakeRequest');
        if (sdActionMakeRequest) {
            sdActionMakeRequest.addEventListener('click', (e) => {
                e.preventDefault();
                speedDialWrapper.classList.remove('active');
                openAccountTab('tab-acc-activities');
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
                    openChatWithUser("David Jean-Baptiste", "david-34.png");
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
        if (window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
            const { data } = await window.LYANN_API_CLIENT.getSession();
            if (data && data.session) {
                document.body.classList.add('user-is-logged-in');
                window.CURRENT_USER_ID = data.session.user.id;
            } else {
                document.body.classList.remove('user-is-logged-in');
                window.CURRENT_USER_ID = null;
            }
        } else {
            // Fallback for mock mode
            const isLoggedIn = safeStorage.getItem('lyan_user_logged_in') === 'true';
            if (isLoggedIn) {
                document.body.classList.add('user-is-logged-in');
                window.CURRENT_USER_ID = "me";
            } else {
                document.body.classList.remove('user-is-logged-in');
                window.CURRENT_USER_ID = null;
            }
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
            const encodedMsg = encodeURIComponent(`Bonjour ${memberName} ! Nous sommes Lyannés sur LYANN DOM pour nos travaux / échanges.`);
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

    // Bouton Retour en Haut Fluide
    const backToTopBtn = document.createElement('button');
    backToTopBtn.id = 'backToTopBtn';
    backToTopBtn.innerHTML = '↑';
    backToTopBtn.setAttribute('aria-label', 'Retour en haut de page');
    backToTopBtn.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 24px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--primary-dark);
        color: #FFF;
        border: none;
        font-size: 1.3rem;
        font-weight: 800;
        cursor: pointer;
        box-shadow: var(--shadow-lg);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 999;
        transition: var(--transition);
    `;
    document.body.appendChild(backToTopBtn);

    window.addEventListener('scroll', () => {
        if (window.scrollY > 400) {
            backToTopBtn.style.display = 'flex';
        } else {
            backToTopBtn.style.display = 'none';
        }
    });

    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
            openChatWithUser(activeContactName, activeContactAvatar);
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
                openChatWithUser("David Jean-Baptiste", "david-34.png");
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
