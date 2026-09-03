-- LYANN DOM V1 - SUPABASE SCHEMA (V2 Mission Paradigm)
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
-- 6. MISSIONS (Contextual logic: Who asks who)
-- ==============================================================================
CREATE TABLE missions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    helper_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    related_request_id UUID REFERENCES requests(id) ON DELETE SET NULL,
    related_service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'DISCUSSION', -- DISCUSSION, PROPOSED, AGREED, PAYMENT_PENDING, IN_PROGRESS, WORK_MARKED_COMPLETE, COMPLETED, DISPUTED
    total_amount NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 7. QUOTES & MILESTONES (Devis linked to missions)
-- ==============================================================================
CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mission_id UUID REFERENCES missions(id) ON DELETE CASCADE,
    quote_number TEXT UNIQUE NOT NULL,
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
-- 8. MESSAGING (Linked to missions for unified chat)
-- ==============================================================================
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mission_id UUID REFERENCES missions(id) ON DELETE CASCADE,
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
-- 9. PAYMENTS & TRANSFERS (Separate Charges and Transfers Paradigm)
-- ==============================================================================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mission_id UUID REFERENCES missions(id) ON DELETE SET NULL,
    quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
    payer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    recipient_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    amount_paid_by_customer NUMERIC NOT NULL,
    lyann_commission_amount NUMERIC NOT NULL,
    lyann_protection_fee NUMERIC NOT NULL,
    provider_payout_amount NUMERIC NOT NULL,
    currency TEXT DEFAULT 'eur',
    customer_payment_status TEXT DEFAULT 'PAYMENT_REQUIRED', -- PAYMENT_REQUIRED, PAYMENT_PROCESSING, CUSTOMER_PAID, FUNDS_SECURED, REFUNDED, FAILED
    provider_transfer_status TEXT DEFAULT 'PENDING_WORK', -- PENDING_WORK, WORK_COMPLETED, CUSTOMER_VALIDATED, PROVIDER_TRANSFER_PENDING, PROVIDER_TRANSFERRED, DISPUTED
    stripe_payment_intent_id TEXT UNIQUE,
    stripe_transfer_id TEXT UNIQUE,
    idempotency_key_transfer TEXT UNIQUE,
    customer_paid_at TIMESTAMP WITH TIME ZONE,
    customer_validated_at TIMESTAMP WITH TIME ZONE,
    provider_transferred_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 10. REVIEWS & RECOMMENDATIONS
-- ==============================================================================
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    target_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    mission_id UUID REFERENCES missions(id) ON DELETE SET NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(author_id, mission_id) -- Only one review per mission
);

CREATE TABLE recommendations (
    recommender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    target_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY(recommender_id, target_id)
);

-- ==============================================================================
-- 11. BOKANTAJ (Feed)
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
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bokantaj_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bokantaj_likes ENABLE ROW LEVEL SECURITY;

-- Profiles: Anyone can read, only owner can update
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Services: Public read, owner manage
CREATE POLICY "Services are viewable by everyone" ON services FOR SELECT USING (true);
CREATE POLICY "Users can manage their own services" ON services FOR ALL USING (auth.uid() = owner_id);

-- Missions: Involved parties can view and update
CREATE POLICY "Involved parties can view missions" ON missions FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = helper_id);
CREATE POLICY "Users can create missions" ON missions FOR INSERT WITH CHECK (auth.uid() = requester_id OR auth.uid() = helper_id);
CREATE POLICY "Involved parties can update missions" ON missions FOR UPDATE USING (auth.uid() = requester_id OR auth.uid() = helper_id);

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

-- Quotes: RLS using subquery to missions table
CREATE POLICY "Involved parties can view quotes" ON quotes FOR SELECT USING (
    EXISTS (SELECT 1 FROM missions WHERE id = quotes.mission_id AND (requester_id = auth.uid() OR helper_id = auth.uid()))
);
CREATE POLICY "Involved parties can create quotes" ON quotes FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM missions WHERE id = quotes.mission_id AND (requester_id = auth.uid() OR helper_id = auth.uid()))
);
CREATE POLICY "Involved parties can update quotes" ON quotes FOR UPDATE USING (
    EXISTS (SELECT 1 FROM missions WHERE id = quotes.mission_id AND (requester_id = auth.uid() OR helper_id = auth.uid()))
);

