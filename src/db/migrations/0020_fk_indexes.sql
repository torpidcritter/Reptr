CREATE INDEX "personal_records_set_idx" ON "personal_records" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX "personal_records_exercise_idx" ON "personal_records" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "routine_exercises_user_idx" ON "routine_exercises" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workout_sets_user_idx" ON "workout_sets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workouts_routine_idx" ON "workouts" USING btree ("routine_id");--> statement-breakpoint
CREATE INDEX "goals_exercise_idx" ON "goals" USING btree ("exercise_id");