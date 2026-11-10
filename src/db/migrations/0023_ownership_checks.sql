-- D3: a workout's routine must be the same person's routine. Workouts saved before this
-- that point at someone else's routine lose the link (the workout itself is kept).
UPDATE "workouts" w SET "routine_id" = NULL
WHERE w."routine_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "routines" r WHERE r."id" = w."routine_id" AND r."user_id" = w."user_id");--> statement-breakpoint
ALTER TABLE "workouts" DROP CONSTRAINT "workouts_routine_fk";--> statement-breakpoint
-- Deleting a routine clears only routine_id (Postgres 15+), never user_id.
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_routine_fk"
  FOREIGN KEY ("routine_id", "user_id") REFERENCES "routines" ("id", "user_id")
  ON DELETE SET NULL ("routine_id");--> statement-breakpoint

-- D4: rows may only use built-in exercises or the person's own custom ones, so nobody
-- can attach (and so reveal or depend on) another person's private exercise.
CREATE OR REPLACE FUNCTION "exercise_visible_to_owner"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."exercise_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "exercises" e
    WHERE e."id" = NEW."exercise_id" AND (e."owner_id" IS NULL OR e."owner_id" = NEW."user_id")
  ) THEN
    RAISE EXCEPTION 'exercise % is not available to this user', NEW."exercise_id"
      USING ERRCODE = '23503', CONSTRAINT = 'exercise_visible_to_owner';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "routine_exercises_exercise_visible" BEFORE INSERT OR UPDATE OF "exercise_id", "user_id"
  ON "routine_exercises" FOR EACH ROW EXECUTE FUNCTION "exercise_visible_to_owner"();--> statement-breakpoint
CREATE TRIGGER "workout_exercises_exercise_visible" BEFORE INSERT OR UPDATE OF "exercise_id", "user_id"
  ON "workout_exercises" FOR EACH ROW EXECUTE FUNCTION "exercise_visible_to_owner"();--> statement-breakpoint
CREATE TRIGGER "personal_records_exercise_visible" BEFORE INSERT OR UPDATE OF "exercise_id", "user_id"
  ON "personal_records" FOR EACH ROW EXECUTE FUNCTION "exercise_visible_to_owner"();--> statement-breakpoint
CREATE TRIGGER "goals_exercise_visible" BEFORE INSERT OR UPDATE OF "exercise_id", "user_id"
  ON "goals" FOR EACH ROW EXECUTE FUNCTION "exercise_visible_to_owner"();
