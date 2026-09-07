/**
 * LYANN — STEP 17: SEARCH, DISCOVERY & MARKETPLACE EXPERIENCE ENGINE
 * 
 * Central engine for Universal Natural Language Search, Local Discovery,
 * Intent Detection (Exploration vs Request Creation), Zero-Result Handling,
 * Step 11 Ranking Reuse, Step 14 Safety Authority, Step 15 Visibility Boost & Entitlements,
 * Step 16 Professional Verification, and Privacy-Safe Public Card Output.
 */

(function (global) {
    'use strict';

    // 1. RECENT SEARCHES STORAGE MANAGER (NAMESPACED PER USER FOR MULTI-ACCOUNT PRIVACY)
    const MAX_RECENT_SEARCHES = 5;
    let _memoryRecentSearches = new Map(); // userId -> array

    function getStorageKey(userId = null) {
        const uid = userId || 'anonymous';
        return `lyann_recent_searches_${uid}`;
    }

    function getRecentSearches(userId = null) {
        const key = getStorageKey(userId);
        try {
            if (typeof localStorage !== 'undefined') {
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : [];
            }
            return _memoryRecentSearches.get(key) || [];
        } catch (e) {
            return _memoryRecentSearches.get(key) || [];
        }
    }

    function addRecentSearch(query, userId = null) {
        if (!query || typeof query !== 'string') return;
        const trimmed = query.trim();
        if (trimmed.length < 2) return;

        const key = getStorageKey(userId);
        let history = getRecentSearches(userId);
        history = history.filter(q => q.toLowerCase() !== trimmed.toLowerCase());
        history.unshift(trimmed);
        if (history.length > MAX_RECENT_SEARCHES) {
            history = history.slice(0, MAX_RECENT_SEARCHES);
        }
        _memoryRecentSearches.set(key, [...history]);
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(key, JSON.stringify(history));
            }
        } catch (e) { }
        return history;
    }

    function clearRecentSearches(userId = null) {
        const key = getStorageKey(userId);
        _memoryRecentSearches.delete(key);
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(key);
            }
        } catch (e) { }
        return [];
    }

    // STALE REQUEST TRACKER & DEBOUNCE UTILITY
    let _latestSearchRequestId = 0;

    function createDebouncedSearchHandler(searchFn, delayMs = 300) {
        let timer = null;
        return function (...args) {
            const requestId = ++_latestSearchRequestId;
            return new Promise((resolve) => {
                if (timer) clearTimeout(timer);
                timer = setTimeout(async () => {
                    const result = await searchFn(...args);
                    if (requestId === _latestSearchRequestId) {
                        resolve(result);
                    } else {
                        resolve({ is_stale_response: true, results: [] });
                    }
                }, delayMs);
            });
        };
    }

    // 2. TEXT NORMALIZATION & SYNONYM DICTIONARY FOR UNIVERSAL SEARCH
    const SYNONYM_MAP = {
        "plombier": ["plomberie", "plombier", "fuite", "eau", "sanitaire", "robinet", "tuyau", "dépannage"],
        "plomberie": ["plomberie", "plombier", "fuite", "eau", "sanitaire", "robinet", "tuyau", "dépannage"],
        "mecano": ["mécanique", "mécano", "voiture", "auto", "scooter", "réparation", "moteur"],
        "mécanicien": ["mécanique", "mécano", "voiture", "auto", "scooter", "réparation"],
        "voiture": ["mécanique", "auto", "bagnole", "réparation"],
        "scooter": ["mécanique", "scooter", "moto", "deux-roues", "réparation"],
        "jardin": ["jardinage", "débroussaillage", "élagage", "espaces verts", "tonte"],
        "jardinier": ["jardinage", "débroussaillage", "espaces verts"],
        "meuble": ["bricolage", "montage", "armoire", "cuisine", "assemblage"],
        "armoire": ["bricolage", "montage", "meuble"],
        "fuite": ["plomberie", "plombier", "eau", "tuyau", "réparation"],
        "piano": ["musique", "piano", "cours", "apprentissage"],
        "guitare": ["musique", "guitare", "cours"],
        "poterie": ["artisanat", "cours", "poterie", "atelier"],
        "aeroport": ["transport", "trajet", "aéroport", "navette", "voiture"],
        "gateau": ["cuisine", "pâtisserie", "gâteau", "anniversaire"]
    };


    function normalizeSearchQuery(query) {
        if (!query) return "";
        return query.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function expandQuerySynonyms(normalizedQuery) {
        const words = normalizedQuery.split(/\s+/).filter(w => w.length > 2);
        const expandedTerms = new Set(words);

        for (const word of words) {
            for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
                const normKey = normalizeSearchQuery(key);
                if (normKey === word || normKey.includes(word) || word.includes(normKey)) {
                    synonyms.forEach(s => expandedTerms.add(normalizeSearchQuery(s)));
                }
            }
        }
        return Array.from(expandedTerms);
    }

    // 3. INTENT DETECTOR (EXPLORATION VS NEED CREATION)
    function detectSearchIntent(rawQuery) {
        const norm = normalizeSearchQuery(rawQuery);
        if (!norm) return { intent: 'EXPLORE', category: null, isExplicitNeed: false };

        const needKeywords = ["cherche", "besoin", "reparer", "monter", "debroussailler", "emmener", "faire", "apprendre", "demain", "urgent", "quelqu'un"];
        const isExplicitNeed = needKeywords.some(kw => norm.includes(kw)) || norm.split(/\s+/).length >= 3;

        let detectedCategory = null;
        if (norm.includes("scooter") || norm.includes("voiture") || norm.includes("mecano") || norm.includes("mecanique")) {
            detectedCategory = "mecanique";
        } else if (norm.includes("jardin") || norm.includes("debroussail")) {
            detectedCategory = "jardinage";
        } else if (norm.includes("armoire") || norm.includes("meuble") || norm.includes("monter")) {
            detectedCategory = "bricolage";
        } else if (norm.includes("fuite") || norm.includes("plomberie")) {
            detectedCategory = "plomberie";
        } else if (norm.includes("piano") || norm.includes("guitare") || norm.includes("cours")) {
            detectedCategory = "musique";
        } else if (norm.includes("poterie")) {
            detectedCategory = "artisanat";
        }

        return {
            intent: isExplicitNeed ? 'NEED_REQUEST' : 'EXPLORE',
            category: detectedCategory,
            isExplicitNeed: isExplicitNeed,
            normalized_query: norm
        };
    }

    // 4. MAIN SEARCH DISCOVERY ENGINE
    function performUniversalSearch(rawQuery, candidates = [], options = {}, callingUserId = null) {
        const normQuery = normalizeSearchQuery(rawQuery);
        const intent = detectSearchIntent(rawQuery);
        const expandedTerms = expandQuerySynonyms(normQuery);

        if (options.safety_status === 'PROHIBITED') {
            return {
                query: rawQuery,
                normalized_query: normQuery,
                intent: intent,
                total_found: 0,
                is_zero_result: true,
                zero_result_message: "Cette recherche concerne une activité interdite sur LYANN.",
                conversion_request: null,
                results: []
            };
        }

        // Options & Entitlements Filtering (Step 15)
        let maxDistance = options.maxDistanceKm || 30;
        let minRating = options.minRating || 0;
        let verifiedOnly = options.verifiedProOnly === true;
        let locationFilter = options.location ? normalizeSearchQuery(options.location) : null;

        // Check Advanced Filters Entitlement (Step 15)
        if (global.LyannSubscriptionsEngine && callingUserId) {
            const hasAdvancedFilters = global.LyannSubscriptionsEngine.hasEntitlement(callingUserId, 'CAN_USE_ADVANCED_FILTERS');
            if (!hasAdvancedFilters && (options.maxDistanceKm || options.minRating)) {
                // Fall back to standard defaults for free users
                maxDistance = 30;
                minRating = 0;
            }
        }

        // Construct mock need for Step 11 Scoring Reuse
        const mockNeed = {
            id: `search_need_${Date.now()}`,
            title: rawQuery,
            description: rawQuery,
            raw_text: rawQuery,
            category: intent.category || 'general',
            location: options.location || 'Sainte-Anne',
            safety_status: options.safety_status || 'SAFE',
            requester_id: callingUserId
        };

        // Step 14 Safety & Hard Filters
        let filteredCandidates = candidates.filter(c => {
            const candidateId = c.id || c.user_id;

            // Step 14 Blocked Users Exclusion
            if (global.LyannSafetyEngine && typeof global.LyannSafetyEngine.isUserBlocked === 'function' && callingUserId) {
                if (global.LyannSafetyEngine.isUserBlocked(callingUserId, candidateId)) {
                    return false;
                }
            }

            // Step 14 Sanction Exclusion
            if (global.LyannSafetyEngine && typeof global.LyannSafetyEngine.isUserSanctioned === 'function') {
                if (global.LyannSafetyEngine.isUserSanctioned(candidateId, 'MATCHING_ONLY') || global.LyannSafetyEngine.isUserSanctioned(candidateId, 'FULL_SUSPENSION')) {
                    return false;
                }
            }

            // Step 16 PRO_REQUIRED & Activity Eligibility
            if (mockNeed.safety_status === 'PRO_REQUIRED') {
                if (global.LyannProVerificationEngine && typeof global.LyannProVerificationEngine.checkMatchingEligibility === 'function') {
                    const isEligible = global.LyannProVerificationEngine.checkMatchingEligibility(c, mockNeed.category, 'PRO_REQUIRED');
                    if (!isEligible) return false;
                }
            }

            // Filter: Verified Pro Only
            if (verifiedOnly) {
                const isVerifiedPro = c.is_verified_pro || (global.LyannProVerificationEngine && global.LyannProVerificationEngine.getPublicProfileVerification(candidateId).is_verified_pro);
                if (!isVerifiedPro) return false;
            }

            // Filter: Min Rating
            const rating = c.rating || c.average_rating || 4.8;
            if (minRating > 0 && rating < minRating) return false;

            // Filter: Location
            if (locationFilter) {
                const normLoc = locationFilter.trim().toLowerCase();
                const isTerritoryWide = normLoc === 'guadeloupe' || normLoc === 'tous' || normLoc === 'toutes' || normLoc === 'toutes les communes' || normLoc === 'all';
                if (!isTerritoryWide) {
                    const candCity = normalizeSearchQuery(c.city || c.location || c.territory || "");
                    const candTerritory = normalizeSearchQuery(c.territory || c.location || "");
                    const matchesLoc = candCity.includes(normLoc) || normLoc.includes(candCity) || candTerritory.includes(normLoc);
                    if (!matchesLoc) {
                        return false;
                    }
                }
            }

            return true;
        });

        // Reuse Step 11 Smart Matching Scoring
        let scoredResults = [];
        if (global.LyannSmartMatching && typeof global.LyannSmartMatching.scoreCandidate === 'function') {
            scoredResults = filteredCandidates.map(c => {
                const scoreObj = global.LyannSmartMatching.scoreCandidate(mockNeed, c);

                let textMatchBonus = 0;
                const matchedFields = scoreObj.matched_fields ? [...scoreObj.matched_fields] : [];
                const candText = normalizeSearchQuery(`${c.name || ''} ${c.role || ''} ${c.category || ''} ${c.bio || ''} ${(Array.isArray(c.skills) ? c.skills.join(' ') : c.skills || '')}`);

                for (const term of expandedTerms) {
                    if (candText.includes(term)) {
                        textMatchBonus += 5;
                        if (!matchedFields.includes('expanded_text')) {
                            matchedFields.push('expanded_text');
                        }
                    }
                }
                
                const finalRelevanceScore = (scoreObj.relevance_score || 0) + textMatchBonus;
                scoreObj.relevance_score = finalRelevanceScore;
                scoreObj.matched_fields = matchedFields;
                scoreObj.total_score = Math.min(100, (scoreObj.total_score || 0) + textMatchBonus);
                
                return { candidate: c, scoreObj };
            });
        } else {
            // Fallback Simple Scorer
            scoredResults = filteredCandidates.map(c => {
                const candText = normalizeSearchQuery(`${c.name || ''} ${c.role || ''} ${c.category || ''} ${c.bio || ''} ${(Array.isArray(c.skills) ? c.skills.join(' ') : c.skills || '')}`);
                const matchedFields = [];
                let relScore = 0;
                for (const term of expandedTerms) {
                    if (candText.includes(term)) {
                        relScore += 10;
                        matchedFields.push('text_match');
                    }
                }
                return {
                    candidate: c,
                    scoreObj: {
                        total_score: relScore > 0 ? 50 + relScore : 0,
                        relevance_score: relScore,
                        matched_fields: matchedFields,
                        human_reasons: matchedFields.length > 0 ? [`Compétences adaptées à ${rawQuery}`] : [],
                        distance_km: 5
                    }
                };
            });
        }

        // STEP 17 HARD RELEVANCE GATE:
        // When user query is non-empty, EXCLUDE candidates with relevance_score <= 0 OR matched_fields.length === 0.
        // Secondary ranking signals (geography, trust, rating, newcomer bonus) MUST NOT pass irrelevant profiles.
        if (normQuery && normQuery.length > 0) {
            scoredResults = scoredResults.filter(r => {
                const isRelevant = (r.scoreObj.relevance_score > 0) && (r.scoreObj.matched_fields && r.scoreObj.matched_fields.length > 0);
                return isRelevant;
            });
        }

        // Secondary Ranking: Sort remaining relevant candidates by total_score DESC
        scoredResults.sort((a, b) => b.scoreObj.total_score - a.scoreObj.total_score);

        // Distance filter post-scoring
        if (maxDistance > 0) {
            scoredResults = scoredResults.filter(r => (r.scoreObj.distance_km || 0) <= maxDistance);
        }

        // Format Public Cards
        const publicCards = scoredResults.map(r => {
            const c = r.candidate;
            const candId = c.id || c.user_id;

            // Verified Badge from Step 16 ONLY
            let isVerifiedPro = false;
            let verifiedBadge = null;
            if (global.LyannProVerificationEngine && typeof global.LyannProVerificationEngine.getPublicProfileVerification === 'function') {
                const proProfile = global.LyannProVerificationEngine.getPublicProfileVerification(candId);
                isVerifiedPro = proProfile.is_verified_pro;
                verifiedBadge = proProfile.public_badge;
            } else {
                isVerifiedPro = c.is_verified_pro === true;
                verifiedBadge = isVerifiedPro ? "Professionnel vérifié" : null;
            }

            // Commercial PRO subscription badge from Step 15 ONLY (Without confusion with verified pro)
            let proSubscriptionBadge = null;
            if (c.subscription_plan === 'PRO') {
                proSubscriptionBadge = "PRO";
            }

            // Format Name (First Name + Last Initial)
            const rawName = c.name || c.first_name || "Lyanneur";
            const nameParts = rawName.trim().split(/\s+/);
            const displayName = nameParts.length > 1 ? `${nameParts[0]} ${nameParts[1].charAt(0)}.` : nameParts[0];

            return {
                id: candId,
                display_name: displayName,
                avatar: c.avatar_url || c.avatar || "avatar_01.png",
                role: c.role || c.category || "Membre LYANN",
                city: c.city || c.location || "Guadeloupe",
                approx_distance: r.scoreObj.distance_km ? `À environ ${r.scoreObj.distance_km} km` : "À proximité",
                rating: c.rating || c.average_rating || 4.8,
                reviews_count: c.reviewsCount || c.reviews_count || 0,
                completed_missions_count: c.completed_missions_count || c.missions_count || 0,
                is_verified_pro: isVerifiedPro,
                public_badge: verifiedBadge,
                pro_subscription_badge: proSubscriptionBadge,
                human_reasons: r.scoreObj.human_reasons || ["Disponible dans votre zone"],
                // DEV debugging fields
                source: c.source || 'SUPABASE',
                relevance_score: r.scoreObj.relevance_score || 0,
                matched_fields: r.scoreObj.matched_fields || [],
                total_score: r.scoreObj.total_score || 0
            };
        });


        // Zero Result Conversion Suggestion
        const isZeroResults = publicCards.length === 0;

        return {
            query: rawQuery,
            normalized_query: normQuery,
            intent: intent,
            total_found: publicCards.length,
            is_zero_result: isZeroResults,
            zero_result_message: isZeroResults ? "On n'a pas encore trouvé exactement ce qu'il te faut." : null,
            conversion_request: {
                title: rawQuery,
                category: intent.category || 'general',
                location: options.location || 'Sainte-Anne',
                prefilled_text: rawQuery
            },
            results: publicCards
        };
    }

    // 5. ADMIN SEARCH INSPECTOR (TRANSPARENCY FOR OWNER/ADMIN)
    function inspectSearchQuery(rawQuery, candidates = [], options = {}, callingAdminId = null, permissions = []) {
        // RBAC Enforcement
        const hasPermission = permissions.includes('audit.read') || permissions.includes('settings.manage') || permissions.includes('admin.all');
        if (!hasPermission) {
            return { success: false, error: 'RBAC_PERMISSION_DENIED', message: 'Permission d inspection de recherche manquante.' };
        }

        const normQuery = normalizeSearchQuery(rawQuery);
        const intent = detectSearchIntent(rawQuery);
        const expandedTerms = expandQuerySynonyms(normQuery);
        const searchRes = performUniversalSearch(rawQuery, candidates, options);

        return {
            success: true,
            raw_query: rawQuery,
            normalized_query: normQuery,
            detected_intent: intent.intent,
            detected_category: intent.category,
            expanded_synonyms: expandedTerms,
            evaluated_candidates_count: candidates.length,
            matching_results_count: searchRes.total_found,
            is_fallback_text_used: !intent.category,
            inspector_timestamp: new Date().toISOString()
        };
    }

    // EXPORT PUBLIC ENGINE MODULE
    const LyannSearchEngine = {
        getRecentSearches,
        addRecentSearch,
        clearRecentSearches,
        normalizeSearchQuery,
        expandQuerySynonyms,
        detectSearchIntent,
        performUniversalSearch,
        inspectSearchQuery,
        createDebouncedSearchHandler
    };

    if (typeof window !== 'undefined') {
        window.LyannSearchEngine = LyannSearchEngine;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = LyannSearchEngine;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
