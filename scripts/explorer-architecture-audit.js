const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function assert(condition, message) {
  if (!condition) {
    console.error('❌ ' + message);
    process.exitCode = 1;
  } else {
    console.log('✅ ' + message);
  }
}

const repo = read('explorer-repository.js');
const script = read('script.js');
const feed = read('feed.html');

assert(repo.includes("from('profiles').select('*')"), 'Explorer repository owns the profiles query');
assert(repo.includes('LYANN_DATA_CACHE') && repo.includes('.dedupe('), 'Explorer repository uses shared cache/in-flight dedupe');
assert(repo.includes('TTL_MS = 30000'), 'Explorer profiles have a bounded cache TTL');
assert(feed.includes('explorer-repository.js'), 'feed.html loads Explorer repository');
assert(script.includes('LYANN_EXPLORER_REPOSITORY.load()'), 'Explorer UI loads candidates through the repository');
assert(script.includes('LYANN_EXPLORER_REPOSITORY.peek()'), 'Explorer UI can reuse cached candidates immediately');

const explorerStart = script.indexOf('// 1. Fetch Candidates through centralized cached Explorer repository');
const explorerEnd = script.indexOf('// 2. Invoke LyannSearchEngine.performUniversalSearch', explorerStart);
const explorerBlock = explorerStart >= 0 && explorerEnd > explorerStart ? script.slice(explorerStart, explorerEnd) : '';
assert(explorerBlock.length > 0, 'Explorer normalized candidate block is present');
assert(!explorerBlock.includes(".from('profiles')"), 'Explorer UI no longer queries profiles directly');
assert(!explorerBlock.includes('getCurrentUser().catch'), 'Explorer UI no longer resolves auth independently before every search');

if (process.exitCode) process.exit(process.exitCode);
console.log('Explorer architecture audit passed.');
