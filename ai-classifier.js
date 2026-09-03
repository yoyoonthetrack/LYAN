/**
 * LYANN DOM - AI CLASSIFIER (Edge Function Simulation)
 * En production, ce code est exécuté côté serveur (ex: Supabase Edge Function) 
 * pour ne pas exposer la clé API.
 */

// À remplir via variable d'environnement ou Edge Function Supabase
window.LYANN_AI_CONFIG = {
    GEMINI_API_KEY: ""
};

class LyanAIClassifier {
    constructor() {
        this.taxonomy = null;
    }

    async loadTaxonomy() {
        if (!this.taxonomy) {
            try {
                // Try fetching taxonomy.json
                const res = await fetch('api/taxonomy.json');
                if (res.ok) {
                    this.taxonomy = await res.json();
                } else {
                    this.taxonomy = this.getHardcodedTaxonomy();
                }
            } catch (e) {
                this.taxonomy = this.getHardcodedTaxonomy();
            }
        }
        return this.taxonomy;
    }

    // Structure de secours si le fichier n'est pas accessible
    getHardcodedTaxonomy() {
        return {
          "domains": [
            {
              "slug": "maison-travaux", "name": "Maison & Travaux",
              "categories": [
                { "slug": "plomberie", "name": "Plomberie", "subcategories": [{ "slug": "fuite", "name": "Réparation de fuite", "questions": ["Est-ce que l'eau coule en continu ?"] }] },
                { "slug": "electricite", "name": "Électricité", "subcategories": [{ "slug": "panne", "name": "Recherche de panne", "questions": ["La panne concerne-t-elle toute la maison ?"] }] }
              ]
            },
            {
              "slug": "transport", "name": "Transport & Déménagement",
              "categories": [
                { "slug": "transport-objet", "name": "Transport d'objet", "subcategories": [{ "slug": "volumineux", "name": "Objet encombrant", "questions": ["Faut-il porter l'objet dans des escaliers ?"] }] }
              ]
            },
            {
              "slug": "aide-accompagnement", "name": "Aide & Accompagnement",
              "categories": [
                { "slug": "courses", "name": "Courses & Livraison", "subcategories": [{ "slug": "accompagnement-courses", "name": "Accompagnement pour courses", "questions": ["La personne a-t-elle des difficultés de mobilité ?"] }] }
              ]
            },
            {
              "slug": "informatique", "name": "Informatique & Numérique",
              "categories": [
                { "slug": "ordinateur", "name": "Ordinateur", "subcategories": [{ "slug": "depannage-panne", "name": "Dépannage / Panne matérielle", "questions": ["Quel est le modèle exact ?"] }] }
              ]
            }
          ]
        };
    }

    async classifyNeed(description) {
        console.log("[AI] Analyse de la demande :", description);
        const taxonomy = await this.loadTaxonomy();

        if (window.LYANN_AI_CONFIG.GEMINI_API_KEY) {
            try {
                return await this.callGeminiAPI(description, taxonomy);
            } catch (err) {
                console.warn("[AI] Échec de l'API Gemini, utilisation du Fallback local.", err);
                return this.localFallbackClassification(description, taxonomy);
            }
        } else {
            console.log("[AI] Aucune clé Gemini trouvée. Utilisation du Fallback local intelligent.");
            // Simulation d'un délai réseau pour le réalisme
            await new Promise(r => setTimeout(r, 1500));
            return this.localFallbackClassification(description, taxonomy);
        }
    }

    async callGeminiAPI(description, taxonomy) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${window.LYANN_AI_CONFIG.GEMINI_API_KEY}`;
        
        const systemPrompt = `Tu es l'IA de classification pour LYANN, une plateforme de services.
Ta mission est de classer la demande suivante en respectant STRICTEMENT la taxonomie fournie.
Si la demande est ambiguë, indique needs_clarification: true et pose une question courte dans clarification_question.
Taxonomie valide : ${JSON.stringify(taxonomy)}
Tu DOIS retourner un JSON valide avec cette structure exacte : 
{
  "domain_slug": "slug_ou_null",
  "category_slug": "slug_ou_null",
  "subcategory_slug": "slug_ou_null",
  "title": "titre_court_genere",
  "confidence": 0.0_a_1.0,
  "needs_clarification": boolean,
  "clarification_question": "question_ou_null"
}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Demande de l'utilisateur : "${description}"` }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        if (!response.ok) throw new Error("Erreur réseau Gemini");
        const data = await response.json();
        const jsonStr = data.candidates[0].content.parts[0].text;
        const result = JSON.parse(jsonStr);