-- Payments: Only payer and recipient can view
CREATE POLICY "Involved parties can view payments" ON payments FOR SELECT USING (auth.uid() = payer_id OR auth.uid() = recipient_id);

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

-- ==============================================================================
-- 12. ENTERPRISE BACK-OFFICE ADMIN & RBAC SCHEMA
-- ==============================================================================

-- Admin Roles Table
CREATE TABLE admin_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Seed default system admin roles
INSERT INTO admin_roles (name, slug, description, is_system) VALUES
('OWNER', 'owner', 'Propriétaire Super Administrateur avec tous les droits', true),
('ADMINISTRATOR', 'administrator', 'Administrateur Général de la plateforme', true),
('SUPPORT', 'support', 'Gestion du support client et tickets', true),
('FINANCE', 'finance', 'Gestion comptable, paiements et remboursements', true),
('MODERATION', 'moderation', 'Modération des contenus et profilage', true),
('INSURANCE', 'insurance', 'Gestion de la Protection LYANN et réclamations', true);

-- Admin Permissions Table
CREATE TABLE admin_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    module TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT
);

-- Admin Role Permissions Junction
CREATE TABLE admin_role_permissions (
    role_id UUID REFERENCES admin_roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES admin_permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Admin Users Table
CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    role_id UUID REFERENCES admin_roles(id) ON DELETE RESTRICT,
    is_owner BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, REVOKED
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Audit Logs Table (Every administrative action logged)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    actor_username TEXT NOT NULL,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    access_reason TEXT, -- Mandatory for private messaging access
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Feature Flags Table (Real-time toggles)
CREATE TABLE feature_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT true,
    target_audience TEXT DEFAULT 'ALL', -- ALL, ADMIN_ONLY, BETA_TESTERS, PERCENTAGE
    allowed_territories TEXT[] DEFAULT ARRAY['guadeloupe', 'martinique', 'guyane', 'reunion'],
    rollout_percentage INTEGER DEFAULT 100,
    updated_by UUID REFERENCES admin_users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Seed Default Feature Flags
INSERT INTO feature_flags (key, name, description, enabled) VALUES
('bokantaj_feed', 'Fil Bokantaj & Publications', 'Autoriser les publications sur le fil Bokantaj', true),
('stripe_payments', 'Paiements Sécurisés Stripe', 'Activer le système de réservation et de paiement', true),
('subscriptions_pro', 'Abonnements & Formules Pro', 'Activer la gestion des abonnements mensuels', true),
('protection_lyann', 'Protection & Assurance LYANN', 'Activer la couverture Garantie LYANN', true),
('ai_bots_automation', 'Bots IA & Publications Automatisées', 'Activer les bots IA de simulation et d''animation', true),
('new_user_registration', 'Nouvelles Inscriptions', 'Autoriser la création de nouveaux comptes', true);

-- Support Tickets Table
CREATE TABLE support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    category TEXT,
    priority TEXT DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, CRITICAL
    status TEXT DEFAULT 'NEW', -- NEW, OPEN, WAITING_CLIENT, IN_PROGRESS, RESOLVED, CLOSED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Protection / Insurance Claims Table
CREATE TABLE insurance_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_number TEXT UNIQUE NOT NULL,
    mission_id UUID REFERENCES missions(id) ON DELETE CASCADE,
    claimant_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    incident_date DATE NOT NULL,
    description TEXT NOT NULL,
    evidence_urls TEXT[],
    status TEXT DEFAULT 'NEW', -- NEW, IN_REVIEW, DOCS_REQUESTED, APPROVED, REJECTED, REFUNDED, CLOSED
    payout_amount NUMERIC,
    decision_notes TEXT,
    handled_by UUID REFERENCES admin_users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Disputes Table
CREATE TABLE disputes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispute_number TEXT UNIQUE NOT NULL,
    mission_id UUID REFERENCES missions(id) ON DELETE CASCADE,
    initiator_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'OPENED', -- OPENED, UNDER_INVESTIGATION, RESOLVED_REFUND, RESOLVED_PAYOUT, CLOSED
    frozen_amount NUMERIC NOT NULL,
    internal_notes TEXT,
    handled_by UUID REFERENCES admin_users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- AI Bots Table
CREATE TABLE ai_bots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bot_name TEXT NOT NULL,
    avatar_url TEXT,
    territory TEXT DEFAULT 'guadeloupe',
    personality TEXT,
    tone TEXT,
    publishing_frequency TEXT DEFAULT 'DAILY',
    validation_mode TEXT DEFAULT 'MANUAL', -- AUTO, MANUAL, DRAFT
    status TEXT DEFAULT 'ACTIVE', -- ACTIVE, PAUSED
    total_posts_count INTEGER DEFAULT 0,
    last_active_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- AI Bot Activities Table
CREATE TABLE ai_bot_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bot_id UUID REFERENCES ai_bots(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, -- POST, COMMENT
    content TEXT NOT NULL,
    target_post_id UUID REFERENCES bokantaj_posts(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'PENDING_VALIDATION', -- PUBLISHED, PENDING_VALIDATION, REJECTED, DRAFT
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Subscriptions Plans Table
CREATE TABLE subscriptions_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    price_monthly NUMERIC NOT NULL,
    description TEXT,
    features JSONB,
    display_order INTEGER DEFAULT 1,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable RLS on Admin Tables
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Only authenticated admin users can query admin tables
CREATE POLICY "Admin users can access admin_users" ON admin_users FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid() AND au.status = 'ACTIVE')
);
CREATE POLICY "Admin users can view audit logs" ON audit_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid() AND au.status = 'ACTIVE')
);
CREATE POLICY "Public read feature flags" ON feature_flags FOR SELECT USING (true);

