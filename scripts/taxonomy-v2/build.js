'use strict';
/*
 * Génère les livrables DÉRIVÉS de la proposition de taxonomie v2 (phase 3.2B).
 *   node scripts/taxonomy-v2/build.js
 * Sortie : docs/taxonomy/generated/*, docs/taxonomy/migration-draft/04_*.sql et 05_*.sql, docs/taxonomy/02..05-*.md
 * Aucun accès réseau, aucune base de données, aucun effet sur l'application.
 */
const fs = require('node:fs');
const path = require('node:path');
const lib = require('./lib');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'taxonomy');
const GEN = path.join(OUT, 'generated');
const DRAFT = path.join(OUT, 'migration-draft');
const legacy = require(path.join(lib.DATA_DIR, 'legacy-map.data.js'));
const snapshot = require(path.join(lib.DATA_DIR, 'staging-snapshot.json'));
const tuning = require(path.join(lib.DATA_DIR, 'editorial-tuning.js'));

const ctx = lib.build();
const { nodes, byCode, data } = ctx;
const familyByCode = new Map(data.FAMILIES.map((f) => [f.code, f]));
const trades = nodes.filter((n) => n.kind === 'trade');
const specialties = nodes.filter((n) => n.kind === 'specialty');

fs.mkdirSync(GEN, { recursive: true });
fs.mkdirSync(DRAFT, { recursive: true });

