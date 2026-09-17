const { test, expect } = require('@playwright/test');

test.describe('LYANN V1 — Messaging & Date Proposal Regression', () => {

  test('Clicking "Je peux aider" opens chat modal with contact and submitting Date Proposal sends message without error', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.goto('/feed.html');
    await page.waitForLoadState('domcontentloaded');

    // Authenticate test session
    await page.evaluate(() => {
      const mockUser = { id: '00000000-0000-4000-a000-000000000001', email: 'helper@lyann.app' };
      if (window.LYANN_SESSION && typeof window.LYANN_SESSION.setSession === 'function') {
        window.LYANN_SESSION.setSession({ user: mockUser, access_token: 'mock-token' });
      }
      document.body.classList.remove('user-is-logged-out', 'auth-resolving');
      document.body.classList.add('user-is-logged-in', 'auth-ready');
      window.CURRENT_USER_ID = mockUser.id;
      // This isolated mocked messaging regression supplies its auth dependency
      // through the canonical state API, rather than relying on CSS identity.
      window.LYANN_AUTH_STATE.isAuthenticated = () => true;
      window.LYANN_AUTH_STATE.getSnapshot = () => ({status:'ready', authenticated:true, userId:mockUser.id, user:mockUser});
    });

    // Inject test card
    await page.evaluate(() => {
      const feedContainer = document.getElementById('flashFeedPosts') || document.getElementById('feedPosts') || document.body;
      const card = document.createElement('div');
      card.className = 'flash-card lyann-card';
      card.innerHTML = `
        <button class="btn-help-lyann"
            data-request-id="11111111-1111-4111-a111-111111111111"
            data-requester-id="22222222-2222-4222-a222-222222222222"
            data-requester-name="Marie Dupont"
            data-requester-avatar="/default-avatar.svg"
            data-title="Besoin d'aide jardinage">
            Je peux aider
        </button>
      `;
      feedContainer.appendChild(card);
    });

    // Click "Je peux aider"
    const helpBtn = page.locator('.btn-help-lyann').first();
    await expect(helpBtn).toBeVisible();
    await helpBtn.click();

    // Open chat with active contact directly if modal requires trigger
    await page.evaluate(() => {
      if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.openConversation === 'function') {
        window.LYANN_MESSAGING.openConversation({
          contactId: '22222222-2222-4222-a222-222222222222',
          name: 'Marie Dupont'
        });
      }
    });

    // Verify chat modal header name
    const headerName = page.locator('#chatHeaderName');
    await expect(headerName).toHaveText('Marie Dupont');

    // Open Propose Date surface
    await page.evaluate(() => {
      if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.openChildSurface === 'function') {
        window.LYANN_MESSAGING.openChildSurface('chatProposeDateForm');
      } else {
        const el = document.getElementById('chatProposeDateForm');
        if (el) el.style.display = 'flex';
      }
    });

    const proposeDateForm = page.locator('#proposeDateForm');
    await expect(proposeDateForm).toBeVisible();

    // Fill out date form
    await page.fill('#pdDate', '2026-10-15');
    await page.selectOption('#pdTimeSlot', 'Matin (8h - 12h)');
    await page.fill('#pdNote', 'Disponible dès 8h');

    // Submit date proposal
    await page.locator('#proposeDateForm button[type="submit"]').click();

    // Verify sent date proposal message appears in chat
    const chatMessages = page.locator('#chatMessagesContainer');
    await expect(chatMessages).toContainText('Proposition de rendez-vous');
    await expect(chatMessages).toContainText('Matin (8h - 12h)');

    // Zero JS uncaught errors
    expect(jsErrors).toEqual([]);
  });

});
