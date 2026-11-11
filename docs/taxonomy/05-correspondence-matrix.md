# 05 — Matrice de correspondance ancien → nouveau

> Document généré. Fichier de données exploitable : `generated/legacy-map.csv`. **Aucune correspondance n'est appliquée.**

## Résumé

- **89** feuilles `lyann_taxonomy` (Staging) toutes couvertes : broad 10, exact 39, split 35, merge 2, ambiguous 3.
- **103** titres de compétences (Staging ∪ catalogue Maison) : exact 72, ambiguous 22, broad 8, split 1.
- **15** catégories libres de `requests.category`, 9 boutons de compétences rapides, 8 familles de pins de carte, 3 clés d'exigences pro.

Types : `exact` 1→1 · `broad` l'ancien nœud est plus large (on cible le métier) · `split` plusieurs cibles (défaut + alternatives) · `merge` doublons historiques · `ambiguous` décision métier requise.

## A. Feuilles de `lyann_taxonomy` (89)

| Univers › Catégorie › Sous-catégorie | Demandes Staging | Type | Cible par défaut | Alternatives | Note |
|---|---:|---|---|---|---|
| Administratif › Aide Administrative › Déclaration & Papiers | 0 | broad | Aide aux démarches administratives (`aide_administrative`) | Dossiers d'aides & prestations (`aide_administrative_dossiers_aides`) ; Démarches en ligne (impôts, CAF, ameli…) (`aide_administrative_demarches_en_ligne`) |  |
| Administratif › Comptabilité › Devis & Factures | 0 | exact | Devis & facturation (`comptabilite_gestion_facturation_devis`) | — |  |
| Administratif › Rédaction › CV & Lettres | 0 | exact | CV, lettre de motivation & LinkedIn (`cv_redaction_cv_lettre_motivation`) | — |  |
| Administratif › Traduction › FR / EN / ES / Créole | 0 | broad | Traduction de documents (FR / EN / ES / Créole) (`traduction_interpretation_traduction_documents`) | Interprétariat & accompagnement linguistique (`traduction_interpretation_interpretariat`) | Le libellé couvre quatre langues : la langue devient un attribut libre, pas un nœud. |
| Agriculture & Marché › Aide agricole › Récolte & Entretien | 0 | exact | Récolte & entretien de parcelle (`agricole_recolte_entretien`) | — |  |
| Aide du Quotidien › Accompagnement › Courses & Présence | 0 | split | Accompagnement & présence au quotidien (`aide_quotidienne_accompagnement_quotidien`) | Courses alimentaires (`courses_commissions_courses_alimentaires`) ; Compagnie & présence (`aide_personnes_agees_compagnie_presence`) | Deux intentions dans une feuille : courses pour autrui ou présence. |
| Aide du Quotidien › Garde d’enfants › Babysitting | 0 | exact | Babysitting ponctuel (soirée, week-end) (`garde_enfants_babysitting_soiree`) | Garde à domicile régulière (nounou) (`garde_enfants_garde_reguliere`) |  |
| Aide du Quotidien › Personnes âgées › Présence & Aide | 0 | exact | Compagnie & présence (`aide_personnes_agees_compagnie_presence`) | Repas, courses & aide pratique (`aide_personnes_agees_aide_repas_courses_seniors`) |  |
| Aide du Quotidien › Soutien scolaire › Primaire & Collège | 0 | split | Aide aux devoirs (primaire) (`soutien_scolaire_devoirs_primaire`) | Collège & lycée (maths, français, sciences…) (`soutien_scolaire_college_lycee`) | Primaire et collège sont deux spécialités distinctes. |
| Animaux › Éducation › Éducation canine | 0 | exact | Éducation canine & comportement (`education_canine`) | — |  |
| Animaux › Garde d animaux › Chats & NAC | 0 | exact | Chats & nouveaux animaux de compagnie (NAC) (`garde_animaux_chats_nac`) | — |  |
| Animaux › Garde d animaux › Pension & Babysitting chien | 0 | exact | Garde & pension de chiens (`garde_animaux_garde_chiens`) | — |  |
| Animaux › Toilettage › Bain & Coupe | 0 | exact | Bain, coupe & brossage (`toilettage_animaux_bain_coupe`) | — |  |
| Art & Création › Artisanat › Création locale | 0 | broad | Artisanat & objets créés (`artisanat_creation`) | Vannerie, madras & textiles traditionnels (`artisanat_creation_vannerie_textiles_locaux`) ; Bijoux & accessoires (`artisanat_creation_bijoux_accessoires`) |  |
| Art & Création › Peinture & Dessin › Cours & Commande | 0 | split | Tableaux & portraits sur commande (`arts_visuels_tableau_commande`) | Cours de dessin & de peinture (`arts_visuels_cours_dessin_peinture`) | Cours et commande sont deux activités. |
| Art & Création › Poterie & Céramique › Initiation & Cours | 0 | exact | Poterie & céramique (`artisanat_creation_poterie_ceramique`) | — |  |
| Auto & Mobilité › Carrosserie › Rayure & Choc | 0 | exact | Rayures, bosses & chocs (`carrosserie_auto_rayures_chocs`) | — |  |
| Auto & Mobilité › Dépannage › Remorquage | 0 | exact | Remorquage & dépanneuse (`depannage_vehicule_remorquage`) | — |  |
| Auto & Mobilité › Lavage Auto › Intérieur & Extérieur | 0 | exact | Lavage extérieur & intérieur (`lavage_auto_exterieur_interieur`) | — |  |
| Auto & Mobilité › Mécanique & Entretien Deux-Roues › Réparation & Entretien Deux-Roues | 0 | broad | Scooter, moto & vélo (`deux_roues_velo`) | Mécanique scooter & moto (`deux_roues_velo_scooter_moto_mecanique`) |  |
| Auto & Mobilité › Mécanique Automobile › Diagnostic & Démarrage | 1 | split | Diagnostic & pannes (`mecanique_auto_diagnostic_panne`) | Batterie à plat & démarrage (`depannage_vehicule_batterie_demarrage`) | Démarrage = atelier (mécanique) ou dépannage sur place. |
| Auto & Mobilité › Pneumatiques › Montage & Réparation | 0 | split | Montage & équilibrage (`pneus_roues_montage_equilibrage`) | Crevaison & réparation de pneu (`pneus_roues_crevaison`) |  |
| Beauté & Bien-être › Barbier › Coupe homme | 0 | exact | Barbier & coupe homme (`coiffure_barbier`) | — |  |
| Beauté & Bien-être › Coiffure & Esthétique › Tresses | 0 | exact | Tresses & nattes (`tresses_cheveux_naturels_tresses_nattes`) | — | La catégorie héritée mélange coiffure et esthétique ; cette feuille ne porte que les tresses. |
| Beauté & Bien-être › Maquillage › Événementiel | 0 | exact | Maquillage de soirée & événement (`maquillage_evenement`) | — |  |
| Beauté & Bien-être › Massage › Bien-être | 0 | exact | Massage de détente (`massage_bien_etre_detente`) | — |  |
| Beauté & Bien-être › Ongles › Manucure & Pose | 0 | split | Manucure & vernis semi-permanent (`ongles_manucure`) | Pose d'ongles (gel, résine, capsules) (`ongles_pose_gel_capsules`) |  |
| Cours & Apprentissage › Code › Programmation | 0 | exact | Code & programmation (enfants et adultes) (`initiation_numerique_code_programmation`) | — |  |
| Cours & Apprentissage › Informatique › Bureautique | 0 | exact | Bureautique (Word, Excel, PowerPoint) (`initiation_numerique_bureautique`) | — |  |
| Cours & Apprentissage › Langues › Anglais & Espagnol | 0 | split | Anglais (`langues_anglais`) | Espagnol (`langues_espagnol`) | Deux langues dans une feuille. |
| Cours & Apprentissage › Langues › Créole | 0 | exact | Créole (`langues_creole`) | — |  |
| Cours & Apprentissage › Permis › Code de la route | 0 | exact | Révision du code de la route (`permis_code_route_code_route`) | — | Les leçons de conduite payantes sont réglementées : nœud non sélectionnable. |
| Cours & Apprentissage › Soutien Scolaire › Aide aux devoirs | 0 | merge | Soutien scolaire (`soutien_scolaire`) | Aide aux devoirs (primaire) (`soutien_scolaire_devoirs_primaire`) ; Collège & lycée (maths, français, sciences…) (`soutien_scolaire_college_lycee`) | Doublon de « Aide du Quotidien › Soutien scolaire ». |
| Cuisine & Alimentation › Cuisine & Pâtisserie › Atelier Cuisine | 0 | exact | Cours & ateliers de cuisine (`cuisine_domicile_cours_cuisine`) | — |  |
| Cuisine & Alimentation › Pâtisserie › Gâteaux & Desserts | 0 | broad | Gâteaux d'anniversaire & cake design (`patisserie_gateaux_anniversaire`) | Entremets, tartes & desserts de fête (`patisserie_entremets_desserts_fete`) ; Pâtisseries & desserts créoles (`patisserie_desserts_creoles`) |  |
| Cuisine & Alimentation › Traiteur domicile › Plats à emporter | 0 | exact | Plats faits maison à emporter (`cuisine_domicile_plats_a_emporter`) | — |  |
| Événementiel › Animation › Enfants & Adultes | 0 | split | Animation enfants & anniversaires (`animation_enfants`) | Animation de soirée & jeux adultes (`animation_adultes_soiree`) |  |
| Événementiel › Décoration › Décor événement | 0 | exact | Décoration & fleurs d'événement (`decoration_evenement`) | — |  |
| Événementiel › DJ & Son › Animation musicale | 0 | split | DJ de soirée & mariage (`dj_sonorisation_dj_soiree`) | Sonorisation & technicien son (`dj_sonorisation_sonorisation`) ; Groupe, orchestre & musiciens (`musique_spectacle_groupe_orchestre`) |  |
| Événementiel › Photographie › Événement & Portrait | 0 | split | Photo d'événement (mariage, baptême, fête) (`photographe_evenement`) | Portrait, famille & grossesse (`photographe_portrait_famille`) |  |
| Événementiel › Traiteur › Repas événement | 0 | broad | Traiteur & réception (`traiteur_evenement`) | Buffet & cocktail dînatoire (`traiteur_evenement_buffet_cocktail`) ; Repas de fête & service à table (`traiteur_evenement_repas_assis`) |  |
| Événementiel › Vidéaste › Captation événement | 0 | split | Vidéo d'événement (film de mariage, aftermovie) (`video_evenement`) | Captation de spectacles & diffusion en direct (`video_captation_live`) |  |
| Informatique & Numérique › Création Web › Site & Boutique | 0 | split | Site vitrine & page de présentation (`creation_web_site_vitrine`) | Boutique en ligne & e-commerce (`creation_web_boutique_en_ligne`) |  |
| Informatique & Numérique › Dépannage Informatique › Réseau & Wi-Fi | 0 | exact | Wi-Fi, box internet & réseau (`informatique_depannage_wifi_box_reseau`) | — |  |
| Informatique & Numérique › Graphisme › Logo & Affiche | 0 | split | Logo & identité visuelle (`graphisme_design_logo_identite`) | Flyers, affiches & cartes de visite (`graphisme_design_supports_print`) |  |
| Informatique & Numérique › Montage Vidéo › Captation & Montage | 0 | split | Montage vidéo & post-production (`video_montage`) | Captation de spectacles & diffusion en direct (`video_captation_live`) |  |
| Informatique & Numérique › Réseaux sociaux › Community management | 0 | exact | Community management (`communication_reseaux_community_management`) | — |  |
| Informatique & Numérique › Smartphone › Réglage & Dépannage | 0 | split | Réglages, applications & WhatsApp (`smartphone_tablette_reglages_applications`) | Réparation (écran, batterie, charge) (`smartphone_tablette_reparation_telephone`) |  |
| Jardin & Extérieur › Arrosage › Irrigation | 0 | exact | Installation d'arrosage automatique (`arrosage_irrigation_installation`) | — |  |
| Jardin & Extérieur › Élagage › Taille d’arbres | 0 | exact | Taille & élagage d'arbres (`elagage_abattage_taille_arbres`) | — |  |
| Jardin & Extérieur › Entretien Jardin › Débroussaillage | 0 | split | Débroussaillage de terrain (`debroussaillage_terrain`) | Entretien régulier (abonnement jardinier) (`jardinage_entretien_entretien_regulier`) | La catégorie héritée « Entretien Jardin » désigne aussi la tonte et la taille de haies. |
| Jardin & Extérieur › Piscine › Entretien & Mise en service | 1 | split | Entretien de piscine (`piscine_bassin_entretien`) | Mise en service, hivernage & remise en route (`piscine_bassin_mise_en_service`) |  |
| Jardin & Extérieur › Potager › Culture & Entretien | 0 | exact | Création & entretien de potager (`potager_vivrier_potager`) | — |  |
| Location & Matériel › Événement › Location matériel fête | 0 | broad | Tentes, chaises & tables (`location_materiel_tentes_chaises_tables`) | Location de matériel & mobilier de fête (`location_materiel`) |  |
| Location & Matériel › Outillage › Prêt & Location | 0 | broad | Outils & petit matériel de chantier (`location_outillage_outils_travaux`) | Prêt & location d'outillage (`location_outillage`) |  |
| Maison & Travaux › Bricolage › Montage meuble | 2 | exact | Montage de meubles (`bricolage_montage_meubles`) | — |  |
| Maison & Travaux › Carrelage & Sol › Pose & Joints | 0 | split | Pose de carrelage (`carrelage_sols_pose_carrelage`) | Joints & rénovation de carrelage (`carrelage_sols_joints_renovation`) |  |
| Maison & Travaux › Climatisation › Pose & Entretien | 0 | split | Pose de climatisation (`climatisation_installation`) | Entretien & nettoyage (`climatisation_entretien`) ; Dépannage & panne (`climatisation_depannage`) |  |
| Maison & Travaux › Électricité › Panne & Dépannage | 0 | exact | Panne & recherche de panne (`electricite_panne`) | — |  |
| Maison & Travaux › Électroménager › Réparation | 1 | broad | Électroménager (`electromenager`) | Lave-linge & sèche-linge (`electromenager_lave_linge`) ; Réfrigérateur & congélateur (`electromenager_frigo_congelateur`) |  |
| Maison & Travaux › Maçonnerie › Petits ouvrages | 0 | split | Fissures & petites réparations (`maconnerie_reparation`) | Murets & clôtures maçonnées (`maconnerie_muret_cloture`) ; Abris, extensions & petites constructions (`maconnerie_petite_construction`) |  |
| Maison & Travaux › Menuiserie › Bois & Agencement | 1 | split | Placards, dressings & meubles sur mesure (`menuiserie_bois_sur_mesure`) | Réparation de meubles & boiseries (`menuiserie_bois_reparation_bois`) |  |
| Maison & Travaux › Peinture › Intérieur & Extérieur | 1 | split | Peinture intérieure (`peinture_interieur`) | Façade & peinture extérieure (`peinture_facade`) |  |
| Maison & Travaux › Plomberie › Fuite & Dépannage | 3 | split | Fuite & recherche de fuite (`plomberie_fuite`) | Débouchage & évacuations (`plomberie_debouchage`) ; Robinetterie & joints (`plomberie_robinetterie`) |  |
| Maison & Travaux › Plomberie › Installation sanitaire | 0 | split | Installation sanitaire & raccordements (`plomberie_installation`) | WC, lavabo & douche (`plomberie_wc`) ; Robinetterie & joints (`plomberie_robinetterie`) |  |
| Maison & Travaux › Serrurerie › Ouverture & Serrure | 0 | split | Ouverture de porte (`serrurerie_ouverture`) | Changement de serrure & cylindre (`serrurerie_changement_serrure`) |  |
| Maison & Travaux › Toiture & Gouttières › Étanchéité & Fuite | 0 | split | Fuite de toit & réparation (`toiture_etancheite_fuite_toiture`) | Gouttières & descentes d'eau (`toiture_etancheite_gouttieres`) ; Étanchéité de toit-terrasse (`toiture_etancheite_etancheite_terrasse`) |  |
| Maison & Travaux › Vitrerie › Vitre & Store | 0 | split | Vitres & miroirs (`vitrerie_stores_vitre`) | Volets, stores & jalousies (`vitrerie_stores_volets_stores`) |  |
| Mer & Nautisme › Bateau › Entretien & Sortie | 0 | ambiguous | Bateau, hors-bord & entretien nautique (`bateau_mecanique_marine`) | Balades en bateau & sorties à la journée (`activites_nautiques_balade_bateau`) | Entretien = mécanique marine ; sortie = activité nautique (famille différente). |
| Mer & Nautisme › Pêche › Sortie pêche | 0 | exact | Pêche de loisir & sorties en mer (`activites_nautiques_peche_loisir`) | — |  |
| Mer & Nautisme › Plongée › Baptême & Encadrement | 0 | exact | Plongée & snorkeling (`activites_nautiques_plongee_snorkeling`) | — | Encadrement de plongée : diplôme requis (PRO_REQUIRED). |
| Mer & Nautisme › Voile › Initiation voile | 0 | exact | Voile, kayak, paddle & glisse (`activites_nautiques_voile_glisse`) | — |  |
| Mode & Couture › Couture › Retouche & Création | 2 | split | Retouches & ourlets (`couture_retouches_retouches_ourlets`) | Vêtements sur mesure & tenues de cérémonie (`couture_retouches_sur_mesure`) |  |
| Mode & Couture › Stylisme › Conseil look | 0 | exact | Relooking & conseil look (`stylisme_conseil_conseil_look`) | — |  |
| Mode & Couture › Tresses & Mèches › Pose | 0 | merge | Tissage, extensions & perruques (`tresses_cheveux_naturels_tissage_extensions`) | Tresses & nattes (`tresses_cheveux_naturels_tresses_nattes`) | Doublon de « Coiffure & Esthétique › Tresses » rangé dans un autre univers. |
| Musique › Cours de Musique › Batterie | 0 | broad | Piano, guitare, batterie & instruments (`cours_musique_instruments`) | — |  |
| Nettoyage & Entretien › Ménage › Nettoyage Domicile | 0 | split | Ménage régulier (`menage_domicile_regulier`) | Ménage ponctuel (avant/après fête, départ) (`menage_domicile_ponctuel`) ; Grand ménage & remise en propreté (`menage_domicile_grand_menage`) |  |
| Sport & Activités › Arts martiaux › Défense & Discipline | 0 | split | Self-défense (`arts_martiaux_self_defense`) | Judo, karaté & taekwondo (`arts_martiaux_judo_karate_taekwondo`) |  |
| Sport & Activités › Danse › Cours de danse | 0 | split | Cours de danse (adultes) (`danse_cours_adultes`) | Danse & éveil corporel (enfants) (`danse_cours_enfants`) |  |
| Sport & Activités › Fitness › Coaching sportif | 0 | split | Fitness & musculation (`coaching_sportif_fitness_muscu`) | Perte de poids & remise en forme (`coaching_sportif_perte_poids_forme`) |  |
| Sport & Activités › Natation › Cours de natation | 0 | split | Natation adultes & peur de l'eau (`natation_cours_adultes`) | Natation enfants & bébés nageurs (`natation_cours_enfants`) |  |
| Sport & Activités › Sport & Coaching › Tennis | 0 | exact | Tennis, padel & sports de raquette (`sports_ballon_raquette_tennis_raquettes`) | — |  |
| Sport & Activités › Yoga › Yoga & Pilates | 0 | split | Cours de yoga (`yoga_pilates_yoga`) | Pilates & renforcement doux (`yoga_pilates_pilates`) |  |
| Transport & Livraison › Aéroport › Transfert | 0 | ambiguous | Aéroport, gare, port & transferts (`covoiturage_trajets_aeroport_port`) | — | Transport rémunéré de personnes : réglementé (taxi/VTC). Décision requise : partage de frais uniquement. |
| Transport & Livraison › Colis › Livraison colis | 0 | exact | Retrait & livraison de colis (`colis_livraison_colis_local`) | — |  |
| Transport & Livraison › Courses › Livraison courses | 0 | ambiguous | Courses alimentaires (`courses_commissions_courses_alimentaires`) | Livraison d'objets & coursier (`colis_livraison_livraison_objets`) | Courses pour autrui (famille) ou livraison (transport) : un seul nœud porte les deux intentions. |
| Transport & Livraison › Covoiturage › Trajet local | 0 | exact | Trajets locaux & covoiturage (`covoiturage_trajets_trajet_local`) | — |  |
| Transport & Livraison › Déménagement › Aide au déménagement | 0 | exact | Aide au déménagement (`demenagement_aide_demenagement`) | — |  |
| Transport & Livraison › Livraison & Manutention › Transport de meuble | 0 | split | Transport de meubles & électroménager (`transport_objets_meubles_electromenager`) | Manutention & portage (`manutention_debarras_manutention_portage`) |  |