const write = (file, content) => fs.writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`);
const csvCell = (v) => {
    const s = Array.isArray(v) ? v.join('|') : String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header, rows) => [header.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');
const sql = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const sqlArr = (a) => (a && a.length ? `ARRAY[${a.map(sql).join(',')}]::text[]` : "'{}'::text[]");
const md = (s) => String(s).replace(/\|/g, '\\|');

// Normalisation côté base : unaccent + minuscules + non alphanumérique → espace (pas de racinisation).
const normDb = (value) => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ').trim();

const groupLabel = (family, code) => (familyByCode.get(family).groups.find((g) => g.code === code) || {}).label || code;

// ---------------------------------------------------------------- JSON + CSV
const nodeRows = nodes.map((n, i) => ({
    code: n.code, kind: n.kind, parent: n.parent, family: n.family, group: n.group || null, label: n.label,
    safety: n.safety, selectable: n.selectable, regulation: n.regulation, also: n.also, ord: n.ord,
    short: n.short || null, icon: n.icon || null, termCount: n.terms.length
}));
write(path.join(GEN, 'taxonomy-v2.json'), JSON.stringify({
    version: 'v2-proposal-1',
    note: 'PROPOSITION — non appliquée. Source : docs/taxonomy/data/*.js',
    families: data.FAMILIES.map((f) => ({ code: f.code, ord: f.ord, icon: f.icon, tone: f.tone, label: f.label, short: f.short, pitch: f.pitch, groups: f.groups })),
    discoverTiles: data.DISCOVER_TILES,
    nodes: nodes.filter((n) => n.kind !== 'family').map((n) => ({
        code: n.code, kind: n.kind, parent: n.parent, family: n.family, group: n.group, label: n.label, safety: n.safety,
        selectable: n.selectable, regulation: n.regulation, also: n.also, ord: n.ord,
        terms: n.terms.map((t) => ({ t: t.term, type: t.type }))
    })),
    ambiguousTerms: data.AMBIGUOUS_TERMS,
    contextModifiers: data.CONTEXT_MODIFIERS
}, null, 1));

write(path.join(GEN, 'nodes.csv'), csv(
    ['code', 'kind', 'parent_code', 'family_code', 'group_code', 'label_fr', 'safety', 'selectable', 'also_families', 'regulation_note', 'sort_order', 'term_count'],
    nodeRows.filter((n) => n.kind !== 'family').map((n) => [n.code, n.kind, n.parent, n.family, n.group, n.label, n.safety, n.selectable, n.also, n.regulation, n.ord, n.termCount])
));
write(path.join(GEN, 'terms.csv'), csv(
    ['node_code', 'term', 'term_norm', 'term_type'],
    nodes.filter((n) => n.kind !== 'family').flatMap((n) => n.terms.map((t) => [n.code, t.term, normDb(t.term), t.type]))
));

const legacyRows = [];
for (const l of legacy.LEAVES) legacyRows.push(['taxonomy_leaf', `${l.universe}|${l.category}|${l.subcategory}`, l.node, l.kind, l.alt, l.note]);
for (const s of legacy.SKILL_TITLES) legacyRows.push(['skill_title', s.title, s.node, s.kind, s.alt, s.note]);
for (const s of legacy.SKILL_BUTTONS) legacyRows.push(['skill_button', s.button, s.node, s.alt && s.alt.length ? 'split' : 'exact', s.alt || [], '']);
for (const r of legacy.REQUEST_CATEGORIES) legacyRows.push(['request_category', r.category, r.node, r.kind, [], '']);
for (const m of legacy.MAP_FAMILIES) legacyRows.push(['map_family', m.old, m.families[0], m.families.length > 1 ? 'split' : 'broad', m.families.slice(1), m.note || '']);
for (const a of legacy.ACTIVITY_KEYS) legacyRows.push(['activity_key', a.old, a.trades[0], 'split', a.trades.slice(1), 'Clé d\'exigence réglementaire : la liste des métiers couverts est dans `alt`.']);
write(path.join(GEN, 'legacy-map.csv'), csv(['legacy_kind', 'legacy_key', 'node_code', 'mapping_kind', 'alt_codes', 'note'], legacyRows));

// ---------------------------------------------------------------- Statistiques
const kinds = (arr, key) => arr.reduce((a, x) => { a[x[key]] = (a[x[key]] || 0) + 1; return a; }, {});
const stats = {
    families: data.FAMILIES.length - 1, plusAutres: true, trades: trades.length, specialties: specialties.length,
    terms: nodes.reduce((a, n) => a + n.terms.length, 0),
    termsByType: nodes.flatMap((n) => n.terms).reduce((a, t) => { a[t.type] = (a[t.type] || 0) + 1; return a; }, {}),
    selectableNodes: nodes.filter((n) => n.kind !== 'family' && n.selectable).length,
    restrictedPlaceholders: nodes.filter((n) => !n.selectable && n.kind !== 'family').map((n) => n.code),
    safety: kinds(nodes.filter((n) => n.kind !== 'family'), 'safety'),
    multiFamilyTrades: trades.filter((t) => t.also.length).length,
    tradesPerFamily: Object.fromEntries(data.FAMILIES.map((f) => [f.code, trades.filter((t) => t.family === f.code).length])),
    specialtiesPerFamily: Object.fromEntries(data.FAMILIES.map((f) => [f.code, specialties.filter((s) => s.family === f.code).length])),
    legacy: {
        leaves: legacy.LEAVES.length, byKind: kinds(legacy.LEAVES, 'kind'), skillTitles: legacy.SKILL_TITLES.length,
        skillByKind: kinds(legacy.SKILL_TITLES, 'kind'), requestCategories: legacy.REQUEST_CATEGORIES.length
    },
    collisions: lib.collisions(nodes, byCode).length,
    ambiguousRegistry: Object.keys(data.AMBIGUOUS_TERMS).length,
    tuningEntries: Object.keys(tuning).length
};
write(path.join(GEN, 'stats.json'), JSON.stringify(stats, null, 2));

// ---------------------------------------------------------------- 02 familles
{
    const lines = ['# 02 — Les 8 familles de la taxonomie LYANN v2 (+ « Autres »)', '',
        '> Document généré par `scripts/taxonomy-v2/build.js` à partir de `docs/taxonomy/data/`. **Proposition — non appliquée.**', '',
        '## Vue d\'ensemble', '',
        '| # | Code | Famille (libellé FR) | Métiers | Spécialités | Sous-domaines |', '|---|---|---|---:|---:|---|'];
    for (const f of data.FAMILIES) {
        lines.push(`| ${f.ord} | \`${f.code}\` | **${md(f.label)}** | ${stats.tradesPerFamily[f.code]} | ${stats.specialtiesPerFamily[f.code]} | ${f.groups.map((g) => md(g.label)).join(' · ')} |`);
    }
    lines.push('', '## Écran Découvrir : 9 domaines + « Autres » en 10ᵉ position', '',
        'La demande pose **8 familles** et **9 domaines** sur Découvrir. Les deux se concilient : la famille `maison` (la plus dense, 20 métiers) est exposée par **deux tuiles** qui pointent vers deux sous-domaines différents. C\'est la **décision n°1** du document 09.', '',
        '| Position | Tuile | Famille | Sous-domaines affichés |', '|---:|---|---|---|');
    data.DISCOVER_TILES.forEach((t, i) => {
        const f = familyByCode.get(t.family);
        const groups = t.groups ? t.groups.map((g) => groupLabel(t.family, g)).join(' · ') : 'tous';
        lines.push(`| ${i + 1} | ${md(t.label)} | \`${t.family}\` — ${md(f.label)} | ${md(groups)} |`);
    });
    for (const f of data.FAMILIES) {
        lines.push('', `## ${f.ord}. ${f.label} (\`${f.code}\`)`, '', `*${f.pitch}*`, '', `- Icône (Phosphor) : \`${f.icon}\` · ton : \`${f.tone}\``,
            `- Libellé court (cercle rond) : **${f.short}**`, `- Termes de recherche au niveau famille : ${f.t.join(', ')}`, '');
        for (const g of f.groups) {
            const gt = trades.filter((t) => t.family === f.code && t.group === g.code);
            lines.push(`- **${md(g.label)}** : ${gt.map((t) => md(t.label)).join(' · ')}`);
        }
    }
    write(path.join(OUT, '02-families.md'), lines.join('\n'));
}

