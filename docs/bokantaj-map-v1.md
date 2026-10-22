# LYANN — Bokantaj Carte V1 (Web + iOS)

## Expérience
Dans Bokantaj, le membre choisit **Fil** ou **Carte**. La carte publique permet de zoomer sur les quartiers et de filtrer par thème. Les épingles sont regroupées au dézoom et ouvrent un aperçu lisible du post. Territoires : Guadeloupe, Martinique, Guyane, Réunion et Saint-Martin.

La publication reste simple : texte, une catégorie parmi six (Info, Trafic, Bon plan, Resto, Avis, Sortie), photo/vidéo éventuelle et Publier. Le bouton **Ajouter un lieu (facultatif)** ouvre un sélecteur de carte ; le membre touche un lieu, écrit le nom du quartier/repère et valide. Aucune lecture du GPS, aucune localisation par défaut et aucun point public sans geste explicite.

Les publications Trafic disparaissent de la **carte** après 24 heures mais restent visibles dans le **fil** selon les règles de modération ordinaires.

## Architecture
- SQL versionné : 76_bokantaj_map_places.sql et rollback, trois colonnes facultatives, contrainte de cohérence et index partial sur les posts approuvés. À appliquer Staging d’abord, jamais automatiquement en Production.
- api-client.js : création avec lieu seulement si le membre le confirme ; filtre PostgREST côté serveur par zone visible, statut public_moderation_status=approved et limite 250 par zone.
- bokantaj-map.js / CSS : UI commune Web et Capacitor iOS. Leaflet 1.9.4 épinglé dans npm, généré sous vendor/leaflet par scripts/ensure-leaflet-assets.js à chaque build, puis copié dans le bundle natif. Seules les tuiles OpenStreetMap ont besoin d’Internet.
- Aucun accès aux adresses privées des profils et aucune nouvelle politique RLS. Les posts anciens sans lieu continuent à fonctionner dans le fil.

## Tests et limites
- npm test ; npm run build:mobile ; tests/e2e/bokantaj_map_web_ios.spec.js (desktop et largeur iPhone).
- Playwright utilise des données de test et ne représente pas une vraie authentification membre.
- À vérifier sur un **compte Staging réel** et un **iPhone physique** : création -> en attente -> modération -> visibilité carte -> masquage -> disparition.
- Une carte chargée affiche au plus 250 points par zone. Pour une forte fréquentation, prévoir agrégation SQL/cache et fournisseur de tuiles conforme aux conditions de service OSM.
- Aucun déploiement Production, changement Stripe ou migration Production sans validation indépendante.
