-- 浮笺 · notes table and row-level security
-- Run this after 001_tasks.sql in Supabase Dashboard → SQL Editor.

create table if not exists public.notes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  content text not null default '' check (char_length(content) <= 20000),
  keywords text[] not null default '{}' check (cardinality(keywords) <= 8),
  title_auto boolean not null default false,
  important boolean not null default false,
  urgent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  version integer not null default 1 check (version >= 1)
);

comment on table public.notes is
  '浮笺随记；archived_at 表示归档，deleted_at 非空表示删除墓碑。';

-- Every update gets a new server timestamp/version, and ownership/creation
-- fields cannot be changed by the client.
create or replace function public.set_note_metadata()
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

drop trigger if exists set_note_metadata on public.notes;
create trigger set_note_metadata
before update on public.notes
for each row execute function public.set_note_metadata();

create index if not exists notes_user_updated_idx
  on public.notes (user_id, updated_at desc);

create index if not exists notes_user_created_idx
  on public.notes (user_id, created_at asc);

alter table public.notes enable row level security;

drop policy if exists "notes_select_own" on public.notes;
create policy "notes_select_own"
on public.notes
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "notes_insert_own" on public.notes;
create policy "notes_insert_own"
on public.notes
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own"
on public.notes
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own"
on public.notes
for delete
to authenticated
using ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.notes to authenticated;
revoke all on table public.notes from anon;
