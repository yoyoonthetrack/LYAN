'use strict';

require('./force-staging-v2-env');

const { createClient } = require('@supabase/supabase-js');
const { resolveAdminAndJwt, STAGING_REF } = require('./admin-staging-real-session-lib');

const PRODUCTION_REF = 'gzispjfoywklpqatjyop';
const MARKER = `QA-BOK-HIDE-${Date.now()}`;
const API = process.env.LYANN_OPS_API || 'http://127.0.0.1:8398';

function assertStaging() {
    const url = process.env.SUPABASE_URL || '';
    if (!url.includes(STAGING_REF) || url.includes(PRODUCTION_REF)) {
        throw new Error('Refus : Staging tdktfbtqceldlaeqjtow uniquement.');
    }
}

function clients() {
    const url = process.env.SUPABASE_URL;
    return {
        admin: createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }),
        anon: createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    };
}

async function memberSession(email, password) {
    const { anon } = clients();
    const signed = await anon.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session) throw new Error(signed.error ? signed.error.message : 'Session membre impossible.');
    return {
        userId: signed.data.user.id,
        token: signed.data.session.access_token,
        client: createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${signed.data.session.access_token}` } }
        })
    };
}

async function publicIds(client, ids) {
    const { data, error } = await client
        .from('bokantaj_posts')
        .select('id, public_moderation_status')
        .in('id', ids)
        .eq('public_moderation_status', 'approved');
    if (error) throw new Error(error.message);
    return (data || []).map((row) => row.id);
}

async function publicComments(client, postId) {
    const { data, error } = await client
        .from('bokantaj_comments')
        .select('id, public_moderation_status, content')
        .eq('post_id', postId)
        .eq('public_moderation_status', 'approved');
    if (error) throw new Error(error.message);
    return data || [];
}

async function decide(token, subject, id, decision) {
    const res = await fetch(`${API}/v1/admin/moderation-center/content/${subject}/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ decision, reason: `${MARKER} ${decision}` })
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
}