// ---------------------------------------------------------------- 03 métiers et spécialités
{
    const lines = ['# 03 — Métiers et spécialités par famille', '',
        '> Document généré. **Proposition — non appliquée.** Les identifiants (`code`) sont permanents et indépendants des libellés.', '',
        `Total : **${stats.families} familles + Autres**, **${stats.trades} métiers**, **${stats.specialties} spécialités**, **${stats.terms} termes de recherche**.`, '',
        '**Légende.** Sécurité : `NORMAL` · `CAUTION` (rappel de prudence) · `PRO_REQUIRED` (pro justifié requis) · `RESTRICTED` (activité réglementée, non sélectionnable comme compétence). ',
        '`→` = famille(s) secondaire(s) où le métier est aussi trouvable (sans duplication). `⛔` = nœud non sélectionnable (guide la recherche seulement).', ''];
    for (const f of data.FAMILIES) {
        lines.push(`## ${f.ord}. ${f.label} — \`${f.code}\``, '');
        for (const g of f.groups) {
            const gt = trades.filter((t) => t.family === f.code && t.group === g.code);
            if (!gt.length) continue;
            lines.push(`### ${g.label}`, '');
            for (const t of gt) {
                const flags = [];
                if (t.safety !== 'NORMAL') flags.push(`\`${t.safety}\``);
                if (t.also.length) flags.push(`→ ${t.also.join(', ')}`);
                if (!t.selectable) flags.push('⛔');
                lines.push(`- **${t.label}** (\`${t.code}\`)${flags.length ? ` — ${flags.join(' · ')}` : ''}${t.regulation ? `  \n  *Réglementation : ${t.regulation}*` : ''}`);
                for (const s of specialties.filter((x) => x.parent === t.code)) {
                    const sf = [];
                    if (s.safety !== t.safety) sf.push(`\`${s.safety}\``);
                    if (!s.selectable) sf.push('⛔');
                    if (s.also.length) sf.push(`→ ${s.also.join(', ')}`);
                    lines.push(`  - ${s.label} (\`${s.code}\`)${sf.length ? ` — ${sf.join(' · ')}` : ''}${s.regulation ? ` — *${s.regulation}*` : ''}`);
                }
            }
            lines.push('');
        }
    }
    write(path.join(OUT, '03-trades-and-specialties.md'), lines.join('\n'));
}

