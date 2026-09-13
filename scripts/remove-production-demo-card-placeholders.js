const fs = require('fs');

const files = ['feed.html', 'results.html'];
let changed = false;

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after = before;

  after = after.replace(
    /<input type="text" class="modal-input" placeholder="4242 4242 4242 4242" required style="width: 100%; box-sizing: border-box;" placeholder="Numéro de carte">/g,
    '<input type="text" class="modal-input" autocomplete="cc-number" inputmode="numeric" required style="width: 100%; box-sizing: border-box;" placeholder="Numéro de carte">'
  );

  after = after.replace(
    /<input type="text" class="modal-input" placeholder="MM\/AA" required style="width: 100%; box-sizing: border-box;" placeholder="MM\/AA">/g,
    '<input type="text" class="modal-input" autocomplete="cc-exp" inputmode="numeric" required style="width: 100%; box-sizing: border-box;" placeholder="MM/AA">'
  );

  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    changed = true;
    console.log(`Cleaned production payment placeholders in ${file}`);
  }
}

if (!changed) console.log('Payment placeholders already clean.');
