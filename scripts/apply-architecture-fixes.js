const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const feedPath = path.join(root, 'feed.html');

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first === -1) return { source, changed: false, skipped: true, label };
  if (source.indexOf(needle, first + needle.length) !== -1) {
    throw new Error(`${label}: expected exactly one match`);
  }
  return {
    source: source.slice(0, first) + replacement + source.slice(first + needle.length),
    changed: true,
    skipped: false,
    label
  };
}

if (!fs.existsSync(feedPath)) {
  throw new Error('feed.html not found');
}

let html = fs.readFileSync(feedPath, 'utf8');
const changes = [];

// 1) Repair the malformed modal hierarchy. The filter sheet must be a sibling
// of lyannDetailModal, never a child of its hidden overlay.
{
  const needle = `            </div>\n        </div>\n    <!-- ========== BOTTOM SHEET FILTRES BOKANTAJ ========== -->`;
  const replacement = `            </div>\n        </div>\n    </div>\n\n    <!-- ========== BOTTOM SHEET FILTRES BOKANTAJ ========== -->`;
  const result = replaceOnce(html, needle, replacement, 'close lyannDetailModal');
  html = result.source;
  if (result.changed) changes.push(result.label);
}

// 2) The app boot scripts were located before DOM surfaces declared later in
// the file. Move the whole application script block to the end of <body> so
// every declared UI node exists before feature boot code runs.
{
  const startMarker = '    <script src="ai-agents.js"></script>\n';
  const endMarker = '    <script src="profile-completion.js"></script>\n';
  const start = html.indexOf(startMarker);
  const endStart = html.indexOf(endMarker, start);
  if (start !== -1 && endStart !== -1) {
    const end = endStart + endMarker.length;
    const block = html.slice(start, end);
    const bodyClose = html.lastIndexOf('</body>');
    if (bodyClose === -1) throw new Error('feed.html missing </body>');

    const profileModal = html.indexOf('id="modalCompleteProfile"');
    if (profileModal !== -1 && start < profileModal) {
      html = html.slice(0, start) + html.slice(end);
      const nextBodyClose = html.lastIndexOf('</body>');
      html = html.slice(0, nextBodyClose) + `\n${block}\n` + html.slice(nextBodyClose);
      changes.push('move application scripts after UI DOM');
    }
  }
}

// 3) Centralize session and short-lived profile cache before feature scripts.
if (!html.includes('<script src="session-store.js"></script>')) {
  const apiScript = '    <script src="api-client.js?v=20260907-DOM-OBSERVER-FIX"></script>\n';
  const replacement = `${apiScript}    <script src="session-store.js"></script>\n    <script src="data-cache.js"></script>\n`;
  const result = replaceOnce(html, apiScript, replacement, 'install shared session and data cache');
  html = result.source;
  if (result.changed) changes.push(result.label);
}

// 4) Stripe.js is not part of Bokantaj's critical rendering path.
{
  const stripeTag = '    <script src="https://js.stripe.com/v3/"></script>\n';
  if (html.includes(stripeTag)) {
    html = html.replace(stripeTag, '');
    changes.push('remove eager Stripe SDK from Bokantaj boot');
  }
}

// 5) Safety, subscriptions and PRO verification are deep feature engines, not
// prerequisites for first paint, filter interactions, profile rendering or the
// Bokantaj feed. Route them through the shared loader and warm them only once
// the browser is idle. This preserves availability without blocking startup.
{
  const optionalTags = [
    '    <script src="safety-disputes-engine.js"></script>\n',
    '    <script src="subscriptions-engine.js"></script>\n',
    '    <script src="pro-verification-engine.js"></script>\n'
  ];
  let removed = false;
  for (const tag of optionalTags) {
    if (html.includes(tag)) {
      html = html.replace(tag, '');
      removed = true;
    }
  }

  if (!html.includes('<script src="feature-loader.js"></script>')) {
    const cacheTag = '    <script src="data-cache.js"></script>\n';
    const result = replaceOnce(
      html,
      cacheTag,
      `${cacheTag}    <script src="feature-loader.js"></script>\n`,
      'install deferred feature loader'
    );
    html = result.source;
    if (result.changed) changes.push(result.label);
  }

  if (removed) changes.push('defer non-critical safety/subscription/pro engines');
}

if (!changes.length) {
  console.log('Architecture source fixes already applied; no changes.');
  process.exit(0);
}

fs.writeFileSync(feedPath, html, 'utf8');
console.log(`Applied architecture fixes: ${changes.join(', ')}`);