## B. Titres de compétences libres

| Titre | Type | Cible par défaut | Alternatives | Note |
|---|---|---|---|---|
| Plomberie | exact | Plomberie (`plomberie`) | — |  |
| Sanitaire | exact | Installation sanitaire & raccordements (`plomberie_installation`) | — |  |
| Petit bricolage | exact | Petites réparations & ajustements (`bricolage_petites_reparations`) | — |  |
| Recherche de fuite | exact | Fuite & recherche de fuite (`plomberie_fuite`) | — |  |
| Électricité | exact | Électricité (`electricite`) | — |  |
| Climatisation | exact | Climatisation & froid (`climatisation`) | — |  |
| Installation | ambiguous | Bricolage & petits travaux (`bricolage`) | Électricité (`electricite`) ; Installation sanitaire & raccordements (`plomberie_installation`) ; Pose de climatisation (`climatisation_installation`) | Titre sans objet : à préciser à la création du profil. |
| Dépannage | ambiguous | Homme à tout faire (travaux divers) (`bricolage_homme_a_tout_faire`) | Plomberie (`plomberie`) ; Électricité (`electricite`) ; Ordinateurs, Wi-Fi & réseau (`informatique_depannage`) ; Dépannage & remorquage de véhicule (`depannage_vehicule`) | Titre sans objet. |
| Petit dépannage | ambiguous | Petites réparations & ajustements (`bricolage_petites_reparations`) | Fuite & recherche de fuite (`plomberie_fuite`) ; Panne & recherche de panne (`electricite_panne`) |  |
| Couture | exact | Couture, retouches & confection (`couture_retouches`) | — |  |
| Retouches | exact | Retouches & ourlets (`couture_retouches_retouches_ourlets`) | — |  |
| Cuisine | ambiguous | Cuisine à domicile & plats préparés (`cuisine_domicile`) | Rénovation de cuisine (`renovation_cuisine`) ; Cuisine, salle de bain & sanitaires (`menage_domicile_cuisine_sdb`) | Cuisine (repas) ou cuisine (pièce). |
| Aide aux courses | exact | Courses alimentaires (`courses_commissions_courses_alimentaires`) | — |  |
| Courses | ambiguous | Courses & commissions (`courses_commissions`) | Colis & livraison (`colis_livraison`) |  |
| Aide administrative | exact | Aide aux démarches administratives (`aide_administrative`) | — |  |
| Accompagnement | ambiguous | Accompagnement & présence au quotidien (`aide_quotidienne_accompagnement_quotidien`) | Seniors : présence & accompagnement (`aide_personnes_agees`) ; Courses & commissions (`courses_commissions`) |  |
| Informatique | exact | Ordinateurs, Wi-Fi & réseau (`informatique_depannage`) | — |  |
| Informatique & High-Tech | broad | Ordinateurs, Wi-Fi & réseau (`informatique_depannage`) | Smartphone & tablette (`smartphone_tablette`) ; TV, antenne & audio (`tv_audiovisuel`) |  |
| Ordinateurs | exact | Pannes & lenteurs (PC, Mac, portable) (`informatique_depannage_pannes_pc_mac`) | — |  |
| Wi-Fi | exact | Wi-Fi, box internet & réseau (`informatique_depannage_wifi_box_reseau`) | — |  |
| Smartphones | exact | Smartphone & tablette (`smartphone_tablette`) | — |  |
| Smartphone | exact | Smartphone & tablette (`smartphone_tablette`) | — |  |
| Installation TV | exact | Installation & fixation de télévision (`tv_audiovisuel_installation_tv`) | — |  |
| Graphisme | exact | Graphisme & design (`graphisme_design`) | — |  |
| Réseaux sociaux | exact | Community management (`communication_reseaux_community_management`) | — |  |
| Communication | exact | Réseaux sociaux & communication (`communication_reseaux`) | — |  |
| Création de contenu | exact | Création de contenu (photos, vidéos courtes, textes) (`communication_reseaux_creation_contenu`) | — |  |
| Photographie | exact | Photographie (`photographe`) | — |  |
| Photo | ambiguous | Photographie (`photographe`) | Vidéo, tournage & montage (`video`) ; Graphisme & design (`graphisme_design`) |  |
| Aide numérique | exact | Initiation & formation au numérique (`initiation_numerique`) | — |  |
| Démarches numériques | exact | Démarches en ligne (impôts, CAF, ameli…) (`aide_administrative_demarches_en_ligne`) | — |  |
| Démarches en ligne | exact | Démarches en ligne (impôts, CAF, ameli…) (`aide_administrative_demarches_en_ligne`) | — |  |
| Démarches | exact | Aide aux démarches administratives (`aide_administrative`) | — |  |
| Bureautique | exact | Bureautique (Word, Excel, PowerPoint) (`initiation_numerique_bureautique`) | — |  |
| Domotique | exact | Domotique & objets connectés (`domotique_connectee`) | — |  |
| Maçonnerie | exact | Maçonnerie & gros œuvre (`maconnerie`) | — |  |
| Carrelage | exact | Carrelage & sols (`carrelage_sols`) | — |  |
| Petits travaux | broad | Bricolage & petits travaux (`bricolage`) | — |  |
| Rénovation | exact | Rénovation tous corps d'état (`renovation`) | — |  |
| Enduit | exact | Enduit & ratissage (`peinture_enduit`) | — |  |
| Placo | exact | Cloisons & doublages (`platrerie_isolation_cloisons`) | — |  |
| Peinture | exact | Peinture & revêtements muraux (`peinture`) | — |  |
| Menuiserie | exact | Menuiserie & agencement bois (`menuiserie_bois`) | — |  |
| Réparations bois | exact | Réparation de meubles & boiseries (`menuiserie_bois_reparation_bois`) | — |  |
| Clôture | exact | Clôtures & portails (`cloture_portail`) | — |  |
| Pose luminaires | exact | Luminaires & éclairage (`electricite_luminaires`) | — |  |
| Bricolage | exact | Bricolage & petits travaux (`bricolage`) | — |  |
| Bricolage & Fixation | exact | Fixations & accrochages (`bricolage_fixations`) | — |  |
| Bricolage extérieur | ambiguous | Bricolage & petits travaux (`bricolage`) | Terrasses, abris & allées (`amenagement_exterieur`) |  |
| Montage de meubles | exact | Montage de meubles (`bricolage_montage_meubles`) | — |  |
| Montage | ambiguous | Montage de meubles (`bricolage_montage_meubles`) | Montage vidéo & post-production (`video_montage`) |  |
| Réparations | ambiguous | Petites réparations & ajustements (`bricolage_petites_reparations`) | Électroménager (`electromenager`) ; Réparation de meubles & boiseries (`menuiserie_bois_reparation_bois`) |  |
| Mécanique légère | exact | Mécanique automobile (`mecanique_auto`) | — |  |
| Batterie auto | exact | Batterie & électricité auto (`mecanique_auto_batterie_electricite_auto`) | — |  |
| Jardinage | exact | Entretien de jardin (`jardinage_entretien`) | — |  |
| Jardinage & Élagage | split | Entretien de jardin (`jardinage_entretien`) | Élagage & abattage (`elagage_abattage`) |  |
| Débroussaillage | exact | Débroussaillage & nettoyage de terrain (`debroussaillage`) | — |  |
| Taille | ambiguous | Taille de haies & arbustes (`jardinage_entretien_taille_haies`) | Taille & élagage d'arbres (`elagage_abattage_taille_arbres`) ; Coiffure (`coiffure`) |  |
| Élagage léger | exact | Taille & élagage d'arbres (`elagage_abattage_taille_arbres`) | — |  |
| Déchets verts | exact | Évacuation de déchets verts (`jardinage_entretien_dechets_verts`) | — |  |
| Entretien extérieur | ambiguous | Entretien régulier (abonnement jardinier) (`jardinage_entretien_entretien_regulier`) | Nettoyage extérieur & haute pression (`nettoyage_exterieur`) |  |
| Nettoyage extérieur | exact | Nettoyage extérieur & haute pression (`nettoyage_exterieur`) | — |  |
| Nettoyage haute pression | exact | Nettoyage haute pression (terrasses, façades, allées) (`nettoyage_exterieur_haute_pression`) | — |  |
| Entretien piscine | exact | Entretien de piscine (`piscine_bassin_entretien`) | — |  |
| Entretien | ambiguous | Bricolage & petits travaux (`bricolage`) | Ménage à domicile (`menage_domicile`) ; Entretien de jardin (`jardinage_entretien`) ; Mécanique automobile (`mecanique_auto`) | Titre sans objet. |
| Ménage | exact | Ménage à domicile (`menage_domicile`) | — |  |
| Ménage & Entretien | broad | Ménage à domicile (`menage_domicile`) | Nettoyages spécialisés (`nettoyage_special`) |  |
| Nettoyage | ambiguous | Ménage à domicile (`menage_domicile`) | Nettoyages spécialisés (`nettoyage_special`) ; Nettoyage extérieur & haute pression (`nettoyage_exterieur`) ; Lavage & rénovation de véhicules (`lavage_auto`) |  |
| Rangement | exact | Rangement & organisation d'intérieur (`rangement_organisation`) | — |  |
| Repassage | exact | Repassage (`linge_repassage_repassage`) | — |  |
| Préparation de repas | exact | Préparation de repas (semaine, régimes) (`cuisine_domicile_preparation_repas`) | — |  |
| Cuisine & Traiteur | broad | Cuisine à domicile & plats préparés (`cuisine_domicile`) | Traiteur & réception (`traiteur_evenement`) |  |
| Pâtisserie | exact | Pâtisserie, boulangerie & desserts (`patisserie`) | — |  |
| Aide quotidienne | exact | Coups de main & aide du quotidien (`aide_quotidienne`) | — |  |
| Aide ponctuelle | exact | Coup de main ponctuel (`aide_quotidienne_coup_de_main`) | — |  |
| Garde ponctuelle | ambiguous | Garde d'enfants & babysitting (`garde_enfants`) | Garde & promenade d'animaux (`garde_animaux`) ; Seniors : présence & accompagnement (`aide_personnes_agees`) |  |
| Garde d'enfants | exact | Garde d'enfants & babysitting (`garde_enfants`) | — |  |
| Garde d'enfants / Babysitting | exact | Babysitting ponctuel (soirée, week-end) (`garde_enfants_babysitting_soiree`) | — |  |
| Garde d'animaux | exact | Garde & promenade d'animaux (`garde_animaux`) | — |  |
| Promenade | ambiguous | Promenade & sorties de chiens (`garde_animaux_promenade`) | Accompagnement de sorties & rendez-vous (`aide_personnes_agees_accompagnement_sorties_rdv`) |  |
| Soutien scolaire | exact | Soutien scolaire (`soutien_scolaire`) | — |  |
| Cours & Soutien scolaire | broad | Soutien scolaire (`soutien_scolaire`) | Cours de langues (`langues`) ; Cours de musique & chant (`cours_musique`) |  |
| Aide aux devoirs | exact | Aide aux devoirs (primaire) (`soutien_scolaire_devoirs_primaire`) | — |  |
| Anglais | exact | Anglais (`langues_anglais`) | — |  |
| Français | ambiguous | Français, alphabétisation & remise à niveau (`langues_francais_alphabetisation`) | Soutien scolaire (`soutien_scolaire`) |  |
| Transport | ambiguous | Transport d'objets & utilitaire (`transport_objets`) | Covoiturage & trajets (`covoiturage_trajets`) ; Colis & livraison (`colis_livraison`) ; Déménagement (`demenagement`) |  |
| Transport d'objets | exact | Transport d'objets & utilitaire (`transport_objets`) | — |  |
| Transport & Déménagement | broad | Déménagement (`demenagement`) | Transport d'objets & utilitaire (`transport_objets`) |  |
| Transport & Colis | broad | Colis & livraison (`colis_livraison`) | Transport d'objets & utilitaire (`transport_objets`) |  |
| Manutention | exact | Manutention & portage (`manutention_debarras_manutention_portage`) | — |  |
| Déménagement | exact | Déménagement (`demenagement`) | — |  |
| Utilitaire | exact | Utilitaire, remorque & camion avec chauffeur (`transport_objets_utilitaire_remorque`) | — |  |
| Livraison | exact | Colis & livraison (`colis_livraison`) | — |  |
| Organisation | ambiguous | Organisation d'événements (`organisation_evenement`) | Rangement & organisation d'intérieur (`rangement_organisation`) ; Aide aux démarches administratives (`aide_administrative`) |  |
| Organisation d'événements | exact | Organisation d'événements (`organisation_evenement`) | — |  |
| Événementiel | broad | Organisation d'événements (`organisation_evenement`) | — |  |
| Décoration | ambiguous | Décoration & fleurs d'événement (`decoration_evenement`) | Papier peint & décoration murale (`peinture_decoration`) |  |
| Aide événementielle | ambiguous | Aide pour un événement familial (`aide_quotidienne_aide_evenement_famille`) | Service, barman & aide en salle (`organisation_evenement_service_reception`) |  |
| Préparation événementielle | exact | Organisation d'événements (`organisation_evenement`) | — |  |
| Maquillage événementiel | exact | Maquillage de soirée & événement (`maquillage_evenement`) | — |  |
| Coiffure | exact | Coiffure (`coiffure`) | — |  |
| Comptabilité simple | exact | Devis & facturation (`comptabilite_gestion_facturation_devis`) | — |  |
| Musique, concert, événement, cours de batterie, | ambiguous | Piano, guitare, batterie & instruments (`cours_musique_instruments`) | Musiciens, chanteurs & spectacle (`musique_spectacle`) ; DJ, sonorisation & éclairage (`dj_sonorisation`) | Titre libre à plusieurs intentions : donnée de recette à nettoyer. |

