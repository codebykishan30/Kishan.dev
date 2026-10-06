alter table public.movies
  add column if not exists title_image_url text not null default '';

notify pgrst, 'reload schema';
