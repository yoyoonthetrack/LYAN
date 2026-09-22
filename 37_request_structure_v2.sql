-- ============================================================================
-- LYANN — Migration 37: annonce structure v2 (date, prix, réputation publique)
--
-- La carte d'annonce doit afficher une date réelle, un mode de prix explicite
-- et la réputation vérifiable de l'auteur. Trois manques bloquaient cela :
--
--   1. `requests.urgency` est un texte libre sans date stockée : impossible
--      d'afficher « Sam. 3 oct. · 18h ».
--   2. `requests.budget` est un montant unique : impossible d'exprimer
--      « sur devis », « prix fixe » et « fourchette » sans ambiguïté.
--   3. `public_profiles` n'expose ni le badge vérifié ni la note agrégée, et
--      la seule source de réputation est une RPC par profil, donc inutilisable
--      sur une liste d'annonces (N+1).
--
-- `requests.budget` devient le montant principal : le montant exact en mode
-- FIXED, la borne basse en mode RANGE, NULL en mode QUOTE. Aucune colonne
-- existante n'est renommée ni supprimée.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- SECTION 1 : NOUVELLES COLONNES
-- ----------------------------------------------------------------------------
ALTER TABLE public.requests
    ADD COLUMN IF NOT EXISTS date_mode text,
    ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
    ADD COLUMN IF NOT EXISTS price_mode text,
    ADD COLUMN IF NOT EXISTS budget_max numeric;

COMMENT ON COLUMN public.requests.date_mode IS 'ASAP | FLEXIBLE | EXACT | TO_AGREE. scheduled_at est renseigné si et seulement si EXACT.';
COMMENT ON COLUMN public.requests.scheduled_at IS 'Date et heure précises voulues par l''auteur. NULL sauf en mode EXACT.';
COMMENT ON COLUMN public.requests.price_mode IS 'QUOTE | FIXED | RANGE. Pilote l''interprétation de budget et budget_max.';
COMMENT ON COLUMN public.requests.budget IS 'Montant exact en mode FIXED, borne basse en mode RANGE, NULL en mode QUOTE.';
COMMENT ON COLUMN public.requests.budget_max IS 'Borne haute en mode RANGE uniquement, sinon NULL.';

-- ----------------------------------------------------------------------------
-- SECTION 2 : REPRISE DES DONNÉES EXISTANTES
-- ----------------------------------------------------------------------------

-- L'option historique « date » était libellée « Date à convenir ensemble » côté
-- formulaire : aucune date n'a jamais été collectée, donc TO_AGREE et non EXACT.
UPDATE public.requests
SET date_mode = CASE lower(coalesce(urgency, ''))
        WHEN 'urgent' THEN 'ASAP'
        WHEN 'date'   THEN 'TO_AGREE'
        ELSE 'FLEXIBLE'
    END
WHERE date_mode IS NULL;

-- Un budget nul ou négatif n'est pas un prix : ces annonces repassent sur devis.
UPDATE public.requests
SET budget = NULL
WHERE budget IS NOT NULL AND budget <= 0;

UPDATE public.requests
SET price_mode = CASE WHEN budget IS NULL THEN 'QUOTE' ELSE 'FIXED' END
WHERE price_mode IS NULL;

UPDATE public.requests
SET budget_max = NULL
WHERE budget_max IS NOT NULL AND price_mode <> 'RANGE';

-- ----------------------------------------------------------------------------
-- SECTION 3 : INVARIANTS
-- ----------------------------------------------------------------------------
ALTER TABLE public.requests
    ALTER COLUMN date_mode SET DEFAULT 'FLEXIBLE',
    ALTER COLUMN price_mode SET DEFAULT 'QUOTE';

ALTER TABLE public.requests
    ALTER COLUMN date_mode SET NOT NULL,
    ALTER COLUMN price_mode SET NOT NULL;

ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_date_mode_shape;
ALTER TABLE public.requests ADD CONSTRAINT requests_date_mode_shape CHECK (
    date_mode IN ('ASAP', 'FLEXIBLE', 'EXACT', 'TO_AGREE')
    AND (date_mode = 'EXACT') = (scheduled_at IS NOT NULL)
);

ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_price_mode_shape;
ALTER TABLE public.requests ADD CONSTRAINT requests_price_mode_shape CHECK (
    CASE price_mode
        WHEN 'QUOTE' THEN budget IS NULL AND budget_max IS NULL
        WHEN 'FIXED' THEN budget IS NOT NULL AND budget > 0 AND budget_max IS NULL
        WHEN 'RANGE' THEN budget IS NOT NULL AND budget_max IS NOT NULL
                          AND budget > 0 AND budget_max >= budget
        ELSE false
    END
);

-- ----------------------------------------------------------------------------
-- SECTION 4 : RÉPUTATION PUBLIQUE AGRÉGÉE
--
-- La carte d'annonce lit la note de l'auteur en une seule requête. La vue reste
-- une projection étroite : ni email, ni téléphone, ni adresse, ni champs
-- Stripe/KYC. `kyc_verified` n'est pas exposé tel quel, seulement le booléen
-- dérivé `is_pro_verified`, comme le fait déjà get_user_trust_and_reputation.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reviews_target_rating ON public.reviews (target_id, rating);

CREATE OR REPLACE VIEW public.public_profiles AS
SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.avatar_url,
    p.territory,
    p.city,
    p.bio,
    p.is_pro,
    p.professional_status,
    p.created_at,
    coalesce(p.is_verified, false) AS is_verified,
    (coalesce(p.is_pro, false) AND coalesce(p.kyc_verified, false)) AS is_pro_verified,
    r.average_rating,
    coalesce(r.reviews_count, 0) AS reviews_count
FROM public.profiles p
LEFT JOIN LATERAL (
    SELECT round(avg(rating)::numeric, 1) AS average_rating,
           count(*) AS reviews_count
    FROM public.reviews
    WHERE target_id = p.id AND rating IS NOT NULL
) r ON true;

-- La migration 36 a rétabli le comportement SECURITY DEFINER : `profiles` est
-- owner-only sous RLS, donc un SECURITY INVOKER rendrait l'annuaire inutilisable.
ALTER VIEW public.public_profiles RESET (security_invoker);

COMMENT ON VIEW public.public_profiles IS 'Projection publique volontairement étroite. average_rating est NULL tant qu''aucun avis noté n''existe : aucune note par défaut n''est inventée.';

GRANT SELECT ON public.public_profiles TO anon, authenticated, service_role;

COMMIT;
