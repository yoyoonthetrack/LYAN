-- LYANN Bokantaj map lifecycle — Staging first. Never run on Production before review.
-- Exception list lives apart from posts: users cannot grant themselves a permanent pin.
BEGIN;
CREATE TABLE IF NOT EXISTS public.bokantaj_map_featured (
  post_id uuid PRIMARY KEY REFERENCES public.bokantaj_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  reason text NOT NULL DEFAULT 'Sélection de l’équipe LYANN',
  CONSTRAINT bokantaj_map_featured_reason_length CHECK (char_length(reason) BETWEEN 3 AND 280)
);
ALTER TABLE public.bokantaj_map_featured ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.bokantaj_map_featured FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.bokantaj_map_featured TO anon, authenticated;
DROP POLICY IF EXISTS bokantaj_map_featured_public_approved ON public.bokantaj_map_featured;
CREATE POLICY bokantaj_map_featured_public_approved
  ON public.bokantaj_map_featured FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bokantaj_posts AS post
      WHERE post.id = post_id
        AND post.public_moderation_status = 'approved'
        AND post.place_lat IS NOT NULL
        AND post.place_lng IS NOT NULL
        AND post.place_label IS NOT NULL
    )
  );
COMMENT ON TABLE public.bokantaj_map_featured IS
  'Exceptional map-only permanent pins selected by authorised LYANN administrators. Posts still follow feed moderation; no user self-promotion, no billing.';
COMMIT;
