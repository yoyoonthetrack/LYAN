#!/usr/bin/env node
'use strict';
/*
 * Génère docs/taxonomy/10-product-review.md (revue produit finale).
 * Les tableaux (familles, métiers, tuiles, doublons, vocabulaire territorial, mesures) viennent des données ;
 * les recommandations sont rédigées ici. Hors application, lecture seule.
 *   node scripts/taxonomy-v2/review.js          → écrit le document
 *   node scripts/taxonomy-v2/review.js --check  → échoue si le document n'est pas à jour
 */
const fs = require('fs');
const path = require('path');
const lib = require('./lib');
const evaluate = require('./evaluate');

const OUT = path.join(lib.DATA_DIR, '..', '10-product-review.md');
const ctx = lib.build();
const { DISCOVER_TILES } = ctx.data;
const FAMILIES = ctx.data.FAMILIES.filter((f) => f.code !== 'autres');
const TERRITORIES = require(path.join(lib.DATA_DIR, 'territory-vocabulary.js'));
const nodes = ctx.nodes.filter((n) => n.kind !== 'family');
const trades = nodes.filter((n) => n.kind === 'trade');
const specs = nodes.filter((n) => n.kind === 'specialty');
const famLabel = new Map(FAMILIES.map((f) => [f.code, f]));
famLabel.set('autres', { code: 'autres', label: 'Autres', short: 'Autres', pitch: 'Réceptacle technique des demandes non classées.', groups: [] });

const esc = (s) => String(s).replace(/\|/g, '\\|');
const n0 = (n) => n.toLocaleString('fr-FR').replace(/\u202f/g, ' ');
const pct = (x) => `${(x * 100).toFixed(0)} %`;
const tradeOfCode = (n) => (n.kind === 'trade' ? n.code : n.parent);
const specsOf = (t) => specs.filter((s) => s.parent === t.code);
const STATS = JSON.parse(fs.readFileSync(path.join(lib.DATA_DIR, '..', 'generated', 'stats.json'), 'utf8'));
const termStats = { all: STATS.terms, ...STATS.termsByType };
const SAFETY_ICON = { NORMAL: '', CAUTION: ' ⚠️', PRO_REQUIRED: ' 🔒', RESTRICTED: ' ⛔', PROHIBITED: ' ⛔' };

/* ---------- 1. familles ---------- */
function familiesTable() {
    const rows = [...FAMILIES, famLabel.get('autres')].map((f, i) => {
        const t = trades.filter((x) => x.family === f.code);
        const s = specs.filter((x) => x.family === f.code);
        const groups = (f.groups || []).map((g) => g.label).join(' · ') || '—';
        return `| ${i + 1} | **${esc(f.label)}** | ${esc(f.pitch)} | ${t.length} | ${s.length} | ${esc(groups)} |`;
    });
    return ['| # | Famille | Description | Métiers | Spécialités | Sous-domaines d\'affichage |', '|---:|---|---|---:|---:|---|', ...rows,
        `| | **Total** | | **${trades.length}** | **${specs.length}** | |`].join('\n');
}

/* ---------- 2. métiers par famille ---------- */
function exampleSpecs(t) {
    return specsOf(t).filter((s) => s.selectable !== false).slice(0, 3).map((s) => s.label).join(' · ');
}
function tradesByFamily() {
    const out = [];
    for (const f of FAMILIES) {
        const list = trades.filter((t) => t.family === f.code);
        const gLabel = new Map(f.groups.map((g) => [g.code, g.label]));
        out.push(`### ${f.label}`, '', `*${f.pitch}* — ${list.length} métiers, ${specs.filter((s) => s.family === f.code).length} spécialités.`, '',
            '| Métier | Sous-domaine | Spéc. | Exemples de spécialités | Notes |', '|---|---|---:|---|---|');
        for (const t of list) {
            const notes = [];
            if (t.also.length) notes.push(`aussi : ${t.also.map((c) => famLabel.get(c).short).join(', ')}`);
            const flagged = specsOf(t).filter((s) => s.safety !== 'NORMAL');
            const worst = ['RESTRICTED', 'PRO_REQUIRED', 'CAUTION'].find((lv) => t.safety === lv || flagged.some((s) => s.safety === lv));
            if (worst) notes.push(`${worst === 'CAUTION' ? '⚠️ prudence' : worst === 'PRO_REQUIRED' ? '🔒 pro requis' : '⛔ réglementé'}${t.safety === worst ? '' : ' (certaines spéc.)'}`);
            out.push(`| ${esc(t.label)} | ${esc(gLabel.get(t.group) || t.group || '—')} | ${specsOf(t).length} | ${esc(exampleSpecs(t))} | ${notes.join(' ; ')} |`);
        }
        out.push('');
    }
    const au = trades.filter((t) => t.family === 'autres');
    out.push('### Autres', '', 'Réceptacle technique, **jamais proposé comme compétence de profil** :', '',
        ...au.flatMap((t) => [`- **${t.label}** — ${specsOf(t).map((s) => s.label).join(' · ')}`]), '');
    return out.join('\n');
}

