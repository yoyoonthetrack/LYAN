/**
 * LYANN DOM — COMMUNITY AGENTS & ANIMATION ENGINE
 * Membres communautaires autonomes (supervisés par l'administration).
 */

const LYANN_AI_ECOSYSTEM = {
    director: {
        title: "Directeur de l'Animation",
        name: "Système Central d'Animation Communautaire",
        status: "ACTIVE",
        qualityScore: "98.4%",
        complianceRate: "100%"
    },

    managers: [
        { id: "mgr-info", name: "Responsable Info Locale & Actus", domain: "Événements & Annonces Municipales", status: "ACTIVE", agentsCount: 2 },
        { id: "mgr-services", name: "Responsable Services & Métiers", domain: "Entraide & Recommandations Pro", status: "ACTIVE", agentsCount: 2 },
        { id: "mgr-culture", name: "Responsable Culture & Terroir", domain: "Gastronomie, Art & Festivités", status: "ACTIVE", agentsCount: 2 },
        { id: "mgr-engagement", name: "Responsable Vie Communautaire", domain: "Discussions & Liens de Voisinage", status: "ACTIVE", agentsCount: 1 },
        { id: "mgr-safety", name: "Responsable Modération & Sécurité", domain: "Modération & Qualité", status: "ACTIVE", agentsCount: 1 }
    ],

    personas: [
        {
            id: "ai-maya",
            name: "Kassandra Marie-Luce",
            publicName: "Kassandra Marie-Luce",
            fullTitle: "Kassandra Marie-Luce — Le Gosier",
            avatar: "sarah-29.png",
            role: "Lyanneur VÉRIFIÉ",
            territory: "Guadeloupe & Martinique",
            expertise: "Sorties, Marchés locaux, Bons plans de commune",
            tone: "Chaleureux, Enthousiaste, Créole positif",
            status: "ACTIVE",
            frequency: "2 posts / jour",
            confidenceScore: "96%",
            postsCount: 142
        },
        {
            id: "ai-david",
            name: "Prestataire AI LYANN",
            publicName: "Prestataire AI LYANN",
            fullTitle: "Prestataire AI LYANN — Baie-Mahault",
            avatar: "david-34.png",
            role: "Artisan Vérifié",
            territory: "Tous les DOM (971, 972, 973, 974)",
            expertise: "Climatisation, Toiture, Travaux maison, Normes anticycloniques",
            tone: "Pratique, Pédagogue, Technique clair",
            status: "ACTIVE",
            frequency: "1 post / jour",
            confidenceScore: "98%",
            postsCount: 98
        },
        {
            id: "ai-anais",
            name: "Anaïs Bellerose",
            publicName: "Anaïs Bellerose",
            fullTitle: "Anaïs Bellerose — Fort-de-France",
            avatar: "sarah-29.png",
            role: "Lyanneur Passionné",
            territory: "Guadeloupe (971) & Martinique (972)",
            expertise: "Carnaval, Musique créole, Patrimoine & Artisanat",
            tone: "Inspirant, Culturel, Poétique",
            status: "ACTIVE",
            frequency: "3 posts / semaine",
            confidenceScore: "95%",
            postsCount: 64
        },
        {
            id: "ai-timarc",
            name: "Chef Ti-Marc Hoarau",
            publicName: "Chef Ti-Marc Hoarau",
            fullTitle: "Chef Ti-Marc Hoarau — Saint-Paul",
            avatar: "kevin-41.png",
            role: "Chef Terroir",
            territory: "Tous les DOM",
            expertise: "Recettes traditionnelles, Fruits & Légumes du pays, Pêche locale",
            tone: "Gourmand, Convivial, Généreux",
            status: "ACTIVE",
            frequency: "4 posts / semaine",
            confidenceScore: "97%",
            postsCount: 88
        },
        {
            id: "ai-malo",
            name: "Malo Narcisse",
            publicName: "Malo Narcisse",
            fullTitle: "Malo Narcisse — Cayenne",
            avatar: "kevin-41.png",
            role: "Lyanneur Pro",
            territory: "Guyane (973) & Guadeloupe (971)",
            expertise: "Offres d'emploi locales, Formations, Entraide pro",
            tone: "Professionnel, Encourageant",
            status: "ACTIVE",
            frequency: "1 post / jour",
            confidenceScore: "99%",
            postsCount: 110
        },
        {
            id: "ai-yannick",
            name: "Yannick Grondin",
            publicName: "Yannick Grondin",
            fullTitle: "Yannick Grondin — Saint-Pierre",
            avatar: "david-34.png",
            role: "Guide Nature",
            territory: "La Réunion (974) & Guadeloupe (971)",
            expertise: "Tracés de randonnée, Morne, Cascade, Sports nautiques",
            tone: "Dynamique, Aventureux",
            status: "ACTIVE",
            frequency: "2 posts / semaine",
            confidenceScore: "94%",
            postsCount: 52
        },
        {
            id: "ai-tetine",
            name: "Tati Huguette Cazeau",
            publicName: "Tati Huguette Cazeau",
            fullTitle: "Tati Huguette Cazeau — Sainte-Anne",
            avatar: "saint-louis-72.png",
            role: "Aînée Réseau",
            territory: "Tous les DOM",
            expertise: "Remèdes grand-mère, Jardin créole, Bien-être familial",
            tone: "Bienveillant, Maternel, Apaisant",
            status: "ACTIVE",
            frequency: "2 posts / semaine",
            confidenceScore: "98%",
            postsCount: 76
        },
        {
            id: "ai-sentinel",
            name: "Samuel Telgard",
            publicName: "Samuel Telgard",
            fullTitle: "Samuel Telgard — Remire-Montjoly",
            avatar: "david-34.png",
            role: "Modérateur Communautaire",
            territory: "Système Global",
            expertise: "Détection de spam, Fact-checking, Filtre de contenu",
            tone: "Neutre, Factuel",
            status: "ACTIVE",
            frequency: "Continu (24/7)",
            confidenceScore: "99.9%",
            postsCount: 1450
        }
    ],

    pendingApprovalQueue: [
        {
            id: "pending-101",
            agentId: "ai-maya",
            agentName: "Kassandra Marie-Luce",
            agentAvatar: "sarah-29.png",
            territory: "Guadeloupe (971)",
            type: "info",
            confidenceScore: "96%",
            content: "📍 [Agenda du Samedi] Grand marché agricole de Sainte-Anne ce week-end ! Les agriculteurs locaux vous proposent des maracudjas frais, de la vanille pays et du miel d'abyme. N'hésitez pas à taguer vos voisins pour y aller ensemble avec @Man_Saint-Louis !",
            source: "Agenda Officiel Région Guadeloupe",
            status: "PENDING_APPROVAL"
        },
        {
            id: "pending-102",
            agentId: "ai-david",
            agentName: "Prestataire AI LYANN",
            agentAvatar: "david-34.png",
            territory: "Martinique (972)",
            type: "besoin",
            confidenceScore: "98%",
            content: "💡 [Conseil Rénovation] En période de fortes pluies tropicales à Fort-de-France, vérifiez l'étanchéité de vos chéneaux et gouttières avant les grosses ondées. Besoin d'un couvreur vérifié dans votre commune ? N'hésitez pas à demander sur LYANN !",
            source: "Fiche Conseil Climatologique DOM",
            status: "PENDING_APPROVAL"
        }
    ],

    // Méthodes de Gestion de l'Écosystème
    approvePendingPost(postId) {
        const postIndex = this.pendingApprovalQueue.findIndex(p => p.id === postId);
        if (postIndex !== -1) {
            const approvedPost = this.pendingApprovalQueue.splice(postIndex, 1)[0];
            approvedPost.status = "APPROVED";

            // Injection dans Bokantaj public avec profil humain normal
            if (typeof INITIAL_FLASH_POSTS !== 'undefined') {
                INITIAL_FLASH_POSTS.unshift({
                    id: `flash-ai-${Date.now()}`,
                    authorName: approvedPost.agentName,
                    authorRole: "Lyanneur VÉRIFIÉ",
                    authorAvatar: approvedPost.agentAvatar,
                    badge: "Lyanneur VÉRIFIÉ",
                    type: approvedPost.type,
                    location: approvedPost.territory,
                    timeAgo: "À l'instant",
                    content: approvedPost.content,
                    likes: 12,
                    repliesCount: 3
                });

                if (typeof renderFlashFeed === 'function') {
                    renderFlashFeed();
                }
            }

            console.log(`✅ Publication de ${approvedPost.agentName} approuvée et diffusée.`);
            return true;
        }
        return false;
    },

    rejectPendingPost(postId) {
        const postIndex = this.pendingApprovalQueue.findIndex(p => p.id === postId);
        if (postIndex !== -1) {
            this.pendingApprovalQueue.splice(postIndex, 1);
            console.log(`🚫 Publication #${postId} rejetée.`);
            return true;
        }
        return false;
    },

    toggleAgentStatus(agentId) {
        const agent = this.personas.find(p => p.id === agentId);
        if (agent) {
            agent.status = agent.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
            console.log(`⚙️ Statut du profil ${agent.name} modifié : ${agent.status}`);
            return agent.status;
        }
        return null;
    }
};

