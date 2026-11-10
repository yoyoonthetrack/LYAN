'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const bienvenue = read('bienvenue.html');
const css = read('native-guest-premium.css');
const guestStart = bienvenue.indexOf('id="nativeGuestHome"');
const guestEnd = bienvenue.indexOf('id="nativeGuestAuthSheet"');
const guest = bienvenue.slice(guestStart, guestEnd);

assert.match(bienvenue, /native-guest-premium-v1/);
assert.match(bienvenue, /assets\/brand\/lyann-symbol\.png/);
assert.match(bienvenue, /assets\/brand\/lyann-wordmark\.png/);
assert.equal((guest.match(/class="native-guest-slide native-guest-premium"/g) || []).length, 5, 'five premium slides');

const titles = [
    'Des talents et des pros près de chez vous',
    'Votre savoir-faire a sa place ici',
    'Paiement sécurisé, mission sereine',
    'La confiance au cœur de LYANN',
    'Explorez votre île, votre quartier, autrement'
];
titles.forEach((t) => assert.ok(guest.includes(t), 'title: ' + t));

assert.match(guest, /id="btnNativeJoin"[^>]*>Créer mon compte</);
assert.match(guest, /id="btnNativeLogin"[^>]*>Se connecter</);
assert.doesNotMatch(guest, /Profil vérifié/, 'no verified profile badge on slides');
assert.match(guest, /Une lyanneuse sérieuse et professionnelle/);
assert.ok(!/native-guest-login-slide/.test(guest), 'login is not a 6th slide');
assert.match(bienvenue, /id="nativeGuestAuthSheet"/);
assert.match(css, /#F7F2E8/);
assert.match(css, /\.ngp-title/);

console.log('onboarding-premium contract ok');
