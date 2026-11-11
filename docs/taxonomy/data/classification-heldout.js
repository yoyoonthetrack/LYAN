'use strict';
/*
 * Jeu « hors échantillon » : rédigé APRÈS le réglage éditorial, jamais utilisé pour ajuster les termes.
 * Il sert à mesurer la généralisation (le jeu principal, lui, a servi au réglage).
 * accept = métiers acceptables en première position ; status 'CLARIFY' = question de précision attendue.
 */
module.exports = [
    { q: 'mon chauffe-eau ne chauffe plus', accept: ['plomberie', 'energie_solaire', 'electricite'] },
    { q: 'besoin de changer la serrure de ma porte d\'entree', accept: ['serrurerie'] },
    { q: 'une prise electrique qui chauffe', accept: ['electricite'] },
    { q: 'refaire la salle de bain complete', accept: ['renovation'] },
    { q: 'installer des etageres dans mon garage', accept: ['bricolage'] },
    { q: 'refaire l enduit de ma facade', accept: ['peinture'] },
    { q: 'tailler ma haie de lauriers', accept: ['jardinage_entretien'] },
    { q: 'planter des arbres fruitiers et un potager', accept: ['potager_vivrier', 'paysagisme'] },
    { q: 'ma pompe de piscine fait du bruit', accept: ['piscine_bassin'] },
    { q: 'quelqu un pour faire le menage apres mon sejour airbnb', accept: ['conciergerie_location', 'menage_domicile'] },
    { q: 'laver et repasser mon linge de la semaine', accept: ['linge_repassage'] },
    { q: 'desinfecter ma maison contre les moustiques', accept: ['nuisibles_hygiene'] },
    { q: 'faire des tresses collees a ma fille', accept: ['tresses_cheveux_naturels'] },
    { q: 'manucure et pose de faux ongles', accept: ['ongles'] },
    { q: 'maquillage pour mon mariage', accept: ['maquillage'] },
    { q: 'seance de pilates', accept: ['yoga_pilates'] },
    { q: 'cours de danse zouk', accept: ['danse'] },
    { q: 'apprendre a nager a mon enfant', accept: ['natation'] },
    { q: 'porter des cartons au troisieme etage', accept: ['manutention_debarras', 'demenagement'] },
    { q: 'faire livrer un meuble achete en ligne', accept: ['transport_objets', 'colis_livraison'] },
    { q: 'changer les plaquettes de frein', accept: ['mecanique_auto'] },
    { q: 'reparer mon scooter qui cale', accept: ['deux_roues_velo'] },
    { q: 'une rayure sur la portiere', accept: ['carrosserie_auto'] },
    { q: 'quelqu un pour garder mes enfants mercredi apres midi', accept: ['garde_enfants'] },
    { q: 'cours de maths pour mon fils en terminale', accept: ['soutien_scolaire'] },
    { q: 'cours de piano', accept: ['cours_musique'] },
    { q: 'quelqu un pour tenir compagnie a mon pere', accept: ['aide_personnes_agees'] },
    { q: 'faire garder mon chat pendant les vacances', accept: ['garde_animaux'] },
    { q: 'une animation pour l anniversaire de mon fils', accept: ['animation', 'organisation_evenement'] },
    { q: 'des ballons et une arche pour une fete', accept: ['decoration_evenement'] },
    { q: 'louer des chaises et des tables', accept: ['location_materiel'] },
    { q: 'gateau de mariage', accept: ['patisserie'] },
    { q: 'faire un site internet pour mon restaurant', accept: ['creation_web'] },
    { q: 'mon imprimante ne marche plus', accept: ['informatique_depannage'] },
    { q: 'configurer mon nouveau smartphone', accept: ['smartphone_tablette'] },
    { q: 'faire une demande d allocation en ligne', accept: ['aide_administrative'] },
    { q: 'preparer un entretien d embauche', accept: ['cv_redaction', 'formation_coaching_pro'] },
    { q: 'creer des affiches pour mon association', accept: ['graphisme_design'] },
    { q: 'un probleme avec ma facture et mon devis', accept: ['comptabilite_gestion', 'secretariat_assistance'] },
    { q: 'bonjour', status: 'UNCLASSIFIED' },
    { q: 'ca depend', status: 'UNCLASSIFIED' }
];
