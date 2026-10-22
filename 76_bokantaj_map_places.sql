-- LYANN / Bokantaj Carte V1. Staging first; deploy to Production only after
-- an independently reviewed release and approved database change.
BEGIN;
ALTER TABLE public.bokantaj_posts
  ADD COLUMN IF NOT EXISTS place_lat double precision,
  ADD COLUMN IF NOT EXISTS place_lng double precision,
  ADD COLUMN IF NOT EXISTS place_label text;

-- A public pin must be an explicit pair with a short human-readable place name.
-- Existing posts without pins remain valid and unchanged.
ALTER TABLE public.bokantaj_posts
  DROP CONSTRAINT IF EXISTS bokantaj_posts_place_valid;
ALTER TABLE public.bokantaj_posts
  ADD CONSTRAINT bokantaj_posts_place_valid CHECK (
    (place_lat IS NULL AND place_lng IS NULL AND place_label IS NULL)
    OR
    (place_lat IS NOT NULL AND place_lng IS NOT NULL AND place_label IS NOT NULL
      AND place_lat BETWEEN -90 AND 90
      AND place_lng BETWEEN -180 AND 180
      AND length(btrim(place_label)) BETWEEN 2 AND 90)
  );
CREATE INDEX IF NOT EXISTS idx_bokantaj_map_approved
  ON public.bokantaj_posts (place_lat, place_lng, created_at DESC)
  WHERE public_moderation_status = 'approved' AND place_lat IS NOT NULL AND place_lng IS NOT NULL;
-- No new grants or RLS policies: existing post publication/moderation rules apply.
COMMIT;
