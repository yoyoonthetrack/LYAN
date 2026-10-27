# LYANN — Release Candidate V1.1 à V2.7

Verdict : **NO-GO**

## V2.7 — Gelasio, carte, territoire, compositeur, vidéo « Drums »

Le comportement vidéo V2.6 est inchangé : « Hello » reste en 9:16 avec rotation 90°, une seule lecture, pause hors écran, son, plein écran, et pas de téléchargement massif. Le fichier et la ligne « Hello » n’ont pas été réécrits. « Drums » n’a pas été modifié.

### Typographie

Le mot entier « Bokantaj » passe en Gelasio 700. Fraunces 800 a un J dont la queue revient sous le mot. Gelasio 700, comparé à Gelasio 600, Young Serif 400, DM Serif Display, Newsreader et Source Serif 4, garde le poids et les empattements, avec un J classique. Annonces et Lyanneurs restent en Fraunces. Sur le fil web en 390 px, la police calculée est `Gelasio`, graisse 700, et le titre ne chevauche pas le sous-titre.

### Carte

Sur un téléphone, Fil/Carte et la carte sont fixes sous l’en-tête d’application. L’ouverture remet le document en haut, et un fond couvre le bandeau et le fil pour qu’ils ne passent pas au-dessus des tuiles. Mesure web 390×844 : onglets fixes de y=77 à y=134, carte fixe de y=134 au bas, zoom présent, le fil est `display: none`. Un aller-retour après un défilement de 420 px ramène le document à 0 et laisse la carte collée sous les onglets.

### Territoire

Le filtre affiche « Territoire : » et la valeur choisie. « Tous » remplace « Tous les territoires ». Les autres options sont Guadeloupe, Martinique, Guyane, La Réunion, Saint-Martin. En 390 px, le sélecteur se termine à 236 px et « Publications récentes » commence à 246 px.

### Localisation

Après « Partager le nom du quartier » ou « Partager la localisation précise », le sélecteur se ferme et le compositeur existant revient dans l’écran, juste assez pour montrer Publier. Le texte saisi reste. Le défilement ne renvoie pas en haut de page. Vérifié dans le navigateur : le bouton était à y=1196, il est revenu à y=653 dans un écran de 844 px, texte « QA quartier » conservé.

### Drums

Publication Staging `a9b1fc89-106b-4c49-bff9-6fe5d744ecbf`, contenu « Drums », créée le 2026-10-27 à 04:48:26 UTC, statut `pending`, sans verrou humain. Médias : un `.mp4` et une miniature `poster-480x854.jpg` dans `bokantaj-media-hold`. Le job `cd410362-4fc1-43d0-b3b1-44989ebccde1` a été pris à 04:48:31 et clos à 04:48:36, statut `held`, une tentative sur trois, raison `video_unreviewed`.

La chaîne automatique, relue sans écriture, conclut `approved` / `video_checked` en 3,6 s. Le worker jetait ensuite toute approbation vidéo et la remplaçait par `video_unreviewed`. Ce n’est ni un échec de la miniature, ni un rejet du modèle. Trois jobs Staging sont `held` : deux `video_unreviewed`, un `video_unverified`. Trois publications sont encore `pending`, toutes avec une vidéo.

Une vidéo dont la raison est `video_checked` ou `video_poster_checked` peut maintenant être publiée. Une approbation sans ce contrôle reste en revue. Un fichier illisible est repris, puis tenu pour une personne, sans être affiché comme approuvé. « Drums » est laissé `pending` : le worker déployé est encore l’ancien, et la ligne n’a pas été forcée.

Paquet Staging `ios-mvq8ckif-ad2f83`, hash d’assets `609727e17a9818a5c3381238fb84e12324f21a28fa156314540ceb65aff1a66b`, version 1.0, backend `https://staging-bokantaj.lyann.app`, projet `tdktfbtqceldlaeqjtow`, SHA `807cb874f1bea2576289e25bae48dbe86e06dcbb`. Sur un écran étroit, la ligne de tri passe à la ligne pour que « Publications récentes » reste entier. Le simulateur iPhone 17 Pro et l’iPhone déverrouillé montrent le titre, « Territoire : Tous » et « Publications récentes » en entier, sans chevauchement. L’onglet Carte a été mesuré dans le navigateur en 390 px, pas sur l’iPhone. L’APK est installé sur l’émulateur. Le serveur déployé reste `80ceae7c`. Aucune fusion, aucun déploiement Production, Stripe Live inchangé.

## V2.6 — un seul Bokantaj, Hello debout

Produit `f13794852c26187971e10eeee5162ef74c1aa2de`. Paquet Staging `ios-mvq625ln-710814`, hash d’assets `e113abb6bc65676171b60c7f73833950990a1a051b09e48ad174dab78dd1a291`, version 1.0, backend `https://staging-bokantaj.lyann.app`, projet `tdktfbtqceldlaeqjtow`. Le serveur déployé répond encore `80ceae7c35bcc7a1bbe5160f68e604bd2350ec20`, `vercel_env` preview. Aucune fusion, aucun déploiement Production, Stripe Live inchangé. Le fichier « Hello » et sa ligne n’ont pas été réécrits.

### En-tête

Le titre est un seul élément `<h1 class="banner-title">Bokantaj</h1>`, en Fraunces 800, sans SVG, sans glyphe raccourci et sans variation par lettre. Le « j » est le glyphe d’origine, avec sa descendante. Sur le simulateur iPhone 17 Pro, il ne touche ni le badge « EN DIRECT », ni le sous-titre, ni l’illustration.

### Hello

Le média servi est le `.mov` d’origine, 20 943 984 octets, `video/quicktime`. La piste est codée en 3840×2160. La matrice `tkhd` du début de fichier vaut 90° (`a = 0`, `b = 65536`). La taille d’affichage est donc 2160×3840, portrait. La miniature stockée `…-poster-1920x1080.jpg` est la frame codée, non tournée : les colonnes y sont couchées. Le nom du fichier ne dit pas l’orientation réelle.

Le fil connecté envoyait `Authorization` avec `Range`. Le prévol CORS du média déployé n’autorise pas `Range`, la lecture de la matrice échouait, et la carte gardait le cadre large. La sonde part maintenant sans jeton, puis avec le jeton seulement si la plage publique ne contient pas de `tkhd`. Le ratio réservé est `1080 / 1920`. Sur le simulateur, le cadre mesuré est 340×604 px CSS, soit 9:16, avec `turn=90`. Une fois la carte amenée en vue, l’image est la batterie debout, cymbales à l’horizontale. Le fichier et la publication n’ont pas été modifiés.

Le lecteur iOS ne télécharge pas le MOV entier pour l’autoplay : la lecture distante reste en plages, et la copie locale ne part que sur un appui explicite. La miniature reste affichée tant qu’une frame n’est pas en lecture.

### Appareils

Simulateur iPhone 17 Pro `9281CEB1-E36D-4654-91E0-3AA741F8AD10`, paquet `ios-mvq625ln-710814`, session QA, aucune écriture. Titre homogène et cadre portrait vérifiés à l’écran.

« iPhone de yoann » `00008140-00112D0C2684801C` a reçu le même paquet. L’écran était verrouillé au moment de la capture. Le rendu sur l’appareil n’a pas été vu. Il faut le déverrouiller et laisser l’écran allumé, sans saisir le code à la place du titulaire.

L’émulateur `lyann_small` a reçu l’APK debug de ce paquet. L’application s’ouvre sur l’accueil. La connexion QA n’a pas abouti : le clavier de l’émulateur n’a pas saisi le domaine de l’email. Le fil et « Hello » n’ont donc pas été vus sur Android.

### Tests

`tests/bokantaj-video-policy.test.js` et `tests/lyann-stars.test.js`, 18 tests, 0 échec.

## V2.5 — ratio vidéo, j de Bokantaj, étoiles

Produit `b34f0a3ae922af96004a0af1fc8eabd6901ee55c`. Paquet Staging `ios-mvq3vkvz-d9a544`, hash d’assets `00ff0696f0fa7d5acc23f9412969427fa9f586b8a0886dd93cbc83ed64cdce48`, version 1.0, backend `https://staging-bokantaj.lyann.app`, projet `tdktfbtqceldlaeqjtow`. Le serveur déployé reste `80ceae7c35bcc7a1bbe5160f68e604bd2350ec20`. Aucune fusion, aucun déploiement Production, Stripe Live inchangé, aucune donnée réelle modifiée.

### Vidéo

Le fil réserve le ratio dès le premier rendu quand la miniature le donne en portrait. Une vidéo paysage locale reste paysage. Une seule lecture, en sourdine, démarre dans la zone visible ; les autres ne sont pas téléchargées. Sortir le clip de l’écran le met en pause. Le bouton son passe de « Activer le son » à « Couper le son ». Un fichier absent garde la miniature, le bouton « Lecture » et le message d’échec, sans changer la hauteur réservée. `prefers-reduced-motion` et `saveData` empêchent la lecture automatique. Les vidéos de plus de 60 secondes ne bouclent pas.

Preuve Web, viewport 390×844, fichiers locaux : portrait 360×640 réservé à 555 px avant et pendant la lecture (écart 0). Paysage 640×360 à 176 px. Après défilement, le portrait est en pause et le paysage lit, toujours muet. Seuls les fichiers réellement ouverts apparaissent dans les transferts.

Simulateur iPhone 17 Pro `9281CEB1-E36D-4654-91E0-3AA741F8AD10` et « iPhone de yoann » `00008140-00112D0C2684801C`, paquet `b34f0a3`, session QA, aucune publication. Le titre est le nouveau tracé. Le clip « Hello » (miniature `poster-1920x1080`) reste une bande large : le lecteur rapporte la taille codée, pas la taille verticale. Ce cas n’est pas corrigé à l’écran. L’émulateur Android n’était pas démarré. L’APK debug a été assemblé hors ligne avec ce paquet, sans parcours.

### En-tête

Le « j » de Bokantaj n’est plus le glyphe Fraunces dont le crochet revient sous le « a ». Le mot reste en Fraunces, et seul le « j » est un tracé court qui reste dans sa propre largeur. Vérifié en local à 390 px @3x, à 1100 px @2x, et sur le simulateur. Le nom accessible reste « Bokantaj ».

### Étoiles

