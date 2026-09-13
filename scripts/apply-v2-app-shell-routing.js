const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '..', 'app-shell.js');
let src = fs.readFileSync(file, 'utf8');

function required(regex, replacement, label) {
  if (!regex.test(src)) throw new Error(`App shell routing pattern missing: ${label}`);
  src = src.replace(regex, replacement);
}

required(
  /\/\/ === INTERFACE INJECTION ENTRY POINT ===\n\/\/ Global messaging modal opener\nwindow\.openLyannMessagesModal = function\(\) \{[\s\S]*?\n\};\n/,
`// === INTERFACE INJECTION ENTRY POINT ===
// Public navigation is owned by app-router.js. The messaging controller installs
// compatibility aliases after its own initialization; app-shell defines none.
`,
  'remove competing messaging opener'
);

required(
  /\n        \/\/ Tab "\+" \(Publier\) click[\s\S]*?\n        \/\/ Moi tab click[\s\S]*?\n        \}\n/,
`\n        // Navigation handlers are intentionally not bound here. app-router.js
        // owns Accueil / Explorer / Publier / Bokantaj / Messages consistently
        // on Web and Capacitor. app-shell only renders the native navigation UI.
`,
  'remove competing bottom navigation handlers'
);

src = src.replace(
  /window\.location\.href = `results\.html\?query=\$\{encodeURIComponent\(val\)\}`;/g,
  "if (window.LYANN_ROUTER) window.LYANN_ROUTER.go('explorer', { query: val }); else window.location.href = `results.html?query=${encodeURIComponent(val)}`;"
);

fs.writeFileSync(file, src, 'utf8');
console.log('App shell routing migration applied.');
