const fs = require('fs');

const files = ['feed.html', 'results.html'];
const replacements = [
  ['id="publicMemberRoleBadge">🛠️ Artisan Plombier</span>', 'id="publicMemberRoleBadge">Profil LYANN</span>'],
  ['id="publicMemberLocationText"><i class="ph ph-map-pin"></i> Baie-Mahault, Guadeloupe (971)</div>', 'id="publicMemberLocationText"><i class="ph ph-map-pin"></i> Localisation</div>'],
  ['id="recommendCountBadge">142</span>', 'id="recommendCountBadge">—</span>'],
  ['id="publicReviewsCount">48</span>', 'id="publicReviewsCount">—</span>'],
  ['id="publicMemberBioText">Spécialiste de la plomberie résidentielle et du dépannage d\'urgence sur Baie-Mahault et Grande-Terre.</p>', 'id="publicMemberBioText">Chargement du profil…</p>'],
  ['id="publicMemberRate">À partir de 35€/h</strong>', 'id="publicMemberRate">—</strong>'],
  ['id="publicMemberBadge">✔ Artisan Vérifié</strong>', 'id="publicMemberBadge">—</strong>'],
  ['id="quickProfileRole" style="font-size: 0.88rem; opacity: 0.9;">Plomberie & Clim Inverter</div>', 'id="quickProfileRole" style="font-size: 0.88rem; opacity: 0.9;">Profil LYANN</div>'],
  ['id="quickProfileCity" style="font-size: 0.8rem; opacity: 0.85; margin-top: 4px;"><i class="ph ph-map-pin"></i> Baie-Mahault, Guadeloupe (971)</div>', 'id="quickProfileCity" style="font-size: 0.8rem; opacity: 0.85; margin-top: 4px;"><i class="ph ph-map-pin"></i> Localisation</div>'],
  ['id="quickProfileBadge" class="pill-badge pill-green" style="font-size: 0.78rem;">Artisan Vérifié</span>', 'id="quickProfileBadge" class="pill-badge pill-green" style="font-size: 0.78rem;">Profil LYANN</span>'],
  ['id="quickProfileRating" style="font-weight: 800; color: #E8B83F;">⭐ 4.9 (48 avis)</span>', 'id="quickProfileRating" style="font-weight: 800; color: #E8B83F;">—</span>'],
  ['Plombier et technicien clim passionné à Baie-Mahault. Dépannage rapide de fuites d\'eau, entretien clim et chauffe-eau.', 'Chargement du profil…'],
  ['<span class="quick-skill-pill">Entretien Clim Inverter</span>\n                    <span class="quick-skill-pill">Détection de fuite</span>\n                    <span class="quick-skill-pill">Chauffe-eau</span>', ''],
  ['href="https://wa.me/590690001122?text=Bonjour%20!%20Nous%20sommes%20Lyann%C3%A9s%20sur%20LYANN%20DOM."', 'href="#"'],
  ['href="tel:+590690001122"', 'href="#"']
];

let changed = false;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  for (const [from, to] of replacements) after = after.split(from).join(to);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    console.log(`Neutralized static profile placeholders in ${file}`);
    changed = true;
  }
}
if (!changed) console.log('Static profile placeholders already neutralized.');
