-- Run only after ensuring no member pin data must be preserved.
BEGIN;
DROP INDEX IF EXISTS public.idx_bokantaj_map_approved;
ALTER TABLE public.bokantaj_posts DROP CONSTRAINT IF EXISTS bokantaj_posts_place_valid;
ALTER TABLE public.bokantaj_posts DROP COLUMN IF EXISTS place_lat;
ALTER TABLE public.bokantaj_posts DROP COLUMN IF EXISTS place_lng;
ALTER TABLE public.bokantaj_posts DROP COLUMN IF EXISTS place_label;
COMMIT;
