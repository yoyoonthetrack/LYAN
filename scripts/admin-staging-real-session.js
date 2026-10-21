'use strict';

const { resolveAdminAndJwt } = require('./admin-staging-real-session-lib');

(async () => {
  const who = await resolveAdminAndJwt();
  const apiBase = process.env.LYANN_STAGING_API || 'https://staging.lyann.app';
  const meRes = await fetch(`${apiBase}/v1/admin/me`, {
    headers: { Authorization: `Bearer ${who.jwt}` }
  });
  const meBody = await meRes.json().catch(() => ({}));
  const headers = { Authorization: `Bearer ${who.jwt}`, 'Content-Type': 'application/json' };
  const botsRes = await fetch(`${apiBase}/v1/admin/editorial/bots`, { headers });
  const bots = await botsRes.json().catch(() => ({}));
  const maisonRes = await fetch(`${apiBase}/v1/admin/maison/profiles`, { headers });
  const maison = await maisonRes.json().catch(() => ({}));
  process.stdout.write(`${JSON.stringify({
    environment: 'staging',
    admin_source: who.source,
    admin_email_domain: who.emailDomain,
    me_status: meRes.status,
    me_ok: Boolean(meRes.ok && meBody.success),
    me_role: meBody.role || meBody.error || null,
    jwt_present: Boolean(who.jwt),
    editorial_bots_status: botsRes.status,
    editorial_bots_count: Array.isArray(bots.bots) ? bots.bots.length : 0,
    maison_status: maisonRes.status,
    maison_count: Array.isArray(maison.profiles) ? maison.profiles.length : 0
  }, null, 2)}\n`);
  if (!(meRes.ok && meBody.success)) process.exit(2);
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
