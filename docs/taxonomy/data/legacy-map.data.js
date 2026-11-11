'use strict';
/*
 * Matrice de correspondance ANCIEN → NOUVEAU (proposition, non appliquée).
 *
 * kind :
 *   exact      correspondance 1→1 sans perte
 *   broad      l'ancienne feuille est plus large que le nœud cible : la cible est le métier (ou le meilleur nœud) sans perte d'information
 *   split      l'ancienne feuille recouvre plusieurs nœuds ; `alt` liste les autres cibles ; la cible par défaut est celle du backfill
 *   merge      plusieurs anciennes feuilles convergent vers la même cible (doublons historiques)
 *   ambiguous  décision métier ou réglementaire requise ; la cible par défaut est conservatrice (voir risques)
 * L'ancien identifiant n'est jamais supprimé : il reste lisible dans lyann_taxonomy et dans la table de correspondance.
 */

const L = (universe, category, subcategory, node, kind, alt = [], note = '') => ({ universe, category, subcategory, node, kind, alt, note });

const LEAVES = [
    // Administratif
    L('Administratif', 'Aide Administrative', 'Déclaration & Papiers', 'aide_administrative', 'broad', ['aide_administrative_dossiers_aides', 'aide_administrative_demarches_en_ligne']),
    L('Administratif', 'Comptabilité', 'Devis & Factures', 'comptabilite_gestion_facturation_devis', 'exact'),
    L('Administratif', 'Rédaction', 'CV & Lettres', 'cv_redaction_cv_lettre_motivation', 'exact'),
    L('Administratif', 'Traduction', 'FR / EN / ES / Créole', 'traduction_interpretation_traduction_documents', 'broad', ['traduction_interpretation_interpretariat'], 'Le libellé couvre quatre langues : la langue devient un attribut libre, pas un nœud.'),
    // Agriculture
    L('Agriculture & Marché', 'Aide agricole', 'Récolte & Entretien', 'agricole_recolte_entretien', 'exact'),
    // Aide du quotidien
    L('Aide du Quotidien', 'Accompagnement', 'Courses & Présence', 'aide_quotidienne_accompagnement_quotidien', 'split', ['courses_commissions_courses_alimentaires', 'aide_personnes_agees_compagnie_presence'], 'Deux intentions dans une feuille : courses pour autrui ou présence.'),
    L('Aide du Quotidien', 'Garde d’enfants', 'Babysitting', 'garde_enfants_babysitting_soiree', 'exact', ['garde_enfants_garde_reguliere']),
    L('Aide du Quotidien', 'Personnes âgées', 'Présence & Aide', 'aide_personnes_agees_compagnie_presence', 'exact', ['aide_personnes_agees_aide_repas_courses_seniors']),
    L('Aide du Quotidien', 'Soutien scolaire', 'Primaire & Collège', 'soutien_scolaire_devoirs_primaire', 'split', ['soutien_scolaire_college_lycee'], 'Primaire et collège sont deux spécialités distinctes.'),
    // Animaux
    L('Animaux', 'Éducation', 'Éducation canine', 'education_canine', 'exact'),
    L('Animaux', 'Garde d animaux', 'Chats & NAC', 'garde_animaux_chats_nac', 'exact'),
    L('Animaux', 'Garde d animaux', 'Pension & Babysitting chien', 'garde_animaux_garde_chiens', 'exact'),
    L('Animaux', 'Toilettage', 'Bain & Coupe', 'toilettage_animaux_bain_coupe', 'exact'),
    // Art & création
    L('Art & Création', 'Artisanat', 'Création locale', 'artisanat_creation', 'broad', ['artisanat_creation_vannerie_textiles_locaux', 'artisanat_creation_bijoux_accessoires']),
    L('Art & Création', 'Peinture & Dessin', 'Cours & Commande', 'arts_visuels_tableau_commande', 'split', ['arts_visuels_cours_dessin_peinture'], 'Cours et commande sont deux activités.'),
    L('Art & Création', 'Poterie & Céramique', 'Initiation & Cours', 'artisanat_creation_poterie_ceramique', 'exact'),
    // Auto & mobilité
    L('Auto & Mobilité', 'Carrosserie', 'Rayure & Choc', 'carrosserie_auto_rayures_chocs', 'exact'),
    L('Auto & Mobilité', 'Dépannage', 'Remorquage', 'depannage_vehicule_remorquage', 'exact'),
    L('Auto & Mobilité', 'Lavage Auto', 'Intérieur & Extérieur', 'lavage_auto_exterieur_interieur', 'exact'),
    L('Auto & Mobilité', 'Mécanique & Entretien Deux-Roues', 'Réparation & Entretien Deux-Roues', 'deux_roues_velo', 'broad', ['deux_roues_velo_scooter_moto_mecanique']),
    L('Auto & Mobilité', 'Mécanique Automobile', 'Diagnostic & Démarrage', 'mecanique_auto_diagnostic_panne', 'split', ['depannage_vehicule_batterie_demarrage'], 'Démarrage = atelier (mécanique) ou dépannage sur place.'),
    L('Auto & Mobilité', 'Pneumatiques', 'Montage & Réparation', 'pneus_roues_montage_equilibrage', 'split', ['pneus_roues_crevaison']),
    // Beauté & bien-être
    L('Beauté & Bien-être', 'Barbier', 'Coupe homme', 'coiffure_barbier', 'exact'),
    L('Beauté & Bien-être', 'Coiffure & Esthétique', 'Tresses', 'tresses_cheveux_naturels_tresses_nattes', 'exact', [], 'La catégorie héritée mélange coiffure et esthétique ; cette feuille ne porte que les tresses.'),
    L('Beauté & Bien-être', 'Maquillage', 'Événementiel', 'maquillage_evenement', 'exact'),
    L('Beauté & Bien-être', 'Massage', 'Bien-être', 'massage_bien_etre_detente', 'exact'),
    L('Beauté & Bien-être', 'Ongles', 'Manucure & Pose', 'ongles_manucure', 'split', ['ongles_pose_gel_capsules']),
    // Cours & apprentissage
    L('Cours & Apprentissage', 'Code', 'Programmation', 'initiation_numerique_code_programmation', 'exact'),
    L('Cours & Apprentissage', 'Informatique', 'Bureautique', 'initiation_numerique_bureautique', 'exact'),
    L('Cours & Apprentissage', 'Langues', 'Anglais & Espagnol', 'langues_anglais', 'split', ['langues_espagnol'], 'Deux langues dans une feuille.'),
    L('Cours & Apprentissage', 'Langues', 'Créole', 'langues_creole', 'exact'),
    L('Cours & Apprentissage', 'Permis', 'Code de la route', 'permis_code_route_code_route', 'exact', [], 'Les leçons de conduite payantes sont réglementées : nœud non sélectionnable.'),
    L('Cours & Apprentissage', 'Soutien Scolaire', 'Aide aux devoirs', 'soutien_scolaire', 'merge', ['soutien_scolaire_devoirs_primaire', 'soutien_scolaire_college_lycee'], 'Doublon de « Aide du Quotidien › Soutien scolaire ».'),
    // Cuisine & alimentation
    L('Cuisine & Alimentation', 'Cuisine & Pâtisserie', 'Atelier Cuisine', 'cuisine_domicile_cours_cuisine', 'exact'),
    L('Cuisine & Alimentation', 'Pâtisserie', 'Gâteaux & Desserts', 'patisserie_gateaux_anniversaire', 'broad', ['patisserie_entremets_desserts_fete', 'patisserie_desserts_creoles']),
    L('Cuisine & Alimentation', 'Traiteur domicile', 'Plats à emporter', 'cuisine_domicile_plats_a_emporter', 'exact'),
    // Événementiel
    L('Événementiel', 'Animation', 'Enfants & Adultes', 'animation_enfants', 'split', ['animation_adultes_soiree']),
    L('Événementiel', 'Décoration', 'Décor événement', 'decoration_evenement', 'exact'),
    L('Événementiel', 'DJ & Son', 'Animation musicale', 'dj_sonorisation_dj_soiree', 'split', ['dj_sonorisation_sonorisation', 'musique_spectacle_groupe_orchestre']),
    L('Événementiel', 'Photographie', 'Événement & Portrait', 'photographe_evenement', 'split', ['photographe_portrait_famille']),
    L('Événementiel', 'Traiteur', 'Repas événement', 'traiteur_evenement', 'broad', ['traiteur_evenement_buffet_cocktail', 'traiteur_evenement_repas_assis']),
    L('Événementiel', 'Vidéaste', 'Captation événement', 'video_evenement', 'split', ['video_captation_live']),
    // Informatique & numérique
    L('Informatique & Numérique', 'Création Web', 'Site & Boutique', 'creation_web_site_vitrine', 'split', ['creation_web_boutique_en_ligne']),
    L('Informatique & Numérique', 'Dépannage Informatique', 'Réseau & Wi-Fi', 'informatique_depannage_wifi_box_reseau', 'exact'),
    L('Informatique & Numérique', 'Graphisme', 'Logo & Affiche', 'graphisme_design_logo_identite', 'split', ['graphisme_design_supports_print']),
    L('Informatique & Numérique', 'Montage Vidéo', 'Captation & Montage', 'video_montage', 'split', ['video_captation_live']),
    L('Informatique & Numérique', 'Réseaux sociaux', 'Community management', 'communication_reseaux_community_management', 'exact'),
    L('Informatique & Numérique', 'Smartphone', 'Réglage & Dépannage', 'smartphone_tablette_reglages_applications', 'split', ['smartphone_tablette_reparation_telephone']),
    // Jardin & extérieur
    L('Jardin & Extérieur', 'Arrosage', 'Irrigation', 'arrosage_irrigation_installation', 'exact'),
    L('Jardin & Extérieur', 'Élagage', 'Taille d’arbres', 'elagage_abattage_taille_arbres', 'exact'),
    L('Jardin & Extérieur', 'Entretien Jardin', 'Débroussaillage', 'debroussaillage_terrain', 'split', ['jardinage_entretien_entretien_regulier'], 'La catégorie héritée « Entretien Jardin » désigne aussi la tonte et la taille de haies.'),
    L('Jardin & Extérieur', 'Piscine', 'Entretien & Mise en service', 'piscine_bassin_entretien', 'split', ['piscine_bassin_mise_en_service']),
    L('Jardin & Extérieur', 'Potager', 'Culture & Entretien', 'potager_vivrier_potager', 'exact'),
    // Location & matériel
    L('Location & Matériel', 'Événement', 'Location matériel fête', 'location_materiel_tentes_chaises_tables', 'broad', ['location_materiel']),
    L('Location & Matériel', 'Outillage', 'Prêt & Location', 'location_outillage_outils_travaux', 'broad', ['location_outillage']),
    // Maison & travaux
    L('Maison & Travaux', 'Bricolage', 'Montage meuble', 'bricolage_montage_meubles', 'exact'),
    L('Maison & Travaux', 'Carrelage & Sol', 'Pose & Joints', 'carrelage_sols_pose_carrelage', 'split', ['carrelage_sols_joints_renovation']),
    L('Maison & Travaux', 'Climatisation', 'Pose & Entretien', 'climatisation_installation', 'split', ['climatisation_entretien', 'climatisation_depannage']),
    L('Maison & Travaux', 'Électricité', 'Panne & Dépannage', 'electricite_panne', 'exact'),
    L('Maison & Travaux', 'Électroménager', 'Réparation', 'electromenager', 'broad', ['electromenager_lave_linge', 'electromenager_frigo_congelateur']),
    L('Maison & Travaux', 'Maçonnerie', 'Petits ouvrages', 'maconnerie_reparation', 'split', ['maconnerie_muret_cloture', 'maconnerie_petite_construction']),
    L('Maison & Travaux', 'Menuiserie', 'Bois & Agencement', 'menuiserie_bois_sur_mesure', 'split', ['menuiserie_bois_reparation_bois']),
    L('Maison & Travaux', 'Peinture', 'Intérieur & Extérieur', 'peinture_interieur', 'split', ['peinture_facade']),
    L('Maison & Travaux', 'Plomberie', 'Fuite & Dépannage', 'plomberie_fuite', 'split', ['plomberie_debouchage', 'plomberie_robinetterie']),
    L('Maison & Travaux', 'Plomberie', 'Installation sanitaire', 'plomberie_installation', 'split', ['plomberie_wc', 'plomberie_robinetterie']),
    L('Maison & Travaux', 'Serrurerie', 'Ouverture & Serrure', 'serrurerie_ouverture', 'split', ['serrurerie_changement_serrure']),
    L('Maison & Travaux', 'Toiture & Gouttières', 'Étanchéité & Fuite', 'toiture_etancheite_fuite_toiture', 'split', ['toiture_etancheite_gouttieres', 'toiture_etancheite_etancheite_terrasse']),
    L('Maison & Travaux', 'Vitrerie', 'Vitre & Store', 'vitrerie_stores_vitre', 'split', ['vitrerie_stores_volets_stores']),
    // Mer & nautisme
    L('Mer & Nautisme', 'Bateau', 'Entretien & Sortie', 'bateau_mecanique_marine', 'ambiguous', ['activites_nautiques_balade_bateau'], 'Entretien = mécanique marine ; sortie = activité nautique (famille différente).'),
    L('Mer & Nautisme', 'Pêche', 'Sortie pêche', 'activites_nautiques_peche_loisir', 'exact'),
    L('Mer & Nautisme', 'Plongée', 'Baptême & Encadrement', 'activites_nautiques_plongee_snorkeling', 'exact', [], 'Encadrement de plongée : diplôme requis (PRO_REQUIRED).'),
    L('Mer & Nautisme', 'Voile', 'Initiation voile', 'activites_nautiques_voile_glisse', 'exact'),
    // Mode & couture
    L('Mode & Couture', 'Couture', 'Retouche & Création', 'couture_retouches_retouches_ourlets', 'split', ['couture_retouches_sur_mesure']),
    L('Mode & Couture', 'Stylisme', 'Conseil look', 'stylisme_conseil_conseil_look', 'exact'),
    L('Mode & Couture', 'Tresses & Mèches', 'Pose', 'tresses_cheveux_naturels_tissage_extensions', 'merge', ['tresses_cheveux_naturels_tresses_nattes'], 'Doublon de « Coiffure & Esthétique › Tresses » rangé dans un autre univers.'),
    // Musique
    L('Musique', 'Cours de Musique', 'Batterie', 'cours_musique_instruments', 'broad'),
    // Nettoyage
    L('Nettoyage & Entretien', 'Ménage', 'Nettoyage Domicile', 'menage_domicile_regulier', 'split', ['menage_domicile_ponctuel', 'menage_domicile_grand_menage']),
    // Sport & activités
    L('Sport & Activités', 'Arts martiaux', 'Défense & Discipline', 'arts_martiaux_self_defense', 'split', ['arts_martiaux_judo_karate_taekwondo']),
    L('Sport & Activités', 'Danse', 'Cours de danse', 'danse_cours_adultes', 'split', ['danse_cours_enfants']),
    L('Sport & Activités', 'Fitness', 'Coaching sportif', 'coaching_sportif_fitness_muscu', 'split', ['coaching_sportif_perte_poids_forme']),
    L('Sport & Activités', 'Natation', 'Cours de natation', 'natation_cours_adultes', 'split', ['natation_cours_enfants']),
    L('Sport & Activités', 'Sport & Coaching', 'Tennis', 'sports_ballon_raquette_tennis_raquettes', 'exact'),
    L('Sport & Activités', 'Yoga', 'Yoga & Pilates', 'yoga_pilates_yoga', 'split', ['yoga_pilates_pilates']),
    // Transport & livraison
    L('Transport & Livraison', 'Aéroport', 'Transfert', 'covoiturage_trajets_aeroport_port', 'ambiguous', [], 'Transport rémunéré de personnes : réglementé (taxi/VTC). Décision requise : partage de frais uniquement.'),
    L('Transport & Livraison', 'Colis', 'Livraison colis', 'colis_livraison_colis_local', 'exact'),
    L('Transport & Livraison', 'Courses', 'Livraison courses', 'courses_commissions_courses_alimentaires', 'ambiguous', ['colis_livraison_livraison_objets'], 'Courses pour autrui (famille) ou livraison (transport) : un seul nœud porte les deux intentions.'),
    L('Transport & Livraison', 'Covoiturage', 'Trajet local', 'covoiturage_trajets_trajet_local', 'exact'),
    L('Transport & Livraison', 'Déménagement', 'Aide au déménagement', 'demenagement_aide_demenagement', 'exact'),
    L('Transport & Livraison', 'Livraison & Manutention', 'Transport de meuble', 'transport_objets_meubles_electromenager', 'split', ['manutention_debarras_manutention_portage'])
];