## C. Boutons « compétences rapides » du profil

| Bouton | Cible | Alternatives |
|---|---|---|
| Bricolage & Fixation | Bricolage & petits travaux (`bricolage`) | — |
| Jardinage & Élagage | Entretien de jardin (`jardinage_entretien`) | Élagage & abattage (`elagage_abattage`) |
| Transport & Déménagement | Déménagement (`demenagement`) | Transport d'objets & utilitaire (`transport_objets`) |
| Informatique & High-Tech | Ordinateurs, Wi-Fi & réseau (`informatique_depannage`) | Smartphone & tablette (`smartphone_tablette`) ; TV, antenne & audio (`tv_audiovisuel`) |
| Ménage & Entretien | Ménage à domicile (`menage_domicile`) | — |
| Garde d'enfants / Babysitting | Garde d'enfants & babysitting (`garde_enfants`) | — |
| Garde d'animaux | Garde & promenade d'animaux (`garde_animaux`) | — |
| Cuisine & Traiteur | Cuisine à domicile & plats préparés (`cuisine_domicile`) | Traiteur & réception (`traiteur_evenement`) |
| Cours & Soutien scolaire | Soutien scolaire (`soutien_scolaire`) | Cours de langues (`langues`) ; Cours de musique & chant (`cours_musique`) |