Le contrôle partagé `mountLyannStars` peint les étoiles choisies en `#E5B345` et les autres en `#B7AFA3`, affiche `n/5`, prévisualise au survol souris et met à jour la valeur au toucher. Le clavier gauche/droite change la note. Le `<select>` existant reçoit la même valeur numérique ; une note de 3 laisse `select.value` à `3`. Il n’y a pas de thème sombre dans l’application : les couleurs sont celles du fond crème. Les avis de profil qui affichent déjà une étoile dorée et un nombre n’ont pas été réécrits.

### Tests

Sur l’arbre final : `tests/bokantaj-video-policy.test.js` et `tests/lyann-stars.test.js`, 18 tests, 0 échec. `tests/bokantaj-video-range.test.js`, 3 tests, 0 échec.

## V2.3 — compte QA sur iPhone, signatures

Le paquet installé pour la passe QA est `ios-mvq1ylmz-48feba`, SHA `6df9d7e883812584bd8ee0e35d1868f01889f862`, hash d’assets `fa9f500d4937388de7eaa851455d8ec59a81ad699371533dc6c77fa29772a4c2`, version 1.0, backend `https://staging-bokantaj.lyann.app`, projet `tdktfbtqceldlaeqjtow`. Le serveur déployé est toujours `80ceae7c35bcc7a1bbe5160f68e604bd2350ec20`.

### iPhone physique

« iPhone de yoann » (`00008140-00112D0C2684801C`) est appairé en USB, le mode développeur est activé, et la connexion est filaire. Aucun contournement du verrouillage. Xcode a d’abord attendu « Unlock iPhone de yoann to Continue ». La passe a ensuite tourné téléphone déverrouillé.

Une première exécution a ouvert la photothèque puis l’a annulée, et a affiché la demande système de position, alors que le compte personnel était encore connecté. Le processus a été arrêté avant toute publication. Staging : 0 ligne `bokantaj_posts` sur cette fenêtre. Le test s’arrête désormais avant toute écriture si la feuille de compte n’est pas QA A.

La déconnexion restait bloquée : le bouton était touché, la session personnelle restait ouverte. `logout()` attendait la désactivation push puis la révocation réseau. Il libère maintenant la session locale si cette étape dépasse deux secondes. Avec le paquet `ios-mvq1ylmz-48feba`, `testQaPhysicalPass` note `logged-out` puis `qa-identity`. Aucune écriture n’a suivi :

- Le champ de publication n’est pas apparu. Aucun texte `QA-IOS-V23-TEXT`.
- Le menu Photo s’ouvre, la photothèque s’ouvre, Annuler la ferme. Aucune photo n’est choisie ni publiée.
- « Me localiser » est touché. « Partager la localisation précise » n’est pas atteignable. Aucune position n’est publiée.
- Aucun bouton « Lire la vidéo » déjà approuvé n’est joué. « Fiesta », encore en vérification, n’est pas traité comme une vidéo publique.
- Annonces : la liste montre « Détails ». L’écran de détail ne montre ni « Contacter » ni « Modifier ».
- Lyanneurs : un bouton « Contacter » est visible. Il n’est pas activé.
- Messages et Notifications s’ouvrent. Aucun échange entre deux comptes QA.
- Passage à l’accueil puis retour : `qa-resumed`. Un défilement est noté `qa-scrolled`.
- Coupure réseau non faite : elle demanderait de changer la configuration de l’appareil ou un mot de passe administrateur.

Staging, après la passe : 0 ligne `QA-IOS-V23-%`, 0 publication créée dans les trente minutes. Journal : `/tmp/lyann-ios-device-v23f.log`. Résultat : `Test-App-2026.10.27_03-15-00-+0100.xcresult`.

Pour continuer les écritures : laisser « iPhone de yoann » déverrouillé, écran allumé. Si iOS redemande l’automatisation, toucher Activer. Si la demande de position est encore affichée, la réponse appartient à la personne qui tient le téléphone.

### Distribution

Équipe `WLV4WC47U2`, bundle `app.lyann.mobile`, signature automatique. Le trousseau contient uniquement Apple Development. Trois profils locaux : développement `app.lyann.mobile`, développement générique, et « iOS Team Store Provisioning Profile: app.lyann.mobile » (`get-task-allow` faux, aucun appareil). Sans identité Apple Distribution dans le trousseau, aucune archive TestFlight n’a été produite. Rien n’a été envoyé à des testeurs.

Le keystore d’upload Android est hors du dépôt : `~/Library/Application Support/lyann-release/upload-keystore.jks`, alias `upload`, RSA 2048, certificat `CN=LYANN Upload`, droits `0600`. Le mot de passe est dans le fichier voisin `upload-keystore.password`, mêmes droits. Il n’est pas dans Git. `LYANN_ANDROID_KEYSTORE` n’est pas exporté, donc aucun AAB n’a été assemblé. L’émulateur Android n’a pas été relancé.

### Backend

La migration devis reste bloquée par le jeton de gestion HTTP 401. Aucune écriture. Le remboursement Stripe reste `EXECUTION_DISABLED`. Production n’a pas été touchée.

### Toujours en attente

Publication QA, photo choisie, GPS quartier et exact, lecture d’une vidéo déjà approuvée, détail d’annonce, contact Lyanneur, messages entre deux comptes QA. Certificat Apple Distribution dans le trousseau, puis archive. Assembler l’AAB avec le keystore hors dépôt. Coupure réseau, migration `P0001`, remboursement Stripe Test. Aucune fusion, aucun Production, aucun Stripe Live.

## V2.2 — iPhone physique, deux vidéos, distribution

Le binaire installé reste celui de V2.1 : `ios-mvpyrwgw-accac6`, SHA `2053e9d5f4a249cb336c4d937d4c8d3c6d822e5c`, backend `https://staging-bokantaj.lyann.app`, projet `tdktfbtqceldlaeqjtow`. Aucun source d’application n’a changé. Le backend déployé répond encore `80ceae7c35bcc7a1bbe5160f68e604bd2350ec20`.

### iPhone physique

« iPhone de yoann » (`00008140-00112D0C2684801C`) est appairé en USB, le mode développeur est activé, et le téléphone était déverrouillé. Les échecs précédents viennent de là : « Authentification annulée » est un Face ID refusé pendant l’activation de l’automatisation, et « Timed out while enabling automation mode » signifie que cette activation n’a pas été confirmée à temps. Le code n’a pas été saisi.

Une passe a ensuite démarré. La session ouverte est le compte membre « Yoann D. », pas le compte QA A. Le test cherchait `@lyann.invalid` et « Qa A », donc ces deux assertions échouent. Ce qui a été exécuté :

- Annonces : 7 annonces, la carte `RC14-mvpnz42j-devis`.
- Bokantaj, puis la carte Guadeloupe avec des repères et le texte « 13 partages ». Retour au fil.
- Le menu Photo s’ouvre (Photothèque, Prendre une photo, Choisir les fichiers). La photothèque n’a pas été ouverte, et aucune photo personnelle n’a été publiée.
- Le toucher « Lire la vidéo » sur « Fiesta », encore « en cours de vérification », laisse le bouton en place. La lecture n’a pas démarré.
- Notifications ouvertes, menu ouvert, Finances ouvert (formule Gratuit). L’application est revenue au premier plan après un passage à l’accueil (`resumed`).
- Lyanneurs, Messages, le clavier et le GPS n’ont pas été atteints : les feuilles recouvraient la barre, et aucune position du téléphone n’a été publiée.

Le téléphone s’est ensuite reverrouillé. Pour continuer : le déverrouiller, laisser l’écran allumé, et toucher Activer si iOS demande d’activer l’automatisation de l’interface.

Captures : `/tmp/lyann-v22/named/`. Journal : `/tmp/lyann-ios-device-v22.log`.

### Vidéos — simulateur, backend Staging déployé

`testTwoFeedVideos` réussit sur le simulateur iPhone 17 Pro. Deux boutons « Lire la vidéo » distincts passent par « Lecture en cours », « Ouvrir le lecteur », « Fermer le lecteur », puis le fil. La seconde image est le message « Incroyable », avec un cadre paysage. Après un passage à l’accueil, « Lecture en cours » a disparu et le fil est là. Le conteneur de cette passe ne contient pas de fichier `MediaCache` ni de vidéo temporaire de plusieurs mégaoctets.

Le fil ne demande toujours le fichier qu’au toucher : le préchargement des cartes ne charge que les images. Aucune capture réseau de cette passe ne prouve l’absence de requête avant le toucher. La coupure réseau n’a pas été faite : le filtre de paquets demande un mot de passe administrateur, qui n’a pas été fourni.

Journal : `/tmp/lyann-ios-uitest-v22.log`.

### Distribution

Une seule identité de signature : Apple Development. Aucun certificat Apple Distribution, donc pas d’archive ni de TestFlight. Bundle `app.lyann.mobile`, équipe `WLV4WC47U2`, signature automatique. Côté Android, `applicationId` `app.lyann.mobile`, et `LYANN_ANDROID_KEYSTORE` est absent : pas d’AAB signé, pas d’envoi Play. Rien n’a été publié.

### Backend

La migration devis a été relancée contre `tdktfbtqceldlaeqjtow`. Le jeton de gestion répond encore HTTP 401. Aucune écriture. Le remboursement Stripe reste `EXECUTION_DISABLED`. Les boutons admin n’ont pas été rejoués. La feuille du compte physique affiche la formule Gratuit ; elle n’a pas été modifiée.

### Toujours en attente

Lyanneurs, Messages, clavier et GPS sur l’iPhone déverrouillé, sans publier la position réelle du téléphone. Lecture d’une vidéo déjà approuvée sur l’appareil. Coupure réseau, puis retour. Certificat Apple Distribution et keystore Android. Migration `P0001` et remboursement Stripe Test. Aucune fusion, aucun Production, aucun Stripe Live.

## V2.1 — photo iOS, plein écran, lieu exact

Le correctif produit est `2053e9d5f4a249cb336c4d937d4c8d3c6d822e5c`. Le paquet reconstruit ensuite porte l’identité `ios-mvpyrwgw-accac6`, le hash d’assets `9095907b05497f11e89c0332937f543fe5bfbc04654b694734f4796fc244a35a`, la version 1.0, le backend `https://staging-bokantaj.lyann.app`, le projet `tdktfbtqceldlaeqjtow` et le même verrou. Les parcours ci-dessous ont tourné sur le simulateur iPhone 17 Pro `9281CEB1-E36D-4654-91E0-3AA741F8AD10`, contre le backend Staging réellement déployé. Ce n’est pas l’iPhone physique. L’émulateur Android n’a pas été relancé.

