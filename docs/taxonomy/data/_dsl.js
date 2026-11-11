'use strict';
/*
 * LYANN taxonomie v2 (PROPOSITION) — petit DSL de saisie.
 *
 * Chaînes de termes : séparées par « | ». Les accents sont libres (la normalisation les neutralise).
 *   t = synonymes et noms de métier   p = problèmes formulés en langage naturel   l = vocabulaire local / créole
 *
 * Identifiants :
 *   famille    : code court immuable          ex. maison
 *   métier     : code court immuable          ex. plomberie
 *   spécialité : <métier>_<slug>              ex. plomberie_fuite
 * Un identifiant n'est JAMAIS réutilisé ni renommé : seuls les libellés changent. Un déplacement de
 * famille ne modifie pas le code (le préfixe d'une spécialité est un simple nom historique).
 */

const split = (value) => String(value || '').split('|').map((s) => s.trim()).filter(Boolean);

function S(slug, label, t, p, l, opts = {}) {
    return { slug, label, t: split(t), p: split(p), l: split(l), ...opts };
}

function T(code, label, group, opts, t, p, l, specs = []) {
    return {
        code,
        label,
        group,
        safety: 'NORMAL',
        selectable: true,
        also: [],
        regulation: null,
        ...opts,
        t: split(t),
        p: split(p),
        l: split(l),
        specs: specs.map((s) => ({
            safety: opts.safety || 'NORMAL',
            selectable: true,
            also: [],
            regulation: null,
            ...s,
            code: `${code}_${s.slug}`
        }))
    };
}

module.exports = { S, T, split };
