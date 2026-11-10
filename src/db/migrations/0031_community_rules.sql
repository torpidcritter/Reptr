-- A new group's creator becomes its owner member, in the same statement.
CREATE OR REPLACE FUNCTION public.groups_add_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.group_members (group_id, user_id, role) VALUES (NEW.id, NEW.owner_id, 'owner');
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "groups_add_owner" AFTER INSERT ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.groups_add_owner();--> statement-breakpoint

-- Signed-in people may change only these columns; who owns a group, what a
-- notification says and who it's from stay as the server wrote them.
REVOKE UPDATE ON public.groups FROM authenticated;--> statement-breakpoint
GRANT UPDATE (name, description, visibility, invite_code) ON public.groups TO authenticated;--> statement-breakpoint
REVOKE UPDATE ON public.notifications FROM authenticated;--> statement-breakpoint
GRANT UPDATE (read_at) ON public.notifications TO authenticated;--> statement-breakpoint

-- Awards, sanctions and the moderation log are written by the server only. RLS already
-- has no write policy for them; this makes it explicit for the Data API too.
REVOKE INSERT, UPDATE, DELETE ON public.user_badges, public.user_levels, public.social_sanctions,
  public.moderation_log FROM authenticated, anon;--> statement-breakpoint
REVOKE INSERT ON public.notifications FROM authenticated, anon;--> statement-breakpoint
REVOKE ALL ON public.moderation_log FROM authenticated, anon;
--> statement-breakpoint

-- Suspended accounts disappear from profile cards (search, feeds, boards) for everyone
-- but themselves. Same view as 0028 otherwise.
CREATE OR REPLACE VIEW public.profile_cards WITH (security_barrier = true) AS
SELECT sp.user_id, sp.handle, p.display_name, sp.bio, sp.avatar_path, sp.visibility,
       sp.discoverable, sp.created_at
FROM public.social_profiles sp
JOIN public.profiles p ON p.user_id = sp.user_id
WHERE sp.user_id = (SELECT auth.uid())
   OR ((SELECT auth.uid()) IS NOT NULL
       AND NOT public.social_blocked((SELECT auth.uid()), sp.user_id)
       AND NOT public.social_suspended(sp.user_id));
