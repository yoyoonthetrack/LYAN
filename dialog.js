// ==========================================================================
// LYANN CUSTOM DIALOG SYSTEM
// ==========================================================================

// Dynamically inject dialog markup if missing on the page
function ensureDialogMarkup() {
    let overlay = document.getElementById('lyannDialogOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'lyannDialogOverlay';
        overlay.style.cssText = 'z-index: 10000; display: none; align-items: center; justify-content: center;';
        overlay.innerHTML = `
            <div class="lyann-dialog-card">
                <div class="lyann-dialog-icon" id="lyannDialogIcon">
                    <i class="ph ph-info"></i>
                </div>
                <h3 class="lyann-dialog-title" id="lyannDialogTitle">Information</h3>
                <p class="lyann-dialog-message" id="lyannDialogMessage">Message text goes here.</p>
                
                <div id="lyannDialogInputContainer" style="display: none; margin-top: 16px; width: 100%;">
                    <input type="text" id="lyannDialogInput" class="modal-input" placeholder="Votre réponse..." style="width: 100%;">
                </div>
                
                <div class="lyann-dialog-actions" id="lyannDialogActions">
                    <!-- Buttons injected dynamically -->
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }
}

window.lyannAlert = function(message, type = 'info') {
    return new Promise((resolve) => {
        showDialog({
            type: type,
            title: getTitleForType(type),
            message: message,
            showInput: false,
            buttons: [
                { text: 'Compris', style: 'btn-primary', onClick: () => resolve(true) }
            ]
        });
    });
};

window.lyannConfirm = function(message, type = 'warning') {
    return new Promise((resolve) => {
        showDialog({
            type: type,
            title: getTitleForType(type),
            message: message,
            showInput: false,
            buttons: [
                { text: 'Annuler', style: 'btn-outline', onClick: () => resolve(false) },
                { text: 'Confirmer', style: 'btn-primary', onClick: () => resolve(true) }
            ]
        });
    });
};

window.lyannPrompt = function(message, type = 'info') {
    return new Promise((resolve) => {
        showDialog({
            type: type,
            title: getTitleForType(type),
            message: message,
            showInput: true,
            buttons: [
                { text: 'Annuler', style: 'btn-outline', onClick: () => resolve(null) },
                { text: 'Valider', style: 'btn-primary', onClick: (val) => resolve(val || '') }
            ]
        });
    });
};

function getTitleForType(type) {
    if (type === 'success') return 'Succès';
    if (type === 'warning') return 'Attention';
    return 'Information';
}

function showDialog({ type, title, message, showInput, buttons }) {
    ensureDialogMarkup();

    const overlay = document.getElementById('lyannDialogOverlay');
    const iconEl = document.getElementById('lyannDialogIcon');
    const titleEl = document.getElementById('lyannDialogTitle');
    const messageEl = document.getElementById('lyannDialogMessage');
    const inputContainer = document.getElementById('lyannDialogInputContainer');
    const inputEl = document.getElementById('lyannDialogInput');
    const actionsEl = document.getElementById('lyannDialogActions');

    if (!overlay) return;

    // Set Icon
    iconEl.className = 'lyann-dialog-icon ' + type;
    if (type === 'success') iconEl.innerHTML = '<i class="ph ph-check"></i>';
    else if (type === 'warning') iconEl.innerHTML = '<i class="ph ph-warning"></i>';
    else iconEl.innerHTML = '<i class="ph ph-info"></i>';

    // Set Content
    titleEl.textContent = title;
    messageEl.textContent = message;

    // Set Input
    if (showInput) {
        inputContainer.style.display = 'block';
        inputEl.value = '';
        setTimeout(() => inputEl.focus(), 100);
    } else {
        inputContainer.style.display = 'none';
    }

    // Set Buttons
    actionsEl.innerHTML = '';
    buttons.forEach(btnConf => {
        const btn = document.createElement('button');
        btn.className = `btn ${btnConf.style}`;
        btn.textContent = btnConf.text;
        btn.onclick = () => {
            overlay.style.display = 'none';
            if (showInput && btnConf.text === 'Valider') {
                btnConf.onClick(inputEl.value);
            } else {
                btnConf.onClick();
            }
        };
        actionsEl.appendChild(btn);
    });

    // Show Overlay
    overlay.style.display = 'flex';
}