## D. Catégories libres de `requests.category`

| Catégorie observée | Demandes Staging | Type | Cible |
|---|---:|---|---|
| Jardinage | 48 | broad | Entretien de jardin (`jardinage_entretien`) |
| Général | 11 | ambiguous | Demande à classer (`autre_demande_non_classee`) |
| Plomberie | 5 | exact | Plomberie (`plomberie`) |
| Autre / Je ne trouve pas | 3 | exact | Demande à classer (`autre_demande_non_classee`) |
| Couture | 2 | exact | Couture, retouches & confection (`couture_retouches`) |
| Bricolage | 2 | exact | Bricolage & petits travaux (`bricolage`) |
| Baby sitting | 1 | exact | Babysitting ponctuel (soirée, week-end) (`garde_enfants_babysitting_soiree`) |
| jardin | 1 | broad | Entretien de jardin (`jardinage_entretien`) |
| k7mqp4lyannrc | 1 | ambiguous | Demande à classer (`autre_demande_non_classee`) |
| Piscine | 1 | exact | Piscine & bassin (`piscine_bassin`) |
| Électroménager | 1 | exact | Électroménager (`electromenager`) |
| Menuiserie | 1 | exact | Menuiserie & agencement bois (`menuiserie_bois`) |
| Mécanique Automobile | 1 | exact | Mécanique automobile (`mecanique_auto`) |
| Peinture | 1 | exact | Peinture & revêtements muraux (`peinture`) |
| autre | 1 | exact | Demande à classer (`autre_demande_non_classee`) |

