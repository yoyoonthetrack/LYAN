# 04 — Synonymes, problèmes formulés et vocabulaire local

> Document généré. L'inventaire **complet** (tous les termes, tous les nœuds) est dans `generated/terms.csv`. Ce document en donne la structure et un extrait par métier.

## Trois types de termes

| Type | Rôle | Exemple |
|---|---|---|
| `label` | libellé affiché | « Plomberie » |
| `syn` | synonyme / nom de métier / objet | « plombier », « robinet » |
| `problem` | problème dit en langage naturel | « plus d'eau chaude », « ça coule sous l'évier » |
| `local` | vocabulaire local ou créole | « ravets », « bokit », « gwoka » |

Volumes : `label` 528 · `syn` 4969 · `problem` 1171 · `local` 196 (total 6864).

## Normalisation

Minuscules, accents retirés, apostrophes et ponctuation → espace. Côté **base**, la normalisation est celle de `lyann_taxonomy_norm()` (unaccent + minuscules, **sans** racinisation) ; la racinisation légère des pluriels n'existe que dans le prototype d'évaluation (`scripts/taxonomy-v2/lib.js`).

## Termes ambigus assumés (question de précision)

Un terme ambigu ne classe jamais seul : il déclenche une question courte. Registre actuel :

| Terme | Pourquoi | Question posée |
|---|---|---|
| depannage | Dépannage désigne autant la plomberie, l'électricité, les véhicules que l'informatique. | Quel type de dépannage ? |
| panne | Panne : électricité, véhicule, appareil, ordinateur. | Panne de quoi ? |
| fuite | Fuite d'eau (plomberie) ou de toit (toiture) ou de piscine. | Où est la fuite ? |
| reparation | Réparation sans objet précis. | Que faut-il réparer ? |
| montage | Montage de meuble, de vidéo ou d'abri. | Montage de quoi ? |
| installation | Installation sans objet précis. | Installer quoi ? |
| entretien | Entretien du jardin, de la maison, d'un véhicule ou d'une piscine. | Entretien de quoi ? |
| nettoyage | Nettoyage du logement, de l'extérieur, d'un véhicule. | Nettoyer quoi ? |
| courses | Courses pour autrui (aide du quotidien) ou livraison. | Faire vos courses ou livrer un colis ? |
| transport | Transport de personnes ou d'objets. | Transporter qui ou quoi ? |
| organisation | Organisation d'événement, de papiers ou d'intérieur. | Organiser quoi ? |
| cours | Cours scolaires, de langue, de musique, de danse ou de cuisine. | Cours de quoi ? |
| aide | Terme générique. | Quelle aide ? |
| photo | Photographie ou photo produit / retouche. | Photo de quoi ? |
| photos | Photographie ou photos pour un site. | Quel type de photos ? |
| batterie | Batterie de véhicule ou batterie (instrument). | Batterie de voiture ou instrument de musique ? |
| portable | Téléphone portable ou ordinateur portable. | Téléphone ou ordinateur ? |
| portail | Portail : clôture (gros œuvre) ou automatisme. | Pose du portail ou motorisation ? |
| toilette | Toilettes (plomberie) ou aide à la toilette (soin, réglementé). | Sanitaires ou aide à la personne ? |
| marche | Marché (courses), marche (promenade) ou marche d'escalier. | Courses, promenade ou travaux ? |
| code | Code de la route ou code informatique. | Code de la route ou programmation ? |
| poste | La Poste (démarche) ou poste informatique. | Aller à La Poste ou poste informatique ? |
| cuisine | Cuisine : repas (cuisinier) ou pièce (rénovation, plomberie). | Cuisiner des repas ou travaux dans la cuisine ? |
| bois | Bois : menuiserie, traitement du bâti, transport de matériaux. | Quel travail sur le bois ? |
| devis | Mot d'usage de la plateforme (demande de devis) : ne décrit pas un métier. | Devis pour quel service ? |
| creole | Créole : langue, cuisine créole ou bijoux créoles. | Cours de créole, cuisine créole ou bijoux ? |
| vidange | Vidange moteur ou vidange d'un appareil. | Vidange de véhicule ou d'appareil ? |
| terrasse | Terrasse : revêtement, construction ou nettoyage. | Que faire sur la terrasse ? |
| charpente | Charpente : toiture ou traitement du bois. | Réparer la toiture ou traiter le bois ? |
| decoration | Décoration d'événement, murale ou d'intérieur. | Décorer quoi ? |

## Modificateurs de contexte

Ils pondèrent l'urgence ou le lieu, ils ne classent jamais à eux seuls.

| Contexte | Termes |
|---|---|
| urgence | urgent, urgence, vite, aujourd hui, ce soir, tout de suite, des que possible |
| cyclone | apres cyclone, apres le cyclone, alerte cyclone, avant le cyclone, degat cyclone |
| saison_pluies | hivernage, saison des pluies, fortes pluies |
| sargasses | sargasses, echouage |
| lieu_domicile | chez moi, a domicile, a mon domicile |
| lieu_exterieur | dans mon jardin, devant chez moi, sur mon terrain, a la plage |

## Termes partagés entre métiers

179 termes normalisés apparaissent dans plusieurs métiers (cela inclut volontairement des termes culturels comme *zouk* ou *gwoka*, légitimement multi-cibles). Règle de classification : un terme partagé par *k* métiers est pondéré par *k^0,7* et la recherche affiche **tous** les nœuds concernés. Liste complète dans `generated/shared-terms.csv`.

## Extrait par métier (synonymes, problèmes, local)

### Maison, travaux et dépannage

- **Plomberie** (`plomberie`)
  - synonymes : plombier, plomberie, sanitaire, tuyauterie, canalisation, robinet, tuyau, toilettes bouchees, wc bouche, evacuation bouchee, siphon bouche, fuite, recherche de fuite, infiltration d eau … (+54)
  - problèmes : plus d eau chaude ; plus d eau ; pas de pression ; eau qui coule
  - local : tour d eau, reserve d eau
- **Électricité** (`electricite`)
  - synonymes : electricien, electricite, installation electrique, courant, cablage electrique, panne electrique, panne de courant, recherche de panne, diagnostic electrique, differentiel, prise electrique, interrupteur, va et vient, prise murale … (+34)
  - problèmes : plus de courant ; panne d electricite ; ca disjoncte ; court circuit
  - local : brasseur
- **Climatisation & froid** (`climatisation`)
  - synonymes : clim, climatisation, climatiseur, split, inverter, froid, ventilation, vmc, chambre froide, pose clim, installation clim, installer une clim, mono split, multi split … (+22)
  - problèmes : ca ne refroidit plus ; la clim ne souffle plus froid ; il fait trop chaud chez moi ; installer une climatisation
  - local : —
