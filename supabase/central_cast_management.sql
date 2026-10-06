create table if not exists public.cast_members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (btrim(full_name) <> ''),
  profile_image text not null default '',
  profession text not null default 'Actor',
  biography text not null default '',
  date_of_birth date,
  nationality text not null default '',
  instagram_url text not null default '',
  x_url text not null default '',
  facebook_url text not null default '',
  website_url text not null default '',
  other_social_links text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cast_members_full_name_lower_uidx
  on public.cast_members (lower(btrim(full_name)));

alter table public.movie_cast
  add column if not exists cast_member_id uuid references public.cast_members(id) on delete cascade,
  add column if not exists cast_order integer not null default 0;

do $$
declare constraint_row record;
begin
  for constraint_row in
    select conname from pg_constraint
    where conrelid = 'public.movie_cast'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%actor_name%character_name%'
  loop
    execute format('alter table public.movie_cast drop constraint %I', constraint_row.conname);
  end loop;
end;
$$;

insert into public.cast_members (full_name, profile_image, profession)
select distinct on (lower(btrim(coalesce(nullif(person_name, ''), actor_name))))
  btrim(coalesce(nullif(person_name, ''), actor_name)),
  coalesce(image_url, ''),
  'Actor'
from public.movie_cast
where btrim(coalesce(nullif(person_name, ''), actor_name)) <> ''
order by lower(btrim(coalesce(nullif(person_name, ''), actor_name))), id
on conflict do nothing;

insert into public.cast_members (full_name, profile_image, profession)
select distinct on (lower(btrim(credit.person_name)))
  btrim(credit.person_name),
  coalesce(credit.image_url, ''),
  coalesce(nullif(btrim(credit.profession), ''), 'Actor')
from public.movies movie
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(movie.cast_crew) = 'array' then movie.cast_crew else '[]'::jsonb end
) with ordinality as item(value, ordinal)
cross join lateral (
  select
    item.value->>'name' as person_name,
    item.value->>'image_url' as image_url,
    item.value->>'role' as profession
) credit
where btrim(coalesce(credit.person_name, '')) <> ''
  and coalesce(credit.profession, '') ~* 'actor|actress|cast'
order by lower(btrim(credit.person_name)), item.ordinal
on conflict do nothing;

insert into public.cast_members (full_name)
select distinct btrim(names.person_name)
from public.movies
cross join lateral regexp_split_to_table(coalesce("cast", ''), ',') as names(person_name)
where btrim(names.person_name) <> ''
on conflict do nothing;

insert into public.movie_cast (
  movie_id, cast_member_id, character_name, cast_order, display_order, credit_order,
  actor_name, person_name, image_url
)
select distinct on (movie.id, member.id)
       movie.id, member.id,
       coalesce(item.value->>'character', ''),
       (item.ordinal - 1)::integer,
       (item.ordinal - 1)::integer,
       (item.ordinal - 1)::integer,
       member.full_name,
       member.full_name,
       coalesce(item.value->>'image_url', '')
from public.movies movie
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(movie.cast_crew) = 'array' then movie.cast_crew else '[]'::jsonb end
) with ordinality as item(value, ordinal)
join public.cast_members member
  on lower(btrim(member.full_name)) = lower(btrim(item.value->>'name'))
where coalesce(item.value->>'role', '') ~* 'actor|actress|cast'
  and not exists (
    select 1 from public.movie_cast linked
    where linked.movie_id = movie.id
      and (
        linked.cast_member_id = member.id
        or (
          lower(btrim(coalesce(nullif(linked.person_name, ''), linked.actor_name))) = lower(btrim(member.full_name))
          and lower(btrim(coalesce(linked.character_name, ''))) = lower(btrim(coalesce(item.value->>'character', '')))
        )
      )
  )
order by movie.id, member.id, item.ordinal
on conflict do nothing;

