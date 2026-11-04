-- Private bucket for progress photos. Each user can only touch files under their own
-- folder ("<user id>/..."). Skipped where Supabase Storage isn't installed (local tests, CI).
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not found; skipping progress-photos bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('progress-photos', 'progress-photos', false, 10485760,
          array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists "progress photos: owner read" on storage.objects;
  drop policy if exists "progress photos: owner insert" on storage.objects;
  drop policy if exists "progress photos: owner delete" on storage.objects;

  create policy "progress photos: owner read" on storage.objects
    for select to authenticated
    using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

  create policy "progress photos: owner insert" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

  create policy "progress photos: owner delete" on storage.objects
    for delete to authenticated
    using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
end
$$;
