const fs = require('fs');

const repo = fs.readFileSync('messaging-repository.js', 'utf8');
const chat = fs.readFileSync('chat-logic.js', 'utf8');
const feed = fs.readFileSync('feed.html', 'utf8');

const getStart = chat.indexOf('async function getChatMessages(contactId');
const getEnd = chat.indexOf('\nfunction renderOptimisticChatMessage', getStart);
const getBlock = getStart >= 0 && getEnd > getStart ? chat.slice(getStart, getEnd) : '';

const checks = [
  ['repository exists', repo.includes('window.LYANN_MESSAGING_REPOSITORY')],
  ['conversation lookup is cached', repo.includes("dedupe('chat-conversation'"))],
  ['messages are cached', repo.includes("dedupe('chat-messages'"))],
  ['repository maps sender direction', repo.includes("row.sender_id === userId ? 'me' : 'them'")],
  ['feed wires repository before chat logic', feed.indexOf('messaging-repository.js') >= 0 && feed.indexOf('messaging-repository.js') < feed.indexOf('chat-logic.js')],
  ['chat reads through repository', getBlock.includes('LYANN_MESSAGING_REPOSITORY.getMessages')],
  ['chat loader no longer queries participants directly', !getBlock.includes("from('conversation_participants')")],
  ['chat loader no longer queries messages directly', !getBlock.includes("from('messages')")],
  ['successful send invalidates message cache', chat.includes('LYANN_MESSAGING_REPOSITORY.invalidateMessages(sharedConvId)')]
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
