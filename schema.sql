-- LYANN DOM V1 - SUPABASE SCHEMA
-- Execute this script in your Supabase SQL Editor.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. PROFILES (Extends auth.users)
-- ==============================================================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    territory TEXT,
    city TEXT,
    bio TEXT,
    avatar_url TEXT,
    is_pro BOOLEAN DEFAULT false,
    kyc_verified BOOLEAN DEFAULT false,
    professional_status TEXT, -- NONE, OCCASIONAL, PROFESSIONAL, COMPANY
    stripe_account_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 2. CATEGORIES
-- ==============================================================================
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    professional_status_required BOOLEAN DEFAULT false,
    verification_required BOOLEAN DEFAULT false,
    insurance_required BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 3. SERVICES (Proposals by users)
-- ==============================================================================
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    pricing_model TEXT, -- HOURLY, FLAT_RATE, DAILY, QUOTE
    indicative_price NUMERIC,
    territory TEXT,
    intervention_radius_km INTEGER,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 4. PROJECTS (Portfolio Gallery)
-- ==============================================================================
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    approximate_location TEXT,
    cover_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE project_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 5. REQUESTS (Demands by users)
-- ==============================================================================
CREATE TABLE requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    territory TEXT,
    city TEXT,
    budget_indicative NUMERIC,
    status TEXT DEFAULT 'OPEN', -- OPEN, ASSIGNED, COMPLETED, CANCELLED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 6. MESSAGING
-- ==============================================================================
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    related_request_id UUID REFERENCES requests(id) ON DELETE SET NULL,
    related_service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE conversation_participants (
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT,
    attachment_url TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 7. QUOTES & MILESTONES (Devis)
-- ==============================================================================
CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_number TEXT UNIQUE NOT NULL,
    provider_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    client_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    related_request_id UUID REFERENCES requests(id) ON DELETE SET NULL,
    description TEXT,
    status TEXT DEFAULT 'DRAFT', -- DRAFT, SENT, VIEWED, ACCEPTED, DECLINED, REVISED
    current_version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE quote_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    total_amount NUMERIC NOT NULL,
    revision_reason TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(quote_id, version_number)
);

CREATE TABLE milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
    quote_version_id UUID REFERENCES quote_versions(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    amount NUMERIC NOT NULL,
    display_order INTEGER DEFAULT 1,
    status TEXT DEFAULT 'PENDING', -- PENDING, VALIDATED, PAID
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 8. REVIEWS & RECOMMENDATIONS
-- ==============================================================================
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    target_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(author_id, quote_id) -- Only one review per mission
);

CREATE TABLE recommendations (
    recommender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    target_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY(recommender_id, target_id)
);

-- ==============================================================================
-- 9. BOKANTAJ (Feed)
-- ==============================================================================
CREATE TABLE bokantaj_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- BESOIN, DISPO, INFO, CONSEIL
    content TEXT NOT NULL,
    city TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE bokantaj_likes (
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID REFERENCES bokantaj_posts(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY(user_id, post_id)
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bokantaj_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bokantaj_likes ENABLE ROW LEVEL SECURITY;

-- Profiles: Anyone can read, only owner can update
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Services: Public read, owner manage
CREATE POLICY "Services are viewable by everyone" ON services FOR SELECT USING (true);
CREATE POLICY "Users can manage their own services" ON services FOR ALL USING (auth.uid() = owner_id);

-- Conversations & Messages: Only participants can read/write
CREATE POLICY "Users can view their conversations" ON conversations FOR SELECT USING (
    EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = conversations.id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert conversations" ON conversations FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view participants" ON conversation_participants FOR SELECT USING (
    EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversation_participants.conversation_id AND cp.user_id = auth.uid())
);
CREATE POLICY "Users can join conversations" ON conversation_participants FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Participants can view messages" ON messages FOR SELECT USING (
    EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())
);
CREATE POLICY "Participants can send messages" ON messages FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())
);

-- Quotes: Provider and Client can view. Provider creates/updates. Client can accept/reject.
CREATE POLICY "Involved parties can view quotes" ON quotes FOR SELECT USING (auth.uid() = provider_id OR auth.uid() = client_id);
CREATE POLICY "Providers can create quotes" ON quotes FOR INSERT WITH CHECK (auth.uid() = provider_id);
CREATE POLICY "Providers and Clients can update quotes" ON quotes FOR UPDATE USING (auth.uid() = provider_id OR auth.uid() = client_id);

-- Bokantaj: Public read, owner manage, authenticated users can like
CREATE POLICY "Posts are viewable by everyone" ON bokantaj_posts FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create posts" ON bokantaj_posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users can update their own posts" ON bokantaj_posts FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "Users can delete their own posts" ON bokantaj_posts FOR DELETE USING (auth.uid() = author_id);

CREATE POLICY "Likes are viewable by everyone" ON bokantaj_likes FOR SELECT USING (true);
CREATE POLICY "Users can manage their own likes" ON bokantaj_likes FOR ALL USING (auth.uid() = user_id);

-- ==============================================================================
-- AUTOMATIC PROFILE CREATION TRIGGER
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, email)
  VALUES (
      new.id, 
      COALESCE(new.raw_user_meta_data->>'first_name', ''), 
      COALESCE(new.raw_user_meta_data->>'last_name', ''), 
      new.email
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
