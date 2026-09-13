const fs = require('fs');
const file = 'script.js';
let source = fs.readFileSync(file, 'utf8');
const before = source;

// Register the Lyann detail modal with the canonical surface manager once it exists.
source = source.replace(
  "        document.body.appendChild(modal);\n\n        modal.addEventListener('click', (e) => {",
  "        document.body.appendChild(modal);\n        if (window.LYANN_SURFACES) {\n            window.LYANN_SURFACES.register('lyann-detail', {\n                element: modal,\n                mode: 'child',\n                hideBottomNav: true,\n                lockBody: true\n            });\n        }\n\n        modal.addEventListener('click', (e) => {"
);

// Backdrop close should delegate lifecycle/body state to the surface manager.
source = source.replace(
  "            if (e.target === modal) {\n                modal.style.display = 'none';\n                modal.classList.remove('active');\n                document.body.style.overflow = '';\n            }",
  "            if (e.target === modal) {\n                if (window.LYANN_SURFACES?.isOpen?.('lyann-detail')) window.LYANN_SURFACES.close('lyann-detail', { reason: 'backdrop' });\n                else {\n                    modal.style.display = 'none';\n                    modal.classList.remove('active');\n                    document.body.style.overflow = '';\n                }\n            }"
);

// Opening now goes through the canonical surface stack when available.
source = source.replace(
  "    modal.style.display = 'flex';\n    modal.classList.add('active');\n    document.body.style.overflow = 'hidden';",
  "    if (window.LYANN_SURFACES) {\n        window.LYANN_SURFACES.register('lyann-detail', { element: modal, mode: 'child', hideBottomNav: true, lockBody: true });\n        window.LYANN_SURFACES.open('lyann-detail', { requestId });\n    } else {\n        modal.style.display = 'flex';\n        modal.classList.add('active');\n        document.body.style.overflow = 'hidden';\n    }"
);

// Close button also delegates to the canonical stack.
source = source.replace(
  "        closeBtn.onclick = () => {\n            modal.style.display = 'none';\n            modal.classList.remove('active');\n            document.body.style.overflow = '';\n        };",
  "        closeBtn.onclick = () => {\n            if (window.LYANN_SURFACES?.isOpen?.('lyann-detail')) window.LYANN_SURFACES.close('lyann-detail', { reason: 'close-button' });\n            else {\n                modal.style.display = 'none';\n                modal.classList.remove('active');\n                document.body.style.overflow = '';\n            }\n        };"
);

if (source === before) {
  console.log('Lyann detail surface already canonical or markers changed.');
  process.exit(0);
}

fs.writeFileSync(file, source, 'utf8');
console.log('Migrated Lyann detail modal lifecycle to LYANN_SURFACES.');
