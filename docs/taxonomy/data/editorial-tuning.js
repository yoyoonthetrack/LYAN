'use strict';
/*
 * Calque d'ajustements éditoriaux issu de la campagne d'évaluation (classification-cases.js).
 * Chaque entrée ajoute (t/p/l) ou retire (drop) des termes d'un nœud. Les codes ne changent jamais.
 * Ce calque est fusionné dans l'agrégat : la source de génération (JSON/CSV/SQL) est donc cohérente.
 */
module.exports = {
    organisation_evenement_mariage_ceremonie: { drop: 'mariage|bapteme|ceremonie|communion' },
    organisation_evenement_anniversaires_fetes: { drop: 'anniversaire|fete|fetes' },
    langues_creole: { drop: 'creole|creoles' },
    securite_automatismes_portail_motorisation: { drop: 'portail coulissant|portail battant', t: 'telecommande|telecommande portail|moteur portail|motorisation de portail coulissant|motorisation de portail battant', p: 'portail coulissant ne s ouvre plus|portail coulissant bloque|portail coulissant en panne|portail battant en panne|portail battant ne s ouvre plus' },
    // --- Réglage issu des titres réels de la recette Staging (jeu classification-staging.js) ---
    plomberie_fuite: { t: 'fuite douche|fuite dans ma douche|fuite salle de bain|fuite cuisine|fuite dans ma cuisine|fuite evier|fuite plafond|fuite salon|fuite dans mon salon|fuite wc|fuite sous evier', p: 'j ai une fuite dans mon salon|fuite dans ma douche a l italienne|fuite dans ma cuisine' },
    mecanique_auto_diagnostic_panne: { t: 'fuite d huile|fuite huile|fuite d huile voiture|fuite liquide de refroidissement|fuite d essence', p: 'fuite d huile dans ma voiture' },
    arts_visuels: { drop: 'huile' },
    arts_visuels_tableau_commande: { drop: 'huile' },
    menuiserie_bois_terrasse_pergola: { t: 'terrasse en bois|terrasse bois|deck|lames de terrasse|faire une terrasse en bois', p: 'besoin d aide pour faire une terrasse en bois' },
    maconnerie_reparation: { t: 'reparer un mur|reparation de mur|mur abime|trou dans le mur|reboucher un mur', p: 'reparer un mur' },
    sports_ballon_raquette_petanque_jeux: { drop: 'carte|cartes' },
    sports_ballon_raquette: { drop: 'carte|cartes' },
    courses_commissions: { t: 'faire mes courses|faire les courses|faire mes courses a ma place|faire mes courses pour moi|courses a ma place', p: 'faire mes courses a ma place|je ne peux pas me deplacer pour mes courses' },
    initiation_numerique: { t: 'apprendre a utiliser internet|apprendre a utiliser mon ordinateur|apprendre a utiliser mon telephone|apprendre a utiliser|utiliser mes mails|apprendre l informatique', p: 'apprendre a utiliser internet et mes mails|je ne sais pas me servir de mon ordinateur' },
    conciergerie_location: { t: 'gerer la location de mon gite|gerer ma location|gerer mon airbnb|gestion locative|location de gite|location saisonniere|gite|airbnb', p: 'gerer la location de mon gite en airbnb|je loue ma maison aux touristes' },
    plomberie: { t: 'toilettes bouchees|wc bouche|wc bouches|evacuation bouchee|siphon bouche', p: 'les toilettes sont bouchees|mon evier est bouche' },
    traiteur_evenement: { drop: 'bouchees' },
    electromenager: {
        t: 'frigo|refrigerateur|congelateur|lave linge|lave vaisselle|four|plaque de cuisson|seche linge|micro ondes',
        p: 'mon lave linge ne vidange plus|mon frigo ne fait plus de froid|le four ne chauffe plus|le lave vaisselle ne vidange plus'
    },
    maconnerie: { drop: 'terrasse a refaire', p: 'dalle de terrasse a refaire' },
    securite_automatismes: { t: 'telecommande portail|telecommande de portail|moteur de portail|portail ne s ouvre plus', p: 'mon portail ne s ouvre plus avec la telecommande|la telecommande du portail ne marche plus' },
    nettoyage_special: {
        t: 'nettoyer les vitres|nettoyage de vitres|laver mes vitres|nettoyer un canape|nettoyage canape|canape|matelas|nettoyage de tapis|nettoyer un matelas',
        p: 'nettoyer un canape et des matelas|laver les vitres de ma maison'
    },
    linge_repassage: { drop: 'matelas|nettoyage tapis|nettoyage de tapis' },
    nettoyage_locaux_pro: { t: 'menage bureaux|menage dans des bureaux|menage de bureau|nettoyer des bureaux|entretien des locaux|menage dans un cabinet', p: 'menage dans des bureaux le soir' },
    gardiennage_maison: { t: 'surveiller ma maison|surveillance de maison|quelqu un pour passer chez moi|garder ma maison|maison vide', p: 'surveiller ma maison pendant mes vacances|qui peut garder ma maison pendant mes vacances' },
    demenagement: { t: 'demenager un canape|demenager un frigo|demenager mes meubles|deplacer un canape|transporter un canape', p: 'demenager un canape et un frigo' },
    depannage_vehicule: { t: 'creve|creve sur la route|pneu creve sur la route|j ai creve|crevaison sur la route', p: 'je suis creve sur la route|ma voiture ne demarre pas' },
    organisation_evenement: {
        drop: 'mariage|bapteme|anniversaire|reception|ceremonie|fete',
        t: 'organiser un mariage|organisation de mariage|organiser un bapteme|organiser un anniversaire|anniversaire surprise|organiser une reception|organiser une ceremonie|fete d anniversaire|organisation anniversaire'
    },
    langues: { drop: 'creole', t: 'cours de creole|apprendre le creole|parler creole' },
    smartphone_tablette: { t: 'ecran de telephone|ecran de telephone casse|ecran de smartphone|changer ecran telephone|vitre de telephone', p: 'ecran de telephone casse' },
    tv_audiovisuel: { t: 'installer ma tele|installer une tele|installer ma box|box internet|installation box', p: 'installer ma tele et ma box|installer ma tele' },
    traduction_interpretation: { t: 'traduire un document|traduire en anglais|traduction en anglais|traduire en francais|traduction anglais francais|traduire un document en anglais', p: 'traduire un document en anglais' }
};
