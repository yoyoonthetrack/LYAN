/**
 * LYANN — SMART MATCHING & DISPATCH ENGINE (V2 PRODUCTION)
 * Architecture: Multi-Signal Relevance + Haversine Geography + Trust Engine + Newcomer Fairness + Progressive Dispatch
 * 100% Backend-Authoritative, Explainable & Privacy-Preserving (No IA or raw algorithm scores exposed to public).
 */

(function (global) {
    'use strict';

    // 1. CARIBBEAN & DOM-TOM CITY COORDINATES
    const LYANN_CITY_COORDINATES = {
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
        "fort-de-france": { lat: 14.6161, lon: -61.0588, name: "Fort-de-France" },
        "le-lamentin": { lat: 14.6104, lon: -61.0022, name: "Le Lamentin" },
        "schoelcher": { lat: 14.6167, lon: -61.1000, name: "Schœlcher" },
        "cayenne": { lat: 4.9372, lon: -52.3260, name: "Cayenne" },
        "saint-denis": { lat: -20.8823, lon: 55.4504, name: "Saint-Denis" }
    };

    // 2. HAVERSINE DISTANCE CALCULATOR
    function calculateDistanceKm(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return 10.0;
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return parseFloat((R * c).toFixed(1));
    }

    function normalizeText(str) {
        if (!str) return "";
        return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ").replace(/\s+/g, " ").trim();
    }

    function getCityCoords(cityName) {
        if (!cityName) return { lat: 16.2253, lon: -61.3854 };
        const slug = normalizeText(cityName).replace(/\s+/g, '-');
        return LYANN_CITY_COORDINATES[slug] || { lat: 16.2253, lon: -61.3854 };
    }

    // 3. HARD FILTERS (SECURITY, SELF MATCH, PRO_REQUIRED, OPT-OUT)
    function applyHardFilters(need, candidates) {
        const requesterId = need.requester_id || need.author_id;
        const isProRequired = need.safety_status === 'PRO_REQUIRED';
        const isProhibited = need.safety_status === 'PROHIBITED';

        if (isProhibited) return [];

        return candidates.filter(candidate => {
            // Filter 1: Account status active & matching enabled
            if (candidate.status === 'INACTIVE' || candidate.matching_enabled === false) {
                return false;
            }

            // Filter 2: Self-match exclusion (TEST H)
            const candidateId = candidate.id || candidate.user_id;
            if (requesterId && candidateId === requesterId) {
                return false;
            }

            // Filter 3: User Block Exclusion (Step 14 TEST A)
            if (global.LyannSafetyEngine && typeof global.LyannSafetyEngine.isUserBlocked === 'function') {
                if (global.LyannSafetyEngine.isUserBlocked(requesterId, candidateId)) {
                    return false;
                }
            }

            // Filter 4: Sanction Exclusion (Step 14 TEST H)
            if (global.LyannSafetyEngine && typeof global.LyannSafetyEngine.isUserSanctioned === 'function') {
                if (global.LyannSafetyEngine.isUserSanctioned(candidateId, 'MATCHING_ONLY')) {
                    return false;
                }
            }

            // Filter 5: PRO_REQUIRED enforcement (Step 16 Authority)
            if (isProRequired) {
                if (global.LyannProVerificationEngine && typeof global.LyannProVerificationEngine.checkMatchingEligibility === 'function') {
                    const isEligible = global.LyannProVerificationEngine.checkMatchingEligibility(candidate, need.category || 'general', 'PRO_REQUIRED');
                    if (!isEligible) return false;
                } else {
                    const isPro = (candidate.is_pro || candidate.kyc_verified || candidate.badge?.includes("Vérifié")) && candidate.subscription_plan !== 'PRO_UNVERIFIED';
                    if (!isPro) return false;
                }
            }

            return true;
        });
    }

    const LOCATION_STOPWORDS = new Set(["saint", "sainte", "francois", "anne", "gosier", "abymes", "baie", "mahault", "moule", "lamentin", "cayenne", "denis", "guadeloupe", "martinique", "reunion", "guyane", "fort", "france", "basse", "terre"]);

    // 4. EXPLAINABLE SCORE CALCULATOR (0 to 100 PTS)
    function scoreCandidate(need, candidate) {
        const breakdown = {
            relevance: 0,
            geography: 0,
            trust: 0,
            newcomer_fairness: 0,
            fair_distribution: 0,
            responsiveness: 0
        };
        const reasons = [];

        const rawNeedText = normalizeText(need.description || need.title || need.raw_text || "");
        const needTokens = Array.from(new Set(rawNeedText.split(/\s+/).filter(w => w.length > 2 && !LOCATION_STOPWORDS.has(w))));

        // A. RELEVANCE SCORE (0 - 40 PTS) WITH ANTI KEYWORD SPAM
        // Deduplicate candidate skills to prevent spamming duplicate terms (TEST I)
        const rawSkills = Array.isArray(candidate.skills) ? candidate.skills : (typeof candidate.skills === 'string' ? candidate.skills.split(',') : []);
        const candidateSkills = Array.from(new Set(rawSkills.map(s => normalizeText(s)))).filter(Boolean);
        const candidateBio = normalizeText(candidate.bio || "");
        const candidateRole = normalizeText(candidate.role || "");
        const candidateCategory = normalizeText(candidate.category || "");
        const needCategoryNorm = normalizeText(need.category || "");

        const matchedFields = [];
        let relevancePts = 0;

        // Check keyword matches
        for (const token of needTokens) {
            if (candidateSkills.some(s => s === token || s.includes(token) || token.includes(s))) {
                relevancePts += 15;
                if (!matchedFields.includes('skills')) matchedFields.push('skills');
            }
            if (candidateRole.includes(token)) {
                relevancePts += 15;
                if (!matchedFields.includes('role')) matchedFields.push('role');
            }
            if (candidateCategory.includes(token)) {
                relevancePts += 15;
                if (!matchedFields.includes('category')) matchedFields.push('category');
            }
            if (candidateBio.includes(token)) {
                relevancePts += 10;
                if (!matchedFields.includes('bio')) matchedFields.push('bio');
            }
        }

        // Category & Synonym match bonus
        if (needCategoryNorm && needCategoryNorm !== 'general') {
            if (candidateCategory.includes(needCategoryNorm) || needCategoryNorm.includes(candidateCategory) || candidateRole.includes(needCategoryNorm)) {
                relevancePts += 20;
                if (!matchedFields.includes('category')) matchedFields.push('category');
            } else {
                // Check synonym cross-matches (e.g. voiture -> auto/mécanique, plombier -> plomberie)
                const plumbSynonyms = ["plombier", "plomberie", "fuite", "sanitaire", "robinet", "tuyau", "dépannage"];
                const isNeedPlumb = plumbSynonyms.some(s => needCategoryNorm.includes(s) || rawNeedText.includes(s));
                const isCandPlumb = plumbSynonyms.some(s => candidateCategory.includes(s) || candidateRole.includes(s) || candidateSkills.some(sk => sk.includes(s)));
                if (isNeedPlumb && isCandPlumb) {
                    relevancePts += 20;
                    if (!matchedFields.includes('synonyms')) matchedFields.push('synonyms');
                }

                const autoSynonyms = ["voiture", "auto", "bagnole", "mécano", "mecano", "mécanique", "mecanique"];
                const isNeedAuto = autoSynonyms.some(s => needCategoryNorm.includes(s) || rawNeedText.includes(s));
                const isCandAuto = autoSynonyms.some(s => candidateCategory.includes(s) || candidateRole.includes(s) || candidateSkills.some(sk => sk.includes(s)));
                if (isNeedAuto && isCandAuto) {
                    relevancePts += 20;
                    if (!matchedFields.includes('synonyms')) matchedFields.push('synonyms');
                }

                const motoSynonyms = ["scooter", "moto", "deux-roues", "deux roues", "mobilité", "mécano", "mecano", "mécanique"];
                const isNeedMoto = motoSynonyms.some(s => needCategoryNorm.includes(s) || rawNeedText.includes(s));
                const isCandMoto = motoSynonyms.some(s => candidateCategory.includes(s) || candidateRole.includes(s) || candidateSkills.some(sk => sk.includes(s)));
                if (isNeedMoto && isCandMoto) {
                    relevancePts += 20;
                    if (!matchedFields.includes('synonyms')) matchedFields.push('synonyms');
                }

            }
        }

        // Cap relevance score at 40 max (Prevents keyword repetition from inflating score)
        breakdown.relevance = Math.min(40, relevancePts);

        if (breakdown.relevance >= 25) {
            reasons.push(`Spécialisé(e) en ${candidate.role || candidate.category || "votre besoin"}`);
        } else if (breakdown.relevance > 0) {
            reasons.push(`Compétences adaptées à votre demande`);
        }

        // B. GEOGRAPHY SCORE (0 - 20 PTS)
        const candCoords = getCityCoords(candidate.city || candidate.locationName || candidate.location);
        const needCoords = getCityCoords(need.location || need.city || "Sainte-Anne");
        const distKm = calculateDistanceKm(needCoords.lat, needCoords.lon, candCoords.lat, candCoords.lon);
        candidate._calculatedDistanceKm = distKm;

        if (distKm <= 5) breakdown.geography = 20;
        else if (distKm <= 15) breakdown.geography = 16;
        else if (distKm <= 30) breakdown.geography = 12;
        else breakdown.geography = 6;

        const candCity = candidate.city || candidate.locationName || "Sainte-Anne";
        reasons.push(`Intervient près de ${candCity} (${distKm} km)`);

        // C. TRUST SCORE (0 - 15 PTS)
        const rating = candidate.rating || candidate.average_rating || 4.8;
        const reviewsCount = candidate.reviewsCount || candidate.reviews_count || 0;

        if (reviewsCount > 0) {
            const bayesianRating = (rating * reviewsCount + 4.5 * 5) / (reviewsCount + 5);
            breakdown.trust = Math.round((bayesianRating / 5.0) * 15);
            if (reviewsCount >= 3) {
                reasons.push(`Très recommandé(e) (${rating} ★ · ${reviewsCount} avis)`);
            }
        } else {
            breakdown.trust = 5; // Neutral baseline for 0 reviews
        }

        // D. NEWCOMER FAIRNESS (0 - 10 PTS) (TEST B)
        const isNewcomer = reviewsCount === 0;
        const hasCompleteProfile = candidateSkills.length > 0 && candCity;

        if (isNewcomer && hasCompleteProfile) {
            breakdown.newcomer_fairness = 10;
            reasons.push("Nouveau membre actif sur LYANN");
        } else if (isNewcomer) {
            breakdown.newcomer_fairness = 5;
        }

        // E. FAIR DISTRIBUTION (0 - 10 PTS) (TEST F)
        const recentDispatches = candidate.recent_dispatches_count || 0;
        if (recentDispatches === 0) breakdown.fair_distribution = 10;
        else if (recentDispatches <= 2) breakdown.fair_distribution = 7;
        else if (recentDispatches <= 5) breakdown.fair_distribution = 4;
        else breakdown.fair_distribution = 2;

        // F. RESPONSIVENESS & AVAILABILITY (0 - 5 PTS)
        const respRate = candidate.response_rate || 0.95;
        const isAvailable = candidate.available !== false;
        breakdown.responsiveness = Math.round(respRate * (isAvailable ? 5 : 2));
        if (isAvailable) reasons.push("Disponible cette semaine");

        // G. SUBSCRIPTION VISIBILITY TIER BOOST
        let visibilityBoost = 0;
        if (global.LyannSubscriptionsEngine && typeof global.LyannSubscriptionsEngine.getEntitlements === 'function') {
            const candidateId = candidate.id || candidate.user_id;
            const entitlements = global.LyannSubscriptionsEngine.getEntitlements(candidateId);
            const tier = entitlements.VISIBILITY_TIER || 'STANDARD';
            if (tier === 'PLUS') visibilityBoost = 2;
            else if (tier === 'ENHANCED') visibilityBoost = 4;
            else if (tier === 'PRO') visibilityBoost = 6;
        }
        breakdown.visibility_boost = visibilityBoost;

        // TOTAL SCORE (0 - 100)
        const totalScore = Math.min(100, Math.round(
            breakdown.relevance +
            breakdown.geography +
            breakdown.trust +
            breakdown.newcomer_fairness +
            breakdown.fair_distribution +
            breakdown.responsiveness +
            breakdown.visibility_boost
        ));

        return {
            candidate_id: candidate.id || candidate.user_id,
            user_id: candidate.id || candidate.user_id,
            display_name: candidate.first_name || candidate.name || candidate.display_name || "Lyanneur",
            avatar: candidate.avatar_url || candidate.avatar,
            role: candidate.role || candidate.category || "Membre LYANN",
            city: candCity,
            public_location: candCity,
            rating: rating,
            reviewsCount: reviewsCount,
            badge: candidate.badge || (candidate.is_verified_pro ? "Artisan Vérifié" : "Membre Vérifié"),
            distance_km: distKm,
            total_score: totalScore,
            relevance_score: breakdown.relevance,
            matched_fields: matchedFields,
            score_breakdown: breakdown,
            breakdown: breakdown,
            human_reasons: reasons,
            is_newcomer: isNewcomer
        };
    }

    // 5. PROGRESSIVE DISPATCH ENGINE (STRICT RELEVANCE PRIORITIZED)
    function runSmartMatchingDispatch(need, candidates, options = {}) {
        const maxWaveCandidates = options.maxWaveCandidates || 6;
        const eligibleCandidates = applyHardFilters(need, candidates);
        const scoredCandidates = eligibleCandidates.map(c => scoreCandidate(need, c));

        // STEP 17 RULE: Strict professional relevance is priority #1.
        // 6 relevant -> 6, 2 relevant -> 2, 0 -> 0. Never pad with irrelevant candidates (relevance_score === 0).
        let relevantCandidates = scoredCandidates.filter(c => c.relevance_score > 0);
        relevantCandidates.sort((a, b) => b.total_score - a.total_score);

        const dispatchedWave = relevantCandidates.slice(0, maxWaveCandidates);

        return {
            need_id: need.id || null,
            need_title: need.title || need.description,
            classification_status: need.classification_status || 'CLASSIFIED',
            safety_status: need.safety_status || 'SAFE',
            evaluated_count: candidates.length,
            eligible_count: eligibleCandidates.length,
            dispatched_count: dispatchedWave.length,
            wave_number: 1,
            dispatched_candidates: dispatchedWave
        };
    }

    // Direct helper for Step 17 search & need matching
    function findMatchingLyanneursForNeed(need, candidates = [], options = {}) {
        const dispatchRes = runSmartMatchingDispatch(need, candidates, { maxWaveCandidates: options.limit || 6 });
        return {
            matches_found: dispatchRes.dispatched_count,
            lyanneurs: dispatchRes.dispatched_candidates,
            evaluated_count: dispatchRes.evaluated_count
        };
    }

    function dispatchTargetedNeedNotifications(needData, candidates = [], batchSize = 5) {
        const dispatchRes = runSmartMatchingDispatch(needData, candidates, { maxWaveCandidates: batchSize });
        return {
            dispatched_count: dispatchRes.dispatched_count,
            dispatched_candidates: dispatchRes.dispatched_candidates,
            fallback_message: dispatchRes.dispatched_count > 0 ? `${dispatchRes.dispatched_count} Lyanneur(s) prévenu(s)` : "Votre besoin est publié sur LYANN."
        };
    }

    // 6. PUBLIC PRIVACY-SAFE RESPONSE
    function getPublicMatchResponse(dispatchResult) {
        return {
            need_title: dispatchResult.need_title,
            dispatched_count: dispatchResult.dispatched_count,
            candidates: dispatchResult.dispatched_candidates.map(c => ({
                display_name: c.display_name,
                avatar: c.avatar,
                role: c.role,
                city: c.city,
                badge: c.badge,
                human_reasons: c.human_reasons
            }))
        };
    }

    // Export module
    const LyannSmartMatching = {
        applyHardFilters,
        scoreCandidate,
        runSmartMatchingDispatch,
        findMatchingLyanneursForNeed,
        dispatchTargetedNeedNotifications,
        getPublicMatchResponse,
        getCityCoords,
        calculateDistanceKm
    };

    if (typeof window !== 'undefined') {
        window.LyannSmartMatching = LyannSmartMatching;
        window.LyannMatchingEngine = LyannSmartMatching;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = LyannSmartMatching;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
