-- Visibility rules for social features, used by the row-level security policies on the
-- social tables (created in the next migration). plpgsql, so they can be created before
-- those tables exist. SECURITY DEFINER so a policy can look at follows and blocks
-- without those tables' own policies getting in the way; each only answers yes or no.

CREATE OR REPLACE FUNCTION public.social_blocked(a uuid, b uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a)
  );
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.social_follows(follower uuid, followee uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.follows WHERE follower_id = follower AND followee_id = followee
  );
END;
$$;--> statement-breakpoint

-- Whether `viewer` may see what `owner` shares with their followers: themselves, or
-- anyone not blocked either way when the account is public, or a follower when private.
CREATE OR REPLACE FUNCTION public.social_can_see(viewer uuid, owner uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF viewer IS NULL OR owner IS NULL THEN RETURN false; END IF;
  IF viewer = owner THEN RETURN true; END IF;
  IF public.social_blocked(viewer, owner) THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.social_profiles sp
    WHERE sp.user_id = owner
      AND (sp.visibility = 'public' OR public.social_follows(viewer, owner))
  );
END;
$$;--> statement-breakpoint

-- Whether `viewer` may see a post by `author` shared with `visibility`
-- ('public', 'followers' or 'only_me'). A public post on a private account is still
-- only for followers: the account setting always wins.
CREATE OR REPLACE FUNCTION public.social_can_see_post(viewer uuid, author uuid, visibility text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF viewer IS NULL OR author IS NULL THEN RETURN false; END IF;
  IF viewer = author THEN RETURN true; END IF;
  IF visibility = 'only_me' THEN RETURN false; END IF;
  IF public.social_blocked(viewer, author) THEN RETURN false; END IF;
  IF visibility = 'followers' THEN RETURN public.social_follows(viewer, author); END IF;
  RETURN public.social_can_see(viewer, author);
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.social_blocked(uuid, uuid) FROM public;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.social_follows(uuid, uuid) FROM public;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.social_can_see(uuid, uuid) FROM public;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.social_can_see_post(uuid, uuid, text) FROM public;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.social_blocked(uuid, uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.social_follows(uuid, uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.social_can_see(uuid, uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.social_can_see_post(uuid, uuid, text) TO authenticated;
