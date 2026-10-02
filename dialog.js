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
        overlay.style.cssText = 'z-index: 1000001; display: none; align-items: center; justify-content: center;';
        overlay.innerHTML = `
            <div class="lyann-dialog-card">
                <div class="lyann-dialog-icon" id="lyannDialogIcon">
                    <i class="ph ph-info"></i>
                </div>
                <h3 class="lyann-dialog-title" id="lyannDialogTitle">Information</h3>
                <p class="lyann-dialog-message" id="lyannDialogMessage"></p>
                
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

const LYANN_TECHNICAL_ERROR = /(violates|constraint|duplicate key|null value|syntax error|relation "|column "|function [a-z_]+\(|PGRST|JWT|jwt|permission denied|row-level security|TypeError|ReferenceError|undefined|NetworkError|Failed to fetch|Load failed|fetch failed|ECONN|status code|Internal Server Error|StripeError|sk_live|sk_test|Unexpected token|is not a function|Cannot read prop)/;

window.lyannSanitizeUserMessage = function(message) {
    const text = String(message == null ? '' : message);
    if (!LYANN_TECHNICAL_ERROR.test(text)) return text;
    const network = /(NetworkError|Failed to fetch|Load failed|fetch failed|ECONN)/.test(text);
    const generic = network
        ? 'Connexion impossible. Vérifiez votre réseau et réessayez.'
        : 'Une erreur est survenue. Réessayez dans un instant.';
    const prefix = text.split(/\s*:\s*/)[0];
    if (prefix && prefix !== text && prefix.length <= 80 && !LYANN_TECHNICAL_ERROR.test(prefix)) {
        return `${prefix.replace(/^[^\p{L}]+/u, '')}. ${generic}`;
    }
    return generic;
};

const LYANN_TOAST_ICONS = { success: 'ph-check-circle', warning: 'ph-warning-circle', error: 'ph-x-circle', info: 'ph-info' };
const LYANN_TOAST_COLORS = { success: '#7FC79A', warning: '#F2C14E', error: '#F28B82', info: '#FAF7F2' };

window.lyannToast = function(message, type = 'info') {
    if (!message || !document.body) return;
    const kind = LYANN_TOAST_ICONS[type] ? type : 'info';
    let container = document.getElementById('lyanToastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'lyanToastContainer';
        container.setAttribute('role', 'status');
        container.setAttribute('aria-live', 'polite');
        container.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(88px + env(safe-area-inset-bottom, 0px));z-index:1000002;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;width:min(92vw,420px);';
        document.body.appendChild(container);
    }
    while (container.children.length >= 3) container.firstChild.remove();

    const toast = document.createElement('div');
    toast.style.cssText = 'background:#1E2822;color:#FAF7F2;padding:12px 18px;border-radius:16px;font-weight:600;font-size:0.9rem;line-height:1.35;box-shadow:0 10px 30px rgba(0,0,0,0.25);display:flex;align-items:center;gap:10px;opacity:0;transform:translateY(12px);transition:opacity .25s ease,transform .25s ease;pointer-events:auto;max-width:100%;';
    const icon = document.createElement('i');
    icon.className = `ph-fill ${LYANN_TOAST_ICONS[kind]}`;
    icon.style.cssText = `color:${LYANN_TOAST_COLORS[kind]};font-size:1.15rem;flex-shrink:0;`;
    const text = document.createElement('span');
    text.textContent = window.lyannSanitizeUserMessage(message);
    toast.append(icon, text);
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(12px)';
        setTimeout(() => toast.remove(), 300);
    }, kind === 'error' || kind === 'warning' ? 4500 : 3000);
};

if (typeof window.showToast !== 'function') {
    window.showToast = (message, type = 'info') => window.lyannToast(message, type);
}
window.NotificationService = window.NotificationService || {};
if (typeof window.NotificationService.showToast !== 'function') {
    window.NotificationService.showToast = (type, message) => window.lyannToast(message, type);
}

window.openLyannPasswordRecovery = function() {
    if (document.getElementById('lyannPasswordRecoveryOverlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'lyannPasswordRecoveryOverlay';
    overlay.style.cssText = 'z-index: 1000001; display: flex; align-items: center; justify-content: center;';
    overlay.innerHTML = `
        <form class="lyann-dialog-card" id="lyannPasswordRecoveryForm" novalidate>
            <div class="lyann-dialog-icon info"><i class="ph ph-lock-key"></i></div>
            <h3 class="lyann-dialog-title">Nouveau mot de passe</h3>
            <p class="lyann-dialog-message">Choisissez un nouveau mot de passe d'au moins 8 caractères.</p>
            <div style="margin-top: 16px; width: 100%; display: grid; gap: 10px;">
                <input type="password" id="lyannRecoveryPassword" class="modal-input" placeholder="Nouveau mot de passe" autocomplete="new-password" minlength="8" required style="width: 100%;">
                <input type="password" id="lyannRecoveryPasswordConfirm" class="modal-input" placeholder="Confirmer le mot de passe" autocomplete="new-password" minlength="8" required style="width: 100%;">
                <p id="lyannRecoveryError" role="alert" style="display:none; margin:0; color:#B42318; font-size:0.85rem; font-weight:600;"></p>
            </div>
            <div class="lyann-dialog-actions">
                <button type="button" class="btn btn-outline" id="lyannRecoveryCancel">Plus tard</button>
                <button type="submit" class="btn btn-primary" id="lyannRecoverySubmit">Enregistrer</button>
            </div>
        </form>`;
    document.body.appendChild(overlay);

    const close = () => {
        overlay.remove();
        const url = new URL(window.location.href);
        if (url.searchParams.get('action') === 'reset_password') {
            url.searchParams.delete('action');
            window.history.replaceState(window.history.state, '', url.pathname + url.search);
        }
    };
    const errorEl = overlay.querySelector('#lyannRecoveryError');
    const showError = (msg) => { errorEl.textContent = msg; errorEl.style.display = 'block'; };
    overlay.querySelector('#lyannRecoveryCancel').onclick = close;
    overlay.querySelector('#lyannPasswordRecoveryForm').onsubmit = async (event) => {
        event.preventDefault();
        const password = overlay.querySelector('#lyannRecoveryPassword').value;
        const confirm = overlay.querySelector('#lyannRecoveryPasswordConfirm').value;
        if (password.length < 8) return showError('Le mot de passe doit contenir au moins 8 caractères.');
        if (password !== confirm) return showError('Les deux mots de passe ne correspondent pas.');
        const submit = overlay.querySelector('#lyannRecoverySubmit');
        submit.disabled = true;
        submit.textContent = 'Enregistrement…';
        const res = window.LYANN_API_CLIENT && typeof window.LYANN_API_CLIENT.updatePassword === 'function'
            ? await window.LYANN_API_CLIENT.updatePassword(password)
            : { error: { message: 'Service indisponible. Réessayez dans un instant.' } };
        submit.disabled = false;
        submit.textContent = 'Enregistrer';
        if (res && res.error) return showError(res.error.message || 'Le mot de passe n’a pas pu être modifié.');
        close();
        window.lyannToast('Mot de passe modifié. Vous êtes connecté.', 'success');
    };
    setTimeout(() => overlay.querySelector('#lyannRecoveryPassword').focus(), 100);
};

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash || '';
    if (params.get('action') === 'reset_password' || /type=recovery/.test(hash)) {
        window.openLyannPasswordRecovery();
    }
});

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

window.alert = function(message) {
    window.lyannAlert(String(message == null ? '' : message));
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

window.lyannPrompt = function(message, type = 'info', defaultValue = '') {
    return new Promise((resolve) => {
        showDialog({
            type: type,
            title: getTitleForType(type),
            message: message,
            showInput: true,
            defaultValue: defaultValue || '',
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

function showDialog({ type, title, message, showInput, buttons, defaultValue }) {
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
    messageEl.textContent = window.lyannSanitizeUserMessage(message);

    // Set Input
    if (showInput) {
        inputContainer.style.display = 'block';
        inputEl.value = defaultValue || '';
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
            overlay.classList.remove('active');
            overlay.style.display = 'none';
            overlay.setAttribute('aria-hidden', 'true');
            if (showInput && btnConf.text === 'Valider') {
                btnConf.onClick(inputEl.value);
            } else {
                btnConf.onClick();
            }
        };
        actionsEl.appendChild(btn);
    });

    // Show Overlay above chat (z-index 999999) and other .modal-overlay surfaces.
    overlay.classList.add('active');
    overlay.style.display = 'flex';
    overlay.style.setProperty('z-index', '1000001', 'important');
    overlay.setAttribute('aria-hidden', 'false');
}
