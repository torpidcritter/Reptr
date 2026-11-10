CREATE INDEX "routine_exercises_exercise_idx" ON "routine_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "workout_exercises_exercise_only_idx" ON "workout_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "workout_exercises_substituted_idx" ON "workout_exercises" USING btree ("substituted_from_id");