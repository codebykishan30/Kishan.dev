create table if not exists public.profile_icons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text not null unique,
  storage_path text unique,
  created_at timestamptz not null default now()
);

alter table public.profile_icons enable row level security;

drop policy if exists "Anyone can view profile icons" on public.profile_icons;
create policy "Anyone can view profile icons"
  on public.profile_icons for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can add profile icons" on public.profile_icons;
create policy "Admins can add profile icons"
  on public.profile_icons for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins can delete profile icons" on public.profile_icons;
create policy "Admins can delete profile icons"
  on public.profile_icons for delete
  to authenticated
  using (public.is_admin());

grant select on public.profile_icons to anon, authenticated;
grant insert, delete on public.profile_icons to authenticated;

insert into public.profile_icons (name, image_url)
values
  ('Bamboo Blush', '/profile-image/BambooBlush.jpg'),
  ('Tony', '/profile-image/Tony.jpg'),
  ('Kitty', '/profile-image/Kitty.jpg'),
  ('Web Whisper', '/profile-image/WebWhisper.jpg')
on conflict (image_url) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-icons',
  'profile-icons',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view profile icon files" on storage.objects;
create policy "Anyone can view profile icon files"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'profile-icons');

drop policy if exists "Admins can upload profile icon files" on storage.objects;
create policy "Admins can upload profile icon files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'profile-icons' and public.is_admin());

drop policy if exists "Admins can delete profile icon files" on storage.objects;
create policy "Admins can delete profile icon files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'profile-icons' and public.is_admin());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'profile_icons'
    )
  then
    alter publication supabase_realtime add table public.profile_icons;
  end if;
end;
$$;
