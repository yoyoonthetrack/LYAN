# 10 — Revue produit finale de la taxonomie

> **Statut : PROPOSITION À VALIDER — rien n'est implémenté ni appliqué.** Document généré par `scripts/taxonomy-v2/review.js` à partir des données de `docs/taxonomy/data/` (les tableaux ne peuvent donc pas diverger de la source).
> Aucune migration, aucune écriture Supabase, aucun déploiement, Production non consultée.

## 0. Ce qu'il faut décider (et le reste)

La revue se résume à **6 arbitrages** ; les 7 autres décisions sont des recommandations à entériner telles quelles.

| Décision | Nature | Ma recommandation | Si vous répondez « oui » |
|---|---|---|---|
| **D1** structure : 8 familles, Maison sur 2 tuiles | structurel | **Oui** | structure figée (codes permanents) |
| **D4** nœuds réglementés non sélectionnables | juridique | **Oui** + relecture juridique des 3 nœuds | contrainte SQL `selectable=false` conservée |
| **D5** transport de personnes = partage de frais seulement | juridique/métier | **Oui** | libellés et modération alignés ; « piroguier » (Guyane) traité de même |
| **D8** permission `taxonomy.manage` + formulaire « Je ne trouve pas mon métier » | structurel (droits admin) | **Oui**, à créer dans une migration dédiée | nouveau droit admin, jamais attribué par défaut |
| **D11** recensement Production **en lecture seule** (agrégats) | accès Production | **Oui**, requêtes déjà prêtes | mesure réelle de la demande et de la précision |
| **D13** vocabulaire territorial : **structure unique, vocabulaire par région** | périmètre | **Oui** (révisé, voir §5) | lot Guyane/Réunion relu par des locuteurs |

Tout « oui » ouvre l'intégration par l'étape 1 du plan (répétition à blanc sur Staging, doc. 08) — pas d'autre aller-retour sur la structure.

## 1. Les 8 familles

| # | Famille | Description | Métiers | Spécialités | Sous-domaines d'affichage |
|---:|---|---|---:|---:|---|
| 1 | **Maison, travaux et dépannage** | Réparer, installer, rénover et équiper son logement. | 20 | 88 | Dépannage & installations · Rénovation & construction · Petits travaux & bricolage · Énergie, sécurité & équipements |
| 2 | **Jardin et extérieur** | Entretenir, planter, tailler, aménager et nettoyer les extérieurs. | 10 | 38 | Entretien du jardin · Arbres & végétation · Création & plantations · Extérieurs, bassins & piscine · Potager, vivrier & agriculture |
| 3 | **Ménage et entretien** | Garder son logement, son linge et ses locaux propres et en ordre. | 8 | 27 | Ménage à domicile · Linge & repassage · Nettoyages spécialisés · Locaux, conciergerie & gardiennage · Hygiène & organisation |
| 4 | **Beauté, bien-être et sport** | Se coiffer, se faire belle ou beau, se détendre et bouger. | 14 | 55 | Coiffure & cheveux · Esthétique & maquillage · Massage & bien-être · Sport & mouvement · Nature & activités nautiques |
| 5 | **Transport, véhicules et logistique** | Se déplacer, transporter, déménager et entretenir son véhicule. | 12 | 47 | Déplacements de personnes · Colis, fret & livraison · Déménagement & manutention · Véhicules & mécanique · Bateau & mécanique marine |
| 6 | **Famille, éducation et assistance** | Enfants, cours, seniors, animaux et coups de main du quotidien. | 11 | 43 | Enfants & garde · Soutien scolaire, langues & cours · Seniors & aide à la personne · Aide du quotidien · Animaux de compagnie |
| 7 | **Événementiel, cuisine et création** | Organiser une fête, cuisiner, photographier, créer et fabriquer. | 15 | 61 | Organisation, animation & location · Cuisine, traiteur & pâtisserie · Photo & vidéo · Artisanat, couture & arts · Musique & spectacle |
| 8 | **Numérique, administratif et services professionnels** | Équipements, sites, démarches, papiers, gestion et accompagnement pro. | 14 | 53 | Dépannage & équipements · Création & communication · Initiation & formation · Démarches & papiers · Services aux professionnels |
| 9 | **Autres** | Réceptacle technique des demandes non classées. | 1 | 2 | — |
| | **Total** | | **105** | **414** | |

*Lecture* : « Autres » n'est pas une 9ᵉ famille mais un réceptacle ; elle n'est jamais proposée comme compétence de profil. Un métier a **une famille principale** ; 14 métiers sur 105 apparaissent aussi dans une famille secondaire (comptés une seule fois).

## 2. Les métiers de chaque famille, avec exemples de spécialités

Légende : ⚠️ prudence (vérifier les justificatifs) · 🔒 professionnel déclaré requis · ⛔ réglementé, non sélectionnable (guide). Une spécialité est **optionnelle** : l'utilisateur peut s'arrêter au métier.

### Maison, travaux et dépannage

*Réparer, installer, rénover et équiper son logement.* — 20 métiers, 88 spécialités.

| Métier | Sous-domaine | Spéc. | Exemples de spécialités | Notes |
|---|---|---:|---|---|
| Plomberie | Dépannage & installations | 7 | Fuite & recherche de fuite · Robinetterie & joints · WC, lavabo & douche |  |
| Électricité | Dépannage & installations | 7 | Panne & recherche de panne · Prises & interrupteurs · Luminaires & éclairage | 🔒 pro requis (certaines spéc.) |
| Climatisation & froid | Dépannage & installations | 5 | Pose de climatisation · Entretien & nettoyage · Dépannage & panne | 🔒 pro requis |
| Serrurerie | Dépannage & installations | 4 | Ouverture de porte · Changement de serrure & cylindre · Sécurisation & blindage | ⚠️ prudence |
| Électroménager | Dépannage & installations | 5 | Lave-linge & sèche-linge · Réfrigérateur & congélateur · Lave-vaisselle |  |
| Vitrerie, volets & stores | Dépannage & installations | 4 | Vitres & miroirs · Volets, stores & jalousies · Moustiquaires |  |
| Alarme, portail & sécurité | Énergie, sécurité & équipements | 4 | Alarme & vidéosurveillance · Portail & motorisation · Interphone, visiophone & sonnette |  |
| Solaire, énergie & recharge | Énergie, sécurité & équipements | 3 | Chauffe-eau solaire · Panneaux photovoltaïques · Borne de recharge véhicule électrique | 🔒 pro requis |
| Peinture & revêtements muraux | Rénovation & construction | 5 | Peinture intérieure · Façade & peinture extérieure · Enduit & ratissage |  |
| Maçonnerie & gros œuvre | Rénovation & construction | 5 | Murets & clôtures maçonnées · Dalles, chapes & terrasses · Fissures & petites réparations | ⚠️ prudence (certaines spéc.) |
| Carrelage & sols | Rénovation & construction | 4 | Pose de carrelage · Faïence & crédence · Joints & rénovation de carrelage |  |
| Menuiserie & agencement bois | Rénovation & construction | 5 | Placards, dressings & meubles sur mesure · Portes, fenêtres & volets bois · Terrasses bois, pergolas & carports |  |
| Plâtrerie, cloisons & isolation | Rénovation & construction | 3 | Cloisons & doublages · Faux plafonds · Isolation thermique & phonique |  |
| Toiture, charpente & étanchéité | Rénovation & construction | 5 | Fuite de toit & réparation · Gouttières & descentes d'eau · Étanchéité de toit-terrasse | ⚠️ prudence |
| Ferronnerie, soudure & métallerie | Rénovation & construction | 3 | Soudure & réparations métalliques · Garde-corps, escaliers & rampes · Grilles de protection & portails sur mesure |  |
| Clôtures & portails | Rénovation & construction | 4 | Clôture grillagée · Clôture bois, PVC & aluminium · Brise-vue, canisses & claustras | aussi : Jardin & extérieur |
| Termites, humidité & traitement du bâti | Rénovation & construction | 3 | Termites & insectes du bois · Humidité, moisissures & salpêtre · Traitement & protection du bois | aussi : Ménage & entretien ; ⚠️ prudence |
| Rénovation tous corps d'état | Rénovation & construction | 4 | Rénovation de salle de bain · Rénovation de cuisine · Rafraîchissement & rénovation de logement |  |
| Bricolage & petits travaux | Petits travaux & bricolage | 5 | Montage de meubles · Fixations & accrochages · Petites réparations & ajustements |  |
| Prêt & location d'outillage | Petits travaux & bricolage | 3 | Outils & petit matériel de chantier · Échafaudage, échelle & accès en hauteur · Matériel de jardin & nettoyage | aussi : Fêtes, cuisine & création |

