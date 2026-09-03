/**
 * LYANN — MOTEUR DE MISE EN RELATION INTELLIGENTE (MATCHING ENGINE V1)
 * Architecture Hybride: Taxonomie + Filtres Déterministes + Géolocalisation + Scoring Pondéré + Progressive Dispatch
 * 100% Neutre & Humain (Aucun mot "IA", "Algorithme" ou "Score 94%" exposé au public)
 */

(function (global) {
    'use strict';

    // --------------------------------------------------------------------------
    // 1. COORDONNÉES GÉOGRAPHIQUES DES TERRITOIRES ET COMMUNES (CARAÏBES & DOM-TOM)
    // --------------------------------------------------------------------------
    const LYANN_CITY_COORDINATES = {
        // GUADELOUPE (971)
        "sainte-anne": { lat: 16.2253, lon: -61.3854, name: "Sainte-Anne" },
        "le-gosier": { lat: 16.2086, lon: -61.4939, name: "Le Gosier" },
        "gosier": { lat: 16.2086, lon: -61.4939, name: "Le Gosier" },
        "pointe-a-pitre": { lat: 16.2411, lon: -61.5331, name: "Pointe-à-Pitre" },
        "les-abymes": { lat: 16.2706, lon: -61.5058, name: "Les Abymes" },
        "abymes": { lat: 16.2706, lon: -61.5058, name: "Les Abymes" },
        "baie-mahault": { lat: 16.2678, lon: -61.5872, name: "Baie-Mahault" },
        "le-moule": { lat: 16.3317, lon: -61.3475, name: "Le Moule" },
        "moule": { lat: 16.3317, lon: -61.3475, name: "Le Moule" },
        "petit-bourg": { lat: 16.1914, lon: -61.5906, name: "Petit-Bourg" },
        "basse-terre": { lat: 15.9984, lon: -61.7258, name: "Basse-Terre" },
        "saint-francois": { lat: 16.2526, lon: -61.2741, name: "Saint-François" },
        "capesterre-belle-eau": { lat: 16.0433, lon: -61.5658, name: "Capesterre-Belle-Eau" },

        // MARTINIQUE (972)
        "fort-de-france": { lat: 14.6161, lon: -61.0588, name: "Fort-de-France" },
        "le-lamentin": { lat: 14.6104, lon: -61.0022, name: "Le Lamentin" },
        "schoelcher": { lat: 14.6167, lon: -61.1000, name: "Schœlcher" },

        // GUYANE (973)
        "cayenne": { lat: 4.9372, lon: -52.3260, name: "Cayenne" },
        "kourou": { lat: 5.1597, lon: -52.6503, name: "Kourou" },

        // LA RÉUNION (974)
        "saint-denis": { lat: -20.8823, lon: 55.4504, name: "Saint-Denis" },
        "saint-pierre": { lat: -21.3393, lon: 55.4781, name: "Saint-Pierre" }
    };

    // --------------------------------------------------------------------------
    // 2. CONFIGURATION DES POIDS DU SCORING (SUM = 1.00 / 100%)
    // --------------------------------------------------------------------------
    const MATCHING_WEIGHTS = {
        serviceCompatibility: 0.35,    // 35% - Pertinence métier & compétence réelle
        distanceCompatibility: 0.25,   // 25% - Proximité kilométrique & rayon d'intervention
        availabilityCompatibility: 0.15,// 15% - Disponibilité temporelle
        reputationScore: 0.10,          // 10% - Note & volume d'avis (Bayésien)
        responseRate: 0.05,             // 5%  - Taux de réponse
        verifiedProStatus: 0.05,        // 5%  - Statut Vérifié / Pro
        explorationFairness: 0.05       // 5%  - Équité nouveaux Lyanneurs sans historique
    };

    // --------------------------------------------------------------------------
    // 3. TAXONOMIE SÉMANTIQUE OFFICIELLE & NORMALISATION DES TAGS INTERNES
    // --------------------------------------------------------------------------
    const TAXONOMY_MAP = {
        "plomberie": { domain: "maison-travaux", category: "plomberie", subcategory: "fuite", tags: ["plomberie", "fuite", "sanitaire", "robinetterie", "wc", "evier", "tuyauterie"] },
        "fuite": { domain: "maison-travaux", category: "plomberie", subcategory: "fuite", tags: ["fuite", "plomberie", "sanitaire", "robinet", "evier"] },
        "jardinage": { domain: "maison-travaux", category: "jardin", subcategory: "entretien-jardin", tags: ["jardinage", "jardin", "elagage", "tonte", "debroussaillage", "espaces-verts"] },
        "peinture": { domain: "maison-travaux", category: "peinture", subcategory: "renovation-peinture", tags: ["peinture", "renovation", "murs", "enduit", "rafraichissement"] },
        "bricolage": { domain: "maison-travaux", category: "bricolage", subcategory: "petit-bricolage", tags: ["bricolage", "montage", "fixation", "reparation", "outillage"] },
        "meuble": { domain: "maison-travaux", category: "bricolage", subcategory: "montage-meuble", tags: ["montage-meuble", "meuble", "ikea", "assemblage", "bricolage"] },
        "covoiturage": { domain: "transport-manutention", category: "transport", subcategory: "covoiturage", tags: ["covoiturage", "transport", "trajet", "vehicule"] },
        "transport": { domain: "transport-manutention", category: "demenagement-transport", subcategory: "transport-objet", tags: ["transport-objet", "demenagement", "utilitaire", "manutention", "vehicule"] },
        "canape": { domain: "transport-manutention", category: "demenagement-transport", subcategory: "transport-objet", tags: ["transport-objet", "utilitaire", "manutention", "meuble-lourd"], vehicle_required: true },
        "courses": { domain: "services-personne", category: "aide-accompagnement", subcategory: "courses", tags: ["courses", "aide-personne", "accompagnement", "livraison"] },
        "aide-personne": { domain: "services-personne", category: "aide-accompagnement", subcategory: "assistance", tags: ["aide-personne", "accompagnement", "soutien", "presence"] },
        "cours": { domain: "cours-formation", category: "musique-soutien", subcategory: "musique", tags: ["cours-musique", "musique", "enseignement", "atelier"] }
    };

    // --------------------------------------------------------------------------
    // 4. MOTEUR MATHÉMATIQUE DE DISTANCE GÉOGRAPHIQUE (HAVERSINE FORMULA)
    // --------------------------------------------------------------------------
    function calculateDistanceKm(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return 10.0; // Distance par défaut raisonnable si non géolocalisé
        const R = 6371; // Rayon de la Terre en km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return parseFloat((R * c).toFixed(1));
    }

    function getCityCoords(cityName) {
        if (!cityName) return { lat: 16.2253, lon: -61.3854 }; // Default Sainte-Anne
        const slug = cityName.toLowerCase().trim()
            .replace(/é|è|ê/g, 'e')
            .replace(/à|â/g, 'a')
            .replace(/î|ï/g, 'i')
            .replace(/ô|ö/g, 'o')
            .replace(/\s+/g, '-');
        return LYANN_CITY_COORDINATES[slug] || { lat: 16.2253, lon: -61.3854 };
    }

    // --------------------------------------------------------------------------
    // 5. NLU & CLASSIFICATION DU BESOIN EN TEXTE NATUREL
    // --------------------------------------------------------------------------
    function classifyNeedQuery(queryText, providedLocation = null) {
        const text = (queryText || "").toLowerCase();
        let matchedTaxonomy = {
            domain: "maison-travaux",
            category: "bricolage",
            subcategory: "petit-bricolage",
            required_skills: ["bricolage"],
            vehicle_required: false,
            urgency: "normal"
        };

        if (text.includes("fuite") || text.includes("eau") || text.includes("evier") || text.includes("plombier") || text.includes("robinet")) {
            matchedTaxonomy = TAXONOMY_MAP["plomberie"];
        } else if (text.includes("jardin") || text.includes("tonte") || text.includes("arbre") || text.includes("elagage")) {
            matchedTaxonomy = TAXONOMY_MAP["jardinage"];
        } else if (text.includes("peinture") || text.includes("peindre") || text.includes("mur")) {
            matchedTaxonomy = TAXONOMY_MAP["peinture"];
        } else if (text.includes("canape") || text.includes("demenag") || text.includes("recuperer") || text.includes("camion") || text.includes("meuble lourd")) {
            matchedTaxonomy = { ...TAXONOMY_MAP["canape"], vehicle_required: true };
        } else if (text.includes("course") || text.includes("mere") || text.includes("accompagner") || text.includes("senior")) {
            matchedTaxonomy = TAXONOMY_MAP["courses"];
        } else if (text.includes("cours") || text.includes("musique") || text.includes("guitare")) {
            matchedTaxonomy = TAXONOMY_MAP["cours"];
        }

        // Extraire la localisation
        let locName = providedLocation || "Sainte-Anne";
        for (const key in LYANN_CITY_COORDINATES) {
            if (text.includes(LYANN_CITY_COORDINATES[key].name.toLowerCase())) {
                locName = LYANN_CITY_COORDINATES[key].name;
                break;
            }
        }

        const coords = getCityCoords(locName);

        return {
            raw_text: queryText,
            domain: matchedTaxonomy.domain,
            category: matchedTaxonomy.category,
            subcategory: matchedTaxonomy.subcategory,
            required_skills: matchedTaxonomy.tags || [matchedTaxonomy.category],
            vehicle_required: !!matchedTaxonomy.vehicle_required,
            location_name: locName,
            latitude: coords.lat,
            longitude: coords.lon,
            classified_at: new Date().toISOString()
        };
    }

    // --------------------------------------------------------------------------
    // 6. FILTRES DÉTERMINISTES DU SCORING (PRE-FILTERING SQL/MEMORY)
    // --------------------------------------------------------------------------
    function deterministicPreFilter(need, candidates) {
        return candidates.filter(candidate => {
            // 1. Opt-out preference check
            if (candidate.matching_enabled === false) {
                return false;
            }

            // 2. Vérification métier / compétence
            const candidateSkills = (candidate.skills || []).map(s => s.toLowerCase());
            const candidateCategory = (candidate.category || "").toLowerCase();
            const candidateRole = (candidate.role || "").toLowerCase();

            const isSkillMatch = need.required_skills.some(req =>
                candidateSkills.some(s => s.includes(req) || req.includes(s)) ||
                candidateCategory.includes(req) ||
                candidateRole.includes(req)
            );

            if (!isSkillMatch) return false;

            // 3. Calcul de la distance géographique & Rayon d'intervention
            const candCoords = getCityCoords(candidate.city || candidate.locationName || candidate.location);
            const distKm = calculateDistanceKm(need.latitude, need.longitude, candCoords.lat, candCoords.lon);
            candidate._calculatedDistanceKm = distKm;

            const radiusKm = candidate.service_radius_km || 25;
            if (distKm > radiusKm && radiusKm < 100) {
                return false; // Hors du rayon d'intervention accepté
            }

            // 4. Véhicule obligatoire si exigé
            if (need.vehicle_required) {
                const hasVehicle = candidate.mobility && (candidate.mobility.includes("vehicule") || candidate.mobility.includes("utilitaire") || candidate.mobility.includes("vehicule_personnel"));
                const roleMentionVehicle = candidateRole.includes("transport") || candidateRole.includes("livraison") || candidateRole.includes("clim");
                if (!hasVehicle && !roleMentionVehicle) return false;
            }

            return true;
        });
    }

    // --------------------------------------------------------------------------
    // 7. CALCUL DU SCORE DE MATCHING PONDÉRÉ (0.00 à 1.00) & RAISONS HUMAINES
    // --------------------------------------------------------------------------
    function scoreCandidate(need, candidate) {
        const breakdown = {};
        const reasons = [];

        // A. Service Compatibility (35%)
        const candidateSkills = (candidate.skills || []).map(s => s.toLowerCase());
        const matches = need.required_skills.filter(req => candidateSkills.some(s => s.includes(req)));
        let serviceScore = matches.length > 0 ? Math.min(1.0, 0.7 + (matches.length * 0.15)) : 0.6;
        if (candidate.category === need.category) serviceScore = Math.min(1.0, serviceScore + 0.2);
        breakdown.serviceCompatibility = +(serviceScore * MATCHING_WEIGHTS.serviceCompatibility).toFixed(3);
        
        reasons.push(`Spécialisé(e) en ${candidate.role || candidate.category}`);

        // B. Distance Compatibility (25%)
        const distKm = candidate._calculatedDistanceKm || 10.0;
        let distScore = 1.0;
        if (distKm <= 5) distScore = 1.0;
        else if (distKm <= 15) distScore = 0.85;
        else if (distKm <= 30) distScore = 0.65;
        else distScore = 0.4;
        breakdown.distanceCompatibility = +(distScore * MATCHING_WEIGHTS.distanceCompatibility).toFixed(3);

        const candCity = candidate.city || candidate.locationName || "Sainte-Anne";
        reasons.push(`Intervient près de ${candCity} (${distKm} km)`);

        // C. Availability (15%)
        const availScore = candidate.available !== false ? 1.0 : 0.4;
        breakdown.availabilityCompatibility = +(availScore * MATCHING_WEIGHTS.availabilityCompatibility).toFixed(3);
        if (candidate.available !== false) {
            reasons.push("Disponible cette semaine");
        }

        // D. Reputation (10%) - Bayesian Rating (reviewsCount weight)
        const rating = candidate.rating || 4.8;
        const reviews = candidate.reviewsCount || candidate.reviews_count || 10;
        const bayesianRating = (rating * reviews + 4.5 * 5) / (reviews + 5);
        const repScore = (bayesianRating / 5.0);
        breakdown.reputationScore = +(repScore * MATCHING_WEIGHTS.reputationScore).toFixed(3);

        if (reviews >= 5) {
            reasons.push(`Très recommandé(e) (${rating} ★ · ${reviews} avis)`);
        }

        // E. Response Rate (5%)
        const respRate = candidate.response_rate || 0.95;
        breakdown.responseRate = +(respRate * MATCHING_WEIGHTS.responseRate).toFixed(3);

        // F. Verified / Pro Status (5%)
        const isVerified = candidate.badge?.includes("Vérifié") || candidate.kyc_verified || candidate.is_pro;
        const verifScore = isVerified ? 1.0 : 0.5;
        breakdown.verifiedProStatus = +(verifScore * MATCHING_WEIGHTS.verifiedProStatus).toFixed(3);
        if (isVerified) {
            reasons.push("Profil Vérifié sur LYANN");
        }

        // G. Exploration Fairness (5%) - Donnée aux nouveaux Lyanneurs pour leur donner une chance
        const isNewUser = reviews <= 2;
        const exploreScore = isNewUser ? 1.0 : 0.5;
        breakdown.explorationFairness = +(exploreScore * MATCHING_WEIGHTS.explorationFairness).toFixed(3);

        // TOTAL SCORE
        const totalScore = parseFloat(Object.values(breakdown).reduce((a, b) => a + b, 0).toFixed(3));

        return {
            candidate_id: candidate.id,
            display_name: candidate.name,
            avatar: candidate.avatar,
            role: candidate.role,
            city: candCity,
            rating: candidate.rating || 4.8,
            reviewsCount: reviews,
            badge: candidate.badge || "Lyanneur Vérifié",
            distance_km: distKm,
            total_score: totalScore,
            score_breakdown: breakdown,
            human_reasons: reasons
        };
    }

    // --------------------------------------------------------------------------
    // 8. SERVICE CENTRAL DE MATCHING ET DIFFUSION CIBLÉE (LYANN MATCHING ENGINE)
    // --------------------------------------------------------------------------
    const LyannMatchingEngine = {
        weights: MATCHING_WEIGHTS,

        classifyNeed(queryText, location = null) {
            return classifyNeedQuery(queryText, location);
        },

        calculateDistance(lat1, lon1, lat2, lon2) {
            return calculateDistanceKm(lat1, lon1, lat2, lon2);
        },

        findMatchingLyanneursForNeed(needQuery, candidatesList = [], options = {}) {
            const need = typeof needQuery === 'string' ? classifyNeedQuery(needQuery, options.location) : needQuery;
            const candidates = candidatesList.length > 0 ? candidatesList : (window.LYANN_MEMBERS || []);

            // 1. Filtres déterministes
            const preFiltered = deterministicPreFilter(need, candidates);

            // 2. Calcul des scores
            const scored = preFiltered.map(c => scoreCandidate(need, c));

            // 3. Tri par score décroissant
            scored.sort((a, b) => b.total_score - a.total_score);

            // 4. Diversification & Nettoyage Sécurité / Confidentialité
            const limit = options.limit || 5;
            const finalSelection = scored.slice(0, limit);

            return {
                need: {
                    raw_text: need.raw_text,
                    category: need.category,
                    location: need.location_name
                },
                matches_found: finalSelection.length,
                lyanneurs: finalSelection.map(item => ({
                    user_id: item.candidate_id,
                    display_name: item.display_name,
                    avatar: item.avatar,
                    role: item.role,
                    public_location: item.city,
                    rating: item.rating,
                    reviewsCount: item.reviewsCount,
                    badge: item.badge,
                    distance_km: item.distance_km,
                    human_reasons: item.human_reasons
                    // IMPORTANT: Aucune adresse privée, latitude exacte ou score brut n'est exposé au public !
                }))
            };
        },

        findMatchingNeedsForLyanneur(lyanneurProfile, needsList = [], options = {}) {
            const lyanneurSkills = (lyanneurProfile.skills || [lyanneurProfile.role || "bricolage"]).map(s => s.toLowerCase());
            const candCity = lyanneurProfile.city || lyanneurProfile.location || "Sainte-Anne";
            const candCoords = getCityCoords(candCity);
            const radiusKm = lyanneurProfile.service_radius_km || 25;

            const matches = needsList.filter(need => {
                const needText = (need.title || need.description || "").toLowerCase();
                const isSkillMatch = lyanneurSkills.some(skill => needText.includes(skill));
                const needCoords = getCityCoords(need.city || need.location);
                const dist = calculateDistanceKm(candCoords.lat, candCoords.lon, needCoords.lat, needCoords.lon);
                return isSkillMatch && dist <= radiusKm;
            });

            return matches.map(n => ({
                need_id: n.id,
                title: n.title || n.description,
                city: n.city || "Sainte-Anne",
                urgency: n.urgency || "normal",
                human_reason: `Besoin en ${n.category || 'entraide'} près de chez vous`
            }));
        },

        dispatchTargetedNeedNotifications(needData, candidatesList = [], batchSize = 5) {
            const matchResult = this.findMatchingLyanneursForNeed(needData, candidatesList, { limit: batchSize });
            const notifications = [];

            if (matchResult.matches_found === 0) {
                return {
                    dispatched_count: 0,
                    fallback_message: "Votre besoin est bien publié. Les Lyanneurs pourront le découvrir dans Bokantaj.",
                    notifications: []
                };
            }

            matchResult.lyanneurs.forEach(lyanneur => {
                const notifPayload = {
                    recipient_id: lyanneur.user_id,
                    recipient_name: lyanneur.display_name,
                    title: "Un besoin pourrait vous correspondre près de chez vous",
                    message: `${needData.title || needData.raw_text} · ${needData.location_name || 'Sainte-Anne'}`,
                    action_cta: "Voir le besoin",
                    created_at: new Date().toISOString()
                };
                notifications.push(notifPayload);

                if (window.NotificationService && typeof window.NotificationService.showToast === 'function') {
                    // Simulation discrète pour le destinataire
                }
            });

            return {
                dispatched_count: notifications.length,
                batch_size: batchSize,
                notifications,
                human_summary: `Votre besoin a été partagé avec ${notifications.length} Lyanneur(s) susceptible(s) de vous aider.`
            };
        }
    };

    // Exportation globale universelle Web + Mobile + Node.js
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = LyannMatchingEngine;
    } else {
        global.LyannMatchingEngine = LyannMatchingEngine;
    }

})(typeof window !== 'undefined' ? window : this);