-- ==============================================================================
-- 14. MATCHING ENGINE TABLES & INDEXES
-- ==============================================================================

-- User Matching Preferences & Spatial Area
CREATE TABLE IF NOT EXISTS user_matching_preferences (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    matching_enabled BOOLEAN DEFAULT true,
    service_radius_km NUMERIC DEFAULT 20.0,
    matching_latitude NUMERIC,
    matching_longitude NUMERIC,
    public_city TEXT,
    public_area TEXT,
    availability JSONB DEFAULT '["disponible_aujourdhui", "cette_semaine"]'::jsonb,
    mobility JSONB DEFAULT '["vehicule_personnel"]'::jsonb,
    equipment JSONB DEFAULT '[]'::jsonb,
    max_daily_notifications INT DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Internal Skills & Taxonomy Mapping
CREATE TABLE IF NOT EXISTS user_matching_skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    domain_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    subcategory_id TEXT,
    skill_slug TEXT NOT NULL,
    source TEXT DEFAULT 'declared', -- declared, verified_by_history, professional_verified
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Taxonomy & Normalized Tags Reference
CREATE TABLE IF NOT EXISTS internal_taxonomy_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    domain_id TEXT,
    category_id TEXT,
    synonyms TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Targeted Progressive Matching Dispatches
CREATE TABLE IF NOT EXISTS matching_dispatches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id TEXT NOT NULL,
    requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    matched_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    batch_number INT DEFAULT 1,
    matching_score NUMERIC NOT NULL,
    score_breakdown JSONB,
    human_reasons TEXT[] DEFAULT '{}',
    status TEXT DEFAULT 'notified', -- notified, viewed, responded, declined
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indexes for spatial, skill, and preference performance
CREATE INDEX IF NOT EXISTS idx_user_matching_skills_user ON user_matching_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_matching_skills_slug ON user_matching_skills(skill_slug);
CREATE INDEX IF NOT EXISTS idx_user_matching_skills_category ON user_matching_skills(category_id);
CREATE INDEX IF NOT EXISTS idx_matching_dispatches_request ON matching_dispatches(request_id);
CREATE INDEX IF NOT EXISTS idx_matching_dispatches_matched_user ON matching_dispatches(matched_user_id);

-- RLS Policies
ALTER TABLE user_matching_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_matching_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own matching preferences" ON user_matching_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own matching preferences" ON user_matching_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own matching skills" ON user_matching_skills FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view matching dispatches sent to them" ON matching_dispatches FOR SELECT USING (auth.uid() = matched_user_id OR auth.uid() = requester_id);


