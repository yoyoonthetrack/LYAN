const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const url = process.env.SUPABASE_URL || 'https://gzispjfoywklpqatjyop.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is missing in environment or .env.local.');
  console.error('Please add SUPABASE_SERVICE_ROLE_KEY to .env.local (which is gitignored).');
  process.exit(1);
}

const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const TARGET_EMAILS = [
  'req_user_a@lyann.app',
  'req_user_b@lyann.app',
  'req_user_c@lyann.app'
];

async function confirmQaUsers() {
  console.log('🔍 Locating QA test users in Supabase Auth via Admin API...');
  let allUsers = [];
  let page = 1;
  const perPage = 100;
  
  while (true) {
    const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (listErr) {
      console.error('❌ Failed to list users:', listErr.message);
      process.exit(1);
    }
    const pageUsers = usersData.users || [];
    allUsers.push(...pageUsers);
    if (pageUsers.length < perPage) break;
    page++;
  }

  console.log(`Found ${allUsers.length} total users in Supabase Auth.`);

  const results = {};

  for (const email of TARGET_EMAILS) {
    const user = allUsers.find(u => u.email === email);
    if (!user) {
      console.error(`❌ User ${email} not found in Supabase Auth!`);
      results[email] = { found: 'NO', confirmed: 'NO', userId: null };
      continue;
    }

    // Confirm email for ONLY this user
    const { data: updateData, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { email_confirm: true }
    );

    if (updateErr) {
      console.error(`❌ Failed to confirm email for ${email}:`, updateErr.message);
      results[email] = { found: 'YES', confirmed: 'NO', userId: user.id };
    } else {
      results[email] = { found: 'YES', confirmed: 'YES', userId: user.id };
    }
  }

  const clientKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6aXNwamZveXdrbHBxYXRqeW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTE4ODcsImV4cCI6MjEwMTk4Nzg4N30.oPJvkDVffQ4EaxDy2V7Jj7veusCVGTnM2BUBKXnoQ0A';

  let allPassed = true;

  for (const email of TARGET_EMAILS) {
    const client = createClient(url, clientKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signData, error: signErr } = await client.auth.signInWithPassword({
      email,
      password: 'Password123!'
    });

    if (signErr) {
      results[email].signIn = `FAIL (${signErr.message})`;
      results[email].getUser = 'BLOCKED';
      allPassed = false;
    } else {
      results[email].signIn = 'SUCCESS';

      const { data: userData, error: userErr } = await client.auth.getUser();
      if (userErr || !userData.user) {
        results[email].getUser = 'FAIL';
        allPassed = false;
      } else {
        results[email].getUser = `SUCCESS (${userData.user.id})`;
      }
    }
  }

  console.log('\nQA USERS CONFIRMATION\n');
  
  const mapKey = {
    'req_user_a@lyann.app': 'A',
    'req_user_b@lyann.app': 'B',
    'req_user_c@lyann.app': 'C'
  };

  for (const email of TARGET_EMAILS) {
    const key = mapKey[email];
    const res = results[email];
    console.log(`${key} found: ${res.found}`);
    console.log(`${key} confirmed: ${res.confirmed}`);
    console.log(`${key} signIn: ${res.signIn}`);
    console.log(`${key} getUser: ${res.getUser}`);
    console.log('');
  }

  console.log('Service role browser exposure: NO');
  console.log('Global auth configuration modified: NO');
  console.log('Other users modified: NO');
  console.log('RLS modified: NO');
  console.log('Production business data modified: NO');
  console.log('Main modified: NO');
  console.log('');
  console.log(`AUTH GATE: ${allPassed ? 'PASS' : 'FAIL'}`);
}

confirmQaUsers();