// Titres de compétence libres (services.title = services.category) et compétences du catalogue Maison (démo).
const SK = (title, node, kind = 'exact', alt = [], note = '') => ({ title, node, kind, alt, note });
const SKILL_TITLES = [
    SK('Plomberie', 'plomberie'), SK('Sanitaire', 'plomberie_installation'), SK('Petit bricolage', 'bricolage_petites_reparations'), SK('Recherche de fuite', 'plomberie_fuite'),
    SK('Électricité', 'electricite'), SK('Climatisation', 'climatisation'), SK('Installation', 'bricolage', 'ambiguous', ['electricite', 'plomberie_installation', 'climatisation_installation'], 'Titre sans objet : à préciser à la création du profil.'),
    SK('Dépannage', 'bricolage_homme_a_tout_faire', 'ambiguous', ['plomberie', 'electricite', 'informatique_depannage', 'depannage_vehicule'], 'Titre sans objet.'),
    SK('Petit dépannage', 'bricolage_petites_reparations', 'ambiguous', ['plomberie_fuite', 'electricite_panne']),
    SK('Couture', 'couture_retouches'), SK('Retouches', 'couture_retouches_retouches_ourlets'), SK('Cuisine', 'cuisine_domicile', 'ambiguous', ['renovation_cuisine', 'menage_domicile_cuisine_sdb'], 'Cuisine (repas) ou cuisine (pièce).'),
    SK('Aide aux courses', 'courses_commissions_courses_alimentaires'), SK('Courses', 'courses_commissions', 'ambiguous', ['colis_livraison']), SK('Aide administrative', 'aide_administrative'), SK('Accompagnement', 'aide_quotidienne_accompagnement_quotidien', 'ambiguous', ['aide_personnes_agees', 'courses_commissions']),
    SK('Informatique', 'informatique_depannage'), SK('Informatique & High-Tech', 'informatique_depannage', 'broad', ['smartphone_tablette', 'tv_audiovisuel']), SK('Ordinateurs', 'informatique_depannage_pannes_pc_mac'),
    SK('Wi-Fi', 'informatique_depannage_wifi_box_reseau'), SK('Smartphones', 'smartphone_tablette'), SK('Smartphone', 'smartphone_tablette'), SK('Installation TV', 'tv_audiovisuel_installation_tv'),
    SK('Graphisme', 'graphisme_design'), SK('Réseaux sociaux', 'communication_reseaux_community_management'), SK('Communication', 'communication_reseaux'), SK('Création de contenu', 'communication_reseaux_creation_contenu'),
    SK('Photographie', 'photographe'), SK('Photo', 'photographe', 'ambiguous', ['video', 'graphisme_design']), SK('Aide numérique', 'initiation_numerique'), SK('Démarches numériques', 'aide_administrative_demarches_en_ligne'),
    SK('Démarches en ligne', 'aide_administrative_demarches_en_ligne'), SK('Démarches', 'aide_administrative'), SK('Bureautique', 'initiation_numerique_bureautique'), SK('Domotique', 'domotique_connectee'),
    SK('Maçonnerie', 'maconnerie'), SK('Carrelage', 'carrelage_sols'), SK('Petits travaux', 'bricolage', 'broad'), SK('Rénovation', 'renovation'), SK('Enduit', 'peinture_enduit'), SK('Placo', 'platrerie_isolation_cloisons'),
    SK('Peinture', 'peinture'), SK('Menuiserie', 'menuiserie_bois'), SK('Réparations bois', 'menuiserie_bois_reparation_bois'), SK('Clôture', 'cloture_portail'), SK('Pose luminaires', 'electricite_luminaires'),
    SK('Bricolage', 'bricolage'), SK('Bricolage & Fixation', 'bricolage_fixations'), SK('Bricolage extérieur', 'bricolage', 'ambiguous', ['amenagement_exterieur']), SK('Montage de meubles', 'bricolage_montage_meubles'), SK('Montage', 'bricolage_montage_meubles', 'ambiguous', ['video_montage']),
    SK('Réparations', 'bricolage_petites_reparations', 'ambiguous', ['electromenager', 'menuiserie_bois_reparation_bois']), SK('Mécanique légère', 'mecanique_auto'), SK('Batterie auto', 'mecanique_auto_batterie_electricite_auto'),
    SK('Jardinage', 'jardinage_entretien'), SK('Jardinage & Élagage', 'jardinage_entretien', 'split', ['elagage_abattage']), SK('Débroussaillage', 'debroussaillage'), SK('Taille', 'jardinage_entretien_taille_haies', 'ambiguous', ['elagage_abattage_taille_arbres', 'coiffure']),
    SK('Élagage léger', 'elagage_abattage_taille_arbres'), SK('Déchets verts', 'jardinage_entretien_dechets_verts'), SK('Entretien extérieur', 'jardinage_entretien_entretien_regulier', 'ambiguous', ['nettoyage_exterieur']), SK('Nettoyage extérieur', 'nettoyage_exterieur'),
    SK('Nettoyage haute pression', 'nettoyage_exterieur_haute_pression'), SK('Entretien piscine', 'piscine_bassin_entretien'), SK('Entretien', 'bricolage', 'ambiguous', ['menage_domicile', 'jardinage_entretien', 'mecanique_auto'], 'Titre sans objet.'),
    SK('Ménage', 'menage_domicile'), SK('Ménage & Entretien', 'menage_domicile', 'broad', ['nettoyage_special']), SK('Nettoyage', 'menage_domicile', 'ambiguous', ['nettoyage_special', 'nettoyage_exterieur', 'lavage_auto']), SK('Rangement', 'rangement_organisation'),
    SK('Repassage', 'linge_repassage_repassage'), SK('Préparation de repas', 'cuisine_domicile_preparation_repas'), SK('Cuisine & Traiteur', 'cuisine_domicile', 'broad', ['traiteur_evenement']), SK('Pâtisserie', 'patisserie'),
    SK('Aide quotidienne', 'aide_quotidienne'), SK('Aide ponctuelle', 'aide_quotidienne_coup_de_main'), SK('Garde ponctuelle', 'garde_enfants', 'ambiguous', ['garde_animaux', 'aide_personnes_agees']), SK("Garde d'enfants", 'garde_enfants'),
    SK("Garde d'enfants / Babysitting", 'garde_enfants_babysitting_soiree'), SK("Garde d'animaux", 'garde_animaux'), SK('Promenade', 'garde_animaux_promenade', 'ambiguous', ['aide_personnes_agees_accompagnement_sorties_rdv']),
    SK('Soutien scolaire', 'soutien_scolaire'), SK('Cours & Soutien scolaire', 'soutien_scolaire', 'broad', ['langues', 'cours_musique']), SK('Aide aux devoirs', 'soutien_scolaire_devoirs_primaire'),
    SK('Anglais', 'langues_anglais'), SK('Français', 'langues_francais_alphabetisation', 'ambiguous', ['soutien_scolaire']), SK('Transport', 'transport_objets', 'ambiguous', ['covoiturage_trajets', 'colis_livraison', 'demenagement']),
    SK("Transport d'objets", 'transport_objets'), SK('Transport & Déménagement', 'demenagement', 'broad', ['transport_objets']), SK('Transport & Colis', 'colis_livraison', 'broad', ['transport_objets']),
    SK('Manutention', 'manutention_debarras_manutention_portage'), SK('Déménagement', 'demenagement'), SK('Utilitaire', 'transport_objets_utilitaire_remorque'), SK('Livraison', 'colis_livraison'),
    SK('Organisation', 'organisation_evenement', 'ambiguous', ['rangement_organisation', 'aide_administrative']), SK('Organisation d\'événements', 'organisation_evenement'), SK('Événementiel', 'organisation_evenement', 'broad'), SK('Décoration', 'decoration_evenement', 'ambiguous', ['peinture_decoration']),
    SK('Aide événementielle', 'aide_quotidienne_aide_evenement_famille', 'ambiguous', ['organisation_evenement_service_reception']), SK('Préparation événementielle', 'organisation_evenement'), SK('Maquillage événementiel', 'maquillage_evenement'), SK('Coiffure', 'coiffure'),
    SK('Comptabilité simple', 'comptabilite_gestion_facturation_devis'),
    SK('Musique, concert, événement, cours de batterie,', 'cours_musique_instruments', 'ambiguous', ['musique_spectacle', 'dj_sonorisation'], 'Titre libre à plusieurs intentions : donnée de recette à nettoyer.')
];

