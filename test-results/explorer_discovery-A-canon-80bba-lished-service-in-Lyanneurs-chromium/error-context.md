# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: explorer_discovery.spec.js >> A canonical category also selects a real published service in Lyanneurs
- Location: tests/e2e/explorer_discovery.spec.js:187:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 0
+ Received  + 7

  Array [
+   "08e8b6fd-47b1-4077-851a-7b74043616b2",
+   "0e6493d5-ef18-4745-8a7f-642fabfd9fe8",
+   "488e6466-5557-4852-94a2-7ec9048e89d6",
    "7fc0945b-3fda-43cc-8c62-b2490bda7927",
+   "92eec6cf-5afa-4ba2-8060-749baeb6cecd",
+   "a60b352c-b183-4d0c-8713-d3ffe76fb9de",
    "c83c147f-0daa-430f-a7a6-4e2bf4dcc1e6",
+   "caee5839-b62f-493e-86ec-b281dc598ef6",
+   "d14a6f15-f637-4a6a-b5a0-6165bbc1df6c",
  ]
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
            - option "Toutes les catégories"
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
            - option "Ménage" [selected]
            - option "Photographie"
            - option "Plomberie"
            - option "Poterie & Céramique"
            - option "Soutien Scolaire"
            - option "Sport & Coaching"
        - button "Filtres et zone" [ref=e53] [cursor=pointer]:
          - generic [aria-hidden] [ref=e54]: 
          - text: Filtres et zone
      - generic "Filtres actifs" [ref=e55]:
        - button "Retirer le filtre Ménage" [ref=e56] [cursor=pointer]: Ménage ×
      - status [ref=e58]: 9 Lyanneurs · Tous les lieux
      - generic [ref=e59]:
        - article [ref=e60]:
          - generic [ref=e61]:
            - generic [ref=e62]:
              - button "Voir le profil de Alain C." [ref=e63] [cursor=pointer]
              - generic [ref=e64]:
                - heading "Alain C." [level=2] [ref=e65]
                - paragraph [ref=e66]: 📍 Petit-Bourg · guadeloupe
            - button "Ajouter aux favoris" [ref=e67] [cursor=pointer]:
              - generic: 
          - generic [ref=e68]: ARTISAN PRO
          - paragraph [ref=e70]: Nettoyage · Jardinage · Bricolage extérieur · Entretien piscine
          - paragraph [ref=e71]: « Entretien de jardins et extérieurs à Petit-Bourg. Nettoyage de terrasses, traitement de piscine et petits travaux extérieurs. »
          - generic [ref=e72]:
            - paragraph [ref=e73]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e74]: ⭐ 4,9 · 3 avis · ⚡ Répond généralement très rapidement
          - generic [ref=e75]:
            - button "Voir le profil" [ref=e76] [cursor=pointer]
            - button "Contacter" [ref=e77] [cursor=pointer]
        - article [ref=e78]:
          - generic [ref=e79]:
            - generic [ref=e80]:
              - button "Voir le profil de Frédéric M." [ref=e81] [cursor=pointer]
              - generic [ref=e82]:
                - heading "Frédéric M." [level=2] [ref=e83]
                - paragraph [ref=e84]: 📍 Lamentin · guadeloupe
            - button "Ajouter aux favoris" [ref=e85] [cursor=pointer]:
              - generic: 
          - generic [ref=e86]: ARTISAN PRO
          - paragraph [ref=e88]: Nettoyage haute pression · Bricolage · Enduit · Peinture
          - paragraph [ref=e89]: « Artisan rénovateur sur Baie-Mahault. Travaux de peinture, pose de faux plafonds, carrelage et rafraîchissement d'intérieurs. »
          - generic [ref=e90]:
            - paragraph [ref=e91]: 📍 Se déplace jusqu'à 30 km
            - paragraph [ref=e92]: ⭐ 4,7 · 2 avis · ⚡ Répond en moins d'1h
          - generic [ref=e93]:
            - button "Voir le profil" [ref=e94] [cursor=pointer]
            - button "Contacter" [ref=e95] [cursor=pointer]
        - article [ref=e96]:
          - generic [ref=e97]:
            - generic [ref=e98]:
              - button "Voir le profil de Jimmy L." [ref=e99] [cursor=pointer]
              - generic [ref=e100]:
                - heading "Jimmy L." [level=2] [ref=e101]
                - paragraph [ref=e102]: 📍 Baie-Mahault · guadeloupe
            - button "Ajouter aux favoris" [ref=e103] [cursor=pointer]:
              - generic: 
          - generic [ref=e104]: ARTISAN PRO
          - paragraph [ref=e106]: Déménagement · Manutention · Transport d'objets · Utilitaire
          - paragraph [ref=e107]: « Équipé d'un grand utilitaire sur Baie-Mahault. Transport de meubles, électroménager, cartons et petits déménagements. »
          - generic [ref=e108]:
            - paragraph [ref=e109]: 📍 Se déplace dans toute l'île
            - paragraph [ref=e110]: ⭐ 4,8 · 2 avis · ⚡ Répond généralement en quelques minutes
          - generic [ref=e111]:
            - button "Voir le profil" [ref=e112] [cursor=pointer]
            - button "Contacter" [ref=e113] [cursor=pointer]
        - article [ref=e114]:
          - generic [ref=e115]:
            - generic [ref=e116]:
              - button "Voir le profil de Murielle T." [ref=e117] [cursor=pointer]
              - generic [ref=e118]:
                - heading "Murielle T." [level=2] [ref=e119]
                - paragraph [ref=e120]: 📍 Le Moule · guadeloupe
            - button "Ajouter aux favoris" [ref=e121] [cursor=pointer]:
              - generic: 
          - generic [ref=e122]: ARTISAN PRO
          - paragraph [ref=e124]: Repassage · Couture · Aide quotidienne · Retouches
          - paragraph [ref=e125]: « Couturière chevronnée au Moule. Repassage soigné du linge de maison, ourlets, fermetures éclair et confections sur mesure. »
          - generic [ref=e126]:
            - paragraph [ref=e127]: 📍 Se déplace jusqu'à 15 km
            - paragraph [ref=e128]: ⭐ 4,9 · 3 avis · ⚡ Répond rapidement
          - generic [ref=e129]:
            - button "Voir le profil" [ref=e130] [cursor=pointer]
            - button "Contacter" [ref=e131] [cursor=pointer]
        - article [ref=e132]:
          - generic [ref=e133]:
            - generic [ref=e134]:
              - button "Voir le profil de Nadia M." [ref=e135] [cursor=pointer]
              - generic [ref=e136]:
                - heading "Nadia M." [level=2] [ref=e137]
                - paragraph [ref=e138]: 📍 Pointe-à-Pitre · guadeloupe
            - button "Ajouter aux favoris" [ref=e139] [cursor=pointer]:
              - generic: 
          - generic [ref=e140]: ARTISAN PRO
          - paragraph [ref=e142]: Ménage · Préparation de repas · Rangement · Courses
          - paragraph [ref=e143]: « Aide ménagère soigneuse à Pointe-à-Pitre. Entretien du domicile, rangement approfondi et cuisine familiale. »
          - generic [ref=e144]:
            - paragraph [ref=e145]: 📍 Se déplace jusqu'à 10 km
            - paragraph [ref=e146]: ⭐ 4,9 · 3 avis · ⚡ Répond rapidement
          - generic [ref=e147]:
            - button "Voir le profil" [ref=e148] [cursor=pointer]
            - button "Contacter" [ref=e149] [cursor=pointer]
        - article [ref=e150]:
          - generic [ref=e151]:
            - generic [ref=e152]:
              - button "Voir le profil de Ronald B." [ref=e153] [cursor=pointer]
              - generic [ref=e154]:
                - heading "Ronald B." [level=2] [ref=e155]
                - paragraph [ref=e156]: 📍 Le Gosier · guadeloupe
            - button "Ajouter aux favoris" [ref=e157] [cursor=pointer]:
              - generic: 
          - generic [ref=e158]: ARTISAN PRO
          - paragraph [ref=e160]: Déménagement · Manutention · Transport · Livraison
          - paragraph [ref=e161]: « Transporteur équipé au Gosier. Manutention lourde, livraison d'achats encombrants et débarras de locaux. »
          - generic [ref=e162]:
            - paragraph [ref=e163]: 📍 Se déplace jusqu'à 40 km
            - paragraph [ref=e164]: ⭐ 4,8 · 3 avis · ⚡ Répond en moins d'1h
          - generic [ref=e165]:
            - button "Voir le profil" [ref=e166] [cursor=pointer]
            - button "Contacter" [ref=e167] [cursor=pointer]
        - article [ref=e168]:
          - generic [ref=e169]:
            - generic [ref=e170]:
              - button "Voir le profil de Steeve M." [ref=e171] [cursor=pointer]
              - generic [ref=e172]:
                - heading "Steeve M." [level=2] [ref=e173]
                - paragraph [ref=e174]: 📍 Sainte-Anne · guadeloupe
            - button "Ajouter aux favoris" [ref=e175] [cursor=pointer]:
              - generic: 
          - generic [ref=e176]: ARTISAN PRO
          - paragraph [ref=e178]: Déménagement · Manutention · Livraison · Montage de meubles
          - paragraph [ref=e179]: « Jeune homme dynamique et équipé sur Sainte-Anne. Montage de meubles en kit, bras forts pour déménagement et manutention. »
          - generic [ref=e180]:
            - paragraph [ref=e181]: 📍 Se déplace jusqu'à 30 km
            - paragraph [ref=e182]: ⭐ 4,7 · 2 avis · ⚡ Répond en moins d'1h
          - generic [ref=e183]:
            - button "Voir le profil" [ref=e184] [cursor=pointer]
            - button "Contacter" [ref=e185] [cursor=pointer]
        - article [ref=e186]:
          - generic [ref=e187]:
            - generic [ref=e188]:
              - button "Voir le profil de Willy C." [ref=e189] [cursor=pointer]
              - generic [ref=e190]:
                - heading "Willy C." [level=2] [ref=e191]
                - paragraph [ref=e192]: 📍 Capesterre-Belle-Eau · guadeloupe
            - button "Ajouter aux favoris" [ref=e193] [cursor=pointer]:
              - generic: 
          - generic [ref=e194]: ARTISAN PRO
          - paragraph [ref=e196]: Nettoyage extérieur · Élagage léger · Jardinage · Débroussaillage
          - paragraph [ref=e197]: « Entretien d'espaces verts à Capesterre. Taille de fruitiers, élagage de palmiers, nettoyage au karcher et débarras végétal. »
          - generic [ref=e198]:
            - paragraph [ref=e199]: 📍 Se déplace jusqu'à 25 km
            - paragraph [ref=e200]: ⭐ 4,8 · 2 avis · ⚡ Répond rapidement
          - generic [ref=e201]:
            - button "Voir le profil" [ref=e202] [cursor=pointer]
            - button "Contacter" [ref=e203] [cursor=pointer]
        - article [ref=e204]:
          - generic [ref=e205]:
            - generic [ref=e206]:
              - button "Voir le profil de yoann d." [ref=e207] [cursor=pointer]
              - generic [ref=e208]:
                - heading "yoann d." [level=2] [ref=e209]
                - paragraph [ref=e210]: 📍 Saint-François · Guadeloupe (971)
            - button "Ajouter aux favoris" [ref=e211] [cursor=pointer]:
              - generic: 
          - paragraph [ref=e212]: Ménage & Entretien · Cuisine & Traiteur · Informatique & High-Tech · Jardinage & Élagage
          - paragraph [ref=e213]: « Onthetrack »
          - generic [ref=e214]:
            - paragraph [ref=e215]: 📍 Se déplace jusqu'à 20 km
            - paragraph [ref=e216]: ⭐ 4,7 · 2 avis · ⚡ Répond généralement rapidement
          - generic [ref=e217]:
            - button "Voir le profil" [ref=e218] [cursor=pointer]
            - button "Contacter" [ref=e219] [cursor=pointer]
      - paragraph [ref=e220]: Services correspondant à votre recherche, puis noms par ordre alphabétique.
  - contentinfo [ref=e221]:
    - generic [ref=e222]:
      - generic [ref=e223]:
        - generic [ref=e224]:
          - link "LYANN LE LIEN QUI COMPTE" [ref=e225] [cursor=pointer]:
            - /url: index.html
            - generic [ref=e232]:
              - generic [ref=e233]: LYANN
              - generic [ref=e234]: LE LIEN QUI COMPTE
          - paragraph [ref=e235]: Le premier réseau de confiance qui connecte les habitants et les talents de quartier dans tous les DOM.
          - generic [ref=e236]: Guadeloupe • Martinique • Guyane • La Réunion • Saint-Martin
        - generic [ref=e237]:
          - generic [ref=e238]:
            - link "Notre Histoire" [ref=e239] [cursor=pointer]:
              - /url: about.html
            - link "Comment ça marche" [ref=e240] [cursor=pointer]:
              - /url: how-it-works.html
            - link "Trouver un service" [ref=e241] [cursor=pointer]:
              - /url: results.html
            - link "Tarifs & Offres" [ref=e242] [cursor=pointer]:
              - /url: pricing.html
          - generic [ref=e243]:
            - link "Inscrire mon activité" [ref=e244] [cursor=pointer]:
              - /url: "#"
            - link "Espace Membre" [ref=e245] [cursor=pointer]:
              - /url: "#"
      - generic [ref=e246]:
        - navigation "Conditions et informations légales" [ref=e247]:
          - link "Conditions·" [ref=e248] [cursor=pointer]:
            - /url: legal.html
          - link "Confidentialité·" [ref=e249] [cursor=pointer]:
            - /url: confidentialite.html
          - link "Cookies·" [ref=e250] [cursor=pointer]:
            - /url: legal.html#cookies
          - link "Mentions légales·" [ref=e251] [cursor=pointer]:
            - /url: legal.html#mentions-legales
          - link "Contact" [ref=e252] [cursor=pointer]:
            - /url: "#contact"
        - paragraph [ref=e253]: © 2026 LYANN. Tous droits réservés. Conçu avec passion dans les Caraïbes pour nos territoires.
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
  107 |   await page.getByRole('button', {name:`Retirer le filtre ${category}`,exact:true}).click();
  108 |   await expect(page.locator('#explorerCategory')).toHaveValue('');
  109 | });
  110 | 
  111 | for (const mode of ['annonces', 'lyanneurs']) {
  112 |   test(`${mode}: useful empty state, recover filters, retain URL on reload`, async ({page}) => {
  113 |     test.setTimeout(60000);
  114 |     await ready(page, mode);
  115 |     await page.getByRole('searchbox').fill('zzzz_aucun_resultat_998877');
  116 |     await page.getByRole('button', {name:'Rechercher',exact:true}).click();
  117 |     await expect(page.locator('#explorerResults')).toHaveAttribute('data-state', 'EMPTY');
  118 |     await expect(page.locator('#explorerResults')).toContainText(mode === 'annonces' ? "Pas encore d'annonce correspondant à votre recherche." : 'Aucun Lyanneur trouvé pour cette recherche.');
  119 |     await page.reload({ waitUntil: 'domcontentloaded' });
  120 |     await expect(page.getByRole('searchbox')).toHaveValue('zzzz_aucun_resultat_998877');
  121 |     await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','EMPTY', { timeout: 20000 });
  122 |     await page.getByRole('button',{name:'Modifier les filtres',exact:true}).click();
  123 |     await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
  124 |   });
  125 |   test(`${mode}: failed backend is ERROR, retry returns real data`, async ({page}) => {
  126 |     test.setTimeout(60000);
  127 |     const table = mode === 'annonces' ? 'requests' : 'public_profiles';
  128 |     const pattern = `**/rest/v1/${table}?*`;
  129 |     await ready(page, mode);
  130 |     await page.route(pattern, route => route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Injected transport failure'})}));
  131 |     await page.goto(`/results.html?mode=${mode}&area=`, { waitUntil: 'domcontentloaded' });
  132 |     await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','ERROR',{timeout:20000});
  133 |     await expect(page.locator('#explorerResults')).not.toContainText('Aucun Lyanneur trouvé');
  134 |     await expect(page.locator('#explorerResults')).not.toContainText("Pas encore d'annonce");
  135 |     await page.unroute(pattern);
  136 |     await page.getByRole('button',{name:'Réessayer',exact:true}).click();
  137 |     await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS',{timeout:15000});
  138 |   });
  139 | }
  140 | 
  141 | test('Bokantaj displays only real community posts and no transactional Requests', async ({page}) => {
  142 |   const telemetry = observe(page);
  143 |   const requestReads = [];
  144 |   page.on('request',r => { if (r.url().includes('/rest/v1/requests?')) requestReads.push(r.url()); });
  145 |   await page.goto('/feed.html', { waitUntil: 'domcontentloaded' });
  146 |   await expect(page.locator('#flashFeedContainer .flash-card').first()).toBeVisible({timeout:15000});
  147 |   await expect(page.locator('#topTalentsSidebarContainer')).toHaveAttribute('data-state','SUCCESS');
  148 |   const feed = await page.evaluate(() => window.LYANN_BOKANTAJ_REPOSITORY.load());
  149 |   expect(feed.length).toBeGreaterThan(0);
  150 |   expect(feed.every(p => p.item_type === 'POST' && !p.request_id)).toBe(true);
  151 |   await expect(page.locator('#flashFeedContainer')).toContainText(feed[0].content);
  152 |   await expect(page.locator('#flashFeedContainer .btn-help-lyann')).toHaveCount(0);
  153 |   expect(requestReads).toEqual([]);
  154 |   expect(telemetry.failures).toEqual([]);
  155 |   expect(telemetry.errors).toEqual([]);
  156 | });
  157 | 
  158 | for (const width of [390,1440]) {
  159 |   test(`Explorer ${width}px: filters, keyboard, no overflow, screenshot`, async ({page}) => {
  160 |     const telemetry = observe(page);
  161 |     await page.setViewportSize({width,height:900});
  162 |     await ready(page);
  163 |     await page.getByRole('button',{name:'Filtres et zone'}).click();
  164 |     await expect(page.getByRole('dialog',{name:'Affiner la recherche'})).toBeVisible();
  165 |     await page.locator('#explorerArea').fill('CommuneIntrouvable');
  166 |     await page.getByRole('button',{name:'Afficher les résultats'}).click();
  167 |     await expect(page.getByRole('dialog')).not.toBeVisible();
  168 |     await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','EMPTY');
  169 |     await page.getByRole('button',{name:'Élargir la zone',exact:true}).click();
  170 |     await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
  171 |     await page.getByRole('tab',{name:/Annonces/}).focus();
  172 |     await page.keyboard.press('ArrowRight');
  173 |     await expect(page.getByRole('tab',{name:/Lyanneurs/})).toHaveAttribute('aria-selected','true');
  174 |     await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
  175 |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  176 |     const targets = await page.locator('#explorer button:visible, #explorer select:visible, #explorer input:visible').evaluateAll(nodes => nodes.map(n => ({text:n.textContent,height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width})));
  177 |     expect(targets.filter(t => t.height < 44 || t.width < 44)).toEqual([]);
  178 |     await page.screenshot({path:`artifacts/explorer/lyanneurs-${width}.png`,fullPage:true});
  179 |     await page.getByRole('tab',{name:/Annonces/}).click();
  180 |     await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
  181 |     await page.screenshot({path:`artifacts/explorer/annonces-${width}.png`,fullPage:true});
  182 |     expect(telemetry.errors).toEqual([]);
  183 |     expect(telemetry.failures).toEqual([]);
  184 |   });
  185 | }
  186 | 
  187 | test('A canonical category also selects a real published service in Lyanneurs', async ({page}) => {
  188 |   await ready(page,'lyanneurs');
  189 |   await page.locator('#explorerCategory').selectOption({label:'Ménage'});
  190 |   await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
  191 |   await expect(page.locator('#explorerResults')).toContainText('Ménage & Entretien');
  192 |   const profiles = await page.evaluate(async () => (await window.LYANN_EXPLORER_REPOSITORY.load()).filter(p => p.services.some(s => s.title.includes('Ménage'))).map(p => p.id));
  193 |   const rendered = await page.locator('#explorerResults [data-member-id]').evaluateAll(nodes => nodes.map(n => n.dataset.memberId));
> 194 |   expect(rendered.sort()).toEqual(profiles.sort());
      |                           ^ Error: expect(received).toEqual(expected) // deep equality
  195 | });
  196 | 
  197 | test('Filter sheet Enter applies the search; Escape discards unapplied edits', async ({page}) => {
  198 |   await ready(page); // Text area remains an Annonces filter; Lyanneurs uses dependent selects.
  199 |   await page.getByRole('button',{name:'Filtres et zone'}).click();
  200 |   await page.locator('#explorerArea').fill('CommuneIntrouvable');
  201 |   await page.locator('#explorerArea').press('Enter');
  202 |   await expect(page.getByRole('dialog',{name:'Affiner la recherche'})).not.toBeVisible();
  203 |   await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','EMPTY');
  204 |   await expect(page).toHaveURL(/area=CommuneIntrouvable/);
  205 |   await page.getByRole('button',{name:'Filtres et zone'}).click();
  206 |   await page.locator('#explorerArea').fill('Guadeloupe');
  207 |   await page.keyboard.press('Escape');
  208 |   await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','EMPTY');
  209 |   await page.getByRole('button',{name:'Filtres et zone'}).click();
  210 |   await expect(page.locator('#explorerArea')).toHaveValue('CommuneIntrouvable');
  211 | });
  212 | 
  213 | test('Lyanneurs filters preserve Request-only criteria when switching modes', async ({page}) => {
  214 |   await ready(page);
  215 |   await page.getByRole('button',{name:'Filtres et zone'}).click();
  216 |   const urgency = await page.locator('#explorerUrgency option').nth(1).getAttribute('value');
  217 |   expect(urgency).toBeTruthy();
  218 |   await page.locator('#explorerUrgency').selectOption(urgency);
  219 |   await page.locator('#explorerBudget').fill('150');
  220 |   await page.getByRole('button',{name:'Afficher les résultats'}).click();
  221 |   await page.getByRole('tab',{name:/Lyanneurs/}).click();
  222 |   await expect(page.locator('#explorerResults')).toHaveAttribute('aria-busy','false');
  223 |   await page.getByRole('button',{name:'Filtres et zone'}).click();
  224 |   await page.locator('#explorerTerritory').selectOption('Guadeloupe (971)');
  225 |   await page.getByRole('button',{name:'Afficher les résultats'}).click();
  226 |   await page.getByRole('tab',{name:/Annonces/}).click();
  227 |   await expect(page.locator('#explorerResults')).toHaveAttribute('aria-busy','false');
  228 |   await page.getByRole('button',{name:'Filtres et zone'}).click();
  229 |   await expect(page.locator('#explorerUrgency')).toHaveValue(urgency);
  230 |   await expect(page.locator('#explorerBudget')).toHaveValue('150');
  231 | });
  232 | 
  233 | test('In-place authentication updates own-profile actions without reload', async ({page}) => {
  234 |   const telemetry = observe(page);
  235 |   await ready(page,'lyanneurs');
  236 |   const result = await page.evaluate(async ({email,password}) => {
  237 |     const res = await window.LYANN_API_CLIENT.login(email, password);
  238 |     return {id:res.data?.user?.id,error:res.error?.message};
  239 |   }, qaCredentials('B'));
  240 |   expect(result.error).toBeFalsy();
  241 |   expect(result.id).toBeTruthy();
  242 |   const card = page.locator(`[data-member-id="${result.id}"]`);
  243 |   await expect(card).toBeVisible();
  244 |   await expect(card.locator('[data-action="contact"]')).toHaveCount(0);
  245 |   await page.evaluate(() => window.LYANN_API_CLIENT.logout());
  246 |   await expect(card.locator('[data-action="contact"]')).toBeVisible();
  247 |   expect(telemetry.failures).toEqual([]);
  248 |   expect(telemetry.errors).toEqual([]);
  249 | });
  250 | 
  251 | test('Bokantaj Request wizard reaches real-taxonomy review without writing or offering unpersisted photos', async ({page}) => {
  252 |   const telemetry = observe(page);
  253 |   const writes = [];
  254 |   page.on('request',r => {
  255 |     if (r.method() === 'POST' && /\/rest\/v1\/(requests|bokantaj_posts|rpc\/send_request_invitations)/.test(r.url())) writes.push(r.url());
  256 |   });
  257 |   await ready(page); // Publishing is an authenticated interaction; keep all wizard assertions.
  258 |   await page.goto('/results.html?mode=annonces', { waitUntil: 'domcontentloaded' });
  259 |   await page.locator('.explorer-results-heading .explorer-publish').click();
  260 |   await page.locator('#wizardDescInput').fill('Une fuite sous mon évier, besoin de réparer la plomberie.');
  261 |   for (const step of [2,4,5,6]) {
  262 |     await page.locator('#wizardBtnNext').click();
  263 |     await expect(page.locator(`.wizard-step[data-step="${step}"]`)).toBeVisible();
  264 |   }
  265 |   const selected = await page.evaluate(async () => {
  266 |     const leaves = await window.LyanAI.fetchTaxonomyFromDB({strict:true});
  267 |     const category = document.getElementById('wizardCategory');
  268 |     const subcategory = document.getElementById('wizardSubCat');
  269 |     return leaves.find(t => t.universe === document.getElementById('wizardDomain').value &&
  270 |       t.category === category.selectedOptions[0].text && t.subcategory === subcategory.selectedOptions[0].text)?.id;
  271 |   });
  272 |   expect(selected,'The actual wizard selection must identify a persisted taxonomy leaf').toBeTruthy();
  273 |   await expect(page.locator('#wizardPhotoUploadZone')).not.toBeVisible();
  274 |   await expect(page.locator('#wizardSummaryDesc')).toContainText('fuite sous mon évier');
  275 |   await expect(page.locator('#wizardBtnSubmit')).toBeVisible();
  276 |   for (const step of [5,4,2,1]) {
  277 |     await page.locator('#wizardBtnPrev').click();
  278 |     await expect(page.locator(`.wizard-step[data-step="${step}"]`)).toBeVisible();
  279 |   }
  280 |   await expect(page.locator('#wizardDescInput')).toHaveValue('Une fuite sous mon évier, besoin de réparer la plomberie.');
  281 |   expect(writes).toEqual([]);
  282 |   expect(telemetry.failures).toEqual([]);
  283 |   expect(telemetry.errors).toEqual([]);
  284 | });
  285 | 
  286 | test('Own persisted Requests have details and favorites but no help action', async ({page}) => {
  287 |   await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  288 |   const user = await page.evaluate(async ({email,password}) => {
  289 |     const res = await window.LYANN_API_CLIENT.login(email, password);
  290 |     return {id:res.data?.user?.id,error:res.error?.message};
  291 |   }, qaCredentials('A'));
  292 |   expect(user.error).toBeFalsy();
  293 |   expect(user.id).toBeTruthy();
  294 |   await page.goto('/results.html?mode=annonces&area=', { waitUntil: 'domcontentloaded' });
```