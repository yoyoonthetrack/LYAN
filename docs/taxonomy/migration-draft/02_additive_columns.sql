-- 94b_taxonomy_v2_additive_columns — colonnes NULLables de rattachement au nœud v2
-- ============================================================================
-- BROUILLON — NON APPLIQUÉ. Aucune exécution sur Staging ni sur Production dans la phase 3.2B.
-- Ajouter une colonne NULLable sans valeur par défaut est une opération de métadonnées : aucune réécriture de table,
-- aucun verrou long. Aucune colonne existante n'est modifiée. Les anciens clients (bundles iOS 1.0-15/16) ignorent ces colonnes.
-- Rollback : 09_rollback_taxonomy_v2.sql
-- ============================================================================
BEGIN;

ALTER TABLE public.lyann_taxonomy ADD COLUMN IF NOT EXISTS node_code text;
ALTER TABLE public.requests       ADD COLUMN IF NOT EXISTS taxonomy_node_code text;
ALTER TABLE public.services       ADD COLUMN IF NOT EXISTS taxonomy_node_code text;
-- Provenance du rattachement : permet de distinguer un choix explicite d'un rattachement reconstitué (confiance plus faible).
-- Valeurs prévues : 'user' · 'classifier' · 'backfill_leaf' · 'backfill_title' · 'backfill_category'.
ALTER TABLE public.requests       ADD COLUMN IF NOT EXISTS taxonomy_node_source text;
ALTER TABLE public.services       ADD COLUMN IF NOT EXISTS taxonomy_node_source text;

-- Clés étrangères posées NOT VALID (aucun scan) ; validation séparée après le backfill (VALIDATE CONSTRAINT : verrou léger).
ALTER TABLE public.lyann_taxonomy ADD CONSTRAINT lyann_taxonomy_node_code_fk
    FOREIGN KEY (node_code) REFERENCES public.lyann_taxonomy_node(code) NOT VALID;
ALTER TABLE public.requests ADD CONSTRAINT requests_taxonomy_node_code_fk
    FOREIGN KEY (taxonomy_node_code) REFERENCES public.lyann_taxonomy_node(code) NOT VALID;
ALTER TABLE public.services ADD CONSTRAINT services_taxonomy_node_code_fk
    FOREIGN KEY (taxonomy_node_code) REFERENCES public.lyann_taxonomy_node(code) NOT VALID;

CREATE INDEX IF NOT EXISTS requests_taxonomy_node_code_idx ON public.requests (taxonomy_node_code) WHERE taxonomy_node_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS services_taxonomy_node_code_idx ON public.services (taxonomy_node_code) WHERE taxonomy_node_code IS NOT NULL;

COMMIT;
