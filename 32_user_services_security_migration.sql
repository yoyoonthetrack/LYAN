-- ====================================================================
-- LYANN — MIGRATION 32: USER SERVICES PERSISTENCE & SECURITY (V1)
-- ====================================================================
-- Purpose: Enable Row Level Security (RLS) and grant owner-only CRUD
--          policies on public.services for profile skills persistence.
-- ====================================================================

-- 1. Enable Row Level Security on public.services
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if any to prevent conflicts
DROP POLICY IF EXISTS "Services are viewable by everyone" ON public.services;
DROP POLICY IF EXISTS "Users can insert own services" ON public.services;
DROP POLICY IF EXISTS "Users can update own services" ON public.services;
DROP POLICY IF EXISTS "Users can delete own services" ON public.services;

-- 3. Owner-Only & Public Select RLS Policies
-- SELECT: Anyone (authenticated & anon) can view active services
CREATE POLICY "Services are viewable by everyone"
    ON public.services
    FOR SELECT
    USING (true);

-- INSERT: Authenticated users can insert services owned by themselves
CREATE POLICY "Users can insert own services"
    ON public.services
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = owner_id);

-- UPDATE: Authenticated users can update their own services (with check prevents ownership transfer)
CREATE POLICY "Users can update own services"
    ON public.services
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- DELETE: Authenticated users can delete their own services
CREATE POLICY "Users can delete own services"
    ON public.services
    FOR DELETE
    TO authenticated
    USING (auth.uid() = owner_id);

-- 4. Grant Table Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
