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
