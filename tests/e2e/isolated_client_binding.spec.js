const { test, expect } = require('@playwright/test');
const { requireWriteBackend, login } = require('./helpers/approved-backend');

const ISOLATED_REF = 'pcmvagiuvleeciktligz';

test.describe('Isolated QA client binding', () => {
  test('feed talks to the isolated Supabase project, not production', async ({ page }) => {
    test.skip(process.env.LYANN_E2E_WRITE_PROJECT_REF !== ISOLATED_REF, 'isolated write ref required');
    await requireWriteBackend(page);
    const url = await page.evaluate(() => window.getLyannSupabaseUrl());
    expect(url).toContain(ISOLATED_REF);
    expect(url).not.toContain('gzispjfoywklpqatjyop');
    const userId = await login(page, 'A');
    expect(userId).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
