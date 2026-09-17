const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const failures = [];

function fail(message) { failures.push(message); }

const start = script.indexOf('async function handleFavoriteBtnTap(e)');
const end = script.indexOf('// Bind delegator with capture: true on both touchend and click for immediate iOS WebKit response', start);

if (start === -1 || end === -1) {
  fail('script.js: favorite handler region missing');
} else {
  const block = script.slice(start, end);
  const optimisticPaint = block.indexOf('paintFavoriteState(nextFavorite);');
  const networkAwait = block.indexOf('await window.LyannFavoritesService.toggleFavorite');

  if (!block.includes('OPTIMISTIC FAVORITE UI: paint before network round-trip')) {
    fail('script.js: favorite UI is not explicitly optimistic');
  }
  if (optimisticPaint === -1 || networkAwait === -1 || optimisticPaint > networkAwait) {
    fail('script.js: favorite UI must update before awaiting the network');
  }
  if (!block.includes("favBtn.dataset.favoritePending === 'true'")) {
    fail('script.js: favorite handler must guard duplicate in-flight taps');
  }
  if (!block.includes('paintFavoriteState(previousFavorite);')) {
    fail('script.js: favorite handler must roll back on failure');
  }
  if (!block.includes("favBtn.setAttribute('aria-pressed'")) {
    fail('script.js: favorite control must expose pressed state');
  }
  if (block.includes("favBtn.style.opacity = '0.5'")) {
    fail('script.js: favorite interaction must not visibly fade while waiting for persistence');
  }
}

if (failures.length) {
  console.error('Favorite interaction audit failed:');
  failures.forEach((message) => console.error(`  ✖ ${message}`));
  process.exit(1);
}

console.log('✓ Favorite interaction architecture gate passed');
