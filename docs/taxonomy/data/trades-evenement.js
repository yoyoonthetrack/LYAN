'use strict';
const { S, T } = require('./_dsl');

module.exports = [
    // ───────────── Organisation, animation & location ─────────────
    T('organisation_evenement', 'Organisation d\'événements', 'organisation', {},
        'organisation evenement|organisateur|evenementiel|wedding planner|organiser une fete|coordination|mariage|bapteme|anniversaire|reception|ceremonie|fete',
        'je dois organiser une fete|je ne sais pas par ou commencer pour mon mariage|besoin d aide le jour J',
        '',
        [
            S('mariage_ceremonie', 'Mariage, baptême & cérémonies', 'mariage|wedding planner|bapteme|communion|ceremonie|organisation mariage|coordination jour j|cortege|vin d honneur|reception mariage|demande en mariage', 'organiser mon mariage|coordination le jour du mariage'),
            S('anniversaires_fetes', 'Anniversaires & fêtes privées', 'anniversaire|fete|fete d anniversaire|soiree|reveillon|baby shower|evjf|evg|fete des meres|fete a la maison|soiree prive|fete de famille', 'organiser l anniversaire de ma fille|preparer une fete surprise'),
            S('service_reception', 'Service, barman & aide en salle', 'serveur|serveuse|barman|barmaid|service en salle|extra|aide en salle|plonge|installation salle|mise en place|rangement apres fete|service a table', 'un serveur pour ma reception|aide pour servir pendant la fete'),
            S('evenements_associatifs_pro', 'Événements associatifs, de quartier & professionnels', 'kermesse|fete de quartier|fete associative|seminaire|inauguration|cocktail professionnel|assemblee generale|salon professionnel|vide grenier|marche de noel|fete de fin d annee', 'organiser la kermesse de l ecole|installer un stand pour un salon')
        ]),

    T('animation', 'Animation enfants & adultes', 'organisation', {},
        'animation|animateur|animatrice|clown|magicien|jeux|ateliers|kermesse|karaoke|jeux gonflables|spectacle enfants|anniversaire enfants|mc|maitre de ceremonie',
        'je cherche quelqu un pour animer l anniversaire de mon fils|il faut de l ambiance',
        '',
        [
            S('enfants', 'Animation enfants & anniversaires', 'animation enfants|clown|magicien|jeux enfants|anniversaire enfants|chasse au tresor|atelier enfants|spectacle enfants|marionnettes|conteur|jeux gonflables|ludique', 'un clown pour l anniversaire de mon fils|animation pour 15 enfants'),
            S('adultes_soiree', 'Animation de soirée & jeux adultes', 'animateur soiree|karaoke|blind test|quiz|jeux de soirees|maitre de ceremonie|mc|animation adultes|jeu concours|loto|soiree thematique', 'animer une soiree entre amis|un karaoke pour mon anniversaire'),
            S('ateliers_loisirs', 'Ateliers créatifs & loisirs animés', 'atelier creatif|atelier loisirs creatifs|atelier cuisine enfants|atelier peinture|atelier bricolage enfants|team building|animation ludique|atelier theatre', 'un atelier creatif pour un anniversaire'),
            S('animation_mariage', 'Animation de mariage & cérémonie', 'animation mariage|jeux mariage|photo booth|animation ceremonie|animation cocktail|surprise mariage|animation soiree dansante', 'animation pour mon mariage|photobooth')
        ]),

    T('dj_sonorisation', 'DJ, sonorisation & éclairage', 'organisation', {},
        'dj|disc jockey|sono|sonorisation|musique de soiree|mix|playlist|eclairage de scene|lumieres|enceintes|technicien son|platines|animation musicale|selecta',
        'il me faut de la musique pour ma fete|ma sono est trop faible',
        'selecta|sound system|sono mobile',
        [
            S('dj_soiree', 'DJ de soirée & mariage', 'dj|disc jockey|mix|musique de soiree|soiree dansante|dj mariage|dj anniversaire|animation musicale|playlist|platines|selecta|sound system|dj mobile', 'un dj pour mon mariage|musique pour mon anniversaire', 'selecta|sound system'),
            S('sonorisation', 'Sonorisation & technicien son', 'sonorisation|sono|technicien son|micro|enceintes|ampli|console de mixage|sono mobile|installation sono|location sono avec technicien|reglage son', 'sonoriser une salle|micro pour un discours'),
            S('eclairage', 'Éclairage de fête & de scène', 'eclairage scene|lumieres|jeux de lumieres|projecteurs|eclairage ambiance|laser|stroboscope|eclairage mariage|lumiere salle|guirlandes|machine a fumee', 'ambiance lumineuse pour une soiree|eclairer une scene')
        ]),

    T('decoration_evenement', 'Décoration & fleurs d\'événement', 'organisation', {},
        'decoration|decorateur|decorateur evenementiel|ballons|arche|fleuriste|bouquet|composition florale|centre de table|housse de chaise|decoration mariage|decor salle',
        'je veux decorer la salle|il me faut des fleurs pour la ceremonie',
        '',
        [
            S('ballons_arches', 'Ballons, arches & décor de fête', 'ballons|arche de ballons|decoration anniversaire|guirlande|decor de fete|baby shower deco|mur de ballons|arche|theme|decoration bapteme|photobooth decor', 'une arche de ballons pour un anniversaire'),
            S('salle_table', 'Décoration de salle & de table', 'decoration de salle|decoration de table|centre de table|housse de chaise|nappe|bougies|vaisselle deco|chemin de table|decoration mariage|scenographie', 'decorer la salle pour mon mariage|centres de table'),
            S('fleurs', 'Fleuriste & compositions florales', 'fleuriste|bouquet|composition florale|fleurs mariage|couronne|gerbe|arrangement floral|bouquet de mariee|fleurs naturelles|fleurs coupees|couronne de deuil', 'un bouquet pour la mariee|decoration florale du cortege')
        ]),

    T('location_materiel', 'Location de matériel & mobilier de fête', 'organisation', { also: ['maison'] },
        'location|location materiel|location de materiel|louer|location tente|location chaises|location tables|vaisselle|couverts|barnum|chapiteau|location mobilier|location sono|location salle',
        'je dois louer des chaises et des tables|il me faut une tente pour 60 personnes',
        'barnum',
        [
            S('tentes_chaises_tables', 'Tentes, chaises & tables', 'location tente|barnum|chapiteau|location chaises|location tables|mobilier de reception|chaises pliantes|tables rondes|tonnelle|louer 100 chaises|120 chaises|mange debout', 'louer 120 chaises|une tente pour 50 personnes', 'barnum'),
            S('vaisselle_verres', 'Vaisselle, verres & art de la table', 'location vaisselle|verres|couverts|assiettes|nappes|location verres|art de la table|champagne coupes|plats de service|cuiseurs', 'louer de la vaisselle pour 80|verres pour une reception'),
            S('sono_lumiere_location', 'Sono, lumière & matériel technique', 'location sono|location lumiere|location enceintes|location micro|videoprojecteur|ecran de projection|location ecran|location groupe electrogene|location generateur', 'louer une sono pour samedi|videoprojecteur pour une soiree'),
            S('jeux_structures', 'Jeux gonflables, stands & structures', 'chateau gonflable|jeux gonflables|stand|structure gonflable|jeux en bois|machine a barbe a papa|machine a popcorn|photobooth|location jeux|structure de jeux', 'louer un chateau gonflable|machine a barbe a papa')
        ]),

    // ───────────── Cuisine, traiteur & pâtisserie ─────────────
    T('traiteur_evenement', 'Traiteur & réception', 'cuisine', {},
        'traiteur|buffet|cocktail|reception|repas de fete|repas de mariage|repas pour 50 personnes|plats pour evenement|barbecue|service traiteur|colombo|accras|boudin|cuisine creole',
        'je dois nourrir 50 personnes|un repas pour ma fete|je cherche un traiteur pour un bapteme',
        'colombo|accras|boudin|court bouillon|feroce|christophine|poulet boucane|pate en pot|lambi',
        [
            S('buffet_cocktail', 'Buffet & cocktail dînatoire', 'buffet|cocktail|cocktail dinatoire|petits fours|amuse bouches|buffet froid|buffet chaud|verrines|plateaux repas|pieces cocktail|bouchees', 'un buffet pour 40 personnes|cocktail pour un vin d honneur'),
            S('repas_assis', 'Repas de fête & service à table', 'repas de mariage|repas de bapteme|repas assis|repas de fete|repas pour 50 personnes|repas de famille|menu de reception|repas communion|menu traiteur|plat chaud pour evenement', 'un repas de mariage pour 100 personnes|traiteur pour un bapteme'),
            S('plats_creoles_evenement', 'Plats créoles & spécialités locales', 'plats creoles|colombo|accras|boudin|court bouillon|feroce|christophine|poulet boucane|pate en pot|lambi|blaff|dombre|cuisine creole|accras de morue|bokit|plat traditionnel|cuisine locale', 'un colombo de poulet pour 30|accras pour une fete', 'colombo|accras|boudin|court bouillon|feroce|blaff|lambi|bokit'),
            S('barbecue_grillades', 'Barbecue, grillades & cuisine de plein air', 'barbecue|grillades|grill|boucan|brochettes|cochon grille|poulet grille|cuisine plein air|plancha|rotisserie|cuisson au feu de bois', 'un barbecue pour 30 personnes|grillades pour le week end', 'boucan')
        ]),

    T('cuisine_domicile', 'Cuisine à domicile & plats préparés', 'cuisine', {},
        'cuisinier|cuisiniere|chef a domicile|cuisine a domicile|plats a emporter|preparation de repas|repas|meal prep|plat du jour|bokit|cours de cuisine|cuisiner pour moi|cuisine',
        'je n ai pas le temps de cuisiner|des repas faits maison toute la semaine|apprendre a cuisiner',
        'bokit|colombo|accras|plat du jour|dejeuner pays',
        [
            S('plats_a_emporter', 'Plats faits maison à emporter', 'plats a emporter|plat du jour|bokit|accras|colombo|repas livre|plats faits maison|cuisine maison|plats prepares|dejeuner|repas du midi|bocaux', 'des plats faits maison a emporter|bokit pour ce midi', 'bokit|accras|colombo'),
            S('chef_domicile', 'Cuisinier ou chef à domicile', 'chef a domicile|cuisinier|cuisiniere|diner a domicile|repas a domicile|cuisine pour des invites|chef prive|diner aux chandelles|cuisinier de passage|cuisiner pour moi', 'un chef pour un diner a la maison|quelqu un qui cuisine chez moi'),
            S('preparation_repas', 'Préparation de repas (semaine, régimes)', 'preparation de repas|meal prep|batch cooking|repas de la semaine|repas equilibres|menus de la semaine|repas sans gluten|repas vegetariens|regime|cuisiner pour la semaine', 'preparer mes repas de la semaine|repas vegetariens a domicile'),
            S('cours_cuisine', 'Cours & ateliers de cuisine', 'cours de cuisine|atelier cuisine|apprendre a cuisiner|cuisine creole cours|atelier culinaire|initiation cuisine|cours de patisserie|atelier cuisine enfants|pain au levain|cours', 'apprendre a cuisiner creole|atelier cuisine entre amis'),
            S('boissons_jus', 'Jus, boissons & produits maison (sans alcool)', 'jus de canne|jus de fruits|tisane|boisson maison|sirop|jus pays|jus de bissap|chocolat chaud|smoothie|confiture|confitures|conserves|epices maison', 'des jus de fruits pays pour ma fete|confitures maison', 'jus de canne|bissap|sirop de batterie')
        ]),

    T('patisserie', 'Pâtisserie, boulangerie & desserts', 'cuisine', {},
        'patisserie|patissier|patissiere|gateau|gateaux|dessert|wedding cake|gateau d anniversaire|boulanger|pain|viennoiseries|cake design|cupcakes|tarte',
        'je veux un gateau pour l anniversaire|un dessert pour une fete',
        'tourment d amour|flan coco|pain au beurre|gateau patate|sorbet coco|ti pain|pain de campagne|pain au lait|gateau creole',
        [
            S('gateaux_anniversaire', 'Gâteaux d\'anniversaire & cake design', 'gateau d anniversaire|gateau|cake design|gateau sur mesure|gateau enfant|gateau theme|gateau mariage|wedding cake|piece montee|cupcakes|layer cake|gateau personnalise', 'un gateau pour les 7 ans de mon fils|gateau de mariage'),
            S('desserts_creoles', 'Pâtisseries & desserts créoles', 'tourment d amour|flan coco|gateau patate|gateau coco|patisserie creole|dessert creole|sorbet coco|pain au beurre|gateau creole|beignet|confiserie creole|nougat|doucelette', 'des tourments d amour pour ma fete|flan coco maison', 'tourment d amour|flan coco|gateau patate|doucelette'),
            S('pain_viennoiseries', 'Pain, viennoiseries & boulangerie', 'pain|viennoiseries|pain maison|boulanger|boulangerie artisanale|pain au levain|baguette|brioche|croissants|pain de campagne|pain au lait|petits pains|ti pain', 'du pain frais maison|croissants pour un brunch', 'ti pain'),
            S('entremets_desserts_fete', 'Entremets, tartes & desserts de fête', 'entremets|tartes|buche|galette des rois|verrines sucrees|bar a desserts|dessert de fete|charlotte|tarte aux fruits|macarons|mignardises|candy bar', 'un bar a desserts pour mon mariage|une buche de noel')
        ]),

    // ───────────── Photo & vidéo ─────────────
    T('photographe', 'Photographie', 'image', {},
        'photographe|photographie|photo|photos|shooting|seance photo|portrait|reportage photo|photo de mariage|photo de famille|retouche photo|drone',
        'je veux des photos de mon evenement|j ai besoin de photos pour mon commerce|photo pour mon cv',
        '',
        [
            S('evenement', 'Photo d\'événement (mariage, baptême, fête)', 'photographe mariage|photo mariage|reportage|bapteme photo|photo anniversaire|photo ceremonie|photographe evenementiel|photo soiree|reportage photo|photographe de fete|couverture evenement', 'un photographe pour mon mariage|photos pour le bapteme'),
            S('portrait_famille', 'Portrait, famille & grossesse', 'portrait|seance photo|shooting|photo de famille|photo de grossesse|photo naissance|shooting couple|photo cv|photo identite|photo de profil|photo professionnelle|shooting enfant', 'une seance photo en famille|photo de grossesse|photo pour mon cv'),
            S('produit_immobilier', 'Photo produit, commerce & immobilier', 'photo produit|photo immobilier|photo commerce|photo restaurant|photo de menu|photo boutique|photo catalogue|photo airbnb|photo hotel|packshot|photo e commerce', 'photos de mes produits pour ma boutique|photos pour une annonce immobiliere'),
            S('drone', 'Prises de vue aériennes (drone)', 'drone|prise de vue aerienne|photo aerienne|photo drone|video drone|cartographie drone|vue du ciel|inspection par drone', 'des photos aeriennes de ma maison|filmer mon mariage avec un drone', '',
                { safety: 'CAUTION', regulation: 'Drone : formation et déclaration auprès de la DGAC ; zones de vol réglementées.' }),
            S('retouche_tirage', 'Retouche, tirages & albums', 'retouche photo|tirage photo|album photo|photo restauration|numerisation|photo ancienne|livre photo|retouche portrait|impression photo|cadre photo', 'restaurer une vieille photo|faire un album de mariage')
        ]),

    T('video', 'Vidéo, tournage & montage', 'image', { also: ['numerique'] },
        'videaste|video|film|tournage|montage video|montage|captation|reel|clip|film mariage|aftermovie|youtube|capcut|cameraman',
        'je veux un film de mon evenement|il me faut une video pour mon activite|monter mes videos',
        'reel|reels',
        [
            S('evenement', 'Vidéo d\'événement (film de mariage, aftermovie)', 'film de mariage|video mariage|aftermovie|video evenement|video bapteme|reportage video|film de soiree|cameraman|video anniversaire|video souvenir|diaporama video', 'un film de mon mariage|aftermovie pour ma soiree'),
            S('captation_live', 'Captation de spectacles & diffusion en direct', 'captation|captation spectacle|concert|live|streaming|diffusion en direct|retransmission|multicamera|webcast|live facebook', 'filmer un concert|diffuser ma ceremonie en direct'),
            S('montage', 'Montage vidéo & post-production', 'montage video|montage|post production|capcut|premiere pro|after effects|etalonnage|sous titrage|reels|shorts|tiktok|youtube|monter une video', 'monter mes videos de vacances|reels pour mon commerce', 'reel|reels'),
            S('video_promo', 'Vidéo promotionnelle & entreprise', 'video promo|video entreprise|clip|spot|presentation entreprise|video commerce|publicite video|film institutionnel|interview video|video corporate|teaser', 'une video pour presenter mon entreprise|clip publicitaire')
        ]),

    // ───────────── Artisanat, couture & arts ─────────────
    T('artisanat_creation', 'Artisanat & objets créés', 'creation', {},
        'artisanat|artisan|bijoux|bijou|poterie|ceramique|vannerie|madras|sculpture|objets deco|creation locale|fait main|savon|bougies|travail du cuir|maroquinerie|woodwork',
        'je cherche un objet fait main|je veux apprendre une technique artisanale|je vends mes creations',
        'madras|vannerie|calebasse|bakoua|toile madras|graines|bois de rose|ti panier',
        [
            S('bijoux_accessoires', 'Bijoux & accessoires', 'bijoux|bijou|bijoux creoles|perles|graines|collier|bracelet|boucles d oreilles|accessoires|bijoux fait main|creation de bijoux|bijoux en graines|maille creole|bijoux sur mesure', 'des bijoux faits main pour un cadeau|apprendre a creer des bijoux', 'graines|maille creole'),
            S('poterie_ceramique', 'Poterie & céramique', 'poterie|ceramique|tour de potier|argile|modelage|poterie cours|atelier poterie|emaillage|cuisson ceramique|terre cuite|vaisselle artisanale|sculpture argile', 'des cours de poterie|atelier ceramique pour les enfants'),
            S('vannerie_textiles_locaux', 'Vannerie, madras & textiles traditionnels', 'vannerie|madras|tressage de fibres|calebasse|paniers|bakoua|chapeau|toile madras|textile traditionnel|tissage|foulard madras|cordage|panier tresse|raphia', 'un madras pour une tenue traditionnelle|apprendre la vannerie', 'madras|bakoua|calebasse|ti panier'),
            S('bois_objets_deco', 'Travail du bois & objets décoratifs', 'sculpture bois|travail du bois|objets en bois|decoration|objets deco|bois flotte|bois de rose|petits meubles|jouets en bois|woodwork|marqueterie|gravure sur bois', 'des objets decoratifs en bois|sculpture sur bois'),
            S('savons_bougies_naturels', 'Savons, bougies & produits naturels', 'savon|bougies|savon artisanal|bougie parfumee|cosmetique naturelle|huiles essentielles|baume|parfum d interieur|fabrication de savon|produits naturels|encens|bougies personnalisees', 'des bougies parfumees faites main|cours de fabrication de savon')
        ]),

    T('arts_visuels', 'Peinture, dessin & arts plastiques', 'creation', {},
        'peinture artistique|dessin|portrait dessine|aquarelle|toile|tableau|artiste peintre|illustration|fresque|street art|graffiti|arts plastiques|croquis|caricature',
        'je veux un tableau personnalise|je veux apprendre a dessiner|une fresque pour ma chambre',
        '',
        [
            S('tableau_commande', 'Tableaux & portraits sur commande', 'tableau|portrait|peinture sur toile|aquarelle|dessin a la commande|portrait dessine|caricature|toile|huile|acrylique|artiste peintre|peinture a l huile|portrait de famille', 'un portrait peint de mes enfants|un tableau pour mon salon'),
            S('cours_dessin_peinture', 'Cours de dessin & de peinture', 'cours de dessin|cours de peinture|atelier de peinture|atelier dessin|initiation peinture|dessin enfants|aquarelle cours|cours d arts plastiques|cours de croquis|stage de peinture', 'apprendre a dessiner|atelier peinture pour enfants'),
            S('fresque_murale', 'Fresques murales & street art', 'fresque murale|street art|graffiti|peinture murale|mural|decoration murale artistique|peinture chambre enfant|trompe l oeil|decor peint', 'une fresque dans la chambre de mon fils|un graff sur mon mur'),
            S('illustration', 'Illustration & bande dessinée', 'illustration|bande dessinee|bd|illustrateur|dessin numerique|personnage|mascotte|illustration livre|faire part illustre|carte de voeux', 'illustrer un livre pour enfants|une mascotte pour mon activite')
        ]),

    T('couture_retouches', 'Couture, retouches & confection', 'creation', {},
        'couturiere|couture|retouches|retouche|ourlet|machine a coudre|vetement|confection|robe|costume|rideaux sur mesure|raccourcir|tailleur|modeliste|broderie',
        'ce pantalon est trop long|je veux une robe sur mesure|mes rideaux sont trop longs',
        'madras|costume traditionnel|robe creole|jupe madras|tenue traditionnelle|mas',
        [
            S('retouches_ourlets', 'Retouches & ourlets', 'retouches|retouche|ourlet|raccourcir|reduire|elargir|fermeture eclair|reparation vetement|reprise|pantalon trop long|bouton|raccommodage|couture reparation', 'raccourcir un pantalon|changer une fermeture eclair'),
            S('sur_mesure', 'Vêtements sur mesure & tenues de cérémonie', 'sur mesure|robe sur mesure|costume|tenue de ceremonie|robe de mariee|robe de bapteme|chemise sur mesure|tenue traditionnelle|robe creole|jupe madras|costume traditionnel|creation de vetements|patronage|modelisme', 'une robe sur mesure pour un mariage|tenue traditionnelle pour une ceremonie', 'robe creole|jupe madras|costume traditionnel'),
            S('confection_maison', 'Confection pour la maison (rideaux, coussins, linge)', 'rideaux sur mesure|coussins|housse|nappes|linge de maison|confection|tentures|store sur mesure|housse de canape|draps sur mesure|couvre lit|voilage', 'faire des rideaux sur mesure|housses de coussins'),
            S('costumes_deguisements', 'Costumes, déguisements & carnaval', 'costume carnaval|deguisement|costume enfant|carnaval|mas|tenue de scene|costume de spectacle|costume de danse|accessoires carnaval|plumes|paillettes|char carnaval', 'costume de carnaval pour mes enfants|tenue de scene pour la troupe', 'carnaval|mas'),
            S('cours_couture', 'Cours & ateliers de couture', 'cours de couture|atelier couture|apprendre a coudre|initiation couture|stage de couture|machine a coudre cours|broderie cours|patron', 'apprendre a coudre|atelier couture entre amies')
        ]),

    T('stylisme_conseil', 'Stylisme & conseil en image', 'creation', {},
        'styliste|stylisme|conseil look|relooking|personal shopper|shopping accompagne|conseil en image|coach style|garde robe|colorimetrie|look',
        'je ne sais pas comment m habiller|j ai un entretien et je veux un nouveau look',
        '',
        [
            S('conseil_look', 'Relooking & conseil look', 'conseil look|relooking|conseil en image|coach style|style personnel|colorimetrie|morphologie|conseil vestimentaire|relooker', 'changer de look|un conseil pour mes tenues'),
            S('shopping_accompagne', 'Shopping accompagné & personal shopper', 'shopping accompagne|personal shopper|shopping|aide aux achats vetements|accompagnement boutique|achats de tenue|selection de vetements', 'faire du shopping avec un conseiller'),
            S('tri_garde_robe', 'Tri & optimisation de garde-robe', 'tri de garde robe|dressing|garde robe capsule|organisation garde robe|trier mes vetements|ranger mon dressing|association de tenues|vide dressing', 'trier mon dressing|composer une garde robe capsule')
        ]),

    // ───────────── Musique & spectacle ─────────────
    T('musique_spectacle', 'Musiciens, chanteurs & spectacle', 'spectacle', { also: ['famille'] },
        'musicien|musicienne|chanteur|chanteuse|groupe de musique|orchestre|concert|spectacle|artiste|animation musicale|live|band|danseur|carnaval|gwoka|zouk',
        'je cherche un groupe pour ma fete|un chanteur pour la ceremonie|animer mon evenement avec de la musique live',
        'zouk|gwoka|bele|groupe a peau|mas|ka|biguine|steel band|tambour',
        [
            S('groupe_orchestre', 'Groupe, orchestre & musiciens', 'groupe de musique|orchestre|band|musicien|concert|live|musique live|zouk|reggae|jazz|variete|steel band|accompagnement musical|guitariste|saxophoniste|pianiste', 'un groupe pour mon mariage|musicien pour une soiree', 'zouk|biguine|steel band'),
            S('chanteur_ceremonie', 'Chanteur & chant de cérémonie', 'chanteur|chanteuse|chant|chant ceremonie|chorale|messe|chant mariage|gospel|chorale de mariage|voix|chants religieux|hymnes', 'un chanteur pour la messe|chant pour une ceremonie'),
            S('traditions_carnaval', 'Musiques & spectacles traditionnels, carnaval', 'gwoka|bele|groupe a peau|mas|carnaval|tambour|ka|quadrille|biguine|troupe folklorique|spectacle traditionnel|danseurs traditionnels|conteur|veillee', 'un groupe a peau pour le carnaval|spectacle traditionnel pour une fete', 'gwoka|bele|groupe a peau|mas|ka'),
            S('spectacle_scene', 'Danseurs, comédiens & spectacle vivant', 'danseur|danseuse|comedien|spectacle|theatre|humoriste|magie|cirque|acrobate|sketch|spectacle de rue|slam|conteur', 'un humoriste pour mon evenement|danseurs pour un spectacle')
        ])
];