- **Serrurerie** (`serrurerie`)
  - synonymes : serrurier, serrurerie, serrure, cle, verrou, cylindre, cadenas, ouverture de porte, ouverture porte claquee, depannage serrurier, porte claquee, changement de serrure, changer la serrure, serrure 3 points … (+10)
  - problèmes : porte claquee ; cle perdue ; cle cassee dans la serrure ; porte bloquee
  - local : —
- **Électroménager** (`electromenager`)
  - synonymes : electromenager, reparation electromenager, reparateur, appareil menager, frigo, refrigerateur, congelateur, lave linge, lave vaisselle, four, plaque de cuisson, seche linge, micro ondes, machine a laver … (+18)
  - problèmes : mon appareil ne marche plus ; ca ne demarre plus ; ca ne s allume plus ; mon lave linge ne vidange plus
  - local : —
- **Vitrerie, volets & stores** (`vitrerie_stores`)
  - synonymes : vitrier, vitrerie, vitre, vitrage, store, volet, jalousie, menuiserie alu, fenetre alu, vitre cassee, double vitrage, miroir, remplacement de vitre, vitre fendue … (+18)
  - problèmes : vitre cassee ; fenetre qui ferme mal ; volet bloque ; store casse
  - local : jalousie
- **Alarme, portail & sécurité** (`securite_automatismes`)
  - synonymes : alarme, videosurveillance, camera de surveillance, interphone, visiophone, portail automatique, motorisation portail, automatisme, detecteur de fumee, telecommande portail, telecommande de portail, moteur de portail, portail ne s ouvre plus, alarme maison … (+16)
  - problèmes : mon portail ne s ouvre plus ; j ai peur des cambriolages ; sonnette qui ne marche plus ; mon portail ne s ouvre plus avec la telecommande
  - local : —
- **Solaire, énergie & recharge** (`energie_solaire`)
  - synonymes : solaire, panneau solaire, photovoltaique, chauffe eau solaire, cesi, energie renouvelable, borne de recharge, autoconsommation, capteur solaire, ballon solaire, panneaux solaires, onduleur solaire, batterie solaire, kit solaire … (+3)
  - problèmes : ma facture d electricite est trop elevee ; mon chauffe eau solaire ne chauffe plus ; chauffe eau solaire qui ne chauffe plus ; entretien chauffe eau solaire
  - local : —
- **Peinture & revêtements muraux** (`peinture`)
  - synonymes : peintre, peinture, peindre, repeindre, enduit, ratissage, ravalement, lasure, vernis, papier peint, peinture interieure, peindre une chambre, peindre un plafond, peinture murs … (+25)
  - problèmes : les murs sont abimes ; la peinture s ecaille ; moisissure sur les murs ; rafraichir une piece
  - local : —
- **Maçonnerie & gros œuvre** (`maconnerie`)
  - synonymes : macon, maconnerie, parpaing, beton, ciment, dalle, chape, muret, fondation, agglo, coulage, mur de cloture, cloture beton, poteaux beton … (+32)
  - problèmes : mur fissure ; fissure dans le mur ; mur qui s effrite ; dalle de terrasse a refaire
  - local : beton arme
- **Carrelage & sols** (`carrelage_sols`)
  - synonymes : carreleur, carrelage, carreaux, faience, sol, parquet, stratifie, pvc sol, lino, dalle de sol, revetement de sol, pose carrelage, pose de carrelage, carrelage sol … (+19)
  - problèmes : carreaux casses ; sol abime ; joints noircis ; le sol est glissant
  - local : —
- **Menuiserie & agencement bois** (`menuiserie_bois`)
  - synonymes : menuisier, menuiserie, ebeniste, bois, charpentier, agencement, travail du bois, bois sur mesure, placard, dressing, etagere sur mesure, meuble sur mesure, bibliotheque, rangement sur mesure … (+30)
  - problèmes : porte qui frotte ; meuble a reparer ; il me faut un placard sur mesure ; faire un placard sur mesure
  - local : ajoupa, kiosque
- **Plâtrerie, cloisons & isolation** (`platrerie_isolation`)
  - synonymes : platrier, platrerie, placo, placoplatre, cloison, faux plafond, isolation, plaque de platre, ba13, cloison seche, doublage, separation de piece, plafond suspendu, dalles de plafond … (+9)
  - problèmes : il fait trop chaud sous le toit ; le bruit passe a travers la cloison ; creer une cloison ; separer une piece en deux
  - local : placo
- **Toiture, charpente & étanchéité** (`toiture_etancheite`)
  - synonymes : couvreur, toiture, toit, couverture, tole, bac acier, tuile, charpente, gouttiere, etancheite, zingueur, fuite toit, fuite de toiture, reparation toiture … (+29)
  - problèmes : toit qui fuit ; ca coule dans la maison quand il pleut ; tuile cassee ; tole arrachee
  - local : tole, tole ondulee
- **Ferronnerie, soudure & métallerie** (`ferronnerie_soudure`)
  - synonymes : soudeur, soudure, ferronnier, ferronnerie, metallerie, metallier, garde corps, grille, acier, inox, aluminium soudure, souder, reparation metal, arc … (+15)
  - problèmes : ma grille est rouillee ; il me faut un garde corps ; faire une soudure ; reparer une grille cassee
  - local : —
- **Clôtures & portails** (`cloture_portail`)
  - synonymes : cloture, grillage, portail, portillon, brise vue, canisse, claustra, palissade, haie artificielle, cloture grillagee, cloture rigide, poteaux, treillis soude, cloture electrique … (+14)
  - problèmes : mon voisin voit chez moi ; mon chien s echappe ; terrain a cloturer ; cloturer mon terrain
  - local : —
- **Termites, humidité & traitement du bâti** (`traitement_batiment`)
  - synonymes : termites, humidite, moisissure, salpetre, traitement du bois, anti termites, insectes xylophages, capricorne, vrillette, champignon, traitement termites, traitement charpente, remontees capillaires, traitement hydrofuge … (+8)
  - problèmes : des termites mangent mon bois ; murs humides ; taches noires sur les murs ; ca sent le moisi
  - local : termites de bois sec, termite de terre
- **Rénovation tous corps d'état** (`renovation`)
  - synonymes : renovation, renover, rafraichissement, remise en etat, gros travaux, maitre d oeuvre, conducteur de travaux, tce, clef en main, renovation salle de bain, refaire la salle de bain, salle d eau, douche a l italienne, renovation sdb … (+13)
  - problèmes : je veux refaire toute ma maison ; j ai achete une maison a renover ; il faut tout refaire ; refaire ma salle de bain
  - local : petits travaux de renovation
