'use strict';
/*
 * Titres réels (distincts, non-QA) observés dans requests.title sur Staging le 2026-11-11.
 * ATTENTION : ce jeu a servi au réglage final (ce n'est pas un jeu hors échantillon).
 * accept = métiers acceptables ; status = comportement attendu quand le texte est trop vague.
 */
module.exports = [
    { q: 'fuite dans ma douche à l\'italienne', accept: ['plomberie'] },
    { q: 'réparation de fuite d\'huile dans ma voiture', accept: ['mecanique_auto'] },
    { q: 'fuite cuisine', accept: ['plomberie'] },
    { q: 'faire une piscine en 2 m x 2m', accept: ['piscine_bassin'] },
    { q: 'besoin d\'aide pour faire une terrasse en bois', accept: ['menuiserie_bois'] },
    { q: 'garde d\'enfant 7ans', accept: ['garde_enfants'] },
    { q: 'débroussaillage 400m2', accept: ['debroussaillage'] },
    { q: 'j’ai une fuite dans mon salon', accept: ['plomberie'] },
    { q: 'fuite dans ma cuisine', accept: ['plomberie'] },
    { q: '120 chaises à rodez', accept: ['location_materiel'] },
    { q: 'un plombier', accept: ['plomberie'] },
    { q: 'réparer un mur', accept: ['maconnerie'] },
    { q: 'réparer ma machine à laver', accept: ['electromenager'] },
    { q: 'service direct', accept: ['autre_demande'] },
    { q: 'arranger un garage', status: 'VAGUE' },
    { q: 'recherche', status: 'VAGUE' },
    { q: 'besoin de quelq', status: 'VAGUE' }
];
