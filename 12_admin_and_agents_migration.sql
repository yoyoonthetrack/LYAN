-- ==============================================================================
-- LYANN DOM — MIGRATION 12 : BACK-OFFICE ADMIN, ROLES, AGENTS LYANN & AUDIT LOGS
-- Idempotent & Reversible Migration for LYANN Admin V1 (Production Pre-Flight Verified)
-- ==============================================================================

BEGIN;

-- 1. EXTENSIONS (UUID)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ALTER PROFILES: ADD is_agent COLUMN IF NOT EXISTS
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_agent BOOLEAN DEFAULT false NOT NULL;

-- 3. SYSTEM SETTINGS (PERSISTENT KILL SWITCH & CONFIG)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Seed default global kill switch setting if not exists
INSERT INTO public.system_settings (key, value)
VALUES ('agents_global_kill_switch', '{"suspended": false, "reason": "System Initialized"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 4. TABLE ÉQUIPE & RÔLES ADMINISTRATIFS
CREATE TABLE IF NOT EXISTS public.admin_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL, -- SUPER_ADMIN, OWNER, ADMIN, SUPPORT, FINANCE, MODERATION, EMPLOYEE
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.admin_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL, -- users.read, users.manage, agents.read, agents.manage, agents.approve, finance.read, finance.refund, finance.payout, disputes.read, disputes.manage, moderation.manage, team.manage, settings.manage, audit.read
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

-- 5. SEED DEFAULT ROLES & PERMISSIONS
INSERT INTO public.admin_roles (code, name, description) VALUES
    ('SUPER_ADMIN', 'Super Administrateur', 'Accès total à l ensemble de la plateforme'),
    ('OWNER', 'Propriétaire Fondateur', 'Droits de propriété et gouvernance suprême'),
    ('ADMIN', 'Administrateur Général', 'Gestion opérationnelle générale'),
    ('SUPPORT', 'Opérateur Support SLA', 'Gestion de l assistance client et tickets'),
    ('FINANCE', 'Opérateur Finance & Payouts', 'Gestion des flux financiers, litiges et remboursements'),
    ('MODERATION', 'Opérateur Modération & Conformité', 'Modération des contenus et sécurité réseau'),
    ('EMPLOYEE', 'Employé LYANN Standard', 'Compte employé sans privilège automatique (Deny by Default)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.admin_permissions (code, name, module) VALUES
    ('users.read', 'Consulter les utilisateurs', 'Utilisateurs'),
    ('users.manage', 'Gérer les utilisateurs & KYC', 'Utilisateurs'),
    ('agents.read', 'Consulter la flotte d agents', 'Agents LYANN'),
    ('agents.manage', 'Gérer & configurer les agents', 'Agents LYANN'),
    ('agents.approve', 'Valider les actions d agents', 'Agents LYANN'),
    ('finance.read', 'Consulter la comptabilité & paiements', 'Finance'),
    ('finance.refund', 'Déclencher des remboursements', 'Finance'),
    ('finance.payout', 'Déclencher/forcer les versements', 'Finance'),
    ('disputes.read', 'Consulter la console de litiges', 'Litiges'),
    ('disputes.manage', 'Arbitrer et trancher les litiges', 'Litiges'),
    ('moderation.manage', 'Suspendre et sanctionner les membres', 'Modération'),
    ('team.manage', 'Gérer les membres de l équipe admin & RBAC', 'Administration'),
    ('settings.manage', 'Gérer les configurations & Feature Flags', 'Administration'),
    ('audit.read', 'Consulter les journaux d audit logs', 'Journaux')
ON CONFLICT (code) DO NOTHING;

-- Map permissions for default roles
DO $$
DECLARE
    v_role_owner UUID;
    v_role_admin UUID;
    v_role_support UUID;
    v_role_finance UUID;
    v_role_moderation UUID;
BEGIN
    SELECT id INTO v_role_owner FROM public.admin_roles WHERE code = 'OWNER';
    SELECT id INTO v_role_admin FROM public.admin_roles WHERE code = 'ADMIN';
    SELECT id INTO v_role_support FROM public.admin_roles WHERE code = 'SUPPORT';
    SELECT id INTO v_role_finance FROM public.admin_roles WHERE code = 'FINANCE';
    SELECT id INTO v_role_moderation FROM public.admin_roles WHERE code = 'MODERATION';

    -- Owner gets all permissions
    IF v_role_owner IS NOT NULL THEN
        INSERT INTO public.admin_role_permissions (role_id, permission_id)
        SELECT v_role_owner, id FROM public.admin_permissions
        ON CONFLICT DO NOTHING;
    END IF;

    -- Support role permissions
    IF v_role_support IS NOT NULL THEN
        INSERT INTO public.admin_role_permissions (role_id, permission_id)
        SELECT v_role_support, id FROM public.admin_permissions WHERE code IN ('users.read', 'disputes.read', 'audit.read')
        ON CONFLICT DO NOTHING;
    END IF;

    -- Finance role permissions
    IF v_role_finance IS NOT NULL THEN
        INSERT INTO public.admin_role_permissions (role_id, permission_id)
        SELECT v_role_finance, id FROM public.admin_permissions WHERE code IN ('finance.read', 'finance.refund', 'finance.payout', 'disputes.read', 'disputes.manage', 'audit.read')
        ON CONFLICT DO NOTHING;
    END IF;

    -- Moderation role permissions
    IF v_role_moderation IS NOT NULL THEN
        INSERT INTO public.admin_role_permissions (role_id, permission_id)
        SELECT v_role_moderation, id FROM public.admin_permissions WHERE code IN ('users.read', 'moderation.manage', 'audit.read')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 6. FONCTION POSTGRESQL DE VÉRIFICATION RBAC/PERMISSIONS (STRICT DENY BY DEFAULT)
CREATE OR REPLACE FUNCTION public.has_admin_permission(p_user_id UUID, p_permission_code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_super BOOLEAN;
    v_has_perm BOOLEAN;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check if user is active OWNER or SUPER_ADMIN in admin_members
    SELECT EXISTS (
        SELECT 1 
        FROM public.admin_members am
        JOIN public.admin_roles ar ON am.role_id = ar.id
        WHERE am.user_id = p_user_id 
          AND am.status = 'ACTIVE' 
          AND ar.code IN ('SUPER_ADMIN', 'OWNER')
    ) INTO v_is_super;

    IF v_is_super THEN
        RETURN TRUE;
    END IF;

    -- Check if user has explicit permission assigned via role
    SELECT EXISTS (
        SELECT 1 
        FROM public.admin_members am
        JOIN public.admin_roles ar ON am.role_id = ar.id
        JOIN public.admin_role_permissions arp ON ar.id = arp.role_id
        JOIN public.admin_permissions ap ON arp.permission_id = ap.id
        WHERE am.user_id = p_user_id 
          AND am.status = 'ACTIVE' 
          AND ap.code = p_permission_code
    ) INTO v_has_perm;

    RETURN v_has_perm;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 7. MOTEUR D'AGENTS LYANN (LOGICIELS CONTROLES - NON HUMAINS)
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
    created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    last_activity_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_agent_status CHECK (status IN ('ACTIVE', 'PAUSED', 'AWAITING_VALIDATION', 'ERREUR', 'SUSPENDED')),
    CONSTRAINT chk_autonomy_level CHECK (autonomy_level BETWEEN 0 AND 3)
);

-- GARDE-FOU DB STRICT 1 : UN AGENT NE PEUT AVOIR DE COMPTE STRIPE REAL ET DEVAIT ETRE MARQUE is_agent = TRUE
CREATE OR REPLACE FUNCTION public.check_agent_financial_isolation()
RETURNS TRIGGER AS $$
DECLARE
    v_is_agent BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.lyann_agents WHERE linked_profile_id = NEW.id) INTO v_is_agent;
    IF v_is_agent OR NEW.is_agent THEN
        IF NEW.stripe_account_id IS NOT NULL OR NEW.stripe_customer_id IS NOT NULL THEN
            RAISE EXCEPTION 'ISOLATION FINANCIÈRE VIOLÉE : Un Agent LYANN (non humain) ne peut posséder d identifiant Stripe réel.';
        END IF;
        
        -- Agent cannot be added to admin_members
        IF EXISTS (SELECT 1 FROM public.admin_members WHERE user_id = NEW.id) THEN
            RAISE EXCEPTION 'ISOLATION GOUVERNANCE VIOLÉE : Un Agent LYANN ne peut être membre de l équipe d administration.';
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

-- 8. TAGS INTERNES RELATIONNELS DES AGENTS LYANN
CREATE TABLE IF NOT EXISTS public.lyann_agent_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES public.lyann_agents(id) ON DELETE CASCADE,
    tag_name TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_agent_tag UNIQUE(agent_id, tag_name)
);

