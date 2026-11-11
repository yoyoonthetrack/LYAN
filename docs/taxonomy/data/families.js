'use strict';
/*
 * Les 8 grandes familles (niveau 1), leurs sous-domaines d'affichage (« groupes ») et les 9 tuiles Découvrir.
 * « Autres » n'est pas une 9e famille : c'est le réceptacle technique des demandes non classées (10e position).
 */

const FAMILIES = [
    {
        code: 'maison', ord: 1, icon: 'house-line', tone: 'green',
        label: 'Maison, travaux et dépannage', short: 'Maison & travaux',
        pitch: 'Réparer, installer, rénover et équiper son logement.',
        groups: [
            { code: 'depannage', label: 'Dépannage & installations' },
            { code: 'travaux', label: 'Rénovation & construction' },
            { code: 'petits', label: 'Petits travaux & bricolage' },
            { code: 'equipement', label: 'Énergie, sécurité & équipements' }
        ],
        t: ['maison', 'travaux', 'dépannage', 'réparation', 'artisan', 'bricoleur', 'rénover', 'chantier', 'logement']
    },
    {
        code: 'jardin', ord: 2, icon: 'plant', tone: 'yellow',
        label: 'Jardin et extérieur', short: 'Jardin & extérieur',
        pitch: 'Entretenir, planter, tailler, aménager et nettoyer les extérieurs.',
        groups: [
            { code: 'entretien', label: 'Entretien du jardin' },
            { code: 'arbres', label: 'Arbres & végétation' },
            { code: 'creation', label: 'Création & plantations' },
            { code: 'exterieur', label: 'Extérieurs, bassins & piscine' },
            { code: 'agricole', label: 'Potager, vivrier & agriculture' }
        ],
        t: ['jardin', 'jardinier', 'extérieur', 'terrain', 'pelouse', 'espaces verts', 'plantes']
    },
    {
        code: 'entretien', ord: 3, icon: 'broom', tone: 'yellow',
        label: 'Ménage et entretien', short: 'Ménage & entretien',
        pitch: 'Garder son logement, son linge et ses locaux propres et en ordre.',
        groups: [
            { code: 'menage', label: 'Ménage à domicile' },
            { code: 'linge', label: 'Linge & repassage' },
            { code: 'special', label: 'Nettoyages spécialisés' },
            { code: 'locaux', label: 'Locaux, conciergerie & gardiennage' },
            { code: 'hygiene', label: 'Hygiène & organisation' }
        ],
        t: ['ménage', 'nettoyage', 'entretien', 'propre', 'femme de ménage', 'aide ménagère']
    },
    {
        code: 'beaute', ord: 4, icon: 'flower-lotus', tone: 'green',
        label: 'Beauté, bien-être et sport', short: 'Beauté & bien-être',
        pitch: 'Se coiffer, se faire belle ou beau, se détendre et bouger.',
        groups: [
            { code: 'coiffure', label: 'Coiffure & cheveux' },
            { code: 'esthetique', label: 'Esthétique & maquillage' },
            { code: 'bienetre', label: 'Massage & bien-être' },
            { code: 'sport', label: 'Sport & mouvement' },
            { code: 'nature', label: 'Nature & activités nautiques' }
        ],
        t: ['beauté', 'bien-être', 'coiffure', 'sport', 'coach', 'détente', 'relaxation']
    },
    {
        code: 'transport', ord: 5, icon: 'truck', tone: 'yellow',
        label: 'Transport, véhicules et logistique', short: 'Transport & véhicules',
        pitch: 'Se déplacer, transporter, déménager et entretenir son véhicule.',
        groups: [
            { code: 'personnes', label: 'Déplacements de personnes' },
            { code: 'colis', label: 'Colis, fret & livraison' },
            { code: 'demenagement', label: 'Déménagement & manutention' },
            { code: 'vehicules', label: 'Véhicules & mécanique' },
            { code: 'nautique', label: 'Bateau & mécanique marine' }
        ],
        t: ['transport', 'véhicule', 'voiture', 'livraison', 'déménagement', 'mécanique', 'auto']
    },
    {
        code: 'famille', ord: 6, icon: 'users-three', tone: 'green',
        label: 'Famille, éducation et assistance', short: 'Famille & éducation',
        pitch: 'Enfants, cours, seniors, animaux et coups de main du quotidien.',
        groups: [
            { code: 'enfants', label: 'Enfants & garde' },
            { code: 'cours', label: 'Soutien scolaire, langues & cours' },
            { code: 'seniors', label: 'Seniors & aide à la personne' },
            { code: 'quotidien', label: 'Aide du quotidien' },
            { code: 'animaux', label: 'Animaux de compagnie' }
        ],
        t: ['famille', 'enfant', 'cours', 'éducation', 'aide', 'senior', 'animal', 'assistance']
    },
    {
        code: 'evenement', ord: 7, icon: 'confetti', tone: 'yellow',
        label: 'Événementiel, cuisine et création', short: 'Fêtes, cuisine & création',
        pitch: 'Organiser une fête, cuisiner, photographier, créer et fabriquer.',
        groups: [
            { code: 'organisation', label: 'Organisation, animation & location' },
            { code: 'cuisine', label: 'Cuisine, traiteur & pâtisserie' },
            { code: 'image', label: 'Photo & vidéo' },
            { code: 'creation', label: 'Artisanat, couture & arts' },
            { code: 'spectacle', label: 'Musique & spectacle' }
        ],
        t: ['événement', 'fête', 'cuisine', 'traiteur', 'création', 'artisanat', 'photo', 'mariage']
    },
    {
        code: 'numerique', ord: 8, icon: 'laptop', tone: 'green',
        label: 'Numérique, administratif et services professionnels', short: 'Numérique & administratif',
        pitch: 'Équipements, sites, démarches, papiers, gestion et accompagnement pro.',
        groups: [
            { code: 'depannage', label: 'Dépannage & équipements' },
            { code: 'creation', label: 'Création & communication' },
            { code: 'formation', label: 'Initiation & formation' },
            { code: 'admin', label: 'Démarches & papiers' },
            { code: 'pro', label: 'Services aux professionnels' }
        ],
        t: ['numérique', 'informatique', 'administratif', 'démarches', 'professionnel', 'ordinateur', 'internet']
    }
];

