const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const changes = [];

function update(file, transform) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) return;
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(filePath, after, 'utf8');
    changes.push(file);
  }
}

update('feed.html', (html) => {
  if (!html.includes('<script src="session-store.js"></script>')) {
    throw new Error('feed.html: session-store.js must exist before auth normalization');
  }
  if (!html.includes('<script src="auth-state.js"></script>')) {
    html = html.replace(
      '<script src="session-store.js"></script>',
      '<script src="session-store.js"></script>\n    <script src="auth-state.js"></script>'
    );
  }
  return html;
});

update('app-shell.js', (source) => {
  const staleAuthSource = "document.body.classList.contains('user-is-logged-in') || localStorage.getItem('lyan_user_logged_in') === 'true'";
  source = source.replace(staleAuthSource, "window.LYANN_AUTH_STATE ? window.LYANN_AUTH_STATE.isAuthenticated() : document.body.classList.contains('user-is-logged-in')");

  const dashboardStart = 'async function initMobileHomeDashboard() {\n';
  if (source.includes(dashboardStart) && !source.includes("async function initMobileHomeDashboard() {\n    if (window.LYANN_AUTH_STATE)")) {
    source = source.replace(
      dashboardStart,
      "async function initMobileHomeDashboard() {\n    if (window.LYANN_AUTH_STATE) {\n        try { await window.LYANN_AUTH_STATE.ready(); } catch (e) {}\n    }\n"
    );
  }

  const injectStart = 'function injectMobileInterface() {\n';
  if (source.includes(injectStart) && !source.includes("async function injectMobileInterface() {\n    if (window.LYANN_AUTH_STATE)")) {
    source = source.replace(
      injectStart,
      "async function injectMobileInterface() {\n    if (window.LYANN_AUTH_STATE) {\n        try { await window.LYANN_AUTH_STATE.ready(); } catch (e) {}\n    }\n"
    );
  }

  return source;
});

if (!changes.length) console.log('Auth state normalization already applied; no changes.');
else console.log(`Applied auth state normalization: ${changes.join(', ')}`);
