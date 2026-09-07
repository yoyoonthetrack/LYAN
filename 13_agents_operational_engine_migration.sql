-- ==============================================================================
-- LYANN DOM — MIGRATION 13 : AGENTS LYANN V2 — OPERATIONAL INTELLIGENCE & CONTROL CENTER
-- Idempotent & Reversible Migration for LYANN Admin V2 (Step 6)
-- DO NOT EXECUTE AUTOMATICALLY — FOR MANUAL EXECUTION IN SUPABASE SQL EDITOR ONLY
-- ==============================================================================

BEGIN;

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLE IDENTITÉ AVANCÉE ET PROFIL AGENT
CREATE TABLE IF NOT EXISTS public.lyann_agent_profiles (
    agent_id UUID PRIMARY KEY REFERENCES public.lyann_agents(id) ON DELETE CASCADE,
    avatar_url TEXT DEFAULT 'avatar_01.png',
    first_name TEXT NOT NULL,
    internal_name TEXT NOT NULL,
    public_name TEXT NOT NULL,
    bio_short TEXT,
    bio_full TEXT,
    persona_age INT DEFAULT 35,
    commune TEXT NOT NULL DEFAULT 'Baie-Mahault',
    territory_code TEXT NOT NULL DEFAULT '971', -- 971: Guadeloupe, 972: Martinique, 973: Guyane, 974: Réunion, 976: Mayotte
    languages TEXT[] DEFAULT ARRAY['fr', 'cr'],
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_agent_profile_territory CHECK (territory_code IN ('971', '972', '973', '974', '976')),
    CONSTRAINT chk_agent_profile_status CHECK (status IN ('ACTIVE', 'PAUSED', 'SUSPENDED', 'ERREUR'))
);

-- 3. TABLE PERSONNALITÉ & PERSONA BUILDER
CREATE TABLE IF NOT EXISTS public.lyann_agent_personalities (
    agent_id UUID PRIMARY KEY REFERENCES public.lyann_agents(id) ON DELETE CASCADE,
    tone TEXT NOT NULL DEFAULT 'chaleureux', -- chaleureux, professionnel, amical, direct, pédagogique, dynamique, discret
    language_level TEXT NOT NULL DEFAULT 'naturel', -- très simple, naturel, soutenu
    formality TEXT NOT NULL DEFAULT 'vouvoiement', -- tutoiement, vouvoiement, adaptatif
    emoji_style TEXT NOT NULL DEFAULT 'léger', -- aucun, léger, normal
    creole_usage TEXT NOT NULL DEFAULT 'occasionnel', -- jamais, occasionnel, naturel
    permanent_instructions TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_agent_tone CHECK (tone IN ('chaleureux', 'professionnel', 'amical', 'direct', 'pédagogique', 'dynamique', 'discret')),
    CONSTRAINT chk_agent_language_level CHECK (language_level IN ('très simple', 'naturel', 'soutenu')),
    CONSTRAINT chk_agent_formality CHECK (formality IN ('tutoiement', 'vouvoiement', 'adaptatif')),
    CONSTRAINT chk_agent_emoji_style CHECK (emoji_style IN ('aucun', 'léger', 'normal')),
    CONSTRAINT chk_agent_creole_usage CHECK (creole_usage IN ('jamais', 'occasionnel', 'naturel'))
);

