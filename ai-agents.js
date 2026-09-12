// LYANN production bootstrap — dependency-free critical Bokantaj UI.
// Intentionally contains no demo personas or synthetic community content.
(function installLyannProductionBootstrap() {
    if (window.__LYANN_PRODUCTION_BOOTSTRAP__) return;
    window.__LYANN_PRODUCTION_BOOTSTRAP__ = true;

    const perf = window.performance;
    const now = () => perf && typeof perf.now === 'function' ? perf.now() : Date.now();
    const diagEnabled = /(?:\?|&)diag=1(?:&|$)/.test(window.location.search || '');
    const diag = window.__LYANN_STARTUP_DIAG__ = {
        enabled: diagEnabled,
        startedMs: Math.round(now()),
        marks: [],
        clicks: []
    };

    function mark(name, detail) {
        const entry = { name, ms: Math.round(now()), detail: detail || null };
        diag.marks.push(entry);
        try { console.log('[LYANN_STARTUP]', name, entry.ms + 'ms', detail || ''); } catch (_) {}
        renderPanel();
    }

    function fmt(ms) {
        return ms == null ? '—' : (Number(ms) / 1000).toFixed(Number(ms) >= 10000 ? 1 : 2) + ' s';
    }

    function forceOpenFilterSheet(modal) {
        const t0 = now();
        modal.classList.add('active');
        modal.removeAttribute('hidden');
        modal.setAttribute('aria-hidden', 'false');
        modal.style.setProperty('display', 'flex', 'important');
        modal.style.setProperty('position', 'fixed', 'important');
        modal.style.setProperty('inset', '0', 'important');
        modal.style.setProperty('width', '100vw', 'important');
        modal.style.setProperty('height', '100dvh', 'important');
        modal.style.setProperty('z-index', '2147483000', 'important');
        modal.style.setProperty('opacity', '1', 'important');
        modal.style.setProperty('visibility', 'visible', 'important');
        modal.style.setProperty('pointer-events', 'auto', 'important');
        modal.style.setProperty('transform', 'none', 'important');
        modal.style.setProperty('align-items', 'flex-end', 'important');
        modal.style.setProperty('justify-content', 'center', 'important');
        modal.style.setProperty('background', 'rgba(15,23,42,.42)', 'important');

        const card = modal.querySelector('.mobile-bottom-sheet-card, .bottom-sheet-card, .modal-card, [class*="sheet-card"]');
        if (card) {
            card.style.setProperty('display', 'flex', 'important');
            card.style.setProperty('opacity', '1', 'important');
            card.style.setProperty('visibility', 'visible', 'important');
            card.style.setProperty('transform', 'translateY(0)', 'important');
            card.style.setProperty('position', 'relative', 'important');
            card.style.setProperty('z-index', '1', 'important');
        }
        document.body.classList.add('sheet-open');
        window.__LYANN_LAST_FILTER_OPEN_LATENCY_MS__ = Math.round(now() - t0);
        mark('filter_forced_visible', { latencyMs: window.__LYANN_LAST_FILTER_OPEN_LATENCY_MS__, cardFound: !!card });
    }

    function closeFilterSheet(modal) {
        modal.classList.remove('active');
        modal.style.setProperty('display', 'none', 'important');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('sheet-open');
    }

    function bindCriticalFilter() {
        const button = document.getElementById('btnOpenBokantajFilterSheet');
        const modal = document.getElementById('bokantajFilterSheetModal');
        if (!button || !modal) return false;
        if (button.dataset.productionCriticalBound === '1') return true;
        button.dataset.productionCriticalBound = '1';
        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            forceOpenFilterSheet(modal);
        }, true);

        modal.addEventListener('click', function (event) {
            if (event.target === modal) closeFilterSheet(modal);
        });
        modal.querySelectorAll('#closeBokantajFilterSheetBtn, .modal-close-btn, [data-close-sheet]').forEach(function (close) {
            close.addEventListener('click', function (event) {
                event.preventDefault();
                closeFilterSheet(modal);
            });
        });

        window.__LYANN_CRITICAL_FILTER_READY__ = true;
        window.__LYANN_CRITICAL_FILTER_READY_MS__ = Math.round(now());
        mark('critical_filter_bound', { modalClass: modal.className });
        return true;
    }

    if (!bindCriticalFilter()) {
        const observer = new MutationObserver(function () {
            if (bindCriticalFilter()) observer.disconnect();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function renderPanel() {
        if (!diagEnabled || !document.body) return;
        let panel = document.getElementById('lyannStartupDiagPanel');
        if (!panel) {
            panel = document.createElement('aside');
            panel.id = 'lyannStartupDiagPanel';
            panel.style.cssText = 'position:fixed;left:10px;right:10px;bottom:10px;z-index:2147483647;max-height:42vh;overflow:auto;background:rgba(15,23,42,.96);color:#fff;border-radius:14px;padding:10px 12px;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 8px 30px rgba(0,0,0,.28)';
            document.body.appendChild(panel);
        }
        const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
        const slow = performance.getEntriesByType ? performance.getEntriesByType('resource').map(r => ({ name: (r.name || '').replace(location.origin, ''), duration: Math.round(r.duration || 0) })).sort((a,b) => b.duration-a.duration).slice(0,4) : [];
        panel.innerHTML = '<strong>LYANN · DIAGNOSTIC DÉMARRAGE</strong>' +
            (nav ? '<div>Réponse HTML : '+fmt(nav.responseStart)+'</div><div>DOM interactif : '+fmt(nav.domInteractive)+'</div><div>DOMContentLoaded : '+fmt(nav.domContentLoadedEventEnd)+'</div><div>window.load : '+fmt(nav.loadEventEnd)+'</div>' : '') +
            '<div>'+(window.__LYANN_CRITICAL_FILTER_READY__?'✅':'⏳')+' Filtre critique : '+(window.__LYANN_CRITICAL_FILTER_READY__?'prêt':'en attente')+'</div>' +
            '<div>'+(window.__LYANN_LAST_FILTER_OPEN_LATENCY_MS__ != null ? 'Dernière ouverture forcée : '+window.__LYANN_LAST_FILTER_OPEN_LATENCY_MS__+' ms' : 'Dernière ouverture forcée : —')+'</div>' +
            '<hr style="border:0;border-top:1px solid rgba(255,255,255,.18);margin:7px 0"><strong>Étapes récentes</strong>' + diag.marks.slice(-5).map(m => '<div>'+fmt(m.ms)+' · '+m.name+(m.detail ? ' · '+JSON.stringify(m.detail) : '')+'</div>').join('') +
            '<div style="margin-top:7px"><strong>Ressources les plus lentes</strong></div>' + slow.map(r => '<div>'+fmt(r.duration)+' · '+r.name+'</div>').join('');
    }

    if (diagEnabled) {
        document.addEventListener('click', function (event) {
            const el = event.target && event.target.closest ? event.target.closest('button,a,[role="button"]') : null;
            if (el) diag.clicks.push({ ms: Math.round(now()), target: el.id || el.textContent.trim().slice(0,40) });
            setTimeout(renderPanel, 50);
        }, true);
        setInterval(renderPanel, 1000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ mark('DOMContentLoaded'); }, { once:true });
    else mark('DOMContentLoaded_already_reached');
    window.addEventListener('load', function(){ mark('window_load'); }, { once:true });
    mark('production_bootstrap_ready');
})();