        // Validation against taxonomy
        if (!this.isValidSlug(taxonomy, result.domain_slug, result.category_slug, result.subcategory_slug) && result.confidence > 0.5) {
            throw new Error("Invalid slugs returned by LLM");
        }
        return result;
    }

    isValidSlug(taxonomy, d, c, s) {
        if (!d) return false;
        const domain = taxonomy.domains.find(dom => dom.slug === d);
        if (!domain) return false;
        if (!c) return true;
        const cat = domain.categories.find(cat => cat.slug === c);
        if (!cat) return false;
        if (!s) return true;
        return cat.subcategories.some(sub => sub.slug === s);
    }

    localFallbackClassification(desc, taxonomy) {
        const text = desc.toLowerCase().trim();
        
        // Only require clarification if input is empty or under 4 chars
        if (text.length < 4) {
            return {
                domain_slug: null, category_slug: null, subcategory_slug: null, title: null,
                confidence: 0.2, needs_clarification: true, clarification_question: "Veuillez donner plus de détails sur votre besoin."
            };
        }

        // Comprehensive Intent & Keyword Matching Dictionary
        if (text.includes("fuite") || text.includes("eau") || text.includes("tuyau") || text.includes("robinet") || text.includes("évier") || text.includes("plombier") || text.includes("plomberie") || text.includes("wc") || text.includes("chasse")) {
            return { domain_slug: "maison-travaux", category_slug: "plomberie", subcategory_slug: "fuite", title: "Problème de plomberie", confidence: 0.92, needs_clarification: false, clarification_question: null };
        }
        if (text.includes("prise") || text.includes("courant") || text.includes("électr") || text.includes("lumière") || text.includes("disjoncteur") || text.includes("ampoule")) {
            return { domain_slug: "maison-travaux", category_slug: "electricite", subcategory_slug: "panne", title: "Intervention électrique", confidence: 0.90, needs_clarification: false, clarification_question: null };
        }
        if (text.includes("peint") || text.includes("mur") || text.includes("bricol") || text.includes("meuble") || text.includes("monter") || text.includes("montage") || text.includes("fixer") || text.includes("porte") || text.includes("serrur") || text.includes("maçon")) {
            return { domain_slug: "maison-travaux", category_slug: "bricolage", subcategory_slug: "travaux-divers", title: "Travaux & Bricolage", confidence: 0.88, needs_clarification: false, clarification_question: null };
        }
        if (text.includes("jardin") || text.includes("pelouse") || text.includes("tondre") || text.includes("haie") || text.includes("arbre") || text.includes("débroussaill")) {
            return { domain_slug: "maison-travaux", category_slug: "jardinage", subcategory_slug: "entretien-jardin", title: "Entretien du jardin", confidence: 0.90, needs_clarification: false, clarification_question: null };
        }
        if (text.includes("ménage") || text.includes("nettoy") || text.includes("laver") || text.includes("repassage") || text.includes("sol") || text.includes("vitre")) {
            return { domain_slug: "maison-travaux", category_slug: "menage", subcategory_slug: "nettoyage-domicile", title: "Ménage & Nettoyage", confidence: 0.90, needs_clarification: false, clarification_question: null };
        }
        if (text.includes("déménag") || text.includes("transport") || text.includes("camion") || text.includes("canapé") || text.includes("colis") || text.includes("livra")) {
            return { domain_slug: "transport", category_slug: "transport-objet", subcategory_slug: "volumineux", title: "Transport & Déménagement", confidence: 0.92, needs_clarification: false, clarification_question: null };
        }
        if (text.includes("enfant") || text.includes("baby") || text.includes("garde") || text.includes("nounou") || text.includes("devoir") || text.includes("cours")) {
            return { domain_slug: "aide-accompagnement", category_slug: "garde-enfants", subcategory_slug: "baby-sitting", title: "Garde & Accompagnement", confidence: 0.90, needs_clarification: false, clarification_question: null };
        }
        if (text.includes("courses") || text.includes("âgée") || text.includes("senior") || text.includes("aide") || text.includes("accompagnement")) {
            return { domain_slug: "aide-accompagnement", category_slug: "courses", subcategory_slug: "accompagnement-courses", title: "Aide & Accompagnement", confidence: 0.88, needs_clarification: false, clarification_question: null };
        }
        if (text.includes("ordinateur") || text.includes("pc") || text.includes("mac") || text.includes("téléphone") || text.includes("wifi") || text.includes("internet") || text.includes("imprimante")) {
            return { domain_slug: "informatique", category_slug: "ordinateur", subcategory_slug: "depannage-panne", title: "Dépannage Informatique", confidence: 0.90, needs_clarification: false, clarification_question: null };
        }

        // Generic fallback title generation: Use user's input as title!
        let generatedTitle = desc.length > 40 ? desc.substring(0, 37) + '...' : desc;
        generatedTitle = generatedTitle.charAt(0).toUpperCase() + generatedTitle.slice(1);

        return {
            domain_slug: "maison-travaux",
            category_slug: "bricolage",
            subcategory_slug: "travaux-divers",
            title: generatedTitle,
            confidence: 0.85,
            needs_clarification: false,
            clarification_question: null
        };
    }
}

window.LyanAI = new LyanAIClassifier();
