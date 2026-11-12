-- Rollback of migration 97 — restores the previous defaults. Staging only.
-- Existing functions are not affected by 97 nor by this rollback.
BEGIN;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
DO $sa$
BEGIN
    BEGIN
        EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated';
    EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
        RAISE NOTICE 'migration 97 rollback: supabase_admin defaults not editable here (%), left unchanged', SQLERRM;
    END;
END
$sa$;
COMMIT;
