-- LYANN core performance indexes
-- Applied to Supabase production on 2026-09-14.
-- Idempotent so development/staging environments can replay safely.

create index if not exists idx_requests_status_created_at
    on public.requests (status, created_at desc);

create index if not exists idx_requests_requester_created_at
    on public.requests (requester_id, created_at desc);

create index if not exists idx_bokantaj_posts_created_at
    on public.bokantaj_posts (created_at desc);

create index if not exists idx_bokantaj_posts_author_created_at
    on public.bokantaj_posts (author_id, created_at desc);

create index if not exists idx_messages_conversation_created_at
    on public.messages (conversation_id, created_at);

create index if not exists idx_conversation_participants_user_conversation
    on public.conversation_participants (user_id, conversation_id);
