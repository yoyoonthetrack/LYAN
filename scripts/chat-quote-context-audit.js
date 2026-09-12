const fs = require('fs');

const repo = fs.readFileSync('messaging-repository.js', 'utf8');
const chat = fs.readFileSync('chat-logic.js', 'utf8');

const renderStart = chat.indexOf('async function renderMessages');
const renderEnd = chat.indexOf('\nwindow.handleAcceptQuote', renderStart);
const renderBlock = renderStart >= 0 && renderEnd > renderStart ? chat.slice(renderStart, renderEnd) : '';

const checks = [
  ['repository exposes quote context', repo.includes('getQuoteContext')],
  ['quote context is cached', repo.includes("dedupe('chat-quote-context'")],
  ['milestones are batched by quote ids', repo.includes(".from('milestones')") && repo.includes(".in('quote_id', quoteIds)")],
  ['renderer uses messaging repository quote context', renderBlock.includes('LYANN_MESSAGING_REPOSITORY.getQuoteContext')],
  ['renderer no longer loops milestone fetches per quote', !renderBlock.includes('getMilestonesForQuote(q.id)')],
  ['renderer no longer loads invitation directly for quotes', !renderBlock.includes('getActiveInvitationBetween(getMyId(), currentChatContact.id)')]
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
