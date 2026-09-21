/**
 * Seed 50 house (seed) profiles for Profils maison.
 * Uses the service role. Idempotent on email.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const url = process.env.SUPABASE_URL || 'https://gzispjfoywklpqatjyop.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY missing');
  process.exit(1);
}
try {
  const role = JSON.parse(Buffer.from(serviceRoleKey.split('.')[1], 'base64').toString()).role;
  if (role !== 'service_role') {
    console.error(`SUPABASE_SERVICE_ROLE_KEY has role="${role}". Auth admin needs the service_role key from the Supabase dashboard, not the anon key.`);
    process.exit(1);
  }
} catch (e) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is not a valid JWT');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const ROOT = path.join(__dirname, '..');
const AVATAR_DIR = path.join(ROOT, 'scratch', 'maison-avatars');
const CATALOG = JSON.parse(fs.readFileSync(path.join(__dirname, 'maison-profiles.json'), 'utf8'));
const CREDS_PATH = path.join(ROOT, 'scratch', 'maison-credentials.json');
const MASTER_PASSWORD = process.env.MAISON_SEED_PASSWORD || loadOrCreatePassword();

function loadOrCreatePassword() {
  if (fs.existsSync(CREDS_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
      if (existing.password) return existing.password;
    } catch (e) { /* create a new one */ }
  }
  return crypto.randomBytes(18).toString('base64url');
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

function maisonEmail(profile) {
  return `maison.${slugify(profile.first_name)}.${slugify(profile.last_name)}@lyann.app`;
}

async function findUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data.users || [];
    const found = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (users.length < 200) return null;
    page += 1;
  }
}

async function uploadAvatar(userId, filename) {
  const filePath = path.join(AVATAR_DIR, filename);
  if (!fs.existsSync(filePath)) throw new Error(`Avatar manquant: ${filename}`);
  const buf = fs.readFileSync(filePath);
  const objectPath = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage.from('avatars').upload(objectPath, buf, {
    contentType: 'image/jpeg',
    upsert: true
  });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(objectPath);
  return data.publicUrl;
}

async function syncServices(userId, skills) {
  const { data: existing, error: fetchErr } = await supabase
    .from('services')
    .select('id, title')
    .eq('owner_id', userId);
  if (fetchErr) throw fetchErr;
  const have = new Set((existing || []).map((s) => (s.title || '').toLowerCase()));
  const rows = skills
    .filter((title) => !have.has(title.toLowerCase()))
    .map((title) => ({
      owner_id: userId,
      title,
      category: title,
      description: title,
      is_active: true
    }));
  if (rows.length) {
    const { error } = await supabase.from('services').insert(rows);
    if (error) throw error;
  }
}

async function seedOne(profile) {
  const email = maisonEmail(profile);
  let user = await findUserByEmail(email);
  if (!user) {
    const created = await supabase.auth.admin.createUser({
      email,
      password: MASTER_PASSWORD,
      email_confirm: true,
      user_metadata: {
        first_name: profile.first_name,
        last_name: profile.last_name,
        account_origin: 'maison'
      }
    });
    if (created.error) throw created.error;
    user = created.data.user;
  } else {
    await supabase.auth.admin.updateUserById(user.id, {
      password: MASTER_PASSWORD,
      email_confirm: true
    });
  }

  let avatarUrl = null;
  if (profile.photo) {
    avatarUrl = await uploadAvatar(user.id, profile.photo);
  }

  const bio = `${profile.skills.join(', ')}. Intervient autour de ${profile.city}.`;
  const { error: updErr } = await supabase.from('profiles').update({
    first_name: profile.first_name,
    last_name: profile.last_name,
    email,
    territory: 'guadeloupe',
    city: profile.city,
    bio,
    avatar_url: avatarUrl,
    account_type: 'seed',
    is_pro: true,
    professional_status: profile.skills[0] || null,
    intervention_radius_km: 25,
    updated_at: new Date().toISOString()
  }).eq('id', user.id);
  if (updErr) throw updErr;

  await syncServices(user.id, profile.skills);
  return { email, userId: user.id, photo: profile.photo || null, city: profile.city };
}

async function main() {
  const results = [];
  for (const profile of CATALOG.profiles) {
    try {
      const row = await seedOne(profile);
      results.push({ ...profile, ...row, ok: true });
      console.log(`OK ${profile.id} ${profile.first_name} ${profile.last_name} → ${row.city}`);
    } catch (err) {
      results.push({ id: profile.id, first_name: profile.first_name, last_name: profile.last_name, ok: false, error: err.message });
      console.error(`FAIL ${profile.id} ${profile.first_name} ${profile.last_name}: ${err.message}`);
    }
  }
  fs.mkdirSync(path.dirname(CREDS_PATH), { recursive: true });
  fs.writeFileSync(CREDS_PATH, JSON.stringify({
    password: MASTER_PASSWORD,
    emailPattern: 'maison.prenom.nom@lyann.app',
    createdAt: new Date().toISOString(),
    results: results.map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`,
      email: r.email || null,
      userId: r.userId || null,
      city: r.city || null,
      photo: r.photo || null,
      ok: r.ok,
      error: r.error || null
    }))
  }, null, 2));
  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  console.log(`Done ${ok}/${results.length} fail=${fail}`);
  console.log(`Credentials: ${CREDS_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
