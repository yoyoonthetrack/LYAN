-- 10_resolve_legacy_skill — ROLLBACK (PRÊT ET TESTÉ SUR LE BANC — NON APPLIQUÉ)
-- Retire la fonction seulement. Les rattachements déjà faits par des membres (taxonomy_node_source = 'user') sont des choix de membres : ils ne sont pas
-- défaits ici (ils disparaîtraient avec les colonnes si 09 était rejouée, ce qui est le retour arrière complet de la taxonomie v2).
BEGIN;
DROP FUNCTION IF EXISTS public.lyann_resolve_legacy_skill(uuid, text);
COMMIT;