(async () => {
    assertStaging();
    const report = { environment: 'staging', supabase_ref: STAGING_REF, marker: MARKER, ok: false };
    const identity = await fetch(`${API}/v1/runtime/identity`).then((res) => res.json()).catch(() => ({}));
    report.identity = { supabase_ref: identity.supabase_ref, isolation: identity.isolation };
    if (identity.supabase_ref && identity.supabase_ref !== STAGING_REF) throw new Error('API non isolée.');

    const { admin } = clients();
    const member = await memberSession(process.env.LYANN_E2E_QA_A_EMAIL, process.env.LYANN_E2E_QA_A_PASSWORD);
    const other = await memberSession(process.env.LYANN_E2E_QA_B_EMAIL, process.env.LYANN_E2E_QA_B_PASSWORD);
    const owner = await resolveAdminAndJwt();
    const anon = clients().anon;

    const inserted = await admin.from('bokantaj_posts').insert({
        author_id: member.userId,
        type: 'info',
        content: `${MARKER} publication publique temporaire`,
        city: 'Les Abymes',
        territory: 'guadeloupe'
    }).select('id, public_moderation_status').single();
    if (inserted.error || !inserted.data) throw new Error(inserted.error ? inserted.error.message : 'Insertion post impossible.');
    const postId = inserted.data.id;
    const approvePost = await decide(owner.jwt, 'post', postId, 'approved');
    if (!approvePost.json.success) throw new Error(approvePost.json.error || 'Approbation du post QA échouée.');
    const livePost = await admin.from('bokantaj_posts').select('id, public_moderation_status').eq('id', postId).single();
    report.post = { id: postId, status_before: livePost.data && livePost.data.public_moderation_status };

    const comment = await admin.from('bokantaj_comments').insert({
        post_id: postId,
        author_id: member.userId,
        content: `${MARKER} commentaire public temporaire`
    }).select('id, public_moderation_status').single();
    if (comment.error || !comment.data) throw new Error(comment.error ? comment.error.message : 'Insertion commentaire impossible.');
    const approveComment = await decide(owner.jwt, 'comment', comment.data.id, 'approved');
    if (!approveComment.json.success) throw new Error(approveComment.json.error || 'Approbation du commentaire QA échouée.');
    const liveComment = await admin.from('bokantaj_comments').select('id, public_moderation_status').eq('id', comment.data.id).single();
    report.comment = { id: comment.data.id, status_before: liveComment.data && liveComment.data.public_moderation_status };

    const hiddenExisting = await admin.from('bokantaj_posts').select('id').in('public_moderation_status', ['pending', 'rejected']).limit(20);
    const hiddenIds = (hiddenExisting.data || []).map((row) => row.id);
    const leakedExisting = hiddenIds.length ? await publicIds(anon, hiddenIds) : [];
    report.existing_hidden_absent = leakedExisting.length === 0;

    report.present_before_hide = {
        anon: (await publicIds(anon, [postId])).includes(postId),
        member: (await publicIds(member.client, [postId])).includes(postId),
        other: (await publicIds(other.client, [postId])).includes(postId),
        comments: (await publicComments(anon, postId)).some((row) => row.id === comment.data.id)
    };
    if (!report.present_before_hide.anon) throw new Error('Le post QA n’apparaissait pas avant masquage.');

    const hidePost = await decide(owner.jwt, 'post', postId, 'hide');
    const hideComment = await decide(owner.jwt, 'comment', comment.data.id, 'hide');
    report.hide = {
        post: { status: hidePost.status, ok: hidePost.json.success === true, visible: hidePost.json.visible },
        comment: { status: hideComment.status, ok: hideComment.json.success === true, visible: hideComment.json.visible }
    };
    if (!report.hide.post.ok || !report.hide.comment.ok) throw new Error('Masquage admin échoué.');

    const afterHide = await admin.from('bokantaj_posts').select('public_moderation_status').eq('id', postId).single();
    const commentAfterHide = await admin.from('bokantaj_comments').select('public_moderation_status').eq('id', comment.data.id).single();
    report.status_after_hide = {
        post: afterHide.data && afterHide.data.public_moderation_status,
        comment: commentAfterHide.data && commentAfterHide.data.public_moderation_status
    };

    report.absent_after_hide = {
        anon: !(await publicIds(anon, [postId])).includes(postId),
        member: !(await publicIds(member.client, [postId])).includes(postId),
        other: !(await publicIds(other.client, [postId])).includes(postId),
        comments: (await publicComments(anon, postId)).length === 0
    };
    if (!report.absent_after_hide.anon || !report.absent_after_hide.member || !report.absent_after_hide.other) {
        throw new Error('Le post masqué reste visible publiquement.');
    }
    if (!report.absent_after_hide.comments) throw new Error('Le commentaire masqué reste visible.');

    const restorePost = await decide(owner.jwt, 'post', postId, 'restore');
    const restoreComment = await decide(owner.jwt, 'comment', comment.data.id, 'restore');
    report.restore = {
        post: { status: restorePost.status, ok: restorePost.json.success === true, visible: restorePost.json.visible },
        comment: { status: restoreComment.status, ok: restoreComment.json.success === true, visible: restoreComment.json.visible }
    };
    if (!report.restore.post.ok || !report.restore.comment.ok) throw new Error('Restauration admin échouée.');

    const afterRestore = await admin.from('bokantaj_posts').select('public_moderation_status').eq('id', postId).single();
    report.status_after_restore = afterRestore.data && afterRestore.data.public_moderation_status;
    report.present_after_restore = {
        anon: (await publicIds(anon, [postId])).includes(postId),
        comments: (await publicComments(anon, postId)).some((row) => row.id === comment.data.id)
    };
    if (!report.present_after_restore.anon || !report.present_after_restore.comments) {
        throw new Error('La restauration n’a pas rendu le contenu public.');
    }

    report.ok = report.existing_hidden_absent
        && report.present_before_hide.anon
        && report.absent_after_hide.anon
        && report.present_after_restore.anon;
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exit(1);
})().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
