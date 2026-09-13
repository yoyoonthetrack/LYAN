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
const v1 = '/* LYANN CANONICAL MESSAGING SHELL v1 */';
const v2 = '/* LYANN CANONICAL MESSAGING SHELL v2 */';
const canonicalCss = `${v2}
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

#chatModal .chat-main-area.lyann-child-surface-open .chat-overlay-pane {
  z-index: 1000 !important;
}

#chatModal .chat-main-area.lyann-child-surface-open .chat-overlay-pane:not([style*="display: none"]):not([style*="display:none"]) {
  display: flex !important;
}

/* The historical renderer may hydrate the DOM, but it is never allowed to
   become a visible intermediate messaging screen. */
body.lyann-messaging-transition #chatModal {
  visibility: hidden !important;
  pointer-events: none !important;
}

/* Mobile has one state machine: list -> conversation -> child surface.
   It must live strictly inside the OS safe area rather than 100dvh. */
@media (max-width: 768px) {
  body.lyann-messaging-open #chatModal {
    position: fixed !important;
    top: env(safe-area-inset-top, 0px) !important;
    right: 0 !important;
    bottom: env(safe-area-inset-bottom, 0px) !important;
    left: 0 !important;
    inset: env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px) 0 !important;
    width: 100vw !important;
    height: auto !important;
    max-width: 100vw !important;
    max-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
    margin: 0 !important;
    padding: 8px !important;
    box-sizing: border-box !important;
    align-items: stretch !important;
    justify-content: stretch !important;
    z-index: 20000 !important;
  }

  body.lyann-messaging-open #chatModal > .modal-card,
  body.lyann-messaging-open #chatModal .modal-card-chat {
    width: 100% !important;
    height: 100% !important;
    max-width: 100% !important;
    max-height: 100% !important;
    margin: 0 !important;
    border-radius: 24px !important;
    overflow: hidden !important;
  }

  body.lyann-messaging-open #chatModal .chat-modal-layout {
    width: 100% !important;
    height: 100% !important;
    max-width: 100% !important;
    max-height: 100% !important;
    margin: 0 !important;
    border-radius: inherit !important;
    overflow: hidden !important;
  }

  body.lyann-messaging-open #chatModal .chat-sidebar-header,
  body.lyann-messaging-open #chatModal .chat-header-bar {
    min-height: 56px !important;
    padding-top: 8px !important;
    padding-bottom: 8px !important;
  }

  /* The chantier action was wrapping onto 3 lines and covering the contact
     name on iPhone. Keep the same action but render it as a compact pill. */
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

  body.lyann-messaging-open #chatModal .chat-input-area,
  body.lyann-messaging-open #chatModal #chatReplyBar {
    padding-bottom: max(10px, env(safe-area-inset-bottom, 0px)) !important;
  }

  #chatModal .chat-modal-layout:not(.mobile-conversation-active) .chat-contacts-sidebar {
    display: flex !important;
    width: 100% !important;
  }

  #chatModal .chat-modal-layout:not(.mobile-conversation-active) .chat-main-area {
    display: none !important;
  }

  #chatModal .chat-modal-layout.mobile-conversation-active .chat-contacts-sidebar {
    display: none !important;
  }

  #chatModal .chat-modal-layout.mobile-conversation-active .chat-main-area {
    display: flex !important;
    width: 100% !important;
    min-width: 0 !important;
  }
}
`;

if (css.includes(v1)) {
  // v1 was appended at the end when introduced. Replace that entire canonical
  // block instead of layering yet another override on top of it.
  css = css.slice(0, css.indexOf(v1)).trimEnd() + '\n\n' + canonicalCss + '\n';
  fs.writeFileSync(cssPath, css);
} else if (!css.includes(v2)) {
  css += `\n${canonicalCss}\n`;
  fs.writeFileSync(cssPath, css);
}

console.log(`Canonical messaging normalized across ${productPages.length} product pages.`);