- **Bricolage & petits travaux** (`bricolage`)
  - synonymes : bricoleur, bricolage, petits travaux, petit bricolage, homme a tout faire, petit depannage, coup de main bricolage, handyman, montage, fixation, petites reparations, montage de meubles, montage meuble, monter un meuble … (+38)
  - problèmes : j ai plusieurs petites choses a faire ; je n ai pas les outils ; une porte qui grince ; monter une armoire
  - local : —
- **Prêt & location d'outillage** (`location_outillage`)
  - synonymes : location outil, location outillage, pret d outil, perceuse, echafaudage, nettoyeur haute pression location, betonniere, marteau piqueur, location de materiel, niveau laser, visseuse, scie, meuleuse, ponceuse … (+15)
  - problèmes : je n ai pas la perceuse qu il faut ; je cherche un echafaudage pour deux jours ; emprunter une perceuse ; louer une meuleuse
  - local : —

### Jardin et extérieur

- **Entretien de jardin** (`jardinage_entretien`)
  - synonymes : jardinier, jardinage, entretien jardin, entretien de jardin, espaces verts, tonte, tondre, pelouse, taille haie, jardin, tonte de pelouse, gazon, tondeuse, tonte jardin … (+27)
  - problèmes : mon jardin est envahi ; l herbe est trop haute ; je n ai plus le temps d entretenir mon jardin ; tondre ma pelouse
  - local : —
- **Débroussaillage & nettoyage de terrain** (`debroussaillage`)
  - synonymes : debroussaillage, debroussailler, debroussailleuse, nettoyage de terrain, nettoyage de parcelle, friche, defrichage, terrain en friche, coupe coupe, debroussaillage de terrain, terrain, parcelle, m2, hectare … (+20)
  - problèmes : mon terrain est envahi par les broussailles ; terrain a nettoyer avant de construire ; ravine a nettoyer ; debroussaillage 400 m2
  - local : sabre, coupe-coupe, nettoyer la ravine
- **Élagage & abattage** (`elagage_abattage`)
  - synonymes : elagage, elaguer, elagueur, abattage, abattre un arbre, arbre, tailler un arbre, dessouchage, tronconnage, grimpeur, taille d arbre, manguier, avocatier, arbre fruitier a tailler … (+21)
  - problèmes : un arbre menace ma maison ; branche qui touche la toiture ; arbre tombe ; les branches touchent les fils electriques
  - local : cocotier
- **Paysagisme & plantations** (`paysagisme`)
  - synonymes : paysagiste, paysagisme, amenagement paysager, amenagement de jardin, creation de jardin, plantation, pepiniere, gazon, rocaille, fleurs, jardin paysager, plan de jardin, massif, jardin tropical … (+22)
  - problèmes : je veux refaire mon jardin ; mon jardin est triste ; quelles plantes mettre ; creer un jardin
  - local : —
- **Arrosage & irrigation** (`arrosage_irrigation`)
  - synonymes : arrosage, irrigation, arrosage automatique, goutte a goutte, programmateur arrosage, electrovanne, tuyau d arrosage, asperseur, installation arrosage, programmateur, tuyau enterre, reparation arrosage, fuite arrosage, tete d arrosage … (+7)
  - problèmes : mon jardin se desseche ; je pars en vacances et mes plantes ont soif ; installer un arrosage automatique ; arroser seul mon jardin
  - local : —
- **Piscine & bassin** (`piscine_bassin`)
  - synonymes : piscine, bassin, spa, jacuzzi, skimmer, chlore, filtration piscine, liner, robot piscine, entretien piscine, ph de piscine, nettoyage piscine, traitement eau, ph … (+20)
  - problèmes : mon eau de piscine est verte ; ma piscine est trouble ; piscine abandonnee ; eau verte
  - local : —
- **Nettoyage extérieur & haute pression** (`nettoyage_exterieur`)
  - synonymes : nettoyage exterieur, haute pression, karcher, nettoyage terrasse, demoussage, nettoyage facade, nettoyage cour, nettoyage allee, nettoyage toiture, nettoyage de parking, nettoyage dalles, nettoyage portail, nettoyage murs, demoussage toiture … (+13)
  - problèmes : ma terrasse est noire ; mousse sur les dalles ; facade verdie ; allee couverte de mousse
  - local : karcher, sargasses
- **Terrasses, abris & allées** (`amenagement_exterieur`)
  - synonymes : terrasse, allee, paves, abri de jardin, pergola, carport, cabanon, cuisine d ete, barbecue, pavage, dalles exterieures, kiosque, creation terrasse, renovation terrasse … (+20)
  - problèmes : je veux une terrasse couverte ; je veux un coin barbecue dans le jardin ; refaire ma terrasse ; creer une terrasse couverte
  - local : ajoupa, kiosque, carbet
- **Potager & jardin vivrier** (`potager_vivrier`)
  - synonymes : potager, jardin vivrier, jardin creole, legumes, verger, compost, permaculture, arbres fruitiers, plantation de bananes, carres potagers, semis, plants, arrosage potager, cultiver … (+14)
  - problèmes : je veux cultiver mes legumes ; je veux un jardin vivrier ; creer un potager ; aide pour mon jardin creole
  - local : jardin creole, jardin kreyol, jaden kreyol, abattis
- **Aide agricole & petit élevage** (`agricole`)
  - synonymes : aide agricole, agriculteur, agriculture, recolte, abattis, canne, banane, ferme, exploitation agricole, elevage, poules, ruches, apiculture, miel … (+26)
  - problèmes : j ai besoin de bras pour la recolte ; je cherche quelqu un pour ma parcelle ; aide pour la recolte de bananes ; besoin de bras sur ma parcelle
  - local : abattis, jardin creole, coupe de la canne, cabri

### Ménage et entretien

- **Ménage à domicile** (`menage_domicile`)
  - synonymes : menage, femme de menage, aide menagere, nettoyage domicile, nettoyage maison, entretien maison, homme de menage, nettoyage logement, menager, menage regulier, menage hebdomadaire, menage a domicile, menage une fois par semaine, menage tous les quinze jours … (+21)
  - problèmes : ma maison est sale ; je n ai plus le temps de faire le menage ; quelqu un pour nettoyer chez moi ; une femme de menage chaque semaine
  - local : —
- **Linge & repassage** (`linge_repassage`)
  - synonymes : repassage, repasser, linge, lessive, pressing a domicile, blanchisserie, laver le linge, plier le linge, couette, chemises, pantalons, repassage a domicile, fer a repasser, repasseuse … (+12)
  - problèmes : j ai une montagne de linge a repasser ; plus de temps pour repasser ; repasser mes chemises ; beaucoup de repassage
  - local : —