### iPhone physique

« iPhone de yoann » (`00008140-00112D0C2684801C`) a été déverrouillé (`passcodeRequired: false`). Le paquet `ios-mvpyrwgw-accac6`, SHA `2053e9d5f4a249cb336c4d937d4c8d3c6d822e5c`, a été installé : `app.lyann.mobile`. Le lanceur de test n’a pas pu démarrer. Le premier essai s’arrête sur « Authentification annulée ». Le second expire sur « Timed out while enabling automation mode ». Aucun parcours n’a été exécuté, et aucune capture de l’écran de l’appareil n’a été prise. Le code n’a pas été saisi. Pour reprendre : laisser « iPhone de yoann » déverrouillé et accepter le mode d’automatisation quand iOS le demande.

### Photo — simulateur, backend Staging déployé

Le bouton Photo du formulaire ouvre la feuille « Photothèque ». La photothèque s’ouvre, « Annuler » la ferme, une seconde ouverture sélectionne l’image verte ajoutée pour le test, et le compositeur affiche l’aperçu. La publication `QA-IOS-V21-PHOTO` apparaît dans le fil, avec le bandeau « Votre publication est maintenant visible. »

Staging, projet `tdktfbtqceldlaeqjtow` : la ligne est `approved`, sans lieu, avec un objet dans `bokantaj-media-hold`. Une lecture anonyme voit la publication. Trois publications photo de ce passage ont été supprimées, puis `releaseMedia` a retiré leurs trois objets (aucune référence restante). L’URL publique de l’un d’eux répond ensuite HTTP 404, corps vide. Le JPEG n’est plus servi.

Journaux : `/tmp/lyann-ios-uitest21.log`, `/tmp/lyann-ios-uitest23.log`. Captures : `/tmp/lyann-v21/`.

### Vidéo — simulateur, backend Staging déployé

`https://staging-bokantaj.lyann.app/v1/runtime/identity` répond encore le commit `80ceae7c35bcc7a1bbe5160f68e604bd2350ec20`. Une vidéo approuvée répond `cache-control: private, no-store`. Le correctif serveur (`private, max-age=300` et la plage transmise à Storage) est dans la branche et couvert par les tests unitaires. Il n’est pas déployé, donc il n’est pas validé.

Sur ce backend, le simulateur joue après le toucher, depuis un blob local. `/tmp/lyann-ios-uitest18.log` note `video-several`, `video-playing`, `video-stage` et `video-back-feed` : « Fermer le lecteur » quitte la scène et le fil est de nouveau là. Le bouton natif du lecteur système n’est pas utilisé. Une passe suivante a rejoué une vidéo du fil (`video-playing`, plusieurs boutons « Lire la vidéo ») sans rouvrir la scène, parce que le bouton était hors d’atteinte. Une seconde vidéo distincte, un réseau lent ou coupé, et le nettoyage des fichiers temporaires iOS n’ont pas été exécutés. Le code révoque le blob quand la page passe en arrière-plan ; ce nettoyage n’a pas été observé.

### Lieu — simulateur, GPS `16.241184,-61.533721`

Le partage « Partager le nom du quartier » publie `QA-IOS-V21-QUARTIER`, statut `approved`, libellé Mortenol, coordonnées `16.241` et `-61.534` (trois décimales). Le fil affiche « Localisation · Mortenol ».

« Partager la localisation précise » est un second bouton. Après ce choix, le libellé contient « position exacte » et la publication `QA-IOS-V21-EXACT` est `approved`, libellé Mortenol, coordonnées `16.241184` et `-61.533721` (six décimales). Une lecture anonyme voit les deux. Les lignes de quartier restent à trois décimales : la position précise n’est enregistrée qu’après ce bouton.

La règle de repère, appliquée à l’horodatage stocké, laisse ces publications `info` visibles sur la carte maintenant et les retire au-delà de sept jours, sans supprimer la publication. Le délai de sept jours n’a pas été attendu sur la carte. Le retour au fil est visible : l’onglet Fil montre les cartes publiées.

### Nettoyage et qualité

Les huit lignes `QA-IOS-V21-%` ont été supprimées. Il en reste zéro. `node --test` sur la politique vidéo, la publication et les plages : 26 réussites. L’émulateur Android n’a pas été reconstruit dans ce passage.

### Toujours en attente

Recette sur l’iPhone : le paquet `2053e9d5` est installé, le mode d’automatisation n’a pas démarré, donc connexion, carte, GPS, photos, vidéos, annonces, Lyanneurs, messages, notifications, profil, clavier et navigation n’ont pas été exécutés sur l’appareil. Seconde vidéo, réseau interrompu, nettoyage des fichiers temporaires, et observation réelle de la disparition d’un repère. Déploiement du correctif d’en-tête, puis rejeu du lecteur contre ce serveur. Migration devis et remboursement Stripe Test inchangés. Aucune fusion, aucun Production, aucun Stripe Live.

## V2.0 — lecture iOS, bouton Photo, lieu du compositeur

Le correctif produit est `b7372179aa15cdae7f1d77b84060f2e823cc12fb`. Le paquet reconstruit ensuite porte l’identité `ios-mvpxemcz-946f4c`, le hash d’assets `878bfa601c609b0c8362dad46293b4bc1e5bfd88c3cbb70ad442d9f2a7029b9f`, la version 1.0, le backend `https://staging-bokantaj.lyann.app` et le verrou `tdktfbtqceldlaeqjtow`. Les parcours ci-dessous ont tourné sur le simulateur iPhone 17 Pro `9281CEB1-E36D-4654-91E0-3AA741F8AD10` avec ce même code, avant l’estampille. Ce n’est pas l’iPhone physique.

### iPhone physique

« iPhone de yoann » (`00008140-00112D0C2684801C`) est appairé. `devicectl` indique `passcodeRequired: true`. Le code n’a pas été saisi. Aucun parcours n’a été exécuté sur l’appareil. Pour les lancer : déverrouiller « iPhone de yoann » et le laisser déverrouillé.

### Vidéo

Le fichier du post « Hello » est un `.mov` de 20 943 984 octets, `video/quicktime`, marque `qt`, piste `avc1` et `mp4a`, `moov` en tête. Une plage `bytes=0-1` répond 206. L’en-tête servi par Staging est `Cache-Control: private, no-store`. Avec cet en-tête, WKWebView ouvre le lecteur et laisse l’image blanche. Le fil ne télécharge toujours pas la vidéo avant le toucher. Sur iOS, le toucher « Lire la vidéo » charge alors le fichier et le joue depuis un blob local ; un `avc1` est annoncé `video/mp4`. Web et Android gardent l’URL directe et les plages d’octets.

Sur le simulateur, le lecteur est passé par « Lecture en cours », « Pause », « Lecture en pause », puis la reprise. « Ouvrir le lecteur » affiche la salle (lustre, scène), plus un cadre blanc. Le bouton natif de sortie n’est pas dans l’arbre du test : un retour à l’accueil laisse le lecteur plein écran. Le code appelle `webkitExitFullscreen` quand l’app passe en arrière-plan. Captures : `/tmp/lyann-v20-video.png`, `/tmp/lyann-v20-video-full.png`. Journal : `/tmp/lyann-ios-uitest12.log`.

Le serveur de cette branche n’envoie plus `no-store` sur une vidéo (`private, max-age=300`) et transmet la plage demandée à Storage au lieu de retélécharger tout le fichier. `https://staging-bokantaj.lyann.app/v1/runtime/identity` répond encore le commit `80ceae7` et `cache-control: private, no-store`. Le simulateur a donc joué contre l’API actuelle, par le blob, pas contre ce nouvel en-tête.

### Photo

Le contrôle Photo du compositeur est un bouton nommé Photo, sans permission ajoutée. Un toucher ouvre la feuille système « Photothèque », « Prendre une photo », « Choisir les fichiers ». L’ouverture de la photothèque, l’annulation, l’aperçu, la publication et le nettoyage Storage n’ont pas été enchaînés.

### Lieu

« Me localiser », avec le GPS du simulateur à 16,241, −61,534, puis « Zoomer » et « Partager le nom du quartier », affiche « Mortenol · quartier ». Ce n’est pas une position exacte. Le bouton « Partager la localisation précise » est présent ; le toucher suivant a atteint « Fil » et n’a pas activé le partage exact. Le fil est de nouveau là ensuite. Capture : `/tmp/lyann-v20-place.png`. Journal : `/tmp/lyann-ios-uitest17.log`.

### Périmètre

| | |
| --- | --- |
| Web | URL directe et plages d’octets, inchangé dans le geste |
| iOS | blob après le toucher, bouton Photo, libellé de quartier |
| Android | même bouton Photo et même libellé ; la lecture directe n’est pas rejouée ici |
| Serveur | plage transmise à Storage, vidéo sans `no-store` ; pas encore servi par le domaine Staging |

Tests : `tests/bokantaj-video-policy.test.js`, `tests/bokantaj-video-range.test.js`, `tests/bokantaj-publish-finish.test.js`.

### Toujours en attente

Parcours sur l’iPhone déverrouillé. Sélection, publication et suppression d’une photo iOS. Partage du point exact. Sortie du plein écran par le bouton du lecteur. Le domaine Staging sert encore `80ceae7`. Migration devis et remboursement Stripe Test inchangés. Aucune fusion, aucun Production, aucun Stripe Live.

## V1.9 — iPhone verrouillé, annonces, carte, médias QA

Les paquets installés restent `ios-mvpu5wa4-d7e45f`, SHA embarqué `7f3b81003fcd421d7673d961a1206b7581c4cb5b`, backend `https://staging-bokantaj.lyann.app`, verrou `tdktfbtqceldlaeqjtow`. Aucun correctif produit n’a été nécessaire pour les annonces ni pour le fond de carte : les deux s’affichent une fois le chargement fini.

### iPhone physique

« iPhone de yoann » accepte le lancement de `app.lyann.mobile`. L’écran qui répond est le code de déverrouillage. Les parcours sur l’appareil n’ont pas été exécutés.

### Simulateur iPhone 17 Pro

