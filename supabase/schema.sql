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
security definer set search_path = public
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
    coalesce(new.raw_user_meta_data ->> 'avatar_url', null),
    coalesce(new.raw_user_meta_data ->> 'youtube_url', ''),
    coalesce(new.raw_user_meta_data ->> 'instagram_url', ''),
    coalesce(new.raw_user_meta_data ->> 'x_url', ''),
    coalesce(new.raw_user_meta_data ->> 'website_url', ''),
    coalesce(new.raw_user_meta_data ->> 'favorite_genres', ''),
    false
  )
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
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.profiles (id, email, username, full_name, bio, avatar_url, youtube_url, instagram_url, x_url, website_url, favorite_genres, profile_completed)
select id,
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
  full_name = coalesce(nullif(excluded.full_name, ''), profiles.full_name),
  bio = coalesce(nullif(excluded.bio, ''), profiles.bio),
  avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
  youtube_url = coalesce(nullif(excluded.youtube_url, ''), profiles.youtube_url),
  instagram_url = coalesce(nullif(excluded.instagram_url, ''), profiles.instagram_url),
  x_url = coalesce(nullif(excluded.x_url, ''), profiles.x_url),
  website_url = coalesce(nullif(excluded.website_url, ''), profiles.website_url),
  favorite_genres = coalesce(nullif(excluded.favorite_genres, ''), profiles.favorite_genres),
      updated_at = now();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create table if not exists public.movies (
  id bigint generated by default as identity primary key,
  title text not null,
  title_image_url text not null default '',
  content_type text not null default 'movie' check (content_type in ('movie', 'tv_show')),
  description text not null default '',
  poster_url text not null default '',
  backdrop_url text not null default '',
  trailer_url text not null default '',
  genre text not null default '',
  genres text[] not null default '{}',
  release_date date,
  director text not null default '',
  "cast" text not null default '',
  language text not null default 'English',
  languages text[] not null default '{}',
  ott text not null default '',
  otts text[] not null default '{}',
  runtime integer not null default 0 check (runtime >= 0),
  rating numeric(3,1) not null default 0 check (rating >= 0 and rating <= 10),
  vote_count integer not null default 0 check (vote_count >= 0),
  is_published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.movies
  add column if not exists content_type text not null default 'movie';

alter table public.movies
  add column if not exists title_image_url text not null default '';

notify pgrst, 'reload schema';

update public.movies
set content_type = 'movie'
where content_type is null or content_type not in ('movie', 'tv_show');

alter table public.movies enable row level security;

alter table public.movies
  add column if not exists genres text[] not null default '{}';

alter table public.movies
  add column if not exists languages text[] not null default '{}';

alter table public.movies
  add column if not exists ott text not null default '';

alter table public.movies
  add column if not exists otts text[] not null default '{}';

-- Safe migration for databases created before the manual cast field existed.
alter table public.movies
  add column if not exists "cast" text not null default '';

create table if not exists public.movie_cast (
  id uuid primary key default gen_random_uuid(),
  movie_id bigint not null references public.movies(id) on delete cascade,
  actor_name text not null,
  character_name text not null default '',
  credit_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (movie_id, actor_name, character_name)
);

alter table public.movie_cast
  add column if not exists person_name text not null default '',
  add column if not exists image_url text not null default '',
  add column if not exists display_order integer not null default 0;

update public.movie_cast
set person_name = actor_name
where person_name = '';

create table if not exists public.movie_crew (
  id uuid primary key default gen_random_uuid(),
  movie_id bigint not null references public.movies(id) on delete cascade,
  person_name text not null,
  department text not null default 'Other',
  job text not null default '',
  image_url text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists movie_cast_movie_order_idx
  on public.movie_cast (movie_id, display_order);
create index if not exists movie_crew_movie_order_idx
  on public.movie_crew (movie_id, display_order);

alter table public.movie_cast enable row level security;
alter table public.movie_crew enable row level security;

drop policy if exists "Anyone can view movie cast" on public.movie_cast;
create policy "Anyone can view movie cast"
  on public.movie_cast for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can insert movie cast" on public.movie_cast;
create policy "Admins can insert movie cast"
  on public.movie_cast for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins can update movie cast" on public.movie_cast;
create policy "Admins can update movie cast"
  on public.movie_cast for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete movie cast" on public.movie_cast;
create policy "Admins can delete movie cast"
  on public.movie_cast for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "Anyone can view movie crew" on public.movie_crew;
create policy "Anyone can view movie crew"
  on public.movie_crew for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can insert movie crew" on public.movie_crew;
create policy "Admins can insert movie crew"
  on public.movie_crew for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins can update movie crew" on public.movie_crew;
create policy "Admins can update movie crew"
  on public.movie_crew for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete movie crew" on public.movie_crew;
create policy "Admins can delete movie crew"
  on public.movie_crew for delete
  to authenticated
  using (public.is_admin());

grant select on public.movie_cast, public.movie_crew to anon, authenticated;
grant insert, update, delete on public.movie_cast, public.movie_crew to authenticated;

create or replace function public.save_movie_cast_entries(p_movie_id bigint, p_cast jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can update movie cast.' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_cast, '[]'::jsonb)) <> 'array' then
    raise exception 'Cast entries must be a JSON array.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.movies where id = p_movie_id) then
    raise exception 'Movie % does not exist.', p_movie_id using errcode = '23503';
  end if;

  delete from public.movie_cast
  where movie_id = p_movie_id;

  insert into public.movie_cast (
    movie_id,
    actor_name,
    person_name,
    character_name,
    image_url,
    credit_order,
    display_order,
    updated_at
  )
  select
    p_movie_id,
    person_name,
    person_name,
    character_name,
    image_url,
    display_order,
    display_order,
    now()
  from (
    select distinct on (lower(person_name), lower(character_name))
      person_name,
      character_name,
      image_url,
      display_order
    from (
      select
        nullif(btrim(item->>'person_name'), '') as person_name,
        coalesce(nullif(btrim(item->>'character_name'), ''), '') as character_name,
        coalesce(item->>'image_url', '') as image_url,
        coalesce(nullif(item->>'display_order', '')::integer, (ordinality - 1)::integer) as display_order,
        ordinality
      from jsonb_array_elements(coalesce(p_cast, '[]'::jsonb))
        with ordinality as cast_items(item, ordinality)
    ) as normalized
    where person_name is not null
    order by lower(person_name), lower(character_name), ordinality desc
  ) as deduplicated
  order by display_order;
end;
$$;

grant execute on function public.save_movie_cast_entries(bigint, jsonb) to authenticated;

drop policy if exists "Anyone can view published movies" on public.movies;
create policy "Anyone can view published movies"
  on public.movies for select
  to anon, authenticated
  using (is_published = true or public.is_admin());

drop policy if exists "Admins can insert movies" on public.movies;
create policy "Admins can insert movies"
  on public.movies for insert
  to authenticated
  with check (public.is_admin() and (created_by is null or created_by = auth.uid()));

drop policy if exists "Admins can update movies" on public.movies;
create policy "Admins can update movies"
  on public.movies for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete movies" on public.movies;
create policy "Admins can delete movies"
  on public.movies for delete
  to authenticated
  using (public.is_admin());

create table if not exists public.hero_movies (
  id bigint generated by default as identity primary key,
  movie_id bigint not null unique references public.movies(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.hero_movies enable row level security;

drop policy if exists "Anyone can view hero movies" on public.hero_movies;
create policy "Anyone can view hero movies"
  on public.hero_movies for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can insert hero movies" on public.hero_movies;
create policy "Admins can insert hero movies"
  on public.hero_movies for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins can update hero movies" on public.hero_movies;
create policy "Admins can update hero movies"
  on public.hero_movies for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete hero movies" on public.hero_movies;
create policy "Admins can delete hero movies"
  on public.hero_movies for delete
  to authenticated
  using (public.is_admin());

create index if not exists hero_movies_position_idx on public.hero_movies (position);

create table if not exists public.genre_options (
  id bigint generated by default as identity primary key,
  name text not null unique check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.genre_options
  add column if not exists is_active boolean not null default true;

insert into public.genre_options (name)
values
  ('Action'),
  ('Comedy'),
  ('Drama'),
  ('Horror'),
  ('Science Fiction'),
  ('Romance'),
  ('Thriller'),
  ('Epic'),
  ('Spy'),
  ('psychological thriller'),
  ('Fantasy'),
  ('Adventure'),
  ('Superhero'),
  ('MCU'),
  ('Dark comedy'),
  ('Crime')
on conflict (name) do nothing;

insert into public.genre_options (name)
select distinct btrim(option_name)
from (
  select unnest(genres) as option_name
  from public.movies
  union all
  select unnest(string_to_array(genre, ',')) as option_name
  from public.movies
) existing_genres
where btrim(option_name) <> ''
on conflict (name) do nothing;

alter table public.genre_options enable row level security;

drop policy if exists "Anyone can view genre options" on public.genre_options;
create policy "Anyone can view genre options"
  on public.genre_options for select
  to anon, authenticated
  using (is_active = true or public.is_admin());

drop policy if exists "Admins can insert genre options" on public.genre_options;
create policy "Admins can insert genre options"
  on public.genre_options for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins can update genre options" on public.genre_options;
create policy "Admins can update genre options"
  on public.genre_options for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete genre options" on public.genre_options;
create policy "Admins can delete genre options"
  on public.genre_options for delete
  to authenticated
  using (public.is_admin());

grant select on public.genre_options to anon, authenticated;
grant insert, update, delete on public.genre_options to authenticated;
grant usage, select on sequence public.genre_options_id_seq to authenticated;

create table if not exists public.movie_sections (
  id bigint generated by default as identity primary key,
  slug text not null unique,
  title text not null,
  description text not null default '',
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.movie_sections enable row level security;

drop policy if exists "Anyone can view active movie sections" on public.movie_sections;
create policy "Anyone can view active movie sections"
  on public.movie_sections for select
  to anon, authenticated
  using (is_active = true or public.is_admin());

drop policy if exists "Admins can insert movie sections" on public.movie_sections;
create policy "Admins can insert movie sections"
  on public.movie_sections for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins can update movie sections" on public.movie_sections;
create policy "Admins can update movie sections"
  on public.movie_sections for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete movie sections" on public.movie_sections;
create policy "Admins can delete movie sections"
  on public.movie_sections for delete
  to authenticated
  using (public.is_admin());

create index if not exists movie_sections_position_idx on public.movie_sections (position);

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id bigint not null,
  movie jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, movie_id)
);

alter table public.watchlist_items enable row level security;

drop policy if exists "Users can view their watchlist" on public.watchlist_items;
create policy "Users can view their watchlist"
  on public.watchlist_items for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can add to their watchlist" on public.watchlist_items;
create policy "Users can add to their watchlist"
  on public.watchlist_items for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their watchlist" on public.watchlist_items;
create policy "Users can update their watchlist"
  on public.watchlist_items for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete from their watchlist" on public.watchlist_items;
create policy "Users can delete from their watchlist"
  on public.watchlist_items for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id bigint not null,
  rating numeric(2,1) not null check (rating >= 0 and rating <= 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, movie_id)
);

alter table public.reviews enable row level security;

drop policy if exists "Users can view reviews" on public.reviews;
create policy "Users can view reviews"
  on public.reviews for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can view reviewer profiles" on public.profiles;
create policy "Authenticated users can view reviewer profiles"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Users can create their reviews" on public.reviews;
create policy "Users can create their reviews"
  on public.reviews for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their reviews" on public.reviews;
create policy "Users can update their reviews"
  on public.reviews for update
  to authenticated
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can delete their reviews" on public.reviews;
create policy "Users can delete their reviews"
  on public.reviews for delete
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  body text not null default '',
  type text not null default 'general'
    check (type in ('general', 'announcement', 'new_movie', 'update', 'important', 'maintenance')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  recipient_scope text not null default 'all_users'
    check (recipient_scope in ('all_users', 'all_admins', 'specific_users', 'multiple_users')),
  recipient_ids uuid[] not null default '{}',
  movie_id bigint references public.movies(id) on delete set null,
  image_url text,
  status text not null default 'sent'
    check (status in ('draft', 'scheduled', 'sent', 'failed')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  delivery_status text not null default 'sent'
    check (delivery_status in ('pending', 'scheduled', 'sent', 'failed', 'draft')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notifications
  add column if not exists expires_at timestamptz;

alter table public.notifications enable row level security;

drop policy if exists "Admins can insert notifications" on public.notifications;
create policy "Admins can insert notifications"
  on public.notifications for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Authenticated users can view notifications" on public.notifications;
create policy "Authenticated users can view notifications"
  on public.notifications for select
  to authenticated
  using (true);

create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table public.notification_reads enable row level security;

drop policy if exists "Users can view their notification reads" on public.notification_reads;
create policy "Users can view their notification reads"
  on public.notification_reads for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their notification reads" on public.notification_reads;
create policy "Users can create their notification reads"
  on public.notification_reads for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their notification reads" on public.notification_reads;
create policy "Users can update their notification reads"
  on public.notification_reads for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their notification reads" on public.notification_reads;
create policy "Users can delete their notification reads"
  on public.notification_reads for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  status text not null default 'new'
    check (status in ('new', 'read', 'replied')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;

drop policy if exists "Anyone can send contact messages" on public.contact_messages;
create policy "Anyone can send contact messages"
  on public.contact_messages for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Admins can view contact messages" on public.contact_messages;
create policy "Admins can view contact messages"
  on public.contact_messages for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can update contact messages" on public.contact_messages;
create policy "Admins can update contact messages"
  on public.contact_messages for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete contact messages" on public.contact_messages;
create policy "Admins can delete contact messages"
  on public.contact_messages for delete
  to authenticated
  using (public.is_admin());

create index if not exists contact_messages_created_at_idx
  on public.contact_messages (created_at desc);

create index if not exists contact_messages_status_idx
  on public.contact_messages (status, created_at desc);

create index if not exists movies_published_created_at_idx on public.movies (is_published, created_at desc);
create index if not exists watchlist_items_user_id_idx on public.watchlist_items (user_id, created_at desc);
create index if not exists reviews_movie_id_idx on public.reviews (movie_id, created_at desc);
create index if not exists notifications_created_at_idx on public.notifications (created_at desc);
create index if not exists notifications_status_idx on public.notifications (status, created_at desc);
create index if not exists notifications_recipient_scope_idx on public.notifications (recipient_scope);
create index if not exists notifications_scheduled_for_idx on public.notifications (scheduled_for);
create index if not exists notifications_expires_at_idx on public.notifications (expires_at);
create index if not exists notification_reads_user_id_idx on public.notification_reads (user_id, read_at desc);
