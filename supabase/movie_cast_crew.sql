create table if not exists public.movie_cast (
  id uuid primary key default gen_random_uuid(),
  movie_id bigint not null references public.movies(id) on delete cascade,
  actor_name text not null default '',
  person_name text not null default '',
  character_name text not null default '',
  credit_order integer not null default 0,
  display_order integer not null default 0,
  image_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.movie_cast
  add column if not exists person_name text not null default '',
  add column if not exists image_url text not null default '',
  add column if not exists display_order integer not null default 0;

update public.movie_cast
set person_name = actor_name
where person_name = '';

update public.movie_cast
set display_order = credit_order
where display_order = 0 and credit_order <> 0;

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

alter table public.movie_cast
  alter column actor_name set default '',
  alter column credit_order set default 0;

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

create index if not exists movie_cast_movie_order_idx
  on public.movie_cast (movie_id, display_order);
create index if not exists movie_crew_movie_order_idx
  on public.movie_crew (movie_id, display_order);

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

drop policy if exists "Admins can upload cast crew profile images" on storage.objects;
create policy "Admins can upload cast crew profile images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'POSTER' and public.is_admin());

drop policy if exists "Admins can delete cast crew profile images" on storage.objects;
create policy "Admins can delete cast crew profile images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'POSTER' and public.is_admin());

notify pgrst, 'reload schema';
