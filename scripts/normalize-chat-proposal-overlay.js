const fs = require('fs');

const file = 'chat-logic.js';
let source = fs.readFileSync(file, 'utf8');

if (!source.includes('function setChatContextCoveredByOverlay(isCovered)')) {
  const anchor = 'function getLocalChatMessages(contactId) {';
  if (!source.includes(anchor)) throw new Error('chat helper anchor not found');
  const helper = `function setChatContextCoveredByOverlay(isCovered) {\n    const banner = document.getElementById('chatMissionContextBar') || document.getElementById('chatMissionContext');\n    if (!banner) return;\n    if (isCovered) {\n        if (!banner.dataset.overlayPreviousDisplay) {\n            banner.dataset.overlayPreviousDisplay = banner.style.display || '';\n        }\n        banner.style.display = 'none';\n    } else {\n        const previous = banner.dataset.overlayPreviousDisplay;\n        if (previous !== undefined) {\n            banner.style.display = previous;\n            delete banner.dataset.overlayPreviousDisplay;\n        }\n    }\n}\n\n`;
  source = source.replace(anchor, helper + anchor);
}

const closeAnchor = `    ids.forEach(id => {\n        const el = document.getElementById(id);\n        if (el) el.style.display = 'none';\n    });\n}`;
if (source.includes(closeAnchor) && !source.includes('setChatContextCoveredByOverlay(false);\n}')) {
  source = source.replace(closeAnchor, `    ids.forEach(id => {\n        const el = document.getElementById(id);\n        if (el) el.style.display = 'none';\n    });\n    setChatContextCoveredByOverlay(false);\n}`);
}

const actionOpen = `        if (chatActionChoicesOverlay) {\n            chatActionChoicesOverlay.style.display = 'flex';\n        }`;
if (source.includes(actionOpen) && !source.includes(`chatActionChoicesOverlay.style.display = 'flex';\n            setChatContextCoveredByOverlay(true);`)) {
  source = source.replace(actionOpen, `        if (chatActionChoicesOverlay) {\n            chatActionChoicesOverlay.style.display = 'flex';\n            setChatContextCoveredByOverlay(true);\n        }`);
}

const directOpen = `            if (chatDirectPriceForm) chatDirectPriceForm.style.display = 'flex';`;
if (source.includes(directOpen) && !source.includes(`if (chatDirectPriceForm) {\n                chatDirectPriceForm.style.display = 'flex';`)) {
  source = source.replace(directOpen, `            if (chatDirectPriceForm) {\n                chatDirectPriceForm.style.display = 'flex';\n                setChatContextCoveredByOverlay(true);\n                const firstRequired = chatDirectPriceForm.querySelector('[required]');\n                if (firstRequired) requestAnimationFrame(() => firstRequired.focus());\n            }`);
}

const milestoneOpen = `            if (chatMilestoneDevisForm) chatMilestoneDevisForm.style.display = 'flex';`;
if (source.includes(milestoneOpen) && !source.includes(`if (chatMilestoneDevisForm) {\n                chatMilestoneDevisForm.style.display = 'flex';`)) {
  source = source.replace(milestoneOpen, `            if (chatMilestoneDevisForm) {\n                chatMilestoneDevisForm.style.display = 'flex';\n                setChatContextCoveredByOverlay(true);\n                const firstRequired = chatMilestoneDevisForm.querySelector('[required]');\n                if (firstRequired) requestAnimationFrame(() => firstRequired.focus());\n            }`);
}

fs.writeFileSync(file, source);
console.log('Chat proposal overlays normalized above mission context.');