/* ---------- 3. tuiles ---------- */
function tilesTable() {
    const rows = DISCOVER_TILES.map((tile, i) => {
        const fam = famLabel.get(tile.family);
        const groups = tile.family === 'autres' ? '« Décrire mon besoin »' : tile.groups ? tile.groups.map((g) => fam.groups.find((x) => x.code === g).label).join(' + ') : 'tous les sous-domaines';
        const inTile = (x) => x.family === tile.family && (!tile.groups || tile.groups.includes(x.group));
        const kind = tile.family === 'autres' ? 'Technique (10ᵉ)' : tile.groups ? '**Domaine mis en avant**' : '**Famille métier**';
        return `| ${i + 1} | ${esc(tile.label)} | \`${tile.icon}\` | ${kind} | ${esc(fam.label)} | ${esc(groups)} | ${trades.filter(inTile).length} | ${specs.filter(inTile).length} |`;
    });
    return ['| # | Tuile | Icône | Nature | Famille | Contenu ouvert | Métiers | Spéc. |', '|---:|---|---|---|---|---|---:|---:|', ...rows].join('\n');
}

/* ---------- 4. territoires ---------- */
function territoryTables() {
    const regions = [['antilles', 'Antilles (Guadeloupe, Martinique, Saint-Martin)'], ['guyane', 'Guyane'], ['reunion', 'La Réunion']];
    const out = [];
    for (const [code, label] of regions) {
        const lot = TERRITORIES[code];
        out.push(`#### ${label}`, '', '| Métier ou spécialité visé | Termes locaux ajoutés (lot « à valider ») |', '|---|---|');
        for (const [nodeCode, terms] of Object.entries(lot)) {
            const node = ctx.byCode.get(nodeCode);
            out.push(`| ${esc(node.label)} \`${nodeCode}\` | ${esc(terms.split('|').slice(0, 9).join(', '))}${terms.split('|').length > 9 ? ', …' : ''} |`);
        }
        out.push('');
    }
    return out.join('\n');
}