`testAnnoncesMapAndMedia` réussit. Annonces affiche « 7 annonces · Tous les lieux » et la carte `RC14-mvpnz42j-devis` (Le Gosier, Jardinage). Le détail de cette annonce, qui appartient à QA A, s’ouvre avec Modifier et Supprimer. Le bandeau vide de V1.8 était la capture pendant le chargement : le test prenait aussi le texte caché « Chargement du profil… » pour un chargement de liste. Staging a 7 demandes publiques ouvertes ; la requête répond en 345 ms.

Lyanneurs affiche « 53 Lyanneurs · Tous les lieux » et la fiche Alain C. (Saint-Joseph). Le bouton Contacter est dans l’arbre. Il n’a pas été activé.

La carte Bokantaj quitte « La carte arrive… ». Le fond OpenFreeMap de la Guadeloupe, les grappes 7, 5 et le repère resto, et les boutons de zoom sont là. « 13 partages ici ». Le GPS du simulateur est posé à 16,241, −61,534. Le fil de carte ne dessine pas de point utilisateur : la position sert au choix de lieu du compositeur, qui n’a pas été ouvert. Une position de quartier reste arrondie à trois décimales tant que le membre n’a pas choisi le point exact.

Le toucher « Lire la vidéo » remplace l’affiche par le lecteur (son coupé et « Ouvrir le lecteur »). Aucun bouton dont le nom contient « pause » n’apparaît, et l’image reste blanche. L’icône Photo du compositeur n’est pas exposée sous le nom Photo : le sélecteur ne s’ouvre pas par ce test.

Captures : `/tmp/lyann-ios-ui-v19-annonces.png`, `v19-annonce-detail.png`, `v19-lyanneurs.png`, `v19-carte.png`, `v19-video.png`. Journal : `/tmp/lyann-ios-uitest10.log`.

### Émulateur — nettoyage du média QA

Le fichier laissé par la photo V1.8, `0cf16918-9951-47bd-a726-e3efca8cbbf4.jpg`, est dans le dossier QA A de `bokantaj-media-hold`, créé à 22:18 UTC, sans publication qui le référence. Le balayage automatique ne le retire qu’après 48 h. `releaseMedia`, le même chemin que la suppression admin Staging, le retire. Un second fichier créé pour l’essai, `qa-cleanup-v19.jpg`, suit le même chemin et disparaît de l’inventaire. L’URL publique répond 200 avec une image SVG de 431 octets, `Cache-Control: private, no-store` : c’est le visuel d’attente, pas le JPEG. Aucun fichier hors de ce dossier QA n’a été supprimé. 68 publications restent en base.

### Toujours en attente

Parcours sur l’iPhone une fois le code saisi. Lecture vidéo avec pause et plein écran. Sélection d’une photo iOS. Contact d’un Lyanneur depuis sa fiche. Point GPS dans le compositeur. Migration devis et remboursement Stripe Test inchangés. Aucune fusion, aucun Production, aucun Stripe Live.

## V1.8 — photo Android, XCUITest, iPhone de développement

Les parcours ci-dessous ont tourné sur le paquet `fe4d298`, sauf l’iPhone : l’app installée et ouverte ensuite est `ios-mvpu5wa4-d7e45f`. Le paquet reconstruit sur `7f3b81003fcd421d7673d961a1206b7581c4cb5b` porte cette identité, le hash d’assets `7c770eb0c59cc25f3495e3d98abeaefbf4d0f1238248015e12ba8c14d096110a`, la version 1.0, le backend `https://staging-bokantaj.lyann.app` et le verrou `tdktfbtqceldlaeqjtow`. L’APK debug a le SHA-256 `b97a1abfa7d02f28d4cee7c37bdc01deac17ff8e5800e67b4b3014cde7e1156b`, `versionCode` 1. Il est installé sur l’émulateur `emulator-5554`. La même identité est dans l’app du simulateur `9281CEB1-E36D-4654-91E0-3AA741F8AD10`. Ce n’est pas un téléphone Android.

### Émulateur Pixel 6

Le sélecteur système ne se pilote plus par `adb exec-out screencap` : cette capture bloque le démon tant que Photos est devant. L’arbre du sélecteur se lit avec `uiautomator dump` vers un fichier de l’appareil, et la fenêtre active avec `dumpsys window`, chaque commande coupée par le client au bout de quelques secondes.

Annulation : Retour rend `MainActivity`, le champ photo a 0 fichier. Reprise : la première vignette, puis Terminé, rend `33.jpg` (338 octets) et une miniature dans le compositeur. Publication « Repère photo QA v18 », post `fd760bba-a466-4d5d-9400-6887dfd0183d`, statut `pending`, un média dans `bokantaj-media-hold` sur `staging-bokantaj.lyann.app`. Le compte QA B ne lit pas la ligne. La suppression par l’auteur retire la ligne. L’URL média répond encore 200 : la suppression membre n’efface pas l’objet, le balayage des orphelins est le chemin différé. Pas de suppression Storage depuis le client.

### Simulateur iPhone 17 Pro

`testQaLoginSessionAndSurfaces` interroge des libellés nommés. Il ne parcourt plus tous les boutons du fil. Le passage recompilé dure 146 s et réussit (`** TEST SUCCEEDED **`).

Connexion : session QA A déjà là, feuille « Mon compte » avec `qa.a.author.stagingv2@lyann.invalid` et « Qa A. », formule Gratuit. La feuille se ferme par le bouton Fermer visible, sinon par le contrôle en haut à droite. La session est encore là après relance. Clavier ouvert dans le compositeur. Publication texte « Repere simulateur v18 », post Staging `b2cea39d-964c-42c7-aff9-1494c32f1430`, statut `approved`, aucun média, puis suppression de la ligne par l’auteur. Annonces affiche le bandeau et un corps vide. Lyanneurs s’affiche. Messages affiche Support LYANN, Qa L. et Ludivine R. ; la note du test disait encore « chargement » parce qu’elle cherchait un texte statique, alors que la ligne est un bouton. Notifications s’ouvre sur des rappels et des devis. Retour de l’arrière-plan : la feuille Finances est toujours là.

La carte expose « Carte des publications géolocalisées » pendant que l’écran dit encore « La carte arrive… ». Le GPS du simulateur est posé à 16,241, −61,534. Aucun point utilisateur n’est lu à l’écran. Le bouton « Lire la vidéo » a été touché ; la capture ne montre pas la lecture. Le bouton Photo du compositeur n’était plus là après la publication : pas de sélection photo iOS.

Captures : `/tmp/lyann-ios-ui-43-account.png`, `45-annonces.png`, `46b-carte.png`, `46c-clavier.png`, `46d-video.png`, `48-messages.png`, `49-notifications.png`, `53-resumed.png`. Journal : `/tmp/lyann-ios-uitest8.log`.

### iPhone physique

Build debug signé en automatique, équipe `WLV4WC47U2`, identité Apple Development `yoann.danier@gmail.com (CH5MK7M6PD)`, profil « iOS Team Provisioning Profile: app.lyann.mobile » `31827009-7da8-481d-a5c6-24678603e027`. Bundle `app.lyann.mobile`, version 1.0, build 10. L’app `ios-mvpu5wa4-d7e45f` est installée sur « iPhone de yoann » (`00008140-00112D0C2684801C`) et le processus démarre. La première capture montre la carte Bokantaj, les tuiles de la Guadeloupe et « 13 partages ici ». Aucun login, aucune photo, aucun message et aucune notification n’ont été pilotés sur cet appareil. Capture : `/tmp/lyann-iphone-launch.png`.

### Toujours bloqué

Migration devis Staging : non appliquée. Remboursement Stripe Test : non exécuté. Actions admin d’écriture : non cliquées. Android physique : non testé. Aucune fusion, aucun Production, aucun Stripe Live.

## V1.7 — vidéo, photo, suppression accidentelle

Les trois anomalies V1.6 ont une cause dans le code, pas dans l’émulateur.

La lecture attendait le téléchargement complet du fichier avant d’appeler `play()`. Le geste utilisateur était alors perdu, et l’affiche « Lire la vidéo » restait. Le fil ne télécharge plus les vidéos à l’avance. Un toucher crée le lecteur tout de suite et lui donne l’URL Staging : le lecteur demande lui-même les plages d’octets. Sur l’émulateur Pixel 6, paquet `fe4d298`, la vidéo a démarré (`currentTime` 0,28 s puis 2,31 s après reprise), la pause a répondu (`paused` vrai à 1,65 s), puis la reprise. L’URL lue commence par `https://staging-bokantaj.lyann.app/v1/media/`, pas par `blob:`. Le bouton « Ouvrir le lecteur » met la vidéo en plein écran (`document.fullscreenElement` est le lecteur). `exitFullscreen()` rend le fil, avec la vidéo toujours là (`currentTime` 6,78 s). Ce n’est pas un téléphone.

Le sélecteur photo s’ouvre. Le bouton « Photo » du formulaire le faisait déjà : le premier essai V1.6 tapait à côté. L’icône du compositeur appelait `input.click()`, que la WebView Android ignore. Cette icône est maintenant une étiquette du champ fichier. Un toucher sur le bouton Photo du compositeur, une fois le fil devant, ouvre `PhotopickerGetContentActivity` (Photos, Albums, vignettes). Retour ramène à LYANN. Le choix d’une vignette, l’aperçu et la publication ne sont pas terminés : la capture d’écran bloque `adb` tant que le sélecteur est ouvert. Le même principe vaut pour l’icône vidéo, l’étape photos d’une annonce dans `feed.html`, et « Changer ma photo ».

Le dialogue « Supprimer ce paiement par étape » vient des trois boutons « Supprimer » peints au chargement dans `#chatMilestoneDevisForm`, qui est fermé. Les lignes par défaut ont déjà un pourcentage, donc `rowHasData` est vrai. Un `click()` sur ce bouton invisible appelait `window.confirm` et bloquait la WebView. Le bouton ne confirme plus que s’il est réellement affiché. Une fenêtre inactive ne reçoit plus les touches (`pointer-events: none`). L’essai sur l’émulateur a cliqué le bouton caché : aucun dialogue.

Le simulateur se pilote par `xcodebuild test` et `LyannSmokeUITests`, pas par `Simulator.app`. Le retour du clavier envoie la connexion. Le fil membre apparaît : Profil, Fil, Carte, Messages, Notifications, et les affiches « Lire la vidéo ». La session est encore là au lancement suivant. La suite du test s’arrête : le fil expose des centaines de boutons d’accessibilité, et XCUITest les résout un par un. GPS, carte, photo, clavier hors connexion et reprise ne sont donc pas rejoués jusqu’au bout. L’iPhone physique n’est pas branché. L’Android physique n’est pas testé.

