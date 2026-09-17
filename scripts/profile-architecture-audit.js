const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const failures = [];

function fail(message) { failures.push(message); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }

for (const required of ['profile-repository.js', 'script.js']) {
  if (!fs.existsSync(path.join(root, required))) fail(`${required}: missing`);
}

if (fs.existsSync(path.join(root, 'profile-repository.js'))) {
  const repo = read('profile-repository.js');
  if (!repo.includes('Promise.all([')) fail('profile-repository.js: profile sources must load in parallel');
  if (!repo.includes("cache.dedupe('profile-bundle'")) fail('profile-repository.js: consolidated profile bundle must use shared cache/dedupe');
  if (!repo.includes('window.LYANN_AUTH_STATE')) fail('profile-repository.js: authenticated identity must come from centralized auth state');
  if (!repo.includes(".from('reviews')")) fail('profile-repository.js: real reviews query missing');
}

if (fs.existsSync(path.join(root, 'script.js'))) {
  const source = read('script.js');
  const start = source.indexOf('async function openPublicMemberProfile(memberId, entryPoint) {');
  const end = source.indexOf('    window.openPublicMemberProfile = openPublicMemberProfile;', start);
  if (start === -1 || end === -1) {
    fail('script.js: public profile opener not found');
  } else {
    const loader = source.slice(start, end);
    if (!loader.includes('window.LYANN_PROFILE_REPOSITORY.load(memberId)')) fail('script.js: public profile must use consolidated profile repository');
    for (const legacyCall of ['getUserTrustAndReputation(', 'getUserPortfolio(', 'getUserServices(', ".from('reviews')"]) {
      if (loader.includes(legacyCall)) fail(`script.js: sequential profile data call remains in opener: ${legacyCall}`);
    }
    if ((loader.match(/renderStep9ProfileModalDOM\(/g) || []).length !== 1) fail('script.js: public profile should have one definitive primary DOM render');
  }
}

const productPages = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
for (const file of productPages) {
  const html = read(file);
  if (!html.includes('<script src="script.js')) continue;
  const cacheIndex = html.indexOf('<script src="data-cache.js"></script>');
  const repoIndex = html.indexOf('<script src="profile-repository.js"></script>');
  const scriptIndex = html.indexOf('<script src="script.js');
  if (repoIndex === -1) fail(`${file}: profile-repository.js missing`);
  else if (!(cacheIndex < repoIndex && repoIndex < scriptIndex)) fail(`${file}: profile-repository.js must load after data-cache and before script.js`);
}

console.log('LYANN profile architecture audit');
if (failures.length) {
  failures.forEach((message) => console.error(`  ✖ ${message}`));
  process.exit(1);
}
console.log('✓ Consolidated cached single-render profile architecture passed');
