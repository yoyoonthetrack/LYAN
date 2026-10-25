/* LYANN — squelettes de chargement partagés (Web, iOS, Android).
 * Les données arrivent après le premier affichage : sans squelette, l'écran
 * montre une boîte vide puis saute à la hauteur des vraies cartes. Un squelette
 * qui clignote étant pire que rien, il n'apparaît qu'au-delà d'un seuil.
 */
(function () {
    'use strict';

    const SHOW_AFTER_MS = 200;
    const timers = new WeakMap();

    function line(width, modifier) {
        return `<span class="lyann-skel-line${modifier ? ' ' + modifier : ''}" style="width:${width}"></span>`;
    }

    // The shapes mirror the text card, the most frequent one. A media card has
    // a variable height since it keeps the shape of the photo or video, so the
    // skeleton deliberately does not pretend to know it.
    function bokantajCard() {
        return `<article class="lyann-skel lyann-skel-bokantaj" aria-hidden="true">
            <div class="lyann-skel-head">
                <span class="lyann-skel-avatar"></span>
                <div class="lyann-skel-head-text">${line('42%')}${line('28%', 'is-small')}</div>
            </div>
            <span class="lyann-skel-pill"></span>
            ${line('92%')}${line('74%')}
            <div class="lyann-skel-actions">
                <span class="lyann-skel-chip"></span>
                <span class="lyann-skel-chip"></span>
                <span class="lyann-skel-chip"></span>
            </div>
        </article>`;
    }

    function profileCard() {
        return `<article class="lyann-skel lyann-skel-profile" aria-hidden="true">
            <div class="lyann-skel-head">
                <span class="lyann-skel-avatar is-large"></span>
                <div class="lyann-skel-head-text">${line('58%')}${line('36%', 'is-small')}</div>
            </div>
            ${line('88%')}${line('66%')}
            <div class="lyann-skel-actions">
                <span class="lyann-skel-chip"></span>
                <span class="lyann-skel-chip"></span>
            </div>
            <span class="lyann-skel-button"></span>
        </article>`;
    }

    function annonceCard() {
        return `<article class="lyann-skel lyann-skel-annonce" aria-hidden="true">
            <div class="lyann-skel-actions">
                <span class="lyann-skel-pill"></span>
                <span class="lyann-skel-pill is-small"></span>
            </div>
            ${line('76%', 'is-title')}
            ${line('94%')}${line('58%')}
            <span class="lyann-skel-button"></span>
        </article>`;
    }

    const KINDS = {
        bokantaj: bokantajCard,
        profile: profileCard,
        annonce: annonceCard
    };

    function clear(container) {
        if (!container) return;
        const timer = timers.get(container);
        if (timer) {
            window.clearTimeout(timer);
            timers.delete(container);
        }
        if (container.dataset.skeleton === '1') {
            delete container.dataset.skeleton;
            container.removeAttribute('aria-busy');
            // The skeleton owns the whole container, so emptying it here keeps
            // callers that render nothing on an empty result from leaving it up.
            container.innerHTML = '';
        }
    }

    function show(container, kind, count) {
        const build = KINDS[kind];
        if (!container || !build) return;
        clear(container);
        const total = Math.max(1, Number(count) || 3);
        const timer = window.setTimeout(() => {
            timers.delete(container);
            container.dataset.skeleton = '1';
            container.setAttribute('aria-busy', 'true');
            container.innerHTML = '<span class="lyann-skel-status" role="status">Chargement…</span>'
                + Array.from({ length: total }, build).join('');
        }, SHOW_AFTER_MS);
        timers.set(container, timer);
    }

    window.LYANN_SKELETON = { show, clear, SHOW_AFTER_MS };
})();