Le paquet reconstruit sur `fe4d298cf49385b58c414da9b0e682ccdbba9e39` porte l’identité `ios-mvps4sca-6fc9a0`, le hash de bundle `eff1984d3c7c2dfe50d79bd6372daad68c265ecc82bd8105f63fccede7078d08`, le backend `https://staging-bokantaj.lyann.app` et le verrou `tdktfbtqceldlaeqjtow`. Les copies iOS et Android sont identiques. L’APK debug a le SHA-256 `4feb0c12e1f157439df31b9aafb4047785ceb690d017830009be2c9d7e65b483`. Il est installé sur l’émulateur `lyann_api36`. La WebView confirme ce SHA. L’application du même arbre est lancée sur l’iPhone 17 Pro `9281CEB1-E36D-4654-91E0-3AA741F8AD10`.

Le passage CI de `5b11afb` a trois checks verts et `chromium-qa` rouge : le test de forme cherchait encore un `await` avant `play()`. La lecture reste dans le même tour que le toucher. La mesure du cadre se fait ensuite. `fe4d298` a les quatre checks verts.

La migration devis et le remboursement Stripe Test restent bloqués comme en V1.5. Aucune fusion, aucun Production, aucun Stripe Live.

Le paquet `490d497` est installé sur un émulateur Pixel 6 (Android 16) et sur le simulateur iPhone 17 Pro. La WebView Android et le fichier `lyann-native-build.json` embarqué dans l’app iOS portent le verrou Staging. Il n’y a pas d’IPA, pas d’AAB signé, pas d’iPhone branché, pas de téléphone Android physique. La migration devis et le remboursement Stripe Test restent bloqués comme en V1.5. Aucune fusion vers `main`, aucun déploiement Production, aucun Stripe Live.

## V1.6 — émulateur Android et simulateur iOS

Source `490d497df76f1a5d9214a498ffe19fe505ad88ef`. Les checks de ce commit étaient verts avant cette passe. Aucun nouveau commit n’a été poussé.

| Champ | Valeur |
| --- | --- |
| Build id | `ios-mvppim4h-dfca5b` |
| Compilé le | `2026-10-26T20:26:15.807Z` |
| SHA source | `490d497df76f1a5d9214a498ffe19fe505ad88ef` |
| Version | `1.0` (`versionCode` Android 1, build iOS 10) |
| Hash des assets | `2464c33f2180a054f5d4e575cf5787dc818372d5a8176e8dc8e1c86ccc6e49ad` |
| Backend | `https://staging-bokantaj.lyann.app` |
| Supabase | `tdktfbtqceldlaeqjtow` |
| APK | `android/app/build/outputs/apk/debug/app-debug.apk` |
| SHA-256 du fichier | `8738b70dfb55af8725f9a1a96963b66e14db897845dfbba66a1f273db92afc06` |
| Signature | Android Debug, la même identité que V1.5 |
| iOS simulateur | `Debug-iphonesimulator/App.app`, `CODE_SIGNING_ALLOWED=NO`, build Xcode réussi |

L’émulateur est `lyann_api36`, Pixel 6, API 36, arm64. Un APK déjà présent avait `versionCode` 13 ; `adb install -r` a été refusé, puis l’installation avec autorisation de downgrade a réussi. L’application testée est bien `versionCode` 1. Ce n’est pas un téléphone.

### Matrice

| Parcours | Web réel | iOS simulateur | iPhone physique | Android émulateur | Android physique |
| --- | --- | --- | --- | --- | --- |
| Ouverture | déjà validé avant V1.6 | écran d’accueil invité, capture `ios-01-launch.png` | non exécuté | carrousel invité, puis shell membre | non testé |
| Connexion et déconnexion QA | déjà validé | non exécuté | non exécuté | session ouverte puis fermée | non testé |
| Bokantaj, publication, carte | déjà validé | non exécuté | non exécuté | texte publié puis retiré ; carte Guadeloupe affichée | non testé |
| GPS et quartier | déjà validé | non exécuté | non exécuté | position simulée `16.241,-61.534` ; partage de quartier arrondi à 3 décimales | non testé |
| Annonces et Lyanneurs | déjà validé | non exécuté | non exécuté | les deux pages s’ouvrent ; une annonce QA est visible ; le détail n’a pas été confirmé | non testé |
| Messagerie et notifications | déjà validé | non exécuté | non exécuté | liste réelle (Support, conversations) ; modale Notifications peuplée | non testé |
| Profil | déjà validé | non exécuté | non exécuté | fiche QA A., Basse-Terre, Guadeloupe | non testé |
| Clavier et défilement | déjà validé | non exécuté | non exécuté | clavier système dans le compositeur ; défilement exécuté | non testé |
| Galerie | déjà validé côté web | non exécuté | non exécuté | le champ photo est présent ; le sélecteur Android ne s’est pas ouvert | non testé |
| Vidéo | déjà validé côté web | non exécuté | non exécuté | les affiches « Lire la vidéo » sont visibles ; la lecture n’a pas démarré pendant l’observation | non testé |
| Arrière-plan et reprise | non repris ici | non exécuté | non exécuté | retour au premier plan, page visible | non testé |
| Perte et retour réseau | non repris ici | non exécuté | non exécuté | requête coupée, puis identité Staging HTTP 200 | non testé |

Les captures sont dans `artifacts/rc-v16/`. Un dialogue natif « Supprimer ce paiement par étape » est apparu après un toucher hors parcours ; il a été annulé. Aucun paiement n’a été retiré.

### iOS

Le simulateur iPhone 17 Pro `9281CEB1-E36D-4654-91E0-3AA741F8AD10` a reçu le même paquet. L’application s’ouvre sur l’accueil invité. `Simulator.app` n’est pas ouvrable dans cet environnement, donc les touches de connexion, caméra, GPS, notifications, clavier, vidéo et reprise n’ont pas été faites sur le simulateur. Ces parcours ne sont pas validés.

Pour l’iPhone physique : brancher l’appareil, le déverrouiller, accepter « Faire confiance à cet ordinateur », puis dans Xcode ouvrir `ios/App/App.xcodeproj`, choisir la cible App et l’iPhone, et lancer avec l’équipe `WLV4WC47U2` déjà réglée. Aucun certificat Apple Distribution et aucun profil ne sont installés : Xcode peut créer un profil de développement seulement après cette confiance. TestFlight reste impossible. Ne pas lancer un Archive.

### Staging laissé en l’état

La migration `59_revise_sent_quote_p0001.sql` n’est toujours pas appliquée : le jeton de gestion répond 401, et aucun mot de passe Postgres n’est disponible. Le conflit de version n’a pas été rejoué. Le remboursement reste `EXECUTION_DISABLED`. Les droits d’abonnement n’ont pas été réessayés au-delà de `effectivePlan`. Le nettoyage média après suppression de compte reste celui de V1.4. Les boutons admin Mika, génération, export, suspension, remboursement et attribution Pro n’ont pas été actionnés.

### Stores

Pas de publication. Pas de keystore d’upload, donc pas d’AAB. Pas de certificat Distribution, donc pas d’IPA. La signature debug Android et la signature simulateur iOS sont les seules produites.

## V1.5 — migration, remboursement, APK

### Devis, version périmée

Le fichier `59_revise_sent_quote_p0001.sql` ne contient que `revise_sent_quote`. Les deux refus de version utilisent `P0001`, avec un `lock_timeout` de 4 s. `scripts/rc-v15-apply-quote-errcode.js` refuse l’identifiant Production, lit le projet `tdktfbtqceldlaeqjtow`, enregistre l’ancienne définition, puis n’écrit que si elle contient encore `40001`.

L’appel Management API a répondu HTTP 401. Le seul jeton trouvé, dans un autre clone, est rejeté. Aucun mot de passe Postgres n’est présent. Aucune écriture Staging n’a eu lieu. Le conflit de version n’a donc pas été rejoué : l’appel actuel expire encore. Le retour arrière prévu est `artifacts/rc-v15/revise_sent_quote.rollback.sql`, écrit seulement après une lecture réussie de la fonction déployée.

### Remboursement Stripe Test

`preTransferRefundExecutionEnabled()` reste `false`. Un client ne peut pas l’ouvrir. Le grant actif ne correspond qu’au paiement `9af9963d-d5a6-40d3-bc8d-fc9fbf2f0175`, absent de Staging. Les paiements historiques listés restent interdits. Aucun remboursement n’a été exécuté, et le verrou n’a pas été élargi.

### Android

JDK Temurin 21.0.12 : `~/Library/Java/lyann-jdk-21/Contents/Home`. Android SDK et Gradle 8.14.3 sont utilisés. `./gradlew assembleDebug` a réussi.

| Champ | Valeur |
| --- | --- |
| Fichier | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Taille | 29 Mo |
| SHA-256 du fichier | `07f0cf854a76b01e068683489dc541863cf21fbd246b756685e1a1575ff6e940` |
| Signature | Android Debug, certificat SHA-256 `b94e23e32389a6a4b1c987ea09bd12a20373f706ed7e61c14f48b5ef66acd2ee` |
| Version | `1.0` (`versionCode` 1) |
| SHA du paquet web | `3435372fcced2d65b0879519a92f218e9bd9cf56` |
| Build id | `ios-mvpo0omh-5a6365` |
| Hash des assets | `76555f229ae28c8b05b27f12a18a539abec5d1ec3bc7034887fc151c468ce5ca` |
| Backend | `https://staging-bokantaj.lyann.app` |
| Supabase | `tdktfbtqceldlaeqjtow` |
| Compilé le | paquet web `2026-10-26T19:44:19.623Z`, APK le 26 oct 2026 21:00 heure locale |

Ce n’est pas un AAB de Play Internal. La config `release` signe seulement si `LYANN_ANDROID_KEYSTORE`, `LYANN_ANDROID_KEYSTORE_PASSWORD`, `LYANN_ANDROID_KEY_ALIAS` et `LYANN_ANDROID_KEY_PASSWORD` sont fournis. Pour créer l’identité d’upload, hors du dépôt : `keytool -genkeypair -v -keystore lyann-upload.jks -alias lyann -keyalg RSA -keysize 2048 -validity 10000`. Conserver le fichier et les mots de passe hors git, avec une copie de secours. Play App Signing garde la clé d’application ; cette clé ne sert qu’à l’envoi.

