-- Isolated QA only. Align schema.sql requests (author_id) with later migrations
-- that assume the production-shaped requester_id / discovery columns.
-- Never run against gzispjfoywklpqatjyop.

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS requester_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS budget numeric,
  ADD COLUMN IF NOT EXISTS urgency text,
  ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'PUBLIC',
  ADD COLUMN IF NOT EXISTS target_user_id uuid,
  ADD COLUMN IF NOT EXISTS taxonomy_id uuid,
  ADD COLUMN IF NOT EXISTS classification_confidence numeric DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS classification_status text DEFAULT 'UNCLASSIFIED',
  ADD COLUMN IF NOT EXISTS safety_status text DEFAULT 'SAFE',
  ADD COLUMN IF NOT EXISTS internal_tags text[] DEFAULT '{}';

UPDATE public.requests
SET requester_id = author_id
WHERE requester_id IS NULL AND author_id IS NOT NULL;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS details text,
  ADD COLUMN IF NOT EXISTS amount numeric,
  ADD COLUMN IF NOT EXISTS valid_until timestamptz;

ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS percentage numeric,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS location text;

-- schema.sql leftover NOT NULL euros columns; canonical writes use *_cents.
ALTER TABLE public.payments
  ALTER COLUMN amount_paid_by_customer DROP NOT NULL,
  ALTER COLUMN lyann_commission_amount DROP NOT NULL,
  ALTER COLUMN lyann_protection_fee DROP NOT NULL,
  ALTER COLUMN provider_payout_amount DROP NOT NULL;
