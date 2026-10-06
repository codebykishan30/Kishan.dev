begin;

create or replace function public.normalize_username(value text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(coalesce(value, ''))), '');
$$;

-- Remove the exact email-derived usernames used by the previous signup flow.
update public.profiles as profiles
set username = null, updated_at = now()
from auth.users as users
where users.id = profiles.id
  and profiles.username = public.normalize_username(split_part(coalesce(users.email, ''), '@', 1))
  and nullif(trim(coalesce(users.raw_user_meta_data ->> 'username', users.raw_user_meta_data ->> 'user_name', '')), '') is null;

-- Normalize valid existing handles, and clear invalid/duplicate values so the
-- constraints can be added without assigning usernames from email addresses.
with ranked as (
  select
    id,
    lower(trim(username)) as normalized,
    row_number() over (
      partition by lower(trim(username))
      order by created_at, id
    ) as position
  from public.profiles
  where username is not null
)
update public.profiles as profiles
set username = case
  when ranked.position = 1 and ranked.normalized ~ '^[a-z0-9_.]{3,30}$' then ranked.normalized
  else null
end,
updated_at = now()
from ranked
where ranked.id = profiles.id
  and (
    profiles.username is distinct from ranked.normalized
    or ranked.position > 1
    or ranked.normalized !~ '^[a-z0-9_.]{3,30}$'
  );

alter table public.profiles drop constraint if exists profiles_username_format_check;
alter table public.profiles add constraint profiles_username_format_check
  check (username is null or (username = lower(username) and username ~ '^[a-z0-9_.]{3,30}$'));

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;

create or replace function public.is_username_available(candidate_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.normalize_username(candidate_username) is null
      or public.normalize_username(candidate_username) !~ '^[a-z0-9_.]{3,30}$' then false
    else not exists (
      select 1
      from public.profiles
      where lower(username) = public.normalize_username(candidate_username)
        and id is distinct from (select auth.uid())
    )
  end;
$$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  username_value text;
begin
  username_value := public.normalize_username(
    coalesce(new.raw_user_meta_data ->> 'username', new.raw_user_meta_data ->> 'user_name')
  );
  if username_value is not null and username_value !~ '^[a-z0-9_.]{3,30}$' then
    raise exception 'Username must be 3-30 characters and use only letters, numbers, periods, or underscores.';
  end if;

  insert into public.profiles (id, email, full_name, username, role)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''),
    username_value,
    'user'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, email, full_name, username, avatar_url, bio) on public.profiles to authenticated;
grant update (full_name, username, avatar_url, bio) on public.profiles to authenticated;

drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Users create their own profile" on public.profiles;
create policy "Users create their own profile" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()) and role = 'user');

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

commit;

notify pgrst, 'reload schema';