// Réceptacle technique (10e position). Aucune annonce n'y est « rangée » volontairement : c'est le filet de sécurité.
const AUTRES = {
    code: 'autres', ord: 9, icon: 'dots-three', tone: 'yellow',
    label: 'Autres', short: 'Autres',
    pitch: 'Un besoin qui ne rentre dans aucune case : décrivez-le, LYANN le classera.',
    groups: [{ code: 'libre', label: 'Demande libre' }],
    t: ['autre', 'divers', 'autres besoins', 'demande libre', 'je ne trouve pas']
};

// 9 tuiles « Découvrir » + « Autres » en 10e position.
// La famille 1 (la plus dense) est exposée par deux tuiles qui pointent vers deux de ses groupes :
// c'est le seul endroit où le nombre de tuiles (9) diffère du nombre de familles (8).
const DISCOVER_TILES = [
    { code: 'tile_depannage', label: 'Dépannage maison', family: 'maison', groups: ['depannage', 'equipement'], icon: 'wrench' },
    { code: 'tile_travaux', label: 'Travaux & rénovation', family: 'maison', groups: ['travaux', 'petits'], icon: 'hammer' },
    { code: 'tile_jardin', label: 'Jardin & extérieur', family: 'jardin', groups: null, icon: 'plant' },
    { code: 'tile_menage', label: 'Ménage & entretien', family: 'entretien', groups: null, icon: 'broom' },
    { code: 'tile_beaute', label: 'Beauté & bien-être', family: 'beaute', groups: null, icon: 'flower-lotus' },
    { code: 'tile_transport', label: 'Transport & véhicules', family: 'transport', groups: null, icon: 'truck' },
    { code: 'tile_famille', label: 'Famille & éducation', family: 'famille', groups: null, icon: 'users-three' },
    { code: 'tile_fetes', label: 'Fêtes, cuisine & création', family: 'evenement', groups: null, icon: 'confetti' },
    { code: 'tile_numerique', label: 'Numérique & administratif', family: 'numerique', groups: null, icon: 'laptop' },
    { code: 'tile_autres', label: 'Autres', family: 'autres', groups: null, icon: 'dots-three' }
];

module.exports = { FAMILIES, AUTRES, DISCOVER_TILES };
