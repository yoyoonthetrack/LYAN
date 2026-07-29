/**
 * LYANN - Script (Community, Trust, Member Search & Interactive Signup Workflow)
 */

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================================================
    // BASE DE DONNÉES DES MEMBRES LYANN (VISAGES ET TALENTS DES DOM)
    // ==========================================================================
    const LYANN_MEMBERS = [
        // GUADELOUPE (971)
        {
            id: 1,
            name: "David M.",
            role: "Plomberie & Dépannage Sanitaire",
            category: "plomberie",
            keywords: ["plomberie", "plombier", "fuite", "eau", "sanitaire", "robinet", "tuyau", "dépannage", "chauffe-eau"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Baie-Mahault",
            rating: 4.9,
            reviewsCount: 48,
            avatar: "https://images.unsplash.com/photo-1507152832244-10d45c7eda57?auto=format&fit=crop&w=400&q=80",
            bio: "Plombier passionné à Baie-Mahault. Dépannage rapide de fuites d'eau, débouchage et installation de sanitaires.",
            skills: ["Détection de fuite", "Débouchage canalisation", "Remplacement chauffe-eau", "Raccordement"],
            badge: "Artisan Vérifié",
            hourlyRate: "À partir de 35€/h"
        },
        {
            id: 2,
            name: "Marie L.",
            role: "Peinture Intérieure & Rénovation",
            category: "peinture",
            keywords: ["peinture", "peintre", "mural", "rénovation", "décoration", "enduit", "plâtre"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Les Abymes",
            rating: 5.0,
            reviewsCount: 36,
            avatar: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=400&q=80",
            bio: "Peintre d'intérieur minutieuse. Je redonne des couleurs et de la fraîcheur à vos pièces de vie.",
            skills: ["Peinture mur & plafond", "Enduit lissage", "Protection sols", "Conseil couleurs"],
            badge: "Voisine Recommandée",
            hourlyRate: "À partir de 30€/h"
        },
        {
            id: 3,
            name: "Jean-Michel T.",
            role: "Électricité & Dépannage Rénovation",
            category: "electricite",
            keywords: ["électricité", "électricien", "panne", "tableau", "prise", "lumière", "câblage", "réparer"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Le Gosier",
            rating: 4.8,
            reviewsCount: 31,
            avatar: "https://images.unsplash.com/photo-1522529599102-193c0d76b5b6?auto=format&fit=crop&w=400&q=80",
            bio: "Mise aux normes, rénovation électrique globale et dépannage rapide sur Le Gosier et environs.",
            skills: ["Tableau électrique", "Dépannage d'urgence", "Éclairage LED", "Mise aux normes"],
            badge: "Électricien Vérifié",
            hourlyRate: "À partir de 40€/h"
        },
        {
            id: 4,
            name: "Marc-Antoine B.",
            role: "Jardinier & Paysagiste",
            category: "jardin",
            keywords: ["jardin", "jardinier", "élagage", "pelouse", "tonte", "haie", "entretien", "plantes", "palmier"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Sainte-Anne",
            rating: 4.9,
            reviewsCount: 15,
            avatar: "https://images.unsplash.com/photo-1506277886164-e25aa3f4ef7f?auto=format&fit=crop&w=400&q=80",
            bio: "Entretien complet de vos espaces verts tropicalisés, taille de palmiers et création paysagère.",
            skills: ["Taille de haies", "Élagage palmiers", "Tonte de pelouse", "Arrosage"],
            badge: "Voisin de confiance",
            hourlyRate: "À partir de 25€/h"
        },
        {
            id: 5,
            name: "Élodie R.",
            role: "Ménage & Entretien Maison",
            category: "menage",
            keywords: ["ménage", "nettoyage", "maison", "propreté", "entretien", "vitres", "repassage"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Le Moule",
            rating: 5.0,
            reviewsCount: 22,
            avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
            bio: "Ménage à domicile et entretien méticuleux de votre intérieur. Ponctuelle et de confiance.",
            skills: ["Ménage régulier", "Lavage de vitres", "Repassage", "Désinfection"],
            badge: "Membre Recommandé",
            hourlyRate: "À partir de 20€/h"
        },
        {
            id: 15,
            name: "Clarisse V.",
            role: "Baby-sitting & Garde d'enfants",
            category: "babysitting",
            keywords: ["baby-sitting", "babysitting", "garde d'enfants", "enfant", "bébé", "sortie d'école", "aide aux devoirs"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Baie-Mahault",
            rating: 5.0,
            reviewsCount: 32,
            avatar: "https://images.unsplash.com/photo-1589156280159-27698a70f29e?auto=format&fit=crop&w=400&q=80",
            bio: "Diplômée de la petite enfance. Garde bienveillante, activités créatives et aide aux devoirs.",
            skills: ["Garde périscolaire", "Bébés & Enfants", "Secourisme PSC1", "Aide aux devoirs"],
            badge: "Nounou Vérifiée",
            hourlyRate: "À partir de 15€/h"
        },
        {
            id: 16,
            name: "Rosalie T.",
            role: "Aide à la personne & Seniors",
            category: "aide-personne",
            keywords: ["aide à la personne", "aide aux seniors", "compagnie", "courses", "repas", "autonomie", "auxiliaire"],
            location: "guadeloupe",
            locationName: "Guadeloupe (971)",
            city: "Le Gosier",
            rating: 4.9,
            reviewsCount: 28,
            avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80",
            bio: "Accompagnement bienveillant pour personnes âgées ou en perte d'autonomie. Présence chaleureuse et aide au quotidien.",
            skills: ["Aide aux repas", "Accompagnement courses", "Lecture & Compagnie", "Stimulation douce"],
            badge: "Auxiliaire Recommandée",
            hourlyRate: "À partir de 18€/h"
        },

        // MARTINIQUE (972)
        {
            id: 6,
            name: "Sarah K.",
            role: "Peintre & Rénovation",
            category: "peinture",
            keywords: ["peinture", "peintre", "mural", "rénovation", "décoration", "coup de neuf"],
            location: "martinique",
            locationName: "Martinique (972)",
            city: "Fort-de-France",
            rating: 5.0,
            reviewsCount: 29,
            avatar: "https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&w=400&q=80",
            bio: "Rénovation de vos murs intérieurs et façades antillaises. Garantie satisfaction !",
            skills: ["Peinture acrylique", "Traitement anti-moisissure", "Ravalement", "Décoration"],
            badge: "Artisan Vérifié",
            hourlyRate: "Devis gratuit"
        },
        {
            id: 17,
            name: "Aurélie B.",
            role: "Baby-sitting & Sortie d'école",
            category: "babysitting",
            keywords: ["baby-sitting", "babysitting", "garde d'enfants", "enfant", "sortie d'école", "nounou"],
            location: "martinique",
            locationName: "Martinique (972)",
            city: "Fort-de-France",
            rating: 5.0,
            reviewsCount: 21,
            avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80",
            bio: "Garde d'enfants en soirée et les week-ends. Jeux d'éveil, goûters et sérénité pour les parents.",
            skills: ["Soirées & Week-ends", "Jeux ludiques", "Garde à domicile", "Préparation repas"],
            badge: "Baby-sitter Vérifiée",
            hourlyRate: "À partir de 14€/h"
        },
        {
            id: 7,
            name: "Nicolas P.",
            role: "Bricolage & Montage Meubles",
            category: "bricolage",
            keywords: ["bricolage", "bricoleur", "monter un meuble", "meuble", "étagère", "fixation", "ikea", "petit travail"],
            location: "martinique",
            locationName: "Martinique (972)",
            city: "Le Lamentin",
            rating: 4.9,
            reviewsCount: 35,
            avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80",
            bio: "Polyvalent et minutieux pour tous vos petits travaux de maison et montages de meubles en kit.",
            skills: ["Montage meuble Ikea", "Fixation TV mural", "Pose de rideaux", "Petits dépannages"],
            badge: "Super Bricoleur",
            hourlyRate: "À partir de 25€/h"
        },
        {
            id: 8,
            name: "Christophe H.",
            role: "Climatisation & Frigoriste",
            category: "climatisation",
            keywords: ["climatisation", "clim", "froid", "frigoriste", "entretien clim", "dépannage clim", "nettoyage clim"],
            location: "martinique",
            locationName: "Martinique (972)",
            city: "Schoelcher",
            rating: 4.9,
            reviewsCount: 42,
            avatar: "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&w=400&q=80",
            bio: "Pose, entretien et désinfection complète de climatiseurs Split pour particuliers et pros.",
            skills: ["Nettoyage antibactérien", "Recharge gaz", "Dépannage fuite", "Installation neuve"],
            badge: "Climaticien Agréé",
            hourlyRate: "À partir de 45€/h"
        },
        {
            id: 9,
            name: "Lucienne M.",
            role: "Jardinage & Entretien Créole",
            category: "jardin",
            keywords: ["jardin", "jardinier", "plantes", "entretien", "fleurs", "cour"],
            location: "martinique",
            locationName: "Martinique (972)",
            city: "Sainte-Luce",
            rating: 5.0,
            reviewsCount: 19,
            avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
            bio: "Transmission et passion des vergers et jardins créoles. Entretien doux et naturel.",
            skills: ["Plantes tropicales", "Taille arbres fruitiers", "Conseils botaniques", "Entretien cour"],
            badge: "Membre Senior Réputé",
            hourlyRate: "À partir de 20€/h"
        },

        // GUYANE (973)
        {
            id: 10,
            name: "Fabrice D.",
            role: "Déménagement & Transport",
            category: "demenagement",
            keywords: ["déménagement", "déménager", "transport", "camion", "carton", "portage", "manutention"],
            location: "guyane",
            locationName: "Guyane (973)",
            city: "Cayenne",
            rating: 4.9,
            reviewsCount: 27,
            avatar: "https://images.unsplash.com/photo-1507152832244-10d45c7eda57?auto=format&fit=crop&w=400&q=80",
            bio: "Aide au déménagement avec véhicule spacieux. Équipe dynamique pour transporter vos affaires en sécurité.",
            skills: ["Camion utilitaire", "Protection meubles", "Déménagement complet", "Objets lourds"],
            badge: "Transporteur Vérifié",
            hourlyRate: "Sur devis personnalisé"
        },
        {
            id: 11,
            name: "Corinne L.",
            role: "Menuiserie & Aménagement Bois",
            category: "menuiserie",
            keywords: ["menuiserie", "menuisier", "bois", "porte", "fenêtre", "placard", "terrasse", "sur mesure"],
            location: "guyane",
            locationName: "Guyane (973)",
            city: "Kourou",
            rating: 5.0,
            reviewsCount: 20,
            avatar: "https://images.unsplash.com/photo-1589156280159-27698a70f29e?auto=format&fit=crop&w=400&q=80",
            bio: "Création et rénovation d'ouvrages en bois, terrasses et agencements d'intérieur.",
            skills: ["Terrasse bois", "Pose portes/fenêtres", "Dressing sur mesure", "Réparation meuble"],
            badge: "Artisan Bois Vérifié",
            hourlyRate: "Devis sous 24h"
        },

        // LA RÉUNION (974)
        {
            id: 12,
            name: "Kevin L.",
            role: "Bricolage & Multi-services",
            category: "bricolage",
            keywords: ["bricolage", "bricoleur", "monter un meuble", "réparer", "étagère", "électricité", "plomberie"],
            location: "reunion",
            locationName: "La Réunion (974)",
            city: "Saint-Denis",
            rating: 5.0,
            reviewsCount: 38,
            avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80",
            bio: "Montage de meubles, étagères, fixation, petits dépannages... Toujours avec le sourire et le soin !",
            skills: ["Montage meuble", "Fixation lourde", "Petite électricité", "Peinture retouches"],
            badge: "Talent Recommandé",
            hourlyRate: "À partir de 28€/h"
        },
        {
            id: 13,
            name: "Romain F.",
            role: "Entretien Jardin & Paysage",
            category: "jardin",
            keywords: ["jardin", "jardinier", "élagage", "gazon", "taille", "entretien", "plantes", "cour"],
            location: "reunion",
            locationName: "La Réunion (974)",
            city: "Saint-Paul",
            rating: 4.9,
            reviewsCount: 45,
            avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80",
            bio: "Entretien régulier ou ponctuel de vos jardins réunionnais, débroussaillage et taille.",
            skills: ["Débroussaillage", "Taille de haies", "Création massif fleurs", "Nettoyage terrasse"],
            badge: "Jardinier Pro",
            hourlyRate: "À partir de 26€/h"
        },

        // ST-MARTIN / ST-BARTH
        {
            id: 14,
            name: "Guillaume S.",
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

    // --- Mobile Menu ---
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const mobileMenuClose = document.querySelector('.mobile-menu-close');
    const mobileMenuOverlay = document.querySelector('.mobile-menu-overlay');

    if (mobileMenuBtn && mobileMenuOverlay) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenuOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        });

        const closeMenu = () => {
            mobileMenuOverlay.classList.remove('active');
            document.body.style.overflow = '';
        };

        if (mobileMenuClose) mobileMenuClose.addEventListener('click', closeMenu);

        mobileMenuOverlay.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', closeMenu);
        });
    }

    // --- Navbar Scroll ---
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        window.addEventListener('scroll', () => {
            navbar.classList.toggle('scrolled', window.scrollY > 50);
        });
    }

    // --- Scroll Reveal ---
    const revealElements = document.querySelectorAll('.reveal');
    if (revealElements.length > 0) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, { threshold: 0.15 });

        revealElements.forEach(el => observer.observe(el));

        // Safety fallback to guarantee visibility for all sections
        setTimeout(() => {
            revealElements.forEach(el => el.classList.add('visible'));
        }, 400);
    }

    // --- Suggestion Tags ---
    const tags = document.querySelectorAll('.tag');
    const searchInput = document.getElementById('searchInput');

    tags.forEach(tag => {
        tag.addEventListener('click', () => {
            const query = tag.dataset.query;

            tags.forEach(t => t.classList.remove('active'));
            tag.classList.add('active');

            if (searchInput && query !== undefined) {
                searchInput.value = query;
                performMemberSearch(query);
            }
        });
    });

    // --- Category Cards Click to Search ---
    const categoryCards = document.querySelectorAll('.category-card');
    categoryCards.forEach(catCard => {
        catCard.addEventListener('click', (e) => {
            e.preventDefault();
            const catName = catCard.querySelector('.category-name')?.textContent || '';
            if (searchInput) searchInput.value = catName;
            performMemberSearch(catName);
        });
    });

    // --- Testimonial Slider ---
    const track = document.getElementById('testimonialTrack');
    const dotsContainer = document.getElementById('sliderDots');

    if (track && dotsContainer) {
        const slides = track.querySelectorAll('.testimonial-slide');
        let currentSlide = 0;
        const total = slides.length;

        for (let i = 0; i < total; i++) {
            const dot = document.createElement('span');
            dot.classList.add('dot');
            if (i === 0) dot.classList.add('active');
            dot.addEventListener('click', () => goToSlide(i));
            dotsContainer.appendChild(dot);
        }

        const dots = dotsContainer.querySelectorAll('.dot');

        function goToSlide(index) {
            currentSlide = index;
            track.style.transform = `translateX(-${index * 100}%)`;
            dots.forEach((d, i) => d.classList.toggle('active', i === index));
        }

        function nextSlide() {
            goToSlide((currentSlide + 1) % total);
        }

        setInterval(nextSlide, 6000);
    }

    // --- COMMUNES DE CHAQUE DÉPARTEMENT DOM ---
    const DOM_COMMUNES = {
        guadeloupe: [
            "Baie-Mahault", "Pointe-à-Pitre", "Les Abymes", "Le Gosier", "Sainte-Anne", 
            "Le Moule", "Petit-Bourg", "Sainte-Rose", "Capesterre-Belle-Eau", "Lamentin", 
            "Saint-François", "Basse-Terre", "Trois-Rivières", "Morne-à-l'Eau", "Anse-Bertrand", 
            "Port-Louis", "Gourbeyre", "Bouillante", "Vieux-Habitants", "Deshaies", "Pointe-Noire", 
            "Terre-de-Haut", "Grand-Bourg (Marie-Galante)"
        ],
        martinique: [
            "Fort-de-France", "Le Lamentin", "Le Robert", "Schoelcher", "Le François", 
            "Ducos", "Saint-Joseph", "Sainte-Luce", "La Trinité", "Rivière-Salée", 
            "Gros-Morne", "Sainte-Marie", "Le Marin", "Les Trois-Îlets", "Vauclin", 
            "Case-Pilote", "Saint-Pierre", "Lorrain", "Les Anses-d'Arlet", "Rivière-Pilote"
        ],
        guyane: [
            "Cayenne", "Kourou", "Matoury", "Saint-Laurent-du-Maroni", "Remire-Montjoly", 
            "Mana", "Macouria", "Maripasoula", "Apatou", "Grand-Santi", "Saint-Georges", "Sinnamary"
        ],
        reunion: [
            "Saint-Denis", "Saint-Paul", "Saint-Pierre", "Le Tampon", "Saint-André", 
            "Saint-Louis", "Le Port", "Saint-Joseph", "Saint-Benoît", "Sainte-Marie", 
            "Sainte-Suzanne", "Petite-Île", "Bras-Panon", "La Possession", "L'Étang-Salé", "Salazie"
        ],
        "saint-martin": [
            "Marigot", "Grand-Case", "Baie-Nettlé", "Cul-de-Sac", "Anse-Marcel", 
            "Quartier-d'Orléans", "Terres-Basses", "Gustavia (St-Barth)", "St-Jean (St-Barth)"
        ]
    };

    // --- AUTOLOCALISATION GPS AUTOMATIQUE (DÈS LE CHARGEMENT DE LA PAGE) ---
    const autoLocateBtn = document.getElementById('autoLocateBtn');

    function triggerAutoLocation() {
        if (!autoLocateBtn) return;

        autoLocateBtn.classList.remove('located');
        autoLocateBtn.classList.add('loading');
        autoLocateBtn.innerHTML = `<i class="ph ph-spinner"></i> <span class="autolocate-text">Détection...</span>`;

        function applyAutoLocation(region, city) {
            if (locationSelect) {
                locationSelect.value = region;
                const event = new Event('change');
                locationSelect.dispatchEvent(event);
            }
            setTimeout(() => {
                if (citySelect) {
                    citySelect.value = city;
                }
                autoLocateBtn.classList.remove('loading');
                autoLocateBtn.classList.add('located');
                autoLocateBtn.innerHTML = `<i class="ph ph-check-circle"></i> <span class="autolocate-text">${city}</span>`;
            }, 150);
        }

        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;

                    let detectedRegion = "guadeloupe";
                    let detectedCity = "Baie-Mahault";

                    if (lat >= 14.3 && lat <= 14.9 && lon >= -61.3 && lon <= -60.7) {
                        detectedRegion = "martinique";
                        detectedCity = "Fort-de-France";
                    } else if (lat >= 2.0 && lat <= 6.0 && lon >= -54.5 && lon <= -51.5) {
                        detectedRegion = "guyane";
                        detectedCity = "Cayenne";
                    } else if (lat >= -21.5 && lat <= -20.7 && lon >= 55.1 && lon <= 56.0) {
                        detectedRegion = "reunion";
                        detectedCity = "Saint-Denis";
                    }

                    applyAutoLocation(detectedRegion, detectedCity);
                },
                (error) => {
                    // Fallback automatique Guadeloupe / Baie-Mahault
                    applyAutoLocation("guadeloupe", "Baie-Mahault");
                },
                { timeout: 4000 }
            );
        } else {
            applyAutoLocation("guadeloupe", "Baie-Mahault");
        }
    }

    if (autoLocateBtn) {
        autoLocateBtn.addEventListener('click', triggerAutoLocation);
    }

    // Lancement automatique dès l'arrivée sur le site
    triggerAutoLocation();

    // ==========================================================================
    // MOTEUR DE RECHERCHE DE MEMBRES
    // ==========================================================================
    const heroForm = document.getElementById('heroSearchForm');
    const searchResultsModal = document.getElementById('searchResultsModal');
    const closeSearchModalBtn = document.getElementById('closeSearchModalBtn');
    const searchResultsContainer = document.getElementById('searchResultsContainer');
    const searchSummaryBadge = document.getElementById('searchSummaryBadge');

    function performMemberSearch(customQuery = null) {
        const query = customQuery !== null ? customQuery.toLowerCase().trim() : (searchInput ? searchInput.value.toLowerCase().trim() : '');
        const selectedLocation = locationSelect ? locationSelect.value : '';
        const selectedCity = citySelect ? citySelect.value : '';

        // Filter members
        let filteredMembers = LYANN_MEMBERS.filter(member => {
            // Location match (if selected)
            const matchLocation = !selectedLocation || member.location === selectedLocation;

            // City match (if selected)
            const matchCity = !selectedCity || member.city.toLowerCase() === selectedCity.toLowerCase();

            // Query match (if typed)
            let matchQuery = true;
            if (query) {
                const searchHaystack = [
                    member.name.toLowerCase(),
                    member.role.toLowerCase(),
                    member.category.toLowerCase(),
                    member.city.toLowerCase(),
                    ...member.keywords,
                    ...member.skills.map(s => s.toLowerCase())
                ].join(' ');

                matchQuery = searchHaystack.includes(query);
            }

            return matchLocation && matchCity && matchQuery;
        });

        // Display results modal
        renderSearchResults(filteredMembers, query, selectedLocation, selectedCity);
    }

    function renderSearchResults(members, query, selectedLocation, selectedCity) {
        if (!searchResultsModal || !searchResultsContainer) return;

        // Render Summary Badge
        let locationLabel = "Tous les DOM";
        if (selectedLocation === 'guadeloupe') locationLabel = "Guadeloupe (971)";
        else if (selectedLocation === 'martinique') locationLabel = "Martinique (972)";
        else if (selectedLocation === 'guyane') locationLabel = "Guyane (973)";
        else if (selectedLocation === 'reunion') locationLabel = "La Réunion (974)";
        else if (selectedLocation === 'saint-martin') locationLabel = "St-Martin / St-Barth";

        if (selectedCity) {
            locationLabel = `${selectedCity} (${locationLabel})`;
        }

        if (searchSummaryBadge) {
            searchSummaryBadge.innerHTML = `
                <span>🔍 ${query ? `"${query}"` : "Tous les domaines"}</span>
                <span>•</span>
                <span>📍 ${locationLabel}</span>
                <span>•</span>
                <span style="color: var(--primary);">${members.length} talent(s) trouvé(s)</span>
            `;
        }

        // Render Member Cards Grid
        if (members.length > 0) {
            searchResultsContainer.innerHTML = members.map(member => `
                <div class="member-result-card">
                    <div>
                        <div class="member-header">
                            <div class="member-avatar-wrapper">
                                <img src="${member.avatar}" alt="${member.name}" class="member-avatar">
                                <span class="online-dot" title="En ligne"></span>
                            </div>
                            <div class="member-info">
                                <h4>${member.name} <span class="verified-badge">✔ ${member.badge}</span></h4>
                                <div class="member-role">${member.role}</div>
                                <div class="member-location"><i class="ph ph-map-pin"></i> ${member.city}, ${member.locationName}</div>
                            </div>
                        </div>

                        <div class="member-rating-row">
                            <span class="rating-stars">★ ${member.rating}</span>
                            <span class="reviews-count">(${member.reviewsCount} avis)</span>
                            <span class="hourly-badge">${member.hourlyRate}</span>
                        </div>

                        <p class="member-bio">"${member.bio}"</p>

                        <div class="member-skills-tags">
                            ${member.skills.map(skill => `<span class="skill-tag">${skill}</span>`).join('')}
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px;">
                        <button class="btn btn-outline view-member-profile-btn" data-member-id="${member.id}">
                            <i class="ph ph-user"></i> Voir le profil
                        </button>
                        <button class="btn btn-primary contact-member-btn" data-member-id="${member.id}" data-member-name="${member.name}">
                            <i class="ph ph-chat-circle-dots"></i> Contacter
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            // Empty state — fallback proposals in region
            const fallbackMembers = LYANN_MEMBERS.filter(m => !selectedLocation || m.location === selectedLocation).slice(0, 3);

            searchResultsContainer.innerHTML = `
                <div class="empty-search-state">
                    <div class="empty-search-icon">🔍</div>
                    <h4>Aucun talent exact trouvé pour cette recherche à ${locationLabel}.</h4>
                    <p>Voici les membres recommandés disponibles dans votre département :</p>
                </div>
                ${fallbackMembers.map(member => `
                    <div class="member-result-card">
                        <div>
                            <div class="member-header">
                                <div class="member-avatar-wrapper">
                                    <img src="${member.avatar}" alt="${member.name}" class="member-avatar">
                                    <span class="online-dot"></span>
                                </div>
                                <div class="member-info">
                                    <h4>${member.name} <span class="verified-badge">✔ ${member.badge}</span></h4>
                                    <div class="member-role">${member.role}</div>
                                    <div class="member-location"><i class="ph ph-map-pin"></i> ${member.city}, ${member.locationName}</div>
                                </div>
                            </div>
                            <div class="member-rating-row">
                                <span class="rating-stars">★ ${member.rating}</span>
                                <span class="reviews-count">(${member.reviewsCount} avis)</span>
                                <span class="hourly-badge">${member.hourlyRate}</span>
                            </div>
                            <p class="member-bio">"${member.bio}"</p>
                        </div>
                        <button class="btn btn-primary contact-member-btn" data-member-id="${member.id}" data-member-name="${member.name}">
                            <i class="ph ph-chat-circle-dots"></i> Contacter ${member.name.split(' ')[0]}
                        </button>
                    </div>
                `).join('')}
            `;
        }

        // Attach Contact Event to Result Cards Buttons
        document.querySelectorAll('.contact-member-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const memberName = btn.dataset.memberName;
                openContactMemberModal(memberName);
            });
        });

        // Show Modal
        searchResultsModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    if (heroForm) {
        heroForm.addEventListener('submit', (e) => {
            e.preventDefault();
            performMemberSearch();
        });
    }

    if (closeSearchModalBtn) {
        closeSearchModalBtn.addEventListener('click', () => {
            if (searchResultsModal) {
                searchResultsModal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    // ==========================================================================
    // MODAL DE CONTACT DIRECT D'UN MEMBRE
    // ==========================================================================
    const contactMemberModal = document.getElementById('contactMemberModal');
    const closeContactModalBtn = document.getElementById('closeContactModalBtn');
    const contactMemberTarget = document.getElementById('contactMemberTarget');
    const contactMemberForm = document.getElementById('contactMemberForm');

    function openContactMemberModal(memberName) {
        if (!contactMemberModal) return;
        if (contactMemberTarget) {
            contactMemberTarget.textContent = `Envoyez un message direct à ${memberName}`;
        }
        if (searchResultsModal) searchResultsModal.classList.remove('active');
        contactMemberModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    if (closeContactModalBtn) {
        closeContactModalBtn.addEventListener('click', () => {
            if (contactMemberModal) {
                contactMemberModal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    if (contactMemberForm) {
        contactMemberForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('contactSenderName');
            const senderName = nameInput ? nameInput.value : 'Voisin';

            if (contactMemberModal) contactMemberModal.classList.remove('active');
            document.body.style.overflow = '';
            alert(`🎉 Merci ${senderName} ! Votre message a été transmis avec succès. Le membre vous recontactera rapidement.`);
            contactMemberForm.reset();
        });
    }

    // ==========================================================================
    // PARCOURS D'INSCRIPTION INTERACTIF (MODAL STEPPER)
    // ==========================================================================
    const signupModal = document.getElementById('signupModal');
    const closeSignupBtn = document.getElementById('closeSignupBtn');
    const openTriggers = document.querySelectorAll('.open-signup-trigger');

    const nextStepBtn = document.getElementById('nextStepBtn');
    const prevStepBtn = document.getElementById('prevStepBtn');
    const progressBarFill = document.getElementById('progressBarFill');
    const stepCountText = document.getElementById('stepCountText');
    const modalFooter = document.getElementById('modalFooter');
    const modalFinishBtn = document.getElementById('modalFinishBtn');

    let currentStep = 1;
    let userSignupData = {
        role: '',
        categories: [],
        territory: '',
        city: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: ''
    };

    function openSignupModal(presetRole = null) {
        if (!signupModal) return;
        signupModal.classList.add('active');
        document.body.style.overflow = 'hidden';

        if (presetRole) {
            userSignupData.role = presetRole;
            selectRoleCard(presetRole);
        }
    }

    function closeSignupModal() {
        if (!signupModal) return;
        signupModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    openTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            // Only trigger signup if it's not a category search card
            if (trigger.classList.contains('category-card')) return;
            e.preventDefault();
            const presetRole = trigger.dataset.presetRole || null;
            openSignupModal(presetRole);
        });
    });

    if (closeSignupBtn) closeSignupBtn.addEventListener('click', closeSignupModal);
    if (signupModal) {
        signupModal.addEventListener('click', (e) => {
            if (e.target === signupModal) closeSignupModal();
        });
    }

    const choiceCards = document.querySelectorAll('.choice-card');
    function selectRoleCard(role) {
        choiceCards.forEach(card => {
            const cardRole = card.dataset.role;
            if (cardRole === role) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });
        userSignupData.role = role;
    }

    choiceCards.forEach(card => {
        card.addEventListener('click', () => {
            const role = card.dataset.role;
            selectRoleCard(role);
        });
    });

    const catCards = document.querySelectorAll('.cat-select-card');
    catCards.forEach(catCard => {
        catCard.addEventListener('click', () => {
            const cat = catCard.dataset.cat;
            catCard.classList.toggle('selected');
            
            if (userSignupData.categories.includes(cat)) {
                userSignupData.categories = userSignupData.categories.filter(c => c !== cat);
            } else {
                userSignupData.categories.push(cat);
            }
        });
    });

    function updateStepUI() {
        for (let i = 1; i <= 5; i++) {
            const stepEl = document.getElementById(`modalStep${i}`);
            if (stepEl) {
                stepEl.classList.toggle('active', i === currentStep);
            }
        }

        if (currentStep <= 4) {
            stepCountText.textContent = `Étape ${currentStep} sur 4`;
            progressBarFill.style.width = `${(currentStep / 4) * 100}%`;
            modalFooter.style.display = 'flex';
        } else {
            stepCountText.textContent = `Terminé 🎉`;
            progressBarFill.style.width = `100%`;
            modalFooter.style.display = 'none';
        }

        if (currentStep > 1 && currentStep < 5) {
            prevStepBtn.style.visibility = 'visible';
        } else {
            prevStepBtn.style.visibility = 'hidden';
        }

        if (currentStep === 2) {
            const titleEl = document.getElementById('step2Title');
            const descEl = document.getElementById('step2Desc');
            if (userSignupData.role === 'provider') {
                if (titleEl) titleEl.textContent = "Vos compétences & spécialités";
                if (descEl) descEl.textContent = "Sélectionnez les domaines dans lesquels vous souhaitez proposer vos services.";
            } else {
                if (titleEl) titleEl.textContent = "Quels sont vos besoins récurrents ?";
                if (descEl) descEl.textContent = "Sélectionnez les catégories pour lesquelles vous cherchez de l'aide.";
            }
        }

        if (currentStep === 5) {
            const recapRole = document.getElementById('recapRoleText');
            const recapTerritory = document.getElementById('recapTerritoryText');
            const recapCategories = document.getElementById('recapCategoriesText');

            if (recapRole) {
                recapRole.textContent = userSignupData.role === 'provider' 
                    ? '🛠️ Talent (Prestataire)' 
                    : '🔍 Habitant (Client)';
            }
            if (recapTerritory) {
                recapTerritory.textContent = `${userSignupData.territory || 'DOM'} (${userSignupData.city || 'Ville non spécifiée'})`;
            }
            if (recapCategories) {
                recapCategories.textContent = userSignupData.categories.length > 0
                    ? userSignupData.categories.join(', ')
                    : 'Toutes catégories';
            }
        }
    }

    function validateCurrentStep() {
        if (currentStep === 1) {
            if (!userSignupData.role) {
                alert('Veuillez choisir si vous proposez vos services ou si vous cherchez quelqu\'un.');
                return false;
            }
        } else if (currentStep === 3) {
            const territorySelect = document.getElementById('modalTerritorySelect');
            const cityInput = document.getElementById('modalCityInput');
            if (territorySelect && territorySelect.value) {
                userSignupData.territory = territorySelect.value;
            } else {
                alert('Veuillez sélectionner votre territoire dans les DOM.');
                return false;
            }
            if (cityInput) userSignupData.city = cityInput.value;
        } else if (currentStep === 4) {
            const firstName = document.getElementById('modalFirstName');
            const email = document.getElementById('modalEmail');
            if (!firstName || !firstName.value.trim()) {
                alert('Veuillez saisir votre prénom.');
                return false;
            }
            if (!email || !email.value.trim() || !email.value.includes('@')) {
                alert('Veuillez saisir une adresse email valide.');
                return false;
            }
            userSignupData.firstName = firstName.value;
            userSignupData.email = email.value;
        }
        return true;
    }

    if (nextStepBtn) {
        nextStepBtn.addEventListener('click', () => {
            if (validateCurrentStep()) {
                if (currentStep < 5) {
                    currentStep++;
                    updateStepUI();
                }
            }
        });
    }

    if (prevStepBtn) {
        prevStepBtn.addEventListener('click', () => {
            if (currentStep > 1) {
                currentStep--;
                updateStepUI();
            }
        });
    }

    if (modalFinishBtn) {
        modalFinishBtn.addEventListener('click', () => {
            closeSignupModal();
            alert(`Félicitations ${userSignupData.firstName} ! Votre compte LYANN est prêt.`);
            currentStep = 1;
            updateStepUI();
        });
    }

    // ==========================================================================
    // LOGIQUE DE CONNEXION (MANUEL & GOOGLE) & PROFIL BICOLORE
    // ==========================================================================
    const loginModal = document.getElementById('loginModal');
    const closeLoginModalBtn = document.getElementById('closeLoginModalBtn');
    const loginTriggers = document.querySelectorAll('a[href="#login"], .open-login-trigger');
    const googleAuthBtn = document.getElementById('googleAuthBtn');
    const loginForm = document.getElementById('loginForm');
    const switchToSignupBtn = document.getElementById('switchToSignupBtn');

    const profileDashboardModal = document.getElementById('profileDashboardModal');
    const closeProfileModalBtn = document.getElementById('closeProfileModalBtn');
    const profileCardTheme = document.getElementById('profileCardTheme');
    const btnRoleProvider = document.getElementById('btnRoleProvider');
    const btnRoleSeeker = document.getElementById('btnRoleSeeker');
    const profileRoleBadge = document.getElementById('profileRoleBadge');
    const domainTabTitle = document.getElementById('domainTabTitle');
    const logoutBtn = document.getElementById('logoutBtn');

    function openLoginModal() {
        if (loginModal) {
            loginModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeLoginModal() {
        if (loginModal) {
            loginModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    function openProfileDashboard(role = 'provider') {
        closeLoginModal();
        if (profileDashboardModal) {
            profileDashboardModal.classList.add('active');
            document.body.style.overflow = 'hidden';
            setDashboardRoleTheme(role);
        }
    }

    function closeProfileDashboard() {
        if (profileDashboardModal) {
            profileDashboardModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    function setDashboardRoleTheme(role) {
        if (!profileCardTheme) return;

        const tabRealizationsBtn = document.getElementById('tabRealizationsBtn');

        if (role === 'seeker') {
            profileCardTheme.className = 'modal-card modal-card-dashboard theme-seeker';
            if (profileRoleBadge) profileRoleBadge.innerHTML = '🔍 Espace Habitant (Demandeur)';
            if (domainTabTitle) domainTabTitle.textContent = 'Besoins & Domaines de Recherche (Habitant)';
            if (btnRoleSeeker) btnRoleSeeker.classList.add('active');
            if (btnRoleProvider) btnRoleProvider.classList.remove('active');
            if (tabRealizationsBtn) tabRealizationsBtn.style.display = 'none';
        } else {
            profileCardTheme.className = 'modal-card modal-card-dashboard theme-provider';
            if (profileRoleBadge) profileRoleBadge.innerHTML = '🛠️ Espace Talent (Prestataire)';
            if (domainTabTitle) domainTabTitle.textContent = 'Réglages du Domaine d\'Activité & Compétences (Prestataire)';
            if (btnRoleProvider) btnRoleProvider.classList.add('active');
            if (btnRoleSeeker) btnRoleSeeker.classList.remove('active');
            if (tabRealizationsBtn) tabRealizationsBtn.style.display = 'inline-flex';
        }
    }

    loginTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            openLoginModal();
        });
    });

    if (closeLoginModalBtn) closeLoginModalBtn.addEventListener('click', closeLoginModal);
    if (closeProfileModalBtn) closeProfileModalBtn.addEventListener('click', closeProfileDashboard);

    if (switchToSignupBtn) {
        switchToSignupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeLoginModal();
            openSignupModal();
        });
    }

    if (googleAuthBtn) {
        googleAuthBtn.addEventListener('click', () => {
            alert('🟢 Authentification Google réussie ! Bienvenue sur votre espace LYANN.');
            openProfileDashboard('provider');
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            openProfileDashboard('provider');
        });
    }

    if (btnRoleProvider) {
        btnRoleProvider.addEventListener('click', () => setDashboardRoleTheme('provider'));
    }
    if (btnRoleSeeker) {
        btnRoleSeeker.addEventListener('click', () => setDashboardRoleTheme('seeker'));
    }

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

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            closeProfileDashboard();
            alert('Vous êtes déconnecté.');
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
        if (badgeEl) badgeEl.textContent = `✔ ${member.badge}`;
        if (reviewsCountEl) reviewsCountEl.textContent = member.reviewsCount;

        // Recommendation count
        const currentCount = memberRecommendations[member.id] || Math.floor(member.reviewsCount * 3.5);
        if (recommendCountBadge) recommendCountBadge.textContent = currentCount;
        if (recommendMemberBtn) recommendMemberBtn.classList.remove('liked');

        // Skills pills
        if (skillsContainer) {
            skillsContainer.innerHTML = member.skills.map(s => `<span class="skill-tag">${s}</span>`).join('');
        }

        // Render Realizations
        renderPublicRealizations(member);

        // Open modal
        if (searchResultsModal) searchResultsModal.classList.remove('active');
        if (publicMemberProfileModal) {
            publicMemberProfileModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    function renderPublicRealizations(member) {
        if (!publicRealizationsGrid) return;

        const realizations = member.realizations && member.realizations.length > 0
            ? member.realizations
            : DEFAULT_REALIZATIONS;

        publicRealizationsGrid.innerHTML = realizations.map(item => `
            <div class="realization-card">
                <div class="realization-img-wrapper">
                    <img src="${item.img}" alt="${item.title}" class="realization-img">
                    <span class="realization-tag-city">📍 ${item.city}</span>
                </div>
                <div class="realization-info">
                    <h5 class="realization-title">${item.title}</h5>
                    <p class="realization-desc">${item.desc}</p>
                </div>
            </div>
        `).join('');
    }

    function renderMyDashboardRealizations() {
        const myRealizationsGrid = document.getElementById('myRealizationsGrid');
        if (!myRealizationsGrid) return;

        myRealizationsGrid.innerHTML = DEFAULT_REALIZATIONS.map(item => `
            <div class="realization-card">
                <div class="realization-img-wrapper">
                    <img src="${item.img}" alt="${item.title}" class="realization-img">
                    <span class="realization-tag-city">📍 ${item.city}</span>
                </div>
                <div class="realization-info">
                    <h5 class="realization-title">${item.title}</h5>
                    <p class="realization-desc">${item.desc}</p>
                </div>
            </div>
        `).join('');
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

    // Recommend button (+1 count)
    if (recommendMemberBtn) {
        recommendMemberBtn.addEventListener('click', () => {
            if (!currentVisitingMember) return;
            const currentCount = parseInt(recommendCountBadge.textContent, 10) || 100;
            const newCount = currentCount + 1;
            memberRecommendations[currentVisitingMember.id] = newCount;
            recommendCountBadge.textContent = newCount;
            recommendMemberBtn.classList.add('liked');
            alert(`👍 Merci ! Vous avez recommandé ${currentVisitingMember.name} auprès des voisins.`);
        });
    }

    // Direct contact from public profile
    if (publicContactBtn) {
        publicContactBtn.addEventListener('click', () => {
            if (currentVisitingMember) {
                if (publicMemberProfileModal) publicMemberProfileModal.classList.remove('active');
                openContactModal(currentVisitingMember.id, currentVisitingMember.name);
            }
        });
    }

    // Share profile
    if (shareProfileBtn) {
        shareProfileBtn.addEventListener('click', () => {
            if (navigator.clipboard && currentVisitingMember) {
                navigator.clipboard.writeText(window.location.href);
                alert(`🔗 Lien du profil de ${currentVisitingMember.name} copié dans votre presse-papier !`);
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
            alert('🎉 Votre réalisation a été publiée avec succès sur votre profil LYANN !');
            addRealizationForm.reset();
            realizationImagePreview.style.display = 'none';
        });
    }

    renderMyDashboardRealizations();

    updateStepUI();
});