/* ---------- 6. ambiguïtés, doublons, difficiles à trouver ---------- */
function collisionPairs() {
    const pc = new Map();
    for (const c of lib.collisions(nodes, ctx.byCode)) {
        for (let i = 0; i < c.trades.length; i += 1) for (let j = i + 1; j < c.trades.length; j += 1) {
            const k = `${c.trades[i]}|${c.trades[j]}`;
            if (!pc.has(k)) pc.set(k, []);
            pc.get(k).push(c.norm);
        }
    }
    return [...pc].sort((a, b) => b[1].length - a[1].length);
}
const PAIR_ADVICE = {
    'cuisine_domicile|traiteur_evenement': ['Cuisine chez soi ou plats livrés pour un événement ?', 'Conserver 2 métiers + question (D3)'],
    'danse|musique_spectacle': ['Cours de danse ou prestation musicale (zouk, gwoka, maloya) ?', 'Conserver ; la question tranche (cours / spectacle)'],
    'amenagement_exterieur|menuiserie_bois': ['Pergola, carbet, terrasse : bois ou aménagement ?', 'Conserver ; spécialités fléchées vers le même parcours'],
    'cours_musique|musique_spectacle': ['Apprendre un instrument ou faire jouer un groupe ?', 'Conserver ; question « cours ou prestation »'],
    'aide_administrative|rangement_organisation': ['Papiers administratifs ou rangement ?', 'Conserver ; termes « classer mes papiers » à rattacher à un seul'],
    'aide_personnes_agees|aide_quotidienne': ['Aide à une personne âgée ou aide ponctuelle ?', 'Conserver ; l\'aide à la toilette reste non sélectionnable'],
    'dj_sonorisation|tv_audiovisuel': ['Sono de fête ou installation TV/audio ?', 'Conserver'],
    'depannage_vehicule|mecanique_auto': ['Dépannage sur place ou réparation en atelier ?', 'Conserver ; question « sur place / atelier »'],
    'jardinage_entretien|paysagisme': ['Entretien régulier ou création/aménagement ?', 'Conserver']
};
function duplicatesTable() {
    const rows = collisionPairs().slice(0, 12).map(([k, terms]) => {
        const [a, b] = k.split('|');
        const adv = PAIR_ADVICE[k] || ['Deux usages proches', 'Conserver, relire les termes partagés'];
        return `| ${esc(ctx.byCode.get(a).label)} ↔ ${esc(ctx.byCode.get(b).label)} | ${terms.length} | ${esc(terms.slice(0, 4).join(', '))} | ${esc(adv[0])} | ${esc(adv[1])} |`;
    });
    return ['| Paire de métiers | Termes communs | Exemples | Ambiguïté pour l\'utilisateur | Recommandation |', '|---|---:|---|---|---|', ...rows].join('\n');
}
function similarLabels() {
    const tok = (s) => new Set(lib.normalize(s).split(' ').filter((w) => w.length > 3));
    const out = [];
    for (let i = 0; i < nodes.length; i += 1) for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i]; const b = nodes[j];
        if (a.kind !== b.kind || tradeOfCode(a) === tradeOfCode(b)) continue;
        const A = tok(a.label); const B = tok(b.label);
        if (!A.size || !B.size) continue;
        const inter = [...A].filter((x) => B.has(x)).length;
        if (inter / (A.size + B.size - inter) >= 0.5) out.push([a, b]);
    }
    return out;
}
function similarTable() {
    const verdict = (a, b) => {
        const same = a.family === b.family;
        return same ? 'Même famille : conserver, afficher le métier parent pour lever le doute' : 'Familles différentes : usages distincts (installer / nettoyer / animer) ; conserver';
    };
    return ['| Spécialité A | Spécialité B | Verdict |', '|---|---|---|', ...similarLabels().map(([a, b]) => `| ${esc(a.label)} (${esc(ctx.byCode.get(tradeOfCode(a)).label)}) | ${esc(b.label)} (${esc(ctx.byCode.get(tradeOfCode(b)).label)}) | ${verdict(a, b)} |`)].join('\n');
}
function thinTable() {
    const thin = specs.filter((s) => s.selectable !== false && s.terms.length < 8);
    return ['| Spécialité | Termes | Pourquoi elle est difficile à trouver | Action |', '|---|---:|---|---|',
        ...thin.map((s) => `| ${esc(s.label)} \`${s.code}\` | ${s.terms.length} | vocabulaire court : peu de façons de la nommer | ajouter 3 à 5 formulations « problème » avant la bascule |`)].join('\n');
}
const HARD_TO_FIND = [
    ['Mots rares ou techniques (« VMC », « reflexologie », « qi gong », « ferronnerie », « SEO »)', 'l\'utilisateur décrit le symptôme, pas le métier', 'termes « problème » (« air humide dans la salle de bain »)', 'Moyen'],
    ['Vocabulaire local hors Antilles (varangue, carbet, maloya, piroguier)', 'lot initial centré sur les Antilles ; lot territorial récent, jamais relu', 'relecture par des locuteurs ; « piroguier » tranché par D5', 'Élevé'],
    ['Services « à cheval » (aide aux courses, accompagnement, petits services)', 'trois familles se disputent la demande', 'D6 + question de précision', 'Moyen'],
    ['Termes uniques ambigus (« batterie », « nettoyage », « aide », « transport », « auto », « port », « menu »)', 'un mot, plusieurs métiers', 'registre d\'ambiguïtés (33 entrées) : une question, jamais un choix arbitraire', 'Faible (maîtrisé)'],
    ['Activités réglementées (leçons de conduite, aide à la toilette, traduction assermentée)', 'non sélectionnables par conception', 'guide + message clair ; jamais « introuvable »', 'Faible (voulu)'],
    ['Demandes en phrase longue ou familière (« faire à manger pour quarante personnes »)', 'aucun terme exact', 'proposition « Je pense que c\'est… » avec choix, jamais de classement forcé', 'Moyen']
];

/* ---------- 7. UX : budget d'interactions ---------- */
function uxBudget() {
    const perGroup = [];
    for (const f of FAMILIES) {
        for (const g of f.groups) perGroup.push({ f: f.short, g: g.label, n: trades.filter((t) => t.family === f.code && t.group === g.code).length });
    }
    const maxGroup = perGroup.reduce((a, b) => (b.n > a.n ? b : a));
    const maxGroups = Math.max(...FAMILIES.map((f) => f.groups.length));
    const maxSpecs = trades.reduce((a, t) => (specsOf(t).length > a.n ? { t, n: specsOf(t).length } : a), { n: 0 });
    const avgSpecs = (specs.length / trades.length).toFixed(1);
    return { maxGroup, maxGroups, maxSpecs, avgSpecs };
}

