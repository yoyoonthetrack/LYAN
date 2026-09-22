'use strict';

// Suggests three short annonce titles (60 characters each) from the free-text need.
// The titles come from the configured AI provider only: the server never invents
// local stand-ins. The author still chooses one and may rewrite it before publishing.
// Nothing is persisted here.

const TITLE_MAX = 60;
const TITLE_COUNT = 3;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 4000;
const PROVIDER_TIMEOUT_MS = 10000;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function squash(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function clampToTitle(value) {
    const text = squash(value).replace(/^["'«»“”\s]+|["'«»“”\s.,;:!?-]+$/g, '');
    if (text.length <= TITLE_MAX) return text;
    const cut = text.slice(0, TITLE_MAX + 1);
    const lastSpace = cut.lastIndexOf(' ');
    const trimmed = lastSpace > TITLE_MAX * 0.5 ? cut.slice(0, lastSpace) : text.slice(0, TITLE_MAX);
    return dropDanglingWord(trimmed.replace(/[\s,;:.-]+$/, ''));
}

function dropDanglingWord(value) {
    return value.replace(/\s+(a|à|de|du|des|d['’]|le|la|les|un|une|en|et|ou|pour|sur|dans|avec|chez|par)$/i, '');
}

function sanitizeProviderTitle(raw) {
    const line = squash(String(raw || ''));
    const stripped = line
        .replace(/^\s*(?:[-*•]|\d+[.)\-:])\s*/, '')
        .replace(/^titre\s*\d*\s*:?\s*/i, '');
    return capitalize(clampToTitle(stripped));
}

function uniqueTitles(values) {
    const seen = new Set();
    const titles = [];
    for (const value of values || []) {
        const title = sanitizeProviderTitle(value);
        const key = title.toLowerCase();
        if (title.length < 3 || seen.has(key)) continue;
        seen.add(key);
        titles.push(title);
        if (titles.length === TITLE_COUNT) break;
    }
    return titles;
}

function parseJsonTitles(raw) {
    const text = String(raw || '');
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.search(/[\[{]/);
    if (start < 0) return [];
    const opening = candidate[start];
    const closing = opening === '[' ? ']' : '}';
    const end = candidate.lastIndexOf(closing);
    if (end <= start) return [];
    try {
        const parsed = JSON.parse(candidate.slice(start, end + 1));
        const list = Array.isArray(parsed) ? parsed : parsed.titles;
        return Array.isArray(list) ? uniqueTitles(list) : [];
    } catch (_) {
        return [];
    }
}

function parseProviderTitles(raw) {
    const fromJson = parseJsonTitles(raw);
    if (fromJson.length === TITLE_COUNT) return fromJson;
    const fromLines = uniqueTitles(String(raw || '').split(/\n+/));
    return fromLines.length >= fromJson.length ? fromLines : fromJson;
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

async function requestProviderTitles(config, description, fetchImpl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
        const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
            body: JSON.stringify({
                model: config.model,
                temperature: 0.5,
                max_tokens: 180,
                messages: [
                    {
                        role: 'system',
                        content: [
                            'Tu proposes exactement 3 titres courts distincts, en français, pour une demande de service.',
                            'Chaque titre reprend le besoin réel de la personne : le service et son objet.',
                            `Contraintes: ${TITLE_MAX} caractères maximum, une seule ligne, pas de guillemets,`,
                            'pas de point final, pas de prix, pas de date, pas de nom de personne.',
                            'Le premier titre est le plus direct. Le deuxième varie l’angle. Le troisième est plus court.',
                            'Réponds uniquement par un JSON: {"titles":["...","...","..."]}'
                        ].join(' ')
                    },
                    { role: 'user', content: description }
                ]
            })
        });
        if (!response.ok) return [];
        const payload = await response.json();
        return parseProviderTitles(payload?.choices?.[0]?.message?.content);
    } catch (_) {
        return [];
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

        let userId = null;
        try {
            const { data, error } = await getSupabaseClient(req).auth.getUser();
            userId = error ? null : data?.user?.id || null;
        } catch (_) {
            userId = null;
        }
        if (!userId) return res.status(401).json({ error: 'Connexion requise.' });
        if (!allow(userId)) return res.status(429).json({ error: 'Trop de suggestions demandées. Réessayez dans quelques minutes.' });

        const config = providerConfig(env);
        if (!config) {
            return res.status(503).json({ error: 'Les titres automatiques ne sont pas disponibles pour le moment.' });
        }

        let titles = await requestProviderTitles(config, description, fetchImpl);
        if (titles.length < TITLE_COUNT) {
            titles = await requestProviderTitles(config, description, fetchImpl);
        }
        if (titles.length < TITLE_COUNT) {
            return res.status(502).json({ error: 'Les titres n’ont pas pu être proposés. Réessayez.' });
        }

        return res.json({
            titles,
            title: titles[0],
            source: 'AI',
            maxLength: TITLE_MAX
        });
    };
}

module.exports = {
    createRequestSummaryHandler,
    clampToTitle,
    sanitizeProviderTitle,
    parseProviderTitles,
    TITLE_MAX,
    TITLE_COUNT
};
