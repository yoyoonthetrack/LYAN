'use strict';
const { S, T } = require('./_dsl');

module.exports = [
    // ───────────── Dépannage & installations ─────────────
    T('plomberie', 'Plomberie', 'depannage', {},
        'plombier|plomberie|sanitaire|tuyauterie|canalisation|robinet|tuyau',
        'plus d eau chaude|plus d eau|pas de pression|eau qui coule|degats des eaux',
        '',
        [
            S('fuite', 'Fuite & recherche de fuite', 'fuite|fuites|recherche de fuite|infiltration d eau|fuite d eau|goutte a goutte robinet', 'ca fuit|j ai une fuite|fuite sous l evier|fuite dans le plafond|compteur d eau qui tourne|tache d humidite au plafond'),
            S('robinetterie', 'Robinetterie & joints', 'mitigeur|joint de robinet|changer un robinet|robinetterie|flexible|siphon', 'robinet qui goutte|robinet qui fuit|robinet bloque'),
            S('wc', 'WC, lavabo & douche', 'wc|toilettes|chasse d eau|lavabo|vasque|douche|baignoire|receveur', 'wc qui coule|chasse d eau qui fuit|wc bouche|toilettes bouchees'),
            S('debouchage', 'Débouchage & évacuations', 'debouchage|deboucher|evier bouche|canalisation bouchee|evacuation|fosse septique|degorgement', 'evier bouche|douche qui ne se vide pas|odeur d egout|ca remonte'),
            S('chauffe_eau', 'Chauffe-eau & ballon d\'eau chaude', 'chauffe eau|cumulus|ballon d eau chaude|resistance chauffe eau|groupe de securite', 'chauffe eau en panne|eau pas assez chaude|chauffe eau qui fuit'),
            S('citerne_pompe', 'Citerne, cuve & surpresseur', 'citerne|cuve eau|surpresseur|pompe a eau|reservoir d eau|recuperation eau de pluie|pompe de relevage', 'pas de pression apres coupure d eau|plus d eau dans la citerne|pompe qui tourne sans arret', 'tour d eau|reserve d eau'),
            S('installation', 'Installation sanitaire & raccordements', 'installation sanitaire|pose lavabo|pose wc|salle de bain|raccordement lave linge|raccordement lave vaisselle|pose evier|colonne de douche', 'installer une douche|poser un lavabo|brancher ma machine a laver')
        ]),

    T('electricite', 'Électricité', 'depannage',
        { safety: 'CAUTION', regulation: 'Installation neuve ou modification du tableau : professionnel qualifié (NF C 15-100). Le particulier peut faire du petit dépannage hors tableau.' },
        'electricien|electricite|installation electrique|courant|cablage electrique',
        'plus de courant|panne d electricite|ca disjoncte|court circuit|ca sent le brule electrique',
        '',
        [
            S('panne', 'Panne & recherche de panne', 'panne electrique|panne de courant|recherche de panne|diagnostic electrique|differentiel', 'le courant saute|plus de lumiere|disjoncteur qui saute|plus de courant dans une piece|prise qui chauffe'),
            S('prises', 'Prises & interrupteurs', 'prise electrique|interrupteur|va et vient|prise murale|prise usb|variateur|prise exterieure', 'prise qui ne marche plus|interrupteur casse|ajouter une prise'),
            S('luminaires', 'Luminaires & éclairage', 'luminaire|lustre|applique|spot|suspension|ampoule|plafonnier|pose luminaire|pose luminaires|eclairage', 'poser un lustre|changer des spots|installer une applique'),
            S('tableau', 'Tableau électrique & mise aux normes', 'tableau electrique|disjoncteur|mise aux normes electrique|compteur edf|raccordement reseau|mise a la terre|consuel', 'tableau electrique ancien|mise aux normes de mon installation|changer mon disjoncteur', '',
                { safety: 'PRO_REQUIRED', regulation: 'Intervention sur tableau et raccordement réseau : professionnel qualifié et assuré.' }),
            S('ventilateur', 'Ventilateurs & brasseurs d\'air', 'ventilateur|ventilateur de plafond|brasseur d air|extracteur|hotte aspirante', 'installer un ventilateur de plafond|le ventilateur ne tourne plus', 'brasseur'),
            S('groupe_electrogene', 'Groupe électrogène, onduleur & secours', 'groupe electrogene|onduleur|batterie de secours|inverseur de source|generateur', 'brancher un groupe electrogene|coupure de courant prolongee', ''),
            S('exterieur', 'Éclairage & prises extérieurs', 'eclairage exterieur|projecteur|detecteur de mouvement|borne lumineuse|guirlande exterieure', 'eclairer mon jardin|eclairer l allee|projecteur qui ne marche plus')
        ]),

    T('climatisation', 'Climatisation & froid', 'depannage',
        { safety: 'PRO_REQUIRED', regulation: 'Manipulation de fluides frigorigènes : attestation de capacité obligatoire.' },
        'clim|climatisation|climatiseur|split|inverter|froid|ventilation|vmc|chambre froide',
        'ca ne refroidit plus|la clim ne souffle plus froid|il fait trop chaud chez moi',
        '',
        [
            S('installation', 'Pose de climatisation', 'pose clim|installation clim|installer une clim|mono split|multi split|unite exterieure|groupe exterieur', 'installer une climatisation|poser un split dans la chambre'),
            S('entretien', 'Entretien & nettoyage', 'entretien clim|nettoyage clim|filtre clim|desinfection clim|revision clim|moisissure clim', 'clim qui sent mauvais|nettoyer les filtres de ma clim'),
            S('depannage', 'Dépannage & panne', 'depannage clim|panne clim|clim en panne|telecommande clim|carte electronique clim', 'clim qui fuit|clim qui fait du bruit|clim qui s eteint toute seule|la clim goutte'),
            S('recharge_fluide', 'Recharge de gaz & fluide', 'recharge gaz clim|fluide frigorigene|recharge clim|detection de fuite fluide', 'clim qui ne refroidit plus malgre le nettoyage'),
            S('froid_ventilation', 'Froid, chambre froide & VMC', 'refrigeration|groupe froid|vmc|ventilation mecanique|extraction air|vitrine refrigeree', 'chambre froide en panne')
        ]),

    T('serrurerie', 'Serrurerie', 'depannage',
        { safety: 'CAUTION', regulation: 'Ouverture de porte : justificatif de domicile ou d\'identité demandé par le professionnel.' },
        'serrurier|serrurerie|serrure|cle|verrou|cylindre|cadenas',
        'porte claquee|cle perdue|cle cassee dans la serrure|porte bloquee|je suis enferme dehors|serrure qui bloque',
        '',
        [
            S('ouverture', 'Ouverture de porte', 'ouverture de porte|ouverture porte claquee|depannage serrurier|porte claquee', 'je suis enferme dehors|cles a l interieur|porte qui ne s ouvre plus'),
            S('changement_serrure', 'Changement de serrure & cylindre', 'changement de serrure|changer la serrure|cylindre|serrure 3 points|serrure multipoints', 'changer les serrures apres un vol|serrure forcee'),
            S('securite', 'Sécurisation & blindage', 'blindage|porte blindee|verrou de securite|renfort de porte|barre de securite|grille de protection', 'securiser ma porte|apres une tentative de cambriolage'),
            S('cles', 'Clés, doubles & cadenas', 'double de cle|reproduction de cle|cle|badge|cadenas', 'faire un double de cle|perdu mes cles')
        ]),

    T('electromenager', 'Électroménager', 'depannage', {},
        'electromenager|reparation electromenager|reparateur|appareil menager',
        'mon appareil ne marche plus|ca ne demarre plus|ca ne s allume plus',
        '',
        [
            S('lave_linge', 'Lave-linge & sèche-linge', 'lave linge|machine a laver|seche linge|seche-linge|essorage|tambour|machine a laver en panne', 'ma machine a laver ne vidange plus|machine qui ne tourne plus|le linge reste mouille'),
            S('frigo_congelateur', 'Réfrigérateur & congélateur', 'frigo|refrigerateur|congelateur|frigidaire|cave a vin|groupe froid menager', 'mon frigo ne refroidit plus|le congelateur degivre mal|frigo qui fait du bruit|frigo qui fuit'),
            S('lave_vaisselle', 'Lave-vaisselle', 'lave vaisselle|lave-vaisselle', 'lave vaisselle qui ne vidange plus|lave vaisselle qui ne lave plus'),
            S('cuisson', 'Four, plaques & cuisinière', 'four|plaque de cuisson|cuisiniere|micro ondes|micro-ondes|hotte|gaziniere|four encastrable', 'mon four ne chauffe plus|plaque qui ne chauffe plus'),
            S('petit_electromenager', 'Petit électroménager', 'aspirateur|fer a repasser|mixeur|robot cuisine|cafetiere|bouilloire|grille pain|friteuse', 'mon aspirateur ne souffle plus')
        ]),

    T('vitrerie_stores', 'Vitrerie, volets & stores', 'depannage', {},
        'vitrier|vitrerie|vitre|vitrage|store|volet|jalousie|menuiserie alu|fenetre alu',
        'vitre cassee|fenetre qui ferme mal|volet bloque|store casse',
        'jalousie|jalousies',
        [
            S('vitre', 'Vitres & miroirs', 'vitre cassee|double vitrage|miroir|remplacement de vitre|vitre fendue|vitrage', 'vitre brisee|fenetre cassee|miroir a decouper'),
            S('volets_stores', 'Volets, stores & jalousies', 'volet roulant|volet cyclonique|volet battant|store banne|store bateau|jalousies|lames de jalousie|motorisation volet|protection cyclone', 'volet roulant bloque|volet qui ne monte plus|installer des volets avant un cyclone|reparer les jalousies', 'jalousie'),
            S('moustiquaire', 'Moustiquaires', 'moustiquaire|moustiquaires|toile moustiquaire|protection moustiques', 'poser des moustiquaires|moustiquaire dechiree', ''),
            S('fenetre_alu', 'Fenêtres, baies & portes-fenêtres', 'fenetre aluminium|baie coulissante|porte fenetre|porte vitree|menuiserie aluminium|veranda', 'baie coulissante qui ne glisse plus|remplacer une fenetre')
        ]),

    T('securite_automatismes', 'Alarme, portail & sécurité', 'equipement', {},
        'alarme|videosurveillance|camera de surveillance|interphone|visiophone|portail automatique|motorisation portail|automatisme|detecteur de fumee',
        'mon portail ne s ouvre plus|j ai peur des cambriolages|sonnette qui ne marche plus',
        '',
        [
            S('alarme_video', 'Alarme & vidéosurveillance', 'alarme maison|alarme anti intrusion|camera|videosurveillance|sirene|detecteur de mouvement alarme', 'installer une alarme|surveiller ma maison a distance'),
            S('portail_motorisation', 'Portail & motorisation', 'portail automatique|motorisation portail|moteur portail|telecommande portail|portail coulissant|portail battant|automatisme portail', 'portail bloque|telecommande de portail perdue|portail qui s ouvre a moitie'),
            S('interphone', 'Interphone, visiophone & sonnette', 'interphone|visiophone|sonnette|sonnette video|gache electrique|digicode', 'interphone muet|installer une sonnette video'),
            S('detecteurs', 'Détecteurs de fumée & sécurité incendie', 'detecteur de fumee|extincteur|daaf|alarme incendie', 'poser un detecteur de fumee')
        ]),

    T('energie_solaire', 'Solaire, énergie & recharge', 'equipement',
        { safety: 'PRO_REQUIRED', regulation: 'Installation photovoltaïque, chauffe-eau solaire et bornes de recharge : professionnel qualifié (RGE) et assuré.' },
        'solaire|panneau solaire|panneaux solaires|photovoltaique|chauffe eau solaire|cesi|energie renouvelable|borne de recharge|autoconsommation',
        'ma facture d electricite est trop elevee|mon chauffe eau solaire ne chauffe plus',
        '',
        [
            S('chauffe_eau_solaire', 'Chauffe-eau solaire', 'chauffe eau solaire|cesi|capteur solaire|ballon solaire', 'chauffe eau solaire qui ne chauffe plus|entretien chauffe eau solaire'),
            S('photovoltaique', 'Panneaux photovoltaïques', 'photovoltaique|panneaux solaires|autoconsommation|onduleur solaire|batterie solaire|kit solaire', 'installer des panneaux solaires|panneaux qui produisent moins'),
            S('borne_recharge', 'Borne de recharge véhicule électrique', 'borne de recharge|wallbox|recharge voiture electrique|borne ve', 'installer une borne pour ma voiture electrique')
        ]),

    // ───────────── Rénovation & construction ─────────────
    T('peinture', 'Peinture & revêtements muraux', 'travaux', {},
        'peintre|peinture|peindre|repeindre|enduit|ratissage|ravalement|lasure|vernis|papier peint',
        'les murs sont abimes|la peinture s ecaille|moisissure sur les murs|rafraichir une piece',
        '',
        [
            S('interieur', 'Peinture intérieure', 'peinture interieure|peindre une chambre|peindre un plafond|peinture murs|peinture salon|peinture plafond|peinture cuisine', 'repeindre mon salon|rafraichir ma chambre'),
            S('facade', 'Façade & peinture extérieure', 'peinture exterieure|ravalement de facade|facade|peinture facade|crepi|nettoyage et peinture facade', 'la facade est noircie|repeindre l exterieur de la maison'),
            S('enduit', 'Enduit & ratissage', 'enduit|ratissage|lissage|rebouchage|reprise de fissure|enduit de lissage|bande a joint', 'murs a reboucher|trous a reboucher avant peinture'),
            S('boiseries', 'Boiseries, volets & lasure', 'peinture boiserie|lasure|vernis|peinture volets|peinture porte|peinture portail|traitement du bois', 'repeindre les volets|vernir une terrasse en bois'),
            S('decoration', 'Papier peint & décoration murale', 'papier peint|tapisserie|beton cire|enduit decoratif|stuc|effet matiere|frise', 'poser du papier peint|decoration murale')
        ]),

    T('maconnerie', 'Maçonnerie & gros œuvre', 'travaux', {},
        'macon|maconnerie|parpaing|beton|ciment|dalle|chape|muret|fondation|agglo|coulage',
        'mur fissure|fissure dans le mur|mur qui s effrite|terrasse a refaire',
        'beton arme',
        [
            S('muret_cloture', 'Murets & clôtures maçonnées', 'muret|mur de cloture|cloture beton|poteaux beton|mur de soutenement|parpaing', 'monter un muret|mur de cloture a reparer'),
            S('dalle_terrasse', 'Dalles, chapes & terrasses', 'dalle beton|chape|terrasse beton|escalier beton|rampe d acces|coulage de dalle|ragreage|plot beton', 'couler une dalle|refaire ma terrasse en beton'),
            S('reparation', 'Fissures & petites réparations', 'fissure|fissures|reparation mur|ragreage|calfeutrement|rebouchage beton|reprise de maconnerie', 'mur fissure|fissures apres un seisme|enduit qui tombe'),
            S('petite_construction', 'Abris, extensions & petites constructions', 'abri|extension|cuisine d ete|local technique|petite construction|agrandissement|garage|cabanon beton', 'construire un abri|ajouter une piece|agrandir la terrasse couverte', '',
                { safety: 'CAUTION', regulation: 'Extension et gros œuvre : permis ou déclaration préalable, assurance décennale du professionnel.' }),
            S('ouverture_mur', 'Ouvertures & démolition légère', 'ouverture dans un mur|demolition|casser une cloison|percement|creer une porte|linteau', 'ouvrir un mur|supprimer une cloison', '',
                { safety: 'CAUTION', regulation: 'Mur porteur : étude préalable obligatoire.' })
        ]),

    T('carrelage_sols', 'Carrelage & sols', 'travaux', {},
        'carreleur|carrelage|carreaux|faience|sol|parquet|stratifie|pvc sol|lino|dalle de sol|revetement de sol',
        'carreaux casses|sol abime|joints noircis|le sol est glissant',
        '',
        [
            S('pose_carrelage', 'Pose de carrelage', 'pose carrelage|pose de carrelage|carrelage sol|carrelage terrasse|carreler|grand format|gres cerame', 'carreler ma terrasse|poser du carrelage dans la cuisine'),
            S('faience_credence', 'Faïence & crédence', 'faience|credence|mosaique|carrelage mural|faience salle de bain', 'poser une credence|refaire la faience de la douche'),
            S('joints_renovation', 'Joints & rénovation de carrelage', 'joints carrelage|renovation joints|remplacement carreaux|carreau casse|etancheite douche|joint silicone', 'joints noircis|carreau fendu a remplacer'),
            S('parquet_stratifie', 'Parquet, stratifié & sols souples', 'parquet|stratifie|sol pvc|lino|vinyle|sol souple|ponçage parquet|plinthes', 'poser du parquet|poser un sol vinyle')
        ]),

    T('menuiserie_bois', 'Menuiserie & agencement bois', 'travaux', {},
        'menuisier|menuiserie|ebeniste|bois|charpentier|agencement|travail du bois|bois sur mesure',
        'porte qui frotte|meuble a reparer|il me faut un placard sur mesure',
        '',
        [
            S('sur_mesure', 'Placards, dressings & meubles sur mesure', 'placard|dressing|etagere sur mesure|meuble sur mesure|bibliotheque|rangement sur mesure|amenagement sous escalier', 'faire un placard sur mesure|dressing a creer'),
            S('portes_fenetres_bois', 'Portes, fenêtres & volets bois', 'porte en bois|fenetre bois|volet bois|porte interieure|bloc porte|pose de porte|porte coulissante', 'poser une porte|porte qui ne ferme plus'),
            S('terrasse_pergola', 'Terrasses bois, pergolas & carports', 'terrasse bois|deck|pergola|carport|bardage bois|abri de jardin bois|claustra bois|ajoupa', 'construire une pergola|refaire ma terrasse en bois', 'ajoupa|kiosque'),
            S('reparation_bois', 'Réparation de meubles & boiseries', 'reparation bois|reparations bois|restaurer un meuble|decaper|poncer|renovation meuble|rempaillage', 'restaurer une commode|reparer une chaise en bois'),
            S('cuisine_sdb', 'Cuisines & salles de bain équipées', 'pose de cuisine|cuisine equipee|meuble de salle de bain|plan de travail|montage cuisine', 'installer ma cuisine equipee|poser un plan de travail')
        ]),

    T('platrerie_isolation', 'Plâtrerie, cloisons & isolation', 'travaux', {},
        'platrier|platrerie|placo|placoplatre|cloison|faux plafond|isolation|plaque de platre|ba13',
        'il fait trop chaud sous le toit|le bruit passe a travers la cloison',
        'placo',
        [
            S('cloisons', 'Cloisons & doublages', 'cloison|cloison seche|doublage|placo|placoplatre|plaque de platre|ba13|separation de piece', 'creer une cloison|separer une piece en deux'),
            S('faux_plafond', 'Faux plafonds', 'faux plafond|plafond suspendu|dalles de plafond|corniche|plafond tendu', 'refaire un plafond|cacher des gaines au plafond'),
            S('isolation', 'Isolation thermique & phonique', 'isolation|isolation toiture|isolation thermique|isolation phonique|laine de roche|isolant|combles|bardage isolant', 'maison trop chaude|ameliorer l isolation|bruit des voisins')
        ]),

    T('toiture_etancheite', 'Toiture, charpente & étanchéité', 'travaux',
        { safety: 'CAUTION', regulation: 'Travail en hauteur : équipements de sécurité obligatoires, assurance décennale pour la couverture.' },
        'couvreur|toiture|toit|couverture|tole|bac acier|tuile|charpente|gouttiere|etancheite|zingueur',
        'toit qui fuit|ca coule dans la maison quand il pleut|tuile cassee|tole arrachee|plafond qui goutte',
        'tole|tole ondulee',
        [
            S('fuite_toiture', 'Fuite de toit & réparation', 'fuite toit|fuite de toiture|reparation toiture|tuile cassee|tuiles|tole percee|infiltration toiture|colmatage', 'toit qui fuit|plafond qui goutte quand il pleut|tache d eau au plafond apres la pluie'),
            S('gouttieres', 'Gouttières & descentes d\'eau', 'gouttiere|gouttieres|descente d eau pluviale|chenau|nettoyage gouttieres|descente ep', 'gouttiere bouchee|gouttiere qui deborde'),
            S('etancheite_terrasse', 'Étanchéité de toit-terrasse', 'etancheite|toit terrasse|resine etancheite|membrane|revetement d etancheite|sika|terrasse qui fuit|acrotere', 'terrasse qui fuit|refaire l etancheite du toit terrasse'),
            S('couverture_tole', 'Couverture tôle, bac acier & charpente légère', 'couverture tole|bac acier|tole ondulee|charpente|pose de toiture|panne metallique|faitage|isolation sous toiture', 'refaire ma toiture en tole|changer mes toles'),
            S('urgence_intemperies', 'Mise en sécurité après intempéries', 'bachage|bache de toiture|mise en securite toiture|arrachage toiture|degats cyclone|toiture envolee|reparation apres tempete', 'toit arrache par le vent|bacher en urgence apres un cyclone', '')
        ]),

    T('ferronnerie_soudure', 'Ferronnerie, soudure & métallerie', 'travaux', {},
        'soudeur|soudure|ferronnier|ferronnerie|metallerie|metallier|garde corps|grille|acier|inox|aluminium soudure',
        'ma grille est rouillee|il me faut un garde corps',
        '',
        [
            S('soudure', 'Soudure & réparations métalliques', 'soudure|souder|reparation metal|arc|mig|tig|reparation chassis|remorque reparation', 'faire une soudure|reparer une grille cassee'),
            S('garde_corps_escalier', 'Garde-corps, escaliers & rampes', 'garde corps|escalier metal|rampe|main courante|balustrade|escalier colimacon', 'poser un garde corps|securiser un escalier'),
            S('grilles_portails', 'Grilles de protection & portails sur mesure', 'grille de protection|grille de fenetre|portail sur mesure|portillon|barreaudage|porte metallique', 'proteger mes fenetres par des grilles|fabriquer un portail')
        ]),

    T('cloture_portail', 'Clôtures & portails', 'travaux', { also: ['jardin'] },
        'cloture|clotures|grillage|portail|portillon|brise vue|canisse|claustra|palissade|haie artificielle',
        'mon voisin voit chez moi|mon chien s echappe|terrain a cloturer',
        '',
        [
            S('grillage', 'Clôture grillagée', 'grillage|cloture grillagee|cloture rigide|poteaux|treillis soude|cloture electrique|cloture terrain', 'cloturer mon terrain|poser un grillage'),
            S('bois_pvc_alu', 'Clôture bois, PVC & aluminium', 'cloture bois|cloture pvc|cloture aluminium|lames de cloture|palissade|panneaux de cloture', 'poser une cloture en bois|cloture pvc'),
            S('brise_vue', 'Brise-vue, canisses & claustras', 'brise vue|canisse|claustra|brise vent|haie artificielle|voile d ombrage|voile solaire', 'mettre un brise vue|ombrage de terrasse'),
            S('portail', 'Pose de portail & portillon', 'pose de portail|portillon|portail coulissant|portail battant|pilier de portail|portail aluminium', 'poser un portail|remplacer mon portail')
        ]),

    T('traitement_batiment', 'Termites, humidité & traitement du bâti', 'travaux',
        { safety: 'CAUTION', also: ['entretien'], regulation: 'Produits biocides : certification des applicateurs professionnels. Diagnostic termites réglementé en zone concernée.' },
        'termites|termite|humidite|moisissure|salpetre|traitement du bois|anti termites|insectes xylophages|capricorne|vrillette|champignon',
        'des termites mangent mon bois|murs humides|taches noires sur les murs|ca sent le moisi|le bois s effrite|poutre mangee',
        'termites de bois sec|termite de terre',
        [
            S('termites', 'Termites & insectes du bois', 'termites|termite|anti termites|traitement termites|insectes xylophages|capricorne|vrillette|traitement charpente', 'des termites dans mes meubles|poudre de bois sous les meubles|poutres rongees'),
            S('humidite', 'Humidité, moisissures & salpêtre', 'humidite|moisissure|salpetre|remontees capillaires|traitement hydrofuge|traitement anti moisissure|condensation|deshumidificateur', 'murs qui suintent|moisissures dans les placards|taches noires dans la salle de bain'),
            S('traitement_bois', 'Traitement & protection du bois', 'traitement du bois|lasure|protection bois|saturateur|huile terrasse|anti champignons', 'proteger ma terrasse en bois')
        ]),

    T('renovation', 'Rénovation tous corps d\'état', 'travaux', {},
        'renovation|renover|rafraichissement|remise en etat|gros travaux|maitre d oeuvre|conducteur de travaux|tce|clef en main',
        'je veux refaire toute ma maison|j ai achete une maison a renover|il faut tout refaire',
        'petits travaux de renovation',
        [
            S('salle_de_bain', 'Rénovation de salle de bain', 'renovation salle de bain|refaire la salle de bain|salle d eau|douche a l italienne|renovation sdb', 'refaire ma salle de bain|remplacer la baignoire par une douche'),
            S('cuisine', 'Rénovation de cuisine', 'renovation cuisine|refaire la cuisine|cuisine complete|relooking cuisine', 'refaire ma cuisine|changer toute la cuisine'),
            S('logement', 'Rafraîchissement & rénovation de logement', 'rafraichissement|renovation appartement|renovation maison|remise en etat|renovation complete|avant mise en location|etat des lieux de sortie', 'remettre en etat avant de louer|renover un appartement'),
            S('suivi_chantier', 'Suivi de chantier & coordination', 'suivi de chantier|maitre d oeuvre|conducteur de travaux|coordination de travaux|devis travaux|tce|pilotage chantier', 'je ne sais pas par ou commencer pour mes travaux|comparer des devis de travaux')
        ]),

    // ───────────── Petits travaux & bricolage ─────────────
    T('bricolage', 'Bricolage & petits travaux', 'petits', {},
        'bricoleur|bricolage|petits travaux|petit bricolage|homme a tout faire|petit depannage|coup de main bricolage|handyman|montage|fixation|petites reparations',
        'j ai plusieurs petites choses a faire|je n ai pas les outils|une porte qui grince',
        '',
        [
            S('montage_meubles', 'Montage de meubles', 'montage de meubles|montage meuble|monter un meuble|meuble ikea|ikea|armoire|lit|etagere|commode|kit|demontage de meuble|assemblage', 'monter une armoire|monter un lit|assembler un meuble en kit|demonter une armoire pour demenager'),
            S('fixations', 'Fixations & accrochages', 'accrocher|fixation|fixer|tringle|rideau|tableau|etagere murale|support tv|fixation murale|cheville|perceuse', 'accrocher un tableau|poser des rideaux|fixer une tele au mur'),
            S('petites_reparations', 'Petites réparations & ajustements', 'petite reparation|petites reparations|reparation|reparations|poignee|charniere|porte qui grince|rabotage|colle|tiroir', 'porte qui frotte|tiroir bloque|poignee cassee|une charniere a changer'),
            S('homme_a_tout_faire', 'Homme à tout faire (travaux divers)', 'homme a tout faire|petits travaux|travaux divers|handyman|petit boulot|journee de bricolage|aide au bricolage', 'je cherche quelqu un pour une liste de petits travaux'),
            S('accessoires_sdb_cuisine', 'Pose d\'accessoires (salle de bain, cuisine)', 'accessoires salle de bain|barre de douche|porte serviette|seche serviette|meuble sous evier|poignees de cuisine|pose accessoires', 'poser des accessoires dans la salle de bain')
        ]),

    T('location_outillage', 'Prêt & location d\'outillage', 'petits', { also: ['evenement'] },
        'location outil|location outillage|pret d outil|perceuse|echafaudage|nettoyeur haute pression location|betonniere|marteau piqueur|location de materiel|niveau laser',
        'je n ai pas la perceuse qu il faut|je cherche un echafaudage pour deux jours',
        '',
        [
            S('outils_travaux', 'Outils & petit matériel de chantier', 'perceuse|visseuse|scie|meuleuse|ponceuse|niveau laser|betonniere|marteau piqueur|truelle|pret d outils', 'emprunter une perceuse|louer une meuleuse'),
            S('echafaudage_echelle', 'Échafaudage, échelle & accès en hauteur', 'echafaudage|echelle|escabeau|nacelle|plateforme|tour d echafaudage', 'louer un echafaudage|il me faut une grande echelle'),
            S('materiel_jardin_nettoyage', 'Matériel de jardin & nettoyage', 'location tondeuse|broyeur|nettoyeur haute pression|karcher|debroussailleuse|tronconneuse|motoculteur|location nettoyeur', 'louer un karcher|emprunter une debroussailleuse')
        ])
];
