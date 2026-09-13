const fs = require('fs');

const productPages = [
  'index.html', 'feed.html', 'results.html', 'pricing.html', 'payment-portal.html', 'how-it-works.html', 'about.html'
].filter(fs.existsSync);

for (const file of productPages) {
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('id="chatModal"')) continue;

  if (!html.includes('<script src="messaging-ui.js"></script>')) {
    const shellMarker = '<script src="app-shell.js"></script>';
    const chatMarker = '<script src="chat-logic.js"></script>';
    if (html.includes(shellMarker)) html = html.replace(shellMarker, `${shellMarker}\n    <script src="messaging-ui.js"></script>`);
    else if (html.includes(chatMarker)) html = html.replace(chatMarker, `${chatMarker}\n    <script src="messaging-ui.js"></script>`);
    else throw new Error(`${file}: chatModal exists but neither app-shell.js nor chat-logic.js is loaded`);
  }

  html = html.replace(/\s*<script src="chat-surface-stack\.js"><\/script>/g, '');
  fs.writeFileSync(file, html);
}

const cssPath = 'style.css';
let css = fs.readFileSync(cssPath, 'utf8');
const markers = [
  '/* LYANN CANONICAL MESSAGING SHELL v1 */',
  '/* LYANN CANONICAL MESSAGING SHELL v2 */',
  '/* LYANN CANONICAL MESSAGING SHELL v3 */',
  '/* LYANN CANONICAL MESSAGING SHELL v4 */'
];
const marker = '/* LYANN CANONICAL MESSAGING SHELL v4 */';
const canonicalCss = `${marker}
/* Parent conversation content can never bleed through a child workflow. */
#chatModal .chat-main-area.lyann-child-surface-open #chatMissionContextBar,
#chatModal .chat-main-area.lyann-child-surface-open #chatMissionContext,
#chatModal .chat-main-area.lyann-child-surface-open #chatContextualActionsBar,
#chatModal .chat-main-area.lyann-child-surface-open #chatViewMissionBtn,
#chatModal .chat-main-area.lyann-child-surface-open #chatMessagesContainer,
#chatModal .chat-main-area.lyann-child-surface-open #chatReplyBar,
#chatModal .chat-main-area.lyann-child-surface-open .chat-input-area {
  display: none !important;
}

#chatModal .chat-main-area.lyann-child-surface-open .chat-overlay-pane { z-index: 1000 !important; }
#chatModal .chat-main-area.lyann-child-surface-open .chat-overlay-pane:not([style*="display: none"]):not([style*="display:none"]) { display: flex !important; }

/* Historical renderer can hydrate data, but can never flash as a visible screen. */
body.lyann-messaging-transition #chatModal { visibility: hidden !important; pointer-events: none !important; }

@media (max-width: 768px) {
  /* Messaging is a top-level app screen, never a modal sitting above another screen. */
  body.lyann-messaging-open .mobile-bottom-nav,
  body.lyann-messaging-open .speed-dial-wrapper,
  body.lyann-messaging-open #backToTopBtn {
    display: none !important;
  }

  body.lyann-messaging-open #chatModal {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100dvh !important;
    max-width: 100vw !important;
    max-height: 100dvh !important;
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box !important;
    align-items: stretch !important;
    justify-content: stretch !important;
    background: #FFFFFF !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    border-radius: 0 !important;
    overflow: hidden !important;
    z-index: 20000 !important;
  }

  /* Native iOS: reserve the system-status/Dynamic-Island zone at the top, but
     keep the messaging surface itself full-width and flush to the bottom. */
  body.is-native-app.lyann-messaging-open #chatModal {
    top: max(env(safe-area-inset-top, 0px), 54px) !important;
    right: 0 !important;
    bottom: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: calc(100dvh - max(env(safe-area-inset-top, 0px), 54px)) !important;
    max-height: calc(100dvh - max(env(safe-area-inset-top, 0px), 54px)) !important;
    padding: 0 !important;
    background: #FFFFFF !important;
  }

  body.lyann-messaging-open #chatModal > .modal-card,
  body.lyann-messaging-open #chatModal .modal-card-chat,
  body.lyann-messaging-open #chatModal .chat-modal-layout {
    width: 100% !important;
    height: 100% !important;
    max-width: 100% !important;
    max-height: 100% !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border-radius: 0 !important;
    border: 0 !important;
    box-shadow: none !important;
    overflow: hidden !important;
    background: #FFFFFF !important;
  }

  body.lyann-messaging-open #chatModal .chat-sidebar-header,
  body.lyann-messaging-open #chatModal .chat-header-bar {
    min-height: 64px !important;
    padding-top: 8px !important;
    padding-bottom: 8px !important;
    background: #FFFFFF !important;
  }

  body.lyann-messaging-open #chatModal #chatTrackingBtn {
    flex: 0 0 auto !important;
    width: auto !important;
    max-width: 92px !important;
    min-height: 38px !important;
    padding: 6px 10px !important;
    font-size: 0 !important;
    line-height: 1 !important;
    white-space: nowrap !important;
    border-radius: 999px !important;
  }
  body.lyann-messaging-open #chatModal #chatTrackingBtn::after {
    content: "🛠️ Suivi";
    font-size: 13px !important;
    font-weight: 800 !important;
    line-height: 1 !important;
  }

  /* Keep the composer above the iPhone home indicator without exposing the
     underlying page behind the messaging route. */
  body.is-native-app.lyann-messaging-open #chatModal .chat-input-area,
  body.is-native-app.lyann-messaging-open #chatModal #chatReplyBar {
    padding-bottom: max(12px, env(safe-area-inset-bottom, 0px)) !important;
  }

  #chatModal .chat-modal-layout:not(.mobile-conversation-active) .chat-contacts-sidebar { display: flex !important; width: 100% !important; }
  #chatModal .chat-modal-layout:not(.mobile-conversation-active) .chat-main-area { display: none !important; }
  #chatModal .chat-modal-layout.mobile-conversation-active .chat-contacts-sidebar { display: none !important; }
  #chatModal .chat-modal-layout.mobile-conversation-active .chat-main-area { display: flex !important; width: 100% !important; min-width: 0 !important; }
}
`;

const existingMarker = markers.find((item) => css.includes(item));
if (existingMarker) {
  css = css.slice(0, css.indexOf(existingMarker)).trimEnd() + '\n\n' + canonicalCss + '\n';
  fs.writeFileSync(cssPath, css);
} else {
  css += `\n${canonicalCss}\n`;
  fs.writeFileSync(cssPath, css);
}

console.log(`Canonical messaging normalized across ${productPages.length} product pages.`);
