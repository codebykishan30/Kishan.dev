create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  username text,
  avatar_url text,
  bio text,
  role text not null default 'user' check (role in ('user', 'admin')),
  constraint profiles_username_format_check
    check (username is null or (username = lower(username) and username ~ '^[a-z0-9_.]{3,30}$')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade older installs that only had id/role/created_at/updated_at.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;

alter table public.profiles drop constraint if exists profiles_username_format_check;

-- Existing names created from email addresses may not meet the new username
-- rules. Keep valid existing names, but require users to choose a valid handle
-- rather than retaining an invalid generated value.
update public.profiles
set username = null, updated_at = now()
where username is not null
  and (username <> lower(username) or username !~ '^[a-z0-9_.]{3,30}$');

alter table public.profiles drop constraint if exists profiles_username_format_check;
alter table public.profiles add constraint profiles_username_format_check
  check (username is null or (username = lower(username) and username ~ '^[a-z0-9_.]{3,30}$'));

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;

create or replace function public.normalize_username(value text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(coalesce(value, ''))), '');
$$;

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

-- Only explicit usernames supplied by registration are stored; email addresses
-- are never used to create profile usernames. OAuth users can set one later.
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

-- Backfill profiles for accounts that existed before this schema was applied.
with candidates as (
  select
    users.id,
    users.email,
    nullif(trim(coalesce(users.raw_user_meta_data ->> 'full_name', users.raw_user_meta_data ->> 'name', '')), '') as full_name,
    case
      when public.normalize_username(coalesce(users.raw_user_meta_data ->> 'username', users.raw_user_meta_data ->> 'user_name')) ~ '^[a-z0-9_.]{3,30}$'
      then public.normalize_username(coalesce(users.raw_user_meta_data ->> 'username', users.raw_user_meta_data ->> 'user_name'))
      else null
    end as username
  from auth.users as users
)
insert into public.profiles (id, email, full_name, username, role)
select
  candidates.id,
  candidates.email,
  candidates.full_name,
  candidates.username,
  case when users.raw_app_meta_data ->> 'role' = 'admin' then 'admin' else 'user' end
from candidates
join auth.users as users on users.id = candidates.id
on conflict (id) do nothing;

-- Fill gaps left by an older schema file (safe to re-run).
update public.profiles as profiles
set
  email = coalesce(profiles.email, users.email),
  full_name = coalesce(profiles.full_name, nullif(trim(coalesce(users.raw_user_meta_data ->> 'full_name', users.raw_user_meta_data ->> 'name', '')), '')),
  updated_at = now()
from auth.users as users
where users.id = profiles.id
  and (profiles.email is null or profiles.full_name is null);

-- The prior signup flow used the email local-part as the default username.
-- Clear exact matches so those users choose their own handle.
update public.profiles as profiles
set username = null, updated_at = now()
from auth.users as users
where users.id = profiles.id
  and profiles.username = public.normalize_username(split_part(coalesce(users.email, ''), '@', 1))
  and nullif(trim(coalesce(users.raw_user_meta_data ->> 'username', users.raw_user_meta_data ->> 'user_name', '')), '') is null;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  short_description text not null,
  description text not null default '',
  image_url text,
  technologies text[] not null default '{}',
  category text not null,
  github_url text,
  live_url text,
  project_date date,
  featured boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  summary text not null,
  content text not null default '',
  image_url text,
  category text not null,
  author text not null,
  published_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  icon text,
  proficiency integer not null default 3 check (proficiency between 1 and 5),
  created_at timestamptz not null default now(),
  unique (name, category)
);

create or replace function public.is_portfolio_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_portfolio_admin() from public, anon;
grant execute on function public.is_portfolio_admin() to authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- Signed-in users may only write the display columns. Role, email and id are
-- deliberately excluded from the update grant so nobody can escalate their own
-- privileges or change the email that Supabase Auth owns.
grant insert (id, email, full_name, username, avatar_url, bio) on public.profiles to authenticated;
grant update (full_name, username, avatar_url, bio) on public.profiles to authenticated;

-- NOTE: this policy must not call a helper that reads public.profiles back.
-- Doing that makes PostgreSQL raise "infinite recursion detected in policy for
-- relation profiles". Reading your own row needs no admin check, and admins do
-- not read other people's profiles in this app.
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

notify pgrst, 'reload schema';

