# 06 — Proposition UX : Découvrir, catégories rondes, explorateur, recherche, compétences, filtres

> **Proposition — rien n'est implémenté.** Les libellés, icônes et codes viennent de `data/families.js` (source de vérité). Les maquettes sont des schémas de structure, pas des écrans finaux.

## 1. Principes

1. **Un seul référentiel, quatre surfaces** : Découvrir, Lyanneurs, Annonces (Liste + Carte), profil/assistant d'annonce lisent les **mêmes codes** de famille, métier et spécialité.
2. **On s'arrête au bon niveau** : la famille aide à trouver, le **métier est le niveau normal** de choix, la spécialité est **toujours optionnelle** (« Préciser »).
3. **On cherche comme on parle** : métier (« plombier »), problème (« fuite sous l'évier »), synonyme ou terme local (« ravets », « gwoka »). Jamais de culs-de-sac : à défaut, « Autres ».
4. **Pas de devinette silencieuse** : un terme ambigu (« batterie », « dépannage ») déclenche **une question courte**, pas un classement arbitraire.
5. **Cohérence visuelle** : même famille = même icône ronde, même teinte (alternance vert/jaune de la charte), même libellé court partout.
6. **Sécurité visible sans alarmisme** : `CAUTION` = rappel discret ; `PRO_REQUIRED` = mention « pro justifié requis » ; `RESTRICTED` = jamais proposé comme compétence, renvoie vers un guide.

## 2. Découvrir : 9 domaines + « Autres » en 10ᵉ position

La demande évoque 8 familles et 9 domaines. Le conflit se résout sans rien perdre : la famille **Maison** (20 métiers, la plus dense) est exposée par **deux tuiles** qui ouvrent deux sous-ensembles de la même famille. « Autres » est la 10ᵉ tuile, toujours en dernier (**décision n° 1** du document 09).

| Pos. | Tuile (libellé) | Icône | Famille | Contenu ouvert |
|---:|---|---|---|---|
| 1 | Dépannage maison | `wrench` | Maison | Dépannage & installations · Énergie, sécurité & équipements |
| 2 | Travaux & rénovation | `hammer` | Maison | Rénovation & construction · Petits travaux & bricolage |
| 3 | Jardin & extérieur | `plant` | Jardin | tous les sous-domaines |
| 4 | Ménage & entretien | `broom` | Ménage et entretien | tous |
| 5 | Beauté & bien-être | `flower-lotus` | Beauté, bien-être et sport | tous |
| 6 | Transport & véhicules | `truck` | Transport, véhicules et logistique | tous |
| 7 | Famille & éducation | `users-three` | Famille, éducation et assistance | tous |
| 8 | Fêtes, cuisine & création | `confetti` | Événementiel, cuisine et création | tous |
| 9 | Numérique & administratif | `laptop` | Numérique, administratif et services pros | tous |
| 10 | Autres | `dots-three` | Autres | « Décrire mon besoin » |

```
┌──────────────────────────────────────────┐
│  🔍  Que cherchez-vous ?                 │  ← recherche (voir §5)
├──────────────────────────────────────────┤
│  ( 🔧 )   ( 🔨 )   ( 🌱 )                │
│ Dépannage  Travaux  Jardin               │
│  ( 🧹 )   ( 🌸 )   ( 🚚 )                │
│  Ménage   Beauté   Transport             │
│  ( 👪 )   ( 🎉 )   ( 💻 )                │
│  Famille   Fêtes   Numérique             │
│                    ( ⋯ )                 │
│                    Autres                │
└──────────────────────────────────────────┘
```
- Cercles de **64 px** minimum visuel, zone tactile **≥ 44 × 44 pt**, libellé court sous l'icône (jamais l'icône seule).
- Une tuile ouvre l'**explorateur de la famille** (§4) ; le compteur « 12 annonces / 5 Lyanneurs » est optionnel et n'apparaît que s'il est fiable.

## 3. Catégories rondes dans Lyanneurs et Annonces

Le rail actuel (« Tous + 4 domaines avec résultats + Plus », ≤ 6 entrées) est **conservé** ; il lit désormais les **8 familles** au lieu des 8 pins historiques (`quotidien` disparaît).

```
( Tous ) ( 🔨 Maison ) ( 🌱 Jardin ) ( 🧹 Ménage ) ( 🚚 Transport ) ( ⋯ Plus )
```
- Ordre : **Tous**, puis jusqu'à 4 familles ayant des résultats (tri par volume puis par `ord` pour une disposition stable), la famille **sélectionnée** y est toujours incluse, puis **Plus**.
- **Plus** ouvre l'explorateur complet (§4) avec les 8 familles + Autres et leurs compteurs.
- Sélectionner une famille filtre ; un second appui sur le **métier** (puce de second niveau, optionnelle) affine sans quitter l'écran.
- Pour les annonces rattachées à un métier à **famille secondaire** (`also`), l'annonce est comptée **une seule fois** (famille primaire) mais reste trouvable via la famille secondaire (mention « aussi dans »).

## 4. Explorateur de catégories par familles dépliables

```
Maison, travaux et dépannage                 ⌄
  Dépannage & installations
     Plomberie  ·  Électricité  ·  Climatisation  ·  Serrurerie …
  Énergie, sécurité & équipements
     Alarme, portail & sécurité · Énergie solaire
  Rénovation & construction
     Peinture · Maçonnerie · Carrelage & sols · Toiture …
Jardin et extérieur                          ›
Ménage et entretien                          ›
…
Autres                                       ›
```
- **Accordéon à un niveau ouvert à la fois**, sous-domaines en intertitres, métiers en lignes (ou puces en deux colonnes).
- Appui sur un **métier** = sélection immédiate (filtre ou choix). Si le métier a des spécialités : bandeau « Préciser (facultatif) » avec puces (ex. Plomberie → fuite · wc · chauffe-eau …).
- Le bandeau est une **feuille basse** (bottom sheet) : un seul geste pour valider ou passer.
- Un métier réglementé (`RESTRICTED`) s'affiche en grisé avec « Activité réglementée — voir le guide » et n'est jamais sélectionnable comme compétence.