- **Nettoyages spécialisés** (`nettoyage_special`)
  - synonymes : nettoyage special, nettoyage vitres, lavage de vitres, nettoyage apres travaux, nettoyage fin de chantier, shampoing canape, nettoyage moquette, nettoyage matelas, remise en etat, nettoyer les vitres, nettoyage de vitres, laver mes vitres, nettoyer un canape, nettoyage canape … (+27)
  - problèmes : ma maison a ete inondee ; des travaux ont laisse de la poussiere partout ; canape tache ; nettoyer un canape et des matelas
  - local : —
- **Nettoyage de locaux & parties communes** (`nettoyage_locaux_pro`)
  - synonymes : nettoyage bureaux, nettoyage de locaux, nettoyage commerce, nettoyage copropriete, parties communes, entretien immeuble, nettoyage cabinet, nettoyage ecole, agent d entretien, menage bureaux, menage dans des bureaux, menage de bureau, nettoyer des bureaux, entretien des locaux … (+18)
  - problèmes : je cherche quelqu un pour entretenir mon commerce ; entretien des escaliers de mon immeuble ; menage dans des bureaux le soir ; nettoyer mon magasin
  - local : —
- **Conciergerie & location saisonnière** (`conciergerie_location`)
  - synonymes : conciergerie, conciergerie airbnb, location saisonniere, gite, airbnb, accueil voyageurs, remise des cles, menage airbnb, menage gite, gestion locative, gerer la location de mon gite, gerer ma location, gerer mon airbnb, location de gite … (+18)
  - problèmes : je loue ma maison et je n habite pas sur place ; je cherche quelqu un pour accueillir mes locataires ; gerer la location de mon gite en airbnb ; je loue ma maison aux touristes
  - local : —
- **Gardiennage & surveillance de logement** (`gardiennage_maison`)
  - synonymes : gardiennage, gardien, surveillance maison, garde de maison, house sitting, surveiller la maison, passage domicile, absence prolongee, arroser les plantes, surveiller ma maison, surveillance de maison, quelqu un pour passer chez moi, garder ma maison, maison vide … (+16)
  - problèmes : je pars en vacances et je veux que quelqu un surveille ma maison ; qui peut s occuper de ma maison pendant mon absence ; surveiller ma maison pendant mes vacances ; qui peut garder ma maison pendant mes vacances
  - local : —
- **Insectes, rongeurs & hygiène** (`nuisibles_hygiene`)
  - synonymes : desinsectisation, deratisation, nuisibles, cafards, rats, souris, moustiques, fourmis, punaises de lit, guepes, desinfection, 3d, ravets, fourmis folles … (+22)
  - problèmes : j ai des cafards dans la cuisine ; des rats dans le plafond ; invasion de fourmis ; nid de guepes
  - local : ravets, fourmis folles, fourmis manioc, mabouya, bebetes
- **Rangement & organisation d'intérieur** (`rangement_organisation`)
  - synonymes : rangement, ranger, organisation, home organizer, desencombrement, tri, trier, vider, dressing, organiser, desencombrer, tri de vetements, tri de papiers, vide maison … (+13)
  - problèmes : ma maison est en desordre ; trop d affaires ; je dois trier avant de demenager ; trier mes affaires
  - local : —

### Beauté, bien-être et sport

- **Coiffure** (`coiffure`)
  - synonymes : coiffeur, coiffeuse, coiffure, coupe de cheveux, cheveux, coupe, brushing, coiffer, salon de coiffure, coupe femme, coupe enfant, carre, degrade femme, frange … (+27)
  - problèmes : j ai besoin d une coupe ; mes cheveux sont abimes ; coiffure pour une ceremonie ; couper les cheveux de ma fille
  - local : —
- **Tresses, locks & cheveux texturés** (`tresses_cheveux_naturels`)
  - synonymes : tresses, tresseuse, nattes, vanilles, locks, dreadlocks, tissage, cheveux afro, cheveux crepus, coiffure afro, extensions, perruque, cornrows, box braids … (+27)
  - problèmes : je veux me faire tresser ; mes locks ont besoin d entretien ; mes cheveux crepus sont secs ; faire des tresses a ma fille
  - local : vanilles, nattes collees, rastas, tresses africaines, bouclettes
- **Esthétique & soins du corps** (`esthetique`)
  - synonymes : estheticienne, esthetique, soin du visage, epilation, cire, sourcils, cils, soin corps, gommage, institut de beaute, beaute, lumiere pulsee, nettoyage de peau, hydrafacial … (+22)
  - problèmes : je veux prendre soin de ma peau ; epilation a domicile ; un soin visage a domicile ; nettoyage de peau
  - local : —
- **Ongles & manucure** (`ongles`)
  - synonymes : ongles, manucure, pedicure, vernis semi permanent, gel, nail art, prothesiste ongulaire, capsules, faux ongles, resine, vernis, semi permanent, soin des mains, beaute des mains … (+19)
  - problèmes : je veux me faire les ongles ; mes ongles sont casses ; une manucure a domicile ; vernis semi permanent
  - local : —
- **Maquillage** (`maquillage`)
  - synonymes : maquilleuse, maquillage, make up, makeup, se maquiller, maquilleur, mua, maquillage artistique, maquillage mariee, maquillage mariage, essai maquillage, maquillage ceremonie, maquillage temoin, maquillage soiree … (+17)
  - problèmes : je veux etre maquillee pour une soiree ; apprendre a me maquiller ; maquillage pour mon mariage ; etre maquillee pour une soiree
  - local : carnaval
- **Massage & relaxation** (`massage_bien_etre`)
  - synonymes : massage, masseur, masseuse, relaxation, detente, reflexologie, sophrologie, bien etre, massage bien etre, massage de detente, massage relaxant, massage du dos, massage californien, massage aux huiles … (+24)
  - problèmes : j ai le dos tendu ; je suis stressee ; besoin de me detendre ; un massage a domicile
  - local : —
- **Yoga, pilates & gym douce** (`yoga_pilates`)
  - synonymes : yoga, pilates, meditation, stretching, gym douce, gym seniors, souplesse, etirements, hatha, vinyasa, qi gong, tai chi, cours de yoga, yin yoga … (+21)
  - problèmes : je veux me remettre doucement au sport ; j ai mal au dos au bureau ; des cours de yoga pres de chez moi ; yoga sur la plage
  - local : —
- **Coaching sportif & remise en forme** (`coaching_sportif`)
  - synonymes : coach sportif, coaching, fitness, musculation, remise en forme, perte de poids, preparation physique, personal trainer, crossfit, cardio, entrainement, running, course a pied, renforcement musculaire … (+22)
  - problèmes : je veux perdre du poids ; je veux me remettre au sport ; me preparer pour un marathon ; un coach pour me muscler
  - local : —