-- 4. TABLE TERRITOIRE, PÉRIMÈTRE & TAGS DE MATCHING
CREATE TABLE IF NOT EXISTS public.lyann_agent_perimeters (
    agent_id UUID PRIMARY KEY REFERENCES public.lyann_agents(id) ON DELETE CASCADE,
    territory_code TEXT NOT NULL DEFAULT '971',
    allowed_communes TEXT[] DEFAULT ARRAY['Baie-Mahault', 'Pointe-à-Pitre', 'Les Abymes', 'Le Gosier'],
    radius_km INT DEFAULT 25,
    priority_zones TEXT[] DEFAULT ARRAY['Grande-Terre'],
    categories TEXT[] DEFAULT ARRAY['Jardinage', 'Bricolage', 'Ménage'],
    subcategories TEXT[] DEFAULT ARRAY['Tonte de pelouse', 'Débroussaillage', 'Nettoyage terrasse'],
    internal_tags TEXT[] DEFAULT ARRAY['#971', '#JARDINAGE', '#BAIE_MAHAULT', '#PETITS_TRAVAUX'],
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 5. TABLE AUTONOMY MATRIX (MATRICE DE PERMISSIONS PAR ACTION)
CREATE TABLE IF NOT EXISTS public.lyann_agent_permissions (
    agent_id UUID PRIMARY KEY REFERENCES public.lyann_agents(id) ON DELETE CASCADE,
    preset_level INT NOT NULL DEFAULT 1, -- 0: Observation, 1: Assisté, 2: Autonome Limité, 3: Autonome
    read_bokantaj TEXT NOT NULL DEFAULT 'AUTORISÉ', -- INTERDIT, APPROBATION, AUTORISÉ
    prepare_post TEXT NOT NULL DEFAULT 'AUTORISÉ',
    publish_post TEXT NOT NULL DEFAULT 'APPROBATION',
    comment TEXT NOT NULL DEFAULT 'APPROBATION',
    chat_response TEXT NOT NULL DEFAULT 'AUTORISÉ',
    initiate_conv TEXT NOT NULL DEFAULT 'INTERDIT',
    respond_request TEXT NOT NULL DEFAULT 'AUTORISÉ',
    create_proposal TEXT NOT NULL DEFAULT 'INTERDIT',
    modify_content TEXT NOT NULL DEFAULT 'APPROBATION',
    add_photo TEXT NOT NULL DEFAULT 'AUTORISÉ',
    schedule_post TEXT NOT NULL DEFAULT 'APPROBATION',
    max_posts_per_day INT DEFAULT 3,
    cooldown_minutes INT DEFAULT 60,
    duplicate_prevention BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_perm_read_bokantaj CHECK (read_bokantaj IN ('INTERDIT', 'APPROBATION', 'AUTORISÉ')),
    CONSTRAINT chk_perm_prepare_post CHECK (prepare_post IN ('INTERDIT', 'APPROBATION', 'AUTORISÉ')),
    CONSTRAINT chk_perm_publish_post CHECK (publish_post IN ('INTERDIT', 'APPROBATION', 'AUTORISÉ')),
    CONSTRAINT chk_perm_comment CHECK (comment IN ('INTERDIT', 'APPROBATION', 'AUTORISÉ')),
    CONSTRAINT chk_perm_chat_response CHECK (chat_response IN ('INTERDIT', 'APPROBATION', 'AUTORISÉ')),
    CONSTRAINT chk_perm_initiate_conv CHECK (initiate_conv IN ('INTERDIT', 'APPROBATION', 'AUTORISÉ')),
    CONSTRAINT chk_perm_respond_request CHECK (respond_request IN ('INTERDIT', 'APPROBATION', 'AUTORISÉ')),
    CONSTRAINT chk_perm_create_proposal CHECK (create_proposal IN ('INTERDIT', 'APPROBATION', 'AUTORISÉ')),
    CONSTRAINT chk_perm_modify_content CHECK (modify_content IN ('INTERDIT', 'APPROBATION', 'AUTORISÉ')),
    CONSTRAINT chk_perm_add_photo CHECK (add_photo IN ('INTERDIT', 'APPROBATION', 'AUTORISÉ')),
    CONSTRAINT chk_perm_schedule_post CHECK (schedule_post IN ('INTERDIT', 'APPROBATION', 'AUTORISÉ'))
);

-- 6. TABLE TÂCHES RÉCURRENTS (SCHEDULER AGENT)
CREATE TABLE IF NOT EXISTS public.lyann_agent_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES public.lyann_agents(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    instruction TEXT NOT NULL,
    schedule_type TEXT NOT NULL DEFAULT 'WEEKLY', -- DAILY, WEEKLY, CRON, ONESHOT
    schedule_expression TEXT NOT NULL DEFAULT '0 8 * * 1',
    timezone TEXT NOT NULL DEFAULT 'America/Guadeloupe',
    next_run_at TIMESTAMPTZ NULL,
    last_run_at TIMESTAMPTZ NULL,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_schedule_type CHECK (schedule_type IN ('DAILY', 'WEEKLY', 'CRON', 'ONESHOT'))
);

-- 7. TABLE MÉMOIRE OPÉRATIONNELLE CONTRÔLÉE
CREATE TABLE IF NOT EXISTS public.lyann_agent_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES public.lyann_agents(id) ON DELETE CASCADE,
    memory_type TEXT NOT NULL, -- PREFERENCE, CONVERSATION_SUMMARY, TASK_HISTORY, POST_HISTORY, OWNER_FEEDBACK, ACTION_OUTCOME
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_memory_type CHECK (memory_type IN ('PREFERENCE', 'CONVERSATION_SUMMARY', 'TASK_HISTORY', 'POST_HISTORY', 'OWNER_FEEDBACK', 'ACTION_OUTCOME'))
);

