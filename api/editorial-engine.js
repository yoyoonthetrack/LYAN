'use strict';

const EDITORIAL_BADGE = 'Compte éditorial IA LYANN';

const EDITORIAL_BOTS = [
    {
        slug: 'lyann-actu',
        name: 'LYANN Actu',
        specialty: 'Actualités locales',
        territories: ['guadeloupe', 'martinique'],
        maxPerDay: 4,
        healthReview: false,
        bio: 'Compte éditorial automatisé de LYANN. Il reprend des faits publiés par la presse locale et les sites officiels de Guadeloupe et de Martinique, avec la source.',
        sources: [
            { name: 'RCI Guadeloupe', url: 'https://rci.fm/guadeloupe/fb/articles_rss_gp', kind: 'rss', territory: 'guadeloupe' },
            { name: 'RCI Martinique', url: 'https://rci.fm/martinique/fb/articles_rss_mq', kind: 'rss', territory: 'martinique' },
            { name: 'Guadeloupe La 1ère', url: 'https://www.franceinfo.fr/guadeloupe.rss', kind: 'rss', territory: 'guadeloupe', note: 'Le flux répond, mais il ne contient aucun article.' },
            { name: 'France-Antilles Guadeloupe', url: 'https://www.guadeloupe.franceantilles.fr/', kind: 'manual', territory: 'guadeloupe', note: 'Page publique sans flux d’articles exploitable.' }
        ]
    },
    {
        slug: 'lyann-rimed',
        name: 'LYANN Rimèd',
        specialty: 'Plantes et savoirs locaux',
        territories: ['guadeloupe', 'martinique'],
        maxPerDay: 1,
        healthReview: true,
        bio: 'Compte éditorial automatisé de LYANN. Il présente des plantes et des usages documentés par des sources botaniques. Toute indication de santé reste en attente d’une validation humaine.',
        sources: [
            { name: 'Les Jardins de Nini', url: 'https://lesjardinsdenini.com/feed/', kind: 'rss', territory: 'guadeloupe' },
            { name: 'TRAMIL', url: 'https://www.tramil.net/fr', kind: 'manual', territory: 'caraibe', note: 'Le site public ne publie pas de flux d’articles.' }
        ]
    },
    {
        slug: 'lyann-jardinaj',
        name: 'LYANN Jardinaj',
        specialty: 'Jardin et agriculture tropicale',
        territories: ['guadeloupe', 'martinique'],
        maxPerDay: 2,
        healthReview: false,
        bio: 'Compte éditorial automatisé de LYANN. Il relaie des conseils de jardin et d’agriculture adaptés au climat tropical, à partir de sources agricoles publiques.',
        sources: [
            { name: 'CIRAD', url: 'https://www.cirad.fr/rss/actualites', kind: 'manual', territory: 'caraibe', note: 'Le flux existe, mais les articles du jour ne portent pas sur la culture aux Antilles.' },
            { name: 'Les Jardins de Nini', url: 'https://lesjardinsdenini.com/feed/', kind: 'manual', territory: 'guadeloupe', note: 'Les articles récents portent sur la santé, pas sur la culture.' },
            { name: 'INRAE', url: 'https://www.inrae.fr/actualites', kind: 'manual', territory: 'caraibe', note: 'Pas de flux RSS trouvé.' }
        ]
    },
    {
        slug: 'lyann-trafik',
        name: 'LYANN Trafik',
        specialty: 'Circulation',
        territories: ['guadeloupe'],
        maxPerDay: 4,
        healthReview: false,
        bio: 'Compte éditorial automatisé de LYANN. Il reprend les communiqués de circulation publiés par les autorités routières de Guadeloupe.',
        sources: [
            { name: 'Routes de Guadeloupe', url: 'https://www.routesdeguadeloupe.fr/feed/', kind: 'rss', territory: 'guadeloupe', maxAgeHours: 48 }
        ]
    },
    {
        slug: 'lyann-kilti',
        name: 'LYANN Kilti',
        specialty: 'Agenda culturel',
        territories: ['guadeloupe', 'martinique'],
        maxPerDay: 3,
        healthReview: false,
        bio: 'Compte éditorial automatisé de LYANN. Il signale des événements annoncés par les agendas culturels, les communes et les organisateurs.',
        sources: [
            { name: 'Les îles de Guadeloupe', url: 'https://www.lesilesdeguadeloupe.com/agenda/', kind: 'jsonld', territory: 'guadeloupe' },
            { name: 'Guadeloupe La 1ère — culture', url: 'https://www.franceinfo.fr/guadeloupe/culture.rss', kind: 'manual', territory: 'guadeloupe', note: 'Le flux culture ne contient aucun article.' }
        ]
    }
];

function editorialEmail(slug) {
    return `${slug}@lyann.app`;
}

