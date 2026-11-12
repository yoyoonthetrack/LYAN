-- Rollback of migration 96 — restores the captured policy exactly (INSERT, roles {public}, PERMISSIVE, WITH CHECK true). Staging only.
BEGIN;
DROP POLICY IF EXISTS "Users can insert conversations" ON public.conversations;
CREATE POLICY "Users can insert conversations" ON public.conversations FOR INSERT TO public WITH CHECK (true);
COMMIT;
