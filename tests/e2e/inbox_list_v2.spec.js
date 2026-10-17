const { test, expect } = require('@playwright/test');

async function openInboxShell(page) {
  await page.goto('/feed.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.applyLyannInboxView === 'function');
  await page.evaluate(() => {
    document.body.classList.add('is-native-app', 'has-member-nav', 'lyann-messaging-open', 'chat-list-open');
    document.body.classList.remove('chat-conversation-open', 'in-chat-active');
    const modal = document.getElementById('chatModal');
    modal.classList.add('active');
    modal.style.display = 'flex';
    if (!document.querySelector('.mobile-bottom-nav')) {
      const nav = document.createElement('div');
      nav.className = 'mobile-bottom-nav';
      nav.innerHTML = '<button type="button" class="nav-tab active" id="tab-messages" aria-selected="true">Messages</button>';
      document.body.appendChild(nav);
    }
    const list = document.getElementById('chatContactsList');
    list.innerHTML = `
      <button type="button" class="chat-contact-item" data-chat-member-id="solo" data-unread="0" data-annonce="0" data-devis="0" data-favorite="0">
        <div class="chat-contact-info"><div class="chat-contact-name">Camille</div></div>
        <span class="chat-unread-dot lyann-inbox-unread" hidden></span>
      </button>
      <button type="button" class="chat-contact-item is-unread" data-chat-member-id="nora" data-unread="1" data-annonce="0" data-devis="0" data-favorite="0">
        <div class="chat-contact-info"><div class="chat-contact-name">Nora</div><div class="chat-contact-preview">Deux lignes de nouveau message pour vérifier la troncature élégante du dernier échange.</div></div>
        <span class="chat-unread-dot lyann-inbox-unread">2</span>
      </button>
      <button type="button" class="chat-contact-item" data-chat-member-id="alia" data-unread="0" data-annonce="1" data-devis="0" data-favorite="0" data-context="réparer le portail">
        <div class="chat-contact-info"><div class="chat-contact-name">Alia</div><div class="chat-contact-preview">Je passe demain.</div><div class="lyann-inbox-context"><span>Réparer le portail</span></div></div>
      </button>
      <button type="button" class="chat-contact-item" data-chat-member-id="leo" data-unread="0" data-annonce="0" data-devis="1" data-favorite="1" data-context="devis · en attente">
        <div class="chat-contact-info"><div class="chat-contact-name">Léo</div><div class="chat-contact-preview">Voici le devis.</div><div class="lyann-inbox-context"><span data-quote-status="1">Devis · En attente</span></div></div>
      </button>`;
  });
}

test('inbox cards, filters, realtime and navigation stay consistent', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openInboxShell(page);

  const compact = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.chat-contact-item')];
    const empty = rows[0].getBoundingClientRect().height;
    const full = rows[1].getBoundingClientRect().height;
    return { empty, full, overflow: document.documentElement.scrollWidth - innerWidth };
  });
  expect(compact.empty).toBeLessThan(compact.full);
  expect(compact.empty).toBeLessThan(70);
  expect(compact.overflow).toBe(0);

  const scrollability = await page.evaluate(() => {
    const list = document.getElementById('chatContactsList');
    const sidebar = document.querySelector('#chatModal .chat-contacts-sidebar');
    for (let i = 0; i < 12; i += 1) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'chat-contact-item';
      row.innerHTML = `<div class="chat-contact-info"><div class="chat-contact-name">Extra ${i}</div><div class="chat-contact-preview">Ligne pour forcer le scroll vertical de la boîte de réception.</div></div>`;
      list.appendChild(row);
    }
    const style = getComputedStyle(list);
    return {
      canScroll: list.scrollHeight > list.clientHeight + 1,
      overflowY: style.overflowY,
      minHeight: style.minHeight,
      sidebarOverflow: sidebar ? getComputedStyle(sidebar).overflow : null,
      scrolled: (() => {
        const before = list.scrollTop;
        list.scrollTop = 80;
        const after = list.scrollTop;
        list.scrollTop = before;
        return after >= 40;
      })()
    };
  });
  expect(['auto', 'scroll', 'overlay']).toContain(scrollability.overflowY);
  expect(scrollability.minHeight === '0px' || Number.parseFloat(scrollability.minHeight) === 0).toBe(true);
  expect(scrollability.canScroll).toBe(true);
  expect(scrollability.scrolled).toBe(true);
  expect(scrollability.sidebarOverflow).toBe('hidden');

  const visibleNames = async () => page.locator('#chatContactsList .chat-contact-item:not([hidden]) .chat-contact-name').allTextContents();

  await page.locator('[data-inbox-filter="unread"]').click();
  await expect.poll(visibleNames).toEqual(['Nora']);

  await page.locator('[data-inbox-filter="annonces"]').click();
  await expect.poll(visibleNames).toEqual(['Alia']);

  await page.locator('[data-inbox-filter="devis"]').click();
  await expect.poll(visibleNames).toEqual(['Léo']);

  await page.locator('[data-inbox-filter="favoris"]').click();
  await expect.poll(visibleNames).toEqual(['Léo']);

  await page.locator('#chatSearchInput').fill('portail');
  await page.locator('[data-inbox-filter="all"]').click();
  await expect.poll(visibleNames).toEqual(['Alia']);

  await page.locator('#chatSearchInput').fill('personne inconnue');
  await expect(page.locator('.lyann-inbox-filter-empty')).toHaveText('Aucune conversation ne correspond à votre recherche.');

  await page.locator('#chatSearchInput').fill('');
  await page.locator('[data-inbox-filter="all"]').click();

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('lyann:chat-activity', {
      detail: { contactId: 'nora', preview: 'Nouveau message en direct', lastMessageAt: new Date().toISOString(), unread: true }
    }));
  });
  await expect(page.locator('[data-chat-member-id="nora"] .chat-unread-dot')).toHaveText('3');
  await expect(page.locator('[data-chat-member-id="nora"] .chat-contact-preview')).toHaveText('Nouveau message en direct');

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('lyann:chat-read', { detail: { contactId: 'nora' } }));
  });
  await expect(page.locator('[data-chat-member-id="nora"] .chat-unread-dot')).toBeHidden();
  await page.locator('[data-inbox-filter="unread"]').click();
  await expect(page.locator('.lyann-inbox-filter-empty')).toBeVisible();

  await page.locator('[data-inbox-filter="all"]').click();
  await page.evaluate(() => {
    window.LYANN_ACTIVE_CHAT_CONTACT = { id: 'leo' };
    window.dispatchEvent(new CustomEvent('lyann:quote-status', { detail: { status: 'ACCEPTED', contactId: 'leo' } }));
  });
  await expect(page.locator('[data-chat-member-id="leo"] [data-quote-status]')).toHaveText('Devis · Accepté');

  const chrome = await page.evaluate(() => {
    const nav = document.querySelector('.mobile-bottom-nav');
    const listShown = getComputedStyle(nav).display;
    document.body.classList.add('chat-conversation-open', 'in-chat-active');
    document.body.classList.remove('chat-list-open');
    const conversationHidden = getComputedStyle(nav).display;
    document.body.classList.add('chat-list-open');
    document.body.classList.remove('chat-conversation-open', 'in-chat-active');
    const restored = getComputedStyle(nav).display;
    const modal = document.getElementById('chatModal');
    const listBottom = getComputedStyle(modal).bottom;
    document.body.classList.add('keyboard-open');
    const keyboardBottom = getComputedStyle(modal).bottom;
    return { listShown, conversationHidden, restored, listBottom, keyboardBottom };
  });
  expect(chrome.listShown).not.toBe('none');
  expect(chrome.conversationHidden).toBe('none');
  expect(chrome.restored).not.toBe('none');
  expect(chrome.listBottom).not.toBe('0px');
  expect(chrome.keyboardBottom).toBe('0px');

  const back = await page.evaluate(async () => {
    window.LYANN_ROUTER = window.LYANN_ROUTER || {};
    window.LYANN_ROUTER.requireAuthForInteraction = async () => true;
    document.body.classList.add('chat-conversation-open', 'in-chat-active');
    document.body.classList.remove('chat-list-open');
    const pending = window.backToChatContacts({ preventDefault() {}, stopPropagation() {} });
    const during = {
      list: document.body.classList.contains('chat-list-open'),
      conversation: document.body.classList.contains('chat-conversation-open'),
      immersive: document.body.classList.contains('in-chat-active')
    };
    await Promise.race([pending, new Promise((resolve) => setTimeout(resolve, 1500))]);
    return during;
  });
  expect(back.list).toBe(true);
  expect(back.conversation).toBe(false);
  expect(back.immersive).toBe(false);

  await page.locator('.lyann-inbox-compose').click();
  await expect(page).toHaveURL(/results\.html\?mode=lyanneurs/);
  await expect(page.locator('#explorerTitle')).toHaveText('Lyanneurs');
});
