'use strict';
/*
 * LYANN taxonomie v2 — SOURCE DE VÉRITÉ DE LA PROPOSITION (phase 3.2B).
 * Rien ici n'est branché sur l'application ni sur Supabase. Tout est dérivé (JSON, CSV, Markdown, SQL de seed).
 */
const { FAMILIES, AUTRES, DISCOVER_TILES } = require('./families');

const TUNING = require('./editorial-tuning');
const splitTerms = (value) => String(value || '').split('|').map((x) => x.trim()).filter(Boolean);
const fold = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

function applyTuning(trade) {
    const nodes = [trade, ...trade.specs];
    for (const node of nodes) {
        const tuning = TUNING[node.code];
        if (!tuning) continue;
        const drop = new Set(splitTerms(tuning.drop).map(fold));
        for (const key of ['t', 'p', 'l']) {
            node[key] = [...node[key], ...splitTerms(tuning[key])].filter((term) => !drop.has(fold(term)));
            node[key] = node[key].filter((term, i, all) => all.findIndex((o) => fold(o) === fold(term)) === i);
        }
    }
    return trade;
}

const tag = (family, list) => list.map((trade) => applyTuning({ ...trade, family }));

const TRADES = [
    ...tag('maison', require('./trades-maison')),
    ...tag('jardin', require('./trades-jardin')),
    ...tag('entretien', require('./trades-entretien')),
    ...tag('beaute', require('./trades-beaute')),
    ...tag('transport', require('./trades-transport')),
    ...tag('famille', require('./trades-famille')),
    ...tag('evenement', require('./trades-evenement')),
    ...tag('numerique', require('./trades-numerique')),
    ...tag('autres', require('./trades-autres'))
];

const ALL_FAMILIES = [...FAMILIES, AUTRES];

/**
 * Termes ambigus assumés : le même terme normalisé apparaît volontairement dans plusieurs métiers.
 * Le classifieur ne tranche pas : il propose un choix de précision à l'utilisateur.
 * Toute autre collision entre métiers différents est un défaut de données (test bloquant).
 */
const AMBIGUOUS_TERMS = {
    'depannage': { why: 'Dépannage désigne autant la plomberie, l\'électricité, les véhicules que l\'informatique.', question: 'Quel type de dépannage ?' },
    'panne': { why: 'Panne : électricité, véhicule, appareil, ordinateur.', question: 'Panne de quoi ?' },
    'fuite': { why: 'Fuite d\'eau (plomberie) ou de toit (toiture) ou de piscine.', question: 'Où est la fuite ?' },
    'reparation': { why: 'Réparation sans objet précis.', question: 'Que faut-il réparer ?' },
    'montage': { why: 'Montage de meuble, de vidéo ou d\'abri.', question: 'Montage de quoi ?' },
    'installation': { why: 'Installation sans objet précis.', question: 'Installer quoi ?' },
    'entretien': { why: 'Entretien du jardin, de la maison, d\'un véhicule ou d\'une piscine.', question: 'Entretien de quoi ?' },
    'nettoyage': { why: 'Nettoyage du logement, de l\'extérieur, d\'un véhicule.', question: 'Nettoyer quoi ?' },
    'courses': { why: 'Courses pour autrui (aide du quotidien) ou livraison.', question: 'Faire vos courses ou livrer un colis ?' },
    'transport': { why: 'Transport de personnes ou d\'objets.', question: 'Transporter qui ou quoi ?' },
    'organisation': { why: 'Organisation d\'événement, de papiers ou d\'intérieur.', question: 'Organiser quoi ?' },
    'cours': { why: 'Cours scolaires, de langue, de musique, de danse ou de cuisine.', question: 'Cours de quoi ?' },
    'aide': { why: 'Terme générique.', question: 'Quelle aide ?' },
    'photo': { why: 'Photographie ou photo produit / retouche.', question: 'Photo de quoi ?' },
    'photos': { why: 'Photographie ou photos pour un site.', question: 'Quel type de photos ?' },
    'batterie': { why: 'Batterie de véhicule ou batterie (instrument).', question: 'Batterie de voiture ou instrument de musique ?' },
    'portable': { why: 'Téléphone portable ou ordinateur portable.', question: 'Téléphone ou ordinateur ?' },
    'portail': { why: 'Portail : clôture (gros œuvre) ou automatisme.', question: 'Pose du portail ou motorisation ?' },
    'toilette': { why: 'Toilettes (plomberie) ou aide à la toilette (soin, réglementé).', question: 'Sanitaires ou aide à la personne ?' },
    'marche': { why: 'Marché (courses), marche (promenade) ou marche d\'escalier.', question: 'Courses, promenade ou travaux ?' },
    'code': { why: 'Code de la route ou code informatique.', question: 'Code de la route ou programmation ?' },
    'poste': { why: 'La Poste (démarche) ou poste informatique.', question: 'Aller à La Poste ou poste informatique ?' },
    'cuisine': { why: 'Cuisine : repas (cuisinier) ou pièce (rénovation, plomberie).', question: 'Cuisiner des repas ou travaux dans la cuisine ?' },
    'bois': { why: 'Bois : menuiserie, traitement du bâti, transport de matériaux.', question: 'Quel travail sur le bois ?' },
    'devis': { why: 'Mot d\'usage de la plateforme (demande de devis) : ne décrit pas un métier.', question: 'Devis pour quel service ?' },
    'creole': { why: 'Créole : langue, cuisine créole ou bijoux créoles.', question: 'Cours de créole, cuisine créole ou bijoux ?' },
    'vidange': { why: 'Vidange moteur ou vidange d\'un appareil.', question: 'Vidange de véhicule ou d\'appareil ?' },
    'terrasse': { why: 'Terrasse : revêtement, construction ou nettoyage.', question: 'Que faire sur la terrasse ?' },
    'charpente': { why: 'Charpente : toiture ou traitement du bois.', question: 'Réparer la toiture ou traiter le bois ?' },
    'decoration': { why: 'Décoration d\'événement, murale ou d\'intérieur.', question: 'Décorer quoi ?' }
};

/** Modificateurs de contexte : ils pondèrent l'urgence ou le lieu, ils ne classent jamais à eux seuls. */
const CONTEXT_MODIFIERS = {
    urgence: ['urgent|urgence|vite|aujourd hui|ce soir|tout de suite|des que possible'],
    cyclone: ['apres cyclone|apres le cyclone|alerte cyclone|avant le cyclone|degat cyclone'],
    saison_pluies: ['hivernage|saison des pluies|fortes pluies'],
    sargasses: ['sargasses|echouage'],
    lieu_domicile: ['chez moi|a domicile|a mon domicile'],
    lieu_exterieur: ['dans mon jardin|devant chez moi|sur mon terrain|a la plage']
};

const unknownTuning = Object.keys(TUNING).filter((code) => !TRADES.some((t) => t.code === code || t.specs.some((s) => s.code === code)));
if (unknownTuning.length) throw new Error(`editorial-tuning: codes inconnus ${unknownTuning.join(', ')}`);

module.exports = { CONTEXT_MODIFIERS, FAMILIES: ALL_FAMILIES, DISCOVER_TILES, TRADES, AMBIGUOUS_TERMS };
