'use strict';
// Explicit operator diagnostic; never runs during a normal build.
// node scripts/test-apple-sandbox-notifications.cjs --run
// Uses only Vercel's existing server environment. Never logs credentials,
// notification tokens, signed payloads, or purchase data.
const out = value => console.log('LYANN_APPLE_SANDBOX_TEST ' + JSON.stringify(value));
async function main() {
  if (!process.argv.includes('--run')) {
    out({skipped: true, reason: 'Pass --run to request one Apple TEST notification.'});
    return;
  }
  const e = process.env;
  if (e.VERCEL_ENV !== 'preview'
      || e.VERCEL_GIT_COMMIT_REF !== 'feature/bokantaj-map-v1'
      || e.SUPABASE_URL !== 'https://tdktfbtqceldlaeqjtow.supabase.co'
      || e.LYANN_STORE_TEST_PURCHASES_ENABLED !== 'false') {
    out({success: false, reason: 'staging_scope_required_with_purchases_disabled'});
    process.exitCode = 1;
    return;
  }
  const timer = setTimeout(() => {
    out({success: false, reason: 'diagnostic_timeout'});
    process.exit(1);
  }, 150000);
  try {
    const {AppStoreServerAPIClient, SignedDataVerifier, Environment} = require('@apple/app-store-server-library');
    const api = new AppStoreServerAPIClient(
      e.LYANN_APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      e.LYANN_APPLE_KEY_ID, e.LYANN_APPLE_ISSUER_ID,
      'app.lyann.mobile', Environment.SANDBOX);
    const verifier = new SignedDataVerifier(
      JSON.parse(e.LYANN_APPLE_ROOT_CERTIFICATES).map(x => Buffer.from(x, 'base64')),
      true, Environment.SANDBOX, 'app.lyann.mobile');
    const probe = await fetch('https://staging-bokantaj.lyann.app/v1/store/notifications/apple', {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: '{}', redirect: 'error', signal: AbortSignal.timeout(15000)
    });
    if (probe.status !== 400) {
      out({success: false, reason: 'receiver_not_ready', httpStatus: probe.status});
      process.exitCode = 1;
      return;
    }
    const requested = await api.requestTestNotification();
    if (!requested.testNotificationToken) throw new Error('Missing token');
    out({requested: true});
    for (let i = 0; i < 12; i++) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      const status = await api.getTestNotificationStatus(requested.testNotificationToken);
      const attempts = (status.sendAttempts || []).map(x => ({
        result: x.sendAttemptResult, date: x.attemptDate
      }));
      out({attempts});
      if (attempts.some(x => x.result === 'SUCCESS')) {
        const notification = await verifier.verifyAndDecodeNotification(status.signedPayload);
        if (notification.notificationType !== 'TEST') throw new Error('Unexpected notification');
        out({success: true, signatureVerified: true, type: 'TEST', environment: 'Sandbox'});
        return;
      }
    }
    out({success: false, reason: 'delivery_not_confirmed'});
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
  }
}
main().catch(error => {
  // Do not print SDK messages/stacks or request/response objects.
  out({success: false, httpStatus: error.httpStatusCode || null,
    apiError: error.apiError || null, errorType: error.name || 'Error'});
  process.exitCode = 1;
});
