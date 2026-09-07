-- ==============================================================================
-- LYANN MIGRATION 25 — BOKANTAJ SOCIAL EXPERIENCE V1 (PATCHED PK FIX)
-- ==============================================================================

-- 1. ENHANCE BOKANTAJ_POSTS
ALTER TABLE public.bokantaj_posts ADD COLUMN IF NOT EXISTS media_urls TEXT[];
ALTER TABLE public.bokantaj_posts ADD COLUMN IF NOT EXISTS territory TEXT;

-- 2. ENHANCE BOKANTAJ_LIKES (Non-destructive PK migration from composite to technical id)
-- Step A: Add technical surrogate ID if not exists
ALTER TABLE public.bokantaj_likes ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
UPDATE public.bokantaj_likes SET id = gen_random_uuid() WHERE id IS NULL;

-- Step B: Safely drop old composite primary key constraint (user_id, post_id) if present
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'bokantaj_likes_pkey' 
        AND conrelid = 'public.bokantaj_likes'::regclass
    ) THEN
        ALTER TABLE public.bokantaj_likes DROP CONSTRAINT bokantaj_likes_pkey;
    END IF;
END $$;

-- Step C: Add new PRIMARY KEY constraint on id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.bokantaj_likes'::regclass 
        AND contype = 'p'
    ) THEN
        ALTER TABLE public.bokantaj_likes ADD PRIMARY KEY (id);
    END IF;
END $$;

-- Step D: Make post_id nullable and add request_id FK
ALTER TABLE public.bokantaj_likes ALTER COLUMN post_id DROP NOT NULL;
ALTER TABLE public.bokantaj_likes ADD COLUMN IF NOT EXISTS request_id UUID REFERENCES public.requests(id) ON DELETE CASCADE;

-- Step E: Add CHECK constraint enforcing exactly one target (post_id OR request_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_bokantaj_likes_target'
    ) THEN
        ALTER TABLE public.bokantaj_likes 
        ADD CONSTRAINT chk_bokantaj_likes_target 
        CHECK (
            (post_id IS NOT NULL AND request_id IS NULL) OR 
            (post_id IS NULL AND request_id IS NOT NULL)
        );
    END IF;
END $$;

-- Step F: Unique partial indexes preventing duplicate likes per user per target
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_post_like 
ON public.bokantaj_likes (user_id, post_id) 
WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_request_like 
ON public.bokantaj_likes (user_id, request_id) 
WHERE request_id IS NOT NULL;

-- 3. CREATE BOKANTAJ_COMMENTS TABLE
CREATE TABLE IF NOT EXISTS public.bokantaj_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.bokantaj_posts(id) ON DELETE CASCADE,
    request_id UUID REFERENCES public.requests(id) ON DELETE CASCADE,
    author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    parent_comment_id UUID REFERENCES public.bokantaj_comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    media_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_bokantaj_comments_target CHECK (
        (post_id IS NOT NULL AND request_id IS NULL) OR 
        (post_id IS NULL AND request_id IS NOT NULL)
    )
);

-- Index for fast comment lookups per post/request
CREATE INDEX IF NOT EXISTS idx_bokantaj_comments_post ON public.bokantaj_comments(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bokantaj_comments_request ON public.bokantaj_comments(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bokantaj_comments_parent ON public.bokantaj_comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;

-- 4. CREATE BOKANTAJ_REPORTS TABLE (Step 14 Safety Integration)
CREATE TABLE IF NOT EXISTS public.bokantaj_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    post_id UUID REFERENCES public.bokantaj_posts(id) ON DELETE CASCADE,
    request_id UUID REFERENCES public.requests(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES public.bokantaj_comments(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_bokantaj_reports_target CHECK (
        ((post_id IS NOT NULL)::int +
         (request_id IS NOT NULL)::int +
         (comment_id IS NOT NULL)::int) = 1
    )
);

-- Idempotent check for chk_bokantaj_reports_target if table already existed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_bokantaj_reports_target'
    ) THEN
        ALTER TABLE public.bokantaj_reports 
        ADD CONSTRAINT chk_bokantaj_reports_target 
        CHECK (
            ((post_id IS NOT NULL)::int +
             (request_id IS NOT NULL)::int +
             (comment_id IS NOT NULL)::int) = 1
        );
    END IF;
END $$;

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.bokantaj_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bokantaj_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bokantaj_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bokantaj_reports ENABLE ROW LEVEL SECURITY;

-- bokantaj_posts RLS
DROP POLICY IF EXISTS "Posts are viewable by everyone" ON public.bokantaj_posts;
CREATE POLICY "Posts are viewable by everyone" ON public.bokantaj_posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.bokantaj_posts;
CREATE POLICY "Authenticated users can create posts" ON public.bokantaj_posts FOR INSERT WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Users can update their own posts" ON public.bokantaj_posts;
CREATE POLICY "Users can update their own posts" ON public.bokantaj_posts FOR UPDATE USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "Users can delete their own posts" ON public.bokantaj_posts;
CREATE POLICY "Users can delete their own posts" ON public.bokantaj_posts FOR DELETE USING (auth.uid() = author_id);

-- bokantaj_likes RLS
DROP POLICY IF EXISTS "Likes are viewable by everyone" ON public.bokantaj_likes;
CREATE POLICY "Likes are viewable by everyone" ON public.bokantaj_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage their own likes" ON public.bokantaj_likes;
CREATE POLICY "Users can manage their own likes" 
ON public.bokantaj_likes 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- bokantaj_comments RLS
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.bokantaj_comments;
CREATE POLICY "Comments are viewable by everyone" ON public.bokantaj_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.bokantaj_comments;
CREATE POLICY "Authenticated users can create comments" ON public.bokantaj_comments FOR INSERT WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Users can update their own comments" ON public.bokantaj_comments;
CREATE POLICY "Users can update their own comments" ON public.bokantaj_comments FOR UPDATE USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "Users can delete their own comments" ON public.bokantaj_comments;
CREATE POLICY "Users can delete their own comments" ON public.bokantaj_comments FOR DELETE USING (auth.uid() = author_id);

-- bokantaj_reports RLS
DROP POLICY IF EXISTS "Reports viewable by owner or admin" ON public.bokantaj_reports;
CREATE POLICY "Reports viewable by owner or admin" ON public.bokantaj_reports FOR SELECT USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Authenticated users can submit reports" ON public.bokantaj_reports;
CREATE POLICY "Authenticated users can submit reports" ON public.bokantaj_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
