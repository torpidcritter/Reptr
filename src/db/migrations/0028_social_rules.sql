-- The profile card other people see: handle, name, bio, avatar and account visibility,
-- never the private settings in profiles (birth date, height, equipment...). The view
-- runs with its owner's rights so it can read display_name, and applies the same rule as
-- the social_profiles policy itself: hidden when either person has blocked the other.
CREATE VIEW public.profile_cards WITH (security_barrier = true) AS
SELECT sp.user_id, sp.handle, p.display_name, sp.bio, sp.avatar_path, sp.visibility,
       sp.discoverable, sp.created_at
FROM public.social_profiles sp
JOIN public.profiles p ON p.user_id = sp.user_id
WHERE sp.user_id = (SELECT auth.uid())
   OR ((SELECT auth.uid()) IS NOT NULL AND NOT public.social_blocked((SELECT auth.uid()), sp.user_id));--> statement-breakpoint
REVOKE ALL ON public.profile_cards FROM anon;--> statement-breakpoint
GRANT SELECT ON public.profile_cards TO authenticated;--> statement-breakpoint

-- Blocking ends follows and pending requests both ways, whoever made them.
CREATE OR REPLACE FUNCTION public.social_after_block() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.follows
  WHERE (follower_id = NEW.blocker_id AND followee_id = NEW.blocked_id)
     OR (follower_id = NEW.blocked_id AND followee_id = NEW.blocker_id);
  DELETE FROM public.follow_requests
  WHERE (requester_id = NEW.blocker_id AND target_id = NEW.blocked_id)
     OR (requester_id = NEW.blocked_id AND target_id = NEW.blocker_id);
  DELETE FROM public.post_likes l USING public.posts p
  WHERE l.post_id = p.id
    AND ((l.user_id = NEW.blocked_id AND p.author_id = NEW.blocker_id)
      OR (l.user_id = NEW.blocker_id AND p.author_id = NEW.blocked_id));
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "blocks_cleanup" AFTER INSERT ON public.blocks
  FOR EACH ROW EXECUTE FUNCTION public.social_after_block();--> statement-breakpoint

-- A reply must be to a top-level comment on the same post.
CREATE OR REPLACE FUNCTION public.comments_check_parent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.comments c
    WHERE c.id = NEW.parent_id AND c.post_id = NEW.post_id AND c.parent_id IS NULL
  ) THEN
    RAISE EXCEPTION 'a reply must be to a comment on the same post'
      USING ERRCODE = '23514', CONSTRAINT = 'comments_parent_same_post';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "comments_parent_check" BEFORE INSERT OR UPDATE OF parent_id, post_id ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.comments_check_parent();--> statement-breakpoint

-- Avatars: a private bucket; anyone signed in may read (profile cards show them, and the
-- app only links avatars of cards the viewer can see); only the owner writes their folder.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage schema not found; skipping avatars bucket';
    RETURN;
  END IF;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('avatars', 'avatars', false, 1048576, ARRAY['image/jpeg', 'image/png', 'image/webp'])
  ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
  DROP POLICY IF EXISTS "avatars: signed-in read" ON storage.objects;
  DROP POLICY IF EXISTS "avatars: owner insert" ON storage.objects;
  DROP POLICY IF EXISTS "avatars: owner update" ON storage.objects;
  DROP POLICY IF EXISTS "avatars: owner delete" ON storage.objects;
  CREATE POLICY "avatars: signed-in read" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'avatars');
  CREATE POLICY "avatars: owner insert" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
  CREATE POLICY "avatars: owner update" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
  CREATE POLICY "avatars: owner delete" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
END
$$;
--> statement-breakpoint
-- Follower and following counts are shown on every profile card, private ones too; this
-- reveals only the two numbers, not who.
CREATE OR REPLACE FUNCTION public.social_counts(owner uuid, OUT followers integer, OUT following integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  SELECT count(*)::integer INTO followers FROM public.follows WHERE followee_id = owner;
  SELECT count(*)::integer INTO following FROM public.follows WHERE follower_id = owner;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.social_counts(uuid) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.social_counts(uuid) TO authenticated;
