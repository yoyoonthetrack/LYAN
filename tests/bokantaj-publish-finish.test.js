'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('photo helper compresses or keeps supported images', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../api-client.js'), 'utf8');
    const start = source.indexOf('window.LYANN_BOKANTAJ_MEDIA');
    const end = source.indexOf('// The annonce title', start);
    assert.ok(start >= 0 && end > start);
    global.window = global;
    eval(source.slice(start, end));
    const tiny = new File([Buffer.from('jpeg')], 'tiny.jpg', { type: 'image/jpeg' });
    const kept = await global.LYANN_BOKANTAJ_MEDIA.preparePhoto(tiny);
    assert.equal(kept, tiny);
    await assert.rejects(
        () => global.LYANN_BOKANTAJ_MEDIA.preparePhoto(new File([Buffer.from('x')], 'x.txt', { type: 'text/plain' })),
        /photo/i
    );
});

test('composer publish paints the author card without a full remount', () => {
    const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
    assert.match(source, /function formatOwnCreatedPost/);
    assert.match(source, /currentFlashPosts = \[ownCard,/);
    assert.match(source, /dataset\.publishing === '1'/);
    assert.match(source, /Envoi de la photo/);
    assert.match(source, /function showVideoAttachProgress/);
    assert.match(source, /function showVideoAttachError/);
    assert.match(source, /loadBokantajFeedFromSupabase\(\{ force: true, background: true \}\)/);
    assert.doesNotMatch(source, /await window\.loadBokantajFeedFromSupabase\(\{ force: true \}\)/);
    assert.match(source, /PENDING_FEED_POLL_MS = 5000/);
    assert.match(source, /PENDING_FEED_POLL_MAX = 24/);
    assert.match(source, /startPendingFeedPoll\(\)/);
    assert.doesNotMatch(source, /PENDING_FEED_POLL_MS = 30000/);
    assert.match(source, /function keepOwnPendingPosts/);
    assert.match(source, /videoAttachFailed/);
    assert.match(source, /videoPreparePromise/);
    assert.match(source, /VIDEO_PREPARE_WAIT_MS/);
    assert.match(source, /Promise\.race\(\[/);
    assert.match(source, /videoPicked && !attachedVideoFile/);
    assert.match(source, /La vidéo n’est pas encore jointe/);
    assert.match(source, /throw new Error\('La vidéo n’a pas pu être envoyée/);
    assert.match(source, /function showPublishFailure/);
    assert.match(source, /rien n’a été publié/);
    const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
    assert.match(css, /\.bokantaj-publish-failure/);
    const html = fs.readFileSync(path.join(__dirname, '../feed.html'), 'utf8');
    assert.match(html, /class="composer-actions-bar"/);
    assert.match(source, /function flashFeedSignature/);
    assert.match(source, /previousSignature === flashFeedSignature\(currentFlashPosts\)/);
});

test('a card keeps the shape of the media and plays video on scroll', () => {
    const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
    assert.match(source, /function applyMediaRatio/);
    assert.match(source, /--media-ratio/);
    assert.match(source, /function observeFeedVideos/);
    assert.match(source, /new IntersectionObserver/);
    assert.match(source, /function setBokantajFeedSound/);
    // iOS only autoplays a muted video, and the sound stays an explicit choice.
    assert.match(source, /video\.muted = bokantajFeedMuted/);
    assert.match(source, /video\.setAttribute\('muted', ''\)/);
    assert.match(source, /bokantajFeedMuted = true/);
    // The vendored icon font has no speaker glyph, so the icon is inline SVG.
    assert.match(source, /function soundIcon/);
    assert.match(source, /toggle\.innerHTML = soundIcon\(muted\)/);
    assert.doesNotMatch(source, /ph-speaker/);
    const icons = fs.readFileSync(path.join(__dirname, '../vendor/phosphor/phosphor.css'), 'utf8');
    assert.doesNotMatch(icons, /\.ph-speaker/);
    assert.match(icons, /\.ph-arrows-out/);
    // The feed fills twenty posts in order. Reaching the 15th starts the next
    // twenty photos. A video stays a poster until the member taps it.
    assert.match(source, /const FEED_MEDIA_BATCH = 20/);
    assert.match(source, /const FEED_MEDIA_TRIGGER = 15/);
    const hydrate = source.slice(source.indexOf('function hydrateHoldMedia'));
    const body = hydrate.slice(0, hydrate.indexOf('\n        pump();'));
    assert.ok(body.indexOf('observeFeedVideos(root)') < body.indexOf('preloadFeedCard'), 'bound before fetching');
    assert.match(body, /released - runway - 1/);
    assert.match(source, /async function preloadFeedCard/);
    const preload = source.slice(source.indexOf('async function preloadFeedCard'), source.indexOf('function hydrateHoldMedia'));
    assert.doesNotMatch(preload, /bokantaj-video-poster/);
    assert.doesNotMatch(preload, /openBokantajVideo/);
    const opener = source.slice(source.indexOf('function openBokantajVideo'), source.indexOf('function openFullPlayer'));
    assert.match(opener, /video\.src = source/);
    assert.doesNotMatch(opener, /await /);
    assert.doesNotMatch(body, /await Promise\.all/);
    const chat = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
    const removal = chat.slice(chat.indexOf("remove.className = 'btn btn-outline md-milestone-remove'"), chat.indexOf('milestoneEditorApi.removeRow'));
    assert.ok(removal.indexOf('getClientRects') < removal.indexOf('window.confirm'));
    assert.match(css, /aspect-ratio: var\(--media-ratio, 16 \/ 9\)/);
    assert.match(css, /\.bokantaj-video-sound/);
    assert.match(css, /\.bokantaj-photos-1 \.bokantaj-photo\.has-media-ratio/);
});

test('the keyboard can always be closed and the system sheets speak French', () => {
    const platform = fs.readFileSync(path.join(__dirname, '../platform-core.js'), 'utf8');
    // The plugin option is isVisible; with the old name the bar never appeared,
    // leaving no Done button to dismiss the keyboard.
    assert.match(platform, /setAccessoryBarVisible\(\{ isVisible: true \}\)/);
    assert.doesNotMatch(platform, /setAccessoryBarVisible\(\{ visible:/);

    const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
    assert.match(source, /document\.addEventListener\('pointerdown'/);
    assert.match(source, /active\.blur\(\)/);

    // The iOS photo sheet follows the app localizations, not the keyboard.
    const plist = fs.readFileSync(path.join(__dirname, '../ios/App/App/Info.plist'), 'utf8');
    assert.match(plist, /<key>CFBundleLocalizations<\/key>\s*<array>\s*<string>fr<\/string>/);
    assert.match(plist, /<key>CFBundleDevelopmentRegion<\/key>\s*<string>fr<\/string>/);
});

test('a member sees their own comment while it is being checked', () => {
    const client = fs.readFileSync(path.join(__dirname, '../api-client.js'), 'utf8');
    const start = client.indexOf('async getComments(');
    const body = client.slice(start, client.indexOf('async addComment(', start));
    assert.match(body, /\.eq\('public_moderation_status', 'pending'\)/);
    assert.match(body, /\.eq\('author_id', session\.id\)/);
    assert.match(body, /awaiting_review = true/);
    // Other people still only see what has been approved.
    assert.match(body, /\.eq\('public_moderation_status', 'approved'\)/);
});

test('media is not glued to the text of the post', () => {
    const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
    assert.match(css, /\.bokantaj-video-poster \{[^}]*margin-top: 10px/s);
    assert.match(css, /\.bokantaj-video-shell \{[^}]*margin-top: 10px/s);
    assert.match(css, /\.bokantaj-photos \{[^}]*margin-top: 10px/s);
});

test('composer location is a map plus two share choices', () => {
    const html = fs.readFileSync(path.join(__dirname, '../feed.html'), 'utf8');
    const map = fs.readFileSync(path.join(__dirname, '../bokantaj-map.js'), 'utf8');
    assert.match(html, /id="bokantajShareQuarter"/);
    assert.match(html, /id="bokantajShareExact"/);
    assert.match(html, /Partager le nom du quartier/);
    assert.match(html, /Partager la localisation précise/);
    assert.doesNotMatch(html, />Me localiser</);
    assert.match(html, /id="bokantajPlaceSave" hidden/);
    assert.match(map, /function sharePlace/);
    assert.match(map, /bokantajShareQuarter/);
    assert.match(map, /position exacte/);
    assert.match(map, / · quartier/);
});