### Jardin et extérieur

*Entretenir, planter, tailler, aménager et nettoyer les extérieurs.* — 10 métiers, 38 spécialités.

| Métier | Sous-domaine | Spéc. | Exemples de spécialités | Notes |
|---|---|---:|---|---|
| Entretien de jardin | Entretien du jardin | 5 | Tonte de pelouse · Taille de haies & arbustes · Désherbage & entretien de massifs |  |
| Débroussaillage & nettoyage de terrain | Entretien du jardin | 4 | Débroussaillage de terrain · Nettoyage avant construction ou vente · Talus, pentes & ravines | ⚠️ prudence |
| Élagage & abattage | Arbres & végétation | 4 | Taille & élagage d'arbres · Palmiers & cocotiers · Abattage & dessouchage | ⚠️ prudence |
| Paysagisme & plantations | Création & plantations | 4 | Aménagement & création de jardin · Plantations (arbres, haies, fleurs) · Gazon & engazonnement |  |
| Arrosage & irrigation | Création & plantations | 3 | Installation d'arrosage automatique · Réparation d'arrosage · Récupération & stockage d'eau de pluie |  |
| Piscine & bassin | Extérieurs, bassins & piscine | 4 | Entretien de piscine · Mise en service, hivernage & remise en route · Réparation (pompe, filtre, liner) |  |
| Nettoyage extérieur & haute pression | Extérieurs, bassins & piscine | 3 | Nettoyage haute pression (terrasses, façades, allées) · Démoussage de toiture & surfaces · Évacuation d'algues, débris & remise en état après intempéries | aussi : Ménage & entretien |
| Terrasses, abris & allées | Extérieurs, bassins & piscine | 4 | Création & rénovation de terrasse · Allées, pavés & cheminements · Abris, pergolas & carports | aussi : Maison & travaux |
| Potager & jardin vivrier | Potager, vivrier & agriculture | 3 | Création & entretien de potager · Verger & arbres fruitiers · Compost & permaculture |  |
| Aide agricole & petit élevage | Potager, vivrier & agriculture | 4 | Récolte & entretien de parcelle · Petit élevage & basse-cour · Apiculture & miel |  |

### Ménage et entretien

*Garder son logement, son linge et ses locaux propres et en ordre.* — 8 métiers, 27 spécialités.

| Métier | Sous-domaine | Spéc. | Exemples de spécialités | Notes |
|---|---|---:|---|---|
| Ménage à domicile | Ménage à domicile | 4 | Ménage régulier · Grand ménage & remise en propreté · Ménage ponctuel (avant/après fête, départ) |  |
| Linge & repassage | Linge & repassage | 3 | Repassage · Lessive & entretien du linge · Literie, rideaux & gros textiles |  |
| Nettoyages spécialisés | Nettoyages spécialisés | 4 | Vitres, baies & vérandas · Canapé, tapis, moquette & matelas · Nettoyage de fin de chantier |  |
| Nettoyage de locaux & parties communes | Locaux, conciergerie & gardiennage | 3 | Bureaux, commerces & cabinets · Parties communes & copropriétés · Salles communales & locaux associatifs |  |
| Conciergerie & location saisonnière | Locaux, conciergerie & gardiennage | 3 | Ménage & rotation de linge · Accueil des voyageurs & remise des clés · Petit entretien & dépannage de location |  |
| Gardiennage & surveillance de logement | Locaux, conciergerie & gardiennage | 3 | Surveillance pendant une absence · Arrosage des plantes & courrier · Présence & garde de maison |  |
| Insectes, rongeurs & hygiène | Hygiène & organisation | 4 | Cafards, fourmis, moustiques & guêpes · Rats, souris & rongeurs · Désinfection & assainissement | aussi : Maison & travaux ; ⚠️ prudence |
| Rangement & organisation d'intérieur | Hygiène & organisation | 3 | Tri & désencombrement · Organisation, dressing & rangement · Classement de papiers & archives domestiques |  |

### Beauté, bien-être et sport

*Se coiffer, se faire belle ou beau, se détendre et bouger.* — 14 métiers, 55 spécialités.

| Métier | Sous-domaine | Spéc. | Exemples de spécialités | Notes |
|---|---|---:|---|---|
| Coiffure | Coiffure & cheveux | 4 | Coupe femme & enfant · Barbier & coupe homme · Coloration, lissage & soins |  |
| Tresses, locks & cheveux texturés | Coiffure & cheveux | 4 | Tresses & nattes · Locks & dreadlocks · Tissage, extensions & perruques |  |
| Esthétique & soins du corps | Esthétique & maquillage | 4 | Soins du visage · Épilation · Cils & sourcils |  |
| Ongles & manucure | Esthétique & maquillage | 4 | Manucure & vernis semi-permanent · Pose d'ongles (gel, résine, capsules) · Nail art |  |
| Maquillage | Esthétique & maquillage | 4 | Maquillage de mariée · Maquillage de soirée & événement · Cours & conseils maquillage |  |
| Massage & relaxation | Massage & bien-être | 5 | Massage de détente · Massage sportif & récupération · Réflexologie | ⚠️ prudence |
| Yoga, pilates & gym douce | Massage & bien-être | 4 | Cours de yoga · Pilates & renforcement doux · Gym douce & seniors |  |
| Coaching sportif & remise en forme | Sport & mouvement | 4 | Fitness & musculation · Perte de poids & remise en forme · Course à pied, marche & trail |  |
| Danse | Sport & mouvement | 4 | Cours de danse (adultes) · Danse & éveil corporel (enfants) · Chorégraphie de mariage & événement | aussi : Fêtes, cuisine & création |
| Tennis, foot, basket & sports de balle | Sport & mouvement | 3 | Tennis, padel & sports de raquette · Football, basket, volley & sports collectifs · Pétanque & jeux d'adresse |  |
| Natation & activités aquatiques | Sport & mouvement | 4 | Natation enfants & bébés nageurs · Natation adultes & peur de l'eau · Aquagym & aquabike | 🔒 pro requis (certaines spéc.) |
| Arts martiaux & self-défense | Sport & mouvement | 4 | Judo, karaté & taekwondo · Boxe, kick-boxing & sports de combat · Self-défense |  |
| Activités nautiques & pêche de loisir | Nature & activités nautiques | 4 | Plongée & snorkeling · Voile, kayak, paddle & glisse · Pêche de loisir & sorties en mer | 🔒 pro requis (certaines spéc.) |
| Randonnée & balades guidées | Nature & activités nautiques | 3 | Randonnée guidée · Découverte de la faune, de la flore & du patrimoine · Canyoning & activités d'aventure | 🔒 pro requis (certaines spéc.) |

### Transport, véhicules et logistique

*Se déplacer, transporter, déménager et entretenir son véhicule.* — 12 métiers, 47 spécialités.

