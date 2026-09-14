const fs = require('fs');
const file = 'script.js';
let source = fs.readFileSync(file, 'utf8');
const before = source;

function replaceAll(from, to) {
  if (!source.includes(from)) return false;
  source = source.split(from).join(to);
  return true;
}

// Remaining notification/floating-chat entry points go through the canonical router.
replaceAll(
`                    if (targetName && typeof window.openChatWithUser === 'function') {
                        window.openChatWithUser(targetName, targetAvatar, targetName);
                    } else if (typeof window.openLyannChatModal === 'function') {
                        window.openLyannChatModal();
                    }`,
`                    if (targetName) {
                        window.LYANN_ROUTER?.go?.('messages', { contactId: targetName, name: targetName });
                    } else {
                        window.LYANN_ROUTER?.go?.('messages');
                    }`
);
replaceAll(
`            if (targetName && typeof window.openChatWithUser === 'function') {
                window.openChatWithUser(targetName, targetAvatar, targetName);
            } else if (typeof window.openLyannChatModal === 'function') {
                window.openLyannChatModal();
            }`,
`            if (targetName) {
                window.LYANN_ROUTER?.go?.('messages', { contactId: targetName, name: targetName });
            } else {
                window.LYANN_ROUTER?.go?.('messages');
            }`
);
replaceAll(
`                    if (log.recipientName) {
                        openChatWithUser(log.recipientName, "david-34.png");
                    } else if (typeof window.openLyannChatModal === 'function') {
                        window.openLyannChatModal();
                    }`,
`                    if (log.recipientName) {
                        window.LYANN_ROUTER?.go?.('messages', { name: log.recipientName });
                    } else {
                        window.LYANN_ROUTER?.go?.('messages');
                    }`
);
replaceAll("window.location.href = 'feed.html?action=openchat';", "window.LYANN_ROUTER?.go?.('messages');");
replaceAll("window.location.href = log.recipientName ? `feed.html?action=openchat&name=${encodeURIComponent(log.recipientName)}` : 'feed.html?action=openchat';", "window.LYANN_ROUTER?.go?.('messages', log.recipientName ? { name: log.recipientName } : {});");

if (source === before) {
  console.log('Notification chat routing already canonical.');
  process.exit(0);
}
fs.writeFileSync(file, source, 'utf8');
console.log('Routed remaining notification/floating-chat entry points through LYANN_ROUTER.');