### iOS

Xcode 27.1. Bundle `app.lyann.mobile`, équipe `WLV4WC47U2`, signature automatique, version `1.0`, build `10`, identité `iPhone Developer`. Aucun profil d’approvisionnement n’est installé et `PROVISIONING_PROFILE_REQUIRED` vaut YES. Il n’y a pas de certificat Apple Distribution. Un Archive TestFlight ne peut pas être exporté. Aucun contournement n’a été fait.

### Garde de recette

`assertRecipeNativeBundle` refuse un paquet construit avec `LYANN_RUNTIME=staging` s’il vise `gzispjfoywklpqatjyop`, un autre projet, ou un backend autre que `staging.lyann.app` et `staging-bokantaj.lyann.app`. Test : `tests/native-build-identity.test.js`.

## V1.4 — back-office, compte, devis, builds

Le passage V1.4 a validé des lectures et quelques écritures admin sur Staging, la création, la modification et l’annulation d’un devis, le changement de rôle d’un compte QA, et la suppression de ce compte.

## V1.4 — back-office, compte, devis, builds

Commit du code : `3435372fcced2d65b0879519a92f218e9bd9cf56`. Preuve `artifacts/rc-v14/pass.json` : 76 cas, 0 échec, le 26 oct 2026. API `127.0.0.1:8098`, `isolation=STAGING_ISOLATED`, Supabase `tdktfbtqceldlaeqjtow`, Stripe test.

| Fonction | Statut | Preuve |
| --- | --- | --- |
| 18 ressources `/v1/admin/ops`, dont territoires et feature flags | OK | HTTP 200 admin, HTTP 403 pour le membre QA |
| Écrans action, marketplace, utilisateurs, maison, territoires, feature flags | OK | Playwright, HTTP 200. Le 400 de V1.3 était `feature-flags`, ressource absente, corrigée dans `3435372` |
| Filtre utilisateurs | OK | une recherche inconnue ne laisse pas la liste |
| Ticket d’aide créé, relu, fermé, seconde fermeture | OK | ticket QA fermé. Le membre reçoit 403 |
| Profils maison | OK | 50 profils lus. Le membre reçoit 403 |
| Devis créé, modifié à 25, refusé par le client, second refus refusé | OK | le prestataire seul peut modifier |
| Révision avec une version périmée | KO sur Staging | la fonction déployée lève `40001`. PostgREST réessaie jusqu’au timeout. La source `51_quote_modifications_and_safety.sql` utilise maintenant `P0001`. Cette migration n’a pas été appliquée : aucune URL de base n’est disponible |
| Remboursement d’un jalon `FUNDED` | KO volontaire | HTTP 409 `EXECUTION_DISABLED`. Le moteur est codé `return false` et le grant ne vise qu’un paiement historique. Aucun contournement, aucun Stripe Live |
| Rôle d’un compte QA passé à `EMPLOYEE` | OK | `POST /v1/admin/ops/users/:id/role`. Le membre reçoit 403. `OWNER` est refusé. L’ancien RPC, qui lit `profiles.role`, refuse aussi l’admin du back-office |
| Formule expirée | OK | `effectivePlan` renvoie `FREE`. Pas d’achat Sandbox |
| Suppression d’un compte `@lyann.invalid` créé pour l’essai | OK | sessions `revoked`, deux JWT refusés, reconnexion impossible, avatar retiré, jeton push désactivé puis absent, profil absent, journal `ACCOUNT_DELETED` |
| Conservation | OK documentée | paiements, devis, jalons, missions, factures, pièces de chat et preuves de signalement ne sont pas effacés |
| Les 33 rubriques, chaque bouton d’écriture | NON TESTÉ | les boutons Mika, génération éditoriale, export, suspension et remboursement n’ont pas été actionnés |
| IPA, AAB Play, appareil, Sandbox store | NON TESTÉ | voir les builds |

### Builds du commit `3435372`

| Champ | Valeur |
| --- | --- |
| Build id | `ios-mvpo0omh-5a6365` |
| Compilé le | `2026-10-26T19:44:19.623Z` |
| SHA source | `3435372fcced2d65b0879519a92f218e9bd9cf56` |
| Version | `1.0` |
| Hash bundle | `76555f229ae28c8b05b27f12a18a539abec5d1ec3bc7034887fc151c468ce5ca` |
| Backend | `https://staging-bokantaj.lyann.app` |
| Supabase | `tdktfbtqceldlaeqjtow` |
| iOS et Android | même `www`, sans référence Production |

Signature : deux identités Apple Development, zéro Apple Distribution, zéro profil d’approvisionnement, zéro keystore d’upload Android. Le keystore debug local `~/.android/debug.keystore` existe. `./gradlew assembleDebug` n’a pas démarré : aucune JVM n’est installée sur cette machine. TestFlight exige un certificat Apple Distribution et un profil App Store. Play Internal exige un keystore d’upload et un JDK. Aucun certificat n’a été inventé.

## V1.3 — paiements, back-office, cycle de vie, builds

Le passage V1.3 a exécuté Stripe Test sur Staging, une libération réelle, une suppression de compte QA jetable, et un inventaire des 33 rubriques. Il ne validait pas encore les écritures du back-office, le remboursement exécuté, le changement de rôle, ni un binaire installé.

## V1.3 — paiements, back-office, cycle de vie, builds

Code produit sous test : `013f04b6e41c1b0ec410559fcc53c9f693d96ad2`. Ce passage n’a pas modifié le produit. Il ajoute le script `scripts/rc-v13-followup.js` et les preuves `artifacts/rc-v13/followup.json`.

API locale `http://127.0.0.1:8098` : `supabase_ref=tdktfbtqceldlaeqjtow`, `isolation=STAGING_ISOLATED`, Stripe `sk_test_` / `pk_test_`.

### Classe des preuves

| Classe | Ce qui a été fait |
| --- | --- |
| Tests simulés | Playwright CI et local sur données mockées. Ils ne prouvent pas Supabase. |
| Tests connectés Staging | Auth QA, devis, jalons, Stripe Test, webhooks signés, libération, suppression d’un compte créé pour l’essai, lecture admin. |
| Tests natifs simulés | Aucun nouveau passage simulateur dans V1.3. Le paquet local est identifié, non lancé. |
| Appareils physiques | Aucun. |
| Sandbox Apple / Google | Aucun achat, aucune restauration. |

### CI

