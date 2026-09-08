-- ====================================================================
-- LYANN — MIGRATION 30: USER FAVORITES PERSISTENCE & SECURITY (V1)
-- ====================================================================
-- Purpose: Create public.user_favorites table, unique constraints,
--          indexes, and strict owner-only RLS policies.
-- ====================================================================

-- 1. Create public.user_favorites table
CREATE TABLE IF NOT EXISTS public.user_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('PROFILE', 'REQUEST', 'BOKANTAJ_POST')),
    entity_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate favorites for the same entity by the same user
    CONSTRAINT uq_user_favorites_entity UNIQUE (user_id, entity_type, entity_id)
);

-- 2. Create performance & lookup indexes
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id 
    ON public.user_favorites(user_id);

CREATE INDEX IF NOT EXISTS idx_user_favorites_lookup 
    ON public.user_favorites(user_id, entity_type, entity_id);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies if any
DROP POLICY IF EXISTS "Users can view own favorites" ON public.user_favorites;
DROP POLICY IF EXISTS "Users can insert own favorites" ON public.user_favorites;
DROP POLICY IF EXISTS "Users can delete own favorites" ON public.user_favorites;

-- 5. Strict Owner-Only RLS Policies
-- SELECT: Users can only read their own favorites
CREATE POLICY "Users can view own favorites" 
    ON public.user_favorites 
    FOR SELECT 
    TO authenticated 
    USING (auth.uid() = user_id);

-- INSERT: Users can only create favorites for themselves
CREATE POLICY "Users can insert own favorites" 
    ON public.user_favorites 
    FOR INSERT 
    TO authenticated 
    WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can only delete their own favorites
CREATE POLICY "Users can delete own favorites" 
    ON public.user_favorites 
    FOR DELETE 
    TO authenticated 
    USING (auth.uid() = user_id);

-- 6. Grant Permissions
GRANT SELECT, INSERT, DELETE ON public.user_favorites TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.user_favorites TO service_role;
