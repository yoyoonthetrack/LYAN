const fs = require('fs');

const productPages = [
  'index.html',
  'feed.html',
  'results.html',
  'pricing.html',
  'payment-portal.html',
  'how-it-works.html',
  'about.html'
].filter(fs.existsSync);

for (const file of productPages) {
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('id="chatModal"')) continue;

  // One public messaging controller is loaded after the legacy implementation
  // modules and before script.js can attach page-specific entry behavior.
  if (!html.includes('<script src="messaging-ui.js"></script>')) {
    const shellMarker = '<script src="app-shell.js"></script>';
    const chatMarker = '<script src="chat-logic.js"></script>';
    if (html.includes(shellMarker)) {
      html = html.replace(shellMarker, `${shellMarker}\n    <script src="messaging-ui.js"></script>`);
    } else if (html.includes(chatMarker)) {
      html = html.replace(chatMarker, `${chatMarker}\n    <script src="messaging-ui.js"></script>`);
    } else {
      throw new Error(`${file}: chatModal exists but neither app-shell.js nor chat-logic.js is loaded`);
    }
  }

  // Retire the earlier proposal-only stack shim. The canonical controller owns
  // every child surface, not just proposal overlays.
  html = html.replace(/\s*<script src="chat-surface-stack\.js"><\/script>/g, '');

  fs.writeFileSync(file, html);
}

const cssPath = 'style.css';
let css = fs.readFileSync(cssPath, 'utf8');
const marker = '/* LYANN CANONICAL MESSAGING SHELL v1 */';
if (!css.includes(marker)) {
  css += `\n${marker}\n/* Parent conversation content can never bleed through a child workflow. */\n#chatModal .chat-main-area.lyann-child-surface-open #chatMissionContextBar,\n#chatModal .chat-main-area.lyann-child-surface-open #chatMissionContext,\n#chatModal .chat-main-area.lyann-child-surface-open #chatContextualActionsBar,\n#chatModal .chat-main-area.lyann-child-surface-open #chatViewMissionBtn,\n#chatModal .chat-main-area.lyann-child-surface-open #chatMessagesContainer,\n#chatModal .chat-main-area.lyann-child-surface-open #chatReplyBar,\n#chatModal .chat-main-area.lyann-child-surface-open .chat-input-area {\n  display: none !important;\n}\n\n#chatModal .chat-main-area.lyann-child-surface-open .chat-overlay-pane {\n  z-index: 1000 !important;\n}\n\n#chatModal .chat-main-area.lyann-child-surface-open .chat-overlay-pane:not([style*="display: none"]):not([style*="display:none"]) {\n  display: flex !important;\n}\n\n/* Mobile has one state machine: list -> conversation -> child surface. */\n@media (max-width: 768px) {\n  body.lyann-messaging-open #chatModal {\n    position: fixed !important;\n    inset: 0 !important;\n    width: 100vw !important;\n    height: 100dvh !important;\n    max-width: none !important;\n    max-height: none !important;\n    margin: 0 !important;\n    z-index: 20000 !important;\n  }\n\n  body.lyann-messaging-open #chatModal > .modal-card,\n  body.lyann-messaging-open #chatModal .modal-card-chat,\n  body.lyann-messaging-open #chatModal .chat-modal-layout {\n    width: 100% !important;\n    height: 100% !important;\n    max-width: none !important;\n    max-height: none !important;\n    margin: 0 !important;\n    border-radius: 0 !important;\n  }\n\n  #chatModal .chat-modal-layout:not(.mobile-conversation-active) .chat-contacts-sidebar {\n    display: flex !important;\n    width: 100% !important;\n  }\n\n  #chatModal .chat-modal-layout:not(.mobile-conversation-active) .chat-main-area {\n    display: none !important;\n  }\n\n  #chatModal .chat-modal-layout.mobile-conversation-active .chat-contacts-sidebar {\n    display: none !important;\n  }\n\n  #chatModal .chat-modal-layout.mobile-conversation-active .chat-main-area {\n    display: flex !important;\n    width: 100% !important;\n  }\n}\n`;
  fs.writeFileSync(cssPath, css);
}

console.log(`Canonical messaging normalized across ${productPages.length} product pages.`);
