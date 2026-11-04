CREATE TYPE "public"."body_metric_type" AS ENUM('weight', 'body_fat', 'chest', 'waist', 'hips', 'neck', 'shoulders', 'arm_left', 'arm_right', 'forearm_left', 'forearm_right', 'thigh_left', 'thigh_right', 'calf_left', 'calf_right');--> statement-breakpoint
CREATE TYPE "public"."body_region" AS ENUM('upper', 'lower', 'core', 'full_body');--> statement-breakpoint
CREATE TYPE "public"."exercise_category" AS ENUM('resistance', 'bodyweight', 'cardio', 'mobility', 'stretching', 'plyometrics', 'functional');--> statement-breakpoint
CREATE TYPE "public"."experience_level" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."measurement_type" AS ENUM('weight_reps', 'reps', 'assisted_reps', 'time', 'distance_time');--> statement-breakpoint
CREATE TYPE "public"."muscle_role" AS ENUM('primary', 'secondary');--> statement-breakpoint
CREATE TYPE "public"."photo_pose" AS ENUM('front', 'side', 'back');--> statement-breakpoint
CREATE TYPE "public"."record_type" AS ENUM('heaviest_weight', 'best_e1rm', 'most_reps', 'best_set_volume', 'longest_duration', 'longest_distance');--> statement-breakpoint
CREATE TYPE "public"."set_type" AS ENUM('warmup', 'working', 'drop', 'failure');--> statement-breakpoint
CREATE TYPE "public"."theme_preference" AS ENUM('light', 'dark', 'system');--> statement-breakpoint
CREATE TYPE "public"."training_goal" AS ENUM('all_round', 'hypertrophy', 'strength', 'recomposition', 'conditioning');--> statement-breakpoint
CREATE TYPE "public"."unit_system" AS ENUM('metric', 'imperial');--> statement-breakpoint
CREATE TYPE "public"."workout_status" AS ENUM('active', 'paused', 'completed', 'abandoned');--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"date_of_birth" date,
	"height_cm" numeric(5, 1),
	"unit_system" "unit_system" DEFAULT 'metric' NOT NULL,
	"theme" "theme_preference" DEFAULT 'system' NOT NULL,
	"experience" "experience_level",
	"goal" "training_goal" DEFAULT 'all_round' NOT NULL,
	"training_days_per_week" integer,
	"default_rest_seconds" integer DEFAULT 90 NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_height_range" CHECK ("profiles"."height_cm" is null or "profiles"."height_cm" between 50 and 272),
	CONSTRAINT "profiles_days_range" CHECK ("profiles"."training_days_per_week" is null or "profiles"."training_days_per_week" between 1 and 7),
	CONSTRAINT "profiles_rest_range" CHECK ("profiles"."default_rest_seconds" between 0 and 1800)
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "equipment_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "equipment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exercise_muscles" (
	"exercise_id" uuid NOT NULL,
	"muscle_id" uuid NOT NULL,
	"role" "muscle_role" DEFAULT 'primary' NOT NULL,
	"contribution" numeric(3, 2) DEFAULT 1 NOT NULL,
	CONSTRAINT "exercise_muscles_exercise_id_muscle_id_pk" PRIMARY KEY("exercise_id","muscle_id"),
	CONSTRAINT "exercise_muscles_contribution_range" CHECK ("exercise_muscles"."contribution" > 0 and "exercise_muscles"."contribution" <= 1)
);
--> statement-breakpoint
ALTER TABLE "exercise_muscles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"slug" text,
	"name" text NOT NULL,
	"category" "exercise_category" NOT NULL,
	"measurement" "measurement_type" DEFAULT 'weight_reps' NOT NULL,
	"equipment_id" uuid,
	"movement_pattern" text,
	"is_unilateral" boolean DEFAULT false NOT NULL,
	"instructions" text,
	"form_cues" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_builtin_has_slug" CHECK ("exercises"."owner_id" is not null or "exercises"."slug" is not null)
);
--> statement-breakpoint
ALTER TABLE "exercises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "muscle_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"region" "body_region" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "muscle_groups_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "muscle_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "personal_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"type" "record_type" NOT NULL,
	"value" numeric(12, 3) NOT NULL,
	"set_id" uuid,
	"achieved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "routine_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"routine_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"superset_group" integer,
	"target_sets" integer,
	"target_reps_min" integer,
	"target_reps_max" integer,
	"rest_seconds" integer,
	"notes" text,
	CONSTRAINT "routine_exercises_position_key" UNIQUE("routine_id","position"),
	CONSTRAINT "routine_exercises_reps_range" CHECK ("routine_exercises"."target_reps_min" is null or "routine_exercises"."target_reps_max" is null or "routine_exercises"."target_reps_min" <= "routine_exercises"."target_reps_max")
);
--> statement-breakpoint
ALTER TABLE "routine_exercises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routines_id_user_key" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "routines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workout_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workout_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"superset_group" integer,
	"substituted_from_id" uuid,
	"notes" text,
	CONSTRAINT "workout_exercises_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "workout_exercises_position_key" UNIQUE("workout_id","position")
);
--> statement-breakpoint
ALTER TABLE "workout_exercises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workout_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workout_exercise_id" uuid NOT NULL,
	"set_number" integer NOT NULL,
	"type" "set_type" DEFAULT 'working' NOT NULL,
	"weight_kg" numeric(7, 3),
	"reps" integer,
	"duration_seconds" integer,
	"distance_meters" numeric(10, 2),
	"rpe" numeric(3, 1),
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_sets_number_key" UNIQUE("workout_exercise_id","set_number"),
	CONSTRAINT "workout_sets_set_number_positive" CHECK ("workout_sets"."set_number" >= 1),
	CONSTRAINT "workout_sets_weight_range" CHECK ("workout_sets"."weight_kg" is null or "workout_sets"."weight_kg" between 0 and 1000),
	CONSTRAINT "workout_sets_reps_range" CHECK ("workout_sets"."reps" is null or "workout_sets"."reps" between 0 and 1000),
	CONSTRAINT "workout_sets_duration_range" CHECK ("workout_sets"."duration_seconds" is null or "workout_sets"."duration_seconds" >= 0),
	CONSTRAINT "workout_sets_distance_range" CHECK ("workout_sets"."distance_meters" is null or "workout_sets"."distance_meters" >= 0),
	CONSTRAINT "workout_sets_rpe_range" CHECK ("workout_sets"."rpe" is null or "workout_sets"."rpe" between 1 and 10)
);
--> statement-breakpoint
ALTER TABLE "workout_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"routine_id" uuid,
	"name" text NOT NULL,
	"status" "workout_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"paused_seconds" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workouts_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "workouts_finished_after_start" CHECK ("workouts"."finished_at" is null or "workouts"."finished_at" >= "workouts"."started_at"),
	CONSTRAINT "workouts_completed_has_finish" CHECK ("workouts"."status" not in ('completed', 'abandoned') or "workouts"."finished_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "workouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "body_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "body_metric_type" NOT NULL,
	"value" numeric(7, 2) NOT NULL,
	"method" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "body_metrics_value_positive" CHECK ("body_metrics"."value" > 0),
	CONSTRAINT "body_metrics_body_fat_range" CHECK ("body_metrics"."type" <> 'body_fat' or "body_metrics"."value" between 1 and 75)
);
--> statement-breakpoint
ALTER TABLE "body_metrics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "progress_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pose" "photo_pose" NOT NULL,
	"storage_path" text NOT NULL,
	"taken_on" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_photos_path_key" UNIQUE("storage_path")
);
--> statement-breakpoint
ALTER TABLE "progress_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"target_value" numeric(10, 3) NOT NULL,
	"target_date" date,
	"achieved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_muscles" ADD CONSTRAINT "exercise_muscles_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_muscles" ADD CONSTRAINT "exercise_muscles_muscle_id_muscle_groups_id_fk" FOREIGN KEY ("muscle_id") REFERENCES "public"."muscle_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_set_id_workout_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."workout_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_routine_fk" FOREIGN KEY ("routine_id","user_id") REFERENCES "public"."routines"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_substituted_from_id_exercises_id_fk" FOREIGN KEY ("substituted_from_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_workout_fk" FOREIGN KEY ("workout_id","user_id") REFERENCES "public"."workouts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_workout_exercise_fk" FOREIGN KEY ("workout_exercise_id","user_id") REFERENCES "public"."workout_exercises"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_routine_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_metrics" ADD CONSTRAINT "body_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_photos" ADD CONSTRAINT "progress_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_goals" ADD CONSTRAINT "user_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_muscles_muscle_idx" ON "exercise_muscles" USING btree ("muscle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_builtin_slug_idx" ON "exercises" USING btree ("slug") WHERE "exercises"."owner_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_owner_name_idx" ON "exercises" USING btree ("owner_id",lower("name")) WHERE "exercises"."owner_id" is not null;--> statement-breakpoint
CREATE INDEX "exercises_name_idx" ON "exercises" USING btree ("name");--> statement-breakpoint
CREATE INDEX "personal_records_lookup_idx" ON "personal_records" USING btree ("user_id","exercise_id","type","achieved_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "routines_user_idx" ON "routines" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workout_exercises_exercise_idx" ON "workout_exercises" USING btree ("user_id","exercise_id");--> statement-breakpoint
CREATE INDEX "workouts_user_started_idx" ON "workouts" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "workouts_one_in_progress_idx" ON "workouts" USING btree ("user_id") WHERE "workouts"."status" in ('active', 'paused');--> statement-breakpoint
CREATE INDEX "body_metrics_user_type_idx" ON "body_metrics" USING btree ("user_id","type","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "progress_photos_user_idx" ON "progress_photos" USING btree ("user_id","taken_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_goals_user_idx" ON "user_goals" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "profiles_owner_all" ON "profiles" AS PERMISSIVE FOR ALL TO "authenticated" USING ("profiles"."user_id" = (select auth.uid())) WITH CHECK ("profiles"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "equipment_read" ON "equipment" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "exercise_muscles_read" ON "exercise_muscles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from exercises e where e.id = "exercise_muscles"."exercise_id" and (e.owner_id is null or e.owner_id = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "exercise_muscles_owner_write" ON "exercise_muscles" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from exercises e where e.id = "exercise_muscles"."exercise_id" and e.owner_id = (select auth.uid()))) WITH CHECK (exists (select 1 from exercises e where e.id = "exercise_muscles"."exercise_id" and e.owner_id = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "exercises_read" ON "exercises" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("exercises"."owner_id" is null or "exercises"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercises_owner_insert" ON "exercises" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("exercises"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercises_owner_update" ON "exercises" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("exercises"."owner_id" = (select auth.uid())) WITH CHECK ("exercises"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "exercises_owner_delete" ON "exercises" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("exercises"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "muscle_groups_read" ON "muscle_groups" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "personal_records_owner_all" ON "personal_records" AS PERMISSIVE FOR ALL TO "authenticated" USING ("personal_records"."user_id" = (select auth.uid())) WITH CHECK ("personal_records"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "routine_exercises_owner_all" ON "routine_exercises" AS PERMISSIVE FOR ALL TO "authenticated" USING ("routine_exercises"."user_id" = (select auth.uid())) WITH CHECK ("routine_exercises"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "routines_owner_all" ON "routines" AS PERMISSIVE FOR ALL TO "authenticated" USING ("routines"."user_id" = (select auth.uid())) WITH CHECK ("routines"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "workout_exercises_owner_all" ON "workout_exercises" AS PERMISSIVE FOR ALL TO "authenticated" USING ("workout_exercises"."user_id" = (select auth.uid())) WITH CHECK ("workout_exercises"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "workout_sets_owner_all" ON "workout_sets" AS PERMISSIVE FOR ALL TO "authenticated" USING ("workout_sets"."user_id" = (select auth.uid())) WITH CHECK ("workout_sets"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "workouts_owner_all" ON "workouts" AS PERMISSIVE FOR ALL TO "authenticated" USING ("workouts"."user_id" = (select auth.uid())) WITH CHECK ("workouts"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "body_metrics_owner_all" ON "body_metrics" AS PERMISSIVE FOR ALL TO "authenticated" USING ("body_metrics"."user_id" = (select auth.uid())) WITH CHECK ("body_metrics"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "progress_photos_owner_all" ON "progress_photos" AS PERMISSIVE FOR ALL TO "authenticated" USING ("progress_photos"."user_id" = (select auth.uid())) WITH CHECK ("progress_photos"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "user_goals_owner_all" ON "user_goals" AS PERMISSIVE FOR ALL TO "authenticated" USING ("user_goals"."user_id" = (select auth.uid())) WITH CHECK ("user_goals"."user_id" = (select auth.uid()));