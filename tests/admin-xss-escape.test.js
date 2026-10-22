'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

test('adminEscape encodes stored HTML in hydrateAdminSection payloads', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'admin-script.js'), 'utf8');
    assert.match(source, /window\.hydrateAdminSection[\s\S]*esc\(p\.first_name/);
    assert.match(source, /window\.hydrateAdminSection[\s\S]*esc\(row\.email/);
    assert.match(source, /window\.hydrateAdminSection[\s\S]*esc\(row\.excerpt/);
    assert.doesNotMatch(source, /__LYANN_ADMIN_E2E__/);
    const match = source.match(/window\.adminEscape = function\(value\) \{[\s\S]*?\n\};/);
    assert.ok(match);
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(match[0], sandbox);
    const esc = sandbox.window.adminEscape;
    const payload = `<img src=x onerror=alert(1)>`;
    const html = `<td>${esc(payload)}</td>`;
    assert.equal(html.includes('<img'), false);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('helpdesk and task panels escape operator-facing fields', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'admin-script.js'), 'utf8');
    assert.match(source, /adminEscape\(ticket\.subject\)/);
    assert.match(source, /adminEscape\(msg\.body\)/);
    assert.match(source, /adminEscape\(task\.instruction/);
    assert.doesNotMatch(source, /innerHTML = `\$\{ticket\.subject\}`/);
});

test('member helpdesk escapes ticket fields', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'member-helpdesk.js'), 'utf8');
    assert.match(source, /esc\(row\.subject\)/);
    assert.match(source, /esc\(msg\.body\)/);
    assert.doesNotMatch(source, /innerHTML = ticket\.subject/);
});
