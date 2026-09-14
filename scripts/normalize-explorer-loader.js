const fs = require('fs');

const SCRIPT_PATH = 'script.js';
const FEED_PATH = 'feed.html';

function normalizeScript(source) {
    const start = source.indexOf('// 1. Fetch Candidates (Supabase DB profiles with DEV/DEMO isolation)');
    const end = source.indexOf('// 2. Invoke LyannSearchEngine.performUniversalSearch', start);
    if (start < 0 || end < 0 || end <= start) {
        if (source.includes('LYANN_EXPLORER_REPOSITORY.load()')) return source;
        throw new Error('Explorer candidate loading block not found');
    }

    const replacement = `// 1. Fetch Candidates through centralized cached Explorer repository\n        let candidatesList = [];\n        let callingUserId = null;\n        let searchHasError = false;\n\n        const isExplicitDemoMode = typeof window !== 'undefined' && (\n            window.LYANN_FORCE_DEMO_DATA === true ||\n            (window.location && window.location.search && (\n                window.location.search.includes('demo=true') ||\n                window.location.search.includes('dev_fixtures=true')\n            ))\n        );\n\n        try {\n            if (!window.LYANN_EXPLORER_REPOSITORY) {\n                throw new Error('LYANN_EXPLORER_REPOSITORY unavailable');\n            }\n\n            if (window.LYANN_AUTH_STATE && typeof window.LYANN_AUTH_STATE.getUserId === 'function') {\n                callingUserId = window.LYANN_AUTH_STATE.getUserId() || null;\n            }\n\n            // If cached results exist, use them immediately; repository refresh is deduped.\n            const cachedCandidates = window.LYANN_EXPLORER_REPOSITORY.peek();\n            if (Array.isArray(cachedCandidates)) {\n                candidatesList = cachedCandidates;\n            } else {\n                candidatesList = await window.LYANN_EXPLORER_REPOSITORY.load();\n            }\n        } catch (err) {\n            console.error('❌ [LYANN SEARCH] Explorer repository error:', err);\n            searchHasError = true;\n        }\n\n        if (searchHasError) {\n            container.innerHTML = \`\n                <div class="search-error-state" style="grid-column: 1/-1; padding: 40px 20px; text-align: center; background: #FFF; border-radius: var(--radius-xl); border: 1.5px dashed #E2E8F0;">\n                    <i class="ph ph-warning-circle" style="font-size: 2.5rem; color: #DC2626; margin-bottom: 10px;"></i>\n                    <h4 style="font-weight: 800; font-size: 1.1rem; margin-bottom: 4px; color: #1E293B;">Impossible de charger les Lyanneurs pour le moment.</h4>\n                    <p style="color: var(--text-muted); font-size: 0.9rem;">Veuillez réessayer dans quelques instants.</p>\n                </div>\n            \`;\n            return;\n        }\n\n        // Demo fixtures remain available only when explicitly requested.\n        if (isExplicitDemoMode && candidatesList.length === 0 && window.LYANN_MEMBERS && Array.isArray(window.LYANN_MEMBERS)) {\n            candidatesList = window.LYANN_MEMBERS.map(m => ({\n                id: String(m.id || m.user_id || m.name),\n                user_id: String(m.id || m.user_id || m.name),\n                name: m.name,\n                avatar: m.avatar || '/default-avatar.svg',\n                role: m.role || 'Services & Entraide',\n                category: m.category || 'general',\n                city: m.city || 'Guadeloupe',\n                location: m.location || 'guadeloupe',\n                rating: m.rating || 0,\n                reviewsCount: m.reviewsCount || 0,\n                completed_missions_count: m.completedMissions || 0,\n                is_verified_pro: m.badge === 'Artisan Vérifié' || m.isVerified === true,\n                skills: m.skills || m.keywords || [],\n                bio: m.bio || '',\n                subscription_plan: m.subscription_plan || 'FREE',\n                source: 'DEMO'\n            }));\n        }\n\n        `;

    return source.slice(0, start) + replacement + source.slice(end);
}

function normalizeFeed(source) {
    if (source.includes('explorer-repository.js')) return source;
    const anchor = '<script src="bokantaj-repository.js"></script>';
    if (source.includes(anchor)) {
        return source.replace(anchor, anchor + '\n    <script src="explorer-repository.js"></script>');
    }
    const fallback = '<script src="data-cache.js"></script>';
    if (source.includes(fallback)) {
        return source.replace(fallback, fallback + '\n    <script src="explorer-repository.js"></script>');
    }
    throw new Error('Could not find Explorer repository injection anchor in feed.html');
}

const originalScript = fs.readFileSync(SCRIPT_PATH, 'utf8');
const nextScript = normalizeScript(originalScript);
if (nextScript !== originalScript) fs.writeFileSync(SCRIPT_PATH, nextScript);

const originalFeed = fs.readFileSync(FEED_PATH, 'utf8');
const nextFeed = normalizeFeed(originalFeed);
if (nextFeed !== originalFeed) fs.writeFileSync(FEED_PATH, nextFeed);

console.log('Explorer loader normalization complete.');