insert into public.movie_cast (
  movie_id, cast_member_id, character_name, cast_order, display_order, credit_order,
  actor_name, person_name, image_url
)
select distinct on (movie.id, member.id)
       movie.id, member.id, '',
       (names.ordinal - 1)::integer,
       (names.ordinal - 1)::integer,
       (names.ordinal - 1)::integer,
       member.full_name, member.full_name, ''
from public.movies movie
cross join lateral regexp_split_to_table(coalesce(movie."cast", ''), ',')
  with ordinality as names(full_name, ordinal)
join public.cast_members member
  on lower(btrim(member.full_name)) = lower(btrim(names.full_name))
where btrim(names.full_name) <> ''
  and not exists (
    select 1 from public.movie_cast linked
    where linked.movie_id = movie.id
      and (
        linked.cast_member_id = member.id
        or (
          lower(btrim(coalesce(nullif(linked.person_name, ''), linked.actor_name))) = lower(btrim(member.full_name))
          and btrim(coalesce(linked.character_name, '')) = ''
        )
      )
  )
order by movie.id, member.id, names.ordinal
on conflict do nothing;

update public.movie_cast mc
set cast_member_id = cm.id,
    cast_order = coalesce(nullif(mc.display_order, 0), mc.credit_order, 0)
from public.cast_members cm
where mc.cast_member_id is null
  and lower(btrim(coalesce(nullif(mc.person_name, ''), mc.actor_name))) = lower(btrim(cm.full_name));

delete from public.movie_cast mc
using public.movie_cast duplicate
where mc.movie_id = duplicate.movie_id
  and mc.cast_member_id = duplicate.cast_member_id
  and mc.cast_member_id is not null
  and (mc.cast_order, mc.id) > (duplicate.cast_order, duplicate.id);

create unique index if not exists movie_cast_movie_member_uidx
  on public.movie_cast (movie_id, cast_member_id) where cast_member_id is not null;
create index if not exists movie_cast_member_idx on public.movie_cast (cast_member_id);

alter table public.cast_members enable row level security;
drop policy if exists "Anyone can view cast members" on public.cast_members;
create policy "Anyone can view cast members" on public.cast_members
  for select to anon, authenticated using (true);
drop policy if exists "Admins can insert cast members" on public.cast_members;
create policy "Admins can insert cast members" on public.cast_members
  for insert to authenticated with check (public.is_admin());
drop policy if exists "Admins can update cast members" on public.cast_members;
create policy "Admins can update cast members" on public.cast_members
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins can delete cast members" on public.cast_members;
create policy "Admins can delete cast members" on public.cast_members
  for delete to authenticated using (public.is_admin());

grant select on public.cast_members to anon, authenticated;
grant insert, update, delete on public.cast_members to authenticated;

drop policy if exists "Anyone can view poster storage assets" on storage.objects;
create policy "Anyone can view poster storage assets"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'POSTER');

create or replace function public.save_movie_cast_members(p_movie_id bigint, p_cast jsonb)
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

  delete from public.movie_cast where movie_id = p_movie_id;
  insert into public.movie_cast (movie_id, cast_member_id, character_name, cast_order, display_order, credit_order)
  select p_movie_id, item.cast_member_id, coalesce(item.character_name, ''),
         item.cast_order, item.cast_order, item.cast_order
  from jsonb_to_recordset(coalesce(p_cast, '[]'::jsonb))
    as item(cast_member_id uuid, character_name text, cast_order integer);
end;
$$;

grant execute on function public.save_movie_cast_members(bigint, jsonb) to authenticated;

drop policy if exists "Admins can upload cast crew profile images" on storage.objects;
create policy "Admins can upload cast crew profile images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'POSTER' and public.is_admin());
drop policy if exists "Admins can delete cast crew profile images" on storage.objects;
create policy "Admins can delete cast crew profile images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'POSTER' and public.is_admin());

notify pgrst, 'reload schema';
