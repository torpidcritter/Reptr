-- Per-person cap on progress photos. Uploads go straight from the browser to Supabase
-- Storage, so the cap is enforced by the storage insert policy, not only by the app.
-- PHOTO_LIMIT in src/modules/body/metrics.ts must match the number here.
CREATE OR REPLACE FUNCTION public.photo_quota_left(uid uuid) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN 300 - (
    SELECT count(*)::integer FROM storage.objects o
    WHERE o.bucket_id = 'progress-photos' AND (storage.foldername(o.name))[1] = uid::text
  );
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.photo_quota_left(uuid) FROM public;--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage schema not found; photo quota policy skipped';
    RETURN;
  END IF;
  GRANT EXECUTE ON FUNCTION public.photo_quota_left(uuid) TO authenticated;
  DROP POLICY IF EXISTS "progress photos: owner insert" ON storage.objects;
  CREATE POLICY "progress photos: owner insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'progress-photos'
      AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
      AND public.photo_quota_left((SELECT auth.uid())) > 0
    );
  -- Photos are shrunk on the device to well under 1 MB; 5 MB leaves room for the original.
  UPDATE storage.buckets SET file_size_limit = 5242880 WHERE id = 'progress-photos';
END
$$;
