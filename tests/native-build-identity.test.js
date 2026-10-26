const test = require('node:test');
const assert = require('node:assert/strict');
const { nativeBuildIdentity } = require('../shared-html-build');

test('a native build identity names the commit, version, backend and Supabase project', () => {
  const identity = nativeBuildIdentity({
    LYANN_NATIVE_BUILD_ID: 'ios-rc-1',
    LYANN_NATIVE_BUILD_AT: '2026-10-26T18:00:00.000Z',
    LYANN_NATIVE_GIT_SHA: 'abc123',
    LYANN_APP_VERSION: '1.0',
    LYANN_SUPABASE_LOCK: 'tdktfbtqceldlaeqjtow',
    backend: 'https://staging-bokantaj.lyann.app'
  });
  assert.deepEqual(identity, {
    id: 'ios-rc-1',
    at: '2026-10-26T18:00:00.000Z',
    sha: 'abc123',
    version: '1.0',
    supabase: 'tdktfbtqceldlaeqjtow',
    backend: 'https://staging-bokantaj.lyann.app'
  });
});

test('an identity never invents a Supabase project or a backend', () => {
  const identity = nativeBuildIdentity({});
  assert.equal(identity.supabase, '');
  assert.equal(identity.backend, '');
  assert.equal(identity.sha, '');
  assert.equal(identity.version, '1.0');
});
