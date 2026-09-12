const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const scriptPath = path.join(root, 'script.js');
let script = fs.readFileSync(scriptPath, 'utf8');
let changed = false;

const profileAwait = "        const profileBundle = await window.LYANN_PROFILE_REPOSITORY.load(memberId);";
if (!script.includes('PROFILE INTERACTION: open shell before data round-trip')) {
  if (!script.includes(profileAwait)) {
    throw new Error('Profile repository await marker not found');
  }

  const profileReplacement = `        // PROFILE INTERACTION: open shell before data round-trip.\n        const profileLoadingHost = publicMemberProfileModal\n            ? (publicMemberProfileModal.querySelector('.modal-card') || publicMemberProfileModal)\n            : null;\n        let profileLoadingOverlay = null;\n\n        if (publicMemberProfileModal) {\n            if (searchResultsModal) searchResultsModal.classList.remove('active');\n            publicMemberProfileModal.classList.add('active');\n            publicMemberProfileModal.setAttribute('aria-busy', 'true');\n            document.body.style.overflow = 'hidden';\n\n            if (profileLoadingHost) {\n                if (window.getComputedStyle && window.getComputedStyle(profileLoadingHost).position === 'static') {\n                    profileLoadingHost.style.position = 'relative';\n                }\n                profileLoadingOverlay = profileLoadingHost.querySelector('.lyann-profile-loading-overlay');\n                if (!profileLoadingOverlay) {\n                    profileLoadingOverlay = document.createElement('div');\n                    profileLoadingOverlay.className = 'lyann-profile-loading-overlay';\n                    profileLoadingOverlay.setAttribute('role', 'status');\n                    profileLoadingOverlay.setAttribute('aria-live', 'polite');\n                    profileLoadingOverlay.innerHTML = '<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; min-height:220px; padding:32px;"><i class="ph ph-circle-notch spin" style="font-size:1.7rem; color:#4A7C59;"></i><span style="font-size:0.9rem; font-weight:700; color:#475569;">Chargement du profil…</span></div>';\n                    profileLoadingOverlay.style.cssText = 'position:absolute;inset:0;z-index:60;background:#fff;border-radius:inherit;display:flex;align-items:center;justify-content:center;';\n                    profileLoadingHost.appendChild(profileLoadingOverlay);\n                }\n            }\n        }\n\n        let profileBundle;\n        try {\n            profileBundle = await window.LYANN_PROFILE_REPOSITORY.load(memberId);\n        } catch (error) {\n            if (profileLoadingOverlay) profileLoadingOverlay.remove();\n            if (publicMemberProfileModal) publicMemberProfileModal.setAttribute('aria-busy', 'false');\n            throw error;\n        }\n\n        if (profileLoadingOverlay) profileLoadingOverlay.remove();\n        if (publicMemberProfileModal) publicMemberProfileModal.setAttribute('aria-busy', 'false');`;

  script = script.replace(profileAwait, profileReplacement);
  changed = true;
}

const filterBlock = `    // 1. Open Filter Sheet\n    if (btnOpenFilterSheet && filterSheetModal) {\n        btnOpenFilterSheet.addEventListener('click', (e) => {\n            e.preventDefault();\n            filterSheetModal.classList.add('active');\n            filterSheetModal.style.display = 'flex';\n            document.body.classList.add('sheet-open');\n        });\n    }`;

if (!script.includes('FILTER INTERACTION: pointer-up opens the sheet without waiting for click synthesis')) {
  if (!script.includes(filterBlock)) {
    throw new Error('Bokantaj filter open block marker not found');
  }

  const filterReplacement = `    // 1. Open Filter Sheet\n    const openBokantajFilterSheetNow = (e) => {\n        if (e) {\n            e.preventDefault();\n            e.stopPropagation();\n        }\n        filterSheetModal.style.display = 'flex';\n        filterSheetModal.classList.add('active');\n        filterSheetModal.setAttribute('aria-hidden', 'false');\n        document.body.classList.add('sheet-open');\n    };\n\n    // FILTER INTERACTION: pointer-up opens the sheet without waiting for click synthesis.\n    if (btnOpenFilterSheet && filterSheetModal) {\n        let lastFilterPointerOpen = 0;\n        btnOpenFilterSheet.addEventListener('pointerup', (e) => {\n            lastFilterPointerOpen = Date.now();\n            openBokantajFilterSheetNow(e);\n        }, { passive: false });\n\n        // Keyboard / older browser fallback. Pointer-triggered clicks are de-duplicated.\n        btnOpenFilterSheet.addEventListener('click', (e) => {\n            if (Date.now() - lastFilterPointerOpen < 500) {\n                e.preventDefault();\n                e.stopPropagation();\n                return;\n            }\n            openBokantajFilterSheetNow(e);\n        });\n    }`;

  script = script.replace(filterBlock, filterReplacement);
  changed = true;
}

if (!changed) {
  console.log('Immediate profile/filter surface normalization already applied.');
  process.exit(0);
}

fs.writeFileSync(scriptPath, script, 'utf8');
console.log('Normalized profile and Bokantaj filter surfaces for immediate visual response.');
