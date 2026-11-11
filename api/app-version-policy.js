'use strict';

/*
 * Politique de version minimale des applications (taxonomie v2, phase P4/P5 — préparée, INERTE).
 *
 * Pourquoi : les applications iOS/Android embarquent leur JavaScript (Capacitor, webDir « www », pas d'URL distante). Un build déjà publié ne peut pas
 * être corrigé côté serveur, et il n'existe aucun mécanisme pour lui dire « mets-toi à jour ». Cette route donne au serveur un moyen de le dire
 * AUX BUILDS QUI L'INTERROGENT (ceux qui embarqueront le client `app-version-policy.js`). Les builds antérieurs ne connaissent pas cette route : pour eux,
 * la compatibilité repose sur le pont T1 et sur les déclencheurs de double écriture (document 14 §3). On ne promet donc pas de pouvoir alerter un ancien build.
 *
 * Comportement par défaut (aucune variable posée) : `update_required: false`, `update_recommended: false` — strictement le comportement actuel.
 * Rien ne devient obligatoire tant que `LYANN_APP_VERSION_POLICY_ENFORCE` n'est pas EXACTEMENT « true » ET qu'un plancher est posé pour la plateforme.
 *
 * Variables (toutes facultatives, lues à chaque requête ; entiers positifs stricts, toute autre valeur est ignorée = fail-open) :
 *   LYANN_APP_VERSION_POLICY_ENFORCE          'true' pour autoriser une mise à jour OBLIGATOIRE
 *   LYANN_MIN_APP_BUILD_IOS / _ANDROID        plancher de build (CURRENT_PROJECT_VERSION / versionCode)
 *   LYANN_RECOMMENDED_APP_BUILD_IOS / _ANDROID  build recommandé (jamais bloquant, même si ENFORCE=true)
 *   LYANN_APP_STORE_URL_IOS / LYANN_APP_STORE_URL_ANDROID  lien de mise à jour (https, apps.apple.com | itunes.apple.com | play.google.com seulement)
 *
 * Le client envoie ?platform=ios|android|web&build=<entier>. Plateforme web, build absent ou illisible : jamais d'obligation (fail-open) :
 * un doute ne doit jamais bloquer un membre.
 * Aucun accès à la base, aucun état, aucune donnée personnelle. Réponse non mise en cache côté intermédiaires au-delà de 5 minutes.
 */

const PLATFORMS = ['ios', 'android', 'web'];
const STORE_HOSTS = new Set(['apps.apple.com', 'itunes.apple.com', 'play.google.com']);

const strictPositiveInt = (value) => {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const text = String(value).trim();
    if (!/^[1-9]\d{0,8}$/.test(text)) return null;
    return Number(text);
};

const storeUrl = (value) => {
    try {
        const url = new URL(String(value || '').trim());
        return url.protocol === 'https:' && STORE_HOSTS.has(url.hostname) ? url.toString() : null;
    } catch (_) {
        return null;
    }
};

/** Évalue la politique pour une requête. Pure, sans effet de bord : testée directement. */
function evaluateVersionPolicy(env, query) {
    const source = env || {};
    const q = query || {};
    const rawPlatform = String(q.platform || '').toLowerCase();
    const platform = PLATFORMS.includes(rawPlatform) ? rawPlatform : null;
    const build = strictPositiveInt(q.build);
    const enforce = source.LYANN_APP_VERSION_POLICY_ENFORCE === 'true';
    const suffix = platform === 'ios' ? 'IOS' : platform === 'android' ? 'ANDROID' : null;
    const minBuild = suffix ? strictPositiveInt(source[`LYANN_MIN_APP_BUILD_${suffix}`]) : null;
    const recommendedBuild = suffix ? strictPositiveInt(source[`LYANN_RECOMMENDED_APP_BUILD_${suffix}`]) : null;
    const url = suffix ? storeUrl(source[`LYANN_APP_STORE_URL_${suffix}`]) : null;
    const known = platform !== null && platform !== 'web' && build !== null;
    const updateRequired = Boolean(enforce && known && minBuild !== null && build < minBuild);
    const updateRecommended = Boolean(!updateRequired && known && recommendedBuild !== null && build < recommendedBuild);
    return {
        success: true,
        enforce,
        platform,
        update_required: updateRequired,
        update_recommended: updateRecommended,
        min_build: updateRequired || (enforce && minBuild !== null) ? minBuild : null,
        recommended_build: recommendedBuild,
        store_url: updateRequired || updateRecommended ? url : null,
        message_code: updateRequired ? 'UPDATE_REQUIRED' : updateRecommended ? 'UPDATE_RECOMMENDED' : null
    };
}

function createVersionPolicyHandler(env = process.env) {
    return function versionPolicyHandler(req, res) {
        res.set('Cache-Control', 'public, max-age=300');
        return res.json(evaluateVersionPolicy(env, req.query));
    };
}

module.exports = { evaluateVersionPolicy, createVersionPolicyHandler, PLATFORMS, STORE_HOSTS };
