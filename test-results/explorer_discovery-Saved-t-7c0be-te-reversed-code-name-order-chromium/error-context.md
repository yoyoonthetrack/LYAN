# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: explorer_discovery.spec.js >> Saved territory label finds the same real Request despite reversed code/name order
- Location: tests/e2e/explorer_discovery.spec.js:311:1

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
        - generic [ref=e14]:
          - generic [ref=e15]: LYANN
          - generic [ref=e16]: LE LIEN QUI COMPTE
      - generic [ref=e17]:
        - link "Accueil" [ref=e18] [cursor=pointer]:
          - /url: index.html
        - link "Explorer" [ref=e19] [cursor=pointer]:
          - /url: results.html
        - link "Bokantaj" [ref=e20] [cursor=pointer]:
          - /url: feed.html
        - link "Comment ça marche" [ref=e21] [cursor=pointer]:
          - /url: how-it-works.html
      - generic [ref=e22]:
        - link "Rechercher" [ref=e23] [cursor=pointer]:
          - /url: results.html
        - link "Connexion" [ref=e24] [cursor=pointer]:
          - /url: "#login"
        - button "Menu Principal" [ref=e25] [cursor=pointer]
  - banner [ref=e26]:
    - generic [ref=e28]:
      - heading "Qui peut vous aider aujourd'hui ?" [level=1] [ref=e29]
      - paragraph [ref=e30]: Le réseau de confiance qui relie les habitants aux talents de leur quartier dans les DOM.
      - figure [ref=e31]:
        - generic "Une habitante découvre une fuite sous son évier, dans sa cuisine." [ref=e32]
      - generic [ref=e33]:
        - link "Rechercher" [ref=e34] [cursor=pointer]:
          - /url: results.html
        - button "Publier un besoin" [ref=e35] [cursor=pointer]
  - generic [ref=e37]:
    - generic [ref=e38]:
      - generic [ref=e39]: Confiance du quartier
      - heading "L'esprit d'entraide des îles, en toute sécurité." [level=2] [ref=e40]
      - paragraph [ref=e41]: Les notes et les avis des habitants donnent confiance pour des rencontres chaleureuses et des interventions en toute sérénité.
    - generic [ref=e42]:
      - generic [ref=e43]:
        - img "Entraide et solidarité dans les Antilles - LYANN DOM" [ref=e44]
        - generic [ref=e46]:
          - strong [ref=e47]: Notes & avis du quartier
          - text: La réputation se construit entre voisins
      - generic [ref=e48]:
        - generic [ref=e51]:
          - heading "Des talents de vos communes" [level=3] [ref=e52]
          - paragraph [ref=e53]: Voisins passionnés et artisans qualifiés, recommandés par les habitants de vos communes.
        - generic [ref=e56]:
          - heading "Recommandations 100% locales" [level=3] [ref=e57]
          - paragraph [ref=e58]: De Baie-Mahault à Fort-de-France, la réputation de nos Lyanneurs se construit sur le terrain.
        - generic [ref=e61]:
          - heading "Le Lien LYANN qui rassemble" [level=3] [ref=e62]
          - paragraph [ref=e63]: Un vrai réseau humain pour se rendre service au quotidien sans intermédiaires inutiles.
  - generic [ref=e65]:
    - generic [ref=e66]:
      - generic [ref=e67]: Domaines Populaires
      - heading "Découvrez les talents autour de chez vous" [level=2] [ref=e68]
      - paragraph [ref=e69]: Des professionnels et passionnés qualifiés dans tous les métiers de la maison et du quotidien.
    - text: ▼
    - generic [ref=e70]:
      - link "Climatisation et Froid DOM Climatisation & Froid Clim Inverter & Entretien Explorer cette activité" [ref=e71] [cursor=pointer]:
        - /url: "#"
        - img "Climatisation et Froid DOM" [ref=e72]
        - generic [ref=e73]:
          - generic [ref=e74]: Climatisation & Froid
          - heading "Clim Inverter & Entretien" [level=4] [ref=e75]
          - generic [ref=e76]: Explorer cette activité
      - link "Jardin et Espaces Verts Jardin & Espaces Verts Élagage, Taille & Entretien Explorer cette activité" [ref=e77] [cursor=pointer]:
        - /url: "#"
        - img "Jardin et Espaces Verts" [ref=e78]
        - generic [ref=e79]:
          - generic [ref=e80]: Jardin & Espaces Verts
          - heading "Élagage, Taille & Entretien" [level=4] [ref=e81]
          - generic [ref=e82]: Explorer cette activité
      - link "Électricité & Dépannage Électricité & Dépannage Tableaux, Moteurs & Panneaux Explorer cette activité" [ref=e83] [cursor=pointer]:
        - /url: "#"
        - img "Électricité & Dépannage" [ref=e84]
        - generic [ref=e85]:
          - generic [ref=e86]: Électricité & Dépannage
          - heading "Tableaux, Moteurs & Panneaux" [level=4] [ref=e87]
          - generic [ref=e88]: Explorer cette activité
      - link "Plomberie & Sanitaire Plomberie & Sanitaire Fuites, Citernes & Salles d'eau Explorer cette activité" [ref=e89] [cursor=pointer]:
        - /url: "#"
        - img "Plomberie & Sanitaire" [ref=e90]
        - generic [ref=e91]:
          - generic [ref=e92]: Plomberie & Sanitaire
          - heading "Fuites, Citernes & Salles d'eau" [level=4] [ref=e93]
          - generic [ref=e94]: Explorer cette activité
      - link "Aide à domicile et Seniors Entraide & Domicile Aide aux Seniors & Ménage Explorer cette activité" [ref=e95] [cursor=pointer]:
        - /url: "#"
        - img "Aide à domicile et Seniors" [ref=e96]
        - generic [ref=e97]:
          - generic [ref=e98]: Entraide & Domicile
          - heading "Aide aux Seniors & Ménage" [level=4] [ref=e99]
          - generic [ref=e100]: Explorer cette activité
      - generic [ref=e102]:
        - heading "Toutes les Activités" [level=4] [ref=e103]
        - paragraph [ref=e104]: +15 domaines & Proposer mon activité
        - generic [ref=e105] [cursor=pointer]: Explorer tout ➔
  - generic [ref=e107]:
    - generic [ref=e108]:
      - generic [ref=e109]: En direct de Bokantaj
      - 'heading "Bokantaj : Échos & Lyanns" [level=2] [ref=e111]'
      - paragraph [ref=e112]: Disponibilités d'artisans, besoins urgents et entraide partagés en temps réel dans Bokantaj par les habitants.
    - generic [ref=e113]:
      - generic [ref=e114]:
        - generic [ref=e115]:
          - generic [ref=e116]:
            - img "Utilisateur" [ref=e117]
            - generic [ref=e118]:
              - strong [ref=e119]: Utilisateur
              - text: Artisan Clim & Froid • 📍 Baie-Mahault (Guadeloupe)
          - generic [ref=e120]: ⚡ Disponibilité
        - generic [ref=e121]: Créneau disponible cet après-midi pour révision & entretien clim inverter sur Baie-Mahault ou Le Gosier ! Contactez-moi directement.
      - generic [ref=e122]:
        - generic [ref=e123]:
          - generic [ref=e125]:
            - strong [ref=e126]: Membre LYANN Cazeau
            - text: Habitante de Fort-de-France • 📍 Martinique
          - generic [ref=e127]: 🔍 Besoin
        - generic [ref=e128]: Recherche urgente d'un bon électricien pour remplacer un tableau secondaire à Schoelcher. Qui me recommandez-vous dans le réseau ?
    - link "Rejoindre Bokantaj en direct" [ref=e130] [cursor=pointer]:
      - /url: feed.html
  - generic [ref=e132]:
    - generic [ref=e133]:
      - generic [ref=e134]: Rejoignez-nous
      - heading "Rejoignez la communauté LYANN." [level=2] [ref=e135]
      - paragraph [ref=e136]: Que vous proposiez des compétences ou recherchiez de l'aide, lancez-vous aujourd'hui.
    - generic [ref=e138]:
      - heading "Créer mon Compte Unique" [level=3] [ref=e140]
      - paragraph [ref=e141]: Que vous proposiez des compétences ou recherchiez de l'aide, un seul compte suffit pour tout faire. Rejoignez la communauté d'entraide de votre quartier dès aujourd'hui.
      - button "S'inscrire maintenant" [ref=e142] [cursor=pointer]
  - contentinfo [ref=e143]:
    - generic [ref=e144]:
      - generic [ref=e145]:
        - generic [ref=e146]:
          - link "LYANN LE LIEN QUI COMPTE" [ref=e147] [cursor=pointer]:
            - /url: index.html
            - generic [ref=e155]:
              - generic [ref=e156]: LYANN
              - generic [ref=e157]: LE LIEN QUI COMPTE
          - paragraph [ref=e158]: Le premier réseau de confiance qui connecte les habitants et les talents de quartier dans tous les DOM.
          - generic [ref=e159]: Guadeloupe • Martinique • Guyane • La Réunion • Saint-Martin
        - generic [ref=e160]:
          - generic [ref=e161]:
            - link "Notre Histoire" [ref=e162] [cursor=pointer]:
              - /url: about.html
            - link "Comment ça marche" [ref=e163] [cursor=pointer]:
              - /url: how-it-works.html
            - link "Trouver un service" [ref=e164] [cursor=pointer]:
              - /url: results.html
            - link "Tarifs & Offres" [ref=e165] [cursor=pointer]:
              - /url: pricing.html
          - generic [ref=e166]:
            - link "Inscrire mon activité" [ref=e167] [cursor=pointer]:
              - /url: "#"
            - link "Espace Membre" [ref=e168] [cursor=pointer]:
              - /url: "#"
      - generic [ref=e169]:
        - navigation "Conditions et informations légales" [ref=e170]:
          - link "Conditions·" [ref=e171] [cursor=pointer]:
            - /url: legal.html
          - link "Confidentialité·" [ref=e172] [cursor=pointer]:
            - /url: confidentialite.html
          - link "Cookies·" [ref=e173] [cursor=pointer]:
            - /url: legal.html#cookies
          - link "Mentions légales·" [ref=e174] [cursor=pointer]:
            - /url: legal.html#mentions-legales
          - link "Contact" [ref=e175] [cursor=pointer]:
            - /url: "#contact"
        - paragraph [ref=e176]: © 2026 YOYOOTT — Tous droits réservés. Conçu avec passion dans les Caraïbes pour nos territoires.
  - option "🏆 Recommandés & Mieux notés" [selected]
  - option "⭐ Nombre d'avis clients"
  - option "📍 Par Commune"
  - option "🔤 Nom de A à Z"
  - option "Tous les domaines" [selected]
  - option "🏠 Maison & Rénovation"
  - option "🌴 Jardin & Espaces Verts"
  - option "❄️ Climatisation & Froid"
  - option "🧹 Ménage & Propreté"
  - option "🚚 Déménagement & Transport"
  - option "⚡ Électricité"
  - option "💧 Plomberie"
  - option "🎨 Peinture"
  - option "🛠️ Bricolage"
  - option "👶 Baby-sitting"
  - option "🤝 Aide à la personne"
  - option "971 - Guadeloupe" [selected]
  - option "972 - Martinique"
  - option "973 - Guyane"
  - option "974 - La Réunion"
  - option "978 - St-Martin"
  - option "❄️ Climatisation & Entretien" [selected]
  - option "💧 Plomberie & Dépannage"
  - option "⚡ Électricité & Tableau"
  - option "🌴 Jardin & Espaces Verts"
  - option "🎨 Peinture & Rénovation"
  - option "🛠️ Autre service à domicile"
  - option "Matin (8h - 12h)" [selected]
  - option "Après-midi (14h - 18h)"
  - option "Soirée (18h - 20h)"
  - option "Contenu ou langage inapproprié" [selected]
  - option "Profil inexact ou fausses coordonnées"
  - option "Démarchage abusif / Spam"
  - option "Autre problème de sérénité"
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