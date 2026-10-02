#!/usr/bin/env node
// Builds vendor/phosphor/phosphor.css with only the icons used by the app.
// Usage: node scripts/build-phosphor-subset.js <path to @phosphor-icons/web/src>
// Re-run after adding an icon that is not yet in the subset.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = process.argv[2] || path.join(root, 'node_modules/@phosphor-icons/web/src');
const outDir = path.join(root, 'vendor/phosphor');
const weights = [
  { dir: 'regular', file: 'Phosphor', family: 'Phosphor', cls: 'ph' },
  { dir: 'bold', file: 'Phosphor-Bold', family: 'Phosphor-Bold', cls: 'ph-bold' },
  { dir: 'fill', file: 'Phosphor-Fill', family: 'Phosphor-Fill', cls: 'ph-fill' }
];
const notIcons = new Set(['ph-bold', 'ph-fill', 'ph-light', 'ph-thin', 'ph-duotone']);

const scanned = fs.readdirSync(root).filter((f) => /\.(html|js)$/.test(f));
const used = new Set();
for (const file of scanned) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of text.matchAll(/\bph-[a-z0-9]+(?:-[a-z0-9]+)*/g)) {
    if (!notIcons.has(match[0])) used.add(match[0]);
  }
}

fs.mkdirSync(outDir, { recursive: true });
const base = `font-style:normal;font-weight:normal;font-variant:normal;text-transform:none;line-height:1;letter-spacing:0;-webkit-font-feature-settings:"liga";font-feature-settings:"liga";-webkit-font-variant-ligatures:discretionary-ligatures;font-variant-ligatures:discretionary-ligatures;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;`;
let css = '';
let count = 0;
for (const w of weights) {
  fs.copyFileSync(path.join(source, w.dir, `${w.file}.woff2`), path.join(outDir, `${w.file}.woff2`));
  css += `@font-face{font-family:"${w.family}";src:url("./${w.file}.woff2") format("woff2");font-weight:normal;font-style:normal;font-display:block}\n`;
  css += `.${w.cls}{font-family:"${w.family}"!important;speak:never;${base}}\n`;
  const sheet = fs.readFileSync(path.join(source, w.dir, 'style.css'), 'utf8');
  const rule = new RegExp(`\\.${w.cls.replace('-', '\\-')}\\.(ph-[a-z0-9-]+):before\\s*\\{\\s*content:\\s*("[^"]+");\\s*\\}`, 'g');
  for (const m of sheet.matchAll(rule)) {
    if (!used.has(m[1])) continue;
    css += `.${w.cls}.${m[1]}:before{content:${m[2]}}\n`;
    count += 1;
  }
}
fs.writeFileSync(path.join(outDir, 'phosphor.css'), css);
console.log(`phosphor.css: ${count} rules, ${used.size} names scanned, ${Buffer.byteLength(css)} bytes`);