- **Danse** (`danse`)
  - synonymes : danse, danseur, danseuse, cours de danse, choregraphie, zouk, kompa, salsa, bachata, danse africaine, danse orientale, afrobeat, zumba, kizomba … (+24)
  - problèmes : je veux apprendre a danser ; une choregraphie pour mon mariage ; cours de danse pour mon enfant ; apprendre le zouk
  - local : zouk, kompa, bele, gwoka, quadrille, biguine, mazurka, danse traditionnelle
- **Tennis, foot, basket & sports de balle** (`sports_ballon_raquette`)
  - synonymes : tennis, football, foot, basket, volley, padel, badminton, ping pong, tennis de table, handball, rugby, sport collectif, raquette, partenaire sportif … (+17)
  - problèmes : je cherche un partenaire pour jouer au tennis ; un coach pour mon fils au foot ; trouver un partenaire de tennis ; cours de padel
  - local : —
- **Natation & activités aquatiques** (`natation`)
  - synonymes : natation, nager, cours de natation, maitre nageur, bebe nageur, aquagym, apprendre a nager, piscine cours, aquabike, aqua fitness, natation enfants, apprendre a nager enfant, cours de natation enfants, jardin aquatique … (+17)
  - problèmes : mon enfant ne sait pas nager ; j ai peur de l eau ; apprendre a nager a mon enfant ; bebe nageur
  - local : —
- **Arts martiaux & self-défense** (`arts_martiaux`)
  - synonymes : judo, karate, boxe, arts martiaux, self defense, taekwondo, jiu jitsu, krav maga, kick boxing, capoeira, mma, lutte, sambo, aikido … (+20)
  - problèmes : je veux apprendre a me defendre ; mon fils veut faire du judo ; inscrire mon fils au judo ; cours de karate
  - local : moringue, ladja, danmye
- **Activités nautiques & pêche de loisir** (`activites_nautiques`)
  - synonymes : plongee, voile, kayak, paddle, stand up paddle, kitesurf, windsurf, surf, peche, peche en mer, sortie en mer, catamaran, snorkeling, tuba … (+26)
  - problèmes : je veux faire de la plongee ; je veux apprendre la voile ; sortie en mer en famille ; faire un bapteme de plongee
  - local : sortie en mer, peche au gros, pwason
- **Randonnée & balades guidées** (`randonnee_nature`)
  - synonymes : randonnee, rando, guide, balade, promenade nature, trek, canyoning, marche en foret, cascade, volcan, accompagnateur nature, sortie nature, sentier, randonnee guidee … (+17)
  - problèmes : je cherche quelqu un pour m emmener en randonnee ; je ne connais pas les sentiers ; trouver un guide pour une randonnee ; randonnee a la cascade
  - local : —

### Transport, véhicules et logistique

- **Covoiturage & trajets** (`covoiturage_trajets`)
  - synonymes : covoiturage, covoit, trajet, emmener, deposer, conduire, accompagner en voiture, navette, transport de personnes, chauffeur, aller chercher, trajet local, trajet domicile travail, partage de frais … (+26)
  - problèmes : j ai besoin d etre emmene ; je n ai pas de voiture ; quelqu un pour me deposer ; quelqu un pour m emmener a la gare
  - local : taxi pays, taxi collectif
- **Colis & livraison** (`colis_livraison`)
  - synonymes : colis, livraison, livreur, paquet, relais colis, point relais, amazon, coursier, retrait colis, livrer, recuperer un colis, livraison colis, relais, poste … (+27)
  - problèmes : je dois envoyer un colis ; quelqu un pour recuperer mon colis ; livrer un objet ; recuperer mon colis au relais
  - local : barrique
- **Déménagement** (`demenagement`)
  - synonymes : demenagement, demenager, demenageur, cartons, changer de logement, emmenagement, camion de demenagement, monter les meubles etages, demenager un canape, demenager un frigo, demenager mes meubles, deplacer un canape, transporter un canape, aide au demenagement … (+25)
  - problèmes : je dois demenager ; j emmenage samedi ; j ai un canape a descendre du troisieme ; demenager un canape et un frigo
  - local : —
- **Transport d'objets & utilitaire** (`transport_objets`)
  - synonymes : transport d objets, transport de meubles, utilitaire, camionnette, remorque, pick up, transporter, transport de materiaux, transport d electromenager, camion plateau, transporter un canape, transport electromenager, livraison meuble, recuperer un meuble … (+24)
  - problèmes : j ai un meuble a transporter ; je dois ramener un frigo ; je n ai pas de camionnette ; recuperer un canape achete en ligne
  - local : —
- **Manutention, débarras & encombrants** (`manutention_debarras`)
  - synonymes : manutention, debarras, encombrants, porter, charger, decharger, vider une cave, vider un garage, evacuation encombrants, dechetterie, epaves, depot sauvage, portage, monter des charges … (+16)
  - problèmes : je dois me debarrasser de vieux meubles ; ma cave est pleine ; il faut porter un meuble lourd ; porter un meuble lourd au 2eme
  - local : —
- **Mécanique automobile** (`mecanique_auto`)
  - synonymes : mecanicien, mecano, mecanique, voiture, auto, garage, vidange, freins, plaquettes, revision, moteur, embrayage, distribution, courroie … (+54)
  - problèmes : ma voiture ne demarre pas ; voyant moteur allume ; bruit bizarre sous la voiture ; freins qui grincent
  - local : bagnole
- **Scooter, moto & vélo** (`deux_roues_velo`)
  - synonymes : scooter, moto, mobylette, cyclomoteur, deux roues, 50cc, 125cc, velo, vtt, velo electrique, vae, trottinette, motard, vidange scooter … (+26)
  - problèmes : mon scooter ne demarre pas ; mon velo a un pneu crevé ; ma moto fait du bruit ; vidange de ma moto
  - local : —
- **Carrosserie & peinture auto** (`carrosserie_auto`)
  - synonymes : carrosserie, carrossier, bosse, rayure, pare choc, peinture auto, debosselage, retroviseur, aile, phare opacifie, polish, ponçage carrosserie, choc, portiere … (+20)
  - problèmes : j ai raye ma voiture ; petit accrochage ; phare jauni ; une rayure sur la portiere
  - local : —
- **Pneus & roues** (`pneus_roues`)
  - synonymes : pneu, roue, jante, crevaison, equilibrage, parallelisme, geometrie, montage pneu, pneumatique, valve, montage de pneus, pneus neufs, changement de pneus, pneumatiques … (+13)
  - problèmes : j ai crevé ; pneu a plat ; ma voiture vibre a haute vitesse ; changer mes pneus
  - local : —
