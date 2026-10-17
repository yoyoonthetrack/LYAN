const fs = require('fs');

const repo = fs.readFileSync('messaging-repository.js', 'utf8');
const chat = fs.readFileSync('chat-logic.js', 'utf8');

const checks = [
  ['repository exposes quote context', repo.includes('getQuoteContext')],
  ['quote context is cached', repo.includes("dedupe('chat-quote-context'")],
  ['milestones are batched by quote ids', repo.includes(".from('milestones')") && repo.includes(".in('quote_id', quoteIds)")],
  ['quote context prefers explicit requestId', repo.includes('resolveQuoteContextSelection') && repo.includes('options.requestId')],
  ['quote context does not bind only to last pair invitation', repo.includes('listAcceptedInvitationsBetween') && !/getActiveInvitationBetween\(userId, contactId\)\s*;/.test(repo)],
  ['renderer uses messaging repository quote context', chat.includes('LYANN_MESSAGING_REPOSITORY.getQuoteContext') && chat.includes('threadQuoteContextOptions')],
  ['legacy per-quote milestone loop is gone', !chat.includes('q.milestones = await window.LYANN_API_CLIENT.getMilestonesForQuote(q.id)')]
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