function stripTags(value) {
    return String(value || '')
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function parseRssItems(xml) {
    const chunks = String(xml || '').split(/<item\b/i).slice(1);
    return chunks.map((chunk) => {
        const pick = (tag) => {
            const match = chunk.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
            return match ? stripTags(match[1]) : '';
        };
        return {
            title: pick('title'),
            url: pick('link'),
            summary: pick('description'),
            publishedAt: pick('pubDate')
        };
    }).filter((item) => item.title && item.url);
}

function limitWords(text, maxWords) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return words.join(' ');
    return `${words.slice(0, maxWords).join(' ')}…`;
}

function draftFromSource(item, bot) {
    const facts = [item.title, item.summary].filter(Boolean).join(' ');
    const body = limitWords(stripTags(facts), 90);
    if (!body || !item.url) return null;
    const ambiguous = /peut-être|rumeur|non confirmé|selon certaines sources/i.test(body);
    const text = `${body}\n\nSource : ${item.sourceName}. ${item.url}`;
    return {
        subject: item.title,
        facts: body,
        proposedText: text,
        sourceName: item.sourceName,
        sourceUrl: item.url,
        originalPublishedAt: item.publishedAt || null,
        territory: item.territory || bot.territories[0],
        validationStatus: bot.healthReview || ambiguous ? 'HUMAN_REQUIRED' : 'READY_FOR_REVIEW',
        healthReview: Boolean(bot.healthReview)
    };
}

function canCollect(bot, publishedToday) {
    if (!bot || bot.status === 'SUSPENDED' || bot.status === 'PAUSED') return false;
    return Number(publishedToday || 0) < Number(bot.maxPerDay || 1);
}

function classifyFeed(body, expectedKind) {
    const text = String(body || '');
    const lower = text.toLowerCase();
    if (!text.trim()) return 'inaccessible';
    if (expectedKind === 'manual') return 'veille manuelle';
    const looksXml = lower.includes('<rss') || lower.includes('<feed') || lower.includes('<item') || lower.includes('<entry');
    if (expectedKind === 'rss' && !looksXml) return 'flux invalide';
    if (expectedKind === 'rss') {
        const items = parseRssItems(text).filter((item) => item.title && item.url && item.summary);
        if (!items.length) return 'flux vide';
        return 'exploitable';
    }
    if (expectedKind === 'jsonld') {
        if (!lower.includes('application/ld+json')) return 'flux invalide';
        return 'exploitable';
    }
    return 'veille manuelle';
}

function parseJsonLdList(html) {
    const blocks = String(html || '').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi) || [];
    const events = [];
    for (const block of blocks) {
        const raw = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
        let data;
        try { data = JSON.parse(raw); } catch (_) { continue; }
        const list = data['@type'] === 'ItemList' ? data.itemListElement || [] : [];
        for (const entry of list) {
            if (entry && entry.url && entry.name) events.push({ title: entry.name, url: entry.url });
        }
    }
    return events;
}

function parseEventJsonLd(html) {
    const blocks = String(html || '').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi) || [];
    for (const block of blocks) {
        const raw = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
        let data;
        try { data = JSON.parse(raw); } catch (_) { continue; }
        if (data['@type'] !== 'Event' || !data.name || !data.url) continue;
        const place = data.location && (data.location.name || data.location.address) || '';
        return {
            title: data.name,
            url: data.url,
            summary: [data.description, place, data.startDate && `Du ${data.startDate}`, data.endDate && `au ${data.endDate}`].filter(Boolean).join(' '),
            publishedAt: data.startDate || ''
        };
    }
    return null;
}

function isFresh(dateValue, now, maxAgeHours) {
    if (!maxAgeHours) return true;
    const time = Date.parse(dateValue || '');
    if (!Number.isFinite(time)) return false;
    return now - time <= maxAgeHours * 3600 * 1000;
}

function matchesTerms(item, terms) {
    if (!terms || !terms.length) return true;
    const blob = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
    return terms.some((term) => blob.includes(String(term).toLowerCase()));
}

function acceptRewrittenText(raw, draft) {
    const text = String(raw || '').replace(/^["'\s]+|["'\s]+$/g, '').trim();
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 40 || words.length > 120) return '';
    if (!draft.sourceUrl || !text.includes(draft.sourceUrl)) return '';
    if (text.trim() === String(draft.subject || '').trim()) return '';
    return text;
}

module.exports = {
    EDITORIAL_BADGE,
    EDITORIAL_BOTS,
    editorialEmail,
    stripTags,
    parseRssItems,
    limitWords,
    draftFromSource,
    canCollect,
    classifyFeed,
    parseJsonLdList,
    parseEventJsonLd,
    isFresh,
    matchesTerms,
    acceptRewrittenText
};
