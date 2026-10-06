alter table public.movies
  add column if not exists tagline text not null default '',
  add column if not exists country text not null default '',
  add column if not exists age_rating text not null default '',
  add column if not exists writer text not null default '',
  add column if not exists production_company text not null default '',
  add column if not exists budget numeric(16, 2),
  add column if not exists box_office numeric(16, 2),
  add column if not exists imdb_rating numeric(3, 1)
    check (imdb_rating is null or (imdb_rating >= 0 and imdb_rating <= 10)),
  add column if not exists movie_status text not null default '',
  add column if not exists initial_hype integer
    check (initial_hype is null or (initial_hype >= 0 and initial_hype <= 100)),
  add column if not exists cast_crew jsonb not null default '[]'::jsonb,
  add column if not exists watch_providers jsonb not null default '[]'::jsonb,
  add column if not exists badges text[] not null default '{}',
  add column if not exists trending_now boolean not null default false,
  add column if not exists trending_position integer not null default 0,
  add column if not exists new_releases boolean not null default false,
  add column if not exists new_releases_position integer not null default 0,
  add column if not exists top_rated_masterpieces boolean not null default false,
  add column if not exists top_rated_masterpieces_position integer not null default 0,
  add column if not exists hidden_gems boolean not null default false,
  add column if not exists hidden_gems_position integer not null default 0;

create table if not exists public.movie_reactions (
  id uuid primary key default gen_random_uuid(),
  movie_id bigint not null references public.movies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (
    reaction in ('hype', 'maybe', 'not_interested', 'love', 'amazing', 'average')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (movie_id, user_id)
);

alter table public.movie_reactions enable row level security;

drop policy if exists "Users can view their own movie reactions" on public.movie_reactions;
create policy "Users can view their own movie reactions"
  on public.movie_reactions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own movie reactions" on public.movie_reactions;
create policy "Users can create their own movie reactions"
  on public.movie_reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own movie reactions" on public.movie_reactions;
create policy "Users can update their own movie reactions"
  on public.movie_reactions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own movie reactions" on public.movie_reactions;
create policy "Users can delete their own movie reactions"
  on public.movie_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.movie_likes (
  id uuid primary key default gen_random_uuid(),
  movie_id bigint not null references public.movies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (movie_id, user_id)
);

alter table public.movie_likes enable row level security;

drop policy if exists "Users can view their own movie likes" on public.movie_likes;
create policy "Users can view their own movie likes"
  on public.movie_likes for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can like movies as themselves" on public.movie_likes;
create policy "Users can like movies as themselves"
  on public.movie_likes for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can unlike movies as themselves" on public.movie_likes;
create policy "Users can unlike movies as themselves"
  on public.movie_likes for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.movie_views (
  id uuid primary key default gen_random_uuid(),
  movie_id bigint not null references public.movies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  viewed_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (movie_id, user_id, viewed_on)
);

alter table public.movie_views enable row level security;

drop policy if exists "Users can record their own movie views" on public.movie_views;
create policy "Users can record their own movie views"
  on public.movie_views for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can view their own movie views" on public.movie_views;
create policy "Users can view their own movie views"
  on public.movie_views for select
  to authenticated
  using (auth.uid() = user_id);

create index if not exists movie_reactions_movie_id_created_at_idx
  on public.movie_reactions (movie_id, created_at desc);
create index if not exists movie_likes_movie_id_created_at_idx
  on public.movie_likes (movie_id, created_at desc);
create index if not exists movie_views_movie_id_viewed_on_idx
  on public.movie_views (movie_id, viewed_on desc);

create or replace function public.get_movie_public_signals(target_movie_id bigint)
returns table (hype_percentage integer, trending_badge text)
language sql
stable
security definer
set search_path = ''
as $$
  with activity as (
    select
      (select count(*) from public.movie_reactions r
        where r.movie_id = target_movie_id
          and r.created_at >= now() - interval '30 days') as reaction_count,
      (select count(*) from public.movie_reactions r
        where r.movie_id = target_movie_id
          and r.reaction in ('hype', 'love', 'amazing')
          and r.created_at >= now() - interval '30 days') as positive_count,
      (select count(*) from public.movie_likes l
        where l.movie_id = target_movie_id
          and l.created_at >= now() - interval '30 days') as like_count,
      (select count(*) from public.watchlist_items w
        where w.movie_id = target_movie_id
          and w.created_at >= now() - interval '30 days') as watchlist_count,
      (select count(*) from public.reviews v
        where v.movie_id = target_movie_id
          and v.created_at >= now() - interval '30 days') as review_count,
      (select count(*) from public.movie_views v
        where v.movie_id = target_movie_id
          and v.viewed_on >= current_date - 30) as view_count,
      (select m.initial_hype from public.movies m
        where m.id = target_movie_id and m.is_published) as initial_hype
  ),
  score as (
    select
      case
        when reaction_count > 0 then round(100.0 * positive_count / reaction_count)::integer
        else coalesce(initial_hype, 0)
      end as hype_percentage,
      (view_count * 0.1 + like_count * 1.3 + positive_count * 1.7
        + watchlist_count * 1.1 + review_count * 1.5) as trending_score
    from activity
  )
  select
    score.hype_percentage,
    case
      when score.trending_score >= 80 then 'trending'
      when score.trending_score >= 35 then 'popular'
      when score.trending_score >= 15 then 'rising'
      else null
    end
  from score
  where exists (
    select 1 from public.movies m
    where m.id = target_movie_id and m.is_published
  );
$$;

revoke all on function public.get_movie_public_signals(bigint) from public;
grant execute on function public.get_movie_public_signals(bigint) to anon, authenticated;

grant select, insert, update, delete on public.movie_reactions to authenticated;
grant select, insert, delete on public.movie_likes to authenticated;
grant select, insert on public.movie_views to authenticated;

notify pgrst, 'reload schema';
