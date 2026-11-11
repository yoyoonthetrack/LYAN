'use strict';
const { S, T } = require('./_dsl');

module.exports = [
    T('menage_domicile', 'Ménage à domicile', 'menage', {},
        'menage|femme de menage|aide menagere|nettoyage domicile|nettoyage maison|entretien maison|homme de menage|nettoyage logement|menager',
        'ma maison est sale|je n ai plus le temps de faire le menage|quelqu un pour nettoyer chez moi',
        '',
        [
            S('regulier', 'Ménage régulier', 'menage regulier|menage hebdomadaire|femme de menage|aide menagere|menage a domicile|menage une fois par semaine|menage tous les quinze jours', 'une femme de menage chaque semaine|aide menagere reguliere'),
            S('grand_menage', 'Grand ménage & remise en propreté', 'grand menage|nettoyage de printemps|remise en proprete|nettoyage complet|nettoyage en profondeur|menage approfondi', 'faire un grand menage|nettoyer toute la maison de fond en comble'),
            S('ponctuel', 'Ménage ponctuel (avant/après fête, départ)', 'menage ponctuel|menage apres fete|menage avant arrivee|menage express|menage apres reception|menage de depart|nettoyage sortie de logement', 'nettoyer apres une fete|menage avant l arrivee de ma famille'),
            S('cuisine_sdb', 'Cuisine, salle de bain & sanitaires', 'degraissage cuisine|nettoyage cuisine|nettoyage salle de bain|detartrage|nettoyage sanitaires|nettoyage four|nettoyage frigo|nettoyage hotte', 'salle de bain entartree|four tres sale')
        ]),

    T('linge_repassage', 'Linge & repassage', 'linge', {},
        'repassage|repasser|linge|lessive|pressing a domicile|blanchisserie|laver le linge|plier le linge|couette',
        'j ai une montagne de linge a repasser|plus de temps pour repasser',
        '',
        [
            S('repassage', 'Repassage', 'repassage|repasser|chemises|pantalons|repassage a domicile|fer a repasser|repasseuse', 'repasser mes chemises|beaucoup de repassage'),
            S('lessive_linge', 'Lessive & entretien du linge', 'lessive|laver le linge|machine de linge|sechage|pliage|linge de maison|draps|blanchisserie|pressing a domicile', 'quelqu un pour faire ma lessive|laver mes draps'),
            S('literie_rideaux', 'Literie, rideaux & gros textiles', 'couette|matelas|rideaux|nettoyage rideaux|tapis|nettoyage tapis|couvertures|oreillers', 'nettoyer mes rideaux|laver une couette')
        ]),

    T('nettoyage_special', 'Nettoyages spécialisés', 'special', {},
        'nettoyage special|nettoyage vitres|lavage de vitres|nettoyage apres travaux|nettoyage fin de chantier|shampoing canape|nettoyage moquette|nettoyage matelas|remise en etat',
        'ma maison a ete inondee|des travaux ont laisse de la poussiere partout|canape tache',
        '',
        [
            S('vitres', 'Vitres, baies & vérandas', 'vitres|lavage de vitres|nettoyage vitres|baies vitrees|veranda|vitrerie nettoyage|laveur de vitres|vitres en hauteur', 'vitres sales|nettoyer les baies vitrees'),
            S('canape_tapis_matelas', 'Canapé, tapis, moquette & matelas', 'shampoing canape|nettoyage canape|injecteur extracteur|nettoyage tapis|nettoyage moquette|nettoyage matelas|desinfection matelas|detachage|vapeur', 'canape tache|matelas a nettoyer|tapis tres sale'),
            S('fin_chantier', 'Nettoyage de fin de chantier', 'nettoyage fin de chantier|nettoyage apres travaux|nettoyage post travaux|poussiere de chantier|nettoyage de livraison|nettoyage vefa', 'nettoyer apres des travaux|poussiere partout apres la renovation'),
            S('sinistre_inondation', 'Remise en état après sinistre ou inondation', 'remise en etat apres sinistre|nettoyage apres inondation|degat des eaux nettoyage|assechement|nettoyage apres incendie|boue apres inondation|nettoyage apres cyclone|nettoyage apres degats', 'ma maison a ete inondee|nettoyer apres un incendie|boue dans toute la maison', '')
        ]),

    T('nettoyage_locaux_pro', 'Nettoyage de locaux & parties communes', 'locaux', {},
        'nettoyage bureaux|nettoyage de locaux|nettoyage commerce|nettoyage copropriete|parties communes|entretien immeuble|nettoyage cabinet|nettoyage ecole|agent d entretien',
        'je cherche quelqu un pour entretenir mon commerce|entretien des escaliers de mon immeuble',
        '',
        [
            S('bureaux_commerces', 'Bureaux, commerces & cabinets', 'nettoyage bureaux|nettoyage commerce|nettoyage boutique|nettoyage cabinet|nettoyage restaurant|nettoyage salon|entretien magasin|nettoyage local professionnel', 'nettoyer mon magasin|menage de mon bureau chaque soir'),
            S('parties_communes', 'Parties communes & copropriétés', 'parties communes|copropriete|escaliers immeuble|entretien immeuble|syndic|hall d immeuble|local poubelles|gardien d immeuble', 'nettoyer les escaliers de l immeuble|entretien de la residence'),
            S('locaux_associatifs', 'Salles communales & locaux associatifs', 'salle des fetes|salle communale|local associatif|nettoyage eglise|nettoyage salle|nettoyage apres evenement', 'nettoyer la salle apres la fete')
        ]),

    T('conciergerie_location', 'Conciergerie & location saisonnière', 'locaux', {},
        'conciergerie|conciergerie airbnb|location saisonniere|gite|airbnb|accueil voyageurs|remise des cles|menage airbnb|menage gite|gestion locative',
        'je loue ma maison et je n habite pas sur place|je cherche quelqu un pour accueillir mes locataires',
        '',
        [
            S('menage_rotation', 'Ménage & rotation de linge', 'menage airbnb|menage gite|rotation|linge location|menage location saisonniere|preparation du logement|check out|changement de draps', 'menage entre deux locataires|preparer ma location'),
            S('accueil_cles', 'Accueil des voyageurs & remise des clés', 'accueil voyageurs|remise des cles|check in|livret d accueil|boite a cles|accueil locataires|etat des lieux', 'accueillir mes voyageurs|remettre les cles a mes locataires'),
            S('petit_entretien_location', 'Petit entretien & dépannage de location', 'petit entretien location|ampoules location|reapprovisionnement|depannage location|gestion des pannes|piscine location|reapprovisionnement consommables', 'un coup de main pour entretenir ma location')
        ]),

    T('gardiennage_maison', 'Gardiennage & surveillance de logement', 'locaux', {},
        'gardiennage|gardien|surveillance maison|garde de maison|house sitting|surveiller la maison|passage domicile|absence prolongee|arroser les plantes',
        'je pars en vacances et je veux que quelqu un surveille ma maison|qui peut s occuper de ma maison pendant mon absence',
        '',
        [
            S('surveillance_absence', 'Surveillance pendant une absence', 'surveillance maison|surveillance villa|passage regulier|verification du logement|ouverture des volets|relever le courrier|surveillance pendant vacances', 'surveiller la maison pendant mes vacances|passer regulierement chez moi'),
            S('plantes_courrier', 'Arrosage des plantes & courrier', 'arroser les plantes|arrosage plantes|courrier|relever le courrier|nourrir le poisson|plantes pendant vacances|vider la boite aux lettres', 'arroser mes plantes pendant mon absence'),
            S('presence_nuit', 'Présence & garde de maison', 'garde de maison|house sitting|presence a domicile|dormir sur place|logement occupe|gardiennage de nuit|surveillance de chantier', 'quelqu un pour dormir chez moi pendant mon voyage')
        ]),

    T('nuisibles_hygiene', 'Insectes, rongeurs & hygiène', 'hygiene',
        { safety: 'CAUTION', also: ['maison'], regulation: 'Produits biocides : certification des applicateurs professionnels (certibiocide). Les termites relèvent de « Termites, humidité & traitement du bâti ».' },
        'desinsectisation|deratisation|nuisibles|cafards|rats|souris|moustiques|fourmis|punaises de lit|guepes|desinfection|3d',
        'j ai des cafards dans la cuisine|des rats dans le plafond|invasion de fourmis|nid de guepes',
        'ravets|ravet|fourmis folles|fourmis manioc|mabouya|bebetes',
        [
            S('insectes', 'Cafards, fourmis, moustiques & guêpes', 'cafards|ravets|fourmis|fourmis folles|moustiques|guepes|nid de guepes|frelons|punaises de lit|puces|mouches|desinsectisation', 'des cafards dans la cuisine|invasion de fourmis|nid de guepes sous le toit', 'ravets|fourmis folles'),
            S('rongeurs', 'Rats, souris & rongeurs', 'rats|souris|rongeurs|deratisation|rat dans le plafond|bruit dans le plafond|piege a rat|raticide', 'j entends des rats dans le plafond|des souris dans le placard'),
            S('desinfection', 'Désinfection & assainissement', 'desinfection|assainissement|desodorisation|nettoyage insalubre|syndrome de diogene|vide sanitaire|3d', 'desinfecter apres un deces|logement tres insalubre'),
            S('serpents_animaux', 'Serpents, animaux sauvages & nids', 'serpent|animaux sauvages|nid|chauves souris|iguane|mangouste|capture d animaux|animal sauvage', 'un serpent dans mon jardin|des chauves souris dans le toit', '')
        ]),

    T('rangement_organisation', 'Rangement & organisation d\'intérieur', 'hygiene', {},
        'rangement|ranger|organisation|home organizer|desencombrement|tri|trier|vider|dressing|organiser',
        'ma maison est en desordre|trop d affaires|je dois trier avant de demenager',
        '',
        [
            S('tri_desencombrement', 'Tri & désencombrement', 'tri|desencombrement|trier|vider|desencombrer|tri de vetements|tri de papiers|vide maison|prepare le demenagement', 'trier mes affaires|aide pour vider un appartement'),
            S('organisation_interieure', 'Organisation, dressing & rangement', 'rangement|organisation interieure|dressing|ranger la cuisine|ranger le garage|home organizer|optimisation de l espace|etiquetage', 'organiser mes placards|ranger mon garage'),
            S('archivage_papiers', 'Classement de papiers & archives domestiques', 'classement de papiers|archivage|classer mes papiers|dossiers|tri administratif|archives|classeur', 'classer mes papiers personnels', '')
        ])
];
