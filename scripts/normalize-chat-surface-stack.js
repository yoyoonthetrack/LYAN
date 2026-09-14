const fs = require('fs');
const path = 'feed.html';
let html = fs.readFileSync(path, 'utf8');

if (!html.includes('chat-surface-stack.js')) {
  const marker = '<script src="chat-logic.js"></script>';
  if (!html.includes(marker)) throw new Error('chat-logic.js script marker not found');
  html = html.replace(marker, `${marker}\n    <script src="chat-surface-stack.js"></script>`);
  fs.writeFileSync(path, html);
  console.log('Wired chat-surface-stack.js after chat-logic.js');
} else {
  console.log('chat-surface-stack.js already wired');
}