## E. Les 8 familles de pins de la carte Annonces

| Ancienne famille | Famille(s) v2 | Métiers précis | Note |
|---|---|---|---|
| plomberie | maison | plomberie |  |
| electricite | maison | electricite, electromenager, climatisation |  |
| bricolage | maison | — |  |
| jardinage | jardin | — |  |
| menage | entretien | — |  |
| beaute | beaute | — |  |
| numerique | numerique | — |  |
| quotidien | transport, famille, evenement | — | Fourre-tout historique : la carte adopte directement les 8 familles v2. |

## F. Clés d'exigences réglementaires professionnelles

| Clé actuelle | Métiers v2 couverts |
|---|---|
| `electricite` | electricite, energie_solaire, climatisation |
| `batiment` | maconnerie, carrelage_sols, platrerie_isolation, toiture_etancheite, peinture, menuiserie_bois, renovation, traitement_batiment, ferronnerie_soudure, cloture_portail |
| `jardinage` | jardinage_entretien, debroussaillage, elagage_abattage, paysagisme, arrosage_irrigation |

## G. Catégories ambiguës nécessitant une décision

- **Mer & Nautisme › Bateau › Entretien & Sortie** → défaut `bateau_mecanique_marine`. Entretien = mécanique marine ; sortie = activité nautique (famille différente).
- **Transport & Livraison › Aéroport › Transfert** → défaut `covoiturage_trajets_aeroport_port`. Transport rémunéré de personnes : réglementé (taxi/VTC). Décision requise : partage de frais uniquement.
- **Transport & Livraison › Courses › Livraison courses** → défaut `courses_commissions_courses_alimentaires`. Courses pour autrui (famille) ou livraison (transport) : un seul nœud porte les deux intentions.
