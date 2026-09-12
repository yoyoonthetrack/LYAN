const fs = require('fs');
const path = require('path');

const htmlFiles = fs.readdirSync('.').filter((name) => name.endsWith('.html'));
for (const file of htmlFiles) {
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('chat-logic.js')) continue;
  if (!html.includes('messaging-repository.js')) {
    html = html.replace(
      /(<script\s+src=["']chat-logic\.js[^"']*["']><\/script>)/,
      '    <script src="messaging-repository.js"></script>\n$1'
    );
    fs.writeFileSync(file, html);
  }
}

const chatFile = 'chat-logic.js';
let source = fs.readFileSync(chatFile, 'utf8');

const start = source.indexOf('async function getChatMessages(contactId) {');
if (start < 0) throw new Error('getChatMessages not found');
const next = source.indexOf('\nfunction renderOptimisticChatMessage', start);
if (next < 0) throw new Error('renderOptimisticChatMessage anchor not found');

const replacement = `async function getChatMessages(contactId, options = {}) {\n    const userId = getMyId();\n    if (userId === \"me\" || !isUUID(contactId) || !window.LYANN_API_CLIENT || !window.LYANN_API_CLIENT.supabase) {\n        return getLocalChatMessages(contactId);\n    }\n\n    if (!window.LYANN_MESSAGING_REPOSITORY) {\n        console.warn('Messaging repository unavailable; returning no remote messages.');\n        return [];\n    }\n\n    try {\n        return await window.LYANN_MESSAGING_REPOSITORY.getMessages(userId, contactId, options);\n    } catch(e) {\n        console.warn(\"Supabase chat query failed:\", e);\n        return [];\n    }\n}\n`;

source = source.slice(0, start) + replacement + source.slice(next);

const sendMarker = "const { error: sendErr } = await window.LYANN_API_CLIENT.sendMessage(sharedConvId, userId, contentToSave);\n        if (sendErr) throw sendErr;";
if (!source.includes(sendMarker)) throw new Error('sendMessage marker not found');
source = source.replace(sendMarker, `${sendMarker}\n\n        if (window.LYANN_MESSAGING_REPOSITORY) {\n            window.LYANN_MESSAGING_REPOSITORY.invalidateMessages(sharedConvId);\n        }`);

const refreshMarker = "await renderMessages();";
const addStart = source.indexOf('async function addMessageToContact(contactId, msgObj) {');
const addEnd = source.indexOf('window.addMessageToContact = addMessageToContact;', addStart);
let addBlock = source.slice(addStart, addEnd);
addBlock = addBlock.replace(refreshMarker, 'await renderMessages(null);');
source = source.slice(0, addStart) + addBlock + source.slice(addEnd);

fs.writeFileSync(chatFile, source);
console.log('Messaging repository normalized across shared HTML and chat logic.');
