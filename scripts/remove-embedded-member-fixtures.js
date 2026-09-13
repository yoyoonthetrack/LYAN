const fs = require('fs');
const file = 'script.js';
let source = fs.readFileSync(file, 'utf8');
const startMarker = '    const LYANN_MEMBERS = [';
const endMarker = 'function ensureMobileHamburgerDrawer() {';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start === -1 || end === -1 || end <= start) {
  console.log('Embedded member fixture block already removed or markers changed.');
  process.exit(0);
}
const replacement = `    // Production source of truth: members come from Supabase repositories.\n    // Static personas were removed to prevent stale/fake profiles from becoming a competing data source.\n    const LYANN_MEMBERS = [];\n    window.LYANN_MEMBERS = LYANN_MEMBERS;\n\n`;
source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(file, source, 'utf8');
console.log('Removed embedded LYANN member fixtures from script.js');
