const { test, expect } = require('@playwright/test');
const { requireWriteBackend, login } = require('./helpers/approved-backend');

test.describe('Explorer business persistence — approved staging only', () => {
  test.beforeEach(async ({page}) => { await requireWriteBackend(page); });

  test('Bokantaj Request creation persists in Annonces only; own Request has no help action', async ({page}) => {
    const authorId = await login(page,'REQUESTER');
    const description = `Explorer validation ${Date.now()} : besoin de réparer une fuite sous mon évier.`;
    await page.goto('/feed.html');
    await page.locator('#btnComposerNeedShortcut').click();
    await page.locator('#wizardDescInput').fill(description);
    for (const step of [2,4,5,6]) {
      await page.locator('#wizardBtnNext').click();
      await expect(page.locator(`.wizard-step[data-step="${step}"]`)).toBeVisible();
    }
    const insert = page.waitForResponse(r => r.url().includes('/rest/v1/requests') && r.request().method()==='POST');
    await page.locator('#wizardBtnSubmit').click();
    const response = await insert;
    expect(response.ok()).toBe(true);
    const payload = await response.json();
    const created = Array.isArray(payload) ? payload[0] : payload;
    expect(created.id).toBeTruthy();
    expect(created.requester_id).toBe(authorId);
    expect(created.taxonomy_id).toBeTruthy();
    await page.getByRole('button',{name:'Voir les annonces',exact:true}).click();
    await expect(page).toHaveURL(/results\.html/);
    const card = page.locator(`[data-request-id="${created.id}"]`);
    await expect(card).toContainText(description);
    await expect(card.locator('[data-action="help"]')).toHaveCount(0);
    await page.reload();
    await expect(card).toContainText(description);
    await page.goto('/feed.html');
    await expect(page.locator('#flashFeedContainer')).not.toContainText(description);
    const rows = await page.evaluate(async text => {
      const {data,error} = await window.LYANN_API_CLIENT.supabase.from('bokantaj_posts').select('id').eq('content',text);
      if(error)throw error; return data;
    },description);
    expect(rows).toEqual([]);
  });

  test('Community publication persists in Bokantaj after reload, never as a Request', async ({page}) => {
    await login(page,'REQUESTER');
    const content = `Conseil de quartier — validation ${Date.now()}`;
    await page.goto('/feed.html');
    await page.locator('#flashContentInput').fill(content);
    const insert = page.waitForResponse(r => r.url().includes('/rest/v1/bokantaj_posts') && r.request().method()==='POST');
    await page.locator('#createFlashForm button[type="submit"]').click();
    expect((await insert).ok()).toBe(true);
    await expect(page.locator('#flashFeedContainer')).toContainText(content);
    await page.reload();
    await expect(page.locator('#flashFeedContainer')).toContainText(content);
    const rows = await page.evaluate(async content => {
      const {data,error}=await window.LYANN_API_CLIENT.supabase.from('requests').select('id').eq('description',content);
      if(error)throw error;return data;
    },content);
    expect(rows).toEqual([]);
  });

  test('Real profile → contact → visible correct conversation → message persists after reload', async ({page}) => {
    const helperId = await login(page,'HELPER');
    await page.goto('/results.html?mode=lyanneurs&area=');
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
    const person = await page.evaluate(async helperId => (await window.LYANN_EXPLORER_REPOSITORY.load()).find(p => p.id!==helperId && p.services.length),helperId);
    expect(person).toBeTruthy();
    await page.locator(`[data-member-id="${person.id}"] [data-action="profile"]`).click();
    const profile = page.locator('#publicMemberProfileModal');
    await expect(profile).toContainText(person.name);
    await profile.locator('[data-lyann-route="messages"]').click();
    await expect(page.locator('#chatModal')).toBeVisible();
    await expect(page.locator('#chatHeaderName')).toHaveText(person.name);
    expect((await page.evaluate(() => window.LYANN_ACTIVE_CHAT_CONTACT)).id).toBe(person.id);
    const content = `Message de validation Explorer ${Date.now()}`;
    await page.locator('#chatInputField').fill(content);
    const send = page.waitForResponse(r => r.url().includes('/rest/v1/messages') && r.request().method()==='POST');
    await page.locator('#chatInputForm button[type="submit"]').click();
    expect((await send).ok()).toBe(true);
    await expect(page.locator('#chatMessagesContainer')).toContainText(content);
    await page.reload();
    await page.locator(`[data-member-id="${person.id}"] [data-action="contact"]`).click();
    await expect(page.locator('#chatHeaderName')).toHaveText(person.name);
    await expect(page.locator('#chatMessagesContainer')).toContainText(content);
  });

  test('Explorer favorite persists across reload and can be removed', async ({page}) => {
    await login(page,'HELPER');
    await page.goto('/results.html?mode=annonces&area=');
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
    const button = page.locator('#explorerResults .btn-fav-toggle').first();
    const id = await button.getAttribute('data-favorite-id');
    // Preserve the participant's initial saved state.
    const initiallySaved = await page.evaluate(id => window.LyannFavoritesService.isFavorite('REQUEST',id),id);
    await expect(button).toHaveClass(initiallySaved ? /is-favorite/ : /^(?!.*is-favorite).*$/);
    await button.click();
    await expect.poll(() => page.evaluate(id => window.LyannFavoritesService.isFavorite('REQUEST',id),id)).toBe(!initiallySaved);
    await page.reload();
    const reloaded = page.locator(`[data-favorite-id="${id}"]`).first();
    await expect(reloaded).toHaveClass(!initiallySaved ? /is-favorite/ : /^(?!.*is-favorite).*$/);
    await reloaded.click();
    await expect.poll(() => page.evaluate(id => window.LyannFavoritesService.isFavorite('REQUEST',id),id)).toBe(initiallySaved);
  });

  test('Request → help → real proposal → requester acceptance → persisted mission context', async ({page,browser}) => {
    test.setTimeout(90000);
    const requesterId = await login(page,'REQUESTER');
    // A real, explicitly approved staging fixture; Supabase generates its identity.
    const request = await page.evaluate(async requesterId => {
      const {data,error}=await window.LYANN_API_CLIENT.supabase.from('requests').insert({
        requester_id:requesterId, title:`Validation mission ${Date.now()}`, description:'Aide au jardin — scénario de validation staging',
        category:'Jardinage', location:'Guadeloupe (971)', urgency:'flexible', status:'OPEN', visibility:'PUBLIC'
      }).select().single();
      if(error)throw error;return data;
    },requesterId);
    const helperContext = await browser.newContext({baseURL:process.env.LYANN_E2E_BASE_URL || 'http://localhost:8080'});
    try {
      const helperPage = await helperContext.newPage();
      await requireWriteBackend(helperPage);
      const helperId = await login(helperPage,'HELPER');
      expect(helperId).not.toBe(requesterId);
      await helperPage.goto('/results.html?mode=annonces&area=');
      const helpResponse = helperPage.waitForResponse(r => r.url().includes('/rpc/initiate_lyann_help_conversation'));
      await helperPage.locator(`[data-request-id="${request.id}"] [data-action="help"]`).click();
      const help = await helpResponse;
      expect(help.ok()).toBe(true);
      const linked = await help.json();
      await expect(helperPage.locator('#chatModal')).toBeVisible();
      await expect(helperPage.locator('#chatMissionContextBar')).toContainText(request.title);
      await helperPage.locator('#chatProposeBtn').click();
      await helperPage.locator('#btnChooseDirectPrice').click();
      const description = `Proposition réelle ${Date.now()}`;
      await helperPage.locator('#dpDescription').fill(description);
      await helperPage.locator('#dpAmount').fill('25');
      const quoteResponse = helperPage.waitForResponse(r => r.url().includes('/rpc/create_request_quote'));
      await helperPage.locator('#directPriceForm button[type="submit"]').click();
      expect((await quoteResponse).ok()).toBe(true);
      const quote = await helperPage.evaluate(async description => {
        const {data,error}=await window.LYANN_API_CLIENT.supabase.from('quotes').select('*').eq('description',description).single();
        if(error)throw error;return data;
      },description);
      expect(quote.request_id).toBe(request.id);
      expect(quote.conversation_id).toBe(linked.conversation_id);
      expect(quote.provider_id).toBe(helperId);
      expect(quote.requester_id).toBe(requesterId);
      await page.goto('/results.html?mode=lyanneurs&area=');
      await page.locator(`[data-member-id="${helperId}"] [data-action="contact"]`).click();
      await expect(page.locator('#chatModal')).toBeVisible();
      await expect(page.locator('#chatMessagesContainer')).toContainText(description);
      await page.locator(`[onclick="window.handleAcceptQuote('${quote.id}')"]`).click();
      const accept = page.waitForResponse(r => r.url().includes('/rpc/accept_request_quote'));
      await page.locator('#lyannDialogActions').getByRole('button',{name:'Confirmer',exact:true}).click();
      expect((await accept).ok()).toBe(true);
      const mission = await page.evaluate(async invitationId => {
        const {data,error}=await window.LYANN_API_CLIENT.supabase.from('missions').select('*').eq('request_invitation_id',invitationId).single();
        if(error)throw error;return data;
      },quote.request_invitation_id);
      expect(mission.requester_id).toBe(requesterId);
      expect(mission.helper_id).toBe(helperId);
      expect(mission.related_request_id || mission.request_id).toBe(request.id);
      await page.reload();
      await page.locator(`[data-member-id="${helperId}"] [data-action="contact"]`).click();
      await expect(page.locator('#chatMissionContextBar')).toBeVisible();
      await expect(page.locator('#chatMissionContextBar')).toContainText(request.title);
    } finally {
      await helperContext.close();
    }
  });
});
