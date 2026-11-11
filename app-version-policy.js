/* LYANN — Client de la politique de version minimale (taxonomie v2, préparé, INERTE).
 *
 * Interroge GET /v1/app/version-policy et décrit l'avis à afficher. N'est inclus dans AUCUNE page : il sera embarqué par le prochain build natif,
 * et ne fait rien tant que window.LYANN_FEATURES.appVersionPolicy n'est pas exactement true (drapeau posé par aucun fichier du dépôt).
 *
 * Garanties : fonctions sans effet de bord sur le DOM (l'appelant affiche) ; aucune donnée personnelle envoyée (plateforme + numéro de build) ;
 * FAIL-OPEN : réseau coupé, délai de 3 s dépassé, réponse illisible, plateforme web ou build inconnu → aucun avis, jamais de blocage.
 * Un avis « obligatoire » n'existe que si le serveur l'affirme (update_required === true), ce qu'il ne fait que si l'opération l'a activé. */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LYANN_APP_VERSION_POLICY = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const FLAG = 'appVersionPolicy';
    const TIMEOUT_MS = 3000;
    const ENDPOINT = '/v1/app/version-policy';
    const STORE_HOSTS = ['apps.apple.com', 'itunes.apple.com', 'play.google.com'];

    function isEnabled(features) {
        const source = features || (root && root.LYANN_FEATURES);
        return Boolean(source && source[FLAG] === true);
    }

    function parseBuild(raw) {
        const text = String(raw == null ? '' : raw).trim();
        return /^[1-9]\d{0,8}$/.test(text) ? Number(text) : null;
    }

    function safeStoreUrl(value) {
        try {
            const url = new URL(String(value || ''));
            return url.protocol === 'https:' && STORE_HOSTS.includes(url.hostname) ? url.toString() : null;
        } catch (_) {
            return null;
        }
    }

    /** Plateforme et build du binaire natif (plugin @capacitor/app) ; { platform: 'web', build: null } hors application native. */
    async function readNativeInfo(scope) {
        const r = scope || root;
        try {
            if (!r || !r.Capacitor || typeof r.Capacitor.isNativePlatform !== 'function' || !r.Capacitor.isNativePlatform()) return { platform: 'web', build: null };
            const platform = r.Capacitor.getPlatform();
            const appPlugin = r.Capacitor.Plugins && r.Capacitor.Plugins.App;
            const info = appPlugin && typeof appPlugin.getInfo === 'function' ? await appPlugin.getInfo() : null;
            return { platform: platform === 'ios' || platform === 'android' ? platform : 'web', build: parseBuild(info && info.build) };
        } catch (_) {
            return { platform: 'web', build: null };
        }
    }

    /** Interroge le serveur. Renvoie la politique, ou null (désactivé, erreur, réponse invalide). Ne lève jamais. */
    async function fetchPolicy(options) {
        const o = options || {};
        if (!isEnabled(o.features)) return null;
        const platform = o.platform;
        const build = parseBuild(o.build);
        if ((platform !== 'ios' && platform !== 'android') || build === null) return null;
        const doFetch = o.fetchImpl || (root && root.fetch && root.fetch.bind(root));
        if (!doFetch) return null;
        const origin = String(o.backendOrigin || '').replace(/\/$/, '');
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), o.timeoutMs || TIMEOUT_MS) : null;
        try {
            const res = await doFetch(`${origin}${ENDPOINT}?platform=${platform}&build=${build}`, { method: 'GET', headers: { Accept: 'application/json' }, signal: controller ? controller.signal : undefined });
            if (!res || !res.ok) return null;
            const body = await res.json();
            if (!body || body.success !== true) return null;
            return {
                updateRequired: body.update_required === true,
                updateRecommended: body.update_recommended === true && body.update_required !== true,
                storeUrl: safeStoreUrl(body.store_url),
                minBuild: parseBuild(body.min_build)
            };
        } catch (_) {
            return null;
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    /** Texte et comportement de l'avis. null = rien à afficher. */
    function describeNotice(policy) {
        if (!policy) return null;
        if (policy.updateRequired) {
            return { blocking: true, dismissible: false, title: 'Mise à jour nécessaire', body: 'Cette version de LYANN n’est plus prise en charge. Mets l’application à jour pour continuer à l’utiliser.', cta: 'Mettre à jour', url: policy.storeUrl };
        }
        if (policy.updateRecommended) {
            return { blocking: false, dismissible: true, title: 'Une nouvelle version est disponible', body: 'Mets LYANN à jour pour profiter des dernières améliorations.', cta: 'Mettre à jour', url: policy.storeUrl };
        }
        return null;
    }

    return Object.freeze({ FLAG, ENDPOINT, TIMEOUT_MS, isEnabled, parseBuild, safeStoreUrl, readNativeInfo, fetchPolicy, describeNotice });
});
