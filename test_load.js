const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const script = fs.readFileSync('script.js', 'utf8');
const chatLogic = fs.readFileSync('chat-logic.js', 'utf8');

// We can't fully run it without JSDOM, let's just check for syntax errors again or basic JS parsing.
