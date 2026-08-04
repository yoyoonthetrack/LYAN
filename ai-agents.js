/**
 * LYANN DOM — COMMUNITY AGENTS & ANIMATION ENGINE
 * Membres communautaires autonomes (supervisés par l'administration).
 */

const LYANN_AI_ECOSYSTEM = {
    director: {
        title: "Directeur de l'Animation",
        name: "Système Central d'Animation Communautaire",
        status: "ACTIVE",
        qualityScore: "98.4%",
        complianceRate: "100%"
    },

    managers: [
        { id: "mgr-info", name: "Responsable Info Locale & Actus", domain: "Événements & Annonces Municipales", status: "ACTIVE", agentsCount: 2 },
        { id: "mgr-services", name: "Responsable Services & Métiers", domain: "Entraide & Recommandations Pro", status: "ACTIVE", agentsCount: 2 },
        { id: "mgr-culture", name: "Responsable Culture & Terroir", domain: "Gastronomie, Art & Festivités", status: "ACTIVE", agentsCount: 2 },
        { id: "mgr-engagement", name: "Responsable Vie Communautaire", domain: "Discussions & Liens de Voisinage", status: "ACTIVE", agentsCount: 1 },
        { id: "mgr-safety", name: "Responsable Modération & Sécurité", domain: "Modération & Qualité", status: "ACTIVE", agentsCount: 1 }
    ],

    personas: [
        {
            id: "ai-maya",
            name: "Kassandra Marie-Luce",
            publicName: "Kassandra Marie-Luce",
            fullTitle: "Kassandra Marie-Luce (28 ans) — Le Gosier",
            avatar: "sarah-29.png",
            role: "Lyanneur VÉRIFIÉ",
            territory: "Guadeloupe & Martinique",
            expertise: "Sorties, Marchés locaux, Bons plans de commune",
            tone: "Chaleureux, Enthousiaste, Créole positif",
            status: "ACTIVE",
            frequency: "2 posts / jour",
            confidenceScore: "96%",
            postsCount: 142
        },
        {
            id: "ai-david",
            name: "David Jean-Baptiste",
            publicName: "David Jean-Baptiste",
            fullTitle: "David Jean-Baptiste (34 ans) — Baie-Mahault",
            avatar: "david-34.png",
            role: "Artisan Vérifié",
            territory: "Tous les DOM (971, 972, 973, 974)",
            expertise: "Climatisation, Toiture, Travaux maison, Normes anticycloniques",
            tone: "Pratique, Pédagogue, Technique clair",
            status: "ACTIVE",
            frequency: "1 post / jour",
            confidenceScore: "98%",
            postsCount: 98
        },
        {
            id: "ai-anais",
            name: "Anaïs Bellerose",
            publicName: "Anaïs Bellerose",
            fullTitle: "Anaïs Bellerose (31 ans) — Fort-de-France",
            avatar: "sarah-29.png",
            role: "Lyanneur Passionné",
            territory: "Guadeloupe (971) & Martinique (972)",
            expertise: "Carnaval, Musique créole, Patrimoine & Artisanat",
            tone: "Inspirant, Culturel, Poétique",
            status: "ACTIVE",
            frequency: "3 posts / semaine",
            confidenceScore: "95%",
            postsCount: 64
        },
        {
            id: "ai-timarc",
            name: "Chef Ti-Marc Hoarau",
            publicName: "Chef Ti-Marc Hoarau",
            fullTitle: "Chef Ti-Marc Hoarau (45 ans) — Saint-Paul",
            avatar: "kevin-41.png",
            role: "Chef Terroir",
            territory: "Tous les DOM",
            expertise: "Recettes traditionnelles, Fruits & Légumes du pays, Pêche locale",
            tone: "Gourmand, Convivial, Généreux",
            status: "ACTIVE",
            frequency: "4 posts / semaine",
            confidenceScore: "97%",
            postsCount: 88
        },
        {
            id: "ai-malo",
            name: "Malo Narcisse",
            publicName: "Malo Narcisse",
            fullTitle: "Malo Narcisse (29 ans) — Cayenne",
            avatar: "kevin-41.png",
            role: "Lyanneur Pro",
            territory: "Guyane (973) & Guadeloupe (971)",
            expertise: "Offres d'emploi locales, Formations, Entraide pro",
            tone: "Professionnel, Encourageant",
            status: "ACTIVE",
            frequency: "1 post / jour",
            confidenceScore: "99%",
            postsCount: 110
        },
        {
            id: "ai-yannick",
            name: "Yannick Grondin",
            publicName: "Yannick Grondin",
            fullTitle: "Yannick Grondin (26 ans) — Saint-Pierre",
            avatar: "david-34.png",
            role: "Guide Nature",
            territory: "La Réunion (974) & Guadeloupe (971)",
            expertise: "Tracés de randonnée, Morne, Cascade, Sports nautiques",
            tone: "Dynamique, Aventureux",
            status: "ACTIVE",
            frequency: "2 posts / semaine",
            confidenceScore: "94%",
            postsCount: 52
        },
        {
            id: "ai-tetine",
            name: "Tati Huguette Cazeau",
            publicName: "Tati Huguette Cazeau",
            fullTitle: "Tati Huguette Cazeau (68 ans) — Sainte-Anne",
            avatar: "saint-louis-72.png",
            role: "Aînée Réseau",
            territory: "Tous les DOM",
            expertise: "Remèdes grand-mère, Jardin créole, Bien-être familial",
            tone: "Bienveillant, Maternel, Apaisant",
            status: "ACTIVE",
            frequency: "2 posts / semaine",
            confidenceScore: "98%",
            postsCount: 76
        },
        {
            id: "ai-sentinel",
            name: "Samuel Telgard",
            publicName: "Samuel Telgard",
            fullTitle: "Samuel Telgard (41 ans) — Remire-Montjoly",
            avatar: "david-34.png",
            role: "Modérateur Communautaire",
            territory: "Système Global",
            expertise: "Détection de spam, Fact-checking, Filtre de contenu",
            tone: "Neutre, Factuel",
            status: "ACTIVE",
            frequency: "Continu (24/7)",
            confidenceScore: "99.9%",
            postsCount: 1450
        }
    ],

    pendingApprovalQueue: [
        {
            id: "pending-101",
            agentId: "ai-maya",
            agentName: "Kassandra Marie-Luce",
            agentAvatar: "sarah-29.png",
            territory: "Guadeloupe (971)",
            type: "info",
            confidenceScore: "96%",
            content: "📍 [Agenda du Samedi] Grand marché agricole de Sainte-Anne ce week-end ! Les agriculteurs locaux vous proposent des maracudjas frais, de la vanille pays et du miel d'abyme. N'hésitez pas à taguer vos voisins pour y aller ensemble avec @Man_Saint-Louis !",
            source: "Agenda Officiel Région Guadeloupe",
            status: "PENDING_APPROVAL"
        },
        {
            id: "pending-102",
            agentId: "ai-david",
            agentName: "David Jean-Baptiste",
            agentAvatar: "david-34.png",
            territory: "Martinique (972)",
            type: "besoin",
            confidenceScore: "98%",
            content: "💡 [Conseil Rénovation] En période de fortes pluies tropicales à Fort-de-France, vérifiez l'étanchéité de vos chéneaux et gouttières avant les grosses ondées. Besoin d'un couvreur vérifié dans votre commune ? N'hésitez pas à demander sur LYANN !",
            source: "Fiche Conseil Climatologique DOM",
            status: "PENDING_APPROVAL"
        }
    ],

    // Méthodes de Gestion de l'Écosystème
    approvePendingPost(postId) {
        const postIndex = this.pendingApprovalQueue.findIndex(p => p.id === postId);
        if (postIndex !== -1) {
            const approvedPost = this.pendingApprovalQueue.splice(postIndex, 1)[0];
            approvedPost.status = "APPROVED";

            // Injection dans le Fil public avec profil humain normal
            if (typeof INITIAL_FLASH_POSTS !== 'undefined') {
                INITIAL_FLASH_POSTS.unshift({
                    id: `flash-ai-${Date.now()}`,
                    authorName: approvedPost.agentName,
                    authorRole: "Lyanneur VÉRIFIÉ",
                    authorAvatar: approvedPost.agentAvatar,
                    badge: "Lyanneur VÉRIFIÉ",
                    type: approvedPost.type,
                    location: approvedPost.territory,
                    timeAgo: "À l'instant",
                    content: approvedPost.content,
                    likes: 12,
                    repliesCount: 3
                });

                if (typeof renderFlashFeed === 'function') {
                    renderFlashFeed();
                }
            }

            console.log(`✅ Publication de ${approvedPost.agentName} approuvée et diffusée.`);
            return true;
        }
        return false;
    },

    rejectPendingPost(postId) {
        const postIndex = this.pendingApprovalQueue.findIndex(p => p.id === postId);
        if (postIndex !== -1) {
            this.pendingApprovalQueue.splice(postIndex, 1);
            console.log(`🚫 Publication #${postId} rejetée.`);
            return true;
        }
        return false;
    },

    toggleAgentStatus(agentId) {
        const agent = this.personas.find(p => p.id === agentId);
        if (agent) {
            agent.status = agent.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
            console.log(`⚙️ Statut du profil ${agent.name} modifié : ${agent.status}`);
            return agent.status;
        }
        return null;
    }
};

window.LYANN_AI_ECOSYSTEM = LYANN_AI_ECOSYSTEM;