// ---------------------------------------------------------------- 04 synonymes
{
    const lines = ['# 04 — Synonymes, problèmes formulés et vocabulaire local', '',
        '> Document généré. L\'inventaire **complet** (tous les termes, tous les nœuds) est dans `generated/terms.csv`. Ce document en donne la structure et un extrait par métier.', '',
        '## Trois types de termes', '',
        '| Type | Rôle | Exemple |', '|---|---|---|',
        '| `label` | libellé affiché | « Plomberie » |', '| `syn` | synonyme / nom de métier / objet | « plombier », « robinet » |',
        '| `problem` | problème dit en langage naturel | « plus d\'eau chaude », « ça coule sous l\'évier » |', '| `local` | vocabulaire local ou créole | « ravets », « bokit », « gwoka » |', '',
        `Volumes : ${Object.entries(stats.termsByType).map(([k, v]) => `\`${k}\` ${v}`).join(' · ')} (total ${stats.terms}).`, '',
        '## Normalisation', '',
        'Minuscules, accents retirés, apostrophes et ponctuation → espace. Côté **base**, la normalisation est celle de `lyann_taxonomy_norm()` (unaccent + minuscules, **sans** racinisation) ; la racinisation légère des pluriels n\'existe que dans le prototype d\'évaluation (`scripts/taxonomy-v2/lib.js`).', '',
        '## Termes ambigus assumés (question de précision)', '',
        'Un terme ambigu ne classe jamais seul : il déclenche une question courte. Registre actuel :', '', '| Terme | Pourquoi | Question posée |', '|---|---|---|'];
    for (const [term, v] of Object.entries(data.AMBIGUOUS_TERMS)) lines.push(`| ${md(term)} | ${md(v.why)} | ${md(v.question)} |`);
    lines.push('', '## Modificateurs de contexte', '', 'Ils pondèrent l\'urgence ou le lieu, ils ne classent jamais à eux seuls.', '', '| Contexte | Termes |', '|---|---|');
    for (const [k, v] of Object.entries(data.CONTEXT_MODIFIERS)) lines.push(`| ${k} | ${md(v.join(' ; ').replace(/\|/g, ', '))} |`);
    const col = lib.collisions(nodes, byCode);
    lines.push('', '## Termes partagés entre métiers', '',
        `${col.length} termes normalisés apparaissent dans plusieurs métiers (cela inclut volontairement des termes culturels comme *zouk* ou *gwoka*, légitimement multi-cibles). Règle de classification : un terme partagé par *k* métiers est pondéré par *k^0,7* et la recherche affiche **tous** les nœuds concernés. Liste complète dans \`generated/shared-terms.csv\`.`, '');
    write(path.join(GEN, 'shared-terms.csv'), csv(['term_norm', 'trade_codes', 'node_codes'], col.map((c) => [c.norm, c.trades, c.nodes])));
    lines.push('## Extrait par métier (synonymes, problèmes, local)', '');
    for (const f of data.FAMILIES) {
        lines.push(`### ${f.label}`, '');
        for (const t of trades.filter((x) => x.family === f.code)) {
            const terms = (type) => t.terms.filter((x) => x.type === type).map((x) => x.term);
            const all = (type) => [...terms(type), ...specialties.filter((s) => s.parent === t.code).flatMap((s) => s.terms.filter((x) => x.type === type).map((x) => x.term))];
            const uniq = (a) => [...new Set(a)];
            lines.push(`- **${t.label}** (\`${t.code}\`)`,
                `  - synonymes : ${uniq(all('syn')).slice(0, 14).join(', ') || '—'}${uniq(all('syn')).length > 14 ? ` … (+${uniq(all('syn')).length - 14})` : ''}`,
                `  - problèmes : ${uniq(all('problem')).slice(0, 4).join(' ; ') || '—'}`,
                `  - local : ${uniq(all('local')).slice(0, 8).join(', ') || '—'}`);
        }
        lines.push('');
    }
    write(path.join(OUT, '04-synonyms.md'), lines.join('\n'));
}

