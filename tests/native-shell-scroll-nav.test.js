const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Contract of the iOS hotfix: scroll lock and member bar. The measured behaviour is in
// scripts/ios-scroll-nav-diagnostic.js (real WebKit); this guards the sources.
const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const css = read('style.css');
const shell = read('app-shell.js');
const router = read('app-router.js');
const explorer = read('explorer-ui.js');
const ux = read('explorer-annonces-ux.css');

// 1. The guest lock (overflow hidden + 100dvh) may only target the guest landing.
const rules = [...css.matchAll(/([^{}]*html\.is-native-shell\s+body:not\(\.user-is-logged-in\)[^{}]*)\{([^{}]*)\}/g)];
const lockRules = rules.filter(([, , body]) => /overflow\s*:\s*hidden/.test(body) || /height\s*:\s*100dvh/.test(body));
assert.ok(lockRules.length >= 1, 'guest landing lock must still exist');
lockRules.forEach(([, selector]) => {
    assert.match(selector, /:has\(#nativeGuestHome:not\(\[hidden\]\)\)/, 'a scroll lock for non logged-in users must be limited to the guest landing: ' + selector.trim());
});

// 2. The member bar is mounted again when the session arrives after the first pass.
assert.match(shell, /addEventListener\('lyann:auth-state'[\s\S]*isAuthenticated\(\)[\s\S]*injectMobileInterface\(\)/);
assert.match(shell, /!document\.querySelector\('\.mobile-bottom-nav'\)/);

// 3. The full-screen Carte lock is released when leaving the page, and not by the pageshow path.
assert.match(router, /function releaseMapMode\(\)[\s\S]*explorer-annonces-map-view/);
assert.match(router, /releasePageScrollLock\(\);\s*releaseMapMode\(\);/);
const pageshow = router.match(/addEventListener\('pageshow'[\s\S]*?\}\);/)[0];
assert.ok(!/releaseMapMode/.test(pageshow), 'pageshow must not cancel a legitimately open Carte');
assert.match(explorer, /addEventListener\('pagehide'[\s\S]*explorer-annonces-map-view/);

// 4. Carte geometry: the map container is a flex column, so the canvas gets the height, and it clears the bar.
assert.match(ux, /\.explorer-map:not\(\[hidden\]\) \{\s*[^}]*display: flex;[^}]*flex-direction: column;/);
assert.match(ux, /var\(--m-bottom-nav-height, 72px\)/);

console.log('native shell scroll and navigation contract passed');
