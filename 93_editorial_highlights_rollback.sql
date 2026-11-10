-- Rollback of migration 93 (Staging only, tdktfbtqceldlaeqjtow). Removes the table, trigger, function and policy that 93 created.
--
-- The Storage bucket cannot be deleted from SQL (Supabase refuses direct deletes on storage tables). Once the images are no
-- longer needed, remove it through the Storage API with the Staging service key:
--     supabase.storage.emptyBucket('editorial-highlights'); supabase.storage.deleteBucket('editorial-highlights');
-- An empty bucket without any storage policy is inert (no client can write to it), so leaving it is also a safe state.
BEGIN;

DROP POLICY IF EXISTS editorial_highlights_public_read ON public.editorial_highlights;
DROP TRIGGER IF EXISTS editorial_highlights_touch ON public.editorial_highlights;
DROP TABLE IF EXISTS public.editorial_highlights;
DROP FUNCTION IF EXISTS public.editorial_highlights_touch();

COMMIT;
