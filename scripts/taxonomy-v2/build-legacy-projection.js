'use strict';
/*
 * Génère docs/taxonomy/migration-draft/08_legacy_projection.sql à partir du pont de compatibilité (compat.js).
 * Aucune écriture hors de ce fichier de brouillon ; aucun accès réseau ; déterministe (le test compare le fichier committé à la régénération).
 *
 *   node scripts/taxonomy-v2/build-legacy-projection.js          → écrit le fichier
 *   require('./build-legacy-projection').render()                 → renvoie le SQL (tests)
 */
const fs = require('node:fs');
const path = require('node:path');
const compat = require('./compat');

const OUT = path.join(__dirname, '..', '..', 'docs', 'taxonomy', 'migration-draft', '08_legacy_projection.sql');
const sql = (value) => `'${String(value).replace(/'/g, "''")}'`;

/** Une ligne par nœud dont l'écriture historique véridique existe. « label-only » (rien de véridique à écrire) n'a pas de ligne. */
function projectionRows() {
    const { bridges } = compat.buildBridge();
    const leaves = compat.legacyLeaves.map((l) => ({ ...l }));
    const byId = new Map(leaves.map((l) => [l.id, l]));
    const rows = [];
    for (const entry of bridges.values()) {
        if (entry.kind === 'none') continue;
        const proj = compat.legacyProjection(entry, leaves);
        if (proj.via === 'label-only') continue;
        rows.push({ code: entry.node.code, category: proj.category, leafKey: proj.taxonomy_id ? compat.leafKey(byId.get(proj.taxonomy_id)) : null, via: proj.via, bridge: entry.kind });
    }
    return rows.sort((a, b) => a.code.localeCompare(b.code));
}

function render() {
    const rows = projectionRows();
    const values = rows.map((r) => `    (${sql(r.code)}, ${sql(r.category)}, ${r.leafKey ? sql(r.leafKey) : 'NULL'}, ${sql(r.via)})`).join(',\n');
    return `-- 94e_taxonomy_v2_legacy_projection — écriture historique véridique pour les anciens clients (ÉTAPE FACULTATIVE)
-- ============================================================================
-- BROUILLON — NON APPLIQUÉ. Fichier GÉNÉRÉ par scripts/taxonomy-v2/build-legacy-projection.js : ne pas modifier à la main.
-- Dépend de 01, 02, 05 et 06. Rollback : 09_rollback_taxonomy_v2.sql
--
-- Problème : une annonce écrite par un client v2 porte un nœud précis (« Plomberie › Fuite »). Un ancien build iOS/Android filtre
-- sur requests.category / requests.taxonomy_id : sans valeur historique, l'annonce est invisible pour ses filtres.
-- Solution : quand le nœud est connu et que les champs historiques sont VIDES ou de repli, le serveur les complète à partir du
-- pont de compatibilité (${rows.length} nœuds). Le pont est véridique par construction :
--   · jamais plus précis que le nœud (pas de sous-catégorie historique pour un nœud plus large) ;
--   · la feuille historique n'est écrite que si elle est la seule possible, sinon seulement leur catégorie commune ;
--   · aucun pont pour les nœuds sans équivalent historique (la ligne n'existe pas : rien n'est écrit, jamais de « Général » déguisé).
-- Une valeur historique choisie par l'utilisateur n'est jamais écrasée. Fail-open : toute anomalie laisse la ligne telle quelle.
-- Les compétences (services) ne sont PAS concernées : leur colonne category alimente le quota de catégories du forfait.
-- ============================================================================
BEGIN;

CREATE TABLE public.lyann_taxonomy_legacy_projection (
    node_code       text PRIMARY KEY REFERENCES public.lyann_taxonomy_node(code),
    legacy_category text NOT NULL CHECK (length(btrim(legacy_category)) > 0),
    legacy_leaf_key text,
    via             text NOT NULL CHECK (via IN ('leaf', 'category-of-leaves', 'category')),
    CONSTRAINT lyann_taxonomy_legacy_projection_leaf_shape CHECK ((via = 'leaf') = (legacy_leaf_key IS NOT NULL))
);
ALTER TABLE public.lyann_taxonomy_legacy_projection ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lyann_taxonomy_legacy_projection FROM PUBLIC, anon, authenticated;

INSERT INTO public.lyann_taxonomy_legacy_projection (node_code, legacy_category, legacy_leaf_key, via) VALUES
${values};

CREATE OR REPLACE FUNCTION public.lyann_fill_request_legacy() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_category text;
    v_leaf     text;
    v_leaf_id  uuid;
BEGIN
    BEGIN
        IF NEW.taxonomy_node_code IS NULL THEN RETURN NEW; END IF;
        IF TG_OP = 'UPDATE' THEN
            -- Le nœud a changé sans que les champs historiques suivent : ils sont périmés, on les recalcule.
            -- Sinon (nœud inchangé, ou champs écrits dans la même instruction), on ne touche à rien.
            IF NEW.taxonomy_node_code IS NOT DISTINCT FROM OLD.taxonomy_node_code THEN RETURN NEW; END IF;
            IF NEW.category IS DISTINCT FROM OLD.category OR NEW.taxonomy_id IS DISTINCT FROM OLD.taxonomy_id THEN RETURN NEW; END IF;
        ELSIF NEW.taxonomy_id IS NOT NULL THEN
            RETURN NEW; -- feuille historique choisie : jamais écrasée
        ELSIF NOT (public.lyann_legacy_value_is_placeholder(NEW.category)
                   OR lower(btrim(NEW.category)) = (SELECT lower(n.label_fr) FROM public.lyann_taxonomy_node n WHERE n.code = NEW.taxonomy_node_code)) THEN
            RETURN NEW; -- catégorie historique choisie : jamais écrasée (vide, repli ou libellé v2 recopié : complétée)
        END IF;

        SELECT p.legacy_category, p.legacy_leaf_key INTO v_category, v_leaf
        FROM public.lyann_taxonomy_legacy_projection p WHERE p.node_code = NEW.taxonomy_node_code;
        IF v_category IS NULL THEN RETURN NEW; END IF;      -- pas de pont véridique : on n'écrit rien

        IF v_leaf IS NOT NULL THEN
            SELECT t.id INTO v_leaf_id FROM public.lyann_taxonomy t
            WHERE t.universe || '|' || t.category || '|' || t.subcategory = v_leaf AND t.active LIMIT 1;
        END IF;
        NEW.category := v_category;
        NEW.taxonomy_id := v_leaf_id;                       -- NULL quand seule la catégorie est véridique
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'lyann_fill_request_legacy: % (%), champs historiques laissés en l''état', SQLERRM, SQLSTATE;
    END;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.lyann_fill_request_legacy() FROM PUBLIC, anon, authenticated;

-- Déclencheurs BEFORE : exécutés par ordre alphabétique ; « …_derive_node_trg » (06) passe avant « …_legacy_projection_trg ».
DROP TRIGGER IF EXISTS lyann_requests_legacy_projection_trg ON public.requests;
CREATE TRIGGER lyann_requests_legacy_projection_trg
    BEFORE INSERT OR UPDATE OF taxonomy_node_code ON public.requests
    FOR EACH ROW EXECUTE FUNCTION public.lyann_fill_request_legacy();

COMMIT;
`;
}

if (require.main === module) {
    fs.writeFileSync(OUT, render());
    console.log(`écrit ${path.relative(process.cwd(), OUT)} (${projectionRows().length} nœuds)`);
}

module.exports = { render, projectionRows, OUT };
