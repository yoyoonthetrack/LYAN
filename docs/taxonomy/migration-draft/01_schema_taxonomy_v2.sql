-- 94a_taxonomy_v2_schema — nouvelles tables de la taxonomie LYANN v2
-- ============================================================================
-- BROUILLON — NON APPLIQUÉ. Aucune exécution sur Staging ni sur Production dans la phase 3.2B.
-- Strictement ADDITIF : ne modifie, ne supprime et ne réécrit aucune table existante.
-- Rollback : 09_rollback_taxonomy_v2.sql
-- Prérequis : extensions unaccent et pg_trgm (schéma `public` sur Staging, `extensions` ailleurs : aucun nom n'est qualifié, le search_path suffit) ; fonction
--             public.has_admin_permission(uuid, text) déjà présente (migration 13).
-- ============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Normalisation unique, partagée par l'écriture (seed) et la lecture (recherche).
-- Minuscules, accents retirés, tout ce qui n'est pas [a-z0-9] devient un espace. Pas de racinisation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lyann_taxonomy_norm(p_text text)
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = extensions, public, pg_temp
AS $$
    SELECT btrim(regexp_replace(lower(unaccent(replace(replace(coalesce(p_text, ''), 'œ', 'oe'), 'æ', 'ae'))), '[^a-z0-9]+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------------
-- Versions publiées du référentiel (une version = un instantané cohérent)
-- ---------------------------------------------------------------------------
CREATE TABLE public.lyann_taxonomy_release (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    version      text        NOT NULL UNIQUE,
    status       text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
    notes        text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
);

-- Sous-domaines d'affichage d'une famille (non porteurs de sens métier : ils regroupent des métiers)
CREATE TABLE public.lyann_taxonomy_group (
    family_code text    NOT NULL,
    code        text    NOT NULL CHECK (code ~ '^[a-z0-9_]{2,40}$'),
    label_fr    text    NOT NULL,
    sort_order  integer NOT NULL DEFAULT 0,
    PRIMARY KEY (family_code, code)
);

-- ---------------------------------------------------------------------------
-- Nœuds : famille › métier › spécialité. `code` est l'identifiant PERMANENT (jamais renommé, jamais supprimé).
-- Le libellé français est un simple attribut modifiable.
-- ---------------------------------------------------------------------------
CREATE TABLE public.lyann_taxonomy_node (
    code            text        PRIMARY KEY CHECK (code ~ '^[a-z0-9_]{2,80}$'),
    kind            text        NOT NULL CHECK (kind IN ('family', 'trade', 'specialty')),
    parent_code     text        REFERENCES public.lyann_taxonomy_node(code),
    family_code     text        NOT NULL REFERENCES public.lyann_taxonomy_node(code),
    group_code      text,
    label_fr        text        NOT NULL CHECK (length(btrim(label_fr)) BETWEEN 2 AND 120),
    safety          text        NOT NULL DEFAULT 'NORMAL' CHECK (safety IN ('NORMAL', 'CAUTION', 'PRO_REQUIRED', 'RESTRICTED', 'PROHIBITED')),
    selectable      boolean     NOT NULL DEFAULT true,
    regulation_note text,
    sort_order      integer     NOT NULL DEFAULT 0,
    icon            text,
    tone            text,
    active          boolean     NOT NULL DEFAULT true,
    release_added   text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (family_code, group_code) REFERENCES public.lyann_taxonomy_group (family_code, code),
    CONSTRAINT lyann_taxonomy_node_shape CHECK (
        (kind = 'family'    AND parent_code IS NULL     AND family_code = code)
     OR (kind = 'trade'     AND parent_code IS NULL     AND family_code <> code)
     OR (kind = 'specialty' AND parent_code IS NOT NULL AND family_code <> code)
    ),
    -- Une activité réglementée ne peut jamais être proposée comme compétence de profil.
    CONSTRAINT lyann_taxonomy_node_restricted_not_selectable CHECK (safety NOT IN ('RESTRICTED', 'PROHIBITED') OR selectable = false)
);
CREATE INDEX lyann_taxonomy_node_parent_idx ON public.lyann_taxonomy_node (parent_code);
CREATE INDEX lyann_taxonomy_node_family_idx ON public.lyann_taxonomy_node (family_code, kind, sort_order);

-- Identifiants immuables : code, kind, parent_code et family_code ne changent jamais ; pas de suppression (désactivation seulement).
CREATE FUNCTION public.lyann_taxonomy_node_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'lyann_taxonomy_node: suppression interdite (désactiver avec active = false)' USING ERRCODE = '42501';
    END IF;
    IF NEW.code IS DISTINCT FROM OLD.code OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.parent_code IS DISTINCT FROM OLD.parent_code THEN
        RAISE EXCEPTION 'lyann_taxonomy_node: code, kind et parent_code sont immuables' USING ERRCODE = '42501';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
CREATE TRIGGER lyann_taxonomy_node_guard_trg BEFORE UPDATE OR DELETE ON public.lyann_taxonomy_node
    FOR EACH ROW EXECUTE FUNCTION public.lyann_taxonomy_node_guard();

-- Familles secondaires (multi-famille sans duplication du nœud)
CREATE TABLE public.lyann_taxonomy_node_family (
    node_code   text NOT NULL REFERENCES public.lyann_taxonomy_node(code),
    family_code text NOT NULL REFERENCES public.lyann_taxonomy_node(code),
    PRIMARY KEY (node_code, family_code)
);

-- Termes de recherche : libellé, synonymes, problèmes en langage naturel, vocabulaire local/créole
CREATE TABLE public.lyann_taxonomy_term (
    id        bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    node_code text    NOT NULL REFERENCES public.lyann_taxonomy_node(code),
    term      text    NOT NULL CHECK (length(btrim(term)) BETWEEN 1 AND 160),
    term_norm text    NOT NULL,
    term_type text    NOT NULL CHECK (term_type IN ('label', 'syn', 'problem', 'local')),
    -- Régions où le terme est en usage ; NULL = partout. Valeurs : antilles (Guadeloupe, Martinique, Saint-Martin), guyane, reunion.
    territories text[] CHECK (territories IS NULL OR territories <@ ARRAY['antilles', 'guyane', 'reunion']::text[]),
    active    boolean NOT NULL DEFAULT true,
    UNIQUE (node_code, term_norm, term_type)
);
CREATE INDEX lyann_taxonomy_term_norm_idx ON public.lyann_taxonomy_term (term_norm);
CREATE INDEX lyann_taxonomy_term_trgm_idx ON public.lyann_taxonomy_term USING gin (term_norm gin_trgm_ops);  -- non qualifié : sur Staging pg_trgm est dans `public`, ailleurs dans `extensions` (les deux sont dans le search_path)

-- Termes volontairement ambigus : la recherche pose une question de précision au lieu de deviner
CREATE TABLE public.lyann_taxonomy_ambiguous_term (
    term_norm   text PRIMARY KEY,
    why         text NOT NULL,
    question_fr text NOT NULL
);

-- Correspondance ancien → nouveau (feuilles historiques, titres de compétences, catégories libres, familles de carte…)
CREATE TABLE public.lyann_taxonomy_legacy_map (
    id           bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    legacy_kind  text    NOT NULL CHECK (legacy_kind IN ('taxonomy_leaf', 'skill_title', 'skill_button', 'request_category', 'map_family', 'activity_key')),
    legacy_key   text    NOT NULL,
    node_code    text    NOT NULL REFERENCES public.lyann_taxonomy_node(code),
    mapping_kind text    NOT NULL CHECK (mapping_kind IN ('exact', 'broad', 'split', 'merge', 'ambiguous')),
    alt_codes    text[]  NOT NULL DEFAULT '{}',
    note         text,
    UNIQUE (legacy_kind, legacy_key)
);

-- ---------------------------------------------------------------------------
-- Sécurité : lecture publique du catalogue (donnée non sensible), écriture réservée à l'administration.
-- ---------------------------------------------------------------------------
ALTER TABLE public.lyann_taxonomy_release        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_taxonomy_group          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_taxonomy_node           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_taxonomy_node_family    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_taxonomy_term           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_taxonomy_ambiguous_term ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_taxonomy_legacy_map     ENABLE ROW LEVEL SECURITY;

CREATE POLICY lyann_taxonomy_group_read   ON public.lyann_taxonomy_group          FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY lyann_taxonomy_node_read    ON public.lyann_taxonomy_node           FOR SELECT TO anon, authenticated USING (active);
CREATE POLICY lyann_taxonomy_nf_read      ON public.lyann_taxonomy_node_family    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY lyann_taxonomy_term_read    ON public.lyann_taxonomy_term           FOR SELECT TO anon, authenticated USING (active);
CREATE POLICY lyann_taxonomy_amb_read     ON public.lyann_taxonomy_ambiguous_term FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY lyann_taxonomy_release_read ON public.lyann_taxonomy_release        FOR SELECT TO anon, authenticated USING (status = 'published');

-- Administration : voir aussi les lignes inactives / brouillons, et écrire.
CREATE POLICY lyann_taxonomy_node_admin    ON public.lyann_taxonomy_node           FOR ALL TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'taxonomy.manage')) WITH CHECK (public.has_admin_permission(auth.uid(), 'taxonomy.manage'));
CREATE POLICY lyann_taxonomy_term_admin    ON public.lyann_taxonomy_term           FOR ALL TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'taxonomy.manage')) WITH CHECK (public.has_admin_permission(auth.uid(), 'taxonomy.manage'));
CREATE POLICY lyann_taxonomy_group_admin   ON public.lyann_taxonomy_group          FOR ALL TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'taxonomy.manage')) WITH CHECK (public.has_admin_permission(auth.uid(), 'taxonomy.manage'));
CREATE POLICY lyann_taxonomy_nf_admin      ON public.lyann_taxonomy_node_family    FOR ALL TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'taxonomy.manage')) WITH CHECK (public.has_admin_permission(auth.uid(), 'taxonomy.manage'));
CREATE POLICY lyann_taxonomy_amb_admin     ON public.lyann_taxonomy_ambiguous_term FOR ALL TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'taxonomy.manage')) WITH CHECK (public.has_admin_permission(auth.uid(), 'taxonomy.manage'));
CREATE POLICY lyann_taxonomy_release_admin ON public.lyann_taxonomy_release        FOR ALL TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'taxonomy.manage')) WITH CHECK (public.has_admin_permission(auth.uid(), 'taxonomy.manage'));
CREATE POLICY lyann_taxonomy_legacy_admin  ON public.lyann_taxonomy_legacy_map     FOR ALL TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'taxonomy.manage')) WITH CHECK (public.has_admin_permission(auth.uid(), 'taxonomy.manage'));

-- Droits de table : lecture pour les clients, rien d'autre (l'écriture passe par RLS administrateur ou par le rôle de migration).
REVOKE ALL ON public.lyann_taxonomy_release, public.lyann_taxonomy_group, public.lyann_taxonomy_node, public.lyann_taxonomy_node_family,
              public.lyann_taxonomy_term, public.lyann_taxonomy_ambiguous_term, public.lyann_taxonomy_legacy_map FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lyann_taxonomy_release, public.lyann_taxonomy_group, public.lyann_taxonomy_node, public.lyann_taxonomy_node_family,
                public.lyann_taxonomy_term, public.lyann_taxonomy_ambiguous_term TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lyann_taxonomy_release, public.lyann_taxonomy_group, public.lyann_taxonomy_node, public.lyann_taxonomy_node_family,
                public.lyann_taxonomy_term, public.lyann_taxonomy_ambiguous_term, public.lyann_taxonomy_legacy_map TO authenticated;
GRANT SELECT ON public.lyann_taxonomy_legacy_map TO authenticated;

COMMIT;
