alter table public.profiles
  add column if not exists profile_completed boolean not null default true;

with ranked_usernames as (
  select
    id,
    username,
    row_number() over (partition by lower(btrim(username)) order by created_at, id) as duplicate_number
  from public.profiles
  where nullif(btrim(username), '') is not null
)
update public.profiles as profiles
set username = left(btrim(ranked_usernames.username), 52) || '-' || left(ranked_usernames.id::text, 8),
    updated_at = now()
from ranked_usernames
where ranked_usernames.id = profiles.id
  and ranked_usernames.duplicate_number > 1;

create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(btrim(username)))
  where nullif(btrim(username), '') is not null;

create or replace function public.is_profile_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.uid() is not null
    and candidate ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,19}$'
    and not exists (
      select 1
      from public.profiles
      where lower(btrim(username)) = lower(btrim(candidate))
        and id <> auth.uid()
    ),
    false
  );
$$;

revoke all on function public.is_profile_username_available(text) from public;
grant execute on function public.is_profile_username_available(text) to authenticated;

notify pgrst, 'reload schema';