// 9 boutons « compétences rapides » du profil (payment-portal.html).
const SKILL_BUTTONS = [
    { button: 'Bricolage & Fixation', node: 'bricolage', family: 'maison' },
    { button: 'Jardinage & Élagage', node: 'jardinage_entretien', family: 'jardin', alt: ['elagage_abattage'] },
    { button: 'Transport & Déménagement', node: 'demenagement', family: 'transport', alt: ['transport_objets'] },
    { button: 'Informatique & High-Tech', node: 'informatique_depannage', family: 'numerique', alt: ['smartphone_tablette', 'tv_audiovisuel'] },
    { button: 'Ménage & Entretien', node: 'menage_domicile', family: 'entretien' },
    { button: "Garde d'enfants / Babysitting", node: 'garde_enfants', family: 'famille' },
    { button: "Garde d'animaux", node: 'garde_animaux', family: 'famille' },
    { button: 'Cuisine & Traiteur', node: 'cuisine_domicile', family: 'evenement', alt: ['traiteur_evenement'] },
    { button: 'Cours & Soutien scolaire', node: 'soutien_scolaire', family: 'famille', alt: ['langues', 'cours_musique'] }
];

// Catégories libres observées dans requests.category.
const REQUEST_CATEGORIES = [
    ['Jardinage', 'jardinage_entretien', 'broad'], ['Général', 'autre_demande_non_classee', 'ambiguous'], ['Plomberie', 'plomberie', 'exact'],
    ['Autre / Je ne trouve pas', 'autre_demande_non_classee', 'exact'], ['Couture', 'couture_retouches', 'exact'], ['Bricolage', 'bricolage', 'exact'],
    ['Baby sitting', 'garde_enfants_babysitting_soiree', 'exact'], ['jardin', 'jardinage_entretien', 'broad'], ['k7mqp4lyannrc', 'autre_demande_non_classee', 'ambiguous'],
    ['Piscine', 'piscine_bassin', 'exact'], ['Électroménager', 'electromenager', 'exact'], ['Menuiserie', 'menuiserie_bois', 'exact'],
    ['Mécanique Automobile', 'mecanique_auto', 'exact'], ['Peinture', 'peinture', 'exact'], ['autre', 'autre_demande_non_classee', 'exact']
].map(([category, node, kind]) => ({ category, node, kind }));

