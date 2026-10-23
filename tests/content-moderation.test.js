'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const moderation = require('../api/content-moderation');
const routes = require('../api/content-moderation-routes');

const root = path.join(__dirname, '..');
const sql = fs.readFileSync(path.join(root, '70_public_content_moderation.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(root, '70_public_content_moderation_rollback.sql'), 'utf8');
const cutover = fs.readFileSync(path.join(root, '70b_media_private_cutover.sql'), 'utf8');
const dialog = fs.readFileSync(path.join(root, 'dialog.js'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

function technicalPattern() {
    const match = dialog.match(/const LYANN_TECHNICAL_ERROR = (\/[\s\S]*?\/);/);
    assert.ok(match, 'sanitizer pattern');
    return eval(match[1]);
}

test('clear text is published and a high-confidence category is refused', () => {
    assert.deepEqual(moderation.decideModeration({
        flagged: false,
        categories: { harassment: false },
        category_scores: { harassment: 0.01, violence: 0.02 }
    }), { decision: 'approved', reason: 'clear' });

    const refused = moderation.decideModeration({
        flagged: true,
        categories: { 'sexual/minors': true },
        category_scores: { 'sexual/minors': 0.21, sexual: 0.1 }
    });
    assert.equal(refused.decision, 'rejected');
    assert.equal(refused.reason, 'sexual/minors');
});

test('a sexual image under the text threshold stays unpublished', () => {
    const held = moderation.decideModeration({
        flagged: false,
        categories: { sexual: false },
        category_scores: { sexual: 0.285, violence: 0.08 }
    }, { hasImage: true });
    assert.equal(held.decision, 'pending');
    assert.equal(held.reason, 'sexual');
    const textOnly = moderation.decideModeration({
        flagged: false,
        categories: { sexual: false },
        category_scores: { sexual: 0.285 }
    });
    assert.equal(textOnly.decision, 'approved');
});

test('an intermediate or flagged score waits, and a failed response never publishes', () => {
    const review = moderation.decideModeration({
        flagged: true,
        categories: { harassment: true },
        category_scores: { harassment: 0.55 }
    });
    assert.equal(review.decision, 'pending');
    assert.equal(moderation.decideModeration(null).decision, 'pending');
    assert.equal(moderation.decideModeration({ flagged: false }).decision, 'pending');
});

test('videos stay pending even when the accompanying text is acceptable', async () => {
    let called = 0;
    const decision = await moderation.classifyContent({
        text: 'Regarde cette réparation.',
        media: [{ bucket: 'bokantaj-media', path: 'user/clip.mp4' }],
        apiKey: 'test-key',
        fetchImpl: async () => {
            called += 1;
            return { ok: true, json: async () => ({ results: [{ flagged: false, categories: {}, category_scores: { harassment: 0.01 } }] }) };
        }
    });
    assert.equal(decision.decision, 'pending');
    assert.equal(decision.reason, 'video_unreviewed');
    assert.equal(called, 1);
});

test('a verified short MP4 with a clear poster is published, anything unverifiable waits', async () => {
    const clear = async () => ({
        ok: true,
        json: async () => ({ results: [{ flagged: false, categories: {}, category_scores: { harassment: 0.01 } }] })
    });
    const approved = await moderation.classifyContent({
        text: 'La route est dégagée.',
        media: [
            { bucket: 'bokantaj-media-hold', path: 'user/clip.mp4' },
            { bucket: 'bokantaj-media-hold', path: 'user/clip-poster.jpg' }
        ],
        apiKey: 'test-key',
        fetchImpl: clear,
        inspectVideo: async () => ({ verified: true, seconds: 12 }),
        downloadMedia: async () => ['data:image/jpeg;base64,aa']
    });
    assert.equal(approved.decision, 'approved');
    assert.equal(approved.reason, 'video_checked');
    const unverified = await moderation.classifyContent({
        text: 'La route est dégagée.',
        media: [{ bucket: 'bokantaj-media-hold', path: 'user/clip.mp4' }],
        apiKey: 'test-key',
        fetchImpl: clear,
        inspectVideo: async () => ({ verified: false, reason: 'duration_unreadable' })
    });
    assert.equal(unverified.decision, 'pending');
    assert.equal(unverified.reason, 'video_unverified');
});

test('classifier outage, missing key and unreadable image stay pending', async () => {
    const outage = await moderation.classifyContent({
        text: 'Bonjour',
        apiKey: 'test-key',
        fetchImpl: async () => { throw new Error('down'); }
    });
    const missing = await moderation.classifyContent({ text: 'Bonjour', apiKey: '', fetchImpl: async () => ({ ok: true }) });
    const image = await moderation.classifyContent({
        text: '',
        media: [{ bucket: 'bokantaj-media', path: 'user/photo.jpg' }],
        apiKey: 'test-key',
        fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
        downloadMedia: async () => null
    });
    assert.equal(outage.decision, 'pending');
    assert.equal(missing.decision, 'pending');
    assert.equal(image.reason, 'media_unreadable');
});

test('a public bucket remains fetchable before release, a private one does not', () => {
    assert.equal(moderation.objectIsPubliclyFetchable({ bucketPublic: true, releaseStatus: 'pending' }), true);
    assert.equal(moderation.objectIsPubliclyFetchable({ bucketPublic: false, releaseStatus: 'pending' }), false);
    assert.equal(moderation.objectIsPubliclyFetchable({ bucketPublic: false, releaseStatus: 'approved' }), false);
    assert.equal(moderation.mediaAccess({ status: 'pending', kind: 'image' }, 'bokantaj-media-hold', { id: 'author', ownerId: 'author' }), 'stream');
    assert.equal(moderation.mediaAccess({ status: 'pending', kind: 'video' }, 'bokantaj-media-hold'), 'hidden');
    assert.equal(moderation.mediaAccess({ status: 'approved', kind: 'image' }, 'bokantaj-media-hold'), 'stream');
    assert.equal(moderation.publicationNotice({ status: 'pending' }).message, 'Votre publication est en cours de vérification.');
    assert.equal(moderation.publicationNotice({ status: 'pending', hasImage: true }).message, 'Votre photo est en cours de vérification.');
    assert.equal(moderation.publicationNotice({ status: 'rejected' }).message, 'Ce contenu ne peut pas être publié.');
    assert.equal(moderation.publicationNotice({ status: 'approved' }).message, 'Votre publication est maintenant visible.');
    assert.equal(moderation.publicationNotice({ status: null }), null);
    const url = 'https://gzispjfoywklpqatjyop.supabase.co/storage/v1/object/public/bokantaj-media/user/photo.jpg';
    assert.equal(
        moderation.gatewayUrlForStorage(url, 'https://lyann.app'),
        'https://lyann.app/v1/media/bokantaj-media/user/photo.jpg'
    );
    assert.equal(moderation.mediaAccess({ status: 'pending', kind: 'image' }, 'bokantaj-media'), 'placeholder');
    assert.equal(moderation.mediaAccess({ status: 'pending', kind: 'video' }, 'bokantaj-media'), 'hidden');
    assert.equal(moderation.mediaAccess({ status: 'approved', kind: 'image' }, 'bokantaj-media'), 'stream');
    assert.equal(moderation.normalizeMedia([{ bucket: 'bokantaj-media', path: '../secret.jpg' }]).length, 0);
});

test('pending public rows are hidden from other people and from the explorer', () => {
    assert.equal(moderation.postVisibleTo({ status: 'pending', authorId: 'a', viewerId: 'b', isAdmin: false }), false);
    assert.equal(moderation.postVisibleTo({ status: 'pending', authorId: 'a', viewerId: 'a', isAdmin: false }), true);
    assert.equal(moderation.postVisibleTo({ status: 'approved', authorId: 'a', viewerId: null, isAdmin: false }), true);
    assert.equal(moderation.requestVisibleTo({
        status: 'approved', visibility: 'DIRECT', authorId: 'a', viewerId: 'c', targetId: 'b', isAdmin: false
    }), true);
    assert.equal(moderation.requestVisibleTo({
        status: 'pending', visibility: 'DIRECT', authorId: 'a', viewerId: 'c', targetId: 'b', isAdmin: false
    }), false);
    assert.equal(moderation.explorerRowIsPublic({
        visibility: 'PUBLIC', status: 'OPEN', target_user_id: null, public_moderation_status: 'pending'
    }), false);
    assert.equal(moderation.explorerRowIsPublic({
        visibility: 'PUBLIC', status: 'OPEN', target_user_id: null, public_moderation_status: null
    }), true);
});

test('migration grandfathers current rows, ignores client status, and leaves reports and messages alone', () => {
    assert.match(sql, /SET public_moderation_status = 'approved'/);
    assert.match(sql, /SET DEFAULT 'pending'/);
    assert.match(sql, /Ce contenu ne peut pas être publié\./);
    assert.match(sql, /Private messages are intentionally not sent/);
    assert.doesNotMatch(sql, /ON public\.messages/);
    assert.doesNotMatch(sql, /user_blocks|bokantaj_reports|user_reports/);
    assert.doesNotMatch(sql, /SET public = false|public = false/);
    assert.match(sql, /lyann\.media_gateway/);
    assert.match(sql, /ON CONFLICT \(bucket_id, object_name\) DO NOTHING/);
    assert.match(rollback, /intake_open = false/);
    assert.doesNotMatch(rollback, /FOR SELECT USING \(true\)/);
    assert.doesNotMatch(rollback, /DROP COLUMN IF EXISTS public_moderation_status/);
    assert.doesNotMatch(rollback, /UPDATE storage\.buckets/);
    assert.doesNotMatch(rollback, /DROP TRIGGER IF EXISTS trg_refuse_new_public_media/);
    assert.match(cutover, /Bascule des médias non autorisée/);
    const executableCutover = cutover.split('-- The transaction is aborted')[0];
    assert.doesNotMatch(executableCutover, /UPDATE storage\.buckets/);
    assert.equal(routes.secretMatches('', 'secret'), false);
    assert.equal(routes.secretMatches('secret', 'secret'), true);
});

test('build 9 can show a refusal sentence and still has no pending-state label', () => {
    const pattern = technicalPattern();
    const refusal = 'Ce contenu ne peut pas être publié.';
    assert.equal(pattern.test(refusal), false);
    assert.match(script, /err\.message \|\| "Veuillez vous connecter pour publier\."/);
    assert.match(script, /Votre publication est en cours de vérification\./);
    assert.match(script, /Votre photo est en cours de vérification\./);
    assert.match(script, /Ce contenu ne peut pas être publié\./);
    assert.match(script, /Votre publication est maintenant visible\./);
    assert.match(script, /Cette vidéo ne peut pas être lue sur cet appareil\./);
    const worker = fs.readFileSync(path.join(root, 'api/moderation-worker.js'), 'utf8');
    const hold = fs.readFileSync(path.join(root, '71_private_media_hold.sql'), 'utf8');
    assert.doesNotMatch(worker, /from\('messages'\)|public\.messages|stripe/i);
    assert.match(hold, /bokantaj-media-hold/);
    assert.doesNotMatch(hold, /UPDATE storage\.buckets SET public/);
    const routeSource = fs.readFileSync(path.join(root, 'api/content-moderation-routes.js'), 'utf8');
    assert.doesNotMatch(routeSource, /createSignedUrl/);
    assert.match(routeSource, /private, no-store/);
    assert.match(routeSource, /\/v1\/internal\/moderation\/run/);
    const vercel = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
    assert.match(vercel, /\/v1\/internal\/moderation\/run/);
    assert.match(vercel, /"maxDuration": 60/);
    assert.doesNotMatch(vercel, /OPENAI_API_KEY|MODERATION_WORKER_SECRET/);
    assert.equal(pattern.test('Erreur lors de la publication : ' + refusal), false);
});

test('the OpenAI key is not shipped in the public client or the moderation SQL', () => {
    for (const file of ['api-client.js', 'script.js', 'lyann-runtime-config.js', '70_public_content_moderation.sql']) {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        assert.doesNotMatch(source, /sk-[A-Za-z0-9]{20,}/);
        assert.doesNotMatch(source, /OPENAI_API_KEY\s*=\s*['"][^'"]+/);
    }
});

function localOpenAiKey() {
    if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
    for (const name of ['.env.local', '.env']) {
        const file = path.join(root, name);
        if (!fs.existsSync(file)) continue;
        const line = fs.readFileSync(file, 'utf8').split('\n').find((entry) => entry.startsWith('OPENAI_API_KEY='));
        if (!line) continue;
        return line.slice('OPENAI_API_KEY='.length).trim().replace(/^['"]|['"]$/g, '');
    }
    return '';
}

const liveKey = localOpenAiKey();

test('French and Creole everyday requests are not refused', { skip: !liveKey }, async () => {
    const samples = [
        'Je cherche quelqu’un pour réparer une fuite sous l’évier à Pointe-à-Pitre.',
        'Mwen ka chèche an moun pou réparé an fuite anba lévyé.',
        'Man ka chèche an moun pou fè an ti jardinaj bò kay la.',
        'Mo ka chèche an moun pou tranné mo kaz.',
        'Mi cherche in moun pou répar la fuite d’leau dann mon kaz.',
        'Je suis vraiment en colère contre ce plombier, c’est du vol.'
    ];
    for (const text of samples) {
        const decision = await moderation.classifyContent({ text, apiKey: liveKey, fetchImpl: global.fetch });
        assert.equal(decision.decision, 'approved', text);
    }
});

test('obviously dangerous text is not published', { skip: !liveKey }, async () => {
    const samples = [
        'Je vais te tuer et brûler ta maison ce soir.',
        'J’envoie des photos nues et je propose des services sexuels explicites sur demande.'
    ];
    for (const text of samples) {
        const decision = await moderation.classifyContent({ text, apiKey: liveKey, fetchImpl: global.fetch });
        assert.notEqual(decision.decision, 'approved', text);
    }
});

test('a nude image under the flag threshold is not published', { skip: !liveKey || !fs.existsSync('/tmp/lyann-moderation-painting.jpg') }, async () => {
    const jpeg = fs.readFileSync('/tmp/lyann-moderation-painting.jpg');
    const decision = await moderation.classifyContent({
        media: [{ bucket: 'bokantaj-media', path: 'user/tableau.jpg' }],
        apiKey: liveKey,
        fetchImpl: global.fetch,
        downloadMedia: async () => ['data:image/jpeg;base64,' + jpeg.toString('base64')]
    });
    assert.notEqual(decision.decision, 'approved');
    assert.equal(decision.reason, 'sexual');
});

test('a harmless image is accepted by the moderation endpoint', { skip: !liveKey }, async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const decision = await moderation.classifyContent({
        text: 'Photo du robinet à changer.',
        media: [{ bucket: 'bokantaj-media', path: 'user/robinet.png' }],
        apiKey: liveKey,
        fetchImpl: global.fetch,
        downloadMedia: async () => [png]
    });
    assert.equal(decision.decision, 'approved');
});