## 5. Recherche par métier, problème ou synonyme

Un **seul champ**, un **seul moteur** (RPC `lyann_taxonomy_search`, prototype validé) pour Découvrir, l'explorateur, l'assistant et le sélecteur de compétences.

| Saisie | Résultat attendu | Mécanisme |
|---|---|---|
| « plombier » | Plomberie | synonyme de métier |
| « fuite sous mon évier » | Plomberie › Fuite | problème en langage naturel |
| « ravets » | Nuisibles & hygiène › Insectes | vocabulaire local |
| « batterie » | question : « Batterie de voiture ou instrument de musique ? » | terme ambigu déclaré |
| « leçons de conduite » | Permis & code de la route (guide, non sélectionnable) | nœud réglementé |
| « bonjour » | « Aucun métier trouvé » + bouton **Décrire mon besoin** (Autres) | non classé |

- Résultats **groupés** : « Métiers » puis « Besoins » (spécialités), 8 maximum, avec la famille en sous-titre.
- Tolérance aux fautes (similarité de trigrammes), accents et pluriels neutralisés.
- **Aucune saisie libre n'est stockée** par le moteur ; l'amélioration des synonymes passe par un comptage agrégé des requêtes sans résultat, **sous réserve de la décision n° 7** (document 09).

## 6. Sélecteur de compétences (profil et inscription)

Remplace les 9 boutons-lots et le texte libre :

1. **Recherche** en tête (« Que savez-vous faire ? »).
2. **Familles** en puces rondes (les mêmes 8 + pas « Autres »), puis **métiers** en liste à cocher.
3. **Compétences choisies** en puces retirables ; limite recommandée **8 métiers principaux** (la base accepte jusqu'à 60).
4. Chaque métier propose « Préciser » (spécialités, facultatif).
5. Un métier `CAUTION` ou `PRO_REQUIRED` affiche un rappel avant validation ; un métier `RESTRICTED` n'apparaît pas dans la liste.
6. « Autres » n'est **pas proposé** en compétence (une compétence doit avoir un sens métier) ; un lien « Je ne trouve pas mon métier » ouvre un formulaire de suggestion (décision n° 8).
- Écriture via la RPC `lyann_sync_profile_skills_v2` (codes uniquement, jamais de libellé libre) qui **écrit aussi** les stubs `services` pour les anciens clients.

## 7. Filtres Liste et Carte cohérents

| Élément | Liste | Carte |
|---|---|---|
| Familles | rail rond (§3) | **mêmes** 8 familles, mêmes icônes/teintes sur les pins |
| Filtre métier | feuille « Affiner » | même feuille |
| Recherche | champ en tête | même champ, même moteur |
| Compteurs | par famille | par famille, **identiques** à la Liste pour la même zone |
| État | partagé : changer d'onglet **conserve** famille, métier et recherche | idem |

- Les pins de carte passent de 8 « familles de pins » historiques à **8 familles v2** : correspondance explicite dans la matrice (doc 05 §E).
- Un pin n'affiche que l'**icône de famille** ; le métier apparaît dans la carte d'aperçu.

## 8. Assistant de création d'annonce

- Étape « Que voulez-vous faire ? » : **recherche d'abord**, familles en secours (même explorateur que §4).
- La proposition issue du classifieur est **toujours modifiable** et n'est affichée que si `CLASSIFIED` ; en cas de `NEEDS_CLARIFICATION`, la question de précision remplace la proposition.
- Si l'utilisateur ne trouve rien : « Autres » → `autre_demande_non_classee` (ou `autre_demande_service_direct` pour une demande ciblée à un membre).
- Remplace la liste statique de 17 univers (+ « Autres Besoins ») ; les 3 univers jusque-là injoignables disparaissent comme concept.

## 9. Accessibilité, performance, robustesse

- Cibles ≥ 44 pt, libellés textuels sur toutes les icônes, ordre de lecture VoiceOver/TalkBack = ordre visuel, contrastes AA, prise en charge de la taille de texte dynamique, `prefers-reduced-motion` respecté.
- Le référentiel complet pèse ≈ 600 Ko en JSON (≈ 65 Ko compressé) ; l'arbre seul (sans termes de recherche) ≈ 90 Ko. Il est **versionné** (`lyann_taxonomy_release`) et **mis en cache** ; une copie embarquée assure le fonctionnement hors ligne et le premier lancement.
- L'application lit la **version publiée** ; une version ultérieure ne casse jamais un code existant (codes immuables, aucune suppression).

## 10. Microcopy (extraits)

| Contexte | Texte |
|---|---|
| Recherche | « Que cherchez-vous ? » · « Un métier, un problème, un mot… » |
| Précision | « Préciser (facultatif) » |
| Ambigu | « Batterie de voiture ou instrument de musique ? » |
| Aucun résultat | « Aucun métier trouvé. Décrivez votre besoin, un membre pourra vous répondre. » |
| Réglementé | « Activité réglementée : un professionnel déclaré est requis. Voir le guide. » |
| Prudence | « Pour ce type d'intervention, vérifiez les justificatifs du professionnel. » |
| Compétences | « Que savez-vous faire ? » · « Je ne trouve pas mon métier » |
