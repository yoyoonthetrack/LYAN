-- Isolated QA only. Canonical services use category_id / active / pricing_model /
-- indicative_price. The trust RPC and a few clients still read the legacy names.

ALTER TABLE public.services ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS is_active BOOLEAN;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS price_type TEXT;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS base_price NUMERIC;

UPDATE public.services
SET
  category = COALESCE(NULLIF(BTRIM(category), ''), title),
  is_active = COALESCE(is_active, active, true),
  price_type = COALESCE(price_type, pricing_model),
  base_price = COALESCE(base_price, indicative_price);
