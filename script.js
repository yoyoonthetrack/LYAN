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

    // --- Effacement automatique au clic pour écrire dans la barre de recherche ---
    if (searchInput) {
        const handleSearchInputFocus = () => {
            if (searchInput.value.trim() !== '') {
                searchInput.value = '';
                tags.forEach(t => t.classList.remove('active'));
            }
        };

        searchInput.addEventListener('focus', handleSearchInputFocus);
        searchInput.addEventListener('click', handleSearchInputFocus);
    }

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
            "Anse-Bertrand", "Baie-Mahault", "Baillif", "Basse-Terre", "Bouillante",
            "Capesterre-Belle-Eau", "Capesterre-de-Marie-Galante", "Deshaies", "Gourbeyre",
            "Goyave", "Grand-Bourg (Marie-Galante)", "La Désirade", "Lamentin", "Le Gosier",
            "Le Moule", "Les Abymes", "Morne-à-l'Eau", "Petit-Bourg", "Petit-Canal",
            "Pointe-à-Pitre", "Pointe-Noire", "Port-Louis", "Saint-Claude", "Saint-François",
            "Saint-Louis (Marie-Galante)", "Sainte-Anne", "Sainte-Rose", "Terre-de-Bas",
            "Terre-de-Haut", "Trois-Rivières", "Vieux-Fort", "Vieux-Habitants"
        ],
        martinique: [
            "Ajoupa-Bouillon", "Basse-Pointe", "Bellefontaine", "Case-Pilote", "Ducos",
            "Fonds-Saint-Denis", "Fort-de-France", "Grand'Rivière", "Gros-Morne",
            "La Trinité", "Le Carbet", "Le Diamant", "Le François", "Le Lamentin", "Le Lorrain",
            "Le Marigot", "Le Marin", "Le Morne-Rouge", "Le Morne-Vert", "Le Prêcheur", "Le Robert",
            "Les Anses-d'Arlet", "Les Trois-Îlets", "Macouba", "Rivière-Pilote", "Rivière-Salée",
            "Saint-Esprit", "Saint-Joseph", "Saint-Pierre", "Sainte-Anne", "Sainte-Luce", "Sainte-Marie",
            "Schoelcher", "Vauclin"
        ],
        guyane: [
            "Apatou", "Awala-Yalimapo", "Camopi", "Cayenne", "Grand-Santi", "Iracoubo",
            "Kourou", "Macouria", "Mana", "Maripasoula", "Matoury", "Montsinéry-Tonnegrande",
            "Ouanary", "Papaichton", "Régina", "Remire-Montjoly", "Roura", "Saint-Georges",
            "Saint-Laurent-du-Maroni", "Saül", "Sinnamary"
        ],
        reunion: [
            "Bras-Panon", "Cilaos", "Entre-Deux", "L'Étang-Salé", "La Possession", "Le Port",
            "Le Tampon", "Les Trois-Bassins", "Petite-Île", "Plaine-des-Palmistes", "Saint-André",
            "Saint-Benoît", "Saint-Denis", "Saint-Joseph", "Saint-Leu", "Saint-Louis",
            "Saint-Paul", "Saint-Philippe", "Saint-Pierre", "Sainte-Marie", "Sainte-Rose",
            "Sainte-Suzanne", "Salazie"
        ],
        "saint-martin": [
            "Marigot", "Grand-Case", "Baie-Nettlé", "Cul-de-Sac", "Anse-Marcel",
            "Quartier-d'Orléans", "Terres-Basses", "Gustavia (St-Barth)", "St-Jean (St-Barth)", "Lorient (St-Barth)"
        ]
    };

    const locationSelect = document.getElementById('locationSelect');
    const citySelect = document.getElementById('citySelect');
    const autoLocateBtn = document.getElementById('autoLocateBtn');

    // --- FONCTION DE PEUPLEMENT DYNAMIQUE DES COMMUNES ---
    function updateCityOptions(region, selectedCity = '') {
        if (!citySelect) return;

        citySelect.innerHTML = '';

        if (!region || !DOM_COMMUNES[region]) {
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = 'Toutes les communes';
            citySelect.appendChild(defaultOpt);
            citySelect.disabled = false;
            return;
        }

        citySelect.disabled = false;

        // Option par défaut "Toutes les communes"
        const deptCode = region === 'guadeloupe' ? '971' : region === 'martinique' ? '972' : region === 'guyane' ? '973' : region === 'reunion' ? '974' : 'DOM';
        const allOpt = document.createElement('option');
        allOpt.value = '';
        allOpt.textContent = `Toutes les communes (${deptCode})`;
        citySelect.appendChild(allOpt);

        // Options de chaque commune triées par ordre alphabétique
        const communes = [...DOM_COMMUNES[region]].sort((a, b) => a.localeCompare(b, 'fr'));
        communes.forEach(commune => {
            const opt = document.createElement('option');
            opt.value = commune;
            opt.textContent = commune;
            if (selectedCity && selectedCity.toLowerCase() === commune.toLowerCase()) {
                opt.selected = true;
            }
            citySelect.appendChild(opt);
        });
    }

    // Écoute du changement manuel du Département
    if (locationSelect) {
        locationSelect.addEventListener('change', (e) => {
            const selectedRegion = e.target.value;
            updateCityOptions(selectedRegion);
        });
    }

    // --- GESTION DU SLIDER DE DISTANCE (Crans : - de 5 km, - de 10 km, - de 15 km, - de 20 km, - de 30 km, - de 50 km, Toute l'île) ---
    const distanceRange = document.getElementById('distanceRange');
    const distanceValueBadge = document.getElementById('distanceValueBadge');
    const DISTANCE_STEPS = [
        "- de 5 km",
        "- de 10 km",
        "- de 15 km",
        "- de 20 km",
        "- de 30 km",
        "- de 50 km",
        "Toute l'île"
    ];

    function updateDistanceBadge(stepIdx) {
        if (!distanceValueBadge || !distanceRange) return;
        const idx = Math.min(Math.max(parseInt(stepIdx, 10) || 0, 0), DISTANCE_STEPS.length - 1);
        const labelText = DISTANCE_STEPS[idx];

        distanceValueBadge.textContent = labelText;

        if (idx === DISTANCE_STEPS.length - 1) {
            distanceValueBadge.style.background = '#FFF3D6';
            distanceValueBadge.style.color = '#8A6200';
            distanceValueBadge.style.borderColor = '#E5B345';
        } else {
            distanceValueBadge.style.background = '#EAF2EC';
            distanceValueBadge.style.color = '#2E4C37';
            distanceValueBadge.style.borderColor = 'rgba(74, 124, 89, 0.3)';
        }

        // Calcule la position relative % (0% à 100% sur 6 pas) et déplace le badge au-dessus du curseur
        const pct = (idx / (DISTANCE_STEPS.length - 1)) * 100;
        distanceValueBadge.style.left = `calc(${pct}% + (${6 - pct * 0.12}px))`;
    }

    if (distanceRange) {
        updateDistanceBadge(distanceRange.value);
        ['input', 'change', 'mousemove', 'touchmove'].forEach(evt => {
            distanceRange.addEventListener(evt, (e) => {
                updateDistanceBadge(e.target.value);
            });
        });
    }

    // Initialisation du menu déroulant des communes dès le chargement de la page
    if (locationSelect && locationSelect.value) {
        updateCityOptions(locationSelect.value);
    } else if (locationSelect) {
        locationSelect.value = "guadeloupe";
        updateCityOptions("guadeloupe");
    }

    // ==========================================================================
    // MOTEUR DE RECHERCHE DE MEMBRES
    // ==========================================================================
    const heroForm = document.getElementById('heroSearchForm');
    const searchResultsModal = document.getElementById('searchResultsModal');
    const closeSearchModalBtn = document.getElementById('closeSearchModalBtn');
    const searchResultsContainer = document.getElementById('searchResultsContainer');
    const searchSummaryBadge = document.getElementById('searchSummaryBadge');

    let currentSearchResultsList = [];

    function performMemberSearch(customQuery = null) {
        const query = customQuery !== null ? customQuery.toLowerCase().trim() : (searchInput ? searchInput.value.toLowerCase().trim() : '');
        const selectedLocation = locationSelect ? locationSelect.value : '';
        const selectedCity = citySelect ? citySelect.value : '';

        // Filter members
        let filteredMembers = LYANN_MEMBERS.filter(member => {
            const matchLocation = !selectedLocation || member.location === selectedLocation;
            const matchCity = !selectedCity || member.city.toLowerCase() === selectedCity.toLowerCase();
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

        currentSearchResultsList = filteredMembers;

        // Reset modal toolbar filters if present
        const searchSortSelect = document.getElementById('searchSortSelect');
        const modalCategoryFilterSelect = document.getElementById('modalCategoryFilterSelect');
        if (searchSortSelect) searchSortSelect.value = 'recommended';
        if (modalCategoryFilterSelect) modalCategoryFilterSelect.value = 'all';

        renderSearchResults(filteredMembers, query, selectedLocation, selectedCity);
    }

    function renderSearchResults(members, query, selectedLocation, selectedCity) {
        if (!searchResultsContainer) return;

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

        let distanceText = "";
        if (distanceRange) {
            const idx = Math.min(Math.max(parseInt(distanceRange.value, 10) || 0, 0), DISTANCE_STEPS.length - 1);
            const labelText = DISTANCE_STEPS[idx];
            distanceText = labelText === "Toute l'île" ? " • Toute l'île" : ` • Rayon ${labelText}`;
        }

        if (searchSummaryBadge) {
            searchSummaryBadge.innerHTML = `
                <span>🔍 ${query ? `"${query}"` : "Tous les domaines"}</span>
                <span>•</span>
                <span>📍 ${locationLabel}${distanceText}</span>
                <span>•</span>
                <span style="color: var(--primary); font-weight: 800;">${members.length} talent(s) disponible(s)</span>
            `;
        }

        renderSearchResultsGrid(members, locationLabel);

        // Show Modal Window ONLY IF present on home page
        if (searchResultsModal) {
            searchResultsModal.classList.add('active');
        }
    }

    function renderSearchResultsGrid(members, locationLabel = "") {
        if (!searchResultsContainer) return;

        if (members.length > 0) {
            searchResultsContainer.innerHTML = members.map(member => `
                <div class="member-result-card">
                    <div>
                        <div class="member-header">
                            <div class="member-avatar-wrapper">
                                <img src="${member.avatar}" alt="${member.name}" class="member-avatar">
                                <span class="online-dot" title="Actif récemment"></span>
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

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-light);">
                        <button class="btn btn-outline btn-sm view-member-profile-btn" data-member-id="${member.id}">
                            <i class="ph ph-user"></i> Voir profil
                        </button>
                        <button class="btn btn-primary btn-sm contact-member-btn" data-member-id="${member.id}" data-member-name="${member.name}">
                            <i class="ph ph-chat-circle-dots"></i> Contacter
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            // Empty state — fallback proposals
            const fallbackMembers = LYANN_MEMBERS.slice(0, 3);

            searchResultsContainer.innerHTML = `
                <div class="empty-search-state" style="grid-column: 1 / -1; text-align: center; padding: 32px 20px;">
                    <div class="empty-search-icon" style="font-size: 3rem; margin-bottom: 12px;">🔍</div>
                    <h4 style="font-size: 1.3rem; font-weight: 800; margin-bottom: 6px;">Aucun membre ne correspond exactement à ce filtre.</h4>
                    <p style="color: var(--text-muted); margin-bottom: 20px;">Découvrez d'autres talents très demandés dans votre région :</p>
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
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 16px;">
                            <button class="btn btn-outline btn-sm view-member-profile-btn" data-member-id="${member.id}">
                                <i class="ph ph-user"></i> Voir profil
                            </button>
                            <button class="btn btn-primary btn-sm contact-member-btn" data-member-id="${member.id}" data-member-name="${member.name}">
                                <i class="ph ph-chat-circle-dots"></i> Contacter
                            </button>
                        </div>
                    </div>
                `).join('')}
            `;
        }

        // Attach Profile Click Event to buttons
        document.querySelectorAll('.view-member-profile-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const memberId = btn.dataset.memberId;
                openPublicMemberProfile(memberId);
            });
        });

        // Attach Contact Event
        document.querySelectorAll('.contact-member-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const memberName = btn.dataset.memberName;
                openContactMemberModal(memberName);
            });
        });
    }

    // Écoute des sélecteurs de tri et de filtrage dans la fenêtre de recherche
    const searchSortSelect = document.getElementById('searchSortSelect');
    const modalCategoryFilterSelect = document.getElementById('modalCategoryFilterSelect');

    function applyModalSortingAndFiltering() {
        const sortVal = searchSortSelect ? searchSortSelect.value : 'recommended';
        const catVal = modalCategoryFilterSelect ? modalCategoryFilterSelect.value : 'all';

        let list = [...currentSearchResultsList];

        if (list.length === 0) list = [...LYANN_MEMBERS];

        if (catVal !== 'all') {
            list = list.filter(m => m.category === catVal);
        }

        if (sortVal === 'recommended') {
            list.sort((a, b) => b.rating - a.rating || b.reviewsCount - a.reviewsCount);
        } else if (sortVal === 'reviews') {
            list.sort((a, b) => b.reviewsCount - a.reviewsCount);
        } else if (sortVal === 'city') {
            list.sort((a, b) => a.city.localeCompare(b.city, 'fr'));
        } else if (sortVal === 'name') {
            list.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
        }

        renderSearchResultsGrid(list);
    }

    if (searchSortSelect) searchSortSelect.addEventListener('change', applyModalSortingAndFiltering);
    if (modalCategoryFilterSelect) modalCategoryFilterSelect.addEventListener('change', applyModalSortingAndFiltering);

    if (heroForm) {
        heroForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const isResultsPage = window.location.pathname.includes('results.html');
            const q = searchInput ? searchInput.value.trim() : '';
            const loc = locationSelect ? locationSelect.value : '';
            const city = citySelect ? citySelect.value : '';
            const dist = distanceRange ? distanceRange.value : '';

            if (!isResultsPage) {
                window.location.href = `results.html?query=${encodeURIComponent(q)}&location=${encodeURIComponent(loc)}&city=${encodeURIComponent(city)}&distance=${encodeURIComponent(dist)}`;
            } else {
                performMemberSearch();
            }
        });
    }

    // Auto-exécution si on se trouve sur results.html
    if (window.location.pathname.includes('results.html')) {
        const params = new URLSearchParams(window.location.search);
        const q = params.get('query') || '';
        const loc = params.get('location') || '';
        const city = params.get('city') || '';
        const dist = params.get('distance') || '';
        const cat = params.get('category') || '';

        if (searchInput && q) searchInput.value = q;
        if (locationSelect && loc) {
            locationSelect.value = loc;
            updateCityOptions(loc);
        }
        if (citySelect && city) citySelect.value = city;
        if (distanceRange && dist) {
            distanceRange.value = dist;
            updateDistanceBadge(dist);
        }

        if (cat) {
            const modalCatSelect = document.getElementById('modalCategoryFilterSelect');
            if (modalCatSelect) modalCatSelect.value = cat;
        }

        performMemberSearch(q || null);
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
        plan: 'lyanneur',
        firstName: '',
        lastName: '',
        email: '',
        phone: ''
    };

    function openSignupModal(presetRole = null, presetPlan = null) {
        if (!signupModal) return;
        signupModal.classList.add('active');
        document.body.style.overflow = 'hidden';

        if (presetRole) {
            userSignupData.role = presetRole;
            selectRoleCard(presetRole);
        }

        if (presetPlan) {
            userSignupData.plan = presetPlan;
            const modalPlanCards = document.querySelectorAll('.modal-plan-card');
            modalPlanCards.forEach(c => {
                if (c.dataset.plan === presetPlan) c.classList.add('selected');
                else c.classList.remove('selected');
            });
        }
    }

    function closeSignupModal() {
        if (!signupModal) return;
        signupModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    openTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            if (trigger.classList.contains('category-card')) return;
            e.preventDefault();
            const presetRole = trigger.dataset.presetRole || null;
            const presetPlan = trigger.dataset.plan || null;
            openSignupModal(presetRole, presetPlan);
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

    // Sélection des cartes d'abonnement dans le modal
    const modalPlanCards = document.querySelectorAll('.modal-plan-card');
    modalPlanCards.forEach(planCard => {
        planCard.addEventListener('click', () => {
            modalPlanCards.forEach(c => c.classList.remove('selected'));
            planCard.classList.add('selected');
            userSignupData.plan = planCard.dataset.plan;
        });
    });

    function updateStepUI() {
        for (let i = 1; i <= 6; i++) {
            const stepEl = document.getElementById(`modalStep${i}`);
            if (stepEl) {
                stepEl.classList.toggle('active', i === currentStep);
            }
        }

        if (currentStep <= 5) {
            if (stepCountText) stepCountText.textContent = `Étape ${currentStep} sur 5`;
            if (progressBarFill) progressBarFill.style.width = `${(currentStep / 5) * 100}%`;
            if (modalFooter) modalFooter.style.display = 'flex';
        } else {
            if (stepCountText) stepCountText.textContent = `Terminé 🎉`;
            if (progressBarFill) progressBarFill.style.width = `100%`;
            if (modalFooter) modalFooter.style.display = 'none';
        }

        if (currentStep > 1 && currentStep < 6) {
            if (prevStepBtn) prevStepBtn.style.visibility = 'visible';
        } else {
            if (prevStepBtn) prevStepBtn.style.visibility = 'hidden';
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

        if (currentStep === 6) {
            const recapRole = document.getElementById('recapRoleText');
            const recapTerritory = document.getElementById('recapTerritoryText');
            const recapCategories = document.getElementById('recapCategoriesText');
            const recapPlan = document.getElementById('recapPlanText');

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
            if (recapPlan) {
                if (userSignupData.plan === 'plus') recapPlan.textContent = 'Lyanneur Plus (9,90 € / mois)';
                else if (userSignupData.plan === 'ultime') recapPlan.textContent = 'Lyanneur Ultime (29,90 € / mois) ⭐';
                else if (userSignupData.plan === 'pro') recapPlan.textContent = 'Lyanneur PRO (59,90 € / mois) - PRO VÉRIFIÉ';
                else recapPlan.textContent = 'Lyanneur (Gratuit)';
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
        } else if (currentStep === 5) {
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
                if (currentStep < 6) {
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

    // ==========================================================================
    // DESTINATION ET INTERACTIONS DE TOUS LES BOUTONS DU SITE
    // ==========================================================================

    // 1. Clic sur les tuiles de catégories -> Redirige vers la page dédiée Annuaire results.html
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
        alert('📩 Votre message a été transmis avec succès à l\'équipe LYANN ! Nous vous répondrons sous 24h.');
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
                alert('👍 Merci ! Votre recommandation a été enregistrée avec succès.');
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
    // MOTEUR EN DIRECT DU FIL LYANN (FLASH & ÉCHOS DU QUARTIER)
    // ==========================================================================
    const INITIAL_FLASH_POSTS = [
        {
            id: 'flash-1',
            authorName: 'David Jean-Baptiste (34 ans)',
            authorRole: 'Artisan Clim & Froid',
            authorAvatar: 'david-34.png',
            badge: '⚡ Disponibilité',
            type: 'dispo',
            location: 'Baie-Mahault • Guadeloupe (971)',
            territoryKey: 'guadeloupe',
            timeAgo: 'Il y a 14 min',
            content: 'Créneau disponible cet après-midi pour révision & entretien clim inverter sur Baie-Mahault ou Le Gosier ! Contactez-moi directement.',
            images: [
                'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=600&q=80',
                'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?auto=format&fit=crop&w=600&q=80'
            ],
            likes: 14,
            repliesCount: 3,
            memberId: 1
        },
        {
            id: 'flash-2',
            authorName: 'Tati Huguette Cazeau (68 ans)',
            authorRole: 'Habitante vérifiée',
            authorAvatar: 'huguette-68.png',
            badge: '🔍 Besoin',
            type: 'besoin',
            location: 'Fort-de-France • Martinique (972)',
            territoryKey: 'martinique',
            timeAgo: 'Il y a 42 min',
            content: 'Recherche urgente d\'un bon électricien pour remplacer un tableau secondaire à Schoelcher. Qui me recommandez-vous dans le réseau ?',
            images: [
                'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=600&q=80'
            ],
            likes: 8,
            repliesCount: 5,
            memberId: 9
        },
        {
            id: 'flash-3',
            authorName: 'Élodie Rutil (27 ans)',
            authorRole: 'Voisine Recommandée',
            authorAvatar: 'sarah-29.png',
            badge: '⭐ Recommandation',
            type: 'reco',
            location: 'Le Moule • Guadeloupe (971)',
            territoryKey: 'guadeloupe',
            timeAgo: 'Il y a 2 h',
            content: 'Un immense merci à Man Saint-Louis pour les conseils de taille de mes fruitiers au Moule. Travail propre, conseils précieux et partage !',
            images: [
                'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=600&q=80',
                'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=600&q=80',
                'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=600&q=80'
            ],
            likes: 22,
            repliesCount: 2,
            memberId: 5
        },
        {
            id: 'flash-4',
            authorName: 'Kevin Bellerose (41 ans)',
            authorRole: 'Lyanneur PRO',
            authorAvatar: 'kevin-41.png',
            badge: '📢 Info Quartier',
            type: 'info',
            location: 'Cayenne • Guyane (973)',
            territoryKey: 'guyane',
            timeAgo: 'Il y a 4 h',
            content: 'Attention les voisins avec les grosses pluies d\'hier : pensez à vérifier vos filtres de gouttières et citernes pour éviter les bouchons avant la semaine prochaine.',
            video: 'https://assets.mixkit.co/videos/preview/mixkit-rain-drops-falling-on-a-window-41662-large.mp4',
            likes: 19,
            repliesCount: 4,
            memberId: 10
        }
    ];

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
            vid.muted = true;
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
                    <h4 style="font-weight: 800; font-size: 1.1rem; margin-bottom: 4px;">Aucun Flash pour le moment</h4>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Soyez le premier à publier dans cette catégorie !</p>
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
                const imgsHTML = post.images.slice(0, 3).map(src => `<img src="${src}" alt="Médias Flash LYANN" class="flash-media-img">`).join('');
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
                        ${post.content}
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
            btn.addEventListener('click', () => {
                const countSpan = btn.querySelector('.like-count');
                if (countSpan) {
                    let count = parseInt(countSpan.textContent) || 0;
                    if (btn.classList.contains('liked')) {
                        countSpan.textContent = count - 1;
                        btn.classList.remove('liked');
                        btn.style.color = '';
                    } else {
                        countSpan.textContent = count + 1;
                        btn.classList.add('liked');
                        btn.style.color = '#E63B2E';
                    }
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

            if (!text) return;

            let badgeText = '⚡ Disponibilité';
            if (type === 'besoin') badgeText = '🔍 Besoin';
            else if (type === 'reco') badgeText = '⭐ Recommandation';
            else if (type === 'info') badgeText = '📢 Info Quartier';

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
            alert('🎉 Votre Flash multimédia a été publié en direct sur Le Fil LYANN !');
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

    // ==========================================================================
    // LOGIQUE DE CHAT DIRECT INTERACTIF (#chatModal)
    // ==========================================================================
    const chatModal = document.getElementById('chatModal');
    const closeChatModalBtn = document.getElementById('closeChatModalBtn');
    const chatHeaderName = document.getElementById('chatHeaderName');
    const chatHeaderAvatar = document.getElementById('chatHeaderAvatar');
    const chatMessagesContainer = document.getElementById('chatMessagesContainer');
    const chatInputForm = document.getElementById('chatInputForm');
    const chatInputField = document.getElementById('chatInputField');

    if (closeChatModalBtn) {
        closeChatModalBtn.addEventListener('click', () => {
            if (chatModal) chatModal.classList.remove('active');
        });
    }

    function openChatWithUser(name, avatar) {
        if (chatHeaderName) chatHeaderName.textContent = name;
        if (chatHeaderAvatar) chatHeaderAvatar.src = avatar;

        if (chatMessagesContainer) {
            chatMessagesContainer.innerHTML = `
                <div class="chat-msg-bubble received">
                    Bonjour ! Je suis ${name}. Comment puis-je vous aider pour vos projets ou travaux ?
                    <div class="chat-msg-time">À l'instant</div>
                </div>
            `;
        }

        if (chatModal) chatModal.classList.add('active');
    }

    if (chatInputForm) {
        chatInputForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = chatInputField ? chatInputField.value.trim() : '';
            if (!text) return;

            const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const sentBubble = document.createElement('div');
            sentBubble.className = 'chat-msg-bubble sent';
            sentBubble.innerHTML = `${text} <div class="chat-msg-time">${timeNow}</div>`;
            chatMessagesContainer.appendChild(sentBubble);

            chatInputField.value = '';
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

            // Simulation de réponse automatique du membre sous 1.2s
            setTimeout(() => {
                const activeName = chatHeaderName ? chatHeaderName.textContent.split(' ')[0] : 'Votre voisin';
                const replies = [
                    `C'est bien noté ! Je regarde mes disponibilités et je vous réponds précisément dans quelques instants. 👍`,
                    `Merci pour votre message ! Je peux me déplacer pour un premier constat gratuit si vous souhaitez.`,
                    `Super ! On s'organise ainsi. À très vite sur LYANN.`
                ];
                const randomReply = replies[Math.floor(Math.random() * replies.length)];

                const replyBubble = document.createElement('div');
                replyBubble.className = 'chat-msg-bubble received';
                replyBubble.innerHTML = `${randomReply} <div class="chat-msg-time">${timeNow}</div>`;
                chatMessagesContainer.appendChild(replyBubble);
                chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
            }, 1200);
        });
    }

    // Connect trigger buttons to open chat direct
    document.querySelectorAll('.open-chat-trigger, .btn-open-chat').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const name = btn.dataset.memberName || 'David Jean-Baptiste (34 ans)';
            const avatar = btn.dataset.memberAvatar || 'david-34.png';
            openChatWithUser(name, avatar);
        });
    });

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
            alert('📩 Un lien sécurisé de réinitialisation a été envoyé à votre adresse email.');
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
            alert('🎉 Votre demande de réservation et de devis a été transmise avec succès ! Vous recevrez une confirmation sous 2h.');
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
            alert('🛡️ Votre signalement a été transmis à l\'équipe de modération LYANN. Merci de contribuer à la sérénité du réseau !');
            if (reportModal) reportModal.classList.remove('active');
            reportForm.reset();
        });
    }

    renderFlashFeed();

    renderMyDashboardRealizations();
    updateStepUI();
});
