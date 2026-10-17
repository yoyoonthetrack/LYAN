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
            { name: 'Guadeloupe La 1ère', url: 'https://www.franceinfo.fr/guadeloupe.rss', kind: 'rss', territory: 'guadeloupe' },
            { name: 'Martinique La 1ère', url: 'https://www.franceinfo.fr/martinique.rss', kind: 'rss', territory: 'martinique' }
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
            { name: 'TRAMIL', url: 'https://www.tramil.net/fr', kind: 'page', territory: 'caraibe' },
            { name: 'Les Jardins de Nini', url: 'https://lesjardinsdenini.com/', kind: 'page', territory: 'guadeloupe' }
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
            { name: 'INRAE', url: 'https://www.inrae.fr/actualites', kind: 'page', territory: 'caraibe' },
            { name: 'Les Jardins de Nini', url: 'https://lesjardinsdenini.com/', kind: 'page', territory: 'guadeloupe' }
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
            { name: 'Routes de Guadeloupe', url: 'https://www.routesdeguadeloupe.fr/', kind: 'page', territory: 'guadeloupe' }
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
            { name: 'Guadeloupe La 1ère — culture', url: 'https://www.franceinfo.fr/guadeloupe/culture.rss', kind: 'rss', territory: 'guadeloupe' },
            { name: 'Martinique La 1ère — culture', url: 'https://www.franceinfo.fr/martinique/culture.rss', kind: 'rss', territory: 'martinique' }
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

module.exports = {
    EDITORIAL_BADGE,
    EDITORIAL_BOTS,
    editorialEmail,
    stripTags,
    parseRssItems,
    limitWords,
    draftFromSource,
    canCollect
};
