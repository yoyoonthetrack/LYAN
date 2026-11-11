'use strict';
/*
 * Outillage HORS APPLICATION de la phase 3.2B (audit de taxonomie).
 * Rien ici n'est chargé par le site ni par l'app : ces fonctions servent à générer les documents,
 * à tester la cohérence de la proposition et à simuler la classification d'annonces.
 */
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', '..', 'docs', 'taxonomy', 'data');

function normalize(value) {
    return String(value || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[’']/g, ' ')
        .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
        .map(stem)
        .join(' ');
}

// Racine très légère : pluriels réguliers uniquement (même règle côté requête et côté dictionnaire).
function stem(token) {
    if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
    if (token.length > 5 && token.endsWith('x') && !token.endsWith('eux')) return token.slice(0, -1);
    return token;
}

function loadData() {
    // eslint-disable-next-line global-require
    return require(path.join(DATA_DIR, 'taxonomy-v2.data.js'));
}

function flatten(data = loadData()) {
    const nodes = [];
    const byCode = new Map();
    const push = (node) => {
        nodes.push(node);
        byCode.set(node.code, node);
        return node;
    };
    const mkTerms = (node, lists) => {
        const out = [];
        const seen = new Set();
        const foldKey = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
        const add = (term, type) => {
            const norm = normalize(term);
            if (!norm) return;
            const key = `${type}:${norm}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ term, norm, type, territories: (lists.territoryTerms && lists.territoryTerms[foldKey(term)]) || null });
        };
        add(node.label, 'label');
        for (const t of lists.t || []) add(t, 'syn');
        for (const p of lists.p || []) add(p, 'problem');
        for (const l of lists.l || []) add(l, 'local');
        return out;
    };

    for (const family of data.FAMILIES) {
        push({
            code: family.code, kind: 'family', parent: null, family: family.code, label: family.label,
            short: family.short, pitch: family.pitch, icon: family.icon, tone: family.tone, ord: family.ord,
            groups: family.groups, also: [], safety: 'NORMAL', selectable: false, regulation: null,
            terms: mkTerms(family, { t: family.t })
        });
    }
    let tradeOrd = 0;
    for (const trade of data.TRADES) {
        tradeOrd += 1;
        const node = push({
            code: trade.code, kind: 'trade', parent: null, family: trade.family, group: trade.group, label: trade.label,
            also: trade.also || [], safety: trade.safety, selectable: trade.selectable, regulation: trade.regulation,
            ord: tradeOrd, terms: mkTerms(trade, trade)
        });
        let specOrd = 0;
        for (const spec of trade.specs) {
            specOrd += 1;
            push({
                code: spec.code, kind: 'specialty', parent: trade.code, family: trade.family, group: trade.group, label: spec.label,
                also: spec.also || [], safety: spec.safety, selectable: spec.selectable, regulation: spec.regulation,
                ord: specOrd, terms: mkTerms(spec, spec)
            });
        }
    }
    return { nodes, byCode };
}

function build(data = loadData()) {
    const { nodes, byCode } = flatten(data);
    return { nodes, byCode, data };
}

/** Index terme normalisé → [{node, type}] */
function termIndex(nodes) {
    const index = new Map();
    for (const node of nodes) {
        if (node.kind === 'family') continue;
        for (const term of node.terms) {
            if (!index.has(term.norm)) index.set(term.norm, []);
            index.get(term.norm).push({ node, type: term.type, term: term.term });
        }
    }
    return index;
}

function tradeOf(node, byCode) {
    return node.kind === 'specialty' ? byCode.get(node.parent) : node;
}

/**
 * Collisions entre métiers différents sur un même terme normalisé.
 * Une collision entre une spécialité et son propre métier n'en est pas une.
 */
function collisions(nodes, byCode) {
    const index = termIndex(nodes);
    const out = [];
    for (const [norm, hits] of index) {
        const trades = new Set(hits.map((h) => tradeOf(h.node, byCode).code));
        if (trades.size > 1) out.push({ norm, trades: [...trades].sort(), nodes: hits.map((h) => h.node.code) });
    }
    return out.sort((a, b) => a.norm.localeCompare(b.norm));
}

const TYPE_WEIGHT = { label: 34, syn: 28, problem: 46, local: 28 };

/**
 * Simulation de classification (prototype d'évaluation, pas une implémentation applicative).
 * - un terme ne compte que s'il apparaît en mots entiers dans le texte normalisé ;
 * - plus le terme est long (en mots), plus il pèse ;
 * - un terme déclaré ambigu pèse peu et déclenche une question de précision.
 */
function classify(text, ctx) {
    const { nodes, byCode, data } = ctx;
    const index = ctx.index || (ctx.index = termIndex(nodes));
    const norm = ` ${normalize(text)} `;
    const scores = new Map();
    const ambiguousHits = [];
    for (const [term, hits] of index) {
        if (!norm.includes(` ${term} `)) continue;
        const words = term.split(' ').length;
        const sharedBy = new Set(hits.map((h) => tradeOf(h.node, byCode).code)).size;
        const ambiguous = Boolean(data.AMBIGUOUS_TERMS[term]) || Object.keys(data.AMBIGUOUS_TERMS).some((k) => normalize(k) === term);
        for (const hit of hits) {
            const base = TYPE_WEIGHT[hit.type] || 20;
            let weight = base + 9 * (words - 1) + Math.min(term.length, 14) * 0.4;
            weight /= Math.pow(sharedBy, 0.7); // un terme partagé par plusieurs métiers discrimine moins
            if (ambiguous) weight = Math.min(weight, 6);
            if (hit.node.kind === 'specialty') weight += 4;
            const entry = scores.get(hit.node.code) || { node: hit.node, score: 0, matched: [], weights: [] };
            entry.score += weight;
            if (!entry.matched.includes(term)) entry.matched.push(term);
            entry.weights.push({ term, value: weight });
            scores.set(hit.node.code, entry);
        }
        if (ambiguous) ambiguousHits.push(term);
    }
    for (const key of Object.keys(data.AMBIGUOUS_TERMS)) {
        const k = normalize(key);
        if (norm.includes(` ${k} `) && !ambiguousHits.includes(k)) ambiguousHits.push(k);
    }
    // Par métier : le meilleur terme compte plein pot, les autres apportent un bonus plafonné.
    // Les termes inclus dans un terme plus long du même nœud ne comptent pas deux fois.
    const perTrade = new Map();
    for (const entry of scores.values()) {
        const trade = tradeOf(entry.node, byCode);
        const current = perTrade.get(trade.code) || { trade, entries: [] };
        current.entries.push(entry);
        perTrade.set(trade.code, current);
    }
    for (const current of perTrade.values()) {
        current.best = null;
        const weights = [];
        for (const entry of current.entries) {
            const longest = entry.matched.filter((m, _, all) => !all.some((o) => o !== m && ` ${o} `.includes(` ${m} `)));
            entry.value = entry.weights.filter((w) => longest.includes(w.term)).map((w) => w.value).sort((x, y) => y - x);
            entry.top = entry.value[0] || 0;
            weights.push(...entry.value);
            if (entry.node.kind === 'specialty' && (!current.best || entry.top > current.best.top)) current.best = entry;
        }
        weights.sort((x, y) => y - x);
        current.score = (weights[0] || 0) + 0.35 * Math.min(weights.slice(1).reduce((a, w) => a + w, 0), 40);
        current.matched = new Set(current.entries.flatMap((e) => e.matched));
    }
    const ranked = [...perTrade.values()]
        .map((c) => ({ trade: c.trade.code, node: (c.best && c.best.top >= 20) ? c.best.node.code : c.trade.code, family: c.trade.family, score: Math.round(c.score), matched: [...c.matched] }))
        .sort((a, b) => b.score - a.score);
    const top = ranked[0] || null;
    const second = ranked[1] || null;
    const threshold = 25;
    const confident = Boolean(top && top.score >= threshold);
    const tied = Boolean(top && second && second.score >= threshold && top.score - second.score < 12 && top.trade !== second.trade);
    let familyHint = null;
    if (!confident) {
        const hits = data.FAMILIES.map((f) => ({ family: f.code, n: (f.t || []).filter((t) => norm.includes(` ${normalize(t)} `)).length })).filter((h) => h.n > 0).sort((a, b) => b.n - a.n);
        if (hits.length === 1 || (hits[0] && hits[1] && hits[0].n > hits[1].n)) familyHint = hits[0].family;
    }
    return {
        familyHint,
        top: confident ? top : null,
        ranked: ranked.slice(0, 4),
        ambiguous: tied || (confident === false && ambiguousHits.length > 0),
        ambiguousTerms: ambiguousHits,
        status: !confident ? (ambiguousHits.length ? 'NEEDS_CLARIFICATION' : 'UNCLASSIFIED') : (tied ? 'NEEDS_CLARIFICATION' : 'CLASSIFIED')
    };
}

module.exports = { normalize, stem, loadData, build, flatten, termIndex, collisions, classify, tradeOf, DATA_DIR };