// 8 familles de pins de la carte Annonces → famille(s) v2.
const MAP_FAMILIES = [
    { old: 'plomberie', families: ['maison'], trades: ['plomberie'] },
    { old: 'electricite', families: ['maison'], trades: ['electricite', 'electromenager', 'climatisation'] },
    { old: 'bricolage', families: ['maison'], trades: [] },
    { old: 'jardinage', families: ['jardin'], trades: [] },
    { old: 'menage', families: ['entretien'], trades: [] },
    { old: 'beaute', families: ['beaute'], trades: [] },
    { old: 'numerique', families: ['numerique'], trades: [] },
    { old: 'quotidien', families: ['transport', 'famille', 'evenement'], trades: [], note: 'Fourre-tout historique : la carte adopte directement les 8 familles v2.' }
];

// Clés d'exigences réglementaires (activity_requirements / professional_documents.activity_category).
const ACTIVITY_KEYS = [
    { old: 'electricite', trades: ['electricite', 'energie_solaire', 'climatisation'] },
    { old: 'batiment', trades: ['maconnerie', 'carrelage_sols', 'platrerie_isolation', 'toiture_etancheite', 'peinture', 'menuiserie_bois', 'renovation', 'traitement_batiment', 'ferronnerie_soudure', 'cloture_portail'] },
    { old: 'jardinage', trades: ['jardinage_entretien', 'debroussaillage', 'elagage_abattage', 'paysagisme', 'arrosage_irrigation'] }
];

module.exports = { LEAVES, SKILL_TITLES, SKILL_BUTTONS, REQUEST_CATEGORIES, MAP_FAMILIES, ACTIVITY_KEYS };