// ---------------------------------------------------------------- 05 matrice
{
    const nodeLabel = (code) => {
        const n = byCode.get(code);
        return n ? `${n.label} (\`${code}\`)` : `⚠ ${code}`;
    };
    const lines = ['# 05 — Matrice de correspondance ancien → nouveau', '',
        '> Document généré. Fichier de données exploitable : `generated/legacy-map.csv`. **Aucune correspondance n\'est appliquée.**', '',
        '## Résumé', '',
        `- **${legacy.LEAVES.length}** feuilles \`lyann_taxonomy\` (Staging) toutes couvertes : ${Object.entries(stats.legacy.byKind).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
        `- **${legacy.SKILL_TITLES.length}** titres de compétences (Staging ∪ catalogue Maison) : ${Object.entries(stats.legacy.skillByKind).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
        `- **${legacy.REQUEST_CATEGORIES.length}** catégories libres de \`requests.category\`, 9 boutons de compétences rapides, 8 familles de pins de carte, 3 clés d'exigences pro.`, '',
        'Types : `exact` 1→1 · `broad` l\'ancien nœud est plus large (on cible le métier) · `split` plusieurs cibles (défaut + alternatives) · `merge` doublons historiques · `ambiguous` décision métier requise.', '',
        '## A. Feuilles de `lyann_taxonomy` (89)', '', '| Univers › Catégorie › Sous-catégorie | Demandes Staging | Type | Cible par défaut | Alternatives | Note |', '|---|---:|---|---|---|---|'];
    const reqCount = new Map(snapshot.leaves.map((l) => [l.slice(0, 3).join('|'), l[5]]));
    for (const l of legacy.LEAVES) {
        const key = `${l.universe}|${l.category}|${l.subcategory}`;
        lines.push(`| ${md(l.universe)} › ${md(l.category)} › ${md(l.subcategory)} | ${reqCount.get(key) || 0} | ${l.kind} | ${md(nodeLabel(l.node))} | ${l.alt.map((a) => md(nodeLabel(a))).join(' ; ') || '—'} | ${md(l.note || '')} |`);
    }
    lines.push('', '## B. Titres de compétences libres', '', '| Titre | Type | Cible par défaut | Alternatives | Note |', '|---|---|---|---|---|');
    for (const s of legacy.SKILL_TITLES) lines.push(`| ${md(s.title)} | ${s.kind} | ${md(nodeLabel(s.node))} | ${s.alt.map((a) => md(nodeLabel(a))).join(' ; ') || '—'} | ${md(s.note || '')} |`);
    lines.push('', '## C. Boutons « compétences rapides » du profil', '', '| Bouton | Cible | Alternatives |', '|---|---|---|');
    for (const s of legacy.SKILL_BUTTONS) lines.push(`| ${md(s.button)} | ${md(nodeLabel(s.node))} | ${(s.alt || []).map((a) => md(nodeLabel(a))).join(' ; ') || '—'} |`);
    lines.push('', '## D. Catégories libres de `requests.category`', '', '| Catégorie observée | Demandes Staging | Type | Cible |', '|---|---:|---|---|');
    const rc = new Map(snapshot.request_categories.map((r) => [r[0], r[1]]));
    for (const r of legacy.REQUEST_CATEGORIES) lines.push(`| ${md(r.category)} | ${rc.get(r.category) || 0} | ${r.kind} | ${md(nodeLabel(r.node))} |`);
    lines.push('', '## E. Les 8 familles de pins de la carte Annonces', '', '| Ancienne famille | Famille(s) v2 | Métiers précis | Note |', '|---|---|---|---|');
    for (const m of legacy.MAP_FAMILIES) lines.push(`| ${m.old} | ${m.families.join(', ')} | ${m.trades.join(', ') || '—'} | ${md(m.note || '')} |`);
    lines.push('', '## F. Clés d\'exigences réglementaires professionnelles', '', '| Clé actuelle | Métiers v2 couverts |', '|---|---|');
    for (const a of legacy.ACTIVITY_KEYS) lines.push(`| \`${a.old}\` | ${a.trades.join(', ')} |`);
    lines.push('', '## G. Catégories ambiguës nécessitant une décision', '');
    const amb = legacy.LEAVES.filter((l) => l.kind === 'ambiguous');
    for (const l of amb) lines.push(`- **${l.universe} › ${l.category} › ${l.subcategory}** → défaut \`${l.node}\`. ${l.note}`);
    write(path.join(OUT, '05-correspondence-matrix.md'), lines.join('\n'));
}

// ---------------------------------------------------------------- SQL : seed + backfill (brouillons)
{
    const header = (title) => `-- ${title}\n-- ============================================================================\n-- BROUILLON — NON APPLIQUÉ. Aucune exécution sur Staging ni sur Production dans la phase 3.2B.\n-- Généré par scripts/taxonomy-v2/build.js — ne pas éditer à la main (modifier docs/taxonomy/data/*).\n-- ============================================================================\n`;
    const out = [header('94_taxonomy_v2_seed — familles, métiers, spécialités, termes (version v2-proposal-1)'), 'BEGIN;', ''];
    out.push("INSERT INTO public.lyann_taxonomy_release(version, status, notes) VALUES ('v2-proposal-1', 'draft', 'Proposition phase 3.2B') ON CONFLICT (version) DO NOTHING;", '');
    const groupValues = data.FAMILIES.flatMap((f) => f.groups.map((g, i) => `(${sql(f.code)}, ${sql(g.code)}, ${sql(g.label)}, ${i + 1})`));
    out.push('INSERT INTO public.lyann_taxonomy_group(family_code, code, label_fr, sort_order) VALUES', groupValues.join(',\n'), 'ON CONFLICT DO NOTHING;', '');
    const nodeValues = nodes.map((n) => `(${[sql(n.code), sql(n.kind), sql(n.parent), sql(n.kind === 'family' ? n.code : n.family), sql(n.group || null), sql(n.label), sql(n.safety), n.selectable, sql(n.regulation), n.ord || 0, sql(n.icon || null), sql(n.tone || null)].join(', ')})`);
    out.push('INSERT INTO public.lyann_taxonomy_node(code, kind, parent_code, family_code, group_code, label_fr, safety, selectable, regulation_note, sort_order, icon, tone) VALUES');
    // Les parents doivent précéder les enfants : familles, puis métiers, puis spécialités (ordre de `nodes`).
    out.push(nodeValues.join(',\n'), 'ON CONFLICT (code) DO NOTHING;', '');
    const alsoValues = nodes.filter((n) => n.also && n.also.length).flatMap((n) => n.also.map((a) => `(${sql(n.code)}, ${sql(a)})`));
    out.push('INSERT INTO public.lyann_taxonomy_node_family(node_code, family_code) VALUES', alsoValues.join(',\n'), 'ON CONFLICT DO NOTHING;', '');
    const termValues = nodes.filter((n) => n.kind !== 'family').flatMap((n) => {
        const seen = new Set();
        return n.terms.filter((t) => {
            const key = `${normDb(t.term)}|${t.type}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).map((t) => `(${sql(n.code)}, ${sql(t.term)}, ${sql(normDb(t.term))}, ${sql(t.type)})`);
    });
    for (let i = 0; i < termValues.length; i += 1000) {
        out.push('INSERT INTO public.lyann_taxonomy_term(node_code, term, term_norm, term_type) VALUES', termValues.slice(i, i + 1000).join(',\n'), 'ON CONFLICT DO NOTHING;', '');
    }
    const amb = Object.entries(data.AMBIGUOUS_TERMS).map(([term, v]) => `(${sql(normDb(term))}, ${sql(v.why)}, ${sql(v.question)})`);
    out.push('INSERT INTO public.lyann_taxonomy_ambiguous_term(term_norm, why, question_fr) VALUES', amb.join(',\n'), 'ON CONFLICT DO NOTHING;', '');
    out.push('-- La publication de la version est un acte séparé (voir 08-migration-plan.md) :', "-- UPDATE public.lyann_taxonomy_release SET status='published' WHERE version='v2-proposal-1';", '', 'COMMIT;');
    write(path.join(DRAFT, '04_seed_taxonomy_v2.sql'), out.join('\n'));

    const bf = [header('95_taxonomy_v2_legacy_map — table de correspondance et rétro-remplissage ADDITIF'), 'BEGIN;', ''];
    const mapValues = legacyRows.map((r) => `(${sql(r[0])}, ${sql(r[1])}, ${sql(r[2])}, ${sql(r[3])}, ${sqlArr(r[4])}, ${sql(r[5] || null)})`);
    for (let i = 0; i < mapValues.length; i += 200) {
        bf.push('INSERT INTO public.lyann_taxonomy_legacy_map(legacy_kind, legacy_key, node_code, mapping_kind, alt_codes, note) VALUES', mapValues.slice(i, i + 200).join(',\n'), 'ON CONFLICT (legacy_kind, legacy_key) DO NOTHING;', '');
    }
    bf.push('-- Rétro-remplissage : uniquement des colonnes NULLables ajoutées en 94, jamais de réécriture des colonnes existantes.',
        '-- À exécuter par lots (voir 08-migration-plan.md §Backfill) ; chaque UPDATE est idempotent (WHERE … IS NULL).', '',
        '-- 1) Chaque feuille historique reçoit son nœud v2.',
        'UPDATE public.lyann_taxonomy t SET node_code = m.node_code',
        'FROM public.lyann_taxonomy_legacy_map m',
        "WHERE m.legacy_kind = 'taxonomy_leaf' AND t.node_code IS NULL",
        "  AND m.legacy_key = t.universe || '|' || t.category || '|' || t.subcategory;", '',
        '-- 2) Les demandes déjà classées héritent du nœud de leur feuille (taxonomy_id inchangé).',
        "UPDATE public.requests r SET taxonomy_node_code = t.node_code, taxonomy_node_source = 'backfill_leaf'",
        'FROM public.lyann_taxonomy t',
        'WHERE r.taxonomy_id = t.id AND r.taxonomy_node_code IS NULL AND t.node_code IS NOT NULL;', '',
        '-- 3) Les compétences (services.title) sont rapprochées par titre ; les titres sans correspondance restent NULL (file « à classer »).',
        "UPDATE public.services s SET taxonomy_node_code = m.node_code, taxonomy_node_source = 'backfill_title'",
        'FROM public.lyann_taxonomy_legacy_map m',
        "WHERE m.legacy_kind = 'skill_title' AND s.taxonomy_node_code IS NULL",
        '  AND lower(btrim(s.title)) = lower(m.legacy_key);', '',
        '-- 4) Demandes sans taxonomy_id : rapprochement par requests.category (catégories libres connues uniquement). Confiance FAIBLE :',
        "--    la catégorie « Jardinage » est la valeur par défaut observée sur Staging (48 des 80 demandes, toutes issues de la recette) ;",
        '--    la provenance backfill_category permet de les exclure des statistiques et de les reclasser.',
        "UPDATE public.requests r SET taxonomy_node_code = m.node_code, taxonomy_node_source = 'backfill_category'",
        'FROM public.lyann_taxonomy_legacy_map m',
        "WHERE m.legacy_kind = 'request_category' AND r.taxonomy_node_code IS NULL AND r.taxonomy_id IS NULL",
        '  AND lower(btrim(r.category)) = lower(m.legacy_key);', '',
        'COMMIT;');
    write(path.join(DRAFT, '05_legacy_map_and_backfill.sql'), bf.join('\n'));
}

console.log(JSON.stringify(stats, null, 2));
