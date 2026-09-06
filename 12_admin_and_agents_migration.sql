-- ==============================================================================
-- LYANN DOM — MIGRATION 12 : BACK-OFFICE ADMIN, ROLES, AGENTS LYANN & AUDIT LOGS
-- Idempotent & Reversible Migration for LYANN Admin V1
-- ==============================================================================

BEGIN;

-- 1. EXTENSIONS (UUID)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLE ÉQUIPE & RÔLES ADMINISTRATIFS
CREATE TABLE IF NOT EXISTS public.admin_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL, -- SUPER_ADMIN, OWNER, ADMIN, SUPPORT, FINANCE, MODERATION, EMPLOYEE
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.admin_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL, -- users.read, users.manage, agents.read, agents.manage, agents.approve, finance.read, finance.refund, disputes.read, disputes.manage, moderation.manage, team.manage, settings.manage
    name TEXT NOT NULL,
    module TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.admin_role_permissions (
    role_id UUID NOT NULL REFERENCES public.admin_roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.admin_permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.admin_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    role_id UUID NOT NULL REFERENCES public.admin_roles(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, INACTIVE
    created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_admin_member_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE'))
);

-- 3. MOTEUR D'AGENTS LYANN (LOGICIELS CONTROLES - NON HUMAINS)
CREATE TABLE IF NOT EXISTS public.lyann_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    linked_profile_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    agent_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, PAUSED, AWAITING_VALIDATION, ERROR, SUSPENDED
    personality TEXT,
    tone TEXT DEFAULT 'chaleureux',
    languages TEXT[] DEFAULT ARRAY['fr', 'cr'],
    zones TEXT[] DEFAULT ARRAY['guadeloupe', 'martinique', 'guyane', 'reunion'],
    skills TEXT[] DEFAULT ARRAY['jardinage', 'menage', 'bricolage'],
    autonomy_level INT NOT NULL DEFAULT 1, -- 0: Observation, 1: Assisté, 2: Autonome Limité, 3: Autonome
    system_instructions TEXT,
    is_global_paused BOOLEAN DEFAULT false,
    created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    last_activity_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_agent_status CHECK (status IN ('ACTIVE', 'PAUSED', 'AWAITING_VALIDATION', 'ERREUR', 'SUSPENDED')),
    CONSTRAINT chk_autonomy_level CHECK (autonomy_level BETWEEN 0 AND 3)
);

-- GARDE-FOU DB STRICT : UN PROFIL AGENT NE PEUT N'AVOIR NI COMPTE STRIPE CONNECT NI CLIENT STRIPE
CREATE OR REPLACE FUNCTION public.check_agent_financial_isolation()
RETURNS TRIGGER AS $$
DECLARE
    is_agent BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.lyann_agents WHERE linked_profile_id = NEW.id) INTO is_agent;
    IF is_agent THEN
        IF NEW.stripe_account_id IS NOT NULL OR NEW.stripe_customer_id IS NOT NULL THEN
            RAISE EXCEPTION 'ISOLATION FINANCIÈRE VIOLÉE : Un Agent LYANN (non humain) ne peut posséder d identifiant Stripe réel.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_agent_financial_isolation ON public.profiles;
CREATE TRIGGER trg_check_agent_financial_isolation
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.check_agent_financial_isolation();

-- 4. TAGS INTERNES RELATIONNELS DES AGENTS LYANN
CREATE TABLE IF NOT EXISTS public.lyann_agent_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES public.lyann_agents(id) ON DELETE CASCADE,
    tag_name TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_agent_tag UNIQUE(agent_id, tag_name)
);

-- 5. TÂCHES AGENTS (TASK ENGINE)
CREATE TABLE IF NOT EXISTS public.lyann_agent_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES public.lyann_agents(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    instruction TEXT NOT NULL,
    task_type TEXT NOT NULL DEFAULT 'POST_CREATION', -- POST_CREATION, CHAT_RESPONSE, MATCHING_ASSIST, MODERATION_CHECK
    status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT, QUEUED, SCHEDULED, RUNNING, WAITING_APPROVAL, COMPLETED, FAILED, CANCELLED
    priority TEXT DEFAULT 'NORMAL', -- LOW, NORMAL, HIGH, URGENT
    scheduled_at TIMESTAMPTZ NULL,
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    requires_approval BOOLEAN DEFAULT true,
    approval_status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, MODIFIED
    approved_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    result JSONB NULL,
    error TEXT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_task_status CHECK (status IN ('DRAFT', 'QUEUED', 'SCHEDULED', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED')),
    CONSTRAINT chk_approval_status CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'MODIFIED'))
);

-- 6. CONTRÔLE DE TAKEOVER CONVERSATIONNEL
CREATE TABLE IF NOT EXISTS public.lyann_agent_conversation_control (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id TEXT NOT NULL,
    agent_id UUID NOT NULL REFERENCES public.lyann_agents(id) ON DELETE CASCADE,
    is_paused BOOLEAN DEFAULT false,
    taken_over_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    taken_over_at TIMESTAMPTZ NULL,
    reason TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_agent_conversation UNIQUE(conversation_id, agent_id)
);

-- 7. JOURNAL D'AUDIT ADMIN CENTRAL IMMUABLE (APPEND-ONLY)
CREATE TABLE IF NOT EXISTS public.admin_audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_type TEXT NOT NULL, -- ADMIN, EMPLOYEE, AGENT, SYSTEM
    actor_id UUID NULL,
    actor_name TEXT NOT NULL,
    action TEXT NOT NULL,
    module_name TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NULL,
    before_state JSONB NULL,
    after_state JSONB NULL,
    reason TEXT NULL,
    ip_address TEXT NULL,
    user_agent TEXT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_actor_type CHECK (actor_type IN ('ADMIN', 'EMPLOYEE', 'AGENT', 'SYSTEM'))
);

-- 8. POLITIQUES DE SÉCURITÉ RLS (DENY BY DEFAULT SUR TOUTES LES TABLES ADMIN & AGENT)
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_agent_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_agent_conversation_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;

-- SEULS LES MEMBRES ADMIN HABILITÉS PEUVENT LIRE LES TABLES D'ADMINISTRATION
CREATE POLICY p_admin_members_select ON public.admin_members
    FOR SELECT TO authenticated
    USING (
        auth.uid() = user_id OR 
        EXISTS (
            SELECT 1 FROM public.admin_members am
            JOIN public.admin_roles ar ON am.role_id = ar.id
            WHERE am.user_id = auth.uid() AND am.status = 'ACTIVE' AND ar.code IN ('SUPER_ADMIN', 'OWNER', 'ADMIN')
        )
    );

CREATE POLICY p_lyann_agents_select ON public.lyann_agents
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_members am
            WHERE am.user_id = auth.uid() AND am.status = 'ACTIVE'
        )
    );

CREATE POLICY p_admin_audit_select ON public.admin_audit_events
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_members am
            WHERE am.user_id = auth.uid() AND am.status = 'ACTIVE'
        )
    );

-- SEULE LA SERVICE ROLE KEY OU LES HANDLERS SERVEUR SÉCURISÉS PEUVENT ÉCRIRE SUR CES TABLES
-- (LES UTILISATEURS STANDARD N'ONT AUCUN DÉCLENCHEUR D'ÉCRITURE SUR L'ADMIN)

COMMIT;
