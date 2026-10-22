-- LYANN V3.2 — Helpdesk opérationnel + pilotage des tâches agents
-- Staging only. Idempotent. Does not touch payments or Production.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.helpdesk_tickets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference text UNIQUE NOT NULL,
    member_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    subject text NOT NULL,
    status text NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
    priority text NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    conversation_id uuid,
    report_id uuid,
    first_response_at timestamptz,
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.helpdesk_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL REFERENCES public.helpdesk_tickets(id) ON DELETE CASCADE,
    author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    kind text NOT NULL DEFAULT 'public' CHECK (kind IN ('public', 'internal')),
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.helpdesk_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL REFERENCES public.helpdesk_tickets(id) ON DELETE CASCADE,
    actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    action text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_status ON public.helpdesk_tickets (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_member ON public.helpdesk_tickets (member_id);
CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_assigned ON public.helpdesk_tickets (assigned_to);
CREATE INDEX IF NOT EXISTS idx_helpdesk_messages_ticket ON public.helpdesk_messages (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_helpdesk_events_ticket ON public.helpdesk_events (ticket_id, created_at);

ALTER TABLE public.helpdesk_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helpdesk_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helpdesk_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.helpdesk_tickets FROM anon, authenticated;
REVOKE ALL ON public.helpdesk_messages FROM anon, authenticated;
REVOKE ALL ON public.helpdesk_events FROM anon, authenticated;
GRANT SELECT ON public.helpdesk_tickets TO authenticated;
GRANT SELECT ON public.helpdesk_messages TO authenticated;
GRANT ALL ON public.helpdesk_tickets TO service_role;
GRANT ALL ON public.helpdesk_messages TO service_role;
GRANT ALL ON public.helpdesk_events TO service_role;

DROP POLICY IF EXISTS helpdesk_tickets_member_read ON public.helpdesk_tickets;
CREATE POLICY helpdesk_tickets_member_read ON public.helpdesk_tickets
    FOR SELECT TO authenticated
    USING (member_id = auth.uid());

DROP POLICY IF EXISTS helpdesk_messages_member_read ON public.helpdesk_messages;
CREATE POLICY helpdesk_messages_member_read ON public.helpdesk_messages
    FOR SELECT TO authenticated
    USING (
        kind = 'public'
        AND EXISTS (
            SELECT 1 FROM public.helpdesk_tickets t
            WHERE t.id = ticket_id AND t.member_id = auth.uid()
        )
    );

CREATE TABLE IF NOT EXISTS public.lyann_agent_task_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL REFERENCES public.lyann_agent_tasks(id) ON DELETE CASCADE,
    started_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    finished_at timestamptz,
    status text NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'blocked')),
    error text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_lyann_agent_task_runs_task ON public.lyann_agent_task_runs (task_id, created_at DESC);

ALTER TABLE public.lyann_agent_task_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lyann_agent_task_runs FROM anon, authenticated;
GRANT ALL ON public.lyann_agent_task_runs TO service_role;

ALTER TABLE public.lyann_agent_tasks
    ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DO $$
BEGIN
    ALTER TABLE public.lyann_agent_tasks DROP CONSTRAINT IF EXISTS chk_task_status;
    ALTER TABLE public.lyann_agent_tasks
        ADD CONSTRAINT chk_task_status CHECK (status IN (
            'DRAFT', 'QUEUED', 'SCHEDULED', 'RUNNING', 'WAITING_APPROVAL',
            'COMPLETED', 'FAILED', 'CANCELLED', 'SUSPENDED', 'ARCHIVED'
        ));
EXCEPTION WHEN undefined_table THEN
    NULL;
END $$;

INSERT INTO public.admin_permissions (code, module, name, description)
SELECT 'support.manage', 'Support', 'Support', 'Traiter les tickets d’assistance'
WHERE NOT EXISTS (SELECT 1 FROM public.admin_permissions WHERE code = 'support.manage');

INSERT INTO public.admin_role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM public.admin_roles AS roles
JOIN public.admin_permissions AS permissions ON permissions.code = 'support.manage'
WHERE roles.code IN ('OWNER', 'ADMIN', 'SUPPORT')
ON CONFLICT DO NOTHING;

COMMIT;
