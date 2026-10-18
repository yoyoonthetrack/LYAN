-- Staging. Public Bokantaj posts can show a title and a separate source.
ALTER TABLE public.bokantaj_posts ADD COLUMN IF NOT EXISTS headline text;
ALTER TABLE public.bokantaj_posts ADD COLUMN IF NOT EXISTS source_name text;
ALTER TABLE public.bokantaj_posts ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE public.bokantaj_posts ADD COLUMN IF NOT EXISTS source_published_at timestamptz;

UPDATE public.profiles
SET bio = replace(bio, 'Compte éditorial IA LYANN', 'Compte éditorial LYANN')
WHERE email IN (
    'lyann-actu@lyann.app',
    'lyann-rimed@lyann.app',
    'lyann-jardinaj@lyann.app',
    'lyann-trafik@lyann.app',
    'lyann-kilti@lyann.app'
);
