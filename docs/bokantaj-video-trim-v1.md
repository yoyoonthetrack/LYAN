# LYANN — Bokantaj V1.6 : chaîne vidéo complète (Staging)

## Statut

Le compositeur découpe au-delà de 60 secondes, compresse dans la WebView vers 720p et 10 Mo, produit une miniature JPEG, et le Fil ne charge la vidéo qu’au clic. Le serveur n’approuve une vidéo que si le MP4, la durée, la taille, le cadre, le texte et la miniature sont vérifiables ; sinon elle reste en revue humaine. Le rejet, la suppression et les fichiers orphelins de plus de 48 heures retirent les médias sur Staging uniquement. L’expiration d’un repère, y compris la règle de densité déjà en place, ne supprime ni le post ni ses fichiers. Les repères de `bokantaj_map_featured` restent sur la carte.

Limites encore ouvertes : export natif AVFoundation / Android, conservation du son lorsque la WebView n’expose pas la piste audio, et lecture HTTP `Range` sur `/v1/media`. Un MP4 déjà conforme n’est pas réencodé, donc son son est conservé. Ne pas fusionner la PR #10 vers Production avant un essai sur iPhone physique.

## Problème actuel (vérifié le 23 octobre 2026)

`api-client.js::uploadPostVideo()` rejette à la publication les fichiers MP4/MOV/WebM de plus de 10 MiB ou de plus de 60 secondes ; aucun transcodage automatique. Le fichier vidéo est actuellement envoyé inchangé à `bokantaj-media-hold` (privé, avec modération). L'utilisateur peut donc rédiger son texte puis recevoir un refus tardif.

## UX à réaliser

1. Dès la **sélection** du fichier, lire durée, taille et type sans téléversement. Ne pas attendre « Publier ».
2. Si vidéo de 70 s : ouvrir une feuille/modale **« Votre vidéo dure 1 min 10 s. Choisissez jusqu'à 60 secondes. »**
3. Montrer un aperçu de lecture, une ligne de temps avec poignées **début** et **fin** (ou curseur début + durée), la durée retenue, et les boutons **« Raccourcir la vidéo »**, **« Annuler »**.
4. Par défaut sélectionner `00:00–01:00`. Permettre par exemple `00:10–01:10` ; la durée autorisée reste de 1 à 60 secondes.
5. Si durée <=60 secondes mais taille >10 MiB : afficher « Optimiser la vidéo » et proposer la compression sans perdre le passage choisi.
6. Générer un **nouveau** MP4 compatible mobile (cible H.264/AAC, orientation respectée, son préservé, cible 720p), puis vérifier à nouveau la durée et le poids du **fichier de sortie**. Aucun upload si durée >60 s, fichier >10 MiB ou format non pris en charge.
7. Afficher le progrès réellement mesurable : préparation, conversion, vérification, puis upload. Désactiver le double clic et autoriser l'annulation si prise en charge.
8. Remplacer l'aperçu du post par l'extrait final, garder le texte, le lieu et les photos/draft existants. Sur échec, montrer un message compréhensible et **ne jamais publier silencieusement le post sans sa vidéo**.
9. La publication existante reprend avec l'upload du MP4 final vers Storage privé et une validation avant exposition publique. Ne contourner ni RLS ni modération. Les étapes de contrôle et d'approbation sont précisées ci-dessous.

## Réalisation technique attendue de Cursor

- Partager la même **UI** Web / iOS / Android, avec export natif performant lorsque la WebView est limitée.
- iOS : vérifier l'intégration d'AVFoundation / AVAssetExportSession ou d'un plugin Capacitor 8 réellement compatible, notamment le passage d'un `File` sélectionné en JavaScript vers un chemin local natif et le retour en `File` pour Supabase.
- Android : utiliser un mécanisme natif maintenu compatible avec la cible Android/Capacitor, conserver les données audio, éviter de demander des permissions de stockage excessives.
- Web : étudier l'export Web natif ou un transcodeur WASM **lazy loaded**. Vérifier les licences des dépendances avant d'intégrer un moteur GPL dans le dépôt/l'application. Ne pas dépendre d'un CDN non maîtrisé ni dégrader le chargement du Fil.
- En cas de capacité absente ou mémoire insuffisante : préserver le brouillon et expliquer comment sélectionner une version raccourcie manuellement. Ne pas simuler une réussite.
- Attention aux fichiers HEVC/MOV iPhone, orientation portrait, codecs non pris en charge, vidéo sans piste audio, et formats à fréquence variable.
- Supprimer les fichiers temporaires uniquement après succès, annulation ou expiration raisonnable ; aucune conservation inutile de la vidéo originale sur le serveur.

## Critères d'acceptation

