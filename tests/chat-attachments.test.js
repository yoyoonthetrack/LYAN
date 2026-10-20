'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const chat = fs.readFileSync(path.join(root, 'chat-logic.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api-client.js'), 'utf8');
const feed = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, '50_chat_and_bokantaj_video.sql'), 'utf8');

const rulesStart = chat.indexOf('const PHOTO_MIMES');
const rulesEnd = chat.indexOf('function chatIsOffline');
const fnStart = chat.indexOf('function fileExtension');
const fnEnd = chat.indexOf('function chatToast');
const helpers = new Function(
    chat.slice(rulesStart, rulesEnd)
    + chat.slice(fnStart, fnEnd)
    + '\nreturn { validateChatFile, attachmentObjectPath, safeAttachmentExt };'
)();

test('photos, videos and pdfs pass the chat file rules', () => {
    const photo = helpers.validateChatFile({ name: 'terrasse.png', type: 'image/png', size: 1024 }, 'photo');
    const video = helpers.validateChatFile({ name: 'clip.mov', type: 'video/quicktime', size: 1024 }, 'video');
    const pdf = helpers.validateChatFile({ name: 'devis.pdf', type: 'application/pdf', size: 1024 }, 'document');
    assert.equal(photo.ok, true);
    assert.equal(video.ok, true);
    assert.equal(video.mime, 'video/quicktime');
    assert.equal(pdf.ok, true);
});

test('an oversized video, a long-running script and an unknown type are refused', () => {
    const huge = helpers.validateChatFile({ name: 'long.mp4', type: 'video/mp4', size: 51 * 1024 * 1024 }, 'video');
    const script = helpers.validateChatFile({ name: 'note.html', type: 'text/html', size: 100 }, 'document');
    const exe = helpers.validateChatFile({ name: 'run.exe', type: 'application/octet-stream', size: 100 }, 'document');
    assert.equal(huge.ok, false);
    assert.match(huge.message, /50 Mo/);
    assert.equal(script.ok, false);
    assert.equal(exe.ok, false);
});

test('stored chat paths use a random name and the real kind', () => {
    const conv = '11111111-1111-4111-a111-111111111111';
    const sender = '22222222-2222-4222-a222-222222222222';
    const stored = helpers.attachmentObjectPath(conv, sender, 'mov', 'video');
    assert.match(stored, new RegExp('^' + conv + '/' + sender + '/[0-9a-f-]{36}\\.mov$'));
    assert.equal(helpers.safeAttachmentExt('html', 'document'), 'pdf');
});

test('the plus button opens a sheet above the conversation and stages a preview', () => {
    assert.match(chat, /window\.openChatAttachSheet/);
    assert.match(chat, /stageChatAttachment/);
    assert.match(chat, /pickChatVideo/);
    assert.match(chat, /chooseFromGallery/);
    assert.match(chat, /data-upload-progress/);
    assert.match(chat, /abortController/);
    assert.match(chat, /chat-msg-video/);
    assert.doesNotMatch(chat, /getPublicUrl\('chat-attachments'\)/);
});

test('private chat uploads use the session and can be cancelled', () => {
    assert.match(api, /createSignedUrl\(path, 3600\)/);
    assert.match(api, /xhr\.upload\.onprogress/);
    assert.match(api, /signal\.addEventListener\('abort'/);
    assert.doesNotMatch(api, /getPublicUrl\(path\)[\s\S]{0,80}chat-attachments/);
});

test('bokantaj keeps photos and adds an inline video player', () => {
    assert.match(feed, /uploadPostVideo/);
    assert.match(feed, /class="bokantaj-video" controls playsinline preload="metadata"/);
    assert.doesNotMatch(feed, /<video class="bokantaj-video"[^>]*autoplay/);
    assert.match(api, /from\('bokantaj-media-hold'\)/);
});

test('the prepared storage change keeps chat files private', () => {
    assert.match(sql, /attachment_type IN \('photo', 'video', 'document'\)/);
    assert.match(sql, /'chat-attachments',\s*'chat-attachments',\s*false,/);
    assert.match(sql, /public = false/);
    assert.match(sql, /'mp4', 'mov', 'webm', 'm4v'/);
    assert.match(sql, /is_current_user_conversation_participant/);
    assert.doesNotMatch(sql, /DROP POLICY/);
    assert.doesNotMatch(sql, /FOR UPDATE/);
    assert.doesNotMatch(sql, /'bokantaj-media'/);
    assert.doesNotMatch(sql, /DELETE FROM storage/);
    const current = fs.readFileSync(path.join(root, '44_chat_attachments.sql'), 'utf8');
    assert.match(current, /chat_attachments_select/);
    assert.match(current, /FOR SELECT TO authenticated/);
    assert.match(current, /FOR INSERT TO authenticated/);
    assert.match(current, /FOR DELETE TO authenticated/);
    assert.doesNotMatch(current, /FOR UPDATE/);
    assert.doesNotMatch(sql, /GRANT .+ ON storage\.objects TO anon/i);
    assert.doesNotMatch(sql, /bucket_id = 'chat-attachments'[\s\S]{0,160}TO public/);
});

test('a dropped connection aborts the upload and a later reconnect can remove an orphan', () => {
    assert.match(api, /xhr\.upload\.onprogress/);
    assert.match(api, /event\.loaded \/ event\.total/);
    assert.match(chat, /job\.droppedOffline = true/);
    assert.match(chat, /job\.abortController\.abort\(\)/);
    assert.match(chat, /discardUploadedAttachment/);
    assert.match(chat, /flushOrphanAttachments/);
    assert.match(chat, /video\.autoplay = false/);
});
