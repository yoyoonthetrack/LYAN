'use strict';
const { S, T } = require('./_dsl');

module.exports = [
    // ───────────── Déplacements de personnes ─────────────
    T('covoiturage_trajets', 'Covoiturage & trajets', 'personnes',
        { safety: 'CAUTION', regulation: 'Partage de frais uniquement. Le transport payant de personnes (taxi, VTC) est une activité réglementée.' },
        'covoiturage|covoit|trajet|emmener|deposer|conduire|accompagner en voiture|navette|transport de personnes|chauffeur|aller chercher',
        'j ai besoin d etre emmene|je n ai pas de voiture|quelqu un pour me deposer',
        'taxi pays|taxi collectif',
        [
            S('trajet_local', 'Trajets locaux & covoiturage', 'covoiturage|covoit|trajet local|emmener|deposer|aller chercher|trajet domicile travail|partage de frais|aller au marche', 'quelqu un pour m emmener a la gare|covoiturage pour aller au travail'),
            S('aeroport_port', 'Aéroport, gare, port & transferts', 'aeroport|navette aeroport|transfert aeroport|gare|port|ferry|embarcadere|arrivee de vol|ptp|depart de vol|transfert', 'venir me chercher a l aeroport|me deposer au ferry|aller a l aeroport a 5 h du matin'),
            S('trajets_enfants_seniors', 'Accompagnement de trajets (enfants, seniors)', 'accompagnement ecole|trajet scolaire|accompagner a un rendez vous|accompagner une personne agee en voiture|rendez vous medical trajet|emmener l enfant a l ecole|ramassage scolaire', 'emmener mes enfants a l ecole|accompagner ma mere chez le medecin'),
            S('longue_distance', 'Trajets longue distance & déplacements ponctuels', 'longue distance|trajet interurbain|deplacement ponctuel|aller dans le nord|aller dans le sud|traversee de l ile|trajet de nuit', 'aller d un bout a l autre de l ile')
        ]),

    // ───────────── Colis, fret & livraison ─────────────
    T('colis_livraison', 'Colis & livraison', 'colis', {},
        'colis|livraison|livreur|paquet|relais colis|point relais|amazon|coursier|retrait colis|livrer|recuperer un colis',
        'je dois envoyer un colis|quelqu un pour recuperer mon colis|livrer un objet',
        '',
        [
            S('colis_local', 'Retrait & livraison de colis', 'colis|retrait colis|point relais|livraison colis|recuperer un colis|relais|amazon|coursier|paquet|poste|livrer un paquet', 'recuperer mon colis au relais|livrer un colis a ma tante'),
            S('livraison_objets', 'Livraison d\'objets & coursier', 'livraison|coursier|livrer un objet|deposer un objet|livraison express|livraison meuble|livraison de commande|course urgente', 'livrer un cadeau aujourd hui|apporter un document'),
            S('fret_inter_iles', 'Fret, envois inter-îles & métropole', 'fret|envoi outre mer|envoi metropole|envoi inter iles|conteneur|colis vers la metropole|barrique|transitaire|douane|octroi de mer|marie galante|saintes|desirade', 'envoyer un colis en metropole|transporter un colis sur une autre ile', 'barrique'),
            S('livraison_repas', 'Livraison de repas & plats', 'livraison repas|livraison plats|livraison a domicile|apporter un repas|portage de repas|livraison dejeuner|livrer des plats', 'livrer le repas a ma grand mere|livraison de plats a midi')
        ]),

    // ───────────── Déménagement & manutention ─────────────
    T('demenagement', 'Déménagement', 'demenagement', {},
        'demenagement|demenager|demenageur|cartons|changer de logement|emmenagement|camion de demenagement|monter les meubles etages',
        'je dois demenager|j emmenage samedi|j ai un canape a descendre du troisieme',
        '',
        [
            S('aide_demenagement', 'Aide au déménagement', 'aide au demenagement|aide demenagement|cartons|emballage|porter les meubles|aide pour demenager|bras supplementaires|equipe de demenagement', 'besoin de bras pour mon demenagement|aide pour porter mes cartons'),
            S('demenagement_complet', 'Déménagement complet (camion + équipe)', 'demenagement complet|camion de demenagement|demenageur professionnel|devis demenagement|demenagement avec camion|equipe demenageurs|chauffeur demenageur', 'un camion et une equipe pour demenager un t3'),
            S('emballage_remontage', 'Emballage, démontage & remontage', 'emballage|demontage de meubles|remontage de meubles|protection des meubles|film bulle|cartons fournis|mise en cartons', 'demonter mes meubles avant le demenagement'),
            S('garde_meuble', 'Garde-meubles & stockage', 'garde meuble|stockage|box de stockage|stocker des affaires|entreposage|cave a louer|garde de meubles', 'stocker mes meubles pendant 3 mois')
        ]),

    T('transport_objets', 'Transport d\'objets & utilitaire', 'demenagement', {},
        'transport d objets|transport de meubles|utilitaire|camionnette|remorque|pick up|transporter|transport de materiaux|transport d electromenager|camion plateau',
        'j ai un meuble a transporter|je dois ramener un frigo|je n ai pas de camionnette',
        '',
        [
            S('meubles_electromenager', 'Transport de meubles & électroménager', 'transport de meubles|transporter un canape|transport electromenager|livraison meuble|recuperer un meuble|transporter un frigo|transport machine a laver|achat leboncoin|ramener un meuble', 'recuperer un canape achete en ligne|transporter un frigo'),
            S('materiaux_chantier', 'Transport de matériaux, sable & gravats', 'transport de materiaux|sable|gravats|graviers|terre|parpaings|bois|livraison materiaux|evacuation de gravats|remorque benne|benne', 'transporter du sable|evacuer des gravats'),
            S('utilitaire_remorque', 'Utilitaire, remorque & camion avec chauffeur', 'utilitaire|camionnette|remorque|pick up|camion plateau|camion avec chauffeur|location utilitaire avec chauffeur|fourgon', 'une camionnette avec chauffeur pour 2 heures|besoin d un utilitaire'),
            S('plantes_vegetaux', 'Transport de plantes & végétaux', 'transport de plantes|transport d arbres|livraison de plantes|plantes volumineuses|livraison de terreau|livraison de bambous|pots', 'amener des palmiers chez moi')
        ]),

    T('manutention_debarras', 'Manutention, débarras & encombrants', 'demenagement', {},
        'manutention|debarras|encombrants|porter|charger|decharger|vider une cave|vider un garage|evacuation encombrants|dechetterie|epaves|depot sauvage',
        'je dois me debarrasser de vieux meubles|ma cave est pleine|il faut porter un meuble lourd',
        '',
        [
            S('manutention_portage', 'Manutention & portage', 'manutention|porter|portage|charger|decharger|monter des charges|porter des courses|bras costauds|aide a porter|monte charge', 'porter un meuble lourd au 2eme|aide pour charger un camion'),
            S('debarras', 'Débarras de cave, garage & logement', 'debarras|vider une cave|vider un garage|vider un logement|debarras de maison|vide grenier|debarras succession|debarras apres deces', 'vider la maison de mes parents|debarrasser mon garage'),
            S('encombrants_dechetterie', 'Évacuation d\'encombrants & déchetterie', 'encombrants|evacuation encombrants|dechetterie|depot a la dechetterie|ferraille|electromenager a evacuer|epave|vieux meubles|recyclage|benne', 'evacuer mes encombrants|vieux frigo a jeter|epave de voiture')
        ]),

    // ───────────── Véhicules & mécanique ─────────────
    T('mecanique_auto', 'Mécanique automobile', 'vehicules', {},
        'mecanicien|mecano|mecanique|voiture|auto|garage|vidange|freins|plaquettes|revision|moteur|embrayage|distribution|courroie|bagnole|contre visite',
        'ma voiture ne demarre pas|voyant moteur allume|bruit bizarre sous la voiture|freins qui grincent',
        'bagnole',
        [
            S('diagnostic_panne', 'Diagnostic & pannes', 'diagnostic|panne|panne voiture|voyant moteur|valise diagnostic|demarrage|demarre pas|ne demarre pas|alternateur|demarreur|fumee moteur|surchauffe', 'ma voiture ne demarre pas|voyant moteur allume|elle cale au feu rouge'),
            S('entretien_revision', 'Entretien, vidange & révision', 'vidange|revision|entretien voiture|filtre a huile|filtre a air|liquide de refroidissement|bougies|courroie|distribution|niveau d huile|entretien periodique', 'faire la vidange|revision avant les vacances'),
            S('freinage_suspension', 'Freinage, suspension & direction', 'freins|plaquettes|disques|freinage|amortisseurs|suspension|direction|rotules|geometrie|parallelisme|silentblocs', 'freins qui grincent|voiture qui tire a droite'),
            S('batterie_electricite_auto', 'Batterie & électricité auto', 'batterie|batterie auto|batterie a plat|alternateur|phares|ampoule auto|essuie glaces|electricite auto|autoradio|demarreur', 'batterie a plat|changer l ampoule d un phare'),
            S('climatisation_auto', 'Climatisation automobile', 'clim voiture|climatisation auto|recharge clim auto|clim de voiture|clim automobile|filtre habitacle', 'la clim de ma voiture ne refroidit plus'),
            S('controle_technique', 'Accompagnement contrôle technique', 'controle technique|contre visite|passer le controle technique|preparation controle technique|ct|reparation avant controle', 'preparer mon controle technique|contre visite apres le ct')
        ]),

    T('deux_roues_velo', 'Scooter, moto & vélo', 'vehicules', {},
        'scooter|moto|mobylette|cyclomoteur|deux roues|50cc|125cc|velo|vtt|velo electrique|vae|trottinette|motard',
        'mon scooter ne demarre pas|mon velo a un pneu crevé|ma moto fait du bruit',
        '',
        [
            S('scooter_moto_mecanique', 'Mécanique scooter & moto', 'scooter|moto|mobylette|cyclomoteur|50cc|125cc|vidange scooter|variateur|mecanique moto|reparation scooter|entretien moto|reparation moto|deux roues|mecano scooter', 'mon scooter ne demarre pas|vidange de ma moto|variateur qui patine'),
            S('velo_vae', 'Vélo, VTT & vélo électrique', 'velo|vtt|velo electrique|vae|reparation velo|crevaison velo|chaine de velo|freins velo|entretien velo|reglage velo|velociste', 'crevaison de velo|regler les vitesses de mon velo'),
            S('trottinette_ebike', 'Trottinettes & mobilité électrique', 'trottinette|trottinette electrique|gyropode|hoverboard|mobilite electrique|batterie trottinette|monoroue', 'trottinette electrique en panne'),
            S('pneus_deux_roues', 'Pneus & freinage deux-roues', 'pneu scooter|pneu moto|pneu velo|plaquettes scooter|disque moto|remplacement pneu|chambre a air', 'changer le pneu de mon scooter')
        ]),

    T('carrosserie_auto', 'Carrosserie & peinture auto', 'vehicules', {},
        'carrosserie|carrossier|bosse|rayure|pare choc|peinture auto|debosselage|retroviseur|aile|phare opacifie|polish|ponçage carrosserie',
        'j ai raye ma voiture|petit accrochage|phare jauni',
        '',
        [
            S('rayures_chocs', 'Rayures, bosses & chocs', 'rayure|bosse|choc|pare choc|aile|portiere|accrochage|carrosserie|reparation carrosserie|tole froissee', 'une rayure sur la portiere|pare choc enfonce'),
            S('debosselage', 'Débosselage sans peinture', 'debosselage|debosselage sans peinture|bosse de grele|grele|redresseur de carrosserie|ressuage', 'enlever une bosse sans repeindre'),
            S('peinture_vernis', 'Peinture, vernis & rénovation de teinte', 'peinture auto|peinture carrosserie|vernis auto|reprise de peinture|teinte|ponçage carrosserie|cabine de peinture|raccord peinture', 'repeindre un pare choc'),
            S('phares_vitres', 'Phares, rétroviseurs & vitrages', 'phares|phare opacifie|renovation phares|retroviseur|pare brise|vitre auto|film teinte|vitre teintee', 'renover mes phares jaunis|remplacer un retroviseur casse')
        ]),

    T('pneus_roues', 'Pneus & roues', 'vehicules', {},
        'pneu|pneus|roue|jante|crevaison|equilibrage|parallelisme|geometrie|montage pneu|pneumatique|valve',
        'j ai crevé|pneu a plat|ma voiture vibre a haute vitesse',
        '',
        [
            S('montage_equilibrage', 'Montage & équilibrage', 'montage de pneus|equilibrage|pneus neufs|changement de pneus|pneu|pneumatiques|valve|vibrations roues|jantes alu', 'changer mes pneus|equilibrer mes roues'),
            S('crevaison', 'Crevaison & réparation de pneu', 'crevaison|rustine|meche|pneu a plat|reparation pneu|pneu creve|roue de secours|changement de roue', 'j ai creve en route|reparer un pneu crevé'),
            S('geometrie', 'Géométrie & parallélisme', 'parallelisme|geometrie|alignement|train avant|usure irreguliere|voiture qui tire', 'ma voiture tire a droite|regler le parallelisme')
        ]),

    T('lavage_auto', 'Lavage & rénovation de véhicules', 'vehicules', {},
        'lavage|lavage auto|nettoyer voiture|detailing|lustrage|polish|shampoing siege|nettoyage interieur voiture|nettoyage voiture|lavage a domicile',
        'ma voiture est sale|odeur dans la voiture|sieges tachés',
        '',
        [
            S('exterieur_interieur', 'Lavage extérieur & intérieur', 'lavage|lavage auto|lavage exterieur|lavage interieur|nettoyer voiture|lavage a la main|lavage a domicile|lavage sans eau|aspirateur voiture', 'laver ma voiture a domicile|nettoyage interieur de la voiture'),
            S('detailing', 'Détailing, polish & lustrage', 'detailing|polish|lustrage|lustrer|cire|ceramique|protection peinture|renovation peinture|traitement ceramique|effacer micro rayures', 'faire briller ma voiture|effacer les micro rayures'),
            S('sieges_odeurs', 'Sièges, moquettes & odeurs', 'shampoing siege|nettoyage sieges|moquette voiture|odeur voiture|desodorisation|traitement ozone|cuir voiture', 'sieges taches|mauvaise odeur dans l habitacle'),
            S('bateaux_motos', 'Lavage de bateaux, motos & autres véhicules', 'lavage bateau|lavage moto|lavage camping car|lavage utilitaire|lavage jet ski|lavage remorque', 'laver mon bateau')
        ]),

    T('depannage_vehicule', 'Dépannage & remorquage de véhicule', 'vehicules', {},
        'depannage voiture|remorquage|depanneuse|panne sur la route|batterie a plat|panne seche|changement de roue|assistance routiere|booster batterie|remorquer',
        'je suis en panne sur la route|plus d essence|ma voiture est en travers de la route',
        'depanneuse',
        [
            S('batterie_demarrage', 'Batterie à plat & démarrage', 'batterie a plat|booster|cables de demarrage|demarrage|changement de batterie|batterie|mise en route|depannage batterie', 'batterie a plat sur le parking|ma voiture ne demarre pas ce matin'),
            S('remorquage', 'Remorquage & dépanneuse', 'remorquage|depanneuse|remorquer|plateau|transport de vehicule|vehicule en panne|vehicule accidente|treuillage', 'faire remorquer ma voiture|sortir une voiture du fosse'),
            S('assistance_route', 'Assistance sur la route (roue, carburant)', 'assistance routiere|panne seche|carburant|jerrican|changement de roue|crevaison route|cle perdue voiture|ouverture voiture|pneu a plat sur la route', 'panne d essence|j ai creve sur la route|cle enfermee dans la voiture')
        ]),

    // ───────────── Bateau & mécanique marine ─────────────
    T('bateau_mecanique_marine', 'Bateau, hors-bord & entretien nautique', 'nautique',
        { safety: 'CAUTION', regulation: 'Convoyage et mise à l\'eau : assurance du propriétaire ; équipements de sécurité obligatoires à bord.' },
        'bateau|hors bord|moteur hors bord|annexe|coque|carenage|antifouling|mecanique marine|voilier|catamaran|jet ski|ponton|mouillage|gardiennage de bateau',
        'mon moteur de bateau ne demarre pas|ma coque est sale|mon annexe a un trou',
        'yole|canot|gommo',
        [
            S('moteur_hors_bord', 'Moteur hors-bord & mécanique marine', 'moteur hors bord|hors bord|mecanique marine|helice|revision moteur bateau|demarrage moteur bateau|jet ski|moteur in bord|carburateur|bougie hors bord|vidange hors bord', 'mon hors bord ne demarre pas|revision de mon moteur de bateau'),
            S('coque_carenage', 'Coque, carénage & antifouling', 'coque|carenage|antifouling|polish bateau|gelcoat|peinture bateau|nettoyage coque|reparation polyester|stratification|bateau a terre', 'refaire l antifouling|reparer une fissure dans la coque'),
            S('annexe_gonflable', 'Annexe, gonflable & petit bateau', 'annexe|gonflable|zodiac|petite embarcation|yole|canot|reparation annexe|gommo|bateau de peche', 'reparer mon annexe gonflable', 'yole|canot'),
            S('convoyage_mouillage', 'Convoyage, mise à l\'eau & gardiennage', 'convoyage|mise a l eau|mouillage|gardiennage de bateau|gardiennage ponton|sortie d eau|grutage|surveillance bateau|amarrage|ponton', 'mettre mon bateau a l eau|surveiller mon bateau pendant mon absence')
        ])
];
