-- Rules and scoring for groups, challenges, leaderboards and moderation. plpgsql, so
-- they can be created before the tables they read (next migration). Scores are always
-- computed here from saved workouts; nothing a device sends is taken as a score.
-- The scoring rules are documented in docs/social/LEADERBOARDS.md: keep the two in step.

-- Suspended by a moderator: hidden from everyone but themselves.
CREATE OR REPLACE FUNCTION public.social_suspended(who uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.social_sanctions s WHERE s.user_id = who AND s.suspended_at IS NOT NULL
  );
END;
$$;--> statement-breakpoint

-- Same rules as before, now also hiding suspended accounts.
CREATE OR REPLACE FUNCTION public.social_can_see(viewer uuid, owner uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF viewer IS NULL OR owner IS NULL THEN RETURN false; END IF;
  IF viewer = owner THEN RETURN true; END IF;
  IF public.social_blocked(viewer, owner) THEN RETURN false; END IF;
  IF public.social_suspended(owner) THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.social_profiles sp
    WHERE sp.user_id = owner
      AND (sp.visibility = 'public' OR public.social_follows(viewer, owner))
  );
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.social_can_see_post(viewer uuid, author uuid, visibility text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF viewer IS NULL OR author IS NULL THEN RETURN false; END IF;
  IF viewer = author THEN RETURN true; END IF;
  IF visibility = 'only_me' THEN RETURN false; END IF;
  IF public.social_blocked(viewer, author) THEN RETURN false; END IF;
  IF public.social_suspended(author) THEN RETURN false; END IF;
  IF visibility = 'followers' THEN RETURN public.social_follows(viewer, author); END IF;
  RETURN public.social_can_see(viewer, author);
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.group_member(gid uuid, who uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.group_members m WHERE m.group_id = gid AND m.user_id = who);
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.group_admin(gid uuid, who uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.group_members m
    WHERE m.group_id = gid AND m.user_id = who AND m.role IN ('owner', 'admin')
  );
END;
$$;--> statement-breakpoint

-- Joining a private group with its invite code. Returns the group, or null.
CREATE OR REPLACE FUNCTION public.group_join(code text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  gid uuid;
BEGIN
  IF me IS NULL THEN RETURN NULL; END IF;
  SELECT g.id INTO gid FROM public.groups g
  WHERE g.invite_code = code AND NOT public.social_blocked(me, g.owner_id);
  IF gid IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.social_profiles WHERE user_id = me) THEN RETURN NULL; END IF;
  INSERT INTO public.group_members (group_id, user_id, role) VALUES (gid, me, 'member')
  ON CONFLICT DO NOTHING;
  RETURN gid;
END;
$$;--> statement-breakpoint

-- Who can see a challenge: public ones anyone (unless blocked by its creator);
-- friend ones the creator's followers; group ones the group; and always its members.
CREATE OR REPLACE FUNCTION public.challenge_can_see(cid uuid, viewer uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c record;
BEGIN
  IF viewer IS NULL THEN RETURN false; END IF;
  SELECT * INTO c FROM public.challenges WHERE id = cid;
  IF NOT FOUND THEN RETURN false; END IF;
  IF c.creator_id = viewer THEN RETURN true; END IF;
  IF c.creator_id IS NOT NULL AND (public.social_blocked(viewer, c.creator_id)
      OR public.social_suspended(c.creator_id)) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.challenge_members m WHERE m.challenge_id = cid AND m.user_id = viewer) THEN
    RETURN true;
  END IF;
  RETURN CASE c.visibility
    WHEN 'public' THEN true
    WHEN 'followers' THEN public.social_follows(viewer, c.creator_id)
    WHEN 'group' THEN public.group_member(c.group_id, viewer)
    ELSE false
  END;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.challenge_can_join(cid uuid, viewer uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c record;
BEGIN
  IF NOT public.challenge_can_see(cid, viewer) THEN RETURN false; END IF;
  SELECT * INTO c FROM public.challenges WHERE id = cid;
  IF c.ends_on < (now() AT TIME ZONE 'UTC')::date THEN RETURN false; END IF;
  IF c.visibility = 'only_me' AND c.creator_id <> viewer THEN RETURN false; END IF;
  RETURN true;
END;
$$;--> statement-breakpoint

-- Per-workout scores for the given people between two instants (by finish time).
-- A workout counts when it was finished, lasted 5 minutes to 6 hours, reached the
-- server within 7 days of finishing, and has at least one plausible working set
-- (done, not a warm-up, weight 0-500 kg, 0-100 reps, at most 4 hours).
CREATE OR REPLACE FUNCTION public.fitness_workouts(from_ts timestamptz, to_ts timestamptz, members uuid[])
RETURNS TABLE (user_id uuid, workout_id uuid, finished_at timestamptz, sets integer,
               volume numeric, minutes integer, records integer, xp integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  WITH w AS (
    SELECT wo.id, wo.user_id, wo.finished_at, wo.started_at
    FROM public.workouts wo
    WHERE wo.user_id = ANY (members)
      AND wo.status = 'completed'
      AND wo.finished_at >= from_ts AND wo.finished_at < to_ts
      AND wo.finished_at - wo.started_at BETWEEN interval '5 minutes' AND interval '6 hours'
      AND wo.created_at <= wo.finished_at + interval '7 days'
  ), s AS (
    SELECT w.id AS wid, ws.id AS sid, coalesce(ws.weight_kg, 0) AS kg, coalesce(ws.reps, 0) AS reps
    FROM w
    JOIN public.workout_exercises we ON we.workout_id = w.id
    JOIN public.workout_sets ws ON ws.workout_exercise_id = we.id
    WHERE ws.type <> 'warmup' AND ws.completed_at IS NOT NULL
      AND coalesce(ws.weight_kg, 0) BETWEEN 0 AND 500
      AND coalesce(ws.reps, 0) BETWEEN 0 AND 100
      AND coalesce(ws.duration_seconds, 0) BETWEEN 0 AND 14400
  ), per AS (
    SELECT s.wid, count(*)::integer AS n, sum(s.kg * s.reps) AS vol FROM s GROUP BY s.wid
  ), recs AS (
    SELECT s.wid, count(*)::integer AS n
    FROM s JOIN public.personal_records pr ON pr.set_id = s.sid GROUP BY s.wid
  )
  SELECT w.user_id, w.id, w.finished_at, per.n, per.vol,
         least(floor(extract(epoch FROM w.finished_at - w.started_at) / 60), 240)::integer,
         coalesce(recs.n, 0),
         (50 + least(2 * per.n, 50) + least(10 * coalesce(recs.n, 0), 50))::integer
  FROM w JOIN per ON per.wid = w.id LEFT JOIN recs ON recs.wid = w.id;
END;
$$;--> statement-breakpoint

-- Consecutive UTC weeks (Monday start) with a counted workout, ending this week or
-- last week (so a streak isn't lost before the current week is over). Gaps and islands.
CREATE OR REPLACE FUNCTION public.fitness_streaks(members uuid[])
RETURNS TABLE (user_id uuid, weeks integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  this_week date := date_trunc('week', now() AT TIME ZONE 'UTC')::date;
BEGIN
  RETURN QUERY
  WITH wk AS (
    SELECT DISTINCT f.user_id, date_trunc('week', f.finished_at AT TIME ZONE 'UTC')::date AS week
    FROM public.fitness_workouts('-infinity', 'infinity', members) f
  ), runs AS (
    SELECT wk.user_id, wk.week,
           wk.week - (7 * row_number() OVER (PARTITION BY wk.user_id ORDER BY wk.week))::integer AS island
    FROM wk
  ), islands AS (
    SELECT runs.user_id, max(runs.week) AS last_week, count(*)::integer AS len
    FROM runs GROUP BY runs.user_id, runs.island
  )
  SELECT i.user_id, i.len FROM islands i WHERE i.last_week >= this_week - 7;
END;
$$;--> statement-breakpoint

-- One number per person for a leaderboard category over a period.
CREATE OR REPLACE FUNCTION public.fitness_scores(category text, from_ts timestamptz, to_ts timestamptz, members uuid[])
RETURNS TABLE (user_id uuid, score numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ex uuid;
BEGIN
  IF category IN ('workouts', 'volume', 'sets', 'minutes', 'xp') THEN
    RETURN QUERY
    SELECT f.user_id, CASE category
        WHEN 'workouts' THEN count(*)::numeric
        WHEN 'volume' THEN round(sum(f.volume))
        WHEN 'sets' THEN sum(f.sets)::numeric
        WHEN 'minutes' THEN sum(f.minutes)::numeric
        ELSE sum(f.xp)::numeric
      END
    FROM public.fitness_workouts(from_ts, to_ts, members) f GROUP BY f.user_id;
  ELSIF category = 'streak' THEN
    RETURN QUERY SELECT st.user_id, st.weeks::numeric FROM public.fitness_streaks(members) st;
  ELSIF category LIKE 'e1rm:%' THEN
    ex := substr(category, 6)::uuid;
    -- Best estimated one-rep max (Epley, 1-12 reps) on one exercise.
    RETURN QUERY
    SELECT f.user_id, round(max(CASE WHEN ws.reps = 1 THEN ws.weight_kg
                                     ELSE ws.weight_kg * (1 + ws.reps / 30.0) END), 1)
    FROM public.fitness_workouts(from_ts, to_ts, members) f
    JOIN public.workout_exercises we ON we.workout_id = f.workout_id AND we.exercise_id = ex
    JOIN public.workout_sets ws ON ws.workout_exercise_id = we.id
    WHERE ws.type <> 'warmup' AND ws.completed_at IS NOT NULL
      AND ws.weight_kg > 0 AND ws.weight_kg <= 500 AND ws.reps BETWEEN 1 AND 12
    GROUP BY f.user_id;
  ELSE
    RAISE EXCEPTION 'unknown leaderboard category %', category USING ERRCODE = '22023';
  END IF;
END;
$$;--> statement-breakpoint

-- Whether someone can appear on boards at all: has a social profile, isn't suspended
-- or kept off boards by a moderator.
CREATE OR REPLACE FUNCTION public.board_eligible(who uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.social_profiles sp WHERE sp.user_id = who)
    AND NOT EXISTS (
      SELECT 1 FROM public.social_sanctions s
      WHERE s.user_id = who AND (s.suspended_at IS NOT NULL OR s.excluded_from_boards_at IS NOT NULL)
    );
END;
$$;--> statement-breakpoint

-- A leaderboard as the signed-in person may see it. Scope 'global': everyone who chose
-- to be on leaderboards and whose profile they can see; 'friends': themselves and the
-- people they follow, with the same conditions; 'group': members of a group they're in
-- who chose to be on leaderboards. Ties share a rank.
CREATE OR REPLACE FUNCTION public.leaderboard(category text, from_ts timestamptz, to_ts timestamptz,
                                              scope text, scope_id uuid DEFAULT NULL, max_rows integer DEFAULT 100)
RETURNS TABLE ("rank" bigint, user_id uuid, score numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  members uuid[];
BEGIN
  IF me IS NULL THEN RETURN; END IF;
  IF scope = 'global' THEN
    SELECT array_agg(sp.user_id) INTO members FROM public.social_profiles sp
    WHERE sp.leaderboards AND public.social_can_see(me, sp.user_id);
  ELSIF scope = 'friends' THEN
    SELECT array_agg(sp.user_id) INTO members FROM public.social_profiles sp
    WHERE sp.leaderboards AND public.social_can_see(me, sp.user_id)
      AND (sp.user_id = me OR public.social_follows(me, sp.user_id));
  ELSIF scope = 'group' THEN
    IF NOT public.group_member(scope_id, me) THEN RETURN; END IF;
    SELECT array_agg(sp.user_id) INTO members
    FROM public.group_members m JOIN public.social_profiles sp ON sp.user_id = m.user_id
    WHERE m.group_id = scope_id AND sp.leaderboards AND NOT public.social_blocked(me, sp.user_id);
  ELSE
    RAISE EXCEPTION 'unknown leaderboard scope %', scope USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(x) INTO members FROM unnest(members) x WHERE public.board_eligible(x);
  IF members IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT rank() OVER (ORDER BY s.score DESC), s.user_id, s.score
  FROM public.fitness_scores(category, from_ts, to_ts, members) s
  WHERE s.score > 0
  ORDER BY 1, s.user_id
  LIMIT greatest(1, least(max_rows, 500));
END;
$$;--> statement-breakpoint

-- A challenge's standings: every member's score on its metric between its dates
-- (UTC days, end inclusive). Server use; challenge_board() is the checked version.
CREATE OR REPLACE FUNCTION public.challenge_scores(cid uuid)
RETURNS TABLE ("rank" bigint, user_id uuid, score numeric, completed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c record;
  members uuid[];
BEGIN
  SELECT * INTO c FROM public.challenges WHERE id = cid;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT array_agg(m.user_id) INTO members FROM public.challenge_members m
  WHERE m.challenge_id = cid AND public.board_eligible(m.user_id);
  IF members IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH sc AS (
    SELECT m.user_id, coalesce(s.score, 0) AS score, m.completed_at
    FROM public.challenge_members m
    LEFT JOIN public.fitness_scores(c.metric::text,
        (c.starts_on::timestamp AT TIME ZONE 'UTC'),
        ((c.ends_on + 1)::timestamp AT TIME ZONE 'UTC'), members) s ON s.user_id = m.user_id
    WHERE m.challenge_id = cid AND m.user_id = ANY (members)
  )
  SELECT rank() OVER (ORDER BY sc.score DESC), sc.user_id, sc.score, sc.completed_at
  FROM sc ORDER BY 1, sc.user_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.challenge_board(cid uuid)
RETURNS TABLE ("rank" bigint, user_id uuid, score numeric, completed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF NOT public.challenge_can_see(cid, me) THEN RETURN; END IF;
  RETURN QUERY
  SELECT b."rank", b.user_id, b.score, b.completed_at FROM public.challenge_scores(cid) b
  WHERE NOT public.social_blocked(me, b.user_id);
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.social_suspended(uuid) FROM public;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.group_member(uuid, uuid) FROM public;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.group_admin(uuid, uuid) FROM public;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.group_join(text) FROM public;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.challenge_can_see(uuid, uuid) FROM public;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.challenge_can_join(uuid, uuid) FROM public;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fitness_workouts(timestamptz, timestamptz, uuid[]) FROM public;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fitness_streaks(uuid[]) FROM public;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fitness_scores(text, timestamptz, timestamptz, uuid[]) FROM public;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.board_eligible(uuid) FROM public;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.leaderboard(text, timestamptz, timestamptz, text, uuid, integer) FROM public;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.challenge_scores(uuid) FROM public;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.challenge_board(uuid) FROM public;--> statement-breakpoint
-- Policies call these as the signed-in person. The raw scoring functions are not
-- granted: they take any list of people, so only the server (owner) may call them.
GRANT EXECUTE ON FUNCTION public.social_suspended(uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.group_member(uuid, uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.group_admin(uuid, uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.group_join(text) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.challenge_can_see(uuid, uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.challenge_can_join(uuid, uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.board_eligible(uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.leaderboard(text, timestamptz, timestamptz, text, uuid, integer) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.challenge_board(uuid) TO authenticated;
