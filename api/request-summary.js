'use strict';

// Suggests the short annonce title (60 characters) from the free-text need.
// The suggestion is always a suggestion: the author reviews and can rewrite it
// before publishing, and the server never persists anything here.
//
// The AI call is optional. When no provider is configured, or when the provider
// is slow, rate-limited or malformed, a deterministic local summary is returned
// instead so publishing is never blocked by an external dependency.

const TITLE_MAX = 60;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 4000;
const PROVIDER_TIMEOUT_MS = 6000;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// Openings that carry no information about the need itself.
const LEAD_NOISE = [
    /^(bonjour|bonsoir|salut|hello|coucou|re)\b[\s,!.:-]*/i,
    // Longest alternatives first: "d'un" would otherwise consume "d'une".
    /^(j['’]aurais|j['’]ai)\s+besoin\s+(d['’]une|d['’]un|des|de\s+la|du|de|d['’])\s*/i,
    /^je\s+(cherche|recherche|voudrais|souhaite|veux)\s+(une|un|des|de\s+la|du|a|à)?\s*/i,
    /^il\s+me\s+(faudrait|faut)\s+(un|une|des)?\s*/i,
    /^(je\s+suis\s+à\s+la\s+recherche\s+d['’])\s*/i,
    /^(qui\s+(peut|pourrait)\s+m['’]aider\s+(a|à)?)\s*/i
];

function squash(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

// Cuts on a word boundary so a title never ends mid-word.
function clampToTitle(value) {
    const text = squash(value).replace(/^["'«»“”\s]+|["'«»“”\s.,;:!?-]+$/g, '');
    if (text.length <= TITLE_MAX) return text;
    const cut = text.slice(0, TITLE_MAX + 1);
    const lastSpace = cut.lastIndexOf(' ');
    const trimmed = lastSpace > TITLE_MAX * 0.5 ? cut.slice(0, lastSpace) : text.slice(0, TITLE_MAX);
    return dropDanglingWord(trimmed.replace(/[\s,;:.-]+$/, ''));
}

// Cutting on a word boundary can still leave a trailing preposition or article
// ("... mon terrain de 500m2 à"), which reads as an unfinished sentence.
function dropDanglingWord(value) {
    return value.replace(/\s+(a|à|de|du|des|d['’]|le|la|les|un|une|en|et|ou|pour|sur|dans|avec|chez|par)$/i, '');
}

function heuristicTitle(description) {
    let text = squash(description);
    let changed = true;
    while (changed) {
        changed = false;
        for (const pattern of LEAD_NOISE) {
            const stripped = text.replace(pattern, '');
            if (stripped !== text) {
                text = stripped;
                changed = true;
            }
        }
    }
    // The opening clause names the need; the rest holds the details that belong to
    // the full description shown on the annonce page. A very short opening clause
    // ("Urgent") says nothing on its own, so it absorbs the following one.
    const clauses = text.split(/(?<=[.!?])\s+|\s*[,;]\s*/).map(squash).filter(Boolean);
    let summary = clauses[0] || text;
    for (let i = 1; i < clauses.length && summary.length < 25; i += 1) {
        summary = `${summary}, ${clauses[i]}`;
    }
    return capitalize(clampToTitle(summary));
}

function sanitizeProviderTitle(raw) {
    const firstLine = squash(String(raw || '').split('\n').find(line => squash(line)) || '');
    // Models occasionally answer with a "Titre : ..." preamble or bullet marker.
    const stripped = firstLine.replace(/^[-*•\d.\s]*/, '').replace(/^titre\s*:?\s*/i, '');
    return capitalize(clampToTitle(stripped));
}

function providerConfig(env) {
    const apiKey = env.LYANN_AI_API_KEY;
    if (!apiKey) return null;
    return {
        apiKey,
        baseUrl: (env.LYANN_AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
        model: env.LYANN_AI_MODEL || 'gpt-4o-mini'
    };
}

async function requestProviderTitle(config, description, fetchImpl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
        const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
            body: JSON.stringify({
                model: config.model,
                temperature: 0.2,
                max_tokens: 40,
                messages: [
                    {
                        role: 'system',
                        content: [
                            'Tu résumes une demande de service en un titre court en français.',
                            `Contraintes: ${TITLE_MAX} caractères maximum, une seule ligne, pas de guillemets,`,
                            'pas de point final, pas de prix, pas de date, pas de nom de personne.',
                            'Garde le service demandé et son objet. Réponds uniquement par le titre.'
                        ].join(' ')
                    },
                    { role: 'user', content: description }
                ]
            })
        });
        if (!response.ok) return null;
        const payload = await response.json();
        const title = sanitizeProviderTitle(payload?.choices?.[0]?.message?.content);
        return title && title.length >= 3 ? title : null;
    } catch (_) {
        // Timeout, network failure or malformed payload: fall back silently.
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function createRateLimiter(max = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW_MS) {
    const hits = new Map();
    return function allow(key) {
        const now = Date.now();
        const recent = (hits.get(key) || []).filter(at => now - at < windowMs);
        if (recent.length >= max) {
            hits.set(key, recent);
            return false;
        }
        recent.push(now);
        hits.set(key, recent);
        if (hits.size > 5000) {
            for (const [candidate, stamps] of hits) {
                if (!stamps.some(at => now - at < windowMs)) hits.delete(candidate);
            }
        }
        return true;
    };
}

function createRequestSummaryHandler({ getSupabaseClient, env = process.env, fetchImpl = fetch } = {}) {
    const allow = createRateLimiter();
    return async (req, res) => {
        res.set('Cache-Control', 'no-store');

        const description = typeof req.body?.description === 'string' ? squash(req.body.description) : '';
        const extraKeys = Object.keys(req.body || {}).filter(key => key !== 'description');
        if (extraKeys.length || description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
            return res.status(400).json({ error: 'Description invalide pour générer un titre.' });
        }

        // Only a signed-in member can publish an annonce, so only a signed-in member
        // may spend a provider call.
        let userId = null;
        try {
            const { data, error } = await getSupabaseClient(req).auth.getUser();
            userId = error ? null : data?.user?.id || null;
        } catch (_) {
            userId = null;
        }
        if (!userId) return res.status(401).json({ error: 'Connexion requise.' });
        if (!allow(userId)) return res.status(429).json({ error: 'Trop de suggestions demandées. Réessayez dans quelques minutes.' });

        const fallback = heuristicTitle(description);
        const config = providerConfig(env);
        const suggestion = config ? await requestProviderTitle(config, description, fetchImpl) : null;
        const title = suggestion || fallback;

        return res.json({
            title,
            source: suggestion ? 'AI' : 'HEURISTIC',
            maxLength: TITLE_MAX
        });
    };
}

module.exports = {
    createRequestSummaryHandler,
    heuristicTitle,
    clampToTitle,
    sanitizeProviderTitle,
    TITLE_MAX
};
