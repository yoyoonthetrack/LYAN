const fs = require('fs');
const path = 'script.js';
let source = fs.readFileSync(path, 'utf8');
const before = source;

// Remove obsolete build probe logs/markers from the stabilization branch.
source = source.replace(/^console\.log\("\[LYANN_NATIVE_BUILD\][^\n]*\nwindow\.__LYANN_NATIVE_BUILD__[^\n]*\n/m, '');

// Retire the temporary trace engine while preserving the public helper as a no-op
// until all historical call sites have been removed domain-by-domain.
const start = source.indexOf('// === LYANN TEMPORARY RUNTIME DIAGNOSTICS & TRACE ENGINE ===');
const end = source.indexOf('// === CAPACITOR MOBILE DETECTOR & DYNAMIC BRIDGE INJECTION ===');
if (start !== -1 && end > start) {
  source = source.slice(0, start) +
    '// Runtime tracing retired after architecture stabilization.\n' +
    'function logLyannTrace() {}\n\n' +
    source.slice(end);
}

// Remove diagnostic writes from the platform detector; detection behavior itself stays unchanged.
source = source.replace(/\n\s*if \(window\.__LYANN_RUNTIME_DIAG__\) \{\n\s*window\.__LYANN_RUNTIME_DIAG__\.isNativePlatformResult = result;\n\s*\}/g, '');

if (source === before) {
  console.log('Runtime diagnostics already retired.');
  process.exit(0);
}
fs.writeFileSync(path, source, 'utf8');
console.log('Retired temporary runtime diagnostics from script.js');