| Métier | Sous-domaine | Spéc. | Exemples de spécialités | Notes |
|---|---|---:|---|---|
| Covoiturage & trajets | Déplacements de personnes | 4 | Trajets locaux & covoiturage · Aéroport, gare, port & transferts · Accompagnement de trajets (enfants, seniors) | ⚠️ prudence |
| Colis & livraison | Colis, fret & livraison | 4 | Retrait & livraison de colis · Livraison d'objets & coursier · Fret, envois inter-îles & métropole |  |
| Déménagement | Déménagement & manutention | 4 | Aide au déménagement · Déménagement complet (camion + équipe) · Emballage, démontage & remontage |  |
| Transport d'objets & utilitaire | Déménagement & manutention | 4 | Transport de meubles & électroménager · Transport de matériaux, sable & gravats · Utilitaire, remorque & camion avec chauffeur |  |
| Manutention, débarras & encombrants | Déménagement & manutention | 3 | Manutention & portage · Débarras de cave, garage & logement · Évacuation d'encombrants & déchetterie |  |
| Mécanique automobile | Véhicules & mécanique | 6 | Diagnostic & pannes · Entretien, vidange & révision · Freinage, suspension & direction |  |
| Scooter, moto & vélo | Véhicules & mécanique | 4 | Mécanique scooter & moto · Vélo, VTT & vélo électrique · Trottinettes & mobilité électrique |  |
| Carrosserie & peinture auto | Véhicules & mécanique | 4 | Rayures, bosses & chocs · Débosselage sans peinture · Peinture, vernis & rénovation de teinte |  |
| Pneus & roues | Véhicules & mécanique | 3 | Montage & équilibrage · Crevaison & réparation de pneu · Géométrie & parallélisme |  |
| Lavage & rénovation de véhicules | Véhicules & mécanique | 4 | Lavage extérieur & intérieur · Détailing, polish & lustrage · Sièges, moquettes & odeurs |  |
| Dépannage & remorquage de véhicule | Véhicules & mécanique | 3 | Batterie à plat & démarrage · Remorquage & dépanneuse · Assistance sur la route (roue, carburant) |  |
| Bateau, hors-bord & entretien nautique | Bateau & mécanique marine | 4 | Moteur hors-bord & mécanique marine · Coque, carénage & antifouling · Annexe, gonflable & petit bateau | ⚠️ prudence |

### Famille, éducation et assistance

*Enfants, cours, seniors, animaux et coups de main du quotidien.* — 11 métiers, 43 spécialités.

| Métier | Sous-domaine | Spéc. | Exemples de spécialités | Notes |
|---|---|---:|---|---|
| Garde d'enfants & babysitting | Enfants & garde | 5 | Babysitting ponctuel (soirée, week-end) · Garde à domicile régulière (nounou) · Sortie d'école, goûter & accompagnement | ⚠️ prudence |
| Soutien scolaire | Soutien scolaire, langues & cours | 4 | Aide aux devoirs (primaire) · Collège & lycée (maths, français, sciences…) · Préparation aux examens & concours |  |
| Cours de langues | Soutien scolaire, langues & cours | 5 | Anglais · Espagnol · Créole |  |
| Cours de musique & chant | Soutien scolaire, langues & cours | 4 | Piano, guitare, batterie & instruments · Chant, solfège & théorie · Percussions & musiques traditionnelles | aussi : Fêtes, cuisine & création |
| Code de la route & permis | Soutien scolaire, langues & cours | 3 | Révision du code de la route · Reprise de confiance au volant (accompagnement) | ⛔ réglementé (certaines spéc.) |
| Seniors : présence & accompagnement | Seniors & aide à la personne | 4 | Compagnie & présence · Repas, courses & aide pratique · Accompagnement de sorties & rendez-vous | ⛔ réglementé (certaines spéc.) |
| Coups de main & aide du quotidien | Aide du quotidien | 4 | Coup de main ponctuel · Accompagnement & présence au quotidien · Aide aux déplacements & courses |  |
| Courses & commissions | Aide du quotidien | 3 | Courses alimentaires · Commissions & achats pour autrui · Portage & rangement des courses | aussi : Transport & véhicules |
| Garde & promenade d'animaux | Animaux de compagnie | 5 | Garde & pension de chiens · Chats & nouveaux animaux de compagnie (NAC) · Promenade & sorties de chiens | ⚠️ prudence |
| Toilettage d'animaux | Animaux de compagnie | 3 | Bain, coupe & brossage · Griffes, oreilles & hygiène · Toilettage à domicile |  |
| Éducation canine & comportement | Animaux de compagnie | 3 | Éducation du chiot · Obéissance & rappel · Comportement (aboiements, anxiété, agressivité) | ⚠️ prudence |

### Événementiel, cuisine et création

*Organiser une fête, cuisiner, photographier, créer et fabriquer.* — 15 métiers, 61 spécialités.

| Métier | Sous-domaine | Spéc. | Exemples de spécialités | Notes |
|---|---|---:|---|---|
| Organisation d'événements | Organisation, animation & location | 4 | Mariage, baptême & cérémonies · Anniversaires & fêtes privées · Service, barman & aide en salle |  |
| Animation enfants & adultes | Organisation, animation & location | 4 | Animation enfants & anniversaires · Animation de soirée & jeux adultes · Ateliers créatifs & loisirs animés |  |
| DJ, sonorisation & éclairage | Organisation, animation & location | 3 | DJ de soirée & mariage · Sonorisation & technicien son · Éclairage de fête & de scène |  |
| Décoration & fleurs d'événement | Organisation, animation & location | 3 | Ballons, arches & décor de fête · Décoration de salle & de table · Fleuriste & compositions florales |  |
| Location de matériel & mobilier de fête | Organisation, animation & location | 4 | Tentes, chaises & tables · Vaisselle, verres & art de la table · Sono, lumière & matériel technique | aussi : Maison & travaux |
| Traiteur & réception | Cuisine, traiteur & pâtisserie | 4 | Buffet & cocktail dînatoire · Repas de fête & service à table · Plats créoles & spécialités locales |  |
| Cuisine à domicile & plats préparés | Cuisine, traiteur & pâtisserie | 5 | Plats faits maison à emporter · Cuisinier ou chef à domicile · Préparation de repas (semaine, régimes) |  |
| Pâtisserie, boulangerie & desserts | Cuisine, traiteur & pâtisserie | 4 | Gâteaux d'anniversaire & cake design · Pâtisseries & desserts créoles · Pain, viennoiseries & boulangerie |  |
| Photographie | Photo & vidéo | 5 | Photo d'événement (mariage, baptême, fête) · Portrait, famille & grossesse · Photo produit, commerce & immobilier | ⚠️ prudence (certaines spéc.) |
| Vidéo, tournage & montage | Photo & vidéo | 4 | Vidéo d'événement (film de mariage, aftermovie) · Captation de spectacles & diffusion en direct · Montage vidéo & post-production | aussi : Numérique & administratif |
| Artisanat & objets créés | Artisanat, couture & arts | 5 | Bijoux & accessoires · Poterie & céramique · Vannerie, madras & textiles traditionnels |  |
| Peinture, dessin & arts plastiques | Artisanat, couture & arts | 4 | Tableaux & portraits sur commande · Cours de dessin & de peinture · Fresques murales & street art |  |
| Couture, retouches & confection | Artisanat, couture & arts | 5 | Retouches & ourlets · Vêtements sur mesure & tenues de cérémonie · Confection pour la maison (rideaux, coussins, linge) |  |
| Stylisme & conseil en image | Artisanat, couture & arts | 3 | Relooking & conseil look · Shopping accompagné & personal shopper · Tri & optimisation de garde-robe |  |
| Musiciens, chanteurs & spectacle | Musique & spectacle | 4 | Groupe, orchestre & musiciens · Chanteur & chant de cérémonie · Musiques & spectacles traditionnels, carnaval | aussi : Famille & éducation |

### Numérique, administratif et services professionnels

*Équipements, sites, démarches, papiers, gestion et accompagnement pro.* — 14 métiers, 53 spécialités.