- Vidéo 70 s, 8 MiB → découpage `00:10–01:10`, MP4 final <=60 s et <=10 MiB, musique et voix conservées, publication OK.
- Vidéo 40 s, 30 MiB → optimisation automatique puis vérification, ou message d'échec explicite sans perdre le brouillon.
- Vidéo 45 s, 5 MiB → publiée sans conversion inutile.
- Vidéo 61 s → modal immédiatement à la sélection ; jamais upload original par inadvertance.
- Annuler l'éditeur → aucun upload ; post/draft conservés.
- Test Android natif et iPhone physique ; test Web desktop/mobile ; pas seulement un build simulé. Évaluer les temps de conversion et le poids des artefacts natifs.
- Préserver la PR #10 sur Staging, pas de Production, pas de Stripe Live.

## Chaîne de traitement et règles de diffusion — à implémenter et tester

### 1. Modération vidéo : réduire l'attente, pas les protections

- État initial `pending` : le post et les médias privés ne sont visibles que par leur auteur / administrateurs autorisés, pas dans le Fil public ni sur la Carte.
- Analyser avant publication : limites de format, MIME réel, durée, taille, scan de sécurité pertinent, image(s) d'échantillonnage de la vidéo, pistes audio lorsque nécessaire. Prévoir analyse automatique asynchrone et déclenchement immédiat du traitement après enregistrement, plutôt qu'attendre exclusivement le cron à la minute.
- Les vidéos ne doivent **jamais être publiées automatiquement** si les contrôles obligatoires échouent, sont indisponibles, ou retournent un résultat douteux : les conserver `pending/held` pour une revue humaine.
- Pour une vidéo sans signal de risque et dont les contrôles automatisés sont tous concluants, étudier une approbation automatique **seulement si la politique de sécurité validée par LYANN et les exigences de la distribution mobile le permettent**. Prévoir le signalement, le blocage, le retrait administratif, un journal des décisions, et un bouton de revue humaine.
- Permettre de publier le texte rapidement si l'utilisateur a explicitement choisi un post texte indépendant de la vidéo ; **ne jamais détacher silencieusement une vidéo en attente** et diffuser un message différent de celui que l'utilisateur a voulu publier.
- Messages côté utilisateur : « Envoi de la vidéo », « Analyse de sécurité », « En attente de validation » ; ne pas qualifier un contenu de « chargé » ou « public » avant que l'état réel ne le confirme.
- Instrumenter durées upload / analyse / attente / modération et afficher dans le back-office les contenus vidéo bloqués avec leur raison. Tests de refus, attente, approbation, signalement, masquage, et nouvelle modération après modification.

### 2. Miniature optimisée et lecture volontaire

- Produire **une seule miniature** légère (JPEG ou WebP, ~320–640 px de large, taille cible <100 Ko) à partir d'une image choisie ou d'un instant représentatif **de la version réellement publiée** après découpage.
- Enregistrer le lien de miniature et ses références aux médias ; afficher l'image avec un bouton lecture, la durée et éventuellement le nom d'auteur dans la carte de post.
- **Ne pas charger le fichier vidéo dans le Fil avant l'action explicite « Lire »** : pas de `src` vidéo/automatisme, pas de `preload=metadata` sur des dizaines de posts ; au clic, attacher l'URL puis lancer les contrôles natifs du lecteur, `playsinline`, sans autoplay forcé avec son.
- La miniature est elle-même un dérivé de média soumis aux mêmes règles de visibilité/modération. Elle ne doit pas fuiter des images de contenus `pending`, `rejected`, `hidden`.
- Optimiser le serveur `/v1/media/...` : le code actuel lit l'objet entier en mémoire avec `download()` avant réponse et ne gère pas explicitement `Range`. Remplacer par un mécanisme de lecture/flux/URLs signées courtes **avec contrôle d'accès à chaque étape**, et prise en charge HTTP `Range`/`206 Partial Content`, nécessaire au seeking vidéo. Éviter les copies massives en mémoire Vercel et les URL permanentes contournant la modération.
- Tester chargement sans lecture, lecture, pause, saut temporel, reprise réseau, iOS Safari/WebView, Android WebView, format portrait/paysage.

### 3. Cycle de vie des fichiers : aucune fuite de stockage

- Ajouter un inventaire fiable des objets vidéo et miniatures : propriétaire, bucket, chemin, post_id, date d'envoi, statut, taille, éventuellement hash et référence(s). Documenter explicitement les chemins `bokantaj-media-hold` et médias libérés.
- Une suppression autorisée d'un post doit déclencher **côté serveur** un nettoyage idempotent des objets média et miniatures après l'enregistrement de la suppression, pas uniquement la suppression SQL côté navigateur. Respecter les politiques de suppression de compte et les obligations légales/recours en cours.
- En cas de rejet final, purger les uploads et dérivés inutiles lorsque la politique de conservation le permet (le worker supprime déjà certains fichiers `-hold` rejetés ; conserver et étendre ce comportement sans doubler les suppressions).
- Nettoyer les uploads abandonnés (conversion terminée mais post non créé) et les fichiers orphelins via un job serveur périodique, avec délai de grâce prudent (ex. 48 heures), exclusion des transferts en cours, contrôle de non-référence, journaux et relances sûres. Ne jamais supprimer un média référencé par un autre post ou une revue de modération.
- Ajouter métriques par bucket : objets, octets, vidéos en attente, objets orphelins, suppressions confirmées, erreurs de stockage. Mettre en place des alertes d'augmentation anormale.
- Privilégier `queue` + worker robuste plutôt qu'un effacement fragile depuis le navigateur. Procédures traçables et réessayables, aucune suppression non autorisée, aucune modification Production depuis la Preview.
- Staging : un test suppression d'un post avec vidéo approuvée, un test suppression d'un post pending/held, un test média partagé, un test nettoyage d'orphelin >48h, un test échec Storage/réessai, un test annulation de suppression.

