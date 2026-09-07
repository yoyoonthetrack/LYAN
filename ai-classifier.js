/**
 * LYANN DOM - UNIVERSAL NEED CLASSIFIER & TAXONOMY ENGINE
 * Single table public.lyann_taxonomy integration + Fuzzy Synonym Matcher
 * Non-blocking, Free Text First paradigm.
 */

const STOPWORDS_SET = new Set(['le','la','les','l','un','une','des','du','de','d','au','aux','en','pour','avec','dans','sur','par','ce','cet','cette','ces','mon','ton','son','ma','ta','sa','mes','tes','ses','nos','vos','leurs','je','tu','il','elle','nous','vous','ils','elles','qui','que','quoi','dont','ou','et','ne','pas','car','sur','aux']);

class LyanAIClassifier {
    constructor() {
        this.cachedTaxonomy = null;
        this.baselineTaxonomy = [
            { id: null, universe: "Maison & Travaux", category: "Bricolage", subcategory: "Montage meuble", synonyms: ["armoire", "lit", "étagère", "étagere", "vis", "montage", "meuble", "monter", "démonter", "demonter", "armoires", "lits", "ikea"], tags: ["#BRICOLAGE", "#MEUBLE", "#MONTAGE"], safety_level: "NORMAL" },
            { id: null, universe: "Maison & Travaux", category: "Plomberie", subcategory: "Fuite & Dépannage", synonyms: ["robinet", "tuyau", "évier", "evier", "fuite d eau", "fuite", "chasse d eau", "plombier", "sanitaire", "wc", "cumulus", "chauffe-eau", "fuites"], tags: ["#PLOMBERIE", "#FUITE", "#DEPANNAGE"], safety_level: "NORMAL" },
            { id: null, universe: "Maison & Travaux", category: "Électricité", subcategory: "Panne & Dépannage", synonyms: ["prise", "interrupteur", "disjoncteur", "lumière", "lumiere", "électricien", "electricien", "ampoule", "tableau électrique", "prise électrique", "electrique"], tags: ["#ELECTRICITE", "#PANNE"], safety_level: "PRO_REQUIRED" },
            { id: null, universe: "Jardin & Extérieur", category: "Entretien Jardin", subcategory: "Débroussaillage", synonyms: ["herbe", "pelouse", "tonte", "tondre", "débroussailleuse", "debroussailleuse", "débroussailler", "debroussailler", "jardinier", "haie", "arbre", "elagage", "élagage", "tailler", "manguier", "taille haie"], tags: ["#JARDIN", "#DEBROUSSAILLAGE", "#TONTE"], safety_level: "NORMAL" },
            { id: null, universe: "Auto & Mobilité", category: "Mécanique Automobile", subcategory: "Diagnostic & Démarrage", synonyms: ["voiture", "auto", "bagnole", "batterie", "démarrage", "demarrage", "démarre", "demarre", "panne", "moteur", "mécano", "mecano", "mécanicien", "freins", "freinage", "vidange", "roue", "pneu", "voitures"], tags: ["#AUTO", "#MECANIQUE", "#DIAGNOSTIC", "#BATTERIE"], safety_level: "NORMAL" },
            { id: null, universe: "Auto & Mobilité", category: "Mécanique & Entretien Deux-Roues", subcategory: "Réparation & Entretien Deux-Roues", synonyms: ["scooter", "scooters", "moto", "motos", "deux-roues", "deux roues", "mobylette", "cyclomoteur", "réparation scooter", "reparation scooter", "mécanique moto", "mecanique moto", "entretien scooter", "entretien moto"], tags: ["#SCOOTER", "#MOTO", "#DEUX_ROUES", "#MECANIQUE"], safety_level: "NORMAL" },
            { id: null, universe: "Transport & Livraison", category: "Covoiturage", subcategory: "Trajet local", synonyms: ["covoit", "covoiturage", "emmener", "déposer", "deposer", "trajet", "transport personne", "conduire", "amener"], tags: ["#TRANSPORT", "#COVOITURAGE", "#TRAJET"], safety_level: "NORMAL" },
            { id: null, universe: "Transport & Livraison", category: "Livraison & Manutention", subcategory: "Transport de meuble", synonyms: ["utilitaire", "camionette", "camion", "récupérer", "recuperer", "canapé", "canape", "transport meuble", "transporter", "encombrant", "déménagement", "demenagement"], tags: ["#LIVRAISON", "#MANUTENTION", "#TRANSPORT"], safety_level: "NORMAL" },
            { id: null, universe: "Informatique & Numérique", category: "Dépannage Informatique", subcategory: "Réseau & Wi-Fi", synonyms: ["ordinateur", "pc", "mac", "wifi", "wi-fi", "internet", "connexion", "connecter", "informaticien", "imprimante", "bureau", "windows"], tags: ["#INFORMATIQUE", "#WIFI", "#DEPANNAGE"], safety_level: "NORMAL" },
            { id: null, universe: "Cours & Apprentissage", category: "Soutien Scolaire", subcategory: "Aide aux devoirs", synonyms: ["prof", "maths", "français", "francais", "école", "ecole", "devoirs", "tutorat", "scolaire", "anglais", "soutien scolaire"], tags: ["#COURS", "#SOUTIEN", "#ECOLE"], safety_level: "NORMAL" },
            { id: null, universe: "Musique", category: "Cours de Musique", subcategory: "Instruments & Solfège", synonyms: ["piano", "guitare", "batterie", "prof de batterie", "leçon batterie", "batteur", "sax", "saxophone", "musique", "instrument", "cours de piano", "cours de guitare"], tags: ["#MUSIQUE", "#BATTERIE", "#COURS"], safety_level: "NORMAL" },
            { id: null, universe: "Art & Création", category: "Poterie & Céramique", subcategory: "Initiation & Cours", synonyms: ["poterie", "céramique", "ceramique", "tour de potier", "argile", "modelage", "sculpture", "cours de poterie"], tags: ["#ART", "#POTERIE", "#CERAMIQUE"], safety_level: "NORMAL" },
            { id: null, universe: "Sport & Activités", category: "Sport & Coaching", subcategory: "Tennis", synonyms: ["tennis", "jouer au tennis", "partenaire tennis", "coach tennis", "raquette", "basket", "football", "sport"], tags: ["#SPORT", "#TENNIS"], safety_level: "NORMAL" },
            { id: null, universe: "Animaux", category: "Garde d animaux", subcategory: "Pension & Babysitting chien", synonyms: ["garder chien", "dog sitting", "promenade chien", "animaux", "chien", "chat", "garde", "pension", "garder mon chien"], tags: ["#ANIMAUX", "#GARDE_CHIEN"], safety_level: "NORMAL" },
            { id: null, universe: "Beauté & Bien-être", category: "Coiffure & Esthétique", subcategory: "Tresses & Ongles", synonyms: ["coiffure", "tresses", "tresse", "coiffer", "tresser", "cheveux", "coiffeuse", "esthétique", "ongles", "manucure", "faire mes ongles"], tags: ["#BEAUTE", "#TRESSES", "#COIFFURE"], safety_level: "NORMAL" },
            { id: null, universe: "Événementiel", category: "Photographie", subcategory: "Événement & Portrait", synonyms: ["photographe", "photo", "photos", "shooting", "anniversaire", "mariage", "vidéo", "video"], tags: ["#PHOTO", "#EVENEMENT"], safety_level: "NORMAL" },
            { id: null, universe: "Administratif", category: "Aide Administrative", subcategory: "Déclaration & Papiers", synonyms: ["impôts", "impots", "CAF", "dossier", "déclaration", "declaration", "papier", "papiers", "courrier", "CV", "curriculum"], tags: ["#ADMINISTRATIF", "#PAPIERS", "#CV"], safety_level: "NORMAL" },
            { id: null, universe: "Aide du Quotidien", category: "Accompagnement", subcategory: "Courses & Présence", synonyms: ["aider senior", "courses", "accompagner", "compagnie", "repas", "aide personne"], tags: ["#AIDE", "#ACCOMPAGNEMENT"], safety_level: "NORMAL" },
            { id: null, universe: "Mode & Couture", category: "Couture", subcategory: "Retouche & Création", synonyms: ["couturière", "couturiere", "machine à coudre", "machine a coudre", "coudre", "retouche", "ourlet", "vêtement", "vetement"], tags: ["#COUTURE", "#RETOUCHE"], safety_level: "NORMAL" },
            { id: null, universe: "Cuisine & Alimentation", category: "Cuisine & Pâtisserie", subcategory: "Atelier Cuisine", synonyms: ["apprendre à cuisiner", "pain au levain", "cours de cuisine", "chef", "patisserie", "pâtisserie", "cuisine"], tags: ["#CUISINE", "#COOKING"], safety_level: "NORMAL" },
            { id: null, universe: "Nettoyage & Entretien", category: "Ménage", subcategory: "Nettoyage Domicile", synonyms: ["femme de ménage", "nettoyage", "repassage", "maison propre", "laver vitres"], tags: ["#MENAGE", "#ENTRETIEN"], safety_level: "NORMAL" }
        ];

        // Safety Regex Rules (Prohibited & Caution activities)
        this.safetyRules = [
            { pattern: /électricité haute tension|tableau électrique|compteur électricité|raccordement réseau/i, status: "PRO_REQUIRED" },
            { pattern: /gaz|bouteille gaz|installation gaz|chaudière gaz/i, status: "PRO_REQUIRED" },
            { pattern: /substances illégales|armes|produits dangereux interdits|drogue|stupéfiant/i, status: "PROHIBITED" }
        ];
    }

