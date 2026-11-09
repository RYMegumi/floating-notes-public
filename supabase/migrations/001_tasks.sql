-- 浮笺 · tasks table and row-level security
-- Run this once in Supabase Dashboard → SQL Editor.

create table if not exists public.tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  note text not null default '' check (char_length(note) <= 20000),
  important boolean not null default false,
  urgent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  version integer not null default 1 check (version >= 1)
);

comment on table public.tasks is
  '浮笺任务；deleted_at 非空表示删除墓碑，用于多设备同步。';

-- Every update gets a new server timestamp/version, and ownership/creation
-- fields cannot be changed by the client.
create or replace function public.set_task_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

drop trigger if exists set_task_metadata on public.tasks;
create trigger set_task_metadata
before update on public.tasks
for each row execute function public.set_task_metadata();

create index if not exists tasks_user_updated_idx
  on public.tasks (user_id, updated_at desc);

create index if not exists tasks_user_created_idx
  on public.tasks (user_id, created_at asc);

alter table public.tasks enable row level security;

drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own"
on public.tasks
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own"
on public.tasks
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own"
on public.tasks
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own"
on public.tasks
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;
revoke all on table public.tasks from anon;

-- Verification (run separately if you want to inspect the policies):
-- select schemaname, tablename, policyname, cmd from pg_policies
-- where schemaname = 'public' and tablename = 'tasks';