`013f04b` puis le commit de preuves `b0935e9f602ed542c4198ba3b8544b704efb8b79` ont chacun quatre checks terminés en succès : `architecture-audit`, `chromium-qa`, `android-qa`, Vercel Preview Comments. Les runs de `b0935e9` : architecture [40384733210](https://github.com/yoyoonthetrack/LYAN/actions/runs/40384733210), Chromium [40384732922](https://github.com/yoyoonthetrack/LYAN/actions/runs/40384732922), Android [40384732882](https://github.com/yoyoonthetrack/LYAN/actions/runs/40384732882).

Le statut combiné Vercel était déjà `success` pendant que Chromium de `013f04b` tournait encore. Il n’a pas été pris pour une CI verte. Chromium et Android se sont quand même relancés sur `b0935e9`. Les traces Playwright restent demandées par le workflow en cas d’échec. Ce passage n’a pas d’échec à archiver.

### Stripe Test et devis

`node scripts/saved-cards-staging-scenarios.js` : 23 réussis, 0 échec, cible `tdktfbtqceldlaeqjtow`, Stripe `test`. Le script crée une invitation, un devis (`create_request_quote`), l’accepte (`accept_request_quote`), puis le jalon.

| Parcours | Résultat |
| --- | --- |
| Deux appels `create-milestone-intent` | même PaymentIntent |
| Confirmation carte test `4242`, `livemode` faux | `succeeded` |
| Second confirm | pas de second débit |
| Webhook signé | jalon `FUNDED`, paiement `SUCCEEDED`, montant inchangé |
| Webhook sans signature | HTTP 400 |
| Carte refusée | `card_declined`, jalon non financé |
| 3DS `pm_card_authenticationRequired` | `requires_action`, jalon non `FUNDED` |
| Carte enregistrée | visible pour le titulaire, invisible et non supprimable par un autre membre, puis détachée |
| Prestataire marque le jalon réalisé | `COMPLETED` |
| Client libère | HTTP 200, jalon `RELEASED`, `transfer_status=TRANSFERRED`, identifiant Stripe `tr_`, brut 4149 cents, net prestataire 3880 |
| Seconde libération | HTTP 200, idempotente |
| Prestataire qui tente de libérer | HTTP 403 |
| Jeton invalide sur la libération | HTTP 401 |
| Remboursement d’un jalon sans paiement réussi | HTTP 409 `NOT_FUNDED` |
| Remboursement d’un jalon encore `FUNDED` | HTTP 409 `EXECUTION_DISABLED` |

L’édition d’un devis ou d’un montant de jalon déjà créé n’a pas été exécutée. Le remboursement Stripe d’un paiement réussi n’a pas été exécuté : le grant de remboursement avant transfert est inactif (`active: false`), et l’appel refuse sans écrire. Trois jalons `FUNDED` de ces essais restent en Staging. Ce sont des paiements test, pas des fonds réels.

### Back-office

Les 33 sections s’ouvrent avec la session admin Staging et deviennent `active`. Vingt-neuf déclenchent au moins une réponse HTTP 200 (`/v1/admin/ops`, centre de contrôle, stats). Quatre n’ont rien appelé dans la fenêtre observée : action, marketplace, users, maison. `sec-territories` a reçu un HTTP 400 sur `/v1/admin/ops`. Le journal d’audit a répondu 200, sans création d’une ligne d’audit par une écriture de ce passage.

Treize sections montrent des boutons (export, génération éditoriale, tâches Mika, remboursement, invitation, suspension, offre Pro). Ces boutons n’ont pas été actionnés. Aucune rubrique n’est validée : l’ouverture et la lecture ne prouvent pas une modification, un filtre soumis, une persistance ou un droit d’écriture.

Le compte QA C, après login sur `admin.html`, ressort `UNAUTHENTICATED`. Il n’est pas `AUTHORIZED`. La session membre n’est pas restée ouverte pendant le contrôle admin.

### Cycle de vie

| Parcours | Résultat |
| --- | --- |
| Compte jetable `@lyann.invalid`, créé pour cet essai | profil `first_name` modifié et relu |
| `POST /v1/auth/delete-account` | HTTP 200, `ok: true` |
| Nouvelle connexion | refusée |
| Utilisateur auth | absent. Pas de suppression des comptes QA A, B ou C |
| Jeton invalide | HTTP 401 |

Le handler anonymise le prénom, le nom et l’avatar, puis supprime l’utilisateur auth. Il ne parcourt pas le stockage média et n’applique pas une conservation réglementaire distincte. Ce compte n’avait pas de média. La déconnexion d’une session encore valide, l’expiration réelle d’un JWT, le changement de rôle et le changement d’abonnement n’ont pas été exécutés.

### Builds

Le paquet local iOS et le paquet Android restent ceux de V1.2. Aucun outil de signature Distribution ou de keystore n’est apparu, donc aucun IPA ni AAB n’a été produit.

| Champ | Valeur |
| --- | --- |
| Build id | `ios-mvpmc13z-9215ed` |
| Compilé le | `2026-10-26T18:57:09.789Z` |
| SHA source | `6b808c3dfca23a5f64ce1398ad369666260c8b81` |
| Version | `1.0` |
| Hash bundle | `4f4e84fe72aef10d90f4a7985a51d9328e065b6218bfb34a46c6fc9650144616` |
| Backend | `https://staging-bokantaj.lyann.app` |
| Supabase | `tdktfbtqceldlaeqjtow` |
| Signature | une identité Apple Development. Aucune Apple Distribution. Aucun keystore Android |
| Appareil | non installé |

Le HTML du paquet ne contient pas la référence Production. Une compilation sans `LYANN_RUNTIME=staging` et sans verrou `tdktfbtqceldlaeqjtow` retomberait sur Production. Cette compilation n’a pas été lancée. Le SHA du paquet est `6b808c3`, pas `013f04b` : les commits intermédiaires ne changent que le rapport.

## V1.2 — preuves Staging et builds

## V1.2 — preuves Staging et builds

Commit du code testé et compilé : `6b808c3dfca23a5f64ce1398ad369666260c8b81`.

API locale `http://127.0.0.1:8098/v1/runtime/identity` : `supabase_ref=tdktfbtqceldlaeqjtow`, `isolation=STAGING_ISOLATED`. Stripe dans `.env.staging-v2` : clés test, pas live. Le garde refuse Production.

`node scripts/rc-v12-staging-pass.js` : 20 cas, 0 échec. Preuve `artifacts/rc-v12/staging-pass.json`.

| Parcours | Résultat |
| --- | --- |
| Connexion des trois comptes QA existants | OK |
| A publie un repère arrondi `16.241,-61.534` via RLS | OK, statut `pending` |
| B ne le voit pas tant qu’il n’est pas approuvé | OK |
| Admin approuve, B le voit, admin masque, B ne le voit plus | OK |
| A écrit à B, B lit, C ne lit pas et ne peut pas écrire à la place de A (`42501`) | OK |
| Login UI de A sur `/feed.html`, publication persistée `pending`, invisible pour B | OK |
| HTML servi verrouillé Staging, sans référence Production | OK |
| Admin réel autorisé, 33 sections s’ouvrent | OK (navigation, pas chaque bouton) |
| Compte QA C sur l’admin | non autorisé (`UNAUTHENTICATED`) |
| Lignes QA de ce passage supprimées | OK |

Les 33 sections ont été ouvertes dans l’admin réel. Les boutons d’écriture (collecte éditoriale, paiements, suppressions) n’ont pas été actionnés.

Build natif, iOS et Android byte-identiques, non installé sur appareil :

| Champ | Valeur |
| --- | --- |
| Build id | `ios-mvpmc13z-9215ed` |
| Compilé le | `2026-10-26T18:57:09.789Z` |
| SHA | `6b808c3dfca23a5f64ce1398ad369666260c8b81` |
| Version | `1.0` |
| Hash bundle | `4f4e84fe72aef10d90f4a7985a51d9328e065b6218bfb34a46c6fc9650144616` |
| Backend | `https://staging-bokantaj.lyann.app` |
| Supabase | `tdktfbtqceldlaeqjtow` |
| `feed.html` iOS = Android | oui, sha256 `5309c2c3095486386f40776f347cb476592ca9f8efaa94dd30a8ecbebe6d4153` |
| Production ou `service_role` dans le HTML | non |
| Correctif de fil présent dans `script.js` du paquet | oui |

Une identité Apple Development est présente. Aucune identité Apple Distribution n’est listée, et aucun keystore Android n’est dans le dépôt. TestFlight et Play Internal ne sont pas préparés. Le paquet `ios-mvp6mel3-079240` est remplacé localement par celui-ci. Ce n’est pas une validation appareil.

## V1.1 — état antérieur

Aucun défaut P0 confirmé n’est resté ouvert dans le périmètre corrigé. L’absence de P0 confirmé ne vaut pas une validation.

## Versions

| Élément | Valeur vérifiée |
| --- | --- |
| Dépôt | `yoyoonthetrack/LYAN` |
| Branche RC | `release/lyann-rc-v1-1` |
| Base | `80ceae7c35bcc7a1bbe5160f68e604bd2350ec20` (`origin/feature/bokantaj-map-v1`) |
| Sauvegarde des correctifs locaux | `3ec921ace26655ff948b606dcf45957f88ab521e` |
| Correctifs fil, traces, identité de build | `e1bf7d671e9855e3dae7cc3cb0ed4da35e75c2d9` |
| PR brouillon | https://github.com/yoyoonthetrack/LYAN/pull/13 (base `feature/bokantaj-map-v1`, pas `main`) |
| PR d’audit précédente | https://github.com/yoyoonthetrack/LYAN/pull/12 (`audit/rc-v1-evidence-gates`, non fusionnée) |
| `main` local | `f193272`, 46 commits derrière `origin/main`. Aucune fusion. |
| Worktree `feature/bokantaj-map-v1` | `/Users/mac/Developer/lyann` reste sur `f935386`. Non modifié. |

Le dépôt de travail était en HEAD détaché sur `80ceae7`, avec 1 861 lignes non commitées. Ces fichiers ont été commités sur la branche RC. Les captures `artifacts/` et `work/` sont restées non suivies.

`origin/audit/rc-v1-evidence-gates` (`a18842e`) ajoute la matrice d’évidence et la conservation des traces Playwright. La conservation des traces est reprise dans `e1bf7d6`. La branche d’audit n’a pas été fusionnée telle quelle, pour ne pas empiler trois commits identiques.

### Environnements

| Rôle | Identifiant | Isolation constatée |
| --- | --- | --- |
| Supabase Production | `gzispjfoywklpqatjyop` | Refusé par le garde Staging dans le code et les tests unitaires |
| Supabase Staging | `tdktfbtqceldlaeqjtow` | Seul projet accepté quand `LYANN_RUNTIME=staging` ou Vercel preview |
| Backend Staging connu | `https://staging-bokantaj.lyann.app` | Une des deux origines HTTPS autorisées pour un build mobile Staging |
| Web Production | `https://lyann.app` | Le runtime déployé sur cet hôte résout le projet Production |

Les tests `tests/staging-v2-isolation.test.js` passent (27 tests avec la visibilité publique et l’identité de build). Ils prouvent le garde dans le code. Ils ne lisent pas les variables réellement présentes sur Vercel. Aucun `.env`, `.env.local` ni lien `.vercel/project.json` n’est dans ce clone. Les secrets n’ont pas été cherchés ailleurs et ne sont pas recopiés ici.

Le paquet embarqué iOS et le paquet Android sont le même fichier `feed.html` :

| Champ | Valeur dans le paquet exécutable local |
| --- | --- |
| Build id | `ios-mvp6mel3-079240` |
| Compilé le | `2026-10-26T11:37:19.958Z` |
| Version application (projets natifs) | `1.0` (`MARKETING_VERSION`, `versionName`) |
| SHA Git du paquet | absent de ce paquet |
| Hash du bundle | absent de ce paquet |
| `LYANN_ASSET_VERSION` | `fd3dc536a858` |
| Backend | `https://staging-bokantaj.lyann.app` |
| Supabase | `tdktfbtqceldlaeqjtow` |

Ce paquet contient le libellé visible « Nom du quartier » et `zoomPosition: 'bottomright'`. Il ne contient pas le garde « pagination cursor unavailable » de `e1bf7d6`, et il appelle encore `ensureVideoPosterOriented` sur toutes les vidéos du fil. Les dossiers sources iOS et Android ne sont donc pas synchronisés avec le commit RC. Recompiler sans variables Staging retirerait le verrou et laisserait un binaire natif sans verrou retomber sur Production. Cette compilation n’a pas été lancée.

`build_mobile.js` écrit désormais `lyann-native-build.json` avec l’identifiant, la date, le SHA Git, la version, le hash du bundle (hors fichier d’identité), le projet Supabase injecté et le backend. Le HTML mobile reçoit `window.LYANN_NATIVE_BUILD` avec les mêmes champs sauf le hash, calculé après génération du HTML. Aucun build natif n’a été produit avec ce tampon.

## Corrections

| Commit | Pourquoi |
| --- | --- |
| `3ec921a` | Le nom de quartier était un libellé masqué. Le zoom de la carte passait sous la bande de catégories. Conservé aussi : onglets Fil/Carte collés, filtre de territoire, en-têtes, vidéos, tests associés. |
| `e1bf7d6` | Un `cursor()` absent vidait un fil déjà chargé. Chaque vidéo était téléchargée en Range avant sa fenêtre de 20. Les traces Playwright sont conservées en cas d’échec. L’identité de build natif est explicite. |

## Preuves locales

Commande statique `http://127.0.0.1:8090`, le même mode que la CI navigateur. Ces tests mockent l’API. Ce ne sont pas des preuves Supabase.

| Suite | Résultat |
| --- | --- |
| `bokantaj_map_web_ios.spec.js` + `bokantaj_map_android_touch.spec.js` + `bokantaj_feed_preload.spec.js` | 15 réussis, après correctif |
| Visibilité publique, modération navigateur, cloche, formulaire de compétence | 8 réussis |
| `explorer_contact_back.spec.js` | 2 ignorés : le fichier exige un Staging approuvé, absent de ce clone |
| `node --test` publication, territoire, politique vidéo | 23 réussis |
| `node --test` visibilité, isolation, identité de build | 27 réussis |
| `npm test` (porte architecture, parité Web/mobile, 33 rubriques en statique) | PASS |

Le premier passage du préchargement échouait : le fil affichait « Le Bokantaj est encore calme… » parce que l’échec de `cursor()` remplaçait les publications. Après correction, le test attendait 20 médias et en voyait 21 : `ensureVideoPosterOriented` range-fetchait la vidéo hors fenêtre, en plus du téléchargement de la carte. Les deux causes sont corrigées dans `e1bf7d6`. Le test n’a pas été assoupli.

## CI GitHub sur `e1bf7d6`

Déclenchée par la PR 13.

| Check | Résultat |
| --- | --- |
| `architecture-audit` | success — https://github.com/yoyoonthetrack/LYAN/actions/runs/40380086237 |
| `chromium-qa` | success — https://github.com/yoyoonthetrack/LYAN/actions/runs/40380086256 |
| `android-qa` | encore in progress au relevé manuel sur `e1bf7d6`. L’événement CI de `b5a3495` dit 5 checks verts sans les nommer. |
| Vercel | deployment completed, tableau https://vercel.com/yoyo-d85d/lyan/AQEHK5oezAPWrf5FiDVD84YLHoaw |
| Vercel Preview Comments | success |

URL annoncée par Vercel : `https://lyan-git-release-lyann-rc-v1-1-yoyo-d85d.vercel.app`. Un `GET /feed` répond 302 vers l’authentification SSO Vercel. Le HTML de l’application n’a pas été lu. Le projet Supabase servi par cette Preview n’est donc pas vérifié. Ne pas l’utiliser comme Staging tant que ce point n’est pas lu dans la page.

## Matrice fonctionnelle

Statuts : OK seulement avec une exécution réelle. Les tests Playwright ci-dessus sont marqués OK (mock), jamais comme un parcours Staging.

| Fonction | Plateforme | Scénario exécuté | Statut | Preuve |
| --- | --- | --- | --- | --- |
| Carte Fil/Carte, filtre, repère, zoom | Web Chromium desktop et 390×844 | Spec carte, données mockées | OK (mock) | 15 tests Playwright locaux |
| Publication avec quartier approximatif et point exact | Web + émulation Pixel 7 | Clic, champ visible, payload `exact: false` puis GPS exact | OK (mock) | mêmes specs |
| Confidentialité GPS (arrondi quartier) | Web | `publicCoordinate` sur le payload mocké | OK (mock) | spec GPS |
| Préchargement média par fenêtres de 20 | Web 390×844 | 25 publications mockées, scroll au 15e | OK (mock) | `bokantaj_feed_preload.spec.js` après `e1bf7d6` |
| Fil public sans pending/rejeté | Web | Spec visibilité + test unitaire du filtre approved | OK (mock / statique) | specs et `bokantaj-public-visibility.test.js` |
| Modération : commentaire masqué retiré du tiroir ouvert | Web | Test unitaire du rendu | OK (statique) | pas de session admin Staging |
| Publication masquée absente du fil d’une autre session en cache | Web / iOS / Android | Non exécuté contre Supabase | NON TESTÉ | le client refetch toutes les 8 s avec `force`, non observé en base |
| Auth inscription, Google, Apple, session expirée, récupération | Web / iOS / Android | Non exécuté | NON TESTÉ | pas de comptes de test dans ce clone |
| Annonces, recherche, contact, statuts | Web | Spec contact ignorée | NON TESTÉ | `explorer_contact_back` skip |
| Lyanneurs, badges, avis | Web | Non exécuté sur Staging | NON TESTÉ | |
| Messagerie, pièces jointes, lecture, hors ligne | Web / natif | Non exécuté | NON TESTÉ | audits d’architecture seulement |
| Devis, jalons, paiement, libération | Web | Non exécuté | NON TESTÉ | |
| Stripe Test, webhooks, idempotence, double clic | API | Non exécuté | NON TESTÉ | aucune clé utilisée |
| Abonnements Gratuit / Plus / Pro, restauration native | Web / iOS / Android | Non exécuté sur Sandbox | NON TESTÉ | un achat Sandbox n’est pas simulé ici |
| Profil, suppression de compte, médias | Web | Non exécuté | NON TESTÉ | |
| Back-office, 33 rubriques | Web admin | Comptage statique des `data-section` | NON TESTÉ en runtime | `admin-zero-dead-controls-audit.js` : static ok (33) |
| RLS, uploads, webhooks, journal d’audit | Staging | Garde d’isolation unitaire seulement | NON TESTÉ en base | |
| Caméra, galerie, GPS, push, rotation, arrière-plan | iOS / Android appareil | Non exécuté | NON TESTÉ | humain / appareil requis |
| Navigation, clavier, formulaire de compétence | Web 390×844 | Spec formulaire | OK (mock) | `profile_skill_form.spec.js` |
| Paquet natif = source RC | iOS et Android locaux | Comparaison `feed.html` / `script.js` / `bokantaj-map.js` | KO | le paquet `ios-mvp6mel3-079240` est en retard sur `e1bf7d6` |

Les 33 rubriques présentes dans `admin.html` : overview, action, marketplace, users, maison, lyanneurs, requests, missions, services, quotes, chat, editorial, bokantaj, agents, mika, content, support, disputes, notifications, reviews, finances, payouts, subscriptions, protection, invoices, taxonomy, team, rbac, audit-logs, feature-flags, territories, health, user-detail. Aucune n’a été cliquée contre Staging dans cette session.

## Anomalies

| Id | Classe | État | Détail |
| --- | --- | --- | --- |
| RC-1 | P1 | corrigé dans la source, encore dans le paquet natif | Le fil devenait vide si `cursor()` lançait une exception après un chargement réussi. |
| RC-2 | P1 | corrigé dans la source, encore dans le paquet natif | Toutes les vidéos du fil étaient range-fetchées dès le rendu, hors de la fenêtre de 20. |
| RC-3 | P1 | corrigé dans `3ec921a` et présent dans le paquet `ios-mvp6mel3` | Champ quartier masqué et zoom de carte couvert. Vérifié par Playwright sur la source RC, pas sur un appareil. |
| RC-4 | P1 | fermé dans le paquet local, non installé | `ios-mvpmc13z-9215ed` porte `6b808c3` et les correctifs RC-1 et RC-2. Pas d’installation appareil, pas d’envoi store. |
| RC-5 | P1 | ouvert pour la décision | Les parcours membres réels, la modération Bokantaj en base, Stripe Test et les 33 rubriques ne sont pas exécutés. |

Aucun P0 confirmé (perte de données, fuite de position exacte dans les specs mockées, mélange Production observé dans un déploiement). Les risques non testés restent des bloqueurs de GO, pas des P0 inventés.

## CI, builds, Preview

- CI locale architecture : PASS sur l’arbre `e1bf7d6`.
- CI GitHub : architecture et Chromium verts sur `e1bf7d6`. Commit `b5a3495` : 5/5 checks verts. Le job Android n’est pas nommé dans cet événement.
- Builds disponibles : paquet local déjà présent `ios-mvp6mel3-079240` (Staging, 26 oct 2026 11:37 UTC), en retard sur la RC. Pas de nouvel IPA, pas d’APK de cette session, pas de TestFlight, pas de Play Internal.
- URL Preview : `https://lyan-git-release-lyann-rc-v1-1-yoyo-d85d.vercel.app`, protégée par SSO. Isolation non lue.
- `main` et Production : non touchés. Stripe Live : non activé.

## Limites et validations manuelles restantes

1. Fournir des comptes Staging (membre A, membre B, professionnel, admin, compte sans droit admin) et les variables Staging, sans les commiter.
2. Rejouer la publication, la modération, la carte et le rechargement d’une seconde session contre `tdktfbtqceldlaeqjtow`.
3. Parcourir les 33 rubriques avec un admin et avec un compte sans droit, puis vérifier la persistance et le journal.
4. Exécuter Stripe Test (paiement, échec, webhook, transfert, remboursement, double clic) uniquement en mode test.
5. Recompiler iOS et Android avec le verrou Staging explicite, relever `lyann-native-build.json`, puis tester clavier, caméra, galerie, GPS, push, vidéo, rotation, arrière-plan et achats Sandbox sur appareil. Ne pas présenter un simulateur comme un achat Sandbox.
6. Attendre la CI de la PR 13. En cas d’échec, corriger le produit ou le test, sans allonger les timeouts.
7. Lire le projet Supabase réellement injecté dans la Preview Vercel avant de l’utiliser. L’URL est derrière le SSO Vercel.
8. Conclure `android-qa` sur `e1bf7d6`. Un échec de compilation ou de toucher ne doit pas être ignoré.

## Risques résiduels

- Un binaire natif sans verrou parle à Production. Toute compilation RC doit injecter `tdktfbtqceldlaeqjtow` et refuser `gzispjfoywklpqatjyop`.
- Le cache client du fil dure 15 s, mais le rafraîchissement forcé est à 8 s. Sans observation Staging, la disparition d’une publication masquée n’est pas prouvée pour une session qui aurait des lignes en mémoire.
- Le serveur local reflète toute origine CORS. Ce comportement n’a pas été modifié. Son équivalent sur le backend déployé n’a pas été relu.
- La porte « 33 rubriques » compte les liens. Elle ne prouve pas qu’une action admin écrit en base.

## Décision

**NO-GO** pour TestFlight, Google Play Internal et une promotion Production.

L’APK debug `8738b70d…` est installé sur l’émulateur Pixel 6. Il embarque `ios-mvppim4h-dfca5b`. Le même paquet tourne sur le simulateur iPhone 17 Pro, arrêté à l’accueil. Aucun des deux n’est un essai physique.

Reste bloquant :

1. La migration `P0001` est prête et refusée par un jeton de gestion invalide. Le conflit de version expire encore sur Staging.
2. Le remboursement Stripe Test reste impossible sans élargir le grant : le seul paiement autorisé n’existe pas dans Staging.
3. Pas de certificat Apple Distribution, pas de profil, donc pas d’IPA. Pas de keystore d’upload, donc pas d’AAB Play.
4. iPhone physique non branché. Android physique non testé. Le simulateur iOS s’ouvre, sans parcours connecté : l’application Simulator n’est pas pilotable dans cet environnement.
5. La Preview Vercel reste derrière le SSO. Pas d’achat Sandbox.