/* ---------- 8. mesures ---------- */
function evalTables() {
    const { bySet, byRegion } = evaluate.run();
    const row = (s) => `| ${esc(s.group)} | ${s.n} | ${pct(s.strict)} | ${pct(s.top3)} | ${pct(s.safe)} | ${s.silentErrors} | ${pct(s.unresolved)} |`;
    const head = ['| Jeu | n | Strict | Top-3 | Sûr | Erreurs silencieuses | Non résolu |', '|---|---:|---:|---:|---:|---:|---:|'];
    return { sets: [...head, ...bySet.map(row)].join('\n'), regions: [...head, ...byRegion.filter((s) => !/· tous$/.test(s.group)).map(row)].join('\n') };
}

/* ---------- document ---------- */
function render() {
    const ux = uxBudget();
    const ev = evalTables();
    const local = nodes.flatMap((n) => n.terms).filter((t) => t.type === 'local');
    const tagged = local.filter((t) => t.territories).length;
    const shared = lib.collisions(nodes, ctx.byCode).length;
    const L = [];
    L.push(`# 10 — Revue produit finale de la taxonomie

> **Statut : PROPOSITION À VALIDER — rien n'est implémenté ni appliqué.** Document généré par \`scripts/taxonomy-v2/review.js\` à partir des données de \`docs/taxonomy/data/\` (les tableaux ne peuvent donc pas diverger de la source).
> Aucune migration, aucune écriture Supabase, aucun déploiement, Production non consultée.

## 0. Ce qu'il faut décider (et le reste)

La revue se résume à **6 arbitrages** ; les 7 autres décisions sont des recommandations à entériner telles quelles.

| Décision | Nature | Ma recommandation | Si vous répondez « oui » |
|---|---|---|---|
| **D1** structure : 8 familles, Maison sur 2 tuiles | structurel | **Oui** | structure figée (codes permanents) |
| **D4** nœuds réglementés non sélectionnables | juridique | **Oui** + relecture juridique des 3 nœuds | contrainte SQL \`selectable=false\` conservée |
| **D5** transport de personnes = partage de frais seulement | juridique/métier | **Oui** | libellés et modération alignés ; « piroguier » (Guyane) traité de même |
| **D8** permission \`taxonomy.manage\` + formulaire « Je ne trouve pas mon métier » | structurel (droits admin) | **Oui**, à créer dans une migration dédiée | nouveau droit admin, jamais attribué par défaut |
| **D11** recensement Production **en lecture seule** (agrégats) | accès Production | **Oui**, requêtes déjà prêtes | mesure réelle de la demande et de la précision |
| **D13** vocabulaire territorial : **structure unique, vocabulaire par région** | périmètre | **Oui** (révisé, voir §5) | lot Guyane/Réunion relu par des locuteurs |

Tout « oui » ouvre l'intégration par l'étape 1 du plan (répétition à blanc sur Staging, doc. 08) — pas d'autre aller-retour sur la structure.

## 1. Les 8 familles

${familiesTable()}

*Lecture* : « Autres » n'est pas une 9ᵉ famille mais un réceptacle ; elle n'est jamais proposée comme compétence de profil. Un métier a **une famille principale** ; ${trades.filter((t) => t.also.length).length} métiers sur ${trades.length} apparaissent aussi dans une famille secondaire (comptés une seule fois).

## 2. Les métiers de chaque famille, avec exemples de spécialités

Légende : ⚠️ prudence (vérifier les justificatifs) · 🔒 professionnel déclaré requis · ⛔ réglementé, non sélectionnable (guide). Une spécialité est **optionnelle** : l'utilisateur peut s'arrêter au métier.

${tradesByFamily()}
## 3. Les 10 tuiles de Découvrir : familles métier et domaines mis en avant

${tilesTable()}

- **7 tuiles = 7 familles métier** (une tuile ouvre toute la famille) ; **2 tuiles = 2 domaines mis en avant** de la famille Maison (la plus dense : ${trades.filter((t) => t.family === 'maison').length} métiers, ${specs.filter((t) => t.family === 'maison').length} spécialités) ; la 10ᵉ, **Autres**, est technique (« Décrire mon besoin »).
- Les 8 familles restent **le seul vocabulaire** des filtres, de la carte (pins) et des compteurs : les 2 tuiles Maison sont une **vue**, pas une famille de plus.
- Variante écartée : une 9ᵉ famille « Dépannage » (impose de couper des métiers comme électricité ou plomberie en deux).

## 4. Catégories utiles aux Antilles, en Guyane et à La Réunion

Le produit couvre **Guadeloupe, Martinique, Guyane, La Réunion et Saint-Martin** (\`schema.sql\` \`allowed_territories\`, \`about.html\`). La structure est la même partout ; ce qui change est **ce que les gens disent**. Besoins fréquents par région :

| Besoin | Antilles | Guyane | La Réunion | Où ça atterrit |
|---|:-:|:-:|:-:|---|
| Cyclone / saison cyclonique (toiture, volets, tôle, bâchage) | ✅ | — | ✅ | Toiture, Vitrerie & stores, Maçonnerie |
| Moustiques / dengue (démoustication, moustiquaires) | ✅ | ✅ | ✅ | Nuisibles & hygiène, Vitrerie & stores |
| Sargasses | ✅ | — | — | Nettoyage extérieur |
| Eau (citerne, tour d'eau) | ✅ | ✅ | ✅ | Plomberie |
| Climatisation, solaire, groupe électrogène | ✅ | ✅ | ✅ | Climatisation, Énergie solaire, Électricité |
| Bateau, yole, pêche, pirogue | ✅ yole | ✅ pirogue, fleuve | ✅ pêche au gros | Mécanique marine, Activités nautiques, Fret |
| Abri bois (carbet, ajoupa, varangue) | ✅ | ✅ carbet | ✅ varangue | Menuiserie bois, Aménagement extérieur |
| Cuisine locale (bokit, colombo / maripa, couac / cari, rougail, samoussa) | ✅ | ✅ | ✅ | Traiteur ↔ Cuisine à domicile (D3) |
| Danse et musique locales (gwoka, bèlè / maloya, séga) | ✅ | — | ✅ | Danse, Cours de musique, Musique & spectacle |
| Langues (créoles, néerlandais / hmong, bushinenge, portugais / —) | ✅ | ✅ | — | Langues, Traduction & interprétation |
| Agriculture vivrière (abattis, jardin créole, litchis, vacoa) | ✅ | ✅ abattis | ✅ | Potager & vivrier, Agricole, Artisanat |
| Activités de plein air (volcan, canyoning, parapente) | — | — | ✅ | Randonnée & aventure (activités encadrées) |

### Particularités de vocabulaire (à faire relire par des locuteurs)

| Terme | Sens | Région | Rattachement |
|---|---|---|---|
| ravets | cafards | Antilles | Nuisibles › Insectes |
| sargasses | algues échouées | Antilles | Nettoyage extérieur |
| bâcher | poser une bâche (toit) | Antilles | Toiture |
| tour d'eau | réservoir d'eau | Antilles | Plomberie |
| yole ronde | voilier traditionnel | Martinique | Activités nautiques |
| gwoka · bèlè | musique / danse traditionnelle (tambour) | Guadeloupe · Martinique | Danse / Cours de musique |
| bokit · colombo | sandwich frit · plat de poulet | Antilles | Traiteur / Cuisine à domicile |
| abattis | parcelle défrichée | Guyane (aussi Antilles) | Agricole |
| carbet | grand abri en bois ouvert | Guyane · Antilles | Aménagement extérieur / Menuiserie |
| pirogue · piroguier | bateau fluvial · son conducteur | Guyane | Mécanique marine ; piroguier = transport de personnes → **D5** |
| maripa · couac · cassave · awara | palme, farine et galette de manioc, bouillon de fête | Guyane | Cuisine / Traiteur |
| hmong · nenge · bushinenge | langues et communautés | Guyane | Langues, Traduction |
| varangue · lambrequins | véranda, dentelle de bois | La Réunion | Menuiserie bois |
| case créole | maison traditionnelle | La Réunion | Peinture, Toiture |
| cari · rougail · samoussa · bonbon piment | plats courants | La Réunion | Traiteur / Cuisine à domicile |
| maloya · séga | musique et danse traditionnelles | La Réunion | Danse, Musique |
| vacoa | vannerie | La Réunion | Artisanat |
| tangue | petit mammifère nuisible | La Réunion | Nuisibles › Animaux |
| gramoun | grand-mère / personne âgée | La Réunion | Aide aux personnes âgées |
| moringue | art martial traditionnel | La Réunion | Arts martiaux |

### Lot de vocabulaire territorial ajouté (colonne \`territories\`)

${tagged} termes sont déjà **marqués par région** (\`antilles\`, \`guyane\`, \`reunion\` ; vide = partout) ; les ${local.length - tagged} autres termes locaux (lot initial) restent valables partout et seront marqués lors de la relecture. **Statut : rédigé sans locuteur natif, à valider avant publication.**

${territoryTables()}
**Couverture mesurée** (voir §8) — avant enrichissement, sur 56 requêtes locales : Antilles 70 %, **Guyane 50 %, Réunion 30 %** de classements stricts corrects. Après le lot : voir le tableau du §8.

**Hors périmètre** : Mayotte et la métropole ne figurent pas dans le produit ; la colonne \`territories\` accepte de nouvelles valeurs par simple relecture de la contrainte.

## 5. Les 13 décisions du document 09

Niveau de risque = risque **si on se trompe**, après mise en œuvre de la recommandation.

| # | Décision | Recommandation | Conséquences | Risque |
|---|---|---|---|:-:|
| **D1** | 8 familles ou 9 domaines | **8 familles**, Maison sur **2 tuiles** (+ Autres en 10ᵉ) | un seul vocabulaire pour filtres, carte, compteurs ; la scission reste mécanique (le sous-domaine existe déjà) | 🟢 faible |
| **D2** | Sport rattaché à Beauté | **Garder** dans « Beauté, bien-être et sport » | 5 métiers sport/nautique y restent ; tuile intitulée « Beauté & bien-être » : le sport s'y trouve par la recherche et par l'explorateur | 🟡 moyen (découvrabilité) |
| **D3** | Traiteur ↔ cuisine à domicile | **2 métiers + question** (« Pour un événement ou chez vous ? ») | ${(collisionPairs().find(([k]) => k === 'cuisine_domicile|traiteur_evenement') || [0, []])[1].length} termes partagés ; une question sur les plats créoles, jamais de choix arbitraire | 🟡 moyen |
| **D4** | Activités réglementées | **Non sélectionnables** + guide | 3 nœuds (conduite, soins, traduction assermentée) ; aucune offre de ce type sur la plateforme | 🔴 élevé (juridique) → relecture juridique |
| **D5** | Transport de personnes | **Partage de frais uniquement** | « Transfert aéroport » rattaché au covoiturage avec rappel ; piroguier fluvial : même règle | 🔴 élevé (juridique) |
| **D6** | Courses pour autrui | **Famille** (secondaire Transport) | 1 métier ; compté une fois | 🟢 faible |
| **D7** | Recherches sans résultat | Compteur **agrégé**, texte normalisé tronqué, **aucun identifiant** | table de télémétrie ; mention de confidentialité ; sert à enrichir les synonymes | 🟡 moyen (vie privée) |
| **D8** | Administration de la taxonomie | Permission **\`taxonomy.manage\`** (à créer) + formulaire modéré « Je ne trouve pas mon métier » | touche le RBAC admin : migration dédiée, jamais attribuée par défaut ; sinon tout passe par migration SQL | 🟠 moyen-élevé (droits) |
| **D9** | Ancienne table \`lyann_taxonomy\` | **Lecture seule, jamais supprimée** | anciens clients intacts ; purge éventuelle bien plus tard | 🟢 faible |
| **D10** | \`classification_status\` | **Dérivé** du code renseigné et de sa provenance | statut cohérent sans double saisie ; 80/80 « non classé » aujourd'hui | 🟢 faible |
| **D11** | Recensement Production | **Autoriser en lecture seule**, agrégats uniquement | sans lui, la demande réelle et la précision restent inconnues ; aucune donnée personnelle | 🟡 moyen (accès Production) |
| **D12** | Langues | **Attribut** de l'offre, pas un nœud par langue | « Traduction » : 1 nœud ; moins de termes ; filtre langue séparé | 🟢 faible |
| **D13** | Périmètre territorial (**révisée**) | **Structure unique** pour les 5 territoires + **vocabulaire par région** (\`territories\`), relu par des locuteurs | la version précédente (« Antilles d'abord ») ne correspond pas au périmètre produit ; lot Guyane/Réunion livré ; aucun changement de structure | 🟡 moyen (qualité locale) |

## 6. Ambiguïtés, doublons et spécialités difficiles à trouver

### 6.1 Paires de métiers qui se disputent la même demande

${shared} termes normalisés sont partagés entre plusieurs métiers (liste complète : \`generated/shared-terms.csv\`). Les paires les plus chargées :

${duplicatesTable()}

**Règle commune** : un terme partagé pèse moins, et s'il reste ambigu l'utilisateur voit **une question** au lieu d'un classement arbitraire. Aucune fusion n'est recommandée : ce sont des usages différents.

### 6.2 Doublons possibles (libellés proches dans des métiers différents)

${similarTable()}

Aucun vrai doublon : les libellés proches désignent des gestes différents (installer, nettoyer, animer). Le métier parent affiché à côté de la spécialité lève le doute.

### 6.3 Ce qui sera difficile à trouver

| Situation | Pourquoi | Parade | Gravité |
|---|---|---|:-:|
${HARD_TO_FIND.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n')}

Spécialités dont le vocabulaire est le plus court (à enrichir avant la bascule) :

${thinTable()}

### 6.4 Incohérences documentaires corrigées pendant la revue

- Références à une « D14 » inexistante (R14, ambiguïté n° 2) : remplacées par l'action **A1** du §10 (ne présélectionner aucune catégorie dans l'assistant).
- Numérotation « 2.4 bis » du doc. 07 → renumérotée en 2.5, 2.6, 2.7.
- D13 (« Antilles d'abord ») contredisait le périmètre à 5 territoires → révisée (§5).
- Compteurs de termes mis à jour (${n0(termStats.all)} termes : label ${n0(termStats.label)}, syn ${n0(termStats.syn)}, problem ${n0(termStats.problem)}, local ${n0(termStats.local)}) ; registre d'ambiguïtés : 33 entrées (+ « auto », « port », « menu »).
- Défaut de données corrigé : le terme « cours » seul, rattaché à « Cours de cuisine », classait « cours de maloya » et « nettoyer la cour » comme de la cuisine.

## 7. Stratégie UX : choisir un métier en quelques interactions

**Principe** : on ne montre jamais plus que ce qu'un écran de téléphone contient ; les 414 spécialités n'apparaissent **que pour le métier choisi** et sont **facultatives**.

| Chemin | Interactions | Ce qui est affiché |
|---|---:|---|
| **Découvrir → tuile → métier** | 2 (3 avec une spécialité) | 10 tuiles → sous-domaines repliés (≤ ${ux.maxGroups}) → métiers du sous-domaine (≤ ${ux.maxGroup.n}) |
| **Recherche libre** (« fuite sous mon évier ») | 2 : saisir, toucher le résultat | métier + spécialité proposés ; 1 question si ambigu |
| **Assistant d'annonce** | 3 : décrire, confirmer la proposition, publier | proposition modifiable ; aucune catégorie présélectionnée |
| **Profil Lyanneur (compétences)** | 2 par compétence | recherche + familles ; « Je ne trouve pas mon métier » |
| **Filtre Annonces / Lyanneurs** | 1 | rail de **6 familles max + « Plus »** ; métier dans la feuille « Affiner » |

Budget d'affichage (calculé sur les données) :

| Niveau | Éléments visibles simultanément | Maximum réel |
|---|---:|---|
| Tuiles Découvrir | 10 | 10 |
| Sous-domaines d'une famille | ≤ ${ux.maxGroups} | ${ux.maxGroups} (repliés) |
| Métiers par sous-domaine | ≤ ${ux.maxGroup.n} | ${ux.maxGroup.n} (${ux.maxGroup.f} › ${ux.maxGroup.g}) |
| Spécialités d'un métier | ≤ ${ux.maxSpecs.n} | ${ux.maxSpecs.n} (${ux.maxSpecs.t.label}) ; moyenne ${ux.avgSpecs} |
| Rail de familles | 6 + « Plus » | 6 |
| Questions de précision | 1 à la fois | 2 choix maximum |

Règles : (1) **toucher un métier suffit** ; (2) la recherche est toujours à un geste, avec résultats **au fil de la frappe** et sans tolérance aux fautes dégradante ; (3) un résultat réglementé affiche un **guide**, jamais « introuvable » ; (4) « Autres » → « Décrire mon besoin » ; (5) mêmes familles, icônes et compteurs sur Liste et Carte (état partagé). Détails d'écran : doc. 06 — **aucune implémentation avant validation**, et un **test d'utilisabilité** (§8) avant la bascule de lecture.

## 8. Tests pour démontrer la pertinence de la recherche et du classement

### 8.1 Mesures actuelles (prototype local, reproductibles : \`node scripts/taxonomy-v2/evaluate.js\`)

${ev.sets}

Par région (jeux territoriaux) :

${ev.regions}

*Strict* = bon métier, classé sans question ; *Sûr* = strict, ou question qui contient le bon métier ; *Erreur silencieuse* = mauvais métier, classé sans question (**objectif : 0**). Les jeux « réglés » ont servi à enrichir le vocabulaire ; seuls les jeux « hors échantillon » mesurent la généralisation — et ils sont **rédigés par l'auteur du vocabulaire** : ces chiffres sont un plancher de qualité, **pas une précision réelle**.
Honnêteté sur le jeu territorial hors échantillon : à sa première exécution, il donnait 69 % strict, 85 % sûr et **2 erreurs silencieuses** (« professeur de créole » → soutien scolaire ; « tailler mes bougainvilliers » → paysagisme). Ces deux défauts ont été corrigés (vocabulaire), ce qui le rend de ce fait un peu moins « hors échantillon ».

### 8.2 Protocole d'évaluation avant bascule (échantillon représentatif)

| Étape | Contenu | Outil |
|---|---|---|
| **Échantillon** | titres et descriptions réels (recensement Production D11, agrégats), **stratifiés** : ≥ 30 par famille, ≥ 50 par territoire, + 50 formulations « problème » collectées auprès de 10 testeurs par région | \`sql/readonly-census.sql\`, \`census-coverage.js\` |
| **Étiquetage** | 2 relecteurs indépendants par ligne, arbitrage des désaccords ; **accord ≥ 0,7 (kappa)** sinon la catégorie est ambiguë et va dans la file de décision | tableur |
| **Mesure** | top-1, top-3, taux de question, taux d'erreur silencieuse, non résolu — **par famille et par territoire** | \`evaluate.js --cases export.json\` |
| **Recherche** | rappel « leave-one-out » : retirer un synonyme et vérifier que le métier reste atteignable ; requêtes sans résultat classées par fréquence | \`evaluate.js\`, télémétrie D7 |
| **Utilisabilité** | tâche « trouver le métier de votre besoin » : **≥ 90 % de réussite en ≤ 4 interactions et ≤ 20 s**, 8 personnes par territoire, dont des personnes peu à l'aise avec le numérique | test modéré |
| **Régression** | tests de structure, couverture de l'existant, rejeu SQL, jeux de classification, en CI | \`tests/taxonomy-v2-proposal.test.js\` |

Seuils de passage (bascule de lecture, étape 5) :

| Indicateur | Seuil |
|---|---|
| Erreurs silencieuses | **≤ 2 %** ; **0** sur les nœuds ⚠️ 🔒 ⛔ |
| Top-1 strict (titres réels) | ≥ 80 % |
| Top-3 | ≥ 95 % |
| « Sûr » (strict + question utile) | ≥ 92 % |
| Non résolu | ≤ 8 % ; chaque non résolu mène à « Décrire mon besoin », jamais à une impasse |
| Questions de précision | ≤ 20 % des recherches |
| Écart entre territoires | ≤ 10 points sur « sûr » |
| Plancher par famille | « sûr » ≥ 85 % |

Confidentialité : les échantillons ne contiennent ni nom, ni identifiant, ni coordonnées ; textes tronqués, agrégats seulement.

## 9. Structure finale proposée

Codes permanents (indépendants des libellés). ${FAMILIES.length} familles + Autres · ${trades.length} métiers · ${specs.length} spécialités · ${n0(termStats.all)} termes.

${FAMILIES.map((f) => {
        const lines = [`**${f.label}** (\`${f.code}\`)`];
        for (const g of f.groups) {
            const t = trades.filter((x) => x.family === f.code && x.group === g.code);
            lines.push(`- *${g.label}* : ${t.map((x) => x.label).join(' · ')}`);
        }
        return lines.join('\n');
    }).join('\n\n')}

