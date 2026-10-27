'use strict';

const EDITORIAL_BADGE = 'Compte éditorial LYANN';

const EDITORIAL_BOTS = [
    {
        slug: 'lyann-actu',
        name: 'LYANN Actu',
        specialty: 'Actualités locales',
        territories: ['guadeloupe', 'martinique', 'guyane', 'reunion'],
        maxPerDay: 3,
        healthReview: false,
        bio: 'Compte éditorial automatisé de LYANN. Il reprend des faits publiés par la presse locale et les sites officiels de Guadeloupe, Martinique, Guyane et La Réunion, avec la source.',
        sources: [
            { name: 'RCI Guadeloupe', url: 'https://rci.fm/guadeloupe/fb/articles_rss_gp', kind: 'rss', territory: 'guadeloupe', maxAgeHours: 168 },
            { name: 'RCI Martinique', url: 'https://rci.fm/martinique/fb/articles_rss_mq', kind: 'rss', territory: 'martinique', maxAgeHours: 168 },
            { name: 'Collectivité Territoriale de Guyane', url: 'https://www.ctguyane.fr/feed/', kind: 'rss', territory: 'guyane', maxAgeHours: 168 },
            { name: 'Free Dom La Réunion', url: 'https://freedom.fr/feed/', kind: 'rss', territory: 'reunion', maxAgeHours: 168 }
        ]
    },
    {
        slug: 'lyann-rimed',
        name: 'LYANN Rimèd',
        specialty: 'Plantes et savoirs locaux',
        territories: ['guadeloupe', 'martinique', 'guyane', 'reunion'],
        maxPerDay: 3,
        healthReview: true,
        bio: 'Compte éditorial automatisé de LYANN. Il présente des plantes et des usages documentés par des sources botaniques. Toute indication de santé reste en attente d’une validation humaine.',
        sources: [
            { name: 'Les Jardins de Nini', url: 'https://lesjardinsdenini.com/feed/', kind: 'rss', territory: 'guadeloupe', maxAgeHours: 336 },
            { name: 'Parc National de la Guadeloupe', url: 'https://www.guadeloupe-parcnational.fr/fr/rss.xml', kind: 'rss', territory: 'guadeloupe', maxAgeHours: 336 },
            { name: 'Parc National de La Réunion', url: 'https://www.reunion-parcnational.fr/fr/rss.xml', kind: 'rss', territory: 'reunion', maxAgeHours: 336 },
            { name: 'TRAMIL', url: 'https://www.tramil.net/fr', kind: 'manual', territory: 'caraibe', note: 'Référentiel ethnopharmacologique caribéen (veille documentaire).' }
        ]
    },
    {
        slug: 'lyann-jardinaj',
        name: 'LYANN Jardinaj',
        specialty: 'Jardin et agriculture tropicale',
        territories: ['guadeloupe', 'martinique', 'guyane', 'reunion'],
        maxPerDay: 3,
        healthReview: false,
        bio: 'Compte éditorial automatisé de LYANN. Il relaie des conseils de jardin, de biodiversité et d’agriculture adaptés au climat tropical, à partir de sources publiques.',
        sources: [
            { name: 'Parc National de La Réunion', url: 'https://www.reunion-parcnational.fr/fr/rss.xml', kind: 'rss', territory: 'reunion', maxAgeHours: 336 },
            { name: 'Parc Amazonien de Guyane', url: 'https://www.parc-amazonien-guyane.fr/fr/rss.xml', kind: 'rss', territory: 'guyane', maxAgeHours: 336 },
            { name: 'Les Jardins de Nini', url: 'https://lesjardinsdenini.com/feed/', kind: 'rss', territory: 'guadeloupe', maxAgeHours: 336 },
            { name: 'CIRAD', url: 'https://www.cirad.fr/rss/actualites', kind: 'manual', territory: 'caraibe', note: 'Veille agronomique tropicale.' }
        ]
    },
    {
        slug: 'lyann-trafik',
        name: 'LYANN Trafik',
        specialty: 'Circulation et vigilance pratique',
        territories: ['guadeloupe', 'martinique', 'guyane', 'reunion'],
        maxPerDay: 3,
        healthReview: false,
        bio: 'Compte éditorial automatisé de LYANN. Il reprend les communiqués de circulation, météo, eau et vigilance publiés par les autorités et médias locaux des outre-mer.',
        sources: [
            { name: 'Routes de Guadeloupe', url: 'https://www.routesdeguadeloupe.fr/feed/', kind: 'rss', territory: 'guadeloupe', maxAgeHours: 240 },
            { name: 'RCI Guadeloupe', url: 'https://rci.fm/guadeloupe/fb/articles_rss_gp', kind: 'rss', territory: 'guadeloupe', maxAgeHours: 168, requireTerms: ['route', 'circulation', 'trafic', 'travaux', 'fermeture', 'déviation', 'rn', 'rd', 'accident', 'vigilance', 'météo', 'eau', 'coupure', 'transport', 'pont'] },
            { name: 'RCI Martinique', url: 'https://rci.fm/martinique/fb/articles_rss_mq', kind: 'rss', territory: 'martinique', maxAgeHours: 168, requireTerms: ['route', 'circulation', 'trafic', 'travaux', 'fermeture', 'déviation', 'rn', 'rd', 'accident', 'vigilance', 'météo', 'eau', 'coupure', 'transport', 'pont'] },
            { name: 'Free Dom La Réunion', url: 'https://freedom.fr/feed/', kind: 'rss', territory: 'reunion', maxAgeHours: 168, requireTerms: ['route', 'circulation', 'trafic', 'travaux', 'fermeture', 'déviation', 'rn', 'rd', 'accident', 'vigilance', 'météo', 'eau', 'coupure', 'transport', 'littoral'] }
        ]
    },
    {
        slug: 'lyann-kilti',
        name: 'LYANN Kilti',
        specialty: 'Agenda culturel et patrimoine',
        territories: ['guadeloupe', 'martinique', 'guyane', 'reunion'],
        maxPerDay: 3,
        healthReview: false,
        bio: 'Compte éditorial automatisé de LYANN. Il signale des événements, initiatives patrimoniales et rendez-vous annoncés par les institutions et acteurs culturels des outre-mer.',
        sources: [
            { name: 'L’Artchipel Scène Nationale Guadeloupe', url: 'https://www.lartchipel.com/feed/', kind: 'rss', territory: 'guadeloupe', maxAgeHours: 336 },
            { name: 'Collectivité Territoriale de Martinique', url: 'https://www.collectivitedemartinique.mq/feed/', kind: 'rss', territory: 'martinique', maxAgeHours: 336 },
            { name: 'Collectivité Territoriale de Guyane', url: 'https://www.ctguyane.fr/feed/', kind: 'rss', territory: 'guyane', maxAgeHours: 336 },
            { name: 'Parc National de La Réunion', url: 'https://www.reunion-parcnational.fr/fr/rss.xml', kind: 'rss', territory: 'reunion', maxAgeHours: 336 }
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
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
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
        const desc = pick('description');
        const encoded = pick('content:encoded');
        const summary = desc.length >= 80 || !encoded ? desc : [desc, encoded].filter(Boolean).join(' ');
        return {
            title: pick('title'),
            url: pick('link'),
            summary,
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
    return {
        subject: item.title,
        facts: body,
        proposedText: body,
        sourceName: item.sourceName,
        sourceUrl: item.url,
        originalPublishedAt: item.publishedAt || null,
        territory: item.territory || bot.territories[0],
        validationStatus: bot.healthReview || ambiguous ? 'HUMAN_REQUIRED' : 'READY_FOR_REVIEW',
        healthReview: Boolean(bot.healthReview)
    };
}

function editorialPassSlot(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Guadeloupe',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(now);
    const value = (type) => parts.find((part) => part.type === type).value;
    const hour = Number(value('hour'));
    const slot = hour < 12 ? '07' : hour < 17 ? '12' : '17';
    return `${value('year')}-${value('month')}-${value('day')}T${slot}`;
}

function nextEditorialPass(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Guadeloupe',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(now);
    const value = (type) => parts.find((part) => part.type === type).value;
    const minutes = Number(value('hour')) * 60 + Number(value('minute'));
    const slots = [7 * 60, 12 * 60, 17 * 60];
    const upcoming = slots.find((slot) => slot > minutes);
    const wait = upcoming == null ? (24 * 60 - minutes + 7 * 60) : (upcoming - minutes);
    const next = new Date(now.getTime() + wait * 60000);
    const nextParts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Guadeloupe',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(next);
    const nextValue = (type) => nextParts.find((part) => part.type === type).value;
    const local = `${nextValue('hour')}:${nextValue('minute')}`;
    return {
        local,
        label: `${nextValue('year')}-${nextValue('month')}-${nextValue('day')} ${local} America/Guadeloupe`
    };
}

function guadeloupeDayStart(now = new Date()) {
    const day = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Guadeloupe',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(now);
    return new Date(`${day}T04:00:00.000Z`).toISOString();
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

function essentialFacts(facts) {
    const text = String(facts || '');
    const years = text.match(/\b(?:19|20)\d{2}\b/g) || [];
    const amounts = text.match(/\d+(?:[.,]\d+)?\s*millions?(?:\s*d['’]euros)?|\d+(?:[.,]\d+)?\s*(?:€|euros?)/gi) || [];
    return [...new Set([...years, ...amounts])];
}

function factAppears(text, token) {
    const compact = (value) => String(value || '').toLowerCase().replace(/[\s\u00a0]/g, '').replace(/euros?/g, '€').replace(/d['’]/g, '');
    return compact(text).includes(compact(token));
}

function reviewEditorialText(input) {
    const text = String(input && input.text || '').trim();
    const facts = String(input && input.facts || '').trim();
    const reasons = [];
    if (facts.length < 40) reasons.push('faits insuffisants');
    if (!text) reasons.push('texte vide');
    for (const token of essentialFacts(facts)) {
        if (!factAppears(text, token)) reasons.push('fait essentiel absent: ' + token);
    }
    if (/il est important de noter|en conclusion|n['’]hésitez pas/i.test(text)) reasons.push('formule de remplissage');
    if (input && input.healthReview && /soulage|gu[ée]rit|efficace|b[ée]n[ée]fiques?|apais|soigne|dosage|pr[ée]paration/i.test(text)) {
        reasons.push('affirmation thérapeutique insuffisamment fondée');
    }
    return { ok: reasons.length === 0, reasons };
}

function assertHumanApproval(approver) {
    if (!approver || !approver.userId) return { ok: false, reason: 'validation humaine requise' };
    if (approver.actor === 'script-de-test') return { ok: false, reason: 'un script ne peut pas approuver' };
    return { ok: true };
}

function acceptRewrittenText(raw, draft) {
    const text = String(raw || '').replace(/^["'\s]+|["'\s]+$/g, '').trim();
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 40 || words.length > 120) return '';
    if (draft.sourceUrl && text.includes(draft.sourceUrl)) return '';
    if (/source\s*:/i.test(text)) return '';
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
    editorialPassSlot,
    nextEditorialPass,
    guadeloupeDayStart,
    acceptRewrittenText,
    essentialFacts,
    reviewEditorialText,
    assertHumanApproval
};
