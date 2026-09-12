const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const scriptPath = path.join(root, 'script.js');

if (!fs.existsSync(scriptPath)) throw new Error('script.js not found');

let source = fs.readFileSync(scriptPath, 'utf8');
const changes = [];

function extractDomain({ startMarker, endMarker, outputFile, banner }) {
  const outputPath = path.join(root, outputFile);

  if (fs.existsSync(outputPath)) {
    return;
  }

  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`${outputFile}: extraction markers not found or invalid`);
  }

  const extracted = source.slice(start, end).trimEnd() + '\n';
  fs.writeFileSync(outputPath, `${banner}\n\n${extracted}`, 'utf8');
  source = source.slice(0, start) + source.slice(end);
  changes.push(`extract ${outputFile}`);
}

extractDomain({
  startMarker: '// === LYANN SINGLE SOURCE OF TRUTH DEFAULT USER AVATAR ===',
  endMarker: '// === PENDING ACTIONS FINDER FOR MOBILE DASHBOARD ===',
  outputFile: 'platform-core.js',
  banner: '/** LYANN platform core — extracted from legacy script.js without behavior changes. */'
});

extractDomain({
  startMarker: '// === NOTIFICATIONS MODAL & BADGE SYSTEM ===',
  endMarker: '// === APP WELCOME SCREEN (GUEST MODE / ONBOARDING / LOGIN) ===',
  outputFile: 'notifications-ui.js',
  banner: '/** LYANN notifications UI — extracted from legacy script.js without behavior changes. */'
});

extractDomain({
  startMarker: '// === PENDING ACTIONS FINDER FOR MOBILE DASHBOARD ===',
  endMarker: '// === APP HOME V1 CONNECTED VIEW RENDERER (APP NATIVE ONLY) ===',
  outputFile: 'app-shell.js',
  banner: '/** LYANN application shell — extracted from legacy script.js without behavior changes. */'
});

if (changes.length) {
  fs.writeFileSync(scriptPath, source, 'utf8');
}

// Remove historical placeholder avatar usage from the extracted shell. The shell now
// uses the shared default-avatar contract until the authenticated profile is available.
const appShellPath = path.join(root, 'app-shell.js');
if (fs.existsSync(appShellPath)) {
  let shell = fs.readFileSync(appShellPath, 'utf8');
  const normalized = shell
    .replace('src="david-34.png" alt="Mon Profil"', 'src="${window.getLyannDefaultAvatar ? window.getLyannDefaultAvatar() : \'\'}" alt="Mon Profil"')
    .replace("openChatWithUser(contact, 'david-34.png');", "openChatWithUser(contact, window.getLyannDefaultAvatar ? window.getLyannDefaultAvatar() : '');");
  if (normalized !== shell) {
    fs.writeFileSync(appShellPath, normalized, 'utf8');
    changes.push('normalize app shell avatar fallback');
  }
}

const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
for (const file of htmlFiles) {
  const filePath = path.join(root, file);
  let html = fs.readFileSync(filePath, 'utf8');
  if (!html.includes('<script src="script.js')) continue;

  const requiredScripts = [
    'platform-core.js',
    'notifications-ui.js',
    'app-shell.js'
  ];

  for (const src of requiredScripts) {
    if (html.includes(`<script src="${src}"></script>`)) continue;
    const currentScriptIndex = html.indexOf('<script src="script.js');
    const currentLineStart = html.lastIndexOf('\n', currentScriptIndex) + 1;
    const currentIndent = html.slice(currentLineStart, currentScriptIndex);
    html = html.slice(0, currentLineStart) + `${currentIndent}<script src="${src}"></script>\n` + html.slice(currentLineStart);
    changes.push(`wire ${src} into ${file}`);
  }

  fs.writeFileSync(filePath, html, 'utf8');
}

if (!changes.length) {
  console.log('Script domain extraction already applied; no changes.');
} else {
  console.log(`Applied script domain extraction: ${changes.join(', ')}`);
}