### 4. Conservation Fil vs Carte : ne jamais les confondre

- La durée d'affichage des repères sur la Carte est de **7 jours maximum par défaut**, réduite à mesure que la densité augmente dans la zone ; un repère éditorial explicitement conservé par l'équipe LYANN peut persister. Le retrait d'une épingle **ne modifie pas** le post ni son média.
- Les posts restent dans le **Fil** selon les règles de compte/modération/rétention applicables et la vidéo doit rester disponible tant que le post existe, est accessible et n'est pas juridiquement supprimable.
- Aucun cron de fin de visibilité sur la carte ne doit lancer un `storage.remove()`, révoquer une vidéo du Fil ou masquer un post du Fil.
- La suppression du post, le rejet définitif et la politique de conservation de compte sont des événements distincts de l'expiration du repère. Prévoir des tests explicites prouvant cette séparation.

### 5. Performances et budget

- Cible vidéo 720p (maximum 60 s, <=10 MiB), résolution/orientation conservées quand plus petites, H.264 + AAC lorsque le fichier contient une piste audio. Un clip de 45 s et 5 MiB déjà compatible doit éviter tout transcodage inutile.
- Compression préférentiellement sur l'appareil, upload simple sans charger simultanément tout le fichier dans la RAM ; progressions explicites. Pour Web, ne pas télécharger un moteur lourd au chargement initial de Bokantaj.
- Activer le poster seul sur le fil. Mesurer `bytes transferred`, temps vers la première image, temps jusqu'au démarrage vidéo, % de conversions échouées et débit sortant Storage/CDN. 1 000 vidéos de 10 Mo représentent ~10 Go, avant les miniatures, variantes, copies et visionnages.
- Garder les formats et tailles protégés par contrôles client **et serveur** ; limites Storage raisonnables et contrôles d'authentification/rate limiting par membre pour empêcher les uploads excessifs.

## Tests fonctionnels et critères complémentaires

- Vidéo 70 s : l'utilisateur choisit une plage <=60 s, son préservé ; la vidéo ne quitte jamais l'appareil avant conversion conforme.
- Une vidéo `pending` ne s'affiche ni dans le Fil public ni dans la Carte ; pas d'URL signée utilisable publiquement, ni miniature visible.
- Une vidéo approuvée se lit après clic, avec une requête `Range` correctement traitée, et n'est pas téléchargée avant action de lecture.
- Une vidéo rejetée ou masquée n'est plus servie au public, miniature comprise, même si son URL a déjà circulé.
- Suppression d'un post : données utilisateur et médias physiques sont effectivement nettoyés après délai/préservation légale documentés ; un réessai est sûr.
- À expiration des 7 jours de repère : repère disparu, post et vidéo **toujours visibles dans le Fil**.
- Ne pas prétendre qu'une CI Playwright desktop valide iPhone natif : ouvrir et tester un build Staging sur appareil physique.

## Périmètre exclu

Pas d'activation d'une offre payante, pas de suppression à 7 jours des vidéos ni des posts du Fil, pas de modification automatique de Production/Stripe Live. Les optimisations et la modération avancée constituent un travail d'implémentation distinct dont les tests et les limites doivent être indiqués honnêtement.

=======
# Bokantaj vidéo V1.6

Le fichier n’était pas versionné. Ce document fixe le contrat implémenté.

Une vidéo de plus de 60 secondes se découpe dans le compositeur. Le passage envoyé dure 60 secondes au plus, en MP4 720p, 10 Mo maximum, avec une miniature JPEG. Le fil affiche la miniature. Le fichier vidéo n’est demandé qu’au clic sur « Lire la vidéo ».

Avant diffusion, le serveur vérifie le conteneur, la durée, la taille et le cadre. Le texte et la miniature passent par la modération existante. Une vidéo illisible, trop longue, trop grande, sans miniature, ou dont le score est intermédiaire, reste en revue humaine. Un refus explicite du modèle refuse la publication.

La suppression d’une publication, son rejet, ou un envoi abandonné retire la vidéo et la miniature du stockage Staging. Un masquage réversible conserve les fichiers. Le nettoyage des orphelins ne touche pas un fichier encore référencé, ni Production.

Un repère quitte la carte au bout de 7 jours (24 heures pour le trafic). La publication, ses photos et sa vidéo restent dans le Fil. Un repère marqué permanent par le back-office reste sur la carte. Cette disparition ne supprime aucune ligne ni aucun fichier.
>>>>>>> 3382873 (Keep Bokantaj videos playable on demand and leave expired map pins in the feed.)
