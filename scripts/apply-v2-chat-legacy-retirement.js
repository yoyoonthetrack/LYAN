const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '..', 'chat-logic.js');
let src = fs.readFileSync(file, 'utf8');

function required(regex, replacement, label) {
  if (!regex.test(src)) throw new Error(`Legacy chat retirement pattern missing: ${label}`);
  src = src.replace(regex, replacement);
}

// Remove the entire old contact-list implementation, deleted-conversation local state,
// demo contacts and direct shell opener. The canonical messaging controller owns all of it.
required(
  /    \/\/ CHAT PRODUCTION HYGIENE:[\s\S]*?    initializeChatContacts\(\);\n    renderChatContacts\(\);/,
`    // Conversation-list ownership moved to LYANN_MESSAGING + messaging-repository.js.
    // Keep only a compatibility bridge for old internal call sites during migration.
    window.renderChatContacts = async function renderChatContactsCompatibility() {
        if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.renderConversationList === 'function') {
            return window.LYANN_MESSAGING.renderConversationList();
        }
    };

    window.deleteConversation = async function deleteConversationCompatibility() {
        if (window.NotificationService?.showToast) {
            window.NotificationService.showToast('info', 'La suppression de conversation sera réactivée avec le stockage serveur.');
        }
        return false;
    };

    window.openLyannChatModal = function openLyannChatModalCompatibility() {
        if (window.LYANN_ROUTER) return window.LYANN_ROUTER.go('messages');
        if (window.LYANN_MESSAGING) return window.LYANN_MESSAGING.openList();
        return false;
    };`,
  'remove legacy contact list owner'
);

// Legacy close implementation must delegate to the canonical messaging surface owner.
required(
  /window\.closeLyannChatModal = function \(e\) \{[\s\S]*?\n\};\n\nfunction initChatCloseBtn/,
`window.closeLyannChatModal = function (e) {
    if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.close === 'function') {
        return window.LYANN_MESSAGING.close(e);
    }
    return false;
};

function initChatCloseBtn`,
  'delegate legacy close'
);

// Debug DOM observer caused noisy traces and hidden runtime work; remove it entirely.
required(
  /function attachChatContainerMutationObserver\(\) \{[\s\S]*?\n\}\n\n\/\/ Safe startup execution\nif \(document\.readyState === 'loading'\) \{[\s\S]*?\n\}\n\n\/\/ === FAVORITES MANAGEMENT/,
`// Safe startup execution. No chat DOM MutationObserver is allowed.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initChatSubmitAndContacts();
        initChatCloseBtn();
    }, { once: true });
} else {
    initChatSubmitAndContacts();
    initChatCloseBtn();
}

// === FAVORITES MANAGEMENT`,
  'remove debug mutation observer'
);

// Realtime starts from canonical auth readiness, never an arbitrary timer.
src = src.replace(
  /\/\/ Call setup when script loads\nsetTimeout\(setupRealtime, 1000\);[^\n]*\n/,
`// Realtime starts only after canonical auth resolution.
if (window.LYANN_AUTH_STATE?.getSnapshot?.().status === 'ready') setupRealtime();
else window.addEventListener('lyann:auth-ready', setupRealtime, { once: true });
`
);

// Use stable profile ID for favorites; names are presentation only.
src = src
  .replace(/window\.isContactFavorite\(currentChatContact\.name\)/g, 'window.isContactFavorite(currentChatContact.id)')
  .replace(/window\.toggleContactFavorite\(currentChatContact\.name, currentChatContact\.avatar\)/g, 'window.toggleContactFavorite(currentChatContact.id, currentChatContact.name)');

// Neutral fallback avatar only.
src = src.replace(/'david-34\.png'/g, "'lyann-avatar-placeholder.svg'");

fs.writeFileSync(file, src, 'utf8');
console.log('Legacy chat owner retired successfully.');