| Métier | Sous-domaine | Spéc. | Exemples de spécialités | Notes |
|---|---|---:|---|---|
| Ordinateurs, Wi-Fi & réseau | Dépannage & équipements | 5 | Pannes & lenteurs (PC, Mac, portable) · Wi-Fi, box internet & réseau · Imprimantes, écrans & périphériques |  |
| Smartphone & tablette | Dépannage & équipements | 4 | Réglages, applications & WhatsApp · Transfert, sauvegarde & stockage · Réparation (écran, batterie, charge) |  |
| TV, antenne & audio | Dépannage & équipements | 3 | Installation & fixation de télévision · Antenne, parabole & décodeur · Home cinéma, barre de son & multiroom |  |
| Domotique & objets connectés | Dépannage & équipements | 4 | Éclairage & prises connectés · Volets, climatisation & thermostats connectés · Caméras & sonnettes connectées | aussi : Maison & travaux |
| Sites web & boutiques en ligne | Création & communication | 4 | Site vitrine & page de présentation · Boutique en ligne & e-commerce · Référencement & visibilité locale |  |
| Réseaux sociaux & communication | Création & communication | 4 | Community management · Création de contenu (photos, vidéos courtes, textes) · Publicité en ligne & campagnes |  |
| Graphisme & design | Création & communication | 4 | Logo & identité visuelle · Flyers, affiches & cartes de visite · Visuels réseaux, bannières & templates |  |
| Initiation & formation au numérique | Initiation & formation | 4 | Initiation internet & ordinateur (débutants, seniors) · Bureautique (Word, Excel, PowerPoint) · Code & programmation (enfants et adultes) | aussi : Famille & éducation |
| Aide aux démarches administratives | Démarches & papiers | 4 | Démarches en ligne (impôts, CAF, ameli…) · Dossiers d'aides & prestations · Courrier, réclamations & écrivain public |  |
| CV, lettres & rédaction | Démarches & papiers | 4 | CV, lettre de motivation & LinkedIn · Préparation d'entretien & recherche d'emploi · Rédaction, relecture & correction |  |
| Traduction & interprétariat | Démarches & papiers | 3 | Traduction de documents (FR / EN / ES / Créole) · Interprétariat & accompagnement linguistique | ⛔ réglementé (certaines spéc.) |
| Secrétariat & assistance | Services aux professionnels | 3 | Saisie, frappe & mise en page · Assistance virtuelle (agenda, e-mails, rendez-vous) · Assistance pour indépendants & petites entreprises |  |
| Comptabilité & gestion simple | Services aux professionnels | 4 | Devis & facturation · Micro-entreprise & déclarations (URSSAF) · Création d'activité & statut | ⚠️ prudence |
| Formation, coaching & conseil pro | Services aux professionnels | 3 | Formation professionnelle & ateliers · Coaching, orientation & reconversion · Conseil & organisation d'activité |  |

### Autres

Réceptacle technique, **jamais proposé comme compétence de profil** :

- **Autre besoin (demande libre)** — Demande à classer · Service direct (demande ciblée à un membre)

## 3. Les 10 tuiles de Découvrir : familles métier et domaines mis en avant

| # | Tuile | Icône | Nature | Famille | Contenu ouvert | Métiers | Spéc. |
|---:|---|---|---|---|---|---:|---:|
| 1 | Dépannage maison | `wrench` | **Domaine mis en avant** | Maison, travaux et dépannage | Dépannage & installations + Énergie, sécurité & équipements | 8 | 39 |
| 2 | Travaux & rénovation | `hammer` | **Domaine mis en avant** | Maison, travaux et dépannage | Rénovation & construction + Petits travaux & bricolage | 12 | 49 |
| 3 | Jardin & extérieur | `plant` | **Famille métier** | Jardin et extérieur | tous les sous-domaines | 10 | 38 |
| 4 | Ménage & entretien | `broom` | **Famille métier** | Ménage et entretien | tous les sous-domaines | 8 | 27 |
| 5 | Beauté & bien-être | `flower-lotus` | **Famille métier** | Beauté, bien-être et sport | tous les sous-domaines | 14 | 55 |
| 6 | Transport & véhicules | `truck` | **Famille métier** | Transport, véhicules et logistique | tous les sous-domaines | 12 | 47 |
| 7 | Famille & éducation | `users-three` | **Famille métier** | Famille, éducation et assistance | tous les sous-domaines | 11 | 43 |
| 8 | Fêtes, cuisine & création | `confetti` | **Famille métier** | Événementiel, cuisine et création | tous les sous-domaines | 15 | 61 |
| 9 | Numérique & administratif | `laptop` | **Famille métier** | Numérique, administratif et services professionnels | tous les sous-domaines | 14 | 53 |
| 10 | Autres | `dots-three` | Technique (10ᵉ) | Autres | « Décrire mon besoin » | 1 | 2 |

- **7 tuiles = 7 familles métier** (une tuile ouvre toute la famille) ; **2 tuiles = 2 domaines mis en avant** de la famille Maison (la plus dense : 20 métiers, 88 spécialités) ; la 10ᵉ, **Autres**, est technique (« Décrire mon besoin »).
- Les 8 familles restent **le seul vocabulaire** des filtres, de la carte (pins) et des compteurs : les 2 tuiles Maison sont une **vue**, pas une famille de plus.
- Variante écartée : une 9ᵉ famille « Dépannage » (impose de couper des métiers comme électricité ou plomberie en deux).

## 4. Catégories utiles aux Antilles, en Guyane et à La Réunion

Le produit couvre **Guadeloupe, Martinique, Guyane, La Réunion et Saint-Martin** (`schema.sql` `allowed_territories`, `about.html`). La structure est la même partout ; ce qui change est **ce que les gens disent**. Besoins fréquents par région :

