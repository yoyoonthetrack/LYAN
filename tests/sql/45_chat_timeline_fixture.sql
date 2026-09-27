-- Scratch schema for the timeline checks. Never run this against production.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.session (uid uuid);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT uid FROM auth.session LIMIT 1 $$;

CREATE TABLE public.conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id uuid,
    created_at timestamptz DEFAULT now()
);
CREATE TABLE public.conversation_participants (
    conversation_id uuid,
    user_id uuid
);
CREATE TABLE public.request_invitations (
    id uuid PRIMARY KEY,
    conversation_id uuid
);
CREATE TABLE public.quotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid,
    request_invitation_id uuid,
    mission_id uuid,
    provider_id uuid,
    requester_id uuid,
    status text,
    description text,
    total_amount numeric
);
CREATE TABLE public.milestones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id uuid,
    title text,
    status text
);
CREATE TABLE public.payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id uuid,
    status text,
    payment_status text,
    requester_id uuid
);
CREATE TABLE public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid,
    sender_id uuid,
    content text,
    is_read boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    attachment_url text,
    attachment_type text,
    attachment_name text,
    attachment_size bigint,
    attachment_mime text,
    client_message_id text
);

CREATE OR REPLACE FUNCTION public.is_current_user_conversation_participant(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.conversation_participants
        WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
    )
$$;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT SELECT ON public.conversations, public.conversation_participants, public.quotes, public.request_invitations TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_conversation_participant(uuid) TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT ON auth.session TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
