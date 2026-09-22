# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth_interaction_gate.spec.js >> Real login returns anonymous requestHelp to its correct public context without submitting
- Location: tests/e2e/auth_interaction_gate.spec.js:118:59

# Error details

```
Error: QA identity supplied through runner environment

expect(received).toBeTruthy()

Received: undefined
```

# Test source

```ts
  20  | // action dependencies are substituted; no fixture is inserted into the live backend.
  21  | function harness(authenticated = false) {
  22  |   const storage = new Map(), calls = [], events = [];
  23  |   let readyStatus = 'ready';
  24  |   const document = {readyState:'loading',body:{style:{}},addEventListener(){},getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return [];}};
  25  |   const window = {location:{origin:'https://lyann.test',href:'https://lyann.test/results.html?mode=annonces',pathname:'/results.html',search:'?mode=annonces',hash:'',assign:url=>calls.push(['navigate',url])},
  26  |     addEventListener(){},dispatchEvent:e=>events.push(e),openLoginModal:()=>calls.push(['login']),closeLoginModal(){},
  27  |     LYANN_AUTH_STATE:{isAuthenticated:()=>authenticated,getSnapshot:()=>({status:readyStatus,authenticated}),ready:async()=>{readyStatus='ready';}},
  28  |     openLyannWizard:query=>calls.push(['publish',query]),openLyannDetailModal:id=>calls.push(['request',id]),
  29  |     openPublicMemberProfile:id=>calls.push(['profile',id]),
  30  |     LYANN_MESSAGING:{openList:()=>calls.push(['inbox']),openConversation:p=>calls.push(['contact',p])}};
  31  |   vm.runInNewContext(fs.readFileSync('app-router.js','utf8'),{window,document,URL,URLSearchParams,console,setTimeout,clearTimeout,
  32  |     CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
  33  |     sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
  34  |   return {router:window.LYANN_ROUTER,calls,events,storage,authenticate:()=>{authenticated=true;},resolving:()=>{readyStatus='resolving';}};
  35  | }
  36  | 
  37  | test('Central policy separates public reading from every protected interaction domain', async () => {
  38  |   const h = harness();
  39  |   for (const action of ['home','explorer','bokantaj','requestDetail','publicProfile','search','filters']) {
  40  |     expect(await h.router.requireAuthForInteraction(action)).toBe(true);
  41  |   }
  42  |   expect(h.calls).toEqual([]);
  43  |   for (const action of ['favorite','messages','requestHelp','publish','comment','reaction','communityPublish','proposal','missionAction','account']) {
  44  |     expect(await h.router.requireAuthForInteraction(action,{entityId:'fixture-entity'})).toBe(false);
  45  |     expect(h.calls.at(-1)).toEqual(['login']);
  46  |     const intent=JSON.parse(h.storage.get('lyann_interaction_intent'));
  47  |     expect(intent.action).toBe(action);
  48  |     expect(intent.destination).toBe('/results.html?mode=annonces');
  49  |   }
  50  |   expect(()=>h.router.requireAuthForInteraction('unknown-action')).toThrow();
  51  | });
  52  | 
  53  | test('Authenticated dispatch, login return and single-use continuation keep the canonical context', async () => {
  54  |   const h=harness();
  55  |   await h.router.go('messages',{contactId:'fixture-person',name:'Person'});
  56  |   expect(h.calls).toEqual([['login']]);
  57  |   h.authenticate();
  58  |   expect(await h.router.resumeAuthIntent()).toBe(true);
  59  |   expect(h.calls.at(-1)).toEqual(['contact',{contactId:'fixture-person',name:'Person'}]);
  60  |   expect(await h.router.resumeAuthIntent()).toBe(false);
  61  |   await h.router.go('publish',{query:'Besoin de jardinage'});
  62  |   expect(h.calls.at(-1)).toEqual(['publish','Besoin de jardinage']);
  63  | });
  64  | 
  65  | for (const [action,payload,expected] of [
  66  |   ['publish',{query:'Jardinage'},['publish','Jardinage']],
  67  |   ['requestHelp',{requestId:'fixture-request'},['request','fixture-request']],
  68  |   ['favorite',{entityId:'fixture-request',entityType:'REQUEST'},['request','fixture-request']],
  69  |   ['favorite',{entityId:'fixture-person',entityType:'PROFILE'},['profile','fixture-person']]
  70  | ]) test(`Login resumes ${action}/${payload.entityType || ''} safely at the exact entity`, async () => {
  71  |   const h=harness();
  72  |   await h.router.requireAuthForInteraction(action,payload);
  73  |   h.authenticate();
  74  |   await h.router.resumeAuthIntent();
  75  |   expect(h.calls).toEqual([['login'],expected]);
  76  |   expect(h.storage.has('lyann_interaction_intent')).toBe(false);
  77  | });
  78  | 
  79  | test('Contractual submissions never replay after login; cancellation and hostile destinations do not resume', async () => {
  80  |   for (const action of ['proposal','missionAction','communityPublish','reaction']) {
  81  |     const h=harness(); await h.router.requireAuthForInteraction(action);h.authenticate();await h.router.resumeAuthIntent();
  82  |     expect(h.calls).toEqual([['login']]);
  83  |   }
  84  |   const h=harness();await h.router.requireAuthForInteraction('publish');h.router.cancelAuthIntent();h.authenticate();
  85  |   expect(await h.router.resumeAuthIntent()).toBe(false);
  86  |   h.storage.set('lyann_interaction_intent',JSON.stringify({action:'publish',destination:'https://evil.test',createdAt:Date.now()}));
  87  |   expect(await h.router.resumeAuthIntent()).toBe(false);
  88  | });
  89  | 
  90  | async function publicExplorer(page, mode='annonces') {
  91  |   await page.goto(`/results.html?mode=${mode}&area=`);
  92  |   await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
  93  | }
  94  | for (const [label,mode,selector] of [
  95  |   ['Favorite','annonces','.btn-fav-toggle'],['Contact','lyanneurs','[data-action="contact"]'],
  96  |   ['Lyanner','annonces','[data-action="help"]'],['Publish Request','annonces','.explorer-publish'],
  97  |   ['Annonce author','annonces','.explorer-person-overlay']
  98  | ]) test(`Anonymous ${label} invokes the shared auth gate without a business write`, async ({page}) => {
  99  |   const writes=[];
  100 |   page.on('request',r=>{if(r.url().includes('/rest/v1/') && r.method()!=='GET')writes.push(r.url());});
  101 |   await publicExplorer(page,mode);
  102 |   await page.evaluate(()=>window.__gateActions=[]);
  103 |   await page.evaluate(()=>window.addEventListener('lyann:interaction-auth-required',e=>window.__gateActions.push(e.detail.action)));
  104 |   await page.locator(selector).first().click();
  105 |   await expect(page.locator('#loginModal')).toBeVisible();
  106 |   expect(await page.evaluate(()=>window.__gateActions.length)).toBeGreaterThan(0);
  107 |   expect(writes).toEqual([]);
  108 | });
  109 | for(const [label,selector] of [['Comment','.btn-comments-toggle'],['Reaction','.btn-like-flash']]) test(`Anonymous ${label} in public Bokantaj invokes the same gate`,async({page})=>{
  110 |   await page.goto('/feed.html');
  111 |   const button=page.locator(selector).first(); await expect(button).toBeVisible({timeout:15000});
  112 |   await button.click();await expect(page.locator('#loginModal')).toBeVisible();
  113 |   const pending=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('lyann_interaction_intent')));
  114 |   expect(pending.action).toBe(label==='Comment'?'comment':'reaction');
  115 |   expect(pending.payload.entityId).toBeTruthy();
  116 | });
  117 | 
  118 | for(const action of ['publish','requestHelp','favorite']) test(`Real login returns anonymous ${action} to its correct public context without submitting`,async({page})=>{
  119 |   const email=process.env.LYANN_E2E_QA_B_EMAIL,password=process.env.LYANN_E2E_QA_B_PASSWORD;
> 120 |   expect(email,'QA identity supplied through runner environment').toBeTruthy();expect(password).toBeTruthy();
      |                                                                   ^ Error: QA identity supplied through runner environment
  121 |   await publicExplorer(page);
  122 |   const card=page.locator('[data-request-id]').first();const id=await card.getAttribute('data-request-id');
  123 |   const writes=[];page.on('request',r=>{if(r.url().includes('/rest/v1/') && r.method()!=='GET')writes.push(r.url());});
  124 |   if(action==='publish')await page.locator('.explorer-publish').first().click();
  125 |   else await card.locator(action==='favorite'?'.btn-fav-toggle':'[data-action="help"]').click();
  126 |   await expect(page.locator('#loginModal')).toBeVisible();
  127 |   await page.locator('#loginEmail').fill(email);await page.locator('#loginPassword').fill(password);
  128 |   await page.locator('#loginForm button[type="submit"]').click();
  129 |   if(action==='publish')await expect(page.locator('#modal-request-help')).toBeVisible();
  130 |   else {
  131 |     await expect(page.locator('#lyannDetailModal')).toBeVisible();
  132 |     await expect(page.locator('#lyannDetailFavBtn')).toHaveAttribute('data-favorite-id',id);
  133 |     if(action==='favorite')await expect(page.locator('#lyannDetailFavBtn')).toBeFocused();
  134 |   }
  135 |   await expect(page.locator('#loginModal')).not.toBeVisible();
  136 |   expect(writes).toEqual([]);
  137 |   expect(await page.evaluate(()=>sessionStorage.getItem('lyann_interaction_intent'))).toBeNull();
  138 | });
  139 | 
  140 | test('Public Request detail by id uses the canonical public reader, without raw anonymous Requests reads',async({page,request})=>{
  141 |   const response=await request.get('/v1/explorer/requests');expect(response.ok()).toBe(true);
  142 |   const row=(await response.json()).requests[0];expect(row).toBeTruthy();
  143 |   const raw=[];page.on('request',r=>{if(/\/rest\/v1\/requests(?:\?|$)/.test(r.url()))raw.push(r.url());});
  144 |   await page.goto('/index.html');
  145 |   await page.evaluate(id=>window.openLyannDetailModal(id),row.id);
  146 |   await expect(page.locator('#lyannDetailTitle')).toHaveText(row.title);
  147 |   await expect(page.locator('#loginModal')).not.toBeVisible();expect(raw).toEqual([]);
  148 | });
  149 | 
  150 | // The public projection withholds the author identifier, so the annonce header must
  151 | // offer sign-in rather than a dead zone or a stacked, empty profile.
  152 | test('Anonymous annonce author header invokes the shared auth gate, never a dead zone',async({page})=>{
  153 |   await publicExplorer(page);
  154 |   const card=page.locator('[data-request-id]').first();const id=await card.getAttribute('data-request-id');
  155 |   await card.getByRole('button',{name:'Détails',exact:true}).click();
  156 |   await expect(page.locator('#lyannDetailModal')).toBeVisible();
  157 |   await page.locator('#lyannDetailAuthorBtn').click();
  158 |   await expect(page.locator('#loginModal')).toBeVisible();
  159 |   expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('lyann_interaction_intent')))).toMatchObject({action:'requestAuthor',payload:{requestId:id}});
  160 |   await expect(page.locator('#publicMemberProfileModal')).not.toBeVisible();
  161 | });
  162 | 
  163 | test('Authentication resolving does not mistake a restored session for an anonymous visitor',async()=>{
  164 |   const h=harness(true);h.resolving();
  165 |   expect(await h.router.requireAuthForInteraction('favorite')).toBe(true);
  166 |   expect(h.calls).toEqual([]);
  167 | });
  168 | 
  169 | const {requireWriteBackend}=require('./helpers/approved-backend');
  170 | for(const action of ['contact','favorite'])test(`Approved staging: anonymous ${action} → login → canonical persisted outcome`,async({page})=>{
  171 |   await requireWriteBackend(page);
  172 |   await publicExplorer(page,action==='contact'?'lyanneurs':'annonces');
  173 |   const card=page.locator(action==='contact'?'[data-member-id]':'[data-request-id]').first();
  174 |   const id=await card.getAttribute(action==='contact'?'data-member-id':'data-request-id');
  175 |   await card.locator(action==='contact'?'[data-action="contact"]':'.btn-fav-toggle').click();
  176 |   await expect(page.locator('#loginModal')).toBeVisible();
  177 |   await page.locator('#loginEmail').fill(process.env.LYANN_E2E_HELPER_EMAIL);
  178 |   await page.locator('#loginPassword').fill(process.env.LYANN_E2E_HELPER_PASSWORD);
  179 |   await page.locator('#loginForm button[type=submit]').click();
  180 |   if(action==='contact'){
  181 |     await expect(page.locator('#chatModal')).toBeVisible();
  182 |     await expect.poll(()=>page.evaluate(()=>window.LYANN_ACTIVE_CHAT_CONTACT?.id)).toBe(id);
  183 |     const name=await page.evaluate(async id=>{
  184 |       const {data,error}=await window.LYANN_API_CLIENT.supabase.from('public_profiles').select('first_name,last_name').eq('id',id).single();
  185 |       if(error)throw error;return window.formatPublicName(data,null,'Lyanneur');
  186 |     },id);
  187 |     await expect(page.locator('#chatHeaderName')).toHaveText(name);
  188 |   }else{
  189 |     const button=page.locator('#lyannDetailFavBtn');await expect(button).toHaveAttribute('data-favorite-id',id);
  190 |     const before=await page.evaluate(id=>window.LyannFavoritesService.isFavorite('REQUEST',id),id);
  191 |     await button.click();
  192 |     await expect.poll(()=>page.evaluate(id=>window.LyannFavoritesService.isFavorite('REQUEST',id),id)).toBe(!before);
  193 |     await page.reload();await page.evaluate(id=>window.openLyannDetailModal(id),id);
  194 |     await expect(button).toHaveAttribute('aria-pressed',String(!before));
  195 |     await button.click();
  196 |     await expect.poll(()=>page.evaluate(id=>window.LyannFavoritesService.isFavorite('REQUEST',id),id)).toBe(before);
  197 |   }
  198 | });
  199 | 
  200 | test('Cancellation clears the intent and login/register switching preserves it until cancellation',async({page})=>{
  201 |   await publicExplorer(page);
  202 |   await page.locator('.explorer-publish').first().click();
  203 |   await page.locator('#switchToSignupBtn').click();
  204 |   expect(await page.evaluate(()=>window.LYANN_ROUTER.hasAuthIntent())).toBe(true);
  205 |   await page.locator('#closeOnboardingBtn').click();
  206 |   expect(await page.evaluate(()=>window.LYANN_ROUTER.hasAuthIntent())).toBe(false);
  207 | });
  208 | 
  209 | test('Pending publication survives reload and resumes after real authentication',async({page})=>{
  210 |   const email=process.env.LYANN_E2E_QA_B_EMAIL,password=process.env.LYANN_E2E_QA_B_PASSWORD;
  211 |   expect(email).toBeTruthy();expect(password).toBeTruthy();
  212 |   await publicExplorer(page);await page.locator('.explorer-publish').first().click();await page.reload();
  213 |   expect(await page.evaluate(()=>window.LYANN_ROUTER.hasAuthIntent())).toBe(true);
  214 |   await page.evaluate(()=>window.openLoginModal());
  215 |   await page.locator('#loginEmail').fill(email);await page.locator('#loginPassword').fill(password);
  216 |   await page.locator('#loginForm button[type=submit]').click();
  217 |   await expect(page.locator('#modal-request-help')).toBeVisible();
  218 |   expect(await page.evaluate(()=>window.LYANN_ROUTER.hasAuthIntent())).toBe(false);
  219 | });
  220 | 
```