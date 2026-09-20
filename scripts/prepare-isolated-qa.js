/**
 * Isolated QA status checker. Never writes to production Supabase.
 * Prints configuration presence only — no secrets.
 */
const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config();

function hostRef(url) {
  try {
    const host = new URL(url).hostname;
    if (host === '127.0.0.1' || host === 'localhost') return 'local';
    return host.replace('.supabase.co', '');
  } catch (e) {
    return '';
  }
}

const writeRef = process.env.LYANN_E2E_WRITE_PROJECT_REF || '';
const supabaseUrl = process.env.SUPABASE_URL || process.env.LYANN_SUPABASE_URL || 'https://gzispjfoywklpqatjyop.supabase.co';
const allowWrites = process.env.LYANN_E2E_ALLOW_WRITES === '1';
const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripePub = process.env.STRIPE_PUBLISHABLE_KEY || '';
const target = hostRef(supabaseUrl);

const report = {
  stripe_secret_prefix: stripeSecret.startsWith('sk_test_') ? 'sk_test' : stripeSecret.startsWith('sk_live_') ? 'sk_live' : stripeSecret ? 'other' : 'absent',
  stripe_publishable_prefix: stripePub.startsWith('pk_test_') ? 'pk_test' : stripePub.startsWith('pk_live_') ? 'pk_live' : stripePub ? 'other' : 'absent',
  allow_writes: allowWrites,
  write_project_ref: writeRef || 'absent',
  supabase_target: target || 'absent',
  production_writes_blocked: target === PRODUCTION_REF
};

console.log(JSON.stringify(report, null, 2));

if (target === PRODUCTION_REF) {
  console.log('STATUS=blocked production_supabase');
  process.exit(2);
}
if (!writeRef || writeRef === PRODUCTION_REF) {
  console.log('STATUS=environment_required isolated_supabase_missing');
  process.exit(3);
}
if (!allowWrites) {
  console.log('STATUS=environment_required writes_not_authorized');
  process.exit(4);
}
if (writeRef !== target && !(writeRef === 'local' && target === 'local')) {
  console.log('STATUS=mismatch write_ref_vs_supabase_url');
  process.exit(5);
}
console.log('STATUS=ready isolated_qa');