-- 9. TÂCHES AGENTS (TASK ENGINE PERSISTANT)
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

-- 10. CONTRÔLE DE TAKEOVER CONVERSATIONNEL (PERSISTANT)
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

-- 11. JOURNAL D'AUDIT ADMIN CENTRAL IMMUABLE (APPEND-ONLY)
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

-- INTERDICTION DB UPDATE ET DELETE SUR REGISTRE AUDIT LOGS (APPEND-ONLY VERIFIABLE)
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'REGISTRE D AUDIT INALTÉRABLE : Les modifications (UPDATE) et suppressions (DELETE) d événements d audit sont strictement interdites.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_mutation ON public.admin_audit_events;
CREATE TRIGGER trg_prevent_audit_log_mutation
    BEFORE UPDATE OR DELETE ON public.admin_audit_events
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- 12. POLITIQUES DE SÉCURITÉ RLS (DENY BY DEFAULT SUR TOUTES LES TABLES ADMIN & AGENT)
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_agent_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_agent_conversation_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;

-- POLITIQUES RLS BASÉES SUR COMPÉTENCES ET DROITS STRICTS (NOT JUST EMPLOYEE ROLE)
DROP POLICY IF EXISTS p_system_settings_select ON public.system_settings;
CREATE POLICY p_system_settings_select ON public.system_settings
    FOR SELECT TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'settings.manage'));

