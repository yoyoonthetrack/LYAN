const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const failures = [];

function fail(message) { failures.push(message); }

const profileMarker = script.indexOf('PROFILE INTERACTION: open shell before data round-trip');
const profileOpen = script.indexOf("publicMemberProfileModal.classList.add('active')", profileMarker);
const profileAwait = script.indexOf('await window.LYANN_PROFILE_REPOSITORY.load(memberId)', profileMarker);
const profileBusyOn = script.indexOf("publicMemberProfileModal.setAttribute('aria-busy', 'true')", profileMarker);
const profileBusyOff = script.indexOf("publicMemberProfileModal.setAttribute('aria-busy', 'false')", profileMarker);

if (profileMarker === -1) fail('script.js: immediate profile interaction marker missing');
if (profileOpen === -1 || profileAwait === -1 || profileOpen > profileAwait) {
  fail('script.js: profile shell must become visible before awaiting profile data');
}
if (profileBusyOn === -1 || profileBusyOff === -1) {
  fail('script.js: profile loading state must expose aria-busy lifecycle');
}
if (!script.includes('lyann-profile-loading-overlay')) {
  fail('script.js: profile must use an honest loading overlay instead of stale placeholder data');
}

const filterMarker = script.indexOf('FILTER INTERACTION: pointer-up opens the sheet without waiting for click synthesis');
const pointerHandler = script.indexOf("btnOpenFilterSheet.addEventListener('pointerup'", filterMarker);
const filterOpenCall = script.indexOf('openBokantajFilterSheetNow(e)', pointerHandler);
const filterDisplay = script.indexOf("filterSheetModal.style.display = 'flex'", script.indexOf('const openBokantajFilterSheetNow'));

if (filterMarker === -1) fail('script.js: immediate Bokantaj filter interaction marker missing');
if (pointerHandler === -1 || filterOpenCall === -1) {
  fail('script.js: Bokantaj filter sheet must open from pointerup for immediate tap response');
}
if (filterDisplay === -1) {
  fail('script.js: Bokantaj filter open helper must synchronously reveal the sheet');
}
if (!script.includes('Date.now() - lastFilterPointerOpen < 500')) {
  fail('script.js: filter pointer/click handlers must de-duplicate synthetic click');
}

if (failures.length) {
  console.error('Immediate surfaces audit failed:');
  failures.forEach((message) => console.error(`  ✖ ${message}`));
  process.exit(1);
}

console.log('✓ Immediate profile/filter interaction gate passed');