    // Normalize text string (strip accents, lowercase, punctuation)
    normalizeText(str) {
        if (!str) return "";
        return str
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    async fetchTaxonomyFromDB() {
        if (this.cachedTaxonomy) return this.cachedTaxonomy;

        if (typeof window !== 'undefined' && window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase) {
            try {
                const { data, error } = await window.LYANN_API_CLIENT.supabase
                    .from('lyann_taxonomy')
                    .select('*')
                    .eq('active', true);
                
                if (!error && data && data.length > 0) {
                    this.cachedTaxonomy = data;
                    return data;
                }
            } catch (err) {
                console.warn("[TaxonomyEngine] Could not fetch DB taxonomy, using robust baseline.", err);
            }
        }
        this.cachedTaxonomy = this.baselineTaxonomy;
        return this.cachedTaxonomy;
    }

    async classifyNeed(description) {
        console.log("[UniversalNeedEngine] Classification de la demande :", description);
        const rawText = (description || "").trim();
        const normText = this.normalizeText(rawText);

        // 1. Safety Rule Evaluation
        let evaluatedSafetyStatus = "SAFE";
        for (const rule of this.safetyRules) {
            if (rule.pattern.test(rawText)) {
                evaluatedSafetyStatus = rule.status;
                break;
            }
        }

        if (evaluatedSafetyStatus === "PROHIBITED") {
            return {
                taxonomy_id: null,
                universe: "Sécurité & Réglementation",
                category: "Interdit",
                subcategory: null,
                title: "Demande non conforme",
                confidence: 1.0,
                classification_status: "NEEDS_REVIEW",
                safety_status: "PROHIBITED",
                internal_tags: ["#PROHIBITED"],
                needs_clarification: false,
                clarification_question: "Cette demande ne respecte pas les conditions d'utilisation de LYANN."
            };
        }

        // 2. Fetch taxonomy dataset
        const taxonomyList = await this.fetchTaxonomyFromDB();

        // 3. Multi-signal matching (Strict exact phrase & exact token equality)
        let bestMatch = null;
        let bestScore = 0;

        const words = normText.split(/\s+/).filter(w => w.length >= 3 && !STOPWORDS_SET.has(w));

        for (const item of taxonomyList) {
            let score = 0;
            const normCategory = this.normalizeText(item.category);
            const normSubcategory = this.normalizeText(item.subcategory);
            const normUniverse = this.normalizeText(item.universe);
            const normSynonyms = (item.synonyms || []).map(s => this.normalizeText(s));

            // Check multi-word phrase inclusion in synonyms
            for (const syn of normSynonyms) {
                if (syn && syn.includes(' ') && normText.includes(syn)) {
                    score += 50;
                }
            }

            // Strict exact word token equality check (NO substring matching on partial words like "mon" -> "montage" or "car" -> "carrelage")
            for (const w of words) {
                for (const syn of normSynonyms) {
                    const synWords = syn.split(/\s+/);
                    if (synWords.includes(w) || syn === w) {
                        score += 30;
                    }
                }
                if (normSubcategory.split(/\s+/).includes(w)) score += 20;
                if (normCategory.split(/\s+/).includes(w)) score += 25;
                if (normUniverse.split(/\s+/).includes(w)) score += 10;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = item;
            }
        }

        // Generate natural short title from user's free text
        let titleSnippet = rawText.length > 50 ? rawText.substring(0, 47) + "..." : rawText;
        if (titleSnippet) {
            titleSnippet = titleSnippet.charAt(0).toUpperCase() + titleSnippet.slice(1);
        } else {
            titleSnippet = "Demande d'aide";
        }

        // 4. Threshold check: High match vs UNCLASSIFIED (Step 10 Rule)
        if (bestMatch && bestScore >= 25) {
            const calculatedConfidence = Math.min(0.95, 0.50 + (bestScore / 100));
            return {
                taxonomy_id: bestMatch.id || null,
                universe: bestMatch.universe,
                category: bestMatch.category,
                subcategory: bestMatch.subcategory,
                title: titleSnippet,
                confidence: calculatedConfidence,
                classification_status: "CLASSIFIED",
                safety_status: evaluatedSafetyStatus !== "SAFE" ? evaluatedSafetyStatus : (bestMatch.safety_level === "PRO_REQUIRED" ? "PRO_REQUIRED" : "SAFE"),
                internal_tags: bestMatch.tags || [`#${bestMatch.category.toUpperCase()}`],
                needs_clarification: false,
                clarification_question: null
            };
        }

        // 5. NON-BLOCKING UNCLASSIFIED FALLBACK (Step 10: Never force unknown requests into Plomberie/Bricolage)
        console.log('[STEP17] FALLBACK TO DEMANDE LIBRE', {
            reason: "Score under threshold (" + bestScore + " < 25)",
            stack: new Error().stack
        });

        return {
            taxonomy_id: null,
            universe: "Autres Besoins",
            category: "Général",
            subcategory: null,
            title: titleSnippet,
            confidence: 0.30,
            classification_status: "UNCLASSIFIED",
            safety_status: evaluatedSafetyStatus,
            internal_tags: ["#UNCLASSIFIED", "#DESCRIPTION_LIBRE"],
            needs_clarification: false,
            clarification_question: null
        };
    }
}

// Global instance initialization
if (typeof window !== 'undefined') {
    window.LyanAI = new LyanAIClassifier();
}