| Besoin | Antilles | Guyane | La Réunion | Où ça atterrit |
|---|:-:|:-:|:-:|---|
| Cyclone / saison cyclonique (toiture, volets, tôle, bâchage) | ✅ | — | ✅ | Toiture, Vitrerie & stores, Maçonnerie |
| Moustiques / dengue (démoustication, moustiquaires) | ✅ | ✅ | ✅ | Nuisibles & hygiène, Vitrerie & stores |
| Sargasses | ✅ | — | — | Nettoyage extérieur |
| Eau (citerne, tour d'eau) | ✅ | ✅ | ✅ | Plomberie |
| Climatisation, solaire, groupe électrogène | ✅ | ✅ | ✅ | Climatisation, Énergie solaire, Électricité |
| Bateau, yole, pêche, pirogue | ✅ yole | ✅ pirogue, fleuve | ✅ pêche au gros | Mécanique marine, Activités nautiques, Fret |
| Abri bois (carbet, ajoupa, varangue) | ✅ | ✅ carbet | ✅ varangue | Menuiserie bois, Aménagement extérieur |
| Cuisine locale (bokit, colombo / maripa, couac / cari, rougail, samoussa) | ✅ | ✅ | ✅ | Traiteur ↔ Cuisine à domicile (D3) |
| Danse et musique locales (gwoka, bèlè / maloya, séga) | ✅ | — | ✅ | Danse, Cours de musique, Musique & spectacle |
| Langues (créoles, néerlandais / hmong, bushinenge, portugais / —) | ✅ | ✅ | — | Langues, Traduction & interprétation |
| Agriculture vivrière (abattis, jardin créole, litchis, vacoa) | ✅ | ✅ abattis | ✅ | Potager & vivrier, Agricole, Artisanat |
| Activités de plein air (volcan, canyoning, parapente) | — | — | ✅ | Randonnée & aventure (activités encadrées) |

### Particularités de vocabulaire (à faire relire par des locuteurs)

| Terme | Sens | Région | Rattachement |
|---|---|---|---|
| ravets | cafards | Antilles | Nuisibles › Insectes |
| sargasses | algues échouées | Antilles | Nettoyage extérieur |
| bâcher | poser une bâche (toit) | Antilles | Toiture |
| tour d'eau | réservoir d'eau | Antilles | Plomberie |
| yole ronde | voilier traditionnel | Martinique | Activités nautiques |
| gwoka · bèlè | musique / danse traditionnelle (tambour) | Guadeloupe · Martinique | Danse / Cours de musique |
| bokit · colombo | sandwich frit · plat de poulet | Antilles | Traiteur / Cuisine à domicile |
| abattis | parcelle défrichée | Guyane (aussi Antilles) | Agricole |
| carbet | grand abri en bois ouvert | Guyane · Antilles | Aménagement extérieur / Menuiserie |
| pirogue · piroguier | bateau fluvial · son conducteur | Guyane | Mécanique marine ; piroguier = transport de personnes → **D5** |
| maripa · couac · cassave · awara | palme, farine et galette de manioc, bouillon de fête | Guyane | Cuisine / Traiteur |
| hmong · nenge · bushinenge | langues et communautés | Guyane | Langues, Traduction |
| varangue · lambrequins | véranda, dentelle de bois | La Réunion | Menuiserie bois |
| case créole | maison traditionnelle | La Réunion | Peinture, Toiture |
| cari · rougail · samoussa · bonbon piment | plats courants | La Réunion | Traiteur / Cuisine à domicile |
| maloya · séga | musique et danse traditionnelles | La Réunion | Danse, Musique |
| vacoa | vannerie | La Réunion | Artisanat |
| tangue | petit mammifère nuisible | La Réunion | Nuisibles › Animaux |
| gramoun | grand-mère / personne âgée | La Réunion | Aide aux personnes âgées |
| moringue | art martial traditionnel | La Réunion | Arts martiaux |

### Lot de vocabulaire territorial ajouté (colonne `territories`)

136 termes sont déjà **marqués par région** (`antilles`, `guyane`, `reunion` ; vide = partout) ; les 194 autres termes locaux (lot initial) restent valables partout et seront marqués lors de la relecture. **Statut : rédigé sans locuteur natif, à valider avant publication.**

#### Antilles (Guadeloupe, Martinique, Saint-Martin)

| Métier ou spécialité visé | Termes locaux ajoutés (lot « à valider ») |
|---|---|
| Cafards, fourmis, moustiques & guêpes `nuisibles_hygiene_insectes` | demoustication, dengue, chikungunya, zika, moustique tigre, gites larvaires, moustiques |
| Voile, kayak, paddle & glisse `activites_nautiques_voile_glisse` | yole, yole ronde, course de yoles, gommier |
| Abris, pergolas & carports `amenagement_exterieur_abri_pergola` | ajoupa, carbet, case a outils |
| Pêche de loisir & sorties en mer `activites_nautiques_peche_loisir` | sortie en mer avec un pecheur, peche au gros, marin pecheur |
| Autres langues (portugais, allemand, chinois…) `langues_autres_langues` | neerlandais, papiamento, anglais de saint martin |

#### Guyane

| Métier ou spécialité visé | Termes locaux ajoutés (lot « à valider ») |
|---|---|
| Bateau, hors-bord & entretien nautique `bateau_mecanique_marine` | pirogue, moteur de pirogue, reparation pirogue, coque de pirogue, moteur de pirogue en panne, pirogue moteur en panne |
| Fret, envois inter-îles & métropole `colis_livraison_fret_inter_iles` | transport fluvial, fret fluvial, marchandises par pirogue, fret sur le fleuve, livraison en commune isolee |
| Abris, pergolas & carports `amenagement_exterieur_abri_pergola` | carbet, construire un carbet, carbet en bois, abri en bois en foret |
| Terrasses bois, pergolas & carports `menuiserie_bois_terrasse_pergola` | carbet, construire un carbet, carbet en bois |
| Plats créoles & spécialités locales `traiteur_evenement_plats_creoles_evenement` | maripa, couac, cassave, bouillon d awara, awara, poisson boucane, cuisine guyanaise, pimentade |
| Cuisinier ou chef à domicile `cuisine_domicile_chef_domicile` | cuisine guyanaise, couac, cassave, maripa |
| Autres langues (portugais, allemand, chinois…) `langues_autres_langues` | hmong, nenge, bushinenge, sranan tongo, taki taki, portugais bresilien, creole haitien, cours de hmong, cours de portugais |
| Traduction & interprétariat `traduction_interpretation` | interprete bushinenge, interprete hmong, interprete creole haitien |
| Récolte & entretien de parcelle `agricole_recolte_entretien` | abattis, abattis a defricher, defricher un abattis, jardin creole |
| Débroussaillage de terrain `debroussaillage_terrain` | debroussaillage en foret, ouvrir un layon, layon |

#### La Réunion

| Métier ou spécialité visé | Termes locaux ajoutés (lot « à valider ») |
|---|---|
| Terrasses bois, pergolas & carports `menuiserie_bois_terrasse_pergola` | varangue, refaire la varangue, varangue a refaire, lambrequins, lambrequin, bardeaux |
| Peinture & revêtements muraux `peinture` | case creole, peindre ma case, peinture de case, case en tole |
| Toiture, charpente & étanchéité `toiture_etancheite` | tole de la case, case en tole, toit de case |
| Plats créoles & spécialités locales `traiteur_evenement_plats_creoles_evenement` | cari, cari poulet, rougail, rougail saucisse, samoussa, samoussas, bonbon piment, bonbons piment, achards, … |
| Cuisinier ou chef à domicile `cuisine_domicile_chef_domicile` | cari, rougail, samoussa, bonbon piment, achards, civet |
| Danses traditionnelles & folklore `danse_danses_traditionnelles` | maloya, sega, seggae, cours de maloya, cours de sega |
| Musiques & spectacles traditionnels, carnaval `musique_spectacle_traditions_carnaval` | maloya, sega, seggae, kayamb |
| Vannerie, madras & textiles traditionnels `artisanat_creation_vannerie_textiles_locaux` | vacoa, tressage vacoa, tressage de vacoa, chapeau en vacoa, panier en vacoa |
| Canyoning & activités d'aventure `randonnee_nature_canyoning_aventure` | parapente, vol libre, via ferrata, randonnee au volcan, mafate, salazie, cilaos |
| Serpents, animaux sauvages & nids `nuisibles_hygiene_serpents_animaux` | tangue, tangue dans le jardin, rats des cannes |
| Compagnie & présence `aide_personnes_agees_compagnie_presence` | gramoun, gramoune, ma gramoun, mon gramoun, aide pour ma gramoun |
| Verger & arbres fruitiers `potager_vivrier_verger_fruitiers` | litchi, litchis, letchi, bibasse, goyavier, cueillette de litchis, vanille |
| Pêche de loisir & sorties en mer `activites_nautiques_peche_loisir` | peche au gros, pecher au gros, peche a la ligne, peche en mer |
| Capoeira & arts martiaux traditionnels `arts_martiaux_capoeira_traditions` | moringue, moringue reunionnais |

**Couverture mesurée** (voir §8) — avant enrichissement, sur 56 requêtes locales : Antilles 70 %, **Guyane 50 %, Réunion 30 %** de classements stricts corrects. Après le lot : voir le tableau du §8.

**Hors périmètre** : Mayotte et la métropole ne figurent pas dans le produit ; la colonne `territories` accepte de nouvelles valeurs par simple relecture de la contrainte.

## 5. Les 13 décisions du document 09

Niveau de risque = risque **si on se trompe**, après mise en œuvre de la recommandation.

| # | Décision | Recommandation | Conséquences | Risque |
|---|---|---|---|:-:|
| **D1** | 8 familles ou 9 domaines | **8 familles**, Maison sur **2 tuiles** (+ Autres en 10ᵉ) | un seul vocabulaire pour filtres, carte, compteurs ; la scission reste mécanique (le sous-domaine existe déjà) | 🟢 faible |
| **D2** | Sport rattaché à Beauté | **Garder** dans « Beauté, bien-être et sport » | 5 métiers sport/nautique y restent ; tuile intitulée « Beauté & bien-être » : le sport s'y trouve par la recherche et par l'explorateur | 🟡 moyen (découvrabilité) |
| **D3** | Traiteur ↔ cuisine à domicile | **2 métiers + question** (« Pour un événement ou chez vous ? ») | 13 termes partagés ; une question sur les plats créoles, jamais de choix arbitraire | 🟡 moyen |
| **D4** | Activités réglementées | **Non sélectionnables** + guide | 3 nœuds (conduite, soins, traduction assermentée) ; aucune offre de ce type sur la plateforme | 🔴 élevé (juridique) → relecture juridique |
| **D5** | Transport de personnes | **Partage de frais uniquement** | « Transfert aéroport » rattaché au covoiturage avec rappel ; piroguier fluvial : même règle | 🔴 élevé (juridique) |
| **D6** | Courses pour autrui | **Famille** (secondaire Transport) | 1 métier ; compté une fois | 🟢 faible |
| **D7** | Recherches sans résultat | Compteur **agrégé**, texte normalisé tronqué, **aucun identifiant** | table de télémétrie ; mention de confidentialité ; sert à enrichir les synonymes | 🟡 moyen (vie privée) |
| **D8** | Administration de la taxonomie | Permission **`taxonomy.manage`** (à créer) + formulaire modéré « Je ne trouve pas mon métier » | touche le RBAC admin : migration dédiée, jamais attribuée par défaut ; sinon tout passe par migration SQL | 🟠 moyen-élevé (droits) |
| **D9** | Ancienne table `lyann_taxonomy` | **Lecture seule, jamais supprimée** | anciens clients intacts ; purge éventuelle bien plus tard | 🟢 faible |
| **D10** | `classification_status` | **Dérivé** du code renseigné et de sa provenance | statut cohérent sans double saisie ; 80/80 « non classé » aujourd'hui | 🟢 faible |
| **D11** | Recensement Production | **Autoriser en lecture seule**, agrégats uniquement | sans lui, la demande réelle et la précision restent inconnues ; aucune donnée personnelle | 🟡 moyen (accès Production) |
| **D12** | Langues | **Attribut** de l'offre, pas un nœud par langue | « Traduction » : 1 nœud ; moins de termes ; filtre langue séparé | 🟢 faible |
| **D13** | Périmètre territorial (**révisée**) | **Structure unique** pour les 5 territoires + **vocabulaire par région** (`territories`), relu par des locuteurs | la version précédente (« Antilles d'abord ») ne correspond pas au périmètre produit ; lot Guyane/Réunion livré ; aucun changement de structure | 🟡 moyen (qualité locale) |

## 6. Ambiguïtés, doublons et spécialités difficiles à trouver

### 6.1 Paires de métiers qui se disputent la même demande

200 termes normalisés sont partagés entre plusieurs métiers (liste complète : `generated/shared-terms.csv`). Les paires les plus chargées :

| Paire de métiers | Termes communs | Exemples | Ambiguïté pour l'utilisateur | Recommandation |
|---|---:|---|---|---|
| Cuisine à domicile & plats préparés ↔ Traiteur & réception | 13 | accra, achard, bokit, bonbon piment | Cuisine chez soi ou plats livrés pour un événement ? | Conserver 2 métiers + question (D3) |
| Danse ↔ Musiciens, chanteurs & spectacle | 10 | bele, biguine, danseur, danseuse | Cours de danse ou prestation musicale (zouk, gwoka, maloya) ? | Conserver ; la question tranche (cours / spectacle) |
| Terrasses, abris & allées ↔ Menuiserie & agencement bois | 7 | ajoupa, carbet, carbet en bois, carport | Pergola, carbet, terrasse : bois ou aménagement ? | Conserver ; spécialités fléchées vers le même parcours |
| Cours de musique & chant ↔ Musiciens, chanteurs & spectacle | 6 | bele, chant, chorale, gwoka | Apprendre un instrument ou faire jouer un groupe ? | Conserver ; question « cours ou prestation » |
| Aide aux démarches administratives ↔ Rangement & organisation d'intérieur | 5 | archivage, classer mes papier, classeur, dossier | Papiers administratifs ou rangement ? | Conserver ; termes « classer mes papiers » à rattacher à un seul |
| Seniors : présence & accompagnement ↔ Coups de main & aide du quotidien | 4 | accompagnement, accompagner, marche, presence | Aide à une personne âgée ou aide ponctuelle ? | Conserver ; l'aide à la toilette reste non sélectionnable |
| DJ, sonorisation & éclairage ↔ TV, antenne & audio | 4 | ampli, enceinte, projecteur, sono | Sono de fête ou installation TV/audio ? | Conserver |
| Dépannage & remorquage de véhicule ↔ Mécanique automobile | 4 | batterie, batterie a plat, demarrage, ma voiture ne demarre pas | Dépannage sur place ou réparation en atelier ? | Conserver ; question « sur place / atelier » |
| Entretien de jardin ↔ Paysagisme & plantations | 4 | bougainvillier, gazon, hibiscu, massif | Entretien régulier ou création/aménagement ? | Conserver |
| Peinture, dessin & arts plastiques ↔ Graphisme & design | 3 | bande dessinee, illustration, mascotte | Deux usages proches | Conserver, relire les termes partagés |
| Cours de musique & chant ↔ Danse | 3 | bele, cour de gwoka, gwoka | Deux usages proches | Conserver, relire les termes partagés |
| CV, lettres & rédaction ↔ Formation, coaching & conseil pro | 3 | bilan de competence, orientation, reconversion | Deux usages proches | Conserver, relire les termes partagés |

**Règle commune** : un terme partagé pèse moins, et s'il reste ambigu l'utilisateur voit **une question** au lieu d'un classement arbitraire. Aucune fusion n'est recommandée : ce sont des usages différents.

### 6.2 Doublons possibles (libellés proches dans des métiers différents)

| Spécialité A | Spécialité B | Verdict |
|---|---|---|
| Éclairage & prises extérieurs (Électricité) | Éclairage & prises connectés (Domotique & objets connectés) | Familles différentes : usages distincts (installer / nettoyer / animer) ; conserver |
| Fissures & petites réparations (Maçonnerie & gros œuvre) | Petites réparations & ajustements (Bricolage & petits travaux) | Même famille : conserver, afficher le métier parent pour lever le doute |
| Cuisines & salles de bain équipées (Menuiserie & agencement bois) | Pose d'accessoires (salle de bain, cuisine) (Bricolage & petits travaux) | Même famille : conserver, afficher le métier parent pour lever le doute |
| Cuisines & salles de bain équipées (Menuiserie & agencement bois) | Cuisine, salle de bain & sanitaires (Ménage à domicile) | Familles différentes : usages distincts (installer / nettoyer / animer) ; conserver |
| Pose d'accessoires (salle de bain, cuisine) (Bricolage & petits travaux) | Cuisine, salle de bain & sanitaires (Ménage à domicile) | Familles différentes : usages distincts (installer / nettoyer / animer) ; conserver |
| Barbecue & cuisine d'été (Terrasses, abris & allées) | Barbecue, grillades & cuisine de plein air (Traiteur & réception) | Familles différentes : usages distincts (installer / nettoyer / animer) ; conserver |
| Coiffure de mariage & événement (Coiffure) | Chorégraphie de mariage & événement (Danse) | Même famille : conserver, afficher le métier parent pour lever le doute |
| Mariage, baptême & cérémonies (Organisation d'événements) | Animation de mariage & cérémonie (Animation enfants & adultes) | Même famille : conserver, afficher le métier parent pour lever le doute |
| Cours & ateliers de cuisine (Cuisine à domicile & plats préparés) | Cours & ateliers de couture (Couture, retouches & confection) | Même famille : conserver, afficher le métier parent pour lever le doute |

Aucun vrai doublon : les libellés proches désignent des gestes différents (installer, nettoyer, animer). Le métier parent affiché à côté de la spécialité lève le doute.

### 6.3 Ce qui sera difficile à trouver

| Situation | Pourquoi | Parade | Gravité |
|---|---|---|:-:|
| Mots rares ou techniques (« VMC », « reflexologie », « qi gong », « ferronnerie », « SEO ») | l'utilisateur décrit le symptôme, pas le métier | termes « problème » (« air humide dans la salle de bain ») | Moyen |
| Vocabulaire local hors Antilles (varangue, carbet, maloya, piroguier) | lot initial centré sur les Antilles ; lot territorial récent, jamais relu | relecture par des locuteurs ; « piroguier » tranché par D5 | Élevé |
| Services « à cheval » (aide aux courses, accompagnement, petits services) | trois familles se disputent la demande | D6 + question de précision | Moyen |
| Termes uniques ambigus (« batterie », « nettoyage », « aide », « transport », « auto », « port », « menu ») | un mot, plusieurs métiers | registre d'ambiguïtés (33 entrées) : une question, jamais un choix arbitraire | Faible (maîtrisé) |
| Activités réglementées (leçons de conduite, aide à la toilette, traduction assermentée) | non sélectionnables par conception | guide + message clair ; jamais « introuvable » | Faible (voulu) |
| Demandes en phrase longue ou familière (« faire à manger pour quarante personnes ») | aucun terme exact | proposition « Je pense que c'est… » avec choix, jamais de classement forcé | Moyen |

Spécialités dont le vocabulaire est le plus court (à enrichir avant la bascule) :

| Spécialité | Termes | Pourquoi elle est difficile à trouver | Action |
|---|---:|---|---|
| Recharge de gaz & fluide `climatisation_recharge_fluide` | 6 | vocabulaire court : peu de façons de la nommer | ajouter 3 à 5 formulations « problème » avant la bascule |
| Lave-vaisselle `electromenager_lave_vaisselle` | 4 | vocabulaire court : peu de façons de la nommer | ajouter 3 à 5 formulations « problème » avant la bascule |
| Moustiquaires `vitrerie_stores_moustiquaire` | 6 | vocabulaire court : peu de façons de la nommer | ajouter 3 à 5 formulations « problème » avant la bascule |
| Détecteurs de fumée & sécurité incendie `securite_automatismes_detecteurs` | 6 | vocabulaire court : peu de façons de la nommer | ajouter 3 à 5 formulations « problème » avant la bascule |
| Chauffe-eau solaire `energie_solaire_chauffe_eau_solaire` | 7 | vocabulaire court : peu de façons de la nommer | ajouter 3 à 5 formulations « problème » avant la bascule |
| Borne de recharge véhicule électrique `energie_solaire_borne_recharge` | 6 | vocabulaire court : peu de façons de la nommer | ajouter 3 à 5 formulations « problème » avant la bascule |
| Rénovation de cuisine `renovation_cuisine` | 7 | vocabulaire court : peu de façons de la nommer | ajouter 3 à 5 formulations « problème » avant la bascule |
| Spa & jacuzzi `piscine_bassin_spa_jacuzzi` | 7 | vocabulaire court : peu de façons de la nommer | ajouter 3 à 5 formulations « problème » avant la bascule |
| Maquillage de mariée `maquillage_mariee` | 7 | vocabulaire court : peu de façons de la nommer | ajouter 3 à 5 formulations « problème » avant la bascule |
| Réflexologie `massage_bien_etre_reflexologie` | 7 | vocabulaire court : peu de façons de la nommer | ajouter 3 à 5 formulations « problème » avant la bascule |
| Massage bébé & femme enceinte (bien-être) `massage_bien_etre_massage_bebe_femme_enceinte` | 7 | vocabulaire court : peu de façons de la nommer | ajouter 3 à 5 formulations « problème » avant la bascule |
| Toilettage à domicile `toilettage_animaux_domicile_mobile` | 7 | vocabulaire court : peu de façons de la nommer | ajouter 3 à 5 formulations « problème » avant la bascule |
| Service direct (demande ciblée à un membre) `autre_demande_service_direct` | 7 | vocabulaire court : peu de façons de la nommer | ajouter 3 à 5 formulations « problème » avant la bascule |

### 6.4 Incohérences documentaires corrigées pendant la revue

- Références à une « D14 » inexistante (R14, ambiguïté n° 2) : remplacées par l'action **A1** du §10 (ne présélectionner aucune catégorie dans l'assistant).
- Numérotation « 2.4 bis » du doc. 07 → renumérotée en 2.5, 2.6, 2.7.
- D13 (« Antilles d'abord ») contredisait le périmètre à 5 territoires → révisée (§5).
- Compteurs de termes mis à jour (7 007 termes : label 528, syn 4 976, problem 1 173, local 330) ; registre d'ambiguïtés : 33 entrées (+ « auto », « port », « menu »).
- Défaut de données corrigé : le terme « cours » seul, rattaché à « Cours de cuisine », classait « cours de maloya » et « nettoyer la cour » comme de la cuisine.

## 7. Stratégie UX : choisir un métier en quelques interactions

**Principe** : on ne montre jamais plus que ce qu'un écran de téléphone contient ; les 414 spécialités n'apparaissent **que pour le métier choisi** et sont **facultatives**.

| Chemin | Interactions | Ce qui est affiché |
|---|---:|---|
| **Découvrir → tuile → métier** | 2 (3 avec une spécialité) | 10 tuiles → sous-domaines repliés (≤ 5) → métiers du sous-domaine (≤ 10) |
| **Recherche libre** (« fuite sous mon évier ») | 2 : saisir, toucher le résultat | métier + spécialité proposés ; 1 question si ambigu |
| **Assistant d'annonce** | 3 : décrire, confirmer la proposition, publier | proposition modifiable ; aucune catégorie présélectionnée |
| **Profil Lyanneur (compétences)** | 2 par compétence | recherche + familles ; « Je ne trouve pas mon métier » |
| **Filtre Annonces / Lyanneurs** | 1 | rail de **6 familles max + « Plus »** ; métier dans la feuille « Affiner » |

Budget d'affichage (calculé sur les données) :

| Niveau | Éléments visibles simultanément | Maximum réel |
|---|---:|---|
| Tuiles Découvrir | 10 | 10 |
| Sous-domaines d'une famille | ≤ 5 | 5 (repliés) |
| Métiers par sous-domaine | ≤ 10 | 10 (Maison & travaux › Rénovation & construction) |
| Spécialités d'un métier | ≤ 7 | 7 (Plomberie) ; moyenne 3.9 |
| Rail de familles | 6 + « Plus » | 6 |
| Questions de précision | 1 à la fois | 2 choix maximum |

Règles : (1) **toucher un métier suffit** ; (2) la recherche est toujours à un geste, avec résultats **au fil de la frappe** et sans tolérance aux fautes dégradante ; (3) un résultat réglementé affiche un **guide**, jamais « introuvable » ; (4) « Autres » → « Décrire mon besoin » ; (5) mêmes familles, icônes et compteurs sur Liste et Carte (état partagé). Détails d'écran : doc. 06 — **aucune implémentation avant validation**, et un **test d'utilisabilité** (§8) avant la bascule de lecture.

## 8. Tests pour démontrer la pertinence de la recherche et du classement

### 8.1 Mesures actuelles (prototype local, reproductibles : `node scripts/taxonomy-v2/evaluate.js`)

| Jeu | n | Strict | Top-3 | Sûr | Erreurs silencieuses | Non résolu |
|---|---:|---:|---:|---:|---:|---:|
| général (hors échantillon) | 39 | 95 % | 100 % | 100 % | 0 | 0 % |
| territorial (réglé) | 57 | 82 % | 98 % | 96 % | 0 | 2 % |
| territorial (hors échantillon) | 26 | 77 % | 96 % | 92 % | 0 | 8 % |

Par région (jeux territoriaux) :

| Jeu | n | Strict | Top-3 | Sûr | Erreurs silencieuses | Non résolu |
|---|---:|---:|---:|---:|---:|---:|
| territorial (réglé) · antilles | 20 | 75 % | 100 % | 100 % | 0 | 0 % |
| territorial (réglé) · guyane | 15 | 87 % | 100 % | 93 % | 0 | 7 % |
| territorial (réglé) · reunion | 20 | 85 % | 95 % | 95 % | 0 | 0 % |
| territorial (hors échantillon) · antilles | 8 | 88 % | 100 % | 100 % | 0 | 0 % |
| territorial (hors échantillon) · guyane | 8 | 63 % | 88 % | 88 % | 0 | 13 % |
| territorial (hors échantillon) · reunion | 10 | 80 % | 100 % | 90 % | 0 | 10 % |

*Strict* = bon métier, classé sans question ; *Sûr* = strict, ou question qui contient le bon métier ; *Erreur silencieuse* = mauvais métier, classé sans question (**objectif : 0**). Les jeux « réglés » ont servi à enrichir le vocabulaire ; seuls les jeux « hors échantillon » mesurent la généralisation — et ils sont **rédigés par l'auteur du vocabulaire** : ces chiffres sont un plancher de qualité, **pas une précision réelle**.
Honnêteté sur le jeu territorial hors échantillon : à sa première exécution, il donnait 69 % strict, 85 % sûr et **2 erreurs silencieuses** (« professeur de créole » → soutien scolaire ; « tailler mes bougainvilliers » → paysagisme). Ces deux défauts ont été corrigés (vocabulaire), ce qui le rend de ce fait un peu moins « hors échantillon ».

### 8.2 Protocole d'évaluation avant bascule (échantillon représentatif)

| Étape | Contenu | Outil |
|---|---|---|
| **Échantillon** | titres et descriptions réels (recensement Production D11, agrégats), **stratifiés** : ≥ 30 par famille, ≥ 50 par territoire, + 50 formulations « problème » collectées auprès de 10 testeurs par région | `sql/readonly-census.sql`, `census-coverage.js` |
| **Étiquetage** | 2 relecteurs indépendants par ligne, arbitrage des désaccords ; **accord ≥ 0,7 (kappa)** sinon la catégorie est ambiguë et va dans la file de décision | tableur |
| **Mesure** | top-1, top-3, taux de question, taux d'erreur silencieuse, non résolu — **par famille et par territoire** | `evaluate.js --cases export.json` |
| **Recherche** | rappel « leave-one-out » : retirer un synonyme et vérifier que le métier reste atteignable ; requêtes sans résultat classées par fréquence | `evaluate.js`, télémétrie D7 |
| **Utilisabilité** | tâche « trouver le métier de votre besoin » : **≥ 90 % de réussite en ≤ 4 interactions et ≤ 20 s**, 8 personnes par territoire, dont des personnes peu à l'aise avec le numérique | test modéré |
| **Régression** | tests de structure, couverture de l'existant, rejeu SQL, jeux de classification, en CI | `tests/taxonomy-v2-proposal.test.js` |

Seuils de passage (bascule de lecture, étape 5) :

| Indicateur | Seuil |
|---|---|
| Erreurs silencieuses | **≤ 2 %** ; **0** sur les nœuds ⚠️ 🔒 ⛔ |
| Top-1 strict (titres réels) | ≥ 80 % |
| Top-3 | ≥ 95 % |
| « Sûr » (strict + question utile) | ≥ 92 % |
| Non résolu | ≤ 8 % ; chaque non résolu mène à « Décrire mon besoin », jamais à une impasse |
| Questions de précision | ≤ 20 % des recherches |
| Écart entre territoires | ≤ 10 points sur « sûr » |
| Plancher par famille | « sûr » ≥ 85 % |

Confidentialité : les échantillons ne contiennent ni nom, ni identifiant, ni coordonnées ; textes tronqués, agrégats seulement.

## 9. Structure finale proposée

Codes permanents (indépendants des libellés). 8 familles + Autres · 105 métiers · 414 spécialités · 7 007 termes.

**Maison, travaux et dépannage** (`maison`)
- *Dépannage & installations* : Plomberie · Électricité · Climatisation & froid · Serrurerie · Électroménager · Vitrerie, volets & stores
- *Rénovation & construction* : Peinture & revêtements muraux · Maçonnerie & gros œuvre · Carrelage & sols · Menuiserie & agencement bois · Plâtrerie, cloisons & isolation · Toiture, charpente & étanchéité · Ferronnerie, soudure & métallerie · Clôtures & portails · Termites, humidité & traitement du bâti · Rénovation tous corps d'état
- *Petits travaux & bricolage* : Bricolage & petits travaux · Prêt & location d'outillage
- *Énergie, sécurité & équipements* : Alarme, portail & sécurité · Solaire, énergie & recharge

**Jardin et extérieur** (`jardin`)
- *Entretien du jardin* : Entretien de jardin · Débroussaillage & nettoyage de terrain
- *Arbres & végétation* : Élagage & abattage
- *Création & plantations* : Paysagisme & plantations · Arrosage & irrigation
- *Extérieurs, bassins & piscine* : Piscine & bassin · Nettoyage extérieur & haute pression · Terrasses, abris & allées
- *Potager, vivrier & agriculture* : Potager & jardin vivrier · Aide agricole & petit élevage

**Ménage et entretien** (`entretien`)
- *Ménage à domicile* : Ménage à domicile
- *Linge & repassage* : Linge & repassage
- *Nettoyages spécialisés* : Nettoyages spécialisés
- *Locaux, conciergerie & gardiennage* : Nettoyage de locaux & parties communes · Conciergerie & location saisonnière · Gardiennage & surveillance de logement
- *Hygiène & organisation* : Insectes, rongeurs & hygiène · Rangement & organisation d'intérieur

**Beauté, bien-être et sport** (`beaute`)
- *Coiffure & cheveux* : Coiffure · Tresses, locks & cheveux texturés
- *Esthétique & maquillage* : Esthétique & soins du corps · Ongles & manucure · Maquillage
- *Massage & bien-être* : Massage & relaxation · Yoga, pilates & gym douce
- *Sport & mouvement* : Coaching sportif & remise en forme · Danse · Tennis, foot, basket & sports de balle · Natation & activités aquatiques · Arts martiaux & self-défense
- *Nature & activités nautiques* : Activités nautiques & pêche de loisir · Randonnée & balades guidées

**Transport, véhicules et logistique** (`transport`)
- *Déplacements de personnes* : Covoiturage & trajets
- *Colis, fret & livraison* : Colis & livraison
- *Déménagement & manutention* : Déménagement · Transport d'objets & utilitaire · Manutention, débarras & encombrants
- *Véhicules & mécanique* : Mécanique automobile · Scooter, moto & vélo · Carrosserie & peinture auto · Pneus & roues · Lavage & rénovation de véhicules · Dépannage & remorquage de véhicule
- *Bateau & mécanique marine* : Bateau, hors-bord & entretien nautique

**Famille, éducation et assistance** (`famille`)
- *Enfants & garde* : Garde d'enfants & babysitting
- *Soutien scolaire, langues & cours* : Soutien scolaire · Cours de langues · Cours de musique & chant · Code de la route & permis
- *Seniors & aide à la personne* : Seniors : présence & accompagnement
- *Aide du quotidien* : Coups de main & aide du quotidien · Courses & commissions
- *Animaux de compagnie* : Garde & promenade d'animaux · Toilettage d'animaux · Éducation canine & comportement

**Événementiel, cuisine et création** (`evenement`)
- *Organisation, animation & location* : Organisation d'événements · Animation enfants & adultes · DJ, sonorisation & éclairage · Décoration & fleurs d'événement · Location de matériel & mobilier de fête
- *Cuisine, traiteur & pâtisserie* : Traiteur & réception · Cuisine à domicile & plats préparés · Pâtisserie, boulangerie & desserts
- *Photo & vidéo* : Photographie · Vidéo, tournage & montage
- *Artisanat, couture & arts* : Artisanat & objets créés · Peinture, dessin & arts plastiques · Couture, retouches & confection · Stylisme & conseil en image
- *Musique & spectacle* : Musiciens, chanteurs & spectacle

**Numérique, administratif et services professionnels** (`numerique`)
- *Dépannage & équipements* : Ordinateurs, Wi-Fi & réseau · Smartphone & tablette · TV, antenne & audio · Domotique & objets connectés
- *Création & communication* : Sites web & boutiques en ligne · Réseaux sociaux & communication · Graphisme & design
- *Initiation & formation* : Initiation & formation au numérique
- *Démarches & papiers* : Aide aux démarches administratives · CV, lettres & rédaction · Traduction & interprétariat
- *Services aux professionnels* : Secrétariat & assistance · Comptabilité & gestion simple · Formation, coaching & conseil pro

**Autres** (`autres`) : Autre besoin (demande libre) — jamais proposé comme compétence.

## 10. Après validation : intégration sans aller-retour

| Étape | Contenu | Porte de sortie |
|---|---|---|
| **A1** | Assistant d'annonce : ne présélectionner **aucune catégorie** (aujourd'hui « Jardinage » par défaut : 48/80 demandes Staging) | statistiques par catégorie fiables |
| **0** | Décisions §0 ; recensement Production en lecture seule (D11) ; relecture juridique D4/D5 ; relecture du lot territorial | feu vert humain |
| **1** | Répétition à blanc sur Staging (`BEGIN … ROLLBACK`), puis application Staging | 0 violation V01–V12 |
| **2–3** | Lecture seule derrière un drapeau, puis double écriture | 100 % des nouvelles lignes avec code |
| **4** | Backfill par lots avec provenance, file « à classer » | ≥ 90 % rattachées |
| **5** | Bascule de lecture (Découvrir, Lyanneurs, Annonces, carte) après les seuils du §8 | seuils §8.2 atteints |
| **6** | Version minimale d'app ; `lyann_taxonomy` en lecture seule, jamais supprimée | trafic ancien < 2 % |

## 11. Limites

- Aucune lecture Production : volumes et répartition réelle inconnus.
- Vocabulaire et jeux de test rédigés par l'auteur ; **aucun locuteur natif** n'a relu le lot Guyane/Réunion.
- Rejeu SQL dans PGlite (fonctions `auth.uid()` et `has_admin_permission` simulées), pas sur le Postgres de Staging.
- Aucun test utilisateur ; la stratégie UX est une proposition.
