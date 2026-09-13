const fs = require('fs');
const file = 'script.js';
let source = fs.readFileSync(file, 'utf8');
const before = source;

const replacements = [
  [
    'class="drawer-profile-link" onclick="event.preventDefault(); window.closeLyannHamburgerDrawer(); window.openPublicProfileModal();"',
    'class="drawer-profile-link" data-lyann-route="profile"'
  ],
  [
    'class="drawer-direct-link" onclick="event.preventDefault(); window.closeLyannHamburgerDrawer(); window.openAccountModalSubView(\'account\');"',
    'class="drawer-direct-link" data-lyann-route="account"'
  ],
  [
    'class="drawer-direct-link" onclick="event.preventDefault(); window.closeLyannHamburgerDrawer(); window.openAccountModalSubView(\'activity\');"',
    'class="drawer-direct-link" data-lyann-route="activity"'
  ],
  [
    'class="drawer-direct-link" onclick="event.preventDefault(); window.closeLyannHamburgerDrawer(); window.openAccountModalSubView(\'favorites\');"',
    'class="drawer-direct-link" data-lyann-route="favorites"'
  ],
  [
    'class="drawer-direct-link" onclick="event.preventDefault(); window.closeLyannHamburgerDrawer(); window.openAccountModalSubView(\'finances\');"',
    'class="drawer-direct-link" data-lyann-route="finances"'
  ],
  [
    'class="drawer-direct-link" onclick="event.preventDefault(); window.closeLyannHamburgerDrawer(); window.openAccountModalSubView(\'settings\');"',
    'class="drawer-direct-link" data-lyann-route="settings"'
  ],
  ['href="how-it-works.html" class="drawer-sub-link"', 'href="#" class="drawer-sub-link" data-lyann-route="help"'],
  ['href="about.html" class="drawer-sub-link"', 'href="#" class="drawer-sub-link" data-lyann-route="about"']
];

for (const [from, to] of replacements) source = source.split(from).join(to);

if (source === before) {
  console.log('Drawer already uses canonical router.');
  process.exit(0);
}

fs.writeFileSync(file, source, 'utf8');
console.log('Migrated hamburger drawer navigation to LYANN_ROUTER routes.');
