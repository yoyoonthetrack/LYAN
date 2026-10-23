-- Minimal local fixture schema for entitlement guard concurrency, not an application migration.
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE);
CREATE FUNCTION public.fixture_profile() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO public.profiles VALUES(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER fixture_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.fixture_profile();
CREATE TABLE public.missions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),helper_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
 requester_id uuid REFERENCES profiles(id) ON DELETE CASCADE,status text DEFAULT 'DISCUSSION',title text,created_at timestamptz DEFAULT now()
);
CREATE TABLE public.services(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
 title text NOT NULL,description text,category_id uuid,category text,slug text NOT NULL,active boolean DEFAULT true,is_active boolean,
 base_price numeric,indicative_price numeric,price_type text,pricing_model text
);
CREATE TABLE public.user_portfolio_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
 image_url text NOT NULL,caption text
);
CREATE TABLE public.lyann_plan_memberships(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,plan text NOT NULL,status text NOT NULL,
 expires_at timestamptz NOT NULL,source text,updated_at timestamptz DEFAULT now()
);
