-- LYANN V2 — server-backed user safety state
-- Applied to Supabase on 2026-09-14. Additive and RLS-protected.

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;

drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own on public.user_blocks
for select to authenticated using (blocker_id = auth.uid());

drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own on public.user_blocks
for insert to authenticated with check (blocker_id = auth.uid());

drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own on public.user_blocks
for delete to authenticated using (blocker_id = auth.uid());

grant select, insert, delete on public.user_blocks to authenticated;
revoke all on public.user_blocks from anon;

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'OPEN' check (status in ('OPEN','IN_REVIEW','RESOLVED','DISMISSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_reports_not_self check (reporter_id <> target_user_id)
);

create index if not exists idx_user_reports_target_status on public.user_reports(target_user_id, status, created_at desc);
create index if not exists idx_user_reports_reporter on public.user_reports(reporter_id, created_at desc);

alter table public.user_reports enable row level security;

drop policy if exists user_reports_insert_own on public.user_reports;
create policy user_reports_insert_own on public.user_reports
for insert to authenticated with check (reporter_id = auth.uid());

drop policy if exists user_reports_select_own_or_admin on public.user_reports;
create policy user_reports_select_own_or_admin on public.user_reports
for select to authenticated using (reporter_id = auth.uid() or public.is_current_user_admin());

drop policy if exists user_reports_update_admin on public.user_reports;
create policy user_reports_update_admin on public.user_reports
for update to authenticated using (public.is_current_user_admin()) with check (public.is_current_user_admin());

grant select, insert, update on public.user_reports to authenticated;
revoke all on public.user_reports from anon;
