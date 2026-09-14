const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'chat-logic.js');
let src = fs.readFileSync(file, 'utf8');

function replaceRequired(regex, replacement, label) {
  if (!regex.test(src)) throw new Error(`Messaging surface migration pattern missing: ${label}`);
  src = src.replace(regex, replacement);
}

// Reporting must never fabricate a successful local report.
replaceRequired(
  /window\.openReportModal = function\(targetName = null\) \{[\s\S]*?\n\};\nlet currentChatContact/,
`window.openReportModal = function(targetName = null) {
    const reportModal = document.getElementById('reportModal');
    const nameToReport = targetName || (currentChatContact ? currentChatContact.name : 'ce membre');
    if (!reportModal) {
        console.error('[REPORT] report surface unavailable; no local fallback is permitted');
        if (window.lyannAlert) window.lyannAlert('Le signalement est momentanément indisponible. Réessayez plus tard.');
        return false;
    }
    reportModal.setAttribute('data-target-user', nameToReport);
    const modalTitle = reportModal.querySelector('.step-title');
    if (modalTitle) modalTitle.textContent = \`Signaler \${nameToReport}\`;
    if (window.LYANN_SURFACES) {
        window.LYANN_SURFACES.register('report', { element: 'reportModal', mode: 'major', hideBottomNav: true, lockBody: true });
        window.LYANN_SURFACES.open('report');
    } else {
        reportModal.classList.add('active');
        reportModal.style.display = 'flex';
    }
    return true;
};
let currentChatContact`,
  'remove local report fallback'
);

// Canonical child-surface helper: old handlers may remain, but visibility has one owner.
replaceRequired(
  /function closeAllOverlays\(\) \{[\s\S]*?\n\}\n\nfunction setChatContextCoveredByOverlay/,
`function closeAllOverlays() {
    if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.hideAllChildSurfaces === 'function') {
        window.LYANN_MESSAGING.hideAllChildSurfaces();
        setChatContextCoveredByOverlay(false);
        return;
    }
    const ids = [
        'chatActionChoicesOverlay', 'chatDirectPriceForm', 'chatMilestoneDevisForm',
        'chatCheckoutOverlay', 'chatTrackingOverlay', 'chatSubmitProofOverlay',
        'chatProposeDateForm', 'chatLeaveReviewForm'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    setChatContextCoveredByOverlay(false);
}

function openChatChildSurface(id) {
    if (!id) return false;
    if (window.LYANN_MESSAGING && typeof window.LYANN_MESSAGING.openChildSurface === 'function') {
        return window.LYANN_MESSAGING.openChildSurface(id);
    }
    const el = document.getElementById(id);
    if (!el) return false;
    el.style.display = 'flex';
    setChatContextCoveredByOverlay(true);
    return true;
}

function setChatContextCoveredByOverlay`,
  'canonical overlay helper'
);

// Internal chat core is a hydrator only; it never owns the shell or navigation state.
replaceRequired(
  /    document\.body\.classList\.add\('hide-bottom-nav'\);\n    document\.body\.classList\.add\('in-chat-active'\);\n    const modal = document\.getElementById\('chatModal'\);\n    if \(!modal\) \{[\s\S]*?        return;\n    \}\n\s*/,
`    const modal = document.getElementById('chatModal');
    if (!modal) {
        console.error('[MESSAGING] chat shell unavailable');
        return false;
    }

`,
  'chat hydrator shell bootstrap'
);

replaceRequired(
  /    \/\/ IMMEDIATE CHAT SHELL: show the conversation before any profile\/network lookup\.[\s\S]*?    document\.querySelectorAll\('\.chat-modal-layout'\)\.forEach\(l => l\.classList\.add\('mobile-conversation-active'\)\);\n/,
`    // Hydrate header immediately, but do not reveal the shell. The canonical
    // messaging controller owns when the fully prepared surface becomes visible.
    const initialHeaderName = document.getElementById('chatHeaderName');
    const initialHeaderAvatar = document.getElementById('chatHeaderAvatar');
    if (initialHeaderName) initialHeaderName.textContent = displayName || 'Membre LYANN';
    if (initialHeaderAvatar && displayAvatar) initialHeaderAvatar.src = displayAvatar;
`,
  'remove first legacy shell reveal'
);

replaceRequired(
  /\n    if \(modal\) \{\n        modal\.removeAttribute\('style'\);\n        modal\.style\.display = 'flex';\n        modal\.classList\.add\('active'\);\n    \}\n    document\.body\.style\.overflow = 'hidden';\n\n    document\.querySelectorAll\('\.chat-modal-layout'\)\.forEach\(l => \{\n        l\.classList\.add\('mobile-conversation-active'\);\n    \}\);/,
`\n    document.querySelectorAll('.chat-modal-layout').forEach(l => {
        l.classList.add('mobile-conversation-active');
    });`,
  'remove second legacy shell reveal'
);

// Mission detail navigation goes through the canonical router.
src = src.replace(
  /btnView\.onclick = \(e\) => \{[\s\S]*?\n                \};/,
`btnView.onclick = (e) => {
                    e.stopPropagation();
                    if (window.LYANN_ROUTER) window.LYANN_ROUTER.go('mission', { requestId: requestContext.requestId });
                    else if (window.LYANN_MESSAGING) window.LYANN_MESSAGING.openMissionFromChat(e, btnView);
                };`
);

// Route registered chat child panes through the canonical messaging surface owner.
const childIds = [
  'chatActionChoicesOverlay',
  'chatDirectPriceForm',
  'chatMilestoneDevisForm',
  'chatCheckoutOverlay',
  'chatTrackingOverlay',
  'chatSubmitProofOverlay',
  'chatProposeDateForm',
  'chatLeaveReviewForm'
];
for (const id of childIds) {
  const varName = id;
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  src = src.replace(new RegExp(`const ${varName} = document\\.getElementById\\('${escaped}'\\);\\n([\\s\\S]{0,220}?)${varName}\\.style\\.display = 'flex';`, 'g'),
    (match, middle) => `const ${varName} = document.getElementById('${id}');\n${middle}openChatChildSurface('${id}');`);
}

// Simple variable names used for child panes.
src = src
  .replace(/const overlay = document\.getElementById\('chatActionChoicesOverlay'\);\n        if \(overlay\) overlay\.style\.display = 'flex';/g,
    "const overlay = document.getElementById('chatActionChoicesOverlay');\n        if (overlay) openChatChildSurface('chatActionChoicesOverlay');")
  .replace(/const overlay = document\.getElementById\('chatProposeDateForm'\);\n            if \(overlay\) overlay\.style\.display = 'flex';/g,
    "const overlay = document.getElementById('chatProposeDateForm');\n            if (overlay) openChatChildSurface('chatProposeDateForm');")
  .replace(/const overlay = document\.getElementById\('chatMilestoneDevisForm'\);\n            if \(overlay\) overlay\.style\.display = 'flex';/g,
    "const overlay = document.getElementById('chatMilestoneDevisForm');\n            if (overlay) openChatChildSurface('chatMilestoneDevisForm');")
  .replace(/overlay\.style\.display = 'flex';\n            setChatContextCoveredByOverlay\(true\);/g,
    "openChatChildSurface(overlay.id);\n            setChatContextCoveredByOverlay(true);");

fs.writeFileSync(file, src, 'utf8');
console.log('Messaging surface ownership migration applied.');