- **Lavage & rénovation de véhicules** (`lavage_auto`)
  - synonymes : lavage, lavage auto, nettoyer voiture, detailing, lustrage, polish, shampoing siege, nettoyage interieur voiture, nettoyage voiture, lavage a domicile, lavage exterieur, lavage interieur, lavage a la main, lavage sans eau … (+20)
  - problèmes : ma voiture est sale ; odeur dans la voiture ; sieges tachés ; laver ma voiture a domicile
  - local : —
- **Dépannage & remorquage de véhicule** (`depannage_vehicule`)
  - synonymes : depannage voiture, remorquage, depanneuse, panne sur la route, batterie a plat, panne seche, changement de roue, assistance routiere, booster batterie, remorquer, creve, creve sur la route, pneu creve sur la route, j ai creve … (+19)
  - problèmes : je suis en panne sur la route ; plus d essence ; ma voiture est en travers de la route ; je suis creve sur la route
  - local : depanneuse
- **Bateau, hors-bord & entretien nautique** (`bateau_mecanique_marine`)
  - synonymes : bateau, hors bord, moteur hors bord, annexe, coque, carenage, antifouling, mecanique marine, voilier, catamaran, jet ski, ponton, mouillage, gardiennage de bateau … (+29)
  - problèmes : mon moteur de bateau ne demarre pas ; ma coque est sale ; mon annexe a un trou ; mon hors bord ne demarre pas
  - local : yole, canot, gommo

### Famille, éducation et assistance

- **Garde d'enfants & babysitting** (`garde_enfants`)
  - synonymes : garde d enfants, garde enfant, babysitting, baby sitting, baby sitter, nounou, babysitter, garder mes enfants, garde de bebe, assistante maternelle, garde ponctuelle, garde du soir, soiree enfants, garde du week end … (+34)
  - problèmes : je cherche quelqu un pour garder mes enfants ; je sors ce soir et j ai besoin d une nounou ; mon enfant sort de l ecole a 16h ; garder mes enfants ce soir
  - local : ti moun
- **Soutien scolaire** (`soutien_scolaire`)
  - synonymes : soutien scolaire, aide aux devoirs, cours particuliers, prof, professeur, tutorat, cours de maths, repetiteur, accompagnement scolaire, devoirs, ecole, primaire, cp, ce1 … (+40)
  - problèmes : mon enfant a des difficultes a l ecole ; il doit remonter ses notes ; mon fils prepare le bac ; aider mon enfant avec les devoirs
  - local : —
- **Cours de langues** (`langues`)
  - synonymes : langues, cours de langues, anglais, espagnol, francais, portugais, allemand, italien, chinois, langue etrangere, conversation, cours de creole, apprendre le creole, parler creole … (+36)
  - problèmes : je veux apprendre l anglais ; je pars a l etranger ; je veux parler creole ; apprendre l anglais
  - local : kreyol, kweyol, patois
- **Cours de musique & chant** (`cours_musique`)
  - synonymes : cours de musique, musique, piano, guitare, batterie, saxophone, violon, ukulele, chant, solfege, instrument, prof de musique, percussions, tambour … (+31)
  - problèmes : je veux apprendre un instrument ; mon enfant veut faire de la musique ; cours de batterie pour mon fils ; apprendre la guitare
  - local : ka, tambour ka, tambou, ti bwa, gwoka, accordeon
- **Code de la route & permis** (`permis_code_route`)
  - synonymes : permis, code de la route, code, permis de conduire, conduite, reviser le code, examen du code, permis moto, permis b, permis am, questions de code, cours de code, test de code, se preparer au code … (+12)
  - problèmes : je prepare le code ; j ai peur de conduire ; je dois repasser mon permis ; reviser le code avec quelqu un
  - local : —
- **Seniors : présence & accompagnement** (`aide_personnes_agees`)
  - synonymes : personne agee, senior, aide a domicile, accompagnement senior, compagnie, visite, aidant, grand parent, aide seniors, presence, tenir compagnie, discussion, lecture, jeux de societe … (+30)
  - problèmes : ma mere est seule ; mon pere ne peut plus sortir ; je ne peux pas laisser mes parents seuls ; tenir compagnie a ma grand mere
  - local : —
- **Coups de main & aide du quotidien** (`aide_quotidienne`)
  - synonymes : aide ponctuelle, coup de main, aide quotidienne, petit service, service, aide, assistance, depannage humain, entraide, aider, rendre service, aide aujourd hui, aide demain, petit coup de pouce … (+19)
  - problèmes : j ai besoin d un coup de main ; je ne sais pas qui appeler ; je suis debordee ; j ai besoin d un coup de main cet apres midi
  - local : —
- **Courses & commissions** (`courses_commissions`)
  - synonymes : courses, faire les courses, commissions, supermarche, marche, drive, pharmacie, aide aux courses, livrer les courses, pain, achats, marche couvert, faire mes courses, faire mes courses a ma place … (+22)
  - problèmes : je ne peux pas aller au supermarche ; j ai besoin que quelqu un aille me chercher quelque chose ; faire mes courses a ma place ; je ne peux pas me deplacer pour mes courses
  - local : marche couvert, lolo, market
- **Garde & promenade d'animaux** (`garde_animaux`)
  - synonymes : garde d animaux, garde animaux, pet sitting, dog sitting, chien, chat, promenade, animaux, pension, garder mon chien, garder mon chat, nac, animal de compagnie, garde de chien … (+40)
  - problèmes : je pars en vacances et j ai un chien ; qui peut nourrir mon chat ; mon chien a besoin de sortir ; garder mon chien pendant les vacances
  - local : chien creole, cabri
- **Toilettage d'animaux** (`toilettage_animaux`)
  - synonymes : toilettage, toiletteur, toiletteuse, bain chien, coupe poil, tonte chien, griffes, brossage, bain animal, soins hygiene animaux, coupe poils, demelage, toilettage chien, toilettage chat … (+16)
  - problèmes : mon chien a des noeuds ; mon chat est sale ; il perd beaucoup de poils ; toiletter mon chien
  - local : —
- **Éducation canine & comportement** (`education_canine`)
  - synonymes : education canine, educateur canin, dressage, comportement, chiot, obeissance, rappel, ordres, laisse, socialisation, apprendre au chien, educateur, education chiot, propreté chiot … (+18)
  - problèmes : mon chien tire en laisse ; mon chiot fait des betises ; mon chien aboie tout le temps ; eduquer mon chiot
  - local : —

### Événementiel, cuisine et création

- **Organisation d'événements** (`organisation_evenement`)
  - synonymes : organisation evenement, organisateur, evenementiel, wedding planner, organiser une fete, coordination, organiser un mariage, organisation de mariage, organiser un bapteme, organiser un anniversaire, anniversaire surprise, organiser une reception, organiser une ceremonie, fete d anniversaire … (+39)
  - problèmes : je dois organiser une fete ; je ne sais pas par ou commencer pour mon mariage ; besoin d aide le jour J ; organiser mon mariage
  - local : —
