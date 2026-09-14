const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'script.js');
let source = fs.readFileSync(file, 'utf8');
const before = source;
source = source.replaceAll('david-34.png', '/default-avatar.svg');
if (source !== before) {
  fs.writeFileSync(file, source);
  console.log('Sanitized legacy avatar fallbacks in script.js.');
} else {
  console.log('No legacy avatar fallbacks found.');
}
