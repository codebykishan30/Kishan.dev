create table if not exists public.viewer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 24),
  avatar_url text not null default 'avatar:ember',
  is_kids boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists viewer_profiles_user_id_created_at_idx
  on public.viewer_profiles (user_id, created_at);

alter table public.viewer_profiles enable row level security;

drop policy if exists "Users can view their own viewer profiles" on public.viewer_profiles;
create policy "Users can view their own viewer profiles"
  on public.viewer_profiles for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own viewer profiles" on public.viewer_profiles;
create policy "Users can create their own viewer profiles"
  on public.viewer_profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own viewer profiles" on public.viewer_profiles;
create policy "Users can update their own viewer profiles"
  on public.viewer_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own viewer profiles" on public.viewer_profiles;
create policy "Users can delete their own viewer profiles"
  on public.viewer_profiles for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.enforce_viewer_profile_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_count integer;
begin
  if auth.uid() is distinct from new.user_id then
    raise exception 'Viewer profiles can only be managed by their owner.'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.user_id::text, 0)
    );

    select count(*)
      into profile_count
      from public.viewer_profiles
      where user_id = new.user_id;

    if profile_count >= 5 then
      raise exception 'An account can have at most 5 viewer profiles.'
        using errcode = '23514';
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists enforce_viewer_profile_limit on public.viewer_profiles;
create trigger enforce_viewer_profile_limit
  before insert or update on public.viewer_profiles
  for each row execute function public.enforce_viewer_profile_limit();

revoke all on public.viewer_profiles from anon;
grant select, insert, update, delete on public.viewer_profiles to authenticated;
revoke all on function public.enforce_viewer_profile_limit() from public, anon, authenticated;

notify pgrst, 'reload schema';
