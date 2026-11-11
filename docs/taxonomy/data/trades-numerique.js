'use strict';
const { S, T } = require('./_dsl');

module.exports = [
    // ───────────── Dépannage & équipements ─────────────
    T('informatique_depannage', 'Ordinateurs, Wi-Fi & réseau', 'depannage', {},
        'informaticien|informatique|ordinateur|pc|mac|portable|wifi|wi fi|internet|box|reseau|imprimante|depannage informatique|virus|windows|ecran',
        'mon ordinateur est lent|je n ai plus internet|mon pc ne s allume plus|mon imprimante ne marche plus',
        '',
        [
            S('pannes_pc_mac', 'Pannes & lenteurs (PC, Mac, portable)', 'ordinateur|pc|mac|portable|panne ordinateur|ordinateur lent|ne s allume plus|ecran noir|reinstallation|formatage|windows|macos|virus|nettoyage ordinateur|reformater|lent', 'mon ordinateur est tres lent|mon pc ne demarre plus|ecran noir au demarrage'),
            S('wifi_box_reseau', 'Wi-Fi, box internet & réseau', 'wifi|wi fi|box|box internet|repeteur|cpl|reseau|fibre|routeur|cable ethernet|cablage reseau|connexion internet|internet|wifi qui coupe|zone morte wifi|installation box', 'mon wifi ne passe pas dans la chambre|plus de connexion internet|installer ma box'),
            S('imprimante_peripheriques', 'Imprimantes, écrans & périphériques', 'imprimante|scanner|ecran|clavier|souris|webcam|disque dur|cle usb|casque|imprimante ne marche plus|installer une imprimante|pilote', 'mon imprimante ne marche plus|configurer ma webcam'),
            S('sauvegarde_donnees', 'Sauvegarde, récupération de données & sécurité', 'sauvegarde|recuperation de donnees|donnees perdues|cloud|disque dur en panne|antivirus|mots de passe|piratage|securite informatique|arnaque|phishing|restauration|sauvegarder mes photos', 'j ai perdu mes photos|mon compte a ete pirate|sauvegarder mes fichiers'),
            S('installation_configuration', 'Installation & configuration (nouvel appareil, logiciels)', 'installation|configuration|nouvel ordinateur|logiciels|transfert de donnees|mise en route|installation windows|installation office|mise a jour|migration de donnees|paramétrage', 'configurer mon nouvel ordinateur|transferer mes donnees vers un nouveau pc')
        ]),

    T('smartphone_tablette', 'Smartphone & tablette', 'depannage', {},
        'smartphone|telephone|portable|iphone|android|samsung|tablette|ipad|whatsapp|application|appli|reglage telephone|ecran casse telephone',
        'mon telephone est plein|je n arrive pas a envoyer des photos|mon ecran est casse',
        '',
        [
            S('reglages_applications', 'Réglages, applications & WhatsApp', 'reglage telephone|application|appli|whatsapp|installer une appli|contacts|messagerie|visio|google|apple id|mot de passe telephone|facebook|instagram aide|telephone senior', 'configurer whatsapp|installer des applications sur mon telephone'),
            S('transfert_sauvegarde', 'Transfert, sauvegarde & stockage', 'transfert de photos|sauvegarde telephone|stockage plein|nouveau telephone|transfert de contacts|cloud photos|icloud|google photos|migrer vers un nouveau telephone', 'transferer mes photos sur mon ordinateur|mon telephone est plein'),
            S('reparation_telephone', 'Réparation (écran, batterie, charge)', 'ecran casse|vitre cassee telephone|batterie telephone|port de charge|reparation smartphone|reparation iphone|reparation samsung|telephone mouille|remplacement ecran', 'changer l ecran de mon iphone|mon telephone ne charge plus'),
            S('tablette_seniors', 'Tablette & accompagnement des seniors', 'tablette|ipad|tablette senior|visio appel|appel video|mail senior|messagerie senior|internet senior|premier smartphone|facetime', 'apprendre a ma mere a faire des appels video|premiere tablette pour ma grand mere')
        ]),

    T('tv_audiovisuel', 'TV, antenne & audio', 'depannage', {},
        'television|tv|televiseur|antenne|parabole|decodeur|canal|tnt|home cinema|barre de son|enceinte|installation tv|fixation tv|smart tv|chromecast',
        'je n ai plus de chaines|mon image est floue|je veux accrocher ma tele au mur',
        '',
        [
            S('installation_tv', 'Installation & fixation de télévision', 'installation tv|installation television|fixation murale tv|support tv|smart tv|mise en service tv|brancher une tele|accrocher une tele|reglage tv|chaines', 'fixer ma tele au mur|installer ma nouvelle smart tv'),
            S('antenne_satellite', 'Antenne, parabole & décodeur', 'antenne|antenne tv|parabole|satellite|decodeur|tnt|canal|orientation parabole|pointage parabole|antenne rateau|reception tv|tv par satellite|canalsat', 'plus de signal tv|orienter ma parabole|installer une antenne'),
            S('home_cinema_audio', 'Home cinéma, barre de son & multiroom', 'home cinema|barre de son|enceinte|enceintes|ampli|cablage audio|multiroom|sonos|videoprojecteur|projecteur|salle de cinema maison|installation audio', 'installer une barre de son|brancher mon home cinema')
        ]),

    T('domotique_connectee', 'Domotique & objets connectés', 'depannage', { also: ['maison'] },
        'domotique|maison connectee|objets connectes|ampoule connectee|prise connectee|thermostat connecte|volets connectes|alexa|google home|home assistant|camera ip|sonnette connectee',
        'je veux piloter ma maison avec mon telephone|je veux eteindre les lumieres a distance',
        '',
        [
            S('eclairage_prises', 'Éclairage & prises connectés', 'ampoule connectee|prise connectee|lumiere connectee|variateur connecte|interrupteur connecte|scene d ambiance|programmation lumieres|eclairage domotique', 'ampoules connectees|programmer l eclairage du salon'),
            S('volets_climatisation_connectes', 'Volets, climatisation & thermostats connectés', 'volets connectes|clim connectee|thermostat connecte|pilotage clim|telecommande universelle|commande vocale|pilotage a distance', 'piloter ma clim depuis mon telephone|volets connectes'),
            S('cameras_sonnettes', 'Caméras & sonnettes connectées', 'camera ip|camera wifi|sonnette connectee|visiophone connecte|surveillance connectee|camera exterieure|alerte telephone|enregistrement camera', 'installer une camera wifi|voir qui sonne a distance'),
            S('assistants_hubs', 'Assistants vocaux & centrales domotiques', 'alexa|google home|home assistant|hub domotique|assistant vocal|zigbee|matter|centrale domotique|scenarios|automatisation', 'installer alexa partout|centraliser mes appareils connectes')
        ]),

    // ───────────── Création & communication ─────────────
    T('creation_web', 'Sites web & boutiques en ligne', 'creation', {},
        'site internet|site web|creation de site|wordpress|boutique en ligne|e commerce|landing page|nom de domaine|hebergement|seo|google my business|referencement|webmaster|developpeur web',
        'je veux un site pour mon activite|je veux vendre en ligne|mon site n est plus a jour',
        '',
        [
            S('site_vitrine', 'Site vitrine & page de présentation', 'site vitrine|site internet|creation de site|site web|wordpress|wix|page de presentation|landing page|portfolio|site pro|site artisan|site restaurant', 'creer un site pour mon activite|une page pour presenter mes services'),
            S('boutique_en_ligne', 'Boutique en ligne & e-commerce', 'boutique en ligne|e commerce|shopify|woocommerce|vendre en ligne|catalogue en ligne|paiement en ligne|site marchand|marketplace|prestashop', 'creer ma boutique en ligne|vendre mes creations sur internet'),
            S('referencement_local', 'Référencement & visibilité locale', 'referencement|seo|google my business|fiche google|google maps|visibilite en ligne|avis google|annuaire|presence locale|referencement local', 'apparaitre sur google maps|etre mieux reference'),
            S('maintenance_site', 'Maintenance, hébergement & nom de domaine', 'maintenance site|hebergement|nom de domaine|mise a jour|sauvegarde site|migration site|certificat ssl|site en panne|mail pro|dns|reparer mon site', 'mon site ne fonctionne plus|acheter un nom de domaine')
        ]),

    T('communication_reseaux', 'Réseaux sociaux & communication', 'creation', {},
        'reseaux sociaux|community manager|community management|instagram|facebook|tiktok|linkedin|communication|contenu|posts|publicite en ligne|influence|newsletter|marketing digital',
        'je veux plus de clients grace aux reseaux|je ne sais pas quoi poster|ma page ne decolle pas',
        '',
        [
            S('community_management', 'Community management', 'community manager|community management|instagram|facebook|tiktok|posts|planning editorial|animation de page|reseaux sociaux|gestion de compte|linkedin|story|publications', 'quelqu un pour gerer mon instagram|animer ma page facebook'),
            S('creation_contenu', 'Création de contenu (photos, vidéos courtes, textes)', 'creation de contenu|contenu|reels|stories|photos pour instagram|shooting contenu|redaction posts|visuels reseaux|contenu video court|ugc|storytelling', 'creer du contenu pour mon commerce|des reels pour ma marque', 'reels'),
            S('publicite_en_ligne', 'Publicité en ligne & campagnes', 'publicite en ligne|facebook ads|instagram ads|google ads|campagne|sponsorise|marketing digital|acquisition|pub facebook|boost|ciblage', 'faire de la pub sur facebook|lancer une campagne en ligne'),
            S('strategie_communication', 'Stratégie de communication & image de marque', 'strategie communication|plan de communication|image de marque|branding|ligne editoriale|communication locale|relations presse|communique de presse|newsletter|mailing', 'definir ma communication|rediger une newsletter')
        ]),

    T('graphisme_design', 'Graphisme & design', 'creation', {},
        'graphiste|graphisme|logo|affiche|flyer|carte de visite|canva|identite visuelle|charte graphique|design|infographie|kakemono|etiquette|packaging|photoshop|illustrator',
        'je veux un logo|j ai besoin d une affiche|des cartes de visite pour mon activite',
        '',
        [
            S('logo_identite', 'Logo & identité visuelle', 'logo|identite visuelle|charte graphique|branding|creation de logo|refaire mon logo|couleurs de marque|image de marque graphique|typographie|marque', 'creer un logo pour mon entreprise|refaire mon identite visuelle'),
            S('supports_print', 'Flyers, affiches & cartes de visite', 'flyer|affiche|carte de visite|depliant|brochure|kakemono|etiquette|menu|bache|faire part|invitation|calendrier|catalogue|packaging', 'une affiche pour mon evenement|des cartes de visite'),
            S('supports_digitaux', 'Visuels réseaux, bannières & templates', 'visuel|banniere|miniature|template canva|canva|post instagram|story design|visuels reseaux sociaux|couverture facebook|presentation powerpoint design|infographie', 'creer des visuels pour mes reseaux|template canva pour mon commerce'),
            S('illustration_infographie', 'Illustration & infographie', 'illustration|infographie|schema|pictogramme|icones|mascotte|dessin vectoriel|bande dessinee|plan illustre|carte illustree', 'une infographie pour ma presentation')
        ]),

    // ───────────── Initiation & formation ─────────────
    T('initiation_numerique', 'Initiation & formation au numérique', 'formation', { also: ['famille'] },
        'initiation|formation numerique|initiation informatique|bureautique|word|excel|powerpoint|internet|code|programmation|python|javascript|scratch|cours informatique|numerique|littératie numérique',
        'je ne sais pas utiliser un ordinateur|je dois apprendre excel pour mon travail|j ai peur d internet',
        '',
        [
            S('initiation_seniors_debutants', 'Initiation internet & ordinateur (débutants, seniors)', 'initiation|initiation informatique|initiation internet|debutant|ordinateur senior|premiers pas|mail|visio|navigation|securite en ligne|arnaques en ligne|aide numerique|cours informatique|numerique pour tous', 'apprendre a utiliser un ordinateur|initiation internet pour ma mere'),
            S('bureautique', 'Bureautique (Word, Excel, PowerPoint)', 'bureautique|word|excel|powerpoint|tableur|google docs|google sheets|traitement de texte|tableaux croises|formules excel|mise en page|diaporama|libreoffice', 'apprendre excel|mise en forme d un document word'),
            S('code_programmation', 'Code & programmation (enfants et adultes)', 'code|programmation|coder|python|javascript|scratch|html|css|developpement|apprendre a coder|robotique|arduino|informatique enfants|algorithmique', 'apprendre a coder|cours de programmation pour mon fils'),
            S('outils_metier', 'Outils métier & logiciels spécialisés', 'logiciel de gestion|logiciel de facturation|crm|logiciel comptable|outils collaboratifs|teams|notion|trello|zoom|formation logiciel|photoshop initiation|canva initiation', 'apprendre un logiciel de facturation|prise en main de teams')
        ]),

    // ───────────── Démarches & papiers ─────────────
    T('aide_administrative', 'Aide aux démarches administratives', 'admin', {},
        'aide administrative|demarches|demarches administratives|papiers|dossier|caf|impots|cpam|france travail|pole emploi|ameli|retraite|passeport|carte grise|courrier|ecrivain public|france services',
        'je ne comprends pas ce courrier|j ai un dossier a remplir|mes papiers sont en retard|ma declaration d impots',
        '',
        [
            S('demarches_en_ligne', 'Démarches en ligne (impôts, CAF, ameli…)', 'demarches en ligne|demarches numeriques|impots|declaration d impots|caf|cpam|ameli|france connect|compte en ligne|ants|carte grise|passeport|carte d identite|france travail|pole emploi|actualisation|espace personnel|attestation', 'declarer mes impots en ligne|creer mon compte ameli|dossier de carte grise'),
            S('dossiers_aides', 'Dossiers d\'aides & prestations', 'dossier caf|rsa|apl|aides sociales|bourse|allocation|dossier retraite|dossier logement|mdph|aide au logement|demande d aide|prime|dossier de surendettement|aide juridictionnelle', 'remplir mon dossier de bourse|monter un dossier d aide au logement'),
            S('courrier_ecrivain_public', 'Courrier, réclamations & écrivain public', 'courrier|ecrivain public|lettre|lettre de reclamation|reclamation|recours|resiliation|contestation|rediger un courrier|lettre administrative|litige|mise en demeure|rendez vous administration', 'rediger une lettre de reclamation|je ne comprends pas ce courrier de la caf'),
            S('classement_suivi', 'Classement, suivi & organisation des papiers', 'classement papiers|archivage|classeur|tri administratif|dossier a jour|suivi administratif|organisation administrative|papiers importants|numerisation|gestion de documents', 'classer mes papiers|organiser mon dossier administratif')
        ]),

    T('cv_redaction', 'CV, lettres & rédaction', 'admin', {},
        'cv|curriculum vitae|lettre de motivation|linkedin|redaction|redacteur|relecture|correction|ecriture|discours|memoire|texte|entretien d embauche|recherche d emploi',
        'je cherche du travail et mon cv est vieux|je dois ecrire une lettre|j ai peur de mes fautes',
        '',
        [
            S('cv_lettre_motivation', 'CV, lettre de motivation & LinkedIn', 'cv|curriculum vitae|lettre de motivation|linkedin|profil linkedin|candidature|portfolio emploi|refaire mon cv|cv anglais|candidature spontanee', 'refaire mon cv|lettre de motivation pour un poste'),
            S('preparation_entretien', 'Préparation d\'entretien & recherche d\'emploi', 'entretien d embauche|preparation entretien|recherche d emploi|simulation entretien|coaching emploi|orientation|bilan de competences|reconversion|candidatures|offres emploi', 'me preparer a un entretien d embauche|chercher un emploi dans une autre branche'),
            S('redaction_textes', 'Rédaction, relecture & correction', 'redaction|redacteur|relecture|correction|orthographe|ecriture|discours|texte|memoire|article|biographie|livre|nouvelle|courrier officiel|ecrivain|ghostwriter|texte de presentation', 'relire mon memoire|rediger un discours de mariage'),
            S('contenu_web_seo', 'Rédaction web & contenus professionnels', 'redaction web|article de blog|fiche produit|description produit|contenu seo|texte site|newsletter redaction|plaquette|rapport|contenu pro|storytelling', 'rediger les textes de mon site|fiches produits pour ma boutique')
        ]),

    T('traduction_interpretation', 'Traduction & interprétariat', 'admin', {},
        'traduction|traducteur|traductrice|interprete|interpretariat|traduire|document traduit|anglais traduction|espagnol traduction|creole traduction|sous titrage',
        'je dois faire traduire un document|j ai besoin d un interprete pour un rendez vous',
        'kreyol|kreyòl',
        [
            S('traduction_documents', 'Traduction de documents (FR / EN / ES / Créole)', 'traduction|traducteur|traduire|document|traduction anglais|traduction espagnol|traduction creole|traduction simple|traduction de site|traduction de courrier|traduction de menu|traduction de cv', 'traduire mon cv en anglais|traduction d un courrier en espagnol'),
            S('interpretariat', 'Interprétariat & accompagnement linguistique', 'interprete|interpretariat|accompagnement linguistique|rendez vous traduit|visite medicale interprete|interprete creole|traduction orale|rdv administratif interprete|accompagner un touriste|guide bilingue', 'un interprete pour un rendez vous|accompagner une personne qui ne parle pas francais'),
            S('traduction_assermentee', 'Traduction assermentée (documents officiels)', 'traduction assermentee|traducteur assermente|traduction officielle|acte de naissance traduit|diplome traduit|traduction certifiee|apostille|traduction juree', 'traduction assermentee de mon diplome', '',
                { selectable: false, safety: 'RESTRICTED', regulation: 'Traduction assermentée : traducteur expert près une cour d\'appel. Non proposée comme compétence.' })
        ]),

    T('secretariat_assistance', 'Secrétariat & assistance', 'pro', {},
        'secretariat|secretaire|assistante|assistant virtuel|assistante virtuelle|saisie|frappe|gestion agenda|emails|standard|permanence|retranscription|prise de rendez vous|assistance administrative',
        'je suis submergee par les mails|j ai besoin d une secretaire quelques heures|saisir des documents',
        '',
        [
            S('saisie_mise_en_page', 'Saisie, frappe & mise en page', 'saisie|frappe|mise en page|dactylographie|retranscription|saisie de donnees|numerisation|pdf|mise en forme|publipostage|tableaux|saisie de factures', 'taper un document|retranscrire un enregistrement'),
            S('assistance_virtuelle', 'Assistance virtuelle (agenda, e-mails, rendez-vous)', 'assistant virtuel|assistante virtuelle|gestion agenda|gestion emails|prise de rendez vous|relances|assistante a distance|boite mail|planning|organisation de reunions|permanence telephonique', 'gerer mes mails et mon agenda|prise de rendez vous pour mon cabinet'),
            S('assistance_independants', 'Assistance pour indépendants & petites entreprises', 'assistance independant|petite entreprise|auto entrepreneur assistance|devis factures|gestion clients|relances clients|classement|suivi clients|backoffice|aide commerciale', 'une aide pour la gestion de mon activite')
        ]),

    T('comptabilite_gestion', 'Comptabilité & gestion simple', 'pro',
        { safety: 'CAUTION', regulation: 'La tenue de comptabilité complète et l\'établissement des comptes annuels sont réservés aux experts-comptables. LYANN couvre la gestion simple et le suivi.' },
        'comptabilite|comptable|gestion|facturation|devis|factures|auto entrepreneur|urssaf|micro entreprise|declaration de chiffre d affaires|budget|creation d entreprise|siret|bilan',
        'je ne sais pas faire mes factures|je dois declarer mon chiffre d affaires|je veux creer mon activite',
        '',
        [
            S('facturation_devis', 'Devis & facturation', 'devis|factures|facturation|modele de facture|devis excel|relances|facturation en ligne|logiciel de facturation|numerotation factures|mentions legales facture', 'faire mes devis et mes factures|un modele de facture pour mon activite'),
            S('micro_entreprise', 'Micro-entreprise & déclarations (URSSAF)', 'auto entrepreneur|micro entreprise|urssaf|declaration de chiffre d affaires|cotisations|tva|livre de recettes|autoentrepreneur|micro entrepreneur|declaration trimestrielle|declaration mensuelle|cfe', 'declarer mon chiffre d affaires a l urssaf|comprendre mes cotisations'),
            S('creation_activite', 'Création d\'activité & statut', 'creation d entreprise|creer mon activite|siret|statut juridique|immatriculation|cci|guichet unique|business plan|aide a la creation|statut auto entrepreneur|demarches de creation|association creation', 'creer mon auto entreprise|choisir mon statut'),
            S('budget_particulier', 'Budget & gestion de comptes personnels', 'budget|gestion budget|suivi depenses|tableau de budget|epargne|credit|gestion des comptes|surendettement budget|organisation financiere|bilan personnel', 'faire mon budget|reprendre le controle de mes depenses')
        ]),

    T('formation_coaching_pro', 'Formation, coaching & conseil pro', 'pro', {},
        'formation|formateur|formatrice|coaching|coach|conseil|accompagnement professionnel|orientation professionnelle|developpement personnel|animation d atelier|prise de parole|management|consultant',
        'je veux me former|je veux changer de metier|j ai besoin de conseils pour mon activite',
        '',
        [
            S('formation_professionnelle', 'Formation professionnelle & ateliers', 'formation|formateur|formatrice|atelier|formation professionnelle|animation d atelier|formation interne|transmission de savoir|formation securite|formation premiers secours|sst|habilitation', 'former mon equipe|animer un atelier pour des salaries'),
            S('coaching_orientation', 'Coaching, orientation & reconversion', 'coaching|coach|orientation|reconversion|developpement personnel|bilan de competences|projet professionnel|confiance en soi|choix de carriere|mentoring|prise de parole|coaching de vie', 'changer de metier|coaching pour prendre confiance en moi'),
            S('conseil_organisation', 'Conseil & organisation d\'activité', 'conseil|organisation activite|consultant|gestion de projet|strategie|process|planning|lancement de produit|etude de marche|business conseil|mentorat entreprise', 'structurer mon activite|conseil pour lancer mon commerce')
        ])
];