- **Animation enfants & adultes** (`animation`)
  - synonymes : animation, animateur, animatrice, clown, magicien, jeux, ateliers, kermesse, karaoke, jeux gonflables, spectacle enfants, anniversaire enfants, mc, maitre de ceremonie … (+30)
  - problèmes : je cherche quelqu un pour animer l anniversaire de mon fils ; il faut de l ambiance ; un clown pour l anniversaire de mon fils ; animation pour 15 enfants
  - local : —
- **DJ, sonorisation & éclairage** (`dj_sonorisation`)
  - synonymes : dj, disc jockey, sono, sonorisation, musique de soiree, mix, playlist, eclairage de scene, lumieres, enceintes, technicien son, platines, animation musicale, selecta … (+22)
  - problèmes : il me faut de la musique pour ma fete ; ma sono est trop faible ; un dj pour mon mariage ; musique pour mon anniversaire
  - local : selecta, sound system, sono mobile
- **Décoration & fleurs d'événement** (`decoration_evenement`)
  - synonymes : decoration, decorateur, decorateur evenementiel, ballons, arche, fleuriste, bouquet, composition florale, centre de table, housse de chaise, decoration mariage, decor salle, arche de ballons, decoration anniversaire … (+22)
  - problèmes : je veux decorer la salle ; il me faut des fleurs pour la ceremonie ; une arche de ballons pour un anniversaire ; decorer la salle pour mon mariage
  - local : —
- **Location de matériel & mobilier de fête** (`location_materiel`)
  - synonymes : location, location materiel, location de materiel, louer, location tente, location chaises, location tables, vaisselle, couverts, barnum, chapiteau, location mobilier, location sono, location salle … (+34)
  - problèmes : je dois louer des chaises et des tables ; il me faut une tente pour 60 personnes ; louer 120 chaises ; une tente pour 50 personnes
  - local : barnum
- **Traiteur & réception** (`traiteur_evenement`)
  - synonymes : traiteur, buffet, cocktail, reception, repas de fete, repas de mariage, repas pour 50 personnes, plats pour evenement, barbecue, service traiteur, colombo, accras, boudin, cuisine creole … (+39)
  - problèmes : je dois nourrir 50 personnes ; un repas pour ma fete ; je cherche un traiteur pour un bapteme ; un buffet pour 40 personnes
  - local : colombo, accras, boudin, court bouillon, feroce, christophine, poulet boucane, pate en pot
- **Cuisine à domicile & plats préparés** (`cuisine_domicile`)
  - synonymes : cuisinier, cuisiniere, chef a domicile, cuisine a domicile, plats a emporter, preparation de repas, repas, meal prep, plat du jour, bokit, cours de cuisine, cuisiner pour moi, cuisine, accras … (+43)
  - problèmes : je n ai pas le temps de cuisiner ; des repas faits maison toute la semaine ; apprendre a cuisiner ; des plats faits maison a emporter
  - local : bokit, colombo, accras, plat du jour, dejeuner pays, jus de canne, bissap, sirop de batterie
- **Pâtisserie, boulangerie & desserts** (`patisserie`)
  - synonymes : patisserie, patissier, patissiere, gateau, dessert, wedding cake, gateau d anniversaire, boulanger, pain, viennoiseries, cake design, cupcakes, tarte, gateau sur mesure … (+41)
  - problèmes : je veux un gateau pour l anniversaire ; un dessert pour une fete ; un gateau pour les 7 ans de mon fils ; gateau de mariage
  - local : tourment d amour, flan coco, pain au beurre, gateau patate, sorbet coco, ti pain, pain de campagne, pain au lait
- **Photographie** (`photographe`)
  - synonymes : photographe, photographie, photo, shooting, seance photo, portrait, reportage photo, photo de mariage, photo de famille, retouche photo, drone, photographe mariage, photo mariage, reportage … (+42)
  - problèmes : je veux des photos de mon evenement ; j ai besoin de photos pour mon commerce ; photo pour mon cv ; un photographe pour mon mariage
  - local : —
- **Vidéo, tournage & montage** (`video`)
  - synonymes : videaste, video, film, tournage, montage video, montage, captation, reel, clip, film mariage, aftermovie, youtube, capcut, cameraman … (+37)
  - problèmes : je veux un film de mon evenement ; il me faut une video pour mon activite ; monter mes videos ; un film de mon mariage
  - local : reel
- **Artisanat & objets créés** (`artisanat_creation`)
  - synonymes : artisanat, artisan, bijoux, poterie, ceramique, vannerie, madras, sculpture, objets deco, creation locale, fait main, savon, bougies, travail du cuir … (+56)
  - problèmes : je cherche un objet fait main ; je veux apprendre une technique artisanale ; je vends mes creations ; des bijoux faits main pour un cadeau
  - local : madras, vannerie, calebasse, bakoua, toile madras, graines, bois de rose, ti panier
- **Peinture, dessin & arts plastiques** (`arts_visuels`)
  - synonymes : peinture artistique, dessin, portrait dessine, aquarelle, toile, tableau, artiste peintre, illustration, fresque, street art, graffiti, arts plastiques, croquis, caricature … (+32)
  - problèmes : je veux un tableau personnalise ; je veux apprendre a dessiner ; une fresque pour ma chambre ; un portrait peint de mes enfants
  - local : —
- **Couture, retouches & confection** (`couture_retouches`)
  - synonymes : couturiere, couture, retouches, ourlet, machine a coudre, vetement, confection, robe, costume, rideaux sur mesure, raccourcir, tailleur, modeliste, broderie … (+52)
  - problèmes : ce pantalon est trop long ; je veux une robe sur mesure ; mes rideaux sont trop longs ; raccourcir un pantalon
  - local : madras, costume traditionnel, robe creole, jupe madras, tenue traditionnelle, mas, carnaval
- **Stylisme & conseil en image** (`stylisme_conseil`)
  - synonymes : styliste, stylisme, conseil look, relooking, personal shopper, shopping accompagne, conseil en image, coach style, garde robe, colorimetrie, look, style personnel, morphologie, conseil vestimentaire … (+14)
  - problèmes : je ne sais pas comment m habiller ; j ai un entretien et je veux un nouveau look ; changer de look ; un conseil pour mes tenues
  - local : —
- **Musiciens, chanteurs & spectacle** (`musique_spectacle`)
  - synonymes : musicien, musicienne, chanteur, chanteuse, groupe de musique, orchestre, concert, spectacle, artiste, animation musicale, live, band, danseur, carnaval … (+43)
  - problèmes : je cherche un groupe pour ma fete ; un chanteur pour la ceremonie ; animer mon evenement avec de la musique live ; un groupe pour mon mariage
  - local : zouk, gwoka, bele, groupe a peau, mas, ka, biguine, steel band

