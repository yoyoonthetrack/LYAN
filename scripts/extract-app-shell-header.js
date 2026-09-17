const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const scriptPath = path.join(root, 'script.js');
const shellPath = path.join(root, 'app-shell.js');

if (!fs.existsSync(scriptPath)) throw new Error('script.js not found');
if (!fs.existsSync(shellPath)) throw new Error('app-shell.js not found');

let source = fs.readFileSync(scriptPath, 'utf8');
let shell = fs.readFileSync(shellPath, 'utf8');
const startMarker = '// === APP HOME V1 CONNECTED VIEW RENDERER (APP NATIVE ONLY) ===';
const endMarker = '    window.isExplicitDemoMode = function() {';

const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start + startMarker.length);

if (start !== -1) {
  if (end === -1 || end <= start) throw new Error('app shell header extraction end marker not found');
  const extracted = source.slice(start, end).trimEnd();
  if (!shell.includes(startMarker)) {
    shell = `${shell.trimEnd()}\n\n${extracted}\n`;
    fs.writeFileSync(shellPath, shell, 'utf8');
  }
  source = source.slice(0, start) + source.slice(end);
}

// Remove the last remaining fake chat avatar default from the legacy core.
source = source.replace("let activeContactAvatar = 'david-34.png';", "let activeContactAvatar = window.getLyannDefaultAvatar ? window.getLyannDefaultAvatar() : '';" );

fs.writeFileSync(scriptPath, source, 'utf8');
console.log(start === -1 ? 'App shell header extraction already applied.' : 'Extracted connected-home/native-header rendering into app-shell.js');
