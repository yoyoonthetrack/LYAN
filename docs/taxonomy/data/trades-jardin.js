'use strict';
const { S, T } = require('./_dsl');

module.exports = [
    // ───────────── Entretien du jardin ─────────────
    T('jardinage_entretien', 'Entretien de jardin', 'entretien', {},
        'jardinier|jardinage|entretien jardin|entretien de jardin|espaces verts|tonte|tondre|pelouse|taille haie|jardin',
        'mon jardin est envahi|l herbe est trop haute|je n ai plus le temps d entretenir mon jardin',
        '',
        [
            S('tonte', 'Tonte de pelouse', 'tonte|tondre|tonte de pelouse|pelouse|gazon|tondeuse|tonte jardin', 'l herbe est trop haute|tondre ma pelouse'),
            S('taille_haies', 'Taille de haies & arbustes', 'taille de haies|taille haie|haie|haies|arbustes|taille d arbustes|taille hibiscus|taille de buissons', 'tailler ma haie|la haie est trop haute|haie de lauriers a tailler'),
            S('desherbage', 'Désherbage & entretien de massifs', 'desherbage|desherber|massifs|binage|paillage|mauvaises herbes|entretien massifs|plates bandes', 'des mauvaises herbes partout|desherber mes allees'),
            S('dechets_verts', 'Évacuation de déchets verts', 'dechets verts|evacuation dechets verts|broyage|ramassage feuilles|branches coupees|evacuation de branches|dechetterie verte', 'evacuer mes dechets verts|tas de branches a evacuer'),
            S('entretien_regulier', 'Entretien régulier (abonnement jardinier)', 'jardinier regulier|entretien mensuel|entretien annuel|contrat d entretien|jardinier a l annee|passage mensuel', 'un jardinier qui passe chaque mois|entretien de mon jardin toute l annee')
        ]),

    T('debroussaillage', 'Débroussaillage & nettoyage de terrain', 'entretien', { safety: 'CAUTION', regulation: 'Obligation légale de débroussaillement autour des habitations en zones concernées.' },
        'debroussaillage|debroussailler|debroussailleuse|nettoyage de terrain|nettoyage de parcelle|friche|defrichage|terrain en friche|coupe coupe',
        'mon terrain est envahi par les broussailles|terrain a nettoyer avant de construire|ravine a nettoyer',
        'sabre|coupe-coupe|coupe coupe|nettoyer la ravine',
        [
            S('terrain', 'Débroussaillage de terrain', 'debroussaillage de terrain|debroussaillage|terrain|parcelle|m2|hectare|hautes herbes|broussailles', 'debroussaillage 400 m2|terrain envahi par les broussailles'),
            S('avant_construction', 'Nettoyage avant construction ou vente', 'nettoyage avant construction|nettoyage terrain a batir|defrichage|terrassement leger|preparation de terrain|avant vente', 'preparer un terrain avant des travaux|nettoyer un terrain a vendre'),
            S('talus_ravine', 'Talus, pentes & ravines', 'talus|pente|ravine|bord de route|fosse|berge|entretien talus', 'nettoyer le talus derriere chez moi|ravine envahie par les herbes'),
            S('obligation_legale', 'Débroussaillement obligatoire', 'debroussaillement obligatoire|obligation legale de debroussaillement|old|zone a risque|prevention incendie|coupe feu', 'la mairie m impose de debroussailler')
        ]),

    // ───────────── Arbres & végétation ─────────────
    T('elagage_abattage', 'Élagage & abattage', 'arbres',
        { safety: 'CAUTION', regulation: 'Travail en hauteur et tronçonneuse : équipements de protection obligatoires, assurance du professionnel.' },
        'elagage|elaguer|elagueur|abattage|abattre un arbre|arbre|tailler un arbre|dessouchage|tronconnage|grimpeur',
        'un arbre menace ma maison|branche qui touche la toiture|arbre tombe|les branches touchent les fils electriques',
        '',
        [
            S('taille_arbres', 'Taille & élagage d\'arbres', 'elagage|elaguer|taille d arbre|manguier|avocatier|arbre fruitier a tailler|branches|allegement de couronne', 'elaguer mon manguier|des branches touchent la toiture|arbre trop grand'),
            S('palmiers', 'Palmiers & cocotiers', 'cocotier|palmier|palmes|noix de coco|taille palmier|nettoyage palmier|cocotier a entretenir', 'cocotier dangereux|des noix de coco menacent de tomber|nettoyer les palmes', 'cocotier'),
            S('abattage', 'Abattage & dessouchage', 'abattage|abattre|dessouchage|rognage de souche|arbre mort|arbre dangereux|demontage d arbre', 'abattre un arbre mort|enlever une souche'),
            S('tronconnage_urgence', 'Arbre tombé & tronçonnage', 'arbre tombe|tronconnage|tronc|debit de bois|coupe de bois|bois de chauffe|arbre sur la route|apres cyclone arbre', 'un arbre est tombe dans mon jardin|arbre en travers du chemin apres le cyclone', '')
        ]),

    // ───────────── Création & plantations ─────────────
    T('paysagisme', 'Paysagisme & plantations', 'creation', {},
        'paysagiste|paysagisme|amenagement paysager|amenagement de jardin|creation de jardin|plantation|plantations|pepiniere|gazon|rocaille|fleurs',
        'je veux refaire mon jardin|mon jardin est triste|quelles plantes mettre',
        '',
        [
            S('amenagement', 'Aménagement & création de jardin', 'amenagement paysager|creation de jardin|amenagement de jardin|jardin paysager|plan de jardin|massif|jardin tropical|rocaille|bassin decoratif', 'creer un jardin|redessiner mon jardin|amenager l entree de la maison'),
            S('plantations', 'Plantations (arbres, haies, fleurs)', 'plantation|planter|plantations|arbre|fleurs|palmiers a planter|haie a planter|massifs de fleurs|bougainvillier|hibiscus', 'planter des arbres|planter une haie|mettre des fleurs'),
            S('gazon', 'Gazon & engazonnement', 'engazonnement|pose de gazon|semis gazon|gazon en rouleau|pelouse a refaire|regarnissage|gazon synthetique', 'refaire ma pelouse|poser du gazon'),
            S('conseil_plantes', 'Conseil, diagnostic & soin des plantes', 'conseil jardinage|plante malade|maladie des plantes|choix des plantes|diagnostic plantes|traitement plantes|plantes d interieur', 'mes plantes jaunissent|quelles plantes resistent au soleil')
        ]),

    T('arrosage_irrigation', 'Arrosage & irrigation', 'creation', {},
        'arrosage|irrigation|arrosage automatique|goutte a goutte|programmateur arrosage|electrovanne|tuyau d arrosage|asperseur',
        'mon jardin se desseche|je pars en vacances et mes plantes ont soif',
        '',
        [
            S('installation', 'Installation d\'arrosage automatique', 'arrosage automatique|installation arrosage|goutte a goutte|asperseur|programmateur|tuyau enterre', 'installer un arrosage automatique|arroser seul mon jardin'),
            S('reparation', 'Réparation d\'arrosage', 'reparation arrosage|fuite arrosage|electrovanne|tete d arrosage|programmateur en panne', 'arrosage qui ne marche plus|fuite sur le tuyau d arrosage'),
            S('recuperation_eau', 'Récupération & stockage d\'eau de pluie', 'recuperation eau de pluie|cuve de jardin|citerne jardin|collecteur|gouttiere cuve|reservoir pluie', 'recuperer l eau de pluie pour le jardin', '')
        ]),

    // ───────────── Extérieurs, bassins & piscine ─────────────
    T('piscine_bassin', 'Piscine & bassin', 'exterieur', {},
        'piscine|bassin|spa|jacuzzi|skimmer|chlore|filtration piscine|liner|robot piscine|entretien piscine|ph de piscine',
        'mon eau de piscine est verte|ma piscine est trouble|piscine abandonnee',
        '',
        [
            S('entretien', 'Entretien de piscine', 'entretien piscine|nettoyage piscine|traitement eau|chlore|ph|analyse eau|skimmer|panier skimmer|brossage|aspirateur piscine', 'eau verte|piscine trouble|nettoyer ma piscine chaque semaine|piscine verte'),
            S('mise_en_service', 'Mise en service, hivernage & remise en route', 'mise en service piscine|remise en route|hivernage|bache piscine|vidange piscine|remplissage', 'remettre ma piscine en route|vider ma piscine'),
            S('reparation_equipements', 'Réparation (pompe, filtre, liner)', 'pompe piscine|filtre piscine|liner|fuite piscine|local technique piscine|chauffage piscine|pompe a chaleur piscine|electrolyseur', 'pompe de piscine en panne|piscine qui perd de l eau|liner dechire'),
            S('spa_jacuzzi', 'Spa & jacuzzi', 'spa|jacuzzi|bain a remous|spa gonflable|entretien spa', 'mon spa ne chauffe plus')
        ]),

    T('nettoyage_exterieur', 'Nettoyage extérieur & haute pression', 'exterieur', { also: ['entretien'] },
        'nettoyage exterieur|haute pression|karcher|nettoyage terrasse|demoussage|nettoyage facade|nettoyage cour|nettoyage allee|nettoyage toiture|nettoyage de parking',
        'ma terrasse est noire|mousse sur les dalles|facade verdie|allee couverte de mousse',
        'karcher',
        [
            S('haute_pression', 'Nettoyage haute pression (terrasses, façades, allées)', 'haute pression|karcher|nettoyage terrasse|nettoyage allee|nettoyage cour|nettoyage facade|nettoyage dalles|nettoyage portail|nettoyage murs', 'nettoyer ma terrasse au karcher|terrasse noircie'),
            S('demoussage', 'Démoussage de toiture & surfaces', 'demoussage|demoussage toiture|traitement anti mousse|anti mousse|nettoyage toiture|traitement hydrofuge toiture|lichens', 'toiture couverte de mousse|toit noirci'),
            S('algues_debris', 'Évacuation d\'algues, débris & remise en état après intempéries', 'sargasses|algues|algues d echouage|debris|apres inondation|boue|nettoyage apres tempete|ramassage de sargasses|nettoyage de plage privee', 'sargasses devant ma maison|nettoyer mon terrain apres le cyclone|debris apres inondation', 'sargasses')
        ]),

    T('amenagement_exterieur', 'Terrasses, abris & allées', 'exterieur', { also: ['maison'] },
        'terrasse|allee|paves|abri de jardin|pergola|carport|cabanon|cuisine d ete|barbecue|pavage|dalles exterieures|kiosque',
        'je veux une terrasse couverte|je veux un coin barbecue dans le jardin',
        'ajoupa|kiosque',
        [
            S('terrasse', 'Création & rénovation de terrasse', 'terrasse|creation terrasse|renovation terrasse|dallage|terrasse composite|terrasse carrelee|terrasse couverte', 'refaire ma terrasse|creer une terrasse couverte'),
            S('allees_paves', 'Allées, pavés & cheminements', 'allee|allees|paves|pavage|gravier|bordures|stabilise|cheminement|dalles japonaises|parking jardin', 'refaire mon allee|poser des paves'),
            S('abri_pergola', 'Abris, pergolas & carports', 'abri de jardin|cabanon|pergola|carport|kiosque|ajoupa|tonnelle|montage abri de jardin|abri bois|auvent', 'monter un abri de jardin|construire un carport'),
            S('barbecue_cuisine_ete', 'Barbecue & cuisine d\'été', 'barbecue|cuisine d ete|four a pain|plancha maçonnée|coin repas exterieur|carbet|boucan', 'creer un coin repas dehors', 'carbet')
        ]),

    // ───────────── Potager, vivrier & agriculture ─────────────
    T('potager_vivrier', 'Potager & jardin vivrier', 'agricole', {},
        'potager|jardin vivrier|jardin creole|legumes|verger|compost|permaculture|arbres fruitiers|plantation de bananes',
        'je veux cultiver mes legumes|je veux un jardin vivrier',
        'jardin creole|jardin kreyol|jaden kreyol|abattis',
        [
            S('potager', 'Création & entretien de potager', 'potager|legumes|carres potagers|semis|plants|arrosage potager|cultiver|jardin creole|jardin vivrier', 'creer un potager|aide pour mon jardin creole'),
            S('verger_fruitiers', 'Verger & arbres fruitiers', 'verger|arbres fruitiers|bananiers|manguiers|agrumes|ananas|papayer|goyavier|greffage|plantation fruitiere', 'planter des arbres fruitiers|entretenir mes bananiers'),
            S('compost_permaculture', 'Compost & permaculture', 'compost|composteur|permaculture|paillage|lombricompost|culture bio|engrais naturel|butte', 'faire du compost|passer au jardin bio')
        ]),

    T('agricole', 'Aide agricole & petit élevage', 'agricole', {},
        'aide agricole|agriculteur|agriculture|recolte|abattis|canne|banane|ferme|exploitation agricole|elevage|poules|ruches|apiculture|miel',
        'j ai besoin de bras pour la recolte|je cherche quelqu un pour ma parcelle',
        'abattis|jardin creole|coupe de la canne|cabri',
        [
            S('recolte_entretien', 'Récolte & entretien de parcelle', 'recolte|recolter|entretien de parcelle|coupe de canne|recolte de bananes|abattis|cueillette|main d oeuvre agricole|saisonnier agricole', 'aide pour la recolte de bananes|besoin de bras sur ma parcelle'),
            S('petit_elevage', 'Petit élevage & basse-cour', 'basse cour|poules|poulailler|lapins|cabris|moutons|canards|nourrir animaux de la ferme|soins animaux de ferme|elevage', 'garder mes poules|entretenir mon poulailler'),
            S('apiculture', 'Apiculture & miel', 'apiculture|apiculteur|ruches|ruche|miel|essaim|extraction de miel', 'recuperer un essaim|installer une ruche'),
            S('marche_producteur', 'Vente & marché de producteurs', 'marche|vente directe|producteur local|panier de legumes|vente de fruits|vente de legumes|stand marche|vendre ma recolte', 'vendre mes fruits et legumes')
        ])
];
