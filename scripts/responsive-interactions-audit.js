const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const failures = [];

function fail(message) { failures.push(message); }

const start = script.indexOf("document.querySelectorAll('.btn-like-flash').forEach(btn => {");
const end = script.indexOf('// Comments Drawer Toggle & Fetch', start);

if (start === -1 || end === -1) {
  fail('script.js: Bokantaj like handler region missing');
} else {
  const block = script.slice(start, end);
  const optimisticPaint = block.indexOf('paintLikeState(nextLiked, optimisticCount);');
  const networkAwait = block.indexOf('await window.LYANN_API_CLIENT.toggleLike');
  if (!block.includes('OPTIMISTIC UI: paint before network round-trip')) {
    fail('script.js: Bokantaj like handler is not explicitly optimistic');
  }
  if (optimisticPaint === -1 || networkAwait === -1 || optimisticPaint > networkAwait) {
    fail('script.js: like UI must update before awaiting the network');
  }
  if (!block.includes('paintLikeState(previousLiked, previousCount);')) {
    fail('script.js: optimistic like handler must roll back on sync failure');
  }
  if (!block.includes("btn.dataset.likePending === 'true'")) {
    fail('script.js: like handler must guard against duplicate in-flight taps');
  }
  if (!block.includes('matchingPost.user_has_liked = nextLiked')) {
    fail('script.js: optimistic like state must update the in-memory Bokantaj model');
  }
  if (!block.includes('paintLikeState(res.liked, serverCount);')) {
    fail('script.js: optimistic like handler must reconcile with the server response');
  }
  if (!block.includes('LYANN_BOKANTAJ_REPOSITORY.invalidate()')) {
    fail('script.js: confirmed likes must invalidate the cached Bokantaj feed');
  }
  if (!block.includes('delete btn.dataset.likePending;')) {
    fail('script.js: pending interaction guard must always be released');
  }
}

if (failures.length) {
  console.error('Responsive interactions audit failed:');
  failures.forEach((message) => console.error(`  ✖ ${message}`));
  process.exit(1);
}

console.log('✓ Responsive interaction architecture gate passed');
