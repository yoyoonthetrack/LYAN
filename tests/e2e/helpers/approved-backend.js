const { test, expect } = require('@playwright/test');

// This guard is an authorization boundary, never a mocked success. Point a
// staging build at a non-production Supabase and explicitly authorize writes.
async function requireWriteBackend(page) {
  test.skip(process.env.LYANN_E2E_ALLOW_WRITES !== '1', 'ENVIRONMENT REQUIRED: approve a non-production backend for persistent business journeys');
  const ref = process.env.LYANN_E2E_WRITE_PROJECT_REF;
  expect(ref, 'Explicit approved Supabase project ref required').toBeTruthy();
  expect(ref, 'Production must remain untouched').not.toBe('gzispjfoywklpqatjyop');
  await page.goto('/index.html');
  const actual = await page.evaluate(() => window.LYANN_API_CLIENT.supabase.supabaseUrl);
  const host = new URL(actual).hostname;
  const localHosts = new Set(['127.0.0.1', 'localhost']);
  if (localHosts.has(host)) {
    expect(ref, 'Local isolated QA must use write ref "local"').toBe('local');
    return;
  }
  expect(host).toBe(`${ref}.supabase.co`);
}
function lookupActorCreds(actor) {
  const names = [actor];
  if (actor === 'REQUESTER') names.push('A');
  if (actor === 'HELPER') names.push('B');
  for (const name of names) {
    const email = process.env[`LYANN_E2E_${name}_EMAIL`] || process.env[`LYANN_E2E_QA_${name}_EMAIL`];
    const password = process.env[`LYANN_E2E_${name}_PASSWORD`] || process.env[`LYANN_E2E_QA_${name}_PASSWORD`];
    if (email && password) return { email, password };
  }
  return { email: undefined, password: undefined };
}

async function login(page, actor) {
  const { email, password } = lookupActorCreds(actor);
  expect(email, `Existing ${actor} email required`).toBeTruthy();
  expect(password, `Existing ${actor} password required`).toBeTruthy();
  const result = await page.evaluate(async ({ email, password }) => {
    const res = await window.LYANN_API_CLIENT.login(email, password);
    return { id:res.data?.user?.id, error:res.error?.message };
  }, {email,password});
  expect(result.error).toBeFalsy();
  expect(result.id).toBeTruthy();
  await waitAuthenticated(page);
  return result.id;
}
async function waitAuthenticated(page) {
  await expect.poll(async () => page.evaluate(async () => {
    const res = await window.LYANN_API_CLIENT.getSession();
    const sessionOk = !!(res && res.data && res.data.session && res.data.session.user && res.data.session.user.id);
    const authOk = window.LYANN_AUTH_STATE?.isAuthenticated?.() === true;
    return sessionOk && authOk;
  }), { timeout: 15000 }).toBe(true);
}
module.exports = {requireWriteBackend,login,waitAuthenticated};