alter table public.projects enable row level security;
alter table public.news enable row level security;
alter table public.skills enable row level security;
grant select on public.projects, public.news, public.skills to anon, authenticated;
grant insert, update, delete on public.projects, public.news, public.skills to authenticated;

drop policy if exists "Published projects are public" on public.projects;
create policy "Published projects are public" on public.projects for select using (status = 'published');
drop policy if exists "Admins manage projects" on public.projects;
create policy "Admins manage projects" on public.projects for all to authenticated
  using (public.is_portfolio_admin()) with check (public.is_portfolio_admin());

drop policy if exists "Published news is public" on public.news;
create policy "Published news is public" on public.news for select using (status = 'published');
drop policy if exists "Admins manage news" on public.news;
create policy "Admins manage news" on public.news for all to authenticated
  using (public.is_portfolio_admin()) with check (public.is_portfolio_admin());

drop policy if exists "Skills are public" on public.skills;
create policy "Skills are public" on public.skills for select using (true);
drop policy if exists "Admins manage skills" on public.skills;
create policy "Admins manage skills" on public.skills for all to authenticated
  using (public.is_portfolio_admin()) with check (public.is_portfolio_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio-media', 'portfolio-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

drop policy if exists "Public portfolio media is viewable" on storage.objects;
create policy "Public portfolio media is viewable" on storage.objects for select
  using (bucket_id = 'portfolio-media');
drop policy if exists "Admins upload portfolio media" on storage.objects;
create policy "Admins upload portfolio media" on storage.objects for insert to authenticated
  with check (bucket_id = 'portfolio-media' and public.is_portfolio_admin());
drop policy if exists "Admins update portfolio media" on storage.objects;
create policy "Admins update portfolio media" on storage.objects for update to authenticated
  using (bucket_id = 'portfolio-media' and public.is_portfolio_admin())
  with check (bucket_id = 'portfolio-media' and public.is_portfolio_admin());
drop policy if exists "Admins delete portfolio media" on storage.objects;
create policy "Admins delete portfolio media" on storage.objects for delete to authenticated
  using (bucket_id = 'portfolio-media' and public.is_portfolio_admin());

-- Avatars: a public bucket where each signed-in user can only manage files
-- inside their own {auth.uid()}/ folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

drop policy if exists "Public avatars are viewable" on storage.objects;
create policy "Public avatars are viewable" on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users upload their own avatar" on storage.objects;
create policy "Users upload their own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users update their own avatar" on storage.objects;
create policy "Users update their own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users delete their own avatar" on storage.objects;
create policy "Users delete their own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Admin user, review, and contact management
begin;

-- Extend the existing profile record without replacing the auth/profile system.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  movie_id text,
  movie_title text not null,
  rating smallint not null check (rating between 1 and 5),
  review_text text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  status text not null default 'new' check (status in ('new', 'read', 'replied', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reviews_user_created_idx
  on public.reviews (user_id, created_at desc);
create index if not exists reviews_status_created_idx
  on public.reviews (status, created_at desc);
create index if not exists contact_requests_status_created_idx
  on public.contact_requests (status, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists reviews_touch_updated_at on public.reviews;
create trigger reviews_touch_updated_at
  before update on public.reviews
  for each row execute function public.touch_updated_at();

drop trigger if exists contact_requests_touch_updated_at on public.contact_requests;
create trigger contact_requests_touch_updated_at
  before update on public.contact_requests
  for each row execute function public.touch_updated_at();

-- The helper is SECURITY DEFINER, so this admin-only policy does not recurse
-- through profiles RLS while checking the current user's role.
drop policy if exists "Admins read all profiles" on public.profiles;
create policy "Admins read all profiles" on public.profiles for select to authenticated
  using (public.is_portfolio_admin());

alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;
grant select, delete on public.reviews to authenticated;
grant insert (user_id, movie_id, movie_title, rating, review_text) on public.reviews to authenticated;
grant update (movie_id, movie_title, rating, review_text) on public.reviews to authenticated;

drop policy if exists "Users read their own reviews" on public.reviews;
create policy "Users read their own reviews" on public.reviews for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Users submit their own pending reviews" on public.reviews;
create policy "Users submit their own pending reviews" on public.reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
drop policy if exists "Users update their own reviews" on public.reviews;
create policy "Users update their own reviews" on public.reviews for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "Users delete their own reviews" on public.reviews;
create policy "Users delete their own reviews" on public.reviews for delete to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Admins manage all reviews" on public.reviews;
create policy "Admins manage all reviews" on public.reviews for all to authenticated
  using (public.is_portfolio_admin()) with check (public.is_portfolio_admin());

-- Moderation status is intentionally not in the browser's UPDATE column grant.
create or replace function public.admin_update_review(
  p_review_id uuid,
  p_movie_id text,
  p_movie_title text,
  p_rating smallint,
  p_review_text text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_portfolio_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid review status.' using errcode = '22023';
  end if;

  update public.reviews
  set movie_id = nullif(trim(coalesce(p_movie_id, '')), ''),
      movie_title = trim(coalesce(p_movie_title, '')),
      rating = p_rating,
      review_text = trim(coalesce(p_review_text, '')),
      status = p_status
  where id = p_review_id;

  if not found then
    raise exception 'Review not found.' using errcode = 'P0002';
  end if;

end;
$$;
revoke all on function public.admin_update_review(uuid, text, text, smallint, text, text) from public, anon;
grant execute on function public.admin_update_review(uuid, text, text, smallint, text, text) to authenticated;

alter table public.contact_requests enable row level security;
revoke all on public.contact_requests from anon, authenticated;
grant insert (user_id, name, email, subject, message) on public.contact_requests to anon, authenticated;
grant select, delete on public.contact_requests to authenticated;
grant update (status) on public.contact_requests to authenticated;

drop policy if exists "Guests submit contact requests" on public.contact_requests;
create policy "Guests submit contact requests" on public.contact_requests for insert to anon
  with check (user_id is null);
drop policy if exists "Users submit contact requests" on public.contact_requests;
create policy "Users submit contact requests" on public.contact_requests for insert to authenticated
  with check (user_id is null or user_id = (select auth.uid()));
drop policy if exists "Admins read all contact requests" on public.contact_requests;
create policy "Admins read all contact requests" on public.contact_requests for select to authenticated
  using (public.is_portfolio_admin());
drop policy if exists "Admins update contact requests" on public.contact_requests;
create policy "Admins update contact requests" on public.contact_requests for update to authenticated
  using (public.is_portfolio_admin()) with check (public.is_portfolio_admin());
drop policy if exists "Admins delete contact requests" on public.contact_requests;
create policy "Admins delete contact requests" on public.contact_requests for delete to authenticated
  using (public.is_portfolio_admin());

-- Only admins may enumerate auth accounts or read login activity. The browser
-- calls this RPC with its normal signed-in session; no service-role key is used.
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  username text,
  full_name text,
  avatar_url text,
  bio text,
  role text,
  created_at timestamptz,
  updated_at timestamptz,
  last_sign_in_at timestamptz,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth_users.id,
    coalesce(profiles.email, auth_users.email),
    coalesce(profiles.username, nullif(lower(trim(auth_users.raw_user_meta_data ->> 'username')), ''), nullif(lower(trim(auth_users.raw_user_meta_data ->> 'user_name')), '')),
    coalesce(profiles.full_name, nullif(trim(auth_users.raw_user_meta_data ->> 'full_name'), ''), nullif(trim(auth_users.raw_user_meta_data ->> 'name'), '')),
    coalesce(profiles.avatar_url, nullif(auth_users.raw_user_meta_data ->> 'avatar_url', ''), nullif(auth_users.raw_user_meta_data ->> 'picture', '')),
    profiles.bio,
    coalesce(profiles.role, 'user'),
    auth_users.created_at,
    coalesce(profiles.updated_at, auth_users.created_at),
    auth_users.last_sign_in_at,
    case
      when auth_users.banned_until > now() then 'banned'
      when auth_users.email is not null and auth_users.email_confirmed_at is null then 'unconfirmed'
      else 'active'
    end
  from auth.users as auth_users
  left join public.profiles as profiles on profiles.id = auth_users.id
  where public.is_portfolio_admin()
  order by auth_users.created_at desc;
$$;
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- Deliver signup and incoming request events to the admin realtime listeners.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
      execute 'alter publication supabase_realtime add table public.profiles';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reviews') then
      execute 'alter publication supabase_realtime add table public.reviews';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contact_requests') then
      execute 'alter publication supabase_realtime add table public.contact_requests';
    end if;
  end if;
end;
$$;

commit;

notify pgrst, 'reload schema';
