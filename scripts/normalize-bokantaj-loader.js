const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const scriptPath = path.join(root, 'script.js');
const feedPath = path.join(root, 'feed.html');

let script = fs.readFileSync(scriptPath, 'utf8');
let feed = fs.readFileSync(feedPath, 'utf8');
let changed = false;

const startMarker = "    window.loadBokantajFeedFromSupabase = async function() {";
const endMarker = "    // Initial feed trigger";
let start = script.indexOf(startMarker);
let end = script.indexOf(endMarker, Math.max(0, start));

const alreadyNormalized = script.includes('window.loadBokantajFeedFromSupabase = async function(options = {})') &&
  script.includes('window.LYANN_BOKANTAJ_REPOSITORY.load({ force: options.force === true })');

if (!alreadyNormalized && (start === -1 || end === -1 || end <= start)) {
  throw new Error('Bokantaj loader markers not found');
}

const replacement = `    window.loadBokantajFeedFromSupabase = async function(options = {}) {\n        console.log("[BOKANTAJ] init start");\n        bokantajFeedState = 'LOADING';\n        renderFlashFeed();\n\n        const isExplicitDemoMode = typeof window !== 'undefined' && (\n            window.LYANN_FORCE_DEMO_DATA === true ||\n            (window.location && window.location.search && (\n                window.location.search.includes('demo=true') ||\n                window.location.search.includes('dev_fixtures=true')\n            ))\n        );\n\n        try {\n            if (!window.LYANN_BOKANTAJ_REPOSITORY) {\n                throw new Error('LYANN_BOKANTAJ_REPOSITORY is not available');\n            }\n\n            const data = await window.LYANN_BOKANTAJ_REPOSITORY.load({ force: options.force === true });\n            currentFlashPosts = Array.isArray(data) ? data : [];\n            bokantajFeedState = currentFlashPosts.length === 0 ? 'EMPTY' : 'READY';\n        } catch (err) {\n            console.error("[BOKANTAJ] Error during load:", err);\n            if (isExplicitDemoMode) {\n                currentFlashPosts = [...INITIAL_FLASH_POSTS];\n                bokantajFeedState = currentFlashPosts.length === 0 ? 'EMPTY' : 'READY';\n            } else {\n                currentFlashPosts = [];\n                bokantajFeedState = 'ERROR';\n            }\n        } finally {\n            renderFlashFeed();\n            window.renderTalentsSidebar(isExplicitDemoMode);\n        }\n    };\n\n`;

if (!alreadyNormalized) {
  const currentBlock = script.slice(start, end);
  if (!currentBlock.includes('LYANN_BOKANTAJ_REPOSITORY')) {
    script = script.slice(0, start) + replacement + script.slice(end);
    fs.writeFileSync(scriptPath, script, 'utf8');
    changed = true;
  }
}

const scriptTag = '    <script src="bokantaj-repository.js"></script>\n';
if (!feed.includes('<script src="bokantaj-repository.js"></script>')) {
  const anchor = '    <script src="profile-repository.js"></script>\n';
  if (!feed.includes(anchor)) throw new Error('profile-repository feed anchor not found');
  feed = feed.replace(anchor, anchor + scriptTag);
  fs.writeFileSync(feedPath, feed, 'utf8');
  changed = true;
}

console.log(changed ? 'Normalized Bokantaj loading through shared repository.' : 'Bokantaj loader already normalized.');
