const fs = require('fs');
const file = 'script.js';
let source = fs.readFileSync(file, 'utf8');
const before = source;

function replaceExact(from, to) {
  if (!source.includes(from)) return false;
  source = source.split(from).join(to);
  return true;
}

function removeBetween(startMarker, endMarker, replacement = '') {
  const start = source.indexOf(startMarker);
  if (start === -1) return false;
  const end = source.indexOf(endMarker, start);
  if (end === -1 || end <= start) throw new Error(`Unable to bound section: ${startMarker}`);
  source = source.slice(0, start) + replacement + source.slice(end);
  return true;
}

removeBetween(
  '/* ==========================================================================\n   SIMULATED TRANSACTION CHAT (BOKANTAJ JOB FLOW)',
  "if (document.readyState === 'loading') {",
  ''
);
removeBetween(
  '    let INITIAL_FLASH_POSTS = [',
  '    let currentFlashPosts = [];',
  '    const INITIAL_FLASH_POSTS = [];\n\n'
);

// Public profile CTA.
source = source.replace(
  /onclick="window\.openChatWithUser\('\$\{chatContactName\}', '\$\{chatAvatarSrc\}', '\$\{chatContactId\}'\)"/g,
  'data-lyann-route="messages" data-contact-id="${chatContactId}" data-contact-name="${chatContactName}"'
);
replaceExact(
`                if (publicMemberProfileModal) publicMemberProfileModal.classList.remove('active');
                openChatWithUser(currentVisitingMember.name, currentVisitingMember.avatar);`,
`                if (publicMemberProfileModal) publicMemberProfileModal.classList.remove('active');
                window.LYANN_ROUTER?.go?.('messages', {
                    contactId: currentVisitingMember.id || currentVisitingMember.user_id,
                    name: currentVisitingMember.name
                });`
);

// Need/feed/contact actions.
replaceExact(
`                if (typeof window.openChatWithUser === 'function') {
                    window.openChatWithUser(requesterName, requesterAvatar, requesterId, initialNeed);
                }`,
`                if (requesterId) {
                    window.LYANN_ROUTER?.go?.('messages', {
                        contactId: requesterId,
                        name: requesterName,
                        requestId: reqId,
                        initialNeed
                    });
                }`
);
replaceExact(
`                openChatWithUser(name, avatar, name, initialNeed);`,
`                window.LYANN_ROUTER?.go?.('messages', {
                    contactId: name,
                    name,
                    initialNeed
                });`
);
replaceExact(
`                    openChatWithUser(currentQuickMember.name, currentQuickMember.avatar, currentQuickMember.name, {
                        requesterId: getMyId(),
                        helperId: currentQuickMember.name,
                        title: needTitle
                    });`,
`                    window.LYANN_ROUTER?.go?.('messages', {
                        contactId: currentQuickMember.id || currentQuickMember.user_id || currentQuickMember.name,
                        name: currentQuickMember.name,
                        initialNeed: {
                            requesterId: getMyId(),
                            helperId: currentQuickMember.id || currentQuickMember.user_id || currentQuickMember.name,
                            title: needTitle
                        }
                    });`
);
replaceExact(
`                    openChatWithUser(currentQuickMember.name, currentQuickMember.avatar);`,
`                    window.LYANN_ROUTER?.go?.('messages', {
                        contactId: currentQuickMember.id || currentQuickMember.user_id || currentQuickMember.name,
                        name: currentQuickMember.name
                    });`
);
replaceExact(
`                        if (typeof window.openChatWithUser === 'function') {
                            window.openChatWithUser(p.requesterName, p.requesterAvatar, p.requesterId, initialNeed);
                        }`,
`                        if (p.requesterId) {
                            window.LYANN_ROUTER?.go?.('messages', {
                                contactId: p.requesterId,
                                name: p.requesterName,
                                requestId: p.reqId,
                                initialNeed
                            });
                        }`
);
replaceExact(
`                if (typeof window.openChatWithUser === 'function') {
                    window.openChatWithUser(authorName, authorAvatar, requestData.requester_id, initialNeed);
                }`,
`                if (requestData.requester_id) {
                    window.LYANN_ROUTER?.go?.('messages', {
                        contactId: requestData.requester_id,
                        name: authorName,
                        requestId: requestData.id,
                        initialNeed
                    });
                }`
);

// Invitation actions.
replaceExact(
`                    // Open chat with user
                    if (typeof window.openChatWithUser === 'function') {
                        await window.openChatWithUser(requesterName, 'david-34.png', requesterId, { title: reqTitle });
                    }`,
`                    if (requesterId) {
                        await window.LYANN_ROUTER?.go?.('messages', { contactId: requesterId, name: requesterName, title: reqTitle });
                    }`
);
replaceExact(
`                if (typeof window.openChatWithUser === 'function') {
                    await window.openChatWithUser(requesterName, 'david-34.png', requesterId);
                }`,
`                if (requesterId) {
                    await window.LYANN_ROUTER?.go?.('messages', { contactId: requesterId, name: requesterName });
                }`
);

// Drawer and notification entry points must not own chat UI.
replaceExact(
`        if (drawerLink.classList.contains('open-chat-trigger')) {
            e.preventDefault();
            if (typeof window.openLyannChatModal === 'function') {
                window.openLyannChatModal();
            } else {
                window.location.href = 'index.html?action=openchat';
            }
            return;
        }`,
`        if (drawerLink.classList.contains('open-chat-trigger')) {
            e.preventDefault();
            window.LYANN_ROUTER?.go?.('messages');
            return;
        }`
);

// Deep-link chat is owned once by app-router.js. Preserve only auth/account deep links here.
const legacyOpenChatStart = source.indexOf('    // Auto-ouvrir la discussion si le paramètre URL est présent');
if (legacyOpenChatStart !== -1) {
  const nextBranchText = "    } else if (chatActionParam === 'email_confirmed' || urlParams.has('confirmed')) {";
  const nextBranch = source.indexOf(nextBranchText, legacyOpenChatStart);
  if (nextBranch === -1) throw new Error('Unable to isolate legacy openchat deep-link branch');
  const prefix = `    // Account/auth deep links remain local; chat deep links are owned by LYANN_ROUTER.\n    const urlParams = new URLSearchParams(window.location.search);\n    const chatActionParam = urlParams.get('action');\n    if (chatActionParam === 'email_confirmed' || urlParams.has('confirmed')) {`;
  source = source.slice(0, legacyOpenChatStart) + prefix + source.slice(nextBranch + nextBranchText.length);
}

source = source.replace(
  /\n\s*setTimeout\(\(\) => \{\n\s*console\.log\('FINAL \+500ms :'[\s\S]*?\n\s*\}, 500\);\n\n\s*setTimeout\(\(\) => \{\n\s*console\.log\('FINAL \+1500ms :'[\s\S]*?\n\s*\}, 1500\);/g,
  ''
);

if (source === before) {
  console.log('Canonical public chat routing already applied.');
  process.exit(0);
}
fs.writeFileSync(file, source, 'utf8');
console.log('Routed public chat entry points through LYANN_ROUTER and retired runtime demo fallbacks.');
