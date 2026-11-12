/* LYANN — Invitation visiteur « Envie d'en savoir plus ? » (phase 3.2C-2).
 *
 * Lire, chercher et filtrer restent publics. Ouvrir une fiche (Lyanneur, annonce), contacter ou ajouter aux favoris demande un compte :
 * app-router.js (requireAuthForInteraction) ouvre ce dialogue à la place de la fenêtre de connexion seule, après avoir mémorisé
 * l'intention (fiche demandée). Après connexion, le routeur rouvre la fiche (resumeAuthIntent).
 *
 * Ce composant est une présentation : il n'authentifie personne et ne remplace aucun contrôle serveur (API, RLS).
 * « Créer mon compte » / « Me connecter » conservent l'intention ; « Continuer à explorer », la croix, Échap et le fond l'annulent. */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LYANN_VISITOR_GATE = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const COPY = Object.freeze({
        title: 'Envie d\'en savoir plus ?',
        text: 'Rejoignez LYANN pour découvrir les détails, échanger et profiter des talents près de chez vous.',
        signup: 'Créer mon compte',
        login: 'Me connecter',
        explore: 'Continuer à explorer'
    });
    const ID = 'lyannVisitorGate';
    let opener = null;
    let keyHandler = null;

    const doc = () => (typeof document !== 'undefined' ? document : null);

    function build() {
        const d = doc();
        const el = d.createElement('div');
        el.id = ID;
        el.className = 'lyann-vgate';
        el.hidden = true;
        el.innerHTML = '<div class="lyann-vgate-backdrop" data-vgate="dismiss"></div>'
            + '<div class="lyann-vgate-card" role="dialog" aria-modal="true" aria-labelledby="lyannVgateTitle" aria-describedby="lyannVgateText" tabindex="-1">'
            + '<span class="lyann-vgate-grab" aria-hidden="true"></span>'
            + '<button type="button" class="lyann-vgate-x" data-vgate="dismiss" aria-label="Fermer">'
            + '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg></button>'
            + '<span class="lyann-vgate-art" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">'
            + '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.500 2.700-6 6-6s6 2.500 6 6"/><circle cx="17.500" cy="9.500" r="2.300"/><path d="M16.200 14.300c3 0 4.800 2 4.800 4.700"/></svg></span>'
            + `<h2 id="lyannVgateTitle" class="lyann-vgate-title">${COPY.title}</h2>`
            + `<p id="lyannVgateText" class="lyann-vgate-text">${COPY.text}</p>`
            + `<button type="button" class="lyann-vgate-primary" data-vgate="signup">${COPY.signup}</button>`
            + `<button type="button" class="lyann-vgate-secondary" data-vgate="login">${COPY.login}</button>`
            + `<button type="button" class="lyann-vgate-link" data-vgate="dismiss">${COPY.explore}</button>`
            + '</div>';
        el.addEventListener('click', (event) => {
            const target = event.target.closest('[data-vgate]');
            if (!target) return;
            const action = target.getAttribute('data-vgate');
            if (action === 'dismiss') close({ cancelIntent: true });
            else if (action === 'signup' || action === 'login') proceed(action);
        });
        d.body.appendChild(el);
        return el;
    }

    function focusables(el) {
        return [...el.querySelectorAll('button:not([disabled])')].filter((b) => b.offsetParent !== null || b === doc().activeElement);
    }

    function open(action, context) {
        const d = doc();
        if (!d || !d.body) return false;
        let el = d.getElementById(ID) || build();
        opener = d.activeElement && d.activeElement !== d.body ? d.activeElement : null;
        el.setAttribute('data-gate-for', String(action || '')); // jamais data-action : app-router traite [data-action="favorite"] comme un contrôle protégé
        el.hidden = false;
        d.body.classList.add('lyann-vgate-open');
        requestAnimationFrame(() => el.classList.add('is-open'));
        keyHandler = (event) => {
            if (event.key === 'Escape') { event.preventDefault(); close({ cancelIntent: true }); return; }
            if (event.key !== 'Tab') return;
            const items = focusables(el);
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && d.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && d.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        d.addEventListener('keydown', keyHandler, true);
        const primary = el.querySelector('[data-vgate="signup"]');
        if (primary) primary.focus({ preventScroll: true });
        return true;
    }

    function hide() {
        const d = doc();
        const el = d && d.getElementById(ID);
        if (el) { el.classList.remove('is-open'); el.hidden = true; }
        if (d) {
            d.body.classList.remove('lyann-vgate-open');
            if (keyHandler) d.removeEventListener('keydown', keyHandler, true);
        }
        keyHandler = null;
    }

    /** Ferme l'invitation. `cancelIntent` : le visiteur renonce, la fiche demandée n'est plus rouverte après une connexion ultérieure. */
    function close(options = {}) {
        hide();
        if (options.cancelIntent) root.LYANN_ROUTER?.cancelAuthIntent?.();
        if (opener && typeof opener.focus === 'function' && doc().contains(opener)) { try { opener.focus({ preventScroll: true }); } catch (_) { /* ignore */ } }
        opener = null;
    }

    function proceed(mode) {
        hide();
        opener = null;
        // L'intention (fiche demandée) est conservée : la connexion ou l'inscription la reprend.
        if (typeof root.setAuthModalMode === 'function') root.setAuthModalMode(mode === 'signup' ? 'signup' : 'login');
        else if (mode === 'signup' && typeof root.openOnboarding === 'function') root.openOnboarding();
        else if (typeof root.openLoginModal === 'function') root.openLoginModal();
    }

    const isOpen = () => { const el = doc() && doc().getElementById(ID); return Boolean(el && !el.hidden); };

    return Object.freeze({ COPY, open, close, isOpen });
});
