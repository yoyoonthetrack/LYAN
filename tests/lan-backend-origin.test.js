'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../api-client.js'), 'utf8');
const start = source.indexOf('function isLoopbackHttpOrigin');
const end = source.indexOf('function lyannBackendFetch');
assert.ok(start >= 0 && end > start, 'backend origin helpers must exist');
const helpers = source.slice(start, end);

function originFor(hostname, injected, native) {
    const window = {
        location: { protocol: 'http:', hostname, origin: 'http://' + hostname + ':8098' },
        Capacitor: native ? { isNativePlatform: () => true } : undefined
    };
    const ctx = {
        window,
        console,
        isCapacitorRuntime: () => !!native,
        resolveLyannClientBinding: () => ({ ok: true, backendOrigin: injected })
    };
    vm.createContext(ctx);
    vm.runInContext(helpers + '\nthis.result = getLyannBackendOrigin();', ctx);
    return ctx.result;
}

test('LAN web pages do not call the loopback payment API', () => {
    assert.equal(
        originFor('192.168.1.27', 'http://127.0.0.1:8098', false),
        'http://192.168.1.27:8098'
    );
    assert.equal(
        originFor('10.0.0.12', 'http://localhost:8098', false),
        'http://10.0.0.12:8098'
    );
});

test('loopback web and Capacitor keep their existing origin rules', () => {
    assert.equal(originFor('127.0.0.1', 'http://127.0.0.1:8098', false), 'http://127.0.0.1:8098');
    assert.equal(originFor('localhost', 'http://127.0.0.1:8098', true), '');
});
