# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: explorer_discovery.spec.js >> Explorer 390px: filters, keyboard, no overflow, screenshot
- Location: tests/e2e/explorer_discovery.spec.js:159:3

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
      - link "LYANN" [ref=e5] [cursor=pointer]:
        - /url: index.html
      - button "Menu Principal" [ref=e17] [cursor=pointer]
  - banner [ref=e18]:
    - generic [ref=e20]:
      - heading "Qui peut vous aider aujourd'hui ?" [level=1] [ref=e21]
      - paragraph [ref=e22]: Le réseau de confiance qui relie les habitants aux talents de leur quartier dans les DOM.
      - figure [ref=e23]:
        - generic "Une habitante découvre une fuite sous son évier, dans sa cuisine." [ref=e24]
      - generic [ref=e25]:
        - link "Rechercher" [ref=e26] [cursor=pointer]:
          - /url: results.html
        - button "Publier un besoin" [ref=e27] [cursor=pointer]
  - generic [ref=e29]:
    - generic [ref=e30]:
      - generic [ref=e31]: Confiance du quartier
      - heading "L'esprit d'entraide des îles, en toute sécurité." [level=2] [ref=e32]
      - paragraph [ref=e33]: Les notes et les avis des habitants donnent confiance pour des rencontres chaleureuses et des interventions en toute sérénité.
    - generic [ref=e34]:
      - generic [ref=e35]:
        - img "Entraide et solidarité dans les Antilles - LYANN DOM" [ref=e36]
        - generic [ref=e38]:
          - strong [ref=e39]: Notes & avis du quartier
          - text: La réputation se construit entre voisins
      - generic [ref=e40]:
        - generic [ref=e43]:
          - heading "Des talents de vos communes" [level=3] [ref=e44]
          - paragraph [ref=e45]: Voisins passionnés et artisans qualifiés, recommandés par les habitants de vos communes.
        - generic [ref=e48]:
          - heading "Recommandations 100% locales" [level=3] [ref=e49]
          - paragraph [ref=e50]: De Baie-Mahault à Fort-de-France, la réputation de nos Lyanneurs se construit sur le terrain.
        - generic [ref=e53]:
          - heading "Le Lien LYANN qui rassemble" [level=3] [ref=e54]
          - paragraph [ref=e55]: Un vrai réseau humain pour se rendre service au quotidien sans intermédiaires inutiles.
  - generic [ref=e57]:
    - generic [ref=e58]:
      - generic [ref=e59]: Domaines Populaires
      - heading "Découvrez les talents autour de chez vous" [level=2] [ref=e60]
      - paragraph [ref=e61]: Des professionnels et passionnés qualifiés dans tous les métiers de la maison et du quotidien.
    - generic [ref=e63]:
      - combobox [ref=e64] [cursor=pointer]:
        - option "Choisir une activité par catégorie..." [selected]
        - option "Climatisation & Froid DOM"
        - option "Jardin & Espaces Verts"
        - option "Électricité & Dépannage"
        - option "Plomberie & Sanitaire"
        - option "Maison & Rénovation"
        - option "Ménage & Aide Seniors"
        - option "Voir toutes les activités / Proposer..."
      - text: ▼
    - generic [ref=e65]:
      - link "Climatisation et Froid DOM Climatisation & Froid Clim Inverter & Entretien Explorer cette activité" [ref=e66] [cursor=pointer]:
        - /url: "#"
        - img "Climatisation et Froid DOM" [ref=e67]
        - generic [ref=e68]:
          - generic [ref=e69]: Climatisation & Froid
          - heading "Clim Inverter & Entretien" [level=4] [ref=e70]
          - generic [ref=e71]: Explorer cette activité
      - link "Jardin et Espaces Verts Jardin & Espaces Verts Élagage, Taille & Entretien Explorer cette activité" [ref=e72] [cursor=pointer]:
        - /url: "#"
        - img "Jardin et Espaces Verts" [ref=e73]
        - generic [ref=e74]:
          - generic [ref=e75]: Jardin & Espaces Verts
          - heading "Élagage, Taille & Entretien" [level=4] [ref=e76]
          - generic [ref=e77]: Explorer cette activité
      - link "Électricité & Dépannage Électricité & Dépannage Tableaux, Moteurs & Panneaux Explorer cette activité" [ref=e78] [cursor=pointer]:
        - /url: "#"
        - img "Électricité & Dépannage" [ref=e79]
        - generic [ref=e80]:
          - generic [ref=e81]: Électricité & Dépannage
          - heading "Tableaux, Moteurs & Panneaux" [level=4] [ref=e82]
          - generic [ref=e83]: Explorer cette activité
      - link "Plomberie & Sanitaire Plomberie & Sanitaire Fuites, Citernes & Salles d'eau Explorer cette activité" [ref=e84] [cursor=pointer]:
        - /url: "#"
        - img "Plomberie & Sanitaire" [ref=e85]
        - generic [ref=e86]:
          - generic [ref=e87]: Plomberie & Sanitaire
          - heading "Fuites, Citernes & Salles d'eau" [level=4] [ref=e88]
          - generic [ref=e89]: Explorer cette activité
      - link "Aide à domicile et Seniors Entraide & Domicile Aide aux Seniors & Ménage Explorer cette activité" [ref=e90] [cursor=pointer]:
        - /url: "#"
        - img "Aide à domicile et Seniors" [ref=e91]
        - generic [ref=e92]:
          - generic [ref=e93]: Entraide & Domicile
          - heading "Aide aux Seniors & Ménage" [level=4] [ref=e94]
          - generic [ref=e95]: Explorer cette activité
      - generic [ref=e97]:
        - heading "Toutes les Activités" [level=4] [ref=e98]
        - paragraph [ref=e99]: +15 domaines & Proposer mon activité
        - generic [ref=e100] [cursor=pointer]: Explorer tout ➔
  - generic [ref=e102]:
    - generic [ref=e103]:
      - generic [ref=e104]: En direct de Bokantaj
      - 'heading "Bokantaj : Échos & Lyanns" [level=2] [ref=e106]'
      - paragraph [ref=e107]: Disponibilités d'artisans, besoins urgents et entraide partagés en temps réel dans Bokantaj par les habitants.
    - generic [ref=e108]:
      - generic [ref=e109]:
        - generic [ref=e110]:
          - generic [ref=e111]:
            - img "Utilisateur" [ref=e112]
            - generic [ref=e113]:
              - strong [ref=e114]: Utilisateur
              - text: Artisan Clim & Froid • 📍 Baie-Mahault (Guadeloupe)
          - generic [ref=e115]: ⚡ Disponibilité
        - generic [ref=e116]: Créneau disponible cet après-midi pour révision & entretien clim inverter sur Baie-Mahault ou Le Gosier ! Contactez-moi directement.
      - generic [ref=e117]:
        - generic [ref=e118]:
          - generic [ref=e120]:
            - strong [ref=e121]: Membre LYANN Cazeau
            - text: Habitante de Fort-de-France • 📍 Martinique
          - generic [ref=e122]: 🔍 Besoin
        - generic [ref=e123]: Recherche urgente d'un bon électricien pour remplacer un tableau secondaire à Schoelcher. Qui me recommandez-vous dans le réseau ?
    - link "Rejoindre Bokantaj en direct" [ref=e125] [cursor=pointer]:
      - /url: feed.html
  - generic [ref=e127]:
    - generic [ref=e128]:
      - generic [ref=e129]: Rejoignez-nous
      - heading "Rejoignez la communauté LYANN." [level=2] [ref=e130]
      - paragraph [ref=e131]: Que vous proposiez des compétences ou recherchiez de l'aide, lancez-vous aujourd'hui.
    - generic [ref=e133]:
      - heading "Créer mon Compte Unique" [level=3] [ref=e135]
      - paragraph [ref=e136]: Que vous proposiez des compétences ou recherchiez de l'aide, un seul compte suffit pour tout faire. Rejoignez la communauté d'entraide de votre quartier dès aujourd'hui.
      - button "S'inscrire maintenant" [ref=e137] [cursor=pointer]
  - contentinfo [ref=e138]:
    - generic [ref=e139]:
      - generic [ref=e140]:
        - generic [ref=e141]:
          - link "LYANN" [ref=e142] [cursor=pointer]:
            - /url: index.html
          - paragraph [ref=e152]: Le premier réseau de confiance qui connecte les habitants et les talents de quartier dans tous les DOM.
          - generic [ref=e153]: Guadeloupe • Martinique • Guyane • La Réunion • Saint-Martin
        - generic [ref=e154]:
          - generic [ref=e155]:
            - link "Notre Histoire" [ref=e156] [cursor=pointer]:
              - /url: about.html
            - link "Comment ça marche" [ref=e157] [cursor=pointer]:
              - /url: how-it-works.html
            - link "Trouver un service" [ref=e158] [cursor=pointer]:
              - /url: results.html
            - link "Tarifs & Offres" [ref=e159] [cursor=pointer]:
              - /url: pricing.html
          - generic [ref=e160]:
            - link "Inscrire mon activité" [ref=e161] [cursor=pointer]:
              - /url: "#"
            - link "Espace Membre" [ref=e162] [cursor=pointer]:
              - /url: "#"
      - generic [ref=e163]:
        - navigation "Conditions et informations légales" [ref=e164]:
          - link "Conditions·" [ref=e165] [cursor=pointer]:
            - /url: legal.html
          - link "Confidentialité·" [ref=e166] [cursor=pointer]:
            - /url: confidentialite.html
          - link "Cookies·" [ref=e167] [cursor=pointer]:
            - /url: legal.html#cookies
          - link "Mentions légales·" [ref=e168] [cursor=pointer]:
            - /url: legal.html#mentions-legales
          - link "Contact" [ref=e169] [cursor=pointer]:
            - /url: "#contact"
        - paragraph [ref=e170]: © 2026 YOYOOTT — Tous droits réservés. Conçu avec passion dans les Caraïbes pour nos territoires.
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