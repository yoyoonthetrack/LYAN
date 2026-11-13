-- Messaging fingerprint v2 (saved as a file in phase 3.2C-5.3; the 3.2C-5.2 "messaging" query was not recorded).
select jsonb_build_object(
 'conversations', (select count(*) || ':' || coalesce(md5(string_agg(t::text, '' order by t.id)), '') from public.conversations t),
 'participants', (select count(*) || ':' || coalesce(md5(string_agg(t::text, '' order by t.conversation_id, t.user_id)), '') from public.conversation_participants t),
 'messages', (select count(*) || ':' || coalesce(md5(string_agg(t::text, '' order by t.id)), '') from public.messages t),
 'notifications', (select count(*) || ':' || coalesce(md5(string_agg(t::text, '' order by t.id)), '') from public.notifications t),
 'push_deliveries', (select count(*) || ':' || coalesce(md5(string_agg(t::text, '' order by t.id)), '') from public.push_deliveries t),
 'user_blocks', (select count(*) || ':' || coalesce(md5(string_agg(t::text, '' order by t.blocker_id, t.blocked_id)), '') from public.user_blocks t),
 'requests', (select count(*) || ':' || coalesce(md5(string_agg(t::text, '' order by t.id)), '') from public.requests t)
) as messaging_v2;
