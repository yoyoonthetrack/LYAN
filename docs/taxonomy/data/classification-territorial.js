'use strict';
/*
 * Jeux de classification TERRITORIAUX (revue produit 3.2B).
 *  - tuned   : sondage utilisé pour enrichir le lot de vocabulaire territorial (mesure « avant » : AN 70 %, GF 50 %, RE 30 % de classements stricts).
 *  - heldout : rédigé après l'enrichissement, jamais utilisé pour le réglage (mesure de généralisation, avec le biais de l'auteur).
 * accept = métiers acceptables ; `or` = classement par clarification accepté si les deux métiers sont plausibles.
 * region : antilles | guyane | reunion | tous
 */
const A = (region, q, ...accept) => ({ region, q, accept });
module.exports = {
    tuned: [
        A('antilles', 'ravets dans la cuisine', 'nuisibles_hygiene'), A('antilles', 'sargasses sur ma plage', 'nettoyage_exterieur'),
        A('antilles', 'bacher mon toit avant le cyclone', 'toiture_etancheite'), A('antilles', 'abattis', 'agricole'),
        A('antilles', 'tour d eau citerne vide', 'plomberie'), A('antilles', 'chauffe eau solaire en panne', 'energie_solaire'),
        A('antilles', 'groupe electrogene', 'electricite'), A('antilles', 'volets anti cyclone', 'vitrerie_stores'),
        A('antilles', 'demoustication dengue', 'nuisibles_hygiene'), A('antilles', 'madras costume de carnaval', 'couture_retouches'),
        A('antilles', 'cours de gwoka', 'danse', 'cours_musique'), A('antilles', 'cours de bele', 'danse', 'cours_musique'),
        A('antilles', 'bokit pour la soiree', 'traiteur_evenement', 'cuisine_domicile'), A('antilles', 'colombo de poulet', 'cuisine_domicile', 'traiteur_evenement'),
        A('antilles', 'yole ronde', 'activites_nautiques'), A('antilles', 'sortie en mer pecheur', 'activites_nautiques'),
        A('antilles', 'cours de neerlandais', 'langues'), A('antilles', 'ravine a nettoyer', 'debroussaillage'),
        A('antilles', 'tole arrachee', 'toiture_etancheite'), A('antilles', 'pose de moustiquaire', 'vitrerie_stores'),
        A('guyane', 'pirogue moteur en panne', 'bateau_mecanique_marine'), A('guyane', 'construire un carbet', 'menuiserie_bois', 'amenagement_exterieur'),
        A('guyane', 'hamac et moustiquaire', 'vitrerie_stores'), A('guyane', 'abattis a defricher', 'agricole'),
        A('guyane', 'maripa', 'cuisine_domicile', 'traiteur_evenement'), A('guyane', 'couac cassave', 'cuisine_domicile', 'traiteur_evenement'),
        A('guyane', 'bouillon d awara', 'traiteur_evenement', 'cuisine_domicile'), A('guyane', 'cours de portugais', 'langues'),
        A('guyane', 'cours de creole haitien', 'langues'), A('guyane', 'cours de hmong', 'langues'),
        A('guyane', 'interprete bushinenge', 'traduction_interpretation'), A('guyane', 'transport fluvial de marchandises', 'colis_livraison'),
        A('guyane', 'debroussaillage en foret', 'debroussaillage'), A('guyane', 'climatisation en panne', 'climatisation'),
        A('guyane', 'protection contre les moustiques', 'nuisibles_hygiene'),
        A('reunion', 'varangue a refaire', 'menuiserie_bois'), A('reunion', 'peindre ma case creole', 'peinture'),
        A('reunion', 'lambrequins en bois', 'menuiserie_bois'), A('reunion', 'cari poulet pour 20', 'traiteur_evenement'),
        A('reunion', 'rougail saucisse', 'cuisine_domicile', 'traiteur_evenement'), A('reunion', 'samoussas et bonbons piment', 'traiteur_evenement', 'cuisine_domicile'),
        A('reunion', 'cours de maloya', 'danse', 'cours_musique'), A('reunion', 'cours de sega', 'danse', 'cours_musique'),
        A('reunion', 'tressage vacoa', 'artisanat_creation'), A('reunion', 'randonnee au volcan', 'randonnee_nature'),
        A('reunion', 'parapente', 'randonnee_nature'), A('reunion', 'canyoning', 'randonnee_nature'),
        A('reunion', 'tangue dans le jardin', 'nuisibles_hygiene'), A('reunion', 'aide pour ma gramoun', 'aide_personnes_agees'),
        A('reunion', 'litchis a cueillir', 'potager_vivrier'), A('reunion', 'jardin creole', 'potager_vivrier'),
        A('reunion', 'apres le cyclone nettoyer la cour', 'nettoyage_exterieur'), A('reunion', 'tole de la case a refaire', 'toiture_etancheite'),
        A('reunion', 'moringue', 'arts_martiaux'), A('reunion', 'pecher au gros', 'activites_nautiques'),
        A('tous', 'plombier', 'plomberie'), A('tous', 'kreyol', 'langues')
    ],
    heldout: [
        A('antilles', 'cyclone passe, mon toit en tole est a refaire', 'toiture_etancheite'),
        A('antilles', 'des sargasses qui puent devant ma maison', 'nettoyage_exterieur'),
        A('antilles', 'cherche un professeur de creole pour mon fils', 'langues'),
        A('antilles', 'fete de quartier avec dj et sono', 'dj_sonorisation'),
        A('antilles', 'reparer mon scooter 50cc', 'deux_roues_velo'),
        A('antilles', 'envoyer un colis en metropole', 'colis_livraison'),
        A('antilles', 'menage chez moi trois heures par semaine', 'menage_domicile'),
        A('antilles', 'installer des panneaux solaires sur ma toiture', 'energie_solaire'),
        A('guyane', 'mon moteur hors bord ne demarre pas', 'bateau_mecanique_marine'),
        A('guyane', 'un macon pour agrandir ma maison a Cayenne', 'maconnerie'),
        A('guyane', 'climatisation qui goutte', 'climatisation'),
        A('guyane', 'traducteur francais portugais', 'traduction_interpretation'),
        A('guyane', 'moustiquaires pour toutes mes fenetres', 'vitrerie_stores'),
        A('guyane', 'cours de francais pour etrangers', 'langues'),
        A('guyane', 'faire a manger pour un anniversaire de quarante personnes', 'traiteur_evenement', 'cuisine_domicile'),
        A('guyane', 'mon jardin est envahi par les herbes', 'debroussaillage', 'jardinage_entretien'),
        A('reunion', 'fuite sous mon evier', 'plomberie'),
        A('reunion', 'coller du carrelage dans ma cuisine', 'carrelage_sols'),
        A('reunion', 'tailler mes bougainvilliers', 'jardinage_entretien'),
        A('reunion', 'cours de guitare pour mon ado', 'cours_musique'),
        A('reunion', 'cuisinier pour un mariage', 'traiteur_evenement', 'cuisine_domicile'),
        A('reunion', 'faire peindre mon portail', 'peinture', 'ferronnerie_soudure'),
        A('reunion', 'garder mon chien pendant les vacances', 'garde_animaux'),
        A('reunion', 'aide aux devoirs en maths', 'soutien_scolaire'),
        A('reunion', 'covoiturage pour aller a Saint-Denis', 'covoiturage_trajets'),
        A('reunion', 'cari pour le bapteme de ma fille', 'traiteur_evenement', 'cuisine_domicile')
    ]
};
