const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const feed = fs.readFileSync(path.join(root, 'feed.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const repo = fs.readFileSync(path.join(root, 'bokantaj-repository.js'), 'utf8');
const failures = [];

function fail(message) { failures.push(message); }
function idx(source, needle) { return source.indexOf(needle); }

const dataCache = idx(feed, '<script src="data-cache.js"></script>');
const profileRepo = idx(feed, '<script src="profile-repository.js"></script>');
const bokantajRepo = idx(feed, '<script src="bokantaj-repository.js"></script>');
const legacy = idx(feed, '<script src="script.js');

if (bokantajRepo === -1) fail('feed.html: bokantaj-repository.js is missing');
if (!(dataCache !== -1 && profileRepo !== -1 && bokantajRepo > profileRepo && bokantajRepo < legacy)) {
  fail('feed.html: Bokantaj repository must load after shared caches/repositories and before script.js');
}

const start = script.indexOf('window.loadBokantajFeedFromSupabase = async function');
const end = script.indexOf('// Initial feed trigger', start);
if (start === -1 || end === -1) {
  fail('script.js: Bokantaj loader region missing');
} else {
  const loader = script.slice(start, end);
  if (!loader.includes('LYANN_BOKANTAJ_REPOSITORY.load')) fail('script.js: Bokantaj loader bypasses shared repository');
  if (loader.includes('client.getFeed()')) fail('script.js: direct getFeed call remains in Bokantaj loader');
  if ((loader.match(/renderFlashFeed\(\)/g) || []).length > 2) fail('script.js: Bokantaj loader performs excessive feed renders');
}

if (!repo.includes('inFlight')) fail('bokantaj-repository.js: in-flight request deduplication missing');
if (!repo.includes('CACHE_TTL_MS')) fail('bokantaj-repository.js: short-lived feed cache missing');
if (!repo.includes("item.visibility !== 'PUBLIC'")) fail('bokantaj-repository.js: private targeted request public-feed guard missing');

if (failures.length) {
  console.error('Bokantaj architecture audit failed:');
  failures.forEach((message) => console.error(`  ✖ ${message}`));
  process.exit(1);
}

console.log('✓ Bokantaj repository architecture gate passed');
