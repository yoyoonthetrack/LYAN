// ==========================================================================
// LYANN CUSTOM DIALOG SYSTEM
// ==========================================================================

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
