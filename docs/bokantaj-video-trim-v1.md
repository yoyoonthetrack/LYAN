# LYANN — Bokantaj : vidéo courte, découpage et compression (Staging)

## Statut

Spécification validée côté produit ; **implémentation non terminée**. Cette spécification n'active pas elle-même l'éditeur. Ne pas fusionner la PR #10 vers Production avant la validation fonctionnelle sur appareils réels.

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
9. La publication existante reprend avec l'upload du MP4 final vers Storage privé et le processus de modération actuel (notamment l'attente de validation humaine des vidéos). Ne contourner ni RLS ni modération.

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

## Périmètre exclu

Aucun changement d'abonnement ou de tarif ; aucune modification des délais de modération ni suppression des fichiers de posts au bout de 7 jours. La durée 7 jours évoquée ailleurs concerne **les repères de la carte**, pas la conservation des vidéos dans le Fil.
