'use strict';

const PERSONAL_BUCKETS = Object.freeze(['avatars', 'bokantaj-media', 'bokantaj-media-hold']);
const RETAINED = Object.freeze([
    'payments',
    'quotes',
    'milestones',
    'missions',
    'invoices',
    'chat-attachments',
    'report-evidence'
]);

function columnFromSchemaError(message) {
    const text = String(message || '');
    const quoted = text.match(/'([a-z_]+)' column/i) || text.match(/column "([a-z_]+)"/i);
    return quoted ? quoted[1] : '';
}

async function anonymizeProfile(admin, userId) {
    const patch = {
        first_name: 'Compte',
        last_name: 'supprimé',
        email: null,
        phone: null,
        city: null,
        avatar_url: null,
        bio: null
    };
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const result = await admin.from('profiles').update({ ...patch }).eq('id', userId);
        if (!result.error) return { ok: true, fields: Object.keys(patch) };
        const missing = columnFromSchemaError(result.error.message);
        if (!missing || !Object.prototype.hasOwnProperty.call(patch, missing) || missing === 'first_name' || missing === 'last_name') {
            return { ok: false, error: result.error.message || 'profile' };
        }
        delete patch[missing];
    }
    return { ok: false, error: 'profile' };
}

async function removePersonalMedia(admin, userId) {
    const removed = [];
    const errors = [];
    for (const bucket of PERSONAL_BUCKETS) {
        const storage = admin.storage.from(bucket);
        const listed = await storage.list(userId, { limit: 100 });
        if (listed.error) {
            errors.push(bucket);
            continue;
        }
        const paths = (listed.data || [])
            .filter((entry) => entry && entry.name && entry.id)
            .map((entry) => userId + '/' + entry.name);
        if (!paths.length) continue;
        const cleared = await storage.remove(paths);
        if (cleared.error) errors.push(bucket);
        else removed.push(...paths.map((item) => bucket + ':' + item));
    }
    return { removed, errors };
}

async function deleteMemberAccount(admin, userId, accessToken) {
    const profile = await anonymizeProfile(admin, userId);
    const push = await admin.from('device_push_tokens').update({
        active: false,
        updated_at: new Date().toISOString()
    }).eq('user_id', userId);
    const media = await removePersonalMedia(admin, userId);
    let sessions = 'unavailable';
    if (accessToken && admin.auth && admin.auth.admin && typeof admin.auth.admin.signOut === 'function') {
        const signed = await admin.auth.admin.signOut(accessToken, 'global');
        sessions = signed && signed.error ? 'partial' : 'revoked';
    }
    let audit = false;
    try {
        const inserted = await admin.from('admin_audit_events').insert({
            actor_type: 'SYSTEM',
            actor_id: userId,
            actor_name: 'Compte supprimé',
            action: 'ACCOUNT_DELETED',
            module_name: 'Compte',
            target_type: 'profile',
            target_id: userId,
            metadata: {
                retained: RETAINED,
                media_removed: media.removed.length,
                sessions
            },
            created_at: new Date().toISOString()
        });
        audit = !inserted.error;
    } catch (_) {
        audit = false;
    }
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) {
        await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
        return {
            ok: true,
            closed: true,
            profile,
            push: !push.error,
            media,
            sessions,
            audit,
            retained: RETAINED
        };
    }
    return {
        ok: true,
        closed: false,
        profile,
        push: !push.error,
        media,
        sessions,
        audit,
        retained: RETAINED
    };
}

module.exports = {
    PERSONAL_BUCKETS,
    RETAINED,
    columnFromSchemaError,
    anonymizeProfile,
    removePersonalMedia,
    deleteMemberAccount
};