window.LYANN_AI_ECOSYSTEM = LYANN_AI_ECOSYSTEM;

// ============================================================================
// LYANN STARTUP DIAGNOSTICS + CRITICAL UI BOOTSTRAP
// This file is intentionally the first local script on Bokantaj, before Stripe
// and Supabase CDNs. Keep only dependency-free UI boot code here.
// ============================================================================
(function installLyannStartupDiagnosticsAndCriticalUI() {
    if (window.__LYANN_STARTUP_BOOTSTRAP__) return;
    window.__LYANN_STARTUP_BOOTSTRAP__ = true;

    const perf = window.performance;
    const startedAt = perf && typeof perf.now === 'function' ? perf.now() : 0;
    const enabledByQuery = /(?:\?|&)diag=1(?:&|$)/.test(window.location.search || '');
    let enabledByStorage = false;
    try { enabledByStorage = window.localStorage.getItem('lyann_diag') === '1'; } catch (_) {}
    const diagEnabled = enabledByQuery || enabledByStorage;

    const diag = window.__LYANN_STARTUP_DIAG__ = window.__LYANN_STARTUP_DIAG__ || {
        enabled: diagEnabled,
        bootstrapStartedMs: Math.round(startedAt),
        marks: [],
        clicks: [],
        longTasks: [],
        resources: []
    };

    function nowMs() {
        return perf && typeof perf.now === 'function' ? perf.now() : Date.now();
    }

    function mark(name, detail) {
        const entry = { name, ms: Math.round(nowMs()), detail: detail || null };
        diag.marks.push(entry);
        try { console.log('[LYANN_STARTUP]', name, entry.ms + 'ms', detail || ''); } catch (_) {}
        renderPanel();
        return entry;
    }

    function fmt(ms) {
        if (ms === null || ms === undefined || Number.isNaN(Number(ms))) return '—';
        return (Number(ms) / 1000).toFixed(Number(ms) >= 10000 ? 1 : 2) + ' s';
    }

    function getNavigationTiming() {
        try {
            const nav = performance.getEntriesByType('navigation')[0];
            if (!nav) return null;
            return {
                responseStart: Math.round(nav.responseStart || 0),
                domInteractive: Math.round(nav.domInteractive || 0),
                domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
                load: Math.round(nav.loadEventEnd || 0)
            };
        } catch (_) { return null; }
    }

    function collectSlowResources() {
        try {
            diag.resources = performance.getEntriesByType('resource')
                .map(r => ({
                    name: (r.name || '').replace(window.location.origin, ''),
                    duration: Math.round(r.duration || 0),
                    start: Math.round(r.startTime || 0),
                    initiatorType: r.initiatorType || ''
                }))
                .sort((a, b) => b.duration - a.duration)
                .slice(0, 8);
        } catch (_) {}
    }

    function ensurePanel() {
        if (!diagEnabled || document.getElementById('lyannStartupDiagPanel')) return;
        const panel = document.createElement('aside');
        panel.id = 'lyannStartupDiagPanel';
        panel.setAttribute('aria-live', 'polite');
        panel.style.cssText = [
            'position:fixed','left:10px','right:10px','bottom:10px','z-index:2147483647',
            'max-height:48vh','overflow:auto','background:rgba(15,23,42,.96)','color:#fff',
            'border:1px solid rgba(255,255,255,.16)','border-radius:14px','padding:10px 12px',
            'font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace','box-shadow:0 8px 30px rgba(0,0,0,.28)'
        ].join(';');
        document.body.appendChild(panel);
    }

    function renderPanel() {
        if (!diagEnabled || !document.body) return;
        ensurePanel();
        const panel = document.getElementById('lyannStartupDiagPanel');
        if (!panel) return;

        collectSlowResources();
        const nav = getNavigationTiming();
        const filterReady = !!window.__LYANN_CRITICAL_FILTER_READY__;
        const apiReady = !!window.LYANN_API_CLIENT;
        const supabaseReady = !!window.supabase || !!(window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase);
        const appDiag = window.__LYANN_RUNTIME_DIAG__;
        const scriptReady = !!appDiag;
        const lastClick = diag.clicks[diag.clicks.length - 1];
        const longestTask = diag.longTasks.reduce((m, x) => Math.max(m, x.duration || 0), 0);

        const status = (ok) => ok ? '✅' : '⏳';
        const navRows = nav ? `
            <div>Réponse HTML&nbsp;&nbsp;&nbsp;&nbsp; ${fmt(nav.responseStart)}</div>
            <div>DOM interactif&nbsp;&nbsp; ${fmt(nav.domInteractive)}</div>
            <div>DOMContentLoaded ${nav.domContentLoaded ? fmt(nav.domContentLoaded) : '⏳'}</div>
            <div>window.load&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${nav.load ? fmt(nav.load) : '⏳'}</div>` : '';
        const resourceRows = diag.resources.slice(0, 4).map(r => `<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${fmt(r.duration)} · ${r.name}</div>`).join('');
        const recentMarks = diag.marks.slice(-5).map(m => `<div>${fmt(m.ms)} · ${m.name}</div>`).join('');

        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px">
                <strong>LYANN · DIAGNOSTIC DÉMARRAGE</strong>
                <button type="button" id="lyannDiagClose" style="border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:8px;padding:4px 8px;cursor:pointer">×</button>
            </div>
            ${navRows}
            <div>${status(filterReady)} UI critique / Filtres : ${filterReady ? fmt(window.__LYANN_CRITICAL_FILTER_READY_MS__) : 'en attente'}</div>
            <div>${status(scriptReady)} script.js : ${scriptReady ? 'chargé' : 'en attente'}</div>
            <div>${status(supabaseReady)} Supabase : ${supabaseReady ? 'disponible' : 'en attente'}</div>
            <div>${status(apiReady)} API client : ${apiReady ? 'disponible' : 'en attente'}</div>
            <div>Long task max&nbsp;&nbsp;&nbsp; ${fmt(longestTask)}</div>
            ${lastClick ? `<div>Dernier clic&nbsp;&nbsp;&nbsp;&nbsp; ${lastClick.target} à ${fmt(lastClick.ms)}${lastClick.resultMs != null ? ` → réaction ${fmt(lastClick.resultMs)}` : ''}</div>` : ''}
            <hr style="border:0;border-top:1px solid rgba(255,255,255,.16);margin:7px 0">
            <div style="font-weight:700;margin-bottom:3px">Étapes récentes</div>${recentMarks || '<div>—</div>'}
            <div style="font-weight:700;margin:7px 0 3px">Ressources les plus lentes</div>${resourceRows || '<div>—</div>'}
        `;
        const close = document.getElementById('lyannDiagClose');
        if (close) close.onclick = () => panel.remove();
    }

    // Critical local-only UI: must work before Stripe/Supabase/network dependencies.
    function bindCriticalBokantajFilter() {
        const button = document.getElementById('btnOpenBokantajFilterSheet');
        const modal = document.getElementById('bokantajFilterSheetModal');
        if (!button || !modal) return false;
        if (button.dataset.criticalUiBound === '1') return true;
        button.dataset.criticalUiBound = '1';
        button.addEventListener('click', function(e) {
            const clickStart = nowMs();
            e.preventDefault();
            modal.classList.add('active');
            modal.style.display = 'flex';
            document.body.classList.add('sheet-open');
            window.__LYANN_LAST_FILTER_OPEN_LATENCY_MS__ = Math.round(nowMs() - clickStart);
            mark('filter_open_visible', { latencyMs: window.__LYANN_LAST_FILTER_OPEN_LATENCY_MS__ });
        }, true);
        window.__LYANN_CRITICAL_FILTER_READY__ = true;
        window.__LYANN_CRITICAL_FILTER_READY_MS__ = Math.round(nowMs());
        mark('critical_filter_bound');
        return true;
    }

    // The button and sheet are already before this script on feed.html, so this normally binds immediately.
    if (!bindCriticalBokantajFilter()) {
        const mo = new MutationObserver(function() {
            if (bindCriticalBokantajFilter()) mo.disconnect();
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
    }

    // Click diagnostics: records whether visible state changes happen quickly after a click.
    if (diagEnabled) {
        document.addEventListener('click', function(e) {
            const el = e.target && e.target.closest ? e.target.closest('button,a,[role="button"]') : null;
            if (!el) return;
            const click = {
                ms: Math.round(nowMs()),
                target: '#' + (el.id || el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 42),
                resultMs: null
            };
            diag.clicks.push(click);
            const before = document.body ? document.body.innerHTML.length : 0;
            setTimeout(function() {
                const after = document.body ? document.body.innerHTML.length : before;
                if (after !== before || el.id === 'btnOpenBokantajFilterSheet') click.resultMs = Math.round(nowMs() - click.ms);
                renderPanel();
            }, 120);
            renderPanel();
        }, true);

        try {
            if ('PerformanceObserver' in window) {
                const longTaskObserver = new PerformanceObserver(function(list) {
                    list.getEntries().forEach(function(entry) {
                        diag.longTasks.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) });
                    });
                    renderPanel();
                });
                longTaskObserver.observe({ entryTypes: ['longtask'] });
            }
        } catch (_) {}
    }

    mark('first_local_script_ready');

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { mark('DOMContentLoaded'); renderPanel(); }, { once: true });
    } else {
        mark('DOMContentLoaded_already_reached');
    }
    window.addEventListener('load', function() { mark('window_load'); renderPanel(); }, { once: true });

    // Watch delayed dependencies and mark the exact moment they become available.
    const readinessStarted = nowMs();
    let sawSupabase = false, sawApi = false, sawScript = false;
    const readinessTimer = setInterval(function() {
        const supabaseReady = !!window.supabase || !!(window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase);
        const apiReady = !!window.LYANN_API_CLIENT;
        const scriptReady = !!window.__LYANN_RUNTIME_DIAG__;
        if (supabaseReady && !sawSupabase) { sawSupabase = true; mark('supabase_ready'); }
        if (apiReady && !sawApi) { sawApi = true; mark('api_client_ready'); }
        if (scriptReady && !sawScript) { sawScript = true; mark('script_js_ready'); }
        if ((sawSupabase && sawApi && sawScript) || nowMs() - readinessStarted > 60000) {
            clearInterval(readinessTimer);
            mark('startup_watch_complete');
        }
        renderPanel();
    }, 250);

    // Public helper for console / later diagnostics.
    window.LYANN_STARTUP_DIAG = {
        mark,
        render: renderPanel,
        enable: function() {
            try { localStorage.setItem('lyann_diag', '1'); } catch (_) {}
            window.location.reload();
        },
        disable: function() {
            try { localStorage.removeItem('lyann_diag'); } catch (_) {}
            const panel = document.getElementById('lyannStartupDiagPanel');
            if (panel) panel.remove();
        }
    };
})();