**Autres** (\`autres\`) : ${trades.filter((t) => t.family === 'autres').map((t) => t.label).join(' · ')} — jamais proposé comme compétence.

## 10. Après validation : intégration sans aller-retour

| Étape | Contenu | Porte de sortie |
|---|---|---|
| **A1** | Assistant d'annonce : ne présélectionner **aucune catégorie** (aujourd'hui « Jardinage » par défaut : 48/80 demandes Staging) | statistiques par catégorie fiables |
| **0** | Décisions §0 ; recensement Production en lecture seule (D11) ; relecture juridique D4/D5 ; relecture du lot territorial | feu vert humain |
| **1** | Répétition à blanc sur Staging (\`BEGIN … ROLLBACK\`), puis application Staging | 0 violation V01–V12 |
| **2–3** | Lecture seule derrière un drapeau, puis double écriture | 100 % des nouvelles lignes avec code |
| **4** | Backfill par lots avec provenance, file « à classer » | ≥ 90 % rattachées |
| **5** | Bascule de lecture (Découvrir, Lyanneurs, Annonces, carte) après les seuils du §8 | seuils §8.2 atteints |
| **6** | Version minimale d'app ; \`lyann_taxonomy\` en lecture seule, jamais supprimée | trafic ancien < 2 % |

## 11. Limites

- Aucune lecture Production : volumes et répartition réelle inconnus.
- Vocabulaire et jeux de test rédigés par l'auteur ; **aucun locuteur natif** n'a relu le lot Guyane/Réunion.
- Rejeu SQL dans PGlite (fonctions \`auth.uid()\` et \`has_admin_permission\` simulées), pas sur le Postgres de Staging.
- Aucun test utilisateur ; la stratégie UX est une proposition.
`);
    return L.join('\n');
}

if (require.main === module) {
    const doc = render();
    if (process.argv.includes('--check')) {
        const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
        if (current !== doc) { console.error('10-product-review.md obsolète : node scripts/taxonomy-v2/review.js'); process.exit(1); }
        console.log('10-product-review.md à jour');
    } else {
        fs.writeFileSync(OUT, doc);
        console.log(`écrit ${path.relative(process.cwd(), OUT)} (${doc.split('\n').length} lignes)`);
    }
}

module.exports = { render };
