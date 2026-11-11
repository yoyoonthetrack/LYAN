'use strict';
const { S, T } = require('./_dsl');

module.exports = [
    // ───────────── Coiffure & cheveux ─────────────
    T('coiffure', 'Coiffure', 'coiffure', {},
        'coiffeur|coiffeuse|coiffure|coupe de cheveux|cheveux|coupe|brushing|coiffer|salon de coiffure',
        'j ai besoin d une coupe|mes cheveux sont abimes|coiffure pour une ceremonie',
        '',
        [
            S('coupe_femme_enfant', 'Coupe femme & enfant', 'coupe femme|coupe enfant|coupe de cheveux|brushing|carre|degrade femme|frange|mise en plis', 'couper les cheveux de ma fille|coupe pour un enfant'),
            S('barbier', 'Barbier & coupe homme', 'barbier|coupe homme|barbe|degrade|fade|rasage|taille de barbe|tondeuse cheveux|coupe a la tondeuse', 'une coupe homme a domicile|tailler ma barbe'),
            S('coloration_soins', 'Coloration, lissage & soins', 'coloration|couleur|balayage|meches|lissage|brushing lissant|soin capillaire|keratine|permanente|decoloration', 'faire une couleur|lisser mes cheveux'),
            S('coiffure_evenement', 'Coiffure de mariage & événement', 'coiffure mariage|chignon|coiffure ceremonie|coiffure mariee|coiffure soiree|coiffure bal|coiffure bapteme', 'coiffure pour mon mariage|chignon pour un bapteme')
        ]),

    T('tresses_cheveux_naturels', 'Tresses, locks & cheveux texturés', 'coiffure', {},
        'tresses|tresseuse|nattes|vanilles|locks|dreadlocks|tissage|cheveux afro|cheveux crepus|coiffure afro|extensions|perruque|cornrows|box braids',
        'je veux me faire tresser|mes locks ont besoin d entretien|mes cheveux crepus sont secs',
        'vanilles|nattes collees|rastas|tresses africaines|bouclettes',
        [
            S('tresses_nattes', 'Tresses & nattes', 'tresses|nattes|nattes collees|vanilles|cornrows|box braids|tresses africaines|twists|tresses enfant|crochet braids', 'faire des tresses a ma fille|des vanilles pour la rentree', 'vanilles|nattes collees'),
            S('locks', 'Locks & dreadlocks', 'locks|dreadlocks|rastas|entretien locks|depart de locks|retwist|reparation de locks|locks naturels', 'entretenir mes locks|commencer des locks', 'rastas'),
            S('tissage_extensions', 'Tissage, extensions & perruques', 'tissage|extensions|meches|pose de meches|perruque|lace|closure|pose tissage|rajouts|wig', 'pose de tissage|installer une perruque lace'),
            S('soins_afro', 'Soins & coiffures protectrices', 'soin cheveux crepus|soin afro|hydratation cheveux|coiffure protectrice|twist out|bantu knots|demelage|cheveux naturels|routine capillaire', 'mes cheveux crepus sont secs|apprendre a coiffer mes cheveux naturels')
        ]),

    // ───────────── Esthétique & maquillage ─────────────
    T('esthetique', 'Esthétique & soins du corps', 'esthetique', {},
        'estheticienne|esthetique|soin du visage|epilation|cire|sourcils|cils|soin corps|gommage|institut de beaute|beaute|lumiere pulsee',
        'je veux prendre soin de ma peau|epilation a domicile',
        '',
        [
            S('soins_visage', 'Soins du visage', 'soin du visage|nettoyage de peau|hydrafacial|gommage visage|masque visage|peau|anti age|soin acne', 'un soin visage a domicile|nettoyage de peau'),
            S('epilation', 'Épilation', 'epilation|cire|epilation jambes|epilation visage|fil|epilation maillot|epilation definitive', 'epilation a domicile|epilation sourcils'),
            S('cils_sourcils', 'Cils & sourcils', 'cils|extensions de cils|rehaussement de cils|sourcils|microblading|teinture sourcils|restructuration sourcils', 'pose de cils|redessiner mes sourcils'),
            S('soins_corps', 'Soins du corps & gommage', 'soin corps|gommage corps|enveloppement|soin minceur|bronzage|hammam|soin des pieds|massage esthetique', 'gommage du corps|un soin minceur')
        ]),

    T('ongles', 'Ongles & manucure', 'esthetique', {},
        'ongles|manucure|pedicure|vernis semi permanent|gel|nail art|prothesiste ongulaire|capsules|faux ongles|resine',
        'je veux me faire les ongles|mes ongles sont casses',
        '',
        [
            S('manucure', 'Manucure & vernis semi-permanent', 'manucure|vernis|semi permanent|soin des mains|beaute des mains|limage|pose de vernis|manucure homme', 'une manucure a domicile|vernis semi permanent'),
            S('pose_gel_capsules', 'Pose d\'ongles (gel, résine, capsules)', 'pose d ongles|gel|resine|capsules|faux ongles|extension d ongles|renfort|remplissage ongles|acrygel', 'poser des faux ongles|remplissage de gel'),
            S('nail_art', 'Nail art', 'nail art|decoration ongles|strass|dessin sur ongles|french|ongles de mariee|stamping', 'des ongles decores pour une soiree'),
            S('pedicure', 'Pédicure & soins des pieds', 'pedicure|soin des pieds|vernis pieds|callosites|pedicure beaute|ongles des pieds', 'soin des pieds a domicile')
        ]),

    T('maquillage', 'Maquillage', 'esthetique', {},
        'maquilleuse|maquillage|make up|makeup|se maquiller|maquilleur|mua|maquillage artistique',
        'je veux etre maquillee pour une soiree|apprendre a me maquiller',
        '',
        [
            S('mariee', 'Maquillage de mariée', 'maquillage mariee|maquillage mariage|essai maquillage|maquillage ceremonie|maquillage temoin', 'maquillage pour mon mariage'),
            S('evenement', 'Maquillage de soirée & événement', 'maquillage soiree|maquillage evenementiel|maquillage bal|maquillage photo|maquillage shooting|maquillage anniversaire', 'etre maquillee pour une soiree|maquillage pour un shooting'),
            S('cours', 'Cours & conseils maquillage', 'cours de maquillage|apprendre a se maquiller|atelier maquillage|conseils maquillage|auto maquillage|colorimetrie', 'apprendre a me maquiller|atelier maquillage entre amies'),
            S('artistique_enfants', 'Maquillage artistique & enfants', 'maquillage enfants|maquillage artistique|face painting|maquillage carnaval|maquillage halloween|maquillage fantaisie|body painting', 'maquiller les enfants pour une fete|maquillage de carnaval', 'carnaval')
        ]),

    // ───────────── Massage & bien-être ─────────────
    T('massage_bien_etre', 'Massage & relaxation', 'bienetre',
        { safety: 'CAUTION', regulation: 'Bien-être non thérapeutique uniquement. Les actes de soin, la kinésithérapie et tout acte médical sont hors périmètre LYANN.' },
        'massage|masseur|masseuse|relaxation|detente|reflexologie|sophrologie|bien etre|massage bien etre',
        'j ai le dos tendu|je suis stressee|besoin de me detendre',
        '',
        [
            S('detente', 'Massage de détente', 'massage de detente|massage relaxant|massage du dos|massage californien|massage aux huiles|massage amincissant|massage des pieds|massage a domicile', 'un massage a domicile|massage du dos apres une longue journee'),
            S('sportif_recuperation', 'Massage sportif & récupération', 'massage sportif|recuperation sportive|massage avant course|massage apres effort|massage musculaire|etirements assistes', 'recuperer apres l entrainement'),
            S('reflexologie', 'Réflexologie', 'reflexologie|reflexologie plantaire|massage des pieds reflexe|reflexologie palmaire|pression des pieds', 'une seance de reflexologie'),
            S('sophrologie_relaxation', 'Relaxation, sophrologie & méditation guidée', 'sophrologie|relaxation guidee|meditation guidee|gestion du stress|respiration|hypnose bien etre|sophro', 'gerer mon stress|apprendre a respirer pour mieux dormir', ''),
            S('massage_bebe_femme_enceinte', 'Massage bébé & femme enceinte (bien-être)', 'massage bebe|massage prenatal|massage femme enceinte|massage maman bebe|massage nourrisson', 'apprendre le massage bebe')
        ]),

    T('yoga_pilates', 'Yoga, pilates & gym douce', 'bienetre', {},
        'yoga|pilates|meditation|stretching|gym douce|gym seniors|souplesse|etirements|hatha|vinyasa|qi gong|tai chi',
        'je veux me remettre doucement au sport|j ai mal au dos au bureau',
        '',
        [
            S('yoga', 'Cours de yoga', 'yoga|cours de yoga|hatha|vinyasa|yin yoga|yoga prenatal|yoga enfants|yoga a domicile|yoga en plein air|yoga sur la plage', 'des cours de yoga pres de chez moi|yoga sur la plage'),
            S('pilates', 'Pilates & renforcement doux', 'pilates|renforcement doux|gainage|abdos|posture|methode pilates|pilates sur tapis|pilates a domicile', 'renforcer mon dos avec du pilates'),
            S('gym_douce_seniors', 'Gym douce & seniors', 'gym douce|gym seniors|gym adaptee|activite physique adaptee|marche douce|equilibre|prevention des chutes|sport senior', 'de la gym douce pour ma mere|activite physique pour seniors'),
            S('meditation_taichi', 'Méditation, qi gong & tai-chi', 'meditation|qi gong|tai chi|pleine conscience|relaxation|mindfulness', 'apprendre a mediter|cours de tai chi')
        ]),

    // ───────────── Sport & mouvement ─────────────
    T('coaching_sportif', 'Coaching sportif & remise en forme', 'sport', {},
        'coach sportif|coaching|fitness|musculation|remise en forme|perte de poids|preparation physique|personal trainer|crossfit|cardio|entrainement|running|course a pied',
        'je veux perdre du poids|je veux me remettre au sport|me preparer pour un marathon',
        '',
        [
            S('fitness_muscu', 'Fitness & musculation', 'fitness|musculation|coach sportif|renforcement musculaire|programme musculation|cardio|crossfit|hiit|home training|coaching a domicile', 'un coach pour me muscler|entrainement a domicile'),
            S('perte_poids_forme', 'Perte de poids & remise en forme', 'perte de poids|remise en forme|reprise du sport|minceur|reequilibrage alimentaire|forme|sport apres bebe|post partum', 'perdre du poids|reprendre le sport apres une longue pause'),
            S('running_marche', 'Course à pied, marche & trail', 'running|course a pied|trail|marche sportive|marche nordique|preparation marathon|entrainement course|coach running', 'preparer un 10 km|courir avec un partenaire'),
            S('preparation_physique', 'Préparation physique & performance', 'preparation physique|performance|entrainement specifique|athletisme|coach de club|prepa physique|renforcement sport collectif', 'ameliorer ma condition physique avant un concours')
        ]),

    T('danse', 'Danse', 'sport', { also: ['evenement'] },
        'danse|danseur|danseuse|cours de danse|choregraphie|zouk|kompa|salsa|bachata|danse africaine|danse orientale|afrobeat|zumba',
        'je veux apprendre a danser|une choregraphie pour mon mariage|cours de danse pour mon enfant',
        'zouk|kompa|bele|bèlè|gwoka|quadrille|biguine|mazurka|danse traditionnelle',
        [
            S('cours_adultes', 'Cours de danse (adultes)', 'cours de danse|danse|zouk|kompa|salsa|bachata|kizomba|danse africaine|danse orientale|zumba|danse latine|afrobeat', 'apprendre le zouk|des cours de salsa pres de chez moi'),
            S('cours_enfants', 'Danse & éveil corporel (enfants)', 'danse enfants|eveil a la danse|danse classique|danse moderne|hip hop|cours enfants danse|baby danse', 'inscrire ma fille a la danse'),
            S('choregraphie_mariage', 'Chorégraphie de mariage & événement', 'choregraphie|choregraphie mariage|premiere danse|danse des maries|choregraphie evenement|flashmob|animation danse', 'une choregraphie pour mon mariage|apprendre la premiere danse'),
            S('danses_traditionnelles', 'Danses traditionnelles & folklore', 'danse traditionnelle|bele|gwoka|quadrille|biguine|mazurka|folklore|danse creole|groupe folklorique|madras danse', 'apprendre le quadrille|cours de gwoka', 'bèlè|gwoka|quadrille')
        ]),

    T('sports_ballon_raquette', 'Tennis, foot, basket & sports de balle', 'sport', {},
        'tennis|football|foot|basket|volley|padel|badminton|ping pong|tennis de table|handball|rugby|sport collectif|raquette|partenaire sportif|petanque|cricket',
        'je cherche un partenaire pour jouer au tennis|un coach pour mon fils au foot',
        '',
        [
            S('tennis_raquettes', 'Tennis, padel & sports de raquette', 'tennis|padel|badminton|ping pong|tennis de table|squash|cours de tennis|partenaire tennis|raquette|coach tennis', 'trouver un partenaire de tennis|cours de padel'),
            S('football_basket_volley', 'Football, basket, volley & sports collectifs', 'football|foot|basket|volley|handball|rugby|futsal|entrainement foot|coach foot|sport collectif|match amical', 'un coach de foot pour mon fils|jouer au basket le week end'),
            S('petanque_jeux', 'Pétanque & jeux d\'adresse', 'petanque|boules|jeux d adresse|bowling|fléchettes|billard|jeu de dames|dominos|cartes', 'trouver des joueurs de petanque')
        ]),

    T('natation', 'Natation & activités aquatiques', 'sport', {},
        'natation|nager|cours de natation|maitre nageur|bebe nageur|aquagym|apprendre a nager|piscine cours|aquabike|aqua fitness',
        'mon enfant ne sait pas nager|j ai peur de l eau',
        '',
        [
            S('cours_enfants', 'Natation enfants & bébés nageurs', 'natation enfants|bebe nageur|apprendre a nager enfant|cours de natation enfants|jardin aquatique|eveil aquatique', 'apprendre a nager a mon enfant|bebe nageur'),
            S('cours_adultes', 'Natation adultes & peur de l\'eau', 'natation adultes|apprendre a nager adulte|peur de l eau|perfectionnement natation|crawl|brasse|cours individuels natation', 'apprendre a nager a 40 ans|surmonter ma peur de l eau'),
            S('aquagym', 'Aquagym & aquabike', 'aquagym|aquabike|aqua fitness|gym aquatique|aquajogging|aqua training', 'des cours d aquagym'),
            S('surveillance_baignade', 'Surveillance de baignade', 'surveillance baignade|maitre nageur sauveteur|bnssa|surveillance piscine|surveillant de baignade|secourisme aquatique', 'surveiller la piscine pendant une fete', '',
                { safety: 'PRO_REQUIRED', regulation: 'Surveillance de baignade : diplôme (BNSSA ou équivalent) exigé.' })
        ]),

    T('arts_martiaux', 'Arts martiaux & self-défense', 'sport', {},
        'judo|karate|boxe|arts martiaux|self defense|taekwondo|jiu jitsu|krav maga|kick boxing|capoeira|mma|lutte|sambo',
        'je veux apprendre a me defendre|mon fils veut faire du judo',
        'moringue|ladja|danmye',
        [
            S('judo_karate_taekwondo', 'Judo, karaté & taekwondo', 'judo|karate|taekwondo|aikido|kung fu|arts martiaux enfants|dojo|kata|ceinture noire', 'inscrire mon fils au judo|cours de karate'),
            S('boxe_combat', 'Boxe, kick-boxing & sports de combat', 'boxe|kick boxing|muay thai|mma|krav maga|sac de frappe|boxe educative|boxe feminine|lutte|combat', 'cours de boxe|apprendre la boxe'),
            S('self_defense', 'Self-défense', 'self defense|defense personnelle|krav maga|se defendre|stage self defense|defense feminine', 'apprendre a me defendre|self defense pour femmes'),
            S('capoeira_traditions', 'Capoeira & arts martiaux traditionnels', 'capoeira|moringue|ladja|danmye|combat traditionnel|art martial traditionnel|roda', 'apprendre la capoeira', 'moringue|ladja|danmye')
        ]),

    // ───────────── Nature & activités nautiques ─────────────
    T('activites_nautiques', 'Activités nautiques & pêche de loisir', 'nature',
        { safety: 'CAUTION', regulation: 'Plongée, voile et activités encadrées contre rémunération : brevets d\'État ou diplômes fédéraux exigés ; équipements de sécurité obligatoires.' },
        'plongee|voile|kayak|paddle|stand up paddle|kitesurf|windsurf|surf|peche|peche en mer|sortie en mer|catamaran|snorkeling|tuba|nautisme',
        'je veux faire de la plongee|je veux apprendre la voile|sortie en mer en famille',
        'sortie en mer|peche au gros|pwason',
        [
            S('plongee_snorkeling', 'Plongée & snorkeling', 'plongee|bapteme de plongee|snorkeling|tuba|palmes masque tuba|bouteille|moniteur de plongee|exploration sous marine|apnee', 'faire un bapteme de plongee|sortie snorkeling en famille', '',
                { safety: 'PRO_REQUIRED', regulation: 'Encadrement de plongée : brevet d\'État ou équivalent exigé.' }),
            S('voile_glisse', 'Voile, kayak, paddle & glisse', 'voile|catamaran|deriveur|kayak|paddle|stand up paddle|kitesurf|windsurf|surf|bodyboard|initiation voile|cours de voile', 'apprendre la voile|louer un kayak|cours de paddle'),
            S('peche_loisir', 'Pêche de loisir & sorties en mer', 'peche|pecheur|peche en mer|peche a la ligne|sortie peche|peche au gros|peche en bord de mer|appat|canne a peche|peche a la traine', 'sortie peche samedi|apprendre a pecher', 'peche au gros|pwason'),
            S('balade_bateau', 'Balades en bateau & sorties à la journée', 'balade en bateau|sortie en mer|excursion|mini croisiere|sortie en catamaran|tour de l ile en bateau|promenade en mer|transfert maritime', 'une balade en mer pour mes invites', '')
        ]),

    T('randonnee_nature', 'Randonnée & balades guidées', 'nature',
        { safety: 'CAUTION', regulation: 'Accompagnement rémunéré en montagne ou milieu naturel : diplôme d\'accompagnateur exigé.' },
        'randonnee|rando|guide|balade|promenade nature|trek|canyoning|marche en foret|cascade|volcan|accompagnateur nature|sortie nature|sentier',
        'je cherche quelqu un pour m emmener en randonnee|je ne connais pas les sentiers',
        '',
        [
            S('randonnee_guidee', 'Randonnée guidée', 'randonnee|randonnee guidee|rando|trek|accompagnateur de randonnee|sentier|sortie nature|cascade|volcan|marche en foret|balade nature', 'trouver un guide pour une randonnee|randonnee a la cascade'),
            S('decouverte_nature', 'Découverte de la faune, de la flore & du patrimoine', 'decouverte nature|botanique|plantes medicinales|observation des oiseaux|sortie decouverte|patrimoine|visite guidee|visite locale', 'une visite guidee de mon quartier|decouvrir les plantes locales'),
            S('canyoning_aventure', 'Canyoning & activités d\'aventure', 'canyoning|accrobranche|escalade|via ferrata|spéléologie|parcours aventure|vtt|velo de montagne', 'faire du canyoning', '',
                { safety: 'PRO_REQUIRED', regulation: 'Activités d\'aventure encadrées : diplôme d\'État et assurance exigés.' })
        ])
];