### Numérique, administratif et services professionnels

- **Ordinateurs, Wi-Fi & réseau** (`informatique_depannage`)
  - synonymes : informaticien, informatique, ordinateur, pc, mac, portable, wifi, wi fi, internet, box, reseau, imprimante, depannage informatique, virus … (+57)
  - problèmes : mon ordinateur est lent ; je n ai plus internet ; mon pc ne s allume plus ; mon imprimante ne marche plus
  - local : —
- **Smartphone & tablette** (`smartphone_tablette`)
  - synonymes : smartphone, telephone, portable, iphone, android, samsung, tablette, ipad, whatsapp, application, appli, reglage telephone, ecran casse telephone, ecran de telephone … (+40)
  - problèmes : mon telephone est plein ; je n arrive pas a envoyer des photos ; mon ecran est casse ; ecran de telephone casse
  - local : —
- **TV, antenne & audio** (`tv_audiovisuel`)
  - synonymes : television, tv, televiseur, antenne, parabole, decodeur, canal, tnt, home cinema, barre de son, enceinte, installation tv, fixation tv, smart tv … (+30)
  - problèmes : je n ai plus de chaines ; mon image est floue ; je veux accrocher ma tele au mur ; installer ma tele et ma box
  - local : —
- **Domotique & objets connectés** (`domotique_connectee`)
  - synonymes : domotique, maison connectee, objets connectes, ampoule connectee, prise connectee, thermostat connecte, volets connectes, alexa, google home, home assistant, camera ip, sonnette connectee, lumiere connectee, variateur connecte … (+22)
  - problèmes : je veux piloter ma maison avec mon telephone ; je veux eteindre les lumieres a distance ; ampoules connectees ; programmer l eclairage du salon
  - local : —
- **Sites web & boutiques en ligne** (`creation_web`)
  - synonymes : site internet, site web, creation de site, wordpress, boutique en ligne, e commerce, landing page, nom de domaine, hebergement, seo, google my business, referencement, webmaster, developpeur web … (+31)
  - problèmes : je veux un site pour mon activite ; je veux vendre en ligne ; mon site n est plus a jour ; creer un site pour mon activite
  - local : —
- **Réseaux sociaux & communication** (`communication_reseaux`)
  - synonymes : reseaux sociaux, community manager, community management, instagram, facebook, tiktok, linkedin, communication, contenu, posts, publicite en ligne, influence, newsletter, marketing digital … (+33)
  - problèmes : je veux plus de clients grace aux reseaux ; je ne sais pas quoi poster ; ma page ne decolle pas ; quelqu un pour gerer mon instagram
  - local : reels
- **Graphisme & design** (`graphisme_design`)
  - synonymes : graphiste, graphisme, logo, affiche, flyer, carte de visite, canva, identite visuelle, charte graphique, design, infographie, kakemono, etiquette, packaging … (+35)
  - problèmes : je veux un logo ; j ai besoin d une affiche ; des cartes de visite pour mon activite ; creer un logo pour mon entreprise
  - local : —
- **Initiation & formation au numérique** (`initiation_numerique`)
  - synonymes : initiation, formation numerique, initiation informatique, bureautique, word, excel, powerpoint, internet, code, programmation, python, javascript, scratch, cours informatique … (+49)
  - problèmes : je ne sais pas utiliser un ordinateur ; je dois apprendre excel pour mon travail ; j ai peur d internet ; apprendre a utiliser internet et mes mails
  - local : —
- **Aide aux démarches administratives** (`aide_administrative`)
  - synonymes : aide administrative, demarches, demarches administratives, papiers, dossier, caf, impots, cpam, france travail, pole emploi, ameli, retraite, passeport, carte grise … (+48)
  - problèmes : je ne comprends pas ce courrier ; j ai un dossier a remplir ; mes papiers sont en retard ; ma declaration d impots
  - local : —
- **CV, lettres & rédaction** (`cv_redaction`)
  - synonymes : cv, curriculum vitae, lettre de motivation, linkedin, redaction, redacteur, relecture, correction, ecriture, discours, memoire, texte, entretien d embauche, recherche d emploi … (+34)
  - problèmes : je cherche du travail et mon cv est vieux ; je dois ecrire une lettre ; j ai peur de mes fautes ; refaire mon cv
  - local : —
- **Traduction & interprétariat** (`traduction_interpretation`)
  - synonymes : traduction, traducteur, traductrice, interprete, interpretariat, traduire, document traduit, anglais traduction, espagnol traduction, creole traduction, sous titrage, traduire un document, traduire en anglais, traduction en anglais … (+28)
  - problèmes : je dois faire traduire un document ; j ai besoin d un interprete pour un rendez vous ; traduire un document en anglais ; traduire mon cv en anglais
  - local : kreyol
- **Secrétariat & assistance** (`secretariat_assistance`)
  - synonymes : secretariat, secretaire, assistante, assistant virtuel, assistante virtuelle, saisie, frappe, gestion agenda, emails, standard, permanence, retranscription, prise de rendez vous, assistance administrative … (+26)
  - problèmes : je suis submergee par les mails ; j ai besoin d une secretaire quelques heures ; saisir des documents ; taper un document
  - local : —
- **Comptabilité & gestion simple** (`comptabilite_gestion`)
  - synonymes : comptabilite, comptable, gestion, facturation, devis, factures, auto entrepreneur, urssaf, micro entreprise, declaration de chiffre d affaires, budget, creation d entreprise, siret, bilan … (+34)
  - problèmes : je ne sais pas faire mes factures ; je dois declarer mon chiffre d affaires ; je veux creer mon activite ; faire mes devis et mes factures
  - local : —
- **Formation, coaching & conseil pro** (`formation_coaching_pro`)
  - synonymes : formation, formateur, formatrice, coaching, coach, conseil, accompagnement professionnel, orientation professionnelle, developpement personnel, animation d atelier, prise de parole, management, consultant, atelier … (+24)
  - problèmes : je veux me former ; je veux changer de metier ; j ai besoin de conseils pour mon activite ; former mon equipe
  - local : —

### Autres

- **Autre besoin (demande libre)** (`autre_demande`)
  - synonymes : autre, divers, demande libre, je ne trouve pas, autre besoin, autre service, non classe, a classer, besoin particulier, demande atypique, question, renseignement, service direct, demande directe … (+3)
  - problèmes : je ne sais pas dans quelle categorie ranger ma demande ; c est un peu particulier ; je ne sais pas comment decrire mon besoin ; je veux demander un service a une personne precise
  - local : —
