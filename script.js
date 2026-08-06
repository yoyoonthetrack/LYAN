/**
 * LYANN - Script (Community, Trust, Member Search & Interactive Signup Workflow)
 */

document.addEventListener('DOMContentLoaded', () => {

    // Safe storage wrapper to prevent crashes under file:// when localStorage is disabled or blocked
    const safeStorage = {
        _cache: {},
        getItem(key) {
            try {
                const val = window.localStorage.getItem(key);
                return val;
            } catch (e) {
                return this._cache[key] || null;
            }
        },
        setItem(key, value) {
            try {
                window.localStorage.setItem(key, value);
            } catch (e) {
                this._cache[key] = String(value);
            }
        },
        removeItem(key) {
            try {
                window.localStorage.removeItem(key);
            } catch (e) {
                delete this._cache[key];
            }
        }
    };

    // Initialize Stripe client if window.Stripe is loaded
    let stripe = null;
    let stripeElements = null;
    let stripeCardElement = null;

    if (typeof window.Stripe === 'function') {
        try {
            stripe = window.Stripe('pk_test_51U1RkJLqYzmscXLuhSGcKl7bJCulQQNEpW3liLdvEV9QFhlEhrHOZHZnN3puoJdxmy1ubusRttj5F9Z0i7gKYO6b00s7BHyn6G');
            stripeElements = stripe.elements();
            stripeCardElement = stripeElements.create('card', {
                style: {
                    base: {
                        fontSize: '15px',
                        color: '#32325d',
                        fontFamily: '"Outfit", sans-serif',
                        '::placeholder': { color: '#aab7c4' }
                    },
                    invalid: { color: '#fa755a', iconColor: '#fa755a' }
                }
            });
            console.log("💳 Real Stripe Elements client initialized.");
        } catch (e) {
            console.error("⚠️ Failed to initialize Stripe client:", e);
        }
    }

    // ==========================================================================
    // DÉTECTION DES PARAMÈTRES URL POUR OUVERTURE AUTOMATIQUE DES MODALS
    // (Permet la redirection cross-page : about.html?action=login → ouvre le modal)
    // ==========================================================================
    const urlParams = new URLSearchParams(window.location.search);
    const actionParam = urlParams.get('action');
    if (actionParam) {
        // Nettoyer l'URL sans recharger la page
        try {
            window.history.replaceState({}, '', window.location.pathname);
        } catch (err) {
            console.warn("replaceState bloqué en protocole local (file://) :", err);
        }
        // Déclencher l'ouverture après initialisation complète
        setTimeout(() => {
            if (actionParam === 'login') {
                const loginModal = document.getElementById('loginModal');
                if (loginModal) { loginModal.classList.add('active'); document.body.style.overflow = 'hidden'; }
            } else if (actionParam === 'signup') {
                const signupModal = document.getElementById('signupModal');
                if (signupModal) { signupModal.classList.add('active'); document.body.style.overflow = 'hidden'; }
            }
        }, 300);
    }

    // ==========================================================================
    // BASE DE DONNÉES DES MEMBRES LYANN (VISAGES ET TALENTS DES DOM)
    // ==========================================================================
    const LYANN_MEMBERS = [
        // GUADELOUPE (971)
        {
            id: 1,
            name: "David Jean-Baptiste",
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
            name: "Marie-Line Popotte",
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
            name: "Jean-Michel Télèphe",
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
            name: "Man Saint-Louis",
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
            name: "Élodie Rutil",
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
            name: "Clarisse Vatin",
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
            name: "Tati Rosalie Théophile",
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
            name: "Sarah Manicon",
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
            name: "Aurélie Bellerose",
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
            name: "Nicolas Bellerose",
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
            name: "Christophe Vatin",
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
            name: "Tati Huguette Cazeau",
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
            name: "Kevin Bellerose",
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
            name: "Corinne Narcisse",
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
            name: "Cédric Flavien",
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
            name: "Romain Payet",
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
            name: "Guillaume Saint-Martin",
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
                        <button class="btn btn-primary btn-sm contact-member-btn" data-member-id="${member.id}" data-member-name="${member.name}" data-member-avatar="${member.avatar}">
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
                            <button class="btn btn-primary btn-sm contact-member-btn" data-member-id="${member.id}" data-member-name="${member.name}" data-member-avatar="${member.avatar}">
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

        // Attach Contact Event -> Open Live Chat Direct
        document.querySelectorAll('.contact-member-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const memberName = btn.dataset.memberName || 'Lyanneur';
                const memberAvatar = btn.dataset.memberAvatar || 'david-34.png';
                openChatWithUser(memberName, memberAvatar);
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
            safeStorage.setItem('lyan_user_logged_in', 'true');
            updateHeaderAuthState();
            closeSignupModal();
            alert(`Félicitations ${userSignupData.firstName || ''} ! Votre compte LYANN est prêt. Vous êtes désormais connecté.`);
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
            safeStorage.setItem('lyan_user_logged_in', 'true');
            updateHeaderAuthState();
            alert('🟢 Authentification Google réussie ! Bienvenue sur votre espace LYANN.');
            openProfileDashboard('provider');
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            safeStorage.setItem('lyan_user_logged_in', 'true');
            updateHeaderAuthState();
            alert('🎉 Connexion réussie ! Bienvenue sur votre espace LYANN.');
            closeLoginModal();
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
            safeStorage.setItem('lyan_user_logged_in', 'false');
            updateHeaderAuthState();
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
    // MOTEUR EN DIRECT DU BOKANTAJ (POSTER UN LYANN & ÉCHOS DU QUARTIER)
    // ==========================================================================
    const INITIAL_FLASH_POSTS = [
        {
            id: 'flash-1',
            authorName: 'David Jean-Baptiste',
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
            authorName: 'Tati Huguette Cazeau',
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
            authorName: 'Élodie Rutil',
            authorRole: 'Voisine Recommandée',
            authorAvatar: 'sarah-29.png',
            badge: '⭐ Recommandation',
            type: 'reco',
            location: 'Le Moule • Guadeloupe (971)',
            territoryKey: 'guadeloupe',
            timeAgo: 'Il y a 2 h',
            content: 'Un immense merci à @Man_Saint-Louis pour les conseils de taille de mes fruitiers au Moule. Travail propre, conseils précieux et partage !',
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
            authorName: 'Kevin Bellerose',
            authorRole: 'Lyanneur PRO',
            authorAvatar: 'kevin-41.png',
            badge: '📢 Info Bokantaj',
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
            btn.addEventListener('click', () => {
                const countSpan = btn.querySelector('.like-count');
                if (countSpan) {
                    let count = parseInt(countSpan.textContent) || 0;
                    if (btn.classList.contains('liked')) {
                        btn.classList.remove('liked');
                        count--;
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
                alert('Veuillez écrire un message ou ajouter une photo/vidéo à votre Lyann.');
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
             alert('✨ Votre Lyann a été publié avec succès dans Bokantaj !');
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
    // LOGIQUE DE CHAT DIRECT INTERACTIF (#chatModal) AVEC DÉROULEMENT TRANSACTIONNEL
    // ==========================================================================
    const chatModal = document.getElementById('chatModal');
    const closeChatModalBtn = document.getElementById('closeChatModalBtn');
    const chatHeaderName = document.getElementById('chatHeaderName');
    const chatHeaderAvatar = document.getElementById('chatHeaderAvatar');
    const chatMessagesContainer = document.getElementById('chatMessagesContainer');
    const chatInputForm = document.getElementById('chatInputForm');
    const chatInputField = document.getElementById('chatInputField');

    // UI Buttons and Overlays
    const chatProposeBtn = document.getElementById('chatProposeBtn');
    const chatTrackingBtn = document.getElementById('chatTrackingBtn');
    const btnChatRoleClient = document.getElementById('btnChatRoleClient');
    const btnChatRoleProvider = document.getElementById('btnChatRoleProvider');

    const chatActionChoicesOverlay = document.getElementById('chatActionChoicesOverlay');
    const chatDirectPriceForm = document.getElementById('chatDirectPriceForm');
    const chatMilestoneDevisForm = document.getElementById('chatMilestoneDevisForm');
    const chatCheckoutOverlay = document.getElementById('chatCheckoutOverlay');
    const chatTrackingOverlay = document.getElementById('chatTrackingOverlay');
    const chatSubmitProofOverlay = document.getElementById('chatSubmitProofOverlay');

    // Overlay Inputs / Forms
    const directPriceForm = document.getElementById('directPriceForm');
    const dpDescription = document.getElementById('dpDescription');
    const dpAmount = document.getElementById('dpAmount');

    const milestoneDevisForm = document.getElementById('milestoneDevisForm');
    const mdTitle = document.getElementById('mdTitle');
    const mdTotalAmount = document.getElementById('mdTotalAmount');
    const mdJ1Title = document.getElementById('mdJ1Title');
    const mdJ1Percent = document.getElementById('mdJ1Percent');
    const mdJ2Title = document.getElementById('mdJ2Title');
    const mdJ2Percent = document.getElementById('mdJ2Percent');
    const mdJ3Title = document.getElementById('mdJ3Title');
    const mdJ3Percent = document.getElementById('mdJ3Percent');

    const checkoutPaymentForm = document.getElementById('checkoutPaymentForm');
    const coPrestationTitle = document.getElementById('coPrestationTitle');
    const coDevisAmount = document.getElementById('coDevisAmount');
    const coLyannFee = document.getElementById('coLyannFee');
    const coAssuranceCheck = document.getElementById('coAssuranceCheck');
    const coAssuranceFee = document.getElementById('coAssuranceFee');
    const coTotalAmount = document.getElementById('coTotalAmount');
    const btnCancelCheckout = document.getElementById('btnCancelCheckout');

    const trackingMilestonesList = document.getElementById('trackingMilestonesList');
    const btnExitTracking = document.getElementById('btnExitTracking');

    const submitProofForm = document.getElementById('submitProofForm');
    const proofMilestoneTitle = document.getElementById('proofMilestoneTitle');
    const proofComments = document.getElementById('proofComments');
    const proofPhotoSelect = document.getElementById('proofPhotoSelect');
    const btnCancelProof = document.getElementById('btnCancelProof');

    // Active state variables
    let currentRole = 'client'; // 'client' or 'provider'
    let activeContactName = 'David Jean-Baptiste';
    let activeContactAvatar = 'david-34.png';
    let activeDevisForCheckout = null;
    let activeMilestoneForProof = null;

    // Persisted mock chat conversations
    const CHAT_STORAGE_KEY = 'lyann_chat_conversations';
    
    function getConversations() {
        const data = safeStorage.getItem(CHAT_STORAGE_KEY);
        if (data) return JSON.parse(data);
        
        // Default history for David Jean-Baptiste
        const defaults = {
            "David Jean-Baptiste": [
                { senderRole: "provider", text: "Bonjour ! J'ai bien vu votre message pour l'intervention clim. Je peux passer cet après-midi vers 15h à Baie-Mahault.", type: "text", timestamp: "14:22" },
                { senderRole: "client", text: "Bonjour David ! Parfait pour 15h. Merci beaucoup pour votre réactivité !", type: "text", timestamp: "14:25" }
            ],
            "Tati Huguette Cazeau": [
                { senderRole: "client", text: "Bonjour ! Est-ce que vous seriez disponible ce week-end pour m'aider à nettoyer mon jardin ?", type: "text", timestamp: "Hier" },
                { senderRole: "provider", text: "Bonjour Huguette ! Oui tout à fait, je peux venir samedi matin avec mes outils.", type: "text", timestamp: "Hier" }
            ],
            "Sarah Manicon": [
                { senderRole: "provider", text: "Bonjour ! Je prépare le devis pour la rénovation de votre salle de bain comme convenu.", type: "text", timestamp: "Mardi" }
            ]
        };
        safeStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(defaults));
        return defaults;
    }

    function saveConversations(convs) {
        safeStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(convs));
    }

    function updateActionButtonsVisibility() {
        // Only provider can propose a deal
        if (currentRole === 'provider') {
            if (chatProposeBtn) chatProposeBtn.style.display = 'block';
        } else {
            if (chatProposeBtn) chatProposeBtn.style.display = 'none';
        }

        // Show tracking button if active transaction exists for this contact
        const transactions = window.LYANN_PAYMENTS ? window.LYANN_PAYMENTS.getTransactions() : [];
        const activeTx = transactions.find(t => 
            (t.providerName.includes(activeContactName) || t.customerName.includes(activeContactName)) && 
            (t.status === 'en_cours' || t.status === 'litige')
        );

        if (activeTx && chatTrackingBtn) {
            chatTrackingBtn.style.display = 'block';
            chatTrackingBtn.onclick = () => openTrackingOverlay(activeTx.id);
        } else if (chatTrackingBtn) {
            chatTrackingBtn.style.display = 'none';
        }
    }

    function renderActiveConversation() {
        if (!chatMessagesContainer) return;
        chatMessagesContainer.innerHTML = '';

        const convs = getConversations();
        const messages = convs[activeContactName] || [];

        messages.forEach((msg, idx) => {
            const isSent = (currentRole === 'client' && msg.senderRole === 'client') || 
                           (currentRole === 'provider' && msg.senderRole === 'provider');
            
            if (msg.type === 'devis') {
                const bubble = document.createElement('div');
                bubble.className = `devis-card-bubble ${isSent ? 'sent' : 'received'}`;
                
                let milestonesHTML = '';
                if (msg.devisData.milestones && msg.devisData.milestones.length > 0) {
                    milestonesHTML = `<ul class="devis-milestones-list">`;
                    msg.devisData.milestones.forEach(m => {
                        milestonesHTML += `
                            <li class="devis-milestone-item">
                                <span>📌 ${m.title}</span>
                                <strong>${m.percentage}% (${((msg.devisData.amount * m.percentage) / 100).toFixed(2)} €)</strong>
                            </li>
                        `;
                    });
                    milestonesHTML += `</ul>`;
                }

                let statusHTML = '';
                if (msg.devisData.status === 'pending') {
                    if (!isSent) {
                        statusHTML = `
                            <div class="devis-actions">
                                <button type="button" class="btn btn-outline btn-decline-devis" data-idx="${idx}" style="border-color: #E63B2E; color: #E63B2E; background: transparent;">Décliner</button>
                                <button type="button" class="btn btn-primary btn-accept-devis" data-idx="${idx}" style="background: #2E7D32; border-color: #2E7D32; color: white;">Accepter & Payer</button>
                            </div>
                        `;
                    } else {
                        statusHTML = `
                            <div style="font-size: 0.78rem; color: var(--text-muted); text-align: center; margin-top: 10px; font-style: italic;">
                                ⏳ En attente de décision du client...
                            </div>
                        `;
                    }
                } else if (msg.devisData.status === 'approved') {
                    statusHTML = `
                        <div style="background: #E8F5E9; color: #2E7D32; font-weight: 700; font-size: 0.8rem; text-align: center; padding: 6px; border-radius: var(--radius-sm); margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
                            <span>✅ Validé & Payé (Fonds séquestrés)</span>
                            <button type="button" class="btn btn-outline" onclick="window.openTrackingById('${msg.devisData.txId}')" style="font-size: 0.72rem; padding: 3px 8px; border-color: #2E7D32; color: #2E7D32; background: white;">Suivi 🛠️</button>
                        </div>
                    `;
                } else if (msg.devisData.status === 'declined') {
                    statusHTML = `
                        <div style="background: #FFEBEE; color: #C62828; font-weight: 700; font-size: 0.8rem; text-align: center; padding: 6px; border-radius: var(--radius-sm); margin-top: 10px;">
                            ❌ Proposition déclinée
                        </div>
                    `;
                }

                bubble.innerHTML = `
                    <div class="devis-header">
                        <span class="devis-title">📄 ${msg.devisData.title}</span>
                        <span class="devis-amount">${msg.devisData.amount.toFixed(2)} €</span>
                    </div>
                    <div style="font-size: 0.82rem; color: var(--text); margin-bottom: 8px;">${msg.devisData.description}</div>
                    ${milestonesHTML}
                    ${statusHTML}
                    <div class="chat-msg-time" style="margin-top: 6px; text-align: right;">${msg.timestamp}</div>
                `;
                chatMessagesContainer.appendChild(bubble);
            } else if (msg.type === 'review_prompt') {
                const bubble = document.createElement('div');
                bubble.className = 'devis-card-bubble received';
                bubble.style.cssText = "border: 2px solid #E5B345; background: #FFFDF5; margin: 12px 0; border-radius: var(--radius-lg); padding: 14px;";
                
                if (msg.reviewSubmitted) {
                    const starsStr = '★'.repeat(msg.reviewData.stars) + '☆'.repeat(5 - msg.reviewData.stars);
                    bubble.innerHTML = `
                        <div style="text-align: center;">
                            <div style="font-size: 1.8rem; margin-bottom: 2px;">🌟</div>
                            <strong style="color: var(--primary-dark); font-size: 0.95rem; display: block;">Avis publié avec succès !</strong>
                            <p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">Merci d'aider la communauté LYANN à grandir dans la confiance.</p>
                            <div style="margin-top: 6px; font-weight: 700; color: #E5B345; font-size: 1.1rem; letter-spacing: 2px;">
                                ${starsStr}
                            </div>
                            <div style="font-size: 0.8rem; font-style: italic; color: var(--text); margin-top: 6px; background: white; padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid #FFE5A3;">
                                "${msg.reviewData.comment}"
                            </div>
                        </div>
                    `;
                } else {
                    const reviewSubtext = (currentRole === 'provider')
                        ? "Laissez un avis pour votre lyanné afin d'aider au mieux les prochains lyanneurs."
                        : "Mettez un avis à votre lyanneur afin d'aider au mieux les prochains lyannés.";

                    bubble.innerHTML = `
                        <div class="review-prompt-card" style="text-align: center;">
                            <div style="font-size: 1.5rem; margin-bottom: 2px;">🎉</div>
                            <h4 style="font-weight: 800; font-size: 0.98rem; color: var(--primary-dark); margin: 0 0 4px 0;">Wouaw, quel lyann de qualité ! 🌟</h4>
                            <p style="font-size: 0.8rem; color: var(--text); margin-bottom: 12px; line-height: 1.4;">
                                ${reviewSubtext}
                            </p>
                            
                            <div class="star-rating-selector" data-idx="${idx}" style="display: flex; justify-content: center; gap: 8px; font-size: 1.8rem; color: #E5B345; cursor: pointer; margin-bottom: 10px;">
                                <span class="star-btn" data-star="1">★</span>
                                <span class="star-btn" data-star="2">★</span>
                                <span class="star-btn" data-star="3">★</span>
                                <span class="star-btn" data-star="4">★</span>
                                <span class="star-btn" data-star="5" style="color: #E5B345;">★</span>
                            </div>
                            
                            <textarea class="review-comment-input modal-input" data-idx="${idx}" placeholder="Rédigez votre commentaire (soin, ponctualité, amabilité...)" style="width: 100%; height: 60px; font-size: 0.8rem; resize: none; margin-bottom: 10px; box-sizing: border-box;"></textarea>

                            <button type="button" class="btn btn-primary btn-submit-review" data-idx="${idx}" style="width: 100%; justify-content: center; background: #E5B345; border-color: #E5B345; color: #1A1A1A; font-weight: 800; font-size: 0.85rem;">
                                Publier mon avis 🚀
                            </button>
                        </div>
                    `;
                }
                chatMessagesContainer.appendChild(bubble);
            } else if (msg.type === 'status') {
                const bubble = document.createElement('div');
                bubble.style.cssText = "align-self: center; background: #ECEFF1; color: #374151; font-size: 0.78rem; font-weight: 600; padding: 6px 14px; border-radius: 12px; margin: 8px 0; max-width: 90%; text-align: center; border: 1px solid #CFD8DC;";
                bubble.innerHTML = `📢 ${msg.text}`;
                chatMessagesContainer.appendChild(bubble);
            } else {
                // Text messages
                const bubble = document.createElement('div');
                bubble.className = `chat-msg-bubble ${isSent ? 'sent' : 'received'}`;
                bubble.innerHTML = `${msg.text} <div class="chat-msg-time">${msg.timestamp}</div>`;
                chatMessagesContainer.appendChild(bubble);
            }
        });

        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        updateActionButtonsVisibility();
        bindDevisBubbleButtons();
    }

    function openChatWithUser(name, avatar) {
        activeContactName = name;
        activeContactAvatar = avatar;

        if (chatHeaderName) chatHeaderName.textContent = name;
        if (chatHeaderAvatar) chatHeaderAvatar.src = avatar;

        // Reset sidebar active states
        document.querySelectorAll('.chat-contact-item').forEach(item => {
            const itemTitle = item.querySelector('.chat-contact-name');
            if (itemTitle && itemTitle.textContent === name) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Hide overlays
        closeAllOverlays();
        
        // Auto adapt simulation role to match logical test path
        if (name === "Tati Huguette Cazeau") {
            // We want to act as provider (Artisan) chatting with a client
            setSimulatedRole('provider');
        } else {
            // We chat as client with David or Sarah (Artisans)
            setSimulatedRole('client');
        }

        renderActiveConversation();

        // Set pre-written message in the input field when initiating chat as client
        if (currentRole === 'client' && chatInputField) {
            chatInputField.value = `Bonjour @${name}, vos services m'intéressent, êtes-vous disponible pour en discuter ?`;
        }

        if (chatModal) chatModal.classList.add('active');
    }

    function setSimulatedRole(role) {
        currentRole = role;
        if (role === 'client') {
            if (btnChatRoleClient) btnChatRoleClient.classList.add('active');
            if (btnChatRoleProvider) btnChatRoleProvider.classList.remove('active');
        } else {
            if (btnChatRoleClient) btnChatRoleClient.classList.remove('active');
            if (btnChatRoleProvider) btnChatRoleProvider.classList.add('active');
        }
        renderActiveConversation();
    }

    // Close Chat Modal click action
    if (closeChatModalBtn) {
        closeChatModalBtn.addEventListener('click', () => {
            if (chatModal) {
                chatModal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    // Role Simulator click actions
    if (btnChatRoleClient) {
        btnChatRoleClient.addEventListener('click', () => setSimulatedRole('client'));
    }
    if (btnChatRoleProvider) {
        btnChatRoleProvider.addEventListener('click', () => setSimulatedRole('provider'));
    }

    // Propose Quotation trigger
    if (chatProposeBtn) {
        chatProposeBtn.addEventListener('click', () => {
            closeAllOverlays();
            if (chatActionChoicesOverlay) chatActionChoicesOverlay.style.display = 'flex';
        });
    }

    // Handle choices
    const btnChooseDirectPrice = document.getElementById('btnChooseDirectPrice');
    const btnChooseMilestoneDevis = document.getElementById('btnChooseMilestoneDevis');
    
    if (btnChooseDirectPrice) {
        btnChooseDirectPrice.addEventListener('click', () => {
            closeAllOverlays();
            if (chatDirectPriceForm) chatDirectPriceForm.style.display = 'flex';
        });
    }

    if (btnChooseMilestoneDevis) {
        btnChooseMilestoneDevis.addEventListener('click', () => {
            closeAllOverlays();
            if (chatMilestoneDevisForm) chatMilestoneDevisForm.style.display = 'flex';
        });
    }

    // Close buttons on overlays
    document.querySelectorAll('.chat-overlay-pane .cancel-overlay-btn, .chat-overlay-pane .close-overlay-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            closeAllOverlays();
        });
    });

    function closeAllOverlays() {
        if (chatActionChoicesOverlay) chatActionChoicesOverlay.style.display = 'none';
        if (chatDirectPriceForm) chatDirectPriceForm.style.display = 'none';
        if (chatMilestoneDevisForm) chatMilestoneDevisForm.style.display = 'none';
        if (chatCheckoutOverlay) chatCheckoutOverlay.style.display = 'none';
        if (chatTrackingOverlay) chatTrackingOverlay.style.display = 'none';
        if (chatSubmitProofOverlay) chatSubmitProofOverlay.style.display = 'none';
    }

    // SUBMIT DIRECT PRICE
    if (directPriceForm) {
        directPriceForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const desc = dpDescription.value.trim();
            const val = parseFloat(dpAmount.value);

            if (!desc || isNaN(val)) return;

            const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const convs = getConversations();
            
            const newDevisMsg = {
                senderRole: "provider",
                text: desc,
                type: "devis",
                timestamp: timeNow,
                devisData: {
                    title: "Tarif Direct Rapide",
                    description: desc,
                    amount: val,
                    status: "pending",
                    milestones: [] // Direct price has no milestones
                }
            };

            if (!convs[activeContactName]) convs[activeContactName] = [];
            convs[activeContactName].push(newDevisMsg);
            saveConversations(convs);

            dpDescription.value = '';
            dpAmount.value = '';
            
            closeAllOverlays();
            renderActiveConversation();

            // Send notification
            if (window.LYANN_NOTIFICATIONS) {
                window.LYANN_NOTIFICATIONS.sendSMS(
                    '+590690001122',
                    activeContactName,
                    `LYANN: Le prestataire vous propose un Tarif Direct de ${val.toFixed(2)} € pour: "${desc}". Ouvrez Bokantaj pour valider.`
                );
            }
        });
    }

    // SUBMIT MILESTONE DEVIS
    if (milestoneDevisForm) {
        milestoneDevisForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const title = mdTitle.value.trim();
            const total = parseFloat(mdTotalAmount.value);

            const p1 = parseInt(mdJ1Percent.value) || 0;
            const p2 = parseInt(mdJ2Percent.value) || 0;
            const p3 = parseInt(mdJ3Percent.value) || 0;

            const t1 = mdJ1Title.value.trim() || 'Jalon 1';
            const t2 = mdJ2Title.value.trim() || 'Jalon 2';
            const t3 = mdJ3Title.value.trim() || 'Jalon 3';

            if (!title || isNaN(total)) return;

            if (p1 + p2 + p3 !== 100) {
                alert("⚠️ Erreur : La somme des pourcentages des jalons doit être exactement égale à 100%. (Actuellement : " + (p1+p2+p3) + "%)");
                return;
            }

            const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const convs = getConversations();

            const milestones = [
                { title: t1, percentage: p1 },
                { title: t2, percentage: p2 },
                { title: t3, percentage: p3 }
            ];

            const newDevisMsg = {
                senderRole: "provider",
                text: title,
                type: "devis",
                timestamp: timeNow,
                devisData: {
                    title: title,
                    description: "Chantier à jalons multiples avec libération de fonds progressive.",
                    amount: total,
                    status: "pending",
                    milestones: milestones
                }
            };

            if (!convs[activeContactName]) convs[activeContactName] = [];
            convs[activeContactName].push(newDevisMsg);
            saveConversations(convs);

            mdTitle.value = '';
            mdTotalAmount.value = '';
            mdJ1Title.value = '';
            mdJ1Percent.value = '';
            mdJ2Title.value = '';
            mdJ2Percent.value = '';
            mdJ3Title.value = '';
            mdJ3Percent.value = '';

            closeAllOverlays();
            renderActiveConversation();

            // Send notification
            if (window.LYANN_NOTIFICATIONS) {
                window.LYANN_NOTIFICATIONS.sendEmail(
                    'client@lyann-dom.com',
                    'Client Bokantaj',
                    `📄 Nouveau devis reçu pour "${title}"`,
                    `<p>Le prestataire vous propose un devis détaillé de <strong>${total.toFixed(2)} €</strong> réparti en ${milestones.length} jalons.</p>`
                );
            }
        });
    }

    // BIND DEVIS CARDS ACTIONS
    function bindDevisBubbleButtons() {
        document.querySelectorAll('.btn-accept-devis').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.dataset.idx);
                const convs = getConversations();
                const msg = convs[activeContactName][idx];
                
                if (msg && msg.type === 'devis') {
                    openCheckoutOverlay(msg, idx);
                }
            });
        });

        document.querySelectorAll('.btn-decline-devis').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.dataset.idx);
                const convs = getConversations();
                const msg = convs[activeContactName][idx];
                
                if (msg && msg.type === 'devis') {
                    msg.devisData.status = 'declined';
                    
                    // Add declination system log to history
                    convs[activeContactName].push({
                        senderRole: currentRole,
                        text: "Proposition déclinée par le client. Retour à la discussion.",
                        type: "status",
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    });

                    saveConversations(convs);
                    renderActiveConversation();

                    if (window.LYANN_NOTIFICATIONS) {
                        window.LYANN_NOTIFICATIONS.sendSMS(
                            '+590690001122',
                            activeContactName,
                            `LYANN: Le client a décliné votre offre de devis. Reprenez la discussion pour convenir d'un nouvel accord.`
                        );
                    }
                }
            });
        });

        // Bind review prompt star ratings & submission
        document.querySelectorAll('.star-rating-selector').forEach(starContainer => {
            const stars = starContainer.querySelectorAll('.star-btn');
            stars.forEach(star => {
                star.addEventListener('click', () => {
                    const rating = parseInt(star.getAttribute('data-star'));
                    starContainer.setAttribute('data-selected-rating', rating);
                    stars.forEach(s => {
                        const sVal = parseInt(s.getAttribute('data-star'));
                        s.style.color = sVal <= rating ? '#E5B345' : '#D1D5DB';
                    });
                });
            });
        });

        document.querySelectorAll('.btn-submit-review').forEach(btn => {
            btn.addEventListener('click', () => {
                const msgIdx = parseInt(btn.getAttribute('data-idx'));
                const container = btn.closest('.review-prompt-card');
                const starContainer = container ? container.querySelector('.star-rating-selector') : null;
                const commentInput = container ? container.querySelector('.review-comment-input') : null;

                const rating = parseInt(starContainer ? (starContainer.getAttribute('data-selected-rating') || '5') : '5');
                const comment = commentInput ? (commentInput.value.trim() || 'Prestation de très bonne qualité !') : 'Prestation de très bonne qualité !';

                // Update conversation message
                const convs = getConversations();
                if (convs[activeContactName] && convs[activeContactName][msgIdx]) {
                    convs[activeContactName][msgIdx].reviewSubmitted = true;
                    convs[activeContactName][msgIdx].reviewData = {
                        stars: rating,
                        comment: comment,
                        date: new Date().toLocaleDateString()
                    };

                    // Append status log
                    convs[activeContactName].push({
                        senderRole: "client",
                        text: `⭐ Avis de ${rating}/5 publié pour ${activeContactName} : "${comment}"`,
                        type: "status",
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    });

                    // Trigger notification SMS / Email log
                    if (window.LYANN_NOTIFICATIONS) {
                        window.LYANN_NOTIFICATIONS.sendSMS(
                            '+590690001122',
                            activeContactName,
                            `LYANN: Le client a laissé un avis ${rating}/5 étoile(s) pour votre intervention : "${comment}". Merci pour votre professionnalisme !`
                        );
                    }

                    saveConversations(convs);
                    renderActiveConversation();

                    if (typeof showNotificationToast === 'function') {
                        showNotificationToast('🌟 Merci ! Votre avis a été publié avec succès.');
                    }
                }
            });
        });
    }

    // OPEN SECURE CHECKOUT OVERLAY
    function openCheckoutOverlay(msg, index) {
        activeDevisForCheckout = { msg, index };

        if (coPrestationTitle) coPrestationTitle.textContent = msg.devisData.title;
        
        recalculateCheckoutFees();

        // Bind recalculation on check box toggle
        if (coAssuranceCheck) {
            coAssuranceCheck.onchange = () => recalculateCheckoutFees();
        }

        // Toggle layout between fake card fields and Stripe card fields
        const fakeCardFields = document.getElementById('fakeCardFields');
        const stripeCardFields = document.getElementById('stripeCardFields');
        if (stripe && stripeCardElement) {
            if (fakeCardFields) fakeCardFields.style.display = 'none';
            if (stripeCardFields) {
                stripeCardFields.style.display = 'block';
                // Mount elements to the div
                try {
                    stripeCardElement.mount('#stripeCardElement');
                } catch (e) {
                    console.log("Stripe Elements card already mounted or mounting ignored:", e);
                }
            }
        } else {
            if (fakeCardFields) fakeCardFields.style.display = 'block';
            if (stripeCardFields) stripeCardFields.style.display = 'none';
        }

        if (chatCheckoutOverlay) chatCheckoutOverlay.style.display = 'flex';
    }

    function recalculateCheckoutFees() {
        if (!activeDevisForCheckout) return;
        const baseAmount = activeDevisForCheckout.msg.devisData.amount;
        const serviceFee = baseAmount * 0.03; // 3% commission
        const wantsAssurance = coAssuranceCheck ? coAssuranceCheck.checked : true;
        const assuranceFee = wantsAssurance ? (baseAmount * 0.07) : 0.00; // 7% assurance
        const total = baseAmount + serviceFee + assuranceFee;

        if (coDevisAmount) coDevisAmount.textContent = baseAmount.toFixed(2) + " €";
        if (coLyannFee) coLyannFee.textContent = serviceFee.toFixed(2) + " €";
        if (coAssuranceFee) coAssuranceFee.textContent = assuranceFee.toFixed(2) + " €";
        if (coTotalAmount) coTotalAmount.textContent = total.toFixed(2) + " €";
    }

    if (btnCancelCheckout) {
        btnCancelCheckout.addEventListener('click', () => {
            if (chatCheckoutOverlay) chatCheckoutOverlay.style.display = 'none';
        });
    }

    // CHECKOUT FORM SUBMISSION
    if (checkoutPaymentForm) {
        checkoutPaymentForm.addEventListener('submit', (e) => {
            e.preventDefault();

            if (!activeDevisForCheckout || !window.LYANN_PAYMENTS) return;
            const { msg, index } = activeDevisForCheckout;

            // 1. Create Service request
            const txRequest = window.LYANN_PAYMENTS.createServiceRequest({
                title: msg.devisData.title,
                customerName: "Habitant Test (Client)",
                customerId: 105,
                providerName: activeContactName,
                providerId: 1, // David is mock provider ID 1
                description: msg.devisData.description
            });

            // 2. Submit quote data to mock DB
            const quoteData = {
                total: msg.devisData.amount,
                labour: msg.devisData.amount * 0.7,
                travel: 15,
                materials: msg.devisData.amount * 0.2,
                equipment: 15,
                milestones: msg.devisData.milestones || []
            };
            window.LYANN_PAYMENTS.submitQuotation(txRequest.id, quoteData);

            // 3. Approve and pay transaction
            const hasAssurance = coAssuranceCheck ? coAssuranceCheck.checked : true;
            let payMethodName = "Carte Bancaire (Simulée)";
            if (stripe && stripeCardElement) {
                payMethodName = "Stripe Elements Card";
                console.log("🔒 Verify transaction with Stripe Elements key pk_test_51U1R...");
                alert("🔒 Validation Stripe Elements réussie !\n\nNuméro de Carte de Test validé. Les fonds sont mis en séquestre sur votre clé Stripe Connect test.");
            }
            const updatedTx = window.LYANN_PAYMENTS.approveQuotationAndPay(txRequest.id, hasAssurance, { method: payMethodName });

            // 4. Update local chat database message status
            const convs = getConversations();
            convs[activeContactName][index].devisData.status = 'approved';
            convs[activeContactName][index].devisData.txId = updatedTx.id;

            // Append status log
            convs[activeContactName].push({
                senderRole: "client",
                text: `Paiement sécurisé de ${updatedTx.totalPaid.toFixed(2)} € validé. Les fonds sont en séquestre Stripe Connect. Début du chantier !`,
                type: "status",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            // If direct price (no milestones), invite review prompt directly
            if (!msg.devisData.milestones || msg.devisData.milestones.length === 0) {
                convs[activeContactName].push({
                    senderRole: "provider",
                    type: "review_prompt",
                    reviewSubmitted: false,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
            }

            saveConversations(convs);
            closeAllOverlays();
            renderActiveConversation();

            // Show Toast notification if toast helper exists
            if (typeof showNotificationToast === 'function') {
                showNotificationToast('💳 Paiement validé & fonds sécurisés !');
            }
        });
    }

    // OPEN SHARED PROGRESS TRACKING OVERLAY
    function openTrackingOverlay(txId) {
        if (!window.LYANN_PAYMENTS) return;
        
        const txs = window.LYANN_PAYMENTS.getTransactions();
        const tx = txs.find(t => t.id === txId);
        if (!tx) return;

        if (trackingMilestonesList) {
            trackingMilestonesList.innerHTML = '';
            
            if (tx.requiresMilestones && tx.milestones.length > 0) {
                tx.milestones.forEach(m => {
                    const card = document.createElement('div');
                    card.className = `tracking-milestone-card ${m.status}`;
                    
                    let statusLabel = '';
                    let actionButtonHTML = '';

                    if (m.status === 'approved') {
                        statusLabel = `<span style="color: #10B981; font-weight:700;"><i class="ph ph-check-circle"></i> Validé • Fonds libérés (${m.amount.toFixed(2)} €)</span>`;
                    } else if (m.status === 'submitted') {
                        statusLabel = `<span style="color: #F59E0B; font-weight:700;"><i class="ph ph-clock"></i> Jalon Terminé • En attente de validation client</span>`;
                        
                        let proofHTML = '';
                        if (m.photos && m.photos.length > 0) {
                            proofHTML = `
                                <div style="margin-top: 8px; border: 1px solid var(--border); border-radius: 6px; overflow:hidden;">
                                    <img src="${m.photos[0]}" alt="Preuve" style="width:100%; height:120px; object-fit:cover; display:block;">
                                </div>
                            `;
                        }

                        if (currentRole === 'client') {
                            actionButtonHTML = `
                                <div style="display:flex; gap:8px; margin-top:10px;">
                                    <button type="button" class="btn btn-outline" onclick="window.triggerDisputeMilestone('${tx.id}', ${m.id})" style="border-color: #E63B2E; color:#E63B2E; padding:5px 10px; font-size:0.75rem; background:transparent;">Signaler un problème</button>
                                    <button type="button" class="btn btn-primary" onclick="window.approveMilestoneById('${tx.id}', ${m.id})" style="background:#2E7D32; border-color:#2E7D32; padding:5px 10px; font-size:0.75rem; color:white;">Libérer les fonds</button>
                                </div>
                            `;
                        }
                        
                        statusLabel += `
                            <div style="font-size:0.8rem; background:#FFFBEB; padding:8px; border-radius:4px; margin-top:8px; border:1px solid #FDE68A;">
                                <strong>Commentaires artisan :</strong> "${m.completionComments || 'Aucun commentaire'}"
                                ${proofHTML}
                            </div>
                        `;
                    } else if (m.status === 'rejected') {
                        statusLabel = `<span style="color: #C62828; font-weight:700;"><i class="ph ph-warning"></i> Signalement • Modifications demandées</span>`;
                        if (m.rejectionComments) {
                            statusLabel += `<div style="font-size:0.8rem; background:#FFEBEE; color:#C62828; padding:8px; border-radius:4px; margin-top:6px;">Motif: "${m.rejectionComments}"</div>`;
                        }

                        if (currentRole === 'provider') {
                            actionButtonHTML = `<button type="button" class="btn btn-primary" onclick="window.openSubmitProofForm('${tx.id}', ${m.id}, '${m.title}')" style="margin-top:8px; padding:5px 10px; font-size:0.75rem; background:var(--primary); color:white; border:none;">Déclarer à nouveau terminé</button>`;
                        }
                    } else {
                        statusLabel = `<span style="color: #9CA3AF; font-weight:700;"><i class="ph ph-circle"></i> Travaux en cours par l'artisan</span>`;
                        
                        if (currentRole === 'provider') {
                            actionButtonHTML = `<button type="button" class="btn btn-primary" onclick="window.openSubmitProofForm('${tx.id}', ${m.id}, '${m.title}')" style="margin-top:8px; padding:5px 10px; font-size:0.75rem; background:var(--primary); color:white; border:none;">Déclarer terminé</button>`;
                        }
                    }

                    card.innerHTML = `
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong style="font-size:0.9rem;">${m.title}</strong>
                            <span style="font-size:0.85rem; font-weight:800; color:var(--primary);">${m.amount.toFixed(2)} € (${m.percentage}%)</span>
                        </div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">${m.description}</div>
                        <div style="margin-top:4px;">${statusLabel}</div>
                        ${actionButtonHTML}
                    `;
                    trackingMilestonesList.appendChild(card);
                });
            } else {
                // Single direct price tracking card
                const isPaid = tx.status === 'en_cours' || tx.status === 'termine';
                const card = document.createElement('div');
                card.className = `tracking-milestone-card ${tx.status === 'termine' ? 'approved' : 'pending'}`;
                
                let statusLabel = '';
                let actionButtonHTML = '';

                if (tx.status === 'termine') {
                    statusLabel = `<span style="color: #10B981; font-weight:700;"><i class="ph ph-check-circle"></i> Validé • Fonds transférés à l'artisan</span>`;
                } else if (tx.status === 'litige') {
                    statusLabel = `<span style="color: #C62828; font-weight:700;"><i class="ph ph-warning"></i> Litige Ouvert • Arbitrage en cours</span>`;
                } else {
                    statusLabel = `<span style="color: #F59E0B; font-weight:700;"><i class="ph ph-clock"></i> Travaux en cours</span>`;
                    
                    if (currentRole === 'client') {
                        actionButtonHTML = `
                            <div style="display:flex; gap:8px; margin-top:10px;">
                                <button type="button" class="btn btn-outline" onclick="window.triggerDisputeDirect('${tx.id}')" style="border-color: #E63B2E; color:#E63B2E; padding:5px 10px; font-size:0.75rem; background:transparent;">Signaler un litige</button>
                                <button type="button" class="btn btn-primary" onclick="window.releaseDirectFunds('${tx.id}')" style="background:#2E7D32; border-color:#2E7D32; padding:5px 10px; font-size:0.75rem; color:white;">Valider & Libérer le paiement</button>
                            </div>
                        `;
                    } else {
                        statusLabel = `<span style="color: #F59E0B; font-weight:700;"><i class="ph ph-clock"></i> Chantier en cours, en attente de la validation finale du client</span>`;
                    }
                }

                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong style="font-size:0.9rem;">Prestation Unique : ${tx.title}</strong>
                        <span style="font-size:0.85rem; font-weight:800; color:var(--primary);">${tx.amount.toFixed(2)} €</span>
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">${tx.requestDetails ? tx.requestDetails.description : ''}</div>
                    <div style="margin-top:6px;">${statusLabel}</div>
                    ${actionButtonHTML}
                `;
                trackingMilestonesList.appendChild(card);
            }
        }

        if (chatTrackingOverlay) chatTrackingOverlay.style.display = 'flex';
    }

    // Expose tracking launcher globally so devis cards or other parts can invoke it
    window.openTrackingById = function(txId) {
        openTrackingOverlay(txId);
    };

    if (btnExitTracking) {
        btnExitTracking.addEventListener('click', () => {
            if (chatTrackingOverlay) chatTrackingOverlay.style.display = 'none';
            renderActiveConversation();
        });
    }

    // SUBMIT PROOF OVERLAY POPULATOR
    window.openSubmitProofForm = function(txId, milestoneId, title) {
        activeMilestoneForProof = { txId, milestoneId };
        if (proofMilestoneTitle) proofMilestoneTitle.textContent = title;
        if (chatSubmitProofOverlay) chatSubmitProofOverlay.style.display = 'flex';
    };

    if (btnCancelProof) {
        btnCancelProof.addEventListener('click', () => {
            if (chatSubmitProofOverlay) chatSubmitProofOverlay.style.display = 'none';
        });
    }

    // SUBMIT PROOF LOGIC
    if (submitProofForm) {
        submitProofForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!activeMilestoneForProof || !window.LYANN_PAYMENTS) return;
            
            const { txId, milestoneId } = activeMilestoneForProof;
            const comments = proofComments.value.trim();
            const photo = proofPhotoSelect.value;

            if (!comments) return;

            // Submit completion details
            window.LYANN_PAYMENTS.submitMilestoneCompletion(txId, milestoneId, {
                comments: comments,
                photos: [photo]
            });

            // Get transaction object to write info inside conversation
            const txs = window.LYANN_PAYMENTS.getTransactions();
            const tx = txs.find(t => t.id === txId);
            const milestone = tx.milestones.find(m => m.id === milestoneId);

            const convs = getConversations();
            convs[activeContactName].push({
                senderRole: "provider",
                text: `Jalon "${milestone.title}" déclaré terminé par le prestataire. Commentaires : "${comments}". Preuve photo envoyée.`,
                type: "status",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            saveConversations(convs);

            // Clean inputs
            proofComments.value = '';

            closeAllOverlays();
            openTrackingOverlay(txId);
        });
    }

    // CLIENT APPROVAL FOR MILESTONES
    window.approveMilestoneById = function(txId, milestoneId) {
        if (!window.LYANN_PAYMENTS) return;
        
        const tx = window.LYANN_PAYMENTS.approveMilestone(txId, milestoneId);
        if (!tx) return;

        const milestone = tx.milestones.find(m => m.id === milestoneId);
        
        // Write status message in chat conversation logs
        const convs = getConversations();
        convs[activeContactName].push({
            senderRole: "client",
            text: `Jalon "${milestone.title}" validé par le client ! La somme de ${milestone.amount.toFixed(2)} € a été libérée et transférée sur le compte bancaire de l'artisan.`,
            type: "status",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

        // Check if all milestones are validated
        const allCompleted = tx.milestones.every(m => m.status === 'approved');
        if (allCompleted) {
            tx.status = 'termine';
            window.LYANN_PAYMENTS.saveTransactions(window.LYANN_PAYMENTS.getTransactions().map(t => t.id === txId ? tx : t));
            
            convs[activeContactName].push({
                senderRole: "client",
                text: `🏆 Chantier entièrement validé et terminé avec succès sur LYANN !`,
                type: "status",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            // System review prompt invitation
            convs[activeContactName].push({
                senderRole: "provider",
                type: "review_prompt",
                reviewSubmitted: false,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }

        saveConversations(convs);
        openTrackingOverlay(txId);
    };

    // CLIENT DISPUTE FOR MILESTONES
    window.triggerDisputeMilestone = function(txId, milestoneId) {
        if (!window.LYANN_PAYMENTS) return;
        
        const feedback = prompt("Veuillez saisir le motif du signalement / corrections demandées :");
        if (!feedback) return;

        window.LYANN_PAYMENTS.rejectMilestone(txId, milestoneId, feedback);

        // Notify dispute / reject
        const convs = getConversations();
        convs[activeContactName].push({
            senderRole: "client",
            text: `⚠️ Corrections demandées sur le jalon. Motif : "${feedback}"`,
            type: "status",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        saveConversations(convs);

        openTrackingOverlay(txId);
    };

    // DIRECT PRICE SYSTEM - CLIENT VALIDATION
    window.releaseDirectFunds = function(txId) {
        if (!window.LYANN_PAYMENTS) return;
        
        const txs = window.LYANN_PAYMENTS.getTransactions();
        const idx = txs.findIndex(t => t.id === txId);
        if (idx === -1) return;

        const tx = txs[idx];
        tx.status = 'termine';

        // Transfer funds to provider wallet
        const wallets = window.LYANN_PAYMENTS.getWallets();
        const wallet = wallets[tx.providerId];
        if (wallet) {
            wallet.pendingBalance = Math.max(0, wallet.pendingBalance - tx.amount);
            wallet.availableBalance += tx.amount;
            wallet.releasedPayments += tx.amount;
            wallet.completedPaymentsCount++;
        }

        window.LYANN_PAYMENTS.saveWallets(wallets);
        window.LYANN_PAYMENTS.saveTransactions(txs);

        const convs = getConversations();
        convs[activeContactName].push({
            senderRole: "client",
            text: `Validation finale effectuée ! La somme de ${tx.amount.toFixed(2)} € a été libérée et transférée sur le compte Stripe Connect de l'artisan.`,
            type: "status",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        saveConversations(convs);

        openTrackingOverlay(txId);
    };

    // DIRECT PRICE SYSTEM - DISPUTE
    window.triggerDisputeDirect = function(txId) {
        if (!window.LYANN_PAYMENTS) return;

        const reason = prompt("Pourquoi signalez-vous cette prestation ? (Litige)");
        if (!reason) return;

        window.LYANN_PAYMENTS.openDispute(txId, {
            reporter: 'client',
            reason: 'Litige Tarif Direct',
            description: reason
        });

        const convs = getConversations();
        convs[activeContactName].push({
            senderRole: "client",
            text: `⚠️ Litige déclaré sur la prestation. Motif : "${reason}". Le support LYANN intervient pour arbitrer.`,
            type: "status",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        saveConversations(convs);

        openTrackingOverlay(txId);
    };

    // STANDARD CHAT MESSAGE SEND
    if (chatInputForm) {
        chatInputForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = chatInputField ? chatInputField.value.trim() : '';
            if (!text) return;

            const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const convs = getConversations();

            const newMsg = {
                senderRole: currentRole, // client or provider
                text: text,
                type: "text",
                timestamp: timeNow
            };

            if (!convs[activeContactName]) convs[activeContactName] = [];
            convs[activeContactName].push(newMsg);
            saveConversations(convs);

            chatInputField.value = '';
            renderActiveConversation();

            // Simulated response from active neighbor after 1.5s (only if user acts as client)
            if (currentRole === 'client') {
                setTimeout(() => {
                    const activeName = activeContactName.split(' ')[0];
                    const replies = [
                        `C'est bien noté ! Je regarde mes disponibilités et je vous réponds précisément dans quelques instants. 👍`,
                        `Merci pour votre message ! Je peux me déplacer pour un premier constat gratuit si vous souhaitez.`,
                        `Super ! On s'organise ainsi. À très vite sur LYANN.`
                    ];
                    const randomReply = replies[Math.floor(Math.random() * replies.length)];

                    const botConvs = getConversations();
                    botConvs[activeContactName].push({
                        senderRole: "provider",
                        text: randomReply,
                        type: "text",
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    });
                    saveConversations(botConvs);
                    renderActiveConversation();
                }, 1500);
            }
        });
    }

    // Connect trigger buttons to open chat direct
    document.querySelectorAll('.open-chat-trigger, .btn-open-chat').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const name = btn.dataset.memberName || 'David Jean-Baptiste';
            const avatar = btn.dataset.memberAvatar || 'david-34.png';
            openChatWithUser(name, avatar);
        });
    });

    // Sidebar Contact clicks inside chat contacts list
    document.querySelectorAll('.chat-contact-item').forEach(item => {
        item.addEventListener('click', () => {
            const nameEl = item.querySelector('.chat-contact-name');
            const name = nameEl ? nameEl.textContent : 'David Jean-Baptiste';
            const avatarEl = item.querySelector('.chat-contact-avatar');
            const avatar = avatarEl ? avatarEl.getAttribute('src') : 'david-34.png';
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

    // Gestion des onglets Mon Compte
    accountTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-account-tab');
            accountTabBtns.forEach(b => b.classList.remove('active'));
            accountTabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetEl = document.getElementById(targetTab);
            if (targetEl) targetEl.classList.add('active');
        });
    });

    // Formulaire Sécurité
    const accountSecurityForm = document.getElementById('accountSecurityForm');
    if (accountSecurityForm) {
        accountSecurityForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('🔑 Votre mot de passe a été mis à jour avec succès !');
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
            alert('💾 Vos modifications de profil et préférences ont bien été enregistrées !');
        });
    }

    // Télécharger factures & Déconnexion
    const downloadInvoicesBtn = document.getElementById('downloadInvoicesBtn');
    if (downloadInvoicesBtn) {
        downloadInvoicesBtn.addEventListener('click', () => {
            alert('📄 Votre dernier relevé de facturation (PDF) a été généré et téléchargé.');
        });
    }

    function updateHeaderAuthState() {
        const isLoggedIn = safeStorage.getItem('lyan_user_logged_in') === 'true';
        if (isLoggedIn) {
            document.body.classList.add('user-is-logged-in');
        } else {
            document.body.classList.remove('user-is-logged-in');
        }
    }

    const accountLogoutBtn = document.getElementById('accountLogoutBtn');
    if (accountLogoutBtn) {
        accountLogoutBtn.addEventListener('click', () => {
            if (confirm('Êtes-vous sûr de vouloir vous déconnecter de votre espace LYANN ?')) {
                safeStorage.setItem('lyan_user_logged_in', 'false');
                updateHeaderAuthState();
                if (userAccountModal) userAccountModal.classList.remove('active');
                document.body.style.overflow = '';
                alert('🚪 Vous êtes désormais déconnecté. Les boutons Connexion & S\'inscrire sont de nouveau affichés.');
            }
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
            if (confirm('Approuver cette publication IA et la diffuser immédiatement sur Bokantaj public ?')) {
                if (window.LYANN_AI_ECOSYSTEM) {
                    window.LYANN_AI_ECOSYSTEM.approvePendingPost(postId);
                }
                const item = btn.closest('.web-ai-pending-item');
                if (item) item.remove();
                alert('✅ Publication IA approuvée et diffusée en direct sur Bokantaj !');
            }
        });
    });

    document.querySelectorAll('.btn-reject-ai').forEach(btn => {
        btn.addEventListener('click', () => {
            const postId = btn.getAttribute('data-post-id');
            if (confirm('Rejeter et supprimer cette proposition de contenu IA ?')) {
                if (window.LYANN_AI_ECOSYSTEM) {
                    window.LYANN_AI_ECOSYSTEM.rejectPendingPost(postId);
                }
                const item = btn.closest('.web-ai-pending-item');
                if (item) item.remove();
                alert('🚫 Proposition IA rejetée.');
            }
        });
    });

    document.querySelectorAll('.btn-toggle-agent').forEach(btn => {
        btn.addEventListener('click', () => {
            const agentId = btn.getAttribute('data-agent-id');
            if (window.LYANN_AI_ECOSYSTEM) {
                const newStatus = window.LYANN_AI_ECOSYSTEM.toggleAgentStatus(agentId);
                if (newStatus === 'PAUSED') {
                    btn.textContent = 'Reprendre ▶️';
                    alert(`⏸️ Agent IA mis en pause avec succès.`);
                } else {
                    btn.textContent = 'Pause ⏸️';
                    alert(`▶️ Agent IA réactivé.`);
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
            
            <div class="nav-notif-dropdown" id="navNotifDropdown" style="display: none; position: absolute; top: 50px; right: 0; width: 320px; background: white; border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: 0 10px 30px rgba(0,0,0,0.15); z-index: 1000; overflow: hidden; padding: 12px 0;">
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
    updateStepUI();
});