-- GARDE-FOU DB : INTERDICTION DE STOCKER DES DONNÉES SENSIBLES / BANCAIRES DANS LA MÉMOIRE AGENT
CREATE OR REPLACE FUNCTION public.check_sensitive_agent_memory()
RETURNS TRIGGER AS $$
DECLARE
    v_val_str TEXT;
BEGIN
    v_val_str := LOWER(NEW.value::text);
    IF v_val_str LIKE '%stripe%' OR v_val_str LIKE '%card%' OR v_val_str LIKE '%password%' OR v_val_str LIKE '%secret%' OR v_val_str LIKE '%iban%' THEN
        RAISE EXCEPTION 'SÉCURITÉ SANS CONCESSION : Stockage de données bancaires ou identifiants secrets interdit dans la mémoire Agent.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_sensitive_agent_memory ON public.lyann_agent_memories;
CREATE TRIGGER trg_check_sensitive_agent_memory
    BEFORE INSERT OR UPDATE ON public.lyann_agent_memories
    FOR EACH ROW
    EXECUTE FUNCTION public.check_sensitive_agent_memory();

-- 8. TABLE ACTIVITÉ & TIMELINE D'AGENT
CREATE TABLE IF NOT EXISTS public.lyann_agent_activity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES public.lyann_agents(id) ON DELETE CASCADE,
    task_id UUID NULL REFERENCES public.lyann_agent_tasks(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- DETECTION, PREPARATION, APPROVAL_REQUESTED, APPROVED, REJECTED, PUBLISHED, MESSAGE_SENT, TAKEOVER, SUSPENDED
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 9. POLITIQUES DE SÉCURITÉ RLS (STRICT DENY BY DEFAULT)
ALTER TABLE public.lyann_agent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_agent_personalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_agent_perimeters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_agent_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_agent_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_agent_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_agent_activity ENABLE ROW LEVEL SECURITY;

-- POLITIQUES SELECT/WRITE RLS BASÉES SUR PERMISSIONS ADMINISTRATIVES
DROP POLICY IF EXISTS p_lyann_agent_profiles_all ON public.lyann_agent_profiles;
CREATE POLICY p_lyann_agent_profiles_all ON public.lyann_agent_profiles
    FOR ALL TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'agents.read') OR public.has_admin_permission(auth.uid(), 'agents.manage'));

DROP POLICY IF EXISTS p_lyann_agent_personalities_all ON public.lyann_agent_personalities;
CREATE POLICY p_lyann_agent_personalities_all ON public.lyann_agent_personalities
    FOR ALL TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'agents.read') OR public.has_admin_permission(auth.uid(), 'agents.manage'));

DROP POLICY IF EXISTS p_lyann_agent_perimeters_all ON public.lyann_agent_perimeters;
CREATE POLICY p_lyann_agent_perimeters_all ON public.lyann_agent_perimeters
    FOR ALL TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'agents.read') OR public.has_admin_permission(auth.uid(), 'agents.manage'));

DROP POLICY IF EXISTS p_lyann_agent_permissions_all ON public.lyann_agent_permissions;
CREATE POLICY p_lyann_agent_permissions_all ON public.lyann_agent_permissions
    FOR ALL TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'agents.read') OR public.has_admin_permission(auth.uid(), 'agents.manage'));

DROP POLICY IF EXISTS p_lyann_agent_schedules_all ON public.lyann_agent_schedules;
CREATE POLICY p_lyann_agent_schedules_all ON public.lyann_agent_schedules
    FOR ALL TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'agents.read') OR public.has_admin_permission(auth.uid(), 'agents.manage'));

DROP POLICY IF EXISTS p_lyann_agent_memories_all ON public.lyann_agent_memories;
CREATE POLICY p_lyann_agent_memories_all ON public.lyann_agent_memories
    FOR ALL TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'agents.read') OR public.has_admin_permission(auth.uid(), 'agents.manage'));

DROP POLICY IF EXISTS p_lyann_agent_activity_all ON public.lyann_agent_activity;
CREATE POLICY p_lyann_agent_activity_all ON public.lyann_agent_activity
    FOR ALL TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'agents.read') OR public.has_admin_permission(auth.uid(), 'agents.manage'));

COMMIT;
