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

// First low-risk domain: platform/native helpers, avatar utilities and DOM commune data.
// These APIs are global function declarations today; keeping them in a classic script
// preserves the same window-visible runtime contract while reducing script.js ownership.
extractDomain({
  startMarker: '// === LYANN SINGLE SOURCE OF TRUTH DEFAULT USER AVATAR ===',
  endMarker: '// === PENDING ACTIONS FINDER FOR MOBILE DASHBOARD ===',
  outputFile: 'platform-core.js',
  banner: '/** LYANN platform core — extracted from legacy script.js without behavior changes. */'
});

// Second low-risk domain: notification presentation only. Data/notification engine stays
// untouched; this file owns the badge, modal and relative-time rendering surface.
extractDomain({
  startMarker: '// === NOTIFICATIONS MODAL & BADGE SYSTEM ===',
  endMarker: '// === APP WELCOME SCREEN (GUEST MODE / ONBOARDING / LOGIN) ===',
  outputFile: 'notifications-ui.js',
  banner: '/** LYANN notifications UI — extracted from legacy script.js without behavior changes. */'
});

// Third domain: native/mobile application shell. This owns the guest welcome screen,
// connected mobile dashboard, bottom navigation, central action sheet and message entry.
// Keeping it as a classic script preserves all global contracts while separating route/
// shell rendering from the legacy business-logic monolith.
extractDomain({
  startMarker: '// === PENDING ACTIONS FINDER FOR MOBILE DASHBOARD ===',
  endMarker: '// === APP HOME V1 CONNECTED VIEW RENDERER (APP NATIVE ONLY) ===',
  outputFile: 'app-shell.js',
  banner: '/** LYANN application shell — extracted from legacy script.js without behavior changes. */'
});

if (changes.length) {
  fs.writeFileSync(scriptPath, source, 'utf8');
}

// Preserve behavior across every web page that loads legacy script.js, not only feed.html.
// Classic scripts are intentionally used during migration so existing globals keep working.
const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
for (const file of htmlFiles) {
  const filePath = path.join(root, file);
  let html = fs.readFileSync(filePath, 'utf8');
  if (!html.includes('<script src="script.js')) continue;

  const scriptIndex = html.indexOf('<script src="script.js');
  const lineStart = html.lastIndexOf('\n', scriptIndex) + 1;
  const indent = html.slice(lineStart, scriptIndex);
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
