-- LYANN private targeted needs
-- Allows an Explorer user to send a need to one selected Lyanneur without publishing it in Bokantaj.

alter table public.requests
  add column if not exists visibility text not null default 'PUBLIC',
  add column if not exists target_user_id uuid null references public.profiles(id) on delete set null;

alter table public.requests drop constraint if exists requests_visibility_check;
alter table public.requests add constraint requests_visibility_check check (visibility in ('PUBLIC','PRIVATE'));

create index if not exists idx_requests_visibility on public.requests(visibility);
create index if not exists idx_requests_target_user_id on public.requests(target_user_id);

alter table public.requests enable row level security;

drop policy if exists "Requests are viewable by everyone" on public.requests;
drop policy if exists "Requests visibility policy" on public.requests;
create policy "Requests visibility policy"
on public.requests
for select
to public
using (
  visibility = 'PUBLIC'
  or requester_id = auth.uid()
  or target_user_id = auth.uid()
  or is_current_user_admin()
);

create or replace function public.create_private_request(
  p_target_user_id uuid,
  p_category text,
  p_title text,
  p_description text,
  p_budget numeric,
  p_location text,
  p_urgency text default 'FLEXIBLE'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;
  if p_target_user_id is null or p_target_user_id = v_user_id then
    raise exception 'invalid_target_user';
  end if;
  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'target_user_not_found';
  end if;

  insert into public.requests (
    requester_id, category, title, description, budget, location, urgency,
    status, visibility, target_user_id, internal_tags
  ) values (
    v_user_id,
    coalesce(nullif(trim(p_category), ''), 'autre'),
    coalesce(nullif(trim(p_title), ''), 'Besoin privé'),
    nullif(trim(p_description), ''),
    p_budget,
    nullif(trim(p_location), ''),
    coalesce(nullif(trim(p_urgency), ''), 'FLEXIBLE'),
    'OPEN',
    'PRIVATE',
    p_target_user_id,
    array['private-targeted']::text[]
  ) returning id into v_request_id;

  insert into public.request_invitations (request_id, requester_id, recipient_id, status)
  values (v_request_id, v_user_id, p_target_user_id, 'PENDING');

  return v_request_id;
end;
$$;

revoke all on function public.create_private_request(uuid,text,text,text,numeric,text,text) from public;
grant execute on function public.create_private_request(uuid,text,text,text,numeric,text,text) to authenticated;
