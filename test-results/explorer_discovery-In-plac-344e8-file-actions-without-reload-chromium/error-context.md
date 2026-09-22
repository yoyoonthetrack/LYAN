# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: explorer_discovery.spec.js >> In-place authentication updates own-profile actions without reload
- Location: tests/e2e/explorer_discovery.spec.js:233:1

# Error details

```
Error: Existing QA B email is required

expect(received).toBeTruthy()

Received: undefined
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - status "Chargement de LYANN" [ref=e2]
  - navigation [ref=e3]:
    - generic [ref=e4]:
      - link "LYANN LE LIEN QUI COMPTE" [ref=e5] [cursor=pointer]:
        - /url: index.html
        - generic [ref=e12]:
          - generic [ref=e13]: LYANN
          - generic [ref=e14]: LE LIEN QUI COMPTE
      - generic [ref=e15]:
        - link " Accueil" [ref=e16] [cursor=pointer]:
          - /url: index.html
          - generic [ref=e17]: 
          - text: Accueil
        - link " Explorer" [ref=e18] [cursor=pointer]:
          - /url: results.html
          - generic [ref=e19]: 
          - text: Explorer
        - link " Bokantaj" [ref=e20] [cursor=pointer]:
          - /url: feed.html
          - generic [ref=e21]: 
          - text: Bokantaj
        - link " Comment ça marche" [ref=e22] [cursor=pointer]:
          - /url: how-it-works.html
          - generic [ref=e23]: 
          - text: Comment ça marche
      - generic [ref=e24]:
        - link "" [ref=e25] [cursor=pointer]:
          - /url: results.html
        - text: 
        - link "Connexion" [ref=e27] [cursor=pointer]:
          - /url: "#login"
        - button "Menu Principal" [ref=e28] [cursor=pointer]:
          - generic [ref=e29]: 
  - main [ref=e30]:
    - generic [ref=e31]:
      - heading "Explorer" [level=1] [ref=e32]
      - paragraph [ref=e33]: Des besoins et des talents près de chez vous
    - paragraph [ref=e34]: Deux mondes à explorer
    - tablist "Deux mondes à explorer" [ref=e35]:
      - tab "Je cherche un Lyanneur Lyanneurs" [selected] [ref=e36] [cursor=pointer]:
        - generic [aria-hidden] [ref=e37]: 
        - generic [ref=e38]: Je cherche un Lyanneur
        - generic [ref=e39]: Lyanneurs
      - tab "Annonces" [ref=e40] [cursor=pointer]:
        - generic [aria-hidden] [ref=e41]: 
    - tabpanel "Je cherche un Lyanneur Lyanneurs" [ref=e43]:
      - search [ref=e44]:
        - generic [ref=e45]: Rechercher dans les lyanneurs
        - searchbox "Rechercher dans les lyanneurs" [ref=e46]
        - button "Rechercher" [ref=e47] [cursor=pointer]:
          - generic [aria-hidden] [ref=e48]: 
      - generic [ref=e50]:
        - generic [ref=e51]:
          - text: Catégorie
          - combobox "Catégorie" [ref=e52]:
            - option "Toutes les catégories" [selected]
            - option "Accompagnement"
            - option "Aide Administrative"
            - option "Bricolage"
            - option "Coiffure & Esthétique"
            - option "Cours de Musique"
            - option "Couture"
            - option "Covoiturage"
            - option "Cuisine & Pâtisserie"
            - option "Dépannage Informatique"
            - option "Électricité"
            - option "Entretien Jardin"
            - option "Garde d animaux"
            - option "Livraison & Manutention"
            - option "Mécanique & Entretien Deux-Roues"
            - option "Mécanique Automobile"
            - option "Ménage"
            - option "Photographie"
            - option "Plomberie"
            - option "Poterie & Céramique"
            - option "Soutien Scolaire"
            - option "Sport & Coaching"
        - button "Filtres et zone" [ref=e53] [cursor=pointer]:
          - generic [aria-hidden] [ref=e54]: 
          - text: Filtres et zone
      - generic "Filtres actifs"
      - status [ref=e56]: 51 Lyanneurs · Tous les lieux
      - generic [ref=e57]:
        - article [ref=e58]:
          - generic [ref=e59]:
            - generic [ref=e60]:
              - button "Voir le profil de Alain C." [ref=e61] [cursor=pointer]
              - generic [ref=e62]:
                - heading "Alain C." [level=2] [ref=e63]
                - paragraph [ref=e64]: 📍 Petit-Bourg · guadeloupe
            - button "Ajouter aux favoris" [ref=e65] [cursor=pointer]:
              - generic: 
          - generic [ref=e66]: ARTISAN PRO
          - paragraph [ref=e68]: Jardinage · Bricolage extérieur · Nettoyage · Entretien piscine
          - paragraph [ref=e69]: « Entretien de jardins et extérieurs à Petit-Bourg. Nettoyage de terrasses, traitement de piscine et petits travaux extérieurs. »
          - generic [ref=e70]:
            - paragraph [ref=e71]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e72]: ⭐ 4,9 · 3 avis · ⚡ Répond généralement très rapidement
          - generic [ref=e73]:
            - button "Voir le profil" [ref=e74] [cursor=pointer]
            - button "Contacter" [ref=e75] [cursor=pointer]
        - article [ref=e76]:
          - generic [ref=e77]:
            - generic [ref=e78]:
              - button "Voir le profil de Audrey P." [ref=e79] [cursor=pointer]
              - generic [ref=e80]:
                - heading "Audrey P." [level=2] [ref=e81]
                - paragraph [ref=e82]: 📍 Le Gosier · guadeloupe
            - button "Ajouter aux favoris" [ref=e83] [cursor=pointer]:
              - generic: 
          - generic [ref=e84]: ARTISAN PRO
          - paragraph [ref=e86]: Aide aux devoirs · Anglais · Français · Soutien scolaire
          - paragraph [ref=e87]: « Enseignante diplômée au Gosier. Cours particuliers d'anglais et français, soutien scolaire du primaire au lycée. »
          - generic [ref=e88]:
            - paragraph [ref=e89]: 📍 Se déplace jusqu'à 15 km
            - paragraph [ref=e90]: ⭐ 4,9 · 3 avis · ⚡ Répond généralement très rapidement
          - generic [ref=e91]:
            - button "Voir le profil" [ref=e92] [cursor=pointer]
            - button "Contacter" [ref=e93] [cursor=pointer]
        - article [ref=e94]:
          - generic [ref=e95]:
            - generic [ref=e96]:
              - button "Voir le profil de Carole V." [ref=e97] [cursor=pointer]
              - generic [ref=e98]:
                - heading "Carole V." [level=2] [ref=e99]
                - paragraph [ref=e100]: 📍 Les Abymes · guadeloupe
            - button "Ajouter aux favoris" [ref=e101] [cursor=pointer]:
              - generic: 
          - generic [ref=e102]: ARTISAN PRO
          - paragraph [ref=e104]: Accompagnement · Aide administrative · Courses · Bureautique
          - paragraph [ref=e105]: « Auxiliaire et assistante personnelle aux Abymes. Démarches administratives complexes, gestion du courrier et accompagnement. »
          - generic [ref=e106]:
            - paragraph [ref=e107]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e108]: ⭐ 4,8 · 2 avis · ⚡ Répond en moins d'1h
          - generic [ref=e109]:
            - button "Voir le profil" [ref=e110] [cursor=pointer]
            - button "Contacter" [ref=e111] [cursor=pointer]
        - article [ref=e112]:
          - generic [ref=e113]:
            - generic [ref=e114]:
              - button "Voir le profil de Cédric V." [ref=e115] [cursor=pointer]
              - generic [ref=e116]:
                - heading "Cédric V." [level=2] [ref=e117]
                - paragraph [ref=e118]: 📍 Saint-Claude · guadeloupe
            - button "Ajouter aux favoris" [ref=e119] [cursor=pointer]:
              - generic: 
          - generic [ref=e120]: ARTISAN PRO
          - paragraph [ref=e122]: Transport · Utilitaire · Manutention · Montage de meubles
          - paragraph [ref=e123]: « Habitant outillé à Saint-Claude. Petit déménagement, transport d'achats encombrants et montage de meubles à domicile. »
          - generic [ref=e124]:
            - paragraph [ref=e125]: 📍 Se déplace jusqu'à 30 km
            - paragraph [ref=e126]: ⭐ 4,7 · 2 avis · ⚡ Répond rapidement
          - generic [ref=e127]:
            - button "Voir le profil" [ref=e128] [cursor=pointer]
            - button "Contacter" [ref=e129] [cursor=pointer]
        - article [ref=e130]:
          - generic [ref=e131]:
            - generic [ref=e132]:
              - button "Voir le profil de Chantal D." [ref=e133] [cursor=pointer]
              - generic [ref=e134]:
                - heading "Chantal D." [level=2] [ref=e135]
                - paragraph [ref=e136]: 📍 Petit-Bourg · guadeloupe
            - button "Ajouter aux favoris" [ref=e137] [cursor=pointer]:
              - generic: 
          - generic [ref=e138]: ARTISAN PRO
          - paragraph [ref=e140]: Accompagnement · Cuisine · Courses · Aide administrative
          - paragraph [ref=e141]: « Habitante engagée à Petit-Bourg pour vous épauler dans vos démarches administratives, vos courses et la préparation de repas. »
          - generic [ref=e142]:
            - paragraph [ref=e143]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e144]: ⭐ 4,7 · 2 avis · ⚡ Répond rapidement
          - generic [ref=e145]:
            - button "Voir le profil" [ref=e146] [cursor=pointer]
            - button "Contacter" [ref=e147] [cursor=pointer]
        - article [ref=e148]:
          - generic [ref=e149]:
            - generic [ref=e150]:
              - button "Voir le profil de Christian L." [ref=e151] [cursor=pointer]
              - generic [ref=e152]:
                - heading "Christian L." [level=2] [ref=e153]
                - paragraph [ref=e154]: 📍 Basse-Terre · guadeloupe
            - button "Ajouter aux favoris" [ref=e155] [cursor=pointer]:
              - generic: 
          - generic [ref=e156]: ARTISAN PRO
          - paragraph [ref=e158]: Bricolage · Plomberie · Montage · Sanitaire
          - paragraph [ref=e159]: « Plombier-bricoleur d'expérience à Basse-Terre. Pose de robinetterie, raccordement citerne d'eau et réparations diverses. »
          - generic [ref=e160]:
            - paragraph [ref=e161]: 📍 Se déplace jusqu'à 25 km
            - paragraph [ref=e162]: ⭐ 4,7 · 2 avis · ⚡ Répond rapidement
          - generic [ref=e163]:
            - button "Voir le profil" [ref=e164] [cursor=pointer]
            - button "Contacter" [ref=e165] [cursor=pointer]
        - article [ref=e166]:
          - generic [ref=e167]:
            - generic [ref=e168]:
              - button "Voir le profil de Cindy F." [ref=e169] [cursor=pointer]
              - generic [ref=e170]:
                - heading "Cindy F." [level=2] [ref=e171]
                - paragraph [ref=e172]: 📍 Le Gosier · guadeloupe
            - button "Ajouter aux favoris" [ref=e173] [cursor=pointer]:
              - generic: 
          - generic [ref=e174]: ARTISAN PRO
          - paragraph [ref=e176]: Coiffure · Maquillage événementiel · Aide événementielle
          - paragraph [ref=e177]: « Maquilleuse et coiffeuse professionnelle au Gosier. Mises en beauté pour mariages, soirées et shootings photos. »
          - generic [ref=e178]:
            - paragraph [ref=e179]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e180]: ⭐ 5,0 · 2 avis · ⚡ Répond rapidement
          - generic [ref=e181]:
            - button "Voir le profil" [ref=e182] [cursor=pointer]
            - button "Contacter" [ref=e183] [cursor=pointer]
        - article [ref=e184]:
          - generic [ref=e185]:
            - generic [ref=e186]:
              - button "Voir le profil de Coralie N." [ref=e187] [cursor=pointer]
              - generic [ref=e188]:
                - heading "Coralie N." [level=2] [ref=e189]
                - paragraph [ref=e190]: 📍 Pointe-à-Pitre · guadeloupe
            - button "Ajouter aux favoris" [ref=e191] [cursor=pointer]:
              - generic: 
          - generic [ref=e192]: ARTISAN PRO
          - paragraph [ref=e194]: Soutien scolaire · Français · Aide administrative
          - paragraph [ref=e195]: « Professeure de lettres à Pointe-à-Pitre. Remise à niveau en français, préparation au brevet/bac et rédaction de courriers. »
          - generic [ref=e196]:
            - paragraph [ref=e197]: 📍 Se déplace jusqu'à 15 km
            - paragraph [ref=e198]: ⭐ 4,8 · 2 avis · ⚡ Répond rapidement
          - generic [ref=e199]:
            - button "Voir le profil" [ref=e200] [cursor=pointer]
            - button "Contacter" [ref=e201] [cursor=pointer]
        - article [ref=e202]:
          - generic [ref=e203]:
            - generic [ref=e204]:
              - button "Voir le profil de David B." [ref=e205] [cursor=pointer]
              - generic [ref=e206]:
                - heading "David B." [level=2] [ref=e207]
                - paragraph [ref=e208]: 📍 Baie-Mahault · guadeloupe
            - button "Ajouter aux favoris" [ref=e209] [cursor=pointer]:
              - generic: 
          - generic [ref=e210]: ARTISAN PRO
          - paragraph [ref=e212]: Dépannage · Climatisation · Installation · Électricité
          - paragraph [ref=e213]: « Spécialiste climatisation et électricité résidentielle sur Baie-Mahault. Dépannages rapides et installations soignées. »
          - generic [ref=e214]:
            - paragraph [ref=e215]: 📍 Se déplace jusqu'à 25 km
            - paragraph [ref=e216]: ⭐ 4,8 · 2 avis · ⚡ Répond généralement en quelques minutes
          - generic [ref=e217]:
            - button "Voir le profil" [ref=e218] [cursor=pointer]
            - button "Contacter" [ref=e219] [cursor=pointer]
        - article [ref=e220]:
          - generic [ref=e221]:
            - generic [ref=e222]:
              - button "Voir le profil de Dimitri L." [ref=e223] [cursor=pointer]
              - generic [ref=e224]:
                - heading "Dimitri L." [level=2] [ref=e225]
                - paragraph [ref=e226]: 📍 Le Moule · guadeloupe
            - button "Ajouter aux favoris" [ref=e227] [cursor=pointer]:
              - generic: 
          - generic [ref=e228]: ARTISAN PRO
          - paragraph [ref=e230]: Carrelage · Peinture · Rénovation · Placo
          - paragraph [ref=e231]: « Artisan second œuvre au Moule. Pose de placo, joints, peinture anti-humidité et carrelage intérieur/extérieur. »
          - generic [ref=e232]:
            - paragraph [ref=e233]: 📍 Se déplace jusqu'à 25 km
            - paragraph [ref=e234]: ⭐ 4,7 · 3 avis · ⚡ Répond dans la journée
          - generic [ref=e235]:
            - button "Voir le profil" [ref=e236] [cursor=pointer]
            - button "Contacter" [ref=e237] [cursor=pointer]
        - article [ref=e238]:
          - generic [ref=e239]:
            - generic [ref=e240]:
              - button "Voir le profil de Élodie C." [ref=e241] [cursor=pointer]
              - generic [ref=e242]:
                - heading "Élodie C." [level=2] [ref=e243]
                - paragraph [ref=e244]: 📍 Les Abymes · guadeloupe
            - button "Ajouter aux favoris" [ref=e245] [cursor=pointer]:
              - generic: 
          - generic [ref=e246]: ARTISAN PRO
          - paragraph [ref=e248]: Promenade · Garde d'animaux · Aide ponctuelle · Courses
          - paragraph [ref=e249]: « Amoureuse des animaux aux Abymes. Garde à domicile de chiens et chats, promenades quotidiennes et petits services aux voisins. »
          - generic [ref=e250]:
            - paragraph [ref=e251]: 📍 Se déplace jusqu'à 15 km
            - paragraph [ref=e252]: ⭐ 5,0 · 2 avis · ⚡ Répond généralement en quelques minutes
          - generic [ref=e253]:
            - button "Voir le profil" [ref=e254] [cursor=pointer]
            - button "Contacter" [ref=e255] [cursor=pointer]
        - article [ref=e256]:
          - generic [ref=e257]:
            - generic [ref=e258]:
              - button "Voir le profil de Émilie N." [ref=e259] [cursor=pointer]
              - generic [ref=e260]:
                - heading "Émilie N." [level=2] [ref=e261]
                - paragraph [ref=e262]: 📍 Les Abymes · guadeloupe
            - button "Ajouter aux favoris" [ref=e263] [cursor=pointer]:
              - generic: 
          - generic [ref=e264]: ARTISAN PRO
          - paragraph [ref=e266]: Photographie · Événementiel · Communication · Aide numérique
          - paragraph [ref=e267]: « Photographe indépendante aux Abymes. Portraits de famille, couverture d'événements, baptêmes et retouche photo. »
          - generic [ref=e268]:
            - paragraph [ref=e269]: 📍 Se déplace jusqu'à 40 km
            - paragraph [ref=e270]: ⭐ 5,0 · 2 avis · ⚡ Répond généralement très rapidement
          - generic [ref=e271]:
            - button "Voir le profil" [ref=e272] [cursor=pointer]
            - button "Contacter" [ref=e273] [cursor=pointer]
        - article [ref=e274]:
          - generic [ref=e275]:
            - generic [ref=e276]:
              - button "Voir le profil de Éric M." [ref=e277] [cursor=pointer]
              - generic [ref=e278]:
                - heading "Éric M." [level=2] [ref=e279]
                - paragraph [ref=e280]: 📍 Baie-Mahault · guadeloupe
            - button "Ajouter aux favoris" [ref=e281] [cursor=pointer]:
              - generic: 
          - generic [ref=e282]: ARTISAN PRO
          - paragraph [ref=e284]: Petits travaux · Carrelage · Peinture · Rénovation
          - paragraph [ref=e285]: « Artisan rénovateur sur Baie-Mahault. Travaux de peinture, pose de faux plafonds, carrelage et rafraîchissement d'intérieurs. »
          - generic [ref=e286]:
            - paragraph [ref=e287]: 📍 Se déplace jusqu'à 30 km
            - paragraph [ref=e288]: ⭐ 4,7 · 2 avis · ⚡ Répond en moins d'1h
          - generic [ref=e289]:
            - button "Voir le profil" [ref=e290] [cursor=pointer]
            - button "Contacter" [ref=e291] [cursor=pointer]
        - article [ref=e292]:
          - generic [ref=e293]:
            - generic [ref=e294]:
              - button "Voir le profil de Fabrice C." [ref=e295] [cursor=pointer]
              - generic [ref=e296]:
                - heading "Fabrice C." [level=2] [ref=e297]
                - paragraph [ref=e298]: 📍 Morne-à-l'Eau · guadeloupe
            - button "Ajouter aux favoris" [ref=e299] [cursor=pointer]:
              - generic: 
          - generic [ref=e300]: ARTISAN PRO
          - paragraph [ref=e302]: Menuiserie · Montage · Réparations bois · Bricolage
          - paragraph [ref=e303]: « Menuisier passionné à Morne-à-l'Eau. Fabrication sur mesure, pose et réparation de portes, volets et meubles en bois. »
          - generic [ref=e304]:
            - paragraph [ref=e305]: 📍 Se déplace jusqu'à 30 km
            - paragraph [ref=e306]: ⭐ 4,7 · 2 avis · ⚡ Répond dans la journée
          - generic [ref=e307]:
            - button "Voir le profil" [ref=e308] [cursor=pointer]
            - button "Contacter" [ref=e309] [cursor=pointer]
        - article [ref=e310]:
          - generic [ref=e311]:
            - generic [ref=e312]:
              - button "Voir le profil de Frédéric M." [ref=e313] [cursor=pointer]
              - generic [ref=e314]:
                - heading "Frédéric M." [level=2] [ref=e315]
                - paragraph [ref=e316]: 📍 Lamentin · guadeloupe
            - button "Ajouter aux favoris" [ref=e317] [cursor=pointer]:
              - generic: 
          - generic [ref=e318]: ARTISAN PRO
          - paragraph [ref=e320]: Bricolage · Enduit · Nettoyage haute pression · Peinture
          - paragraph [ref=e321]: « Artisan rénovateur sur Baie-Mahault. Travaux de peinture, pose de faux plafonds, carrelage et rafraîchissement d'intérieurs. »
          - generic [ref=e322]:
            - paragraph [ref=e323]: 📍 Se déplace jusqu'à 30 km
            - paragraph [ref=e324]: ⭐ 4,7 · 2 avis · ⚡ Répond en moins d'1h
          - generic [ref=e325]:
            - button "Voir le profil" [ref=e326] [cursor=pointer]
            - button "Contacter" [ref=e327] [cursor=pointer]
        - article [ref=e328]:
          - generic [ref=e329]:
            - generic [ref=e330]:
              - button "Voir le profil de Isabelle M." [ref=e331] [cursor=pointer]
              - generic [ref=e332]:
                - heading "Isabelle M." [level=2] [ref=e333]
                - paragraph [ref=e334]: 📍 Les Abymes · guadeloupe
            - button "Ajouter aux favoris" [ref=e335] [cursor=pointer]:
              - generic: 
          - generic [ref=e336]: ARTISAN PRO
          - paragraph [ref=e338]: Aide administrative · Comptabilité simple · Démarches
          - paragraph [ref=e339]: « Gestionnaire administrative aux Abymes. Déclaration d'impôts, courriers officiels et classement de dossiers. »
          - generic [ref=e340]:
            - paragraph [ref=e341]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e342]: ⭐ 4,7 · 1 avis · ⚡ Répond en moins d'1h
          - generic [ref=e343]:
            - button "Voir le profil" [ref=e344] [cursor=pointer]
            - button "Contacter" [ref=e345] [cursor=pointer]
        - article [ref=e346]:
          - generic [ref=e347]:
            - generic [ref=e348]:
              - button "Voir le profil de Jean-Marc B." [ref=e349] [cursor=pointer]
              - generic [ref=e350]:
                - heading "Jean-Marc B." [level=2] [ref=e351]
                - paragraph [ref=e352]: 📍 Le Moule · guadeloupe
            - button "Ajouter aux favoris" [ref=e353] [cursor=pointer]:
              - generic: 
          - generic [ref=e354]: ARTISAN PRO
          - paragraph [ref=e356]: Maçonnerie · Carrelage · Rénovation · Petits travaux
          - paragraph [ref=e357]: « Artisan maçon sérieux au Moule. Réalisation de murets, pose de carrelage, enduits et petites rénovations extérieures. »
          - generic [ref=e358]:
            - paragraph [ref=e359]: 📍 Se déplace jusqu'à 25 km
            - paragraph [ref=e360]: ⭐ 4,6 · 3 avis · ⚡ Répond dans la journée
          - generic [ref=e361]:
            - button "Voir le profil" [ref=e362] [cursor=pointer]
            - button "Contacter" [ref=e363] [cursor=pointer]
        - article [ref=e364]:
          - generic [ref=e365]:
            - generic [ref=e366]:
              - button "Voir le profil de Jérôme T." [ref=e367] [cursor=pointer]
              - generic [ref=e368]:
                - heading "Jérôme T." [level=2] [ref=e369]
                - paragraph [ref=e370]: 📍 Sainte-Anne · guadeloupe
            - button "Ajouter aux favoris" [ref=e371] [cursor=pointer]:
              - generic: 
          - generic [ref=e372]: ARTISAN PRO
          - paragraph [ref=e374]: Transport · Mécanique légère · Batterie auto · Dépannage
          - paragraph [ref=e375]: « Mécanicien réactif sur Sainte-Anne. Diagnostic batterie, changement de bougies, vidange à domicile et petit dépannage auto. »
          - generic [ref=e376]:
            - paragraph [ref=e377]: 📍 Se déplace jusqu'à 30 km
            - paragraph [ref=e378]: ⭐ 4,9 · 2 avis · ⚡ Répond généralement en quelques minutes
          - generic [ref=e379]:
            - button "Voir le profil" [ref=e380] [cursor=pointer]
            - button "Contacter" [ref=e381] [cursor=pointer]
        - article [ref=e382]:
          - generic [ref=e383]:
            - generic [ref=e384]:
              - button "Voir le profil de Jimmy L." [ref=e385] [cursor=pointer]
              - generic [ref=e386]:
                - heading "Jimmy L." [level=2] [ref=e387]
                - paragraph [ref=e388]: 📍 Baie-Mahault · guadeloupe
            - button "Ajouter aux favoris" [ref=e389] [cursor=pointer]:
              - generic: 
          - generic [ref=e390]: ARTISAN PRO
          - paragraph [ref=e392]: Manutention · Transport d'objets · Utilitaire · Déménagement
          - paragraph [ref=e393]: « Équipé d'un grand utilitaire sur Baie-Mahault. Transport de meubles, électroménager, cartons et petits déménagements. »
          - generic [ref=e394]:
            - paragraph [ref=e395]: 📍 Se déplace dans toute l'île
            - paragraph [ref=e396]: ⭐ 4,8 · 2 avis · ⚡ Répond généralement en quelques minutes
          - generic [ref=e397]:
            - button "Voir le profil" [ref=e398] [cursor=pointer]
            - button "Contacter" [ref=e399] [cursor=pointer]
        - article [ref=e400]:
          - generic [ref=e401]:
            - generic [ref=e402]:
              - button "Voir le profil de Jocelyn C." [ref=e403] [cursor=pointer]
              - generic [ref=e404]:
                - heading "Jocelyn C." [level=2] [ref=e405]
                - paragraph [ref=e406]: 📍 Les Abymes · guadeloupe
            - button "Ajouter aux favoris" [ref=e407] [cursor=pointer]:
              - generic: 
          - generic [ref=e408]: ARTISAN PRO
          - paragraph [ref=e410]: Plomberie · Petit bricolage · Recherche de fuite · Sanitaire
          - paragraph [ref=e411]: « Artisan plombier expérimenté sur Les Abymes. Spécialiste recherche de fuite et réparations sanitaires d'urgence. Matériel complet. »
          - generic [ref=e412]:
            - paragraph [ref=e413]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e414]: ⭐ 4,9 · 3 avis · ⚡ Répond en moins d'1h
          - generic [ref=e415]:
            - button "Voir le profil" [ref=e416] [cursor=pointer]
            - button "Contacter" [ref=e417] [cursor=pointer]
        - article [ref=e418]:
          - generic [ref=e419]:
            - generic [ref=e420]:
              - button "Voir le profil de Joël S." [ref=e421] [cursor=pointer]
              - generic [ref=e422]:
                - heading "Joël S." [level=2] [ref=e423]
                - paragraph [ref=e424]: 📍 Bouillante · guadeloupe
            - button "Ajouter aux favoris" [ref=e425] [cursor=pointer]:
              - generic: 
          - generic [ref=e426]: ARTISAN PRO
          - paragraph [ref=e428]: Petits travaux · Maçonnerie · Rénovation · Clôture
          - paragraph [ref=e429]: « Maçon d'expérience à Bouillante. Rénovation de terrasse, création de marches extérieures, pose de clôtures et petits coffrages. »
          - generic [ref=e430]:
            - paragraph [ref=e431]: 📍 Se déplace jusqu'à 30 km
            - paragraph [ref=e432]: ⭐ 4,6 · 1 avis · ⚡ Répond dans la journée
          - generic [ref=e433]:
            - button "Voir le profil" [ref=e434] [cursor=pointer]
            - button "Contacter" [ref=e435] [cursor=pointer]
        - article [ref=e436]:
          - generic [ref=e437]:
            - generic [ref=e438]:
              - button "Voir le profil de Johanna L." [ref=e439] [cursor=pointer]
              - generic [ref=e440]:
                - heading "Johanna L." [level=2] [ref=e441]
                - paragraph [ref=e442]: 📍 Le Gosier · guadeloupe
            - button "Ajouter aux favoris" [ref=e443] [cursor=pointer]:
              - generic: 
          - generic [ref=e444]: ARTISAN PRO
          - paragraph [ref=e446]: Création de contenu · Réseaux sociaux · Photo · Informatique
          - paragraph [ref=e447]: « Community manager au Gosier. Je crée vos contenus Instagram/Facebook, réalise des shootings photos produits et forme au numérique. »
          - generic [ref=e448]:
            - paragraph [ref=e449]: 📍 Se déplace jusqu'à 30 km
            - paragraph [ref=e450]: ⭐ 4,9 · 2 avis · ⚡ Répond généralement en quelques minutes
          - generic [ref=e451]:
            - button "Voir le profil" [ref=e452] [cursor=pointer]
            - button "Contacter" [ref=e453] [cursor=pointer]
        - article [ref=e454]:
          - generic [ref=e455]:
            - generic [ref=e456]:
              - button "Voir le profil de Karine B." [ref=e457] [cursor=pointer]
              - generic [ref=e458]:
                - heading "Karine B." [level=2] [ref=e459]
                - paragraph [ref=e460]: 📍 Petit-Bourg · guadeloupe
            - button "Ajouter aux favoris" [ref=e461] [cursor=pointer]:
              - generic: 
          - generic [ref=e462]: ARTISAN PRO
          - paragraph [ref=e464]: Organisation · Décoration · Aide administrative · Événementiel
          - paragraph [ref=e465]: « Organisatrice et décoratrice d'événements à Petit-Bourg. Je vous aide à structurer mariages, anniversaires et fêtes de famille. »
          - generic [ref=e466]:
            - paragraph [ref=e467]: 📍 Se déplace jusqu'à 25 km
            - paragraph [ref=e468]: ⭐ 4,6 · 1 avis · ⚡ Répond en moins d'1h
          - generic [ref=e469]:
            - button "Voir le profil" [ref=e470] [cursor=pointer]
            - button "Contacter" [ref=e471] [cursor=pointer]
        - article [ref=e472]:
          - generic [ref=e473]:
            - generic [ref=e474]:
              - button "Voir le profil de Kévin M." [ref=e475] [cursor=pointer]
              - generic [ref=e476]:
                - heading "Kévin M." [level=2] [ref=e477]
                - paragraph [ref=e478]: 📍 Sainte-Anne · guadeloupe
            - button "Ajouter aux favoris" [ref=e479] [cursor=pointer]:
              - generic: 
          - generic [ref=e480]: ARTISAN PRO
          - paragraph [ref=e482]: Informatique · Installation TV · Wi-Fi · Smartphones
          - paragraph [ref=e483]: « Passionné de tech sur Sainte-Anne. Dépannage informatique, configuration box Wi-Fi, télévisions et smartphones à domicile. »
          - generic [ref=e484]:
            - paragraph [ref=e485]: 📍 Se déplace jusqu'à 30 km
            - paragraph [ref=e486]: ⭐ 4,9 · 3 avis · ⚡ Répond généralement en quelques minutes
          - generic [ref=e487]:
            - button "Voir le profil" [ref=e488] [cursor=pointer]
            - button "Contacter" [ref=e489] [cursor=pointer]
        - article [ref=e490]:
          - generic [ref=e491]:
            - generic [ref=e492]:
              - button "Voir le profil de Laëtitia C." [ref=e493] [cursor=pointer]
              - generic [ref=e494]:
                - heading "Laëtitia C." [level=2] [ref=e495]
                - paragraph [ref=e496]: 📍 Baie-Mahault · guadeloupe
            - button "Ajouter aux favoris" [ref=e497] [cursor=pointer]:
              - generic: 
          - generic [ref=e498]: ARTISAN PRO
          - paragraph [ref=e500]: Garde d'enfants · Accompagnement · Courses · Aide aux devoirs
          - paragraph [ref=e501]: « Nounou bienveillante à Baie-Mahault. Sortie d'école, garde périscolaire, activités ludiques et préparation des repas des petits. »
          - generic [ref=e502]:
            - paragraph [ref=e503]: 📍 Se déplace jusqu'à 15 km
            - paragraph [ref=e504]: ⭐ 5,0 · 3 avis · ⚡ Répond généralement en quelques minutes
          - generic [ref=e505]:
            - button "Voir le profil" [ref=e506] [cursor=pointer]
            - button "Contacter" [ref=e507] [cursor=pointer]
        - article [ref=e508]:
          - generic [ref=e509]:
            - generic [ref=e510]:
              - button "Voir le profil de Loïc C." [ref=e511] [cursor=pointer]
              - generic [ref=e512]:
                - heading "Loïc C." [level=2] [ref=e513]
                - paragraph [ref=e514]: 📍 Les Abymes · guadeloupe
            - button "Ajouter aux favoris" [ref=e515] [cursor=pointer]:
              - generic: 
          - generic [ref=e516]: ARTISAN PRO
          - paragraph [ref=e518]: Smartphones · Informatique · Wi-Fi · Ordinateurs
          - paragraph [ref=e519]: « Technicien informatique aux Abymes. Réparation PC/Mac, nettoyage de virus, récupération de données et réseau Wi-Fi. »
          - generic [ref=e520]:
            - paragraph [ref=e521]: 📍 Se déplace jusqu'à 25 km
            - paragraph [ref=e522]: ⭐ 4,8 · 2 avis · ⚡ Répond généralement en quelques minutes
          - generic [ref=e523]:
            - button "Voir le profil" [ref=e524] [cursor=pointer]
            - button "Contacter" [ref=e525] [cursor=pointer]
        - article [ref=e526]:
          - generic [ref=e527]:
            - generic [ref=e528]:
              - button "Voir le profil de Ludovic B." [ref=e529] [cursor=pointer]
              - generic [ref=e530]:
                - heading "Ludovic B." [level=2] [ref=e531]
                - paragraph [ref=e532]: 📍 Sainte-Anne · guadeloupe
            - button "Ajouter aux favoris" [ref=e533] [cursor=pointer]:
              - generic: 
          - generic [ref=e534]: ARTISAN PRO
          - paragraph [ref=e536]: Informatique · Domotique · Wi-Fi · Installation TV
          - paragraph [ref=e537]: « Technicien domotique et télécoms à Sainte-Anne. Installation de caméras connectées, répéteurs Wi-Fi et support multimédia. »
          - generic [ref=e538]:
            - paragraph [ref=e539]: 📍 Se déplace jusqu'à 25 km
            - paragraph [ref=e540]: ⭐ 4,8 · 2 avis · ⚡ Répond généralement en quelques minutes
          - generic [ref=e541]:
            - button "Voir le profil" [ref=e542] [cursor=pointer]
            - button "Contacter" [ref=e543] [cursor=pointer]
        - article [ref=e544]:
          - generic [ref=e545]:
            - generic [ref=e546]:
              - button "Voir le profil de Maëva D." [ref=e547] [cursor=pointer]
              - generic [ref=e548]:
                - heading "Maëva D." [level=2] [ref=e549]
                - paragraph [ref=e550]: 📍 Baie-Mahault · guadeloupe
            - button "Ajouter aux favoris" [ref=e551] [cursor=pointer]:
              - generic: 
          - generic [ref=e552]: ARTISAN PRO
          - paragraph [ref=e554]: Smartphone · Photo · Informatique · Démarches numériques
          - paragraph [ref=e555]: « Formatrice numérique sur Baie-Mahault. Prise en main de smartphone/tablette pour débutants, démarches en ligne et sauvegardes photos. »
          - generic [ref=e556]:
            - paragraph [ref=e557]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e558]: ⭐ 4,9 · 2 avis · ⚡ Répond généralement très rapidement
          - generic [ref=e559]:
            - button "Voir le profil" [ref=e560] [cursor=pointer]
            - button "Contacter" [ref=e561] [cursor=pointer]
        - article [ref=e562]:
          - generic [ref=e563]:
            - generic [ref=e564]:
              - button "Voir le profil de Magalie D." [ref=e565] [cursor=pointer]
              - generic [ref=e566]:
                - heading "Magalie D." [level=2] [ref=e567]
                - paragraph [ref=e568]: 📍 Morne-à-l'Eau · guadeloupe
            - button "Ajouter aux favoris" [ref=e569] [cursor=pointer]:
              - generic: 
          - generic [ref=e570]: ARTISAN PRO
          - paragraph [ref=e572]: Pâtisserie · Aide aux courses · Cuisine · Organisation
          - paragraph [ref=e573]: « Cuisinière & traiteur familial à Morne-à-l'Eau. Buffet créole, tourments d'amour, pâtisseries traditionnelles et repas de fête. »
          - generic [ref=e574]:
            - paragraph [ref=e575]: 📍 Se déplace jusqu'à 25 km
            - paragraph [ref=e576]: ⭐ 4,9 · 2 avis · ⚡ Répond en moins d'1h
          - generic [ref=e577]:
            - button "Voir le profil" [ref=e578] [cursor=pointer]
            - button "Contacter" [ref=e579] [cursor=pointer]
        - article [ref=e580]:
          - generic [ref=e581]:
            - generic [ref=e582]:
              - button "Voir le profil de Mélissa T." [ref=e583] [cursor=pointer]
              - generic [ref=e584]:
                - heading "Mélissa T." [level=2] [ref=e585]
                - paragraph [ref=e586]: 📍 Les Abymes · guadeloupe
            - button "Ajouter aux favoris" [ref=e587] [cursor=pointer]:
              - generic: 
          - generic [ref=e588]: ARTISAN PRO
          - paragraph [ref=e590]: Aide numérique · Graphisme · Réseaux sociaux · Photographie
          - paragraph [ref=e591]: « Créative aux Abymes, disponible pour vos logos, visuels réseaux sociaux, séances photos et accompagnement numérique. »
          - generic [ref=e592]:
            - paragraph [ref=e593]: 📍 Se déplace jusqu'à 40 km
            - paragraph [ref=e594]: ⭐ 4,8 · 2 avis · ⚡ Répond en moins d'1h
          - generic [ref=e595]:
            - button "Voir le profil" [ref=e596] [cursor=pointer]
            - button "Contacter" [ref=e597] [cursor=pointer]
        - article [ref=e598]:
          - generic [ref=e599]:
            - generic [ref=e600]:
              - button "Voir le profil de Mickaël S." [ref=e601] [cursor=pointer]
              - generic [ref=e602]:
                - heading "Mickaël S." [level=2] [ref=e603]
                - paragraph [ref=e604]: 📍 Les Abymes · guadeloupe
            - button "Ajouter aux favoris" [ref=e605] [cursor=pointer]:
              - generic: 
          - generic [ref=e606]: ARTISAN PRO
          - paragraph [ref=e608]: Montage de meubles · Peinture · Petit bricolage · Enduit
          - paragraph [ref=e609]: « Artisan peintre et bricoleur outillé sur Les Abymes. Peinture d'intérieur, préparation de murs et montage de meubles. »
          - generic [ref=e610]:
            - paragraph [ref=e611]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e612]: ⭐ 4,8 · 2 avis · ⚡ Répond généralement en quelques minutes
          - generic [ref=e613]:
            - button "Voir le profil" [ref=e614] [cursor=pointer]
            - button "Contacter" [ref=e615] [cursor=pointer]
        - article [ref=e616]:
          - generic [ref=e617]:
            - generic [ref=e618]:
              - button "Voir le profil de Murielle T." [ref=e619] [cursor=pointer]
              - generic [ref=e620]:
                - heading "Murielle T." [level=2] [ref=e621]
                - paragraph [ref=e622]: 📍 Le Moule · guadeloupe
            - button "Ajouter aux favoris" [ref=e623] [cursor=pointer]:
              - generic: 
          - generic [ref=e624]: ARTISAN PRO
          - paragraph [ref=e626]: Repassage · Couture · Aide quotidienne · Retouches
          - paragraph [ref=e627]: « Couturière chevronnée au Moule. Repassage soigné du linge de maison, ourlets, fermetures éclair et confections sur mesure. »
          - generic [ref=e628]:
            - paragraph [ref=e629]: 📍 Se déplace jusqu'à 15 km
            - paragraph [ref=e630]: ⭐ 4,9 · 3 avis · ⚡ Répond rapidement
          - generic [ref=e631]:
            - button "Voir le profil" [ref=e632] [cursor=pointer]
            - button "Contacter" [ref=e633] [cursor=pointer]
        - article [ref=e634]:
          - generic [ref=e635]:
            - generic [ref=e636]:
              - button "Voir le profil de Mylène D." [ref=e637] [cursor=pointer]
              - generic [ref=e638]:
                - heading "Mylène D." [level=2] [ref=e639]
                - paragraph [ref=e640]: 📍 Sainte-Rose · guadeloupe
            - button "Ajouter aux favoris" [ref=e641] [cursor=pointer]:
              - generic: 
          - generic [ref=e642]: ARTISAN PRO
          - paragraph [ref=e644]: Démarches numériques · Bureautique · Anglais · Soutien scolaire
          - paragraph [ref=e645]: « Formatrice et enseignante à Sainte-Rose. Aide aux devoirs, cours d'anglais intensifs et initiation à la bureautique. »
          - generic [ref=e646]:
            - paragraph [ref=e647]: 📍 Se déplace jusqu'à 25 km
            - paragraph [ref=e648]: ⭐ 4,9 · 2 avis · ⚡ Répond rapidement
          - generic [ref=e649]:
            - button "Voir le profil" [ref=e650] [cursor=pointer]
            - button "Contacter" [ref=e651] [cursor=pointer]
        - article [ref=e652]:
          - generic [ref=e653]:
            - generic [ref=e654]:
              - button "Voir le profil de Nadia M." [ref=e655] [cursor=pointer]
              - generic [ref=e656]:
                - heading "Nadia M." [level=2] [ref=e657]
                - paragraph [ref=e658]: 📍 Pointe-à-Pitre · guadeloupe
            - button "Ajouter aux favoris" [ref=e659] [cursor=pointer]:
              - generic: 
          - generic [ref=e660]: ARTISAN PRO
          - paragraph [ref=e662]: Préparation de repas · Rangement · Courses · Ménage
          - paragraph [ref=e663]: « Aide ménagère soigneuse à Pointe-à-Pitre. Entretien du domicile, rangement approfondi et cuisine familiale. »
          - generic [ref=e664]:
            - paragraph [ref=e665]: 📍 Se déplace jusqu'à 10 km
            - paragraph [ref=e666]: ⭐ 4,9 · 3 avis · ⚡ Répond rapidement
          - generic [ref=e667]:
            - button "Voir le profil" [ref=e668] [cursor=pointer]
            - button "Contacter" [ref=e669] [cursor=pointer]
        - article [ref=e670]:
          - generic [ref=e671]:
            - generic [ref=e672]:
              - button "Voir le profil de Nathalie R." [ref=e673] [cursor=pointer]
              - generic [ref=e674]:
                - heading "Nathalie R." [level=2] [ref=e675]
                - paragraph [ref=e676]: 📍 Saint-François · guadeloupe
            - button "Ajouter aux favoris" [ref=e677] [cursor=pointer]:
              - generic: 
          - generic [ref=e678]: ARTISAN PRO
          - paragraph [ref=e680]: Décoration · Organisation d'événements · Couture
          - paragraph [ref=e681]: « Créatrice textile à Saint-François. Confection de coussins, rideaux sur mesure, nappes d'extérieur et décoration de tables. »
          - generic [ref=e682]:
            - paragraph [ref=e683]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e684]: ⭐ 5,0 · 2 avis · ⚡ Répond généralement très rapidement
          - generic [ref=e685]:
            - button "Voir le profil" [ref=e686] [cursor=pointer]
            - button "Contacter" [ref=e687] [cursor=pointer]
        - article [ref=e688]:
          - generic [ref=e689]:
            - generic [ref=e690]:
              - button "Voir le profil de Patricia V." [ref=e691] [cursor=pointer]
              - generic [ref=e692]:
                - heading "Patricia V." [level=2] [ref=e693]
                - paragraph [ref=e694]: 📍 Capesterre-Belle-Eau · guadeloupe
            - button "Ajouter aux favoris" [ref=e695] [cursor=pointer]:
              - generic: 
          - generic [ref=e696]: ARTISAN PRO
          - paragraph [ref=e698]: Cuisine · Courses · Accompagnement · Garde ponctuelle
          - paragraph [ref=e699]: « Auxiliaire de vie à Capesterre-Belle-Eau. Accompagnement des seniors, garde ponctuelle d'enfants et repas faits maison. »
          - generic [ref=e700]:
            - paragraph [ref=e701]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e702]: ⭐ 5,0 · 2 avis · ⚡ Répond généralement très rapidement
          - generic [ref=e703]:
            - button "Voir le profil" [ref=e704] [cursor=pointer]
            - button "Contacter" [ref=e705] [cursor=pointer]
        - article [ref=e706]:
          - generic [ref=e707]:
            - generic [ref=e708]:
              - button "Voir le profil de Patrick S." [ref=e709] [cursor=pointer]
              - generic [ref=e710]:
                - heading "Patrick S." [level=2] [ref=e711]
                - paragraph [ref=e712]: 📍 Sainte-Rose · guadeloupe
            - button "Ajouter aux favoris" [ref=e713] [cursor=pointer]:
              - generic: 
          - generic [ref=e714]: ARTISAN PRO
          - paragraph [ref=e716]: Clôture · Entretien extérieur · Débroussaillage · Jardinage
          - paragraph [ref=e717]: « Jardinier paysagiste outillé à Sainte-Rose. Tonte de pelouse, élagage de palmiers, pose de grillage et entretien d'espaces verts. »
          - generic [ref=e718]:
            - paragraph [ref=e719]: 📍 Se déplace jusqu'à 25 km
            - paragraph [ref=e720]: ⭐ 4,6 · 2 avis · ⚡ Répond dans la journée
          - generic [ref=e721]:
            - button "Voir le profil" [ref=e722] [cursor=pointer]
            - button "Contacter" [ref=e723] [cursor=pointer]
        - article [ref=e724]:
          - generic [ref=e725]:
            - generic [ref=e726]:
              - button "Voir le profil de Ronald B." [ref=e727] [cursor=pointer]
              - generic [ref=e728]:
                - heading "Ronald B." [level=2] [ref=e729]
                - paragraph [ref=e730]: 📍 Le Gosier · guadeloupe
            - button "Ajouter aux favoris" [ref=e731] [cursor=pointer]:
              - generic: 
          - generic [ref=e732]: ARTISAN PRO
          - paragraph [ref=e734]: Manutention · Transport · Livraison · Déménagement
          - paragraph [ref=e735]: « Transporteur équipé au Gosier. Manutention lourde, livraison d'achats encombrants et débarras de locaux. »
          - generic [ref=e736]:
            - paragraph [ref=e737]: 📍 Se déplace jusqu'à 40 km
            - paragraph [ref=e738]: ⭐ 4,8 · 3 avis · ⚡ Répond en moins d'1h
          - generic [ref=e739]:
            - button "Voir le profil" [ref=e740] [cursor=pointer]
            - button "Contacter" [ref=e741] [cursor=pointer]
        - article [ref=e742]:
          - generic [ref=e743]:
            - generic [ref=e744]:
              - button "Voir le profil de Ruddy C." [ref=e745] [cursor=pointer]
              - generic [ref=e746]:
                - heading "Ruddy C." [level=2] [ref=e747]
                - paragraph [ref=e748]: 📍 Capesterre-Belle-Eau · guadeloupe
            - button "Ajouter aux favoris" [ref=e749] [cursor=pointer]:
              - generic: 
          - generic [ref=e750]: ARTISAN PRO
          - paragraph [ref=e752]: Taille · Jardinage · Débroussaillage · Déchets verts
          - paragraph [ref=e753]: « Jardinier équipé sur Capesterre-Belle-Eau. Débroussaillage de terrains, taille de haies, élagage léger et évacuation. »
          - generic [ref=e754]:
            - paragraph [ref=e755]: 📍 Se déplace jusqu'à 30 km
            - paragraph [ref=e756]: ⭐ 4,7 · 2 avis · ⚡ Répond en moins d'1h
          - generic [ref=e757]:
            - button "Voir le profil" [ref=e758] [cursor=pointer]
            - button "Contacter" [ref=e759] [cursor=pointer]
        - article [ref=e760]:
          - generic [ref=e761]:
            - generic [ref=e762]:
              - button "Voir le profil de Sandrine V." [ref=e763] [cursor=pointer]
              - generic [ref=e764]:
                - heading "Sandrine V." [level=2] [ref=e765]
                - paragraph [ref=e766]: 📍 Petit-Canal · guadeloupe
            - button "Ajouter aux favoris" [ref=e767] [cursor=pointer]:
              - generic: 
          - generic [ref=e768]: ARTISAN PRO
          - paragraph [ref=e770]: Accompagnement · Courses · Cuisine · Aide administrative
          - paragraph [ref=e771]: « Habitante dévouée à Petit-Canal. Soutien aux personnes isolées, accompagnement médical, préparation de repas et courses. »
          - generic [ref=e772]:
            - paragraph [ref=e773]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e774]: ⭐ 4,9 · 2 avis · ⚡ Répond en moins d'1h
          - generic [ref=e775]:
            - button "Voir le profil" [ref=e776] [cursor=pointer]
            - button "Contacter" [ref=e777] [cursor=pointer]
        - article [ref=e778]:
          - generic [ref=e779]:
            - generic [ref=e780]:
              - button "Voir le profil de Sonia V." [ref=e781] [cursor=pointer]
              - generic [ref=e782]:
                - heading "Sonia V." [level=2] [ref=e783]
                - paragraph [ref=e784]: 📍 Sainte-Rose · guadeloupe
            - button "Ajouter aux favoris" [ref=e785] [cursor=pointer]:
              - generic: 
          - generic [ref=e786]: ARTISAN PRO
          - paragraph [ref=e788]: Accompagnement · Démarches · Courses · Aide quotidienne
          - paragraph [ref=e789]: « Voisine bienveillante sur Sainte-Rose, disponible pour accompagner vos proches aux rendez-vous, faire les courses et aider au quotidien. »
          - generic [ref=e790]:
            - paragraph [ref=e791]: 📍 Se déplace jusqu'à 25 km
            - paragraph [ref=e792]: ⭐ 5,0 · 2 avis · ⚡ Répond en moins d'1h
          - generic [ref=e793]:
            - button "Voir le profil" [ref=e794] [cursor=pointer]
            - button "Contacter" [ref=e795] [cursor=pointer]
        - article [ref=e796]:
          - generic [ref=e797]:
            - generic [ref=e798]:
              - button "Voir le profil de Steeve M." [ref=e799] [cursor=pointer]
              - generic [ref=e800]:
                - heading "Steeve M." [level=2] [ref=e801]
                - paragraph [ref=e802]: 📍 Sainte-Anne · guadeloupe
            - button "Ajouter aux favoris" [ref=e803] [cursor=pointer]:
              - generic: 
          - generic [ref=e804]: ARTISAN PRO
          - paragraph [ref=e806]: Déménagement · Manutention · Livraison · Montage de meubles
          - paragraph [ref=e807]: « Jeune homme dynamique et équipé sur Sainte-Anne. Montage de meubles en kit, bras forts pour déménagement et manutention. »
          - generic [ref=e808]:
            - paragraph [ref=e809]: 📍 Se déplace jusqu'à 30 km
            - paragraph [ref=e810]: ⭐ 4,7 · 2 avis · ⚡ Répond en moins d'1h
          - generic [ref=e811]:
            - button "Voir le profil" [ref=e812] [cursor=pointer]
            - button "Contacter" [ref=e813] [cursor=pointer]
        - article [ref=e814]:
          - generic [ref=e815]:
            - generic [ref=e816]:
              - button "Voir le profil de Stéphanie L." [ref=e817] [cursor=pointer]
              - generic [ref=e818]:
                - heading "Stéphanie L." [level=2] [ref=e819]
                - paragraph [ref=e820]: 📍 Baie-Mahault · guadeloupe
            - button "Ajouter aux favoris" [ref=e821] [cursor=pointer]:
              - generic: 
          - generic [ref=e822]: ARTISAN PRO
          - paragraph [ref=e824]: Bureautique · Démarches en ligne · Aide administrative
          - paragraph [ref=e825]: « Assistante administrative expérimentée sur Baie-Mahault. Démarches CAF, Impôts, réorganisation de documents et courriers. »
          - generic [ref=e826]:
            - paragraph [ref=e827]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e828]: ⭐ 5,0 · 1 avis · ⚡ Répond généralement très rapidement
          - generic [ref=e829]:
            - button "Voir le profil" [ref=e830] [cursor=pointer]
            - button "Contacter" [ref=e831] [cursor=pointer]
        - article [ref=e832]:
          - generic [ref=e833]:
            - generic [ref=e834]:
              - button "Voir le profil de Sylvie C." [ref=e835] [cursor=pointer]
              - generic [ref=e836]:
                - heading "Sylvie C." [level=2] [ref=e837]
                - paragraph [ref=e838]: 📍 Morne-à-l'Eau · guadeloupe
            - button "Ajouter aux favoris" [ref=e839] [cursor=pointer]:
              - generic: 
          - generic [ref=e840]: ARTISAN PRO
          - paragraph [ref=e842]: Cuisine · Pâtisserie · Courses · Aide quotidienne
          - paragraph [ref=e843]: « Cuisinière passionnée à Morne-à-l'Eau. Préparation de plats créoles traditionnels, gâteaux d'anniversaire et livraison de repas. »
          - generic [ref=e844]:
            - paragraph [ref=e845]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e846]: ⭐ 5,0 · 2 avis · ⚡ Répond rapidement
          - generic [ref=e847]:
            - button "Voir le profil" [ref=e848] [cursor=pointer]
            - button "Contacter" [ref=e849] [cursor=pointer]
        - article [ref=e850]:
          - generic [ref=e851]:
            - generic [ref=e852]:
              - button "Voir le profil de Teddy V." [ref=e853] [cursor=pointer]
              - generic [ref=e854]:
                - heading "Teddy V." [level=2] [ref=e855]
                - paragraph [ref=e856]: 📍 Petit-Bourg · guadeloupe
            - button "Ajouter aux favoris" [ref=e857] [cursor=pointer]:
              - generic: 
          - generic [ref=e858]: ARTISAN PRO
          - paragraph [ref=e860]: Dépannage · Électricité · Climatisation · Entretien
          - paragraph [ref=e861]: « Frigoriste & électricien diplômé à Petit-Bourg. Nettoyage bactériologique de clim, recherche de pannes électriques et entretien. »
          - generic [ref=e862]:
            - paragraph [ref=e863]: 📍 Se déplace jusqu'à 30 km
            - paragraph [ref=e864]: ⭐ 4,9 · 3 avis · ⚡ Répond en moins d'1h
          - generic [ref=e865]:
            - button "Voir le profil" [ref=e866] [cursor=pointer]
            - button "Contacter" [ref=e867] [cursor=pointer]
        - article [ref=e868]:
          - generic [ref=e869]:
            - generic [ref=e870]:
              - button "Voir le profil de Thierry N." [ref=e871] [cursor=pointer]
              - generic [ref=e872]:
                - heading "Thierry N." [level=2] [ref=e873]
                - paragraph [ref=e874]: 📍 Lamentin · guadeloupe
            - button "Ajouter aux favoris" [ref=e875] [cursor=pointer]:
              - generic: 
          - generic [ref=e876]: ARTISAN PRO
          - paragraph [ref=e878]: Pose luminaires · Petit dépannage · Électricité · Bricolage
          - paragraph [ref=e879]: « Électricien outillé au Lamentin. Petit dépannage électrique, pose de lustres, prises et disjoncteurs. »
          - generic [ref=e880]:
            - paragraph [ref=e881]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e882]: ⭐ 4,9 · 2 avis · ⚡ Répond rapidement
          - generic [ref=e883]:
            - button "Voir le profil" [ref=e884] [cursor=pointer]
            - button "Contacter" [ref=e885] [cursor=pointer]
        - article [ref=e886]:
          - generic [ref=e887]:
            - generic [ref=e888]:
              - button "Voir le profil de Vanessa C." [ref=e889] [cursor=pointer]
              - generic [ref=e890]:
                - heading "Vanessa C." [level=2] [ref=e891]
                - paragraph [ref=e892]: 📍 Saint-François · guadeloupe
            - button "Ajouter aux favoris" [ref=e893] [cursor=pointer]:
              - generic: 
          - generic [ref=e894]: ARTISAN PRO
          - paragraph [ref=e896]: Préparation événementielle · Coiffure · Courses
          - paragraph [ref=e897]: « Coiffeuse à domicile passionnée sur Saint-François. Brushing, tresses, coiffures événementielles et soins du cheveu. »
          - generic [ref=e898]:
            - paragraph [ref=e899]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e900]: ⭐ 5,0 · 2 avis · ⚡ Répond généralement en quelques minutes
          - generic [ref=e901]:
            - button "Voir le profil" [ref=e902] [cursor=pointer]
            - button "Contacter" [ref=e903] [cursor=pointer]
        - article [ref=e904]:
          - generic [ref=e905]:
            - generic [ref=e906]:
              - button "Voir le profil de Willy C." [ref=e907] [cursor=pointer]
              - generic [ref=e908]:
                - heading "Willy C." [level=2] [ref=e909]
                - paragraph [ref=e910]: 📍 Capesterre-Belle-Eau · guadeloupe
            - button "Ajouter aux favoris" [ref=e911] [cursor=pointer]:
              - generic: 
          - generic [ref=e912]: ARTISAN PRO
          - paragraph [ref=e914]: Élagage léger · Jardinage · Débroussaillage · Nettoyage extérieur
          - paragraph [ref=e915]: « Entretien d'espaces verts à Capesterre. Taille de fruitiers, élagage de palmiers, nettoyage au karcher et débarras végétal. »
          - generic [ref=e916]:
            - paragraph [ref=e917]: 📍 Se déplace jusqu'à 25 km
            - paragraph [ref=e918]: ⭐ 4,8 · 2 avis · ⚡ Répond rapidement
          - generic [ref=e919]:
            - button "Voir le profil" [ref=e920] [cursor=pointer]
            - button "Contacter" [ref=e921] [cursor=pointer]
        - article [ref=e922]:
          - generic [ref=e923]:
            - generic [ref=e924]:
              - button "Voir le profil de Yannick C." [ref=e925] [cursor=pointer]
              - generic [ref=e926]:
                - heading "Yannick C." [level=2] [ref=e927]
                - paragraph [ref=e928]: 📍 Pointe-à-Pitre · guadeloupe
            - button "Ajouter aux favoris" [ref=e929] [cursor=pointer]:
              - generic: 
          - generic [ref=e930]: ARTISAN PRO
          - paragraph [ref=e932]: Bricolage · Réparations · Menuiserie · Montage de meubles
          - paragraph [ref=e933]: « Bricoleur et menuisier outillé à Pointe-à-Pitre. Réparation de volets en bois, serrures, montage de meubles et fixations murales. »
          - generic [ref=e934]:
            - paragraph [ref=e935]: 📍 Se déplace jusqu'à 15 km
            - paragraph [ref=e936]: ⭐ 4,8 · 2 avis · ⚡ Répond généralement en quelques minutes
          - generic [ref=e937]:
            - button "Voir le profil" [ref=e938] [cursor=pointer]
            - button "Contacter" [ref=e939] [cursor=pointer]
        - article [ref=e940]:
          - generic [ref=e941]:
            - generic [ref=e942]:
              - button "Voir le profil de yoann d." [ref=e943] [cursor=pointer]
              - generic [ref=e944]:
                - heading "yoann d." [level=2] [ref=e945]
                - paragraph [ref=e946]: 📍 Saint-François · Guadeloupe (971)
            - button "Ajouter aux favoris" [ref=e947] [cursor=pointer]:
              - generic: 
          - paragraph [ref=e948]: Cuisine & Traiteur · Informatique & High-Tech · Jardinage & Élagage · Ménage & Entretien
          - paragraph [ref=e949]: « Onthetrack »
          - generic [ref=e950]:
            - paragraph [ref=e951]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e952]: ⭐ 4,7 · 2 avis · ⚡ Répond généralement rapidement
          - generic [ref=e953]:
            - button "Voir le profil" [ref=e954] [cursor=pointer]
            - button "Contacter" [ref=e955] [cursor=pointer]
        - article [ref=e956]:
          - generic [ref=e957]:
            - generic [ref=e958]:
              - button "Voir le profil de Yolande C." [ref=e959] [cursor=pointer]
              - generic [ref=e960]:
                - heading "Yolande C." [level=2] [ref=e961]
                - paragraph [ref=e962]: 📍 Le Gosier · guadeloupe
            - button "Ajouter aux favoris" [ref=e963] [cursor=pointer]:
              - generic: 
          - generic [ref=e964]: ARTISAN PRO
          - paragraph [ref=e966]: Retouches · Couture · Aide aux courses · Cuisine
          - paragraph [ref=e967]: « Couturière et aide à domicile passionnée au Gosier. Je propose retouches, petits plats créoles et accompagnement au quotidien. »
          - generic [ref=e968]:
            - paragraph [ref=e969]: 📍 Se déplace jusqu'à 15 km
            - paragraph [ref=e970]: ⭐ 5,0 · 2 avis · ⚡ Répond généralement très rapidement
          - generic [ref=e971]:
            - button "Voir le profil" [ref=e972] [cursor=pointer]
            - button "Contacter" [ref=e973] [cursor=pointer]
      - paragraph [ref=e974]: Services correspondant à votre recherche, puis noms par ordre alphabétique.
  - contentinfo [ref=e975]:
    - generic [ref=e976]:
      - generic [ref=e977]:
        - generic [ref=e978]:
          - link "LYANN LE LIEN QUI COMPTE" [ref=e979] [cursor=pointer]:
            - /url: index.html
            - generic [ref=e986]:
              - generic [ref=e987]: LYANN
              - generic [ref=e988]: LE LIEN QUI COMPTE
          - paragraph [ref=e989]: Le premier réseau de confiance qui connecte les habitants et les talents de quartier dans tous les DOM.
          - generic [ref=e990]: Guadeloupe • Martinique • Guyane • La Réunion • Saint-Martin
        - generic [ref=e991]:
          - generic [ref=e992]:
            - link "Notre Histoire" [ref=e993] [cursor=pointer]:
              - /url: about.html
            - link "Comment ça marche" [ref=e994] [cursor=pointer]:
              - /url: how-it-works.html
            - link "Trouver un service" [ref=e995] [cursor=pointer]:
              - /url: results.html
            - link "Tarifs & Offres" [ref=e996] [cursor=pointer]:
              - /url: pricing.html
          - generic [ref=e997]:
            - link "Inscrire mon activité" [ref=e998] [cursor=pointer]:
              - /url: "#"
            - link "Espace Membre" [ref=e999] [cursor=pointer]:
              - /url: "#"
      - generic [ref=e1000]:
        - navigation "Conditions et informations légales" [ref=e1001]:
          - link "Conditions·" [ref=e1002] [cursor=pointer]:
            - /url: legal.html
          - link "Confidentialité·" [ref=e1003] [cursor=pointer]:
            - /url: confidentialite.html
          - link "Cookies·" [ref=e1004] [cursor=pointer]:
            - /url: legal.html#cookies
          - link "Mentions légales·" [ref=e1005] [cursor=pointer]:
            - /url: legal.html#mentions-legales
          - link "Contact" [ref=e1006] [cursor=pointer]:
            - /url: "#contact"
        - paragraph [ref=e1007]: © 2026 LYANN. Tous droits réservés. Conçu avec passion dans les Caraïbes pour nos territoires.
  - option "Contenu ou langage inapproprié" [selected]
  - option "Profil inexact ou fausses coordonnées"
  - option "Démarchage abusif / Spam"
  - option "Autre problème de sérénité"
  - option "❄️ Climatisation & Entretien" [selected]
  - option "💧 Plomberie & Dépannage"
  - option "⚡ Électricité & Tableau"
  - option "🌴 Jardin & Espaces Verts"
  - option "🎨 Peinture & Rénovation"
  - option "🛠️ Autre service à domicile"
  - option "Matin (8h - 12h)" [selected]
  - option "Après-midi (14h - 18h)"
  - option "Soirée (18h - 20h)"
  - text:  
```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | 
  3   | function qaCredentials(actor) {
  4   |   const email = process.env[`LYANN_E2E_QA_${actor}_EMAIL`];
  5   |   const password = process.env[`LYANN_E2E_QA_${actor}_PASSWORD`];
> 6   |   expect(email, `Existing QA ${actor} email is required`).toBeTruthy();
      |                                                           ^ Error: Existing QA B email is required
  7   |   expect(password, `Existing QA ${actor} password is required`).toBeTruthy();
  8   |   return { email, password };
  9   | }
  10  | 
  11  | // Public real-backend journeys. No synthetic profiles, Requests, or successful API mocks.
  12  | async function ready(page, mode = 'annonces') {
  13  |   if (mode === 'annonces') {
  14  |     await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  15  |     const error = await page.evaluate(async ({email,password}) => {
  16  |       const result = await window.LYANN_API_CLIENT.login(email, password);
  17  |       return result.error?.message || null;
  18  |     }, qaCredentials('B'));
  19  |     expect(error, 'Real repository QA login must succeed').toBeNull();
  20  |   }
  21  |   await page.goto(`/results.html?mode=${mode}&area=`, { waitUntil: 'domcontentloaded' });
  22  |   await expect(page.locator('#explorerResults')).toHaveAttribute('aria-busy', 'false', { timeout: 20000 });
  23  |   await expect(page.locator('#explorerResults')).not.toHaveAttribute('data-state', 'ERROR');
  24  | }
  25  | function observe(page) {
  26  |   const errors = [], failures = [];
  27  |   page.on('pageerror', e => errors.push(e.message));
  28  |   page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  29  |   page.on('requestfailed', r => { if (r.failure()?.errorText !== 'net::ERR_ABORTED') failures.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`); });
  30  |   page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
  31  |   return { errors, failures };
  32  | }
  33  | 
  34  | test('Annonces renders persisted public Requests and opens their real detail', async ({ page }) => {
  35  |   const telemetry = observe(page);
  36  |   await ready(page);
  37  |   const rows = await page.evaluate(async () => (await window.LYANN_EXPLORER_REPOSITORY.loadRequests()).filter(r => r.status === 'OPEN'));
  38  |   expect(rows.length, 'Backend must contain an open public Request for this journey').toBeGreaterThan(0);
  39  |   expect(rows.every(r => Boolean(r.requester_id)), 'Authenticated discovery retains canonical requester identity').toBe(true);
  40  |   await expect(page.locator('#explorerResults [data-request-id]')).toHaveCount(rows.length);
  41  |   const card = page.locator(`#explorerResults [data-request-id="${rows[0].id}"]`);
  42  |   await expect(card).toContainText(rows[0].title);
  43  |   await card.getByRole('button', { name: 'Détails', exact: true }).click();
  44  |   await expect(page.locator('#lyannDetailModal')).toBeVisible();
  45  |   await expect(page.locator('#lyannDetailTitle')).toHaveText(rows[0].title);
  46  |   await expect(page.locator('#lyannDetailBody')).toContainText(rows[0].description);
  47  |   expect(telemetry.errors).toEqual([]);
  48  |   expect(telemetry.failures).toEqual([]);
  49  | });
  50  | 
  51  | test('Lyanneurs queries real profiles/services and opens canonical profile', async ({ page }) => {
  52  |   const telemetry = observe(page);
  53  |   await ready(page, 'lyanneurs');
  54  |   const profile = await page.evaluate(async () => (await window.LYANN_EXPLORER_REPOSITORY.load()).find(p => p.services.length));
  55  |   expect(profile, 'Backend must contain a public profile with an active service').toBeTruthy();
  56  |   await page.getByRole('searchbox').fill(profile.services[0].title);
  57  |   await page.getByRole('button', { name: 'Rechercher', exact:true }).click();
  58  |   const card = page.locator(`#explorerResults [data-member-id="${profile.id}"]`);
  59  |   await expect(card).toBeVisible();
  60  |   await card.getByRole('button', {name:'Voir le profil',exact:true}).click();
  61  |   await expect(page.locator('#publicMemberProfileModal')).toBeVisible();
  62  |   await expect(page.locator('#publicMemberProfileModal')).toContainText(profile.services[0].title);
  63  |   await expect(page.locator('#publicMemberProfileModal [data-lyann-route="messages"]')).toHaveAttribute('data-contact-id', profile.id);
  64  |   expect(telemetry.errors).toEqual([]);
  65  |   expect(telemetry.failures).toEqual([]);
  66  | });
  67  | 
  68  | test('Lyanneur avatar and name open the canonical profile, not only the explicit button', async ({page}) => {
  69  |   const telemetry = observe(page);
  70  |   await ready(page, 'lyanneurs');
  71  |   const profile = await page.evaluate(async () => (await window.LYANN_EXPLORER_REPOSITORY.load()).find(p => p.services.length));
  72  |   expect(profile, 'Backend must contain a public profile with an active service').toBeTruthy();
  73  |   const trigger = page.locator(`#explorerResults [data-member-id="${profile.id}"] .explorer-person-zone`)
  74  |     .getByRole('button', {name:/^Voir le profil de /});
  75  |   const box = await trigger.boundingBox();
  76  |   expect(box.width, 'Avatar and name zone stays a real touch target').toBeGreaterThanOrEqual(44);
  77  |   expect(box.height, 'Avatar and name zone stays a real touch target').toBeGreaterThanOrEqual(44);
  78  |   for (const position of [{x:20, y:22}, {x:box.width - 10, y:14}]) {
  79  |     await trigger.click({position});
  80  |     await expect(page.locator('#publicMemberProfileModal')).toBeVisible();
  81  |     await expect(page.locator('#publicMemberProfileModal')).toContainText(profile.services[0].title);
  82  |     await page.locator('#closePublicProfileModalBtn').click();
  83  |     await expect(page.locator('#publicMemberProfileModal')).not.toBeVisible();
  84  |   }
  85  |   expect(telemetry.errors).toEqual([]);
  86  |   expect(telemetry.failures).toEqual([]);
  87  | });
  88  | 
  89  | test('Both modes use the same database taxonomy and removable category filter', async ({page}) => {
  90  |   test.setTimeout(60000);
  91  |   await ready(page);
  92  |   const categories = await page.locator('#explorerCategory option').allTextContents();
  93  |   const category = await page.evaluate(async () => {
  94  |     const repo = window.LYANN_EXPLORER_REPOSITORY;
  95  |     const [requests, taxonomy] = await Promise.all([repo.loadRequests(), repo.taxonomy()]);
  96  |     return taxonomy.find(t => requests.some(r => r.taxonomy_id === t.id || r.category === t.category))?.category;
  97  |   });
  98  |   expect(category).toBeTruthy();
  99  |   await page.locator('#explorerCategory').selectOption(category);
  100 |   await expect(page.locator('#explorerActiveFilters')).toContainText(category);
  101 |   const requestIds = await page.locator('#explorerResults [data-request-id]').evaluateAll(nodes => nodes.map(n => n.dataset.requestId));
  102 |   expect(requestIds.length).toBeGreaterThan(0);
  103 |   await page.getByRole('tab', {name:/Lyanneurs/}).click();
  104 |   await expect(page.locator('#explorerResults')).toHaveAttribute('aria-busy','false');
  105 |   expect(await page.locator('#explorerCategory option').allTextContents()).toEqual(categories);
  106 |   await expect(page.locator('#explorerCategory')).toHaveValue(category);
```