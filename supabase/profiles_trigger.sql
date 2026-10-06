create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text,
  full_name text,
  bio text not null default '',
  avatar_url text,
  youtube_url text not null default '',
  instagram_url text not null default '',
  x_url text not null default '',
  website_url text not null default '',
  favorite_genres text not null default '',
  role text not null default 'user' check (role in ('user', 'admin')),
  profile_completed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists profile_completed boolean not null default true;

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    email,
    username,
    full_name,
    bio,
    avatar_url,
    youtube_url,
    instagram_url,
    x_url,
    website_url,
    favorite_genres,
    profile_completed
  )
  values (
    new.id,
    new.email,
    null,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'bio', ''),
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.raw_user_meta_data ->> 'youtube_url', ''),
    coalesce(new.raw_user_meta_data ->> 'instagram_url', ''),
    coalesce(new.raw_user_meta_data ->> 'x_url', ''),
    coalesce(new.raw_user_meta_data ->> 'website_url', ''),
    coalesce(new.raw_user_meta_data ->> 'favorite_genres', ''),
    false
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), profiles.full_name),
        bio = coalesce(nullif(excluded.bio, ''), profiles.bio),
        avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
        youtube_url = coalesce(nullif(excluded.youtube_url, ''), profiles.youtube_url),
        instagram_url = coalesce(nullif(excluded.instagram_url, ''), profiles.instagram_url),
        x_url = coalesce(nullif(excluded.x_url, ''), profiles.x_url),
        website_url = coalesce(nullif(excluded.website_url, ''), profiles.website_url),
        favorite_genres = coalesce(nullif(excluded.favorite_genres, ''), profiles.favorite_genres),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (
  id,
  email,
  username,
  full_name,
  bio,
  avatar_url,
  youtube_url,
  instagram_url,
  x_url,
  website_url,
  favorite_genres,
  profile_completed
)
select
  id,
  email,
  coalesce(raw_user_meta_data ->> 'username', split_part(email, '@', 1)),
  coalesce(raw_user_meta_data ->> 'full_name', ''),
  coalesce(raw_user_meta_data ->> 'bio', ''),
  raw_user_meta_data ->> 'avatar_url',
  coalesce(raw_user_meta_data ->> 'youtube_url', ''),
  coalesce(raw_user_meta_data ->> 'instagram_url', ''),
  coalesce(raw_user_meta_data ->> 'x_url', ''),
  coalesce(raw_user_meta_data ->> 'website_url', ''),
  coalesce(raw_user_meta_data ->> 'favorite_genres', ''),
  true
from auth.users
on conflict (id) do update
  set email = excluded.email,
      username = coalesce(nullif(excluded.username, ''), profiles.username),
      full_name = coalesce(nullif(excluded.full_name, ''), profiles.full_name),
      bio = coalesce(nullif(excluded.bio, ''), profiles.bio),
      avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
      youtube_url = coalesce(nullif(excluded.youtube_url, ''), profiles.youtube_url),
      instagram_url = coalesce(nullif(excluded.instagram_url, ''), profiles.instagram_url),
      x_url = coalesce(nullif(excluded.x_url, ''), profiles.x_url),
      website_url = coalesce(nullif(excluded.website_url, ''), profiles.website_url),
      favorite_genres = coalesce(nullif(excluded.favorite_genres, ''), profiles.favorite_genres),
      updated_at = now();