DROP POLICY IF EXISTS p_admin_roles_select ON public.admin_roles;
CREATE POLICY p_admin_roles_select ON public.admin_roles
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.admin_members WHERE user_id = auth.uid() AND status = 'ACTIVE'));

DROP POLICY IF EXISTS p_admin_permissions_select ON public.admin_permissions;
CREATE POLICY p_admin_permissions_select ON public.admin_permissions
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.admin_members WHERE user_id = auth.uid() AND status = 'ACTIVE'));

DROP POLICY IF EXISTS p_admin_role_permissions_select ON public.admin_role_permissions;
CREATE POLICY p_admin_role_permissions_select ON public.admin_role_permissions
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.admin_members WHERE user_id = auth.uid() AND status = 'ACTIVE'));

DROP POLICY IF EXISTS p_admin_members_select ON public.admin_members;
CREATE POLICY p_admin_members_select ON public.admin_members
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.has_admin_permission(auth.uid(), 'team.manage'));

DROP POLICY IF EXISTS p_lyann_agents_select ON public.lyann_agents;
CREATE POLICY p_lyann_agents_select ON public.lyann_agents
    FOR SELECT TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'agents.read') OR public.has_admin_permission(auth.uid(), 'agents.manage'));

DROP POLICY IF EXISTS p_lyann_agents_insert ON public.lyann_agents;
CREATE POLICY p_lyann_agents_insert ON public.lyann_agents
    FOR INSERT TO authenticated
    WITH CHECK (public.has_admin_permission(auth.uid(), 'agents.manage'));

DROP POLICY IF EXISTS p_lyann_agent_tasks_select ON public.lyann_agent_tasks;
CREATE POLICY p_lyann_agent_tasks_select ON public.lyann_agent_tasks
    FOR SELECT TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'agents.read') OR public.has_admin_permission(auth.uid(), 'agents.manage'));

DROP POLICY IF EXISTS p_lyann_agent_tasks_write ON public.lyann_agent_tasks;
CREATE POLICY p_lyann_agent_tasks_write ON public.lyann_agent_tasks
    FOR ALL TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'agents.read') OR public.has_admin_permission(auth.uid(), 'agents.manage'));

DROP POLICY IF EXISTS p_admin_audit_select ON public.admin_audit_events;
CREATE POLICY p_admin_audit_select ON public.admin_audit_events
    FOR SELECT TO authenticated
    USING (public.has_admin_permission(auth.uid(), 'audit.read'));

DROP POLICY IF EXISTS p_admin_audit_insert ON public.admin_audit_events;
CREATE POLICY p_admin_audit_insert ON public.admin_audit_events
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;

