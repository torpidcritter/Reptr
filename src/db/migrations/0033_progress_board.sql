-- Stage G: a "Personal records" board, and server-only tables kept away from clients.
-- Same signature as 0029, so the existing grants (server only) still apply.
CREATE OR REPLACE FUNCTION public.fitness_scores(category text, from_ts timestamptz, to_ts timestamptz, members uuid[])
RETURNS TABLE (user_id uuid, score numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ex uuid;
BEGIN
  IF category IN ('workouts', 'volume', 'sets', 'minutes', 'xp', 'records') THEN
    RETURN QUERY
    SELECT f.user_id, CASE category
        WHEN 'workouts' THEN count(*)::numeric
        WHEN 'volume' THEN round(sum(f.volume))
        WHEN 'sets' THEN sum(f.sets)::numeric
        WHEN 'minutes' THEN sum(f.minutes)::numeric
        -- Personal records, at most 5 per workout: progress against your own best, so a
        -- beginner can top it as easily as someone who has lifted for years.
        WHEN 'records' THEN sum(least(f.records, 5))::numeric
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

-- Device keys and sync counts are read and written by the server only.
REVOKE ALL ON public.device_keys FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON public.sync_stats FROM anon, authenticated;
