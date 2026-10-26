'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { deleteMemberAccount, RETAINED } = require('../api/account-deletion');

function adminFor(store) {
    return {
        from(table) {
            const op = { patch: null };
            const chain = {
                update(patch) {
                    op.patch = patch;
                    return chain;
                },
                insert(row) {
                    store.inserts.push({ table, row });
                    return Promise.resolve({ error: null });
                },
                eq(key, value) {
                    if (table === 'profiles' && op.patch && Object.prototype.hasOwnProperty.call(op.patch, 'bio')) {
                        return Promise.resolve({ error: { message: "Could not find the 'bio' column of 'profiles'" } });
                    }
                    store.updates.push({ table, patch: op.patch, key, value });
                    return Promise.resolve({ error: null });
                }
            };
            return chain;
        },
        storage: {
            from(bucket) {
                return {
                    async list() {
                        return { data: [{ name: 'photo.jpg', id: 'file-1' }], error: null };
                    },
                    async remove(paths) {
                        store.removed.push(...paths.map((item) => bucket + ':' + item));
                        return { error: null };
                    }
                };
            }
        },
        auth: {
            admin: {
                async signOut(id, scope) {
                    store.signOut = { id, scope };
                    return { error: null };
                },
                async deleteUser(id) {
                    store.deleted = id;
                    return { error: null };
                },
                async updateUserById() {
                    return { error: null };
                }
            }
        }
    };
}

test('account deletion anonymizes, revokes, removes personal media and keeps financial records', async () => {
    const store = { updates: [], inserts: [], removed: [], signOut: null, deleted: null };
    const result = await deleteMemberAccount(adminFor(store), 'user-1', 'jwt-1');
    assert.equal(result.ok, true);
    assert.equal(result.sessions, 'revoked');
    assert.equal(store.deleted, 'user-1');
    assert.equal(store.signOut.id, 'jwt-1');
    assert.equal(store.signOut.scope, 'global');
    const profile = store.updates.find((row) => row.table === 'profiles');
    assert.equal(profile.patch.first_name, 'Compte');
    assert.equal(profile.patch.email, null);
    assert.equal(Object.prototype.hasOwnProperty.call(profile.patch, 'bio'), false);
    const push = store.updates.find((row) => row.table === 'device_push_tokens');
    assert.equal(push.patch.active, false);
    assert.deepEqual(store.removed, [
        'avatars:user-1/photo.jpg',
        'bokantaj-media:user-1/photo.jpg',
        'bokantaj-media-hold:user-1/photo.jpg'
    ]);
    assert.ok(result.retained.includes('payments'));
    assert.deepEqual(result.retained, RETAINED);
    const audit = store.inserts.find((row) => row.table === 'admin_audit_events');
    assert.equal(audit.row.action, 'ACCOUNT_DELETED');
    assert.equal(audit.row.metadata.media_removed, 3);
});
